'use strict';
// ============ Biens immobiliers : dépenses rattachées, statistiques par période + estimation de valeur ============
let bsSel = 'all';            // périmètre des stats : 'all' ou identifiant d'un bien
let bsGran = (() => { try { return localStorage.getItem('bsgran') || 'm'; } catch { return 'm'; } })(); // regroupement : m | t | a
let bes = null;               // état de la page estimation (remis à zéro si le bien change)
let besAI = null;             // dernière analyse IA / locale affichée
let besConsent = false;       // consentement d'envoi à l'IA (session)
const BES_RAYONS = [[0, '0 % (surface exacte)'], [.05, '± 5 %'], [.1, '± 10 %'], [.15, '± 15 %']];
const BES_PERIODES = [[12, '12 mois'], [24, '24 mois'], [36, '36 mois'], [60, '5 ans']];
const BES_SYSTEM = 'Tu es un expert en estimation immobilière en France, familier des données DVF (demandes de valeurs foncières), de la lecture des centiles et des déterminants de valeur (état, DPE, étage, extérieur, garage, terrain). Tu réponds TOUJOURS et UNIQUEMENT en français (titres, listes, explications, conclusion), sans aucun mot anglais hors sigles usuels. Tu travailles uniquement à partir des chiffres fournis : tu n’inventes jamais de valeur ni de transaction. Tu rappelles que ton estimation n’est ni une expertise, ni une offre de vente, et que les DVF reflètent des ventes passées. Rédige avec structure (titres en ##), concision et pédagogie.';
const BES_USER = [
  'IMPORTANT : rédige toute ta réponse en français.',
  '',
  '## Données du bien',
  '{{bien}}',
  '',
  '## Estimation à partir des ventes réelles (DVF)',
  '{{estimation}}',
  '',
  '## Consigne',
  'Rédige une analyse d’estimation immobilière structurée ainsi :',
  '- « ## Fourchette estimée » : rappelle le mini, le central et le maxi attendus, justifie l’écart par l’échantillon et la dispersion des ventes.',
  '- « ## Ce qui valorise le bien » et « ## Ce qui le dévalorise » : à partir des caractéristiques et des ajustements chiffrés fournis.',
  '- « ## Limites de l’estimation » : qualité et ancienneté des données, taille de l’échantillon, comparables utilisés, biais éventuels.',
  '- « ## Recommandations » : concrètes et priorisées (élargir la période ou le rayon, vérifier un point de la fiche,ester au moment opportun…).',
  '- « ## Conclusion » : une phrase de synthèse avec la fourchette retenue.',
  'N’invente aucun chiffre absent des données.',
].join('\n');

