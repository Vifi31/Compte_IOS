// Cœur de l'application : état (base SQLite + store), import des relevés, routes /api/*.
// Indépendant du transport : server.mjs le sert en HTTP sur PC ; l'appli mobile l'exécute dans la WebView
// (moteur local, mobile/engine.mjs) avec les mêmes routes, sans serveur.
import fs from 'fs';
import path from 'path';
import { parseAll, parseStatement, RELEVES_DIR } from '../scripts/parse.mjs';
import { enrich, categorize, DEFAULT_CATEGORIES, DEFAULT_RULES } from './enrich.mjs';
import { setupExtra } from './extra.mjs';
import { manualData, setupManual } from './manual.mjs';
import { setupBiens } from './biens.mjs';
import { openDb, saveStoreToDb, loadStoreFromDb, markInitialized, setMeta, recordSnapshot } from './db.mjs';
import { setupDbAdmin } from './dbadmin.mjs';
import { setupImmoFiles } from './immofiles.mjs';
import { setupFeatures, licenseBrief } from './features.mjs';
import { collectTechInfo } from './techinfo.mjs';

import { ROOT, DATA_DIR, HOME, INSTALLED, BIENS_DIR, IMMO_DIR, REPORTS_DIR, BACKUP_DIR, VERSIONS_DIR } from './paths.mjs';
const DATA = DATA_DIR;
const STORE_FILE = path.join(DATA, 'store.json');
fs.mkdirSync(DATA, { recursive: true });

// ---------- Persistance : base SQLite (data/comptes.db) ----------
// Les données vivent en mémoire (objet store) et sont écrites dans la base à chaque modification (seules les sections changées).
// data/store.json est conservé comme copie lisible (miroir, écrite peu après chaque modification) : elle alimente les sauvegardes.
// Si la base est inaccessible, l'application retombe sur store.json écrit aussitôt : aucune donnée n'est perdue.
const DB_FILE = path.join(DATA, 'comptes.db');
let db = null, dbError = null;
try { db = openDb(DB_FILE); } catch (e) { dbError = String(e.message || e); console.error('Base SQLite indisponible, repli sur store.json :', dbError); }
let store, mirrorTimer = null;
function writeMirror() { clearTimeout(mirrorTimer); mirrorTimer = null; try { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 1)); } catch (e) { console.error('Écriture de store.json impossible :', e.message); } }
function loadStore({ fromJson = false } = {}) {
  let loaded = null, origin = null;
  if (db && !dbError && !fromJson) { try { loaded = loadStoreFromDb(db); } catch (e) { dbError = String(e.message || e); console.error('Lecture de la base impossible, repli sur store.json :', dbError); } }
  if (!loaded) { try { loaded = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); origin = fromJson ? 'restauration' : 'store.json'; } catch { loaded = null; } }
  store = loaded;
  if (!store) { store = { categories: DEFAULT_CATEGORIES, rules: DEFAULT_RULES, overrides: {}, accountAliases: {}, ruleSeq: 1000 }; origin = 'initial'; }
  store.overrides ??= {}; store.accountAliases ??= {}; store.ruleSeq ??= 1000; store.forecasts ??= {};
  if (origin && db && !dbError) { // première utilisation de la base, ou restauration : import complet
    try {
      if (origin === 'store.json') { const bak = STORE_FILE + '.avant-base'; if (!fs.existsSync(bak)) fs.copyFileSync(STORE_FILE, bak); setMeta(db, 'migrated_from', 'store.json · ' + new Date().toISOString()); }
      saveStoreToDb(db, store, { force: true }); markInitialized(db, origin);
    } catch (e) { dbError = String(e.message || e); console.error('Import dans la base impossible :', dbError); }
  }
  saveStore();
}
function saveStore() {
  if (db && !dbError) {
    try { saveStoreToDb(db, store); } catch (e) { dbError = String(e.message || e); console.error('Écriture dans la base impossible, repli sur store.json :', dbError); }
  }
  if (!db || dbError) { writeMirror(); return; }
  clearTimeout(mirrorTimer); mirrorTimer = setTimeout(writeMirror, 1500);
}
process.on('exit', () => { if (mirrorTimer) writeMirror(); });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (mirrorTimer) writeMirror(); process.exit(0); });
loadStore();

