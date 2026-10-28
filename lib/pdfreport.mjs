// Rendu PDF générique à partir d'une description JSON { title, subtitle, layout, blocks[] }.
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { ROOT } from './paths.mjs';

const C = { primary: '#6366f1', deep: '#312e81', text: '#1b1d3a', muted: '#6b7094', line: '#e3e5f4', soft: '#f3f4fb', good: '#10b981', bad: '#ef4444' };
// niveaux des encadrés « points de vigilance »
const LV = { bad: { c: '#dc2626', bg: '#fef2f2' }, warn: { c: '#d97706', bg: '#fffbeb' }, good: { c: '#059669', bg: '#ecfdf5' }, info: { c: '#4f46e5', bg: '#eef2ff' } };
const clean = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/[^\x09\x0a\x0d\x20-\x7e¡-ÿ€–—’‘“”…•]/g, '');
const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? c : C.primary;

/** Rend le PDF. Avec spec.toc : deux passes (la 1re mesure les numéros de page, la 2e les imprime dans la table des matières). */
export async function renderReport(spec) {
  // options d'impression : format (A4/A3), orientation, graphiques
  if (spec.charts === false) spec = { ...spec, blocks: (spec.blocks || []).filter(b => b.t !== 'hbars' && b.t !== 'vbars') };
  if (!spec.toc) return (await build(spec, null)).buf;
  const first = await build(spec, { pages: {} });
  return (await build(spec, { pages: first.heads })).buf;
}

