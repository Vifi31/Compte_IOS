// Volumes de stockage : par table de la base, par famille de fichiers, et leur historique mensuel (reconstitué à partir des dates
// des enregistrements et des fichiers) pour estimer l'évolution des mois à venir.
import fs from 'fs';
import path from 'path';

const ym = d => String(d ?? '').slice(0, 7);
const validMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** Parcourt un dossier et cumule la taille des fichiers par mois de dernière modification. */
function scanDir(dir, filter = () => true) {
  const byMonth = {}; let total = 0, count = 0;
  const walk = d => {
    let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!filter(f)) continue;
      try { const st = fs.statSync(f), m = st.mtime.toISOString().slice(0, 7); byMonth[m] = (byMonth[m] ?? 0) + st.size; total += st.size; count++; } catch { /* fichier disparu */ }
    }
  };
  walk(dir); return { byMonth, total, count };
}

/**
 * dirs = { releves, biens, immo, rapports, sauvegardes, versions } ; dbFile = chemin de la base.
 * Retourne { families: [{ key, label, bytes, count, monthly }], tables: [{ name, rows, bytes }], snapshots }.
 */
export function collectVolumes(db, dirs, dbFile) {
  const q = (sql, ...a) => db.prepare(sql).all(...a);
  const tables = [
    ['categories', 'SUM(LENGTH(data))'], ['rules', 'SUM(LENGTH(data))'], ['overrides', 'SUM(LENGTH(op_id) + LENGTH(IFNULL(category_id, \'\')))'], ['manual_accounts', 'SUM(LENGTH(data))'], ['manual_ops', 'SUM(LENGTH(data))'],
    ['prompt_journal', 'SUM(LENGTH(data))'], ['analyses', 'SUM(LENGTH(data))'], ['biens', 'SUM(LENGTH(data))'], ['immo_project', 'SUM(LENGTH(data))'], ['immo_actions', 'SUM(LENGTH(data))'], ['config', 'SUM(LENGTH(data))'], ['meta', 'SUM(LENGTH(key) + LENGTH(IFNULL(value, \'\')))'],
  ].map(([name, expr]) => { const r = db.prepare(`SELECT COUNT(*) n, IFNULL(${expr}, 0) b FROM ${name}`).get(); return { name, rows: r.n, bytes: r.b }; });

  // historique de la base : les tables datées donnent des mois de croissance réels ; le reste est considéré présent dès le premier mois
  const dated = {};
  for (const [t, col] of [['prompt_journal', 'date'], ['analyses', 'date'], ['manual_ops', 'date']]) for (const r of q(`SELECT substr(${col}, 1, 7) m, SUM(LENGTH(data)) b FROM ${t} WHERE ${col} IS NOT NULL GROUP BY m`)) if (validMonth(r.m)) dated[r.m] = (dated[r.m] ?? 0) + r.b;
  const jsonTotal = tables.reduce((s, t) => s + t.bytes, 0), datedTotal = Object.values(dated).reduce((s, v) => s + v, 0);
  let dbSize = 0; for (const f of [dbFile, dbFile + '-wal']) { try { dbSize += fs.statSync(f).size; } catch { /* absent */ } }
  const created = db.prepare("SELECT value FROM meta WHERE key = 'created_at'").get()?.value;
  const scale = jsonTotal ? dbSize / jsonTotal : 1, dbMonthly = {};
  for (const [m, b] of Object.entries(dated)) dbMonthly[m] = Math.round(b * scale);
  const first = Object.keys(dbMonthly).sort()[0] ?? ym(created) ?? ym(new Date().toISOString());
  dbMonthly[first] = (dbMonthly[first] ?? 0) + Math.max(0, Math.round((jsonTotal - datedTotal) * scale));

  const pdf = f => /\.pdf$/i.test(f);
  const fam = (key, label, bytes, count, monthly) => ({ key, label, bytes, count, monthly });
  const scans = { releves: scanDir(dirs.releves, pdf), biens: scanDir(dirs.biens), immo: scanDir(dirs.immo), rapports: scanDir(dirs.rapports), sauvegardes: scanDir(dirs.sauvegardes), versions: scanDir(dirs.versions) };
  const families = [
    fam('base', 'Base de données', dbSize, tables.reduce((s, t) => s + t.rows, 0), dbMonthly),
    fam('releves', 'Relevés PDF', scans.releves.total, scans.releves.count, scans.releves.byMonth),
    fam('biens', 'Documents des biens', scans.biens.total, scans.biens.count, scans.biens.byMonth),
    fam('immo', 'Pièces jointes des actions', scans.immo.total, scans.immo.count, scans.immo.byMonth),
    fam('rapports', 'Rapports PDF', scans.rapports.total, scans.rapports.count, scans.rapports.byMonth),
    fam('sauvegardes', 'Sauvegardes', scans.sauvegardes.total, scans.sauvegardes.count, scans.sauvegardes.byMonth),
    fam('versions', 'Versions du programme', scans.versions.total, scans.versions.count, scans.versions.byMonth),
  ];
  return { families, tables, snapshots: q('SELECT day, size, rows FROM db_history ORDER BY day'), now: new Date().toISOString() };
}
