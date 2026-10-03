'use strict';
// ============ Prévisions budgétaires ============
const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];
const r2 = x => Math.round(x * 100) / 100;

function forecastYears() {
  return [...new Set(S.data.operations.map(o => +o.date.slice(0, 4)))].sort((a, b) => a - b);
}
const lastDay = (y, m) => new Date(y, m, 0).getDate();

// Modèle : réalisé de l'année n + prévision n+1 (avec saisies de l'utilisateur)
function forecastModel(year) {
  const C = cats(), key = `${year + 1}|${S.scope}`;
  const F = S.data.forecasts?.[key] ?? { method: 'avg', pctExp: 0, pctInc: 0, cells: {} };
  const all = S.data.operations;
  const minD = all[0].date, maxD = S.data.accounts.map(a => a.closingDate).filter(Boolean).sort().pop() || all[all.length - 1].date;
  const ops = scopedOps({ period: false }).filter(o => +o.date.slice(0, 4) === year);
  const withData = new Set(ops.map(o => +o.date.slice(5, 7)));
  let complete = [];
  for (let m = 1; m <= 12; m++) {
    const s = `${year}-${String(m).padStart(2, '0')}-01`, e = `${year}-${String(m).padStart(2, '0')}-${lastDay(year, m)}`;
    if (s >= minD && e <= maxD) complete.push(m);
  }
  const approx = !complete.length;
  if (approx) complete = [...withData];
  const actual = new Map();
  for (const o of ops) {
    const c = C.get(o.categoryId); if (!c || c.kind === 'transfer') continue;
    const a = actual.get(c.id) ?? Array(12).fill(0); actual.set(c.id, a);
    a[+o.date.slice(5, 7) - 1] += c.kind === 'expense' ? -o.amount : o.amount;
  }
  const rows = [];
  for (const c of S.data.categories.filter(c => c.kind !== 'transfer')) {
    const a = actual.get(c.id) ?? Array(12).fill(0);
    const tot = sum(complete.map(m => a[m - 1])), avg = complete.length ? tot / complete.length : 0;
    const pct = (c.kind === 'expense' ? F.pctExp : F.pctInc) || 0;
    const base = Array.from({ length: 12 }, (_, i) => r2((F.method === 'season' && complete.includes(i + 1) ? a[i] : avg) * (1 + pct / 100)));
    const cells = F.cells[c.id] ?? {};
    const val = base.map((b, i) => cells[i + 1] ?? b);
    rows.push({ c, a, tot, avg, base, val, annual: sum(val), edited: Object.keys(cells).length > 0, cells });
  }
  const monthly = kind => Array.from({ length: 12 }, (_, i) => sum(rows.filter(r => r.c.kind === kind).map(r => r.val[i])));
  return { key, F, rows, complete, approx, year, exp: monthly('expense'), inc: monthly('income') };
}

// Mise à jour locale immédiate + enregistrement en arrière-plan ; le focus reste sur le champ (voir render()).
function saveForecast(M, patch) {
  const F = { ...M.F, ...patch };
  S.data.forecasts = { ...(S.data.forecasts ?? {}), [M.key]: F };
  api('/api/forecast', 'PUT', { key: M.key, data: F }).catch(() => toast('⚠️ Enregistrement impossible'));
  setTimeout(render, 0);
}

