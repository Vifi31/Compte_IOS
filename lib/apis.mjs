// Gestion des API (Administration › API).
//  - Services externes appelés par Comptes (IA, géographie, ventes DVF) : activation, adresse, délai, clé par service,
//    test de connexion, journal des appels et statistiques. Tous les appels passent par extFetch().
//  - API interne de Comptes (routes /api/*) : catalogue, jetons d'accès, ouverture au réseau local.
//    Sans accès réseau, le serveur n'écoute que l'ordinateur lui-même (127.0.0.1) ; avec, les appels venant
//    d'un autre appareil exigent un jeton (en-tête « Authorization: Bearer … »), enregistré sous forme d'empreinte.
// Routes :
//   GET    /api/apis                        services, réseau, jetons, routes internes
//   PUT    /api/apis/services/:id           { enabled, endpoint, timeout, key | '__clear__' }
//   POST   /api/apis/services/:id/test      test de connexion
//   GET    /api/apis/journal?service=&limit= journal des appels ; DELETE : vidage
//   PUT    /api/apis/network                { enabled } (pris en compte au redémarrage)
//   POST   /api/apis/tokens                 { name, scope } → jeton affiché une seule fois
//   PUT    /api/apis/tokens/:id             { name, scope, enabled } ; DELETE : révocation
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { DATA_DIR } from './paths.mjs';
import { PROVIDERS } from './ai.mjs';
import { scanRoutes } from './techinfo.mjs';

// ---------- Registre des services externes ----------
const GEO = [
  { id: 'geo-communes', label: 'Découpage administratif (communes)', category: 'geo', endpoint: 'https://geo.api.gouv.fr', doc: 'https://geo.api.gouv.fr/decoupage-administratif', usage: 'Recherche des communes et codes INSEE (fiche du bien)', test: b => b + '/communes?nom=Paris&fields=nom&limit=1' },
  { id: 'geocodage', label: 'Géocodage (Géoplateforme IGN)', category: 'geo', endpoint: 'https://data.geopf.fr/geocodage', doc: 'https://geoservices.ign.fr/documentation/services/services-geoplateforme/geocodage', usage: 'Coordonnées de l’adresse d’un bien (estimation par éloignement)', test: b => b + '/search?q=Paris&limit=1' },
  { id: 'adresse', label: 'Base adresse nationale (secours)', category: 'geo', endpoint: 'https://api-adresse.data.gouv.fr', doc: 'https://adresse.data.gouv.fr/outils/api-doc/adresse', usage: 'Géocodage de secours si la Géoplateforme ne répond pas', test: b => b + '/search/?q=Paris&limit=1' },
  { id: 'dvf', label: 'Ventes immobilières (DVF géolocalisées)', category: 'immo', endpoint: 'https://files.data.gouv.fr/geo-dvf/latest/csv', doc: 'https://www.data.gouv.fr/fr/datasets/demandes-de-valeurs-foncieres-geolocalisees/', usage: 'Ventes de la commune pour l’estimation de valeur', test: b => b + '/2024/communes/48/48001.csv', headers: { range: 'bytes=0-99' } }, // petite commune, 100 premiers octets
];
// calculé à la demande : ai.mjs importe ce module (dépendance circulaire), PROVIDERS n'existe pas encore au chargement
const aiServices = () => Object.entries(PROVIDERS).filter(([id]) => id !== 'local').map(([id, d]) => ({
  id: 'ai:' + id, provider: id, label: d.label, category: 'ia', endpoint: d.endpoint, doc: d.keyUrl, usage: d.note,
  needsKey: d.protocol !== 'ollama' && !d.keyOptional, local: !!d.localModel, protocol: d.protocol,
}));
let SERVICES_ = null;
export const services = () => (SERVICES_ ??= [...aiServices(), ...GEO]);
const svcDef = id => services().find(s => s.id === id);

let ctx = null; // { getStore, saveStore }
const cfgAll = () => { const s = ctx.getStore(); s.apis ??= {}; s.apis.services ??= {}; s.apis.tokens ??= []; s.apis.network ??= false; return s.apis; };
const cfgOf = id => cfgAll().services[id] ?? {};
/** Adresse effective d'un service (réglage de l'utilisateur, sinon adresse par défaut). */
export const endpointOf = id => ((ctx && cfgOf(id).endpoint) || svcDef(id)?.endpoint || '').replace(/\/+$/, '');
const enabledOf = id => !ctx || cfgOf(id).enabled !== false;

