'use strict';
// ============ Immobilier : dépendances entre tâches, délais, contraintes et diagramme de Gantt ============
// Une tâche porte une échéance (date) et une durée facultative en jours : elle occupe [date − durée ; date].
// Une dépendance est stockée sur la tâche qui la subit : a.deps = [{ id, type: 'apres' | 'avant', delay }]
//   apres : la tâche doit COMMENCER au moins « delay » jours après la FIN de la tâche liée
//   avant : la tâche doit se TERMINER au moins « delay » jours avant le DÉBUT de la tâche liée
const dayDiff = (a, b) => Math.round((pdate(b) - pdate(a)) / 864e5);
const taskStart = a => addDays(a.date, -(+a.duree || 0));
const shortLabel = (t, n = 34) => t.length > n ? t.slice(0, n - 1) + '…' : t;

/** Contraintes d'une liste de tâches : from → to (« to » commence ≥ delay jours après la fin de « from »). */
function taskEdgesOf(list) {
  const by = new Map(list.map(a => [a.id, a])), out = [];
  for (const holder of list) for (const d of holder.deps ?? []) {
    const other = by.get(d.id); if (!other || other === holder) continue;
    const type = d.type === 'avant' ? 'avant' : 'apres', delay = Math.max(0, +d.delay || 0), from = type === 'avant' ? holder : other, to = type === 'avant' ? other : holder;
    const slack = dayDiff(from.date, taskStart(to)) - delay;
    out.push({ holder, other, from, to, type, delay, slack, bad: slack < 0 });
  }
  return out;
}
const taskEdges = P => taskEdgesOf(P.actions);

/** true si les dépendances de la liste forment un cycle (algorithme de Kahn). */
function hasCycle(list) {
  const edges = taskEdgesOf(list), indeg = new Map(list.map(a => [a.id, 0])), adj = new Map();
  for (const e of edges) { indeg.set(e.to.id, (indeg.get(e.to.id) ?? 0) + 1); (adj.get(e.from.id) ?? adj.set(e.from.id, []).get(e.from.id)).push(e.to.id); }
  const q = [...indeg].filter(([, n]) => n === 0).map(([id]) => id); let seen = 0;
  while (q.length) { const x = q.pop(); seen++; for (const y of adj.get(x) ?? []) { indeg.set(y, indeg.get(y) - 1); if (indeg.get(y) === 0) q.push(y); } }
  return seen < list.length;
}

/** Calcule (sans rien modifier) les nouvelles dates qui respectent les contraintes : seule la tâche qui subit la dépendance est déplacée. */
function planReschedule(P) {
  const by = new Map(P.actions.map(a => [a.id, a])), dates = new Map(P.actions.map(a => [a.id, a.date])), dur = a => +a.duree || 0;
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (const a of P.actions) {
      if (a.statut === 'fait' || !a.deps?.length) continue;
      let d = dates.get(a.id);
      for (const dep of a.deps) {
        const o = by.get(dep.id); if (!o || o === a) continue; const od = dates.get(o.id), delay = Math.max(0, +dep.delay || 0);
        if (dep.type === 'avant') { const maxEnd = addDays(addDays(od, -dur(o)), -delay); if (d > maxEnd) d = maxEnd; }
        else { const minEnd = addDays(od, delay + dur(a)); if (d < minEnd) d = minEnd; }
      }
      if (d !== dates.get(a.id)) { dates.set(a.id, d); moved = true; }
    }
    if (!moved) break;
  }
  return P.actions.filter(a => dates.get(a.id) !== a.date).map(a => ({ a, from: a.date, to: dates.get(a.id) }));
}
function rescheduleModal(P) {
  const ch = planReschedule(P);
  modal('Recaler les dates selon les contraintes', [
    ch.length ? h('div', {}, h('p', { class: 'muted', style: { marginTop: 0 } }, `${ch.length} tâche(s) seront déplacées (les tâches déjà faites ne bougent pas) :`),
      h('div', { class: 'tablewrap' }, h('table', {}, th('Tâche', 'Avant', 'Après', ['Décalage', 'r']), h('tbody', {}, ch.map(c => h('tr', {}, h('td', {}, c.a.label), h('td', { class: 'num nw' }, fdate(c.from)), h('td', { class: 'num nw' }, fdate(c.to)), h('td', { class: 'r num ' + (c.to > c.from ? 'neg' : 'pos') }, (dayDiff(c.from, c.to) > 0 ? '+' : '') + dayDiff(c.from, c.to) + ' j')))))))
      : h('div', { class: 'tip' }, '✅ Toutes les contraintes sont déjà respectées : aucune date à modifier.')],
    close => [h('button', { class: 'btn sec', onclick: close }, ch.length ? 'Annuler' : 'Fermer'), ch.length ? h('button', { class: 'btn', onclick: () => { for (const c of ch) c.a.date = c.to; close(); toast(`${ch.length} date(s) recalée(s)`); commit(); } }, 'Appliquer') : null]);
}

