'use strict';
// ============ Analyse pluriannuelle : les grandes lignes de toutes les années présentes dans les données ============
const MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Agrégats par année (moyennes mensuelles sur les mois complets pour comparer des années partielles). */
function buildMultiYearData(scope) {
  const C = cats(), set = anScopeSet(scope), all = S.data.operations;
  const ops = all.filter(o => set.has(o.account));
  const minD = all[0].date, maxD = S.data.accounts.map(a => a.closingDate).filter(Boolean).sort().pop() || all[all.length - 1].date;
  const complete = m => { const [y, mo] = m.split('-').map(Number); return `${m}-01` >= minD && `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}` <= maxD; };
  const years = [...new Set(ops.map(o => o.date.slice(0, 4)))].sort();
  // patrimoine (tous comptes) en fin d'année ou à la dernière date connue
  const accs = S.data.accounts.map(a => a.number), bs = balanceSeries(accs), total = bs.days.map((_, i) => sum(accs.map(n => bs.res[n][i])));
  const balAt = y => { let k = -1; bs.days.forEach((d, i) => { if (d <= `${y}-12-31`) k = i; }); return k >= 0 ? anRound(total[k]) : null; };

  const rows = years.map(y => {
    const yo = ops.filter(o => o.date.startsWith(y)), A = analyze(yo), months = [...new Set(yo.map(o => o.date.slice(0, 7)))].sort();
    const cm = months.filter(complete), usable = cm.length > 0, co = yo.filter(o => cm.includes(o.date.slice(0, 7))), Ac = usable ? analyze(co) : { income: 0, expense: 0, byCat: new Map(), byMonth: new Map() }, n = Math.max(1, cm.length);
    const row = { annee: +y, mois_avec_donnees: months.length, mois_complets: cm.length, revenus: anRound(A.income), depenses: anRound(A.expense), epargne: anRound(A.income - A.expense),
      taux_epargne_pct: usable && Ac.income ? +((Ac.income - Ac.expense) / Ac.income * 100).toFixed(1) : null, revenu_moyen_mensuel: usable ? anRound(Ac.income / n) : null, depense_moyenne_mensuelle: usable ? anRound(Ac.expense / n) : null, patrimoine_fin_periode: balAt(y) };
    if (!usable) row.note = 'aucun mois complet : année non exploitable pour les moyennes et les comparaisons';
    if (usable && cm.length < 12) row.projection_annuelle = { revenus: anRound(Ac.income / n * 12), depenses: anRound(Ac.expense / n * 12) };
    return { row, Ac, n, cm };
  });

  const catTable = kind => {
    const ids = new Set(); rows.forEach(r => r.Ac.byCat.forEach((v, id) => { if (C.get(id)?.kind === kind && v > 0) ids.add(id); }));
    return [...ids].map(id => {
      const par = {}; rows.forEach(r => { const v = (r.Ac.byCat.get(id) ?? 0) / r.n; if (v) par[r.row.annee] = anRound(v); });
      const ys = Object.keys(par).map(Number).sort(), f = par[ys[0]], l = par[ys[ys.length - 1]];
      return { categorie: C.get(id).name, moyenne_mensuelle_par_annee: par, _tot: sum(Object.values(par)), ...(ys.length > 1 && f ? { variation_premiere_derniere_pct: +((l - f) / f * 100).toFixed(1), variation_eur_par_mois: l - f } : {}) };
    }).sort((a, b) => b._tot - a._tot).slice(0, 10).map(({ _tot, ...x }) => x);
  };
  const depenses = catTable('expense'), revenus = catTable('income');
  const withVar = depenses.filter(c => c.variation_eur_par_mois != null);
  // saisonnalité : dépenses moyennes par mois civil (mois complets de toutes les années)
  const bucket = Array.from({ length: 12 }, () => []);
  rows.forEach(r => r.cm.forEach(m => bucket[+m.slice(5) - 1].push(r.Ac.byMonth.get(m)?.expense ?? 0)));
  const saison = bucket.map((a, i) => ({ mois: MOIS_LONG[i], moyenne: a.length ? anRound(sum(a) / a.length) : null, n: a.length })).filter(x => x.moyenne != null);
  const D = {
    type: 'pluriannuelle',
    periode: { annees: years.map(Number), du: years[0], au: years[years.length - 1], nb_annees: years.length, comptes: anScopeLabel(scope), note: 'Les moyennes mensuelles portent sur les mois complets ; les années partielles sont signalées (mois_complets < 12) et comparées sur cette base.' },
    par_annee: rows.map(r => r.row),
    depenses_par_categorie_et_par_annee: depenses, revenus_par_categorie_et_par_annee: revenus,
    plus_fortes_hausses_mensuelles: withVar.filter(c => c.variation_eur_par_mois > 0).sort((a, b) => b.variation_eur_par_mois - a.variation_eur_par_mois).slice(0, 4).map(c => ({ categorie: c.categorie, variation_eur_par_mois: c.variation_eur_par_mois, variation_pct: c.variation_premiere_derniere_pct })),
    plus_fortes_baisses_mensuelles: withVar.filter(c => c.variation_eur_par_mois < 0).sort((a, b) => a.variation_eur_par_mois - b.variation_eur_par_mois).slice(0, 4).map(c => ({ categorie: c.categorie, variation_eur_par_mois: c.variation_eur_par_mois, variation_pct: c.variation_premiere_derniere_pct })),
    mois_les_plus_depensiers: [...saison].sort((a, b) => b.moyenne - a.moyenne).slice(0, 3).map(({ mois, moyenne }) => ({ mois, depense_moyenne: moyenne })),
  };
  return { D, rows };
}
const multiLabel = D => D.periode.nb_annees > 1 ? `${D.periode.du}–${D.periode.au}` : String(D.periode.du);