// ---------- Clés (data/secrets.json, jamais dans la base ni les sauvegardes) ----------
const SECRETS = () => path.join(DATA_DIR, 'secrets.json');
export function readSecrets() {
  let s = {}; try { s = JSON.parse(fs.readFileSync(SECRETS(), 'utf8')); } catch { /* aucun secret enregistré */ }
  s.keys ??= {};
  // ancienne clé unique (fournisseur IA actif) : reprise pour ce fournisseur
  if (s.aiKey) { const p = ctx?.getStore().ai?.provider; if (p && p !== 'local' && !s.keys[p]) s.keys[p] = s.aiKey; }
  return s;
}
export function writeSecrets(s) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SECRETS(), JSON.stringify(s)); }
/** Clé d'un fournisseur IA (identifiant PROVIDERS) ; variable COMPTES_AI_KEY en secours pour le fournisseur actif. */
export function keyOf(provider) {
  const s = readSecrets(); if (s.keys[provider]) return s.keys[provider];
  return provider === ctx?.getStore().ai?.provider ? (s.aiKey || process.env.COMPTES_AI_KEY || '') : '';
}
export function setKey(provider, key) {
  const s = readSecrets();
  if (key === '__clear__') { delete s.keys[provider]; if (provider === ctx?.getStore().ai?.provider) delete s.aiKey; }
  else if (key) s.keys[provider] = key;
  writeSecrets(s);
}
const hint = k => (k ? '••••' + k.slice(-4) : '');

// ---------- Journal des appels (data/api-journal.json, 1000 derniers) ----------
const JOURNAL = () => path.join(DATA_DIR, 'api-journal.json');
let journal = null, jTimer = null;
const loadJournal = () => { if (!journal) { try { journal = JSON.parse(fs.readFileSync(JOURNAL(), 'utf8')); } catch { journal = []; } } return journal; };
const saveJournal = () => { clearTimeout(jTimer); jTimer = setTimeout(() => { try { fs.writeFileSync(JOURNAL(), JSON.stringify(journal)); } catch { /* journal facultatif */ } }, 1500); };
/** Ajoute un appel au journal ({ service, method, url, status, ms, ok, error, who }). L'adresse est réduite à origine + chemin. */
export function recordCall(e) {
  const j = loadJournal();
  let url = e.url ?? ''; try { const u = new URL(url); url = u.origin + u.pathname; } catch { /* chemin interne */ }
  j.push({ at: new Date().toISOString(), service: e.service, method: e.method ?? 'GET', url, status: e.status ?? 0, ms: Math.round(e.ms ?? 0), ok: !!e.ok, error: e.error ? String(e.error).slice(0, 300) : undefined, who: e.who });
  if (j.length > 1000) j.splice(0, j.length - 1000);
  saveJournal();
}

/** fetch() d'un service externe : refus si désactivé, délai éventuel, appel journalisé. */
export async function extFetch(service, url, opts = {}) {
  const def = svcDef(service);
  if (!enabledOf(service)) throw new Error(`Service « ${def?.label ?? service} » désactivé (Administration › API)`);
  const t = +cfgOf(service).timeout > 0 ? AbortSignal.timeout(+cfgOf(service).timeout * 1000) : null;
  const signal = t && opts.signal && AbortSignal.any ? AbortSignal.any([opts.signal, t]) : t ?? opts.signal;
  const t0 = performance.now(), method = (opts.method || 'GET').toUpperCase();
  try {
    const r = await fetch(url, { ...opts, signal });
    recordCall({ service, method, url, status: r.status, ms: performance.now() - t0, ok: r.ok, error: r.ok ? undefined : r.status + ' ' + r.statusText });
    return r;
  } catch (e) {
    recordCall({ service, method, url, status: 0, ms: performance.now() - t0, ok: false, error: e.name === 'TimeoutError' || e.name === 'AbortError' ? 'Délai dépassé' : e.cause?.code || e.message });
    throw e;
  }
}

function stats(list) {
  const out = {};
  for (const e of list) {
    const s = out[e.service] ??= { calls: 0, errors: 0, ms: 0, last: null, lastError: null };
    s.calls++; s.ms += e.ms; if (!e.ok) { s.errors++; s.lastError = { at: e.at, error: e.error, status: e.status }; } s.last = { at: e.at, ok: e.ok, status: e.status };
  }
  for (const s of Object.values(out)) s.avgMs = Math.round(s.ms / s.calls);
  return out;
}