function pageForecast(v) {
  const years = forecastYears();
  if (!years.length) return v.append(h('div', { class: 'card empty' }, 'Aucune donnée.'));
  if (!S.fYear || !years.includes(S.fYear)) S.fYear = years[years.length - 1];
  const M = forecastModel(S.fYear), { F, rows, year } = M;
  const expRows = rows.filter(r => r.c.kind === 'expense'), incRows = rows.filter(r => r.c.kind === 'income');
  const totE = sum(M.exp), totI = sum(M.inc), net = totI - totE;
  const refE = sum(expRows.map(r => r.avg * 12)), refI = sum(incRows.map(r => r.avg * 12)), refNet = refI - refE;
  const nC = M.complete.length;
  const saveCell = (r, cells) => saveForecast(M, { cells: { ...F.cells, [r.c.id]: cells } });

  // --- contrôles
  const num = (val, onch, fk) => h('input', { type: 'number', step: '0.5', 'data-fk': fk, value: val, style: { width: '70px' }, onchange: e => onch(+e.target.value || 0) });
  v.append(h('div', { class: 'card', style: { marginBottom: '18px' } },
    h('div', { class: 'toolbar', style: { marginBottom: 0 } },
      h('label', { class: 'muted' }, 'Année de référence'),
      h('select', { onchange: e => { S.fYear = +e.target.value; render(); } }, years.map(y => h('option', { value: y, selected: y === year }, y))),
      h('b', {}, '→ prévision ' + (year + 1)),
      h('div', { class: 'seg' }, [['avg', 'Moyenne mensuelle'], ['season', 'Saisonnalité de ' + year]].map(([k, l]) => h('button', { class: F.method === k ? 'on' : '', onclick: () => saveForecast(M, { method: k }) }, l))),
      h('label', { class: 'muted', title: 'Hausse ou baisse appliquée aux dépenses non saisies à la main' }, 'Dépenses'), num(F.pctExp, x => saveForecast(M, { pctExp: x }), 'pctExp'), h('span', { class: 'muted' }, '%'),
      h('label', { class: 'muted' }, 'Revenus'), num(F.pctInc, x => saveForecast(M, { pctInc: x }), 'pctInc'), h('span', { class: 'muted' }, '%'),
      h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'btn sm sec', onclick: () => { if (confirm('Effacer toutes vos saisies pour ' + (year + 1) + ' ?')) saveForecast(M, { cells: {} }); } }, '↺ Réinitialiser'),
        h('button', { class: 'btn sm sec', onclick: () => exportForecastCsv(M) }, '⬇ CSV'),
        h('button', { class: 'btn sm', onclick: () => applyBudgets(M) }, '🎯 Utiliser comme budgets'))),
    h('p', { class: 'muted', style: { margin: '12px 0 0', fontSize: '12.5px' } },
      `Base : ${nC} mois complets de ${year}${M.approx ? ' (données partielles)' : ''} (${M.complete.map(m => MOIS[m - 1]).join(', ') || '–'}) ; les mois incomplets sont ignorés. `,
      'Modifiez le montant annuel d’une catégorie (répartition proportionnelle) ou dépliez-la pour saisir chaque mois. Les ajustements % ne touchent pas les cellules saisies à la main. Pensez à corriger les montants exceptionnels (impôts, remboursements, gros achats).')));

  // --- KPI
  const diff = (a, b) => b ? ` (${a - b >= 0 ? '+' : ''}${((a - b) / Math.abs(b) * 100).toFixed(1)} % vs ${year})` : '';
  v.append(h('div', { class: 'grid g4' },
    kpi('k1', `Dépenses prévues ${year + 1}`, eur0(totE), eur0(totE / 12) + ' / mois' + diff(totE, refE), '💸'),
    kpi('k2', `Revenus prévus ${year + 1}`, eur0(totI), eur0(totI / 12) + ' / mois' + diff(totI, refI), '💰'),
    kpi('k3', 'Épargne prévue', signed(Math.round(net)).replace(/,00/, ''), (totI ? (net / totI * 100).toFixed(0) : 0) + ' % des revenus', '🐖'),
    kpi('k4', `Référence ${year} (annualisée)`, signed(Math.round(refNet)).replace(/,00/, ''), `Dépenses ${eur0(refE)} · Revenus ${eur0(refI)}`, '📅')));

  // --- graphiques
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, `Trajectoire mensuelle ${year + 1}`, h('small', {}, 'barres : flux · courbe : épargne cumulée')), h('div', { class: 'chart-box' }, h('canvas', { id: 'fMonthly' }))),
    h('div', { class: 'card' }, h('h2', {}, `Dépenses par catégorie : ${year} vs ${year + 1}`, h('small', {}, `${year} annualisé`)), h('div', { class: 'chart-box' }, h('canvas', { id: 'fCats' })))));
  let cum = 0;
  chart($('#fMonthly'), {
    data: {
      labels: MOIS, datasets: [
        { type: 'bar', label: 'Revenus', data: M.inc.map(Math.round), backgroundColor: '#10b981', borderRadius: 6 },
        { type: 'bar', label: 'Dépenses', data: M.exp.map(Math.round), backgroundColor: '#ef4444', borderRadius: 6 },
        { type: 'line', label: 'Épargne cumulée', data: M.inc.map((x, i) => Math.round(cum += x - M.exp[i])), borderColor: '#6366f1', backgroundColor: '#6366f1', tension: .3, pointRadius: 3 }]
    },
    options: { scales: { y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur } },
  });
  const topE = expRows.filter(r => r.annual > 0 || r.avg > 0).sort((a, b) => b.annual - a.annual).slice(0, 10);
  chart($('#fCats'), {
    type: 'bar', data: {
      labels: topE.map(r => r.c.name), datasets: [
        { label: String(year), data: topE.map(r => Math.round(r.avg * 12)), backgroundColor: topE.map(r => tint(r.c.color, .4)), borderRadius: 5 },
        { label: String(year + 1), data: topE.map(r => Math.round(r.annual)), backgroundColor: topE.map(r => r.c.color), borderRadius: 5 }]
    },
    options: { indexAxis: 'y', scales: { x: { ticks: { callback: eurTick } }, y: { grid: { display: false } } }, plugins: { tooltip: { callbacks: { label: c => ` ${c.dataset.label} : ${eur0(c.parsed.x)}` } } } },
  });

  // --- vue mensuelle (saisie directe de chaque mois)
  S.fView ??= 'month';
  const viewSeg = h('div', { class: 'seg' }, [['month', 'Par mois'], ['year', 'Par année']].map(([k, l]) => h('button', { class: S.fView === k ? 'on' : '', onclick: () => { S.fView = k; render(); } }, l)));
  if (S.fView === 'month') {
    const cell = (r, i) => h('td', { style: { padding: '4px' } }, h('input', {
      type: 'number', step: '5', 'data-fk': `${r.c.id}:m${i}`, value: Math.round(r.val[i]), title: `Réalisé ${MOIS[i]} ${year} : ${r.a[i] ? eur0(r.a[i]) : '–'}`,
      style: { width: '78px', textAlign: 'right', padding: '5px 6px', borderColor: r.cells[i + 1] != null ? 'var(--primary)' : '' },
      onchange: e => saveCell(r, { ...r.cells, [i + 1]: r2(+e.target.value || 0) }),
    }));
    const tot = (label, arr, cls = '') => h('tr', { style: { fontWeight: 700, background: 'var(--card2)' } }, h('td', { style: { position: 'sticky', left: 0, background: 'var(--card2)' } }, label), arr.map(x => h('td', { class: 'r num ' + cls, style: { padding: '8px 10px' } }, eur0(x))), h('td', { class: 'r num ' + cls }, eur0(sum(arr))), h('td'));
    const mrows = list => list.map(r => h('tr', { style: !r.tot && !r.annual ? { opacity: .55 } : {} },
      h('td', { style: { position: 'sticky', left: 0, background: 'var(--card)', zIndex: 1 } }, catChip(r.c)),
      MOIS.map((_, i) => cell(r, i)), h('td', { class: 'r num', style: { fontWeight: 700 } }, eur0(r.annual)),
      h('td', {}, r.edited ? h('button', { class: 'icon-btn', title: 'Revenir au calcul automatique', onclick: () => { const cells = { ...F.cells }; delete cells[r.c.id]; saveForecast(M, { cells }); } }, '↺') : null)));
    const sep = t => h('tr', {}, h('td', { colspan: 15, style: { fontWeight: 700, padding: '10px', color: 'var(--muted)' } }, t));
    v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `Prévision mois par mois — ${year + 1}`, viewSeg),
      h('p', { class: 'muted', style: { marginTop: 0, fontSize: '12.5px' } }, 'Modifiez n’importe quelle case (validez avec Entrée ou en quittant la case). Les cases modifiées sont entourées en violet ; survolez une case pour voir le réalisé du même mois en ' + year + '.'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'heat' },
        h('thead', {}, h('tr', {}, h('th', { style: { position: 'sticky', left: 0, background: 'var(--card)', zIndex: 2 } }, 'Catégorie'), MOIS.map(m => h('th', { class: 'r' }, m)), h('th', { class: 'r' }, 'Total'), h('th'))),
        h('tbody', {}, sep('DÉPENSES'), mrows(expRows), tot('Total dépenses', M.exp, 'neg'), sep('REVENUS'), mrows(incRows), tot('Total revenus', M.inc, 'pos'),
          tot('Épargne du mois', M.inc.map((x, i) => x - M.exp[i]))))))); 
    return;
  }
  // --- tableau éditable (annuel)
  S.fOpen ??= new Set();
  const section = (title, list, totals) => {
    const out = [h('tr', {}, h('td', { colspan: 6, style: { fontWeight: 700, background: 'var(--card2)' } }, title))];
    for (const r of list) {
      const open = S.fOpen.has(r.c.id), dead = !r.tot && !r.annual;
      const ref = r.avg * 12, gap = ref ? (r.annual - ref) / ref * 100 : null;
      out.push(h('tr', { style: dead ? { opacity: .55 } : {} },
        h('td', {}, h('span', { style: { cursor: 'pointer', marginRight: '6px' }, onclick: () => { open ? S.fOpen.delete(r.c.id) : S.fOpen.add(r.c.id); render(); } }, open ? '▾' : '▸'), catChip(r.c)),
        h('td', { class: 'r num' }, eur0(r.tot)), h('td', { class: 'r num' }, eur0(r.avg)), h('td', { class: 'r' }, h('input', {
          type: 'number', step: '5', 'data-fk': `${r.c.id}:mm`, value: Math.round(r.annual / 12), title: 'Même montant chaque mois', style: { width: '90px', textAlign: 'right', borderColor: r.edited ? 'var(--primary)' : '' },
          onchange: e => { const x = r2(Math.max(0, +e.target.value || 0)), cells = {}; for (let i = 1; i <= 12; i++) cells[i] = x; saveCell(r, cells); },
        })),
        h('td', { class: 'r' }, h('input', {
          type: 'number', step: '10', 'data-fk': `${r.c.id}:y`, value: Math.round(r.annual), style: { width: '110px', textAlign: 'right', fontWeight: 600, borderColor: r.edited ? 'var(--primary)' : '' },
          onchange: e => {
            const target = Math.max(0, +e.target.value || 0), s = sum(r.val), cells = {};
            let acc = 0;
            r.val.forEach((x, i) => { cells[i + 1] = i < 11 ? r2(s > 0 ? x * target / s : target / 12) : r2(target - acc); acc += cells[i + 1]; });
            saveCell(r, cells);
          },
        })),
        h('td', { class: 'r num ' + (gap == null ? '' : (r.c.kind === 'expense' ? gap > 0 : gap < 0) ? 'neg' : 'pos') }, gap == null ? '–' : (gap > 0 ? '+' : '') + gap.toFixed(1) + ' %'),
        h('td', {}, r.edited ? h('button', { class: 'icon-btn', title: 'Revenir au calcul automatique', onclick: () => { const cells = { ...F.cells }; delete cells[r.c.id]; saveForecast(M, { cells }); } }, '↺') : null)));
      if (open) {
        out.push(h('tr', {}, h('td', { colspan: 7, style: { background: 'var(--card2)' } },
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: '10px', padding: '6px 0' } },
            MOIS.map((mn, i) => h('div', { class: 'field' }, h('label', {}, `${mn} · réalisé ${r.a[i] ? eur0(r.a[i]) : '–'}`),
              h('input', { type: 'number', step: '5', 'data-fk': `${r.c.id}:m${i}`, value: Math.round(r.val[i]), style: r.cells[i + 1] != null ? { borderColor: 'var(--primary)' } : {}, onchange: e => saveCell(r, { ...r.cells, [i + 1]: r2(+e.target.value || 0) }) })))))));
      }
    }
    out.push(h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total ' + title.toLowerCase()), h('td', { class: 'r num' }, eur0(sum(list.map(r => r.tot)))), h('td', { class: 'r num' }, eur0(sum(list.map(r => r.avg)))), h('td', { class: 'r num' }, eur0(totals / 12)), h('td', { class: 'r num' }, eur0(totals)), h('td'), h('td')));
    return out;
  };
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `Détail par catégorie — ${year + 1}`, viewSeg),
    h('div', { class: 'tablewrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Catégorie'), h('th', { class: 'r' }, `Réalisé ${year} (${nC} mois)`), h('th', { class: 'r' }, 'Moy./mois'), h('th', { class: 'r' }, 'Prévu/mois (modifiable)'), h('th', { class: 'r' }, `Prévu ${year + 1} (an)`), h('th', { class: 'r' }, 'Écart'), h('th'))),
      h('tbody', {}, section('Dépenses', expRows, totE), section('Revenus', incRows, totI),
        h('tr', { style: { fontWeight: 800, fontSize: '15px' } }, h('td', {}, 'Épargne prévue'),
          h('td', { class: 'r num' }, eur0(sum(incRows.map(r => r.tot)) - sum(expRows.map(r => r.tot)))), h('td', { class: 'r num' }, eur0(sum(incRows.map(r => r.avg)) - sum(expRows.map(r => r.avg)))),
          h('td', { class: 'r num' }, eur0(net / 12)), h('td', { class: 'r num ' + (net < 0 ? 'neg' : 'pos') }, eur0(net)), h('td'), h('td')))))));
}

