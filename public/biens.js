'use strict';
// ============ Biens immobiliers : données, page liste et page détail d'un bien ============
let BS = null; // { items } — état des biens (chargé du serveur)
const biensAll = () => BS?.items ?? [];
const bienOf = id => biensAll().find(b => b.id === id);
const bColors = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#10b981', '#0ea5e9', '#eab308', '#14b8a6'];

async function biensLoad() {
  if (BS) return BS;
  BS = await (await fetch('/api/biens')).json();
  setTimeout(() => bienMemoCats().then(n => { if (n) render(); }).catch(() => {}), 0);
  if (S.bi == null) S.bi = localStorage.getItem('bienId') || null;
  if (S.bi && !bienOf(S.bi)) S.bi = null;
  if (!S.bi && biensAll().length) S.bi = biensAll()[0].id;
  return BS;
}
async function bienPut(b) {
  const r = await fetch('/api/biens/' + encodeURIComponent(b.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Enregistrement impossible')); return; }
  BS = j;
}
/** Mémorise la catégorie de chaque opération rattachée (une fois) pour qu'elle ne change plus avec les règles globales. */
async function bienMemoCats() {
  let n = 0;
  for (const b of biensAll()) {
    const memo = b.opCats ??= {}; let ch = false;
    for (const o of bienOpsAll(b)) if (memo[o.id] === undefined && o.categoryId) { memo[o.id] = o.categoryId; ch = true; }
    if (ch) { await bienPut(b); n++; }
  }
  return n;
}
async function bienPost(b) {
  const r = await fetch('/api/biens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Création impossible')); return null; }
  BS = j; S.bi = j.created; localStorage.setItem('bienId', S.bi); return bienOf(S.bi);
}
const bGoto = id => { S.bi = id; localStorage.setItem('bienId', id); if (location.hash === '#/bien') render(); else location.hash = '#/bien'; };

// ---- enregistrement avec confort de saisie en tableau (recalcul à la sortie de ligne)
let bRowDirty = false, bRowTimer = null;
function bAfter(el, b, o = {}) {
  const row = !o.now && el.closest('tr');
  o.after?.();
  bienPut(b);
  if (!row) { setTimeout(render, 0); return; }
  bRowDirty = true; row.classList.add('editing');
  if (!row._wait) {
    row._wait = true;
    row.addEventListener('focusin', () => clearTimeout(bRowTimer));
    row.addEventListener('focusout', () => { clearTimeout(bRowTimer); bRowTimer = setTimeout(() => { if (!row.isConnected || row.contains(document.activeElement)) return; if (bRowDirty) { bRowDirty = false; render(); } }, 400); });
  }
}
function bBind(b, key, o = {}) {
  const t = o.type ?? 'text', num = t === 'number';
  return h('input', { type: t, value: b[key] ?? '', step: o.step ?? (num ? '1' : undefined), min: o.min, placeholder: o.ph, 'data-fk': o.fk, style: { width: o.w ?? '100%', textAlign: num ? 'right' : undefined },
    onchange: e => { const v = e.target.value; b[key] = num ? (v === '' ? null : +v) : v; bAfter(e.target, b, o); } });
}
const bSel = (b, key, options, o = {}) => h('select', { 'data-fk': o.fk, style: { width: o.w ?? '100%' }, onchange: e => { b[key] = e.target.value; bAfter(e.target, b, o); } }, Object.entries(options).map(([k, l]) => h('option', { value: k, selected: b[key] === k }, l)));
const bChk = (b, key, label, o = {}) => h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: !!b[key], onchange: e => { b[key] = e.target.checked; bAfter(e.target, b, o); } }), label);
const bFld = (label, el, hint) => h('div', { class: 'field' }, h('label', {}, label), el, hint ? h('div', { class: 'muted', style: { fontSize: '11.5px', marginTop: '3px' } }, hint) : null);
const bTh = (...c) => h('thead', {}, h('tr', {}, c.map((t, i) => h('th', { class: (Array.isArray(t) ? t[1] : '') || '' }, Array.isArray(t) ? t[0] : t))));
const bBadge = (text, color) => h('span', { class: 'badge', style: color ? { color, borderColor: color } : {} }, text);

/** Sélecteur du bien courant (en haut des pages détail / stats / estimation). */
function bienSelector(onchange) {
  const sel = h('select', { style: { maxWidth: '290px', fontWeight: 600 }, onchange: e => onchange(e.target.value) },
    biensAll().map(b => h('option', { value: b.id, selected: b.id === S.bi }, `${b.icone || '🏠'} ${b.nom}${b.ville ? ' · ' + b.ville : ''}`)));
  return sel;
}
const bCard = (color, title, ...kids) => h('div', { class: 'card ccard', style: { '--ac': color } }, h('h2', {}, title), ...kids);
const bPair = (...c) => h('div', { class: 'pair' }, ...c);

// ====================================================== Page liste
async function pageBiens(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  await biensLoad(); if (S.page !== 'biens') return; v.innerHTML = '';
  const items = biensAll();
  if (!items.length) {
    v.append(h('div', { class: 'card empty', style: { marginTop: '18px', padding: '34px' } },
      h('div', { style: { fontSize: '38px' } }, '🏘️'),
      h('h2', { style: { margin: '8px 0 4px' } }, 'Aucun bien immobilier pour le moment'),
      h('p', { class: 'muted', style: { maxWidth: '620px', margin: '0 auto 16px' } }, 'Décrivez vos biens (appartement, maison, terrain…), rattachez leurs dépenses via les catégories de vos relevés, déposez vos PDF (actes, quittances, factures), suivez les totaux par période et estimez leur valeur à partir des ventes réelles de la commune (données DVF officielles).'),
      h('div', { class: 'toolbar', style: { justifyContent: 'center', margin: 0 } },
        h('button', { class: 'btn', onclick: () => bienEditModal(null) }, '＋ Nouveau bien'),
        h('button', { class: 'btn sec', onclick: bienExemple }, '🧪 Créer un bien d’exemple'))));
    return;
  }
  // -- indicateurs globaux
  const totVal = sum(items.map(bienValeur)), opsOf = new Map(items.map(b => [b, bienOps(b)])), totDep = sum(items.map(b => bienOpsTotal(b, opsOf.get(b))));
  const nDocs = sum(items.map(b => (b.docs ?? []).length));
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Biens', String(items.length), `${items.filter(b => b.statut === 'detenu').length} détenus · ${items.filter(b => b.statut === 'projet').length} en projet`, '🏘️'),
    kpi('k4', 'Valeur estimée', eur0(totVal), items.every(b => !b.estimations?.length) ? 'prix d’achat faute d’estimation' : `${items.filter(b => b.estimations?.length).length} bien(s) estimé(s)`, '💰'),
    kpi('k1', 'Dépenses rattachées', eur0(totDep), `${sum(items.map(b => opsOf.get(b).filter(o => o.amount < 0).length))} opération(s) · toutes périodes`, '🔗'),
    kpi('k2', 'Documents', String(nDocs), 'PDF rattachés aux biens', '📎')));
  v.append(h('div', { class: 'toolbar', style: { marginTop: '16px' } },
    h('button', { class: 'btn', onclick: () => bienEditModal(null) }, '＋ Nouveau bien'),
    h('span', { class: 'muted' }, 'Cliquez sur un bien pour le détailler : définition, dépenses rattachées (par catégorie) et documents.')));

  // -- cartes des biens
  const grid = h('div', { class: 'bgrid' });
  for (const b of items) {
    const v_ = bienValeur(b), bornes = bornesValeur(b), ops = opsOf.get(b), rend = bienRendement(b);
    grid.append(h('div', { class: 'card bcard', style: { '--ac': b.couleur || '#6366f1' }, onclick: () => bGoto(b.id) },
      h('div', { class: 'bhead' },
        h('span', { class: 'bico' }, b.icone || '🏠'),
        h('div', { style: { minWidth: 0, flex: 1 } },
          h('div', { class: 'bname' }, h('span', { class: 'nm' }, b.nom), b.statut !== 'detenu' ? bBadge(B_STATUTS[b.statut] ?? b.statut, b.statut === 'projet' ? '#f59e0b' : '#94a3b8') : null),
          h('div', { class: 'muted', style: { fontSize: '12.5px' } }, `${B_TYPES[b.type] ?? ''}${b.ville ? ' · ' + b.ville + (b.codePostal ? ' (' + b.codePostal + ')' : '') : ''}`)),
        h('button', { class: 'icon-btn', title: 'Modifier la fiche', onclick: e => { e.stopPropagation(); bienEditModal(b); } }, '✏️')),
      h('div', { class: 'bvals' },
        h('div', {}, h('div', { class: 'tl' }, 'Valeur'), h('div', { class: 'tv' }, eur0(v_)), bornes ? h('div', { class: 'ts' }, `mini ${eur0(bornes.mini)} · maxi ${eur0(bornes.maxi)}`) : h('div', { class: 'ts' }, 'non estimé')),
        h('div', {}, h('div', { class: 'tl' }, 'Dépenses rattachées'), h('div', { class: 'tv' }, eur0(bienOpsTotal(b, ops))), h('div', { class: 'ts' }, `${ops.filter(o => o.amount < 0).length} opération(s)`)),
        h('div', {}, h('div', { class: 'tl' }, 'Surface'), h('div', { class: 'tv' }, `${b.surface || 0} m²`), h('div', { class: 'ts' }, b.pieces ? b.pieces + ' pièce(s)' : '—'))),
      h('div', { class: 'bfoot' },
        bBadge(`${B_USAGES[b.usage] ?? ''}`, null),
        (b.catIds ?? []).length ? bBadge('🏷️ ' + b.catIds.length + ' catégorie(s)', '#ec4899') : null,
        b.docs?.length ? bBadge('📎 ' + b.docs.length + ' PDF', '#0ea5e9') : null,
        rend > 0 ? bBadge('📈 ' + pc1b(rend) + ' brut', '#10b981') : null)));
  }
  v.append(grid);
  // -- comparatif
  if (items.length > 1) {
    v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Comparatif des biens', h('small', {}, 'valeur estimée et dépenses rattachées')),
      h('div', { class: 'chart-box' }, h('canvas', { id: 'bgAll' }))));
    chart($('#bgAll'), { data: { labels: items.map(b => b.nom), datasets: [
      { type: 'bar', label: 'Valeur estimée', data: items.map(b => Math.round(bienValeur(b))), backgroundColor: items.map(b => b.couleur || '#6366f1'), borderRadius: 6, yAxisID: 'y' },
      { type: 'line', label: 'Dépenses rattachées', data: items.map(b => Math.round(bienOpsTotal(b, opsOf.get(b)))), borderColor: '#f97316', backgroundColor: '#f97316', borderWidth: 3, pointRadius: 4, yAxisID: 'y1' }] },
      options: { scales: { y: { ticks: { callback: eurTick } }, y1: { position: 'right', grid: { display: false }, ticks: { callback: eurTick } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } } });
  }
}

