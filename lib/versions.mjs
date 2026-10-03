// Gestion des versions du programme : instantanés ZIP, journal des modifications, comparaison, retour arrière.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createZip, readZip } from './zip.mjs';
import { listProgramFiles, PROGRAM_PATHS } from './backup.mjs';
import { VERSIONS_DIR } from './paths.mjs';

export function createVersionService({ root, safetyBackup }) {
  const DIR = VERSIONS_DIR;
  const PKG = path.join(root, 'package.json');
  const LOG = path.join(root, 'CHANGELOG.md');
  fs.mkdirSync(DIR, { recursive: true });
  const rel = f => path.relative(root, f).replace(/\\/g, '/');
  const pkg = () => JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const current = () => pkg().version || '0.0.0';
  const validV = v => /^\d+\.\d+\.\d+$/.test(v);
  const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const fileOf = v => { if (!validV(v)) throw new Error('Version invalide'); return path.join(DIR, `comptes-v${v}.zip`); };

  function bump(kind, from = current()) {
    const [M, m, p] = from.split('.').map(Number);
    return kind === 'major' ? `${M + 1}.0.0` : kind === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`;
  }
  function manifestOf(file) {
    const e = readZip(fs.readFileSync(file)).find(x => x.name === 'manifest.json');
    const mf = JSON.parse(e.read().toString('utf8'));
    if (mf.app !== 'Comptes' || mf.kind !== 'version') throw new Error('Pas une version Comptes');
    return mf;
  }
  function list() {
    return fs.readdirSync(DIR).filter(f => /^comptes-v\d+\.\d+\.\d+\.zip$/.test(f)).map(name => {
      const f = path.join(DIR, name);
      try { return { name, size: fs.statSync(f).size, ...manifestOf(f) }; } catch (e) { return { name, size: fs.statSync(f).size, version: name.replace(/^comptes-v|\.zip$/g, ''), error: String(e.message) }; }
    }).sort((a, b) => cmp(b.version, a.version));
  }

  function writeChangelog(version, notes, date) {
    const entry = `## ${version} — ${date.slice(0, 10)}\n${notes.split('\n').map(l => l.trim()).filter(Boolean).map(l => '- ' + l.replace(/^[-*•]\s*/, '')).join('\n') || '- (sans note)'}\n\n`;
    const head = '# Journal des modifications\n\n';
    const old = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').replace(/^# Journal des modifications\s*/, '') : '';
    fs.writeFileSync(LOG, head + entry + old);
  }

  function snapshot(version, notes, kindLabel, fromVersion, prompt = '') {
    const files = listProgramFiles(root);
    const entries = files.map(f => ({ name: rel(f), data: fs.readFileSync(f), mtime: fs.statSync(f).mtime }));
    const createdAt = new Date().toISOString();
    const manifest = { app: 'Comptes', kind: 'version', version, notes, bump: kindLabel, from: fromVersion, prompt: String(prompt || ''), createdAt, files: entries.length, rawSize: entries.reduce((s, e) => s + e.data.length, 0) };
    entries.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 1)) });
    fs.writeFileSync(fileOf(version), createZip(entries));
    return manifest;
  }

  /** Publie une nouvelle version : incrémente package.json, journalise, crée l'instantané. */
  function publish({ bump: kind = 'patch', notes = '', prompt = '' }) {
    if (!['major', 'minor', 'patch'].includes(kind)) throw new Error('Type de version invalide');
    const prevVersion = current(), next = bump(kind);
    if (fs.existsSync(fileOf(next))) throw new Error('La version ' + next + ' existe déjà');
    const p = pkg(); p.version = next; fs.writeFileSync(PKG, JSON.stringify(p, null, 2));
    const lock = path.join(root, 'package-lock.json');
    if (fs.existsSync(lock)) { try { const l = JSON.parse(fs.readFileSync(lock, 'utf8')); l.version = next; if (l.packages?.['']) l.packages[''].version = next; fs.writeFileSync(lock, JSON.stringify(l, null, 2)); } catch { /* ignore */ } }
    writeChangelog(next, notes, new Date().toISOString());
    return snapshot(next, notes, kind, prevVersion, prompt);
  }

  /** Compare l'instantané d'une version avec les fichiers actuels. */
  function diff(version) {
    const snap = new Map(readZip(fs.readFileSync(fileOf(version))).filter(e => e.name !== 'manifest.json').map(e => [e.name, e]));
    const cur = new Map(listProgramFiles(root).map(f => [rel(f), f]));
    const added = [], removed = [], modified = [];
    for (const [n, f] of cur) { const e = snap.get(n); if (!e) added.push(n); else if (zlib.crc32(fs.readFileSync(f)) !== e.crc) modified.push(n); }
    for (const n of snap.keys()) if (!cur.has(n)) removed.push(n);
    return { added, removed, modified, same: !added.length && !removed.length && !modified.length };
  }

  /** Retour à une version : sauvegarde de sécurité, puis remplacement des fichiers du programme. */
  function restore(version) {
    const entries = readZip(fs.readFileSync(fileOf(version))).filter(e => e.name !== 'manifest.json');
    for (const e of entries) if (zlib.crc32(e.read()) !== e.crc) throw new Error('Instantané corrompu : ' + e.name);
    const safety = safetyBackup('Avant retour à la version ' + version);
    const keep = new Set(entries.map(e => e.name));
    for (const f of listProgramFiles(root)) if (!keep.has(rel(f))) fs.unlinkSync(f);
    for (const e of entries) {
      const dest = path.join(root, e.name);
      if (!path.resolve(dest).startsWith(root)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, e.read());
    }
    return { restored: entries.length, safety };
  }
  // ---- importance d'une version : recalcul de la numérotation de la chaîne
  const LEVELS = ['patch', 'minor', 'major'];
  const reverse = (ver, level) => {
    const [M, m, p] = ver.split('.').map(Number);
    return level === 'major' ? `${Math.max(0, M - 1)}.0.0` : level === 'minor' ? `${M}.${Math.max(0, m - 1)}.0` : `${M}.${m}.${Math.max(0, p - 1)}`;
  };
  const chainAsc = () => list().filter(v => !v.error).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  /** Numéros recalculés si la version `version` passe au niveau `level`. */
  function plan(version, level) {
    if (!LEVELS.includes(level)) throw new Error('Niveau invalide');
    const items = chainAsc(); if (!items.some(i => i.version === version)) throw new Error('Version inconnue');
    let prev = items[0].from ?? reverse(items[0].version, items[0].bump || 'minor');
    return items.map(it => {
      const lv = it.version === version ? level : (it.bump || 'minor'), nv = bump(lv, prev), from = prev; prev = nv;
      return { old: it.version, new: nv, level: lv, from, changed: nv !== it.version || lv !== (it.bump || 'minor') };
    });
  }
  function rebump(version, level) {
    const steps = plan(version, level), items = chainAsc(), cur = current();
    if (!steps.some(s => s.changed)) return { steps, changed: 0 };
    const tmp = [];
    for (const s of steps) {
      if (!s.changed) continue;
      const entries = readZip(fs.readFileSync(fileOf(s.old))).map(e => {
        let data = e.read();
        if (e.name === 'manifest.json') { const m = JSON.parse(data.toString('utf8')); m.version = s.new; m.bump = s.level; m.from = s.from; data = Buffer.from(JSON.stringify(m, null, 1)); }
        else if (e.name === 'package.json' || e.name === 'package-lock.json') {
          try { const j = JSON.parse(data.toString('utf8')); j.version = s.new; if (j.packages?.['']) j.packages[''].version = s.new; data = Buffer.from(JSON.stringify(j, null, 2)); } catch { /* inchangé */ }
        }
        return { name: e.name, data };
      });
      const t = path.join(DIR, `.tmp-v${s.new}.zip`); fs.writeFileSync(t, createZip(entries)); tmp.push([t, s]);
    }
    for (const [, s] of tmp) fs.unlinkSync(fileOf(s.old));
    for (const [t, s] of tmp) fs.renameSync(t, fileOf(s.new));
    // journal reconstruit depuis les instantanés
    const fresh = chainAsc().reverse();
    fs.writeFileSync(LOG, '# Journal des modifications\n\n' + fresh.map(v => {
      const lines = (v.notes || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => '- ' + l.replace(/^[-*•]\s*/, ''));
      return `## ${v.version} — ${v.createdAt.slice(0, 10)}\n${lines.join('\n') || '- (sans note)'}\n\n`;
    }).join(''));
    // version installée = celle d'un instantané renuméroté
    const hit = steps.find(s => s.old === cur && s.changed);
    if (hit) {
      const p = pkg(); p.version = hit.new; fs.writeFileSync(PKG, JSON.stringify(p, null, 2));
      const lock = path.join(root, 'package-lock.json');
      if (fs.existsSync(lock)) { try { const l = JSON.parse(fs.readFileSync(lock, 'utf8')); l.version = hit.new; if (l.packages?.['']) l.packages[''].version = hit.new; fs.writeFileSync(lock, JSON.stringify(l, null, 2)); } catch { /* ignore */ } }
    }
    void items;
    return { steps, changed: steps.filter(s => s.changed).length };
  }

  /** Associe (ou modifie) le prompt utilisé pour une version : réécrit le manifeste de l'instantané. */
  function setPrompt(version, prompt) {
    const entries = readZip(fs.readFileSync(fileOf(version))).map(e => {
      let data = e.read();
      if (e.name === 'manifest.json') { const m = JSON.parse(data.toString('utf8')); m.prompt = String(prompt || ''); data = Buffer.from(JSON.stringify(m, null, 1)); }
      return { name: e.name, data };
    });
    fs.writeFileSync(fileOf(version), createZip(entries));
  }

  function remove(version) { if (version === current()) throw new Error('Impossible de supprimer la version courante'); fs.unlinkSync(fileOf(version)); }
  const filePath = fileOf;
  return { list, current, bump, publish, diff, restore, remove, plan, rebump, setPrompt, filePath, DIR, LOG, PROGRAM_PATHS };
}
