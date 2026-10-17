'use strict';
// ============ Utilitaires ============
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  const late = {};
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [p, x] of Object.entries(v)) { if (x == null) continue; if (p.startsWith('--')) el.style.setProperty(p, x); else el.style[p] = x; } }
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked') late[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(kid)); }
  Object.assign(el, late);
  return el;
}
const eur = (n, d = 2) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const eur0 = n => eur(n, 0);
const signed = n => (n > 0 ? '+' : '') + eur(n);
const fdate = d => d.split('-').reverse().join('/');
const monthLabel = (m, long) => new Date(+m.slice(0, 4), +m.slice(5) - 1, 1).toLocaleDateString('fr-FR', long ? { month: 'long', year: 'numeric' } : { month: 'short', year: '2-digit' });
const sum = a => a.reduce((s, x) => s + x, 0);
const tint = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, '0');
const toast = msg => { const t = h('div', { class: 'toast' }, msg); $('#toasts').append(t); setTimeout(() => t.remove(), 2600); };

async function api(path, method = 'GET', body) {
  const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); }
  return j;
}

// ============ État ============
const S = {
  data: null, page: 'dashboard',
  scope: localStorage.getItem('scope') || 'courants', period: localStorage.getItem('period') || 'all',
  of: { q: '', cat: '', sign: '', internal: false, source: '', sort: 'date', dir: -1, limit: 150, sel: new Set() },
  statCats: null, accSel: null,
};
const charts = [];

// ============ Données dérivées ============
const cats = () => new Map(S.data.categories.map(c => [c.id, c]));
const MANUAL_TYPES = { MAN_COURANT: 'Compte courant', MAN_EPARGNE: 'Épargne', MAN_ESPECES: 'Espèces', MAN_CARTE: 'Carte de crédit' };
const isCurrent = a => ['CCP', 'MAN_COURANT', 'MAN_ESPECES', 'MAN_CARTE'].includes(a.type);
const accName = a => a.manual ? (a.alias || a.name) : a.alias || ({ CCP: 'Compte courant', CEL: 'Compte épargne logement', PEL: 'Plan épargne logement', LIVRET_A: 'Livret A', LDDS: 'LDDS' }[a.type] || a.name) + (a.type === 'CCP' ? ' …' + a.number.slice(-4) : '');
const accIcon = t => ({ MAN_COURANT: '🏦', MAN_EPARGNE: '🐷', MAN_ESPECES: '💶', MAN_CARTE: '💳', CCP: '💳', CEL: '🏡', PEL: '🐖', LIVRET_A: '📗', LDDS: '🌱' }[t] || '🏦');
const accColor = t => ({ MAN_COURANT: '#0891b2', MAN_EPARGNE: '#84cc16', MAN_ESPECES: '#d97706', MAN_CARTE: '#e11d48', CCP: '#6366f1', CEL: '#0ea5e9', PEL: '#10b981', LIVRET_A: '#f59e0b', LDDS: '#ec4899' }[t] || '#64748b');
function scopeSet() {
  const A = S.data.accounts;
  if (S.scope === 'courants') return new Set(A.filter(isCurrent).map(a => a.number));
  if (S.scope === 'tous') return new Set(A.map(a => a.number));
  return new Set([S.scope]);
}
function allMonths() { return [...new Set(S.data.operations.map(o => o.date.slice(0, 7)))].sort(); }
function periodRange() {
  const ms = allMonths(), last = ms[ms.length - 1];
  const back = n => ms[Math.max(0, ms.length - n)];
  const p = S.period;
  if (p === 'all') return [ms[0], last];
  if (p === 'm3') return [back(3), last];
  if (p === 'm6') return [back(6), last];
  if (p === 'm12') return [back(12), last];
  if (p === 'y') return [last.slice(0, 4) + '-01', last];
  if (/^y:\d{4}$/.test(p)) { const inY = ms.filter(m => m.startsWith(p.slice(2))); if (inY.length) return [inY[0], inY[inY.length - 1]]; return [ms[0], last]; }
  return [p, p];
}
function monthsIn([a, b]) { return allMonths().filter(m => m >= a && m <= b); }
function scopedOps({ period = true } = {}) {
  const sc = scopeSet(), [a, b] = periodRange();
  return S.data.operations.filter(o => sc.has(o.account) && (!period || (o.date.slice(0, 7) >= a && o.date.slice(0, 7) <= b)));
}
// Agrégats : dépenses (catégories "expense", net des remboursements), revenus ("income")
function analyze(ops) {
  const C = cats(), byCat = new Map(), byMonth = new Map();
  let income = 0, expense = 0;
  for (const o of ops) {
    const c = C.get(o.categoryId); if (!c || c.kind === 'transfer') continue;
    const m = o.date.slice(0, 7);
    const mo = byMonth.get(m) ?? { income: 0, expense: 0, cat: new Map() }; byMonth.set(m, mo);
    if (c.kind === 'expense') {
      const v = -o.amount; expense += v; mo.expense += v;
      byCat.set(c.id, (byCat.get(c.id) ?? 0) + v); mo.cat.set(c.id, (mo.cat.get(c.id) ?? 0) + v);
    } else { income += o.amount; mo.income += o.amount; byCat.set(c.id, (byCat.get(c.id) ?? 0) + o.amount); }
  }
  return { income, expense, byCat, byMonth };
}
function balanceSeries(accNums) {
  const ops = S.data.operations, dates = [...new Set(ops.map(o => o.date))].sort();
  const lastDay = dates[dates.length - 1];
  const days = []; for (let d = new Date(dates[0] + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= lastDay; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const res = {};
  for (const n of accNums) {
    const acc = S.data.accounts.find(a => a.number === n), mine = ops.filter(o => o.account === n);
    let bal = acc.opening ?? 0, i = 0; const arr = [];
    for (const d of days) { while (i < mine.length && mine[i].date <= d) bal += mine[i++].amount; arr.push(Math.round(bal * 100) / 100); }
    res[n] = arr;
  }
  return { days, res };
}

// ============ Thème / graphiques ============
function applyTheme(t) { document.documentElement.dataset.theme = t; localStorage.setItem('theme', t); }
applyTheme(localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
function chart(canvas, cfg) {
  const tc = css('--muted'), gc = css('--line');
  Chart.defaults.color = tc; Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 500 } }, cfg.options);
  const sc = cfg.options.scales; if (sc) for (const k of Object.keys(sc)) { sc[k].grid = Object.assign({ color: gc }, sc[k].grid); sc[k].border = { display: false }; }
  const c = new Chart(canvas, cfg); charts.push(c); return c;
}
const eurTick = v => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR') + ' k€' : v + ' €';
const tipEur = { callbacks: { label: c => ` ${c.dataset.label ? c.dataset.label + ' : ' : ''}${eur(c.parsed.y ?? c.parsed)}` } };

// ============ Modal ============
function modal(title, body, actions, wide) {
  const root = $('#modalRoot'); root.innerHTML = '';
  const close = () => { root.innerHTML = ''; };
  const m = h('div', { class: 'modal' + (wide ? ' wide' : '') },
    h('header', {}, h('h3', {}, title), h('button', { class: 'icon-btn', onclick: close }, '✕')),
    h('div', { class: 'body' }, body),
    h('footer', {}, actions(close)));
  root.append(h('div', { class: 'back', onmousedown: e => { if (e.target.classList.contains('back')) close(); } }, m));
  return close;
}
const catChip = (c, extra = {}) => h('span', { class: 'chip', style: { background: tint(c.color, .16), color: c.color }, ...extra }, h('span', { class: 'dot' }, c.icon), h('span', { style: { color: 'var(--text)' } }, c.name));
const bubble = c => h('div', { class: 'bubble', style: { background: tint(c.color, .18) } }, c.icon);
function catSelect(value, onchange, { kinds, none } = {}) {
  const sel = h('select', { onchange: e => onchange(e.target.value) });
  if (none) sel.append(h('option', { value: '' }, none));
  for (const k of ['expense', 'income', 'transfer']) {
    if (kinds && !kinds.includes(k)) continue;
    const g = h('optgroup', { label: { expense: 'Dépenses', income: 'Revenus', transfer: 'Virements' }[k] });
    for (const c of S.data.categories.filter(c => c.kind === k).sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))) g.append(h('option', { value: c.id }, `${c.icon} ${c.name}`));
    sel.append(g);
  }
  sel.value = value ?? ''; return sel;
}

