// Base de données SQLite (module intégré à Node : node:sqlite, aucune dépendance) pour le stockage des informations.
// L'application garde son état en mémoire (objet « store ») ; ce module le persiste dans des tables SQL et le recharge.
//   - tables dédiées pour les entités : catégories, règles, corrections, journal des prompts, analyses, biens, actions du plan…
//   - colonne `data` (JSON) = enregistrement complet : aucun champ n'est perdu quand le modèle évolue
//   - seules les sections modifiées sont réécrites, dans une transaction
//   - import automatique de l'ancien fichier store.json au premier démarrage
// Le fichier data/store.json reste écrit en copie lisible (miroir) pour les sauvegardes et la restauration.
import fs from 'fs';

// node:sqlite émet un avertissement « expérimental » à l'import : il est inutile dans le journal du serveur
const emit0 = process.emit;
process.emit = function (name, data, ...rest) { return name === 'warning' && data?.name === 'ExperimentalWarning' && /SQLite/i.test(data.message ?? '') ? false : emit0.call(this, name, data, ...rest); };
const { DatabaseSync } = await import('node:sqlite');
process.emit = emit0;

export const SCHEMA_VERSION = 1;
const J = JSON.stringify, P = s => { try { return JSON.parse(s); } catch { return null; } };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS categories (pos INTEGER PRIMARY KEY, id TEXT, name TEXT, kind TEXT, icon TEXT, color TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rules (pos INTEGER PRIMARY KEY, id TEXT, pattern TEXT, category_id TEXT, sign TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS overrides (op_id TEXT PRIMARY KEY, category_id TEXT);
CREATE TABLE IF NOT EXISTS manual_accounts (pos INTEGER PRIMARY KEY, id TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS manual_ops (pos INTEGER PRIMARY KEY, id TEXT, date TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prompt_journal (pos INTEGER PRIMARY KEY, id INTEGER, date TEXT, source TEXT, status TEXT, version TEXT, text TEXT, notes TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses (pos INTEGER PRIMARY KEY, id INTEGER, date TEXT, title TEXT, kind TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS biens (pos INTEGER PRIMARY KEY, id TEXT, nom TEXT, type TEXT, statut TEXT, usage TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS db_history (day TEXT PRIMARY KEY, size INTEGER, rows INTEGER);
CREATE TABLE IF NOT EXISTS immo_project (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS immo_actions (pos INTEGER PRIMARY KEY, id TEXT, phase TEXT, label TEXT, date TEXT, statut TEXT, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_rules_cat ON rules(category_id);
CREATE INDEX IF NOT EXISTS ix_journal_date ON prompt_journal(date);
CREATE INDEX IF NOT EXISTS ix_biens_id ON biens(id);
CREATE INDEX IF NOT EXISTS ix_actions_id ON immo_actions(id);
CREATE INDEX IF NOT EXISTS ix_actions_phase ON immo_actions(phase);
`;

/** Ouvre (et crée au besoin) la base. */
export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');
  db.exec(SCHEMA);
  db.file = file;
  if (!getMeta(db, 'schema_version')) setMeta(db, 'schema_version', String(SCHEMA_VERSION));
  return db;
}
export const getMeta = (db, k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value ?? null;
export const setMeta = (db, k, v) => db.prepare('INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));
const tx = (db, fn) => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ } throw e; } };
function replaceRows(db, table, cols, rows) {
  db.exec(`DELETE FROM ${table}`);
  const st = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  for (const r of rows) st.run(...r);
}
const rowsOf = (db, sql, ...a) => db.prepare(sql).all(...a);
const HANDLED = new Set(['categories', 'rules', 'overrides', 'ruleSeq', 'manualSeq', 'manualAccounts', 'manualOps', 'prompts', 'analyses', 'biens', 'immo']);
const idOf = (r, i) => String(r?.id ?? i);

/** Sections du store : lecture, écriture et signature (détection des changements). */
const SECTIONS = [
  { name: 'categories', sig: s => J(s.categories),
    write: (db, s) => replaceRows(db, 'categories', ['id', 'pos', 'name', 'kind', 'icon', 'color', 'data'], (s.categories ?? []).map((c, i) => [idOf(c, i), i, c.name ?? null, c.kind ?? null, c.icon ?? null, c.color ?? null, J(c)])),
    read: (db, s) => { s.categories = rowsOf(db, 'SELECT data FROM categories ORDER BY pos').map(r => P(r.data)); } },
  { name: 'rules', sig: s => J(s.rules),
    write: (db, s) => replaceRows(db, 'rules', ['id', 'pos', 'pattern', 'category_id', 'sign', 'data'], (s.rules ?? []).map((r, i) => [idOf(r, i), i, r.pattern ?? null, r.categoryId ?? null, r.sign ?? null, J(r)])),
    read: (db, s) => { s.rules = rowsOf(db, 'SELECT data FROM rules ORDER BY pos').map(r => P(r.data)); } },
  { name: 'overrides', sig: s => J(s.overrides),
    write: (db, s) => replaceRows(db, 'overrides', ['op_id', 'category_id'], Object.entries(s.overrides ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : J(v)])),
    read: (db, s) => { s.overrides = Object.fromEntries(rowsOf(db, 'SELECT op_id, category_id FROM overrides').map(r => [r.op_id, r.category_id])); } },
  { name: 'manual', sig: s => J([s.manualAccounts, s.manualOps]),
    write: (db, s) => {
      replaceRows(db, 'manual_accounts', ['id', 'pos', 'data'], (s.manualAccounts ?? []).map((a, i) => [idOf(a, i), i, J(a)]));
      replaceRows(db, 'manual_ops', ['id', 'pos', 'date', 'data'], (s.manualOps ?? []).map((o, i) => [idOf(o, i), i, o.date ?? null, J(o)]));
    },
    read: (db, s) => { s.manualAccounts = rowsOf(db, 'SELECT data FROM manual_accounts ORDER BY pos').map(r => P(r.data)); s.manualOps = rowsOf(db, 'SELECT data FROM manual_ops ORDER BY pos').map(r => P(r.data)); } },
  { name: 'prompts', sig: s => J(s.prompts),
    write: (db, s) => {
      const { journal = [], ...rest } = s.prompts ?? {};
      replaceRows(db, 'prompt_journal', ['pos', 'id', 'date', 'source', 'status', 'version', 'text', 'notes', 'data'], journal.map((e, i) => [i, e.id ?? null, e.date ?? null, e.source ?? null, e.status ?? null, e.version ?? null, e.text ?? null, e.notes ?? null, J(e)]));
      db.prepare('INSERT INTO config(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run('@prompts', J(rest));
    },
    read: (db, s) => { const rest = P(db.prepare("SELECT data FROM config WHERE key = '@prompts'").get()?.data) ?? {}; const journal = rowsOf(db, 'SELECT data FROM prompt_journal ORDER BY pos').map(r => P(r.data)); if (journal.length || Object.keys(rest).length) s.prompts = { ...rest, journal }; } },
  { name: 'analyses', sig: s => J(s.analyses),
    write: (db, s) => replaceRows(db, 'analyses', ['id', 'pos', 'date', 'title', 'kind', 'data'], (s.analyses ?? []).map((a, i) => [a.id ?? i, i, a.date ?? null, a.title ?? null, a.kind ?? null, J(a)])),
    read: (db, s) => { const l = rowsOf(db, 'SELECT data FROM analyses ORDER BY pos').map(r => P(r.data)); if (l.length || s.analyses) s.analyses = l; } },
  { name: 'biens', sig: s => J(s.biens),
    write: (db, s) => {
      const { items = [], ...rest } = s.biens ?? {};
      replaceRows(db, 'biens', ['id', 'pos', 'nom', 'type', 'statut', 'usage', 'data'], items.map((b, i) => [idOf(b, i), i, b.nom ?? null, b.type ?? null, b.statut ?? null, b.usage ?? null, J(b)]));
      db.prepare('INSERT INTO config(key, data) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data').run('@biens', J(rest));
    },
    read: (db, s) => { const items = rowsOf(db, 'SELECT data FROM biens ORDER BY pos').map(r => P(r.data)), rest = P(db.prepare("SELECT data FROM config WHERE key = '@biens'").get()?.data) ?? {}; if (items.length || Object.keys(rest).length) s.biens = { ...rest, items }; } },
  { name: 'immo', sig: s => J(s.immo),
    write: (db, s) => {
      const { actions = [], ...rest } = s.immo ?? {};
      db.exec('DELETE FROM immo_project');
      if (s.immo) db.prepare('INSERT INTO immo_project(id, data) VALUES(1, ?)').run(J(rest));
      replaceRows(db, 'immo_actions', ['id', 'pos', 'phase', 'label', 'date', 'statut', 'data'], actions.map((a, i) => [idOf(a, i), i, a.phase ?? null, a.label ?? null, a.date ?? null, a.statut ?? null, J(a)]));
    },
    read: (db, s) => { const p = P(db.prepare('SELECT data FROM immo_project WHERE id = 1').get()?.data); if (p) s.immo = { ...p, actions: rowsOf(db, 'SELECT data FROM immo_actions ORDER BY pos').map(r => P(r.data)) }; } },
];
/** Autres clés du store (réglages, alias, prévisions, IA, licence, compteurs…) : table de configuration. */
const configSig = s => J(Object.fromEntries(Object.entries(s).filter(([k]) => !HANDLED.has(k) || k === 'ruleSeq' || k === 'manualSeq')));
function configWrite(db, s) {
  db.exec("DELETE FROM config WHERE key NOT LIKE '@%'");
  const st = db.prepare('INSERT INTO config(key, data) VALUES(?, ?)');
  for (const [k, v] of Object.entries(s)) if (!HANDLED.has(k) || k === 'ruleSeq' || k === 'manualSeq') st.run(k, J(v));
}
function configRead(db, s) { for (const r of rowsOf(db, "SELECT key, data FROM config WHERE key NOT LIKE '@%'")) s[r.key] = P(r.data); }

const lastSig = new WeakMap(); // base → { section → signature écrite }

/** Écrit dans la base les seules sections modifiées depuis la dernière écriture (une transaction). Retourne les sections réécrites. */
export function saveStoreToDb(db, store, { force = false } = {}) {
  const last = lastSig.get(db) ?? lastSig.set(db, new Map()).get(db), todo = [];
  for (const sec of [...SECTIONS, { name: 'config', sig: configSig, write: configWrite }]) { const sig = sec.sig(store); if (force || last.get(sec.name) !== sig) todo.push([sec, sig]); }
  if (!todo.length) return [];
  tx(db, () => { for (const [sec] of todo) sec.write(db, store); setMeta(db, 'updated_at', new Date().toISOString()); });
  for (const [sec, sig] of todo) last.set(sec.name, sig);
  return todo.map(([s]) => s.name);
}
/** Reconstitue le store depuis la base ; null si la base n'a jamais reçu de données. */
export function loadStoreFromDb(db) {
  if (getMeta(db, 'initialized') !== '1') return null;
  const s = {}; for (const sec of SECTIONS) sec.read(db, s); configRead(db, s);
  const last = lastSig.get(db) ?? lastSig.set(db, new Map()).get(db);
  for (const sec of [...SECTIONS, { name: 'config', sig: configSig }]) last.set(sec.name, sec.sig(s));
  return s;
}
/** Marque la base comme initialisée (après import ou première écriture). */
export const markInitialized = (db, origin) => { setMeta(db, 'initialized', '1'); if (!getMeta(db, 'created_at')) setMeta(db, 'created_at', new Date().toISOString()); if (origin) setMeta(db, 'origin', origin); };

// ---- administration
const TABLES = ['db_history', 'categories', 'rules', 'overrides', 'manual_accounts', 'manual_ops', 'prompt_journal', 'analyses', 'biens', 'immo_project', 'immo_actions', 'config', 'meta'];
export const isTable = n => TABLES.includes(n);
export function dbStatus(db) {
  const st = fs.existsSync(db.file) ? fs.statSync(db.file) : null, wal = fs.existsSync(db.file + '-wal') ? fs.statSync(db.file + '-wal').size : 0;
  return {
    engine: 'SQLite ' + (db.prepare('SELECT sqlite_version() v').get().v), driver: 'node:sqlite', file: db.file, size: (st?.size ?? 0) + wal,
    schema: +(getMeta(db, 'schema_version') ?? 0), created: getMeta(db, 'created_at'), updated: getMeta(db, 'updated_at'), origin: getMeta(db, 'origin'), migratedFrom: getMeta(db, 'migrated_from'),
    tables: TABLES.map(t => ({ name: t, rows: db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, columns: db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name) })),
  };
}
export function tableRows(db, name, limit = 100, offset = 0) {
  if (!isTable(name)) throw new Error('Table inconnue');
  const cols = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);
  const rows = db.prepare(`SELECT * FROM ${name} LIMIT ? OFFSET ?`).all(Math.min(500, Math.max(1, limit)), Math.max(0, offset));
  return { name, columns: cols, rows: rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v]))), total: db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n };
}
export const integrity = db => db.prepare('PRAGMA integrity_check').all().map(r => Object.values(r)[0]);
export function vacuum(db) { const before = dbStatus(db).size; db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'); return { before, after: dbStatus(db).size }; }
/** Copie cohérente de la base dans un fichier (VACUUM INTO) : sauvegarde ou téléchargement. */
export function snapshot(db, dest) { try { fs.rmSync(dest, { force: true }); } catch { /* absent */ } db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`); return dest; }

/** Mesure du jour : taille du fichier et nombre total de lignes (une ligne par jour, mise à jour si déjà présente). */
export function recordSnapshot(db) {
  const day = new Date().toISOString().slice(0, 10);
  let size = 0; for (const f of [db.file, db.file + '-wal']) { try { size += fs.statSync(f).size; } catch { /* absent */ } }
  const rows = ['categories', 'rules', 'overrides', 'manual_accounts', 'manual_ops', 'prompt_journal', 'analyses', 'biens', 'immo_project', 'immo_actions', 'config', 'meta'].reduce((s, t) => s + db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, 0);
  db.prepare('INSERT INTO db_history(day, size, rows) VALUES(?, ?, ?) ON CONFLICT(day) DO UPDATE SET size = excluded.size, rows = excluded.rows').run(day, size, rows);
}
