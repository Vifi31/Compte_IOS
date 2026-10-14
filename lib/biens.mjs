// Biens immobiliers : gestion multi-biens (définition, documents PDF,
// rattachement des dépenses par catégorie), géocodage des communes et estimation de valeur à partir des données DVF
// (demandes de valeurs foncières) publiées par data.gouv.fr.
import fs from 'fs';
import path from 'path';
import { DATA_DIR, BIENS_DIR } from './paths.mjs';
import { ensureIndex, dropFromIndex, searchText } from './corpus.mjs';

const DVF_DIR = path.join(DATA_DIR, 'dvf');
const DVF_TTL_MS = 30 * 24 * 3600 * 1000;      // validité du cache des ventes d'une commune
const GEO_TTL_MS = 24 * 3600 * 1000;           // validité du cache des recherches de communes
const TYPES = ['appartement', 'maison', 'terrain', 'local', 'autre'];
const STATUTS = ['projet', 'detenu', 'vendu'];
const USAGES = ['residence', 'investissement', 'mixte'];
const DEFAULT_KINDS = [
  { id: 'acte', label: 'Acte & notaire', icon: '📜' }, { id: 'diagnostic', label: 'Diagnostics', icon: '🔬' }, { id: 'quittance', label: 'Quittances', icon: '🧾' },
  { id: 'facture', label: 'Factures', icon: '🧾' }, { id: 'taxe', label: 'Avis d’imposition', icon: '🏛️' }, { id: 'assurance', label: 'Contrats d’assurance', icon: '🛡️' }, { id: 'autre', label: 'Autre', icon: '📎' }];
const str = (v, n) => String(v ?? '').slice(0, n);
const r2 = x => Math.round(x * 100) / 100;
const uid = () => Math.random().toString(36).slice(2, 9);

/** Département d'un code INSEE : 97x (DOM) sur 3 caractères, 2A / 2B (Corse) ou 2 chiffres sinon. */
export function deptOf(code) {
  const c = String(code || '');
  return c.startsWith('97') ? c.slice(0, 3) : c.slice(0, 2);
}

// ---------- Données ----------
function biens_(store) {
  store.biens ??= {}; store.biens.items ??= []; store.biens.seq ??= 0;
  return store.biens;
}

