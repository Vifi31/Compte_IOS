'use strict';
// ============ Immobilier : saisie facilitée du plan d'actions (phases, tâches types, conditions) ============
// Complète immo-tasks.js : liste des phases gérable, catalogue de tâches types (et modèles personnels), conditions d'application
// d'une action, fenêtre d'ajout / modification d'une action et ajout rapide de tâche.

const PHASE_DEFAULTS = ['1. Avant la signature', '2. Signature de l’acte', '3. Chantier et appels de fonds', '4. Vente et remboursement du relais', '5. Livraison', '6. Après la livraison', '7. Tâches personnelles'];
/** Tâches types : p = phase, l = libellé, d = durée (jours), ref = date de référence du projet, off = décalage en jours, prio. */
const TASK_CATALOG = [
  { p: PHASE_DEFAULTS[0], l: 'Définir le budget et la capacité d’emprunt', ref: 'sign', off: -120, d: 7 },
  { p: PHASE_DEFAULTS[0], l: 'Comparer au moins 3 offres de prêt (banques et courtier)', ref: 'sign', off: -75, d: 21 },
  { p: PHASE_DEFAULTS[0], l: 'Réunir les justificatifs pour le dossier de prêt (revenus, impôts, épargne)', ref: 'sign', off: -60, d: 14 },
  { p: PHASE_DEFAULTS[0], l: 'Choisir le notaire et lui transmettre les pièces', ref: 'sign', off: -30, d: 7 },
  { p: PHASE_DEFAULTS[0], l: 'Relire le contrat de réservation et la notice descriptive', ref: 'sign', off: -20, d: 5, prio: 'haute' },
  { p: PHASE_DEFAULTS[1], l: 'Vérifier le projet d’acte avec le notaire (10 jours avant)', ref: 'sign', off: -10, d: 5, prio: 'haute' },
  { p: PHASE_DEFAULTS[1], l: 'Souscrire l’assurance dommages-ouvrage / vérifier les garanties du promoteur', ref: 'sign', off: -7, d: 3 },
  { p: PHASE_DEFAULTS[1], l: 'Virer les frais de notaire et l’apport demandés', ref: 'sign', off: -3, d: 1, prio: 'haute' },
  { p: PHASE_DEFAULTS[2], l: 'Vérifier chaque attestation d’avancement avant de payer un appel de fonds', ref: 'chantier', off: 30, d: 3 },
  { p: PHASE_DEFAULTS[2], l: 'Visiter le chantier et prendre des photos datées', ref: 'chantier', off: 60, d: 1 },
  { p: PHASE_DEFAULTS[2], l: 'Choisir les prestations et options (sols, peinture, équipements)', ref: 'chantier', off: 15, d: 30 },
  { p: PHASE_DEFAULTS[2], l: 'Contrôler le calendrier de livraison avec le promoteur', ref: 'chantier', off: 90, d: 2 },
  { p: PHASE_DEFAULTS[3], l: 'Estimer le bien actuel (2 ou 3 agences) et fixer le prix de vente', ref: 'sign', off: -90, d: 14 },
  { p: PHASE_DEFAULTS[3], l: 'Réaliser les diagnostics obligatoires du bien à vendre', ref: 'sign', off: -60, d: 10 },
  { p: PHASE_DEFAULTS[3], l: 'Prévenir la banque du déblocage et du remboursement du relais', ref: 'sign', off: 0, d: 2 },
  { p: PHASE_DEFAULTS[4], l: 'Planifier le déménagement et résilier les contrats de l’ancien logement', ref: 'liv', off: -45, d: 14 },
  { p: PHASE_DEFAULTS[4], l: 'Commander cuisine, rangements et équipements', ref: 'liv', off: -60, d: 21 },
  { p: PHASE_DEFAULTS[4], l: 'Visite de pré-livraison (OPR) : liste des réserves', ref: 'liv', off: -7, d: 1, prio: 'haute' },
  { p: PHASE_DEFAULTS[4], l: 'Relever les compteurs et récupérer clés, notices et garanties', ref: 'liv', off: 0, d: 1 },
  { p: PHASE_DEFAULTS[5], l: 'Changer d’adresse (banque, impôts, assurances, employeur, caisses)', ref: 'liv', off: 14, d: 14 },
  { p: PHASE_DEFAULTS[5], l: 'Suivre la levée des réserves et relancer en recommandé', ref: 'liv', off: 30, d: 30, prio: 'haute' },
  { p: PHASE_DEFAULTS[5], l: 'Ouvrir les contrats énergie et internet', ref: 'liv', off: 0, d: 7 },
  { p: PHASE_DEFAULTS[6], l: 'Appeler le courtier ou la banque', ref: 'today', off: 3, d: 0 },
  { p: PHASE_DEFAULTS[6], l: 'Envoyer un justificatif demandé', ref: 'today', off: 2, d: 0 },
  { p: PHASE_DEFAULTS[6], l: 'Relire un document avant signature', ref: 'today', off: 5, d: 0 },
];
const modelesOf = P => P.modeles ?? [];
/** Phases du projet, dans l'ordre choisi (P.phases) ; à défaut les phases usuelles ; toute phase déjà utilisée par une action est conservée. */
function immoPhases(P) {
  const base = P.phases?.length ? P.phases : PHASE_DEFAULTS, out = [...base];
  for (const a of P.actions ?? []) if (a.phase && !out.includes(a.phase)) out.push(a.phase);
  return P.phases?.length ? out : out.sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));
}
const immoPhasesUsed = P => immoPhases(P).filter(p => (P.actions ?? []).some(a => a.phase === p));
const tplRefDate = (P, t) => addDays({ sign: P.dateSignature, chantier: P.dateDebutChantier, liv: P.dateLivraison }[t.ref] || todayIso(), t.off || 0);
/** Tâches types proposées : catalogue puis modèles personnels. */
const taskTemplates = P => [...TASK_CATALOG, ...modelesOf(P).map(m => ({ ...m, perso: true }))];

