'use strict';
// ============ Base de données : volume de stockage, graphiques et prévision des mois à venir ============
const dbMonthAdd = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const dbMonthLabel = m => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
const DB_COL = { base: '#6366f1', releves: '#0ea5e9', biens: '#10b981', immo: '#f59e0b', rapports: '#ec4899', sauvegardes: '#8b5cf6', versions: '#64748b' };
const DB_HORIZON = 12;

/**
 * Prévision : pour chaque famille, croissance mensuelle = moyenne des 6 derniers mois complets (scénario central),
 * bornée par les moyennes sur 3 et 12 mois (scénarios bas et haut). Volume futur = volume actuel + n × croissance.
 */
function dbForecast(V) {
  const now = new Date().toISOString().slice(0, 7), done = Array.from({ length: 12 }, (_, i) => dbMonthAdd(now, -12 + i)); // 12 derniers mois complets
  const fams = V.families.map(f => {
    const inc = m => f.monthly[m] ?? 0, first = Object.keys(f.monthly).sort()[0];
    const avg = n => { const ms = done.slice(-n).filter(m => !first || m >= first); return ms.length ? ms.reduce((t, m) => t + inc(m), 0) / ms.length : 0; };
    const r3 = avg(3), r6 = avg(6), r12 = avg(12), central = r6, low = Math.min(r3, r6, r12), high = Math.max(r3, r6, r12);
    return { ...f, central, low, high, at: (n, k = 'central') => f.bytes + n * { central, low, high }[k] };
  });
  return { now, fams, cur: fams.reduce((t, f) => t + f.bytes, 0), rate: k => fams.reduce((t, f) => t + f[k], 0), sumAt: (n, k) => fams.reduce((t, f) => t + f.at(n, k), 0) };
}

