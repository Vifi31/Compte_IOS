'use strict';
// ============ Gestion des versions ============
async function verApi(path, method = 'GET', body) {
  const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); }
  return j;
}
// Niveaux d'importance : mineur +0.0.1 · intermédiaire +0.1.0 · majeur +1.0.0
const LEVELS_UI = [
  ['patch', 'Mineur', '+0.0.1 · corrections et petits ajustements'],
  ['minor', 'Intermédiaire', '+0.1.0 · nouvelles fonctionnalités'],
  ['major', 'Majeur', '+1.0.0 · changements importants'],
];
const fmtUptime = s => s < 60 ? s + ' s' : s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? (s / 3600).toFixed(1).replace('.', ',') + ' h' : Math.round(s / 86400) + ' j';
const nextVer = (cur, kind) => { const [M, m, p] = cur.split('.').map(Number); return kind === 'major' ? `${M + 1}.0.0` : kind === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`; };

async function pageVersions(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const D = await verApi('/api/versions');
  const journal = (await verApi('/api/prompts')).journal;
  v.innerHTML = '';
  if (S.page !== 'versions') return;
  const reload = async fn => { await fn(); S.data = await api('/api/state'); render(); };
  const cur = D.current, latest = D.list[0];
  const dirty = latest && latest.version === cur;

  v.append(h('div', { class: 'ver-hero' },
    h('div', {}, h('small', {}, 'Version installée'), h('div', { class: 'big' }, 'v' + cur)),
    h('div', {}, h('div', { style: { fontWeight: 700, fontSize: '16px' } }, latest ? `Dernière version publiée : v${latest.version}` : 'Aucune version publiée'),
      h('small', {}, latest ? new Date(latest.createdAt).toLocaleString('fr-FR') : 'Publiez la première version ci-dessous pour garder un point de retour.')),
    h('div', { style: { marginLeft: 'auto', fontSize: '12.5px', opacity: .9, lineHeight: 1.7 } },
      `Node ${D.about.node} · ${D.about.platform}`, h('br'), `Port ${D.about.port} · actif depuis ${fmtUptime(D.about.uptime)}`, h('br'),
      `${D.list.length} version(s) conservée(s)`)));

  // ---- publication
  const pp = makePromptPicker(journal);
  let kind = 'patch'; const notes = h('textarea', { rows: 4, placeholder: 'Ce qui change dans cette version, une ligne par modification…', style: { width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', resize: 'vertical', font: 'inherit', color: 'inherit' } });
  const info = h('span', { class: 'vbadge' });
  const seg = h('div', { class: 'seg' });
  const draw = () => {
    seg.innerHTML = '';
    LEVELS_UI.map(([k, l, t]) => [k, l, t]).forEach(([k, l, t]) => seg.append(h('button', { class: kind === k ? 'on' : '', title: t, onclick: () => { kind = k; draw(); } }, l)));
    info.textContent = `v${cur} → v${nextVer(cur, kind)}`;
  };
  draw();
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '🏷️ Publier une nouvelle version', h('small', {}, 'crée un point de retour du programme')),
    h('div', { class: 'toolbar' }, seg, info), notes, pp.el,
    h('div', { class: 'toolbar', style: { margin: '12px 0 0' } },
      h('button', { class: 'btn', onclick: () => reload(async () => { const r = await verApi('/api/versions', 'POST', { bump: kind, notes: notes.value, prompt: pp.text() }); await Promise.all(pp.ids().map(id => verApi('/api/prompts/journal/' + id, 'PUT', { version: r.published }))); toast('✅ Version ' + r.published + ' publiée'); }) }, 'Publier la version'),
      h('span', { class: 'muted' }, 'Mineur +0.0.1, intermédiaire +0.1.0, majeur +1.0.0. Incrémente le numéro, ajoute l’entrée au journal (CHANGELOG.md) et enregistre un instantané du programme (dossier Versions). Vos données ne sont pas incluses : utilisez les sauvegardes.'))));

  // ---- historique
  const actions = ver => [
    h('button', { class: 'btn sm sec', onclick: async () => {
      const d = await verApi('/api/versions/diff', 'POST', { version: ver.version });
      const sec = (cls, sign, arr) => arr.map(f => h('div', { class: cls }, sign + ' ' + f));
      modal(`Changements depuis v${ver.version}`, [
        h('p', { class: 'muted', style: { margin: 0 } }, d.same ? 'Le programme actuel est identique à cette version.' : `${d.modified.length} modifié(s), ${d.added.length} ajouté(s), ${d.removed.length} supprimé(s) par rapport à cette version.`),
        d.same ? null : h('div', { class: 'difflist' }, sec('mod', '~', d.modified), sec('add', '+', d.added), sec('del', '−', d.removed)),
      ], close => [h('button', { class: 'btn', onclick: close }, 'Fermer')], true);
    } }, '🔍 Changements'),
    h('button', { class: 'btn sm sec', onclick: () => editVersionPrompt(ver, journal) }, '💬 Prompt'),
    h('button', { class: 'btn sm sec', onclick: () => importanceModal(ver) }, '⚖️ Importance'),
    h('a', { class: 'btn sm sec', href: apiUrl('/api/versions/file?version=' + ver.version), style: { textDecoration: 'none' } }, '⬇️ Télécharger'),
    ver.version !== cur ? h('button', { class: 'btn sm sec', onclick: () => restoreVersion(ver, cur) }, '⏪ Revenir à cette version') : null,
    ver.version !== cur ? h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => modal('Supprimer la version ' + ver.version + ' ?', [h('p', {}, 'L’instantané sera supprimé. Le journal des modifications est conservé.')], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn danger', onclick: () => reload(async () => { await verApi('/api/versions?version=' + ver.version, 'DELETE'); close(); toast('Version supprimée'); }) }, 'Supprimer')]) }, '🗑️') : null,
  ];
  const items = D.list.map(ver => {
    const lines = (ver.notes || '').split('\n').map(l => l.trim()).filter(Boolean);
    return h('div', { class: 'tl-item' + (ver.version === cur ? ' cur' : '') },
      h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
        h('span', { class: 'vbadge' + (ver.version === cur ? ' cur' : '') }, 'v' + ver.version), ver.version === cur ? h('span', { class: 'badge' }, 'installée') : null,
        ver.bump ? h('span', { class: 'badge' }, (LEVELS_UI.find(l => l[0] === ver.bump)?.[1] ?? ver.bump).toLowerCase()) : null,
        h('span', { class: 'muted' }, new Date(ver.createdAt).toLocaleString('fr-FR')), h('span', { class: 'muted', style: { marginLeft: 'auto' } }, `${ver.files} fichiers · ${fmtBytes(ver.size)}`)),
      lines.length ? h('ul', {}, lines.map(l => h('li', {}, l.replace(/^[-*•]\s*/, '')))) : h('div', { class: 'muted', style: { marginTop: '6px' } }, 'Aucune note.'),
      ver.prompt ? promptBlock(ver) : h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '12.5px' } }, '💬 Aucun prompt associé à cette version'),
      h('div', { class: 'toolbar', style: { margin: '12px 0 0' } }, actions(ver)));
  });
  v.append(h('h2', { style: { margin: '26px 0 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' } }, `Historique des versions (${D.list.length})`, pdfBtn('📄 Exporter en PDF', exportVersionsPdf)),
    items.length ? h('div', { class: 'timeline' }, items) : h('div', { class: 'card empty' }, 'Aucune version publiée pour le moment.'));
  void dirty;
}

function restoreVersion(ver, cur) {
  modal(`Revenir à la version ${ver.version} ?`, [
    h('p', {}, `Le programme passera de v${cur} à v${ver.version} : les fichiers de l’application sont remplacés (vos données, relevés et paramètres ne sont pas touchés).`),
    h('div', { class: 'tip' }, '🛟 Une sauvegarde « Programme » de l’état actuel est créée avant le retour arrière. Un redémarrage est ensuite nécessaire.'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => {
      const r = await verApi('/api/versions/restore', 'POST', { version: ver.version }); close();
      modal('Version restaurée', [h('p', {}, `${r.restored} fichiers remis dans l’état de la v${ver.version}. Sécurité : ${r.safety}.`), h('p', {}, 'Redémarrez l’application pour appliquer le nouveau code.')],
        c2 => [h('button', { class: 'btn sec', onclick: () => { c2(); render(); } }, 'Plus tard'), h('button', { class: 'btn', onclick: restartApp }, '↻ Redémarrer maintenant')]);
    } }, '⏪ Restaurer')]);
}
async function restartApp() {
  try { await apiFetch('/api/restart', { method: 'POST' }); } catch { /* le serveur s'arrête */ }
  $('#modalRoot').innerHTML = ''; $('#view').innerHTML = ''; $('#view').append(h('div', { class: 'loading' }, 'Redémarrage en cours…'));
  const t0 = Date.now();
  const poll = async () => { try { const r = await apiFetch('/api/state'); if (r.ok) return location.reload(); } catch { /* en attente */ } if (Date.now() - t0 < 90000) setTimeout(poll, 1500); else $('#view').textContent = 'Le serveur ne répond pas : relancez Comptes.bat.'; };
  setTimeout(poll, 3000);
}

// ---- changer l'importance d'une version : la numérotation des versions suivantes est recalculée
function importanceModal(ver) {
  let level = ver.bump || 'minor';
  const preview = h('div'); const choices = h('div', { class: 'grid', style: { gap: '8px' } });
  const load = async () => {
    const r = await verApi('/api/versions/rebump', 'POST', { version: ver.version, level, preview: true });
    preview.innerHTML = '';
    const changed = r.steps.filter(s => s.changed);
    preview.append(changed.length
      ? h('div', {}, h('p', { style: { margin: '0 0 8px' } }, h('b', {}, changed.length + ' version(s) renumérotée(s)'), ' :'),
        h('div', { class: 'difflist' }, r.steps.map(s => h('div', { class: s.changed ? 'mod' : '' }, s.changed ? `v${s.old}  →  v${s.new}  (${LEVELS_UI.find(l => l[0] === s.level)[1].toLowerCase()})` : `v${s.old}  (inchangée)`))))
      : h('p', { class: 'muted' }, 'Aucun changement de numérotation.'));
    okBtn.disabled = !changed.length;
  };
  const draw = () => {
    choices.innerHTML = '';
    LEVELS_UI.forEach(([k, l, t]) => choices.append(h('label', { class: 'schedon', style: { cursor: 'pointer', borderColor: level === k ? 'var(--primary)' : '' } },
      h('input', { type: 'radio', name: 'lvl', checked: level === k, onchange: () => { level = k; draw(); load(); } }), h('div', {}, h('b', {}, l), h('div', { class: 'muted', style: { fontSize: '12.5px' } }, t)))));
  };
  const okBtn = h('button', { class: 'btn' }, 'Appliquer et renuméroter');
  draw(); load();
  modal('Importance de la version ' + ver.version, [
    h('p', { style: { margin: 0 } }, 'Le niveau détermine l\u2019incrément par rapport à la version précédente. Le modifier recalcule le numéro de cette version et de toutes les suivantes.'),
    choices, preview,
    h('div', { class: 'tip' }, 'Les instantanés, le journal CHANGELOG.md et le numéro installé sont mis à jour en conséquence.'),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), (okBtn.onclick = async () => {
    const r = await verApi('/api/versions/rebump', 'POST', { version: ver.version, level }); close();
    await relinkJournal(r.steps);
    S.data = await api('/api/state'); toast('✅ ' + r.changed + ' version(s) renumérotée(s)'); render();
  }, okBtn)], true);
}

// ---- prompt utilisé pour une version (lié au journal des prompts)
function makePromptPicker(journal) {
  const free = journal.filter(e => e.source === 'demande' && !e.version).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const sel = new Set(free.slice(0, 1).map(e => e.id)); let edited = false;
  const area = h('textarea', { rows: 4, placeholder: 'Prompt à l’origine de cette version (facultatif)', style: { width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', resize: 'vertical', font: 'inherit', color: 'inherit' }, oninput: () => { edited = true; } });
  const fill = () => { if (!edited) area.value = free.filter(e => sel.has(e.id)).map(e => e.text).join('\n\n---\n\n'); };
  fill();
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' } }, free.map(e => h('label', { class: 'schedon', style: { cursor: 'pointer', alignItems: 'flex-start', padding: '6px 10px' } },
    h('input', { type: 'checkbox', checked: sel.has(e.id), onchange: ev => { ev.target.checked ? sel.add(e.id) : sel.delete(e.id); edited = false; fill(); } }),
    h('span', { style: { fontSize: '12.5px' } }, h('b', {}, fmtDT(e.date) + ' · '), e.text.length > 150 ? e.text.slice(0, 150) + '…' : e.text))));
  const el = h('div', { style: { marginTop: '12px' } }, h('label', { class: 'muted', style: { fontWeight: 600, fontSize: '12px' } }, '💬 Prompt utilisé'),
    free.length ? h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Demandes du journal pas encore rattachées à une version (cochées = rattachées à cette version) :') : null, free.length ? list : null, area);
  return { el, text: () => area.value.trim(), ids: () => free.filter(e => sel.has(e.id)).map(e => e.id) };
}
function promptBlock(ver) {
  const long = ver.prompt.length > 280, open = (S.vpOpen ??= new Set()).has(ver.version);
  return h('div', { class: 'vprompt' }, h('div', { class: 'muted', style: { fontSize: '12px', fontWeight: 700, marginBottom: '4px' } }, '💬 Prompt utilisé'),
    h('div', { style: { whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: open || !long ? 'none' : '84px', overflow: 'hidden', fontSize: '13px' } }, ver.prompt),
    long ? h('button', { class: 'btn sm sec', style: { marginTop: '6px' }, onclick: () => { open ? S.vpOpen.delete(ver.version) : S.vpOpen.add(ver.version); render(); } }, open ? 'Réduire' : 'Voir tout') : null);
}
function editVersionPrompt(ver, journal) {
  const area = h('textarea', { rows: 9, style: { width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', resize: 'vertical', font: 'inherit', color: 'inherit' } }, ver.prompt || '');
  const picks = journal.filter(e => e.source === 'demande').sort((a, b) => b.date.localeCompare(a.date));
  const sel = h('select', { onchange: e => { const p = picks.find(x => String(x.id) === e.target.value); if (p) area.value = (area.value.trim() ? area.value.trim() + '\n\n---\n\n' : '') + p.text; e.target.value = ''; } },
    h('option', { value: '' }, 'Ajouter un prompt du journal…'), picks.map(e => h('option', { value: e.id }, fmtDT(e.date) + ' — ' + e.text.slice(0, 70).replace(/\s+/g, ' '))));
  modal('Prompt de la version ' + ver.version, [h('div', { class: 'field' }, h('label', {}, 'Prompt utilisé pour cette version'), area), h('div', { class: 'field' }, sel)],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: async () => {
      await verApi('/api/versions/prompt', 'POST', { version: ver.version, prompt: area.value });
      const ids = picks.filter(e => !e.version && area.value.includes(e.text)).map(e => e.id);
      await Promise.all(ids.map(id => verApi('/api/prompts/journal/' + id, 'PUT', { version: ver.version })));
      close(); toast('Prompt enregistré'); render();
    } }, 'Enregistrer')], true);
}
// après une renumérotation, les entrées du journal suivent les nouveaux numéros de version
async function relinkJournal(steps) {
  const map = new Map(steps.filter(s => s.changed).map(s => [s.old, s.new]));
  if (!map.size) return;
  const journal = (await verApi('/api/prompts')).journal;
  await Promise.all(journal.filter(e => map.has(e.version)).map(e => verApi('/api/prompts/journal/' + e.id, 'PUT', { version: map.get(e.version) })));
}