/** Bien d'exemple : présentation des différentes rubriques avec des valeurs fictives. */
function bienExemple() {
  const t = todayIso();
  bienPost({
    nom: 'Exemple : T3 en copropriété', type: 'appartement', statut: 'detenu', usage: 'residence', icone: '🏠', couleur: '#6366f1',
    ville: 'Votre commune', codePostal: '', commune: '', adresse: '', surface: 68, terrain: 0, pieces: 3, etage: '2e', annee: '1985', etat: 'bon', dpe: 'D',
    exterieur: true, garage: false, ascenseur: true, description: 'Bien d’exemple : modifiez chaque valeur (l’enregistrement est automatique).',
    dateAchat: addM(t, -36), prixAchat: 185000, valeurActuelle: null, loyerMensuel: 0,
    credit: { actif: true, montant: 160000, tauxPct: 1.5, dureeMois: 240, assurancePct: 0.3, debut: addM(t, -36) },
    accroche: [{ id: uid(), pattern: 'SYNDIC' }, { id: uid(), pattern: 'TAXE FONCIERE' }], catIds: [], opIds: [], docKinds: {}, estimations: [],
  }).then(() => { toast('🧪 Bien d’exemple créé'); render(); });
}

// ====================================================== Page détail
async function pageBien(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  await biensLoad(); if (S.page !== 'bien') return; v.innerHTML = '';
  if (!biensAll().length) { location.hash = '#/biens'; return; }
  const b = bienOf(S.bi) ?? biensAll()[0]; S.bi = b.id;

  // -- bandeau + actions
  v.append(h('div', { class: 'toolbar', style: { marginBottom: '14px' } },
    bienSelector(id => bGoto(id)),
    h('button', { class: 'btn sec', onclick: () => bienEditModal(b) }, '✏️ Modifier la fiche'),
    h('button', { class: 'btn sec', onclick: () => { location.hash = '#/biens-estimation'; } }, '🧮 Estimer la valeur'),
    h('button', { class: 'btn pdf', onclick: () => bienPdf(b) }, '📄 Dossier PDF'),
    h('span', { style: { marginLeft: 'auto' } }, h('button', { class: 'btn sec', onclick: () => bienDeleteModal(b) }, '🗑️'))));
  v.append(h('div', { style: { marginBottom: '14px' } }, h('a', { class: 'doclink', href: '#/biens' }, '← Tous les biens')));

  // -- indicateurs
  const bornes = bornesValeur(b), mens = bienMensualite(b.credit);
  const ops = bienOps(b), opsTot = bienOpsTotal(b, ops), rend = bienRendement(b);
  const R = bienRentabilite(b), hasRev = R.source !== 'aucun';
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Valeur estimée', eur0(bienValeur(b)), bornes ? `fourchette ${eur0(bornes.mini)} → ${eur0(bornes.maxi)}` : (b.prixAchat ? 'prix d’achat (aucune estimation)' : 'à estimer'), '💰'),
    kpi('k1', 'Dépenses rattachées', eur0(opsTot), `${ops.filter(o => o.amount < 0).length} opération(s) · ${eur0(R.dep)} sur 12 mois`, '🔗'),
    kpi(mens > 0 ? 'k2' : 'k4', 'Crédit', mens > 0 ? eur0(mens) + '/mois' : 'Aucun', mens > 0 ? `${eur0(b.credit.montant)} à ${pc1b(b.credit.tauxPct)} sur ${b.credit.dureeMois} mois` : 'pas de prêt en cours', '🏦'),
    kpi(R.brut > 0 ? 'k2' : 'k3', 'Rendement brut', R.brut > 0 ? pc1b(R.brut) : '—', R.source === 'reel' ? `${eur0(R.rev)} de loyers perçus sur 12 mois` : R.source === 'declare' ? `loyer déclaré ${eur0(b.loyerMensuel)} / mois` : 'non loué', '📈')));
  if (hasRev) v.append(h('div', { class: 'grid g4', style: { marginTop: '12px' } },
    kpi(R.cout > 0 ? 'k1' : 'k2', 'Coût net de détention', (R.cout > 0 ? '' : '−') + eur0(Math.abs(R.cout)), `dépenses − revenus · 12 mois${R.cout <= 0 ? ' (le bien se finance)' : ''}`, '🧾'),
    kpi(R.net >= 0 ? 'k2' : 'k1', 'Résultat net 12 mois', (R.net >= 0 ? '+' : '−') + eur0(Math.abs(R.net)), `${eur0(R.rev)} de revenus − ${eur0(R.dep)} de dépenses`, '⚖️'),
    kpi(R.net >= 0 ? 'k2' : 'k1', 'Rendement net', pc1b(R.netPct), 'résultat net / valeur du bien', '📊'),
    kpi(R.cash >= 0 ? 'k2' : 'k1', 'Cash-flow mensuel', (R.cash >= 0 ? '+' : '−') + eur0(Math.abs(R.cash)), R.couverture != null ? `couverture des dépenses ${pc1b(R.couverture)}` : 'aucune dépense', '💶')));

  // -- fiche + répartition des dépenses rattachées
  const kv = rows => h('dl', { class: 'kv', style: { gridTemplateColumns: '150px 1fr' } }, rows.flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)]));
  const fiche = kv([
    ['Adresse', [b.adresse, b.codePostal, b.ville].filter(Boolean).join(', ') || '—'],
    ['Commune', b.commune ? b.ville + ' (INSEE ' + b.commune + ')' : (b.ville || '—')],
    ['Caractéristiques', [b.surface ? b.surface + ' m²' : null, b.pieces ? b.pieces + ' pièce(s)' : null, b.terrain ? 'terrain ' + b.terrain + ' m²' : null, b.etage || null, b.annee ? 'construit en ' + b.annee : null].filter(Boolean).join(' · ') || '—'],
    ['État & DPE', [b.etat ? B_ETATS[b.etat] : null, b.dpe ? 'DPE ' + b.dpe : null].filter(Boolean).join(' · ') || '—'],
    ['Atouts', [b.exterieur ? 'extérieur' : null, b.garage ? 'garage' : null, b.ascenseur ? 'ascenseur' : null, b.jardin ? 'jardin' : null].filter(Boolean).join(', ') || '—'],
    ['Achat', b.dateAchat ? `${fdate(b.dateAchat)}${b.prixAchat ? ' · ' + eur0(b.prixAchat) : ''}` : '—'],
    ['Loyer', b.loyerMensuel > 0 ? eur0(b.loyerMensuel) + ' / mois' : 'non loué'],
  ]);
  const C0 = cats(), catsAn = new Map();
  for (const o of ops) if (o.amount < 0) catsAn.set(o.categoryId, (catsAn.get(o.categoryId) ?? 0) - o.amount);
  const chRows = [...catsAn].sort((x, y) => y[1] - x[1]);
  const chargesCard = bCard('#10b981', '🧾 Dépenses par catégorie', h('div', { class: 'chart-box short' }, h('canvas', { id: 'bcDonut' })));
  v.append(bPair(bCard('#6366f1', '🏠 ' + (b.nom || 'Bien'), fiche,
    b.description ? h('p', { class: 'muted', style: { margin: '10px 0 0', fontSize: '12.5px', whiteSpace: 'pre-wrap' } }, b.description) : null), chargesCard));
  if (chRows.length) {
    vDonut($('#bcDonut'), chRows.map(([k]) => C0.get(k)?.name ?? 'Autre'), chRows.map(([, x]) => Math.round(x)), chRows.map(([k], i) => C0.get(k)?.color ?? bColors[i % bColors.length]), [eur0(opsTot), 'rattachées'], { cutout: '62%', legend: 'right', fmt: eur0 });
  } else {
    $('#bcDonut').closest('.chart-box').replaceWith(h('div', { class: 'empty', style: { padding: '14px' } }, 'Aucune dépense rattachée : choisissez des catégories ou des motifs ci-dessous.'));
  }

  // -- opérations bancaires rattachées
  v.append(bOpsCard(b, ops, opsTot));

  // -- documents PDF
  v.append(bDocsCard(b));
  v.append(corpusCard(b));
}

