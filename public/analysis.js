'use strict';
// ============ Analyse des dépenses et revenus (IA ou analyse locale) ============
const AN_FOCUS = { both: 'dépenses et revenus', expense: 'dépenses uniquement', income: 'revenus uniquement', saving: 'épargne et marge de manœuvre budgétaire' };
const anScopeLabel = sc => sc === 'courants' ? 'Comptes courants' : sc === 'tous' ? 'Tous les comptes' : accName(S.data.accounts.find(a => a.number === sc) ?? { name: sc, type: '' });
const anPeriodLabel = (a, b) => a === b ? monthLabel(a, true) : `${monthLabel(a, true)} à ${monthLabel(b, true)}`;
function anDefaults() {
  const ms = allMonths(), [a, b] = periodRange();
  return { scope: S.scope, from: a ?? ms[0], to: ms.length > 1 && b === ms[ms.length - 1] ? ms[ms.length - 2] : b, focus: 'both', compare: true, consent: false };
}
function anScopeSet(sc) {
  const A = S.data.accounts;
  return sc === 'courants' ? new Set(A.filter(isCurrent).map(a => a.number)) : sc === 'tous' ? new Set(A.map(a => a.number)) : new Set([sc]);
}
const anOps = (sc, from, to) => { const set = anScopeSet(sc); return S.data.operations.filter(o => set.has(o.account) && o.date.slice(0, 7) >= from && o.date.slice(0, 7) <= to); };
const anRound = x => Math.round(x);
const anAnon = o => /^virement/.test(o.kind || '') ? 'Virement à un particulier' : /^chèque|^cheque/i.test(o.title) ? 'Chèque' : o.title;

/** Agrégats (aucune donnée nominative, ni IBAN, ni libellé bancaire brut). */
function buildAnalysisData(an) {
  const C = cats(), ops = anOps(an.scope, an.from, an.to), A = analyze(ops);
  const months = allMonths().filter(m => m >= an.from && m <= an.to), n = Math.max(1, months.length);
  let prev = null;
  if (an.compare) {
    const pTo = addMonths(an.from, -1), pFrom = addMonths(an.from, -n);
    if (allMonths().some(m => m >= pFrom && m <= pTo)) { const po = anOps(an.scope, pFrom, pTo); if (po.length) prev = { from: pFrom, to: pTo, A: analyze(po), n }; }
  }
  const rows = kind => [...A.byCat].filter(([id, v]) => C.get(id)?.kind === kind && v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => {
    const pv = prev?.A.byCat.get(id) ?? null;
    return { categorie: C.get(id).name, montant: anRound(v), part_pct: +(v / (kind === 'expense' ? A.expense : A.income) * 100).toFixed(1), moyenne_mensuelle: anRound(v / n),
      ...(prev ? { periode_precedente: anRound(pv ?? 0), variation_pct: pv ? +((v - pv) / pv * 100).toFixed(1) : null } : {}) };
  });
  const byTitle = new Map();
  for (const o of ops) {
    const c = C.get(o.categoryId); if (c?.kind !== 'expense' || o.amount >= 0) continue;
    const t = anAnon(o), e = byTitle.get(t) ?? { poste: t, categorie: c.name, total: 0, nb: 0, mois: new Set() };
    e.total -= o.amount; e.nb++; e.mois.add(o.date.slice(0, 7)); byTitle.set(t, e);
  }
  const postes = [...byTitle.values()].sort((a, b) => b.total - a.total);
  const recurrents = postes.filter(e => e.mois.size >= Math.max(3, Math.ceil(n * .6)) && e.nb <= e.mois.size * 1.6);
  // anomalies : mois atypiques par catégorie + grosses opérations isolées
  const anomalies = [];
  for (const [id] of [...A.byCat].filter(([id]) => C.get(id)?.kind === 'expense')) {
    const vals = months.map(m => A.byMonth.get(m)?.cat.get(id) ?? 0);
    if (vals.length < 4) continue;
    const mean = sum(vals) / vals.length, sd = Math.sqrt(sum(vals.map(x => (x - mean) ** 2)) / vals.length);
    vals.forEach((x, i) => { if (sd > 0 && x > mean + 1.5 * sd && x - mean > 50) anomalies.push({ type: 'mois_atypique', categorie: C.get(id).name, mois: months[i], montant: anRound(x), moyenne_habituelle: anRound(mean) }); });
  }
  const byCatOps = new Map();
  for (const o of ops) { const c = C.get(o.categoryId); if (c?.kind === 'expense' && o.amount < 0) (byCatOps.get(c.id) ?? byCatOps.set(c.id, []).get(c.id)).push(o); }
  for (const [id, list] of byCatOps) {
    const med = list.map(o => -o.amount).sort((a, b) => a - b)[Math.floor(list.length / 2)] || 0;
    list.filter(o => -o.amount > Math.max(200, 4 * med) && list.length >= 5).slice(0, 2).forEach(o => anomalies.push({ type: 'grosse_operation', categorie: C.get(id).name, date: o.date, poste: anAnon(o), montant: anRound(-o.amount), montant_median_categorie: anRound(med) }));
  }
  const D = {
    periode: { du: an.from, au: an.to, nb_mois: n, comptes: anScopeLabel(an.scope) },
    totaux: { revenus: anRound(A.income), depenses: anRound(A.expense), epargne: anRound(A.income - A.expense), taux_epargne_pct: A.income ? +((A.income - A.expense) / A.income * 100).toFixed(1) : null,
      depense_moyenne_mensuelle: anRound(A.expense / n), revenu_moyen_mensuel: anRound(A.income / n) },
    ...(prev ? { periode_precedente: { du: prev.from, au: prev.to, revenus: anRound(prev.A.income), depenses: anRound(prev.A.expense), epargne: anRound(prev.A.income - prev.A.expense) } } : {}),
    par_mois: months.map(m => ({ mois: m, revenus: anRound(A.byMonth.get(m)?.income ?? 0), depenses: anRound(A.byMonth.get(m)?.expense ?? 0) })),
    depenses_par_categorie: rows('expense'), revenus_par_categorie: rows('income'),
    plus_gros_postes_de_depense: postes.slice(0, 12).map(e => ({ poste: e.poste, categorie: e.categorie, total: anRound(e.total), nb_operations: e.nb })),
    charges_recurrentes: { total_mensuel_estime: anRound(sum(recurrents.map(e => e.total)) / n), part_des_revenus_pct: A.income ? +(sum(recurrents.map(e => e.total)) / A.income * 100).toFixed(1) : null,
      postes: recurrents.slice(0, 10).map(e => ({ poste: e.poste, total: anRound(e.total) })) },
    anomalies_detectees: anomalies.slice(0, 12),
  };
  return { D, A, ops, months, prev };
}