/** Puces de contraintes d'une tâche (sous son libellé). */
function depChips(P, a) {
  const edges = taskEdges(P), mine = edges.filter(e => e.holder === a), after = edges.filter(e => e.other === a);
  if (!mine.length && !after.length) return null;
  const sign = e => e.delay ? (e.type === 'avant' ? ' − ' : ' + ') + e.delay + ' j' : '';
  return h('div', { class: 'depchips' },
    mine.map(e => { const wait = e.type === 'apres' && e.other.statut !== 'fait', col = e.bad ? IMC.red : wait ? IMC.amber : IMC.blue;
      return h('span', { class: 'depchip', style: { '--pc': col }, title: e.bad ? `Contrainte non respectée : il manque ${-e.slack} j` : `Marge : ${e.slack} j` },
        (e.type === 'avant' ? '⇤ avant « ' : '⇥ après « ') + shortLabel(e.other.label, 28) + ' »' + sign(e), e.bad ? ` ⚠ ${e.slack} j` : wait ? ' · en attente' : ' ✓'); }),
    after.map(e => h('span', { class: 'depchip', style: { '--pc': IMC.violet }, title: 'Cette tâche conditionne :' }, '⛓ conditionne « ' + shortLabel(e.holder.label, 28) + ' »' + sign(e))));
}

/** Supprime une tâche et les dépendances qui la visaient. */
function removeAction(P, a) { P.actions.splice(P.actions.indexOf(a), 1); for (const x of P.actions) if (x.deps) x.deps = x.deps.filter(d => d.id !== a.id); }

/** Fenêtre d'ajout / modification d'une action (durée et dépendances comprises). */
function editAction(P, a) {
  const d = a ? { prio: 'normale', duree: 0, ...a, deps: (a.deps ?? []).map(x => ({ ...x })) } : { id: uid(), label: '', phase: TASK_PHASE, date: todayIso(), statut: 'afaire', notes: '', auto: false, tache: true, prio: 'normale', duree: 0, deps: [] };
  const others = () => P.actions.filter(x => x !== a).sort((p, q) => p.date.localeCompare(q.date));
  const depBox = h('div', { class: 'depbox' });
  const drawDeps = () => {
    depBox.innerHTML = '';
    d.deps.forEach((dep, i) => depBox.append(h('div', { class: 'deprow' },
      h('select', { onchange: e => { dep.type = e.target.value; drawDeps(); } }, [['apres', 'Commence après la fin de'], ['avant', 'Se termine avant le début de']].map(([k, l]) => h('option', { value: k, selected: dep.type === k }, l))),
      h('input', { type: 'number', min: 0, step: 1, value: dep.delay ?? 0, title: 'Délai minimal en jours', onchange: e => { dep.delay = Math.max(0, +e.target.value || 0); } }), h('span', { class: 'muted' }, 'j'),
      h('select', { onchange: e => { dep.id = e.target.value; } }, others().map(x => h('option', { value: x.id, selected: dep.id === x.id }, `${fdate(x.date)} · ${shortLabel(x.label, 54)}`))),
      h('button', { class: 'icon-btn', type: 'button', title: 'Retirer cette dépendance', onclick: () => { d.deps.splice(i, 1); drawDeps(); } }, '🗑️'))));
    if (!d.deps.length) depBox.append(h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Aucune dépendance : la tâche est indépendante.'));
  };
  drawDeps();
  modal(a ? 'Modifier l’action' : 'Nouvelle action', [
    fld('Action', h('input', { type: 'text', value: d.label, oninput: e => { d.label = e.target.value; } })),
    h('div', { class: 'grid g2', style: { gap: '12px' } }, fld('Phase', h('input', { type: 'text', value: d.phase, list: 'phl', oninput: e => { d.phase = e.target.value; } })), fld('Échéance (fin)', h('input', { type: 'date', value: d.date, onchange: e => { d.date = e.target.value; } })),
      fld('Durée (jours)', h('input', { type: 'number', min: 0, step: 1, value: d.duree, onchange: e => { d.duree = Math.max(0, +e.target.value || 0); } }), '0 = jalon ; la tâche occupe [échéance − durée ; échéance]'),
      fld('Statut', h('select', { onchange: e => { d.statut = e.target.value; } }, Object.entries(ST_ACTION).map(([k, l]) => h('option', { value: k, selected: d.statut === k }, l)))),
      fld('Priorité', h('select', { onchange: e => { d.prio = e.target.value; } }, [['normale', 'Normale'], ['haute', '❗ Prioritaire']].map(([k, l]) => h('option', { value: k, selected: d.prio === k }, l))))),
    h('datalist', { id: 'phl' }, [...new Set(P.actions.map(x => x.phase))].map(p => h('option', { value: p }))),
    fld('Notes', h('input', { type: 'text', value: d.notes, oninput: e => { d.notes = e.target.value; } })),
    h('div', { class: 'field' }, h('label', {}, '⛓ Dépendances et délais'), depBox,
      h('button', { class: 'btn sm sec', type: 'button', style: { marginTop: '6px' }, onclick: () => { const o = others().find(x => !d.deps.some(z => z.id === x.id)); if (!o) return toast('Aucune autre tâche disponible'); d.deps.push({ id: o.id, type: 'apres', delay: 0 }); drawDeps(); } }, '＋ Ajouter une dépendance'),
      h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Le délai est un minimum en jours (0 = juste après / juste avant). Les contraintes non respectées sont signalées en rouge et peuvent être recalées automatiquement.'))],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: () => {
      if (!d.label.trim()) return;
      d.deps = d.deps.filter(x => x.id && x.id !== d.id);
      const list = a ? P.actions.map(x => x === a ? { ...x, ...d } : x) : [...P.actions, d];
      if (hasCycle(list)) return toast('⚠️ Ces dépendances forment une boucle (A attend B qui attend A) : modifiez-les');
      if (a) Object.assign(a, d); else P.actions.push(d);
      close(); commit();
    } }, 'Enregistrer')], true);
}

