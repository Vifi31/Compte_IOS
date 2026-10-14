'use strict';
// ============ Gestion documentaire : tous les documents des biens et ceux non affectés ============
// Affecter un document à un bien, le qualifier (catégorie, date, étiquettes, note), trier, sélectionner, agir sur la sélection, chercher dans le contenu.
let gd = { open: (() => { try { return JSON.parse(localStorage.getItem('gdopen')) ?? {}; } catch { return {}; } })(), bien: 'all', kind: '', tag: '', q: '', sel: new Set(), upBien: '_inbox', upKind: 'autre' };
const gdKey = d => d.bien + '|' + d.name;
const gdUrl = (d, dl) => '/api/biens/' + encodeURIComponent(d.bien) + '/documents?name=' + encodeURIComponent(d.name) + (dl ? '&download=1' : '');

async function gdAction(items, body) {
  const r = await fetch('/api/biens/library/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: items.map(d => ({ bien: d.bien, name: d.name })), ...body }) });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Action impossible')); return false; }
  BS = null; await biensLoad(); return j;
}

async function pageBiensDocs(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  await biensLoad(); if (S.page !== 'biens-docs') return;
  const lib = await (await fetch('/api/biens/library')).json(); if (S.page !== 'biens-docs') return; v.innerHTML = '';
  const kinds = lib.kinds, kLabel = id => kinds.find(k => k.id === id)?.label ?? 'Autre', kIcon = id => kinds.find(k => k.id === id)?.icon ?? '📎';
  const biens = lib.biens, all = lib.docs;
  if (gd.bien !== 'all' && gd.bien !== '_inbox' && !biens.some(b => b.id === gd.bien)) gd.bien = 'all';
  const nInbox = all.filter(d => d.bien === '_inbox').length;

  // recherche plein texte (corpus du périmètre choisi) : restreint la liste et fournit les extraits
  let hits = null;
  if (gd.q.trim()) { try { const j = await (await fetch('/api/biens/corpus?bien=' + encodeURIComponent(gd.bien) + '&q=' + encodeURIComponent(gd.q.trim()))).json(); hits = new Map((j.docs ?? []).map(d => [gdKey(d), d])); } catch { hits = new Map(); } }
  const rows = all.filter(d => (gd.bien === 'all' || d.bien === gd.bien) && (!gd.kind || d.kind === gd.kind) && (!gd.tag || d.tags.includes(gd.tag)) && (!hits || hits.has(gdKey(d))));
  gd.sel = new Set([...gd.sel].filter(k => all.some(d => gdKey(d) === k)));
  const selDocs = () => all.filter(d => gd.sel.has(gdKey(d)));

  // -- périmètre et filtres
  const bienOpt = (id, label, n) => h('option', { value: id, selected: gd.bien === id }, label + ' (' + n + ')');
  const sel = (opts, cur, cb, st = {}) => h('select', { style: st, onchange: e => cb(e.target.value) }, opts);
  v.append(h('div', { class: 'toolbar', style: { marginBottom: '14px' } },
    sel([bienOpt('all', '🗂️ Tous les documents', all.length), bienOpt('_inbox', '📥 Non affectés', nInbox), ...biens.map(b => bienOpt(b.id, (b.icone || '🏠') + ' ' + b.nom, all.filter(d => d.bien === b.id).length))], gd.bien, x => { gd.bien = x; gd.sel = new Set(); render(); }, { maxWidth: '290px', fontWeight: 600 }),
    sel([h('option', { value: '' }, 'Toutes les catégories'), ...kinds.map(k => h('option', { value: k.id, selected: gd.kind === k.id }, k.icon + ' ' + k.label))], gd.kind, x => { gd.kind = x; render(); }),
    sel([h('option', { value: '' }, 'Toutes les étiquettes'), ...lib.tags.map(t => h('option', { value: t, selected: gd.tag === t }, '# ' + t))], gd.tag, x => { gd.tag = x; render(); }),
    h('input', { type: 'search', class: 'grow', style: { minWidth: '240px' }, placeholder: '🔍 Chercher dans le contenu des documents du périmètre…', value: gd.q, 'data-fk': 'gdq',
      onkeydown: e => { if (e.key === 'Enter') { gd.q = e.target.value; render(); } }, onchange: e => { gd.q = e.target.value; render(); } }),
    h('button', { class: 'btn sm sec', onclick: () => bKindsModal() }, '🏷️ Gérer les catégories')));

  // -- indicateurs par bien (corpus distinct par bien)
  v.append(h('div', { class: 'chips', style: { marginBottom: '14px' } },
    h('button', { class: 'chip toggle' + (gd.bien === '_inbox' ? ' on' : ''), style: gd.bien === '_inbox' ? { background: '#64748b' } : {}, onclick: () => { gd.bien = gd.bien === '_inbox' ? 'all' : '_inbox'; render(); } }, '📥 Non affectés · ' + nInbox),
    ...biens.map(b => h('button', { class: 'chip toggle' + (gd.bien === b.id ? ' on' : ''), style: gd.bien === b.id ? { background: bienOf(b.id)?.couleur || '#6366f1' } : {}, onclick: () => { gd.bien = gd.bien === b.id ? 'all' : b.id; render(); } }, (b.icone || '🏠') + ' ' + b.nom + ' · ' + all.filter(d => d.bien === b.id).length))));

  // -- catégories de documents : libellés modifiables, ajout, suppression (enregistrement immédiat)
  const saveKinds = async list => {
    const r = await fetch('/api/biens/kinds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kinds: list }) });
    const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Enregistrement impossible')); return false; }
    BS = j; toast('🏷️ Catégories enregistrées'); render(); return true;
  };
  const count = id => all.filter(d => d.kind === id).length, newLab = h('input', { type: 'text', placeholder: 'Nouvelle catégorie (ex. Syndic & AG)', maxlength: 40, style: { flex: 1, minWidth: '200px' } }), newIc = h('input', { type: 'text', value: '📎', maxlength: 4, style: { width: '56px', textAlign: 'center' } });
  const addKind = () => { const l = newLab.value.trim(); if (!l) return newLab.focus(); saveKinds([...kinds.filter(k => k.id !== 'autre'), { id: '', label: l, icon: newIc.value.trim() || '📎' }, ...kinds.filter(k => k.id === 'autre')]); };
  newLab.addEventListener('keydown', e => { if (e.key === 'Enter') addKind(); });
  v.append(h('details', { class: 'card', style: { marginTop: 0, padding: '10px 16px' }, },
    h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, '🏷️ Catégories de documents', h('small', { class: 'muted', style: { marginLeft: '8px', fontWeight: 400 } }, kinds.length + ' catégories · modifier, ajouter, supprimer')),
    h('div', { style: { marginTop: '10px' } }, kinds.map((k, i) => h('div', { class: 'toolbar', style: { margin: '0 0 6px', flexWrap: 'nowrap' } },
      h('input', { type: 'text', value: k.icon, maxlength: 4, title: 'Icône', style: { width: '56px', textAlign: 'center' }, onchange: e => saveKinds(kinds.map(x => (x.id === k.id ? { ...x, icon: e.target.value.trim() || '📎' } : x))) }),
      h('input', { type: 'text', value: k.label, maxlength: 40, style: { flex: 1 }, onchange: e => { const l = e.target.value.trim(); if (!l) { e.target.value = k.label; return; } saveKinds(kinds.map(x => (x.id === k.id ? { ...x, label: l } : x))); } }),
      h('span', { class: 'muted nw', style: { width: '90px', textAlign: 'right' } }, count(k.id) + ' document(s)'),
      k.id === 'autre' ? h('span', { class: 'muted', style: { width: '34px', textAlign: 'center' }, title: 'Catégorie de repli, non supprimable' }, '🔒')
        : h('button', { class: 'icon-btn', title: 'Supprimer (les documents passent en « Autre »)', onclick: () => { if (confirm('Supprimer la catégorie « ' + k.label + ' » ?' + (count(k.id) ? '\n' + count(k.id) + ' document(s) passeront en « Autre ».' : ''))) saveKinds(kinds.filter(x => x.id !== k.id)); } }, '🗑️'))),
      h('div', { class: 'toolbar', style: { margin: '10px 0 0', flexWrap: 'nowrap' } }, newIc, newLab, h('button', { class: 'btn sm', onclick: addKind }, '＋ Ajouter la catégorie')))));

  // -- dépôt
  const input = h('input', { type: 'file', accept: 'application/pdf', multiple: true, style: { display: 'none' }, onchange: e => up([...e.target.files]) });
  const up = async files => {
    let n = 0;
    for (const f of files.filter(f => /\.pdf$/i.test(f.name))) {
      const r = await fetch('/api/biens/' + encodeURIComponent(gd.upBien) + '/documents?kind=' + encodeURIComponent(gd.upKind) + '&name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await f.arrayBuffer() });
      const j = await r.json(); if (r.ok) n++; else toast('⚠️ ' + f.name + ' : ' + (j.error || 'dépôt impossible'));
    }
    if (n) toast('📥 ' + n + ' document(s) déposé(s)'); BS = null; render();
  };
  const dz = h('div', { class: 'dropzone', style: { marginTop: 0 }, onclick: () => input.click(), ondragover: e => { e.preventDefault(); dz.classList.add('hover'); }, ondragleave: () => dz.classList.remove('hover'),
    ondrop: e => { e.preventDefault(); dz.classList.remove('hover'); up([...e.dataTransfer.files]); } }, h('div', { style: { fontSize: '22px' } }, '📥'), h('b', {}, 'Déposer des PDF'), h('span', { class: 'muted' }, 'Glissez-les ici ou cliquez ; ils sont indexés pour la recherche'), input);
  v.append(h('div', { class: 'card', style: { marginTop: 0 } }, h('h2', {}, 'Ajouter des documents'),
    h('div', { class: 'toolbar' },
      h('div', { class: 'field', style: { margin: 0 } }, h('label', {}, 'Affecter à'), sel([h('option', { value: '_inbox', selected: gd.upBien === '_inbox' }, '📥 Non affecté (à classer plus tard)'), ...biens.map(b => h('option', { value: b.id, selected: gd.upBien === b.id }, (b.icone || '🏠') + ' ' + b.nom))], gd.upBien, x => { gd.upBien = x; })),
      h('div', { class: 'field', style: { margin: 0 } }, h('label', {}, 'Catégorie'), sel(kinds.map(k => h('option', { value: k.id, selected: gd.upKind === k.id }, k.icon + ' ' + k.label)), gd.upKind, x => { gd.upKind = x; }))), dz));

  // -- actions sur la sélection
  const nSel = gd.sel.size;
  const bulk = (label, fn, cls = 'sec') => h('button', { class: 'btn sm gdbulk ' + cls, disabled: !nSel, onclick: fn }, label);
  const moveSel = sel(biens.concat([{ id: '_inbox', nom: 'Non affectés', icone: '📥' }]).map(b => h('option', { value: b.id }, (b.icone || '🏠') + ' ' + b.nom)), '', () => {}, { maxWidth: '220px' });
  const kindSel = sel(kinds.map(k => h('option', { value: k.id }, k.icon + ' ' + k.label)), '', () => {}, { maxWidth: '200px' });
  const tagIn = h('input', { type: 'text', placeholder: 'étiquette', maxlength: 24, style: { width: '120px' } });
  const done = async (p, msg) => { const j = await p; if (j) { gd.sel = new Set(); toast(msg(j.count)); render(); } };
  const allOn = rows.length > 0 && rows.every(d => gd.sel.has(gdKey(d)));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Documents', h('small', {}, rows.length + ' document(s)' + (hits ? ' contenant « ' + gd.q.trim() + ' »' : ''))),
    h('div', { class: 'toolbar', style: { margin: '0 0 10px' } },
      h('button', { class: 'btn sm sec gdselall' }, allOn ? '☐ Tout désélectionner' : '☑ Tout sélectionner'),
      h('span', { class: 'muted gdsel' }, nSel ? nSel + ' sélectionné(s)' : 'Sélectionnez des documents pour agir en groupe'),
      moveSel, bulk('🏠 Affecter', () => done(gdAction(selDocs(), { action: 'move', to: moveSel.value }), n => n + ' document(s) affecté(s)')),
      kindSel, bulk('🏷️ Catégorie', () => done(gdAction(selDocs(), { action: 'meta', kind: kindSel.value }), n => n + ' document(s) reclassé(s)')),
      tagIn, bulk('＋ Étiquette', () => { if (!tagIn.value.trim()) return tagIn.focus(); done(gdAction(selDocs(), { action: 'meta', addTags: [tagIn.value] }), n => 'Étiquette ajoutée à ' + n + ' document(s)'); }),
      bulk('− Étiquette', () => { if (!tagIn.value.trim()) return tagIn.focus(); done(gdAction(selDocs(), { action: 'meta', removeTags: [tagIn.value] }), n => 'Étiquette retirée de ' + n + ' document(s)'); }),
      bulk('🗑️ Supprimer', () => { if (confirm('Supprimer définitivement ' + nSel + ' document(s) ?')) done(gdAction(selDocs(), { action: 'delete' }), n => n + ' document(s) supprimé(s)'); }, '')),
    rows.length ? h('div', { class: 'tablewrap', style: { maxHeight: '560px' } }, h('table', {},
      bTh('', 'Affecté à', 'Document', 'Catégorie', 'Date du document', 'Étiquettes', 'Note', ...(hits ? ['Extraits'] : []), ['Taille', 'r'], 'Ajouté', ''),
      h('tbody', {}, rows.map(d => {
        const k = gdKey(d), one = () => [d];
        const tags = h('td', {}, ...d.tags.map(t => h('span', { class: 'chip', style: { marginRight: '4px' } }, '# ' + t, h('button', { class: 'icon-btn', style: { padding: '0 2px' }, title: 'Retirer', onclick: () => gdAction(one(), { action: 'meta', removeTags: [t] }).then(render) }, '✕'))),
          h('button', { class: 'btn sm sec', title: 'Ajouter une étiquette', onclick: async () => { const t = prompt('Nouvelle étiquette (24 caractères max) :'); if (t && t.trim()) { await gdAction(one(), { action: 'meta', addTags: [t] }); render(); } } }, '＋'));
        const ex = hits ? h('td', { style: { fontSize: '12px', maxWidth: '380px' } }, (hits.get(k)?.excerpts ?? []).slice(0, 2).join(' | ')) : null;
        return h('tr', { class: gd.sel.has(k) ? 'rowcalled' : '', 'data-k': k },
          h('td', {}, h('input', { type: 'checkbox', checked: gd.sel.has(k) })),
          h('td', {}, sel([h('option', { value: '_inbox', selected: d.bien === '_inbox' }, '📥 Non affecté'), ...biens.map(b => h('option', { value: b.id, selected: d.bien === b.id }, (b.icone || '🏠') + ' ' + b.nom))], d.bien, async x => { if (await gdAction(one(), { action: 'move', to: x })) { toast('Document affecté'); render(); } })),
          h('td', {}, h('a', { class: 'doclink', href: gdUrl(d), target: '_blank' }, d.name)),
          h('td', {}, sel(kinds.map(x => h('option', { value: x.id, selected: d.kind === x.id }, x.icon + ' ' + x.label)), d.kind, async x => { if (await gdAction(one(), { action: 'meta', kind: x })) render(); })),
          h('td', {}, h('input', { type: 'date', value: d.date || '', onchange: async e => { if (await gdAction(one(), { action: 'meta', date: e.target.value })) render(); } })),
          tags,
          h('td', {}, h('input', { type: 'text', value: d.note || '', maxlength: 300, placeholder: 'Note…', style: { minWidth: '140px', width: '100%' }, onchange: async e => { await gdAction(one(), { action: 'meta', note: e.target.value }); } })),
          ex, h('td', { class: 'r muted nw' }, fmtBytes(d.size)), h('td', { class: 'muted num nw' }, fdate(d.at.slice(0, 10))),
          h('td', { class: 'r nw' }, h('a', { class: 'icon-btn', title: 'Ouvrir', href: gdUrl(d), target: '_blank', style: { textDecoration: 'none' } }, '👁️'), h('a', { class: 'icon-btn', title: 'Télécharger', href: gdUrl(d, true), style: { textDecoration: 'none' } }, '⬇️')));
      })))) : h('div', { class: 'empty', style: { padding: '18px' } }, hits ? 'Aucun document ne contient ce texte.' : 'Aucun document dans ce périmètre : déposez des PDF ci-dessus.')));
  gdSelUi(v);
  gdFold(v);
}

