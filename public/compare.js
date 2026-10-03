'use strict';
// ============ Comparaison de deux périodes ============
const CMP_COLORS = { a: '#6366f1', b: '#f59e0b' };
const addMonths = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthSpan = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5)) + 1;
const rangeLabel = (a, b) => a === b ? monthLabel(a, true) : `${monthLabel(a)} → ${monthLabel(b)}`;

function cmpDefaults() {
  const ms = allMonths();
  // dernier mois complet = avant-dernier (le dernier relevé s'arrête en cours de mois)
  const end = ms.length > 1 ? ms[ms.length - 2] : ms[ms.length - 1];
  return { aFrom: addMonths(end, -2), aTo: end, bFrom: addMonths(end, -5), bTo: addMonths(end, -3), mode: 'total' };
}

function cmpData(from, to) {
  const sc = scopeSet();
  const ops = S.data.operations.filter(o => sc.has(o.account) && o.date.slice(0, 7) >= from && o.date.slice(0, 7) <= to);
  const A = analyze(ops), n = Math.max(1, monthSpan(from, to));
  // dépenses cumulées par jour depuis le début de la période
  const C = cats(), start = new Date(from + '-01T00:00:00Z'), days = [];
  for (const o of ops) {
    const c = C.get(o.categoryId); if (c?.kind !== 'expense') continue;
    const d = Math.round((new Date(o.date + 'T00:00:00Z') - start) / 864e5);
    days[d] = (days[d] ?? 0) - o.amount;
  }
  const len = Math.round((new Date(addMonths(to, 1) + '-01T00:00:00Z') - start) / 864e5);
  let acc = 0; const cum = Array.from({ length: len }, (_, i) => (acc += days[i] ?? 0, Math.round(acc)));
  const titles = new Map();
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind === 'expense') { const e = titles.get(o.title) ?? { t: o.title, c, v: 0 }; e.v -= o.amount; titles.set(o.title, e); } }
  return { A, n, cum, titles, count: ops.length };
}