// ====================================================== Dépenses et statistiques
async function pageBiensStats(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  await biensLoad(); if (S.page !== 'biens-stats') return; v.innerHTML = '';
  const items = biensAll();
  if (!items.length) { v.append(biensEmpty('Statistiques indisponibles : créez d’abord un bien.', 'biens')); return; }
  if (bsSel !== 'all' && !items.some(b => b.id === bsSel)) bsSel = 'all';
  const sel = h('select', { style: { maxWidth: '300px', fontWeight: 600 }, onchange: e => { bsSel = e.target.value; localStorage.setItem('bsel', bsSel); render(); } },
    [h('option', { value: 'all', selected: bsSel === 'all' }, '🏘️ Tous les biens'),
      ...items.map(b => h('option', { value: b.id, selected: bsSel === b.id }, `${b.icone || '🏠'} ${b.nom}`))]);
  const scope = bsSel === 'all' ? items : items.filter(b => b.id === bsSel);
  const ops0 = scopedOps(), C = cats(), [r0, r1] = periodRange();
  const periodLabel = r0 === r1 ? monthLabel(r0, true) : `${monthLabel(r0, true)} → ${monthLabel(r1, true)}`;

  const per = scope.map(b => { const dep = bienOps(b, ops0).filter(o => o.amount < 0); return { b, dep, tot: -sum(dep.map(o => o.amount)) }; });
  const allRows = scope.flatMap(b => bienOpsAll(b, ops0).filter(o => o.amount < 0).map(o => ({ o, b })));
  const rows = per.flatMap(p => p.dep.map(o => ({ o, b: p.b }))), depTot = sum(per.map(p => p.tot));
  const bk = bienBuckets(rows, r0, r1, bsGran), used = bk.filter(x => x.n);
  // revenus locatifs (catégories de revenus rattachées) : par période, résultat net et cumul
  const revRows = scope.flatMap(b => bienRev(b, ops0).map(o => ({ o, b }))), hasRev = scope.some(b => (b.revCatIds ?? []).length);
  { let cn = 0; for (const x of bk) { const inK = revRows.filter(r => bPerKey(r.o.date, bsGran) === x.key); x.rev = sum(inK.map(r => r.o.amount)); x.revN = inK.length; x.net = x.rev - x.total; cn += x.net; x.cumNet = cn; } }
  const avg = bk.length ? depTot / bk.length : 0, top = used.length ? [...used].sort((x, y) => y.total - x.total)[0] : null;
  const last = used.at(-1), prev = used.at(-2), delta = last && prev ? last.total - prev.total : null;
  const unit = { m: 'mois', t: 'trimestre', a: 'an' }[bsGran];

  v.append(h('div', { class: 'toolbar', style: { marginBottom: '14px' } }, sel,
    h('div', { class: 'seg' }, B_GRAN.map(([k, l]) => h('button', { type: 'button', class: bsGran === k ? 'on' : '', onclick: () => { bsGran = k; try { localStorage.setItem('bsgran', k); } catch { /* stockage indisponible */ } render(); } }, l))),
    h('span', { class: 'muted' }, `Période : ${periodLabel} (filtres en haut de page)`),
    h('span', { style: { marginLeft: 'auto' } }, h('button', { class: 'btn pdf', onclick: () => biensStatsPdf(scope, per, bk, periodLabel) }, '📄 Statistiques PDF'))));
  const revOps = revRows.map(r => r.o), revTot = bienRevTotal(revOps);
  if (hasRev) v.append(h('div', { class: 'grid g4', style: { marginBottom: '14px' } },
    kpi('k2', 'Revenus locatifs', eur0(revTot), `${revOps.length} opération(s) · ${periodLabel}`, '💶'),
    kpi('k1', 'Dépenses rattachées', eur0(depTot), `${rows.length} opération(s)`, '🔗'),
    kpi(revTot - depTot >= 0 ? 'k2' : 'k1', 'Résultat net', (revTot - depTot >= 0 ? '+' : '−') + eur0(Math.abs(revTot - depTot)), 'revenus − dépenses de la période', '⚖️'),
    kpi('k4', 'Taux de couverture', depTot > 0 ? pc1b(revTot / depTot * 100) : '—', 'revenus / dépenses', '🛡️')));
  v.append(h('div', { class: 'grid g4' },
    kpi('k1', 'Dépenses rattachées', eur0(depTot), `${rows.length} opération(s) · ${periodLabel}`, '🔗'),
    kpi('k3', 'Moyenne par ' + unit, eur0(avg), `${used.length} période(s) avec dépenses sur ${bk.length}`, '📈'),
    kpi('k4', 'Période la plus chargée', top ? eur0(top.total) : '—', top ? top.label : 'aucune dépense', '🔝'),
    kpi(delta != null && delta > 0 ? 'k1' : 'k2', 'Dernière période', last ? eur0(last.total) : '—', delta != null ? `${delta >= 0 ? '+' : '−'}${eur0(Math.abs(delta))} vs ${prev.label}` : (last ? last.label : '—'), '🕒')));

  // -- dépenses par période (empilées par bien) + cumul
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Dépenses par période et cumul', h('small', {}, `${bk.length} période(s) · ${{ m: 'mensuel', t: 'trimestriel', a: 'annuel' }[bsGran]}`)),
    rows.length || revRows.length ? h('div', { class: 'chart-box tall' }, h('canvas', { id: 'bsPer' })) : h('div', { class: 'empty' }, 'Aucune dépense rattachée dans la période : choisissez des catégories ou des mots-clés sur la fiche du bien.')));
  if (rows.length || revRows.length) chart($('#bsPer'), { type: 'bar',
    data: { labels: bk.map(x => x.label), datasets: [
      ...per.map(p => ({ label: p.b.nom, backgroundColor: p.b.couleur || '#6366f1', borderRadius: 4, stack: 's', yAxisID: 'y', data: bk.map(x => Math.round(-sum(x.rows.filter(r => r.b === p.b).map(r => r.o.amount)))) })),
      ...(hasRev ? [{ label: 'Revenus locatifs', backgroundColor: '#10b981', borderRadius: 4, stack: 'r', yAxisID: 'y', data: bk.map(x => Math.round(x.rev)) }] : []),
      { type: 'line', label: 'Cumul des dépenses', borderColor: '#0f172a', backgroundColor: '#0f172a', borderWidth: 3, pointRadius: 3, tension: .25, yAxisID: 'y1', data: bk.map(x => Math.round(x.cumul)) },
      ...(hasRev ? [{ type: 'line', label: 'Résultat net cumulé', borderColor: '#059669', backgroundColor: '#059669', borderWidth: 3, borderDash: [6, 4], pointRadius: 3, tension: .25, yAxisID: 'y1', data: bk.map(x => Math.round(x.cumNet)) }] : [])] },
    options: { scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 45 } }, y: { stacked: true, ticks: { callback: eurTick } }, y1: { position: 'right', grid: { display: false }, ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
  if (used.length || (hasRev && bk.some(x => x.revN))) v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Totaux par période'),
    h('div', { class: 'tablewrap', style: { maxHeight: '360px' } }, h('table', {}, bTh('Période', ['Opérations', 'r'], ['Dépenses', 'r'], ['Variation', 'r'], ['Cumul', 'r'], ...(hasRev ? [['Revenus', 'r'], ['Résultat net', 'r'], ['Net cumulé', 'r']] : [])),
      h('tbody', {}, bk.map((x, i) => {
        const d = i > 0 && bk[i - 1].n ? x.total - bk[i - 1].total : null;
        return x.n || (hasRev && x.revN) ? h('tr', {}, h('td', { class: 'nw' }, x.label), h('td', { class: 'r num' }, String(x.n)), h('td', { class: 'r num', style: { fontWeight: 700 } }, eur0(x.total)),
          h('td', { class: 'r num ' + (d == null ? 'muted' : d > 0 ? 'neg' : 'pos') }, d == null ? '–' : (d >= 0 ? '+' : '−') + eur0(Math.abs(d))), h('td', { class: 'r num' }, eur0(x.cumul)),
          ...(hasRev ? [h('td', { class: 'r num pos' }, x.rev ? eur0(x.rev) : '–'), h('td', { class: 'r num ' + (x.net >= 0 ? 'pos' : 'neg'), style: { fontWeight: 700 } }, (x.net >= 0 ? '+' : '−') + eur0(Math.abs(x.net))), h('td', { class: 'r num ' + (x.cumNet >= 0 ? 'pos' : 'neg') }, (x.cumNet >= 0 ? '+' : '−') + eur0(Math.abs(x.cumNet)))] : [])) : null;
      }), h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total'), h('td', { class: 'r num' }, String(rows.length)), h('td', { class: 'r num' }, eur0(depTot)), h('td'), h('td'),
        ...(hasRev ? [h('td', { class: 'r num pos' }, eur0(revTot)), h('td', { class: 'r num ' + (revTot - depTot >= 0 ? 'pos' : 'neg') }, (revTot - depTot >= 0 ? '+' : '−') + eur0(Math.abs(revTot - depTot))), h('td')] : [])))))));

  // -- répartition par catégorie
  const byCat = new Map();
  for (const r of rows) byCat.set(r.o.categoryId, (byCat.get(r.o.categoryId) ?? 0) - r.o.amount);
  const bkRows = [...byCat].sort((x, y) => y[1] - x[1]);
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Dépenses par catégorie', h('small', {}, periodLabel + ' · cliquer pour détailler')),
    bkRows.length ? h('div', { class: 'grid', style: { gridTemplateColumns: '210px 1fr', alignItems: 'center' } },
      h('div', { class: 'chart-box short' }, h('canvas', { id: 'bsBk' })),
      h('div', { class: 'legend' }, bkRows.slice(0, 14).map(([id, val]) => { const c = C.get(id) ?? { name: 'Autre', color: '#94a3b8', icon: '🧾' }; return h('div', { class: 'lrow', onclick: () => gotoOps({ cat: id }) }, bubble(c),
        h('div', {}, h('div', { class: 'name' }, c.name), h('div', { class: 'bar' }, h('i', { style: { width: (val / depTot * 100) + '%', background: c.color } }))),
        h('div', { class: 'amt' }, eur0(val), h('small', {}, pc1b(val / depTot * 100)))); })))
      : h('div', { class: 'empty', style: { padding: '18px' } }, 'Aucune dépense rattachée dans la période.')));
  if (bkRows.length) vDonut($('#bsBk'), bkRows.map(([id]) => C.get(id)?.name ?? 'Autre'), bkRows.map(([, x]) => Math.round(x)), bkRows.map(([id]) => C.get(id)?.color ?? '#94a3b8'), [eur0(depTot), periodLabel], { cutout: '62%', legend: false, fmt: eur0 });

  // -- synthèse par bien
  const nm = Math.max(1, monthsIn([r0, r1]).length);
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Synthèse par bien', h('small', {}, 'dépenses rattachées, valeur et rendement')),
    per.length > 1 ? h('div', { class: 'chart-box' }, h('canvas', { id: 'bsBiens' })) : null,
    h('div', { class: 'tablewrap' }, h('table', {},
      bTh('Bien', ['Opérations', 'r'], ['Dépenses (période)', 'r'], ['Moyenne / mois', 'r'], ...(hasRev ? [['Revenus', 'r'], ['Résultat net', 'r']] : []), ['Documents', 'r'], ['Valeur estimée', 'r'], ['Rendement brut', 'r']),
      h('tbody', {}, per.map(p => h('tr', {},
        h('td', {}, h('a', { class: 'doclink', href: '#/bien', onclick: () => { S.bi = p.b.id; localStorage.setItem('bienId', S.bi); } }, `${p.b.icone || '🏠'} ${p.b.nom}`), p.b.ville ? h('div', { class: 'sub' }, p.b.ville) : null),
        h('td', { class: 'r num' }, String(p.dep.length)), h('td', { class: 'r num ' + (p.tot > 0 ? 'neg' : 'muted') }, p.tot ? eur0(p.tot) : '—'), h('td', { class: 'r num' }, p.tot ? eur0(p.tot / nm) : '—'),
        ...(hasRev ? (() => { const rv = bienRevTotal(bienRev(p.b, ops0)), nt = rv - p.tot; return [h('td', { class: 'r num pos' }, rv ? eur0(rv) : '—'), h('td', { class: 'r num ' + (nt >= 0 ? 'pos' : 'neg') }, rv || p.tot ? (nt >= 0 ? '+' : '−') + eur0(Math.abs(nt)) : '—')]; })() : []),
        h('td', { class: 'r num' }, String((p.b.docs ?? []).length)), h('td', { class: 'r num' }, eur0(bienValeur(p.b))), h('td', { class: 'r num' }, bienRendement(p.b) ? pc1b(bienRendement(p.b)) : '—'))),
      h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total'), h('td', { class: 'r num' }, String(rows.length)), h('td', { class: 'r num' }, eur0(depTot)), h('td', { class: 'r num' }, eur0(depTot / nm)),
        ...(hasRev ? [h('td', { class: 'r num pos' }, eur0(revTot)), h('td', { class: 'r num ' + (revTot - depTot >= 0 ? 'pos' : 'neg') }, (revTot - depTot >= 0 ? '+' : '−') + eur0(Math.abs(revTot - depTot)))] : []),
        h('td', { class: 'r num' }, String(sum(per.map(p => (p.b.docs ?? []).length)))), h('td', { class: 'r num' }, eur0(sum(per.map(p => bienValeur(p.b))))), h('td')))))));
  if (per.length > 1) chart($('#bsBiens'), {
    type: 'bar', data: { labels: per.map(p => p.b.nom), datasets: [{ label: 'Dépenses rattachées (' + periodLabel + ')', data: per.map(p => Math.round(p.tot)), backgroundColor: per.map(p => p.b.couleur || '#6366f1'), borderRadius: 5 },
      ...(hasRev ? [{ label: 'Revenus locatifs', data: per.map(p => Math.round(bienRevTotal(bienRev(p.b, ops0)))), backgroundColor: '#10b981', borderRadius: 5 }] : [])] },
    options: { scales: { y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { display: hasRev, position: 'bottom' } } } });

  // -- détail des dépenses : lignes sélectionnables (exclure, supprimer, ne compter que la sélection) et catégorie du bien modifiable
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Détail des dépenses', h('small', {}, `${rows.length} opération(s) comptée(s)${allRows.length > rows.length ? ' · ' + (allRows.length - rows.length) + ' exclue(s)' : ''}`)),
    bienOpsTable(allRows, { empty: 'Aucune dépense.', showBien: true, max: 300 })));
}