/** Sélection sans réaffichage : cases de lignes et d'en-tête, « Tout sélectionner » limité aux lignes affichées (filtres de colonnes), compteur et boutons à jour. */
function gdSelUi(v) {
  const tbl = v.querySelector('table'); if (!tbl) return;
  const th0 = tbl.tHead.rows[0].cells[0], head = h('input', { type: 'checkbox', class: 'gdall', title: 'Sélectionner les lignes affichées' }); th0.append(head);
  const vis = () => [...tbl.tBodies[0].rows].filter(r => r.dataset.k && r.style.display !== 'none');
  const refresh = () => {
    const n = gd.sel.size, shown = vis(), hidden = [...gd.sel].filter(k => !shown.some(r => r.dataset.k === k)).length, allOn = shown.length > 0 && shown.every(r => gd.sel.has(r.dataset.k));
    const info = v.querySelector('.gdsel'); if (info) info.textContent = n ? n + ' sélectionné(s)' + (hidden ? ' (dont ' + hidden + ' masqué(s) par un filtre)' : '') : 'Sélectionnez des documents pour agir en groupe';
    v.querySelectorAll('.gdbulk').forEach(b => { b.disabled = !n; });
    head.checked = allOn; const sa = v.querySelector('.gdselall'); if (sa) sa.textContent = allOn ? '☐ Tout désélectionner' : '☑ Tout sélectionner';
    for (const r of tbl.tBodies[0].rows) if (r.dataset.k) { const on = gd.sel.has(r.dataset.k); r.classList.toggle('rowcalled', on); const cb = r.querySelector('input[type=checkbox]'); if (cb && cb.checked !== on) cb.checked = on; }
  };
  const setRows = on => { for (const r of vis()) on ? gd.sel.add(r.dataset.k) : gd.sel.delete(r.dataset.k); refresh(); };
  tbl.addEventListener('change', e => {
    const cb = e.target; if (cb.type !== 'checkbox') return;
    if (cb.classList.contains('gdall')) return setRows(cb.checked);
    const r = cb.closest('tr'); if (!r?.dataset.k) return; cb.checked ? gd.sel.add(r.dataset.k) : gd.sel.delete(r.dataset.k); refresh();
  });
  const sa = v.querySelector('.gdselall'); if (sa) sa.onclick = () => { const shown = vis(); setRows(!(shown.length > 0 && shown.every(r => gd.sel.has(r.dataset.k)))); };
  // filtres, tri et pagination du tableau : le compteur suit les lignes affichées
  const zone = tbl.closest('.gdbody') ?? v; zone.addEventListener('input', () => setTimeout(refresh, 30)); zone.addEventListener('click', () => setTimeout(refresh, 80)); zone.addEventListener('change', () => setTimeout(refresh, 80));
  setTimeout(refresh, 150);
}

