'use strict';
// ============ Immobilier : sous-projets (regroupement coloré des tâches) ============
// P.sousProjets = [{ id, nom, couleur }] ; une tâche appartient à un sous-projet par a.sp (id). Sans sous-projet : a.sp absent.
const SP_PAL = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];
const SP_NONE = '#94a3b8';
const spList = P => P.sousProjets ?? [];
const spOf = (P, a) => spList(P).find(s => s.id === a.sp) ?? null;
const spColor = (P, a) => spOf(P, a)?.couleur ?? null;
/** Groupes d'affichage : les sous-projets puis « Sans sous-projet » (id vide). */
const spGroups = P => [...spList(P), { id: '', nom: 'Sans sous-projet', couleur: SP_NONE }];
const spKey = (P, a) => spOf(P, a)?.id ?? '';
/** Pastille colorée du sous-projet d'une tâche (null si aucun). */
function spTag(P, a, small) {
  const s = spOf(P, a); if (!s) return null;
  return h('span', { class: 'sptag' + (small ? ' sm' : ''), style: { '--sp': s.couleur }, title: 'Sous-projet : ' + s.nom }, s.nom);
}
/** Attributs de ligne : liseré coloré à gauche. */
const spRowAttrs = (P, a) => { const c = spColor(P, a); return c ? { 'data-sp': a.sp, style: { '--sp': c } } : {}; };

/** Légende / filtre : une pastille par sous-projet avec avancement ; clic = filtrer. st = état d'écran (S.immoAct), clé st.sp. */
function spFilterBar(P, A, st) {
  if (!spList(P).length) return h('div', { class: 'spbar muted' }, 'Aucun sous-projet : regroupez vos tâches par thème avec ', h('button', { class: 'btn sm sec', onclick: () => spModal(P) }, '🎨 Gérer les sous-projets'));
  const chip = (id, nom, col, list) => {
    const dn = list.filter(a => a.statut === 'fait').length, pct = list.length ? Math.round(dn / list.length * 100) : 0, on = (st.sp || '') === id;
    return h('button', { class: 'spchip' + (on ? ' on' : ''), style: { '--sp': col }, title: `${nom} : ${dn}/${list.length} faites (${pct} %) — cliquer pour ${on ? 'tout afficher' : 'filtrer'}`, onclick: () => { st.sp = on ? '' : id; render(); } },
      h('i'), h('b', {}, nom), h('span', { class: 'n' }, `${dn}/${list.length}`), h('span', { class: 'bar' }, h('u', { style: { width: pct + '%' } })));
  };
  return h('div', { class: 'spbar' },
    ...spGroups(P).filter(g => g.id || A.some(a => !spOf(P, a))).map(g => chip(g.id || '__none', g.nom, g.couleur, A.filter(a => spKey(P, a) === g.id))),
    h('button', { class: 'btn sm sec', title: 'Créer, renommer, colorer les sous-projets', onclick: () => spModal(P) }, '🎨 Gérer'));
}
const spPass = (P, a, st) => !st.sp || (st.sp === '__none' ? !spOf(P, a) : a.sp === st.sp);

/** Liste déroulante de choix du sous-projet (édition d'une tâche). */
function spSelect(P, d, onSet) {
  const sel = h('select', { onchange: e => { d.sp = e.target.value || undefined; onSet?.(); } }, h('option', { value: '' }, '— aucun —'), spList(P).map(s => h('option', { value: s.id, selected: d.sp === s.id }, s.nom)));
  const dot = h('span', { class: 'spdot' }); const upd = () => { dot.style.background = spColor(P, d) || 'transparent'; }; upd(); sel.addEventListener('change', upd);
  return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, dot, sel);
}