// ============ Filtres globaux ============
function renderFilters() {
  const f = $('#filters'); f.innerHTML = '';
  if (['docs', 'backups', 'menus', 'versions', 'prompts', 'license', 'ai', 'analyse', 'manifest', 'model', 'immo', 'immo-params', 'immo-planning', 'immo-suivi', 'immo-actions', 'immo-ai', 'techdocs', 'db', 'biens', 'bien', 'biens-estimation', 'biens-docs'].includes(S.page)) return;
  const accSel = h('select', { onchange: e => { S.scope = e.target.value; localStorage.setItem('scope', S.scope); S.of.sel.clear(); render(); } },
    h('option', { value: 'courants' }, '💳 Comptes courants'), h('option', { value: 'tous' }, '🏦 Tous les comptes'),
    S.data.accounts.map(a => h('option', { value: a.number }, `${accIcon(a.type)} ${accName(a)}`)));
  accSel.value = S.scope;
  const ms = allMonths(), years = [...new Set(ms.map(m => m.slice(0, 4)))].reverse();
  // « Année 2025 » ; pour une année incomplète on indique les mois couverts
  const yearLabel = y => { const n = ms.filter(m => m.startsWith(y)).length; return `📆 Année ${y}${n < 12 ? ` (${n} mois)` : ''}`; };
  const perSel = h('select', { onchange: e => { S.period = e.target.value; localStorage.setItem('period', S.period); S.of.sel.clear(); render(); } },
    h('option', { value: 'all' }, '📅 Toute la période'), h('option', { value: 'm3' }, '3 derniers mois'), h('option', { value: 'm6' }, '6 derniers mois'), h('option', { value: 'm12' }, '12 derniers mois'),
    h('option', { value: 'y' }, 'Année en cours'), h('optgroup', { label: 'Par année (entière)' }, years.map(y => h('option', { value: 'y:' + y }, yearLabel(y)))), h('optgroup', { label: 'Par mois' }, [...ms].reverse().map(m => h('option', { value: m }, monthLabel(m, true)))));
  perSel.value = S.period; if (perSel.value !== S.period) { S.period = 'all'; perSel.value = 'all'; localStorage.setItem('period', 'all'); }
  f.append(accSel, perSel);
}