// ---- opérations bancaires rattachées
function bOpsCard(b) {
  const C = cats(), dep = bienOpsAll(b), ids = new Set(dep.map(o => o.id)), all = [...dep, ...bienRevAll(b).filter(o => !ids.has(o.id))], ops = all.filter(o => !o._excl);
  const opsTot = bienOpsTotal(b, ops), revTot = bienRevTotal(bienRev(b)), invest = b.usage && b.usage !== 'residence';
  const accroche = b.accroche ??= [];
  const revChips = (b.revCatIds ?? []).filter(id => C.get(id)).map(id => h('span', { class: 'chip toggle on', style: { background: C.get(id).color } }, C.get(id).icon + ' ' + C.get(id).name,
    h('button', { class: 'icon-btn', style: { padding: '0 2px', color: '#fff' }, title: 'Retirer', onclick: () => { b.revCatIds = b.revCatIds.filter(x => x !== id); bienPut(b).then(render); } }, '✕')));
  return bCard('#ec4899', '🔗 Opérations bancaires rattachées',
    h('p', { class: 'muted', style: { margin: '0 0 10px', fontSize: '12.5px' } }, 'Rattachez les dépenses du bien par catégorie (celles définies dans le menu Catégories), par mot-clé du libellé, ou opération par opération. Les totaux et statistiques par période utilisent ces montants réels.'),
    h('div', { class: 'muted', style: { fontSize: '12px', margin: '0 0 4px' } }, 'Catégories rattachées'),
    h('div', { class: 'chips', style: { marginBottom: '10px' } },
      (b.catIds ?? []).filter(id => C.get(id)).map(id => h('span', { class: 'chip toggle on', style: { background: C.get(id).color } }, C.get(id).icon + ' ' + C.get(id).name,
        h('button', { class: 'icon-btn', style: { padding: '0 2px', color: '#fff' }, title: 'Retirer', onclick: () => { b.catIds = b.catIds.filter(x => x !== id); bienPut(b); render(); } }, '✕'))),
      h('button', { class: 'btn sm sec', onclick: () => bienCatsModal(b) }, '＋ Catégories')),
    h('div', { class: 'muted', style: { fontSize: '12px', margin: '0 0 4px' } }, 'Mots-clés du libellé'),
    h('div', { class: 'chips', style: { marginBottom: '10px' } },
      accroche.map((a, i) => h('span', { class: 'chip toggle on', style: { background: b.couleur || '#6366f1' } }, '🔤 ' + a.pattern,
        h('button', { class: 'icon-btn', style: { padding: '0 2px', color: '#fff' }, title: 'Retirer', onclick: () => { accroche.splice(i, 1); bienPut(b); render(); } }, '✕'))),
      h('button', { class: 'btn sm sec', onclick: () => bienAccrocheModal(b) }, '＋ Motif')),
    invest || revChips.length ? h('div', {}, h('div', { class: 'muted', style: { fontSize: '12px', margin: '0 0 4px' } }, '💶 Catégories de revenus (loyers perçus)'),
      h('div', { class: 'chips', style: { marginBottom: '10px' } }, revChips, h('button', { class: 'btn sm sec', onclick: () => bRevCatsModal(b) }, '＋ Catégories de revenus'))) : null,
    bienOpsTable(all.map(o => ({ o, b })), { empty: 'Aucune opération rattachée : choisissez une catégorie, ajoutez un motif (ex. « SYNDIC ») ou rattachez des opérations à la main.', max: 200 }),
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, h('button', { class: 'btn sm', onclick: () => bienOpsPicker(b) }, '＋ Rattacher une opération'),
      h('span', { style: { marginLeft: 'auto' } }, h('b', {}, 'Dépenses ' + eur0(opsTot)), revChips.length ? [h('span', { class: 'muted' }, ' · '), h('b', { class: 'pos' }, 'Revenus ' + eur0(revTot)), h('span', { class: 'muted' }, ' · '), h('b', { class: revTot - opsTot >= 0 ? 'pos' : 'neg' }, 'Net ' + (revTot - opsTot >= 0 ? '+' : '−') + eur0(Math.abs(revTot - opsTot)))] : null, h('span', { class: 'muted' }, ` · ${ops.length} opération(s) comptée(s)${all.length > ops.length ? ' · ' + (all.length - ops.length) + ' exclue(s)' : ''}`))));
}
function bienCatsModal(b) {
  const C = [...cats().values()].filter(c => c.kind === 'expense'), sel = new Set(b.catIds ?? []);
  const list = h('div', { class: 'legend', style: { maxHeight: '380px' } });
  const draw = () => {
    list.innerHTML = '';
    if (!C.length) { list.append(h('div', { class: 'empty', style: { padding: '14px' } }, 'Aucune catégorie de dépense : créez-en dans le menu Catégories.')); return; }
    for (const c of C) {
      const on = sel.has(c.id);
      list.append(h('div', { class: 'lrow', style: { gridTemplateColumns: '34px 1fr auto' }, onclick: () => { on ? sel.delete(c.id) : sel.add(c.id); draw(); } },
        bubble(c), h('div', { class: 'name' }, c.name),
        h('span', { class: 'chip toggle' + (on ? ' on' : ''), style: on ? { background: c.color } : {} }, on ? '✓ rattachée' : 'rattacher')));
    }
  };
  draw();
  modal('Catégories de dépenses du bien', [
    h('p', { class: 'muted', style: { margin: 0 } }, 'Toutes les opérations de ces catégories (menu Catégories) sont comptées dans les dépenses du bien. Si une catégorie sert à plusieurs biens, préférez un mot-clé du libellé.'), list,
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: () => { b.catIds = [...sel]; bienPut(b); close(); render(); } }, 'Enregistrer')], true);
}
function bienAccrocheModal(b) {
  const inp = h('input', { type: 'text', placeholder: 'Ex : SYNDIC FONCIA, 12 RUE DES ÉCOLES…', autofocus: true });
  modal('Ajouter un motif de rattachement', [
    h('p', { class: 'muted', style: { margin: 0 } }, 'Toute opération dont le libellé contient ce texte (insensible à la casse) sera rattachée au bien.'),
    h('div', { class: 'field' }, h('label', {}, 'Texte à rechercher'), inp),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: () => { const t = inp.value.trim(); if (!t) return inp.focus(); (b.accroche ??= []).push({ id: uid(), pattern: t.slice(0, 60) }); bienPut(b); close(); toast('Motif ajouté'); render(); } }, 'Ajouter')]);
}
function bienOpsPicker(b) {
  const q = { text: '' };
  const list = h('div', { class: 'legend', style: { maxHeight: '380px' } });
  const draw = () => {
    const t = q.text.trim().toUpperCase(), C = cats();
    const rows = S.data.operations.filter(o => !t || `${o.title} ${o.label} ${o.details}`.toUpperCase().includes(t)).slice(-80).reverse();
    list.innerHTML = '';
    if (!rows.length) { list.append(h('div', { class: 'empty', style: { padding: '14px' } }, 'Aucune opération trouvée.')); return; }
    for (const o of rows) {
      const on = (b.opIds ?? []).includes(o.id);
      list.append(h('div', { class: 'lrow', style: { gridTemplateColumns: '34px 1fr auto auto' }, onclick: () => { b.opIds ??= []; if (on) b.opIds = b.opIds.filter(x => x !== o.id); else b.opIds.push(o.id); bienPut(b); draw(); } },
        h('div', { class: 'bubble', style: { background: tint(C.get(o.categoryId)?.color ?? '#94a3b8', .18) } }, C.get(o.categoryId)?.icon ?? '🧾'),
        h('div', {}, h('div', { class: 'name' }, o.title), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${fdate(o.date)} · ${C.get(o.categoryId)?.name ?? ''}`)),
        h('div', { class: 'amt ' + (o.amount < 0 ? 'neg' : 'pos') }, signed(o.amount)),
        h('span', { class: 'chip toggle' + (on ? ' on' : ''), style: on ? { background: b.couleur || '#6366f1' } : {} }, on ? '✓ rattachée' : 'rattacher')));
    }
  };
  const inp = h('input', { type: 'search', class: 'grow', placeholder: '🔍 Libellé, commerçant, montant…', oninput: e => { q.text = e.target.value; draw(); } });
  draw();
  modal('Rattacher des opérations au bien', [
    h('p', { class: 'muted', style: { margin: 0 } }, 'Cliquez sur une opération pour la rattacher (ou la détacher). Les opérations déjà rattachées par un motif sont indiquées « rattachées ».'),
    h('div', { class: 'toolbar' }, inp), list,
  ], close => [h('button', { class: 'btn', onclick: () => { close(); render(); } }, 'Terminer')], true);
}

// ---- documents PDF
let bDocSel = new Set(); // documents cochés pour une suppression groupée
let bUpKind = 'autre'; // nature appliquée aux prochains PDF déposés
function bDocsCard(b) {
  const docs = b.docs ?? [];
  bDocSel = new Set([...bDocSel].filter(n => docs.some(d => d.name === n)));
  const input = h('input', { type: 'file', accept: 'application/pdf', multiple: true, style: { display: 'none' }, onchange: e => uploadDocs(b, [...e.target.files]) });
  const dz = h('div', { class: 'dropzone', style: { marginTop: '2px' }, onclick: () => input.click(),
    ondragover: e => { e.preventDefault(); dz.classList.add('hover'); }, ondragleave: () => dz.classList.remove('hover'),
    ondrop: e => { e.preventDefault(); dz.classList.remove('hover'); uploadDocs(b, [...e.dataTransfer.files].filter(f => /\.pdf$/i.test(f.name))); } },
    h('div', { style: { fontSize: '24px' } }, '📥'), h('b', {}, 'Déposer des PDF du bien'),
    h('span', { class: 'muted' }, 'Acte, diagnostics, quittances, factures de travaux, avis d’imposition…'), input);
  const setKind = (doc, kind) => {
    b.docKinds = { ...(b.docKinds ?? {}), [doc.name]: kind };
    fetch('/api/biens/' + encodeURIComponent(b.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docKinds: b.docKinds }) })
      .then(r => r.json()).then(j => { if (j.items) BS = j; else toast('⚠️ ' + (j.error || 'Enregistrement impossible')); render(); }).catch(() => toast('⚠️ Enregistrement impossible'));
  };
  const list = docs.length ? h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', { style: { width: '30px' } }, h('input', { type: 'checkbox', title: 'Tout sélectionner', checked: docs.length > 0 && bDocSel.size === docs.length, onchange: e => { bDocSel = e.target.checked ? new Set(docs.map(d => d.name)) : new Set(); render(); } })), h('th', {}, 'Document'), h('th', {}, 'Nature'), h('th', { class: 'r' }, 'Taille'), h('th', {}, 'Ajouté'), h('th'))),
    h('tbody', {}, docs.map(d => {
      const url = '/api/biens/' + encodeURIComponent(b.id) + '/documents?name=' + encodeURIComponent(d.name);
      return h('tr', { class: bDocSel.has(d.name) ? 'rowcalled' : '' },
        h('td', {}, h('input', { type: 'checkbox', checked: bDocSel.has(d.name), onchange: e => { e.target.checked ? bDocSel.add(d.name) : bDocSel.delete(d.name); render(); } })),
        h('td', {}, h('b', {}, docKindIcon(d.kind)), ' ', d.name),
        h('td', { style: { width: '170px' } }, h('select', { onchange: e => setKind(d, e.target.value) }, docKinds().map(k => h('option', { value: k.id, selected: d.kind === k.id }, k.icon + ' ' + k.label)))),
        h('td', { class: 'r muted', style: { width: '80px' } }, fmtBytes(d.size)),
        h('td', { class: 'muted num', style: { width: '110px' } }, fdate(d.at.slice(0, 10))),
        h('td', { class: 'r', style: { whiteSpace: 'nowrap', width: '100px' } },
          h('a', { class: 'icon-btn', title: 'Ouvrir', target: '_blank', href: url, style: { textDecoration: 'none' } }, '👁️'),
          h('a', { class: 'icon-btn', title: 'Télécharger', href: url + '&download=1', style: { textDecoration: 'none' } }, '⬇️'),
          h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => { if (!confirm('Supprimer « ' + d.name + ' » ?')) return; delDoc(b, d.name); } }, '🗑️')));
    })))) : h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Aucun document pour ce bien.');
  const upSel = h('select', { title: 'Nature appliquée aux prochains PDF déposés', onchange: e => { bUpKind = e.target.value; } }, docKinds().map(k => h('option', { value: k.id, selected: bUpKind === k.id }, k.icon + ' ' + k.label)));
  const kindBar = h('div', { class: 'toolbar', style: { margin: '8px 0 0' } }, h('span', { class: 'muted' }, 'Catégorie des prochains PDF :'), upSel, h('button', { class: 'btn sm sec', onclick: () => bKindsModal() }, '🏷️ Gérer les catégories'), h('a', { class: 'doclink', href: '#/biens-docs' }, '🗂️ Gestion documentaire →'));
  const bar = docs.length ? h('div', { class: 'toolbar', style: { margin: '10px 0' } },
    h('button', { class: 'btn sm sec', onclick: () => { bDocSel = bDocSel.size === docs.length ? new Set() : new Set(docs.map(d => d.name)); render(); } }, bDocSel.size === docs.length ? '☐ Tout désélectionner' : '☑ Tout sélectionner'),
    h('button', { class: 'btn sm', disabled: !bDocSel.size, style: bDocSel.size ? { background: '#dc2626' } : {}, onclick: () => delDocs(b, [...bDocSel]) }, `🗑️ Supprimer la sélection${bDocSel.size ? ' (' + bDocSel.size + ')' : ''}`),
    h('span', { class: 'muted' }, 'Cochez plusieurs documents pour les supprimer en une fois.')) : null;
  return bCard('#0ea5e9', '📎 Documents PDF du bien', dz, kindBar, bar, list,
    h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, `${docs.length} document(s) · ${fmtBytes(sum(docs.map(d => d.size)))} · conservés dans le dossier Documents/Biens et inclus dans les sauvegardes « Données ».`));
}
async function uploadDocs(b, files) {
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name)) { toast('⚠️ ' + f.name + ' : ce n’est pas un PDF'); continue; }
    const r = await fetch('/api/biens/' + encodeURIComponent(b.id) + '/documents?kind=' + encodeURIComponent(bUpKind) + '&name=' + encodeURIComponent(f.name), { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: await f.arrayBuffer() });
    const j = await r.json();
    if (!r.ok) toast('⚠️ ' + (j.error || 'Dépôt impossible')); else toast('📥 ' + (j.name || f.name) + ' déposé');
  }
  BS = await (await fetch('/api/biens')).json(); render();
}
/** Suppression groupée de documents (confirmation unique). */
async function delDocs(b, names) {
  if (!names.length || !confirm(`Supprimer définitivement ${names.length} document${names.length > 1 ? 's' : ''} ?\n\n` + names.slice(0, 12).join('\n') + (names.length > 12 ? '\n…' : ''))) return;
  let ok = 0, last = null;
  for (const n of names) {
    const r = await fetch('/api/biens/' + encodeURIComponent(b.id) + '/documents?name=' + encodeURIComponent(n), { method: 'DELETE' });
    const j = await r.json(); if (r.ok) { ok++; last = j; } else toast('⚠️ ' + n + ' : ' + (j.error || 'suppression impossible'));
  }
  if (last?.items) BS = last; bDocSel = new Set();
  toast(`🗑️ ${ok} document${ok > 1 ? 's' : ''} supprimé${ok > 1 ? 's' : ''}`); render();
}
async function delDoc(b, name) {
  const r = await fetch('/api/biens/' + encodeURIComponent(b.id) + '/documents?name=' + encodeURIComponent(name), { method: 'DELETE' });
  const j = await r.json(); if (!r.ok) toast('⚠️ ' + (j.error || 'Suppression impossible')); else toast('🗑️ Document supprimé');
  BS = j.items ? j : BS; render();
}

// ====================================================== Fiche (modal)
function bienEditModal(b) {
  const isNew = !b;
  const d = isNew ? {
    nom: '', type: 'appartement', statut: 'projet', usage: 'residence', icone: '🏠', couleur: bColors[Math.floor(Math.random() * bColors.length)],
    adresse: '', codePostal: '', ville: '', commune: '', surface: null, terrain: null, pieces: null, etage: '', annee: '', etat: 'bon', dpe: 'D',
    exterieur: false, garage: false, ascenseur: false, jardin: false, dateAchat: '', prixAchat: null, valeurActuelle: null, loyerMensuel: 0,
    credit: { actif: false, montant: 0, tauxPct: 0, dureeMois: 240, assurancePct: 0, debut: '' }, description: '',
  } : JSON.parse(JSON.stringify(b));
  const geoOut = h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '6px' } }, d.commune ? `Commune reconnue : INSEE ${d.commune}` : 'Commune non identifiée (utile pour l’estimation DVF).');
  const geoRes = h('div', { class: 'legend', style: { maxHeight: '220px', marginTop: '6px' } });
  const geoSearch = async () => {
    geoRes.innerHTML = '';
    const nom = (d.ville || '').trim(), cpRaw = (d.codePostal || '').trim();
    const cpOk = !cpRaw || /^\d{5}$/.test(cpRaw), cp = cpOk ? cpRaw : '';
    if (!nom && !cpOk) { geoOut.textContent = '❌ Le code postal doit contenir 5 chiffres (ou saisissez la ville).'; return; }
    if (!nom && !cp) { geoOut.textContent = '❌ Renseignez la ville ou le code postal avant de lancer la recherche.'; return; }
    geoOut.textContent = '⏳ Recherche de la commune…';
    try {
      const j = await (await fetch('/api/biens/communes?nom=' + encodeURIComponent(nom) + '&cp=' + encodeURIComponent(cp))).json();
      if (j.error) { geoOut.textContent = '❌ ' + j.error; return; }
      if (!j.list?.length) { geoOut.textContent = '❌ Aucune commune trouvée : vérifiez le nom ou le code postal.'; return; }
      geoOut.textContent = '📍 Choisissez la commune correspondant à votre bien :';
      geoRes.append(...j.list.map(c => h('div', { class: 'lrow', onclick: () => {
        d.commune = c.code; d.ville = c.nom; d.codePostal = cp || c.cp;
        villeIn.value = c.nom; cpIn.value = d.codePostal; communeIn.value = c.code;
        geoRes.innerHTML = ''; geoOut.textContent = `✅ Commune reconnue : ${c.nom} (INSEE ${c.code})`;
      } },
        h('div', { class: 'bubble', style: { background: tint('#0ea5e9', .18) } }, '📍'),
        h('div', {}, h('div', { class: 'name' }, c.nom), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${c.codesPostaux.slice(0, 4).join(', ')} · ${c.population.toLocaleString('fr-FR')} hab.`)),
        h('div', { class: 'amt' }, c.code))));
    } catch (e) { geoOut.textContent = '❌ ' + (e.message || e); }
  };
  let closeModal = () => {};
  const villeIn = h('input', { type: 'text', value: d.ville, oninput: e => { d.ville = e.target.value; d.commune = ''; } });
  const cpIn = h('input', { type: 'text', value: d.codePostal, oninput: e => { d.codePostal = e.target.value; } });
  const communeIn = h('input', { type: 'text', value: d.commune, oninput: e => { d.commune = e.target.value; }, placeholder: 'ex : 49007' });
  const seg = (key, opts) => { const wrap = h('div', { class: 'seg' }); const draw = () => { wrap.innerHTML = ''; for (const [k, l] of Object.entries(opts)) wrap.append(h('button', { type: 'button', class: d[key] === k ? 'on' : '', onclick: () => { d[key] = k; draw(); } }, l)); }; draw(); return wrap; };
  const chkRow = (key, label) => h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: !!d[key], onchange: e => { d[key] = e.target.checked; } }), label);
  const numIn = (key, ph, step) => h('input', { type: 'number', step: step ?? '1', value: d[key] ?? '', placeholder: ph, oninput: e => { d[key] = e.target.value === '' ? null : +e.target.value; } });
  const C = d.credit;
  closeModal = modal(isNew ? 'Nouveau bien immobilier' : 'Modifier « ' + b.nom + ' »', [
    h('div', { class: 'grid g2', style: { gap: '12px' } },
      bFld('Nom du bien *', h('input', { type: 'text', value: d.nom, placeholder: 'Ex : T3 Bordeaux, Maison de famille…', oninput: e => { d.nom = e.target.value; } })),
      bFld('Icône', h('div', { style: { display: 'flex', gap: '8px' } }, h('input', { type: 'text', value: d.icone, maxlength: 4, style: { width: '58px', textAlign: 'center', fontSize: '17px' }, oninput: e => { d.icone = e.target.value.trim() || '🏠'; } }),
        h('select', { onchange: e => { d.couleur = e.target.value; } }, bColors.map(c2 => h('option', { value: c2, selected: d.couleur === c2 }, 'Couleur ' + c2)))))),
    h('div', { class: 'grid g3', style: { gap: '12px' } }, bFld('Type', seg('type', B_TYPES)), bFld('Statut', seg('statut', B_STATUTS)), bFld('Usage', seg('usage', B_USAGES))),
    h('div', { class: 'grid g3', style: { gap: '12px' } },
      bFld('Adresse', h('input', { type: 'text', value: d.adresse, placeholder: 'Rue, numéro…', oninput: e => { d.adresse = e.target.value; } })),
      bFld('Code postal', cpIn), bFld('Ville', villeIn)),
    h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' } },
      bFld('Code INSEE de la commune', communeIn, 'Requis pour l’estimation sur les ventes réelles.'),
      h('div', {}, h('label', {}, ' '), h('button', { class: 'btn sec', type: 'button', style: { width: '100%' }, onclick: geoSearch }, '📍 Trouver la commune')), h('div', {})),
    geoOut, geoRes,
    h('div', { class: 'grid g4', style: { gap: '12px', marginTop: '6px' } },
      bFld('Surface habitable (m²)', numIn('surface', '68', '0.5')), bFld('Terrain (m²)', numIn('terrain', '0')),
      bFld('Pièces', numIn('pieces', '3')), bFld('Étage', h('input', { type: 'text', value: d.etage, placeholder: 'ex : 2e, RDC…', oninput: e => { d.etage = e.target.value; } }))),
    h('div', { class: 'grid g4', style: { gap: '12px' } },
      bFld('Construction (année)', h('input', { type: 'text', value: d.annee, placeholder: 'ex : 1985', oninput: e => { d.annee = e.target.value; } })),
      bFld('État', h('select', { onchange: e => { d.etat = e.target.value; } }, Object.entries(B_ETATS).map(([k, l]) => h('option', { value: k, selected: d.etat === k }, l)))),
      bFld('DPE', h('select', { onchange: e => { d.dpe = e.target.value; } }, B_DPE.map(x => h('option', { value: x, selected: d.dpe === x }, x)))),
      h('div', { class: 'field' }, h('label', {}, 'Atouts'), h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '6px' } }, chkRow('exterieur', 'Extérieur'), chkRow('garage', 'Garage'), chkRow('ascenseur', 'Ascenseur'), chkRow('jardin', 'Jardin')))),
    h('div', { class: 'grid g4', style: { gap: '12px' } },
      bFld('Date d’achat / signature', h('input', { type: 'date', value: d.dateAchat, oninput: e => { d.dateAchat = e.target.value; } })),
      bFld('Prix d’achat (€)', numIn('prixAchat', '185000', '1000')), bFld('Valeur connue (€, facultatif)', numIn('valeurActuelle', '—', '1000'), 'Saisie libre si vous connaissez la valeur.'),
      bFld('Loyer mensuel (€)', numIn('loyerMensuel', '0', '50'))),
    h('h4', { style: { margin: '14px 0 8px', color: 'var(--primary)' } }, '🏦 Crédit en cours (facultatif)'),
    (() => { const w = h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer', marginBottom: '10px' } }, h('input', { type: 'checkbox', checked: !!C.actif, onchange: e => { C.actif = e.target.checked; } }), 'Ce bien est financé par un prêt'); return w; })(),
    h('div', { class: 'grid g4', style: { gap: '12px' } },
      bFld('Capital restant / emprunté (€)', h('input', { type: 'number', step: '1000', value: C.montant || '', oninput: e => { C.montant = +e.target.value || 0; } })),
      bFld('Taux annuel %', h('input', { type: 'number', step: '0.05', value: C.tauxPct || '', oninput: e => { C.tauxPct = +e.target.value || 0; } })),
      bFld('Durée (mois)', h('input', { type: 'number', value: C.dureeMois || '', oninput: e => { C.dureeMois = +e.target.value || 0; } })),
      bFld('Assurance %', h('input', { type: 'number', step: '0.05', value: C.assurancePct || '', oninput: e => { C.assurancePct = +e.target.value || 0; } }))),
    h('div', { class: 'field' }, h('label', {}, 'Notes'), h('textarea', { rows: 3, style: { width: '100%' }, oninput: e => { d.description = e.target.value; } }, d.description)),
    h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Mensualité estimée : ', h('b', {}, eur0(bienMensualite(C)) + ' / mois')),
  ], close => [
    h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => {
      if (!d.nom.trim()) { toast('⚠️ Le nom du bien est obligatoire'); return; }
      if (isNew) { const nb = await bienPost(d); if (nb) { toast('🏠 Bien créé'); location.hash = '#/bien'; } }
      else { await bienPut({ ...b, ...d }); toast('Bien enregistré'); render(); }
      close();
    } }, isNew ? 'Créer le bien' : 'Enregistrer'),
  ], true);
}
function bienDeleteModal(b) {
  modal('Supprimer « ' + b.nom + ' » ?', [
    h('p', {}, `Le bien et ses ${(b.docs ?? []).length} document(s) PDF seront supprimés définitivement (rattachements et estimations inclus).`),
    h('div', { class: 'tip warn' }, 'Pensez à faire une sauvergarde « Données » avant si vous souhaitez conserver une copie.'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn danger', onclick: async () => {
      const r = await fetch('/api/biens/' + encodeURIComponent(b.id), { method: 'DELETE' }); const j = await r.json();
      BS = j; S.bi = biensAll()[0]?.id ?? null; localStorage.setItem('bienId', S.bi ?? '');
      close(); toast('Bien supprimé'); location.hash = '#/biens'; render();
    } }, 'Supprimer')]);
}