// ---------- Test de connexion (sans consommer de crédit : liste des modèles pour l'IA) ----------
async function testService(id) {
  const def = svcDef(id); if (!def) throw new Error('Service inconnu');
  const base = endpointOf(id), t0 = performance.now();
  let url = def.test ? def.test(base) : '', headers = { ...def.headers }, method = 'GET';
  if (def.category === 'ia') {
    const key = keyOf(def.provider);
    if (def.needsKey && !key) return { ok: false, ms: 0, detail: 'Clé API manquante' };
    if (def.protocol === 'anthropic') { url = base + '/v1/models'; headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' }; }
    else if (def.protocol === 'ollama') url = base.replace(/\/(api|v1)$/i, '') + '/api/tags';
    else { url = base + '/models'; if (key) headers = { authorization: 'Bearer ' + key }; }
  }
  try {
    const r = await extFetch(id, url, { method, headers, signal: AbortSignal.timeout(15000) });
    let detail = r.status + ' ' + r.statusText;
    if (r.ok && def.category === 'ia' && method === 'GET') { try { const j = await r.json(); const n = (j.data ?? j.models ?? []).length; if (n) detail = n + ' modèle(s) disponible(s)'; } catch { /* réponse non JSON */ } }
    return { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0), detail };
  } catch (e) { return { ok: false, ms: Math.round(performance.now() - t0), detail: e.message === 'fetch failed' ? 'Connexion impossible (' + (e.cause?.code || 'réseau') + ')' : e.message }; }
}

// ---------- API interne : jetons d'accès et réseau local ----------
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const tokenPublic = t => ({ id: t.id, name: t.name, scope: t.scope, enabled: t.enabled, prefix: t.prefix, created: t.created, lastUsed: t.lastUsed ?? null, lastIp: t.lastIp ?? null, uses: t.uses ?? 0 });
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Accès au réseau local demandé (lu au démarrage du serveur pour choisir l'adresse d'écoute). */
export const networkEnabled = () => !!(ctx && cfgAll().network);
// pages réservées à l'ordinateur lui-même : gestion des API et arrêt du programme
const LOCAL_ONLY = /^\/api\/(apis|restart|shutdown|versions\/restore|backups\/restore|model\/import)\b/;

/** Contrôle d'un appel venant d'un autre appareil. Retourne null si autorisé, sinon { code, error }. */
export function authorize(req, url) {
  const ip = req.socket?.remoteAddress;
  if (!ip || LOOPBACK.has(ip)) return null;
  if (!cfgAll().network) return { code: 403, error: 'Accès réseau désactivé' };
  if (!url.pathname.startsWith('/api/')) return { code: 403, error: 'Seule l’API est accessible depuis le réseau' };
  if (LOCAL_ONLY.test(url.pathname)) return { code: 403, error: 'Route réservée à l’ordinateur de Comptes' };
  const raw = (/^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1] || req.headers['x-api-key'] || '').trim();
  const tok = raw && cfgAll().tokens.find(t => t.hash === sha(raw));
  const deny = (code, error) => { recordCall({ service: 'interne', method: req.method, url: url.pathname, status: code, ok: false, error, who: (tok?.name ?? 'inconnu') + ' · ' + ip }); return { code, error }; };
  if (!tok) return deny(401, 'Jeton absent ou invalide');
  if (!tok.enabled) return deny(401, 'Jeton désactivé');
  if (tok.scope === 'lecture' && req.method !== 'GET') return deny(403, 'Jeton en lecture seule');
  tok.lastUsed = new Date().toISOString(); tok.lastIp = ip; tok.uses = (tok.uses ?? 0) + 1;
  recordCall({ service: 'interne', method: req.method, url: url.pathname, status: 200, ok: true, who: tok.name + ' · ' + ip });
  ctx.saveStore();
  return null;
}
const lanAddresses = () => Object.values(os.networkInterfaces?.() ?? {}).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);

