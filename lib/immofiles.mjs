// Pièces jointes des actions du plan d'actions (Immobilier) : stockage disque par action, sans dépendance.
//   GET    /api/immo/files?aid=ID              liste des fichiers d'une action
//   GET    /api/immo/files/counts              nombre de fichiers par action
//   GET    /api/immo/files?aid=ID&name=F[&download=1]   ouvre / télécharge un fichier
//   POST   /api/immo/files?aid=ID&name=F       dépose un fichier (corps brut, 25 Mo max)
//   DELETE /api/immo/files?aid=ID[&name=F]     supprime un fichier (ou tous ceux de l'action)
import fs from 'fs';
import path from 'path';
import { IMMO_DIR } from './paths.mjs';

const MAX = 25e6;
const TYPES = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8', md: 'text/markdown; charset=utf-8',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet', eml: 'message/rfc822', msg: 'application/vnd.ms-outlook',
};
const INLINE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt', 'csv', 'md']);
const aidOf = v => { const s = String(v ?? ''); return /^[\w-]{1,32}$/.test(s) ? s : null; };
const fileOf = v => { const n = path.basename(String(v ?? '')).replace(/[^\w.\- ()àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, '_').slice(0, 120); return /^[^.].*\.[A-Za-z0-9]{1,5}$/.test(n) && TYPES[n.split('.').pop().toLowerCase()] ? n : null; };
const dirOf = aid => path.join(IMMO_DIR, aid);
function list(aid) {
  try {
    return fs.readdirSync(dirOf(aid)).filter(f => fileOf(f) === f).map(name => { const st = fs.statSync(path.join(dirOf(aid), name)); return { name, size: st.size, at: st.mtime.toISOString() }; }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  } catch { return []; }
}

export function setupImmoFiles() {
  fs.mkdirSync(IMMO_DIR, { recursive: true });
  return async function handle(req, res, url, { json }) {
    const p = url.pathname, m = req.method;
    if (p !== '/api/immo/files' && p !== '/api/immo/files/counts') return false;
    const err = (msg, code = 400) => { json(res, code, { error: msg }); return true; };
    try {
      if (p === '/api/immo/files/counts' && m === 'GET') {
        const out = {}; try { for (const d of fs.readdirSync(IMMO_DIR)) { const n = list(d).length; if (n) out[d] = n; } } catch { /* aucun dossier */ }
        return json(res, 200, { counts: out }), true;
      }
      const aid = aidOf(url.searchParams.get('aid')); if (!aid) return err('Action invalide');
      if (m === 'GET') {
        const n = url.searchParams.get('name');
        if (!n) return json(res, 200, { files: list(aid) }), true;
        const name = fileOf(n), f = name && path.join(dirOf(aid), name); if (!f || !fs.existsSync(f)) return err('Fichier introuvable', 404);
        const ext = name.split('.').pop().toLowerCase(), dl = url.searchParams.get('download') === '1' || !INLINE.has(ext);
        res.writeHead(200, { 'Content-Type': TYPES[ext], 'Content-Length': fs.statSync(f).size, 'Content-Disposition': `${dl ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`, 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(f).pipe(res); return true;
      }
      if (m === 'POST') {
        let name = fileOf(url.searchParams.get('name')); if (!name) return err('Type de fichier non accepté (PDF, images, Word, Excel, PowerPoint, OpenDocument, texte, e-mail)');
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > MAX) return err('Fichier trop volumineux (25 Mo max)', 413); chunks.push(c); }
        if (!size) return err('Fichier vide');
        if (list(aid).length >= 40) return err('40 fichiers maximum par action');
        const dir = dirOf(aid); fs.mkdirSync(dir, { recursive: true });
        const base = name.replace(/(\.[A-Za-z0-9]+)$/, ''), ext = name.match(/(\.[A-Za-z0-9]+)$/)[1]; let k = 2;
        while (fs.existsSync(path.join(dir, name))) name = base + '_' + k++ + ext;
        fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks));
        return json(res, 200, { name, files: list(aid) }), true;
      }
      if (m === 'DELETE') {
        const n = url.searchParams.get('name');
        if (!n) { fs.rmSync(dirOf(aid), { recursive: true, force: true }); return json(res, 200, { files: [] }), true; }
        const name = fileOf(n), f = name && path.join(dirOf(aid), name); if (!f || !fs.existsSync(f)) return err('Fichier introuvable', 404);
        fs.unlinkSync(f); return json(res, 200, { files: list(aid) }), true;
      }
      return err('Méthode non prise en charge', 405);
    } catch (e) { return err(String(e.message || e)); }
  };
}