// ====================================================== Dossier PDF du bien
function bienPdf(b) {
  const bornes = bornesValeur(b), mens = bienMensualite(b.credit);
  const ops = bienOps(b), est = (b.estimations ?? [])[0], C = cats(), rend = bienRendement(b);
  const catsAn = new Map();
  for (const o of ops) if (o.amount < 0) catsAn.set(o.categoryId, (catsAn.get(o.categoryId) ?? 0) - o.amount);
  const blocks = [
    { t: 'kpis', items: [
      { label: 'Valeur estimée', value: eur0(bienValeur(b)), sub: bornes ? `fourchette ${eur0(bornes.mini)} → ${eur0(bornes.maxi)}` : 'prix d’achat faute d’estimation', color: '#6366f1' },
      { label: 'Dépenses rattachées', value: eur0(bienOpsTotal(b, ops)), sub: `${ops.filter(o => o.amount < 0).length} opération(s)`, color: '#ef4444' },
      ...((b.revCatIds ?? []).length ? [{ label: 'Revenus locatifs', value: eur0(bienRevTotal(bienRev(b))), sub: `net ${eur0(bienRevTotal(bienRev(b)) - bienOpsTotal(b, ops))} · toutes périodes`, color: '#059669' }] : []),
      { label: 'Crédit', value: mens > 0 ? eur0(mens) + '/mois' : 'Aucun', sub: mens > 0 ? `${eur0(b.credit.montant)} à ${pc1b(b.credit.tauxPct)}` : '—', color: '#0ea5e9' },
      { label: 'Loyer', value: b.loyerMensuel > 0 ? eur0(b.loyerMensuel) + '/mois' : '—', sub: b.loyerMensuel > 0 ? 'rendement brut ' + pc1b(rend) : 'non loué', color: '#f97316' }] },
    { t: 'h2', text: 'Fiche du bien' },
    { t: 'table', columns: [{ title: 'Rubrique', w: 1.6 }, { title: 'Détail', w: 5 }], rows: [
      { cells: ['Bien', `${b.icone || ''} ${b.nom}`] }, { cells: ['Type / usage', `${B_TYPES[b.type] ?? ''} · ${B_USAGES[b.usage] ?? ''} · ${B_STATUTS[b.statut] ?? ''}`] },
      { cells: ['Adresse', [b.adresse, b.codePostal, b.ville].filter(Boolean).join(', ') || '—'] },
      { cells: ['Caractéristiques', [b.surface ? b.surface + ' m²' : null, b.pieces ? b.pieces + ' pièce(s)' : null, b.terrain ? 'terrain ' + b.terrain + ' m²' : null, b.etage, b.annee ? 'construit en ' + b.annee : null].filter(Boolean).join(' · ') || '—'] },
      { cells: ['État / DPE', [b.etat ? B_ETATS[b.etat] : null, b.dpe ? 'DPE ' + b.dpe : null].filter(Boolean).join(' · ') || '—'] },
      { cells: ['Atouts', [b.exterieur ? 'extérieur' : null, b.garage ? 'garage' : null, b.ascenseur ? 'ascenseur' : null, b.jardin ? 'jardin' : null].filter(Boolean).join(', ') || '—'] },
      { cells: ['Achat', b.dateAchat ? `${fdate(b.dateAchat)}${b.prixAchat ? ' · ' + eur0(b.prixAchat) : ''}` : '—'] },
      { cells: ['Loyer', b.loyerMensuel > 0 ? eur0(b.loyerMensuel) + ' / mois · rendement brut ' + pc1b(bienRendement(b)) : 'non loué'] },
      { cells: ['Rattachement bancaire', `${(b.catIds ?? []).map(id => C.get(id)?.name).filter(Boolean).join(', ') || 'aucune catégorie'} · ${(b.accroche ?? []).map(a => a.pattern).join(', ') || 'aucun motif'} · ${(b.opIds ?? []).length} opération(s) choisie(s) · ${eur0(bienOpsTotal(b, ops))}`] }] },
  ];
  if (est) blocks.push({ t: 'h2', text: 'Estimation de valeur' },
    { t: 'table', columns: [{ title: 'Repère', w: 2 }, { title: 'Montant', w: 1.4, align: 'right' }, { title: 'Détail', w: 3.6 }], rows: [
      { cells: ['Mini (25e centile)', eur0(est.mini), est.ppsmMini ? eur0(est.ppsmMini) + ' / m²' : ''] },
      { bold: true, cells: ['Estimation centrale', eur0(est.centre), est.ppsmCentre ? eur0(est.ppsmCentre) + ' / m² · ' + (est.source ?? 'DVF') : ''] },
      { cells: ['Maxi (75e centile)', eur0(est.maxi), est.ppsmMaxi ? eur0(est.ppsmMaxi) + ' / m²' : ''] },
      { cells: ['Échantillon', est.n ? est.n + ' vente(s) comparable(s)' : 'estimation manuelle', 'calculée le ' + fdate(est.date.slice(0, 10))] }] });
  if (catsAn.size) blocks.push({ t: 'h2', text: 'Dépenses rattachées par catégorie' },
    { t: 'hbars', items: [...catsAn].sort((x, y) => y[1] - x[1]).map(([k, val], i) => ({ label: C.get(k)?.name ?? 'Autre', value: val, text: eur0(val), color: C.get(k)?.color ?? bColors[i % bColors.length] })) },
    { t: 'table', columns: [{ title: 'Catégorie', w: 3 }, { title: 'Opérations', w: 1.2, align: 'right' }, { title: 'Total', w: 1.4, align: 'right' }], rows: [
      ...[...catsAn].sort((x, y) => y[1] - x[1]).map(([k, val]) => ({ cells: [C.get(k)?.name ?? 'Autre', String(ops.filter(o => o.categoryId === k && o.amount < 0).length), eur0(val)] })),
      { bold: true, cells: ['Total', String(ops.filter(o => o.amount < 0).length), eur0(bienOpsTotal(b, ops))] }] });
  if ((b.docs ?? []).length) blocks.push({ t: 'h2', text: 'Documents associés' },
    { t: 'table', columns: [{ title: 'Document', w: 3.4 }, { title: 'Nature', w: 2 }, { title: 'Taille', w: 1.2, align: 'right' }, { title: 'Ajouté', w: 1.4 }], rows:
      b.docs.map(d => ({ cells: [d.name, docKindLabel(d.kind), fmtBytes(d.size), fdate(d.at.slice(0, 10))] })) });
  if (b.description) blocks.push({ t: 'h2', text: 'Notes' }, { t: 'text', text: b.description });
  return generateReport({ title: 'Dossier du bien : ' + b.nom, file: 'dossier-bien', subtitle: `${B_TYPES[b.type] ?? ''} · ${b.surface ? b.surface + ' m²' : ''}${b.ville ? ' · ' + b.ville : ''} · ${B_STATUTS[b.statut] ?? ''}`, blocks });
}