// ---------- Données bancaires ----------
const sum_ = a => a.reduce((x, y) => x + y, 0);
let bank = null; // { accounts, operations, statements }
async function importStatements() {
  const all = await parseAll();
  const seen = new Set();
  const results = all.filter(r => {
    const k = r.statementDate ? JSON.stringify(r.statementDate) + Object.keys(r.accounts).sort().join() : null;
    if (k && seen.has(k)) { r.duplicate = true; return false; }
    if (k) seen.add(k); return true;
  });
  const accs = new Map();
  for (const r of results) {
    for (const a of Object.values(r.accounts)) {
      const prev = accs.get(a.number) ?? { number: a.number, type: a.type, name: a.name, iban: a.iban, opening: undefined, closing: undefined, closingDate: undefined };
      if (a.iban) prev.iban = a.iban;
      if (prev.opening === undefined && a.opening !== undefined) prev.opening = a.opening;
      if (a.closing !== undefined) { prev.closing = a.closing; prev.closingDate = a.closingDate; }
      accs.set(a.number, prev);
    }
  }
  const numbers = [...accs.keys()];
  const holders = [...new Set(results.map(r => r.holder).filter(Boolean))];
  const raw = results.flatMap(r => r.ops).map(o => enrich(o, numbers, holders));
  raw.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  bank = {
    accounts: [...accs.values()],
    raw, holders,
    statements: all.map(r => {
      const d = r.statementDate, dates = r.ops.map(o => o.date).sort();
      let size = 0; try { size = fs.statSync(path.join(RELEVES_DIR, r.file)).size; } catch {}
      return {
        file: r.file, ops: r.ops.length, ok: !r.error && r.checks.every(c => c.ok), duplicate: !!r.duplicate, error: r.error, size,
        date: d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null,
        accounts: Object.keys(r.accounts).length, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
        debit: Math.round(sum_(r.ops.filter(o => o.amount < 0).map(o => o.amount)) * 100) / 100, credit: Math.round(sum_(r.ops.filter(o => o.amount > 0).map(o => o.amount)) * 100) / 100,
      };
    }),
    importedAt: new Date().toISOString(),
  };
}

function currentVersion() { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return ''; } }

function buildState() {
  const validIds = new Set(store.categories.map(c => c.id));
  const man = manualData(store), numbers = [...bank.accounts.map(a => a.number), ...man.accounts.map(a => a.number)];
  const manOps = man.ops.map(o => enrich(o, numbers, bank.holders));
  const operations = [...bank.raw, ...manOps].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map(o => ({ ...o, ...categorize(o, store.rules, store.overrides, validIds) }));
  // soldes courants par compte (ouverture du premier relevé + opérations)
  const accounts = [...bank.accounts, ...man.accounts].map(a => {
    const ops = operations.filter(o => o.account === a.number);
    const total = ops.reduce((s, o) => s + o.amount, 0);
    return { ...a, alias: store.accountAliases[a.number] ?? '', balance: a.closing ?? ((a.opening ?? 0) + total) };
  });
  return { version: currentVersion(), license: licenseBrief(store), accounts, operations, categories: store.categories, rules: store.rules, forecasts: store.forecasts, menu: store.settings?.menu ?? null, statements: bank.statements, importedAt: bank.importedAt };
}

// ---------- Routes ----------
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const readBody = req => new Promise((resolve, reject) => {
  let s = ''; req.on('data', c => { s += c; if (s.length > 5e6) req.destroy(); });
  req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
});
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
const cleanCat = (c, id) => ({
  id, name: String(c.name || 'Sans nom').slice(0, 40), icon: String(c.icon || '📦').slice(0, 8),
  color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#9ca3af',
  kind: ['expense', 'income', 'transfer'].includes(c.kind) ? c.kind : 'expense',
  budget: c.budget > 0 ? Math.round(Number(c.budget) * 100) / 100 : undefined,
});

const extra = setupExtra({
  root: ROOT, getStore: () => store, saveStore, reloadStore: loadStore, flushStore: writeMirror, reimport: () => importStatements(),
  getStats: () => ({
    operations: bank?.raw.length ?? 0, categories: store.categories.length, rules: store.rules.length,
    corrections: Object.keys(store.overrides).length, forecasts: Object.keys(store.forecasts).length,
  }),
});

