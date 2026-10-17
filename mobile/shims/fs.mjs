// Système de fichiers de l'appli mobile : remplace le module fs de Node pour le code de lib/.
// Les fichiers vivent en mémoire (API synchrone, comme fs.readFileSync…) et chaque écriture est recopiée
// dans IndexedDB, stockage privé et persistant de la WebView : rien ne quitte le téléphone.
import { Buffer } from 'buffer';

const files = new Map(); // chemin → { data: Uint8Array, mtime: number }
const dirs = new Set(['/']);
const norm = p => { const s = String(p).replace(/\\/g, '/').replace(/\/+/g, '/'); return s.length > 1 ? s.replace(/\/$/, '') : s; };
const parent = p => p.slice(0, p.lastIndexOf('/')) || '/';
const err = (code, op, p) => Object.assign(new Error(`${code}: ${op} '${p}'`), { code, path: p });
const addDirs = p => { for (let d = parent(p); !dirs.has(d); d = parent(d)) dirs.add(d); };
const toBytes = (data, enc) => data instanceof Uint8Array ? new Uint8Array(data) : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)) : data instanceof ArrayBuffer ? new Uint8Array(data.slice(0)) : new Uint8Array(Buffer.from(String(data), enc || 'utf8'));

// ---------- Persistance IndexedDB ----------
let idb = null, queue = Promise.resolve();
const DB_NAME = 'comptes-fichiers', STORE = 'fichiers';
const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
function persist(op, p, v) {
  if (!idb) return;
  queue = queue.then(() => { const t = idb.transaction(STORE, 'readwrite').objectStore(STORE); return req(op === 'put' ? t.put(v, p) : t.delete(p)); }).catch(e => console.error('Écriture du stockage local impossible :', p, e));
}
/** Charge tous les fichiers enregistrés sur le téléphone (au démarrage du moteur local). */
export async function mount() {
  const open = indexedDB.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  idb = await req(open);
  const t = idb.transaction(STORE).objectStore(STORE), [keys, vals] = await Promise.all([req(t.getAllKeys()), req(t.getAll())]);
  keys.forEach((k, i) => { if (vals[i]?.dir) dirs.add(k); else { files.set(k, vals[i]); addDirs(k); } });
  return keys.length;
}
/** Attend la fin des écritures en cours (avant une restauration, une fermeture…). */
export const flush = () => queue;
/** Dépose un fichier sans le persister (fichiers du programme : package.json…). */
export function seed(p, data) { p = norm(p); files.set(p, { data: toBytes(data), mtime: Date.now() }); addDirs(p); }

// ---------- API de type fs ----------
function stat(p) {
  const f = files.get(p), isDir = !f && dirs.has(p);
  if (!f && !isDir) return null;
  const t = new Date(f?.mtime ?? 0);
  return { size: f ? f.data.length : 0, mtime: t, mtimeMs: +t, ctime: t, birthtime: t, birthtimeMs: +t, isDirectory: () => isDir, isFile: () => !isDir };
}
const fs = {
  existsSync: p => files.has(norm(p)) || dirs.has(norm(p)),
  statSync(p, o) { const s = stat(norm(p)); if (!s && o?.throwIfNoEntry === false) return undefined; if (!s) throw err('ENOENT', 'stat', p); return s; },
  readFileSync(p, o) {
    const f = files.get(norm(p)); if (!f) throw err(dirs.has(norm(p)) ? 'EISDIR' : 'ENOENT', 'open', p);
    const enc = typeof o === 'string' ? o : o?.encoding, b = Buffer.from(f.data);
    return enc ? b.toString(enc) : b;
  },
  writeFileSync(p, data, o) {
    p = norm(p); if (!dirs.has(parent(p))) throw err('ENOENT', 'open', p);
    const v = { data: toBytes(data, typeof o === 'string' ? o : o?.encoding), mtime: Date.now() };
    files.set(p, v); persist('put', p, v);
  },
  appendFileSync(p, data) { const old = files.get(norm(p))?.data ?? new Uint8Array(), add = toBytes(data), all = new Uint8Array(old.length + add.length); all.set(old); all.set(add, old.length); fs.writeFileSync(p, all); },
  mkdirSync(p, o) {
    p = norm(p); if (dirs.has(p)) return;
    if (!o?.recursive && !dirs.has(parent(p))) throw err('ENOENT', 'mkdir', p);
    const chain = []; for (let d = p; !dirs.has(d); d = parent(d)) chain.push(d);
    for (const d of chain.reverse()) { dirs.add(d); persist('put', d, { dir: true }); }
  },
  readdirSync(p, o) {
    p = norm(p); if (!dirs.has(p)) throw err('ENOENT', 'scandir', p);
    const pre = p === '/' ? '/' : p + '/', names = new Map();
    for (const k of files.keys()) if (k.startsWith(pre) && !k.slice(pre.length).includes('/')) names.set(k.slice(pre.length), false);
    for (const k of dirs) if (k.startsWith(pre) && k !== p && !k.slice(pre.length).includes('/')) names.set(k.slice(pre.length), true);
    const list = [...names.keys()].sort();
    return o?.withFileTypes ? list.map(name => ({ name, isDirectory: () => names.get(name), isFile: () => !names.get(name) })) : list;
  },
  unlinkSync(p) { p = norm(p); if (!files.has(p)) throw err('ENOENT', 'unlink', p); files.delete(p); persist('delete', p); },
  rmSync(p, o) {
    p = norm(p);
    if (files.has(p)) return fs.unlinkSync(p);
    if (!dirs.has(p)) { if (o?.force) return; throw err('ENOENT', 'rm', p); }
    if (!o?.recursive) throw err('EISDIR', 'rm', p);
    const pre = p + '/';
    for (const k of [...files.keys()]) if (k.startsWith(pre)) { files.delete(k); persist('delete', k); }
    for (const k of [...dirs]) if (k === p || k.startsWith(pre)) { dirs.delete(k); persist('delete', k); }
  },
  renameSync(a, b) { a = norm(a); b = norm(b); const f = files.get(a); if (!f) throw err('ENOENT', 'rename', a); fs.writeFileSync(b, f.data); fs.unlinkSync(a); },
  copyFileSync(a, b) { const f = files.get(norm(a)); if (!f) throw err('ENOENT', 'copyfile', a); fs.writeFileSync(b, f.data); },
  rm(p, o, cb) { if (typeof o === 'function') { cb = o; o = {}; } try { fs.rmSync(p, o); cb?.(null); } catch (e) { cb?.(e); } },
  // flux de lecture : seul l'usage « fs.createReadStream(f).pipe(res) » existe dans lib/
  createReadStream: p => ({ pipe: res => { res.end(fs.readFileSync(p)); return res; } }),
};
fs.promises = {
  readFile: async (...a) => fs.readFileSync(...a), writeFile: async (...a) => fs.writeFileSync(...a), readdir: async (...a) => fs.readdirSync(...a),
  stat: async p => fs.statSync(p), unlink: async p => fs.unlinkSync(p), rm: async (p, o) => fs.rmSync(p, o), mkdir: async (p, o) => fs.mkdirSync(p, o),
};
export default fs;
export const { existsSync, statSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, rmSync, renameSync, copyFileSync, createReadStream } = fs;
