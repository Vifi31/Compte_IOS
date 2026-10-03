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

function reportSynthese() {
  const ops = scopedOps(), A = analyze(ops), C = cats(), range = periodRange(), months = monthsIn(range), nm = Math.max(1, months.length);
  const net = A.income - A.expense;
  const expRows = [...A.byCat].filter(([id, v]) => C.get(id).kind === 'expense' && v > 0).sort((a, b) => b[1] - a[1]);
  const incRows = [...A.byCat].filter(([id, v]) => C.get(id).kind === 'income' && v > 0).sort((a, b) => b[1] - a[1]);
  const cnt = new Map(); ops.forEach(o => cnt.set(o.categoryId, (cnt.get(o.categoryId) ?? 0) + 1));
  const top = new Map();
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind === 'expense' && o.amount < 0) { const e = top.get(o.title) ?? { t: o.title, c, v: 0, n: 0 }; e.v -= o.amount; e.n++; top.set(o.title, e); } }
  return {
    title: 'Synthèse financière', file: 'synthese', subtitle: `${rpScopeLabel()} · ${rpPeriodLabel(...range)}`,
    blocks: [
      { t: 'kpis', items: [
        { label: 'Dépenses', value: eur0(A.expense), sub: eur0(A.expense / nm) + ' / mois', color: '#ef4444' },
        { label: 'Revenus', value: eur0(A.income), sub: eur0(A.income / nm) + ' / mois', color: '#10b981' },
        { label: 'Épargne nette', value: signed(Math.round(net)).replace(/,00/, ''), sub: rpPct(net, A.income) + ' des revenus', color: '#6366f1' },
        { label: 'Patrimoine (tous comptes)', value: eur0(sum(S.data.accounts.map(a => a.balance))), sub: S.data.accounts.length + ' comptes', color: '#0ea5e9' }] },
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
  const cols = [{ title: 'Catégorie', w: 3.2 }, ...MOIS.map(m => ({ title: m, w: 1, align: 'right' })), { title: 'Total', w: 1.4, align: 'right' }];
  const line = r => ({ cells: [{ text: r.c.name, dot: r.c.color }, ...r.val.map(x => Math.round(x).toLocaleString('fr-FR')), { text: eur0(r.annual), bold: true }] });
  return {
    title: `Prévision budgétaire ${year + 1}`, file: 'prevision-' + (year + 1), layout: 'landscape', subtitle: `Base ${year} (${M.complete.length} mois complets) · ${M.F.method === 'season' ? 'saisonnalité' : 'moyenne mensuelle'} · ${rpScopeLabel()}`,
    blocks: [
      { t: 'kpis', items: [
        { label: 'Dépenses prévues', value: eur0(totE), sub: eur0(totE / 12) + ' / mois', color: '#ef4444' }, { label: 'Revenus prévus', value: eur0(totI), sub: eur0(totI / 12) + ' / mois', color: '#10b981' },
        { label: 'Épargne prévue', value: signed(Math.round(net)).replace(/,00/, ''), sub: rpPct(net, totI) + ' des revenus', color: '#6366f1' }] },
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
  return {
    title: 'Dépenses mensuelles par catégorie', file: 'mensuel', layout: 'landscape', subtitle: `${rpScopeLabel()} · ${rpPeriodLabel(...periodRange())}`,
    blocks: [
      { t: 'vbars', height: 170, labels: months.map(m => rpMonth(m, months.length)), series: [{ name: 'Revenus', color: RP.green, data: inc.map(Math.round) }, { name: 'Dépenses', color: RP.red, data: tot.map(Math.round) }] },
      { t: 'h2', text: 'Tableau croisé catégories × mois (€)' }, { t: 'table', fontSize: months.length > 10 ? 7 : 8, columns: cols, rows }],
  };
}

async function generateReport(spec) {
  const r = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec) });
  const j = await r.json();
  if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); }
  toast('✅ Rapport généré : ' + j.name);
  window.open('/api/reports/file?name=' + encodeURIComponent(j.name), '_blank');
  return j;
}

async function pageReports(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const { list } = await (await fetch('/api/reports')).json();
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

  const rows = list.map(f => h('tr', {}, h('td', {}, h('b', {}, f.name)), h('td', { class: 'muted num' }, fmtDT(f.mtime)), h('td', { class: 'r num' }, fmtBytes(f.size)),
    h('td', { class: 'r', style: { whiteSpace: 'nowrap' } },
      h('a', { class: 'icon-btn', title: 'Ouvrir', target: '_blank', href: '/api/reports/file?name=' + encodeURIComponent(f.name), style: { textDecoration: 'none' } }, '👁️'),
      h('a', { class: 'icon-btn', title: 'Télécharger', href: '/api/reports/file?download=1&name=' + encodeURIComponent(f.name), style: { textDecoration: 'none' } }, '⬇️'),
      h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async () => { await fetch('/api/reports?name=' + encodeURIComponent(f.name), { method: 'DELETE' }); render(); } }, '🗑️'))));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `Rapports générés (${list.length})`, h('small', {}, 'dossier Rapports')),
    list.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Fichier'), h('th', {}, 'Date'), h('th', { class: 'r' }, 'Taille'), h('th'))), h('tbody', {}, rows))) : h('div', { class: 'empty' }, 'Aucun rapport pour le moment.')));
}