function exportForecastCsv(M) {
  const lines = [['Catégorie', 'Type', ...MOIS.map(m => m + ' ' + (M.year + 1)), 'Total'].join(';')];
  for (const r of M.rows) lines.push([r.c.name, r.c.kind === 'expense' ? 'Dépense' : 'Revenu', ...r.val.map(x => String(r2(x)).replace('.', ',')), String(r2(r.annual)).replace('.', ',')].join(';'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `prevision-${M.year + 1}.csv` });
  document.body.append(a); a.click(); a.remove();
}
function applyBudgets(M) {
  const n = M.rows.filter(r => r.c.kind === 'expense' && r.annual > 0).length;
  modal('Utiliser la prévision comme budgets', [h('p', {}, `Le budget mensuel de ${n} catégories de dépenses sera défini sur la moyenne mensuelle prévue pour ${M.year + 1}. Les budgets existants seront remplacés.`)],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
      h('button', {
        class: 'btn', onclick: async () => {
          S.data = await api('/api/budgets', 'POST', { budgets: Object.fromEntries(M.rows.filter(r => r.c.kind === 'expense').map(r => [r.c.id, r.annual / 12])) });
          toast('Budgets mis à jour'); close(); render();
        },
      }, 'Appliquer')]);
}

// ============ Ajout de relevés PDF ============
async function uploadFiles(files) {
  const pdfs = [...files].filter(f => /\.pdf$/i.test(f.name));
  if (!pdfs.length) return toast('⚠️ Choisissez des fichiers PDF');
  toast(`Envoi de ${pdfs.length} fichier(s)…`);
  const msgs = []; let added = 0;
  for (const f of pdfs) {
    try {
      const r = await fetch('/api/upload?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await r.json();
      if (!r.ok) msgs.push(['⚠️', f.name, j.error]);
      else if (j.status === 'ajoute') { added++; msgs.push([j.warning ? '🟠' : '✅', j.name, `${j.ops} opérations importées${j.warning ? ' — ' + j.warning : ''}`]); }
      else msgs.push(['ℹ️', f.name, 'déjà présent, ignoré']);
    } catch (e) { msgs.push(['⚠️', f.name, 'envoi impossible']); }
  }
  if (added) S.data = await api('/api/reimport', 'POST');
  modal(added ? 'Relevés ajoutés' : 'Aucun relevé ajouté',
    h('div', { class: 'legend' }, msgs.map(([i, n, t]) => h('div', { class: 'lrow', style: { cursor: 'default', gridTemplateColumns: '28px 1fr' } }, h('span', {}, i), h('div', {}, h('div', { class: 'name' }, n), h('div', { class: 'muted', style: { fontSize: '12px' } }, t))))),
    close => [h('button', { class: 'btn', onclick: close }, 'OK')]);
  render();
}
function pickFiles() {
  const inp = h('input', { type: 'file', accept: '.pdf,application/pdf', multiple: true, style: { display: 'none' }, onchange: () => uploadFiles(inp.files) });
  document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 60000);
}
window.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) { e.preventDefault(); uploadFiles(e.dataTransfer.files); } });