// ---- tableau d'opérations avec sélection, catégorie mémorisée modifiable, exclusion et suppression de lignes
let bOpSel = new Set(); // clés « bienId|opId » cochées
const opKey = (b, o) => b.id + '|' + o.id;
/** Applique une action à des lignes (exclure, réintégrer, supprimer, ne compter que la sélection), puis enregistre chaque bien touché. */
async function bienOpsApply(pairs, action, universe = []) {
  const touched = new Map(), get = b => { const x = bienOf(b.id) ?? b; touched.set(x.id, x); return x; };
  const excl = (b, o, on) => { const x = get(b); const set = new Set(x.opExcl ?? []); on ? set.add(o.id) : set.delete(o.id); x.opExcl = [...set]; };
  if (action === 'only') { const keep = new Set(pairs.map(p => opKey(p.b, p.o))); for (const p of universe) excl(p.b, p.o, !keep.has(opKey(p.b, p.o))); }
  else for (const { b, o } of pairs) {
    if (action === 'excl') excl(b, o, true);
    else if (action === 'incl') excl(b, o, false);
    else if (action === 'del') { const x = get(b); x.opIds = (x.opIds ?? []).filter(i => i !== o.id); excl(b, o, true); }
  }
  for (const x of touched.values()) await bienPut(x);
  bOpSel = new Set(); render();
}
/** Change la catégorie mémorisée d'une opération ; l'opération reste rattachée au bien. */
async function bienOpSetCat(b0, o, catId) {
  const b = bienOf(b0.id) ?? b0;
  (b.opCats ??= {})[o.id] = catId;
  if (!(b.opIds ?? []).includes(o.id)) (b.opIds ??= []).push(o.id);
  await bienPut(b); render();
}
function bienOpsTable(rows, opts = {}) {
  const { empty = 'Aucune opération.', max = 300, showBien = false } = opts;
  const C = cats(), sorted = [...rows].sort((x, y) => y.o.date.localeCompare(x.o.date)), cut = sorted.slice(0, max);
  const nEx = rows.filter(r => r.o._excl).length;
  bOpSel = new Set([...bOpSel].filter(k => rows.some(r => opKey(r.b, r.o) === k)));
  const selRows = () => rows.filter(r => bOpSel.has(opKey(r.b, r.o)));
  const nSel = bOpSel.size, totSel = sum(selRows().filter(r => !r.o._excl).map(r => r.o.amount));
  const act = (label, action, o = {}) => h('button', { class: 'btn sm ' + (o.cls ?? 'sec'), disabled: !nSel, onclick: () => { if (o.confirm && !confirm(o.confirm(nSel))) return; bienOpsApply(selRows(), action, rows); } }, label);
  const allOn = cut.length > 0 && cut.every(r => bOpSel.has(opKey(r.b, r.o)));
  const bar = h('div', { class: 'toolbar', style: { margin: '10px 0' } },
    h('button', { class: 'btn sm sec', onclick: () => { bOpSel = allOn ? new Set() : new Set(cut.map(r => opKey(r.b, r.o))); render(); } }, allOn ? '☐ Tout désélectionner' : '☑ Tout sélectionner'),
    act('🚫 Ne pas compter', 'excl'), act('✅ Réintégrer', 'incl'),
    h('button', { class: 'btn sm sec', disabled: !nSel, title: 'Toutes les autres lignes ne sont plus comptées', onclick: () => { if (confirm('Ne compter que les ' + nSel + ' ligne(s) sélectionnée(s) ? Les autres seront exclues (réintégrables).')) bienOpsApply(selRows(), 'only', rows); } }, '🎯 Ne compter que la sélection'),
    act('🗑️ Supprimer', 'del', { cls: '', confirm: n => 'Supprimer ' + n + ' ligne(s) du bien ? Elles sont détachées et ne seront plus comptées (réintégrables via « Réintégrer »).' }),
    h('span', { class: 'muted' }, nSel ? `${nSel} ligne(s) sélectionnée(s) · solde ${signed(totSel)}` : 'Cochez des lignes pour les exclure, les supprimer ou ne compter qu’elles.'),
    nEx ? h('span', { class: 'muted', style: { marginLeft: 'auto' } }, `${nEx} ligne(s) exclue(s) ou supprimée(s)`) : null);
  if (!rows.length) return h('div', {}, h('div', { class: 'empty', style: { padding: '16px' } }, empty));
  const catCell = (b, o) => {
    const c = C.get(o.categoryId), td = h('td', { title: o._orig && o._orig !== o.categoryId ? 'Catégorie mémorisée (la catégorie actuelle de l’opération est « ' + (C.get(o._orig)?.name ?? '—') + ' »)' : 'Cliquer pour changer la catégorie du bien' }, c ? catChip(c) : '—');
    td.style.cursor = 'pointer';
    td.onclick = () => { if (td.querySelector('select')) return; const sel = catSelect(o.categoryId, v => bienOpSetCat(b, o, v), { kinds: ['expense', 'income', 'transfer'] }); td.replaceChildren(sel); sel.focus(); };
    return td;
  };
  return h('div', {}, bar, h('div', { class: 'tablewrap', style: { maxHeight: '420px' } }, h('table', {},
    h('thead', {}, h('tr', {}, h('th', { style: { width: '28px' } }, h('input', { type: 'checkbox', checked: allOn, onchange: () => { bOpSel = allOn ? new Set() : new Set(cut.map(r => opKey(r.b, r.o))); render(); } })), h('th', {}, 'Date'), showBien ? h('th', {}, 'Bien') : null, h('th', {}, 'Libellé'), h('th', {}, 'Catégorie'), h('th', { class: 'r' }, 'Montant'), h('th', {}, 'Source'))),
    h('tbody', {}, cut.map(({ o, b }) => h('tr', { class: o._excl ? 'rowexcl' : '' },
      h('td', {}, h('input', { type: 'checkbox', checked: bOpSel.has(opKey(b, o)), onchange: e => { e.target.checked ? bOpSel.add(opKey(b, o)) : bOpSel.delete(opKey(b, o)); render(); } })),
      h('td', { class: 'num nw' }, fdate(o.date)), showBien ? h('td', {}, (b.icone || '🏠') + ' ' + b.nom) : null,
      h('td', {}, o.title, o.memo ? h('div', { class: 'sub' }, o.memo) : null), catCell(b, o),
      h('td', { class: 'r num ' + (o.amount < 0 ? 'neg' : 'pos') }, signed(o.amount)),
      h('td', {}, o._excl ? h('span', { class: 'badge' }, 'exclue') : o.amount > 0 && (b.revCatIds ?? []).includes(o.categoryId) ? h('span', { class: 'badge', style: { color: '#059669', borderColor: '#059669' } }, 'revenu') : (b.opIds ?? []).includes(o.id) ? h('span', { class: 'badge manual' }, 'choisie') : (b.catIds ?? []).includes(o.categoryId) ? h('span', { class: 'badge' }, 'catégorie') : h('span', { class: 'badge' }, 'motif'))))))),
    sorted.length > max ? h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, `${max} plus récentes affichées sur ${sorted.length}`) : null);
}