function build(spec, toc) {
  return new Promise((resolve, reject) => {
    const heads = {};
    const landscape = spec.layout === 'landscape', size = spec.size === 'A3' ? 'A3' : 'A4';
    const doc = new PDFDocument({ size, layout: landscape ? 'landscape' : 'portrait', margin: 40, bufferPages: true, info: { Title: clean(spec.title), Author: 'Comptes' } });
    const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve({ buf: Buffer.concat(chunks), heads })); doc.on('error', reject);
    const M = 40, W = doc.page.width - 2 * M, BOTTOM = () => doc.page.height - 50;
    const ensure = h => { if (doc.y + h > BOTTOM()) doc.addPage(); };
    const T = (s, x, y, o = {}) => doc.text(clean(s), x, y, { lineBreak: false, ...o });

    // ---- en-tête : bandeau dégradé, cercles décoratifs, filet rose
    const PW = doc.page.width, grad = (x0, x1, a, b) => { const g = doc.linearGradient(x0, 0, x1, 0); g.stop(0, a).stop(1, b); return g; };
    doc.rect(0, 0, PW, 108).fill(grad(0, PW, '#3730a3', '#7c3aed'));
    doc.save().fillOpacity(0.10).circle(PW - 40, 20, 90).fill('#fff').circle(PW - 150, 118, 60).fill('#fff').restore();
    doc.rect(0, 108, PW, 4).fill(grad(0, PW, '#ec4899', '#f59e0b'));
    doc.fillColor('#c7c9ff').font('Helvetica-Bold').fontSize(8); T('COMPTES', M, 20, { width: W, characterSpacing: 2.5 });
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(24); T(spec.title, M, 34, { width: W });
    doc.font('Helvetica').fontSize(11).fillColor('#e0e1ff'); T(spec.subtitle || '', M, 66, { width: W, ellipsis: true });
    doc.fontSize(8.5).fillColor('#c7c9ff'); T('Généré le ' + new Date().toLocaleString('fr-FR'), M, 86, { width: W });
    doc.y = 132;

    const calloutH = it => {
      const tw = W - 46 - 14, lines = it.items || [];
      doc.font('Helvetica-Bold').fontSize(10.5); const th = it.title ? doc.heightOfString(clean(it.title), { width: tw }) : 0;
      doc.font('Helvetica').fontSize(9.5); const body = [it.text, ...lines.map(x => '•  ' + x)].filter(Boolean).join('\n'), bh = body ? doc.heightOfString(clean(body), { width: tw }) : 0;
      return Math.max(38, 14 + th + (th && bh ? 3 : 0) + bh + 8) + 8;
    };
    const callout = it => {
      const L = LV[it.level] || LV.info, ind = 46, tw = W - ind - 14, lines = it.items || [];
      doc.font('Helvetica-Bold').fontSize(10.5); const th = it.title ? doc.heightOfString(clean(it.title), { width: tw }) : 0;
      doc.font('Helvetica').fontSize(9.5); const body = [it.text, ...lines.map(x => '•  ' + x)].filter(Boolean).join('\n'), bh = body ? doc.heightOfString(clean(body), { width: tw }) : 0;
      const H = Math.max(38, 14 + th + (th && bh ? 3 : 0) + bh + 8);
      ensure(H + 8); const y = doc.y;
      doc.roundedRect(M, y, W, H, 7).fill(L.bg);
      doc.save().roundedRect(M, y, W, H, 7).clip(); doc.rect(M, y, 5, H).fill(L.c); doc.restore();
      const cx = M + 26, cy = y + 19; doc.circle(cx, cy, 10).fill(L.c);
      if (it.level === 'good') doc.moveTo(cx - 4.5, cy).lineTo(cx - 1, cy + 3.5).lineTo(cx + 5, cy - 3.5).lineWidth(2).strokeColor('#fff').stroke();
      else { doc.fillColor('#fff').font('Helvetica-Bold').fontSize(13); T(it.level === 'info' ? 'i' : '!', cx - 5, cy - 7, { width: 10, align: 'center' }); }
      let ty = y + 9;
      if (it.title) { doc.fillColor(L.c).font('Helvetica-Bold').fontSize(10.5).text(clean(it.title), M + ind, ty, { width: tw }); ty += th + 3; }
      if (body) doc.fillColor(C.text).font('Helvetica').fontSize(9.5).text(clean(body), M + ind, ty, { width: tw });
      doc.y = y + H + 8;
    };

    // ---- table des matières (titres de niveau 2 ; niveau 3 aussi si spec.toc === 'deep')
    const hasLevels = (spec.blocks || []).some(b => b.tocLevel);
    const entries = toc ? (spec.blocks || []).filter(b => hasLevels ? b.tocLevel : b.t === 'h2') : [];
    const tocIndex = new Map(entries.map((e, k) => [e, k]));
    const mark = b => { const k = tocIndex.get(b); if (k !== undefined) { heads[k] = doc.bufferedPageRange().count; doc.addNamedDestination('sec' + k); } };
    if (toc) {
      doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(17); T('Table des matières', M, doc.y, { width: W }); doc.y += 34;
      entries.forEach((e, k) => {
        ensure(24); const y = doc.y, lvl = hasLevels ? (e.tocLevel - 1) : 0, x0 = M + lvl * 18, pgW = 34, label = clean(e.text), pg = toc.pages[k] ?? '';
        doc.font(lvl ? 'Helvetica' : 'Helvetica-Bold').fontSize(lvl ? 9.5 : 11).fillColor(lvl ? C.muted : C.text);
        T(label, x0, y, { width: W - lvl * 18 - pgW - 14, ellipsis: true, goTo: 'sec' + k });
        const lw = doc.widthOfString(label), a = x0 + lw + 6, z = M + W - pgW - 4;
        if (z > a) doc.dash(1, { space: 3 }).moveTo(a, y + 9).lineTo(z, y + 9).lineWidth(.6).strokeColor('#b8bce0').stroke().undash();
        doc.fillColor(C.text); T(String(pg), M + W - pgW, y, { width: pgW, align: 'right', goTo: 'sec' + k });
        doc.y = y + (lvl ? 16 : 23); if (!lvl && hasLevels) doc.y += 2;
      });
      doc.addPage();
    }

    const BL = spec.blocks || [];
    // place nécessaire sous un titre pour ne pas l'isoler en bas de page de son contenu
    const usable = () => doc.page.height - 100;
    const tableH = b => {
      const tot = b.columns.reduce((s, c) => s + (c.w || 1), 0), fs_ = b.fontSize || 8.5, pad = b.fit ? 2 : 4, rh = fs_ + 2 * pad - 1, pw = b.columns.map(c => W * (c.w || 1) / tot); doc.font('Helvetica-Bold').fontSize(fs_); let h = Math.max(rh, ...b.columns.map((c, ci) => doc.heightOfString(clean(c.title), { width: pw[ci] - 8 }) + 2 * pad - 1)) + 3;
      for (const r of b.rows) {
        if (r.section) { h += rh; continue; }
        let rowH = rh;
        for (const [ci, cell] of r.cells.entries()) { const o = typeof cell === 'object' && cell ? cell : { text: cell }; doc.font(r.bold || o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs_); rowH = Math.max(rowH, doc.heightOfString(clean(o.text), { width: pw[ci] - (o.dot ? 19 : 8) }) + 2 * pad - 1); }
        h += rowH;
      }
      return h + 8;
    };
    const fitCache = new WeakMap();
    const fitTable = b0 => {
      if (b0.t !== 'table' || !b0.fit) return b0;
      if (fitCache.has(b0)) return fitCache.get(b0);
      let fs_ = b0.fontSize || 8.5, t = b0; const lim = usable() - 70;
      while (tableH(t) > lim && fs_ > 5.5) { fs_ -= 0.25; t = { ...b0, fontSize: fs_ }; }
      fitCache.set(b0, t); return t;
    };
    const imgCache = new Map();
    const imgInfo = b => {
      const key = b.file || (b.data ? 'd' + String(b.data).length + String(b.data).slice(-24) : '');
      if (imgCache.has(key)) return imgCache.get(key);
      let buf = null;
      try {
        if (b.data) { const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(b.data)); if (m) buf = Buffer.from(m[2], 'base64'); }
        else if (/^[\w-]+\.(jpe?g|png)$/i.test(String(b.file || ''))) buf = fs.readFileSync(path.join(ROOT, 'public', 'docs-img', b.file));
      } catch { /* image absente : ignorée */ }
      let info = null;
      if (buf) { const img = doc.openImage(buf), maxH = doc.page.height - 50 - 150; let w = Math.min(W * (b.scale || 0.92), img.width), hh = img.height * w / img.width; if (hh > maxH) { w *= maxH / hh; hh = maxH; } info = { buf, w, hh }; }
      imgCache.set(key, info); return info;
    };
    // place à réserver sous un titre : le titre suit son contenu (un chapitre ne reste jamais seul en bas de page)
    const keep = i => {
      const n = fitTable(BL[i + 1] ?? {}); if (!BL[i + 1]) return 80;
      const cap = x => Math.min(x, usable());
      switch (n.t) {
        case 'h1': case 'h2': case 'h3': return cap(46 + keep(i + 1));
        case 'image': { const d = imgInfo(n); return d ? cap(d.hh + 44) : 60; }
        case 'table': return (n.keep || n.fit) ? cap(tableH(n) + 40) : 100;
        case 'vbars': return cap((n.height || 170) + 90);
        case 'kpis': return 100;
        case 'p': { doc.font('Helvetica').fontSize(10); return cap(doc.heightOfString(clean(n.text), { width: W - (n.indent || 0) }) + 12); }
        case 'text': { doc.font('Helvetica').fontSize(9.5); return cap(doc.heightOfString(clean(n.text), { width: W }) + 12); }
        case 'callout': return cap(calloutH(n) + 6);
        case 'vigil': return cap(54 + ((n.items || []).length ? calloutH(n.items[0]) : 46));
        case 'hbars': return cap(Math.min((n.items || []).length, 3) * 17 + 14);
        case 'gantt': return cap(22 + 4 * (n.rowH || 15) + 24);
        default: return 80;
      }
    };
    for (const [bi, b0] of BL.entries()) {
      const b = fitTable(b0);
      if (b.t === 'h1') {
        ensure(Math.max(120, 56 + keep(bi))); doc.y += 12; mark(b);
        const y = doc.y; doc.roundedRect(M, y, W, 32, 7).fill(grad(M, M + W, '#4f46e5', '#7c3aed'));
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15); T(b.text, M + 14, y + 9, { width: W - 28 }); doc.y = y + 44;
      } else if (b.t === 'h2') {
        ensure(44 + keep(bi)); doc.y += 10; mark(b); const y = doc.y;
        doc.roundedRect(M, y, W, 24, 5).fill('#eef0ff'); doc.roundedRect(M, y, 5, 24, 2).fill(C.primary);
        doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(12.5); T(b.text, M + 14, y + 6, { width: W - 24 }); doc.y = y + 34;
      } else if (b.t === 'text') {
        doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
        const h = doc.heightOfString(clean(b.text), { width: W }); ensure(h + 6);
        doc.text(clean(b.text), M, doc.y, { width: W }); doc.y += 6;
      } else if (b.t === 'h3') {
        ensure(Math.max(46, 22 + keep(bi))); doc.y += 4; mark(b);
        doc.circle(M + 4, doc.y + 6, 3).fill('#ec4899'); doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(10.5); T(b.text, M + 14, doc.y, { width: W - 14 }); doc.y += 18;
      } else if (b.t === 'p') {
        doc.font('Helvetica').fontSize(10).fillColor(C.text);
        const ind = b.indent || 0, h_ = doc.heightOfString(clean(b.text), { width: W - ind }); ensure(h_ + 6);
        doc.text(clean(b.text), M + ind, doc.y, { width: W - ind }); doc.y += 4;
      } else if (b.t === 'callout') {
        callout(b);
      } else if (b.t === 'vigil') {
        const items = b.items || [], worst = items.some(i => i.level === 'bad') ? 'bad' : items.length ? 'warn' : 'good', L = LV[worst];
        ensure(90); doc.y += 10; mark(b); const y = doc.y;
        doc.roundedRect(M, y, W, 28, 6).fill(L.c); doc.fillColor('#fff').font('Helvetica-Bold').fontSize(12.5); T(b.title || 'Points de vigilance', M + 14, y + 8, { width: W - 140 });
        const lab = items.length ? items.length + (items.length > 1 ? ' points' : ' point') : 'Aucun'; doc.roundedRect(M + W - 96, y + 6, 84, 16, 8).fill('#fff'); doc.fillColor(L.c).fontSize(8.5); T(lab, M + W - 96, y + 10, { width: 84, align: 'center' });
        doc.y = y + 38;
        if (items.length) items.forEach(callout); else callout({ level: 'good', title: 'Rien à signaler', text: b.empty || 'Aucune anomalie détectée.' });
      } else if (b.t === 'gantt') {
        const items = b.items || [], links = b.links || [], rowH = b.rowH || 15, LW = Math.min(W * 0.34, 215), cw = W - LW - 4, head = 22;
        const D = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5, MS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
        if (items.length) {
          const dmin = Math.min(...items.map(i => D(i.start)), b.today ? D(b.today) : Infinity) - 3, dmax = Math.max(...items.map(i => D(i.end)), b.today ? D(b.today) : -Infinity) + 4, span = Math.max(1, dmax - dmin);
          const X = n => M + LW + (n - dmin) / span * cw;
          let from = 0;
          while (from < items.length) {
            if (doc.y + head + rowH * 4 + 10 > BOTTOM()) doc.addPage();
            const n = Math.max(1, Math.min(items.length - from, Math.floor((BOTTOM() - doc.y - head - 24) / rowH))), y0 = doc.y, top = y0 + head, chunk = items.slice(from, from + n);
            doc.rect(M, y0, W, head - 3).fill('#e6e8fc'); doc.rect(M, y0 + head - 4, W, 1.5).fill(C.primary);
            doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(8); T('Tâche', M + 6, y0 + 5, { width: LW - 10 });
            // lignes de fond, mois
            chunk.forEach((it, k) => {
              if (it.band) { doc.save().fillColor(hex(it.band)).fillOpacity(.14).rect(M, top + k * rowH, W, rowH).fill().restore(); doc.rect(M, top + k * rowH, 3, rowH).fill(hex(it.band)); }
              else if (k % 2) doc.rect(M, top + k * rowH, W, rowH).fill('#f8f8ff');
            });
            const d0 = new Date(dmin * 864e5); let cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1) / 864e5; if (cur < dmin) cur = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1) / 864e5;
            const everyMonths = span / 30.4 > 20 ? 3 : span / 30.4 > 10 ? 2 : 1; let mi = 0;
            for (let t = cur; t < dmax; mi++) {
              const dt = new Date(t * 864e5), x = X(t);
              doc.moveTo(x, top).lineTo(x, top + n * rowH).lineWidth(.4).strokeColor(C.line).stroke();
              if (mi % everyMonths === 0) { doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(7); T(MS[dt.getUTCMonth()] + ' ' + String(dt.getUTCFullYear()).slice(2), x + 2, y0 + 6, { width: Math.max(30, cw / (span / 30.4) * everyMonths) }); }
              t = Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 1) / 864e5;
            }
            // étiquettes + barres
            const pos = new Map();
            chunk.forEach((it, k) => {
              const y = top + k * rowH, cy = y + rowH / 2, s = D(it.start), e = D(it.end), mile = !!it.milestone;
              doc.fillColor(it.done ? C.muted : C.text).font(it.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5); { let t = clean(it.label); if (doc.widthOfString(t) > LW - 10) { while (t.length > 1 && doc.widthOfString(t + '…') > LW - 10) t = t.slice(0, -1); t += '…'; } T(t, M + 6, y + (rowH - 7.5) / 2, { width: LW + 40 }); }
              if (mile) { const x = X(e + .5); doc.save().translate(x, cy).moveTo(0, -4.5).lineTo(4.5, 0).lineTo(0, 4.5).lineTo(-4.5, 0).closePath().fill(hex(it.color)).restore(); pos.set(from + k, { l: x - 4.5, r: x + 4.5, y: cy }); }
              else { const x1 = X(s), x2 = Math.max(x1 + 3, X(e + 1)); doc.roundedRect(x1, y + 3, x2 - x1, rowH - 6, 2).fill(hex(it.color)); if (it.done) { doc.moveTo(x1 + 2, cy).lineTo(x2 - 2, cy).lineWidth(.8).strokeColor('#ffffff').stroke(); } pos.set(from + k, { l: x1, r: x2, y: cy }); }
            });
            if (b.today && D(b.today) >= dmin && D(b.today) <= dmax) { const x = X(D(b.today) + .5); doc.dash(3, { space: 2 }).moveTo(x, top - 3).lineTo(x, top + n * rowH).lineWidth(1.1).strokeColor('#0ea5e9').stroke().undash(); doc.fillColor('#0ea5e9').font('Helvetica-Bold').fontSize(6.5); T('aujourd’hui', x + 2, top + n * rowH + 1, { width: 50 }); }
            // dépendances (flèches coudées) entre barres visibles sur cette page
            for (const l of links) {
              const p1 = pos.get(l.from), p2 = pos.get(l.to); if (!p1 || !p2) continue;
              const col = l.bad ? '#dc2626' : '#475569', x1 = p1.r, y1 = p1.y, x2 = p2.l, y2 = p2.y;
              doc.lineWidth(l.bad ? 1.5 : 0.9).strokeColor(col); if (l.dashed) doc.dash(3, { space: 2 });
              doc.moveTo(x1, y1);
              if (x2 > x1 + 10) { doc.lineTo(x1 + 5, y1).lineTo(x1 + 5, y2).lineTo(x2, y2); }
              else { const ym = (y1 + y2) / 2 + (y2 > y1 ? rowH * .45 : -rowH * .45); doc.lineTo(x1 + 5, y1).lineTo(x1 + 5, ym).lineTo(x2 - 6, ym).lineTo(x2 - 6, y2).lineTo(x2, y2); }
              doc.stroke(); if (l.dashed) doc.undash();
              doc.moveTo(x2, y2).lineTo(x2 - 4.5, y2 - 2.6).lineTo(x2 - 4.5, y2 + 2.6).closePath().fill(col);
              if (l.label) { doc.fillColor(col).font('Helvetica-Bold').fontSize(6); T(l.label, x1 + 7, (y1 + y2) / 2 - (y1 === y2 ? 7 : 2), { width: 40 }); }
            }
            doc.moveTo(M, top + n * rowH).lineTo(M + W, top + n * rowH).lineWidth(.5).strokeColor(C.line).stroke();
            doc.y = top + n * rowH + 12; from += n;
            if (from < items.length) doc.addPage();
          }
          // légende
          if ((b.legend || []).length || links.length) {
          ensure(26); let lx = M, ly = doc.y; doc.font('Helvetica').fontSize(7.5);
          for (const lg of b.legend || []) { doc.rect(lx, ly + 1, 9, 7).fill(hex(lg.color)); doc.fillColor(C.text); T(lg.label, lx + 12, ly, {}); lx += 24 + doc.widthOfString(clean(lg.label)); }
          if (links.length) {
          doc.lineWidth(1).strokeColor('#475569').moveTo(lx, ly + 4.5).lineTo(lx + 16, ly + 4.5).stroke(); doc.fillColor(C.text); T('contrainte respectée', lx + 19, ly, {}); lx += 28 + doc.widthOfString('contrainte respectée');
          doc.lineWidth(1.6).strokeColor('#dc2626').moveTo(lx, ly + 4.5).lineTo(lx + 16, ly + 4.5).stroke(); doc.fillColor(C.text); T('non respectée', lx + 19, ly, {}); lx += 28 + doc.widthOfString('non respectée');
          doc.dash(3, { space: 2 }).lineWidth(1).strokeColor('#475569').moveTo(lx, ly + 4.5).lineTo(lx + 16, ly + 4.5).stroke().undash(); doc.fillColor(C.text); T('« avant »', lx + 19, ly, {});
          }
          doc.y = ly + 18;
          }
        }
      } else if (b.t === 'image') {
        // image : copie d'écran de la documentation (public/docs-img/<nom>) ou image PNG/JPEG encodée en data URL (schémas)
        const inf = imgInfo(b);
        if (inf) {
          const { buf, w, hh } = inf;
          ensure(hh + (b.caption ? 34 : 14)); doc.y += 4; const y = doc.y, x = M + (W - w) / 2;
          doc.roundedRect(x - 3, y - 3, w + 6, hh + 6, 6).lineWidth(0.8).strokeColor(C.line).stroke(); doc.image(buf, x, y, { width: w });
          doc.y = y + hh + 8;
          if (b.caption) { doc.fillColor(C.muted).font('Helvetica-Oblique').fontSize(8.5); doc.text(clean(b.caption), M, doc.y, { width: W, align: 'center' }); doc.y += 8; }
          doc.y += 6;
        }
      } else if (b.t === 'pagebreak') {
        doc.addPage();
      } else if (b.t === 'kpis') {
        ensure(78);
        const n = b.items.length, gap = 10, w = (W - gap * (n - 1)) / n, y = doc.y;
        b.items.forEach((k, i) => {
          const x = M + i * (w + gap);
          doc.roundedRect(x, y, w, 64, 8).fill(hex(k.color));
          doc.save().roundedRect(x, y, w, 64, 8).clip().fillOpacity(0.14).circle(x + w - 8, y + 4, 38).fill('#fff').restore();
          if (k.alert) { doc.circle(x + w - 15, y + 15, 8).fill('#fff'); doc.fillColor(hex(k.color)).font('Helvetica-Bold').fontSize(11); T('!', x + w - 20, y + 9, { width: 10, align: 'center' }); }
          doc.fillColor('#fff').font('Helvetica').fontSize(8.5); T(k.label, x + 10, y + 9, { width: w - 20 });
          doc.font('Helvetica-Bold').fontSize(landscape ? 16 : 14); T(k.value, x + 10, y + 24, { width: w - 20 });
          doc.font('Helvetica').fontSize(7.5).fillColor('#f1f1ff'); T(k.sub || '', x + 10, y + 48, { width: w - 20, ellipsis: true });
        });
        doc.y = y + 78;
      } else if (b.t === 'hbars') {
        const lw = 150, vw = 90, bw = W - lw - vw - 10, max = Math.max(1, ...b.items.map(i => i.value));
        for (const it of b.items) {
          ensure(18); const y = doc.y;
          doc.fillColor(C.text).font('Helvetica').fontSize(8.5); T(it.label, M, y + 3, { width: lw - 6, ellipsis: true });
          doc.roundedRect(M + lw, y + 2, bw, 10, 3).fill(C.soft);
          doc.roundedRect(M + lw, y + 2, Math.max(2, bw * it.value / max), 10, 3).fill(hex(it.color));
          doc.fillColor(C.text).font('Helvetica-Bold'); T(it.text, M + lw + bw + 8, y + 3, { width: vw, align: 'right' });
          doc.y = y + 17;
        }
        doc.y += 4;
      } else if (b.t === 'vbars') {
        const H = b.height || 170; ensure(H + 50);
        const y0 = doc.y + 6; doc.roundedRect(M - 6, doc.y - 2, W + 12, H + 14, 8).lineWidth(0.6).strokeColor(C.line).stroke();
        const ax = 46, cw = W - ax - 6, ch = H - 30, top = y0 + 18;
        const all = b.stacked ? b.labels.map((_, i) => b.series.filter(s => s.type !== 'line').reduce((t, s) => t + Math.max(0, s.data[i] ?? 0), 0)) : b.series.flatMap(s => s.data);
        let hi = Math.max(0, ...all), lo = Math.min(0, ...all);
        let step = niceStep((hi - lo) || 1, 4); if (b.int) step = Math.max(1, Math.ceil(step)); hi = Math.ceil(hi / step) * step; lo = Math.floor(lo / step) * step;
        const yv = v => top + ch * (1 - (v - lo) / (hi - lo));
        // légende
        let lx = M + ax; doc.font('Helvetica').fontSize(8);
        for (const s of b.series) { doc.rect(lx, y0 + 2, 8, 8).fill(hex(s.color)); doc.fillColor(C.text); T(s.name, lx + 11, y0 + 2, {}); lx += 24 + doc.widthOfString(clean(s.name)); }
        for (let v = lo; v <= hi + 1e-9; v += step) {
          doc.moveTo(M + ax, yv(v)).lineTo(M + W, yv(v)).lineWidth(.5).strokeColor(v === 0 ? '#9aa0c9' : C.line).stroke();
          doc.fillColor(C.muted).fontSize(7); T(shortEur(v), M, yv(v) - 3, { width: ax - 6, align: 'right' });
        }
        const n = b.labels.length, gw = cw / n, bars = b.series.filter(s => s.type !== 'line'), bw = Math.min(26, gw * .8 / Math.max(1, bars.length));
        b.labels.forEach((lab, i) => {
          const cx = M + ax + gw * i + gw / 2;
          if (b.stacked) { let acc = 0; const sw = Math.min(40, gw * .7); for (const s of bars) { const v = Math.max(0, s.data[i] ?? 0); if (!v) continue; doc.rect(cx - sw / 2 + 1, yv(acc + v), sw - 2, yv(acc) - yv(acc + v)).fill(hex(s.color)); acc += v; } }
          else bars.forEach((s, k) => {
            const v = s.data[i] ?? 0, x = cx - bw * bars.length / 2 + k * bw;
            doc.rect(x + 1, Math.min(yv(v), yv(0)), bw - 2, Math.abs(yv(v) - yv(0))).fill(hex(s.color));
          });
          doc.fillColor(C.muted).fontSize(7); T(lab, cx - gw / 2, top + ch + 5, { width: gw, align: 'center' });
        });
        for (const s of b.series.filter(s => s.type === 'line')) {
          doc.lineWidth(2).strokeColor(hex(s.color));
          s.data.forEach((v, i) => { const x = M + ax + gw * i + gw / 2; i ? doc.lineTo(x, yv(v)) : doc.moveTo(x, yv(v)); }); doc.stroke();
          s.data.forEach((v, i) => doc.circle(M + ax + gw * i + gw / 2, yv(v), 2.2).fill(hex(s.color)));
        }
        doc.y = y0 + H + 12;
      } else if (b.t === 'table') {
        const tot = b.columns.reduce((s, c) => s + (c.w || 1), 0), fs_ = b.fontSize || 8.5, pad = b.fit ? 2 : 4, rh = fs_ + 2 * pad - 1;
        const cols = b.columns.map(c => ({ ...c, pw: W * (c.w || 1) / tot }));
        if (b.keep || b.fit) { const th = tableH(b); if (th <= usable() && doc.y + th > BOTTOM()) doc.addPage(); }
        const header = () => {
          ensure(rh * 6); const y = doc.y; doc.font('Helvetica-Bold').fontSize(fs_); const hh = Math.max(rh, ...cols.map(c => doc.heightOfString(clean(c.title), { width: c.pw - 8 }) + 2 * pad - 1));
          doc.rect(M, y, W, hh + 3).fill('#e6e8fc'); doc.rect(M, y + hh + 1, W, 2).fill(C.primary);
          let x = M; doc.fillColor(C.deep);
          for (const c of cols) { doc.text(clean(c.title), x + 4, y + pad, { width: c.pw - 8, align: c.align || 'left' }); x += c.pw; }
          doc.y = y + hh + 3;
        };
        header();
        b.rows.forEach((r, ri) => {
          // hauteur de ligne : la cellule la plus haute (les textes longs passent à la ligne)
          let rowH = rh;
          if (!r.section) for (const [ci, cell] of r.cells.entries()) { const o = typeof cell === 'object' && cell ? cell : { text: cell }; doc.font(r.bold || o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs_); rowH = Math.max(rowH, doc.heightOfString(clean(o.text), { width: cols[ci].pw - (o.dot ? 19 : 8) }) + 2 * pad - 1); }
          if (doc.y + rowH > BOTTOM()) { doc.addPage(); header(); }
          const y = doc.y; if (r.section) {
            doc.rect(M, y, W, rh).fill('#eceefd'); doc.rect(M, y, 3, rh).fill('#ec4899'); doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(fs_); T(r.section, M + 4, y + pad, { width: W - 8 }); doc.y = y + rh; return;
          }
          if (r.flag && LV[r.flag]) { doc.rect(M, y, W, rowH).fill(LV[r.flag].bg); doc.rect(M, y, 3, rowH).fill(LV[r.flag].c); }
          else if (ri % 2) doc.rect(M, y, W, rowH).fill('#f8f8ff');
          let x = M;
          r.cells.forEach((cell, ci) => {
            const c = cols[ci], o = typeof cell === 'object' && cell ? cell : { text: cell };
            doc.font(r.bold || o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs_).fillColor(o.color ? hex(o.color) : C.text);
            let tx = x + 4;
            if (o.dot) { doc.circle(x + 8, y + pad + fs_ / 2, 3).fill(hex(o.dot)); doc.fillColor(o.color ? hex(o.color) : C.text); tx = x + 15; }
            doc.text(clean(o.text), tx, y + pad, { width: x + c.pw - tx - 4, align: c.align || 'left' });
            x += c.pw;
          });
          doc.moveTo(M, y + rowH).lineTo(M + W, y + rowH).lineWidth(.3).strokeColor(C.line).stroke();
          doc.y = y + rowH;
        });
        doc.y += 8;
      }
    }

    // ---- pieds de page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      // le pied de page se trouve dans la marge basse : sans cela, pdfkit crée une page supplémentaire pour chaque ligne
      doc.page.margins.bottom = 0;
      const y = doc.page.height - 32;
      if (i > 0) doc.rect(0, 0, PW, 6).fill(grad(0, PW, '#4f46e5', '#ec4899'));
      doc.rect(M, y - 7, W, 1.5).fill(grad(M, M + W, '#c7c9ff', '#f9c6e0'));
      doc.fillColor(C.muted).font('Helvetica').fontSize(8);
      doc.text(clean((spec.copyright ? spec.copyright + ' · ' : '') + 'Comptes · ' + spec.title), M, y, { lineBreak: false, width: W / 2 + 60 });
      doc.roundedRect(M + W - 62, y - 3, 62, 15, 7).fill('#eef0ff'); doc.fillColor(C.deep).font('Helvetica-Bold').fontSize(8);
      doc.text(`${i + 1} / ${range.count}`, M + W - 62, y + 1, { lineBreak: false, width: 62, align: 'center' });
    }
    doc.end();
  });
}

function niceStep(range, ticks) {
  const raw = range / ticks, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const shortEur = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/[  ]/g, ' ') + ' k' : String(Math.round(v));
