'use strict';
// ============ Immobilier › Analyse IA du projet VEFA ============
const IMAI_FOCUS = {
  global: 'analyse globale (faisabilité, risques, recommandations)',
  relais: 'prêt relais (nécessité, montant, durée, coût, alternatives)',
  risques: 'risques et scénarios défavorables (retard de vente, retard de chantier, hausse des taux)',
  plan: 'plan d’actions et calendrier des démarches',
};
const IMAI_SYSTEM = 'Tu es un conseiller en financement immobilier expérimenté, spécialisé dans les acquisitions en VEFA (vente en l’état futur d’achèvement) avec appels de fonds échelonnés et prêt relais. Tu réponds TOUJOURS et UNIQUEMENT en français (titres, listes, explications et conclusion), même si les données ou la question te semblent dans une autre langue ; aucun mot ou phrase en anglais, sauf sigles usuels. Tu rédiges avec rigueur et pédagogie, uniquement à partir des données fournies : n’invente aucun chiffre. Tu n’es pas un conseiller agréé : rappelle brièvement que ton analyse ne remplace ni l’offre de prêt ni l’avis de la banque ou d’un professionnel.';
const IMAI_USER = [
  'IMPORTANT : rédige toute ta réponse en français.',
  '',
  'Voici les données chiffrées d’un projet d’acquisition en VEFA et le résultat de sa simulation (JSON). Axe demandé : {{focus}}.',
  '',
  'Rédige une analyse structurée en Markdown avec :',
  '1. **Synthèse** (3 à 5 lignes : le projet est-il finançable dans les délais ?)',
  '2. **Points forts**',
  '3. **Points de vigilance et risques** (chiffrés quand c’est possible : manques de fonds, entame de la réserve, relais non soldé, coût des intérêts)',
  '4. **Prêt relais** : est-il nécessaire, quel montant maximum, quand le demander, comment le rembourser, coût total',
  '5. **Recommandations concrètes** (ordre de priorité) et **questions à poser à la banque / au promoteur**',
  '6. **Scénarios de test** à simuler (par exemple vente décalée de 3 ou 6 mois, épargne mensuelle différente)',
  '',
  'Reste factuel et concis ; mets les montants en euros.',
  '',
  'Données :',
  '{{donnees}}',
  '',
  'RAPPEL : réponds maintenant en FRANÇAIS uniquement, en suivant le plan numéroté ci-dessus (ne décris pas le format JSON, analyse le projet).',
].join('\n');

let imaiCurrent = null, imaiConsent = false, imaiFocus = 'global';