/** Analyse rédigée localement (statistiques simples, sans IA). */
function localAnalysis(D, focus) {
  if (D.type === 'pluriannuelle') return localMultiYear(D, focus);
  const T = D.totaux, e0 = x => eur0(x), pc = x => (x == null ? '–' : x.toFixed(1).replace('.', ',') + ' %');
  const out = [], P = D.periode;
  out.push(`## Synthèse`, `Sur **${anPeriodLabel(P.du, P.au)}** (${P.comptes}, ${P.nb_mois} mois), vos revenus s’élèvent à **${e0(T.revenus)}** et vos dépenses à **${e0(T.depenses)}**, soit une épargne de **${e0(T.epargne)}** et un taux d’épargne de **${pc(T.taux_epargne_pct)}**. Dépense moyenne : ${e0(T.depense_moyenne_mensuelle)} / mois pour ${e0(T.revenu_moyen_mensuel)} / mois de revenus.`);
  if (D.periode_precedente) { const q = D.periode_precedente, dd = T.depenses - q.depenses, di = T.revenus - q.revenus; out.push(`Par rapport à la période précédente (${anPeriodLabel(q.du, q.au)}) : dépenses **${dd >= 0 ? '+' : ''}${e0(dd)}**, revenus **${di >= 0 ? '+' : ''}${e0(di)}**, épargne ${T.epargne - q.epargne >= 0 ? '+' : ''}${e0(T.epargne - q.epargne)}.`); }
  if (focus !== 'income') {
    out.push(`## Analyse des dépenses`);
    const top = D.depenses_par_categorie.slice(0, 5);
    out.push(`Les cinq premiers postes représentent **${pc(sum(top.map(c => c.part_pct)))}** des dépenses :`, ...top.map(c => `- **${c.categorie}** : ${e0(c.montant)} (${pc(c.part_pct)}, ${e0(c.moyenne_mensuelle)}/mois)${c.variation_pct != null ? ` — ${c.variation_pct >= 0 ? '▲' : '▼'} ${pc(Math.abs(c.variation_pct))} vs période précédente` : ''}`));
    const R = D.charges_recurrentes;
    out.push(`Les charges récurrentes détectées pèsent environ **${e0(R.total_mensuel_estime)} / mois**${R.part_des_revenus_pct != null ? `, soit ${pc(R.part_des_revenus_pct)} de vos revenus` : ''}${R.postes.length ? ` (principalement : ${R.postes.slice(0, 4).map(p => p.poste).join(', ')})` : ''}. Le reste correspond à des dépenses variables, sur lesquelles se situent vos marges d’action.`);
    const ups = D.depenses_par_categorie.filter(c => c.variation_pct != null && c.variation_pct > 15 && c.montant - c.periode_precedente > 80).sort((a, b) => (b.montant - b.periode_precedente) - (a.montant - a.periode_precedente)).slice(0, 3);
    if (ups.length) out.push(`**Hausses notables :** ` + ups.map(c => `${c.categorie} (+${e0(c.montant - c.periode_precedente)}, +${pc(c.variation_pct)})`).join(' ; ') + '.');
  }
  if (focus !== 'expense') {
    out.push(`## Analyse des revenus`);
    const r = D.revenus_par_categorie;
    out.push(r.length ? r.slice(0, 5).map(c => `- **${c.categorie}** : ${e0(c.montant)} (${pc(c.part_pct)})${c.variation_pct != null ? ` — ${c.variation_pct >= 0 ? '▲' : '▼'} ${pc(Math.abs(c.variation_pct))}` : ''}`).join('\n') : 'Aucun revenu sur la période.');
    const rev = D.par_mois.map(m => m.revenus), mean = sum(rev) / (rev.length || 1), sd = Math.sqrt(sum(rev.map(x => (x - mean) ** 2)) / (rev.length || 1));
    if (rev.length > 2) out.push(mean ? `La régularité des revenus mensuels est ${sd / mean < .25 ? '**bonne**' : '**irrégulière**'} (écart-type ≈ ${pc(sd / mean * 100)} de la moyenne) : ${sd / mean < .25 ? 'ils se prêtent bien à un budget fixe.' : 'prévoyez une réserve pour lisser les mois faibles.'}` : '');
  }
  out.push(`## Points d’attention`);
  const an = D.anomalies_detectees;
  out.push(an.length ? an.map(a => a.type === 'mois_atypique' ? `- **${a.categorie}**, ${monthLabel(a.mois, true)} : ${e0(a.montant)} contre ${e0(a.moyenne_habituelle)} habituellement.` : `- **${a.poste}** (${a.categorie}), ${fdate(a.date)} : opération de ${e0(a.montant)} (médiane de la catégorie : ${e0(a.montant_median_categorie)}).`).join('\n') : 'Aucune anomalie marquante détectée sur la période.');
  if (T.epargne < 0) out.push(`- ⚠️ Les dépenses dépassent les revenus de **${e0(-T.epargne)}** sur la période.`);
  out.push(`## Recommandations`);
  const rec = [];
  if (T.taux_epargne_pct != null && T.taux_epargne_pct < 10) rec.push(`Votre taux d’épargne (${pc(T.taux_epargne_pct)}) est faible : visez 10 à 15 %, soit environ ${e0(Math.max(0, T.revenu_moyen_mensuel * .1 - T.epargne / P.nb_mois))} de plus par mois.`);
  else if (T.taux_epargne_pct != null && T.taux_epargne_pct >= 25) rec.push(`Votre taux d’épargne (${pc(T.taux_epargne_pct)}) est confortable : pensez à affecter l’excédent (livrets, remboursement anticipé, projets).`);
  const variable = D.depenses_par_categorie.filter(c => !/prêt|logement|assurance|impôt|énergie/i.test(c.categorie)).slice(0, 3);
  if (variable.length) rec.push(`Les postes variables les plus lourds sont ${variable.map(c => `${c.categorie} (${e0(c.moyenne_mensuelle)}/mois)`).join(', ')} : un objectif de −10 % libérerait environ ${e0(sum(variable.map(c => c.moyenne_mensuelle)) * .1)} par mois.`);
  if (D.charges_recurrentes.part_des_revenus_pct > 60) rec.push(`Les charges récurrentes absorbent ${pc(D.charges_recurrentes.part_des_revenus_pct)} de vos revenus : renégociez assurances, abonnements et crédits.`);
  if (an.length) rec.push('Vérifiez les opérations signalées ci-dessus (erreur, dépense ponctuelle ou dérive durable ?).');
  rec.push('Définissez un budget mensuel par catégorie (page Prévisions › « Utiliser comme budgets ») pour suivre les dérives.');
  out.push(rec.map(r => '- ' + r).join('\n'));
  out.push(`> Analyse générée localement à partir de règles statistiques simples. Pour une analyse rédigée par un modèle d’IA, configurez un fournisseur dans *Analyse › Paramètres IA*.`);
  return out.join('\n\n');
}