function cleanBien(b, base = {}) {
  const o = { ...base };
  const txt = (k, n) => { if (b[k] !== undefined) o[k] = str(b[k], n).trim(); };
  const num = (k, min = 0, max = 1e9) => { if (b[k] !== undefined) o[k] = b[k] === null || b[k] === '' ? null : Math.min(max, Math.max(min, Number(b[k]) || 0)); };
  const date = k => { if (b[k] !== undefined) o[k] = /^\d{4}-\d{2}-\d{2}$/.test(b[k] || '') ? b[k] : ''; };
  txt('nom', 60); txt('adresse', 90); txt('codePostal', 10); txt('ville', 50); txt('commune', 8); txt('description', 2000); txt('etage', 12);
  if (TYPES.includes(b.type)) o.type = b.type;
  if (STATUTS.includes(b.statut)) o.statut = b.statut;
  if (USAGES.includes(b.usage)) o.usage = b.usage;
  if (/^#[0-9a-f]{6}$/i.test(b.couleur || '')) o.couleur = b.couleur;
  txt('icone', 8); txt('annee', 6); txt('dpe', 2); txt('etat', 20);
  for (const k of ['surface', 'terrain', 'pieces', 'loyerMensuel', 'prixAchat', 'valeurActuelle']) num(k, 0, 1e8);
  for (const k of ['dateAchat']) date(k);
  for (const k of ['lat', 'lon']) if (b[k] !== undefined) o[k] = b[k] === null || b[k] === '' ? null : Math.max(-180, Math.min(180, Number(b[k]) || 0));
  for (const k of ['exterieur', 'garage', 'ascenseur', 'jardin']) if (b[k] !== undefined) o[k] = !!b[k];
  // crédit éventuel
  if (b.credit && typeof b.credit === 'object') o.credit = {
    actif: !!b.credit.actif, montant: Math.min(1e8, Math.max(0, Number(b.credit.montant) || 0)),
    tauxPct: Math.min(20, Math.max(0, Number(b.credit.tauxPct) || 0)), dureeMois: Math.min(500, Math.max(0, Number(b.credit.dureeMois) || 0)),
    assurancePct: Math.min(5, Math.max(0, Number(b.credit.assurancePct) || 0)), debut: /^\d{4}-\d{2}-\d{2}$/.test(b.credit.debut || '') ? b.credit.debut : '',
  };
  // listes de suivi (rattachements, estimations) : fournies = remplacées, absentes = conservées
  const isoD = v => (/^d{4}-d{2}-d{2}$/.test(v || '') ? v : '');
  const n2 = (v, max) => Math.min(max, Math.max(0, Number(v) || 0));
  const nid = v => str(v, 12).replace(/[^w-]/g, '') || uid();
  const list = (k, n, fn) => { if (Array.isArray(b[k])) o[k] = b[k].slice(0, n).map(fn).filter(Boolean); };
  list('accroche', 40, a => a && typeof a === 'object' && str(a.pattern, 60).trim() && { id: nid(a.id), pattern: str(a.pattern, 60).trim() });
  if (b.crit && typeof b.crit === 'object' && !Array.isArray(b.crit)) { // critères d'affinage de l'estimation : { clé: option }
    const c = {}; for (const [k, v] of Object.entries(b.crit).slice(0, 60)) if (/^[a-z_]{1,24}$/.test(k) && typeof v === 'string' && /^[a-z0-9_-]{1,24}$/.test(v)) c[k] = v;
    o.crit = c;
  }
  if (Array.isArray(b.revCatIds)) o.revCatIds = [...new Set(b.revCatIds.filter(x => typeof x === 'string' && x.length <= 80))].slice(0, 100); // catégories de revenus (loyers)
  if (Array.isArray(b.catIds)) o.catIds = [...new Set(b.catIds.filter(x => typeof x === 'string' && x.length <= 80))].slice(0, 200);
  if (b.opCats && typeof b.opCats === 'object' && !Array.isArray(b.opCats)) {
    const mm = {}; for (const [k, v] of Object.entries(b.opCats).slice(0, 8000)) if (k.length <= 160 && typeof v === 'string' && v.length <= 80) mm[k] = v;
    o.opCats = mm; // catégorie de chaque opération rattachée, mémorisée au moment du rattachement
  }
  if (Array.isArray(b.opExcl)) o.opExcl = [...new Set(b.opExcl.filter(x => typeof x === 'string' && x.length <= 160))].slice(0, 8000);
  if (Array.isArray(b.opIds)) o.opIds = [...new Set(b.opIds.filter(x => typeof x === 'string' && x.length <= 160))].slice(0, 5000);
  list('estimations', 120, e => e && typeof e === 'object' && {
    id: nid(e.id), date: str(e.date, 30), source: str(e.source, 60),
    mini: n2(e.mini, 1e10), centre: n2(e.centre, 1e10), maxi: n2(e.maxi, 1e10),
    ppsmMini: n2(e.ppsmMini, 1e7), ppsmCentre: n2(e.ppsmCentre, 1e7), ppsmMaxi: n2(e.ppsmMaxi, 1e7),
    n: Math.min(99999, Math.max(0, Number(e.n) || 0)), surface: n2(e.surface, 1e5), factor: Number(e.factor) || 1,
    adj: Array.isArray(e.adj) ? e.adj.slice(0, 20).map(a2 => a2 && typeof a2 === 'object' && ({ key: str(a2.key, 20), label: str(a2.label, 40), pct: Number(a2.pct) || 0, on: !!a2.on, detail: str(a2.detail, 40) })).filter(Boolean) : [],
  });
  return o;
}

/** Liste triée ; les documents sont lus sur disque (métadonnées de type fusionnées depuis le store). */
export function biensList(store) {
  const B = biens_(store);
  return B.items.map(b => ({ ...b, docs: docsOf(b) }));
}

function bienDir(id) { return path.join(BIENS_DIR, String(id).replace(/[^\w-]/g, '')); }
const safeDoc = n => { n = path.basename(String(n || '')); return /^[\w.\- ()]+\.pdf$/i.test(n) ? n : null; };

function docsOf(b) {
  const dir = bienDir(b.id), kinds = b.docKinds ?? {};
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f)); } catch { /* aucun document */ }
  return files.map(name => {
    const st = fs.statSync(path.join(dir, name));
    return { name, size: st.size, at: st.mtime.toISOString(), kind: kinds[name] || 'autre', note: (b.docNotes ?? {})[name] ?? '', tags: (b.docTags ?? {})[name] ?? [], date: (b.docDates ?? {})[name] ?? '' };
  }).sort((a, b2) => a.name.localeCompare(b2.name, 'fr'));
}

