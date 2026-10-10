'use strict';
// ============ Gestion documentaire : tous les documents des biens et ceux non affectés ============
// Affecter un document à un bien, le qualifier (catégorie, date, étiquettes, note), trier, sélectionner, agir sur la sélection, chercher dans le contenu.
let gd = { bien: 'all', kind: '', tag: '', q: '', sel: new Set(), upBien: '_inbox', upKind: 'autre' };
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
  const bulk = (label, fn, cls = 'sec') => h('button', { class: 'btn sm ' + cls, disabled: !nSel, onclick: fn }, label);
  const moveSel = sel(biens.concat([{ id: '_inbox', nom: 'Non affectés', icone: '📥' }]).map(b => h('option', { value: b.id }, (b.icone || '🏠') + ' ' + b.nom)), '', () => {}, { maxWidth: '220px' });
  const kindSel = sel(kinds.map(k => h('option', { value: k.id }, k.icon + ' ' + k.label)), '', () => {}, { maxWidth: '200px' });
  const tagIn = h('input', { type: 'text', placeholder: 'étiquette', maxlength: 24, style: { width: '120px' } });
  const done = async (p, msg) => { const j = await p; if (j) { gd.sel = new Set(); toast(msg(j.count)); render(); } };
  const allOn = rows.length > 0 && rows.every(d => gd.sel.has(gdKey(d)));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Documents', h('small', {}, rows.length + ' document(s)' + (hits ? ' contenant « ' + gd.q.trim() + ' »' : ''))),
    h('div', { class: 'toolbar', style: { margin: '0 0 10px' } },
      h('button', { class: 'btn sm sec', onclick: () => { gd.sel = allOn ? new Set() : new Set(rows.map(gdKey)); render(); } }, allOn ? '☐ Tout désélectionner' : '☑ Tout sélectionner'),
      h('span', { class: 'muted' }, nSel ? nSel + ' sélectionné(s)' : 'Sélectionnez des documents pour agir en groupe'),
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
        return h('tr', { class: gd.sel.has(k) ? 'rowcalled' : '' },
          h('td', {}, h('input', { type: 'checkbox', checked: gd.sel.has(k), onchange: e => { e.target.checked ? gd.sel.add(k) : gd.sel.delete(k); render(); } })),
          h('td', {}, sel([h('option', { value: '_inbox', selected: d.bien === '_inbox' }, '📥 Non affecté'), ...biens.map(b => h('option', { value: b.id, selected: d.bien === b.id }, (b.icone || '🏠') + ' ' + b.nom))], d.bien, async x => { if (await gdAction(one(), { action: 'move', to: x })) { toast('Document affecté'); render(); } })),
          h('td', {}, h('a', { class: 'doclink', href: gdUrl(d), target: '_blank' }, d.name)),
          h('td', {}, sel(kinds.map(x => h('option', { value: x.id, selected: d.kind === x.id }, x.icon + ' ' + x.label)), d.kind, async x => { if (await gdAction(one(), { action: 'meta', kind: x })) render(); })),
          h('td', {}, h('input', { type: 'date', value: d.date || '', onchange: async e => { if (await gdAction(one(), { action: 'meta', date: e.target.value })) render(); } })),
          tags,
          h('td', {}, h('input', { type: 'text', value: d.note || '', maxlength: 300, placeholder: 'Note…', style: { minWidth: '140px', width: '100%' }, onchange: async e => { await gdAction(one(), { action: 'meta', note: e.target.value }); } })),
          ex, h('td', { class: 'r muted nw' }, fmtBytes(d.size)), h('td', { class: 'muted num nw' }, fdate(d.at.slice(0, 10))),
          h('td', { class: 'r nw' }, h('a', { class: 'icon-btn', title: 'Ouvrir', href: gdUrl(d), target: '_blank', style: { textDecoration: 'none' } }, '👁️'), h('a', { class: 'icon-btn', title: 'Télécharger', href: gdUrl(d, true), style: { textDecoration: 'none' } }, '⬇️')));
      })))) : h('div', { class: 'empty', style: { padding: '18px' } }, hits ? 'Aucun document ne contient ce texte.' : 'Aucun document dans ce périmètre : déposez des PDF ci-dessus.')));
}