/** Texte rédigé localement (sans IA). */
function localMultiYear(D, focus) {
  const Y = D.par_annee, e0 = x => eur0(x), pc = x => (x == null ? '–' : x.toFixed(1).replace('.', ',') + ' %'), sg = x => (x >= 0 ? '+' : '−') + eur0(Math.abs(x));
  const out = [`## Vue d’ensemble`];
  const nm = sum(Y.map(y => y.mois_avec_donnees));
  out.push(`Les données couvrent **${Y.length} année${Y.length > 1 ? 's' : ''}** (${multiLabel(D)}, ${nm} mois) pour ${D.periode.comptes}. Les années partielles sont comparées sur la base des moyennes mensuelles des mois complets.`);
  const full = Y.filter(y => y.mois_complets > 0), first = full[0], last = full[full.length - 1];
  if (first && last && first !== last) {
    const dd = last.depense_moyenne_mensuelle - first.depense_moyenne_mensuelle, di = last.revenu_moyen_mensuel - first.revenu_moyen_mensuel;
    out.push(`Entre **${first.annee}** et **${last.annee}**, la dépense moyenne mensuelle passe de ${e0(first.depense_moyenne_mensuelle)} à **${e0(last.depense_moyenne_mensuelle)}** (${dd >= 0 ? '+' : ''}${pc(first.depense_moyenne_mensuelle ? dd / first.depense_moyenne_mensuelle * 100 : null)}) et le revenu moyen mensuel de ${e0(first.revenu_moyen_mensuel)} à **${e0(last.revenu_moyen_mensuel)}** (${di >= 0 ? '+' : ''}${pc(first.revenu_moyen_mensuel ? di / first.revenu_moyen_mensuel * 100 : null)}). Le taux d’épargne évolue de ${pc(first.taux_epargne_pct)} à **${pc(last.taux_epargne_pct)}**.`);
  }
  out.push(`## Année par année`);
  out.push(Y.map(y => y.revenu_moyen_mensuel == null ? `- **${y.annee}** _(${y.mois_avec_donnees} mois avec données, aucun complet)_ : revenus ${e0(y.revenus)}, dépenses ${e0(y.depenses)} sur la partie couverte — année trop incomplète pour des moyennes ou des comparaisons${y.patrimoine_fin_periode != null ? `, patrimoine ${e0(y.patrimoine_fin_periode)}` : ''}.` : `- **${y.annee}**${y.mois_complets < 12 ? ` _(${y.mois_complets} mois complets sur ${y.mois_avec_donnees} avec données)_` : ''} : revenus ${e0(y.revenus)} (${e0(y.revenu_moyen_mensuel)}/mois), dépenses ${e0(y.depenses)} (${e0(y.depense_moyenne_mensuelle)}/mois), épargne **${sg(y.epargne)}**, taux ${pc(y.taux_epargne_pct)}${y.projection_annuelle ? `, projection annuelle ≈ ${e0(y.projection_annuelle.revenus)} de revenus et ${e0(y.projection_annuelle.depenses)} de dépenses` : ''}${y.patrimoine_fin_periode != null ? `, patrimoine ${e0(y.patrimoine_fin_periode)}` : ''}.`).join('\n'));
  const pat = Y.filter(y => y.patrimoine_fin_periode != null);
  if (pat.length > 1) { const a = pat[0], b = pat[pat.length - 1]; out.push(`Le patrimoine (tous comptes) évolue de **${e0(a.patrimoine_fin_periode)}** (fin ${a.annee}) à **${e0(b.patrimoine_fin_periode)}** (${b.annee === last?.annee && b.mois_complets < 12 ? 'dernière date connue' : 'fin ' + b.annee}), soit ${sg(b.patrimoine_fin_periode - a.patrimoine_fin_periode)}.`); }
  if (focus !== 'income') {
    out.push(`## Évolution des postes de dépense`);
    const top = D.depenses_par_categorie_et_par_annee.slice(0, 5);
    out.push(top.map(c => `- **${c.categorie}** : ` + Object.entries(c.moyenne_mensuelle_par_annee).map(([y, v]) => `${y} ${e0(v)}/mois`).join(' → ') + (c.variation_premiere_derniere_pct != null ? ` (${c.variation_premiere_derniere_pct >= 0 ? '▲ +' : '▼ '}${pc(c.variation_premiere_derniere_pct)})` : '')).join('\n'));
    if (D.plus_fortes_hausses_mensuelles.length) out.push(`**Hausses les plus marquées :** ` + D.plus_fortes_hausses_mensuelles.map(c => `${c.categorie} (+${e0(c.variation_eur_par_mois)}/mois, ${pc(c.variation_pct)})`).join(' ; ') + '.');
    if (D.plus_fortes_baisses_mensuelles.length) out.push(`**Baisses les plus marquées :** ` + D.plus_fortes_baisses_mensuelles.map(c => `${c.categorie} (${sg(c.variation_eur_par_mois)}/mois, ${pc(c.variation_pct)})`).join(' ; ') + '.');
  }
  if (focus !== 'expense') {
    out.push(`## Revenus`);
    out.push(D.revenus_par_categorie_et_par_annee.length ? D.revenus_par_categorie_et_par_annee.slice(0, 5).map(c => `- **${c.categorie}** : ` + Object.entries(c.moyenne_mensuelle_par_annee).map(([y, v]) => `${y} ${e0(v)}/mois`).join(' → ')).join('\n') : 'Aucun revenu sur la période.');
  }
  out.push(`## Saisonnalité et points d’attention`);
  const att = [];
  if (D.mois_les_plus_depensiers.length) att.push(`Mois les plus dépensiers en moyenne : ${D.mois_les_plus_depensiers.map(m => `**${m.mois}** (${e0(m.depense_moyenne)})`).join(', ')}.`);
  const partial = Y.filter(y => y.mois_complets < 12); if (partial.length) att.push(`Années partielles : ${partial.map(y => `${y.annee} (${y.mois_complets} mois complets)`).join(', ')} — leurs totaux ne sont pas comparables directement aux années complètes.`);
  const neg = Y.filter(y => y.epargne < 0); if (neg.length) att.push(`⚠️ Épargne négative en ${neg.map(y => y.annee).join(', ')} : les dépenses ont dépassé les revenus.`);
  if (first && last && first !== last && last.taux_epargne_pct != null && first.taux_epargne_pct != null && last.taux_epargne_pct < first.taux_epargne_pct - 5) att.push(`Le taux d’épargne a reculé de ${pc(first.taux_epargne_pct - last.taux_epargne_pct)} points entre ${first.annee} et ${last.annee}.`);
  out.push(att.length ? att.map(a => '- ' + a).join('\n') : 'Aucun point d’alerte particulier.');
  out.push(`## Recommandations`);
  const rec = [];
  if (D.plus_fortes_hausses_mensuelles[0]) rec.push(`Surveillez **${D.plus_fortes_hausses_mensuelles[0].categorie}**, premier poste en hausse (+${e0(D.plus_fortes_hausses_mensuelles[0].variation_eur_par_mois)} par mois depuis la première année).`);
  if (last?.taux_epargne_pct != null && last.taux_epargne_pct < 10) rec.push(`Le taux d’épargne récent (${pc(last.taux_epargne_pct)}) est faible : visez 10 à 15 % des revenus.`);
  if (D.mois_les_plus_depensiers[0]) rec.push(`Anticipez les mois chargés (${D.mois_les_plus_depensiers.map(m => m.mois).join(', ')}) en constituant une provision mensuelle.`);
  rec.push('Utilisez la page Prévisions pour transformer ces tendances en budget de l’année suivante.');
  out.push(rec.map(r => '- ' + r).join('\n'));
  out.push(`> Analyse générée localement à partir de règles statistiques simples. Pour une analyse rédigée par un modèle d’IA, configurez un fournisseur dans *Analyse › Paramètres IA*.`);
  return out.join('\n\n');
}