// ---------- Géocodage (geo.api.gouv.fr) ----------
const geoCache = new Map(); // nom|cp -> { at, list }
async function geoFetch(url) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('service indisponible (' + r.status + ')');
    return await r.json();
  } finally { clearTimeout(t); }
}
async function communesSearch(nom, cp) {
  const key = (nom + '|' + (cp || '')).toLowerCase();
  const c = geoCache.get(key);
  if (c && Date.now() - c.at < GEO_TTL_MS) return c.list;
  // ville seule, ville + code postal, ou code postal seul (geo.api.gouv.fr accepte chaque combinaison)
  const q = nom ? 'nom=' + encodeURIComponent(nom) + (cp ? '&codePostal=' + encodeURIComponent(cp) : '')
    : cp ? 'codePostal=' + encodeURIComponent(cp) : '';
  if (!q) return [];
  const url = 'https://geo.api.gouv.fr/communes?' + q + '&fields=nom,code,codesPostaux,population&limit=12' + (nom ? '&boost=population' : '');
  const list = (await geoFetch(url)).map(x => ({ nom: x.nom, code: x.code, cp: (x.codesPostaux || [])[0] ?? '', codesPostaux: x.codesPostaux || [], population: x.population || 0, dept: deptOf(x.code) }));
  geoCache.set(key, { at: Date.now(), list });
  return list;
}

