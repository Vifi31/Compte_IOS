// Administration de la base de données : état, contenu des tables (lecture seule), contrôle, optimisation, export.
//   GET  /api/db/status              moteur, fichier, taille, tables et nombre de lignes
//   GET  /api/db/volumes             volumes par table et par famille de fichiers, historique mensuel
//   GET  /api/db/table?name=&limit=&offset=   contenu d'une table (lecture seule)
//   POST /api/db/check               contrôle d'intégrité (PRAGMA integrity_check)
//   POST /api/db/vacuum              compactage du fichier
//   POST /api/db/resync              réécrit toutes les tables depuis les données en mémoire
//   GET  /api/db/export              export JSON complet des données
//   GET  /api/db/file                copie cohérente du fichier SQLite à télécharger
import fs from 'fs';
import path from 'path';
import os from 'os';
import { dbStatus, tableRows, integrity, vacuum, snapshot, saveStoreToDb, isTable, recordSnapshot } from './db.mjs';
import { collectVolumes } from './dbvolumes.mjs';

export function setupDbAdmin({ getDb, getStore, getError, mirrorFile, flush, dirs }) {
  return async function handle(req, res, url, { json }) {
    const p = url.pathname, m = req.method;
    if (!p.startsWith('/api/db/')) return false;
    const err = (msg, code = 400) => { json(res, code, { error: msg }); return true; };
    const db = getDb();
    try {
      if (p === '/api/db/export' && m === 'GET') {
        const body = JSON.stringify(getStore(), null, 1), d = new Date().toISOString().slice(0, 10);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Content-Disposition': `attachment; filename="comptes-donnees-${d}.json"` }); res.end(body); return true;
      }
      if (!db) return err(getError() || 'Base de données indisponible', 503);
      if (p === '/api/db/status' && m === 'GET') {
        const mf = fs.existsSync(mirrorFile) ? fs.statSync(mirrorFile) : null;
        return json(res, 200, { ...dbStatus(db), error: getError(), mirror: mf ? { file: mirrorFile, size: mf.size, at: mf.mtime.toISOString() } : null }), true;
      }
      if (p === '/api/db/volumes' && m === 'GET') { recordSnapshot(db); return json(res, 200, collectVolumes(db, dirs, db.file)), true; }
      if (p === '/api/db/table' && m === 'GET') {
        const name = url.searchParams.get('name') || ''; if (!isTable(name)) return err('Table inconnue', 404);
        return json(res, 200, tableRows(db, name, Number(url.searchParams.get('limit')) || 100, Number(url.searchParams.get('offset')) || 0)), true;
      }
      if (p === '/api/db/check' && m === 'POST') { const r = integrity(db); return json(res, 200, { ok: r.length === 1 && r[0] === 'ok', result: r, at: new Date().toISOString() }), true; }
      if (p === '/api/db/vacuum' && m === 'POST') return json(res, 200, vacuum(db)), true;
      if (p === '/api/db/resync' && m === 'POST') { const w = saveStoreToDb(db, getStore(), { force: true }); flush?.(); return json(res, 200, { written: w }), true; }
      if (p === '/api/db/file' && m === 'GET') {
        const tmp = path.join(os.tmpdir(), 'comptes-' + Date.now() + '.db'); snapshot(db, tmp);
        const d = new Date().toISOString().slice(0, 10);
        res.writeHead(200, { 'Content-Type': 'application/vnd.sqlite3', 'Content-Length': fs.statSync(tmp).size, 'Content-Disposition': `attachment; filename="comptes-${d}.db"` });
        fs.createReadStream(tmp).on('close', () => fs.rm(tmp, { force: true }, () => {})).pipe(res); return true;
      }
      return err('Route inconnue', 404);
    } catch (e) { return err(String(e.message || e), 500); }
  };
}