/** Données agrégées envoyées à l'IA : aucun nom, adresse ni numéro de compte. */
function immoAiData(P, sim) {
  const s = sim.summary, v = verdict(sim, P), E = P.epargne, R = P.relais;
  const lines = immoPlanLines(sim, P, false).map(({ r, prevCash, contrib, avail }) => ({
    date: r.date, echeance: r.label, type: r.type, montant: Math.round(r.amount || 0), epargne_mensuelle_ajoutee: Math.round(contrib),
    epargne_avant: Math.round(r.before.cash), epargne_utilisee: Math.round(r.usedCash || 0), prets_debloques: Math.round(sum((r.usedLoans || []).map(l => l.amount))),
    relais_debloque: Math.round(r.usedRelais || 0), manque: Math.round(r.short || 0), epargne_apres: Math.round(r.cash), relais_du: Math.round(r.relais), en_retard: !!r.late,
  }));
  return {
    type: 'projet VEFA', date_reference: P.dateReference, prix: P.prix, signature: P.dateSignature, debut_chantier: P.dateDebutChantier, livraison: P.dateLivraison,
    cout_total_projet: Math.round(s.totalProjet), frais: P.frais.map(f => ({ libelle: f.label, montant: +f.montant || 0, date: f.date, paye: !!f.paye })),
    appels_de_fonds: [...P.appels].sort((a, b) => a.date.localeCompare(b.date)).map(a => ({ etape: a.label, date: a.date, pct: +a.pct, montant: Math.round(P.prix * (+a.pct || 0) / 100), statut: a.statut })),
    epargne: { sources: E.sources.map(x => ({ libelle: x.label, montant: +x.montant || 0, rendement_pct: +x.rendementPct || 0 })), mensuelle: +E.contributionMensuelle || 0, de: E.dateDebutContribution || null, jusqu_au: E.dateFinContribution || P.dateLivraison, reserve_securite: +E.reserve || 0 },
    financements: P.financements.map(l => ({ type: l.type, libelle: l.label, montant: +l.montant || 0, taux_pct: +l.tauxPct || 0, duree_mois: +l.dureeMois || 0, disponible_le: l.dateDispo, mensualite_estimee: Math.round((s.pays.find(p => p.label === l.label) ?? {}).mensualite || 0) })),
    ordre_utilisation: P.ordre === 'apport' ? 'apport (épargne) d’abord' : 'prêts d’abord', interets_intercalaires: !!P.intercalaires,
    pret_relais: R?.actif ? { montant_plafond: +R.montant || 0, taux_pct: +R.tauxPct || 0, duree_mois: +R.dureeMois || 0, debut: R.dateDebut, fin: s.relaisFin, deblocage: R.deblocage, interets: R.interets, frais_dossier: +R.fraisDossier || 0 } : null,
    bien_actuel: { valeur: +P.bienActuel?.valeur || 0, capital_restant_du: +P.bienActuel?.capitalRestantDu || 0, frais_vente_pct: +P.bienActuel?.fraisVentePct || 0 },
    fonds_supplementaires: P.fondsSupp.map(x => ({ libelle: x.label, type: x.type, montant: +x.montant || 0, date: x.date, rembourse_le_relais: !!x.rembourseRelais, statut: x.statut })),
    simulation: { verdict: v.title, detail: v.text, relais_necessaire: s.relaisUtilise, relais_max: s.relaisMax, premier_deblocage: s.relaisPremierDeblocage, relais_rembourse_le: s.relaisRembourse, manque_total: s.manque, reserve_entamee: s.reserveEntamee,
      interets_intercalaires_total: s.coutInterc, cout_relais_total: s.coutRelais, epargne_fin_projet: s.cashFin, prets_tires: s.pretsTires, deja_paye: s.appelsDejaPayes, alertes: sim.alerts.map(a => a.text) },
    planning: lines,
  };
}
const immoAiFill = (t, focus, D) => t.replaceAll('{{focus}}', IMAI_FOCUS[focus]).replaceAll('{{donnees}}', JSON.stringify(D));

/** Analyse sans IA : lecture automatique de la simulation. */
function immoLocalAnalysis(P, sim, focus) {
  const s = sim.summary, v = verdict(sim, P), out = [];
  out.push('## Synthèse', `**${v.title}.** ${v.text}`, `Coût total du projet : **${eur0(s.totalProjet)}** (prix ${eur0(s.prix)} + frais ${eur0(s.fraisTotal)}), livraison le ${fdate(P.dateLivraison)}.`);
  out.push('## Ressources mobilisées', `- Épargne de départ : ${eur0(s.epargneInitiale)}, plus ${eur0(s.epargneContrib)} d’épargne mensuelle dédiée (${eur0(+P.epargne.contributionMensuelle || 0)} / mois).`, `- Prêts externes tirés : ${eur0(s.pretsTires)} · opérations de fonds : ${eur0(s.fondsSupp)}.`, `- Épargne restante en fin de simulation : ${eur0(s.cashFin)} (réserve de sécurité : ${eur0(+P.epargne.reserve || 0)}).`);
  if (focus !== 'plan') {
    out.push('## Prêt relais');
    if (s.relaisUtilise) out.push(`- Nécessaire : jusqu’à **${eur0(s.relaisMax)}**, premier déblocage le ${fdate(s.relaisPremierDeblocage)}${s.relaisRembourse ? `, soldé le ${fdate(s.relaisRembourse)} par la vente` : ' — **non soldé dans la simulation**'}.`, `- Coût estimé : ${eur0(s.coutRelais)} d’intérêts + ${eur0(s.fraisRelais)} de frais de dossier.`);
    else out.push('- Non nécessaire d’après la simulation' + (P.relais?.actif ? ' ; il reste disponible en secours.' : '.'));
  }
  out.push('## Points de vigilance', ...(sim.alerts.length ? sim.alerts.map(a => `- ${a.level === 'bad' ? '⛔' : '⚠️'} ${a.text}`) : ['- Aucune alerte : toutes les échéances sont couvertes.']));
  if (s.coutInterc > 0) out.push(`- Intérêts intercalaires estimés : ${eur0(s.coutInterc)}.`);
  const next = P.appels.filter(a => a.statut !== 'paye').sort((a, b) => a.date.localeCompare(b.date))[0];
  out.push('## Recommandations', ...(s.manque > 0.5 ? ['- Combler le manque : augmenter l’épargne mensuelle, avancer une opération de fonds, ou augmenter le plafond du relais / un prêt.'] : []),
    ...(s.relaisUtilise ? ['- Sécuriser l’offre de prêt relais au moins 3 mois avant son premier déblocage et vérifier sa durée face à la date de vente.', '- Tester une vente décalée de 3 à 6 mois dans « Planning et simulation » pour mesurer la marge.'] : []),
    ...(next ? [`- Prochain appel de fonds : « ${next.label} » le ${fdate(next.date)} (${eur0(P.prix * (+next.pct || 0) / 100)}).`] : []), '- Mettre à jour le suivi dès qu’un appel est payé pour recaler la simulation.');
  return out.join('\n');
}

