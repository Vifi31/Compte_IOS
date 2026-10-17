'use strict';
// ============ Biens : corpus documentaire (recherche plein texte dans les PDF, état d'indexation, notes) ============
let cpQ = '', cpAll = false, cpTimer = null;

/** Carte « Corpus » d'un bien : tous ses PDF indexés, recherche dans leur contenu, extraits et note par document. */
function corpusCard(b) {
  const box = h('div', {}), info = h('div', { class: 'muted', style: { fontSize: '12.5px', margin: '8px 0' } });
  const inp = h('input', { type: 'search', class: 'grow', placeholder: '🔍 Rechercher dans le contenu des documents (ex. « fonds travaux », « quote-part », « toiture »)…', value: cpQ,
    oninput: e => { cpQ = e.target.value; clearTimeout(cpTimer); cpTimer = setTimeout(load, 350); } });
  const all = h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: cpAll, onchange: e => { cpAll = e.target.checked; load(); } }), 'Tous les biens');
  const re = h('button', { class: 'btn sm sec', title: 'Relire le texte de tous les PDF', onclick: () => load(true) }, '🔄 Réindexer');
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const hl = (t, q) => { let x = esc(t); for (const w of q.split(/\s+/).filter(w => w.length >= 2)) { const re_ = new RegExp('(' + w.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); x = x.replace(re_, '<mark>$1</mark>'); } return x; };
  async function load(reindex) {
    info.textContent = reindex ? 'Indexation en cours…' : 'Chargement…';
    try {
      const j = await (await apiFetch('/api/biens/corpus?bien=' + (cpAll ? 'all' : encodeURIComponent(b.id)) + '&q=' + encodeURIComponent(cpQ.trim()) + (reindex ? '&reindex=1' : ''))).json();
      if (j.error) throw new Error(j.error);
      const docs = j.docs ?? [], pages = sum(docs.map(d => d.pages || 0)), chars = sum(docs.map(d => d.chars || 0)), scans = docs.filter(d => d.scan).length;
      info.textContent = cpQ.trim() ? `${docs.length} document(s) contiennent « ${cpQ.trim()} »` : `${docs.length} document(s) · ${pages} page(s) · ${(chars / 1000).toFixed(0)} k caractères indexés${scans ? ' · ' + scans + ' sans texte (scan)' : ''}${j.pending ? ' · ' + j.pending + ' à indexer (relancez)' : ''}`;
      box.innerHTML = '';
      if (!docs.length) { box.append(h('div', { class: 'empty', style: { padding: '14px' } }, cpQ.trim() ? 'Aucun document ne correspond.' : 'Aucun document : déposez des PDF ci-dessous, ils seront indexés automatiquement.')); return; }
      box.append(h('div', { class: 'tablewrap', style: { maxHeight: '460px' } }, h('table', {},
        bTh(...(cpAll ? ['Bien'] : []), 'Document', 'Nature', ['Pages', 'r'], ['Contenu', 'r'], ...(cpQ.trim() ? [['Occ.', 'r'], 'Extraits'] : []), 'Note', ''),
        h('tbody', {}, docs.map(d => {
          const url = '/api/biens/' + encodeURIComponent(d.bien) + '/documents?name=' + encodeURIComponent(d.name);
          const note = h('input', { type: 'text', value: d.note || '', maxlength: 300, placeholder: 'Ajouter une note…', style: { width: '100%', minWidth: '150px' }, onchange: async e => {
            const bb = bienOf(d.bien); if (!bb) return; const notes = { ...(bb.docNotes ?? {}) }; if (e.target.value.trim()) notes[d.name] = e.target.value; else delete notes[d.name]; bb.docNotes = notes;
            const r = await apiFetch('/api/biens/' + encodeURIComponent(bb.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docNotes: notes }) }); const jj = await r.json(); if (jj.items) BS = jj; } });
          const ex = h('td', { style: { fontSize: '12px', maxWidth: '420px' } }); ex.innerHTML = d.excerpts.map(x => '<div>' + hl(x, cpQ) + '</div>').join('');
          return h('tr', {}, ...(cpAll ? [h('td', {}, d.icone + ' ' + d.bienNom)] : []),
            h('td', {}, h('b', {}, docKindIcon(d.kind)), ' ', h('a', { class: 'doclink', href: apiUrl(url), target: '_blank' }, d.name)), h('td', {}, docKindLabel(d.kind)),
            h('td', { class: 'r num' }, d.error ? '⚠️' : String(d.pages)), h('td', { class: 'r num ' + (d.scan || d.error ? 'neg' : '') , title: d.error || (d.scan ? 'Aucun texte : PDF scanné (image)' : '') }, d.error ? 'illisible' : d.scan ? 'scan' : (d.chars / 1000).toFixed(1) + ' k'),
            ...(cpQ.trim() ? [h('td', { class: 'r num' }, String(d.hits)), ex] : []), h('td', {}, note), h('td', { class: 'r' }, h('a', { class: 'icon-btn', title: 'Ouvrir', href: apiUrl(url), target: '_blank', style: { textDecoration: 'none' } }, '👁️')));
        })))));
    } catch (e) { info.textContent = '⚠️ ' + (e.message || e); }
  }
  setTimeout(load, 0);
  return bCard('#6366f1', '📚 Corpus documentaire du bien',
    h('p', { class: 'muted', style: { margin: '0 0 10px', fontSize: '12.5px' } }, 'Tous les PDF du bien forment un corpus : leur texte est lu et indexé automatiquement au dépôt. Recherchez un mot, un montant ou un nom dans leur contenu, retrouvez l’extrait et le document, et annotez chaque pièce.'),
    h('div', { class: 'toolbar', style: { margin: 0 } }, inp, all, re), info, box);
}