/** Bloc d'interface du mode pluriannuel : années détectées, graphiques et tableau. */
function multiYearView(v, an, D, controls) {
  const Y = D.par_annee, C = cats();
  v.append(h('div', { class: 'card' },
    h('div', { class: 'grid g3', style: { gap: '14px' } }, h('div', { class: 'field' }, h('label', {}, 'Comptes'), controls.scopeSel), h('div', { class: 'field' }, h('label', {}, 'Axe de l’analyse'), controls.focusSel),
      h('div', { class: 'field' }, h('label', {}, 'Années présentes'), h('div', { class: 'chips' }, Y.map(y => h('span', { class: 'chip toggle on', style: { background: y.mois_complets < 12 ? '#f59e0b' : 'var(--primary)', cursor: 'default' } }, `${y.annee} · ${y.mois_avec_donnees} mois`))))),
    h('p', { class: 'muted', style: { margin: '12px 0 0', fontSize: '12.5px' } }, 'L’analyse porte sur toutes les années présentes dans vos relevés. Les années partielles (en orange) sont comparées sur la base des moyennes mensuelles des mois complets ; une année sans aucun mois complet n’entre pas dans les moyennes ni les comparaisons.')));
  const last = Y[Y.length - 1];
  v.append(h('div', { class: 'grid g4', style: { marginTop: '18px' } },
    kpi('k3', 'Années', String(Y.length), multiLabel(D), '📅'), kpi('k2', 'Revenu moyen / mois', eur0(last.revenu_moyen_mensuel), String(last.annee), '💰'),
    kpi('k1', 'Dépense moyenne / mois', eur0(last.depense_moyenne_mensuelle), String(last.annee), '💸'), kpi('k4', 'Patrimoine', last.patrimoine_fin_periode != null ? eur0(last.patrimoine_fin_periode) : '–', 'dernière date connue', '🏦')));
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Revenus et dépenses moyens par mois', h('small', {}, 'par année')), h('div', { class: 'chart-box' }, h('canvas', { id: 'myBars' }))),
    h('div', { class: 'card' }, h('h2', {}, 'Principaux postes de dépense', h('small', {}, 'moyenne mensuelle par année')), h('div', { class: 'chart-box' }, h('canvas', { id: 'myCats' })))));
  chart($('#myBars'), { type: 'bar', data: { labels: Y.map(y => String(y.annee) + (y.mois_complets < 12 ? '*' : '')), datasets: [
    { label: 'Revenus / mois', data: Y.map(y => y.revenu_moyen_mensuel ?? 0), backgroundColor: '#10b981', borderRadius: 6 }, { label: 'Dépenses / mois', data: Y.map(y => y.depense_moyenne_mensuelle ?? 0), backgroundColor: '#ef4444', borderRadius: 6 }] },
    options: { scales: { y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur } } });
  const palette = ['#6366f1', '#f97316', '#10b981', '#ec4899', '#0ea5e9', '#eab308', '#8b5cf6', '#14b8a6'];
  chart($('#myCats'), { type: 'bar', data: { labels: Y.map(y => String(y.annee)), datasets: D.depenses_par_categorie_et_par_annee.slice(0, 8).map((c, i) => ({ label: c.categorie, backgroundColor: palette[i], data: Y.map(y => c.moyenne_mensuelle_par_annee[y.annee] ?? 0) })) },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Synthèse par année', h('small', {}, '* année partielle')),
    h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Année', 'Mois complets', 'Revenus', 'Dépenses', 'Épargne', 'Taux', 'Revenu/mois', 'Dépense/mois', 'Patrimoine'].map((t, i) => h('th', { class: i ? 'r' : '' }, t)))),
      h('tbody', {}, Y.map(y => h('tr', {}, h('td', { style: { fontWeight: 700 } }, y.annee + (y.mois_complets < 12 ? '*' : '')), h('td', { class: 'r num muted' }, `${y.mois_complets}/12`), h('td', { class: 'r num' }, eur0(y.revenus)), h('td', { class: 'r num' }, eur0(y.depenses)),
        h('td', { class: 'r num ' + (y.epargne < 0 ? 'neg' : 'pos'), style: { fontWeight: 600 } }, signed(y.epargne).replace(/,00/, '')), h('td', { class: 'r num' }, y.taux_epargne_pct == null ? '–' : y.taux_epargne_pct.toFixed(1).replace('.', ',') + ' %'),
        h('td', { class: 'r num' }, y.revenu_moyen_mensuel == null ? '–' : eur0(y.revenu_moyen_mensuel)), h('td', { class: 'r num' }, y.depense_moyenne_mensuelle == null ? '–' : eur0(y.depense_moyenne_mensuelle)), h('td', { class: 'r num' }, y.patrimoine_fin_periode != null ? eur0(y.patrimoine_fin_periode) : '–'))))))));
  void C;
}

