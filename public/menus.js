'use strict';
// ============ Menus : groupes, libellés, déplacements, création, affichage, ordre ============
const NAV_GROUPS = [
  { id: 'main', label: '', items: [['dashboard', '📊', 'Tableau de bord'], ['operations', '🧾', 'Opérations'], ['stats', '📈', 'Statistiques'], ['compare', '⚖️', 'Comparer'], ['forecast', '🔮', 'Prévisions'], ['reports', '📄', 'Rapports PDF']] },
  { id: 'analyse', label: 'Analyse', icon: '🧠', items: [['analyse', '🧠', 'Analyse IA'], ['ai', '🔌', 'Paramètres IA']] },
  { id: 'data', label: 'Gestion Données', icon: '🗂️', items: [['categories', '🏷️', 'Catégories'], ['accounts', '🏦', 'Comptes'], ['statements', '🗃️', 'Relevés']] },
  { id: 'immo', label: 'Immobilier', icon: '🏗️', items: [['immo', '🏗️', 'Projet VEFA'], ['immo-params', '⚙️', 'Paramètres'], ['immo-planning', '🗓️', 'Planning et simulation'], ['immo-suivi', '📈', 'Suivi'], ['immo-actions', '✅', 'Plan d’actions'], ['immo-ai', '🧠', 'Analyse IA']] },
  { id: 'admin', label: 'Administration', icon: '⚙️', items: [['backups', '💾', 'Sauvegardes'], ['versions', '🏷️', 'Versions'], ['prompts', '📜', 'Prompt'], ['license', '©️', 'Licence'], ['manifest', '📋', 'Manifeste'], ['model', '🧬', 'Modèle'], ['techdocs', '🛠️', 'Documentation technique'], ['menus', '🎛️', 'Affichage des menus', true]] },
  { id: 'help', label: '', items: [['docs', '📘', 'Documentation']] },
];
const menuCfg = () => ({ hidden: [], order: {}, groupOrder: [], labels: {}, icons: {}, moves: {}, customGroups: [], ...(S.data?.menu ?? {}) });
const rank = (list, id) => { const i = (list ?? []).indexOf(id); return i < 0 ? 1000 : i; };

/** Structure effective du menu : groupes de base + groupes créés, entrées déplacées, libellés personnalisés. */
function navModel(cfg = menuCfg()) {
  const groups = NAV_GROUPS.map((g, i) => ({ id: g.id, defLabel: g.label, defIcon: g.icon ?? '', label: g.label ? (cfg.labels['g:' + g.id] ?? g.label) : '', icon: cfg.icons['g:' + g.id] ?? g.icon ?? '', base: true, idx: i, items: [] }));
  cfg.customGroups.forEach((g, i) => groups.push({ id: g.id, defLabel: g.label, defIcon: g.icon, label: g.label, icon: g.icon, base: false, custom: true, idx: 100 + i, items: [] }));
  const byId = new Map(groups.map(g => [g.id, g]));
  for (const g of NAV_GROUPS) g.items.forEach((it, i) => {
    const tgt = byId.get(cfg.moves[it[0]]) ?? byId.get(g.id);
    tgt.items.push({ id: it[0], icon: cfg.icons[it[0]] ?? it[1], label: cfg.labels[it[0]] ?? it[2], locked: !!it[3], defLabel: it[2], defIcon: it[1], home: g.id, idx: i });
  });
  for (const g of groups) { g.items.sort((a, b) => rank(cfg.order[g.id], a.id) - rank(cfg.order[g.id], b.id) || (a.home === g.id ? 0 : 1) - (b.home === g.id ? 0 : 1) || a.idx - b.idx); g.locked = g.items.some(i => i.locked); }
  // ordre : celui de l'utilisateur ; un groupe nouveau (absent de sa liste) se place après son prédécesseur par défaut
  const defIds = groups.map(g => g.id), order = cfg.groupOrder.filter(id => byId.has(id));
  for (const id of defIds) if (!order.includes(id)) { let pos = -1; for (let i = defIds.indexOf(id) - 1; i >= 0; i--) { const p = order.indexOf(defIds[i]); if (p >= 0) { pos = p; break; } } order.splice(pos + 1, 0, id); }
  groups.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return groups;
}
const itemHidden = (it, cfg) => !it.locked && cfg.hidden.includes(it.id);
const groupHidden = (g, cfg) => !g.locked && cfg.hidden.includes('g:' + g.id);
function navLookup(id) { for (const g of navModel()) { const it = g.items.find(i => i.id === id); if (it) return { item: [it.id, it.icon, it.label], group: g }; } return null; }

