// Routes additionnelles : sauvegardes et rapports PDF.
import fs from 'fs';
import path from 'path';
import { createBackupService } from './backup.mjs';
import { REPORTS_DIR } from './paths.mjs';
import { renderReport } from './pdfreport.mjs';
import { createVersionService } from './versions.mjs';
import { copyrightOf } from './features.mjs';
import { buildManifest, readSaved, verify as verifyManifest, MANIFEST_FILE } from './manifest.mjs';
import { exportModel, builtinModel, applyModel, SECTIONS as MODEL_SECTIONS } from './model.mjs';
import { INSTALLED } from './paths.mjs';
import { spawn } from 'child_process';

const DEFAULT_SETTINGS = { auto: true, every: 'daily', weekday: 1, time: '02:00', type: 'data', keep: 10 };

/** Dernier / prochain instant planifié (heure locale du serveur). weekday : 0 = dimanche … 6 = samedi. */
export function slots(s, now = new Date()) {
  const [hh, mm] = String(s.time).split(':').map(Number);
  const at = d => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
  const back = d => { const x = new Date(d); x.setDate(x.getDate() - 1); return at(x); };
  let last = at(now);
  if (last > now) last = back(last);
  if (s.every === 'weekly') while (last.getDay() !== +s.weekday) last = back(last);
  const next = new Date(last); next.setDate(next.getDate() + (s.every === 'weekly' ? 7 : 1)); next.setHours(hh, mm, 0, 0);
  return { last, next };
}