/** Description du PDF d'une analyse pluriannuelle. */
function multiYearPdf(entry, D) {
  const Y = D.par_annee, last = Y[Y.length - 1];
  const blocks = [
    { t: 'kpis', items: [{ label: 'Années analysées', value: String(Y.length), sub: multiLabel(D), color: '#6366f1' }, { label: 'Revenu moyen / mois', value: eur0(last.revenu_moyen_mensuel), sub: String(last.annee), color: '#10b981' }, { label: 'Dépense moyenne / mois', value: eur0(last.depense_moyenne_mensuelle), sub: String(last.annee), color: '#ef4444' }] },
    { t: 'vbars', height: 160, labels: Y.map(y => String(y.annee) + (y.mois_complets < 12 ? '*' : '')), series: [{ name: 'Revenus / mois', color: '#10b981', data: Y.map(y => y.revenu_moyen_mensuel ?? 0) }, { name: 'Dépenses / mois', color: '#ef4444', data: Y.map(y => y.depense_moyenne_mensuelle ?? 0) }] },
    { t: 'table', columns: [{ title: 'Année', w: 1 }, { title: 'Mois compl.', w: 1, align: 'right' }, { title: 'Revenus', w: 1.3, align: 'right' }, { title: 'Dépenses', w: 1.3, align: 'right' }, { title: 'Épargne', w: 1.3, align: 'right' }, { title: 'Taux', w: 1, align: 'right' }, { title: 'Patrimoine', w: 1.4, align: 'right' }],
      rows: Y.map(y => ({ cells: [y.annee + (y.mois_complets < 12 ? '*' : ''), `${y.mois_complets}/12`, eur0(y.revenus), eur0(y.depenses), { text: signed(y.epargne).replace(/,00/, ''), color: y.epargne < 0 ? '#ef4444' : '#10b981' }, y.taux_epargne_pct == null ? '–' : y.taux_epargne_pct.toFixed(1).replace('.', ',') + ' %', y.patrimoine_fin_periode != null ? eur0(y.patrimoine_fin_periode) : '–'] })) },
    { t: 'text', text: '* année partielle : moyennes calculées sur les mois complets.' }];
  blocks.push(...mdToPdfBlocks(entry.text));
  return { title: 'Analyse pluriannuelle', file: 'analyse-pluriannuelle', subtitle: `${D.periode.comptes} · ${multiLabel(D)} · ${entry.kind === 'ia' ? 'IA ' + (entry.model || entry.provider) : 'analyse locale'}`, blocks };
}