/** Fenêtre de gestion des sous-projets : nom, couleur, nombre de tâches, suppression (les tâches deviennent « sans sous-projet »). */
function spModal(P) {
  const list = spList(P).map(s => ({ ...s })), box = h('div', {});
  const nOf = id => P.actions.filter(a => a.sp === id).length;
  const draw = () => {
    box.innerHTML = '';
    list.forEach((s, i) => box.append(h('div', { class: 'sprow' },
      h('input', { type: 'color', value: s.couleur, title: 'Couleur', onchange: e => { s.couleur = e.target.value; draw(); } }),
      h('input', { type: 'text', value: s.nom, maxlength: 40, style: { flex: 1 }, onchange: e => { s.nom = e.target.value.trim() || s.nom; } }),
      h('span', { class: 'swatches' }, SP_PAL.map(c => h('button', { type: 'button', class: 'sw' + (c === s.couleur ? ' on' : ''), style: { background: c }, title: c, onclick: () => { s.couleur = c; draw(); } }))),
      h('span', { class: 'muted nw', style: { width: '64px', textAlign: 'right' } }, nOf(s.id) + ' tâche(s)'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Monter', disabled: i === 0, onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } }, '▲'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Descendre', disabled: i === list.length - 1, onclick: () => { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } }, '▼'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Dupliquer ce sous-projet (avec ses tâches si vous le souhaitez)', onclick: () => {
        const n = nOf(s.id), withTasks = n > 0 && confirm(`Dupliquer aussi les ${n} tâche(s) de « ${s.nom} » ?\n\nOK = avec les tâches (statut « à faire », enchaînements recréés)\nAnnuler = sous-projet vide`);
        const root = s.nom.replace(/ \(copie( \d+)?\)$/, ''); let nom = root + ' (copie)', k = 1; while (list.some(x => x.nom === nom)) nom = root + ` (copie ${++k})`;
        list.splice(i + 1, 0, { id: uid(), nom, couleur: SP_PAL.find(c => !list.some(x => x.couleur === c)) ?? SP_PAL[list.length % SP_PAL.length], from: withTasks ? s.id : null }); draw();
      } }, '⧉'),
      h('button', { class: 'icon-btn', type: 'button', title: 'Supprimer (les tâches restent, sans sous-projet)', onclick: () => { if (nOf(s.id) && !confirm(`Supprimer « ${s.nom} » ? Ses ${nOf(s.id)} tâche(s) resteront, sans sous-projet.`)) return; list.splice(i, 1); draw(); } }, '🗑️'))));
    if (!list.length) box.append(h('div', { class: 'muted', style: { fontSize: '12.5px', margin: '0 0 8px' } }, 'Aucun sous-projet. Exemples : Financement, Terrain, Construction, Déménagement, Vente du bien actuel.'));
    box.append(h('button', { class: 'btn sm sec', type: 'button', onclick: () => { list.push({ id: uid(), nom: 'Nouveau sous-projet', couleur: SP_PAL.find(c => !list.some(s => s.couleur === c)) ?? SP_PAL[list.length % SP_PAL.length] }); draw(); } }, '＋ Ajouter un sous-projet'));
  };
  draw();
  modal('🎨 Sous-projets', [h('p', { class: 'muted', style: { margin: '0 0 10px' } }, 'Un sous-projet regroupe des tâches sous un thème et une couleur. Cette couleur se retrouve dans le suivi, le plan d’actions, le diagramme de Gantt et le rapport PDF. Affectez une tâche avec ✏️ ou le sélecteur de sa ligne.'), box],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: () => {
      const names = list.map(s => s.nom.trim().toLowerCase()); if (new Set(names).size !== names.length) return toast('⚠️ Deux sous-projets portent le même nom');
      const ids = new Set(list.map(s => s.id)); for (const a of P.actions) if (a.sp && !ids.has(a.sp)) delete a.sp;
      let copied = 0; for (const s of list) if (s.from) { copied += duplicateSpTasks(P, s.from, s.id); delete s.from; }
      P.sousProjets = list; close(); toast('🎨 Sous-projets enregistrés' + (copied ? ` · ${copied} tâche(s) dupliquée(s)` : '')); commit();
    } }, 'Enregistrer')]);
}
