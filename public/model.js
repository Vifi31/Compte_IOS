'use strict';
// ============ Administration › Modèle : paramétrage réutilisable (sans données personnelles) ============
async function mdApi(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); } return j;
}

async function pageModel(v) {
  const D = await mdApi('/api/model/sections');
  if (S.page !== 'model') return;
  const st = S.md ??= { name: 'Mon modèle Comptes', description: '', sel: new Set(Object.keys(D.sections)) };
  const secList = (selSet, onToggle, avail) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, Object.entries(D.sections).filter(([k]) => !avail || avail.includes(k)).map(([k, label]) =>
    h('label', { class: 'schedon', style: { cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: selSet.has(k), onchange: e => onToggle(k, e.target.checked) }), h('span', {}, label))));

  v.append(h('div', { class: 'tip', style: { marginBottom: '16px' } }, 'Un ', h('b', {}, 'modèle'), ' est un fichier de paramétrage réutilisable : catégories, règles, menus, modèles de prompt… Il ',
    h('b', {}, 'ne contient aucune donnée personnelle'), ' (ni opérations, ni relevés, ni comptes, ni clé API). Il sert à démarrer une autre installation avec la même configuration, ou à revenir à un paramétrage connu.'));

  // ---- exporter
  v.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h2', {}, '⬆️ Créer un modèle depuis cette installation'),
      h('div', { class: 'field' }, h('label', {}, 'Nom du modèle'), h('input', { type: 'text', value: st.name, oninput: e => { st.name = e.target.value; } })),
      h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, 'Description'), h('input', { type: 'text', value: st.description, placeholder: 'Facultatif', oninput: e => { st.description = e.target.value; } })),
      h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, 'Contenu du modèle'), secList(st.sel, (k, on) => { on ? st.sel.add(k) : st.sel.delete(k); })),
      h('div', { class: 'toolbar', style: { margin: '14px 0 0' } }, h('button', { class: 'btn', onclick: async () => {
        if (!st.sel.size) return toast('Choisissez au moins un élément');
        const r = await fetch('/api/model/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: st.name, description: st.description, sections: [...st.sel] }) });
        const blob = await r.blob(); const file = 'modele-' + (st.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'comptes') + '.json';
        const a = h('a', { href: URL.createObjectURL(blob), download: file }); document.body.append(a); a.click(); a.remove(); toast('✅ Modèle exporté : ' + file);
      } }, '⬇ Exporter le modèle (.json)'))),

    // ---- importer
    h('div', { class: 'card' }, h('h2', {}, '⬇️ Appliquer un modèle'),
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Chargez un fichier .json, ou utilisez le modèle d’origine. Un aperçu des changements est présenté avant validation et une sauvegarde « Données » est créée automatiquement.'),
      h('div', { class: 'toolbar', style: { margin: 0 } },
        (() => { const f = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onchange: async () => { try { importModel(JSON.parse(await f.files[0].text()), D); } catch (e) { toast('⚠️ Fichier illisible : ' + e.message); } } }); return h('span', {}, f, h('button', { class: 'btn', onclick: () => f.click() }, '📂 Choisir un fichier de modèle')); })(),
        h('button', { class: 'btn sec', onclick: () => importModel(D.builtin, D) }, '🏭 Modèle d’origine')))));
}

function importModel(model, D) {
  if (model?.schema !== 'comptes-model/1') return toast('⚠️ Ce fichier n’est pas un modèle Comptes');
  const avail = Object.keys(model.content), sel = new Set(model.sections?.filter(k => avail.includes(k)) ?? avail); let mode = 'merge';
  const out = h('div'), modeSeg = h('div', { class: 'seg' });
  const preview = async () => {
    try { const r = await mdApi('/api/model/preview', 'POST', { model, sections: [...sel], mode }); out.innerHTML = ''; out.append(r.summary.length ? h('ul', { style: { margin: 0, paddingLeft: '20px', lineHeight: 1.7 } }, r.summary.map(s => h('li', {}, s))) : h('p', { class: 'muted' }, 'Aucun élément sélectionné.')); } catch (e) { out.textContent = e.message; }
  };
  const drawMode = () => { modeSeg.innerHTML = ''; [['merge', 'Fusionner (ajoute et met à jour)'], ['replace', 'Remplacer (catégories et règles)']].forEach(([k, l]) => modeSeg.append(h('button', { class: mode === k ? 'on' : '', onclick: () => { mode = k; drawMode(); preview(); } }, l))); };
  drawMode(); preview();
  modal('Appliquer le modèle « ' + model.name + ' »', [
    model.description ? h('p', { class: 'muted', style: { margin: 0 } }, model.description) : null,
    h('div', { class: 'field' }, h('label', {}, 'Éléments à appliquer'), h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, avail.map(k => h('label', { class: 'schedon', style: { cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: sel.has(k), onchange: e => { e.target.checked ? sel.add(k) : sel.delete(k); preview(); } }), D.sections[k] ?? k)))),
    avail.some(k => k === 'categories' || k === 'rules') ? h('div', { class: 'field' }, h('label', {}, 'Catégories et règles'), modeSeg) : null,
    h('div', { class: 'field' }, h('label', {}, 'Changements prévus'), out),
    h('div', { class: 'tip warn' }, 'Une sauvegarde « Données » de l’état actuel est créée avant l’application, pour pouvoir revenir en arrière (page Sauvegardes).'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: async () => {
    if (!sel.size) return toast('Rien à appliquer');
    const r = await mdApi('/api/model/import', 'POST', { model, sections: [...sel], mode }); close(); S.data = await api('/api/state'); toast('✅ Modèle appliqué · sauvegarde : ' + r.safety); render();
  } }, 'Appliquer le modèle')], true);
}
