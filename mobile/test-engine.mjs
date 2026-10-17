// Essai du moteur mobile sous Node, sans navigateur : node mobile/test-engine.mjs [dossier d'essai] [relevé.pdf] [sauvegarde.zip]
// Simule le stockage IndexedDB (fichier JSON dans le dossier d'essai), exécute public/mobile/engine.js
// et appelle quelques routes. Lancer deux fois de suite vérifie que les données survivent au redémarrage.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'mobile', '.essai'));
const arg = ext => process.argv.slice(3).find(a => a.toLowerCase().endsWith(ext));
const PDF = arg('.pdf'), ZIP = arg('.zip');
fs.mkdirSync(DIR, { recursive: true });
const DUMP = path.join(DIR, 'indexeddb.json');

// ---------- IndexedDB minimal (une base, un magasin clé → valeur) ----------
const mem = new Map(fs.existsSync(DUMP) ? JSON.parse(fs.readFileSync(DUMP, 'utf8')).map(([k, v]) => [k, v.dir ? v : { ...v, data: Uint8Array.from(Buffer.from(v.data, 'base64')) }]) : []);
const save = () => fs.writeFileSync(DUMP, JSON.stringify([...mem].map(([k, v]) => [k, v.dir ? v : { ...v, data: Buffer.from(v.data).toString('base64') }])));
const done = (result) => { const r = { result }; setTimeout(() => r.onsuccess?.()); return r; };
const objectStore = { getAllKeys: () => done([...mem.keys()]), getAll: () => done([...mem.values()]), put: (v, k) => { mem.set(k, v); save(); return done(); }, delete: k => { mem.delete(k); save(); return done(); } };
globalThis.indexedDB = { open() { const r = { result: { createObjectStore() {}, transaction: () => ({ objectStore: () => objectStore }) } }; setTimeout(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }); return r; } };

// ---------- Environnement de page ----------
globalThis.location = new URL('http://localhost/');
const fetch0 = globalThis.fetch;
globalThis.fetch = (u, o) => String(u).startsWith('file:') ? Promise.resolve(new Response(fs.readFileSync(fileURLToPath(String(u))))) : fetch0(u, o);
let handle;
globalThis.apiUseLocal = h => { handle = h; };

await import(pathToFileURL(path.join(ROOT, 'public', 'mobile', 'engine.js')));
const call = async (method, url, body, type = 'application/json') => {
  const r = await handle(new Request(new URL(url, location), { method, headers: { 'Content-Type': type }, body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body }));
  const ct = r.headers.get('content-type') || '', j = ct.includes('json') ? await r.json() : { bytes: (await r.arrayBuffer()).byteLength, type: ct };
  return { status: r.status, j };
};
const show = (label, { status, j }, pick = x => x) => console.log(label.padEnd(26), status, JSON.stringify(pick(j)).slice(0, 160));

show('GET /api/ping', await call('GET', '/api/ping'));
let st = await call('GET', '/api/state');
show('GET /api/state', st, j => ({ version: j.version, comptes: j.accounts?.length, operations: j.operations?.length, categories: j.categories?.length, releves: j.statements?.length }));
if (PDF) {
  show('POST /api/upload', await call('POST', '/api/upload?name=' + encodeURIComponent(path.basename(PDF)), fs.readFileSync(PDF), 'application/pdf'));
  show('POST /api/reimport', await call('POST', '/api/reimport'), j => ({ operations: j.operations?.length, comptes: j.accounts?.length }));
  show('GET /api/statements/file', await call('GET', '/api/statements/file?name=' + encodeURIComponent(path.basename(PDF))));
}
if (ZIP) { // reprise des données du PC : import puis restauration d'une sauvegarde
  const imp = await call('POST', '/api/backups/import?name=' + encodeURIComponent(path.basename(ZIP)), fs.readFileSync(ZIP), 'application/zip');
  show('POST /api/backups/import', imp);
  show('POST /api/backups/restore', await call('POST', '/api/backups/restore', { name: imp.j.imported }));
  show('GET /api/state', await call('GET', '/api/state'), j => ({ comptes: j.accounts?.length, operations: j.operations?.length, categories: j.categories?.length, releves: j.statements?.length }));
  show('GET /api/biens', await call('GET', '/api/biens'), j => ({ biens: j.items?.length }));
}
show('POST /api/categories', await call('POST', '/api/categories', { name: 'Essai mobile ' + mem.size, icon: '📱', kind: 'expense', color: '#123456' }), j => ({ categories: j.categories?.length }));
show('GET /api/db/status', await call('GET', '/api/db/status'), j => ({ engine: j.engine, size: j.size, tables: j.tables?.length, error: j.error }));
show('POST /api/db/check', await call('POST', '/api/db/check'), j => ({ ok: j.ok }));
show('GET /api/biens', await call('GET', '/api/biens'), j => ({ biens: j.items?.length }));
show('GET /api/immo', await call('GET', '/api/immo'), j => Object.keys(j));
show('POST /api/backups', await call('POST', '/api/backups', { type: 'data' }), j => ({ name: j.backup?.name ?? j.name, error: j.error }));
show('GET /api/backups', await call('GET', '/api/backups'), j => ({ sauvegardes: j.list?.length }));
show('GET /api/versions', await call('GET', '/api/versions'), j => ({ current: j.current, error: j.error }));
show('GET /api/techinfo', await call('GET', '/api/techinfo'), j => ({ version: j.version, error: j.error }));
await new Promise(r => setTimeout(r, 800)); // écriture différée de la base
console.log('Stockage simulé :', mem.size, 'élément(s) dans', DUMP);
process.exit(0);