// ---------- Module ----------
export function setupApis({ root, getStore, saveStore, listening }) {
  ctx = { getStore, saveStore };
  const str = (v, n) => String(v ?? '').slice(0, n);
  const payload = () => {
    const a = cfgAll(), sec = readSecrets(), st = stats(loadJournal());
    return {
      services: services().map(d => {
        const c = a.services[d.id] ?? {}, key = d.category === 'ia' ? (sec.keys[d.provider] || (d.provider === getStore().ai?.provider ? sec.aiKey : '')) : '';
        return { id: d.id, label: d.label, category: d.category, usage: d.usage, doc: d.doc, defaultEndpoint: d.endpoint, endpoint: c.endpoint ?? '', effectiveEndpoint: endpointOf(d.id), enabled: c.enabled !== false, timeout: c.timeout ?? null, needsKey: !!d.needsKey, local: !!d.local, hasKey: !!key, keyHint: hint(key), active: d.provider && d.provider === getStore().ai?.provider, stats: st[d.id] ?? null };
      }),
      internal: { stats: st.interne ?? null },
      network: { enabled: !!a.network, listening: listening?.() ?? null, addresses: lanAddresses() },
      tokens: a.tokens.map(tokenPublic),
      routes: (() => { try { return scanRoutes(root); } catch { return []; } })(),
    };
  };

  return async function handle(req, res, url, { json, readBody }) {
    const p = url.pathname, m = req.method; let mm;
    if (!p.startsWith('/api/apis')) return false;
    const err = (msg, code = 400) => { json(res, code, { error: msg }); return true; };
    if (p === '/api/apis' && m === 'GET') return json(res, 200, payload()), true;
    if ((mm = p.match(/^\/api\/apis\/services\/([^/]+)$/)) && m === 'PUT') {
      const id = decodeURIComponent(mm[1]), d = svcDef(id); if (!d) return err('Service inconnu', 404);
      const b = await readBody(req), c = cfgAll().services[id] ??= {};
      if (typeof b.enabled === 'boolean') c.enabled = b.enabled;
      if (b.endpoint !== undefined) { const e = str(b.endpoint, 300).trim(); if (e && !/^https?:\/\/[^\s]+$/i.test(e)) return err('Adresse invalide (http:// ou https://)'); if (e) c.endpoint = e; else delete c.endpoint; }
      if (b.timeout !== undefined) { const t = Math.round(+b.timeout); if (t > 0) c.timeout = Math.min(600, t); else delete c.timeout; }
      if (typeof b.key === 'string' && d.category === 'ia') setKey(d.provider, b.key === '__clear__' ? b.key : b.key.trim());
      saveStore(); return json(res, 200, payload()), true;
    }
    if ((mm = p.match(/^\/api\/apis\/services\/([^/]+)\/test$/)) && m === 'POST') return json(res, 200, await testService(decodeURIComponent(mm[1]))), true;
    if (p === '/api/apis/journal' && m === 'GET') {
      const svc = url.searchParams.get('service'), lim = Math.min(1000, Math.max(1, +url.searchParams.get('limit') || 200));
      const list = loadJournal().filter(e => !svc || e.service === svc).slice(-lim).reverse();
      return json(res, 200, { list, total: loadJournal().length }), true;
    }
    if (p === '/api/apis/journal' && m === 'DELETE') { journal = []; saveJournal(); return json(res, 200, payload()), true; }
    if (p === '/api/apis/network' && m === 'PUT') { const b = await readBody(req); cfgAll().network = !!b.enabled; saveStore(); return json(res, 200, payload()), true; }
    if (p === '/api/apis/tokens' && m === 'POST') {
      const b = await readBody(req), name = str(b.name, 60).trim(); if (!name) return err('Donnez un nom au jeton (programme ou appareil)');
      const raw = 'cpt_' + crypto.randomBytes(24).toString('base64url');
      cfgAll().tokens.push({ id: crypto.randomBytes(6).toString('hex'), name, scope: b.scope === 'complet' ? 'complet' : 'lecture', enabled: true, prefix: raw.slice(0, 8), hash: sha(raw), created: new Date().toISOString() });
      saveStore(); return json(res, 200, { ...payload(), token: raw }), true;
    }
    if ((mm = p.match(/^\/api\/apis\/tokens\/([^/]+)$/))) {
      const list = cfgAll().tokens, i = list.findIndex(t => t.id === mm[1]); if (i < 0) return err('Jeton introuvable', 404);
      if (m === 'DELETE') { list.splice(i, 1); saveStore(); return json(res, 200, payload()), true; }
      if (m === 'PUT') {
        const b = await readBody(req), t = list[i];
        if (str(b.name, 60).trim()) t.name = str(b.name, 60).trim(); if (['lecture', 'complet'].includes(b.scope)) t.scope = b.scope; if (typeof b.enabled === 'boolean') t.enabled = b.enabled;
        saveStore(); return json(res, 200, payload()), true;
      }
    }
    return err('Route inconnue', 404);
  };
}
