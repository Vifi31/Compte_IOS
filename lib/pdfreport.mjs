// Rendu PDF générique à partir d'une description JSON { title, subtitle, layout, blocks[] }.
import PDFDocument from 'pdfkit';

const C = { primary: '#6366f1', text: '#1b1d3a', muted: '#6b7094', line: '#e3e5f4', soft: '#f3f4fb', good: '#10b981', bad: '#ef4444' };
const clean = s => String(s ?? '').replace(/[  ]/g, ' ').replace(/[^\x09\x0a\x0d\x20-\x7e¡-ÿ€–—’‘“”…•]/g, '');
const hex = c => /^#[0-9a-f]{6}$/i.test(c) ? c : C.primary;

/** Rend le PDF. Avec spec.toc : deux passes (la 1re mesure les numéros de page, la 2e les imprime dans la table des matières). */
export async function renderReport(spec) {
  if (!spec.toc) return (await build(spec, null)).buf;
  const first = await build(spec, { pages: {} });
  return (await build(spec, { pages: first.heads })).buf;
}

function build(spec, toc) {
  return new Promise((resolve, reject) => {
    const heads = {};
    const landscape = spec.layout === 'landscape';
    const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 40, bufferPages: true, info: { Title: clean(spec.title), Author: 'Comptes' } });
    const chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve({ buf: Buffer.concat(chunks), heads })); doc.on('error', reject);
    const M = 40, W = doc.page.width - 2 * M, BOTTOM = () => doc.page.height - 50;
    const ensure = h => { if (doc.y + h > BOTTOM()) doc.addPage(); };
    const T = (s, x, y, o = {}) => doc.text(clean(s), x, y, { lineBreak: false, ...o });

    // ---- en-tête
    doc.rect(0, 0, doc.page.width, 92).fill(C.primary);
    doc.rect(0, 92, doc.page.width, 4).fill('#ec4899');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(22); T(spec.title, M, 26, { width: W });
    doc.font('Helvetica').fontSize(11).fillColor('#e0e1ff'); T(spec.subtitle || '', M, 56, { width: W });
    doc.fontSize(9); T('Généré le ' + new Date().toLocaleString('fr-FR'), M, 74, { width: W });
    doc.y = 116;

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

    for (const b of spec.blocks || []) {
      if (b.t === 'h1') {
        ensure(120); doc.y += 12; mark(b);
        const y = doc.y; doc.roundedRect(M, y, W, 30, 6).fill(C.primary);
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(15); T(b.text, M + 12, y + 8, { width: W - 24 }); doc.y = y + 42;
      } else if (b.t === 'h2') {
        ensure(80); doc.y += 8; mark(b);
        doc.fillColor(C.primary).font('Helvetica-Bold').fontSize(13); T(b.text, M, doc.y, { width: W });
        doc.moveTo(M, doc.y + 17).lineTo(M + W, doc.y + 17).lineWidth(1).strokeColor(C.line).stroke(); doc.y += 26;
      } else if (b.t === 'text') {
        doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
        const h = doc.heightOfString(clean(b.text), { width: W }); ensure(h + 6);
        doc.text(clean(b.text), M, doc.y, { width: W }); doc.y += 6;
      } else if (b.t === 'h3') {
        ensure(46); doc.y += 4; mark(b);
        doc.fillColor(C.text).font('Helvetica-Bold').fontSize(10.5); T(b.text, M, doc.y, { width: W }); doc.y += 17;
      } else if (b.t === 'p') {
        doc.font('Helvetica').fontSize(10).fillColor(C.text);
        const ind = b.indent || 0, h_ = doc.heightOfString(clean(b.text), { width: W - ind }); ensure(h_ + 6);
        doc.text(clean(b.text), M + ind, doc.y, { width: W - ind }); doc.y += 4;
      } else if (b.t === 'pagebreak') {
        doc.addPage();
      } else if (b.t === 'kpis') {
        ensure(78);
        const n = b.items.length, gap = 10, w = (W - gap * (n - 1)) / n, y = doc.y;
        b.items.forEach((k, i) => {
          const x = M + i * (w + gap);
          doc.roundedRect(x, y, w, 64, 8).fill(hex(k.color));
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
        const y0 = doc.y, ax = 46, cw = W - ax, ch = H - 30, top = y0 + 18;
        const all = b.series.flatMap(s => s.data);
        let hi = Math.max(0, ...all), lo = Math.min(0, ...all);
        const step = niceStep((hi - lo) || 1, 4); hi = Math.ceil(hi / step) * step; lo = Math.floor(lo / step) * step;
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
          bars.forEach((s, k) => {
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
        doc.y = y0 + H + 6;
      } else if (b.t === 'table') {
        const tot = b.columns.reduce((s, c) => s + (c.w || 1), 0), fs_ = b.fontSize || 8.5, rh = fs_ + 7;
        const cols = b.columns.map(c => ({ ...c, pw: W * (c.w || 1) / tot }));
        const header = () => {
          ensure(rh * 6); const y = doc.y; doc.rect(M, y, W, rh + 2).fill(C.soft);
          let x = M; doc.font('Helvetica-Bold').fontSize(fs_).fillColor(C.muted);
          for (const c of cols) { T(c.title, x + 4, y + 4, { width: c.pw - 8, align: c.align || 'left', ellipsis: true }); x += c.pw; }
          doc.y = y + rh + 2;
        };
        header();
        b.rows.forEach((r, ri) => {
          if (doc.y + rh > BOTTOM()) { doc.addPage(); header(); }
          const y = doc.y; if (r.section) {
            doc.rect(M, y, W, rh).fill('#e8e9f8'); doc.fillColor(C.text).font('Helvetica-Bold').fontSize(fs_); T(r.section, M + 4, y + 4, { width: W - 8 }); doc.y = y + rh; return;
          }
          if (ri % 2) doc.rect(M, y, W, rh).fill('#fafaff');
          let x = M;
          r.cells.forEach((cell, ci) => {
            const c = cols[ci], o = typeof cell === 'object' && cell ? cell : { text: cell };
            doc.font(r.bold || o.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fs_).fillColor(o.color ? hex(o.color) : C.text);
            let tx = x + 4;
            if (o.dot) { doc.circle(x + 8, y + rh / 2, 3).fill(hex(o.dot)); doc.fillColor(o.color ? hex(o.color) : C.text); tx = x + 15; }
            T(o.text, tx, y + 4, { width: x + c.pw - tx - 4, align: c.align || 'left', ellipsis: true });
            x += c.pw;
          });
          doc.moveTo(M, y + rh).lineTo(M + W, y + rh).lineWidth(.3).strokeColor(C.line).stroke();
          doc.y = y + rh;
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
      doc.moveTo(M, y - 6).lineTo(M + W, y - 6).lineWidth(.5).strokeColor(C.line).stroke();
      doc.fillColor(C.muted).font('Helvetica').fontSize(8);
      doc.text(clean((spec.copyright ? spec.copyright + ' · ' : '') + 'Comptes · ' + spec.title), M, y, { lineBreak: false, width: W / 2 + 60 });
      doc.text(`Page ${i + 1} / ${range.count}`, M + W - 120, y, { lineBreak: false, width: 120, align: 'right' });
    }
    doc.end();
  });
}

function niceStep(range, ticks) {
  const raw = range / ticks, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
const shortEur = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/[  ]/g, ' ') + ' k' : String(Math.round(v));
