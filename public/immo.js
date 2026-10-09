'use strict';
// ============ Immobilier : acquisition en VEFA (projet, planning, suivi, plan d'actions) ============
const ST_APPEL = { prevu: 'Prévu', appele: 'Appelé', paye: 'Payé' };
const ST_ACTION = { afaire: 'À faire', encours: 'En cours', fait: 'Fait' };
const FONDS_TYPES = { vente: 'Vente d’un bien', don: 'Don / aide familiale', prime: 'Prime / bonus', heritage: 'Héritage', remboursement: 'Remboursement (impôts…)', autre: 'Autre' };
const FIN_TYPES = { principal: 'Prêt principal', ptz: 'Prêt à taux zéro', employeur: 'Prêt employeur / 1 % logement', autre: 'Autre prêt' };
const MOISC = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const mlab = d => { const x = pdate(d); return `${MOISC[x.getMonth()]} ${String(x.getFullYear()).slice(2)}`; };
const pc1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',') + ' %';

let IM = null; // projet courant (chargé du serveur)
async function immoLoad() {
  if (IM) return IM;
  const j = await (await fetch('/api/immo')).json();
  IM = j.project ?? immoDefault(); return IM;
}
async function immoSave() {
  IM.exemple = false;
  const r = await fetch('/api/immo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: IM }) });
  if (!r.ok) toast('⚠️ Enregistrement impossible');
}
const commit = () => { immoSave(); setTimeout(render, 0); };

// ---- champs liés à un objet.
// Dans un tableau : la modification est enregistrée aussitôt mais le recalcul attend que l'on quitte la ligne
// (on peut ainsi remplir tous les champs d'une ligne sans que l'écran ne se rafraîchisse entre deux champs).
// Hors tableau : recalcul immédiat.
let rowDirty = false, rowTimer = null;
function afterEdit(el, o = {}) {
  const row = !o.now && el.closest('tr');
  o.after?.();
  if (!row) { commit(); return; }
  immoSave(); rowDirty = true; row.classList.add('editing');
  if (!row._wait) {
    row._wait = true;
    row.addEventListener('focusin', () => clearTimeout(rowTimer));
    row.addEventListener('focusout', () => { clearTimeout(rowTimer); rowTimer = setTimeout(() => { if (!row.isConnected || row.contains(document.activeElement)) return; if (rowDirty) { rowDirty = false; render(); } }, 400); });
  }
}
function bind(obj, key, o = {}) {
  const t = o.type ?? 'text', num = t === 'number';
  return h('input', { type: t, value: obj[key] ?? '', step: o.step ?? (num ? '1' : undefined), min: o.min, 'data-fk': o.fk, placeholder: o.ph, style: { width: o.w ?? '100%', textAlign: num ? 'right' : undefined },
    onchange: e => { const v = e.target.value; obj[key] = num ? (v === '' ? null : +v) : v; afterEdit(e.target, o); } });
}
const sel = (obj, key, options, o = {}) => h('select', { 'data-fk': o.fk, style: { width: o.w ?? '100%' }, onchange: e => { obj[key] = e.target.value; afterEdit(e.target, o); } }, Object.entries(options).map(([k, l]) => h('option', { value: k, selected: obj[key] === k }, l)));
const chk = (obj, key, label, o = {}) => h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: !!obj[key], onchange: e => { obj[key] = e.target.checked; afterEdit(e.target, o); } }), label);
const fld = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint ? h('div', { class: 'muted', style: { fontSize: '11.5px', marginTop: '3px' } }, hint) : null);
const delBtn = (arr, i) => h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => { arr.splice(i, 1); commit(); } }, '🗑️');
const th = (...c) => h('thead', {}, h('tr', {}, c.map((t, i) => h('th', { class: Array.isArray(t) ? t[1] : '' }, Array.isArray(t) ? t[0] : t))));
const byDateDesc = arr => arr.map((x, i) => [x, i]).sort((a, b) => (b[0].date || '').localeCompare(a[0].date || '') || a[1] - b[1]);
const sim0 = (P, wi) => immoSimulate(P, wi ?? {});

function verdict(sim, P) {
  const s = sim.summary, R = P.relais?.actif;
  if (s.manque > 0.5) return { cls: 'bad', ico: '⛔', title: `Financement insuffisant : il manque ${eur0(s.manque)}`, text: R ? `Même avec le prêt relais (plafond ${eur0(P.relais.montant)}), certaines échéances ne sont pas couvertes. Voir les alertes.` : 'Aucun prêt relais n’est activé : certaines échéances ne sont pas couvertes.' };
  if (s.relaisUtilise) return { cls: 'warn', ico: '🌉', title: `Prêt relais NÉCESSAIRE : jusqu’à ${eur0(s.relaisMax)}`, text: `Premier déblocage le ${fdate(s.relaisPremierDeblocage)}${s.relaisRembourse ? `, remboursé le ${fdate(s.relaisRembourse)} grâce à la vente` : ''}. Échéance du relais : ${fdate(s.relaisFin)}.` };
  return { cls: 'good', ico: '✅', title: 'Prêt relais NON nécessaire', text: `L’épargne et les financements couvrent toutes les échéances${R ? ' ; le relais reste disponible en secours.' : '.'}` };
}
const verdictCard = (sim, P) => { const v = verdict(sim, P); return h('div', { class: 'verdict ' + v.cls }, h('div', { class: 'vi' }, v.ico), h('div', {}, h('div', { class: 'vt' }, v.title), h('div', { class: 'vx' }, v.text))); };
const immoHeader = P => P.exemple ? h('div', { class: 'tip warn', style: { marginBottom: '16px' } }, '🧪 Projet d’exemple : les valeurs sont fictives. Modifiez-les (chaque modification est enregistrée) pour décrire votre acquisition.') : h('span');

