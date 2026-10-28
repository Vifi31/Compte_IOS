'use strict';
// ============ Immobilier : duplication de tâches et export du projet (ou d'un sous-projet) ============

/** Copie une tâche juste après l'originale : même phase, sous-projet, durée, enchaînements et conditions ; statut « à faire » ; pièces jointes non copiées. */
function duplicateAction(P, a) {
  const c = JSON.parse(JSON.stringify(a)); delete c.key; c.id = uid(); c.auto = false; c.tache = true; c.statut = 'afaire'; c.label = a.label + ' (copie)';
  P.actions.splice(P.actions.indexOf(a) + 1, 0, c); S.immoFocus = a.phase; toast('📄 Tâche dupliquée : modifiez-la avec ✏️'); commit();
}

/** Copie les tâches du sous-projet `from` vers `to` : les enchaînements entre ces tâches sont recréés sur les copies, ceux vers l'extérieur sont conservés. */
function duplicateSpTasks(P, from, to) {
  const src = P.actions.filter(a => a.sp === from), map = new Map(src.map(a => [a.id, uid()]));
  for (const a of src) {
    const c = JSON.parse(JSON.stringify(a)); delete c.key; c.id = map.get(a.id); c.sp = to; c.auto = false; c.tache = true; c.statut = 'afaire';
    c.deps = (c.deps ?? []).map(d => ({ ...d, id: map.get(d.id) ?? d.id })); c.conds = (c.conds ?? []).map(k => k.type === 'tache' && map.has(k.id) ? { ...k, id: map.get(k.id) } : k);
    P.actions.push(c);
  }
  return src.length;
}

const csvCell = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** Tâches du périmètre : '' = tout le projet, '__none' = sans sous-projet, sinon id d'un sous-projet. */
const exportTasks = (P, scope) => P.actions.filter(a => scope === '' ? true : scope === '__none' ? !spOf(P, a) : a.sp === scope).sort((a, b) => a.date.localeCompare(b.date));

function exportProject(P, scope, format) {
  const A = exportTasks(P, scope), by = new Map(P.actions.map(a => [a.id, a])), sp = scope && scope !== '__none' ? spList(P).find(s => s.id === scope) : null;
  const slug = (sp ? 'sous-projet-' + sp.nom : 'projet-immobilier').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = `comptes-${slug}-${todayIso()}`;
  const depText = a => (a.deps ?? []).map(d => { const o = by.get(d.id); return o ? `${d.type === 'avant' ? 'avant' : 'après'} « ${o.label} »${+d.delay ? ' (' + d.delay + ' j)' : ''}` : ''; }).filter(Boolean).join(' ; ');
  let blob, name;
  if (format === 'json') {
    const used = new Set(A.map(a => a.sp).filter(Boolean));
    blob = new Blob([JSON.stringify({ application: 'Comptes', exporteLe: new Date().toISOString(), perimetre: sp ? sp.nom : scope === '__none' ? 'Sans sous-projet' : 'Tout le projet',
      sousProjets: spList(P).filter(s => !scope || used.has(s.id)), taches: A.map(a => ({ ...a, sousProjet: spOf(P, a)?.nom ?? null, enchainements: depText(a) })) }, null, 2)], { type: 'application/json;charset=utf-8' });
    name = base + '.json';
  } else {
    const head = ['Sous-projet', 'Phase', 'Tâche', 'Statut', 'Priorité', 'Début', 'Échéance', 'Durée (j)', 'Enchaînements', 'Notes'];
    const rows = A.map(a => [spOf(P, a)?.nom ?? '', a.phase.replace(/^\d+\.\s*/, ''), a.label, ST_ACTION[a.statut] ?? a.statut, a.prio === 'haute' ? 'Prioritaire' : 'Normale', taskStart(a), a.date, +a.duree || 0, depText(a), a.notes ?? '']);
    blob = new Blob(['﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    name = base + '.csv';
  }
  const lnk = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(lnk); lnk.click(); lnk.remove(); setTimeout(() => URL.revokeObjectURL(lnk.href), 30000);
  toast(`⬇ ${A.length} tâche(s) exportée(s) : ${name}`);
}

function exportModal(P, scope0 = '') {
  let scope = scope0, format = 'csv'; const info = h('div', { class: 'muted', style: { fontSize: '12.5px', marginTop: '6px' } });
  const upd = () => { info.textContent = `${exportTasks(P, scope).length} tâche(s) seront exportées.`; };
  const sel = h('select', { onchange: e => { scope = e.target.value; upd(); } }, h('option', { value: '' }, 'Tout le projet'), spList(P).map(s => h('option', { value: s.id, selected: scope === s.id }, '🎨 ' + s.nom)), spList(P).length ? h('option', { value: '__none', selected: scope === '__none' }, 'Tâches sans sous-projet') : null);
  const fmt = h('select', { onchange: e => { format = e.target.value; } }, [['csv', 'CSV (Excel, LibreOffice) — une ligne par tâche'], ['json', 'JSON — données complètes (enchaînements, conditions)']].map(([k, l]) => h('option', { value: k }, l)));
  upd();
  modal('⬇ Exporter le projet', [fld('Périmètre', sel), fld('Format', fmt), info, h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, 'Le plan complet en PDF reste disponible avec « 📄 Plan en PDF ».')],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Fermer'), h('button', { class: 'btn', onclick: () => { exportProject(P, scope, format); close(); } }, 'Exporter')]);
}