// ---- rendu Markdown minimal (échappement HTML d'abord)
function mdToHtml(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const lines = md.replace(/\r/g, '').split('\n'), out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd(); let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)$/))) { close(); out.push(`<h${Math.max(2, m[1].length)}>${inline(m[2])}</h${Math.max(2, m[1].length)}>`); }
    else if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = l.match(/^>\s?(.*)$/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (!l.trim()) close();
    else { close(); out.push(`<p>${inline(l)}</p>`); }
  }
  close(); return out.join('');
}

function analysisToPdf(entry, D) {
  if (D?.type === 'pluriannuelle') return multiYearPdf(entry, D);
  const T = D?.totaux;
  const blocks = [];
  if (T) {
    blocks.push({ t: 'kpis', items: [
      { label: 'Dépenses', value: eur0(T.depenses), sub: eur0(T.depense_moyenne_mensuelle) + ' / mois', color: '#ef4444' },
      { label: 'Revenus', value: eur0(T.revenus), sub: eur0(T.revenu_moyen_mensuel) + ' / mois', color: '#10b981' },
      { label: 'Épargne', value: eur0(T.epargne), sub: (T.taux_epargne_pct ?? '–') + ' % des revenus', color: '#6366f1' }] });
    blocks.push({ t: 'vbars', height: 150, labels: D.par_mois.map(m => D.par_mois.length > 12 ? m.mois.slice(5) + '/' + m.mois.slice(2, 4) : monthLabel(m.mois)), series: [
      { name: 'Revenus', color: '#10b981', data: D.par_mois.map(m => m.revenus) }, { name: 'Dépenses', color: '#ef4444', data: D.par_mois.map(m => m.depenses) }] });
  }
  blocks.push(...mdToPdfBlocks(entry.text));
  return { title: 'Analyse des dépenses et revenus', file: 'analyse', subtitle: `${entry.meta?.comptes ?? ''} · ${entry.meta?.periode ?? ''} · ${entry.kind === 'ia' ? 'IA ' + (entry.model || entry.provider) : 'analyse locale'}`, blocks };
}