/** Carte « Contraintes et diagramme de Gantt » : renvoie { el, init } (init après insertion dans la page). */
function taskGanttCard(P, today) {
  const st = S.immoGantt ??= { linked: false }, edges = taskEdges(P), linked = new Set(edges.flatMap(e => [e.from.id, e.to.id])), bad = edges.filter(e => e.bad);
  const items = P.actions.filter(a => !st.linked || linked.has(a.id)).sort((a, b) => taskStart(a).localeCompare(taskStart(b)) || a.date.localeCompare(b.date)), idx = new Map(items.map((a, i) => [a.id, i]));
  const starts = items.map(taskStart), t0 = addDays([...starts, today].sort()[0], -3), tEnd = addDays([...items.map(a => a.date), today].sort().pop(), 4), off = d => dayDiff(t0, d);
  const colorOf = a => ACT_ST[actStatus(a, today)][1];
  const legend = h('div', { class: 'ganttleg' }, ...Object.values(ACT_ST).map(([l, c]) => h('span', {}, h('i', { style: { background: c } }), l)), h('span', {}, h('i', { class: 'ln' }), 'contrainte respectée'), h('span', {}, h('i', { class: 'ln bad' }), 'contrainte non respectée'), h('span', {}, h('i', { class: 'ln dash' }), '« avant »'));
  const el = vcard(IMC.violet, '⛓ Contraintes entre tâches et diagramme de Gantt', `${edges.length} contrainte(s) · ${bad.length} non respectée(s)`,
    h('div', { class: 'tiles' }, tile('⛓', 'Contraintes', String(edges.length), `${linked.size} tâche(s) liée(s)`, IMC.violet), tile('✅', 'Respectées', String(edges.length - bad.length), 'marge ≥ 0 j', IMC.green), tile(bad.length ? '⚠️' : '👍', 'Non respectées', String(bad.length), bad.length ? 'à recaler ou à revoir' : 'aucune', bad.length ? IMC.red : IMC.green)),
    bad.length ? h('div', { style: { marginTop: '8px' } }, bad.slice(0, 8).map(e => h('div', { class: 'alrow bad' }, h('span', { class: 'ai' }, '⛔'), h('div', {}, h('b', {}, shortLabel(e.to.label, 50)), ` devrait commencer ≥ ${e.delay} j après la fin de « ${shortLabel(e.from.label, 50)} » : il manque `, h('b', {}, -e.slack + ' j'), '.')))) : null,
    h('div', { class: 'toolbar', style: { margin: '10px 0 6px' } },
      h('button', { class: 'btn sm', onclick: () => rescheduleModal(P) }, '↻ Recaler les dates selon les contraintes'),
      h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: st.linked, onchange: e => { st.linked = e.target.checked; render(); } }), 'Seulement les tâches liées'),
      h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Ajoutez les dépendances avec ✏️ (durée, « après / avant », délai en jours).')),
    legend,
    items.length ? h('div', { class: 'chart-box', style: { height: Math.max(200, items.length * 23 + 70) + 'px' } }, h('canvas', { id: 'imGt' })) : h('div', { class: 'empty', style: { padding: '18px' } }, 'Aucune tâche liée : ouvrez une tâche (✏️) et ajoutez une dépendance.'));
  const init = () => {
    if (!items.length) return;
    const cv = $('#imGt'); if (!cv) return;
    const lab = a => shortLabel(a.label, 38);
    chart(cv, { type: 'bar', data: { labels: items.map(lab), datasets: [{ data: items.map(a => { const s = off(taskStart(a)), e = off(a.date); return (+a.duree || 0) ? [s, e] : [e - 0.5, e + 0.5]; }), backgroundColor: items.map(colorOf), borderRadius: 4, borderSkipped: false, barPercentage: .62, categoryPercentage: 1, minBarLength: 8 }] },
      options: { indexAxis: 'y', layout: { padding: { right: 14 } }, scales: { x: { min: 0, max: off(tEnd), ticks: { maxTicksLimit: 10, callback: v => { const d = addDays(t0, Math.round(v)); return fdate(d).slice(0, 5) + '/' + d.slice(2, 4); } }, grid: { color: css('--line') } }, y: { grid: { display: false }, ticks: { font: { size: 11 } } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => items[i[0].dataIndex].label, label: c => { const a = items[c.dataIndex]; return [` ${fdate(taskStart(a))} → ${fdate(a.date)}${+a.duree ? ` (${a.duree} j)` : ' (jalon)'}`, ` ${ACT_ST[actStatus(a, today)][0]} · ${clean0(a.phase)}`, ...edges.filter(e => e.holder === a).map(e => ` ${e.type === 'avant' ? 'avant' : 'après'} « ${shortLabel(e.other.label, 30)} » (${e.delay} j)${e.bad ? ' ⚠' : ''}`)]; } } } } },
      plugins: [{ id: 'gantt-links', afterDatasetsDraw(ch) {
        const meta = ch.getDatasetMeta(0), c = ch.ctx, a = ch.chartArea; c.save();
        const tx = ch.scales.x.getPixelForValue(off(today)); if (tx >= a.left && tx <= a.right) { c.strokeStyle = '#0ea5e9'; c.lineWidth = 2; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(tx, a.top); c.lineTo(tx, a.bottom); c.stroke(); c.setLineDash([]); }
        for (const e of edges) {
          const i = idx.get(e.from.id), j = idx.get(e.to.id); if (i == null || j == null) continue;
          const b1 = meta.data[i], b2 = meta.data[j]; if (!b1 || !b2) continue;
          const x1 = b1.x, y1 = b1.y, x2 = b2.base, y2 = b2.y, col = e.bad ? '#ef4444' : '#475569';
          c.strokeStyle = col; c.fillStyle = col; c.lineWidth = e.bad ? 2 : 1.4; c.setLineDash(e.type === 'avant' ? [4, 3] : []); c.beginPath(); c.moveTo(x1, y1);
          if (x2 > x1 + 12) { const xm = x1 + 8; c.lineTo(xm, y1); c.lineTo(xm, y2); c.lineTo(x2, y2); }
          else { const ym = (y1 + y2) / 2 + (y2 > y1 ? 6 : -6); c.lineTo(x1 + 8, y1); c.lineTo(x1 + 8, ym); c.lineTo(x2 - 8, ym); c.lineTo(x2 - 8, y2); c.lineTo(x2, y2); }
          c.stroke(); c.setLineDash([]); c.beginPath(); c.moveTo(x2, y2); c.lineTo(x2 - 6, y2 - 3.5); c.lineTo(x2 - 6, y2 + 3.5); c.closePath(); c.fill();
          if (e.delay) { c.font = '10px "Segoe UI", sans-serif'; c.textAlign = 'left'; c.fillStyle = col; c.fillText((e.type === 'avant' ? '−' : '+') + e.delay + ' j', Math.min(x1, x2) + 11, (y1 + y2) / 2 + (y1 === y2 ? -4 : 3)); }
        }
        c.restore(); } }] });
  };
  return { el, init };
}
const clean0 = p => String(p).replace(/^\d+\.\s*/, '');