function renderNav() {
  const nav = $('#nav'); nav.innerHTML = '';
  const cfg = menuCfg(), open = JSON.parse(localStorage.getItem('navOpen') || '{}');
  const link = it => h('a', { href: '#/' + it.id, class: it.id === S.page ? 'active' : '' }, h('span', { class: 'ico' }, it.icon), it.label);
  for (const g of navModel(cfg)) {
    if (groupHidden(g, cfg)) continue;
    const items = g.items.filter(it => !itemHidden(it, cfg));
    if (!items.length) continue;
    if (!g.label) { items.forEach(it => nav.append(link(it))); continue; }
    const hasActive = items.some(it => it.id === S.page), isOpen = open[g.id] ?? hasActive;
    nav.append(h('div', { class: 'navgroup' + (isOpen ? ' open' : '') },
      h('button', { class: 'navhead' + (hasActive ? ' has-active' : ''), onclick: () => { open[g.id] = !isOpen; localStorage.setItem('navOpen', JSON.stringify(open)); renderNav(); } },
        h('span', { class: 'ico' }, g.icon || '📁'), g.label, h('span', { class: 'chev' }, '▸')),
      isOpen ? h('div', { class: 'navsub' }, items.map(link)) : null));
  }
}
function setPageTitle() {
  const f = navLookup(S.page), t = $('#pageTitle'); t.innerHTML = '';
  if (f?.group.label) t.append(h('small', { class: 'crumb' }, f.group.label + ' ›'), ' ');
  t.append(f ? f.item[2] : '');
}

async function saveMenu(patch) {
  const cfg = { ...menuCfg(), ...patch };
  S.data.menu = cfg;
  api('/api/menu', 'PUT', cfg).catch(() => toast('⚠️ Enregistrement impossible'));
  render();
}

