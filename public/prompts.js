'use strict';
// ============ Administration › Prompt : journal des demandes + modèles d'analyse IA ============
const PR_STATUS = { 'à faire': '#f59e0b', 'en cours': '#0ea5e9', 'réalisé': '#10b981', 'annulé': '#94a3b8', 'envoyé': '#8b5cf6', 'erreur': '#ef4444' };
async function prApi(path, method = 'GET', body) {
  const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); } return j;
}

async function pagePrompts(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const D = await prApi('/api/prompts');
  v.innerHTML = ''; if (S.page !== 'prompts') return;
  S.pr ??= { tab: 'journal', q: '', src: '', status: '' };
  const P = S.pr, reload = () => render();

  v.append(h('div', { class: 'toolbar' }, h('div', { class: 'seg' }, [['journal', '📜 Journal des prompts'], ['templates', '🧠 Modèles d’analyse IA']].map(([k, l]) => h('button', { class: P.tab === k ? 'on' : '', onclick: () => { P.tab = k; reload(); } }, l)))));

  if (P.tab === 'templates') return templatesTab(v, D);

  const all = D.journal, q = P.q.trim().toLowerCase();
  const list = all.filter(e => (!P.src || e.source === P.src) && (!P.status || e.status === P.status) && (!q || `${e.text} ${e.notes} ${e.version}`.toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date));
  const count = s => all.filter(e => e.source === s).length;
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Prompts enregistrés', String(all.length), `${count('demande')} demandes · ${count('ia')} envois IA`, '📜'),
    kpi('k2', 'Réalisés', String(all.filter(e => e.status === 'réalisé').length), 'demandes menées à terme', '✅'),
    kpi('k4', 'En attente', String(all.filter(e => ['à faire', 'en cours'].includes(e.status)).length), 'à faire ou en cours', '⏳'),
    kpi('k1', 'Erreurs IA', String(all.filter(e => e.status === 'erreur').length), 'envois en échec', '⚠️')));

  v.append(h('div', { class: 'card', style: { marginTop: '18px' } },
    h('div', { class: 'toolbar' },
      h('input', { type: 'search', class: 'grow', placeholder: '🔍 Rechercher dans les prompts…', value: P.q, oninput: e => { P.q = e.target.value; clearTimeout(S._t); S._t = setTimeout(() => { reload(); setTimeout(() => { const i = $('input[type=search]'); i?.focus(); i?.setSelectionRange(99, 99); }, 60); }, 250); } }),
      h('select', { onchange: e => { P.src = e.target.value; reload(); } }, [['', 'Toutes les sources'], ['demande', 'Mes demandes'], ['ia', 'Envois à l’IA']].map(([k, l]) => h('option', { value: k, selected: P.src === k }, l))),
      h('select', { onchange: e => { P.status = e.target.value; reload(); } }, [['', 'Tous les statuts'], ...D.statuses.map(s => [s, s])].map(([k, l]) => h('option', { value: k, selected: P.status === k }, l))),
      h('button', { class: 'btn', onclick: () => editPrompt(null, D) }, '＋ Nouveau prompt'),
      h('button', { class: 'btn sec', onclick: () => exportJournal(list) }, '⬇ Exporter (Markdown)'),
      pdfBtn('📄 Exporter en PDF', () => exportPromptsPdf(list))),
    h('div', { class: 'muted', style: { marginBottom: '10px' } }, `${list.length} prompt(s) affiché(s). Les envois à l’IA sont ajoutés automatiquement ; vous pouvez modifier ou compléter toutes les entrées.`),
    list.length ? h('div', { class: 'timeline' }, list.map(e => promptItem(e, D))) : h('div', { class: 'empty' }, 'Aucun prompt ne correspond.')));
}