// ====================================================== Projet
async function pageImmo(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…')); const P = await immoLoad(); v.innerHTML = ''; if (S.page !== 'immo') return;
  const sim = sim0(P), s = sim.summary, loanTot = sum(P.financements.map(l => +l.montant || 0)), paid = P.appels.filter(a => a.statut === 'paye').length;
  v.append(immoHeader(P));
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Coût du projet', eur0(s.totalProjet), `prix ${eur0(s.prix)} + frais ${eur0(s.fraisTotal)}`, '🏗️'), kpi('k4', 'Financements externes', eur0(loanTot), `${P.financements.length} prêt(s) · ${eur0(s.pretsTires)} tirés (simulation)`, '🏦'),
    kpi('k2', 'Épargne + fonds', eur0(s.epargneInitiale + s.epargneContrib + s.fondsSupp), `dont ${eur0(s.fondsSupp)} d’opérations de fonds`, '💰'), kpi(s.relaisUtilise ? 'k1' : 'k2', 'Prêt relais', s.relaisUtilise ? 'Nécessaire' : 'Non nécessaire', s.relaisUtilise ? `max ${eur0(s.relaisMax)}` : 'selon la simulation', '🌉')));
  v.append(h('div', { style: { marginTop: '16px' } }, verdictCard(sim, P)));
  const kv = rows => h('dl', { class: 'kv', style: { gridTemplateColumns: '170px 1fr' } }, rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]));
  const R = P.relais, vente = P.fondsSupp.find(x => x.rembourseRelais);
  v.append(card('📋 Synthèse du projet', h('div', { class: 'grid g2', style: { gap: '24px' } },
    kv([['Projet', P.nom + (P.adresse ? ' — ' + P.adresse : '')], ['Prix TTC', eur0(P.prix)], ['Frais annexes', eur0(s.fraisTotal)], ['Signature de l’acte', fdate(P.dateSignature)], ['Début de chantier', fdate(P.dateDebutChantier)], ['Livraison prévue', fdate(P.dateLivraison)], ['Appels de fonds', `${P.appels.length} étapes · ${paid} payée(s)`]]),
    kv([['Épargne de départ', eur0(s.epargneInitiale)], ['Épargne mensuelle', eur0(P.epargne.contributionMensuelle || 0) + ' · réserve ' + eur0(P.epargne.reserve || 0)], ['Prêts', P.financements.map(l => `${l.label} ${eur0(l.montant)}`).join(' · ') || '–'],
      ['Prêt relais', R.actif ? `${eur0(R.montant)} · ${R.dureeMois} mois · dès le ${fdate(R.dateDebut)}` : 'désactivé'], ['Fonds supplémentaires', P.fondsSupp.map(x => `${x.label.split(' (')[0]} ${eur0(x.montant)} (${fdate(x.date)})`).join(' · ') || '–'], ['Coût du crédit', eur0(s.coutInterc + s.coutRelais + s.fraisRelais) + ' d’intérêts et frais'], ['Vente → relais', vente ? `${fdate(vente.date)}` : '–']])),
    h('div', { class: 'toolbar', style: { margin: '16px 0 0' } }, h('a', { class: 'btn', href: '#/immo-params', style: { textDecoration: 'none' } }, '⚙️ Modifier les paramètres'), h('a', { class: 'btn sec', href: '#/immo-planning', style: { textDecoration: 'none' } }, '🗓️ Planning et simulation'), h('a', { class: 'btn sec', href: '#/immo-actions', style: { textDecoration: 'none' } }, '✅ Plan d’actions'))));
  if (sim.alerts.length) v.append(card('🚨 Points d’attention', h('div', { class: 'legend', style: { maxHeight: 'none' } }, sim.alerts.slice(0, 4).map(a => h('div', { class: 'lrow', style: { cursor: 'default', gridTemplateColumns: '28px 1fr' } }, h('span', {}, a.level === 'bad' ? '⛔' : '⚠️'), h('div', {}, a.text)))), sim.alerts.length > 4 ? h('a', { class: 'doclink', href: '#/immo-planning' }, `… et ${sim.alerts.length - 4} autre(s) dans le planning`) : null));
}
async function pageImmoParams(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…')); const P = await immoLoad(); v.innerHTML = ''; if (S.page !== 'immo-params') return;
  const sim = sim0(P), s = sim.summary;
  v.append(immoHeader(P));
  v.append(h('div', { class: 'toolbar' }, h('a', { class: 'btn sec', href: '#/immo', style: { textDecoration: 'none' } }, '← Récapitulatif du projet'), h('a', { class: 'btn sec', href: '#/immo-planning', style: { textDecoration: 'none' } }, 'Planning et simulation →'), h('span', { class: 'muted' }, 'Toutes les zones de saisie du projet : chaque modification est enregistrée automatiquement.')));

  // -- projet
  const pairA = [], pairB = [];
  pairA.push(ccard('#6366f1', '🏗️ Le projet', h('div', { class: 'grid g2' },
    fld('Nom du projet', bind(P, 'nom')), fld('Adresse / programme', bind(P, 'adresse', { ph: 'Facultatif' })), fld('Prix de vente TTC (€)', bind(P, 'prix', { type: 'number', step: '1000', fk: 'prix' }), 'Prix du contrat de réservation / VEFA'),
    fld('Date de référence', bind(P, 'dateReference', { type: 'date' }), 'Situation de départ de la simulation (épargne à cette date)'), fld('Signature de l’acte', bind(P, 'dateSignature', { type: 'date' })),
    fld('Début de chantier (DOC)', bind(P, 'dateDebutChantier', { type: 'date' })), fld('Livraison prévue', bind(P, 'dateLivraison', { type: 'date' })))));

  // -- frais
  const fraisRows = byDateDesc(P.frais).map(([f, i]) => h('tr', {}, h('td', { style: { minWidth: '120px' } }, bind(P.frais[i], 'label')), h('td', { style: { width: '92px' } }, bind(f, 'montant', { type: 'number', step: '50', fk: 'fr' + i })), h('td', { style: { width: '128px' } }, bind(f, 'date', { type: 'date' })), h('td', { style: { width: '62px' } }, chk(f, 'paye', 'payé')), h('td', { style: { width: '30px' } }, delBtn(P.frais, i))));
  pairA.push(ccard('#f59e0b', '🧾 Frais annexes', h('div', { class: 'tablewrap' }, h('table', {}, th('Frais', ['Montant (€)', 'r'], 'Date ▼', '', ''), h('tbody', {}, fraisRows))),
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, h('button', { class: 'btn sm sec', onclick: () => { P.frais.push({ id: uid(), label: 'Nouveau frais', montant: 0, date: P.dateSignature }); commit(); } }, '＋ Ajouter un frais'),
      h('button', { class: 'btn sm sec', onclick: () => { const f = P.frais.find(x => /notaire/i.test(x.label)); const m = Math.round(P.prix * 0.025); f ? f.montant = m : P.frais.push({ id: uid(), label: 'Frais de notaire (≈ 2,5 %)', montant: m, date: P.dateSignature }); commit(); } }, 'Notaire ≈ 2,5 % du prix'),
      h('span', { class: 'muted' }, `Total : ${eur0(s.fraisTotal)} (les prêts ne financent pas ces frais : ils sont payés par l’épargne ou le relais).`))));
  v.append(pair(...pairA));

  // -- appels de fonds
  let cum = 0; const sorted = [...P.appels].sort((a, b) => a.date.localeCompare(b.date)), pctTot = sum(P.appels.map(a => +a.pct || 0));
  const cumOf = new Map(sorted.map(a => [a.id, (cum += +a.pct || 0)]));
  const appRows = byDateDesc(P.appels).map(([a, i]) => h('tr', {}, h('td', { style: { minWidth: '120px' } }, bind(a, 'label')), h('td', { style: { width: '62px' } }, bind(a, 'pct', { type: 'number', step: '0.5', fk: 'ap' + i })), h('td', { class: 'r num muted', style: { width: '52px' } }, pc1(cumOf.get(a.id))),
    h('td', { class: 'r num', style: { width: '78px', fontWeight: 600 } }, eur0(P.prix * (+a.pct || 0) / 100)), h('td', { style: { width: '128px' } }, bind(a, 'date', { type: 'date' })), h('td', { style: { width: '108px' } }, sel(a, 'statut', ST_APPEL)), h('td', { style: { width: '30px' } }, delBtn(P.appels, i))));
  pairB.push(ccard('#ec4899', '📅 Appels de fonds', h('div', { class: 'tablewrap' }, h('table', {}, th('Étape du chantier', ['%', 'r'], ['Cumul', 'r'], ['Montant', 'r'], 'Date prévue ▼', 'Statut', ''), h('tbody', {}, appRows, h('tr', { style: { fontWeight: 700 } }, h('td', {}, 'Total'), h('td', { class: 'r num ' + (Math.abs(pctTot - 100) > .01 ? 'neg' : 'pos') }, pc1(pctTot)), h('td'), h('td', { class: 'r num' }, eur0(P.prix * pctTot / 100)), h('td'), h('td'), h('td'))))),
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, h('button', { class: 'btn sm', onclick: () => { if (!P.appels.length || confirm('Remplacer le calendrier actuel par le calendrier légal usuel (5 / 35 / 70 / 95 / 100 % cumulés) ?')) { P.appels = immoStandardCalls(P); commit(); } } }, '⚖️ Calendrier légal usuel'),
      h('button', { class: 'btn sm sec', onclick: () => { P.appels.push({ id: uid(), label: 'Nouvelle étape', pct: 0, date: P.dateDebutChantier, statut: 'prevu', montantReel: null, dateReelle: null }); commit(); } }, '＋ Ajouter une étape'),
      h('span', { class: 'muted' }, 'Plafonds légaux cumulés : 35 % fondations, 70 % hors d’eau, 95 % achèvement, solde à la livraison.'))));

  // -- épargne
  const E = P.epargne, acc = S.data.accounts.filter(a => !a.manual && !isCurrent(a) || a.type === 'MAN_EPARGNE');
  const srcRows = E.sources.map((x, i) => h('tr', {}, h('td', { style: { minWidth: '100px' } }, bind(x, 'label')), h('td', { style: { width: '92px' } }, bind(x, 'montant', { type: 'number', step: '100', fk: 'sm' + i })), h('td', { style: { width: '62px' } }, bind(x, 'rendementPct', { type: 'number', step: '0.1' })),
    h('td', { style: { width: '130px' } }, sel(x, 'compte', { '': '— compte non lié —', ...Object.fromEntries(S.data.accounts.map(a => [a.number, accName(a)])) })), h('td', { style: { width: '30px' } }, delBtn(E.sources, i))));
  pairB.push(ccard('#10b981', '💰 Épargne dédiée au projet', h('div', { class: 'tablewrap' }, h('table', {}, th('Source', ['Montant (€)', 'r'], ['Rend. %', 'r'], 'Compte lié', ''), h('tbody', {}, srcRows))),
    h('div', { class: 'toolbar', style: { margin: '12px 0 14px' } }, h('button', { class: 'btn sm sec', onclick: () => { E.sources.push({ id: uid(), label: 'Nouvelle source', montant: 0, rendementPct: 0, compte: '' }); commit(); } }, '＋ Ajouter une source'),
      h('button', { class: 'btn sm', onclick: () => { for (const a of acc) if (!E.sources.some(x => x.compte === a.number)) E.sources.push({ id: uid(), label: accName(a), montant: Math.round(a.balance), rendementPct: { LIVRET_A: 1.5, LDDS: 1.5, CEL: 1, PEL: 2 }[a.type] ?? 1, compte: a.number }); commit(); } }, '⬇ Importer mes comptes d’épargne'),
      h('button', { class: 'btn sm sec', onclick: () => { for (const x of E.sources) { const a = S.data.accounts.find(z => z.number === x.compte); if (a) x.montant = Math.round(a.balance); } commit(); } }, '↻ Actualiser les soldes liés')),
    h('div', { class: 'grid g2' }, fld('Épargne mensuelle dédiée (€)', bind(E, 'contributionMensuelle', { type: 'number', step: '50', fk: 'cm' })), fld('À partir du', bind(E, 'dateDebutContribution', { type: 'date' })), fld('Jusqu’au', bind(E, 'dateFinContribution', { type: 'date' }), 'Vide = jusqu’à la livraison ; à prolonger si vous continuez d’épargner pendant le relais'), fld('Réserve de sécurité (€)', bind(E, 'reserve', { type: 'number', step: '500', fk: 'rs' }), 'Montant que la simulation évite d’utiliser (entamé en dernier recours)')), h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '12px' } }, 'Intérêts de l’épargne : calculés par quinzaine échue (sur le solde le plus bas de chaque quinzaine, après paiement des frais annexes et des appels de fonds) et crédités une fois par an, le 31 décembre.')));
  v.append(pair(...pairB));

  // -- financements
  const finRows = P.financements.map((l, i) => h('tr', {}, h('td', { style: { width: '130px' } }, sel(l, 'type', FIN_TYPES)), h('td', {}, bind(l, 'label')), h('td', { style: { width: '120px' } }, bind(l, 'montant', { type: 'number', step: '1000', fk: 'fm' + i })), h('td', { style: { width: '70px' } }, bind(l, 'tauxPct', { type: 'number', step: '0.05' })),
    h('td', { style: { width: '80px' } }, bind(l, 'dureeMois', { type: 'number' })), h('td', { style: { width: '70px' } }, bind(l, 'assurancePct', { type: 'number', step: '0.05' })), h('td', { style: { width: '145px' } }, bind(l, 'dateDispo', { type: 'date' })), h('td', { style: { width: '60px' } }, bind(l, 'priorite', { type: 'number', min: 1 })), h('td', { style: { width: '40px' } }, delBtn(P.financements, i))));
  v.append(ccard('#0ea5e9', '🏦 Financements externes (prêts)', h('div', { class: 'tablewrap' }, h('table', {}, th('Type', 'Libellé', ['Montant (€)', 'r'], ['Taux %', 'r'], ['Durée (mois)', 'r'], ['Assur. %', 'r'], 'Disponible dès le', ['Priorité', 'r'], ''), h('tbody', {}, finRows))),
    h('div', { class: 'toolbar', style: { margin: '12px 0 14px' } }, h('button', { class: 'btn sm sec', onclick: () => { P.financements.push({ id: uid(), type: 'ptz', label: 'Prêt à taux zéro', montant: 0, tauxPct: 0, dureeMois: 240, assurancePct: 0, dateDispo: P.dateSignature, priorite: P.financements.length + 1 }); commit(); } }, '＋ Ajouter un prêt'),
      h('span', { class: 'muted' }, 'Les banques débloquent les prêts au fur et à mesure des appels de fonds ; ils sont utilisés par ordre de priorité.')),
    h('div', { class: 'grid g3', style: { gap: '14px' } }, fld('Ordre d’utilisation', sel(P, 'ordre', { apport: 'L’apport d’abord, puis les prêts', pret: 'Les prêts d’abord, puis l’apport' })), fld('Intérêts intercalaires', h('div', { style: { paddingTop: '8px' } }, chk(P, 'intercalaires', 'Payer chaque mois les intérêts sur les fonds débloqués'))),
      fld('Mensualités après livraison (estimation)', h('div', { style: { paddingTop: '8px', fontWeight: 700 } }, s.pays.map(p => `${p.label} : ${eur0(p.mensualite)}/mois`).join(' · ') || '–')))));

  // -- relais
  const Rl = P.relais, BA = P.bienActuel, net = Math.round(BA.valeur * (1 - (+BA.fraisVentePct || 0) / 100) - (+BA.capitalRestantDu || 0));
  v.append(ccard('#f97316', '🌉 Prêt relais', h('div', { style: { marginBottom: '12px' } }, chk(Rl, 'actif', 'Activer un prêt relais')),
    h('div', { class: 'grid g3', style: { gap: '14px', opacity: Rl.actif ? 1 : .5 } },
      fld('Montant maximum (€)', bind(Rl, 'montant', { type: 'number', step: '1000', fk: 'rm' }), `Plafond indicatif : ${eur0(Math.max(0, BA.valeur * 0.7 - BA.capitalRestantDu))} (70 % de la valeur − capital restant dû)`), fld('Taux annuel %', bind(Rl, 'tauxPct', { type: 'number', step: '0.05' })), fld('Durée (mois)', bind(Rl, 'dureeMois', { type: 'number' }), `Échéance : ${fdate(addM(Rl.dateDebut, +Rl.dureeMois || 24))}`),
      fld('Début du relais (pendant le projet)', bind(Rl, 'dateDebut', { type: 'date' })), fld('Déblocage', sel(Rl, 'deblocage', { besoin: 'Selon les besoins (à chaque appel)', unique: 'En une seule fois au début' })), fld('Intérêts', sel(Rl, 'interets', { mensuels: 'Payés chaque mois', capitalises: 'Capitalisés (payés à l’échéance)' })),
      fld('Frais de dossier du relais (€)', bind(Rl, 'fraisDossier', { type: 'number', step: '50' }))),
    h('h4', { style: { margin: '18px 0 8px', color: 'var(--primary)' } }, 'Bien actuel à vendre'),
    h('div', { class: 'grid g3', style: { gap: '14px' } }, fld('Valeur estimée (€)', bind(BA, 'valeur', { type: 'number', step: '1000' })), fld('Capital restant dû (€)', bind(BA, 'capitalRestantDu', { type: 'number', step: '1000' })), fld('Frais de vente %', bind(BA, 'fraisVentePct', { type: 'number', step: '0.5' }), `Net vendeur estimé : ${eur0(net)}`)),
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, h('button', { class: 'btn sm', onclick: () => { const x = P.fondsSupp.find(f => f.type === 'vente'); if (x) { x.montant = net; x.label = 'Vente du bien actuel (net)'; } else P.fondsSupp.push({ id: uid(), label: 'Vente du bien actuel (net)', type: 'vente', montant: net, date: addM(P.dateLivraison, -3), rembourseRelais: true, statut: 'prevu' }); commit(); } }, '⬆ Utiliser le net vendeur dans les fonds supplémentaires'))));

  // -- fonds supplémentaires
  const fsRows = byDateDesc(P.fondsSupp).map(([x, i]) => h('tr', {}, h('td', {}, bind(x, 'label')), h('td', { style: { width: '170px' } }, sel(x, 'type', FONDS_TYPES)), h('td', { style: { width: '120px' } }, bind(x, 'montant', { type: 'number', step: '500', fk: 'fs' + i })), h('td', { style: { width: '150px' } }, bind(x, 'date', { type: 'date' })),
    h('td', { style: { width: '130px' } }, chk(x, 'rembourseRelais', 'rembourse le relais')), h('td', { style: { width: '100px' } }, sel(x, 'statut', { prevu: 'Prévu', recu: 'Reçu' })), h('td', { style: { width: '40px' } }, delBtn(P.fondsSupp, i))));
  v.append(ccard('#8b5cf6', '➕ Opérations apportant des fonds supplémentaires', h('div', { class: 'tablewrap' }, h('table', {}, th('Opération', 'Type', ['Montant (€)', 'r'], 'Date ▼', '', 'Statut', ''), h('tbody', {}, fsRows))),
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, h('button', { class: 'btn sm sec', onclick: () => { P.fondsSupp.push({ id: uid(), label: 'Nouvelle opération', type: 'don', montant: 0, date: P.dateSignature, rembourseRelais: false, statut: 'prevu' }); commit(); } }, '＋ Ajouter une opération'),
      h('span', { class: 'muted' }, 'Vente, don, prime, héritage… Une opération cochée « rembourse le relais » solde automatiquement le prêt relais à sa date.'))));
  v.append(h('div', { class: 'toolbar', style: { marginTop: '14px' } }, h('button', { class: 'btn sec', onclick: () => modal('Réinitialiser le projet ?', [h('p', {}, 'Toutes les données du projet immobilier seront remplacées par un projet d’exemple.')], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn danger', onclick: async () => { await fetch('/api/immo', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: null }) }); IM = null; close(); toast('Projet réinitialisé'); render(); } }, 'Réinitialiser')]) }, '↺ Réinitialiser le projet'), h('a', { class: 'btn', href: '#/immo-planning', style: { textDecoration: 'none' } }, 'Voir le planning et la simulation →')));
}
const ccard = (color, title, ...kids) => h('div', { class: 'card ccard', style: { '--ac': color } }, h('h2', {}, title), ...kids);
const pair = (...c) => h('div', { class: 'pair' }, ...c);
const TASK_PHASE = '7. Tâches personnelles';
const card = (title, ...kids) => h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, title), ...kids);

// ====================================================== Planning & simulation
async function pagePlanning(v) {
  v.append(h('div', { class: 'loading' }, 'Calcul…')); const P = await immoLoad(); v.innerHTML = ''; if (S.page !== 'immo-planning') return;
  const wi = S.immoWI ??= { venteDecalageMois: 0, epargneDelta: 0, relaisMontant: null, all: false };
  const hasWI = wi.venteDecalageMois || wi.epargneDelta || (wi.relaisMontant != null && wi.relaisMontant !== P.relais.montant);
  const sim = sim0(P, hasWI ? wi : {}), s = sim.summary, base = hasWI ? sim0(P) : null;
  v.append(immoHeader(P), verdictCard(sim, P));
  v.append(h('div', { class: 'grid g4', style: { marginTop: '16px' } },
    kpi('k3', 'Coût total', eur0(s.totalProjet + s.coutInterc + s.coutRelais + s.fraisRelais), `dont intérêts et frais de crédit : ${eur0(s.coutInterc + s.coutRelais + s.fraisRelais)}`, '🏗️'), kpi('k4', 'Prêts débloqués', eur0(s.pretsTires), s.pays.map(p => eur0(p.mensualite) + '/mois').join(' + ') + ' après livraison', '🏦'),
    kpi(s.relaisUtilise ? 'k1' : 'k2', 'Prêt relais', s.relaisUtilise ? eur0(s.relaisMax) : 'Non utilisé', s.relaisUtilise ? `1er déblocage ${fdate(s.relaisPremierDeblocage)}` : 'aucun déblocage prévu', '🌉'), kpi('k2', 'Épargne finale', eur0(s.cashFin), `réserve visée ${eur0(P.epargne.reserve || 0)}`, '🐖')));

  // -- simulation « et si »
  const vinp = (label, key, step, suffix) => fld(label, h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, h('input', { type: 'number', step, value: wi[key] ?? '', 'data-fk': 'wi' + key, style: { width: '100%' }, onchange: e => { wi[key] = e.target.value === '' ? (key === 'relaisMontant' ? null : 0) : +e.target.value; setTimeout(render, 0); } }), h('span', { class: 'muted' }, suffix)));
  const slot = [];
  slot.push(ccard('#8b5cf6', '🎛️ Simulation « et si » (non enregistrée)', h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' } },
    vinp('Décaler la vente du bien actuel', 'venteDecalageMois', '1', 'mois (+ plus tard)'), vinp('Variation de l’épargne mensuelle', 'epargneDelta', '50', '€ / mois'), vinp('Montant du prêt relais', 'relaisMontant', '5000', '€ (vide = projet)')),
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, h('button', { class: 'btn sm sec', onclick: () => { S.immoWI = { venteDecalageMois: 0, epargneDelta: 0, relaisMontant: null, all: wi.all }; render(); } }, '↺ Revenir au projet'),
      hasWI ? h('button', { class: 'btn sm', onclick: () => { if (wi.venteDecalageMois) P.fondsSupp.filter(x => x.rembourseRelais).forEach(x => { x.date = addM(x.date, wi.venteDecalageMois); }); if (wi.epargneDelta) P.epargne.contributionMensuelle = Math.max(0, (+P.epargne.contributionMensuelle || 0) + wi.epargneDelta); if (wi.relaisMontant != null) P.relais.montant = wi.relaisMontant; S.immoWI = { venteDecalageMois: 0, epargneDelta: 0, relaisMontant: null, all: wi.all }; commit(); toast('Scénario appliqué au projet'); } }, '✔ Appliquer au projet') : null,
      base ? h('span', { class: 'muted' }, `Écart vs projet : manque ${eur0(s.manque)} (projet : ${eur0(base.summary.manque)}) · relais max ${eur0(s.relaisMax)} (projet : ${eur0(base.summary.relaisMax)}) · coût ${eur0(s.coutInterc + s.coutRelais)} (projet : ${eur0(base.summary.coutInterc + base.summary.coutRelais)})`) : null)));

  // -- alertes
  if (sim.alerts.length) slot.push(ccard('#ef4444', '🚨 Points d’attention', h('div', { class: 'legend', style: { maxHeight: 'none' } }, sim.alerts.map(a => h('div', { class: 'lrow', style: { cursor: 'default', gridTemplateColumns: '28px 1fr' } }, h('span', {}, a.level === 'bad' ? '⛔' : '⚠️'), h('div', {}, a.text))))));

  v.append(slot.length > 1 ? pair(...slot) : slot[0]);

  // -- planning détaillé
  const lines = immoPlanLines(sim, P, wi.all), cm = +P.epargne.contributionMensuelle || 0, thN = (t, c = 'r', g = '') => h('th', { class: (c + ' ' + g).trim() }, t);
  const tr = ({ r, prevCash, contrib, n, other, avail }) => {
    const loans = sum((r.usedLoans || []).map(l => l.amount)), outflow = ['appel', 'frais'].includes(r.type), tech = !!r.tech, isInt = r.type === 'interets';
    return h('tr', { class: (r.usedRelais ? 'rowrelais' : r.short ? 'rowshort' : isInt ? 'rowint' : '') + (tech ? ' rowtech' : '') },
      h('td', { class: 'num nw' }, fdate(r.date)), h('td', {}, tech || isInt ? r.label : h('b', {}, r.label), r.late ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'en retard') : null, r.type === 'appel' && r.pct != null ? h('span', { class: 'sub', style: { marginLeft: '6px' } }, pc1(r.pct) + ' du prix') : null),
      h('td', { class: 'r num ' + (outflow ? 'neg' : 'pos'), style: { fontWeight: 700 } }, outflow ? '−' + eur0(r.amount) : ['fonds', 'relais-debloc', 'contrib', 'interets'].includes(r.type) ? '+' + eur0(r.amount) : r.repaid ? '−' + eur0(r.repaid) : '–'),
      h('td', { class: 'r num muted gA' }, eur0(prevCash)),
      h('td', { class: 'r num gA ' + (contrib ? 'pos' : 'muted'), style: { fontWeight: contrib ? 700 : 400 } }, contrib ? '+' + eur0(contrib) : '–', contrib && n ? h('span', { class: 'sub', style: { marginLeft: '4px' } }, n + '×' + eur0(cm)) : null),
      h('td', { class: 'r num gA ' + (Math.abs(other) >= 1 ? (other > 0 ? 'pos' : 'neg') : 'muted'), title: 'Intérêts d’emprunt et charges payés depuis la ligne précédente' }, Math.abs(other) >= 1 ? signed(Math.round(other)).replace(/,00/, '') : '–'),
      h('td', { class: 'r num gA', style: { fontWeight: 800 } }, eur0(r.before.cash)), h('td', { class: 'r num gA', title: 'Épargne avant l’échéance moins la réserve de sécurité (' + eur0(P.epargne.reserve || 0) + ')' }, tech || isInt ? '' : eur0(avail)),
      h('td', { class: 'r num gB' }, outflow ? eur0(r.usedCash) : ''), h('td', { class: 'r num gB' }, outflow && loans ? eur0(loans) : ''),
      h('td', { class: 'r num gB', style: { fontWeight: 700, color: r.usedRelais ? '#b45309' : '' } }, outflow ? (r.usedRelais ? '🌉 ' + eur0(r.usedRelais) : 'non') : r.repaid ? 'remboursé ' + eur0(r.repaid) : ''), h('td', { class: 'r num gB neg', style: { fontWeight: 700 } }, r.short ? eur0(r.short) : ''),
      h('td', { class: 'r num gC', style: { fontWeight: 800 } }, eur0(r.cash)), h('td', { class: 'r num gC ' + (r.relais ? 'neg' : 'muted') }, eur0(r.relais)));
  };
  v.append(ccard('#6366f1', '🗓️ Planning : fonds disponibles et financement à chaque échéance',
    h('div', { class: 'toolbar', style: { margin: '0 0 8px' } }, chk(wi, 'all', 'Détail mensuel (épargne mensuelle et échéances techniques)'), h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Intérêts de l’épargne : par quinzaine échue, crédités le 31/12 · épargne avant = reprise + épargne mensuelle ± charges · orange : relais à débloquer · rouge : manque'), h('span', { style: { marginLeft: 'auto' } }, pdfBtn('📄 Dossier PDF', () => immoPdf(P, sim)))),
    h('div', { class: 'tablewrap' }, h('table', { class: 'immotable' },
      h('thead', {}, h('tr', {}, h('th', { colspan: 3, class: 'grp g0' }, 'Échéance'), h('th', { colspan: 5, class: 'grp gA' }, '💰 Épargne disponible'), h('th', { colspan: 4, class: 'grp gB' }, '🏦 Financement de l’échéance'), h('th', { colspan: 2, class: 'grp gC' }, '📊 Après')),
        h('tr', {}, thN('Date', '', 'g0'), thN('Libellé', '', 'g0'), thN('Montant', 'r', 'g0'), thN('Reprise', 'r', 'gA'), thN('+ Épargne mensuelle', 'r', 'gA'), thN('± Charges', 'r', 'gA'), thN('= Épargne avant', 'r', 'gA'), thN('Utilisable', 'r', 'gA'), thN('Épargne utilisée', 'r', 'gB'), thN('Prêts', 'r', 'gB'), thN('Relais ?', 'r', 'gB'), thN('Manque', 'r', 'gB'), thN('Épargne après', 'r', 'gC'), thN('Relais dû', 'r', 'gC'))),
      h('tbody', {}, lines.map(tr))))));

  // -- graphiques
  v.append(h('div', { class: 'grid g2', style: { marginTop: '14px' } },
    h('div', { class: 'card ccard', style: { '--ac': '#10b981' } }, h('h2', {}, 'Financement de chaque échéance', h('small', {}, 'épargne · prêts · relais · manque')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imBars' }))),
    h('div', { class: 'card ccard', style: { '--ac': '#6366f1' } }, h('h2', {}, 'Épargne, prêts et relais dans le temps', h('small', {}, 'mois par mois')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imLine' })))));
  v.append(h('div', { class: 'grid g2', style: { marginTop: '14px' } },
    h('div', { class: 'card ccard', style: { '--ac': '#ec4899' } }, h('h2', {}, 'Appels de fonds cumulés', h('small', {}, 'montant appelé et % du prix')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imCum' }))),
    h('div', { class: 'card ccard', style: { '--ac': '#f59e0b' } }, h('h2', {}, 'Calendrier du projet', h('small', {}, 'phases et prêt relais')), h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imGantt' })))));
  const fr = sim.rows.filter(r => ['appel', 'frais'].includes(r.type));
  chart($('#imBars'), { type: 'bar', data: { labels: fr.map(r => `${mlab(r.date)} · ${r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label}`), datasets: [
    { label: 'Épargne', data: fr.map(r => Math.round(r.usedCash)), backgroundColor: '#10b981' }, { label: 'Prêts', data: fr.map(r => Math.round(sum((r.usedLoans || []).map(l => l.amount)))), backgroundColor: '#6366f1' },
    { label: 'Prêt relais', data: fr.map(r => Math.round(r.usedRelais)), backgroundColor: '#f59e0b' }, { label: 'Manque', data: fr.map(r => Math.round(r.short)), backgroundColor: '#ef4444' }] },
    options: { scales: { x: { stacked: true, ticks: { maxRotation: 60 }, grid: { display: false } }, y: { stacked: true, ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } } });
  chart($('#imLine'), { type: 'line', data: { labels: sim.series.map(p => mlab(p.date)), datasets: [
    { label: 'Épargne disponible', data: sim.series.map(p => p.cash), borderColor: '#10b981', backgroundColor: ctx => gradient(ctx, '#10b981'), fill: true, borderWidth: 3, pointRadius: 0, tension: .25 },
    { label: 'Prêts débloqués (cumul)', data: sim.series.map(p => p.loans), borderColor: '#6366f1', borderWidth: 2.5, pointRadius: 0, tension: .1, stepped: true },
    { label: 'Prêt relais en cours', data: sim.series.map(p => p.relais), borderColor: '#f59e0b', borderWidth: 3, pointRadius: 0, stepped: true }] },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { maxTicksLimit: 12 }, grid: { display: false } }, y: { ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } } });
  const cal = [...P.appels].sort((a, b) => a.date.localeCompare(b.date)); let cc = 0; const pts = cal.map(a => ({ x: a.date, label: a.label, cum: (cc += P.prix * (+a.pct || 0) / 100) }));
  chart($('#imCum'), { type: 'line', data: { labels: pts.map(p => fdate(p.x)), datasets: [{ label: 'Appelé (cumul)', data: pts.map(p => Math.round(p.cum)), borderColor: '#ec4899', backgroundColor: ctx => gradient(ctx, '#ec4899'), fill: true, borderWidth: 3, tension: 0, stepped: true, pointRadius: 4 }] },
    options: { scales: { y: { ticks: { callback: eurTick }, suggestedMax: P.prix }, x: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${eur0(c.parsed.y)} (${pc1(c.parsed.y / P.prix * 100)} du prix) — ${pts[c.dataIndex].label}` } } } } });
  const ph = ganttPhases(P, sim), t0 = ph.reduce((m, p) => p.s < m ? p.s : m, ph[0].s), off = d => monthsDiff(t0, d) + (pdate(d).getDate() - 1) / 31;
  chart($('#imGantt'), { type: 'bar', data: { labels: ph.map(p => p.label), datasets: [{ data: ph.map(p => [off(p.s), off(p.e)]), backgroundColor: ph.map(p => p.c), borderRadius: 6, borderSkipped: false }] },
    options: { indexAxis: 'y', scales: { x: { ticks: { callback: v => mlab(addM(t0, Math.round(v))), maxTicksLimit: 9 }, grid: { color: css('--line') } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fdate(ph[c.dataIndex].s)} → ${fdate(ph[c.dataIndex].e)}` } } } } });
}
/** Lignes du planning : épargne reprise + épargne mensuelle ajoutée depuis la ligne précédente = épargne disponible. */
function immoPlanLines(sim, P, showTech) {
  const all = sim.rows, DISP = ['appel', 'frais', 'fonds', 'relais-debloc', 'relais-fin', 'interets'], lines = []; let pi = -1;
  all.forEach((r, i) => {
    if (r.tech ? !showTech : !DISP.includes(r.type)) return;
    const prevCash = pi >= 0 ? all[pi].cash : sim.summary.epargneInitiale, between = all.slice(pi + 1, i).filter(x => x.type === 'contrib'), contrib = sum(between.map(x => x.amount));
    lines.push({ r, prevCash, contrib, n: between.length, other: r.before.cash - prevCash - contrib, avail: Math.max(0, r.before.cash - (+P.epargne.reserve || 0)) }); pi = i;
  });
  return lines;
}
function ganttPhases(P, sim) {
  const R = P.relais?.actif, out = [], ref = sim.ref, vente = P.fondsSupp.find(x => x.rembourseRelais);
  out.push({ label: 'Constitution de l’épargne', s: ref, e: P.dateLivraison, c: '#10b981' });
  out.push({ label: 'Signature → début de chantier', s: P.dateSignature, e: P.dateDebutChantier, c: '#8b5cf6' });
  out.push({ label: 'Chantier (appels de fonds)', s: P.dateDebutChantier, e: P.dateLivraison, c: '#ec4899' });
  out.push({ label: 'Intérêts intercalaires', s: P.dateSignature, e: P.dateLivraison, c: '#6366f1' });
  if (R) out.push({ label: 'Prêt relais (durée)', s: P.relais.dateDebut, e: addM(P.relais.dateDebut, +P.relais.dureeMois || 24), c: '#f59e0b' });
  if (R && sim.summary.relaisPremierDeblocage) out.push({ label: 'Relais effectivement utilisé', s: sim.summary.relaisPremierDeblocage, e: sim.summary.relaisRembourse || addM(P.relais.dateDebut, +P.relais.dureeMois || 24), c: '#ef4444' });
  if (vente) out.push({ label: 'Vente du bien actuel', s: addM(vente.date, -2), e: vente.date, c: '#0ea5e9' });
  return out;
}

/** Ajout rapide d'une tâche personnelle : elle rejoint le plan d'actions (par phase) et le suivi. */
function taskQuickAdd(P) {
  const phases = [...new Set([...P.actions.map(a => a.phase), TASK_PHASE])].sort(), d = { label: '', phase: TASK_PHASE, date: addDays(todayIso(), 7), prio: 'normale' };
  const inp = h('input', { type: 'text', placeholder: 'Nouvelle tâche : appeler le courtier, relire le contrat, envoyer un justificatif…', style: { flex: '1 1 280px', minWidth: '200px' }, oninput: e => { d.label = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') add(); } });
  const add = () => { const l = d.label.trim(); if (!l) { inp.focus(); return; } P.actions.push({ id: uid(), tache: true, statut: 'afaire', label: l, phase: d.phase, date: d.date, prio: d.prio, notes: '' }); toast('✅ Tâche ajoutée au plan d’actions et au suivi'); commit(); };
  return h('div', { class: 'taskadd' }, h('span', { class: 'tag' }, '＋ Tâche'), inp,
    h('select', { title: 'Phase', onchange: e => { d.phase = e.target.value; } }, phases.map(p => h('option', { value: p, selected: p === d.phase }, p))),
    h('input', { type: 'date', value: d.date, title: 'Échéance', onchange: e => { d.date = e.target.value; } }),
    h('select', { title: 'Priorité', onchange: e => { d.prio = e.target.value; } }, [['normale', 'Priorité normale'], ['haute', '❗ Prioritaire']].map(([k, l]) => h('option', { value: k }, l))),
    h('button', { class: 'btn sm', onclick: add }, 'Ajouter'));
}

// ====================================================== PDF
function immoPdf(P, sim) {
  const s = sim.summary, v = verdict(sim, P), landscape = true;
  const blocks = [
    { t: 'kpis', items: [{ label: 'Coût du projet', value: eur0(s.totalProjet), sub: `prix ${eur0(s.prix)} + frais ${eur0(s.fraisTotal)}`, color: '#6366f1' }, { label: 'Prêts débloqués', value: eur0(s.pretsTires), sub: s.pays.map(p => eur0(p.mensualite) + '/mois').join(' + '), color: '#0ea5e9' },
      { label: 'Prêt relais', alert: s.relaisUtilise, value: s.relaisUtilise ? eur0(s.relaisMax) : 'Non utilisé', sub: s.relaisUtilise ? '1er déblocage ' + fdate(s.relaisPremierDeblocage) : '', color: s.relaisUtilise ? '#f59e0b' : '#10b981' }, { label: 'Coût du crédit', value: eur0(s.coutInterc + s.coutRelais + s.fraisRelais), sub: 'intérêts et frais', color: '#ef4444' }] },
    { t: 'callout', level: v.cls === 'bad' ? 'bad' : v.cls === 'warn' ? 'warn' : 'good', title: v.title, text: v.text },
    { t: 'vigil', title: 'Points de vigilance', items: sim.alerts.map(a => ({ level: a.level === 'bad' ? 'bad' : 'warn', text: a.text })), empty: 'Toutes les échéances sont couvertes et la réserve de sécurité est préservée.' },
    { t: 'h2', text: 'Appels de fonds' },
    { t: 'table', columns: [{ title: 'Étape', w: 4 }, { title: 'Date prévue', w: 1.4 }, { title: '%', w: .8, align: 'right' }, { title: 'Montant', w: 1.4, align: 'right' }, { title: 'Statut', w: 1.2 }], rows: [...P.appels].sort((a, b) => a.date.localeCompare(b.date)).map(a => ({ cells: [a.label, fdate(a.date), pc1(a.pct), eur0(P.prix * a.pct / 100), ST_APPEL[a.statut]] })) },
    { t: 'h2', text: 'Planning : fonds disponibles et financement' },
    { t: 'table', fit: true, keep: true, fontSize: 7.5, columns: [{ title: 'Date', w: 1.1 }, { title: 'Échéance', w: 3.2 }, { title: 'Montant', w: 1.2, align: 'right' }, { title: 'Épargne reprise', w: 1.2, align: 'right' }, { title: '+ Épargne mensuelle', w: 1.3, align: 'right' }, { title: 'Fonds dispo. (hors réserve)', w: 1.3, align: 'right' }, { title: 'Épargne utilisée', w: 1.2, align: 'right' }, { title: 'Prêts', w: 1.1, align: 'right' }, { title: 'Relais à débloquer', w: 1.4, align: 'right' }, { title: 'Manque', w: 1, align: 'right' }, { title: 'Épargne après', w: 1.2, align: 'right' }, { title: 'Relais dû', w: 1.1, align: 'right' }],
      rows: immoPlanLines(sim, P, false).map(({ r, prevCash, contrib, n, avail }) => { const out = ['appel', 'frais'].includes(r.type); return { flag: r.short ? 'bad' : r.usedRelais ? 'warn' : undefined, cells: [fdate(r.date), r.label, out ? '-' + eur0(r.amount) : r.amount ? '+' + eur0(r.amount) : '', eur0(prevCash), contrib ? '+' + eur0(contrib) + ' (' + n + ' mois)' : '–', eur0(avail), out ? eur0(r.usedCash) : '', out ? eur0(sum(r.usedLoans.map(l => l.amount))) : '', out ? (r.usedRelais ? eur0(r.usedRelais) : 'non') : r.repaid ? 'rembourse ' + eur0(r.repaid) : '', { text: r.short ? eur0(r.short) : '', color: '#ef4444' }, eur0(r.cash), eur0(r.relais)] }; }) },
    { t: 'h2', text: 'Financement de chaque échéance' },
    { t: 'vbars', height: 170, labels: sim.rows.filter(r => ['appel', 'frais'].includes(r.type)).map(r => mlab(r.date)), series: [{ name: 'Épargne', color: '#10b981', data: sim.rows.filter(r => ['appel', 'frais'].includes(r.type)).map(r => Math.round(r.usedCash)) }, { name: 'Prêts', color: '#6366f1', data: sim.rows.filter(r => ['appel', 'frais'].includes(r.type)).map(r => Math.round(sum(r.usedLoans.map(l => l.amount)))) }, { name: 'Prêt relais', color: '#f59e0b', data: sim.rows.filter(r => ['appel', 'frais'].includes(r.type)).map(r => Math.round(r.usedRelais)) }] },
  ];
  // -- épargne, prêts et relais dans le temps (courbes mensuelles) + calendrier du projet (Gantt des phases)
  const ser = sim.series, step = Math.max(1, Math.ceil(ser.length / 14));
  blocks.push({ t: 'h2', text: 'Épargne, prêts et relais dans le temps' },
    { t: 'vbars', height: 185, labels: ser.map((p, i) => i % step ? '' : mlab(p.date)), series: [
      { name: 'Épargne disponible', color: '#10b981', type: 'line', data: ser.map(p => Math.round(p.cash)) },
      { name: 'Prêts débloqués (cumul)', color: '#6366f1', type: 'line', data: ser.map(p => Math.round(p.loans)) },
      { name: 'Prêt relais en cours', color: '#f59e0b', type: 'line', data: ser.map(p => Math.round(p.relais)) }] },
    { t: 'h2', text: 'Calendrier du projet' },
    { t: 'text', text: 'Phases du projet, du prêt relais et de la vente du bien actuel ; la ligne bleue marque la date du jour.' },
    { t: 'gantt', today: todayIso(), rowH: 20, items: ganttPhases(P, sim).map(p => ({ label: p.label.replace(/s*→s*/g, ' > '), start: p.s, end: p.e, color: p.c, milestone: false })), links: [], legend: [] });
  return generateReport({ title: 'Dossier de financement VEFA', file: 'dossier-vefa', layout: landscape ? 'landscape' : 'portrait', subtitle: `${P.nom} · ${eur0(P.prix)} · livraison ${fdate(P.dateLivraison)}`, blocks });
}
function immoActionsPdf(P, sim) {
  void sim;
  const today = todayIso(), A = P.actions, stOf = a => actStatus(a, today), cnt = k => A.filter(a => stOf(a) === k).length;
  const phases = [...new Set(A.map(a => a.phase))].sort(), clean = p => p.replace(/^\d+\.\s*/, ''), done = cnt('fait'), late = A.filter(a => stOf(a) === 'retard');
  const soon = A.filter(a => a.statut !== 'fait' && a.date >= today && a.date <= addDays(today, 30)).sort((a, b) => a.date.localeCompare(b.date));
  const days = d => Math.round((pdate(today) - pdate(d)) / 864e5);
  const blocks = [{ t: 'kpis', items: [
    { label: 'Actions', value: String(A.length), sub: phases.length + ' phases · ' + A.filter(a => a.tache).length + ' tâche(s) perso', color: '#6366f1' },
    { label: 'Réalisées', value: String(done), sub: A.length ? pc1(done / A.length * 100) + ' du plan' : '–', color: '#10b981' },
    { label: 'En retard', value: String(late.length), sub: late.length ? 'à traiter en priorité' : 'aucune', color: late.length ? '#ef4444' : '#10b981', alert: late.length > 0 },
    { label: 'À 30 jours', value: String(soon.length), sub: soon[0] ? 'prochaine : ' + fdate(soon[0].date) : 'rien d’imminent', color: '#0ea5e9' }] }];
  const urgent = A.filter(a => a.statut !== 'fait' && a.prio === 'haute' && a.date >= today && a.date <= addDays(today, 30));
  blocks.push({ t: 'vigil', title: 'Points de vigilance', empty: 'Aucune action en retard ni tâche prioritaire imminente.', items: [
    ...late.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10).map(a => ({ level: days(a.date) > 30 ? 'bad' : 'warn', title: 'En retard de ' + days(a.date) + ' j : ' + a.label, text: 'Prévu le ' + fdate(a.date) + ' · ' + clean(a.phase) + (a.notes ? ' — ' + a.notes : '') })),
    ...taskEdges(P).filter(e => e.bad).slice(0, 8).map(e => ({ level: 'bad', title: 'Contrainte non respectée : ' + e.to.label, text: 'devrait commencer ≥ ' + e.delay + ' j après la fin de « ' + e.from.label + ' » (il manque ' + (-e.slack) + ' j)' })),
    ...urgent.slice(0, 5).map(a => ({ level: 'warn', title: 'Prioritaire : ' + a.label, text: 'Échéance le ' + fdate(a.date) + ' (' + relDays(a.date, today) + ')' }))] });
  if (!A.length) return generateReport({ title: 'Plan d’actions du projet', file: 'plan-actions-vefa', subtitle: P.nom, blocks });
  const KEYS = ['fait', 'encours', 'afaire', 'retard'];
  blocks.push({ t: 'h2', text: 'Vue d’ensemble' },
    { t: 'hbars', items: KEYS.map(k => ({ label: ACT_ST[k][0], value: cnt(k), text: cnt(k) + ' · ' + pc1(cnt(k) / A.length * 100), color: ACT_ST[k][1] })) },
    { t: 'h2', text: 'Avancement par phase' },
    { t: 'hbars', items: phases.map((p, i) => { const all = A.filter(a => a.phase === p), d = all.filter(a => a.statut === 'fait').length; return { label: clean(p), value: all.length ? d / all.length * 100 : 0, text: d + '/' + all.length + ' · ' + pc1(all.length ? d / all.length * 100 : 0), color: PHASE_PAL[i % 7] }; }) },
    { t: 'h2', text: 'Échéances par mois' });
  const dates = A.map(a => a.date).sort(), months = []; for (let m = dates[0].slice(0, 7) + '-01'; m <= dates[dates.length - 1]; m = addM(m, 1)) months.push(m);
  blocks.push({ t: 'vbars', height: 165, stacked: true, int: true, labels: months.map((m, i) => months.length > 12 && i % 2 ? '' : m.slice(5, 7) + '/' + m.slice(2, 4)), series: KEYS.map(k => ({ name: ACT_ST[k][0], color: ACT_ST[k][1], data: months.map(m => A.filter(a => a.date.slice(0, 7) === m.slice(0, 7) && stOf(a) === k).length) })) });
  // -- dépendances entre tâches : diagramme de Gantt + tableau des contraintes
  const edges = taskEdges(P), badEdges = edges.filter(e => e.bad), order = [...A].sort((a, b) => taskStart(a).localeCompare(taskStart(b)) || a.date.localeCompare(b.date)), gi = new Map(order.map((a, i) => [a.id, i]));
  blocks.push({ t: 'h2', text: 'Diagramme de Gantt et contraintes entre tâches' },
    { t: 'text', text: edges.length ? `${edges.length} contrainte(s) entre tâches, dont ${badEdges.length} non respectée(s). Les flèches relient la fin d’une tâche au début de celle qui en dépend (délai minimal en jours indiqué).` : 'Aucune dépendance n’est définie entre les tâches : elles sont indépendantes. (Ajoutez-en avec ✏️ dans le plan d’actions.)' },
    { t: 'gantt', today, rowH: 14.5, items: order.map(a => ({ label: a.label, start: taskStart(a), end: a.date, color: ACT_ST[stOf(a)][1], done: a.statut === 'fait', milestone: !(+a.duree), bold: a.prio === 'haute' })),
      links: edges.map(e => ({ from: gi.get(e.from.id), to: gi.get(e.to.id), bad: e.bad, dashed: e.type === 'avant', label: e.delay ? (e.type === 'avant' ? '−' : '+') + e.delay + ' j' : '' })), legend: KEYS.map(k => ({ label: ACT_ST[k][0], color: ACT_ST[k][1] })) });
  if (edges.length) blocks.push({ t: 'h3', text: 'Tableau des contraintes' },
    { t: 'table', keep: true, fontSize: 8.5, columns: [{ title: 'Tâche', w: 4 }, { title: 'Contrainte', w: 3.4 }, { title: 'Délai min.', w: 1, align: 'right' }, { title: 'Marge', w: 1, align: 'right' }, { title: 'État', w: 1.6 }],
      rows: edges.sort((a, b) => a.slack - b.slack).map(e => ({ flag: e.bad ? 'bad' : e.slack <= 3 ? 'warn' : undefined,
        cells: [{ text: e.holder.label, bold: e.bad }, (e.type === 'avant' ? 'se termine avant le début de « ' : 'commence après la fin de « ') + e.other.label + ' »', e.delay + ' j', { text: (e.slack >= 0 ? '+' : '') + e.slack + ' j', color: e.bad ? '#dc2626' : undefined, bold: e.bad }, { text: e.bad ? 'Non respectée' : e.slack <= 3 ? 'Serrée' : 'Respectée', dot: e.bad ? '#dc2626' : e.slack <= 3 ? '#f59e0b' : '#10b981', bold: true, color: e.bad ? '#dc2626' : undefined }] })) });
  blocks.push({ t: 'h2', text: 'Plan détaillé par phase' });
  phases.forEach((p, i) => {
    const all = A.filter(a => a.phase === p).sort((a, b) => a.date.localeCompare(b.date)), d = all.filter(a => a.statut === 'fait').length;
    blocks.push({ t: 'h3', text: p + '  —  ' + d + '/' + all.length + ' faites' },
      { t: 'table', keep: true, fontSize: 8.5, columns: [{ title: 'Statut', w: 1.3 }, { title: 'Action', w: 5 }, { title: 'Échéance', w: 1.3 }, { title: 'Délai', w: 1.4 }, { title: 'Notes', w: 3.2 }],
        rows: all.map(a => { const s = stOf(a), over = s === 'retard'; return { flag: over ? 'bad' : s === 'fait' ? 'good' : a.prio === 'haute' ? 'warn' : undefined,
          cells: [{ text: ACT_ST[s][0], dot: ACT_ST[s][1], bold: true, color: s === 'afaire' ? '#64748b' : ACT_ST[s][1] }, { text: a.label + (a.tache ? '  [tâche]' : '') + (a.prio === 'haute' ? '  (prioritaire)' : ''), bold: over || a.prio === 'haute' }, fdate(a.date),
            { text: s === 'fait' ? '–' : relDays(a.date, today), color: over ? '#dc2626' : undefined, bold: over }, a.notes || ''] }; }) });
    void i;
  });
  return generateReport({ title: 'Plan d’actions du projet', file: 'plan-actions-vefa', subtitle: `${P.nom} · ${done}/${A.length} actions faites · ${late.length} en retard`, blocks });
}