// ============ Page Analyse ============
let anCurrent = null; // { entry, D }
async function pageAnalyse(v) {
  S.an ??= anDefaults();
  const an = S.an, ms = allMonths(), dis = (await (await fetch('/api/ai/settings')).json());
  const hist = (await (await fetch('/api/ai/history')).json()).list;
  v.innerHTML = '';
  if (S.page !== 'analyse') return;
  const set = patch => { Object.assign(an, patch); if (an.from > an.to) [an.from, an.to] = [an.to, an.from]; render(); };
  const msel = key => h('select', { onchange: e => set({ [key]: e.target.value }) }, [...ms].reverse().map(m => h('option', { value: m, selected: m === an[key] }, monthLabel(m, true))));
  const scopeSel = h('select', { onchange: e => set({ scope: e.target.value }) }, h('option', { value: 'courants', selected: an.scope === 'courants' }, '💳 Comptes courants'), h('option', { value: 'tous', selected: an.scope === 'tous' }, '🏦 Tous les comptes'),
    S.data.accounts.map(a => h('option', { value: a.number, selected: an.scope === a.number }, `${accIcon(a.type)} ${accName(a)}`)));
  const focusSel = h('select', { onchange: e => set({ focus: e.target.value }) }, Object.entries(AN_FOCUS).map(([k, l]) => h('option', { value: k, selected: an.focus === k }, l)));
  const multi = an.mode === 'pluri';
  const { D, A, months } = multi ? buildMultiYearData(an.scope) : buildAnalysisData(an);
  const isLocalProv = dis.provider === 'local', isOllama = !!dis.providers[dis.provider]?.localModel;

  v.append(h('div', { class: 'toolbar' }, h('div', { class: 'seg' }, [['periode', '📅 Une période'], ['pluri', '📚 Pluriannuelle (toutes les années)']].map(([k, l]) => h('button', { class: (multi ? 'pluri' : 'periode') === k ? 'on' : '', onclick: () => set({ mode: k }) }, l)))));
  if (multi) { multiYearView(v, an, D, { scopeSel, focusSel }); } else {
  v.append(h('div', { class: 'card' },
    h('div', { class: 'grid g3', style: { gap: '14px' } },
      h('div', { class: 'field' }, h('label', {}, 'Comptes'), scopeSel),
      h('div', { class: 'field' }, h('label', {}, 'Du'), msel('from')), h('div', { class: 'field' }, h('label', {}, 'Au'), msel('to'))),
    h('div', { class: 'toolbar', style: { margin: '14px 0 0' } },
      h('div', { class: 'field', style: { minWidth: '260px' } }, h('label', {}, 'Axe de l’analyse'), focusSel),
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: an.compare, onchange: e => set({ compare: e.target.checked }) }), 'Comparer à la période précédente'),
      h('span', { class: 'badge', style: { marginLeft: 'auto', fontSize: '12.5px' } }, '🧠 ' + (isLocalProv ? 'Analyse locale (aucune IA configurée)' : dis.providers[dis.provider].label + ' · ' + (dis.model || dis.providers[dis.provider].model))))));

  // aperçu chiffré de la période
  const T = D.totaux;
  v.append(h('div', { class: 'grid g4', style: { marginTop: '18px' } },
    kpi('k1', 'Dépenses', eur0(T.depenses), eur0(T.depense_moyenne_mensuelle) + ' / mois', '💸'), kpi('k2', 'Revenus', eur0(T.revenus), eur0(T.revenu_moyen_mensuel) + ' / mois', '💰'),
    kpi('k3', 'Épargne', signed(T.epargne), (T.taux_epargne_pct ?? '–') + ' % des revenus', '🐖'), kpi('k4', 'Période', months.length + ' mois', anPeriodLabel(an.from, an.to), '📅')));
  }

  // actions
  const consent = h('input', { type: 'checkbox', checked: an.consent, onchange: e => { an.consent = e.target.checked; runBtn.disabled = !isLocalProv && !isOllama && !an.consent; } });
  const runBtn = h('button', { class: 'btn', disabled: isLocalProv ? true : (!isOllama && !an.consent), onclick: () => runAiAnalysis(an, D, dis, runBtn) }, '🧠 Lancer l’analyse IA');
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Lancer l’analyse'),
    isLocalProv ? h('div', { class: 'tip warn', style: { marginBottom: '12px' } }, 'Aucun fournisseur d’IA n’est configuré : l’analyse IA est indisponible. ', h('a', { class: 'doclink', href: '#/ai' }, 'Configurer un fournisseur (Anthropic, OpenAI, Ollama…) →'), ' L’analyse locale ci-dessous reste utilisable.') : null,
    !isLocalProv && !isOllama ? h('label', { class: 'schedon', style: { marginBottom: '12px', alignItems: 'flex-start' } }, consent, h('span', {}, 'J’autorise l’envoi des ', h('b', {}, 'données agrégées'), ' de la période (totaux par catégorie et par mois, principaux postes — sans IBAN, ni libellés bancaires détaillés, ni noms de personnes) à ', h('b', {}, dis.providers[dis.provider].label), '. Voir l’aperçu avant envoi.')) : null,
    isOllama ? h('div', { class: 'tip', style: { marginBottom: '12px' } }, '🔒 Modèle local : les données restent sur votre ordinateur.') : null,
    h('div', { class: 'toolbar', style: { margin: 0 } }, runBtn,
      h('button', { class: 'btn sec', onclick: () => previewPrompt(an, D) }, '👁️ Aperçu de ce qui sera envoyé'),
      h('button', { class: 'btn sec', onclick: async () => { const text = localAnalysis(D, an.focus); const r = await (await fetch('/api/ai/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: anTitle('Analyse locale', an, D), text, meta: anMeta(an, D) }) })).json(); anCurrent = { entry: r.analysis, D }; toast('Analyse locale terminée'); render(); } }, '📊 Analyse locale rapide'))));

  // résultat courant
  if (anCurrent) v.append(resultCard(anCurrent.entry, anCurrent.D, false));
  // historique
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `Historique des analyses (${hist.length})`, h('small', {}, 'conservées localement')),
    hist.length ? h('div', { class: 'legend', style: { maxHeight: 'none' } }, hist.map(e => h('div', { class: 'lrow', style: { gridTemplateColumns: '34px 1fr auto auto' }, onclick: () => { anCurrent = { entry: e, D: null }; render(); window.scrollTo(0, 0); } },
      h('div', { class: 'bubble', style: { background: tint(e.kind === 'ia' ? '#8b5cf6' : '#0ea5e9', .18) } }, e.kind === 'ia' ? '🧠' : '📊'),
      h('div', {}, h('div', { class: 'name' }, e.title), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${fmtDT(e.date)} · ${e.kind === 'ia' ? (e.model || e.provider) : 'analyse locale'}`)),
      h('span', { class: 'badge' }, 'Ouvrir'),
      h('button', { class: 'icon-btn', title: 'Supprimer', onclick: async ev => { ev.stopPropagation(); await fetch('/api/ai/history?id=' + e.id, { method: 'DELETE' }); if (anCurrent?.entry.id === e.id) anCurrent = null; render(); } }, '🗑️')))) : h('div', { class: 'empty' }, 'Aucune analyse enregistrée.')));
}
const anTitle = (kind, an, D) => D.type === 'pluriannuelle' ? `${kind} pluriannuelle · ${multiLabel(D)}` : `${kind} · ${anPeriodLabel(an.from, an.to)}`;
const anMeta = (an, D) => D.type === 'pluriannuelle' ? { periode: 'Années ' + multiLabel(D), comptes: anScopeLabel(an.scope), multi: true, focus: an.focus, scopeRaw: an.scope } : metaOf(an);
const metaOf = an => ({ periode: anPeriodLabel(an.from, an.to), comptes: anScopeLabel(an.scope), from: an.from, to: an.to, focus: an.focus });

function resultCard(entry, D, fresh) {
  return h('div', { class: 'card analysis-result', style: { marginTop: '18px' } },
    h('h2', {}, (entry.kind === 'ia' ? '🧠 ' : '📊 ') + entry.title,
      h('span', { style: { display: 'flex', gap: '8px' } },
        h('button', { class: 'btn sm sec', onclick: () => { navigator.clipboard?.writeText(entry.text); toast('Analyse copiée'); } }, '⧉ Copier'),
        h('button', { class: 'btn pdf', onclick: async () => {
          let d = D; if (!d && entry.meta?.multi) d = buildMultiYearData(entry.meta.scopeRaw ?? 'courants').D;
          if (!d && entry.meta?.from) d = buildAnalysisData({ scope: S.data.accounts.some(a => a.number === entry.meta.scopeRaw) ? entry.meta.scopeRaw : (S.an?.scope ?? 'courants'), from: entry.meta.from, to: entry.meta.to, compare: false }).D;
          await generateReport(analysisToPdf(entry, d)); } }, '📄 Exporter en PDF'))),
    h('div', { class: 'muted', style: { margin: '-6px 0 12px', fontSize: '12.5px' } }, `${fmtDT(entry.date)} · ${entry.kind === 'ia' ? 'fournisseur ' + entry.provider + ' · modèle ' + entry.model : 'analyse locale (sans IA)'}${entry.meta?.periode ? ' · ' + entry.meta.periode : ''}`),
    h('div', { class: 'md', html: mdToHtml(entry.text) }));
}

async function previewPrompt(an, D) {
  const pr = await (await fetch('/api/prompts')).json(), { system, user } = fillTemplates(pr.templates, an, D);
  modal('Aperçu de ce qui sera envoyé', [
    h('p', { class: 'muted', style: { margin: 0 } }, 'Voici exactement le contenu transmis au fournisseur d’IA. Les modèles se modifient dans Administration › Prompt.'),
    h('div', { class: 'field' }, h('label', {}, 'Consigne système'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap' } }, system)),
    h('div', { class: 'field' }, h('label', {}, 'Message'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap', maxHeight: '340px' } }, user)),
  ], close => [h('button', { class: 'btn', onclick: close }, 'Fermer')], true);
}
function fillTemplates(t, an, D) {
  const multi = D.type === 'pluriannuelle', per = multi ? `${multiLabel(D)} (${D.periode.nb_annees} année${D.periode.nb_annees > 1 ? 's' : ''})` : anPeriodLabel(an.from, an.to);
  const fill = s => s.replaceAll('{{periode}}', per).replaceAll('{{comptes}}', anScopeLabel(an.scope)).replaceAll('{{focus}}', AN_FOCUS[an.focus]).replaceAll('{{donnees}}', JSON.stringify(D, null, 1));
  return { system: fill(t.system), user: fill(multi ? (t.userMulti || t.user) : t.user) };
}
async function runAiAnalysis(an, D, dis, btn) {
  btn.disabled = true; btn.textContent = '⏳ Analyse en cours…';
  try {
    const pr = await (await fetch('/api/prompts')).json(), { system, user } = fillTemplates(pr.templates, an, D);
    const r = await fetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, user, title: anTitle('Analyse IA', an, D), meta: { ...anMeta(an, D), scopeRaw: an.scope } }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erreur');
    anCurrent = { entry: j.analysis, D }; toast('✅ Analyse terminée'); render();
  } catch (e) { toast('⚠️ ' + e.message); btn.disabled = false; btn.textContent = '🧠 Lancer l’analyse IA'; }
}

// ============ Paramètres IA ============
async function pageAISettings(v) {
  const dis = await (await fetch('/api/ai/settings')).json();
  v.innerHTML = ''; if (S.page !== 'ai') return;
  const d = { provider: dis.provider, model: dis.model, endpoint: dis.endpoint, maxTokens: dis.maxTokens };
  const GROUPS = [['local', '🧮 Sans IA externe'], ['free-local', '💻 Gratuits en local — vos données ne quittent pas votre PC'], ['free-api', '🆓 Offres gratuites en ligne — clé gratuite, quotas limités'], ['paid', '💳 Services payants']];
  const keyIn = h('input', { type: 'password', placeholder: dis.hasKey ? '•••••••• (clé enregistrée — laisser vide pour la conserver)' : 'Collez votre clé API', autocomplete: 'off', style: { width: '100%' } });
  const modelIn = h('input', { type: 'text', value: d.model, oninput: e => { d.model = e.target.value; } });
  const endIn = h('input', { type: 'text', value: d.endpoint, oninput: e => { d.endpoint = e.target.value; }, onchange: () => loadLocal() });
  const cards = h('div'), info = h('div'), statusBox = h('div');
  // ---- état du service local (Ollama / LM Studio) : modèles installés, téléchargement
  const fmtSize = n => n >= 1e9 ? (n / 1e9).toFixed(1).replace('.', ',') + ' Go' : n >= 1e6 ? Math.round(n / 1e6) + ' Mo' : '';
  const loadLocal = async () => {
    const p = dis.providers[d.provider], prov = d.provider;
    statusBox.innerHTML = ''; if (!p?.localModel) return;
    statusBox.append(h('div', { class: 'muted', style: { marginTop: '12px' } }, '⏳ Recherche du service local…'));
    let r; try { r = await (await fetch('/api/ai/models?provider=' + prov + '&endpoint=' + encodeURIComponent(d.endpoint || ''))).json(); } catch { r = { ok: false, error: 'Requête impossible' }; }
    if (S.page !== 'ai' || d.provider !== prov) return;
    statusBox.innerHTML = '';
    const retry = h('button', { class: 'btn sm sec', onclick: loadLocal }, '↻ Actualiser');
    if (!r.ok) { statusBox.append(h('div', { class: 'tip warn', style: { margin: '14px 0 0' } }, h('b', {}, '❌ ' + p.label + ' ne répond pas. '), r.error + ' ', prov === 'ollama' ? 'Démarrez l’application Ollama (ou lancez « ollama serve »), ou corrigez l’adresse du service. ' : 'Démarrez le serveur local de LM Studio. ', h('a', { class: 'doclink', href: p.keyUrl, target: '_blank', rel: 'noopener' }, 'Télécharger →'), h('div', { style: { marginTop: '8px' } }, retry))); return; }
    const inst = r.models, names = inst.map(m => m.name);
    const chipsOf = list => h('span', { class: 'chips', style: { display: 'inline-flex', marginLeft: '6px' } }, list.map(m => h('span', { class: 'chip model' + (d.model === m.name ? ' on' : ''), title: 'Utiliser ce modèle', onclick: () => { d.model = m.name; modelIn.value = m.name; loadLocal(); } }, m.name + (m.size ? ' · ' + fmtSize(m.size) : ''))));
    const box = h('div', { class: 'tip' + (inst.length ? '' : ' warn'), style: { margin: '14px 0 0' } },
      h('b', {}, '✅ ' + p.label + ' détecté' + (r.version ? ' (v' + r.version + ')' : '') + ' — '), inst.length + ' modèle(s) installé(s)', ' ', retry,
      inst.length ? h('div', { style: { marginTop: '8px' } }, 'Cliquez pour utiliser un modèle installé :', chipsOf(inst)) : h('div', { style: { marginTop: '6px' } }, 'Aucun modèle installé : ' + (prov === 'ollama' ? 'téléchargez-en un ci-dessous pour pouvoir lancer une analyse.' : 'chargez un modèle dans LM Studio.')));
    statusBox.append(box);
    const wanted = d.model || p.model;
    if (inst.length && !names.some(n => n === wanted || n.startsWith(wanted + ':'))) statusBox.append(h('div', { class: 'tip warn', style: { margin: '10px 0 0' } }, `Le modèle configuré « ${wanted} » n’est pas installé. `, h('button', { class: 'btn sm', onclick: () => { d.model = names[0]; modelIn.value = names[0]; loadLocal(); } }, 'Utiliser « ' + names[0] + ' »')));
    if (prov === 'ollama') {
      const todo = p.models.filter(m => !names.includes(m));
      const progress = h('div', { style: { marginTop: '10px' } });
      const custom = h('input', { type: 'text', placeholder: 'autre modèle, ex. phi3:mini', style: { width: '210px' } });
      const pull = async name => {
        if (!confirm('Télécharger le modèle « ' + name + ' » depuis le catalogue Ollama ?\n\nLe téléchargement peut représenter plusieurs Go.')) return;
        const bar = h('div', { class: 'progress', style: { '--c': 'var(--primary)' } }, h('i', { style: { width: '3%' } })), label = h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '4px' } }, 'Démarrage…');
        progress.innerHTML = ''; progress.append(h('b', {}, '⬇ ' + name), bar, label);
        try { const r0 = await (await fetch('/api/ai/ollama/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name, endpoint: d.endpoint || '' }) })).json(); if (r0.error) throw new Error(r0.error); } catch (e) { label.textContent = '⚠️ ' + e.message; return; }
        for (;;) {
          await new Promise(r => setTimeout(r, 1000)); if (S.page !== 'ai') return;
          const st = await (await fetch('/api/ai/ollama/pull?model=' + encodeURIComponent(name))).json();
          const pct = st.total ? Math.round(st.completed / st.total * 100) : 0;
          bar.firstChild.style.width = Math.max(3, pct) + '%'; label.textContent = st.error ? '⚠️ ' + st.error : st.done ? '✅ Modèle téléchargé' : `${st.status}${st.total ? ' — ' + pct + ' % (' + fmtSize(st.completed) + ' / ' + fmtSize(st.total) + ')' : ''}`;
          if (st.error) return;
          if (st.done) { d.model = name; modelIn.value = name; toast('✅ Modèle « ' + name + ' » installé'); loadLocal(); return; }
        }
      };
      statusBox.append(h('div', { class: 'tip', style: { margin: '10px 0 0' } }, h('b', {}, '⬇ Télécharger un modèle'), ' (gratuit, depuis le catalogue Ollama) :',
        h('div', { style: { marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' } }, todo.map(m => h('button', { class: 'btn sm sec', onclick: () => pull(m) }, '⬇ ' + m)),
          custom, h('button', { class: 'btn sm sec', onclick: () => custom.value.trim() && pull(custom.value.trim()) }, 'Télécharger')),
        h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, 'Conseil : llama3.2:3b (≈ 2 Go) convient aux petites machines ; llama3.1:8b (≈ 5 Go) donne de meilleurs résultats avec 8 Go de mémoire ou plus.'), progress));
    }
  };
  const keyRow = h('div', { class: 'field' }, h('label', {}, 'Clé API'), keyIn,
    dis.hasKey ? h('button', { class: 'btn sm sec', style: { marginTop: '8px' }, onclick: async () => { await fetch('/api/ai/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: '__clear__' }) }); toast('Clé supprimée'); render(); } }, 'Supprimer la clé enregistrée') : null);
  const advRow = h('div', { class: 'grid g3', style: { gap: '14px' } }, h('div', { class: 'field' }, h('label', {}, 'Modèle'), modelIn), h('div', { class: 'field' }, h('label', {}, 'Adresse du service (facultatif)'), endIn),
    h('div', { class: 'field' }, h('label', {}, 'Longueur max. de réponse (tokens)'), h('input', { type: 'number', min: 300, max: 8000, value: d.maxTokens, oninput: e => { d.maxTokens = +e.target.value; } })));
  const refresh = () => {
    const p = dis.providers[d.provider];
    cards.innerHTML = '';
    for (const [gk, gl] of GROUPS) {
      const list = Object.entries(dis.providers).filter(([, x]) => x.group === gk); if (!list.length) continue;
      cards.append(h('h4', { class: 'aigroup' }, gl), h('div', { class: 'grid g2' }, list.map(([k, x]) => h('label', { class: 'schedon', style: { cursor: 'pointer', alignItems: 'flex-start', borderColor: d.provider === k ? 'var(--primary)' : '', background: d.provider === k ? 'color-mix(in srgb, var(--primary) 8%, var(--card))' : '' } },
        h('input', { type: 'radio', name: 'prov', checked: d.provider === k, onchange: () => { d.provider = k; d.model = ''; d.endpoint = ''; modelIn.value = ''; endIn.value = ''; modelIn.placeholder = x.model || ''; endIn.placeholder = x.endpoint || ''; refresh(); } }),
        h('div', {}, h('b', {}, x.label, x.group.startsWith('free') ? h('span', { class: 'badge', style: { marginLeft: '8px', color: 'var(--good)' } }, 'gratuit') : null), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, x.note))))));
    }
    info.innerHTML = '';
    if (p && d.provider !== 'local') {
      info.append(h('div', { class: 'tip', style: { margin: '16px 0 0' } },
        h('b', {}, p.label), ' — ', p.note, ' ', p.keyUrl ? h('a', { class: 'doclink', href: p.keyUrl, target: '_blank', rel: 'noopener' }, p.protocol === 'ollama' || p.keyOptional ? 'Télécharger →' : 'Obtenir une clé →') : null,
        p.models?.length ? h('div', { style: { marginTop: '8px' } }, 'Modèles conseillés (cliquez pour choisir) : ', h('span', { class: 'chips', style: { display: 'inline-flex', marginLeft: '6px' } }, p.models.map(m => h('span', { class: 'chip model', onclick: () => { d.model = m; modelIn.value = m; } }, m)))) : null),
        p.group === 'free-api' ? h('div', { class: 'tip warn', style: { margin: '10px 0 0' } }, 'Offres gratuites : quotas, modèles et conditions peuvent changer ; vérifiez-les sur le site du fournisseur. Le fournisseur peut utiliser les données reçues pour améliorer ses services : pour une confidentialité maximale, préférez un modèle local (Ollama, LM Studio).') : null);
    }
    loadLocal();
    keyRow.style.display = p && p.group !== 'local' && p.protocol !== 'ollama' ? '' : 'none';
    keyRow.querySelector('label').textContent = p?.keyOptional ? 'Clé API (facultative)' : 'Clé API';
    advRow.style.display = d.provider === 'local' ? 'none' : '';
  };
  modelIn.placeholder = dis.providers[d.provider]?.model || ''; endIn.placeholder = dis.providers[d.provider]?.endpoint || '';
  refresh();
  const save = async () => { const body = { ...d }; if (keyIn.value.trim()) body.apiKey = keyIn.value.trim(); const r = await fetch('/api/ai/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error('échec'); keyIn.value = ''; };
  v.append(h('div', { class: 'card' }, h('h2', {}, '🧠 Fournisseur d’intelligence artificielle', h('small', {}, Object.keys(dis.providers).length - 1 + ' fournisseurs')), cards, info, statusBox,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' } }, keyRow, advRow),
    h('div', { class: 'toolbar', style: { margin: '16px 0 0' } },
      h('button', { class: 'btn', onclick: async () => { try { await save(); toast('✅ Paramètres enregistrés'); render(); } catch { toast('⚠️ Enregistrement impossible'); } } }, 'Enregistrer'),
      h('button', { class: 'btn sec', onclick: async () => { try { await save(); const r = await fetch('/api/ai/test', { method: 'POST' }); const j = await r.json(); toast(r.ok ? `✅ Connexion OK (${j.model})` : '⚠️ ' + j.error); } catch (e) { toast('⚠️ ' + e.message); } } }, '🔌 Tester la connexion'))));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '🔒 Confidentialité'),
    h('ul', { style: { margin: 0, paddingLeft: '20px', lineHeight: 1.7 } },
      h('li', {}, 'Seules des ', h('b', {}, 'données agrégées'), ' sont transmises (totaux par catégorie et par mois, principaux postes de dépense, anomalies). Les virements vers des particuliers sont anonymisés ; aucun IBAN ni libellé bancaire détaillé n’est envoyé.'),
      h('li', {}, 'Vous validez l’envoi à chaque analyse et pouvez voir le contenu exact avec « Aperçu de ce qui sera envoyé ».'),
      h('li', {}, 'La clé API est stockée sur votre ordinateur dans ', h('code', {}, 'data/secrets.json'), ', ', h('b', {}, 'hors des sauvegardes'), '.'),
      h('li', {}, 'Chaque prompt envoyé est tracé dans Administration › Prompt › Journal.'),
      h('li', {}, 'Avec Ollama ou LM Studio, rien ne quitte votre ordinateur.'))));
}