// ============ Pages ============
function pageDashboard(v) {
  const ops = scopedOps(), A = analyze(ops), C = cats(), range = periodRange(), months = monthsIn(range);
  const accs = S.data.accounts, total = sum(accs.map(a => a.balance));
  const net = A.income - A.expense, rate = A.income > 0 ? net / A.income * 100 : 0;
  v.append(h('div', { class: 'grid g4' },
    kpi('k1', 'Dépenses', eur0(A.expense), `${eur0(A.expense / Math.max(1, months.length))} / mois en moyenne`, '💸'),
    kpi('k2', 'Revenus', eur0(A.income), `${eur0(A.income / Math.max(1, months.length))} / mois en moyenne`, '💰'),
    kpi('k3', 'Épargne nette', signed(Math.round(net)).replace(/,00/, ''), `${rate.toFixed(0)} % des revenus`, '🐖'),
    kpi('k4', 'Patrimoine total', eur0(total), `${accs.length} comptes · au ${fdate(accs.map(a => a.closingDate).filter(Boolean).sort().pop() || '')}`, '🏦')));

  // Donut dépenses
  const expRows = [...A.byCat].filter(([id]) => C.get(id).kind === 'expense' && A.byCat.get(id) > 0).sort((a, b) => b[1] - a[1]);
  const legend = h('div', { class: 'legend' });
  const maxE = expRows[0]?.[1] || 1;
  for (const [id, val] of expRows) {
    const c = C.get(id);
    legend.append(h('div', { class: 'lrow', onclick: () => gotoOps({ cat: id }) }, bubble(c),
      h('div', {}, h('div', { class: 'name' }, c.name), h('div', { class: 'bar' }, h('i', { style: { width: val / maxE * 100 + '%', background: c.color } }))),
      h('div', { class: 'amt' }, eur0(val), h('small', {}, (val / A.expense * 100).toFixed(1) + ' %'))));
  }
  const cDonut = h('canvas');
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Dépenses par catégorie', h('small', {}, 'cliquer pour détailler')),
      expRows.length ? h('div', { class: 'grid', style: { gridTemplateColumns: '220px 1fr', alignItems: 'center' } }, h('div', { class: 'chart-box short' }, cDonut), legend) : h('div', { class: 'empty' }, 'Aucune dépense')),
    h('div', { class: 'card' }, h('h2', {}, 'Revenus vs dépenses', h('small', {}, 'par mois')), h('div', { class: 'chart-box' }, h('canvas', { id: 'cFlow' })))));
  if (expRows.length) chart(cDonut, { type: 'doughnut', data: { labels: expRows.map(([id]) => C.get(id).name), datasets: [{ data: expRows.map(r => Math.round(r[1] * 100) / 100), backgroundColor: expRows.map(([id]) => C.get(id).color), borderWidth: 2, borderColor: css('--card') }] }, options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: tipEur } } });
  chart($('#cFlow'), {
    data: {
      labels: months.map(m => monthLabel(m)), datasets: [
        { type: 'bar', label: 'Revenus', data: months.map(m => Math.round(A.byMonth.get(m)?.income ?? 0)), backgroundColor: '#10b981', borderRadius: 6 },
        { type: 'bar', label: 'Dépenses', data: months.map(m => Math.round(A.byMonth.get(m)?.expense ?? 0)), backgroundColor: '#ef4444', borderRadius: 6 },
        { type: 'line', label: 'Solde du mois', data: months.map(m => Math.round((A.byMonth.get(m)?.income ?? 0) - (A.byMonth.get(m)?.expense ?? 0))), borderColor: '#6366f1', backgroundColor: '#6366f1', tension: .35, pointRadius: 4 }]
    },
    options: { scales: { y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur } },
  });

  // Évolution des soldes
  const bsAccs = accs.filter(a => scopeSet().has(a.number)), bs = balanceSeries(bsAccs.map(a => a.number));
  const [r0, r1] = range, i0 = bs.days.findIndex(d => d.slice(0, 7) >= r0), i1 = bs.days.length - 1 - [...bs.days].reverse().findIndex(d => d.slice(0, 7) <= r1);
  const days = bs.days.slice(i0, i1 + 1);
  const totalSeries = days.map((_, i) => sum(bsAccs.map(a => bs.res[a.number][i0 + i])));
  const only = bsAccs.length > 1;
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Évolution des soldes', h('small', {}, only ? 'total des comptes sélectionnés + détail' : '')), h('div', { class: 'chart-box tall' }, h('canvas', { id: 'cBal' }))));
  chart($('#cBal'), {
    type: 'line', data: {
      labels: days.map(fdate), datasets: [
        ...(only ? [{ label: 'Total', data: totalSeries, borderColor: '#6366f1', backgroundColor: ctx => gradient(ctx, '#6366f1'), fill: true, borderWidth: 3, pointRadius: 0, tension: .25 }] : []),
        ...bsAccs.map((a, k) => ({ label: accName(a), data: bs.res[a.number].slice(i0, i1 + 1), borderColor: accColor(a.type), backgroundColor: ctx => gradient(ctx, accColor(a.type)), fill: !only, borderWidth: only ? 1.8 : 3, borderDash: only ? [] : [], pointRadius: 0, tension: .25 }))]
    },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 10, autoSkip: true }, grid: { display: false } }, y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } },
  });

  // Budgets, top commerçants, dernières opérations
  const budgets = S.data.categories.filter(c => c.kind === 'expense' && c.budget);
  const nm = Math.max(1, months.length);
  const top = new Map();
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind === 'expense' && o.amount < 0 && o.kind !== 'virement-permanent') { const e = top.get(o.title) ?? { t: o.title, v: 0, n: 0, c }; e.v -= o.amount; e.n++; top.set(o.title, e); } }
  const topRows = [...top.values()].sort((a, b) => b.v - a.v).slice(0, 8);
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Budgets mensuels', h('small', {}, 'à définir dans Catégories')),
      budgets.length ? budgets.map(c => {
        const spent = A.byCat.get(c.id) ?? 0, bud = c.budget * nm, pct = spent / bud * 100;
        return h('div', { style: { marginBottom: '14px' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between' } }, h('span', {}, `${c.icon} ${c.name}`), h('b', { class: pct > 100 ? 'neg' : '' }, `${eur0(spent)} / ${eur0(bud)}`)),
          h('div', { class: 'progress' + (pct > 100 ? ' over' : ''), style: { '--c': c.color } }, h('i', { style: { width: Math.min(100, pct) + '%' } })));
      }) : h('div', { class: 'empty' }, 'Aucun budget défini. Ajoutez un budget mensuel à une catégorie pour suivre vos limites.')),
    h('div', { class: 'card' }, h('h2', {}, 'Plus grosses dépenses par commerçant'),
      h('div', { class: 'legend' }, topRows.map(r => h('div', { class: 'lrow', onclick: () => gotoOps({ q: r.t }) }, bubble(r.c),
        h('div', {}, h('div', { class: 'name' }, r.t), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${r.n} opération${r.n > 1 ? 's' : ''} · ${r.c.name}`)), h('div', { class: 'amt' }, eur0(r.v))))))));
}
const gradient = (ctx, color) => { const { chart: c } = ctx; if (!c.chartArea) return color; const g = c.ctx.createLinearGradient(0, c.chartArea.top, 0, c.chartArea.bottom); g.addColorStop(0, tint(color, .35)); g.addColorStop(1, tint(color, 0)); return g; };
const kpi = (cls, label, value, sub, ico) => h('div', { class: 'kpi ' + cls }, h('div', { class: 'bg' }, ico), h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'sub' }, sub));
function gotoOps(f) { Object.assign(S.of, { q: '', cat: '', sign: '', source: '', limit: 150 }, f); S.of.sel.clear(); location.hash = '#/operations'; }

// ---------- Opérations ----------
function filteredOps() {
  const f = S.of, C = cats(), q = f.q.trim().toLowerCase();
  let ops = scopedOps();
  if (!f.internal) ops = ops.filter(o => C.get(o.categoryId)?.kind !== 'transfer');
  if (f.cat) ops = ops.filter(o => o.categoryId === f.cat);
  if (f.sign) ops = ops.filter(o => f.sign === 'debit' ? o.amount < 0 : o.amount > 0);
  if (f.source) ops = ops.filter(o => o.source === f.source);
  if (q) ops = ops.filter(o => `${o.title} ${o.memo} ${o.label} ${o.details}`.toLowerCase().includes(q) || String(Math.abs(o.amount)).replace('.', ',') === q);
  const key = f.sort === 'amount' ? o => o.amount : f.sort === 'title' ? o => o.title.toLowerCase() : o => o.date;
  return ops.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * f.dir || (a.id > b.id ? 1 : -1) * f.dir);
}
function pageOperations(v) {
  const f = S.of, C = cats(), A = Object.fromEntries(S.data.accounts.map(a => [a.number, a]));
  const ops = filteredOps(), shown = ops.slice(0, f.limit);
  const tbody = h('tbody');
  const redrawBulk = () => { bulk.style.display = f.sel.size ? 'flex' : 'none'; $('#selCount').textContent = f.sel.size + ' sélectionnée(s)'; };
  for (const o of shown) {
    const c = C.get(o.categoryId);
    const cb = h('input', { type: 'checkbox', checked: f.sel.has(o.id), onclick: e => { e.stopPropagation(); e.target.checked ? f.sel.add(o.id) : f.sel.delete(o.id); redrawBulk(); } });
    tbody.append(h('tr', { class: 'op', onclick: () => opDetail(o) },
      h('td', {}, cb), h('td', { class: 'num' }, fdate(o.date)),
      h('td', {}, h('div', { class: 'title' }, o.title), h('div', { class: 'sub' }, o.memo || (o.kind === 'cb' ? 'Carte bancaire · ' + fdate(o.opDate) : o.label))),
      h('td', { class: 'muted' }, accName(A[o.account])),
      h('td', {}, c ? catChip(c) : '?', o.source === 'manuel' ? h('span', { class: 'badge manual', style: { marginLeft: '6px' } }, 'manuel') : null),
      h('td', { class: 'r num ' + (o.amount < 0 ? 'neg' : 'pos'), style: { fontWeight: 600 } }, signed(o.amount))));
  }
  const th = (label, key, cls = '') => h('th', { class: 'sortable ' + cls, onclick: () => { if (f.sort === key) f.dir *= -1; else { f.sort = key; f.dir = -1; } render(); } }, label + (f.sort === key ? (f.dir < 0 ? ' ▼' : ' ▲') : ''));
  const allCb = h('input', { type: 'checkbox', onclick: e => { shown.forEach(o => e.target.checked ? f.sel.add(o.id) : f.sel.delete(o.id)); render(); } });
  const bulkSel = catSelect('', () => { }, {});
  const bulk = h('div', { class: 'bulkbar', style: { display: f.sel.size ? 'flex' : 'none' } }, h('b', { id: 'selCount' }), bulkSel,
    h('button', { class: 'btn sm', onclick: async () => { S.data = await api('/api/operations/category', 'POST', { ids: [...f.sel], categoryId: bulkSel.value }); toast('Catégorie appliquée'); f.sel.clear(); render(); } }, 'Appliquer la catégorie'),
    h('button', { class: 'btn sm sec', onclick: async () => { S.data = await api('/api/operations/category', 'POST', { ids: [...f.sel], categoryId: null }); f.sel.clear(); render(); } }, 'Revenir à l’auto'),
    h('button', { class: 'btn sm sec', onclick: () => { f.sel.clear(); render(); } }, 'Annuler'));
  const totalAmt = sum(ops.map(o => o.amount));
  const autos = S.data.operations.filter(o => o.source === 'défaut' && scopeSet().has(o.account)).length;
  v.append(h('div', { class: 'card' },
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', class: 'grow', placeholder: '🔍 Rechercher (libellé, commerçant, montant…)', value: f.q, oninput: e => { f.q = e.target.value; f.limit = 150; clearTimeout(S._t); S._t = setTimeout(() => { render(); const i = $('input[type=search]'); i.focus(); i.setSelectionRange(99, 99); }, 250); } }),
      catSelect(f.cat, val => { f.cat = val; render(); }, { none: 'Toutes les catégories' }),
      h('div', { class: 'seg' }, [['', 'Tout'], ['debit', 'Débits'], ['credit', 'Crédits']].map(([k, l]) => h('button', { class: f.sign === k ? 'on' : '', onclick: () => { f.sign = k; render(); } }, l))),
      h('label', { class: 'muted', style: { display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: f.internal, onchange: e => { f.internal = e.target.checked; render(); } }), 'Virements internes'),
      h('button', { class: 'btn sm', onclick: () => manualOpModal(null) }, '＋ Nouvelle opération'),
      autos ? h('button', { class: 'btn sm sec', onclick: () => { f.source = f.source ? '' : 'défaut'; render(); } }, f.source ? '✕ Non classées' : `❓ ${autos} non classées`) : null),
    h('div', { class: 'muted', style: { marginBottom: '8px' } }, `${ops.length} opération${ops.length > 1 ? 's' : ''} · total `, h('b', { class: totalAmt < 0 ? 'neg' : 'pos' }, signed(totalAmt))),
    ops.length ? h('div', { class: 'tablewrap' }, h('table', { class: 'optable' }, h('thead', {}, h('tr', {}, h('th', {}, allCb), th('Date', 'date'), th('Libellé', 'title'), h('th', {}, 'Compte'), h('th', {}, 'Catégorie'), th('Montant', 'amount', 'r'))), tbody)) : h('div', { class: 'empty' }, 'Aucune opération ne correspond.'),
    ops.length > shown.length ? h('div', { style: { textAlign: 'center', marginTop: '14px' } }, h('button', { class: 'btn sec', onclick: () => { f.limit += 300; render(); } }, `Afficher plus (${ops.length - shown.length} restantes)`)) : null,
    bulk));
  redrawBulk();
}

function opDetail(o) {
  const C = cats(), acc = S.data.accounts.find(a => a.number === o.account);
  let catId = o.categoryId, pattern = o.title;
  const info = h('dl', { class: 'kv' },
    ...[['Date', fdate(o.date) + (o.kind === 'cb' ? ` (achat du ${fdate(o.opDate)})` : '')], ['Compte', accName(acc)], ['Montant', signed(o.amount)], ['Libellé', o.label], ['Détails', o.details || '—'], ['Relevé', o.statement], ['Classement', o.source + (o.ruleId ? '' : '')]]
      .flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]));
  const sel = catSelect(catId, val => { catId = val; });
  const countEl = h('span', { class: 'muted' });
  const patIn = h('input', { type: 'text', value: pattern, oninput: e => { pattern = e.target.value; upd(); } });
  const upd = () => { const p = pattern.trim().toUpperCase(); const n = p ? S.data.operations.filter(x => `${x.title} ${x.label} ${x.details}`.toUpperCase().includes(p)).length : 0; countEl.textContent = `${n} opération(s) concernée(s)`; };
  upd();
  modal(o.title, [
    h('div', { class: 'preview' }, bubble(C.get(o.categoryId)), h('div', {}, h('div', { class: 'title' }, o.title), h('div', { class: 'muted' }, o.memo || '')), h('div', { style: { marginLeft: 'auto', fontSize: '20px', fontWeight: 700 }, class: o.amount < 0 ? 'neg' : 'pos' }, signed(o.amount))),
    info,
    h('div', { class: 'field' }, h('label', {}, 'Catégorie de cette opération'), sel),
    h('div', { class: 'field' }, h('label', {}, 'Créer une règle automatique : toute opération contenant…'), patIn, countEl),
  ], close => [
    o.manual ? h('button', { class: 'btn sec', onclick: () => { close(); manualOpModal(o); } }, '✏️ Modifier l\u2019opération') : null,
    o.manual ? h('button', { class: 'btn danger', onclick: async () => { S.data = await api('/api/manual-ops/' + o.id.replace('man-', ''), 'DELETE'); close(); toast('Opération supprimée'); render(); } }, '🗑️') : null,
    o.source === 'manuel' ? h('button', { class: 'btn sec', onclick: async () => { S.data = await api('/api/operations/category', 'POST', { ids: [o.id], categoryId: null }); close(); render(); } }, 'Retirer le choix manuel') : null,
    h('button', { class: 'btn sec', onclick: async () => { if (!pattern.trim()) return; S.data = await api('/api/rules', 'POST', { pattern, categoryId: sel.value, sign: o.amount < 0 ? 'debit' : 'credit' }); toast('Règle créée et appliquée'); close(); render(); } }, '⚡ Créer la règle'),
    h('button', { class: 'btn', onclick: async () => { S.data = await api('/api/operations/category', 'POST', { ids: [o.id], categoryId: sel.value }); toast('Catégorie enregistrée'); close(); render(); } }, 'Enregistrer'),
  ], true);
}

// ---------- Statistiques ----------
function pageStats(v) {
  const ops = scopedOps(), A = analyze(ops), C = cats(), months = monthsIn(periodRange());
  const expCats = S.data.categories.filter(c => c.kind === 'expense' && (A.byCat.get(c.id) ?? 0) > 0).sort((a, b) => A.byCat.get(b.id) - A.byCat.get(a.id));
  if (!expCats.length) return v.append(h('div', { class: 'card empty' }, 'Aucune dépense sur cette période.'));
  S.statCats ??= expCats.slice(0, 5).map(c => c.id);

  v.append(h('div', { class: 'card' }, h('h2', {}, 'Dépenses mensuelles par catégorie'), h('div', { class: 'chart-box tall' }, h('canvas', { id: 'cStack' }))));
  chart($('#cStack'), {
    type: 'bar', data: { labels: months.map(m => monthLabel(m)), datasets: expCats.map(c => ({ label: c.name, backgroundColor: c.color, borderRadius: 3, data: months.map(m => Math.round(A.byMonth.get(m)?.cat.get(c.id) ?? 0)) })) },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true } } } },
  });

  // évolution par catégorie
  const chips = h('div', { class: 'chips', style: { marginBottom: '12px' } });
  const drawChips = () => { chips.innerHTML = ''; for (const c of expCats) { const on = S.statCats.includes(c.id); chips.append(h('span', { class: 'chip toggle' + (on ? ' on' : ''), style: on ? { background: c.color } : {}, onclick: () => { S.statCats = on ? S.statCats.filter(x => x !== c.id) : [...S.statCats, c.id]; render(); } }, c.icon + ' ' + c.name)); } };
  drawChips();
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Évolution par catégorie', h('small', {}, 'choisissez les catégories à comparer')), chips, h('div', { class: 'chart-box' }, h('canvas', { id: 'cLines' }))));
  chart($('#cLines'), {
    type: 'line', data: { labels: months.map(m => monthLabel(m)), datasets: S.statCats.filter(id => C.get(id)).map(id => ({ label: C.get(id).name, borderColor: C.get(id).color, backgroundColor: C.get(id).color, tension: .3, borderWidth: 3, pointRadius: 4, data: months.map(m => Math.round(A.byMonth.get(m)?.cat.get(id) ?? 0)) })) },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: { callback: eurTick }, beginAtZero: true } }, plugins: { tooltip: tipEur, legend: { position: 'bottom', labels: { usePointStyle: true } } } },
  });

  // tableau heatmap
  const head = h('tr', {}, h('th', {}, 'Catégorie'), months.map(m => h('th', { class: 'r' }, monthLabel(m))), h('th', { class: 'r' }, 'Total'), h('th', { class: 'r' }, 'Moy./mois'), h('th', { class: 'r' }, 'Dernier mois'));
  const body = expCats.map(c => {
    const vals = months.map(m => A.byMonth.get(m)?.cat.get(c.id) ?? 0), mx = Math.max(...vals, 1), tot = sum(vals);
    const last = vals[vals.length - 1], prev = vals[vals.length - 2];
    const delta = prev > 0 ? (last - prev) / prev * 100 : null;
    return h('tr', {}, h('td', {}, catChip(c)), vals.map(x => h('td', { class: 'v', style: { background: x > 0 ? tint(c.color, .08 + .45 * x / mx) : '' } }, x ? eur0(x) : '–')),
      h('td', { class: 'v', style: { fontWeight: 700 } }, eur0(tot)), h('td', { class: 'v' }, eur0(tot / months.length)),
      h('td', { class: 'v ' + (delta == null ? '' : delta > 0 ? 'neg' : 'pos') }, delta == null ? '–' : (delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta).toFixed(0) + ' %'));
  });
  const totals = months.map(m => A.byMonth.get(m)?.expense ?? 0);
  body.push(h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total'), totals.map(x => h('td', { class: 'v' }, eur0(x))), h('td', { class: 'v' }, eur0(sum(totals))), h('td', { class: 'v' }, eur0(sum(totals) / months.length)), h('td')));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Tableau croisé catégories × mois'), h('div', { class: 'tablewrap' }, h('table', { class: 'heat' }, h('thead', {}, head), h('tbody', {}, body)))));

  // récurrents + jours de semaine
  const rec = new Map();
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind !== 'expense' || o.amount >= 0) continue; const e = rec.get(o.title) ?? { t: o.title, c, months: new Set(), vals: [] }; e.months.add(o.date.slice(0, 7)); e.vals.push(-o.amount); rec.set(o.title, e); }
  const recRows = [...rec.values()].filter(e => e.months.size >= Math.min(3, months.length) && e.vals.length <= e.months.size * 1.5 && e.vals.length >= 3).map(e => ({ ...e, avg: sum(e.vals) / e.months.size })).sort((a, b) => b.avg - a.avg).slice(0, 12);
  const dow = [0, 0, 0, 0, 0, 0, 0];
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind === 'expense') dow[(new Date(o.date + 'T12:00:00').getDay() + 6) % 7] -= o.amount; }
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, '🔁 Dépenses récurrentes détectées', h('small', {}, 'moyenne mensuelle')),
      recRows.length ? h('div', { class: 'legend' }, recRows.map(r => h('div', { class: 'lrow', onclick: () => gotoOps({ q: r.t }) }, bubble(r.c), h('div', {}, h('div', { class: 'name' }, r.t), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${r.months.size} mois · ${r.c.name}`)), h('div', { class: 'amt' }, eur0(r.avg))))) : h('div', { class: 'empty' }, 'Pas assez de données'),
      recRows.length ? h('div', { style: { borderTop: '1px solid var(--line)', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' } }, h('span', { class: 'muted' }, 'Total récurrent / mois'), h('b', {}, eur0(sum(recRows.map(r => r.avg))))) : null),
    h('div', { class: 'card' }, h('h2', {}, '📆 Dépenses par jour de la semaine'), h('div', { class: 'chart-box' }, h('canvas', { id: 'cDow' })))));
  chart($('#cDow'), { type: 'bar', data: { labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'], datasets: [{ data: dow.map(Math.round), backgroundColor: ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f97316', '#eab308', '#10b981'], borderRadius: 8 }] }, options: { scales: { y: { ticks: { callback: eurTick } }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: tipEur } } });
}

