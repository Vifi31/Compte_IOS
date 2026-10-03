// Extraction des opérations des relevés PDF La Banque Postale -> data/operations.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { RELEVES_DIR } from '../lib/paths.mjs';
export { RELEVES_DIR };
const DESC_MIN_X = 80, AMOUNT_MIN_X = 410, CREDIT_MIN_X = 470;
const AMOUNT_RE = /^\d{1,3}(?: \d{3})*,\d{2}$/;
const num = s => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
const ACCOUNT_TYPES = [
  ['Compte Courant Postal', 'CCP'], ['Compte Épargne Logement', 'CEL'], ['Plan Épargne Logement', 'PEL'],
  ['Livret A', 'LIVRET_A'], ['Livret Développement Durable et Solidaire', 'LDDS'],
];

async function readPage(page) {
  const tc = await page.getTextContent();
  const items = tc.items.filter(i => i.str.trim() && i.transform[5] > 70).map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
  // regroupe par ligne (y proche)
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of items) {
    const l = lines.find(l => Math.abs(l.y - it.y) <= 2.5);
    if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.s).join(' '); }
  return lines;
}

export async function parseStatement(file) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true }).promise;
  const out = { file: path.basename(file), accounts: {}, ops: [], checks: [] };
  let stmtDate = null, current = null, row = null, cur = null;
  const flush = () => { if (row) { cur.ops.push(row); row = null; } };

  for (let p = 1; p <= doc.numPages; p++) {
    const lines = await readPage(await doc.getPage(p));
    if (p >= 2 && !out.holder && lines[1] && /^(M|MR|MME|MLLE)\.? [A-ZÀ-Ý' -]{3,}$/.test(lines[1].text)) out.holder = lines[1].text;
    let inTable = false;
    for (const l of lines) {
      const t = l.text;
      const m = t.match(/\|\s*(\d\d)\/(\d\d)\/(\d{4})/);
      if (m && !stmtDate) stmtDate = { d: +m[1], m: +m[2], y: +m[3] };
      if (/^Situation de vos comptes/.test(t)) { current = null; inTable = false; continue; }
      // En-tête de compte (page de détail) : "Compte X n° ..." sans solde en fin de ligne
      const hdr = ACCOUNT_TYPES.find(([n]) => t.startsWith(n) || t.startsWith('Vos opérations ' + n));
      const hm = t.match(/n°\s*([\d ]+\s?[A-Z]?\s?\d*)\s*(\(suite\))?$/);
      if (hdr && /n°/.test(t) && !/¤/.test(t)) {
        flush();
        const raw = t.replace(/^Vos opérations\s*/, '').replace(/\s*\(suite\)\s*$/, '');
        const num_ = raw.split('n°')[1].replace(/\s/g, '');
        current = num_;
        out.accounts[num_] ??= { number: num_, type: hdr[1], name: hdr[0], ops: [] };
        cur = out.accounts[num_];
        inTable = true;
        continue;
      }
      // Ligne de synthèse page 1 : "Compte ... n° X + 1 671,47 ¤"
      if (hdr && /¤/.test(t) && /n°/.test(t)) {
        const num_ = t.split('n°')[1].replace(/[+\-].*$/, '').replace(/\s/g, '');
        out.accounts[num_] ??= { number: num_, type: hdr[1], name: hdr[0], ops: [] };
        const b = t.match(/([+-])s*([d ]+,dd)s*¤/);
        if (b) out.accounts[num_].summaryBalance = (b[1] === '-' ? -1 : 1) * num(b[2]);
        continue;
      }
      if (/^IBAN :/.test(t) && cur) { cur.iban = t.match(/IBAN : ([A-Z0-9 ]+?) \|/)?.[1]; continue; }
      if (!current) continue;
      if (/^Date\b.*Opérations/.test(t) || (l.items[0]?.s === 'Date' && l.items[1]?.s === 'Opérations')) { inTable = true; continue; }
      if (!inTable) continue;

      const amounts = l.items.filter(i => i.x >= AMOUNT_MIN_X && AMOUNT_RE.test(i.s));
      if (/Ancien solde/.test(t)) {
        flush(); const a = amounts[0];
        if (a) cur.opening = (a.x >= CREDIT_MIN_X ? 1 : -1) * num(a.s);
        continue;
      }
      if (/Nouveau solde/.test(t)) {
        flush(); const a = amounts[0];
        if (a) cur.closing = (a.x >= CREDIT_MIN_X ? 1 : -1) * num(a.s);
        const d = t.match(/(\d\d)\/(\d\d)\/(\d{4})/); if (d) cur.closingDate = `${d[3]}-${d[2]}-${d[1]}`;
        continue;
      }
      if (/Total des opérations/.test(t)) {
        flush();
        cur.totalDebit = amounts.filter(a => a.x < CREDIT_MIN_X).reduce((s, a) => s + num(a.s), 0);
        cur.totalCredit = amounts.filter(a => a.x >= CREDIT_MIN_X).reduce((s, a) => s + num(a.s), 0);
        continue;
      }
      const dateIt = l.items.find(i => i.x < 75 && /^\d\d\/\d\d$/.test(i.s));
      if (dateIt) {
        flush();
        row = { date: dateIt.s, debit: 0, credit: 0, desc: [] };
      }
      if (!row) continue;
      for (const a of amounts) row[a.x >= CREDIT_MIN_X ? 'credit' : 'debit'] += num(a.s);
      const d = l.items.filter(i => i.x >= DESC_MIN_X && !(i.x >= AMOUNT_MIN_X && AMOUNT_RE.test(i.s))).map(i => i.s).join(' ');
      if (d) row.desc.push(d);
    }
    flush();
  }
  // Construit les opérations finales
  for (const acc of Object.values(out.accounts)) {
    const sum = { d: 0, c: 0 };
    acc.ops.forEach((r, idx) => {
      const [dd, mm] = r.date.split('/').map(Number);
      const year = mm > stmtDate.m ? stmtDate.y - 1 : stmtDate.y;
      const amount = Math.round((r.credit - r.debit) * 100) / 100;
      sum.d += r.debit; sum.c += r.credit;
      out.ops.push({
        id: `${out.file.replace(/\.pdf$/i, '')}#${acc.number}#${idx}`,
        account: acc.number, date: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`,
        amount, label: r.desc[0] ?? '', details: r.desc.slice(1).join(' | '), statement: out.file,
      });
    });
    if (acc.totalDebit !== undefined) {
      const ok = Math.abs(sum.d - acc.totalDebit) < 0.005 && Math.abs(sum.c - acc.totalCredit) < 0.005;
      const balOk = acc.opening === undefined || Math.abs(acc.opening + sum.c - sum.d - acc.closing) < 0.005;
      out.checks.push({ account: acc.number, ok: ok && balOk, parsed: [sum.d, sum.c], expected: [acc.totalDebit, acc.totalCredit], opening: acc.opening, closing: acc.closing });
    }
  }
  out.statementDate = stmtDate;
  return out;
}

export async function parseAll() {
  const files = fs.readdirSync(RELEVES_DIR).filter(f => /\.pdf$/i.test(f)).sort();
  const results = [];
  for (const f of files) {
    try { results.push(await parseStatement(path.join(RELEVES_DIR, f))); }
    catch (e) { results.push({ file: f, error: String(e.message || e), accounts: {}, ops: [], checks: [] }); }
  }
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const res = await parseAll();
  let bad = 0;
  for (const r of res) {
    console.log(r.file, r.ops.length, 'ops');
    for (const c of r.checks) { if (!c.ok) bad++; console.log('  ', c.ok ? 'OK ' : 'KO ', c.account, JSON.stringify(c)); }
  }
  console.log(bad ? `${bad} contrôle(s) en échec` : 'Tous les contrôles OK');
}
