'use strict';
// ============ Rapports PDF ============
// Le navigateur calcule les chiffres (mêmes règles que l'écran) et décrit le document ; le serveur le met en page en PDF.
const RP = { green: '#10b981', red: '#ef4444', indigo: '#6366f1', amber: '#f59e0b', blue: '#0ea5e9', violet: '#8b5cf6' };

function rpScopeLabel() {
  if (S.scope === 'courants') return 'Comptes courants';
  if (S.scope === 'tous') return 'Tous les comptes';
  const a = S.data.accounts.find(x => x.number === S.scope); return a ? accName(a) : '';
}
function rpPeriodLabel(a, b) { return a === b ? monthLabel(a, true) : `${monthLabel(a, true)} à ${monthLabel(b, true)}`; }
const rpMonth = (m, n) => n > 12 ? m.slice(5) + '/' + m.slice(2, 4) : monthLabel(m);
const rpPct = (x, t) => t ? (x / t * 100).toFixed(1).replace('.', ',') + ' %' : '–';

/** Texte Markdown (analyse IA ou locale) -> blocs PDF ; les sections « vigilance / risques » deviennent des encadrés colorés. */
function mdToPdfBlocks(text) {
  const out = [], VIG = /vigilance|risque|alerte|attention|faiblesse|danger|mise en garde/i, GOOD = /points? forts?|atouts?|positif|bonnes? pratiques?/i;
  const strip = x => String(x).replace(/\*\*|__|`/g, '').trim();
  let mode = null, items = [], title = '';
  const flush = () => { if (mode === 'vigil' && items.length) out.push({ t: 'vigil', title, items }); else if (mode === 'good' && items.length) out.push({ t: 'callout', level: 'good', title, items: items.map(i => i.text) }); items = []; };
  const head = h => { flush(); title = strip(h).replace(/^\d+[.)]\s*/, ''); mode = VIG.test(title) ? 'vigil' : GOOD.test(title) ? 'good' : null; if (!mode) out.push({ t: 'h2', text: strip(h) }); };
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const l = raw.trim(); if (!l) continue; let m;
    if ((m = l.match(/^#{1,4}\s+(.*)$/)) || (m = l.match(/^\*\*(.{3,90}?)\*\*\s*:?$/))) { head(m[1]); continue; }
    const bullet = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/), body = bullet ? bullet[1] : l.replace(/^>\s?/, '');
    if (mode === 'vigil') {
      const bad = /⛔|critique|insuffisan|manque|déficit|négati|non soldé|impossible/i.test(body), t = body.match(/^\*\*(.+?)\*\*\s*[:\-–]?\s*(.*)$/);
      items.push(t && t[2] ? { level: bad ? 'bad' : 'warn', title: strip(t[1]), text: strip(t[2]) } : { level: bad ? 'bad' : 'warn', text: strip(body) });
    } else if (mode === 'good') items.push({ text: strip(body) });
    else out.push(bullet ? { t: 'p', text: '•  ' + strip(body), indent: 12 } : { t: 'p', text: strip(body) });
  }
  flush(); return out;
}

function reportSynthese() {
  const ops = scopedOps(), A = analyze(ops), C = cats(), range = periodRange(), months = monthsIn(range), nm = Math.max(1, months.length);
  const net = A.income - A.expense;
  const expRows = [...A.byCat].filter(([id, v]) => C.get(id).kind === 'expense' && v > 0).sort((a, b) => b[1] - a[1]);
  const incRows = [...A.byCat].filter(([id, v]) => C.get(id).kind === 'income' && v > 0).sort((a, b) => b[1] - a[1]);
  const cnt = new Map(); ops.forEach(o => cnt.set(o.categoryId, (cnt.get(o.categoryId) ?? 0) + 1));
  const top = new Map();
  const vig = [], defMonths = months.filter(m => (A.byMonth.get(m)?.expense ?? 0) > (A.byMonth.get(m)?.income ?? 0));
  if (defMonths.length) vig.push({ level: defMonths.length > nm / 2 ? 'bad' : 'warn', title: `Dépenses supérieures aux revenus : ${defMonths.length} mois sur ${nm}`, text: defMonths.slice(0, 8).map(m => monthLabel(m)).join(', ') + (defMonths.length > 8 ? '…' : '') });
  if (A.income > 0 && net / A.income < 0.05) vig.push({ level: net < 0 ? 'bad' : 'warn', title: net < 0 ? 'Épargne négative sur la période' : 'Taux d’épargne faible', text: `Épargne nette : ${eur0(net)} (${rpPct(net, A.income)} des revenus).` });
  if (expRows[0] && A.expense && expRows[0][1] / A.expense > 0.35) vig.push({ level: 'warn', title: 'Dépenses concentrées : ' + C.get(expRows[0][0]).name, text: `${rpPct(expRows[0][1], A.expense)} du total des dépenses (${eur0(expRows[0][1])}).` });
  S.data.accounts.filter(a => a.balance < 0).forEach(a => vig.push({ level: 'bad', title: 'Solde négatif : ' + accName(a), text: 'Solde actuel ' + eur(a.balance) + '.' }));
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind === 'expense' && o.amount < 0) { const e = top.get(o.title) ?? { t: o.title, c, v: 0, n: 0 }; e.v -= o.amount; e.n++; top.set(o.title, e); } }
  return {
    title: 'Synthèse financière', file: 'synthese', subtitle: `${rpScopeLabel()} · ${rpPeriodLabel(...range)}`,
    blocks: [
      { t: 'kpis', items: [
        { label: 'Dépenses', value: eur0(A.expense), sub: eur0(A.expense / nm) + ' / mois', color: '#ef4444' },
        { label: 'Revenus', value: eur0(A.income), sub: eur0(A.income / nm) + ' / mois', color: '#10b981' },
        { label: 'Épargne nette', value: signed(Math.round(net)).replace(/,00/, ''), sub: rpPct(net, A.income) + ' des revenus', color: '#6366f1', alert: net < 0 },
        { label: 'Patrimoine (tous comptes)', value: eur0(sum(S.data.accounts.map(a => a.balance))), sub: S.data.accounts.length + ' comptes', color: '#0ea5e9' }] },
      { t: 'vigil', title: 'Points de vigilance', items: vig, empty: 'Aucun mois déficitaire, épargne positive et aucun compte à découvert sur la période.' },
      { t: 'h2', text: 'Dépenses par catégorie' },
      { t: 'hbars', items: expRows.slice(0, 12).map(([id, v]) => ({ label: C.get(id).name, value: v, text: `${eur0(v)} · ${rpPct(v, A.expense)}`, color: C.get(id).color })) },
      { t: 'h2', text: 'Évolution mensuelle' },
      { t: 'vbars', labels: months.map(m => rpMonth(m, months.length)), series: [
        { name: 'Revenus', color: RP.green, data: months.map(m => Math.round(A.byMonth.get(m)?.income ?? 0)) },
        { name: 'Dépenses', color: RP.red, data: months.map(m => Math.round(A.byMonth.get(m)?.expense ?? 0)) },
        { name: 'Solde du mois', color: RP.indigo, type: 'line', data: months.map(m => Math.round((A.byMonth.get(m)?.income ?? 0) - (A.byMonth.get(m)?.expense ?? 0))) }] },
      { t: 'h2', text: 'Détail par catégorie' },
      { t: 'table', columns: [{ title: 'Catégorie', w: 3 }, { title: 'Opérations', w: 1, align: 'right' }, { title: 'Total', w: 1.4, align: 'right' }, { title: 'Moyenne / mois', w: 1.4, align: 'right' }, { title: '% du total', w: 1, align: 'right' }], rows: [
        { section: 'Dépenses' }, ...expRows.map(([id, v]) => ({ cells: [{ text: C.get(id).name, dot: C.get(id).color }, cnt.get(id) ?? 0, eur0(v), eur0(v / nm), rpPct(v, A.expense)] })),
        { bold: true, cells: ['Total dépenses', sum(expRows.map(([id]) => cnt.get(id) ?? 0)), eur0(A.expense), eur0(A.expense / nm), '100 %'] },
        { section: 'Revenus' }, ...incRows.map(([id, v]) => ({ cells: [{ text: C.get(id).name, dot: C.get(id).color }, cnt.get(id) ?? 0, eur0(v), eur0(v / nm), rpPct(v, A.income)] })),
        { bold: true, cells: ['Total revenus', sum(incRows.map(([id]) => cnt.get(id) ?? 0)), eur0(A.income), eur0(A.income / nm), '100 %'] }] },
      { t: 'h2', text: 'Principaux postes de dépense' },
      { t: 'table', columns: [{ title: 'Libellé', w: 3 }, { title: 'Catégorie', w: 2 }, { title: 'Opérations', w: 1, align: 'right' }, { title: 'Total', w: 1.2, align: 'right' }], rows:
        [...top.values()].sort((a, b) => b.v - a.v).slice(0, 15).map(r => ({ cells: [r.t, { text: r.c.name, dot: r.c.color }, r.n, eur0(r.v)] })) },
      { t: 'h2', text: 'Soldes des comptes' },
      { t: 'table', columns: [{ title: 'Compte', w: 3 }, { title: 'Type', w: 1.5 }, { title: 'Solde', w: 1.5, align: 'right' }], rows:
        S.data.accounts.map(a => ({ cells: [accName(a), a.name, { text: eur(a.balance), color: a.balance < 0 ? '#ef4444' : undefined }] })) },
    ],
  };
}

function reportOperations(opt) {
  const C = cats(), A = Object.fromEntries(S.data.accounts.map(a => [a.number, a]));
  let ops = scopedOps().filter(o => opt.internal || C.get(o.categoryId)?.kind !== 'transfer');
  ops = ops.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const cell = o => [fdate(o.date), o.title, { text: C.get(o.categoryId)?.name ?? '', dot: C.get(o.categoryId)?.color }, accName(A[o.account]), { text: signed(o.amount), color: o.amount < 0 ? '#ef4444' : '#10b981' }];
  const cols = [{ title: 'Date', w: 1 }, { title: 'Libellé', w: 3.4 }, { title: 'Catégorie', w: 2 }, { title: 'Compte', w: 2 }, { title: 'Montant', w: 1.3, align: 'right' }];
  let rows;
  if (opt.group === 'cat') {
    rows = [];
    const by = new Map(); ops.forEach(o => { (by.get(o.categoryId) ?? by.set(o.categoryId, []).get(o.categoryId)).push(o); });
    for (const [id, list] of [...by].sort((a, b) => Math.abs(sum(b[1].map(o => o.amount))) - Math.abs(sum(a[1].map(o => o.amount))))) {
      rows.push({ section: `${C.get(id)?.name ?? id} — ${list.length} opération(s)` }, ...list.map(o => ({ cells: cell(o) })), { bold: true, cells: ['', 'Sous-total', '', '', signed(sum(list.map(o => o.amount)))] });
    }
  } else rows = ops.map(o => ({ cells: cell(o) }));
  rows.push({ bold: true, cells: ['', `Total (${ops.length} opérations)`, '', '', signed(sum(ops.map(o => o.amount)))] });
  return { title: 'Opérations détaillées', file: 'operations', subtitle: `${rpScopeLabel()} · ${rpPeriodLabel(...periodRange())}`, blocks: [{ t: 'table', fontSize: 8, columns: cols, rows }] };
}

function reportCompare() {
  S.cmp ??= cmpDefaults();
  const P = S.cmp, A = cmpData(P.aFrom, P.aTo), B = cmpData(P.bFrom, P.bTo), C = cats();
  const f = (d, x) => P.mode === 'avg' ? x / d.n : x;
  const eA = f(A, A.A.expense), eB = f(B, B.A.expense), iA = f(A, A.A.income), iB = f(B, B.A.income);
  const dl = (a, b) => `${a - b >= 0 ? '+' : ''}${Math.round(a - b)} € (${b ? ((a - b) / Math.abs(b) * 100).toFixed(1).replace('.', ',') : '–'} %)`;
  const rows = S.data.categories.filter(c => c.kind !== 'transfer').map(c => ({ c, a: f(A, A.A.byCat.get(c.id) ?? 0), b: f(B, B.A.byCat.get(c.id) ?? 0) })).filter(r => r.a || r.b);
  const exp = rows.filter(r => r.c.kind === 'expense').sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)), inc = rows.filter(r => r.c.kind === 'income').sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  const trow = (r, kind) => { const d = r.a - r.b, good = d === 0 ? null : (d > 0) === (kind === 'income'); return { cells: [{ text: r.c.name, dot: r.c.color }, eur0(r.a), eur0(r.b), { text: signed(Math.round(d)).replace(/,00/, ''), color: good == null ? undefined : good ? '#10b981' : '#ef4444' }, r.b ? (d > 0 ? '+' : '') + (d / r.b * 100).toFixed(0) + ' %' : 'nouveau'] }; };
  const vig = [];
  if (eB && eA > eB * 1.1) vig.push({ level: 'warn', title: 'Dépenses en hausse', text: `Période A : ${eur0(eA)} contre ${eur0(eB)} en période B (${dl(eA, eB)}).` });
  if (iB && iA < iB * 0.9) vig.push({ level: 'warn', title: 'Revenus en baisse', text: `Période A : ${eur0(iA)} contre ${eur0(iB)} en période B (${dl(iA, iB)}).` });
  if (iA - eA < 0) vig.push({ level: 'bad', title: 'Épargne négative sur la période A', text: `Solde : ${eur0(iA - eA)}.` });
  exp.filter(r => r.a - r.b > 30 && (r.b ? (r.a - r.b) / r.b > 0.2 : r.a > 50)).sort((x, y) => (y.a - y.b) - (x.a - x.b)).slice(0, 5).forEach(r => vig.push({ level: (r.a - r.b) / Math.max(r.b, 1) > 0.5 ? 'bad' : 'warn', title: 'Hausse : ' + r.c.name, text: `${eur0(r.b)} → ${eur0(r.a)} (${dl(r.a, r.b)}).` }));
  const mv = [...new Set([...A.titles.keys(), ...B.titles.keys()])].map(t => ({ t, c: (A.titles.get(t) ?? B.titles.get(t)).c, a: f(A, A.titles.get(t)?.v ?? 0), b: f(B, B.titles.get(t)?.v ?? 0) })).map(r => ({ ...r, d: r.a - r.b }));
  const mvTable = arr => ({ t: 'table', columns: [{ title: 'Poste', w: 3 }, { title: 'Catégorie', w: 2 }, { title: 'B', w: 1, align: 'right' }, { title: 'A', w: 1, align: 'right' }, { title: 'Écart', w: 1, align: 'right' }], rows: arr.map(r => ({ cells: [r.t, { text: r.c.name, dot: r.c.color }, eur0(r.b), eur0(r.a), signed(Math.round(r.d)).replace(/,00/, '')] })) });
  return {
    title: 'Comparaison de deux périodes', file: 'comparaison', subtitle: `A : ${rpPeriodLabel(P.aFrom, P.aTo)}  ·  B : ${rpPeriodLabel(P.bFrom, P.bTo)}  ·  ${rpScopeLabel()}`,
    blocks: [
      { t: 'text', text: P.mode === 'avg' ? 'Valeurs exprimées en moyenne mensuelle.' : `Totaux sur la période (A : ${A.n} mois, B : ${B.n} mois).` },
      { t: 'kpis', items: [
        { label: 'Dépenses (A vs B)', value: eur0(eA), sub: 'B : ' + eur0(eB) + ' · ' + dl(eA, eB), color: '#ef4444' },
        { label: 'Revenus (A vs B)', value: eur0(iA), sub: 'B : ' + eur0(iB) + ' · ' + dl(iA, iB), color: '#10b981' },
        { label: 'Épargne (A vs B)', value: eur0(iA - eA), sub: 'B : ' + eur0(iB - eB), color: '#6366f1' }] },
      { t: 'vigil', title: 'Points de vigilance', items: vig, empty: 'Aucune hausse marquée des dépenses ni baisse des revenus entre les deux périodes.' },
      { t: 'h2', text: 'Dépenses par catégorie' },
      { t: 'vbars', height: 190, labels: exp.slice(0, 10).map(r => r.c.name.length > 14 ? r.c.name.slice(0, 13) + '.' : r.c.name), series: [{ name: 'Période A', color: '#6366f1', data: exp.slice(0, 10).map(r => Math.round(r.a)) }, { name: 'Période B', color: '#f59e0b', data: exp.slice(0, 10).map(r => Math.round(r.b)) }] },
      { t: 'h2', text: 'Détail par catégorie' },
      { t: 'table', columns: [{ title: 'Catégorie', w: 3 }, { title: 'A', w: 1.2, align: 'right' }, { title: 'B', w: 1.2, align: 'right' }, { title: 'Écart', w: 1.2, align: 'right' }, { title: '%', w: 1, align: 'right' }], rows: [
        { section: 'Dépenses' }, ...exp.map(r => trow(r, 'expense')), { bold: true, cells: ['Total dépenses', eur0(eA), eur0(eB), signed(Math.round(eA - eB)), ''] },
        { section: 'Revenus' }, ...inc.map(r => trow(r, 'income')), { bold: true, cells: ['Total revenus', eur0(iA), eur0(iB), signed(Math.round(iA - iB)), ''] }] },
      { t: 'h2', text: 'Plus fortes hausses' }, mvTable(mv.filter(r => r.d > 0).sort((x, y) => y.d - x.d).slice(0, 10)),
      { t: 'h2', text: 'Plus fortes baisses' }, mvTable(mv.filter(r => r.d < 0).sort((x, y) => x.d - y.d).slice(0, 10)),
    ],
  };
}

function reportForecast(year) {
  const M = forecastModel(year), rows = M.rows;
  const expRows = rows.filter(r => r.c.kind === 'expense' && (r.annual || r.tot)), incRows = rows.filter(r => r.c.kind === 'income' && (r.annual || r.tot));
  const totE = sum(M.exp), totI = sum(M.inc), net = totI - totE;
  const avgE = totE / 12, vig = [], defM = MOIS.filter((m, i) => M.exp[i] > M.inc[i]), spikeM = MOIS.filter((m, i) => M.exp[i] > avgE * 1.3);
  if (net < 0) vig.push({ level: 'bad', title: 'Budget déficitaire sur l’année', text: `Dépenses prévues ${eur0(totE)} pour ${eur0(totI)} de revenus : déficit de ${eur0(-net)}.` });
  else if (totI && net / totI < 0.05) vig.push({ level: 'warn', title: 'Taux d’épargne prévu faible', text: `${rpPct(net, totI)} des revenus (${eur0(net)}).` });
  if (defM.length) vig.push({ level: 'warn', title: `${defM.length} mois déficitaire(s)`, text: defM.join(', ') + '.' });
  if (spikeM.length) vig.push({ level: 'warn', title: 'Mois de dépenses élevées (+30 % vs la moyenne)', text: spikeM.join(', ') + '.' });
  const cols = [{ title: 'Catégorie', w: 3.2 }, ...MOIS.map(m => ({ title: m, w: 1, align: 'right' })), { title: 'Total', w: 1.4, align: 'right' }];
  const line = r => ({ cells: [{ text: r.c.name, dot: r.c.color }, ...r.val.map(x => Math.round(x).toLocaleString('fr-FR')), { text: eur0(r.annual), bold: true }] });
  return {
    title: `Prévision budgétaire ${year + 1}`, file: 'prevision-' + (year + 1), layout: 'landscape', subtitle: `Base ${year} (${M.complete.length} mois complets) · ${M.F.method === 'season' ? 'saisonnalité' : 'moyenne mensuelle'} · ${rpScopeLabel()}`,
    blocks: [
      { t: 'kpis', items: [
        { label: 'Dépenses prévues', value: eur0(totE), sub: eur0(totE / 12) + ' / mois', color: '#ef4444' }, { label: 'Revenus prévus', value: eur0(totI), sub: eur0(totI / 12) + ' / mois', color: '#10b981' },
        { label: 'Épargne prévue', value: signed(Math.round(net)).replace(/,00/, ''), sub: rpPct(net, totI) + ' des revenus', color: '#6366f1' }] },
      { t: 'vigil', title: 'Points de vigilance', items: vig, empty: 'Aucun mois déficitaire ni pic de dépenses dans le budget prévu.' },
      { t: 'text', text: `Ajustements globaux : dépenses ${M.F.pctExp || 0} %, revenus ${M.F.pctInc || 0} %. ${Object.keys(M.F.cells).length} catégorie(s) saisie(s) manuellement.` },
      { t: 'h2', text: 'Trajectoire mensuelle' },
      { t: 'vbars', height: 160, labels: MOIS, series: [{ name: 'Revenus', color: RP.green, data: M.inc.map(Math.round) }, { name: 'Dépenses', color: RP.red, data: M.exp.map(Math.round) }, { name: 'Solde du mois', color: RP.indigo, type: 'line', data: M.inc.map((x, i) => Math.round(x - M.exp[i])) }] },
      { t: 'h2', text: 'Détail mensuel par catégorie (€)' },
      { t: 'table', fontSize: 7.5, columns: cols, rows: [
        { section: 'Dépenses' }, ...expRows.map(line), { bold: true, cells: ['Total dépenses', ...M.exp.map(x => Math.round(x).toLocaleString('fr-FR')), eur0(totE)] },
        { section: 'Revenus' }, ...incRows.map(line), { bold: true, cells: ['Total revenus', ...M.inc.map(x => Math.round(x).toLocaleString('fr-FR')), eur0(totI)] },
        { bold: true, cells: ['Épargne du mois', ...M.inc.map((x, i) => Math.round(x - M.exp[i]).toLocaleString('fr-FR')), eur0(net)] }] },
    ],
  };
}

function reportMonthly() {
  const ops = scopedOps(), A = analyze(ops), months = monthsIn(periodRange()), C = cats();
  const cats_ = S.data.categories.filter(c => c.kind === 'expense' && (A.byCat.get(c.id) ?? 0) > 0).sort((a, b) => A.byCat.get(b.id) - A.byCat.get(a.id));
  const cols = [{ title: 'Catégorie', w: 3 }, ...months.map(m => ({ title: monthLabel(m), w: 1, align: 'right' })), { title: 'Total', w: 1.3, align: 'right' }, { title: 'Moy.', w: 1.1, align: 'right' }];
  const rows = cats_.map(c => { const vals = months.map(m => A.byMonth.get(m)?.cat.get(c.id) ?? 0); return { cells: [{ text: c.name, dot: c.color }, ...vals.map(x => x ? Math.round(x).toLocaleString('fr-FR') : '–'), { text: eur0(sum(vals)), bold: true }, eur0(sum(vals) / months.length)] }; });
  const tot = months.map(m => A.byMonth.get(m)?.expense ?? 0), inc = months.map(m => A.byMonth.get(m)?.income ?? 0);
  rows.push({ bold: true, cells: ['Total dépenses', ...tot.map(x => Math.round(x).toLocaleString('fr-FR')), eur0(sum(tot)), eur0(sum(tot) / months.length)] },
    { bold: true, cells: ['Total revenus', ...inc.map(x => Math.round(x).toLocaleString('fr-FR')), eur0(sum(inc)), eur0(sum(inc) / months.length)] });
  void C;
  const avgT = sum(tot) / Math.max(1, months.length), vig = [], defM = months.filter((m, i) => tot[i] > inc[i]), spikeM = months.filter((m, i) => tot[i] > avgT * 1.3);
  if (defM.length) vig.push({ level: defM.length > months.length / 2 ? 'bad' : 'warn', title: `Dépenses supérieures aux revenus : ${defM.length} mois`, text: defM.map(m => monthLabel(m)).join(', ') + '.' });
  if (spikeM.length) vig.push({ level: 'warn', title: 'Mois de dépenses élevées (+30 % vs la moyenne)', text: spikeM.map(m => monthLabel(m) + ' (' + eur0(tot[months.indexOf(m)]) + ')').join(', ') + '.' });
  return {
    title: 'Dépenses mensuelles par catégorie', file: 'mensuel', layout: 'landscape', subtitle: `${rpScopeLabel()} · ${rpPeriodLabel(...periodRange())}`,
    blocks: [
      { t: 'vigil', title: 'Points de vigilance', items: vig, empty: 'Aucun mois déficitaire ni pic de dépenses sur la période.' },
      { t: 'vbars', height: 170, labels: months.map(m => rpMonth(m, months.length)), series: [{ name: 'Revenus', color: RP.green, data: inc.map(Math.round) }, { name: 'Dépenses', color: RP.red, data: tot.map(Math.round) }] },
      { t: 'h2', text: 'Tableau croisé catégories × mois (€)' }, { t: 'table', fontSize: months.length > 10 ? 7 : 8, columns: cols, rows }],
  };
}

/** Options d'impression choisies par l'utilisateur (mémorisées) : orientation, format, graphiques. */
function pdfOptionsAsk(spec) {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('pdfOpts') || '{}'); } catch { /* stockage indisponible */ }
  const hasCharts = (spec.blocks || []).some(b => b.t === 'hbars' || b.t === 'vbars');
  const o = { layout: spec.layout || 'portrait', size: saved.size || 'A4', charts: saved.charts !== false };
  return new Promise(resolve => {
    const seg = (key, items) => h('div', { class: 'seg' }, items.map(([k, l]) => h('button', { type: 'button', class: String(o[key]) === String(k) ? 'on' : '', onclick: e => { o[key] = k; [...e.target.parentNode.children].forEach(b => b.classList.toggle('on', b === e.target)); } }, l)));
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const close = modal('Options du PDF', [
      h('p', { class: 'muted', style: { margin: 0 } }, spec.title),
      h('div', { class: 'field' }, h('label', {}, 'Orientation'), seg('layout', [['portrait', '📄 Portrait'], ['landscape', '🖼️ Paysage']])),
      h('div', { class: 'field' }, h('label', {}, 'Format de papier'), seg('size', [['A4', 'A4 (210 × 297 mm)'], ['A3', 'A3 (297 × 420 mm)']])),
      hasCharts ? h('div', { class: 'field' }, h('label', {}, 'Graphiques'), seg('charts', [[true, '📊 Avec les graphiques'], [false, '🔢 Sans les graphiques']])) : h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Ce document ne contient pas de graphique.'),
      h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Le format et les graphiques sont mémorisés pour les prochains PDF ; l’orientation proposée dépend du document.')],
      c => [h('button', { class: 'btn sec', onclick: () => { c(); finish(null); } }, 'Annuler'),
        h('button', { class: 'btn pdf', onclick: () => { try { localStorage.setItem('pdfOpts', JSON.stringify({ size: o.size, charts: o.charts })); } catch { /* ignoré */ } c(); finish({ layout: o.layout, size: o.size, charts: o.charts }); } }, '📄 Générer le PDF')]);
    const back = document.querySelector('#modalRoot .back'); if (back) new MutationObserver(() => { if (!document.querySelector('#modalRoot .back')) finish(null); }).observe(document.querySelector('#modalRoot'), { childList: true });
  });
}
async function generateReport(spec) {
  const opts = await pdfOptionsAsk(spec); if (!opts) return null;
  spec = { ...spec, ...opts };
  const r = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
  const j = await r.json();
  if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); }
  toast('✅ Rapport généré : ' + j.name);
  window.open('/api/reports/file?name=' + encodeURIComponent(j.name), '_blank');
  return j;
}

const appendNN = (el, ...k) => el.append(...k.filter(x => x != null && x !== false));
async function pageReports(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  let { list } = await (await fetch('/api/reports')).json();
  v.innerHTML = '';
  if (S.page !== 'reports') return;
  S.rp ??= { group: 'date', internal: false, fyear: forecastYears().slice(-1)[0] };
  S.cmp ??= cmpDefaults();
  const years = forecastYears(), P = S.cmp;
  const run = (fn, btn) => async () => { btn.disabled = true; const t = btn.textContent; btn.textContent = 'Génération…'; try { await generateReport(fn()); render(); } catch (e) { btn.disabled = false; btn.textContent = t; } };
  const card = (ico, title, desc, color, opts, build) => {
    const btn = h('button', { class: 'btn', style: { background: color, width: '100%' } }, '📄 Générer le PDF');
    btn.onclick = run(build, btn);
    return h('div', { class: 'bkcard', style: { '--c': color } }, h('div', { class: 'bk-ico' }, ico), h('div', { class: 'bk-t' }, title), h('div', { class: 'muted', style: { minHeight: '52px' } }, desc),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', margin: '8px 0', minHeight: '38px' } }, opts), btn);
  };
  const ctx = h('div', { class: 'tip', style: { marginBottom: '16px' } }, 'Les rapports utilisent les filtres choisis en haut de page : ', h('b', {}, rpScopeLabel()), ' · ', h('b', {}, rpPeriodLabel(...periodRange())), '.');
  v.append(ctx, h('div', { class: 'grid g3' },
    card('📊', 'Synthèse financière', 'Indicateurs, dépenses par catégorie, évolution mensuelle, postes principaux et soldes des comptes. Idéal pour un bilan.', RP.indigo, null, reportSynthese),
    card('🧾', 'Opérations détaillées', 'Liste complète des opérations de la période, par date ou regroupées par catégorie avec sous-totaux.', RP.blue,
      [h('select', { onchange: e => { S.rp.group = e.target.value; } }, [['date', 'Trié par date'], ['cat', 'Groupé par catégorie']].map(([k, l]) => h('option', { value: k, selected: S.rp.group === k }, l))),
        h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, h('input', { type: 'checkbox', checked: S.rp.internal, onchange: e => { S.rp.internal = e.target.checked; } }), 'Inclure les virements internes')], () => reportOperations({ group: S.rp.group, internal: S.rp.internal })),
    card('⚖️', 'Comparaison de deux périodes', `Période A : ${rpPeriodLabel(P.aFrom, P.aTo)} contre période B : ${rpPeriodLabel(P.bFrom, P.bTo)} (réglables dans la page Comparer).`, RP.amber, null, reportCompare),
    card('🔮', 'Prévision budgétaire', 'Budget de l’année suivante, mois par mois, avec vos saisies. Mise en page paysage.', RP.violet,
      [h('select', { onchange: e => { S.rp.fyear = +e.target.value; } }, years.map(y => h('option', { value: y, selected: y === S.rp.fyear }, `Base ${y} → prévision ${y + 1}`)))], () => reportForecast(S.rp.fyear)),
    card('📅', 'Dépenses mensuelles', 'Tableau croisé catégories × mois et graphique revenus/dépenses. Mise en page paysage.', RP.green, null, reportMonthly)));

  // ---- rapports générés : tri par colonne, recherche, sélection multiple, gestion des fichiers
  const RL = S.rpl ??= { key: 'mtime', dir: -1, q: '', sel: new Set(), last: null };
  RL.sel = new Set([...RL.sel].filter(n => list.some(f => f.name === n)));
  const box = h('div', { class: 'card', style: { marginTop: '18px' } });
  const url = (f, dl) => '/api/reports/file?' + (dl ? 'download=1&' : '') + 'name=' + encodeURIComponent(f.name);
  const titleOf = f => f.title || f.name.replace(/_\d{8}-\d{6}\.pdf$/i, '').replace(/[-_]+/g, ' ');
  const fmtOf = f => f.paper ? f.paper + ' · ' + (f.layout === 'landscape' ? 'paysage' : 'portrait') + (f.charts === false ? ' · sans graph.' : '') : '–';
  const post = async (u, body) => { const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); } return j; };
  const COLS = [['title', 'Rapport', ''], ['name', 'Fichier', ''], ['format', 'Format', ''], ['mtime', 'Date', ''], ['size', 'Taille', 'r']];
  const rl = () => {
    const q = RL.q.trim().toLowerCase();
    const rows = list.filter(f => !q || (f.name + ' ' + titleOf(f) + ' ' + (f.subtitle || '')).toLowerCase().includes(q));
    const val = f => RL.key === 'size' ? f.size : RL.key === 'mtime' ? f.mtime : RL.key === 'format' ? fmtOf(f) : RL.key === 'title' ? titleOf(f).toLowerCase() : f.name.toLowerCase();
    rows.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * RL.dir || a.name.localeCompare(b.name));
    const nSel = RL.sel.size, selSize = sum(list.filter(f => RL.sel.has(f.name)).map(f => f.size)), allOn = rows.length > 0 && rows.every(f => RL.sel.has(f.name));
    const master = h('input', { type: 'checkbox', checked: allOn, title: 'Tout sélectionner / désélectionner', onchange: e => { rows.forEach(f => e.target.checked ? RL.sel.add(f.name) : RL.sel.delete(f.name)); rl(); } });
    master.indeterminate = !allOn && rows.some(f => RL.sel.has(f.name));
    const del = async names => { if (!confirm(names.length === 1 ? 'Supprimer « ' + names[0] + ' » ?' : 'Supprimer ces ' + names.length + ' rapports ?')) return; const j = await post('/api/reports/delete', { names }); list = j.list; names.forEach(n => RL.sel.delete(n)); toast('🗑️ ' + j.deleted + ' fichier(s) supprimé(s)'); rl(); };
    const rename = async f => { const to = prompt('Nouveau nom du fichier (sans .pdf) :', f.name.replace(/\.pdf$/i, '')); if (!to || to === f.name.replace(/\.pdf$/i, '')) return; const j = await post('/api/reports/rename', { name: f.name, to }); list = j.list; if (RL.sel.delete(f.name)) RL.sel.add(j.name); toast('✏️ Fichier renommé'); rl(); };
    const tr = (f, idx) => h('tr', { class: RL.sel.has(f.name) ? 'selrow' : '', style: RL.sel.has(f.name) ? { background: 'var(--soft, #eef0ff)' } : {} },
      h('td', { style: { width: '34px' } }, h('input', { type: 'checkbox', checked: RL.sel.has(f.name), onclick: e => {
        if (e.shiftKey && RL.last != null) { const a = Math.min(RL.last, idx), b = Math.max(RL.last, idx); for (let k = a; k <= b; k++) RL.sel.add(rows[k].name); }
        else if (e.target.checked) RL.sel.add(f.name); else RL.sel.delete(f.name);
        RL.last = idx; rl(); } })),
      h('td', {}, h('b', {}, titleOf(f)), f.subtitle ? h('div', { class: 'muted', style: { fontSize: '12px' } }, f.subtitle) : null),
      h('td', { class: 'muted', style: { fontSize: '12.5px' } }, f.name), h('td', { class: 'muted', style: { whiteSpace: 'nowrap', fontSize: '12.5px' } }, fmtOf(f)),
      h('td', { class: 'muted num', style: { whiteSpace: 'nowrap' } }, fmtDT(f.mtime)), h('td', { class: 'r num' }, fmtBytes(f.size)),
      h('td', { class: 'r', style: { whiteSpace: 'nowrap' } },
        h('a', { class: 'icon-btn', title: 'Ouvrir', target: '_blank', href: url(f), style: { textDecoration: 'none' } }, '👁️'),
        h('a', { class: 'icon-btn', title: 'Télécharger', href: url(f, true), style: { textDecoration: 'none' } }, '⬇️'),
        h('button', { class: 'icon-btn', title: 'Renommer', onclick: () => rename(f) }, '✏️'),
        h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => del([f.name]) }, '🗑️')));
    const bulk = nSel ? h('div', { class: 'tip', style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' } },
      h('b', {}, nSel + ' sélectionné' + (nSel > 1 ? 's' : '')), h('span', { class: 'muted' }, fmtBytes(selSize)),
      h('a', { class: 'btn sm', style: { textDecoration: 'none' }, href: '/api/reports/zip?names=' + encodeURIComponent([...RL.sel].join('|')) }, '⬇️ Télécharger (ZIP)'),
      nSel === 1 ? h('a', { class: 'btn sm sec', style: { textDecoration: 'none' }, target: '_blank', href: url({ name: [...RL.sel][0] }) }, '👁️ Ouvrir') : null,
      h('button', { class: 'btn sm sec', style: { color: '#dc2626' }, onclick: () => del([...RL.sel]) }, '🗑️ Supprimer'),
      h('button', { class: 'btn sm sec', onclick: () => { RL.sel.clear(); rl(); } }, 'Tout désélectionner')) : null;
    const th = ([k, l, c]) => h('th', { class: c, style: { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }, title: 'Trier par cette colonne', onclick: () => { if (RL.key === k) RL.dir = -RL.dir; else { RL.key = k; RL.dir = k === 'mtime' || k === 'size' ? -1 : 1; } rl(); } }, l + (RL.key === k ? (RL.dir > 0 ? ' ▲' : ' ▼') : ' ↕'));
    const search = h('input', { type: 'search', placeholder: '🔎 Rechercher un rapport…', value: RL.q, style: { minWidth: '240px' }, oninput: e => { RL.q = e.target.value; const pos = e.target.selectionStart; rl(); const n = box.querySelector('input[type=search]'); n?.focus(); n?.setSelectionRange(pos, pos); } });
    box.innerHTML = '';
    appendNN(box, h('h2', {}, 'Rapports générés (' + list.length + ')', h('small', {}, 'dossier Rapports · ' + fmtBytes(sum(list.map(f => f.size))))),
      list.length ? h('div', { class: 'toolbar', style: { margin: '0 0 12px' } }, search, h('span', { class: 'muted' }, rows.length === list.length ? 'Cliquez sur un en-tête pour trier · Maj + clic pour sélectionner une plage' : rows.length + ' résultat(s) sur ' + list.length)) : null, bulk,
      list.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { style: { width: '34px' } }, master), COLS.map(th), h('th'))), h('tbody', {}, rows.length ? rows.map(tr) : h('tr', {}, h('td', { colspan: 7, class: 'muted', style: { textAlign: 'center', padding: '18px' } }, 'Aucun rapport ne correspond à la recherche.'))))) : h('div', { class: 'muted' }, 'Aucun rapport pour le moment : générez-en un ci-dessus.'));
  };
  v.append(box); rl();
}