/** PDF des statistiques multi-biens. */
function biensStatsPdf(scope, per, bk, periodLabel) {
  const depTot = sum(per.map(p => p.tot)), C = cats(), rows = per.flatMap(p => p.dep.map(o => ({ o, b: p.b }))), used = bk.filter(x => x.n);
  const byCat = new Map();
  for (const r of rows) byCat.set(r.o.categoryId, (byCat.get(r.o.categoryId) ?? 0) - r.o.amount);
  const revT = sum(bk.map(x => x.rev ?? 0)), hasRevP = scope.some(b => (b.revCatIds ?? []).length);
  const blocks = [{ t: 'kpis', items: [
    { label: 'Dépenses rattachées', value: eur0(depTot), sub: periodLabel, color: '#ec4899' },
    { label: 'Opérations', value: String(rows.length), sub: `${scope.length} bien(s)`, color: '#6366f1' },
    { label: 'Moyenne par période', value: eur0(bk.length ? depTot / bk.length : 0), sub: `${bk.length} période(s)`, color: '#10b981' },
    ...(hasRevP ? [{ label: 'Revenus locatifs', value: eur0(revT), sub: periodLabel, color: '#059669' }, { label: 'Résultat net', value: (revT - depTot >= 0 ? '+' : '−') + eur0(Math.abs(revT - depTot)), sub: 'revenus − dépenses', color: revT - depTot >= 0 ? '#059669' : '#dc2626' }] : [])] }];
  if (hasRevP && bk.length) blocks.push({ t: 'h2', text: 'Revenus et dépenses par période' },
    { t: 'vbars', labels: bk.map(x => x.label), stacked: false, height: 150, series: [{ name: 'Dépenses', color: '#ef4444', data: bk.map(x => Math.round(x.total)) }, { name: 'Revenus', color: '#10b981', data: bk.map(x => Math.round(x.rev ?? 0)) }] },
    { t: 'table', columns: [{ title: 'Période', w: 1.6 }, { title: 'Dépenses', w: 1.3, align: 'right' }, { title: 'Revenus', w: 1.3, align: 'right' }, { title: 'Résultat net', w: 1.3, align: 'right' }, { title: 'Net cumulé', w: 1.3, align: 'right' }],
      rows: [...bk.filter(x => x.n || x.revN).map(x => ({ flag: x.net < 0 ? 'warn' : undefined, cells: [x.label, eur0(x.total), eur0(x.rev), (x.net >= 0 ? '+' : '−') + eur0(Math.abs(x.net)), (x.cumNet >= 0 ? '+' : '−') + eur0(Math.abs(x.cumNet))] })), { bold: true, cells: ['Total', eur0(depTot), eur0(revT), (revT - depTot >= 0 ? '+' : '−') + eur0(Math.abs(revT - depTot)), ''] }] });
  if (used.length) blocks.push({ t: 'h2', text: 'Dépenses par période' },
    { t: 'vbars', labels: bk.map(x => x.label), stacked: true, height: 150, series: per.map(p => ({ name: p.b.nom, color: p.b.couleur || '#6366f1', data: bk.map(x => Math.round(-sum(x.rows.filter(r => r.b === p.b).map(r => r.o.amount)))) })) },
    { t: 'table', columns: [{ title: 'Période', w: 2 }, { title: 'Opérations', w: 1.2, align: 'right' }, { title: 'Total', w: 1.4, align: 'right' }, { title: 'Cumul', w: 1.4, align: 'right' }],
      rows: [...used.map(x => ({ cells: [x.label, String(x.n), eur0(x.total), eur0(x.cumul)] })), { bold: true, cells: ['Total', String(rows.length), eur0(depTot), ''] }] });
  blocks.push({ t: 'h2', text: 'Synthèse par bien' },
    { t: 'table', columns: [{ title: 'Bien', w: 2.6 }, { title: 'Opérations', w: 1.1, align: 'right' }, { title: 'Dépenses', w: 1.3, align: 'right' }, { title: 'Valeur', w: 1.3, align: 'right' }, { title: 'Rdt brut', w: 1, align: 'right' }], rows: [
      ...per.map(p => ({ cells: [`${p.b.icone || ''} ${p.b.nom}${p.b.ville ? ' · ' + p.b.ville : ''}`, String(p.dep.length), p.tot ? eur0(p.tot) : '—', eur0(bienValeur(p.b)), bienRendement(p.b) ? pc1b(bienRendement(p.b)) : '—'] })),
      { bold: true, cells: ['Total', String(rows.length), eur0(depTot), eur0(sum(per.map(p => bienValeur(p.b)))), ''] }] });
  if (byCat.size) blocks.push({ t: 'h2', text: 'Dépenses par catégorie' },
    { t: 'hbars', items: [...byCat].sort((x, y) => y[1] - x[1]).slice(0, 14).map(([id, val]) => ({ label: C.get(id)?.name ?? 'Autre', value: val, text: eur0(val), color: C.get(id)?.color ?? '#94a3b8' })) });
  return generateReport({ title: 'Statistiques des biens immobiliers', file: 'stats-biens', subtitle: `${scope.length > 1 ? scope.length + ' biens' : scope[0].nom} · ${periodLabel}`, blocks });
}

// ====================================================== Estimation de valeur (DVF)
/** Fusionne les ajustements modifiés par l'utilisateur, puis recalcule la fourchette. */
function besApply(b, res) {
  if (!res || res.error) return res;
  const ov = (S.besAdj ??= {})[b.id] ?? {};
  let f = 1;
  for (const a of res.adj ?? []) { const o = ov[a.key]; if (o) { if (o.pct != null) a.pct = +o.pct; if (o.on != null) a.on = !!o.on; } if (a.on) f *= 1 + (+a.pct || 0) / 100; }
  res.factor = Math.round(f * 1000) / 1000;
  if (res.ppsm) {
    res.mini = Math.round(res.ppsm.p25 * res.surface * f); res.centre = Math.round(res.ppsm.p50 * res.surface * f); res.maxi = Math.round(res.ppsm.p75 * res.surface * f);
    res.ppsmMini = Math.round(res.ppsm.p25 * f * 10) / 10; res.ppsmCentre = Math.round(res.ppsm.p50 * f * 10) / 10; res.ppsmMaxi = Math.round(res.ppsm.p75 * f * 10) / 10;
  } else if (bes?.manualPpsm) {
    res.mini = Math.round(bes.manualPpsm * .9 * res.surface * f); res.centre = Math.round(bes.manualPpsm * res.surface * f); res.maxi = Math.round(bes.manualPpsm * 1.1 * res.surface * f);
    res.ppsmMini = Math.round(bes.manualPpsm * .9 * f * 10) / 10; res.ppsmCentre = Math.round(bes.manualPpsm * f * 10) / 10; res.ppsmMaxi = Math.round(bes.manualPpsm * 1.1 * f * 10) / 10;
  }
  return res;
}

const R_ok = g => g.rows.some(x => !x.res.error);