// ---- conditions d'application d'une action : toutes doivent être vraies, sinon l'action est « non applicable » (ni retard, ni alerte)
const COND_TYPES = { tache: 'Une autre tâche', relais: 'Prêt relais', vente: 'Vente du bien actuel', manque: 'Manque de financement simulé', date: 'Date du jour' };
function condState(P, sim, a) {
  const items = (a.conds ?? []).map(c => {
    let ok = false, text = '';
    if (c.type === 'tache') { const o = P.actions.find(x => x.id === c.id); ok = !!o && (o.statut ?? 'afaire') === (c.val || 'fait'); text = `« ${shortLabel(o?.label ?? '(tâche supprimée)', 26)} » ${(ST_ACTION[c.val || 'fait'] ?? 'Fait').toLowerCase()}`; }
    else if (c.type === 'relais') { ok = !!P.relais?.actif === (c.val !== 'non'); text = 'prêt relais ' + (c.val === 'non' ? 'non activé' : 'activé'); }
    else if (c.type === 'vente') { ok = !!P.fondsSupp?.find(x => x.rembourseRelais) === (c.val !== 'non'); text = 'vente du bien actuel ' + (c.val === 'non' ? 'non prévue' : 'prévue'); }
    else if (c.type === 'manque') { ok = ((sim?.summary?.manque ?? 0) > 0.5) === (c.val !== 'non'); text = c.val === 'non' ? 'aucun manque de financement' : 'manque de financement simulé'; }
    else if (c.type === 'date') { const t = todayIso(); ok = !c.date || (c.val === 'avant' ? t <= c.date : t >= c.date); text = (c.val === 'avant' ? 'jusqu’au ' : 'à partir du ') + (c.date ? fdate(c.date) : '…'); }
    return { ok, text };
  });
  return { ok: items.every(x => x.ok), items };
}
function condChips(P, sim, a) {
  if (!a.conds?.length) return null;
  return h('div', { class: 'depchips' }, condState(P, sim, a).items.map(i => h('span', { class: 'depchip', style: { '--pc': i.ok ? IMC.green : IMC.slate }, title: i.ok ? 'Condition remplie' : 'Condition non remplie : l’action est non applicable' }, '⚑ si ' + i.text + (i.ok ? ' ✓' : ' ✗'))));
}

// ---- gestion des phases et des modèles de tâches
function phasesModal(P) {
  const list = immoPhases(P).map(p => ({ old: p, name: p })), models = modelesOf(P).map(m => ({ ...m })), box = h('div', {}), modBox = h('div', {});
  const nOf = p => P.actions.filter(a => a.phase === p).length;
  const draw = () => {
    box.innerHTML = '';
    list.forEach((x, i) => box.append(h('div', { class: 'toolbar', style: { margin: '0 0 6px', flexWrap: 'nowrap' } },
      h('input', { type: 'text', value: x.name, maxlength: 60, style: { flex: 1 }, onchange: e => { x.name = e.target.value.trim() || x.name; } }),
      h('span', { class: 'muted nw', style: { width: '70px', textAlign: 'right' } }, nOf(x.old) + ' action(s)'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Monter', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } }, '▲'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Descendre', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } }, '▼'),
      h('button', { class: 'icon-btn', type: 'button', title: nOf(x.old) ? 'Phase utilisée : déplacez ou supprimez d’abord ses actions' : 'Supprimer la phase', disabled: nOf(x.old) > 0, onclick: () => { list.splice(i, 1); draw(); } }, '🗑️'))));
    box.append(h('button', { class: 'btn sm sec', type: 'button', onclick: () => { list.push({ old: null, name: 'Nouvelle phase' }); draw(); } }, '＋ Ajouter une phase'));
    modBox.innerHTML = '';
    if (!models.length) modBox.append(h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Aucun modèle personnel : cochez « Enregistrer comme modèle » en créant une action.'));
    models.forEach((m, i) => modBox.append(h('div', { class: 'toolbar', style: { margin: '0 0 6px', flexWrap: 'nowrap' } }, h('span', { style: { flex: 1 } }, m.l), h('span', { class: 'muted nw' }, m.p.replace(/^\d+\.\s*/, '')), h('button', { class: 'icon-btn', type: 'button', onclick: () => { models.splice(i, 1); draw(); } }, '🗑️'))));
  };
  draw();
  modal('🗂️ Phases et modèles de tâches', [
    h('p', { class: 'muted', style: { margin: '0 0 8px' } }, 'La liste des phases sert à ranger les actions (saisie, filtres, plan). Renommer une phase met à jour ses actions ; l’ordre choisi est celui du plan.'), box,
    h('h4', { style: { margin: '14px 0 6px' } }, 'Mes modèles de tâches'), modBox],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: () => {
      const names = list.map(x => x.name.trim()).filter(Boolean); if (new Set(names).size !== names.length) return toast('⚠️ Deux phases portent le même nom');
      for (const x of list) if (x.old && x.old !== x.name) { for (const a of P.actions) if (a.phase === x.old) a.phase = x.name; for (const m of models) if (m.p === x.old) m.p = x.name; }
      P.phases = names; P.modeles = models; close(); toast('🗂️ Phases enregistrées'); commit();
    } }, 'Enregistrer')]);
}