function dbVolumeSection(v, V) {
  const F = dbForecast(V), fam = F.fams, nowM = F.now, hist = Array.from({ length: 12 }, (_, i) => dbMonthAdd(nowM, -11 + i)), fut = Array.from({ length: DB_HORIZON }, (_, i) => dbMonthAdd(nowM, i + 1));
  // volume cumulé par mois : fichiers classés par date de modification ; base reconstituée d'après les dates des enregistrements
  const cumAt = (f, m) => Object.entries(f.monthly).filter(([k]) => k <= m).reduce((t, [, b]) => t + b, 0);
  const real = hist.map(m => fam.reduce((t, f) => t + cumAt(f, m), 0)), totalNow = F.cur;
  const proj = k => hist.map((_, i) => (i === hist.length - 1 ? totalNow : null)).concat(fut.map((_, i) => F.sumAt(i + 1, k)));
  const labels = hist.concat(fut).map(dbMonthLabel), mb = x => +(x / 1048576).toFixed(3);
  const t6 = ['low', 'central', 'high'].map(k => F.sumAt(6, k)), t12 = ['low', 'central', 'high'].map(k => F.sumAt(12, k));
  const top = [...fam].sort((a, b) => b.central - a.central)[0];

  v.append(h('div', { class: 'grid g4', style: { marginTop: '14px' } },
    kpi('k3', 'Volume total actuel', dbBytes(totalNow), 'base ' + dbBytes(fam[0].bytes) + ' · fichiers ' + dbBytes(totalNow - fam[0].bytes), '📦'),
    kpi('k4', 'Croissance moyenne', '+' + dbBytes(F.rate('central')) + ' / mois', 'fourchette ' + dbBytes(F.rate('low')) + ' → ' + dbBytes(F.rate('high')) + (top && top.central > 0 ? ' · surtout ' + top.label.toLowerCase() : ''), '📈'),
    kpi('k2', 'Dans 6 mois', dbBytes(t6[1]), 'entre ' + dbBytes(t6[0]) + ' et ' + dbBytes(t6[2]), '🔮'),
    kpi('k1', 'Dans 12 mois', dbBytes(t12[1]), 'entre ' + dbBytes(t12[0]) + ' et ' + dbBytes(t12[2]), '🗓️')));

  v.append(h('div', { class: 'card ccard', style: { '--ac': '#0ea5e9', marginTop: '14px' } }, h('h2', {}, '📈 Évolution du volume et prévision', h('small', {}, '12 mois passés · 12 mois à venir · en Mo')),
    h('div', { class: 'chart-box tall' }, h('canvas', { id: 'dbEvol' })),
    h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '12.5px' } }, 'Scénario central = croissance moyenne des 6 derniers mois ; la zone colorée va du scénario bas au scénario haut (moyennes sur 3 et 12 mois). L’historique est reconstitué d’après les dates des fichiers et des enregistrements ; '
      + (V.snapshots.length > 1 ? V.snapshots.length + ' mesures réelles de la base sont déjà enregistrées. ' : 'les mesures quotidiennes de la base s’accumulent dès maintenant. ') + 'Les sauvegardes et rapports supprimés ne sont pas comptés dans le passé.')));
  const curve = (k, col, extra = {}) => ({ label: { low: 'Prévision basse', central: 'Prévision (scénario central)', high: 'Prévision haute' }[k], data: proj(k).map(x => (x == null ? null : mb(x))), borderColor: col, backgroundColor: col + '22', borderWidth: k === 'central' ? 3 : 1.5, borderDash: k === 'central' ? [7, 5] : [2, 4], pointRadius: 0, tension: .2, spanGaps: false, ...extra });
  chart($('#dbEvol'), { type: 'line', data: { labels, datasets: [
    { label: 'Volume réel', data: real.map(mb).concat(fut.map(() => null)), borderColor: '#0f172a', backgroundColor: '#0f172a', borderWidth: 3, pointRadius: 3, tension: .2 },
    curve('low', '#0ea5e9', { fill: '+2', backgroundColor: 'rgba(14,165,233,.14)' }), curve('central', '#6366f1'), curve('high', '#0ea5e9')] },
  options: { scales: { y: { ticks: { callback: x => x.toLocaleString('fr-FR') + ' Mo' } }, x: { ticks: { maxRotation: 45 } } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => (c.raw == null ? null : ' ' + c.dataset.label + ' : ' + c.raw.toLocaleString('fr-FR') + ' Mo') } } } } });

  const tbs = [...V.tables].sort((a, b) => b.bytes - a.bytes).filter(t => t.bytes > 0);
  v.append(h('div', { class: 'grid g2', style: { marginTop: '14px' } },
    h('div', { class: 'card ccard', style: { '--ac': '#6366f1' } }, h('h2', {}, '🧩 Volume par table', h('small', {}, 'données JSON, en Ko')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'dbTables' }))),
    h('div', { class: 'card ccard', style: { '--ac': '#10b981' } }, h('h2', {}, '🥧 Répartition du stockage', h('small', {}, dbBytes(totalNow) + ' au total')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'dbFam' })))));
  chart($('#dbTables'), { type: 'bar', data: { labels: tbs.map(t => t.name), datasets: [{ label: 'Ko', data: tbs.map(t => +(t.bytes / 1024).toFixed(1)), backgroundColor: '#6366f1', borderRadius: 5 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.raw.toLocaleString('fr-FR') + ' Ko · ' + tbs[c.dataIndex].rows + ' ligne(s)' } } }, scales: { x: { ticks: { callback: x => x + ' Ko' } }, y: { grid: { display: false } } } } });
  const pos = fam.filter(f => f.bytes > 0);
  vDonut($('#dbFam'), pos.map(f => f.label), pos.map(f => f.bytes), pos.map(f => DB_COL[f.key]), [dbBytes(totalNow), 'stockage'], { cutout: '62%', legend: 'right', fmt: dbBytes });

  v.append(h('div', { class: 'card ccard', style: { '--ac': '#f59e0b', marginTop: '14px' } }, h('h2', {}, '📊 Croissance mensuelle par famille', h('small', {}, 'Mo ajoutés chaque mois')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'dbInc' }))));
  chart($('#dbInc'), { type: 'bar', data: { labels: hist.map(dbMonthLabel), datasets: fam.map(f => ({ label: f.label, data: hist.map(m => mb(f.monthly[m] ?? 0)), backgroundColor: DB_COL[f.key], borderRadius: 3, stack: 's' })) },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: x => x.toLocaleString('fr-FR') + ' Mo' } } }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } } } });

  const dot = c => h('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '3px', background: c, marginRight: '8px' } });
  v.append(h('div', { class: 'card', style: { marginTop: '14px' } }, h('h2', {}, 'Prévision par famille', h('small', {}, 'scénario central, avec fourchette à 12 mois')),
    h('div', { class: 'tablewrap' }, h('table', {}, th('Famille', ['Fichiers / lignes', 'r'], ['Actuel', 'r'], ['Croissance / mois', 'r'], ['Dans 6 mois', 'r'], ['Dans 12 mois', 'r'], ['Fourchette à 12 mois', 'r']),
      h('tbody', {}, fam.map(f => h('tr', {}, h('td', {}, dot(DB_COL[f.key]), f.label), h('td', { class: 'r num' }, f.count.toLocaleString('fr-FR')), h('td', { class: 'r num' }, dbBytes(f.bytes)),
        h('td', { class: 'r num' }, '+' + dbBytes(f.central)), h('td', { class: 'r num' }, dbBytes(f.at(6))), h('td', { class: 'r num', style: { fontWeight: 700 } }, dbBytes(f.at(12))), h('td', { class: 'r num muted' }, dbBytes(f.at(12, 'low')) + ' → ' + dbBytes(f.at(12, 'high'))))),
      h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total'), h('td'), h('td', { class: 'r num' }, dbBytes(totalNow)), h('td', { class: 'r num' }, '+' + dbBytes(F.rate('central'))), h('td', { class: 'r num' }, dbBytes(t6[1])), h('td', { class: 'r num' }, dbBytes(t12[1])), h('td', { class: 'r num' }, dbBytes(t12[0]) + ' → ' + dbBytes(t12[2]))))))));
}