export function setupExtra({ root, getStore, saveStore, reloadStore, getStats, reimport }) {
  const backups = createBackupService({ root, getStats, onRestored: reloadStore });
  const REPORTS = REPORTS_DIR;
  fs.mkdirSync(REPORTS, { recursive: true });
  const settings = () => (getStore().settings ??= {}, getStore().settings.backup = { ...DEFAULT_SETTINGS, ...getStore().settings.backup });

  function nextAuto() { const s = settings(); return s.auto ? slots(s).next.toISOString() : null; }
  function autoTick() {
    try {
      const s = settings(); if (!s.auto) return;
      const { last } = slots(s);
      const lastAuto = backups.list().filter(b => b.manifest?.auto).map(b => b.manifest.createdAt).sort().pop();
      const ref = new Date(Math.max(lastAuto ? +new Date(lastAuto) : 0, s.since ? +new Date(s.since) : 0));
      if (ref < last) { backups.create(s.type, { label: 'Sauvegarde programmée', auto: true }); backups.prune(s.keep, true); }
    } catch (e) { console.error('Sauvegarde auto :', e.message); }
  }
  setTimeout(autoTick, 5000); setInterval(autoTick, 6e4).unref?.();

  const versions = createVersionService({ root, safetyBackup: label => backups.create('program', { label }).name });

  const overview = () => {
    const list = backups.list(), byType = {};
    for (const b of list) { const t = b.manifest?.type ?? 'inconnu'; (byType[t] ??= { count: 0, size: 0 }); byType[t].count++; byType[t].size += b.size; }
    return {
      list, byType, total: { count: list.length, size: list.reduce((s, b) => s + b.size, 0) },
      settings: settings(), nextAuto: nextAuto(), volumes: backups.volumes(), types: backups.types, dir: backups.DIR,
    };
  }

  const safeReport = n => { n = path.basename(String(n || '')); if (!/^[\w.\- ()]+\.pdf$/i.test(n)) throw new Error('Nom invalide'); return n; };
  const listReports = () => fs.readdirSync(REPORTS).filter(f => /\.pdf$/i.test(f)).map(name => {
    const st = fs.statSync(path.join(REPORTS, name));
    return { name, size: st.size, mtime: st.mtime.toISOString() };
  }).sort((a, b) => b.mtime.localeCompare(a.mtime));

  /** retourne true si la requête a été traitée */
  return async function handle(req, res, url, { json, readBody }) {
    const p = url.pathname, m = req.method;
    if (!['/api/backups', '/api/reports', '/api/versions', '/api/restart', '/api/manifest', '/api/model'].some(x => p.startsWith(x))) return false;
    try {
      if (p === '/api/backups' && m === 'GET') return json(res, 200, overview()), true;
      if (p === '/api/backups' && m === 'POST') {
        const b = await readBody(req); const r = backups.create(b.type, { label: b.label });
        const s = settings(); if (s.auto && s.keep) backups.prune(s.keep, true);
        return json(res, 200, { created: r.name, ...overview() }), true;
      }
      if (p === '/api/backups' && m === 'DELETE') { backups.remove(url.searchParams.get('name')); return json(res, 200, overview()), true; }
      if (p === '/api/backups/file' && m === 'GET') {
        const f = backups.filePath(url.searchParams.get('name'));
        if (!fs.existsSync(f)) return json(res, 404, { error: 'Introuvable' }), true;
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': fs.statSync(f).size, 'Content-Disposition': `attachment; filename="${path.basename(f)}"` });
        fs.createReadStream(f).pipe(res); return true;
      }
      if (p === '/api/backups/verify' && m === 'POST') { const b = await readBody(req); return json(res, 200, backups.verify(b.name)), true; }
      if (p === '/api/backups/restore' && m === 'POST') {
        const b = await readBody(req); const r = backups.restore(b.name); await reimport();
        return json(res, 200, { ...r, ...overview() }), true;
      }
      if (p === '/api/backups/import' && m === 'POST') {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 500e6) return json(res, 413, { error: 'Fichier trop volumineux' }), true; chunks.push(c); }
        const name = backups.importZip(url.searchParams.get('name') || 'import.zip', Buffer.concat(chunks));
        return json(res, 200, { imported: name, ...overview() }), true;
      }
      if (p === '/api/backups/settings' && m === 'PUT') {
        const b = await readBody(req), s = settings();
        if (typeof b.auto === 'boolean') s.auto = b.auto;
        if (['daily', 'weekly'].includes(b.every)) s.every = b.every;
        if (b.weekday >= 0 && b.weekday <= 6) s.weekday = Math.round(b.weekday);
        if (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(b.time || '')) s.time = b.time;
        s.since = new Date().toISOString();
        if (backups.types[b.type]) s.type = b.type;
        if (b.keep >= 1 && b.keep <= 200) s.keep = Math.round(b.keep);
        saveStore(); return json(res, 200, overview()), true;
      }
      if (p === '/api/backups/prune' && m === 'POST') {
        const b = await readBody(req); const n = backups.prune(Math.max(1, +b.keep || 1), !!b.onlyAuto);
        return json(res, 200, { deleted: n, ...overview() }), true;
      }

      // ---- versions
      if (p === '/api/versions' && m === 'GET') return json(res, 200, { current: versions.current(), list: versions.list(), about: { node: process.version, platform: process.platform, uptime: Math.round(process.uptime()), port: process.env.PORT || 3210, root } }), true;
      if (p === '/api/versions' && m === 'POST') {
        const b = await readBody(req); const mf = versions.publish({ bump: b.bump, notes: String(b.notes || '').slice(0, 2000), prompt: String(b.prompt || '').slice(0, 20000) });
        return json(res, 200, { published: mf.version, current: versions.current(), list: versions.list() }), true;
      }
      if (p === '/api/versions' && m === 'DELETE') { versions.remove(url.searchParams.get('version')); return json(res, 200, { current: versions.current(), list: versions.list() }), true; }
      if (p === '/api/versions/file' && m === 'GET') {
        const f = versions.filePath(url.searchParams.get('version'));
        if (!fs.existsSync(f)) return json(res, 404, { error: 'Introuvable' }), true;
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': fs.statSync(f).size, 'Content-Disposition': `attachment; filename="${path.basename(f)}"` });
        fs.createReadStream(f).pipe(res); return true;
      }
      if (p === '/api/versions/rebump' && m === 'POST') {
        const b = await readBody(req);
        if (b.preview) return json(res, 200, { steps: versions.plan(b.version, b.level) }), true;
        const r = versions.rebump(b.version, b.level);
        return json(res, 200, { ...r, current: versions.current(), list: versions.list() }), true;
      }
      if (p === '/api/versions/prompt' && m === 'POST') {
        const b = await readBody(req); versions.setPrompt(b.version, String(b.prompt || '').slice(0, 20000));
        return json(res, 200, { current: versions.current(), list: versions.list() }), true;
      }
      if (p === '/api/versions/diff' && m === 'POST') { const b = await readBody(req); return json(res, 200, versions.diff(b.version)), true; }
      if (p === '/api/versions/restore' && m === 'POST') { const b = await readBody(req); const r = versions.restore(b.version); return json(res, 200, { ...r, current: versions.current(), list: versions.list() }), true; }
      if (p === '/api/restart' && m === 'POST') {
        json(res, 200, { ok: true });
        const code = `setTimeout(()=>require('child_process').spawn(process.execPath,['server.mjs'],{cwd:${JSON.stringify(root)},detached:true,stdio:'ignore',windowsHide:true}).unref(),1500)`;
        spawn(process.execPath, ['-e', code], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
        setTimeout(() => process.exit(0), 300); return true;
      }

      // ---- manifeste
      if (p === '/api/manifest' && m === 'GET') {
        const live = buildManifest({ root, store: getStore(), nodeVersion: process.version, installed: INSTALLED });
        const saved = readSaved(root);
        return json(res, 200, { manifest: live, saved: saved ? { generatedAt: saved.generatedAt, version: saved.version, integrity: saved.integrity, files: saved.summary?.files, matches: saved.integrity === live.integrity } : null, file: MANIFEST_FILE, dir: root }), true;
      }
      if (p === '/api/manifest/write' && m === 'POST') {
        const mf = buildManifest({ root, store: getStore(), nodeVersion: process.version, installed: INSTALLED });
        fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify(mf, null, 2));
        return json(res, 200, { written: MANIFEST_FILE, integrity: mf.integrity, files: mf.summary.files }), true;
      }
      if (p === '/api/manifest/verify' && m === 'POST') {
        const saved = readSaved(root); if (!saved) return json(res, 404, { error: 'Aucun MANIFEST.json enregistré : générez-le d\u2019abord' }), true;
        return json(res, 200, { ...verifyManifest(root, saved), version: saved.version, generatedAt: saved.generatedAt }), true;
      }
      if (p === '/api/manifest/download' && m === 'GET') {
        const mf = buildManifest({ root, store: getStore(), nodeVersion: process.version, installed: INSTALLED });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="MANIFEST.json"' }); res.end(JSON.stringify(mf, null, 2)); return true;
      }

      // ---- modèles de paramétrage
      if (p === '/api/model/sections' && m === 'GET') return json(res, 200, { sections: MODEL_SECTIONS, builtin: builtinModel() }), true;
      if (p === '/api/model/export' && m === 'POST') {
        const b = await readBody(req), mdl = exportModel(getStore(), { ...b, appVersion: versions.current() });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(mdl, null, 2)); return true;
      }
      if (p === '/api/model/preview' && m === 'POST') {
        const b = await readBody(req); return json(res, 200, applyModel(getStore(), b.model, { sections: b.sections, mode: b.mode, dryRun: true })), true;
      }
      if (p === '/api/model/import' && m === 'POST') {
        const b = await readBody(req);
        applyModel(getStore(), b.model, { sections: b.sections, mode: b.mode, dryRun: true });
        const safety = backups.create('data', { label: 'Avant import du modèle « ' + String(b.model.name || '').slice(0, 40) + ' »' });
        const r = applyModel(getStore(), b.model, { sections: b.sections, mode: b.mode });
        saveStore(); reloadStore();
        return json(res, 200, { ...r, safety: safety.name }), true;
      }

      // ---- rapports PDF
      if (p === '/api/reports' && m === 'GET') return json(res, 200, { list: listReports() }), true;
      if (p === '/api/reports' && m === 'POST') {
        const spec = await readBody(req);
        if (!spec?.title || !Array.isArray(spec.blocks)) return json(res, 400, { error: 'Rapport invalide' }), true;
        spec.copyright = copyrightOf(getStore());
        const buf = await renderReport(spec);
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        const slug = String(spec.file || spec.title).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'rapport';
        const name = `${slug}_${stamp}.pdf`;
        fs.writeFileSync(path.join(REPORTS, name), buf);
        return json(res, 200, { name, size: buf.length, list: listReports() }), true;
      }
      if (p === '/api/reports/file' && m === 'GET') {
        const f = path.join(REPORTS, safeReport(url.searchParams.get('name')));
        if (!fs.existsSync(f)) return json(res, 404, { error: 'Introuvable' }), true;
        const dl = url.searchParams.get('download') === '1';
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': fs.statSync(f).size, 'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename="${path.basename(f)}"` });
        fs.createReadStream(f).pipe(res); return true;
      }
      if (p === '/api/reports' && m === 'DELETE') { fs.unlinkSync(path.join(REPORTS, safeReport(url.searchParams.get('name')))); return json(res, 200, { list: listReports() }), true; }
    } catch (e) { json(res, 400, { error: String(e.message || e) }); return true; }
    return false;
  };
}
