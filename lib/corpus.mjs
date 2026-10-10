// Corpus documentaire des biens : extraction du texte des PDF (pdfjs-dist), index par bien et recherche plein texte.
import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const MAX_PAGES = 80, MAX_CHARS = 250000;
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texte d'un PDF (pages concaténées, retours à la ligne selon la position verticale). */
export async function pdfText(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages = Math.min(doc.numPages, MAX_PAGES), out = [];
  for (let p = 1; p <= pages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    let y = null, line = [];
    for (const it of tc.items) {
      if (!it.str.trim()) continue;
      const yy = Math.round(it.transform[5] / 3);
      if (y !== null && yy !== y) { out.push(line.join(' ')); line = []; }
      y = yy; line.push(it.str.trim());
    }
    if (line.length) out.push(line.join(' '));
  }
  return { text: out.join('\n').replace(/[ \t]+/g, ' ').slice(0, MAX_CHARS), pages: doc.numPages };
}

const idxFile = dir => path.join(dir, '.corpus.json');
export function readIndex(dir) { try { return JSON.parse(fs.readFileSync(idxFile(dir), 'utf8')); } catch { return {}; } }
const writeIndex = (dir, idx) => { try { fs.writeFileSync(idxFile(dir), JSON.stringify(idx)); } catch { /* dossier absent */ } };

/** Indexe les PDF d'un dossier de bien dont le texte n'est pas encore à jour ; retourne l'index et le nombre de documents traités. */
export async function ensureIndex(dir, { force = false, limit = 25 } = {}) {
  const idx = readIndex(dir); let files = [];
  try { files = fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f)); } catch { return { idx, done: 0, pending: 0 }; }
  let done = 0, pending = 0, changed = false;
  for (const f of files) {
    const st = fs.statSync(path.join(dir, f)), e = idx[f];
    if (!force && e && e.size === st.size && e.mtime === Math.round(st.mtimeMs)) continue;
    if (done >= limit) { pending++; continue; }
    try { const r = await pdfText(fs.readFileSync(path.join(dir, f))); idx[f] = { size: st.size, mtime: Math.round(st.mtimeMs), pages: r.pages, chars: r.text.length, text: r.text, error: '' }; }
    catch (err) { idx[f] = { size: st.size, mtime: Math.round(st.mtimeMs), pages: 0, chars: 0, text: '', error: String(err.message || err).slice(0, 120) }; }
    done++; changed = true;
  }
  for (const k of Object.keys(idx)) if (!files.includes(k)) { delete idx[k]; changed = true; }
  if (changed) writeIndex(dir, idx);
  return { idx, done, pending };
}
export function dropFromIndex(dir, name) { const idx = readIndex(dir); if (idx[name]) { delete idx[name]; writeIndex(dir, idx); } }

/** Recherche : tous les mots doivent apparaître (sans accent ni casse) ; score = occurrences ; extraits autour des premières occurrences. */
export function searchText(entry, q) {
  const terms = norm(q).split(/\s+/).filter(t => t.length >= 2); if (!terms.length) return { hits: 0, excerpts: [] };
  const text = entry.text ?? '', low = norm(text);
  if (low.length !== text.length) { // la normalisation a modifié la longueur (ligatures) : extraits impossibles à positionner
    const hits = terms.map(t => low.split(t).length - 1); return terms.every((_, i) => hits[i] > 0) ? { hits: hits.reduce((a, b) => a + b, 0), excerpts: [] } : { hits: 0, excerpts: [] };
  }
  const counts = terms.map(t => low.split(t).length - 1);
  if (counts.some(c => c === 0)) return { hits: 0, excerpts: [] };
  const excerpts = [], used = [];
  for (const t of terms) {
    let from = 0, n = 0;
    while (n < 2 && excerpts.length < 4) {
      const i = low.indexOf(t, from); if (i < 0) break;
      from = i + t.length;
      if (used.some(u => Math.abs(u - i) < 120)) continue;
      used.push(i); n++;
      excerpts.push((i > 70 ? '…' : '') + text.slice(Math.max(0, i - 70), i + t.length + 90).replace(/\s*\n\s*/g, ' · ') + '…');
    }
  }
  return { hits: counts.reduce((a, b) => a + b, 0), excerpts };
}
