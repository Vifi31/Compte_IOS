// SQLite de l'appli mobile : remplace node:sqlite (DatabaseSync) par sql.js (SQLite compilé en WebAssembly).
// Même API synchrone que sur PC pour lib/db.mjs. La base est tenue en mémoire et recopiée dans le fichier
// (système de fichiers du moteur local, donc IndexedDB) peu après chaque modification.
import initSqlJs from 'sql.js';
import fs from './fs.mjs';

let SQL = null;
/** Charge le moteur WebAssembly (une fois, avant l'ouverture de la base). */
export async function initSqlite(wasmUrl) { SQL ??= await initSqlJs({ wasmBinary: await (await fetch(wasmUrl)).arrayBuffer() }); }

const READ = /^\s*(SELECT|PRAGMA\s+(table_info|integrity_check))\b/i;

export class DatabaseSync {
  #db; #file; #timer = null;
  constructor(file) {
    if (!SQL) throw new Error('Moteur SQLite non initialisé');
    this.#file = file;
    this.#db = fs.existsSync(file) ? new SQL.Database(new Uint8Array(fs.readFileSync(file))) : new SQL.Database();
  }
  #changed() { clearTimeout(this.#timer); this.#timer = setTimeout(() => this.save(), 400); }
  /** Écrit l'image de la base dans son fichier. */
  save() { clearTimeout(this.#timer); this.#timer = null; fs.writeFileSync(this.#file, this.#db.export()); }
  exec(sql) {
    const into = /^\s*VACUUM\s+INTO\s+'((?:[^']|'')*)'\s*;?\s*$/i.exec(sql);
    if (into) { fs.writeFileSync(into[1].replace(/''/g, "'"), this.#db.export()); return; }
    this.#db.exec(sql);
    if (/\bVACUUM\b/i.test(sql)) this.save(); else if (!READ.test(sql)) this.#changed();
  }
  // Les requêtes sont préparées à chaque appel : export() de sql.js libère les requêtes préparées.
  prepare(sql) {
    const db = this.#db, self = this, write = !READ.test(sql);
    const exec = (params, fn) => {
      const st = db.prepare(sql);
      try { if (params.length) st.bind(params.length === 1 && params[0] && typeof params[0] === 'object' && !ArrayBuffer.isView(params[0]) ? params[0] : params.map(v => v === undefined ? null : v)); return fn(st); } finally { st.free(); }
    };
    return {
      run: (...p) => { exec(p, st => { while (st.step()); }); if (write) self.#changed(); return { changes: db.getRowsModified(), lastInsertRowid: db.exec('SELECT last_insert_rowid() id')[0]?.values[0][0] ?? 0 }; },
      get: (...p) => exec(p, st => (st.step() ? st.getAsObject() : undefined)),
      all: (...p) => exec(p, st => { const out = []; while (st.step()) out.push(st.getAsObject()); return out; }),
    };
  }
  close() { if (this.#timer) this.save(); this.#db.close(); }
}
export default { DatabaseSync };