/** Rend chaque partie de l'écran pliable : filtres, catégories, dépôt, liste. L'état (plié / déplié) est conservé d'un affichage à l'autre. */
function gdFold(v) {
  const save = () => { try { localStorage.setItem('gdopen', JSON.stringify(gd.open)); } catch { /* stockage indisponible */ } };
  const det = (id, title, nodes) => {
    const d = h('details', { class: 'card gdfold', style: { marginTop: '14px', padding: '10px 16px' }, open: gd.open[id] !== false, 'data-gd': id, ontoggle: e => { if (e.target !== d) return; gd.open[id] = d.open; save(); } },
      h('summary', {}, title), h('div', { class: 'gdbody' }, ...nodes));
    return d;
  };
  const kids = [...v.children], top = kids.filter(k => k.classList.contains('toolbar') || k.classList.contains('chips'));
  if (top.length) { const ph = document.createElement('span'); top[0].before(ph); ph.replaceWith(det('filtres', h('b', {}, '🔎 Périmètre et filtres'), top)); }
  for (const k of [...v.children]) {
    if (k.dataset?.gd) continue;
    if (k.tagName === 'DETAILS') { // bloc des catégories : même mécanique d'état
      k.classList.add('gdfold'); k.dataset.gd = 'cats'; k.open = gd.open.cats === true; k.ontoggle = e => { if (e.target !== k) return; gd.open.cats = k.open; save(); }; continue;
    }
    if (k.classList.contains('card')) {
      const h2 = k.querySelector(':scope > h2'); if (!h2) continue;
      const id = /Ajouter/.test(h2.textContent) ? 'ajout' : /Documents/.test(h2.textContent) ? 'docs' : 'p' + [...v.children].indexOf(k);
      const rest = [...k.childNodes].filter(n => n !== h2); h2.style.margin = '0'; h2.style.display = 'inline-block';
      k.replaceWith(det(id, h2, rest));
    }
  }
  const all = () => [...v.querySelectorAll(':scope > details.gdfold')], setAll = o => { all().forEach(d => { d.open = o; }); all().forEach(d => { gd.open[d.dataset.gd] = o; }); save(); };
  v.prepend(h('div', { class: 'toolbar', style: { margin: '0 0 4px', justifyContent: 'flex-end' } }, h('button', { class: 'btn sm sec', onclick: () => setAll(false) }, '▸ Tout plier'), h('button', { class: 'btn sm sec', onclick: () => setAll(true) }, '▾ Tout déplier')));
}