// ---------- Catégories ----------
const EMOJI_SETS = {
  'Finance': '💶 💷 💵 💴 💰 💸 💳 🏦 🏧 🧾 📈 📉 📊 🪙 💎 🧮 🏷️ 🔖 🤝 📑 ⚖️ 🏛️ 💹 🪪 📒 🗂️ 🔁 📦 🎁'.split(' '),
  'Maison': '🏠 🏡 🏘️ 🏢 🛋️ 🛏️ 🚿 🛁 🚽 🧹 🧺 🧼 🧽 🪣 🔑 🔧 🔨 🪛 🪚 🔌 💡 🕯️ 🪴 🌿 🌳 🧯 🪜 🚪 🪟 ⚡ 💧 🔥 📺 🧊 🍳 🛡️'.split(' '),
  'Alimentation': '🛒 🍽️ 🍕 🍔 🍟 🌭 🥪 🌮 🍣 🍜 🍝 🥗 🥖 🥐 🧀 🥩 🍗 🍎 🍌 🍇 🥕 🥦 🍅 🥑 🍰 🍫 🍪 🍦 ☕ 🍵 🍺 🍷 🥂 🍾 🧃 🥛'.split(' '),
  'Transport': '🚗 🚙 🚌 🚎 🚕 🚓 🚑 🚒 🏍️ 🛵 🚲 🛴 🚆 🚄 🚇 🚊 ✈️ 🛫 🚀 ⛴️ 🚢 ⛽ 🅿️ 🚦 🛣️ 🗺️ 🧭 🛞 🚧 🚏 🛻 🚚 🚛'.split(' '),
  'Loisirs': '🎭 🎬 🎵 🎶 🎤 🎧 🎮 🕹️ 🎲 🧩 🎨 🖼️ 📚 📖 🎯 🎳 🎸 🎹 🎻 🥁 🎪 🎢 🎡 🎟️ 🏖️ ⛱️ 🏕️ ⛺ 🏔️ 🎿 🏂 🏊 🚴 ⚽ 🏀 🏈 🎾 🏐 🏓 🏸 🥋 🏋️ 🧘 🎣 🌍'.split(' '),
  'Santé': '💊 💉 🩺 🩹 🩸 🏥 🧬 🦷 👓 🕶️ 🧴 😷 🌡️ ❤️ 🫀 🧠 🦴 👁️'.split(' '),
  'Shopping': '🛍️ 👕 👖 👗 👠 👟 🧥 🧢 👜 🎒 💄 💍 ⌚ 📱 💻 🖥️ ⌨️ 🖨️ 📷 🧸 🪞 👶 🍼'.split(' '),
  'Travail & école': '💼 🖇️ 📎 ✏️ 🖊️ 📝 📅 🗓️ 📞 ☎️ 📧 📨 🗄️ 🎓 🏫 📐 📏 🔬 🧪 🔭'.split(' '),
  'Nature & animaux': '🐾 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐴 🐄 🐓 🐟 🐠 🐦 🦜 🐢 🌲 🌴 🌻 🌷 🌹 🍀 🌞 ☔ ❄️ 🌊'.split(' '),
  'Symboles': '⭐ 🌟 ✨ 💝 🎉 🎊 🏆 🥇 🏅 🎖️ 🔔 📌 📍 🔒 🔓 ⚠️ ❓ ❗ ✅ ❌ 🔄 ♻️ ➕ ➖ 📮 🆘 ⏰ ⌛ 🕐 💬 📢 🕊️ 🙏 ⛪ 🕌'.split(' '),
};
const EMOJIS = [...new Set(Object.values(EMOJI_SETS).flat())];
/** Sélecteur d'icônes par thème ; la loupe agrandit l'icône survolée (et l'icône sous la souris dans la grille). */
function emojiPicker(current, onPick) {
  const tab = S.emojiTab ?? 'Tous';
  const loupe = h('div', { class: 'ep-loupe', title: 'Loupe : survolez une icône' }, current);
  const tabs = h('div', { class: 'ep-tabs' }, ['Tous', ...Object.keys(EMOJI_SETS)].map(t => h('button', { type: 'button', class: 'ep-tab' + (t === tab ? ' on' : ''), onclick: () => { S.emojiTab = t; wrap.replaceWith(emojiPicker(current, onPick)); } }, t)));
  const list = tab === 'Tous' ? EMOJIS : EMOJI_SETS[tab];
  const grid = h('div', { class: 'ep-grid' }, list.map(e => h('button', { type: 'button', class: e === current ? 'on' : '', onmouseenter: () => { loupe.textContent = e; }, onmouseleave: () => { loupe.textContent = current; }, onclick: () => onPick(e) }, e)));
  const wrap = h('div', { class: 'emojipicker' }, h('div', { class: 'ep-top' }, tabs, loupe), h('div', { class: 'muted', style: { fontSize: '11.5px', margin: '6px 0 0' } }, EMOJIS.length + ' icônes · survolez pour agrandir, cliquez pour choisir'), grid);
  return wrap;
}
const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#64748b', '#9ca3af'];
function pageCategories(v) {
  const ops = scopedOps(), A = analyze(ops), months = monthsIn(periodRange()).length || 1;
  const counts = new Map(); for (const o of ops) counts.set(o.categoryId, (counts.get(o.categoryId) ?? 0) + 1);
  const ruleCount = new Map(); for (const r of S.data.rules) ruleCount.set(r.categoryId, (ruleCount.get(r.categoryId) ?? 0) + 1);
  const groups = [['expense', '💸 Dépenses'], ['income', '💰 Revenus'], ['transfer', '🔁 Virements entre comptes']];
  for (const [kind, label] of groups) {
    const list = S.data.categories.filter(c => c.kind === kind);
    if (kind === 'transfer' && !list.length) continue;
    list.sort((a, b) => Math.abs(A.byCat.get(b.id) ?? 0) - Math.abs(A.byCat.get(a.id) ?? 0));
    const grid = h('div', { class: 'catgrid' });
    for (const c of list) {
      const tot = A.byCat.get(c.id) ?? 0, bud = c.budget ? c.budget * months : 0, pct = bud ? tot / bud * 100 : 0;
      const system = ['autres', 'revenus-divers', 'virement-interne'].includes(c.id);
      grid.append(h('div', { class: 'catcard', style: { '--c': c.color } },
        h('div', { class: 'acts' }, h('button', { class: 'icon-btn', title: 'Modifier', onclick: () => editCategory(c) }, '✏️'), system ? null : h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => deleteCategory(c) }, '🗑️')),
        h('div', { class: 'head' }, bubble(c), h('div', {}, h('div', { class: 'nm' }, c.name), h('div', { class: 'meta' }, `${counts.get(c.id) ?? 0} opération(s) · ${ruleCount.get(c.id) ?? 0} règle(s)`))),
        h('div', { class: 'tot' }, kind === 'transfer' ? '—' : eur0(tot)),
        h('div', { class: 'meta' }, kind === 'transfer' ? 'Exclus des statistiques' : `${eur0(tot / months)} / mois en moyenne`),
        bud ? h('div', {}, h('div', { class: 'progress' + (pct > 100 ? ' over' : '') }, h('i', { style: { width: Math.min(100, pct) + '%' } })), h('div', { class: 'meta', style: { marginTop: '4px' } }, `Budget ${eur0(c.budget)}/mois · ${pct.toFixed(0)} %`)) : null,
        h('div', { style: { marginTop: '12px', position: 'relative', zIndex: 1 } }, h('button', { class: 'btn sm sec', onclick: () => gotoOps({ cat: c.id }) }, 'Voir les opérations'))));
    }
    if (kind !== 'transfer') grid.append(h('button', { class: 'addcard', onclick: () => editCategory(null, kind) }, '＋ Nouvelle catégorie'));
    v.append(h('h2', { style: { margin: '10px 0 14px' } }, label), grid);
  }
  v.append(h('h2', { style: { margin: '30px 0 14px' } }, '⚡ Règles de classement automatique'), rulesCard());
}
function rulesCard() {
  const C = cats(); let filter = '', q = '';
  const host = h('div', { class: 'card' });
  const draw = () => {
    host.innerHTML = '';
    const pIn = h('input', { type: 'text', placeholder: 'Texte à repérer (ex : LIDL)', class: 'grow' });
    const cSel = catSelect('courses', () => { });
    const sSel = h('select', {}, h('option', { value: 'any' }, 'Débit ou crédit'), h('option', { value: 'debit' }, 'Débits seulement'), h('option', { value: 'credit' }, 'Crédits seulement'));
    const rows = S.data.rules.filter(r => (!filter || r.categoryId === filter) && (!q || r.pattern.toLowerCase().includes(q.toLowerCase())));
    host.append(
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Une opération reçoit la catégorie de la première règle dont le texte apparaît dans son libellé. Les règles que vous créez passent en priorité. Un choix manuel sur une opération l’emporte sur toutes les règles.'),
      h('div', { class: 'toolbar' }, pIn, sSel, cSel, h('button', { class: 'btn', onclick: async () => { if (!pIn.value.trim()) return pIn.focus(); S.data = await api('/api/rules', 'POST', { pattern: pIn.value, categoryId: cSel.value, sign: sSel.value }); toast('Règle ajoutée'); render(); } }, 'Ajouter la règle')),
      h('div', { class: 'toolbar' }, h('input', { type: 'search', placeholder: '🔍 Filtrer les règles', value: q, oninput: e => { q = e.target.value; draw(); const i = host.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(99, 99); } }), catSelect(filter, val => { filter = val; draw(); }, { none: 'Toutes les catégories' }), h('span', { class: 'muted' }, rows.length + ' règle(s)')),
      h('div', { class: 'tablewrap', style: { maxHeight: '420px' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Contient'), h('th', {}, 'Sens'), h('th', {}, 'Catégorie'), h('th', {}))),
        h('tbody', {}, rows.slice(0, 200).map(r => h('tr', {}, h('td', {}, h('b', {}, r.pattern), r.id.startsWith('u') ? h('span', { class: 'badge manual', style: { marginLeft: '8px' } }, 'perso') : null),
          h('td', { class: 'muted' }, { any: '—', debit: 'Débit', credit: 'Crédit' }[r.sign || 'any']),
          h('td', {}, catSelect(r.categoryId, async val => { S.data = await api('/api/rules/' + r.id, 'PUT', { categoryId: val }); toast('Règle modifiée'); render(); })),
          h('td', { class: 'r' }, h('button', { class: 'icon-btn', onclick: async () => { S.data = await api('/api/rules/' + r.id, 'DELETE'); render(); } }, '🗑️'))))))));
  };
  draw(); return host;
}
function editCategory(c, kind) {
  const d = c ? { ...c } : { name: '', icon: '📦', color: COLORS[Math.floor(Math.random() * COLORS.length)], kind: kind || 'expense', budget: '' };
  const nameIn = h('input', { type: 'text', value: d.name, placeholder: 'Ex : Vacances', oninput: e => { d.name = e.target.value; prev(); } });
  const emo = h('div', { class: 'emojis' }), sw = h('div', { class: 'swatches' });
  const emIn = h('input', { type: 'text', value: d.icon, style: { width: '70px', textAlign: 'center', fontSize: '18px' }, oninput: e => { d.icon = e.target.value.trim().slice(0, 4) || '📦'; drawE(); prev(); } });
  const colIn = h('input', { type: 'color', value: d.color, oninput: e => { d.color = e.target.value; drawC(); prev(); } });
  const preview = h('div', { class: 'preview' });
  const prev = () => { preview.innerHTML = ''; preview.append(bubble(d), h('b', {}, d.name || 'Nom de la catégorie'), h('span', { style: { marginLeft: 'auto' } }, catChip(d))); };
  const drawE = () => { emo.innerHTML = ''; emo.append(emojiPicker(d.icon, e => { d.icon = e; emIn.value = e; drawE(); prev(); })); };
  const drawC = () => { sw.innerHTML = ''; COLORS.forEach(k => sw.append(h('button', { type: 'button', class: d.color === k ? 'on' : '', style: { background: k }, onclick: () => { d.color = k; colIn.value = k; drawC(); prev(); } }))); };
  drawE(); drawC(); prev();
  const kindSeg = h('div', { class: 'seg' });
  const drawK = () => { kindSeg.innerHTML = ''; [['expense', 'Dépense'], ['income', 'Revenu'], ['transfer', 'Virement interne']].forEach(([k, l]) => kindSeg.append(h('button', { type: 'button', class: d.kind === k ? 'on' : '', onclick: () => { d.kind = k; drawK(); } }, l))); };
  drawK();
  const budIn = h('input', { type: 'number', min: 0, step: 10, value: d.budget || '', placeholder: 'Aucun', oninput: e => { d.budget = e.target.value; } });
  modal(c ? 'Modifier la catégorie' : 'Nouvelle catégorie', [
    preview, h('div', { class: 'field' }, h('label', {}, 'Nom'), nameIn),
    h('div', { class: 'field' }, h('label', {}, 'Icône'), h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' } }, emIn, h('span', { class: 'muted' }, 'ou choisissez ci-dessous')), emo),
    h('div', { class: 'field' }, h('label', {}, 'Couleur'), h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' } }, colIn), sw),
    h('div', { class: 'field' }, h('label', {}, 'Type'), kindSeg),
    h('div', { class: 'field' }, h('label', {}, 'Budget mensuel (€, optionnel — pour les dépenses)'), budIn),
  ], close => [
    h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => {
      if (!d.name.trim()) return nameIn.focus();
      S.data = c ? await api('/api/categories/' + encodeURIComponent(c.id), 'PUT', d) : await api('/api/categories', 'POST', d);
      toast(c ? 'Catégorie modifiée' : 'Catégorie créée'); close(); render();
    } }, c ? 'Enregistrer' : 'Créer'),
  ]);
}
function deleteCategory(c) {
  const n = S.data.operations.filter(o => o.categoryId === c.id).length;
  const sel = catSelect(c.kind === 'income' ? 'revenus-divers' : 'autres', () => { }, { kinds: [c.kind] });
  modal('Supprimer « ' + c.name + ' » ?', [
    h('p', {}, `${n} opération(s) sont dans cette catégorie. Les règles associées seront supprimées.`),
    h('div', { class: 'field' }, h('label', {}, 'Déplacer les opérations classées manuellement vers'), sel),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn danger', onclick: async () => { S.data = await api(`/api/categories/${encodeURIComponent(c.id)}?reassign=${encodeURIComponent(sel.value)}`, 'DELETE'); toast('Catégorie supprimée'); close(); render(); } }, 'Supprimer')]);
}

// ---------- Comptes ----------
function pageAccounts(v) {
  const accs = S.data.accounts, [r0, r1] = periodRange();
  S.accSel ??= accs.find(isCurrent)?.number ?? accs[0].number;
  if (!accs.some(x => x.number === S.accSel)) S.accSel = accs[0].number;
  const sc = accs.map(a => {
    const ops = S.data.operations.filter(o => o.account === a.number && o.date.slice(0, 7) >= r0 && o.date.slice(0, 7) <= r1);
    return { a, in: sum(ops.filter(o => o.amount > 0).map(o => o.amount)), out: sum(ops.filter(o => o.amount < 0).map(o => o.amount)), n: ops.length };
  });
  v.append(h('div', { class: 'toolbar' }, h('button', { class: 'btn', onclick: () => accountModal(null) }, '＋ Ajouter un compte'), h('span', { class: 'muted' }, 'Autre banque, espèces, carte de crédit… saisis à la main.')));
  v.append(h('div', { class: 'grid g3' }, sc.map(({ a, in: i, out, n }) => h('div', { class: 'card acc' + (S.accSel === a.number ? ' sel' : ''), onclick: () => { S.accSel = a.number; render(); } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      h('span', { class: 'type', style: { background: accColor(a.type) } }, accIcon(a.type) + ' ' + (a.manual ? MANUAL_TYPES[a.type] : { CCP: 'Compte courant', CEL: 'CEL', PEL: 'PEL', LIVRET_A: 'Livret A', LDDS: 'LDDS' }[a.type])),
      h('span', {}, a.manual ? h('button', { class: 'icon-btn', title: 'Ajouter une opération', onclick: e => { e.stopPropagation(); manualOpModal(null, a.number); } }, '➕') : null,
        h('button', { class: 'icon-btn', title: a.manual ? 'Modifier le compte' : 'Renommer', onclick: e => { e.stopPropagation(); a.manual ? accountModal(a) : renameAccount(a); } }, '✏️'),
        a.manual ? h('button', { class: 'icon-btn', title: 'Supprimer le compte', onclick: e => { e.stopPropagation(); deleteAccount(a); } }, '🗑️') : null)),
    h('div', { style: { marginTop: '10px', fontWeight: 600 } }, accName(a)),
    h('div', { class: 'bal', style: { color: a.balance < 0 ? 'var(--bad)' : '' } }, eur(a.balance)),
    h('div', { class: 'muted', style: { fontSize: '12px' } }, a.manual ? ('Saisie manuelle' + (a.bank ? ' · ' + a.bank : '')) : 'n° ' + a.number),
    h('div', { style: { display: 'flex', gap: '14px', marginTop: '10px', fontSize: '13px' } }, h('span', { class: 'pos' }, '▲ ' + eur0(i)), h('span', { class: 'neg' }, '▼ ' + eur0(Math.abs(out))), h('span', { class: 'muted' }, n + ' op.'))))));
  const a = accs.find(x => x.number === S.accSel), bs = balanceSeries([a.number]);
  const i0 = bs.days.findIndex(d => d.slice(0, 7) >= r0), i1 = bs.days.length - 1 - [...bs.days].reverse().findIndex(d => d.slice(0, 7) <= r1);
  const A = analyze(S.data.operations.filter(o => o.account === a.number)), months = allMonths();
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Évolution du solde — ' + accName(a), h('small', {}, a.iban || '')), h('div', { class: 'chart-box tall' }, h('canvas', { id: 'cAcc' }))));
  chart($('#cAcc'), { type: 'line', data: { labels: bs.days.slice(i0, i1 + 1).map(fdate), datasets: [{ label: 'Solde', data: bs.res[a.number].slice(i0, i1 + 1), borderColor: accColor(a.type), backgroundColor: ctx => gradient(ctx, accColor(a.type)), fill: true, borderWidth: 3, pointRadius: 0, tension: .2, stepped: false }] }, options: { interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 10 }, grid: { display: false } }, y: { ticks: { callback: eurTick } } }, plugins: { legend: { display: false }, tooltip: tipEur } } });
  void A; void months;
  v.append(h('div', { class: 'card', style: { marginTop: '18px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' } }, h('div', { style: { fontSize: '30px' } }, '🗃️'), h('div', {}, h('b', {}, `${S.data.statements.length} relevés importés`), h('div', { class: 'muted' }, 'Affichage par année, ajout, ouverture et suppression des PDF.')), h('a', { class: 'btn', href: '#/statements', style: { marginLeft: 'auto', textDecoration: 'none' } }, 'Gérer les relevés →')));
}
function renameAccount(a) {
  const inp = h('input', { type: 'text', value: a.alias || '', placeholder: accName({ ...a, alias: '' }) });
  modal('Renommer le compte', [h('div', { class: 'field' }, h('label', {}, 'Nom affiché'), inp)], close => [
    h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => { S.data = await api('/api/accounts/' + a.number, 'PUT', { alias: inp.value }); close(); render(); } }, 'Enregistrer')]);
}