function pageMenus(v) {
  const cfg = menuCfg(), model = navModel(cfg);
  const move = (arr, id, d) => { const a = arr.slice(), i = a.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const toggle = (on, disabled, onch) => h('label', { class: 'switch', title: disabled ? 'Toujours affiché' : '' }, h('input', { type: 'checkbox', checked: on, disabled, onchange: e => onch(e.target.checked) }), h('span'));
  const arrows = (up, down) => h('span', { class: 'arrows' }, h('button', { class: 'icon-btn', title: 'Monter', onclick: up }, '▲'), h('button', { class: 'icon-btn', title: 'Descendre', onclick: down }, '▼'));
  const gOrder = model.map(g => g.id);
  // libellé / icône : champ texte, vide = valeur d'origine
  const setText = (key, val, def) => { const labels = { ...cfg.labels }; const t = val.trim(); if (!t || t === def) delete labels[key]; else labels[key] = t.slice(0, 40); saveMenu({ labels }); };
  const setIcon = (key, val, def) => { const icons = { ...cfg.icons }; const t = val.trim(); if (!t || t === def) delete icons[key]; else icons[key] = t.slice(0, 4); saveMenu({ icons }); };
  const textIn = (fk, val, def, onch, w) => h('input', { type: 'text', value: val, 'data-fk': fk, title: val !== def ? 'Libellé d’origine : ' + def : '', style: { width: w || 'auto', flex: 1, minWidth: 0, fontWeight: 500, borderColor: val !== def ? 'var(--primary)' : '' }, onchange: e => onch(e.target.value) });
  const iconIn = (fk, val, def, onch) => h('input', { type: 'text', value: val, 'data-fk': fk, maxlength: 4, style: { width: '46px', textAlign: 'center', fontSize: '17px', padding: '5px 4px' }, onchange: e => onch(e.target.value) });

  v.append(h('div', { class: 'tip', style: { marginBottom: '16px' } }, 'Personnalisez la barre latérale : ', h('b', {}, 'modifiez les libellés et icônes'), ' (champ vide = valeur d’origine), ', h('b', {}, 'déplacez une entrée d’un menu à l’autre'), ', masquez, réordonnez, et ',
    h('b', {}, 'créez de nouveaux menus'), ' (groupes déroulants). Cette page et son groupe restent toujours affichés.'));

  v.append(h('div', { class: 'toolbar' },
    h('button', { class: 'btn', onclick: () => newMenuModal(cfg) }, '＋ Nouveau menu'),
    h('button', { class: 'btn sec', onclick: () => saveMenu({ hidden: [], order: {}, groupOrder: [], labels: {}, icons: {}, moves: {}, customGroups: [] }) }, '↺ Tout rétablir par défaut'),
    h('button', { class: 'btn sec', onclick: () => { localStorage.setItem('navOpen', JSON.stringify(Object.fromEntries(model.filter(g => g.label).map(g => [g.id, true])))); render(); } }, 'Déplier tout'),
    h('button', { class: 'btn sec', onclick: () => { localStorage.setItem('navOpen', JSON.stringify(Object.fromEntries(model.filter(g => g.label).map(g => [g.id, false])))); render(); } }, 'Replier tout')));

  const destinations = model.map(g => [g.id, g.label || (g.id === 'main' ? 'Menus principaux (sans groupe)' : 'Aide (sans groupe)')]);
  v.append(h('div', { class: 'grid g2' }, ...model.map(g => {
    const gh = groupHidden(g, cfg), ids = g.items.map(i => i.id);
    const rows = g.items.map(it => h('div', { class: 'menurow' + (itemHidden(it, cfg) || gh ? ' off' : ''), style: { flexWrap: 'wrap' } },
      iconIn('ic:' + it.id, it.icon, it.defIcon, val => setIcon(it.id, val, it.defIcon)),
      textIn('lb:' + it.id, it.label, it.defLabel, val => setText(it.id, val, it.defLabel), '140px'),
      it.locked ? h('span', { class: 'badge' }, '🔒 fixe') : null,
      h('select', { title: 'Déplacer vers un autre menu', style: { maxWidth: '150px', padding: '5px 8px', fontSize: '12.5px' }, onchange: e => { const moves = { ...cfg.moves }; if (e.target.value === it.home) delete moves[it.id]; else moves[it.id] = e.target.value; saveMenu({ moves }); } },
        destinations.map(([id, label]) => h('option', { value: id, selected: id === g.id }, '→ ' + label))),
      arrows(() => saveMenu({ order: { ...cfg.order, [g.id]: move(ids, it.id, -1) } }), () => saveMenu({ order: { ...cfg.order, [g.id]: move(ids, it.id, 1) } })),
      toggle(!itemHidden(it, cfg), it.locked || gh, on => saveMenu({ hidden: on ? cfg.hidden.filter(x => x !== it.id) : [...cfg.hidden, it.id] }))));
    const title = g.label
      ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flex: 1 } }, iconIn('gic:' + g.id, g.icon || '📁', g.defIcon, val => g.custom ? saveMenu({ customGroups: cfg.customGroups.map(x => x.id === g.id ? { ...x, icon: val.trim().slice(0, 4) || '📁' } : x) }) : setIcon('g:' + g.id, val, g.defIcon)),
        textIn('glb:' + g.id, g.label, g.defLabel, val => g.custom ? (val.trim() && saveMenu({ customGroups: cfg.customGroups.map(x => x.id === g.id ? { ...x, label: val.trim().slice(0, 40) } : x) })) : setText('g:' + g.id, val, g.defLabel)))
      : h('span', { style: { flex: 1 } }, g.id === 'main' ? '📌 Menus principaux' : '📘 Aide');
    return h('div', { class: 'card' },
      h('h2', {}, title, h('span', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        arrows(() => saveMenu({ groupOrder: move(gOrder, g.id, -1) }), () => saveMenu({ groupOrder: move(gOrder, g.id, 1) })),
        g.label ? toggle(!gh, g.locked, on => saveMenu({ hidden: on ? cfg.hidden.filter(x => x !== 'g:' + g.id) : [...cfg.hidden, 'g:' + g.id] })) : null,
        g.custom ? h('button', { class: 'icon-btn', title: 'Supprimer ce menu', onclick: () => deleteMenuModal(g, cfg) }, '🗑️') : null)),
      h('div', { class: 'muted', style: { margin: '-6px 0 10px', fontSize: '12.5px' } }, g.label ? (g.custom ? 'Menu créé par vous' : 'Menu déroulant') + (g.locked ? ' · toujours affiché' : '') + (g.items.length ? '' : ' · vide : déplacez-y des entrées') : 'Entrées affichées sans regroupement'),
      rows.length ? rows : h('div', { class: 'empty', style: { padding: '14px' } }, 'Aucune entrée'));
  })));
}