/** Gestion des libellés de nature des documents : renommer, changer l'icône, ajouter, supprimer (« Autre » est conservé). */
function bKindsModal() {
  const list = docKinds().map(k => ({ ...k })), box = h('div', {});
  const draw = () => {
    box.innerHTML = '';
    list.forEach((k, i) => box.append(h('div', { class: 'toolbar', style: { margin: '0 0 6px', flexWrap: 'nowrap' } },
      h('input', { type: 'text', value: k.icon, maxlength: 4, style: { width: '56px', textAlign: 'center' }, title: 'Icône', onchange: e => { k.icon = e.target.value; } }),
      h('input', { type: 'text', value: k.label, maxlength: 40, style: { flex: 1 }, placeholder: 'Libellé de la nature', onchange: e => { k.label = e.target.value; } }),
      k.id === 'autre' ? h('span', { class: 'muted', style: { width: '34px', textAlign: 'center' }, title: 'Nature de repli, non supprimable' }, '🔒')
        : h('button', { class: 'icon-btn', title: 'Supprimer (les documents concernés passent en « Autre »)', onclick: () => { list.splice(i, 1); draw(); } }, '🗑️'))));
    box.append(h('button', { class: 'btn sm sec', onclick: () => { list.splice(Math.max(0, list.length - 1), 0, { id: '', label: 'Nouvelle catégorie', icon: '📎' }); draw(); } }, '＋ Ajouter une catégorie'));
  };
  draw();
  modal('🏷️ Catégories de documents', [h('p', { class: 'muted', style: { margin: '0 0 10px' } }, 'Ces catégories servent à classer les PDF de tous vos biens. Renommer une catégorie met à jour les documents déjà classés ; en supprimer une les replace en « Autre ».'), box],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: async () => {
      const r = await fetch('/api/biens/kinds', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kinds: list }) });
      const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Enregistrement impossible')); return; }
      BS = j; close(); toast('🏷️ Catégories enregistrées'); render();
    } }, 'Enregistrer')]);
}

