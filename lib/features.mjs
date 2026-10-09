// Routes : journal des prompts, copyright / licence, analyse par IA.
import fs from 'fs';
import path from 'path';
import { SEED_JOURNAL, DEFAULT_TEMPLATES } from './seed-prompts.mjs';
import { callAI, PROVIDERS, listLocalModels, startPull, pullStatus } from './ai.mjs';
import { defaultLicense, LICENSE_TYPES, DEFAULT_EULA, eulaText, licenseFileText, noticeText, thirdParty, brief, copyrightLine } from './license.mjs';
import { DATA_DIR } from './paths.mjs';

const STATUSES = ['à faire', 'en cours', 'réalisé', 'annulé', 'envoyé', 'erreur'];
const str = (v, n) => String(v ?? '').slice(0, n);

export function licenseBrief(store) { return brief({ ...defaultLicense(), ...(store.license ?? {}) }); }
export function copyrightOf(store) { return copyrightLine({ ...defaultLicense(), ...(store.license ?? {}) }); }

export function setupFeatures({ root, getStore, saveStore }) {
  const SECRETS = path.join(DATA_DIR, 'secrets.json');
  const readSecrets = () => { let s = {}; try { s = JSON.parse(fs.readFileSync(SECRETS, 'utf8')); } catch { /* aucun secret enregistré */ } if (!s.aiKey && process.env.COMPTES_AI_KEY) s.aiKey = process.env.COMPTES_AI_KEY; return s; };
  const writeSecrets = s => { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(SECRETS, JSON.stringify(s)); };

  const prompts = () => {
    const s = getStore();
    if (!s.prompts) s.prompts = { journal: SEED_JOURNAL.map(x => ({ ...x })), templates: { ...DEFAULT_TEMPLATES }, seq: 1000 };
    s.prompts.templates ??= { ...DEFAULT_TEMPLATES }; s.prompts.seq ??= 1000;
    s.prompts.templates.userMulti ||= DEFAULT_TEMPLATES.userMulti;
    if (!s.prompts.localTime) {
      // Les entrées initiales avaient été saisies avec l'heure locale mais enregistrées comme si elle était UTC :
      // on relit les chiffres de l'heure comme une heure locale (une seule fois, hors entrées déjà modifiées).
      for (const e of s.prompts.journal) {
        if (e.source !== 'demande' || e.edited || e.id > 14) continue;
        const d = new Date(e.date);
        e.date = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()).toISOString();
      }
      s.prompts.localTime = true; saveStore();
    }
    return s.prompts;
  };
  const license = () => { const s = getStore(); s.license = { ...defaultLicense(), ...(s.license ?? {}) }; return s.license; };
  const ai = () => { const s = getStore(); s.ai = { provider: 'local', model: '', endpoint: '', maxTokens: 2000, ...(s.ai ?? {}) }; s.analyses ??= []; return s.ai; };
  const aiPublic = () => ({ ...ai(), hasKey: !!readSecrets().aiKey, providers: PROVIDERS });
  const logPrompt = entry => { const p = prompts(); p.journal.push({ id: ++p.seq, date: new Date().toISOString(), version: '', ...entry }); if (p.journal.length > 2000) p.journal.splice(0, p.journal.length - 2000); };
  const licensePayload = () => {
    const l = license(), list = thirdParty(root, process.version);
    return { license: l, types: LICENSE_TYPES, brief: brief(l), eulaPreview: eulaText(l), eulaDefault: DEFAULT_EULA, licenseFile: licenseFileText(l), notice: noticeText(l, list), thirdParty: list };
  };

  return async function handle(req, res, url, { json, readBody }) {
    const p = url.pathname, m = req.method;
    if (!['/api/prompts', '/api/license', '/api/ai', '/api/immo'].some(x => p.startsWith(x))) return false;
    const err = (msg, code = 400) => { json(res, code, { error: msg }); return true; };
    const ok = body => { saveStore(); json(res, 200, body); return true; };
    let mm;
    try {
      // ---------- journal des prompts
      if (p === '/api/prompts' && m === 'GET') { const pr = prompts(); return json(res, 200, { journal: pr.journal, templates: pr.templates, defaults: DEFAULT_TEMPLATES, statuses: STATUSES }), true; }
      if (p === '/api/prompts/journal' && m === 'POST') {
        const b = await readBody(req), pr = prompts(); if (!str(b.text, 20000).trim()) return err('Le texte du prompt est obligatoire');
        pr.journal.push({ id: ++pr.seq, source: 'demande', date: b.date || new Date().toISOString(), text: str(b.text, 20000), status: STATUSES.includes(b.status) ? b.status : 'à faire', version: str(b.version, 20), notes: str(b.notes, 2000) });
        return ok({ journal: pr.journal });
      }
      if ((mm = p.match(/^\/api\/prompts\/journal\/(\d+)$/))) {
        const pr = prompts(), i = pr.journal.findIndex(x => String(x.id) === mm[1]); if (i < 0) return err('Entrée introuvable', 404);
        if (m === 'PUT') {
          const b = await readBody(req), e = pr.journal[i];
          if (b.text !== undefined) { if (!str(b.text, 20000).trim()) return err('Le texte du prompt est obligatoire'); e.text = str(b.text, 20000); }
          if (b.date) e.date = String(b.date); if (STATUSES.includes(b.status)) e.status = b.status;
          if (b.version !== undefined) e.version = str(b.version, 20); if (b.notes !== undefined) e.notes = str(b.notes, 2000);
          e.edited = new Date().toISOString(); return ok({ journal: pr.journal });
        }
        if (m === 'DELETE') { pr.journal.splice(i, 1); return ok({ journal: pr.journal }); }
      }
      if (p === '/api/prompts/templates' && m === 'PUT') {
        const b = await readBody(req), pr = prompts();
        if (!str(b.system, 8000).trim() || !str(b.user, 8000).includes('{{donnees}}')) return err('Le modèle utilisateur doit contenir {{donnees}}');
        pr.templates = { system: str(b.system, 8000), user: str(b.user, 8000), userMulti: str(b.userMulti, 8000).includes('{{donnees}}') ? str(b.userMulti, 8000) : (pr.templates.userMulti || DEFAULT_TEMPLATES.userMulti) };
        logPrompt({ source: 'demande', text: 'Modification des modèles de prompt d’analyse IA', status: 'réalisé', notes: 'Modèles mis à jour depuis la page Prompt.' });
        return ok({ templates: pr.templates });
      }
      if (p === '/api/prompts/templates/reset' && m === 'POST') { const pr = prompts(); pr.templates = { ...DEFAULT_TEMPLATES }; return ok({ templates: pr.templates }); }

      // ---------- licence
      if (p === '/api/license' && m === 'GET') return json(res, 200, licensePayload()), true;
      if (p === '/api/license' && m === 'PUT') {
        const b = await readBody(req), l = license();
        if (b.holder !== undefined) { if (!str(b.holder, 80).trim()) return err('Le titulaire du copyright est obligatoire'); l.holder = str(b.holder, 80).trim(); }
        if (b.year) l.year = Math.min(2100, Math.max(1990, Math.round(+b.year) || l.year));
        if (b.product !== undefined && str(b.product, 60).trim()) l.product = str(b.product, 60).trim();
        if (b.contact !== undefined) l.contact = str(b.contact, 120);
        if (LICENSE_TYPES[b.licenseType]) l.licenseType = b.licenseType;
        if (typeof b.eulaEnabled === 'boolean') l.eulaEnabled = b.eulaEnabled;
        if (b.eulaText !== undefined && str(b.eulaText, 30000) !== (l.eulaText ?? '')) { l.eulaText = str(b.eulaText, 30000); l.eulaVersion = (l.eulaVersion || 1) + 1; }
        return ok(licensePayload());
      }
      if (p === '/api/license/accept' && m === 'POST') {
        const b = await readBody(req), l = license(); if (!str(b.name, 80).trim()) return err('Indiquez votre nom pour accepter la licence');
        l.acceptance = { name: str(b.name, 80).trim(), at: new Date().toISOString(), eulaVersion: l.eulaVersion }; return ok(licensePayload());
      }
      if (p === '/api/license/revoke' && m === 'POST') { license().acceptance = null; return ok(licensePayload()); }
      if (p === '/api/license/write-files' && m === 'POST') {
        const l = license(), list = thirdParty(root, process.version);
        fs.writeFileSync(path.join(root, 'LICENSE'), licenseFileText(l)); fs.writeFileSync(path.join(root, 'NOTICE'), noticeText(l, list));
        return json(res, 200, { written: ['LICENSE', 'NOTICE'], dir: root }), true;
      }

      // ---------- immobilier (VEFA)
      if (p === '/api/immo' && m === 'GET') return json(res, 200, { project: getStore().immo ?? null }), true;
      if (p === '/api/immo' && m === 'PUT') {
        const b = await readBody(req); const raw = JSON.stringify(b.project ?? null);
        if (raw.length > 400000) return err('Projet trop volumineux');
        if (b.project !== null && (typeof b.project !== 'object' || !Array.isArray(b.project.appels) || !b.project.epargne || !Array.isArray(b.project.financements))) return err('Projet invalide');
        const s = getStore(); if (b.project === null) delete s.immo; else s.immo = b.project;
        return ok({ saved: true }), true;
      }

      // ---------- IA
      if (p === '/api/ai/settings' && m === 'GET') return json(res, 200, aiPublic()), true;
      if (p === '/api/ai/settings' && m === 'PUT') {
        const b = await readBody(req), a = ai();
        if (PROVIDERS[b.provider]) a.provider = b.provider;
        if (b.model !== undefined) a.model = str(b.model, 80).trim(); if (b.endpoint !== undefined) a.endpoint = str(b.endpoint, 200).trim();
        if (b.maxTokens) a.maxTokens = Math.min(8000, Math.max(300, Math.round(+b.maxTokens) || 2000));
        if (typeof b.apiKey === 'string') { const sec = readSecrets(); if (b.apiKey === '__clear__') delete sec.aiKey; else if (b.apiKey.trim()) sec.aiKey = b.apiKey.trim(); writeSecrets(sec); }
        saveStore(); return json(res, 200, aiPublic()), true;
      }
      if (p === '/api/ai/models' && m === 'GET') {
        const a = { ...ai(), provider: url.searchParams.get('provider') || ai().provider, endpoint: url.searchParams.get('endpoint') ?? ai().endpoint };
        try { return json(res, 200, { ok: true, ...(await listLocalModels(a)) }), true; }
        catch (e) { return json(res, 200, { ok: false, error: e.cause?.code === 'ECONNREFUSED' || e.message === 'fetch failed' ? 'Le service ne répond pas (est-il démarré ?)' : String(e.message || e) }), true; }
      }
      if (p === '/api/ai/ollama/pull' && m === 'POST') {
        const b = await readBody(req), model = str(b.model, 80).trim(); if (!model) return err('Nom de modèle manquant');
        const a = { ...ai(), endpoint: b.endpoint ?? ai().endpoint };
        return json(res, 200, await startPull(a, model)), true;
      }
      if (p === '/api/ai/ollama/pull' && m === 'GET') return json(res, 200, pullStatus(url.searchParams.get('model') || '') ?? { status: 'inconnu', done: false }), true;
      if (p === '/api/ai/test' && m === 'POST') {
        const a = ai(); const r = await callAI(a, readSecrets().aiKey, { system: 'Réponds par un seul mot.', user: 'Réponds exactement : OK' });
        return json(res, 200, { ok: true, model: r.model, answer: r.text.slice(0, 80) }), true;
      }
      if (p === '/api/ai/analyze' && m === 'POST') {
        const b = await readBody(req), a = ai(), system = str(b.system, 20000), user = str(b.user, 60000), title = str(b.title, 160) || 'Analyse IA';
        if (!user.trim()) return err('Prompt vide');
        const label = PROVIDERS[a.provider]?.label ?? a.provider;
        let r;
        try { r = await callAI(a, readSecrets().aiKey, { system, user }); }
        catch (e) { logPrompt({ source: 'ia', text: `${system}\n\n---\n\n${user}`, status: 'erreur', notes: `${title} · ${label} · ${e.message}` }); saveStore(); return err(e.message, 502); }
        logPrompt({ source: 'ia', text: `${system}\n\n---\n\n${user}`, status: 'envoyé', notes: `${title} · ${label} · modèle ${r.model}` });
        const s = getStore(); s.analyses ??= [];
        const entry = { id: Date.now(), date: new Date().toISOString(), title, kind: 'ia', provider: a.provider, model: r.model, meta: b.meta ?? {}, prompt: { system, user }, text: r.text };
        s.analyses.unshift(entry); s.analyses.splice(60);
        return ok({ analysis: entry }), true;
      }
      if (p === '/api/ai/save' && m === 'POST') {
        const b = await readBody(req), s = getStore(); s.analyses ??= [];
        const entry = { id: Date.now(), date: new Date().toISOString(), title: str(b.title, 160) || 'Analyse locale', kind: 'locale', provider: 'local', model: '', meta: b.meta ?? {}, text: str(b.text, 60000) };
        s.analyses.unshift(entry); s.analyses.splice(60); return ok({ analysis: entry });
      }
      if (p === '/api/ai/history' && m === 'GET') { ai(); return json(res, 200, { list: getStore().analyses }), true; }
      if (p === '/api/ai/history' && m === 'DELETE') {
        const s = getStore(); s.analyses = (s.analyses ?? []).filter(x => String(x.id) !== url.searchParams.get('id')); return ok({ list: s.analyses });
      }
    } catch (e) { return err(String(e.message || e)); }
    return false;
  };
}