function newMenuModal(cfg) {
  const d = { label: '', icon: '📁' };
  const nameIn = h('input', { type: 'text', placeholder: 'Ex : Outils', oninput: e => { d.label = e.target.value; } });
  const iconIn = h('input', { type: 'text', value: d.icon, maxlength: 4, style: { width: '70px', textAlign: 'center', fontSize: '18px' }, oninput: e => { d.icon = e.target.value.trim() || '📁'; } });
  modal('Nouveau menu', [
    h('div', { class: 'field' }, h('label', {}, 'Nom du menu'), nameIn),
    h('div', { class: 'field' }, h('label', {}, 'Icône'), (() => { const box = h('div'); const draw = () => { box.innerHTML = ''; box.append(emojiPicker(d.icon, e => { d.icon = e; iconIn.value = e; draw(); })); }; draw(); return box; })(), h('div', { style: { marginTop: '8px' } }, iconIn)),
    h('div', { class: 'tip' }, 'Le nouveau menu est vide : utilisez le sélecteur « → » d’une entrée pour l’y déplacer. Un menu vide n’apparaît pas dans la barre latérale.'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: () => {
    if (!d.label.trim()) return nameIn.focus();
    const id = 'cg' + Date.now().toString(36);
    saveMenu({ customGroups: [...cfg.customGroups, { id, label: d.label.trim().slice(0, 40), icon: d.icon }] }); close(); toast('Menu créé');
  } }, 'Créer le menu')]);
}
function deleteMenuModal(g, cfg) {
  modal('Supprimer le menu « ' + g.label + ' » ?', [h('p', {}, g.items.length ? `Ses ${g.items.length} entrée(s) retournent dans leur menu d’origine.` : 'Ce menu est vide.')],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn danger', onclick: () => {
      const moves = Object.fromEntries(Object.entries(cfg.moves).filter(([, to]) => to !== g.id)), order = { ...cfg.order }; delete order[g.id];
      saveMenu({ customGroups: cfg.customGroups.filter(x => x.id !== g.id), moves, order, groupOrder: cfg.groupOrder.filter(x => x !== g.id), hidden: cfg.hidden.filter(x => x !== 'g:' + g.id) }); close(); toast('Menu supprimé');
    } }, 'Supprimer')]);
}