// ---- fenêtre d'ajout / modification d'une action : phase et tâche type en listes, dépendances, conditions
function editAction(P, a, preset = {}) {
  const sim = sim0(P);
  const d = a ? { prio: 'normale', duree: 0, ...a, deps: (a.deps ?? []).map(x => ({ ...x })), conds: (a.conds ?? []).map(x => ({ ...x })) } : { id: uid(), label: preset.label ?? '', phase: preset.phase ?? TASK_PHASE, date: preset.date ?? '', statut: 'afaire', notes: '', auto: false, tache: true, prio: preset.prio ?? 'normale', duree: 0, deps: [], conds: [] };
  const others = () => P.actions.filter(x => x !== a).sort((p, q) => p.date.localeCompare(q.date));
  let asModel = false; const uploaded = [];
  const inLabel = h('input', { type: 'text', value: d.label, oninput: e => { d.label = e.target.value; } });
  const inDate = h('input', { type: 'date', value: d.date, title: 'Laissez vide pour que l’échéance soit calculée d’après les enchaînements et la durée', onchange: e => { d.date = e.target.value; d.dateAuto = false; } });
  const btnCalc = h('button', { class: 'btn sm sec', type: 'button', title: 'Calcule l’échéance d’après les enchaînements et la durée saisis ci-dessous', onclick: () => {
    const r = computeDueDate(P, d, P.actions.filter(x => x !== a)); d.date = r.date; d.dateAuto = true; inDate.value = r.date; toast('🧮 Échéance calculée : ' + fdate(r.date));
  } }, '🧮 Calculer');
  const inDuree = h('input', { type: 'number', min: 0, step: 1, value: d.duree, onchange: e => { d.duree = Math.max(0, +e.target.value || 0); } });
  const inNotes = h('input', { type: 'text', value: d.notes, oninput: e => { d.notes = e.target.value; } });
  const selPrio = h('select', { onchange: e => { d.prio = e.target.value; } }, [['normale', 'Normale'], ['haute', '❗ Prioritaire']].map(([k, l]) => h('option', { value: k, selected: d.prio === k }, l)));
  // phase : liste des phases (+ création)
  const phaseSel = h('select', { onchange: e => {
    if (e.target.value === '__new') { const n = (prompt('Nom de la nouvelle phase :') || '').trim(); if (n) { P.phases = [...immoPhases(P), ...(immoPhases(P).includes(n) ? [] : [n])]; d.phase = n; } }
    else d.phase = e.target.value;
    drawPhase(); drawTpl();
  } });
  const drawPhase = () => { phaseSel.innerHTML = ''; for (const p of immoPhases(P)) phaseSel.append(h('option', { value: p, selected: d.phase === p }, p)); if (!immoPhases(P).includes(d.phase)) phaseSel.append(h('option', { value: d.phase, selected: true }, d.phase)); phaseSel.append(h('option', { value: '__new' }, '＋ Nouvelle phase…')); };
  // tâche type : modèles de la phase choisie puis des autres phases
  const tplSel = h('select', { title: 'Pré-remplit le libellé, la durée, la priorité et la date', onchange: e => {
    const t = taskTemplates(P)[+e.target.value]; if (!t) return;
    d.label = t.l; inLabel.value = t.l; d.duree = t.d ?? 0; inDuree.value = d.duree; d.prio = t.prio || 'normale'; selPrio.value = d.prio; if (t.notes) { d.notes = t.notes; inNotes.value = t.notes; }
    if (t.ref) { d.date = tplRefDate(P, t); inDate.value = d.date; }
    if (!a && t.p && immoPhases(P).includes(t.p)) { d.phase = t.p; drawPhase(); drawTpl(); }
  } });
  const drawTpl = () => {
    const all = taskTemplates(P); tplSel.innerHTML = ''; tplSel.append(h('option', { value: '' }, '— choisir une tâche type pour pré-remplir —'));
    const grp = (label, idxs) => { if (!idxs.length) return; const g = h('optgroup', { label }); for (const i of idxs) g.append(h('option', { value: i }, (all[i].perso ? '⭐ ' : '') + all[i].l)); tplSel.append(g); };
    const idx = all.map((_, i) => i);
    grp('Phase « ' + d.phase.replace(/^\d+\.\s*/, '') + ' »', idx.filter(i => all[i].p === d.phase));
    grp('Autres phases', idx.filter(i => all[i].p !== d.phase));
  };
  drawPhase(); drawTpl();
  // dépendances (avant / après, en jours)
  const depBox = h('div', { class: 'depbox' });
  const drawDeps = () => {
    depBox.innerHTML = '';
    d.deps.forEach((dep, i) => depBox.append(h('div', { class: 'deprow' },
      h('select', { onchange: e => { dep.type = e.target.value; drawDeps(); } }, [['apres', 'Commence après la fin de'], ['avant', 'Se termine avant le début de']].map(([k, l]) => h('option', { value: k, selected: dep.type === k }, l))),
      h('input', { type: 'number', min: 0, step: 1, value: dep.delay ?? 0, title: 'Délai minimal en jours', onchange: e => { dep.delay = Math.max(0, +e.target.value || 0); } }), h('span', { class: 'muted' }, 'j'),
      h('select', { onchange: e => { dep.id = e.target.value; } }, others().map(x => h('option', { value: x.id, selected: dep.id === x.id }, `${fdate(x.date)} · ${shortLabel(x.label, 54)}`))),
      h('button', { class: 'icon-btn', type: 'button', title: 'Retirer cette dépendance', onclick: () => { d.deps.splice(i, 1); drawDeps(); } }, '🗑️'))));
    if (!d.deps.length) depBox.append(h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Aucune dépendance : la tâche est indépendante.'));
  };
  drawDeps();
  // conditions d'application
  const condBox = h('div', { class: 'depbox' });
  const drawConds = () => {
    condBox.innerHTML = '';
    d.conds.forEach((c, i) => {
      const row = h('div', { class: 'deprow' }, h('span', { class: 'muted' }, 'Si'),
        h('select', { onchange: e => { c.type = e.target.value; c.val = c.type === 'tache' ? 'fait' : c.type === 'date' ? 'apres' : 'oui'; c.id = c.type === 'tache' ? (others()[0]?.id ?? '') : undefined; drawConds(); } }, Object.entries(COND_TYPES).map(([k, l]) => h('option', { value: k, selected: c.type === k }, l))));
      const opt = (arr, cur, cb) => h('select', { onchange: e => cb(e.target.value) }, arr.map(([k, l]) => h('option', { value: k, selected: cur === k }, l)));
      if (c.type === 'tache') row.append(h('select', { onchange: e => { c.id = e.target.value; } }, others().map(x => h('option', { value: x.id, selected: c.id === x.id }, `${fdate(x.date)} · ${shortLabel(x.label, 44)}`))), h('span', { class: 'muted' }, 'est'), opt(Object.entries(ST_ACTION), c.val || 'fait', v => { c.val = v; }));
      else if (c.type === 'relais') row.append(h('span', { class: 'muted' }, 'est'), opt([['oui', 'activé'], ['non', 'non activé']], c.val || 'oui', v => { c.val = v; }));
      else if (c.type === 'vente') row.append(h('span', { class: 'muted' }, 'est'), opt([['oui', 'prévue'], ['non', 'non prévue']], c.val || 'oui', v => { c.val = v; }));
      else if (c.type === 'manque') row.append(h('span', { class: 'muted' }, ':'), opt([['oui', 'oui'], ['non', 'non']], c.val || 'oui', v => { c.val = v; }));
      else row.append(opt([['apres', 'à partir du'], ['avant', 'jusqu’au']], c.val || 'apres', v => { c.val = v; }), h('input', { type: 'date', value: c.date || '', onchange: e => { c.date = e.target.value; } }));
      row.append(h('button', { class: 'icon-btn', type: 'button', title: 'Retirer cette condition', onclick: () => { d.conds.splice(i, 1); drawConds(); } }, '🗑️'));
      condBox.append(row);
    });
    if (!d.conds.length) condBox.append(h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Aucune condition : l’action s’applique toujours.'));
  };
  drawConds();
  modal(a ? 'Modifier l’action' : 'Nouvelle action', [
    fld('Tâche type (facultatif)', tplSel, 'Catalogue de tâches courantes de l’achat, plus vos modèles ⭐ : le libellé, la durée, la priorité et la date sont proposés.'),
    fld('Action', inLabel),
    h('div', { class: 'grid g2', style: { gap: '12px' } }, fld('Phase', phaseSel), fld('Échéance (fin)', h('div', { style: { display: 'flex', gap: '6px' } }, inDate, btnCalc), 'Vide = calculée à l’enregistrement d’après les enchaînements (avant / après) et la durée.')),
    h('div', { class: 'grid g3', style: { gap: '12px' } },
      fld('Durée (jours)', inDuree, '0 = jalon ; la tâche occupe [échéance − durée ; échéance]'),
      fld('Statut', h('select', { onchange: e => { d.statut = e.target.value; } }, Object.entries(ST_ACTION).map(([k, l]) => h('option', { value: k, selected: d.statut === k }, l)))),
      fld('Priorité', selPrio)),
    h('div', { class: 'grid g2', style: { gap: '12px' } }, fld('Sous-projet', spSelect(P, d), 'Regroupe la tâche sous un thème coloré.'), fld('Notes', inNotes)),
    h('div', { class: 'field' }, h('label', {}, '⛓ Enchaînement avec d’autres tâches (avant / après, en jours)'), depBox,
      h('button', { class: 'btn sm sec', type: 'button', style: { marginTop: '6px' }, onclick: () => { const o = others().find(x => !d.deps.some(z => z.id === x.id)); if (!o) return toast('Aucune autre tâche disponible'); d.deps.push({ id: o.id, type: 'apres', delay: 0 }); drawDeps(); } }, '＋ Ajouter un enchaînement'),
      h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Le délai est un minimum en jours (0 = juste après / juste avant). Les contraintes non respectées sont signalées en rouge et peuvent être recalées automatiquement.')),
    h('div', { class: 'field' }, h('label', {}, '⚑ Conditions d’application'), condBox,
      h('button', { class: 'btn sm sec', type: 'button', style: { marginTop: '6px' }, onclick: () => { d.conds.push({ type: 'relais', val: 'oui' }); drawConds(); } }, '＋ Ajouter une condition'),
      h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Toutes les conditions doivent être vraies : sinon l’action est « non applicable » (grisée, sans retard ni alerte). Ex. : « Si prêt relais activé », « Si la tâche Compromis de vente est faite », « À partir du… ».')),
    h('div', { class: 'field' }, h('label', {}, '📎 Pièces jointes'), attachBox(d.id, n => uploaded.push(n))),
    a ? null : h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', onchange: e => { asModel = e.target.checked; } }), '⭐ Enregistrer comme modèle de tâche (réutilisable dans la liste « Tâche type »)'),
    h('button', { class: 'btn sm sec', type: 'button', style: { marginTop: '8px' }, onclick: () => phasesModal(P) }, '🗂️ Gérer les phases et les modèles'), ' ',
    h('button', { class: 'btn sm sec', type: 'button', style: { marginTop: '8px' }, onclick: () => spModal(P) }, '🎨 Gérer les sous-projets')],
    close => [h('button', { class: 'btn sec', onclick: () => { if (!a && uploaded.length) apiFetch('/api/immo/files?aid=' + encodeURIComponent(d.id), { method: 'DELETE' }); setFileCount(d.id, a ? S.immoFiles[d.id] : 0); close(); } }, 'Annuler'), h('button', { class: 'btn', onclick: () => {
      if (!d.label.trim()) return toast('⚠️ Saisissez le libellé de l’action');
      d.deps = d.deps.filter(x => x.id && x.id !== d.id);
      d.conds = d.conds.filter(c => c.type !== 'tache' || (c.id && c.id !== d.id)).filter(c => c.type !== 'date' || c.date);
      const list = a ? P.actions.map(x => x === a ? { ...x, ...d } : x) : [...P.actions, d];
      if (hasCycle(list)) return toast('⚠️ Ces dépendances forment une boucle (A attend B qui attend A) : modifiez-les');
      if (!d.date) { d.date = computeDueDate(P, d, P.actions.filter(x => x !== a)).date; d.dateAuto = true; toast('🧮 Échéance calculée : ' + fdate(d.date)); }
      if (asModel) (P.modeles ??= []).push({ p: d.phase, l: d.label.trim(), d: +d.duree || 0, prio: d.prio, notes: d.notes || '' });
      if (a) Object.assign(a, d); else P.actions.push(d);
      S.immoFocus = d.phase; close(); commit();
    } }, 'Enregistrer')], true);
}

/** Ajout rapide d'une tâche : liste de tâches types, phases en liste, échéance et priorité. */
function taskQuickAdd(P) {
  const d = { label: '', phase: TASK_PHASE, date: addDays(todayIso(), 7), prio: 'normale' };
  const inp = h('input', { type: 'text', placeholder: 'Nouvelle tâche : appeler le courtier, relire le contrat, envoyer un justificatif…', style: { flex: '1 1 280px', minWidth: '200px' }, oninput: e => { d.label = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') add(); } });
  const inDate = h('input', { type: 'date', value: d.date, title: 'Échéance', onchange: e => { d.date = e.target.value; } });
  const phaseSel = h('select', { title: 'Phase', onchange: e => { d.phase = e.target.value; } }, immoPhases(P).map(p => h('option', { value: p, selected: p === d.phase }, p)));
  const prioSel = h('select', { title: 'Priorité', onchange: e => { d.prio = e.target.value; } }, [['normale', 'Priorité normale'], ['haute', '❗ Prioritaire']].map(([k, l]) => h('option', { value: k }, l)));
  const all = taskTemplates(P);
  const tpl = h('select', { title: 'Tâche type : pré-remplit libellé, phase, date et priorité', style: { maxWidth: '230px' }, onchange: e => {
    const t = all[+e.target.value]; if (!t) return; d.label = t.l; inp.value = t.l; d.prio = t.prio || 'normale'; prioSel.value = d.prio;
    if (t.p && immoPhases(P).includes(t.p)) { d.phase = t.p; phaseSel.value = t.p; } if (t.ref) { d.date = tplRefDate(P, t); inDate.value = d.date; }
  } }, h('option', { value: '' }, '📋 Tâche type…'), all.map((t, i) => h('option', { value: i }, (t.perso ? '⭐ ' : '') + t.l)));
  const add = () => { const l = d.label.trim(); if (!l) { inp.focus(); return; } const tp = all.find(x => x.l === l); const t = { id: uid(), tache: true, statut: 'afaire', label: l, phase: d.phase, date: d.date, prio: d.prio, duree: tp?.d ?? 0, notes: '' }; if (!t.date) { t.date = computeDueDate(P, t).date; t.dateAuto = true; } P.actions.push(t); toast('✅ Tâche ajoutée au plan d’actions et au suivi'); S.immoFocus = d.phase; commit(); };
  return h('div', { class: 'taskadd' }, h('span', { class: 'tag' }, '＋ Tâche'), tpl, inp, phaseSel, inDate, prioSel, h('button', { class: 'btn sm', onclick: add }, 'Ajouter'),
    h('button', { class: 'btn sm sec', title: 'Gérer les phases et les modèles de tâches', onclick: () => phasesModal(P) }, '🗂️'));
}

/** Ligne d'ajout rapide au bas de chaque phase : tâche type de la phase (ou libre), échéance, puis « Ajouter » ou « Détails… » pour l'édition complète. */
function phaseQuickAdd(P, phase) {
  const d = { label: '', date: addDays(todayIso(), 7), prio: 'normale' }, all = taskTemplates(P), mine = all.map((t, i) => [t, i]).filter(([t]) => t.p === phase);
  const inp = h('input', { type: 'text', placeholder: 'Ajouter une tâche à cette phase…', style: { flex: '1 1 240px', minWidth: '180px' }, oninput: e => { d.label = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') add(); } });
  const inDate = h('input', { type: 'date', value: d.date, title: 'Échéance', onchange: e => { d.date = e.target.value; } });
  const tpl = mine.length ? h('select', { title: 'Tâches types de cette phase', style: { maxWidth: '220px' }, onchange: e => {
    const t = all[+e.target.value]; if (!t) return; d.label = t.l; inp.value = t.l; d.prio = t.prio || 'normale'; if (t.ref) { d.date = tplRefDate(P, t); inDate.value = d.date; }
  } }, h('option', { value: '' }, '📋 Tâche type…'), mine.map(([t, i]) => h('option', { value: i }, (t.perso ? '⭐ ' : '') + t.l))) : null;
  const add = () => {
    const l = d.label.trim(); if (!l) { inp.focus(); return; } const tp = all.find(x => x.l === l && x.p === phase);
    const t = { id: uid(), tache: true, statut: 'afaire', label: l, phase, date: d.date, prio: d.prio, duree: tp?.d ?? 0, notes: '' }; if (!t.date) { t.date = computeDueDate(P, t).date; t.dateAuto = true; } P.actions.push(t); toast('✅ Tâche ajoutée à « ' + phase.replace(/^\d+\.\s*/, '') + ' »'); S.immoFocus = phase; commit();
  };
  return h('div', { class: 'taskadd phaseadd' }, h('span', { class: 'tag' }, '＋'), tpl, inp, inDate,
    h('button', { class: 'btn sm', onclick: add }, 'Ajouter'), h('button', { class: 'btn sm sec', title: 'Édition complète : durée, enchaînement, conditions', onclick: () => editAction(P, null, { phase, label: d.label.trim(), date: d.date, prio: d.prio }) }, 'Détails…'));
}

// ---- dépendances en graphisme : rails à gauche des cartes de phase (flèche = « doit être finie avant »), pastilles pour les liens entre phases
/** Couleur et sens d'une contrainte : vert = satisfaite (tâche source faite), rouge = non respectée, orange = en attente, bleu = respectée. */
function edgeLook(e) {
  if (e.bad) return { c: IMC.red, s: 'non respectée : il manque ' + (-e.slack) + ' j' };
  if (e.from.statut === 'fait') return { c: IMC.green, s: 'satisfaite' };
  return e.type === 'apres' && e.other.statut !== 'fait' ? { c: IMC.amber, s: 'en attente · marge ' + e.slack + ' j' } : { c: IMC.blue, s: 'respectée · marge ' + e.slack + ' j' };
}
const edgeTip = e => '« ' + shortLabel(e.from.label, 40) + ' » doit être terminée' + (e.delay ? ' au moins ' + e.delay + ' j' : '') + ' avant le début de « ' + shortLabel(e.to.label, 40) + ' » — ' + edgeLook(e).s;
const phaseNum = p => (p.match(/^\d+/) ?? [p.slice(0, 8)])[0];

/** Pastilles d'une ligne pour les dépendances qui sortent de sa phase (les liens internes sont tracés par les rails). */
function crossBadges(P, a) {
  const edges = taskEdges(P).filter(e => (e.to === a || e.from === a) && e.from.phase !== e.to.phase);
  if (!edges.length) return null;
  return h('div', { class: 'depchips' }, edges.map(e => { const l = edgeLook(e), incoming = e.to === a, o = incoming ? e.from : e.to;
    return h('span', { class: 'depchip xdep', style: { '--pc': l.c }, title: edgeTip(e) }, (incoming ? '⇥ après ' : '→ avant ') + 'phase ' + phaseNum(o.phase) + (e.delay ? ' · ' + e.delay + ' j' : '')); }));
}

/** Trace les rails de dépendances d'une carte de phase (appelé après insertion dans la page, et à chaque changement de taille). */
function drawRails(card, P, phase) {
  card.querySelector(':scope > svg.rails')?.remove();
  const rows = [...card.querySelectorAll('.actrow[data-aid]')], idx = new Map(rows.map((r, i) => [r.dataset.aid, i]));
  const edges = taskEdges(P).filter(e => e.from.phase === phase && e.to.phase === phase && idx.has(e.from.id) && idx.has(e.to.id));
  card.style.removeProperty('--rail'); if (!edges.length) { card.classList.remove('hasrails'); return; }
  // couloirs : deux liens qui se chevauchent ne partagent pas le même couloir
  const spans = edges.map(e => [Math.min(idx.get(e.from.id), idx.get(e.to.id)), Math.max(idx.get(e.from.id), idx.get(e.to.id)), e]).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]));
  const lanes = []; for (const sp of spans) { let l = lanes.findIndex(L => L.every(o => o[1] < sp[0] || o[0] > sp[1])); if (l < 0) { l = lanes.length; lanes.push([]); } lanes[l].push(sp); sp.lane = l; }
  const W = 14 + lanes.length * 9; card.classList.add('hasrails'); card.style.setProperty('--rail', W + 'px');
  const cb = card.getBoundingClientRect(), ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'rails'); svg.setAttribute('width', W); svg.setAttribute('height', cb.height);
  const yOf = r => { const b = r.getBoundingClientRect(); return Math.round(b.top - cb.top + b.height / 2); };
  const mk = (tag, at) => { const el = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(at)) el.setAttribute(k, v); return el; };
  const x0 = W - 3;
  for (const sp of spans) {
    const e = sp[2];
    const l = edgeLook(e), y1 = yOf(rows[idx.get(e.from.id)]), y2 = yOf(rows[idx.get(e.to.id)]), x = 6 + sp.lane * 9 + 3, g = mk('g', { style: 'pointer-events:stroke;cursor:help' });
    g.append(mk('title', {}), mk('path', { d: 'M' + x0 + ',' + y1 + ' H' + x + ' V' + y2 + ' H' + (x0 - 1), fill: 'none', stroke: l.c, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-dasharray': e.type === 'avant' ? '4 3' : '' }),
      mk('circle', { cx: x0, cy: y1, r: 3, fill: l.c }), mk('path', { d: 'M' + (x0 + 1) + ',' + y2 + ' l-5,-3.5 v7 z', fill: l.c }));
    g.firstChild.textContent = edgeTip(e);
    if (e.delay) { const tx = mk('text', { x: x - 5, y: Math.round((y1 + y2) / 2) + 3, 'font-size': 8.5, 'font-weight': 700, fill: l.c, transform: 'rotate(-90 ' + (x - 5) + ' ' + (Math.round((y1 + y2) / 2) + 3) + ')', 'text-anchor': 'middle' }); tx.textContent = '+' + e.delay + ' j'; g.append(tx); }
    svg.append(g);
  }
  card.prepend(svg);
}
/** Légende des rails, placée sous la barre de navigation des phases. */
const railLegend = () => h('div', { class: 'railleg muted' }, 'Dépendances : une flèche à gauche d’une carte va de la tâche qui doit être finie vers celle qui en dépend (trait pointillé = « avant », +n j = délai). ',
  [['satisfaite', IMC.green], ['en attente', IMC.amber], ['respectée', IMC.blue], ['non respectée', IMC.red]].map(([l, c]) => h('span', { class: 'rl', style: { '--pc': c } }, l)));

// ---- regroupement des actions d'une phase selon leurs dépendances : enchaînements (ordre logique) puis tâches indépendantes
/**
 * Ordonne les actions d'une phase : chaque enchaînement (actions reliées entre elles) forme un groupe classé dans l'ordre des contraintes,
 * puis viennent les tâches indépendantes. mode « date » : simple tri par date. Retourne une liste mêlant actions et en-têtes { __hdr }.
 */
function depSequence(P, list, mode) {
  const byDate = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'fr'));
  if (mode === 'date') return byDate;
  const ids = new Set(list.map(a => a.id)), edges = taskEdges(P).filter(e => ids.has(e.from.id) && ids.has(e.to.id));
  if (!edges.length) return byDate;
  const parent = new Map(list.map(a => [a.id, a.id])), find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const e of edges) parent.set(find(e.from.id), find(e.to.id));
  const comps = new Map(); for (const a of byDate) { const r = find(a.id); (comps.get(r) ?? comps.set(r, []).get(r)).push(a); }
  const chains = [], free = [];
  for (const members of comps.values()) {
    if (members.length < 2) { free.push(...members); continue; }
    const mset = new Set(members.map(a => a.id)), es = edges.filter(e => mset.has(e.from.id)), indeg = new Map(members.map(a => [a.id, 0]));
    for (const e of es) indeg.set(e.to.id, indeg.get(e.to.id) + 1);
    const ready = members.filter(a => indeg.get(a.id) === 0), order = [];
    while (ready.length) { ready.sort((a, b) => a.date.localeCompare(b.date)); const x = ready.shift(); order.push(x); for (const e of es.filter(e => e.from.id === x.id)) { indeg.set(e.to.id, indeg.get(e.to.id) - 1); if (indeg.get(e.to.id) === 0) ready.push(e.to); } }
    for (const a of members) if (!order.includes(a)) order.push(a);   // (cycle : déjà refusé à la saisie)
    chains.push({ items: order, edges: es, ids: mset });
  }
  chains.sort((x, y) => x.items.map(taskStart).sort()[0].localeCompare(y.items.map(taskStart).sort()[0]));
  const out = [];
  chains.forEach((g, i) => out.push({ __hdr: { kind: 'chain', n: i + 1, ...g } }, ...g.items));
  if (free.length) { if (chains.length) out.push({ __hdr: { kind: 'free', items: free } }); out.push(...free); }
  return out;
}
/** En-tête d'un enchaînement : étendue en dates, nombre de tâches, cohérence et recalage du groupe. */
function chainHeader(P, g, phase) {
  if (g.kind === 'free') return h('div', { class: 'chainhdr free' }, h('b', {}, '▫️ Tâches indépendantes'), h('span', { class: 'muted' }, g.items.length + ' tâche(s) sans enchaînement'));
  const starts = g.items.map(taskStart).sort(), ends = g.items.map(a => a.date).sort(), s0 = starts[0], e1 = ends[ends.length - 1];
  const bad = g.edges.filter(e => e.bad), done = g.items.filter(a => a.statut === 'fait').length, plan = planReschedule(P).filter(c => g.ids.has(c.a.id));
  return h('div', { class: 'chainhdr' + (bad.length ? ' bad' : '') },
    h('b', {}, '⛓ Enchaînement ' + g.n), h('span', { class: 'muted' }, g.items.length + ' tâches · du ' + fdate(s0) + ' au ' + fdate(e1) + ' · ' + Math.max(0, dayDiff(s0, e1)) + ' j · ' + done + '/' + g.items.length + ' faites'),
    bad.length ? h('span', { class: 'chainwarn' }, '⚠ ' + bad.length + ' contrainte(s) non respectée(s)') : h('span', { class: 'chainok' }, '✓ dates cohérentes'),
    plan.length ? h('button', { class: 'btn sm sec', style: { marginLeft: 'auto' }, title: 'Décale les tâches de cet enchaînement pour respecter les délais', onclick: () => { for (const c of plan) c.a.date = c.to; S.immoFocus = phase; toast('📆 ' + plan.length + ' date(s) recalée(s) dans cet enchaînement'); commit(); } }, '📆 Recaler les dates (' + plan.length + ')') : null);
}

// ---- pièces jointes d'une action (fichiers stockés sur le disque, par action)
const fmtSize = n => (n < 1024 ? n + ' o' : n < 1048576 ? Math.round(n / 1024) + ' Ko' : (n / 1048576).toFixed(1).replace('.', ',') + ' Mo');
const fileIcon = n => ({ pdf: '📕', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ods: '📗', csv: '📗', ppt: '📙', pptx: '📙', eml: '✉️', msg: '✉️' }[n.split('.').pop().toLowerCase()] ?? '📄');
const fileUrl = (aid, name, dl) => '/api/immo/files?aid=' + encodeURIComponent(aid) + '&name=' + encodeURIComponent(name) + (dl ? '&download=1' : '');
// nombre de pièces jointes par action (badge des lignes) : S.immoFiles, créé à la demande (S est défini après ce fichier)
const setFileCount = (aid, n) => { const m = (S.immoFiles ??= {}); if (n) m[aid] = n; else delete m[aid]; };
const fileBadge = a => ((S.immoFiles ??= {})[a.id] ? h('button', { class: 'filebadge', type: 'button', title: S.immoFiles[a.id] + ' pièce(s) jointe(s) : cliquer pour les ouvrir', onclick: () => filesModal(a) }, '📎 ' + S.immoFiles[a.id]) : null);

/** Zone de dépôt et liste des fichiers d'une action ; `track` reçoit les noms déposés (pour nettoyer si l'action n'est pas enregistrée). */
function attachBox(aid, track) {
  const box = h('div', { class: 'attachbox' }), listEl = h('div', { class: 'attachlist' }), info = h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } });
  const input = h('input', { type: 'file', multiple: true, style: { display: 'none' }, accept: '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.md,.eml,.msg', onchange: e => up([...e.target.files]) });
  const draw = files => {
    setFileCount(aid, files.length); listEl.innerHTML = '';
    if (!files.length) listEl.append(h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Aucun fichier joint.'));
    for (const f of files) listEl.append(h('div', { class: 'attachrow' }, h('span', {}, fileIcon(f.name)),
      h('a', { class: 'doclink', href: apiUrl(fileUrl(aid, f.name)), target: '_blank', title: 'Ouvrir' }, f.name), h('span', { class: 'muted nw' }, fmtSize(f.size)),
      h('a', { class: 'icon-btn', href: apiUrl(fileUrl(aid, f.name, true)), title: 'Télécharger', style: { textDecoration: 'none' } }, '⬇️'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Supprimer ce fichier', onclick: async () => { if (!confirm('Supprimer « ' + f.name + ' » ?')) return; const r = await apiFetch(fileUrl(aid, f.name), { method: 'DELETE' }); const j = await r.json(); if (r.ok) draw(j.files); else toast('⚠️ ' + (j.error || 'Suppression impossible')); } }, '🗑️')));
  };
  const up = async files => {
    let n = 0; info.textContent = 'Envoi…';
    for (const f of files) {
      const r = await apiFetch('/api/immo/files?aid=' + encodeURIComponent(aid) + '&name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: await f.arrayBuffer() });
      const j = await r.json(); if (r.ok) { n++; track?.(j.name); draw(j.files); } else toast('⚠️ ' + f.name + ' : ' + (j.error || 'dépôt impossible'));
    }
    info.textContent = n ? n + ' fichier(s) ajouté(s)' : '';
  };
  const dz = h('div', { class: 'dropzone', style: { padding: '10px' }, onclick: () => input.click(), ondragover: e => { e.preventDefault(); dz.classList.add('hover'); }, ondragleave: () => dz.classList.remove('hover'),
    ondrop: e => { e.preventDefault(); dz.classList.remove('hover'); up([...e.dataTransfer.files]); } }, h('b', {}, '📎 Ajouter des fichiers'), h('span', { class: 'muted' }, 'Glissez-les ici ou cliquez : devis, contrats, courriers, photos… (25 Mo max chacun)'), input);
  box.append(dz, info, listEl);
  apiFetch('/api/immo/files?aid=' + encodeURIComponent(aid)).then(r => r.json()).then(j => draw(j.files ?? [])).catch(() => draw([]));
  return box;
}
/** Fenêtre des pièces jointes d'une action (depuis le badge 📎 d'une ligne). */
function filesModal(a) {
  modal('📎 Pièces jointes — ' + shortLabel(a.label, 60), [attachBox(a.id)], close => [h('button', { class: 'btn', onclick: () => { close(); commit(); } }, 'Fermer')], true);
}