async function pageBiensEstimation(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const [,, dis, hist] = await Promise.all([biensLoad(), Promise.resolve(), fetch('/api/ai/settings').then(r => r.json()).catch(() => null), fetch('/api/ai/history').then(r => r.json()).catch(() => ({ list: [] }))]);
  if (S.page !== 'biens-estimation') return; v.innerHTML = '';
  if (!biensAll().length) { v.append(biensEmpty('L’estimation a besoin d’un bien : créez-en un premier.', 'biens')); return; }
  const b = bienOf(S.bi) ?? biensAll()[0]; S.bi = b.id;
  if (!bes || bes.bienId !== b.id) bes = { bienId: b.id, rayon: 0, mois: 36, pieces: true, trim: true, muts: null, loading: false, err: null, manualPpsm: null, useManual: false, saved: false, zone: 'quartier' };
  if (bes.commune !== b.commune) { bes.commune = b.commune; if (bes.muts && !bes.manualPpsm) bes.muts = null; }

  const opts = { rayon: bes.rayon, pieces: bes.pieces, trim: bes.trim, depuis: bes.useManual || !bes.muts ? '' : addM(todayIso(), -bes.mois) };
  const usingDVF = !!bes.muts && !bes.useManual;
  let res = null, geo = null;
  if (usingDVF) {
    // éloignement : au moins ±20 % de surface pour garder assez de ventes dans les petits rayons
    geo = estByRadius(b, bes.muts.mutations, { ...opts, rayon: bes.rayon });
    if (geo) geo.rows.forEach(x => besApply(b, x.res));
    if (geo && bes.zone === 'quartier' && geo.retained) { res = geo.retained.res; res.zoneLabel = geo.retained.r === Infinity ? 'commune entière' : 'quartier ≤ ' + geo.retained.label; }
    else { res = besApply(b, estCompute(b, bes.muts.mutations, opts)); res.zoneLabel = 'commune entière'; }
  }
  else if (bes.manualPpsm) res = besApply(b, estFromPpsm(b, bes.manualPpsm));

  // -- bandeau
  v.append(h('div', { class: 'toolbar', style: { marginBottom: '14px' } },
    h('select', { style: { maxWidth: '300px', fontWeight: 600 }, onchange: e => { S.bi = e.target.value; localStorage.setItem('bienId', S.bi); bes = null; besAI = null; render(); } },
      biensAll().map(x => h('option', { value: x.id, selected: x.id === b.id }, `${x.icone || '🏠'} ${x.nom}${x.ville ? ' · ' + x.ville : ''}`))),
    h('button', { class: 'btn sec', onclick: () => { location.hash = '#/bien'; } }, '🏠 Fiche du bien'),
    h('button', { class: 'btn sec', onclick: () => bienEditModal(b) }, '✏️ Modifier'),
    h('span', { style: { marginLeft: 'auto' } }, h('a', { class: 'doclink', href: '#/biens' }, '← Tous les biens'))));

  // -- caractéristiques prises en compte
  v.append(h('div', { class: 'card', style: { marginTop: 0 } }, h('h2', {}, 'Caractéristiques du bien', h('small', {}, 'ce qui décale le €/m² médian des ventes'),
    h('div', { class: 'chips' },
      h('span', { class: 'chip toggle on', style: { background: b.couleur || '#6366f1' } }, `${B_TYPES[b.type] ?? ''}`),
      b.surface ? h('span', { class: 'chip toggle' }, `${b.surface} m²`) : null, b.pieces ? h('span', { class: 'chip toggle' }, `${b.pieces} pièce(s)`) : null,
      b.etage ? h('span', { class: 'chip toggle' }, 'Étage : ' + b.etage) : null, b.annee ? h('span', { class: 'chip toggle' }, 'Construit en ' + b.annee) : null,
      b.etat ? h('span', { class: 'chip toggle' }, B_ETATS[b.etat] ?? b.etat) : null, b.dpe ? h('span', { class: 'chip toggle' }, 'DPE ' + b.dpe) : null,
      b.exterieur ? h('span', { class: 'chip toggle' }, 'Extérieur') : null, b.garage ? h('span', { class: 'chip toggle' }, 'Garage') : null,
      b.ascenseur ? h('span', { class: 'chip toggle' }, 'Ascenseur') : null, b.terrain ? h('span', { class: 'chip toggle' }, `Terrain ${b.terrain} m²`) : null,
      b.commune ? h('span', { class: 'chip toggle on' }, `📍 ${b.ville} (${b.commune})`) : h('span', { class: 'chip toggle', style: { color: '#dc2626', borderColor: '#dc2626' } }, 'Commune à renseigner')))));

  // -- recherche des ventes réelles
  const seg = (arr, cur, cb) => { const w = h('div', { class: 'seg' }); for (const [val, lab] of arr) w.append(h('button', { type: 'button', class: (Array.isArray(cur) ? cur[0] : cur) === val ? 'on' : '', onclick: () => cb(val) }, lab)); return w; };
  const searchBtn = h('button', { class: 'btn', disabled: !b.commune || bes.loading, onclick: async () => {
    bes.loading = true; bes.err = null; render();
    try {
      const r = await fetch(`/api/biens/dvf?commune=${encodeURIComponent(b.commune)}&years=${Math.max(1, Math.ceil(bes.mois / 12))}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Service des ventes injoignable');
      bes.muts = j; bes.useManual = false; bes.saved = false; bes.err = null;
      toast(`📊 ${j.mutations.length} ventes publiées téléchargées${j.stale ? ' (copie locale ancienne)' : ''}`);
    } catch (e) { bes.err = String(e.message || e); bes.muts = null; }
    bes.loading = false; render();
  } }, bes.loading ? '⏳ Recherche des ventes…' : (usingDVF ? '🔄 Relancer la recherche' : '🔍 Rechercher les ventes de la commune'));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Recherche des ventes réelles (DVF)', h('small', {}, 'données officielles data.gouv.fr · mises en cache 30 j')),
    !b.commune ? h('div', { class: 'tip warn' }, 'La commune (code INSEE) est indispensable pour interroger les ventes. ', h('button', { class: 'btn sm sec', onclick: () => bienEditModal(b) }, '✏️ Renseigner la fiche')) : null,
    h('div', { class: 'toolbar', style: { marginBottom: 0 } },
      h('div', { class: 'field' }, h('label', {}, 'Rayon de surface autour de ' + (b.surface || '–') + ' m²'), seg(BES_RAYONS, bes.rayon, val => { bes.rayon = val; bes.saved = false; render(); })),
      h('div', { class: 'field' }, h('label', {}, 'Période des ventes'), seg(BES_PERIODES, bes.mois, val => { bes.mois = val; bes.saved = false; render(); })),
      h('div', { class: 'field' }, h('label', {}, 'Filtres'), h('div', { style: { display: 'flex', gap: '12px', paddingTop: '6px', flexWrap: 'wrap' } },
        h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: bes.pieces, onchange: e => { bes.pieces = e.target.checked; bes.saved = false; render(); } }), 'Même nombre de pièces (±1)'),
        h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: bes.trim, onchange: e => { bes.trim = e.target.checked; bes.saved = false; render(); } }), 'Exclure les valeurs aberrantes'))),
      h('div', { class: 'field' }, h('label', {}, ' '), searchBtn)),
    bes.err ? h('div', { class: 'tip warn' }, '⚠️ ', bes.err, ' — utilisez le repli manuel ci-dessous ou réessayez plus tard.') : null,
    bes.muts ? h('div', { class: 'muted', style: { fontSize: '12.5px' } },
      `📊 ${bes.muts.mutations.length} ventes bâties publiées sur ${[...new Set(bes.muts.mutations.map(m => m.annee))].sort().join(', ')}${bes.muts.lastDate ? ' (dernière vente publiée : ' + fdate(bes.muts.lastDate) + ')' : ''} · récupérées le ${fdate(bes.muts.fetchedAt.slice(0, 10))}${bes.muts.stale ? ' · ⚠️ copie locale (service indisponible)' : bes.muts.cached ? ' · copie locale (cache 30 j)' : ''}`) : null,
    bes.muts && bes.muts.years?.[0] === new Date().getFullYear() && !bes.muts.mutations.some(m => m.annee === new Date().getFullYear())
      ? h('div', { class: 'tip', style: { marginTop: '8px' } }, 'ℹ️ Aucune vente de ' + new Date().getFullYear() + ' n’est encore publiée : les données officielles (DVF, data.gouv.fr) sont diffusées deux fois par an avec plusieurs mois de décalage. Elles seront intégrées automatiquement dès leur publication (nouvelle tentative tous les 3 jours).') : null,
    // repli manuel
    h('div', { class: 'tip', style: { marginTop: '10px' } }, '🧪 Repli hors ligne : saisissez un ',
      h('b', {}, 'prix au m² constaté'), ' (annonce, voisin, expertise) : ',
      h('input', { type: 'number', step: '10', value: bes.manualPpsm ?? '', placeholder: 'ex : 3200', style: { width: '110px', margin: '0 8px' }, onchange: e => { bes.manualPpsm = e.target.value === '' ? null : +e.target.value; } }),
      h('button', { class: 'btn sm', onclick: () => { if (!bes.manualPpsm) { toast('⚠️ Indiquez un prix au m²'); return; } bes.useManual = true; bes.saved = false; render(); } }, 'Calculer avec ce prix'),
      bes.useManual && bes.muts ? h('button', { class: 'btn sm sec', style: { marginLeft: '8px' }, onclick: () => { bes.useManual = false; render(); } }, 'Revenir aux ventes DVF') : null)));

  // -- localisation et estimation selon l'éloignement
  if (usingDVF) {
    const addr = [b.adresse, b.codePostal, b.ville].filter(Boolean).join(', ');
    const locate = async () => {
      if (!b.adresse && !b.ville) { toast('⚠️ Renseignez l’adresse dans la fiche du bien'); return; }
      try {
        const j = await (await fetch('/api/biens/geocode?q=' + encodeURIComponent([b.adresse, b.ville].filter(Boolean).join(' ')) + '&cp=' + encodeURIComponent(b.codePostal || '') + '&citycode=' + encodeURIComponent(b.commune || ''))).json();
        if (j.error) throw new Error(j.error);
        b.lat = j.lat; b.lon = j.lon; await bienPut(b); toast('📍 Adresse localisée : ' + j.label + (j.score < .6 ? ' (précision faible)' : '')); bes.saved = false; render();
      } catch (er) { toast('⚠️ ' + er.message); }
    };
    const zseg = h('div', { class: 'seg' }, [['quartier', '🏘️ Quartier affiné'], ['commune', '🏙️ Commune entière']].map(([k, l]) => h('button', { type: 'button', class: bes.zone === k ? 'on' : '', onclick: () => { bes.zone = k; bes.saved = false; render(); } }, l)));
    const gcard = h('div', { class: 'card ccard', style: { '--ac': '#0ea5e9', marginTop: '18px' } }, h('h2', {}, '📍 Estimation selon l’éloignement', h('small', {}, 'ventes géolocalisées autour du bien')));
    if (!geo) {
      gcard.append(h('div', { class: 'tip', style: { marginBottom: '8px' } }, 'Pour affiner au quartier, le bien doit être localisé : ', addr ? h('b', {}, addr) : 'renseignez son adresse dans la fiche', '.'),
        h('div', { class: 'toolbar', style: { margin: 0 } }, h('button', { class: 'btn', onclick: locate }, '📍 Localiser l’adresse'), h('button', { class: 'btn sec', onclick: () => bienEditModal(b) }, '✏️ Compléter l’adresse')));
    } else {
      const R = geo.rows, ret = geo.retained;
      gcard.append(h('div', { class: 'toolbar', style: { margin: '0 0 8px' } }, zseg, h('span', { class: 'muted' }, `📍 ${(+b.lat).toFixed(4)}, ${(+b.lon).toFixed(4)} · ${geo.located} ventes localisées`),
        h('button', { class: 'btn sm sec', onclick: locate }, '🔄 Relocaliser'), h('button', { class: 'btn sm sec', onclick: async () => { b.lat = null; b.lon = null; await bienPut(b); bes.saved = false; render(); } }, '✕')),
        h('p', { class: 'muted', style: { margin: '0 0 8px', fontSize: '12.5px' } }, `Surface comparable : ${bes.rayon ? '±' + Math.round(bes.rayon * 100) + ' %' : 'identique (à 1 m² près)'} (réglage « Rayon de surface » ci-dessus). Le quartier retenu est le plus petit rayon réunissant au moins 8 ventes comparables${ret ? ' : ' + (ret.r === Infinity ? 'ici la commune entière' : ret.label) : ' (aucun rayon ne suffit : élargissez la période ou la surface)'}.`),
        h('div', { class: 'tablewrap' }, h('table', {}, bTh('Rayon', ['Ventes', 'r'], ['Comparables', 'r'], ['€/m² médian', 'r'], ['Mini (25e)', 'r'], ['Centrale', 'r'], ['Maxi (75e)', 'r'], ''),
          h('tbody', {}, R.map(x => { const q = x.res; return h('tr', { class: ret === x ? 'rowpaid' : '' }, h('td', { class: 'nw' }, h('b', {}, x.label)), h('td', { class: 'r num' }, String(x.nSales)), h('td', { class: 'r num' }, q.error ? '0' : String(q.n)),
            h('td', { class: 'r num' }, q.error ? '—' : eur0(q.ppsmCentre)), h('td', { class: 'r num' }, q.error ? '—' : eur0(q.mini)), h('td', { class: 'r num', style: { fontWeight: 700 } }, q.error ? '—' : eur0(q.centre)), h('td', { class: 'r num' }, q.error ? '—' : eur0(q.maxi)),
            h('td', {}, ret === x ? h('span', { class: 'badge manual' }, 'retenu') : q.faible && !q.error ? h('span', { class: 'badge' }, 'échantillon faible') : null)); })))),
        R.some(x => !x.res.error) ? h('div', { class: 'chart-box short', style: { marginTop: '10px' } }, h('canvas', { id: 'beGeo' })) : null);
    }
    v.append(gcard);
    if (geo && R_ok(geo)) chart($('#beGeo'), { type: 'bar', data: { labels: geo.rows.filter(x => !x.res.error).map(x => x.label), datasets: [
        { label: 'Fourchette mini → maxi', data: geo.rows.filter(x => !x.res.error).map(x => [x.res.mini, x.res.maxi]), backgroundColor: geo.rows.filter(x => !x.res.error).map(x => x === geo.retained ? '#10b981' : '#a5b4fc'), borderRadius: 6 },
        { type: 'line', label: 'Estimation centrale', data: geo.rows.filter(x => !x.res.error).map(x => x.res.centre), borderColor: '#0f172a', backgroundColor: '#0f172a', borderWidth: 2, pointRadius: 5, showLine: false }] },
      options: { scales: { y: { ticks: { callback: eurTick } } }, plugins: { tooltip: { callbacks: { label: c => ' ' + c.dataset.label + ' : ' + (Array.isArray(c.raw) ? eur0(c.raw[0]) + ' → ' + eur0(c.raw[1]) : eur0(c.raw)) } }, legend: { position: 'bottom' } } } });
  }

  // -- résultat
  if (!res) {
    v.append(h('div', { class: 'card empty', style: { marginTop: '18px' } }, h('div', { style: { fontSize: '32px' } }, '🧮'),
      h('h2', {}, 'Aucune estimation pour l’instant'),
      h('p', { class: 'muted', style: { maxWidth: '640px', margin: '0 auto' } }, 'Lancez la recherche des ventes réelles de la commune : l’application calcule les comparables (même type, surface proche), en extrait les centiles de prix au m², ajuste des caractéristiques du bien (état, DPE, étage, extérieur…) et produit une fourchette mini / centrale / maxi.')));
  } else if (res.error) {
    v.append(h('div', { class: 'tip warn', style: { marginTop: '18px' } }, '⚠️ ', res.error, ' ',
      h('button', { class: 'btn sm sec', onclick: () => bienEditModal(b) }, '✏️ Compléter la fiche')));
  } else {
    v.append(h('div', { class: 'grid g4', style: { marginTop: '18px' } },
      kpi('k3', 'Estimation centrale', eur0(res.centre), `${eur0(res.ppsmCentre)} / m² · ajusté ×${res.factor}`, '🎯'),
      kpi('k1', 'Mini (25e centile)', eur0(res.mini), `${eur0(res.ppsmMini)} / m²`, '⬇️'),
      kpi('k2', 'Maxi (75e centile)', eur0(res.maxi), `${eur0(res.ppsmMaxi)} / m²`, '⬆️'),
      kpi('k4', 'Échantillon', res.n ? res.n + ' ventes' : 'manuel', res.faible ? 'échantillon faible : élargissez' : (usingDVF ? 'comparables retenus' : 'sans donnée DVF'), '📊')));

    // graphiques : fourchette + nuage de comparables
    const g = h('div', { class: 'grid g2', style: { marginTop: '18px' } });
    v.append(g); // dans le DOM avant la création des graphiques
    g.append(h('div', { class: 'card' }, h('h2', {}, 'Fourchette estimée', h('small', {}, `${b.surface} m² × ${eur0(res.ppsmCentre)}/m² × ${res.factor}`)),
      h('div', { class: 'chart-box short' }, h('canvas', { id: 'beRange' }))));
    chart($('#beRange'), { type: 'bar', data: { labels: ['Mini (25e)', 'Centrale', 'Maxi (75e)'], datasets: [{ data: [res.mini, res.centre, res.maxi], backgroundColor: ['#ef4444', b.couleur || '#6366f1', '#10b981'], borderRadius: 8 }] },
      options: { indexAxis: 'y', scales: { x: { ticks: { callback: eurTick } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: tipEur } } });
    if (res.comps?.length) {
      g.append(h('div', { class: 'card' }, h('h2', {}, 'Comparables retrouvés', h('small', {}, `${res.comps.length} + ${Math.max(0, res.n - res.comps.length)} autres · prix au m² selon la surface`),
        h('div', { class: 'chart-box' }, h('canvas', { id: 'beScatter' })))));
      chart($('#beScatter'), {
        type: 'scatter', data: { datasets: [
          { label: 'Ventes comparables', data: res.comps.map(c => ({ x: c.surface, y: c.ppsm, c })), backgroundColor: tint(b.couleur || '#6366f1', .45), borderColor: b.couleur || '#6366f1', pointRadius: 5 },
          { label: 'Votre bien (' + res.ppsmCentre + ' €/m²)', data: [{ x: res.surface, y: res.ppsmCentre }], backgroundColor: '#ef4444', borderColor: '#fff', borderWidth: 2, pointRadius: 9 }] },
        options: { scales: { x: { title: { display: true, text: 'Surface (m²)' } }, y: { title: { display: true, text: 'Prix au m²' }, ticks: { callback: eurTick } } },
          plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => { const p = c.raw; return p.c ? ` ${p.c.date ? fdate(p.c.date) : ''} · ${p.c.surface} m² · ${eur0(p.c.ppsm)}/m²${p.c.adresse ? ' · ' + p.c.adresse : ''}` : ` ${eur0(p.y)} / m²`; } } } } } });
    }

    // -- ajustements éditables
    const ov = (S.besAdj ??= {})[b.id] ?? {};
    const rows = (res.adj ?? []).map(a => h('tr', { class: a.on ? '' : 'muted' },
      h('td', { style: { width: '34px' } }, h('input', { type: 'checkbox', checked: a.on, onchange: e => { (S.besAdj[b.id] ??= {})[a.key] = { ...(S.besAdj[b.id][a.key] ?? {}), on: e.target.checked }; bes.saved = false; render(); } })),
      h('td', {}, a.label, a.detail ? h('span', { class: 'sub' }, ' · ' + a.detail) : null),
      h('td', { class: 'r', style: { width: '120px' } }, h('input', { type: 'number', step: '1', value: a.pct, style: { width: '80px', textAlign: 'right' }, onchange: e => { (S.besAdj[b.id] ??= {})[a.key] = { ...(S.besAdj[b.id][a.key] ?? {}), pct: +e.target.value || 0 }; bes.saved = false; render(); } }), ' %'),
      h('td', { class: 'r num', style: { width: '110px' } }, a.on ? (a.pct > 0 ? '+' : '') + a.pct + ' %' : 'exclu')));
    v.append(h('div', { class: 'card', style: { marginTop: '18px' } },
      h('h2', {}, 'Ajustements des caractéristiques', h('small', {}, `facteur cumulé ×${res.factor} (${(res.factor - 1 >= 0 ? '+' : '') + Math.round((res.factor - 1) * 1000) / 10} %)`),
        h('button', { class: 'btn sm sec', onclick: () => { delete (S.besAdj ??= {})[b.id]; bes.saved = false; render(); } }, '↺ Valeurs par défaut')),
      h('p', { class: 'muted', style: { margin: '0 0 10px', fontSize: '12.5px' } }, 'Chaque coefficient décale le prix au m² médian des ventes comparables. Décochez ou modifiez un pourcentage pour affiner : la fourchette se recalcule immédiatement.'),
      rows.length ? h('div', { class: 'tablewrap' }, h('table', {}, bTh('', 'Ajustement', ['Coefficient', 'r'], ['Effet', 'r']), h('tbody', {}, rows))) : h('div', { class: 'empty', style: { padding: '14px' } }, 'Aucun ajustement applicable : complétez l’état, le DPE et l’étage dans la fiche.')));

    // -- actions
    v.append(h('div', { class: 'toolbar', style: { marginTop: '16px' } },
      h('button', { class: 'btn', disabled: bes.saved, onclick: () => {
        const e = { id: uid(), date: new Date().toISOString(), source: usingDVF ? 'DVF · ' + (res.zoneLabel ?? 'commune') + ' · ventes réelles (data.gouv.fr)' : 'Prix au m² saisi manuellement',
          mini: res.mini, centre: res.centre, maxi: res.maxi, ppsmMini: res.ppsmMini, ppsmCentre: res.ppsmCentre, ppsmMaxi: res.ppsmMaxi,
          n: res.n, surface: res.surface, factor: res.factor, adj: (res.adj ?? []).map(a => ({ key: a.key, label: a.label, pct: a.pct, on: a.on, detail: a.detail })) };
        b.estimations ??= []; b.estimations.unshift(e); b.estimations.splice(60);
        bienPut(b).then(() => { bes.saved = true; toast('💾 Estimation enregistrée dans la fiche du bien'); render(); });
      } }, bes.saved ? '✅ Estimation enregistrée' : '💾 Enregistrer cette estimation'),
      h('button', { class: 'btn pdf', onclick: () => bienEstimPdf(b, res, bes) }, '📄 PDF de l’estimation'),
      h('span', { class: 'muted' }, 'Enregistrée, l’estimation devient la valeur affichée du bien (liste et rapports).')));

    // -- comparables
    if (res.comps?.length) v.append(h('div', { class: 'card', style: { marginTop: '18px' } },
      h('h2', {}, 'Ventes comparables retenues', h('small', {}, `classées par proximité de surface · ${res.comps.length} premières sur ${res.n}`),
        h('button', { class: 'btn sm sec', onclick: () => {
          const list = [...res.comps].sort((x, y) => y.ppsm - x.ppsm);
          modal('Toutes les ventes comparables (' + list.length + ')', [h('div', { class: 'tablewrap', style: { maxHeight: '58vh' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Adresse'), h('th', { class: 'r' }, 'Surface'), h('th', { class: 'r' }, 'Pièces'), h('th', { class: 'r' }, 'Prix'), h('th', { class: 'r' }, '€/m²'))),
            h('tbody', {}, list.map(c => h('tr', {}, h('td', { class: 'nw' }, fdate(c.date)), h('td', {}, [c.adresse, c.cp, c.commune].filter(Boolean).join(' · ') || '—'),
              h('td', { class: 'r num' }, c.surface + ' m²'), h('td', { class: 'r num' }, c.pieces || '—'), h('td', { class: 'r num' }, eur0(c.valeur)), h('td', { class: 'r num' }, eur0(c.ppsm)))))))],
            close => [h('button', { class: 'btn', onclick: close }, 'Fermer')], true);
        } }, '📋 Tout afficher'))),
      h('div', { class: 'tablewrap' }, h('table', {}, bTh('Date', 'Adresse', ['Surface', 'r'], ['Pièces', 'r'], ['Prix', 'r'], ['€/m²', 'r']),
        h('tbody', {}, res.comps.slice(0, 15).map(c => h('tr', {},
          h('td', { class: 'nw muted' }, fdate(c.date)),
          h('td', {}, [c.adresse, c.cp, c.commune].filter(Boolean).join(' · ') || '—'),
          h('td', { class: 'r num' }, c.surface + ' m²'), h('td', { class: 'r num' }, c.pieces || '—'),
          h('td', { class: 'r num' }, eur0(c.valeur)), h('td', { class: 'r num', style: { fontWeight: 700 } }, eur0(c.ppsm))))))));

    // -- historique des estimations
    const histE = b.estimations ?? [];
    if (histE.length) v.append(h('div', { class: 'card', style: { marginTop: '18px' } },
      h('h2', {}, 'Historique des estimations', h('small', {}, `${histE.length} estimation(s) · la plus récente devient la valeur du bien`),
        histE.length > 1 ? h('button', { class: 'btn sm sec', onclick: () => { b.estimations = histE.slice().reverse(); bienPut(b).then(() => { toast('Historique inversé'); render(); }); } }, '↕️ Inverser l’ordre') : null),
      histE.length > 1 ? h('div', { class: 'chart-box' }, h('canvas', { id: 'beHist' })) : null,
      h('div', { class: 'tablewrap', style: { marginTop: '10px' } }, h('table', {}, bTh('Date', 'Source', ['Échantillon', 'r'], ['Mini', 'r'], ['Centrale', 'r'], ['Maxi', 'r'], ['€/m² médian', 'r'], ['Facteur', 'r'], ''),
        h('tbody', {}, histE.map((e, i) => h('tr', { style: i === 0 ? { fontWeight: 700, background: 'var(--card2)' } : {} },
          h('td', { class: 'nw' }, fdate(String(e.date).slice(0, 10))),
          h('td', {}, e.source || '—', i === 0 ? h('span', { class: 'badge manual', style: { marginLeft: '8px' } }, 'en cours') : null),
          h('td', { class: 'r num muted' }, e.n ? e.n + ' ventes' : 'manuel'),
          h('td', { class: 'r num' }, eur0(e.mini)), h('td', { class: 'r num' }, eur0(e.centre)), h('td', { class: 'r num' }, eur0(e.maxi)),
          h('td', { class: 'r num' }, eur0(e.ppsmCentre)), h('td', { class: 'r num muted' }, '×' + (e.factor ?? 1)),
          h('td', { class: 'r' }, h('button', { class: 'icon-btn', title: 'Supprimer cette estimation', onclick: () => { b.estimations = histE.filter((_, k) => k !== i); bienPut(b).then(render); } }, '🗑️')))))))));
    if (histE.length > 1) chart($('#beHist'), {
      type: 'line', data: { labels: histE.slice().reverse().map(e => fdate(String(e.date).slice(0, 10))), datasets: [
        { label: 'Maxi', data: histE.slice().reverse().map(e => Math.round(e.maxi)), borderColor: '#10b981', backgroundColor: '#10b981', tension: .3, pointRadius: 4 },
        { label: 'Centrale', data: histE.slice().reverse().map(e => Math.round(e.centre)), borderColor: b.couleur || '#6366f1', backgroundColor: b.couleur || '#6366f1', borderWidth: 3, tension: .3, pointRadius: 5 },
        { label: 'Mini', data: histE.slice().reverse().map(e => Math.round(e.mini)), borderColor: '#ef4444', backgroundColor: '#ef4444', tension: .3, pointRadius: 4 }] },
      options: { scales: { y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } } });
  }

  // -- analyse IA / locale
  v.append(besAiCard(b, res, dis, hist));
  if (besAI) {
    const secs = aiParse(besAI.text);
    v.append(h('div', { class: 'aihero' }, h('div', { style: { fontSize: '30px' } }, besAI.kind === 'ia' ? '🧠' : '📊'),
      h('div', { style: { flex: 1, minWidth: '220px' } }, h('h2', {}, besAI.title),
        h('div', { class: 'sub' }, `${fmtDT(besAI.date)} · ${besAI.kind === 'ia' ? 'fournisseur ' + besAI.provider + ' · modèle ' + besAI.model : 'analyse locale (sans IA)'}${besAI.meta?.bienNom ? ' · ' + besAI.meta.bienNom : ''}`)),
      h('button', { class: 'btn sm sec', onclick: () => { navigator.clipboard?.writeText(besAI.text); toast('Analyse copiée'); } }, '⧉ Copier'),
      h('button', { class: 'btn pdf', onclick: () => generateReport({ title: 'Estimation · ' + b.nom, file: 'estimation-bien', subtitle: `${besAI.kind === 'ia' ? 'Analyse IA' : 'Analyse locale'} · ${fmtDT(besAI.date)}`, blocks: mdToPdfBlocks(besAI.text) }) }, '📄 Exporter en PDF')));
    v.append(h('div', { class: 'aigrid' }, secs.map(sec => h('div', { class: 'aisec' + (sec.kind === 'synth' || sec.kind === 'vigil' || sec.items.length > 4 ? ' wide' : ''), style: { '--ac': sec.color } },
      h('h3', {}, sec.ico + ' ' + sec.title),
      sec.kind === 'vigil' && sec.items.length ? sec.items.map(it => h('div', { class: 'alrow ' + it.level }, h('span', { class: 'ai' }, it.level === 'bad' ? '⛔' : '⚠️'), h('div', {}, it.title ? h('b', {}, it.title + ' — ') : null, it.text)))
        : h('div', { class: 'md', html: mdToHtml(sec.raw.join('\n')) })))));
  }
}

/** Carte de lancement de l'analyse (IA ou locale) + historique des analyses. */
function besAiCard(b, res, dis, hist) {
  const prov = dis?.providers?.[dis.provider], isLocal = dis?.provider === 'local', isOllama = !!prov?.localModel;
  const provLabel = prov?.label ?? 'IA';
  const D = () => ({
    bien: { type: B_TYPES[b.type] ?? '', usage: B_USAGES[b.usage] ?? '', surface_m2: +b.surface || 0, terrain_m2: +b.terrain || 0, pieces: +b.pieces || null, etage: b.etage || '', annee_construction: b.annee || '', etat: B_ETATS[b.etat] ?? '', dpe: b.dpe || '', exterieur: !!b.exterieur, garage: !!b.garage, ascenseur: !!b.ascenseur, commune: [b.ville, b.codePostal].filter(Boolean).join(' ') || '', prix_achat: +b.prixAchat || null, loyer_mensuel: +b.loyerMensuel || 0 },
    estimation: res && !res.error ? {
      methode: res.n ? 'DVF (ventes réelles data.gouv.fr)' : 'prix au m² saisi manuellement', comparables: res.n,
      centiles_eur_m2: res.ppsm ? { p10: res.ppsm.p10, p25: res.ppsm.p25, mediane: res.ppsm.p50, p75: res.ppsm.p75, p90: res.ppsm.p90, moyenne: res.ppsm.avg } : null,
      ajustements: (res.adj ?? []).filter(a => a.on).map(a => `${a.label}${a.detail ? ' (' + a.detail + ')' : ''} : ${a.pct > 0 ? '+' : ''}${a.pct} %`),
      facteur_cumule: res.factor, surface_m2: res.surface,
      fourchette_eur: { mini: res.mini, centrale: res.centre, maxi: res.maxi },
    } : null,
    echantillon: res?.comps?.slice(0, 12).map(c => ({ date: c.date, surface_m2: c.surface, type: c.type, pieces: c.pieces, valeur_eur: c.valeur, eur_m2: c.ppsm })) ?? [],
  });
  const meta = () => ({ bien: b.id, bienNom: b.nom, estimation: true, fourchette: res && !res.error ? `${res.mini} → ${res.maxi}` : '' });
  const consent = h('input', { type: 'checkbox', checked: besConsent, onchange: e => { besConsent = e.target.checked; runBtn.disabled = isLocal || (!isOllama && !besConsent); } });
  const run = async () => {
    if (!res || res.error) { toast('⚠️ Lancez d’abord une estimation'); return; }
    runBtn.disabled = true; runBtn.textContent = '⏳ Analyse en cours… (peut durer plusieurs minutes avec un modèle local)';
    try {
      const j = await (await fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: BES_SYSTEM, user: BES_USER.replaceAll('{{bien}}', JSON.stringify(D().bien)).replaceAll('{{estimation}}', JSON.stringify({ estimation: D().estimation, comparables: D().echantillon })), title: 'Estimation IA · ' + b.nom, meta: meta() }) })).json();
      if (j.error) throw new Error(j.error); besAI = j.analysis; toast('✅ Analyse terminée'); render();
    } catch (e) { toast('⚠️ ' + e.message); runBtn.disabled = false; runBtn.textContent = '🧠 Lancer l’analyse IA'; }
  };
  const runBtn = h('button', { class: 'btn', disabled: isLocal ? true : (!isOllama && !besConsent), onclick: run }, '🧠 Lancer l’analyse IA');
  const localText = () => {
    if (!res || res.error) return 'Aucune estimation chiffrée à analyser.';
    const L = ['## Fourchette estimée', `- Mini : **${eur0(res.mini)}**, centrale : **${eur0(res.centre)}**, maxi : **${eur0(res.maxi)}** (${res.surface} m² × ${eur0(res.ppsmCentre)}/m², ajusté ×${res.factor}).`];
    L.push('## Base de calcul', res.n ? `- ${res.n} ventes comparables (${bes.muts?.years?.join(', ') ?? 'période courante'}), centiles 25 / 50 / 75 du prix au m².` : `- Prix au m² saisi manuellement : ${eur0(bes.manualPpsm)}/m².`, ...(res.adj ?? []).filter(a => a.on).map(a => `- ${a.label}${a.detail ? ' (' + a.detail + ')' : ''} : ${a.pct > 0 ? '+' : ''}${a.pct} %`));
    if (res.faible) L.push('## Limites', '- Échantillon faible : élargissez la période ou le rayon de surface pour sécuriser la fourchette.');
    L.push('## Recommandations', '- Comparez avec 2 à 3 annonces actuelles du même quartier avant de retenir un prix.', '- Relancez l’estimation après travaux ou changement de DPE.');
    return L.join('\n');
  };
  const saveLocal = async () => {
    if (!res || res.error) { toast('⚠️ Lancez d’abord une estimation'); return; }
    const j = await (await fetch('/api/ai/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Analyse locale · estimation ' + b.nom, text: localText(), meta: meta() }) })).json();
    besAI = j.analysis; toast('Analyse locale terminée'); render();
  };
  const mine = (hist?.list ?? []).filter(e => e.meta?.bien === b.id);
  return h('div', { class: 'card', style: { marginTop: '18px' } },
    h('h2', {}, '🧠 Analyse de l’estimation', h('small', {}, isLocal ? 'aucun fournisseur configuré' : provLabel + ' · ' + (dis.model || prov?.model || ''))),
    h('p', { class: 'muted', style: { margin: '0 0 10px', fontSize: '12.5px' } }, 'L’IA lit les caractéristiques du bien, la fourchette DVF et un échantillon anonymisé de ventes (sans adresse du bien, ni nom, ni compte), puis rédige justification, limites et recommandations.'),
    isLocal ? h('div', { class: 'tip warn', style: { marginBottom: '10px' } }, 'Aucun fournisseur d’IA n’est configuré. ', h('a', { class: 'doclink', href: '#/ai' }, 'Configurer un fournisseur →'), ' L’analyse locale reste utilisable.') : null,
    !isLocal && !isOllama ? h('label', { class: 'schedon', style: { marginBottom: '10px', alignItems: 'flex-start' } }, consent, h('span', {}, 'J’autorise l’envoi des ', h('b', {}, 'caractéristiques du bien et statistiques de ventes'), ' à ', h('b', {}, provLabel), ' (sans adresse, nom, ni compte).')) : null,
    isOllama ? h('div', { class: 'tip', style: { marginBottom: '10px' } }, '🔒 Modèle local : les données restent sur votre ordinateur.') : null,
    h('div', { class: 'toolbar', style: { margin: 0 } }, runBtn,
      h('button', { class: 'btn sec', onclick: saveLocal }, '📊 Analyse locale rapide'),
      h('button', { class: 'btn sec', onclick: () => modal('Aperçu de ce qui sera envoyé', [
        h('p', { class: 'muted', style: { margin: 0 } }, 'Contenu exact transmis au fournisseur d’IA :'),
        h('div', { class: 'field' }, h('label', {}, 'Consigne système'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap' } }, BES_SYSTEM)),
        h('div', { class: 'field' }, h('label', {}, 'Message'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap', maxHeight: '340px' } }, BES_USER.replaceAll('{{bien}}', JSON.stringify(D().bien)).replaceAll('{{estimation}}', JSON.stringify({ estimation: D().estimation, comparables: D().echantillon }))))],
        close => [h('button', { class: 'btn', onclick: close }, 'Fermer')], true) }, '👁️ Aperçu')),
    mine.length ? h('div', { style: { marginTop: '12px' } }, h('label', { style: { fontSize: '12px', fontWeight: 600, color: 'var(--muted)' } }, 'Analyses précédentes de ce bien :'),
      h('div', { class: 'chips', style: { marginTop: '6px' } }, mine.slice(0, 8).map(e => h('button', { class: 'chip toggle' + (besAI?.id === e.id ? ' on' : ''), style: besAI?.id === e.id ? { background: '#6366f1' } : {}, onclick: () => { besAI = e; render(); } },
        (e.kind === 'ia' ? '🧠 ' : '📊 ') + e.title.replace(/^(Analyse (IA|locale) · )/, '') + ' · ' + fdate(String(e.date).slice(0, 10)))))) : null);
}

/** PDF de l'estimation chiffrée (fourchette, méthode, ajustements, comparables). */
function bienEstimPdf(b, res, opts) {
  const blocks = [
    { t: 'kpis', items: [
      { label: 'Mini (25e centile)', value: eur0(res.mini), sub: eur0(res.ppsmMini) + ' / m²', color: '#ef4444' },
      { label: 'Estimation centrale', value: eur0(res.centre), sub: eur0(res.ppsmCentre) + ' / m² · facteur ×' + res.factor, color: b.couleur || '#6366f1' },
      { label: 'Maxi (75e centile)', value: eur0(res.maxi), sub: eur0(res.ppsmMaxi) + ' / m²', color: '#10b981' },
      { label: 'Échantillon', value: res.n ? res.n + ' ventes' : 'manuel', sub: res.faible ? 'échantillon faible' : 'comparables retenus', color: '#0ea5e9' }] },
    { t: 'h2', text: 'Méthode' },
    { t: 'table', columns: [{ title: 'Étape', w: 2 }, { title: 'Détail', w: 5.5 }], rows: [
      { cells: ['Source', res.n ? `Ventes réelles DVF publiées par data.gouv.fr · ${bes.muts?.years?.join(', ') ?? ''}` : 'Prix au m² saisi manuellement'] },
      { cells: ['Commune', [b.ville, b.codePostal, b.commune ? '(INSEE ' + b.commune + ')' : ''].filter(Boolean).join(' ') || '—'] },
      { cells: ['Comparables', res.n ? `${res.n} ventes de type ${res.type ?? (b.type === 'maison' ? 'maison' : 'appartement')}, surface entre ${Math.round(res.surface * (1 - opts.rayon))} et ${Math.round(res.surface * (1 + opts.rayon))} m²${opts.pieces ? ', même nombre de pièces (±1)' : ''}${opts.depuis ? ', depuis le ' + fdate(opts.depuis) : ''}${opts.trim !== false ? ', valeurs aberrantes exclues' : ''}` : '—'] },
      { cells: ['Résultat', `${eur0(res.ppsmMini)} / m² (mini) → ${eur0(res.ppsmCentre)} / m² (médiane) → ${eur0(res.ppsmMaxi)} / m² (maxi), appliqués à ${res.surface} m²`] }] },
  ];
  if (res.ppsm) blocks.push({ t: 'h2', text: 'Dispersion des prix au m²' },
    { t: 'table', columns: [{ title: 'Repère', w: 2 }, { title: '€/m²', w: 1.4, align: 'right' }, { title: 'Lecture', w: 4 }], rows: [
      { cells: ['10e centile', eur0(res.ppsm.p10), 'bas de fourchette des ventes'] }, { cells: ['25e centile (mini)', eur0(res.ppsm.p25), 'ventes les plus basses retenues'] },
      { bold: true, cells: ['Médiane', eur0(res.ppsm.p50), 'vente « typique » de la commune'] }, { cells: ['75e centile (maxi)', eur0(res.ppsm.p75), 'ventes les plus hautes retenues'] },
      { cells: ['90e centile', eur0(res.ppsm.p90), 'haut de fourchette'] }, { cells: ['Moyenne', eur0(res.ppsm.avg), `sur ${res.ppsm.n} ventes`] }] });
  if (res.adj?.length) blocks.push({ t: 'h2', text: 'Ajustements des caractéristiques' },
    { t: 'table', columns: [{ title: 'Ajustement', w: 3 }, { title: 'Détail', w: 2.6 }, { title: 'Coefficient', w: 1.4, align: 'right' }], rows: res.adj.map(a => ({ cells: [a.label, a.detail || '—', (a.on ? (a.pct > 0 ? '+' : '') + a.pct + ' %' : 'exclu')] })) });
  if (res.comps?.length) blocks.push({ t: 'h2', text: 'Échantillon des ventes comparables' },
    { t: 'table', columns: [{ title: 'Date', w: 1.2 }, { title: 'Adresse', w: 3 }, { title: 'Surface', w: 1, align: 'right' }, { title: 'Pièces', w: .8, align: 'right' }, { title: 'Prix', w: 1.3, align: 'right' }, { title: '€/m²', w: 1.1, align: 'right' }], rows:
      res.comps.slice(0, 25).map(c => ({ cells: [fdate(c.date), [c.adresse, c.cp, c.commune].filter(Boolean).join(' · '), c.surface + ' m²', String(c.pieces || '—'), eur0(c.valeur), eur0(c.ppsm)] })) });
  const histE = b.estimations ?? [];
  if (histE.length) blocks.push({ t: 'h2', text: 'Historique des estimations' },
    { t: 'table', columns: [{ title: 'Date', w: 1.3 }, { title: 'Source', w: 3 }, { title: 'Mini', w: 1.2, align: 'right' }, { title: 'Centrale', w: 1.2, align: 'right' }, { title: 'Maxi', w: 1.2, align: 'right' }], rows:
      histE.map((e, i) => ({ bold: i === 0, cells: [fdate(String(e.date).slice(0, 10)), e.source || '—', eur0(e.mini), eur0(e.centre), eur0(e.maxi)] })) });
  return generateReport({ title: 'Estimation du bien : ' + b.nom, file: 'estimation-bien', subtitle: `${b.surface ? b.surface + ' m²' : ''}${b.ville ? ' · ' + b.ville : ''} · ${res.n ? res.n + ' ventes DVF' : 'repli manuel'} · ${fdate(todayIso())}`, blocks });
}

/** État vide commun aux pages des biens. */
function biensEmpty(msg, hash) {
  return h('div', { class: 'card empty', style: { marginTop: '18px', padding: '34px' } },
    h('div', { style: { fontSize: '36px' } }, '🏘️'), h('h2', {}, 'Aucun bien immobilier'),
    h('p', { class: 'muted', style: { maxWidth: '560px', margin: '0 auto 14px' } }, msg),
    h('a', { class: 'btn', href: '#/' + hash, style: { textDecoration: 'none' } }, '→ Ouvrir la gestion des biens'));
}
