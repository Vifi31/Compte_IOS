// Serveur local : API JSON + fichiers statiques. Aucune dépendance autre que pdfjs-dist / chart.js.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseAll, parseStatement, RELEVES_DIR } from './scripts/parse.mjs';
import { enrich, categorize, DEFAULT_CATEGORIES, DEFAULT_RULES } from './lib/enrich.mjs';
import { setupExtra } from './lib/extra.mjs';
import { manualData, setupManual } from './lib/manual.mjs';
import { setupFeatures, licenseBrief } from './lib/features.mjs';
import { collectTechInfo } from './lib/techinfo.mjs';

import { ROOT, DATA_DIR, PORT as CFG_PORT, HOME, INSTALLED } from './lib/paths.mjs';
const PUBLIC = path.join(ROOT, 'public');
const DATA = DATA_DIR;
const STORE_FILE = path.join(DATA, 'store.json');
const PORT = CFG_PORT;
fs.mkdirSync(DATA, { recursive: true });

// ---------- Persistance (catégories, règles, corrections manuelles) ----------
let store;
function loadStore() {
  try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch { store = null; }
  if (!store) store = { categories: DEFAULT_CATEGORIES, rules: DEFAULT_RULES, overrides: {}, accountAliases: {}, ruleSeq: 1000 };
  store.overrides ??= {}; store.accountAliases ??= {}; store.ruleSeq ??= 1000; store.forecasts ??= {};
  saveStore();
}
function saveStore() { fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 1)); }
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
  root: ROOT, getStore: () => store, saveStore, reloadStore: loadStore, reimport: () => importStatements(),
  getStats: () => ({
    operations: bank?.raw.length ?? 0, categories: store.categories.length, rules: store.rules.length,
    corrections: Object.keys(store.overrides).length, forecasts: Object.keys(store.forecasts).length,
  }),
});

const features = setupFeatures({ root: ROOT, getStore: () => store, saveStore });
const manual = setupManual({ getStore: () => store, saveStore, state: () => buildState() });

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  if (await extra(req, res, url, { json, readBody })) return;
  if (await manual(req, res, url, { json, readBody })) return;
  if (await features(req, res, url, { json, readBody })) return;
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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = url.pathname === '/vendor/chart.js'
      ? path.join(ROOT, 'node_modules/chart.js/dist/chart.umd.js')
      : path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) && !file.includes('chart.umd.js')) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); json(res, 500, { error: String(e.message || e) }); }
});

console.log('Import des relevés…');
await importStatements();
server.listen(PORT, '127.0.0.1', () => console.log(`Comptes → http://localhost:${PORT}  (${bank.raw.length} opérations)`));