const features = setupFeatures({ root: ROOT, getStore: () => store, saveStore });
const immoFiles = setupImmoFiles();
const dbAdmin = setupDbAdmin({ getDb: () => db, getStore: () => store, getError: () => dbError, mirrorFile: STORE_FILE, flush: writeMirror, dirs: { releves: RELEVES_DIR, biens: BIENS_DIR, immo: IMMO_DIR, rapports: REPORTS_DIR, sauvegardes: BACKUP_DIR, versions: VERSIONS_DIR } });
if (db && !dbError) { const snap = () => { try { recordSnapshot(db); } catch { /* mesure facultative */ } }; snap(); setInterval(snap, 6 * 3600 * 1000).unref?.(); } // mesure de taille : au démarrage puis toutes les 6 h
const biens = setupBiens({ getStore: () => store, saveStore, askAI: features.askAI });
const manual = setupManual({ getStore: () => store, saveStore, state: () => buildState() });

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (await extra(req, res, url, { json, readBody })) return;
  if (await manual(req, res, url, { json, readBody })) return;
  if (await features(req, res, url, { json, readBody })) return;
  if (await immoFiles(req, res, url, { json })) return;
  if (await dbAdmin(req, res, url, { json })) return;
  if (await biens(req, res, url, { json, readBody })) return;
  if (p === '/api/ping' && m === 'GET') return json(res, 200, { ok: true, app: 'Comptes', version: currentVersion(), installed: INSTALLED, home: HOME });
  if (p === '/api/shutdown' && m === 'POST') { json(res, 200, { ok: true }); setTimeout(() => process.exit(0), 200); return; }
  if (p === '/api/state' && m === 'GET') return json(res, 200, buildState());
  if (p === '/api/techinfo' && m === 'GET') return json(res, 200, collectTechInfo(ROOT, { store }));
  if (p === '/api/menu' && m === 'PUT') {
    const b = await readBody(req), strs = (x, n) => (Array.isArray(x) ? x : []).filter(y => typeof y === 'string' && y.length < 40).slice(0, n);
    store.settings ??= {};
    const obj = x => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const strMap = (x, n, vmax) => Object.fromEntries(Object.entries(obj(x)).filter(([k, v]) => typeof v === 'string' && k.length < 40).slice(0, n).map(([k, v]) => [k, v.slice(0, vmax)]));
    store.settings.menu = {
      hidden: strs(b.hidden, 80), groupOrder: strs(b.groupOrder, 30),
      order: Object.fromEntries(Object.entries(obj(b.order)).slice(0, 30).map(([k, v]) => [String(k).slice(0, 30), strs(v, 40)])),
      labels: strMap(b.labels, 80, 40), icons: strMap(b.icons, 80, 8), moves: strMap(b.moves, 60, 30),
      customGroups: (Array.isArray(b.customGroups) ? b.customGroups : []).filter(g => g && /^[\w-]{1,30}$/.test(g.id) && typeof g.label === 'string').slice(0, 12).map(g => ({ id: g.id, label: g.label.slice(0, 40), icon: String(g.icon || '📁').slice(0, 8) })),
    };
    saveStore(); return json(res, 200, buildState());
  }
  if (p === '/api/upload' && m === 'POST') {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 30e6) return json(res, 413, { error: 'Fichier trop volumineux (30 Mo max)' }); chunks.push(c); }
    const buf = Buffer.concat(chunks);
    if (buf.subarray(0, 5).toString() !== '%PDF-') return json(res, 400, { error: 'Ce fichier n’est pas un PDF' });
    let name = path.basename(String(url.searchParams.get('name') || 'releve.pdf')).replace(/[^\w.\- ()]/g, '_');
    if (!/\.pdf$/i.test(name)) name += '.pdf';
    fs.mkdirSync(RELEVES_DIR, { recursive: true });
    const existing = path.join(RELEVES_DIR, name);
    if (fs.existsSync(existing) && fs.readFileSync(existing).equals(buf)) return json(res, 200, { status: 'deja-present', name });
    const tmp = path.join(DATA, 'upload-' + Date.now() + '.pdf');
    fs.writeFileSync(tmp, buf);
    try {
      const r = await parseStatement(tmp);
      if (!Object.keys(r.accounts).length || !r.ops.length && !r.statementDate) throw new Error('relevé non reconnu');
      const key = JSON.stringify(r.statementDate) + Object.keys(r.accounts).sort().join();
      const dup = (await parseAll()).find(x => x.statementDate && JSON.stringify(x.statementDate) + Object.keys(x.accounts).sort().join() === key);
      if (dup) { fs.unlinkSync(tmp); return json(res, 409, { error: 'Ce relevé existe déjà (' + dup.file + ')' }); }
      const bad = r.checks.filter(c => !c.ok).length;
      let final = name, i = 2;
      while (fs.existsSync(path.join(RELEVES_DIR, final))) final = name.replace(/(\.pdf)$/i, '_' + i++ + '$1');
      fs.renameSync(tmp, path.join(RELEVES_DIR, final));
      return json(res, 200, { status: 'ajoute', name: final, ops: r.ops.length, warning: bad ? 'Contrôle des totaux en échec' : undefined });
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      return json(res, 422, { error: 'Relevé La Banque Postale non reconnu : ' + (e.message || e) });
    }
  }
  if (p === '/api/forecast' && m === 'PUT') {
    const b = await readBody(req);
    if (!/^\d{4}\|[\w-]+$/.test(b.key || '')) return json(res, 400, { error: 'Clé invalide' });
    if (b.data === null) delete store.forecasts[b.key]; else store.forecasts[b.key] = b.data;
    saveStore(); return json(res, 200, buildState());
  }
  if (p === '/api/budgets' && m === 'POST') {
    const b = await readBody(req);
    for (const [id, v] of Object.entries(b.budgets || {})) { const c = store.categories.find(c => c.id === id && c.kind === 'expense'); if (c) { if (v > 0) c.budget = Math.round(v); else delete c.budget; } }
    saveStore(); return json(res, 200, buildState());
  }
  if (p === '/api/statements/file' && m === 'GET') {
    const n = path.basename(String(url.searchParams.get('name') || ''));
    const f = path.join(RELEVES_DIR, n);
    if (!n.toLowerCase().endsWith('.pdf') || !fs.existsSync(f)) return json(res, 404, { error: 'Introuvable' });
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': fs.statSync(f).size, 'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${n}"` });
    return fs.createReadStream(f).pipe(res);
  }
  if (p === '/api/statements' && m === 'DELETE') {
    const n = path.basename(String(url.searchParams.get('name') || '')), f = path.join(RELEVES_DIR, n);
    if (!n.toLowerCase().endsWith('.pdf') || !fs.existsSync(f)) return json(res, 404, { error: 'Introuvable' });
    fs.unlinkSync(f); await importStatements(); return json(res, 200, buildState());
  }
  if (p === '/api/reimport' && m === 'POST') { await importStatements(); return json(res, 200, buildState()); }

  if (p === '/api/categories' && m === 'POST') {
    const b = await readBody(req);
    let id = slug(b.name || 'cat'); while (store.categories.some(c => c.id === id)) id += '-2';
    store.categories.push(cleanCat(b, id)); saveStore(); return json(res, 200, buildState());
  }
  let mm;
  if ((mm = p.match(/^\/api\/categories\/([^/]+)$/))) {
    const id = decodeURIComponent(mm[1]);
    const i = store.categories.findIndex(c => c.id === id);
    if (i < 0) return json(res, 404, { error: 'Catégorie inconnue' });
    if (m === 'PUT') { store.categories[i] = cleanCat({ ...store.categories[i], ...(await readBody(req)) }, id); saveStore(); return json(res, 200, buildState()); }
    if (m === 'DELETE') {
      const fallback = url.searchParams.get('reassign');
      const cat = store.categories[i];
      if (['autres', 'revenus-divers', 'virement-interne'].includes(id)) return json(res, 400, { error: 'Catégorie système non supprimable' });
      store.categories.splice(i, 1);
      store.rules = store.rules.filter(r => r.categoryId !== id);
      for (const [k, v] of Object.entries(store.overrides)) if (v === id) { if (fallback && fallback !== id) store.overrides[k] = fallback; else delete store.overrides[k]; }
      void cat; saveStore(); return json(res, 200, buildState());
    }
  }
  if (p === '/api/rules' && m === 'POST') {
    const b = await readBody(req);
    if (!b.pattern?.trim() || !store.categories.some(c => c.id === b.categoryId)) return json(res, 400, { error: 'Règle invalide' });
    store.rules.unshift({ id: 'u' + (++store.ruleSeq), pattern: b.pattern.trim(), categoryId: b.categoryId, sign: ['debit', 'credit'].includes(b.sign) ? b.sign : 'any' });
    saveStore(); return json(res, 200, buildState());
  }
  if ((mm = p.match(/^\/api\/rules\/([^/]+)$/))) {
    const i = store.rules.findIndex(r => r.id === mm[1]);
    if (i < 0) return json(res, 404, { error: 'Règle inconnue' });
    if (m === 'DELETE') { store.rules.splice(i, 1); saveStore(); return json(res, 200, buildState()); }
    if (m === 'PUT') {
      const b = await readBody(req); const r = store.rules[i];
      if (b.pattern?.trim()) r.pattern = b.pattern.trim();
      if (store.categories.some(c => c.id === b.categoryId)) r.categoryId = b.categoryId;
      if (['any', 'debit', 'credit'].includes(b.sign)) r.sign = b.sign;
      saveStore(); return json(res, 200, buildState());
    }
  }
  if (p === '/api/operations/category' && m === 'POST') {
    const b = await readBody(req);
    for (const id of b.ids ?? []) { if (b.categoryId) store.overrides[id] = b.categoryId; else delete store.overrides[id]; }
    saveStore(); return json(res, 200, buildState());
  }
  if ((mm = p.match(/^\/api\/accounts\/([^/]+)$/)) && m === 'PUT') {
    const b = await readBody(req); store.accountAliases[mm[1]] = String(b.alias || '').slice(0, 40);
    saveStore(); return json(res, 200, buildState());
  }
  json(res, 404, { error: 'Not found' });
}

export { api, json, importStatements, writeMirror };
export const operationsCount = () => bank?.raw.length ?? 0;