function pageCompare(v) {
  const ms = allMonths();
  S.cmp ??= cmpDefaults();
  const P = S.cmp, C = cats();
  const set = patch => { Object.assign(P, patch); if (P.aFrom > P.aTo) [P.aFrom, P.aTo] = [P.aTo, P.aFrom]; if (P.bFrom > P.bTo) [P.bFrom, P.bTo] = [P.bTo, P.bFrom]; render(); };
  const msel = (key, label) => h('select', { onchange: e => set({ [key]: e.target.value }) }, [...ms].reverse().map(m => h('option', { value: m, selected: m === P[key] }, monthLabel(m, true))));
  const presetBtn = (label, fn) => h('button', { class: 'btn sm sec', onclick: () => set(fn()) }, label);
  const last = ms[ms.length - 2] ?? ms[ms.length - 1];

  v.append(h('div', { class: 'card', style: { marginBottom: '18px' } },
    h('div', { class: 'grid g2' },
      h('div', {}, h('div', { class: 'chip', style: { background: tint(CMP_COLORS.a, .15), color: CMP_COLORS.a, marginBottom: '8px' } }, '🅐 Période A'), h('div', { class: 'toolbar', style: { marginBottom: 0 } }, 'du', msel('aFrom'), 'au', msel('aTo'))),
      h('div', {}, h('div', { class: 'chip', style: { background: tint(CMP_COLORS.b, .15), color: CMP_COLORS.b, marginBottom: '8px' } }, '🅑 Période B (référence)'), h('div', { class: 'toolbar', style: { marginBottom: 0 } }, 'du', msel('bFrom'), 'au', msel('bTo')))),
    h('div', { class: 'toolbar', style: { margin: '14px 0 0' } },
      h('span', { class: 'muted' }, 'Raccourcis :'),
      presetBtn('Mois vs mois précédent', () => ({ aFrom: last, aTo: last, bFrom: addMonths(last, -1), bTo: addMonths(last, -1) })),
      presetBtn('12 derniers mois vs 12 précédents', () => ({ aFrom: addMonths(last, -11), aTo: last, bFrom: addMonths(last, -23), bTo: addMonths(last, -12) })),
      presetBtn('Trimestre vs précédent', () => ({ aFrom: addMonths(last, -2), aTo: last, bFrom: addMonths(last, -5), bTo: addMonths(last, -3) })),
      presetBtn('Même période l’an dernier', () => ({ bFrom: addMonths(P.aFrom, -12), bTo: addMonths(P.aTo, -12) })),
      presetBtn('Depuis le début vs ensuite', () => { const mid = Math.floor(ms.length / 2); return { aFrom: ms[mid], aTo: ms[ms.length - 1], bFrom: ms[0], bTo: ms[mid - 1] }; }),
      h('div', { class: 'seg', style: { marginLeft: 'auto' } }, [['total', 'Totaux'], ['avg', 'Moyenne / mois']].map(([k, l]) => h('button', { class: P.mode === k ? 'on' : '', onclick: () => set({ mode: k }) }, l))))));

  const A = cmpData(P.aFrom, P.aTo), B = cmpData(P.bFrom, P.bTo);
  const f = (d, x) => P.mode === 'avg' ? x / d.n : x;
  if (A.n !== B.n && P.mode === 'total') v.append(h('div', { class: 'card', style: { marginBottom: '18px', background: tint('#f59e0b', .12) } }, `⚠️ Les deux périodes n’ont pas la même durée (${A.n} mois contre ${B.n}). Passez en « Moyenne / mois » pour une comparaison équitable.`));

  // KPI
  const metric = (label, a, b, goodWhenUp, ico, pctMode) => {
    const fm = x => pctMode ? x.toFixed(1) + ' %' : eur0(x);
    const d = a - b, pct = b ? d / Math.abs(b) * 100 : null, good = d === 0 ? null : (d > 0) === goodWhenUp;
    return h('div', { class: 'card' }, h('div', { class: 'muted' }, ico + ' ' + label),
      h('div', { style: { display: 'flex', gap: '18px', alignItems: 'baseline', margin: '8px 0' } },
        h('div', {}, h('div', { style: { fontSize: '24px', fontWeight: 700, color: CMP_COLORS.a } }, fm(a)), h('small', { class: 'muted' }, 'A')),
        h('div', {}, h('div', { style: { fontSize: '18px', fontWeight: 600, color: CMP_COLORS.b } }, fm(b)), h('small', { class: 'muted' }, 'B'))),
      h('span', { class: 'badge', style: { fontSize: '13px', color: good == null ? '' : good ? 'var(--good)' : 'var(--bad)' } }, `${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${pctMode ? (d > 0 ? '+' : '') + d.toFixed(1) + ' pts' : signed(Math.round(d)).replace(/,00/, '')}${pct == null || pctMode ? '' : ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)} %)`}`));
  };
  const eA = f(A, A.A.expense), eB = f(B, B.A.expense), iA = f(A, A.A.income), iB = f(B, B.A.income);
  v.append(h('div', { class: 'grid g4' }, metric('Dépenses', eA, eB, false, '💸'), metric('Revenus', iA, iB, true, '💰'), metric('Épargne', iA - eA, iB - eB, true, '🐖'),
    metric('Taux d’épargne (%)', iA ? (iA - eA) / iA * 100 : 0, iB ? (iB - eB) / iB * 100 : 0, true, '📊', true)));

  // lignes par catégorie
  const rows = S.data.categories.filter(c => c.kind !== 'transfer').map(c => ({ c, a: f(A, A.A.byCat.get(c.id) ?? 0), b: f(B, B.A.byCat.get(c.id) ?? 0) }))
    .filter(r => r.a || r.b).map(r => ({ ...r, d: r.a - r.b }));
  const exp = rows.filter(r => r.c.kind === 'expense').sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  const inc = rows.filter(r => r.c.kind === 'income').sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));

  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Dépenses par catégorie', h('small', {}, `${rangeLabel(P.aFrom, P.aTo)} vs ${rangeLabel(P.bFrom, P.bTo)}`)), h('div', { class: 'chart-box tall' }, h('canvas', { id: 'cmpCat' }))),
    h('div', { class: 'card' }, h('h2', {}, 'Dépenses cumulées dans la période', h('small', {}, 'jour par jour depuis le début')), h('div', { class: 'chart-box tall' }, h('canvas', { id: 'cmpCum' })))));
  const top = exp.slice(0, 12);
  chart($('#cmpCat'), {
    type: 'bar', data: {
      labels: top.map(r => r.c.name), datasets: [
        { label: 'A', data: top.map(r => Math.round(r.a)), backgroundColor: CMP_COLORS.a, borderRadius: 5 },
        { label: 'B', data: top.map(r => Math.round(r.b)), backgroundColor: CMP_COLORS.b, borderRadius: 5 }]
    },
    options: { indexAxis: 'y', scales: { x: { ticks: { callback: eurTick } }, y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label} : ${eur0(c.parsed.x)}` } } } },
  });
  const L = Math.max(A.cum.length, B.cum.length);
  chart($('#cmpCum'), {
    type: 'line', data: {
      labels: Array.from({ length: L }, (_, i) => 'J' + (i + 1)), datasets: [
        { label: 'A · ' + rangeLabel(P.aFrom, P.aTo), data: A.cum, borderColor: CMP_COLORS.a, backgroundColor: ctx => gradient(ctx, CMP_COLORS.a), fill: true, borderWidth: 3, pointRadius: 0, tension: .2 },
        { label: 'B · ' + rangeLabel(P.bFrom, P.bTo), data: B.cum, borderColor: CMP_COLORS.b, borderWidth: 3, pointRadius: 0, tension: .2 }]
    },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } },
  });

  // tableau détaillé
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.d)));
  const trow = (r, kind) => {
    const good = r.d === 0 ? null : (r.d > 0) === (kind === 'income');
    const col = good == null ? 'var(--muted)' : good ? 'var(--good)' : 'var(--bad)';
    return h('tr', {}, h('td', {}, catChip(r.c)), h('td', { class: 'r num', style: { color: CMP_COLORS.a, fontWeight: 600 } }, eur0(r.a)), h('td', { class: 'r num', style: { color: CMP_COLORS.b, fontWeight: 600 } }, eur0(r.b)),
      h('td', { class: 'r num', style: { color: col, fontWeight: 600 } }, signed(Math.round(r.d)).replace(/,00/, '')),
      h('td', { class: 'r num', style: { color: col } }, r.b ? (r.d > 0 ? '+' : '') + (r.d / r.b * 100).toFixed(0) + ' %' : 'nouveau'),
      h('td', { style: { width: '160px' } }, h('div', { style: { height: '8px', borderRadius: '4px', background: col, opacity: .75, width: Math.max(2, Math.abs(r.d) / maxAbs * 100) + '%' } })),
      h('td', {}, h('button', { class: 'icon-btn', title: 'Voir les opérations', onclick: () => gotoOps({ cat: r.c.id }) }, '🔎')));
  };
  const sec = (t, list, kind) => list.length ? [h('tr', {}, h('td', { colspan: 7, style: { fontWeight: 700, background: 'var(--card2)' } }, t)), list.map(r => trow(r, kind)),
    h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total'), h('td', { class: 'r num' }, eur0(sum(list.map(r => r.a)))), h('td', { class: 'r num' }, eur0(sum(list.map(r => r.b)))), h('td', { class: 'r num' }, signed(Math.round(sum(list.map(r => r.d)))).replace(/,00/, '')), h('td'), h('td'), h('td'))] : [];
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Détail par catégorie', h('small', {}, P.mode === 'avg' ? 'moyenne mensuelle' : 'totaux sur la période')),
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Catégorie'), h('th', { class: 'r', style: { color: CMP_COLORS.a } }, 'A'), h('th', { class: 'r', style: { color: CMP_COLORS.b } }, 'B'), h('th', { class: 'r' }, 'Écart'), h('th', { class: 'r' }, '%'), h('th'), h('th'))),
      h('tbody', {}, sec('Dépenses', exp, 'expense'), sec('Revenus', inc, 'income'))))));

  // plus fortes variations par commerçant
  const all = new Set([...A.titles.keys(), ...B.titles.keys()]);
  const mv = [...all].map(t => { const a = f(A, A.titles.get(t)?.v ?? 0), b = f(B, B.titles.get(t)?.v ?? 0); return { t, c: (A.titles.get(t) ?? B.titles.get(t)).c, a, b, d: a - b }; });
  const list = (arr, up) => h('div', { class: 'legend' }, arr.length ? arr.map(r => h('div', { class: 'lrow', onclick: () => gotoOps({ q: r.t }) }, bubble(r.c),
    h('div', {}, h('div', { class: 'name' }, r.t), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${eur0(r.b)} → ${eur0(r.a)}`)), h('div', { class: 'amt ' + (up ? 'neg' : 'pos') }, signed(Math.round(r.d)).replace(/,00/, '')))) : h('div', { class: 'empty' }, 'Rien à signaler'));
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, '📈 Plus fortes hausses (postes de dépense)'), list(mv.filter(r => r.d > 0).sort((x, y) => y.d - x.d).slice(0, 8), true)),
    h('div', { class: 'card' }, h('h2', {}, '📉 Plus fortes baisses (postes de dépense)'), list(mv.filter(r => r.d < 0).sort((x, y) => x.d - y.d).slice(0, 8), false))));
}