// ============ Routage ============
const PAGES = { dashboard: pageDashboard, operations: pageOperations, stats: pageStats, forecast: pageForecast, compare: pageCompare, docs: pageDocs, reports: pageReports, backups: pageBackups, menus: pageMenus, immo: pageImmo, 'immo-params': pageImmoParams, 'immo-planning': pagePlanning, 'immo-suivi': pageSuivi, 'immo-actions': pageActions, 'immo-ai': pageImmoAI, techdocs: pageTechDocs, db: pageDb, biens: pageBiens, bien: pageBien, 'biens-stats': pageBiensStats, 'biens-docs': pageBiensDocs, 'biens-estimation': pageBiensEstimation, manifest: pageManifest, model: pageModel, analyse: pageAnalyse, ai: pageAISettings, prompts: pagePrompts, license: pageLicense, versions: pageVersions, statements: pageStatements, categories: pageCategories, accounts: pageAccounts };
function render() {
  const fk = document.activeElement?.dataset?.fk;
  charts.splice(0).forEach(c => c.destroy());
  const page = (location.hash.replace('#/', '') || 'dashboard'); S.page = PAGES[page] ? page : 'dashboard';
  renderNav(); setPageTitle();
  renderFilters();
  const v = $('#view'); v.innerHTML = '';
  const y = window.scrollY;
  PAGES[S.page](v);
  window.scrollTo(0, y);
  if (fk) { const el = document.querySelector('[data-fk="' + fk + '"]'); if (el) { el.focus({ preventScroll: true }); try { el.select(); } catch { /* non sélectionnable */ } } }
  const d = new Date(S.data.importedAt); $('#importInfo').innerHTML = ''; $('#importInfo').append(`v${S.data.version ?? ''} · ${S.data.operations.length} opérations · ${S.data.statements.length} relevés`, h('br'), S.data.license?.copyright ?? '');
  void d;
}
window.addEventListener('hashchange', () => { $('#modalRoot').innerHTML = ''; if (S.data?.license?.needsAcceptance) showEula(true); window.scrollTo(0, 0); render(); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !S.data?.license?.needsAcceptance) $('#modalRoot').innerHTML = ''; });
$('#themeBtn').onclick = () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); render(); };
(async () => {
  $('#view').append(h('div', { class: 'loading' }, 'Chargement des relevés…'));
  S.data = await api('/api/state');
  render();
  if (S.data.license?.needsAcceptance) showEula(true);
})();