// ---------- DVF (data.gouv.fr) : ventes réelles par commune ----------
/** Parser CSV minimal (guillemets, doubles guillemets, virgules dans les champs). */
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); field = ''; if (row.length > 1) rows.push(row); row = []; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Agrège les lignes d'un fichier DVF en mutations (une vente = une valeur foncière, surfaces additionnées). */
export function parseDvfCsv(text) {
  const rows = parseCsv(text); if (rows.length < 2) return [];
  const head = rows[0], col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  const g = (r, k) => { const i = col[k]; return i === undefined ? '' : (r[i] ?? '').trim(); };
  const byId = new Map();
  for (const r of rows.slice(1)) {
    if (g(r, 'nature_mutation') !== 'Vente') continue;
    const id = g(r, 'id_mutation'); if (!id) continue;
    let m = byId.get(id);
    if (!m) { m = { id, date: g(r, 'date_mutation'), valeur: 0, bati: 0, terrain: 0, pieces: 0, types: new Set(), commune: g(r, 'nom_commune'), cp: g(r, 'code_postal'), adresse: [g(r, 'adresse_numero'), g(r, 'adresse_nom_voie')].filter(Boolean).join(' ').trim(), lon: g(r, 'longitude'), lat: g(r, 'latitude') }; byId.set(id, m); }
    const v = Number(g(r, 'valeur_fonciere').replace(',', '.')) || 0; if (v > m.valeur) m.valeur = v;
    const s = Number(g(r, 'surface_reelle_bati').replace(',', '.')) || 0;
    const t = g(r, 'type_local');
    if (s > 0 && (t === 'Appartement' || t === 'Maison' || t === 'Dependance')) {
      if (t !== 'Dependance') { m.bati += s; m.types.add(t); }
      const p = Number(g(r, 'nombre_pieces_principales')) || 0; if (p > m.pieces) m.pieces = p;
    }
    const terr = Number(g(r, 'surface_terrain').replace(',', '.')) || 0; if (terr > m.terrain) m.terrain = terr;
  }
  const out = [];
  for (const m of byId.values()) {
    if (!(m.valeur > 5000) || m.bati < 9 || !m.types.size) continue;
    const type = m.types.has('Maison') ? 'maison' : 'appartement';
    out.push({ id: m.id, date: m.date, valeur: Math.round(m.valeur), surface: Math.round(m.bati * 10) / 10, terrain: Math.round(m.terrain), type, pieces: m.pieces, commune: m.commune, cp: m.cp, adresse: m.adresse.slice(0, 60), lon: m.lon, lat: m.lat, ppsm: Math.round(m.valeur / m.bati * 10) / 10 });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const cacheFile = code => path.join(DVF_DIR, code + '.json');
function readDvfCache(code) {
  try { return JSON.parse(fs.readFileSync(cacheFile(code), 'utf8')); } catch { return null; }
}
async function dvfFetch(code, years) {
  const dept = deptOf(code), res = [];
  let missing = 0;
  for (const y of years) {
    if (missing >= 2) break; // les deux dernières années absentes : on suppose la plus récente atteinte
    const url = `https://files.data.gouv.fr/geo-dvf/latest/csv/${y}/communes/${dept}/${code}.csv`;
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
      let text;
      try { const r = await fetch(url, { signal: ctl.signal }); if (r.status === 404) { missing++; continue; } if (!r.ok) throw new Error('HTTP ' + r.status); text = await r.text(); } finally { clearTimeout(t); }
      res.push(...parseDvfCsv(text).map(m => ({ ...m, annee: y })));
    } catch (e) { throw new Error(`Téléchargement des ventes DVF impossible pour ${code} (${y}) : ${e.message}`); }
  }
  if (!res.length) throw new Error('Aucune vente publiée trouvée pour cette commune');
  return { commune: code, fetchedAt: new Date().toISOString(), years, mutations: res };
}

// ---------- Module ----------
export function setupBiens({ getStore, saveStore, askAI }) {
  fs.mkdirSync(BIENS_DIR, { recursive: true });
  fs.mkdirSync(DVF_DIR, { recursive: true });

  return async function handle(req, res, url, { json, readBody }) {
    const p = url.pathname, m = req.method, store = getStore();
    if (!p.startsWith('/api/biens')) return false;
    const B = biens_(store);
    const err = (msg, code = 400) => { json(res, code, { error: msg }); return true; };
    /** Dépôt des documents non affectés à un bien (même structure qu'un bien pour les métadonnées de documents). */
    const inboxOf = () => (B.inbox ??= { id: '_inbox', nom: 'Non affectés', icone: '📥', docKinds: {}, docNotes: {}, docTags: {}, docDates: {} });
    const holder = id => (id === '_inbox' ? inboxOf() : B.items.find(x => x.id === id));
    const cleanTags = a => [...new Set((Array.isArray(a) ? a : []).map(t => str(t, 24).trim()).filter(Boolean))].slice(0, 12);
    /** Métadonnées de documents d'un bien : étiquettes et date du document (les natures et notes ont leur traitement propre). */
    const applyExtra = (t, b) => {
      if (b.docTags && typeof b.docTags === 'object') { const o = {}; for (const [k, v] of Object.entries(b.docTags)) { const n = safeDoc(k), tg = cleanTags(v); if (n && tg.length) o[n] = tg; } t.docTags = o; }
      if (b.docDates && typeof b.docDates === 'object') { const o = {}; for (const [k, v] of Object.entries(b.docDates)) { const n = safeDoc(k); if (n && /^\d{4}-\d{2}-\d{2}$/.test(v)) o[n] = v; } t.docDates = o; }
    };
    const kindsOf = () => (B.kinds?.length ? B.kinds : DEFAULT_KINDS);
    const ok = body => { saveStore(); const o = body ?? { items: biensList(store) }; json(res, 200, o.items ? { ...o, kinds: kindsOf() } : o); return true; };
    let mm;
    try {
      if (p === '/api/biens' && m === 'GET') return json(res, 200, { items: biensList(store), kinds: kindsOf() }), true;

      // gestion documentaire : bibliothèque de tous les documents (biens + non affectés) et actions groupées
      if (p === '/api/biens/_inbox' && m === 'PUT') {
        const b = await readBody(req), t = inboxOf(); applyExtra(t, b);
        if (b.docNotes && typeof b.docNotes === 'object') { const o = {}; for (const [k, v] of Object.entries(b.docNotes)) { const n = safeDoc(k); if (n && typeof v === 'string' && v.trim()) o[n] = v.slice(0, 300); } t.docNotes = o; }
        if (b.docKinds && typeof b.docKinds === 'object') { const o = {}; for (const [k, v] of Object.entries(b.docKinds)) { const n = safeDoc(k); if (n && typeof v === 'string' && v.length <= 40) o[n] = v; } t.docKinds = o; }
        return ok({ items: biensList(store) });
      }
      if (p === '/api/biens/library' && m === 'GET') {
        const docs = [], tags = new Set();
        for (const b of [...B.items, inboxOf()]) for (const d of docsOf(b)) { d.tags.forEach(t => tags.add(t)); docs.push({ bien: b.id, bienNom: b.nom, icone: b.icone || '🏠', ...d }); }
        return json(res, 200, { docs, tags: [...tags].sort((x, y) => x.localeCompare(y, 'fr')), kinds: kindsOf(), biens: B.items.map(b => ({ id: b.id, nom: b.nom, icone: b.icone || '🏠' })) }), true;
      }
      if (p === '/api/biens/library/action' && m === 'POST') {
        const b = await readBody(req), items = (Array.isArray(b.items) ? b.items : []).slice(0, 500).map(x => ({ h: holder(String(x?.bien)), name: safeDoc(x?.name) })).filter(x => x.h && x.name && fs.existsSync(path.join(bienDir(x.h.id), x.name)));
        if (!items.length) return err('Aucun document valide dans la sélection');
        let count = 0;
        if (b.action === 'move') {
          const to = holder(String(b.to)); if (!to) return err('Bien de destination introuvable', 404);
          fs.mkdirSync(bienDir(to.id), { recursive: true });
          for (const { h: from, name } of items) {
            if (from.id === to.id) continue;
            let final = name, k = 2; while (fs.existsSync(path.join(bienDir(to.id), final))) final = name.replace(/(\.pdf)$/i, '_' + k++ + '$1');
            const src = path.join(bienDir(from.id), name), dst = path.join(bienDir(to.id), final);
            try { fs.renameSync(src, dst); } catch { fs.copyFileSync(src, dst); fs.unlinkSync(src); }
            for (const f of ['docKinds', 'docNotes', 'docTags', 'docDates']) { const v = from[f]?.[name]; if (v !== undefined) { (to[f] ??= {})[final] = v; delete from[f][name]; } }
            dropFromIndex(bienDir(from.id), name); count++;
          }
        } else if (b.action === 'meta') {
          const add = cleanTags(b.addTags), rem = new Set(cleanTags(b.removeTags));
          for (const { h: t, name } of items) {
            if (typeof b.kind === 'string' && kindsOf().some(k => k.id === b.kind)) (t.docKinds ??= {})[name] = b.kind;
            if (add.length || rem.size) { const cur = (t.docTags ??= {})[name] ?? []; const nt = [...new Set([...cur.filter(x => !rem.has(x)), ...add])].slice(0, 12); if (nt.length) t.docTags[name] = nt; else delete t.docTags[name]; }
            if (typeof b.date === 'string') { if (/^\d{4}-\d{2}-\d{2}$/.test(b.date)) (t.docDates ??= {})[name] = b.date; else if (b.date === '') delete (t.docDates ??= {})[name]; }
            if (typeof b.note === 'string') { if (b.note.trim()) (t.docNotes ??= {})[name] = b.note.slice(0, 300); else delete (t.docNotes ??= {})[name]; }
            count++;
          }
        } else if (b.action === 'delete') {
          for (const { h: t, name } of items) { try { fs.unlinkSync(path.join(bienDir(t.id), name)); } catch { continue; } for (const f of ['docKinds', 'docNotes', 'docTags', 'docDates']) if (t[f]) delete t[f][name]; dropFromIndex(bienDir(t.id), name); count++; }
        } else return err('Action inconnue');
        return ok({ count });
      }

      // corpus documentaire : recherche plein texte dans les PDF des biens (?bien=<id|all>&q=…&reindex=1)
      if (p === '/api/biens/corpus' && m === 'GET') {
        const which = url.searchParams.get('bien') || 'all', q = str(url.searchParams.get('q'), 200).trim(), force = url.searchParams.get('reindex') === '1';
        const scope = [...B.items.filter(b => which === 'all' || b.id === which), ...(which === 'all' || which === '_inbox' ? [inboxOf()] : [])]; let pending = 0; const docs = [];
        for (const b of scope) {
          const dir = bienDir(b.id), { idx, pending: pd } = await ensureIndex(dir, { force, limit: force ? 200 : 25 }); pending += pd;
          for (const d of docsOf(b)) {
            const e = idx[d.name]; if (!e) continue;
            const r = q ? searchText(e, q) : { hits: 0, excerpts: [] }; if (q && !r.hits) continue;
            docs.push({ bien: b.id, bienNom: b.nom, icone: b.icone || '🏠', ...d, pages: e.pages, chars: e.chars, scan: !e.error && e.chars < 40, error: e.error || '', hits: r.hits, excerpts: r.excerpts });
          }
        }
        if (q) docs.sort((x, y) => y.hits - x.hits);
        return json(res, 200, { docs, pending, q }), true;
      }

      // géocodage de l'adresse du bien (Géoplateforme / base adresse nationale) : coordonnées pour estimer par éloignement
      if (p === '/api/biens/geocode' && m === 'GET') {
        const q = str(url.searchParams.get('q'), 160).trim(), cp = str(url.searchParams.get('cp'), 8).trim(), city = str(url.searchParams.get('citycode'), 8).trim();
        if (!q) return err('Adresse vide');
        const qs = 'q=' + encodeURIComponent(q) + (cp ? '&postcode=' + encodeURIComponent(cp) : '') + (city ? '&citycode=' + encodeURIComponent(city) : '') + '&limit=1';
        for (const base of ['https://data.geopf.fr/geocodage/search?', 'https://api-adresse.data.gouv.fr/search/?']) {
          try {
            const j = await geoFetch(base + qs), f = j.features?.[0]; if (!f) continue;
            return json(res, 200, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], label: f.properties.label, score: Math.round((f.properties.score ?? 0) * 100) / 100, type: f.properties.type, city: f.properties.city }), true;
          } catch { /* service suivant */ }
        }
        return err('Adresse introuvable ou service de géocodage indisponible', 404);
      }

      // natures de documents (libellés modifiables)
      if (p === '/api/biens/kinds' && m === 'PUT') {
        const b = await readBody(req), seen = new Set(), list = [];
        for (const k of Array.isArray(b.kinds) ? b.kinds.slice(0, 40) : []) {
          const label = str(k?.label, 40).trim(); if (!label) continue;
          let id = str(k?.id, 30).replace(/[^\w-]/g, '') || ('k' + Math.random().toString(36).slice(2, 7));
          while (seen.has(id)) id += 'x'; seen.add(id);
          list.push({ id, label, icon: str(k?.icon, 4).trim() || '📎' });
        }
        if (!seen.has('autre')) list.push({ id: 'autre', label: 'Autre', icon: '📎' });
        B.kinds = list; return ok({ items: biensList(store) });
      }

      if (p === '/api/biens' && m === 'POST') {
        const b = await readBody(req);
        if (!str(b.nom, 60).trim()) return err('Le nom du bien est obligatoire');
        const id = 'b' + (++B.seq);
        const item = cleanBien(b, { id, nom: str(b.nom, 60).trim(), type: 'appartement', statut: 'projet', usage: 'residence', couleur: '#6366f1', icone: '🏠' });
        item.accroche ??= []; item.catIds ??= []; item.revCatIds ??= []; item.opIds ??= []; item.opCats ??= {}; item.opExcl ??= []; item.estimations ??= []; item.docKinds ??= {};
        B.items.push(item); fs.mkdirSync(bienDir(id), { recursive: true });
        return ok({ items: biensList(store), created: id });
      }

      // 'communes' et 'dvf' sont des sous-routes réservées (traitées plus bas), pas des identifiants de bien
      if ((mm = p.match(/^\/api\/biens\/([^/]+)$/)) && mm[1] !== 'communes' && mm[1] !== 'dvf' && mm[1] !== 'geocode' && mm[1] !== 'kinds' && mm[1] !== 'corpus' && mm[1] !== 'library' && mm[1] !== '_inbox') {
        const id = decodeURIComponent(mm[1]), i = B.items.findIndex(x => x.id === id);
        if (i < 0) return err('Bien introuvable', 404);
        if (m === 'PUT') {
          const b = await readBody(req);
          applyExtra(B.items[i], b);
          if (b.docNotes && typeof b.docNotes === 'object') {
            const notes = {}; for (const [k, v] of Object.entries(b.docNotes)) { const n = safeDoc(k); if (n && typeof v === 'string' && v.trim()) notes[n] = v.slice(0, 300); }
            B.items[i].docNotes = notes;
          }
          if (b.docKinds && typeof b.docKinds === 'object') {
            const kinds = {};
            for (const [k, v] of Object.entries(b.docKinds)) { const n = safeDoc(k); if (n && typeof v === 'string' && v.length <= 40) kinds[n] = v; }
            B.items[i].docKinds = kinds;
          }
          B.items[i] = { ...cleanBien(b, B.items[i]), id, docKinds: B.items[i].docKinds ?? {}, docNotes: B.items[i].docNotes ?? {}, docTags: B.items[i].docTags ?? {}, docDates: B.items[i].docDates ?? {} };
          return ok({ items: biensList(store) });
        }
        if (m === 'DELETE') {
          B.items.splice(i, 1);
          try { fs.rmSync(bienDir(id), { recursive: true, force: true }); } catch { /* dossier déjà absent */ }
          return ok({ items: biensList(store) });
        }
      }

      // ---------- documents PDF du bien
      if ((mm = p.match(/^\/api\/biens\/([^/]+)\/documents$/))) {
        const id = decodeURIComponent(mm[1]), bien = holder(id);
        if (!bien) return err('Bien introuvable', 404);
        const dir = bienDir(id);
        if (m === 'POST') {
          const chunks = []; let size = 0;
          for await (const c of req) { size += c.length; if (size > 25e6) return err('Fichier trop volumineux (25 Mo max)', 413); chunks.push(c); }
          const buf = Buffer.concat(chunks);
          if (buf.subarray(0, 5).toString() !== '%PDF-') return err('Ce fichier n’est pas un PDF');
          let name = safeDoc(url.searchParams.get('name') || 'document.pdf'); if (!name) return err('Nom de fichier invalide');
          fs.mkdirSync(dir, { recursive: true });
          let final = name, k = 2;
          while (fs.existsSync(path.join(dir, final))) final = name.replace(/(\.pdf)$/i, '_' + k++ + '$1');
          fs.writeFileSync(path.join(dir, final), buf);
          const kind = kindsOf().some(k => k.id === url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'autre';
          bien.docKinds = { ...(bien.docKinds ?? {}), [final]: kind };
          try { await ensureIndex(dir, { limit: 1 }); } catch { /* indexation reportée à la première recherche */ }
          return ok({ items: biensList(store), name: final });
        }
        if (m === 'GET') {
          const n = safeDoc(url.searchParams.get('name')), f = n && path.join(dir, n);
          if (!f || !fs.existsSync(f)) return err('Introuvable', 404);
          res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': fs.statSync(f).size, 'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${n}"` });
          fs.createReadStream(f).pipe(res); return true;
        }
        if (m === 'DELETE') {
          const n = safeDoc(url.searchParams.get('name'));
          if (!n || !fs.existsSync(path.join(dir, n))) return err('Introuvable', 404);
          fs.unlinkSync(path.join(dir, n));
          if (bien.docKinds) delete bien.docKinds[n];
          if (bien.docNotes) delete bien.docNotes[n];
          if (bien.docTags) delete bien.docTags[n];
          if (bien.docDates) delete bien.docDates[n];
          dropFromIndex(dir, n);
          return ok({ items: biensList(store) });
        }
      }

      // ---------- communes (recherche pour l'estimation)
      if (p === '/api/biens/communes' && m === 'GET') {
        const nom = str(url.searchParams.get('nom'), 60).trim(), cp = str(url.searchParams.get('cp'), 6).trim();
        if (!nom && !cp) return err('Indiquez une ville ou un code postal');
        return json(res, 200, { list: await communesSearch(nom, cp) }), true;
      }

      // ---------- ventes réelles DVF d'une commune (cache 30 j)
      if (p === '/api/biens/dvf' && m === 'GET') {
        const code = str(url.searchParams.get('commune'), 8);
        if (!/^\d{5}$|^\d[AB]\d{3}$/.test(code)) return err('Code INSEE invalide');
        const nYears = Math.min(6, Math.max(1, Number(url.searchParams.get('years')) || 4));
        const cur = new Date().getFullYear(), years = [];
        for (let y = cur; y >= cur - nYears; y--) years.push(y); // année en cours incluse : publiée dès que les données officielles la couvrent
        const cached = readDvfCache(code);
        if (cached && Date.now() - +new Date(cached.fetchedAt) < (cached.hasCurrent ? DVF_TTL_MS : 3 * 24 * 3600 * 1000) && cached.years?.[0] >= years[0])
          return json(res, 200, { ...cached, cached: true }), true;
        try {
          const fresh = await dvfFetch(code, years);
          fresh.hasCurrent = fresh.mutations.some(m => m.annee === cur); // sinon nouvelle tentative sous 3 jours (publication semestrielle)
          fresh.lastDate = fresh.mutations.reduce((d, m) => (m.date > d ? m.date : d), '');
          fs.writeFileSync(cacheFile(code), JSON.stringify(fresh));
          return json(res, 200, fresh), true;
        } catch (e) {
          if (cached) return json(res, 200, { ...cached, cached: true, stale: true, warning: String(e.message || e) }), true;
          return err(String(e.message || e), 502);
        }
      }
      return err('Not found', 404);
    } catch (e) { return err(String(e.message || e)); }
  };
}