function promptItem(e, D) {
  const long = e.text.length > 360, open = (S.prOpen ??= new Set()).has(e.id);
  return h('div', { class: 'tl-item' },
    h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
      h('span', { class: 'chip', style: { background: tint(PR_STATUS[e.status] ?? '#64748b', .16), color: PR_STATUS[e.status] ?? '#64748b', cursor: 'default' } }, e.status),
      h('span', { class: 'badge' }, e.source === 'ia' ? '🧠 envoi IA' : '💬 demande'), e.version ? h('span', { class: 'vbadge' }, 'v' + e.version) : null,
      h('span', { class: 'muted' }, fmtDT(e.date) + (e.edited ? ' · modifié ' + fmtDT(e.edited) : '')),
      h('span', { style: { marginLeft: 'auto', display: 'flex' } },
        h('button', { class: 'icon-btn', title: 'Copier', onclick: () => { navigator.clipboard?.writeText(e.text); toast('Prompt copié'); } }, '⧉'),
        h('button', { class: 'icon-btn', title: 'Modifier', onclick: () => editPrompt(e, D) }, '✏️'),
        h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => modal('Supprimer ce prompt ?', [h('p', {}, 'L’entrée sera retirée du journal.')], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn danger', onclick: async () => { await prApi('/api/prompts/journal/' + e.id, 'DELETE'); close(); render(); } }, 'Supprimer')]) }, '🗑️'))),
    h('div', { style: { margin: '10px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: open || !long ? 'none' : '120px', overflow: 'hidden' } }, e.text),
    long ? h('button', { class: 'btn sm sec', style: { marginTop: '8px' }, onclick: () => { open ? S.prOpen.delete(e.id) : S.prOpen.add(e.id); render(); } }, open ? 'Réduire' : 'Voir tout') : null,
    e.notes ? h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '12.5px' } }, '📝 ' + e.notes) : null);
}

function editPrompt(e, D) {
  const d = e ? { text: e.text, status: e.status, version: e.version || '', notes: e.notes || '', date: e.date } : { text: '', status: 'à faire', version: '', notes: '', date: new Date().toISOString() };
  const text = h('textarea', { rows: 8, style: { width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', font: 'inherit', color: 'inherit', resize: 'vertical' }, oninput: ev => { d.text = ev.target.value; } }, d.text);
  const dt = new Date(d.date), local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  modal(e ? 'Modifier le prompt' : 'Nouveau prompt', [
    h('div', { class: 'field' }, h('label', {}, 'Texte du prompt'), text),
    h('div', { class: 'grid g3', style: { gap: '12px' } },
      h('div', { class: 'field' }, h('label', {}, 'Statut'), h('select', { onchange: ev => { d.status = ev.target.value; } }, D.statuses.map(s => h('option', { value: s, selected: d.status === s }, s)))),
      h('div', { class: 'field' }, h('label', {}, 'Version livrée'), h('input', { type: 'text', value: d.version, placeholder: 'ex. 1.2.0', oninput: ev => { d.version = ev.target.value; } })),
      h('div', { class: 'field' }, h('label', {}, 'Date'), h('input', { type: 'datetime-local', value: local, onchange: ev => { if (ev.target.value) d.date = new Date(ev.target.value).toISOString(); } }))),
    h('div', { class: 'field' }, h('label', {}, 'Notes'), h('input', { type: 'text', value: d.notes, oninput: ev => { d.notes = ev.target.value; } })),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: async () => {
    if (!d.text.trim()) return text.focus();
    await (e ? prApi('/api/prompts/journal/' + e.id, 'PUT', d) : prApi('/api/prompts/journal', 'POST', d)); close(); toast('Journal mis à jour'); render();
  } }, 'Enregistrer')], true);
}

function exportJournal(list) {
  const md = '# Journal des prompts — Comptes\n\n' + list.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => `## ${fmtDT(e.date)} — ${e.status}${e.version ? ' — v' + e.version : ''} (${e.source === 'ia' ? 'envoi IA' : 'demande'})\n\n${e.text}\n${e.notes ? '\n> ' + e.notes + '\n' : ''}`).join('\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown;charset=utf-8' })), download: 'journal-des-prompts.md' }); document.body.append(a); a.click(); a.remove();
}

function templatesTab(v, D) {
  const d = { ...D.templates };
  const area = (key, rows) => h('textarea', { rows, style: { width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', font: '13px Consolas, monospace', color: 'inherit', resize: 'vertical' }, oninput: e => { d[key] = e.target.value; } }, d[key]);
  v.append(h('div', { class: 'card' }, h('h2', {}, '🧠 Modèles de prompt de l’analyse IA', h('small', {}, 'utilisés par Analyse › Analyse IA')),
    h('div', { class: 'tip', style: { marginBottom: '14px' } }, 'Variables disponibles dans le message : ', ...['{{periode}}', '{{comptes}}', '{{focus}}', '{{donnees}}'].map(x => h('span', { class: 'kbd', style: { margin: '0 4px' } }, x)), ' — {{donnees}} (obligatoire) est remplacé par les données agrégées de la période.'),
    h('div', { class: 'field' }, h('label', {}, 'Consigne système (rôle et style de l’IA)'), area('system', 6)),
    h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Message envoyé — analyse d’une période'), area('user', 14)),
    h('div', { class: 'field', style: { marginTop: '14px' } }, h('label', {}, 'Message envoyé — analyse pluriannuelle (toutes les années)'), area('userMulti', 14)),
    h('div', { class: 'toolbar', style: { margin: '14px 0 0' } },
      h('button', { class: 'btn', onclick: async () => { await prApi('/api/prompts/templates', 'PUT', d); toast('✅ Modèles enregistrés'); render(); } }, 'Enregistrer les modèles'),
      h('button', { class: 'btn sec', onclick: () => modal('Rétablir les modèles par défaut ?', [h('p', {}, 'Vos modifications des modèles seront perdues.')], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: async () => { await prApi('/api/prompts/templates/reset', 'POST'); close(); toast('Modèles rétablis'); render(); } }, 'Rétablir')]) }, '↺ Valeurs par défaut'))));
}