// ============ Comptes et opérations manuels ============
function accountModal(acc) {
  const d = acc ? { name: acc.name, type: acc.type, bank: acc.bank || '', opening: acc.opening ?? 0 } : { name: '', type: 'MAN_COURANT', bank: '', opening: 0 };
  const nameIn = h('input', { type: 'text', value: d.name, placeholder: 'Ex : Compte Crédit Agricole', oninput: e => { d.name = e.target.value; } });
  const typeSel = h('select', { onchange: e => { d.type = e.target.value; } }, Object.entries(MANUAL_TYPES).map(([k, l]) => h('option', { value: k, selected: d.type === k }, accIcon(k) + ' ' + l)));
  const bankIn = h('input', { type: 'text', value: d.bank, placeholder: 'Facultatif', oninput: e => { d.bank = e.target.value; } });
  const openIn = h('input', { type: 'number', step: '0.01', value: d.opening, oninput: e => { d.opening = e.target.value; } });
  modal(acc ? 'Modifier le compte' : 'Ajouter un compte', [
    h('div', { class: 'field' }, h('label', {}, 'Nom du compte'), nameIn),
    h('div', { class: 'field' }, h('label', {}, 'Type'), typeSel),
    h('div', { class: 'field' }, h('label', {}, 'Banque / établissement'), bankIn),
    h('div', { class: 'field' }, h('label', {}, 'Solde initial (€) — avant la première opération saisie'), openIn),
    h('div', { class: 'tip' }, 'Les opérations de ce compte se saisissent à la main (bouton ➕ de la carte ou « Nouvelle opération »). Elles sont classées et comptées comme les autres.'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => {
      if (!d.name.trim()) return nameIn.focus();
      S.data = acc ? await api('/api/accounts/' + acc.number, 'PUT', d) : await api('/api/accounts', 'POST', d);
      close(); toast(acc ? 'Compte modifié' : 'Compte ajouté'); if (!acc) S.accSel = S.data.accounts.at(-1).number; render();
    } }, acc ? 'Enregistrer' : 'Ajouter le compte')]);
}
function deleteAccount(acc) {
  const n = S.data.operations.filter(o => o.account === acc.number).length;
  modal('Supprimer « ' + accName(acc) + ' » ?', [h('p', {}, 'Le compte et ses ' + n + ' opération(s) saisies seront supprimés définitivement.')],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
      h('button', { class: 'btn danger', onclick: async () => { S.data = await api('/api/accounts/' + acc.number, 'DELETE'); if (S.scope === acc.number) S.scope = 'courants'; close(); toast('Compte supprimé'); render(); } }, 'Supprimer')]);
}
function manualOpModal(op, accNumber) {
  const accs = S.data.accounts.filter(a => a.manual);
  if (!accs.length) return modal('Aucun compte manuel', [h('p', {}, 'Ajoutez d\u2019abord un compte (page Comptes) pour y saisir des opérations.')],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Fermer'), h('button', { class: 'btn', onclick: () => { close(); accountModal(null); } }, '＋ Ajouter un compte')]);
  const today = new Date().toISOString().slice(0, 10);
  const d = op ? { account: op.account, date: op.date, sign: op.amount < 0 ? -1 : 1, amount: Math.abs(op.amount), label: op.label, details: op.details || '', categoryId: op.categoryId }
    : { account: accNumber || accs[0].number, date: today, sign: -1, amount: '', label: '', details: '', categoryId: 'autres' };
  const accSel = h('select', { onchange: e => { d.account = e.target.value; } }, accs.map(a => h('option', { value: a.number, selected: d.account === a.number }, accIcon(a.type) + ' ' + accName(a))));
  const dateIn = h('input', { type: 'date', value: d.date, oninput: e => { d.date = e.target.value; } });
  const amtIn = h('input', { type: 'number', step: '0.01', min: 0, value: d.amount, placeholder: '0,00', oninput: e => { d.amount = e.target.value; } });
  const catHolder = h('div');
  const drawCat = () => { catHolder.innerHTML = ''; catHolder.append(catSelect(d.categoryId, val => { d.categoryId = val; })); };
  const seg = h('div', { class: 'seg' });
  const drawSeg = () => { seg.innerHTML = ''; [[-1, 'Dépense'], [1, 'Revenu / entrée']].forEach(([k, l]) => seg.append(h('button', { type: 'button', class: d.sign === k ? 'on' : '', onclick: () => { d.sign = k; if (!op) d.categoryId = k < 0 ? 'autres' : 'revenus-divers'; drawSeg(); drawCat(); } }, l))); };
  drawSeg(); drawCat();
  const labIn = h('input', { type: 'text', value: d.label, placeholder: 'Ex : Courses marché', oninput: e => { d.label = e.target.value; } });
  const detIn = h('input', { type: 'text', value: d.details, placeholder: 'Facultatif', oninput: e => { d.details = e.target.value; } });
  modal(op ? 'Modifier l\u2019opération' : 'Nouvelle opération', [
    h('div', { class: 'field' }, h('label', {}, 'Compte'), accSel),
    h('div', { class: 'grid g2', style: { gap: '12px' } }, h('div', { class: 'field' }, h('label', {}, 'Date'), dateIn), h('div', { class: 'field' }, h('label', {}, 'Montant (€)'), amtIn)),
    h('div', { class: 'field' }, h('label', {}, 'Sens'), seg),
    h('div', { class: 'field' }, h('label', {}, 'Libellé'), labIn),
    h('div', { class: 'field' }, h('label', {}, 'Détails'), detIn),
    h('div', { class: 'field' }, h('label', {}, 'Catégorie'), catHolder),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => {
      const amount = Math.abs(parseFloat(String(d.amount).replace(',', '.'))) * d.sign;
      if (!d.label.trim()) return labIn.focus(); if (!amount) return amtIn.focus();
      const body = { account: d.account, date: d.date, amount, label: d.label, details: d.details, categoryId: d.categoryId };
      S.data = op ? await api('/api/manual-ops/' + op.id.replace('man-', ''), 'PUT', body) : await api('/api/manual-ops', 'POST', body);
      close(); toast(op ? 'Opération modifiée' : 'Opération ajoutée'); render();
    } }, op ? 'Enregistrer' : 'Ajouter')]);
}