function immoAiPdf(entry, P) {
  const blocks = [];
  if (P) {
    const s = immoSimulate(P).summary;
    blocks.push({ t: 'kpis', items: [{ label: 'Coût du projet', value: eur0(s.totalProjet), sub: `prix ${eur0(s.prix)} + frais ${eur0(s.fraisTotal)}`, color: '#6366f1' }, { label: 'Prêt relais', value: s.relaisUtilise ? 'Nécessaire' : 'Non nécessaire', sub: s.relaisUtilise ? 'max ' + eur0(s.relaisMax) : '', color: s.relaisUtilise ? '#f59e0b' : '#10b981' }, { label: 'Manque de fonds', value: eur0(s.manque), color: s.manque > 0.5 ? '#ef4444' : '#10b981' }] });
  }
  blocks.push(...mdToPdfBlocks(entry.text));
  return { title: 'Analyse du projet VEFA', file: 'analyse-vefa', subtitle: `${entry.meta?.focus ?? ''} · ${entry.kind === 'ia' ? 'IA ' + (entry.model || entry.provider) : 'analyse locale'} · ${fmtDT(entry.date)}`, blocks };
}

/** Découpe le texte de l'analyse en sections colorées (synthèse, points forts, vigilance, relais, recommandations…). */
function aiParse(text) {
  const KINDS = [[/synth/i, 'synth', '#6366f1', '🎯'], [/point[s]? fort|atout|positif/i, 'good', '#10b981', '💪'], [/vigilance|risque|alerte|attention|faiblesse/i, 'vigil', '#f59e0b', '⚠️'], [/relais/i, 'relais', '#f97316', '🌉'], [/recommand|question|conseil|action/i, 'reco', '#0ea5e9', '💡'], [/sc[ée]nario|simul|test/i, 'scen', '#8b5cf6', '🧪']];
  const strip = x => String(x).replace(/\*\*|__|`/g, '').trim(), secs = []; let cur = null;
  const start = t => { const title = strip(t).replace(/^\d+[.)]\s*/, ''), k = KINDS.find(([re]) => re.test(title)); cur = { title, kind: k?.[1] ?? 'autre', color: k?.[2] ?? '#64748b', ico: k?.[3] ?? '📌', raw: [], items: [] }; secs.push(cur); };
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const l = raw.trim(); let m;
    if ((m = l.match(/^#{1,4}\s+(.*)$/)) || (m = l.match(/^\*\*(.{3,90}?)\*\*\s*:?$/)) || (m = l.match(/^\d+[.)]\s+\*\*(.{3,90}?)\*\*\s*:?$/))) { start(m[1]); continue; }
    if (!l) { cur?.raw.push(''); continue; }
    if (!cur) start('Analyse');
    cur.raw.push(raw);
    const b = l.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/), body = b ? b[1] : l;
    if (cur.kind === 'vigil') { const bad = /⛔|critique|insuffisan|manque|déficit|négati|non soldé|impossible/i.test(body), t = body.match(/^\*\*(.+?)\*\*\s*[:\-–]?\s*(.*)$/); cur.items.push({ level: bad ? 'bad' : 'warn', title: t && t[2] ? strip(t[1]) : '', text: strip(t && t[2] ? t[2] : body) }); }
  }
  return secs.filter(s => s.raw.some(x => x.trim()));
}

async function pageImmoAI(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const [P, dis, hist] = await Promise.all([immoLoad(), apiFetch('/api/ai/settings').then(r => r.json()), apiFetch('/api/ai/history').then(r => r.json())]);
  v.innerHTML = ''; if (S.page !== 'immo-ai') return;
  const sim = immoSimulate(P), D = immoAiData(P, sim), s = sim.summary, H = immoHealth(sim, P), isLocalProv = dis.provider === 'local', isOllama = !!dis.providers[dis.provider]?.localModel, provLabel = dis.providers[dis.provider].label;
  const mine = hist.list.filter(e => e.meta?.immo);
  v.append(immoHeader(P), verdictCard(sim, P));
  v.append(h('div', { class: 'grid g4', style: { marginTop: '14px' } },
    kpi('k3', 'Coût total', eur0(s.totalProjet + s.coutInterc + s.coutRelais + s.fraisRelais), `dont crédit : ${eur0(s.coutInterc + s.coutRelais + s.fraisRelais)}`, '🏗️'), kpi('k4', 'Prêts débloqués', eur0(s.pretsTires), s.pays.map(p => eur0(p.mensualite) + '/mois').join(' + ') || '–', '🏦'),
    kpi(s.relaisUtilise ? 'k1' : 'k2', 'Prêt relais', s.relaisUtilise ? eur0(s.relaisMax) : 'Non utilisé', s.relaisUtilise ? `1er déblocage ${fdate(s.relaisPremierDeblocage)}` : 'aucun déblocage prévu', '🌉'), kpi('k2', 'Épargne finale', eur0(s.cashFin), `intérêts crédités : ${eur0(s.interetsEpargne || 0)}`, '🐖')));

  // -- tableau de bord : santé, origine des fonds, marge après chaque échéance
  v.append(h('div', { class: 'grid g3', style: { marginTop: '14px' } },
    vcard(H.color, '🩺 Santé du financement', H.label, h('div', { class: 'chart-box', style: { height: '150px' } }, h('canvas', { id: 'aiG' })), h('div', { class: 'health' }, H.factors.map(f => h('div', { class: 'hf ' + f.k }, (f.k === 'ok' ? '✅ ' : f.k === 'warn' ? '⚠️ ' : '⛔ ') + f.t)))),
    vcard(IMC.indigo, '💶 Origine des fonds', null, h('div', { class: 'chart-box mid' }, h('canvas', { id: 'aiO' }))),
    vcard(IMC.green, '📊 Épargne après chaque échéance', 'hors réserve', h('div', { class: 'chart-box mid' }, h('canvas', { id: 'aiM' })))));
  vGauge($('#aiG'), H.score, H.color, '/ 100');
  const origin = [['Épargne de départ', s.epargneInitiale, IMC.green], ['Épargne mensuelle', s.epargneContrib, IMC.teal], ['Intérêts d’épargne', s.interetsEpargne || 0, '#84cc16'], ['Prêts', s.pretsTires, IMC.indigo], ['Prêt relais', s.relaisTotalTire, IMC.amber], ['Fonds supplémentaires', s.fondsSupp, IMC.blue], ['Manque', s.manque, IMC.red]].filter(x => x[1] > 0.5);
  vDonut($('#aiO'), origin.map(x => x[0]), origin.map(x => Math.round(x[1])), origin.map(x => x[2]), [eur0(sum(origin.map(x => x[1]))), 'mobilisés'], { cutout: '62%', fmt: eur0 });
  const fr = sim.rows.filter(r => ['appel', 'frais'].includes(r.type)), reserve = +P.epargne.reserve || 0;
  chart($('#aiM'), { type: 'bar', data: { labels: fr.map(r => mlab(r.date)), datasets: [{ label: 'Épargne après échéance', data: fr.map(r => Math.round(r.cash - reserve)), backgroundColor: fr.map(r => r.short ? IMC.red : r.cash - reserve < 0 ? IMC.amber : IMC.green), borderRadius: 5 }] },
    options: { scales: { y: { ticks: { callback: eurTick } }, x: { grid: { display: false }, ticks: { maxRotation: 55 } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => fr[i[0].dataIndex].label, label: c => ' ' + eur0(c.parsed.y) + (fr[c.dataIndex].short ? ' · manque ' + eur0(fr[c.dataIndex].short) : '') } } } } });

  // -- points de vigilance de la simulation + lancement de l'analyse
  const alerts = vcard(sim.alerts.some(a => a.level === 'bad') ? IMC.red : sim.alerts.length ? IMC.amber : IMC.green, '🚨 Points de vigilance (simulation)', sim.alerts.length ? sim.alerts.length + ' point(s)' : null,
    sim.alerts.length ? sim.alerts.map(a => h('div', { class: 'alrow ' + (a.level === 'bad' ? 'bad' : 'warn') }, h('span', { class: 'ai' }, a.level === 'bad' ? '⛔' : '⚠️'), h('div', {}, a.date ? h('b', {}, fdate(a.date) + ' · ') : null, a.text))) : h('div', { class: 'alrow good' }, h('span', { class: 'ai' }, '✅'), h('div', {}, 'Aucune alerte : toutes les échéances sont couvertes et la réserve est préservée.')));
  const focusSel = h('select', { onchange: e => { imaiFocus = e.target.value; } }, Object.entries(IMAI_FOCUS).map(([k, l]) => h('option', { value: k, selected: imaiFocus === k }, l)));
  const consent = h('input', { type: 'checkbox', checked: imaiConsent, onchange: e => { imaiConsent = e.target.checked; runBtn.disabled = !isLocalProv && !isOllama && !imaiConsent; } });
  const meta = () => ({ immo: true, focus: IMAI_FOCUS[imaiFocus], periode: `${fdate(P.dateReference)} → ${fdate(sim.summary.endDate)}`, comptes: 'Projet VEFA' });
  const saveLocal = async () => {
    const r = await (await apiFetch('/api/ai/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Analyse locale · projet VEFA', text: immoLocalAnalysis(P, sim, imaiFocus), meta: meta() }) })).json();
    imaiCurrent = r.analysis; toast('Analyse locale terminée'); render();
  };
  const run = async () => {
    runBtn.disabled = true; runBtn.textContent = '⏳ Analyse en cours… (peut durer plusieurs minutes avec un modèle local)';
    try {
      const j = await (await apiFetch('/api/ai/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: IMAI_SYSTEM, user: immoAiFill(IMAI_USER, imaiFocus, D), title: 'Analyse IA · projet VEFA', meta: meta() }) })).json();
      if (j.error) throw new Error(j.error); imaiCurrent = j.analysis; toast('✅ Analyse terminée'); render();
    } catch (e) { toast('⚠️ ' + e.message); runBtn.disabled = false; runBtn.textContent = '🧠 Lancer l’analyse IA'; }
  };
  const runBtn = h('button', { class: 'btn', disabled: isLocalProv ? true : (!isOllama && !imaiConsent), onclick: run }, '🧠 Lancer l’analyse IA');
  const preview = () => modal('Aperçu de ce qui sera envoyé', [
    h('p', { class: 'muted', style: { margin: 0 } }, 'Contenu exact transmis au fournisseur d’IA : chiffres du projet uniquement, sans nom, adresse ni numéro de compte.'),
    h('div', { class: 'field' }, h('label', {}, 'Consigne système'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap' } }, IMAI_SYSTEM)),
    h('div', { class: 'field' }, h('label', {}, 'Message'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap', maxHeight: '340px' } }, immoAiFill(IMAI_USER, imaiFocus, D)))], close => [h('button', { class: 'btn', onclick: close }, 'Fermer')], true);
  const launcher = vcard(IMC.violet, '🧠 Lancer l’analyse', isLocalProv ? 'analyse locale' : provLabel + ' · ' + (dis.model || dis.providers[dis.provider].model),
    h('p', { class: 'muted', style: { margin: '0 0 10px', fontSize: '12.5px' } }, 'L’IA lit les chiffres du projet et de la simulation, puis évalue faisabilité, risques et actions.'),
    h('div', { class: 'field', style: { marginBottom: '10px' } }, h('label', {}, 'Axe de l’analyse'), focusSel),
    isLocalProv ? h('div', { class: 'tip warn', style: { marginBottom: '10px' } }, 'Aucun fournisseur d’IA n’est configuré. ', h('a', { class: 'doclink', href: '#/ai' }, 'Configurer un fournisseur →'), ' L’analyse locale reste utilisable.') : null,
    !isLocalProv && !isOllama ? h('label', { class: 'schedon', style: { marginBottom: '10px', alignItems: 'flex-start' } }, consent, h('span', {}, 'J’autorise l’envoi des ', h('b', {}, 'données chiffrées du projet'), ' (sans nom, adresse ni compte) à ', h('b', {}, provLabel), '.')) : null,
    isOllama ? h('div', { class: 'tip', style: { marginBottom: '10px' } }, '🔒 Modèle local : les données restent sur votre ordinateur.') : null,
    h('div', { class: 'toolbar', style: { margin: 0 } }, runBtn, h('button', { class: 'btn sec', onclick: preview }, '👁️ Aperçu'), h('button', { class: 'btn sec', onclick: saveLocal }, '📊 Analyse locale rapide')));
  v.append(h('div', { class: 'pair' }, alerts, launcher));

  // -- résultat : bandeau + sections colorées
  if (imaiCurrent) {
    const e = imaiCurrent, secs = aiParse(e.text);
    v.append(h('div', { class: 'aihero' }, h('div', { style: { fontSize: '30px' } }, e.kind === 'ia' ? '🧠' : '📊'), h('div', { style: { flex: 1, minWidth: '220px' } }, h('h2', {}, e.title), h('div', { class: 'sub' }, `${fmtDT(e.date)} · ${e.kind === 'ia' ? 'fournisseur ' + e.provider + ' · modèle ' + e.model : 'analyse locale (sans IA)'}${e.meta?.focus ? ' · ' + e.meta.focus : ''}`)),
      h('button', { class: 'btn sm sec', onclick: () => { navigator.clipboard?.writeText(e.text); toast('Analyse copiée'); } }, '⧉ Copier'), h('button', { class: 'btn pdf', onclick: () => generateReport(immoAiPdf(e, P)) }, '📄 Exporter en PDF')));
    v.append(h('div', { class: 'aigrid' }, secs.map(sec => h('div', { class: 'aisec' + (sec.kind === 'synth' || sec.kind === 'vigil' || sec.items.length > 4 ? ' wide' : ''), style: { '--ac': sec.color } }, h('h3', {}, sec.ico + ' ' + sec.title),
      sec.kind === 'vigil' && sec.items.length ? sec.items.map(it => h('div', { class: 'alrow ' + it.level }, h('span', { class: 'ai' }, it.level === 'bad' ? '⛔' : '⚠️'), h('div', {}, it.title ? h('b', {}, it.title + ' — ') : null, it.text))) : h('div', { class: 'md', html: mdToHtml(sec.raw.join('\n')) })))));
  }

  // -- historique
  v.append(vcard(IMC.slate, `🕘 Historique des analyses du projet (${mine.length})`, 'conservées localement',
    mine.length ? h('div', { class: 'legend', style: { maxHeight: 'none' } }, mine.map(e => h('div', { class: 'lrow', style: { gridTemplateColumns: '34px 1fr auto auto' }, onclick: () => { imaiCurrent = e; render(); window.scrollTo(0, 0); } },
      h('div', { class: 'bubble', style: { background: tint(e.kind === 'ia' ? '#8b5cf6' : '#0ea5e9', .18) } }, e.kind === 'ia' ? '🧠' : '📊'),
      h('div', {}, h('div', { class: 'name' }, e.title), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${fmtDT(e.date)} · ${e.kind === 'ia' ? (e.model || e.provider) : 'analyse locale'}${e.meta?.focus ? ' · ' + e.meta.focus : ''}`)), pill(e.kind === 'ia' ? 'IA' : 'locale', e.kind === 'ia' ? IMC.violet : IMC.blue),
      h('button', { class: 'btn sm sec', title: 'Supprimer', onclick: async ev => { ev.stopPropagation(); if (!confirm('Supprimer cette analyse ?')) return; await apiFetch('/api/ai/history?id=' + e.id, { method: 'DELETE' }); if (imaiCurrent?.id === e.id) imaiCurrent = null; render(); } }, '🗑')))) : h('div', { class: 'muted' }, 'Aucune analyse pour le moment.')));
}