// ---- revenus locatifs : choix des catégories de revenus rattachées (dans la carte des opérations rattachées)
function bRevCatsModal(b) {
  const C = [...cats().values()].filter(c => c.kind === 'income'), sel = new Set(b.revCatIds ?? []), list = h('div', { class: 'legend', style: { maxHeight: '380px' } });
  const draw = () => {
    list.innerHTML = '';
    if (!C.length) { list.append(h('div', { class: 'empty', style: { padding: '14px' } }, 'Aucune catégorie de revenu : créez-en une (type Revenu) dans le menu Catégories.')); return; }
    for (const c of C) {
      const on = sel.has(c.id);
      list.append(h('div', { class: 'lrow', style: { gridTemplateColumns: '34px 1fr auto' }, onclick: () => { on ? sel.delete(c.id) : sel.add(c.id); draw(); } },
        bubble(c), h('div', { class: 'name' }, c.name), h('span', { class: 'chip toggle' + (on ? ' on' : ''), style: on ? { background: c.color } : {} }, on ? '✓ rattachée' : 'rattacher')));
    }
  };
  draw();
  modal('Catégories de revenus du bien', [h('p', { class: 'muted', style: { margin: 0 } }, 'Tous les crédits de ces catégories sont comptés comme revenus locatifs du bien. Si une catégorie sert à plusieurs biens, ses crédits seront comptés pour chacun.'), list],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: () => { b.revCatIds = [...sel]; bienPut(b).then(() => { close(); render(); }); } }, 'Enregistrer')], true);
}
