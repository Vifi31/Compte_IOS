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

/**
 * Calcule l'échéance (fin) d'une tâche d'après ses contraintes et les durées, sans rien modifier. Renvoie { date, why[] }.
 *  - « après X » : fin ≥ fin(X) + délai + durée ; « avant X » : fin ≤ début(X) − délai ; la date retenue est la plus tardive des « après », bornée par la plus proche des « avant ».
 *  - une tâche liée sans date (échéance vide) est elle-même calculée d'abord ; sans contrainte exploitable : date du jour + durée.
 * `list` peut contenir des tâches en cours de saisie (a absente de P.actions) ; la date de `a` n'est jamais utilisée pour son propre calcul.
 */
function computeDueDate(P, a, list = P.actions) {
  const all = list.includes(a) ? list : [...list, a], by = new Map(all.map(x => [x.id, x])), memo = new Map(), busy = new Set(), dur = x => +x.duree || 0;
  const endOf = x => {
    if (x !== a && x.date) return x.date;
    if (memo.has(x.id)) return memo.get(x.id);
    if (busy.has(x.id)) return null; busy.add(x.id);
    const r = calc(x); busy.delete(x.id); memo.set(x.id, r.date); return r.date;
  };
  const calc = x => {
    let min = null, max = null; const why = [];
    for (const dep of x.deps ?? []) {
      const o = by.get(dep.id); if (!o || o === x) continue; const od = endOf(o); if (!od) continue; const delay = Math.max(0, +dep.delay || 0);
      if (dep.type === 'avant') { const m = addDays(od, -dur(o) - delay); if (!max || m < max) { max = m; } why.push(`doit finir ${delay ? delay + ' j ' : ''}avant le début de « ${shortLabel(o.label, 30)} » (${fdate(addDays(od, -dur(o)))}) → au plus tard le ${fdate(m)}`); }
      else { const m = addDays(od, delay + dur(x)); if (!min || m > min) min = m; why.push(`commence ${delay ? delay + ' j ' : ''}après la fin de « ${shortLabel(o.label, 30)} » (${fdate(od)}) + ${dur(x)} j de durée → au plus tôt le ${fdate(m)}`); }
    }
    let date = min ?? max;
    if (min && max && max < min) { date = min; why.push(`⚠ contraintes incompatibles : « avant » demande le ${fdate(max)}, « après » le ${fdate(min)} (la plus tardive est retenue)`); }
    else if (min && max) date = min;
    if (!date) { date = addDays(todayIso(), dur(x)); why.push(`aucune contrainte exploitable : aujourd’hui + durée (${dur(x)} j)`); }
    return { date, why };
  };
  return calc(a);
}

/** Détail du calcul d'échéance (fenêtre) avec « Appliquer » pour enregistrer la date calculée dans la tâche. */
function dueDateModal(P, a, onApply) {
  const r = computeDueDate(P, a), same = r.date === a.date;
  modal('Calcul de l’échéance : ' + shortLabel(a.label, 50), [
    h('p', { style: { marginTop: 0 } }, 'Échéance calculée : ', h('b', {}, fdate(r.date)), a.date ? [' (actuelle : ', fdate(a.date), same ? ' — identique' : '', ')'] : null),
    h('ul', { class: 'muted', style: { fontSize: '13px', paddingLeft: '18px' } }, r.why.map(w => h('li', {}, w))),
    h('div', { class: 'muted', style: { fontSize: '12px' } }, 'Une tâche déjà faite n’est jamais recalculée automatiquement.')],
    close => [h('button', { class: 'btn sec', onclick: close }, 'Fermer'), same && a.dateAuto ? null : h('button', { class: 'btn', onclick: () => { onApply(r.date); close(); } }, 'Appliquer cette date')]);
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
function removeAction(P, a) { apiFetch('/api/immo/files?aid=' + encodeURIComponent(a.id), { method: 'DELETE' }).catch(() => {}); if (S.immoFiles) delete S.immoFiles[a.id]; P.actions.splice(P.actions.indexOf(a), 1); for (const x of P.actions) if (x.deps) x.deps = x.deps.filter(d => d.id !== a.id); }

/** Carte « Contraintes et diagramme de Gantt » : renvoie { el, init } (init après insertion dans la page). */
function taskGanttCard(P, today) {
  const st = S.immoGantt ??= { linked: false }, edges = taskEdges(P), linked = new Set(edges.flatMap(e => [e.from.id, e.to.id])), bad = edges.filter(e => e.bad);
  const items = P.actions.filter(a => !st.linked || linked.has(a.id)).sort((a, b) => taskStart(a).localeCompare(taskStart(b)) || a.date.localeCompare(b.date)), idx = new Map(items.map((a, i) => [a.id, i]));
  const starts = items.map(taskStart), t0 = addDays([...starts, today].sort()[0], -3), tEnd = addDays([...items.map(a => a.date), today].sort().pop(), 4), off = d => dayDiff(t0, d);
  const bySp = st.color === 'sp' && spList(P).length, colorOf = a => bySp ? (spColor(P, a) ?? SP_NONE) : ACT_ST[actStatus(a, today)][1];
  const legend = h('div', { class: 'ganttleg' }, ...(bySp ? spGroups(P).filter(g => g.id || P.actions.some(a => !spOf(P, a))).map(g => h('span', {}, h('i', { style: { background: g.couleur } }), g.nom)) : Object.values(ACT_ST).map(([l, c]) => h('span', {}, h('i', { style: { background: c } }), l))), h('span', {}, h('i', { class: 'ln' }), 'contrainte respectée'), h('span', {}, h('i', { class: 'ln bad' }), 'contrainte non respectée'), h('span', {}, h('i', { class: 'ln dash' }), '« avant »'));
  const el = vcard(IMC.violet, '⛓ Contraintes entre tâches et diagramme de Gantt', `${edges.length} contrainte(s) · ${bad.length} non respectée(s)`,
    h('div', { class: 'tiles' }, tile('⛓', 'Contraintes', String(edges.length), `${linked.size} tâche(s) liée(s)`, IMC.violet), tile('✅', 'Respectées', String(edges.length - bad.length), 'marge ≥ 0 j', IMC.green), tile(bad.length ? '⚠️' : '👍', 'Non respectées', String(bad.length), bad.length ? 'à recaler ou à revoir' : 'aucune', bad.length ? IMC.red : IMC.green)),
    bad.length ? h('div', { style: { marginTop: '8px' } }, bad.slice(0, 8).map(e => h('div', { class: 'alrow bad' }, h('span', { class: 'ai' }, '⛔'), h('div', {}, h('b', {}, shortLabel(e.to.label, 50)), ` devrait commencer ≥ ${e.delay} j après la fin de « ${shortLabel(e.from.label, 50)} » : il manque `, h('b', {}, -e.slack + ' j'), '.')))) : null,
    h('div', { class: 'toolbar', style: { margin: '10px 0 6px' } },
      h('button', { class: 'btn sm', onclick: () => rescheduleModal(P) }, '↻ Recaler les dates selon les contraintes'),
      h('label', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center', cursor: 'pointer' } }, h('input', { type: 'checkbox', checked: st.linked, onchange: e => { st.linked = e.target.checked; render(); } }), 'Seulement les tâches liées'),
      h('select', { title: 'Couleur des barres', onchange: e => { st.color = e.target.value; render(); } }, [['', 'Couleurs : statut'], ['sp', '🎨 Couleurs : sous-projet']].map(([k, l]) => h('option', { value: k, selected: (st.color ?? '') === k }, l))),
      h('button', { class: 'btn sm sec', onclick: () => spModal(P) }, '🎨 Sous-projets'),
      h('span', { class: 'muted', style: { fontSize: '12px' } }, 'Ajoutez les dépendances avec ✏️ (durée, « après / avant », délai en jours).')),
    legend,
    items.length ? h('div', { class: 'chart-box', style: { height: Math.max(200, items.length * 23 + 70) + 'px' } }, h('canvas', { id: 'imGt' })) : h('div', { class: 'empty', style: { padding: '18px' } }, 'Aucune tâche liée : ouvrez une tâche (✏️) et ajoutez une dépendance.'));
  const init = () => {
    if (!items.length) return;
    const cv = $('#imGt'); if (!cv) return;
    const lab = a => shortLabel(a.label, 38);
    chart(cv, { type: 'bar', data: { labels: items.map(lab), datasets: [{ data: items.map(a => { const s = off(taskStart(a)), e = off(a.date); return (+a.duree || 0) ? [s, e] : [e - 0.5, e + 0.5]; }), backgroundColor: items.map(colorOf), borderRadius: 4, borderSkipped: false, barPercentage: .62, categoryPercentage: 1, minBarLength: 8 }] },
      options: { indexAxis: 'y', layout: { padding: { right: 14 } }, scales: { x: { min: 0, max: off(tEnd), ticks: { maxTicksLimit: 10, callback: v => { const d = addDays(t0, Math.round(v)); return fdate(d).slice(0, 5) + '/' + d.slice(2, 4); } }, grid: { color: css('--line') } }, y: { grid: { display: false }, ticks: { font: { size: 11 }, color: ctx => spColor(P, items[ctx.index] ?? {}) ?? css('--muted') } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => items[i[0].dataIndex].label, label: c => { const a = items[c.dataIndex]; return [` ${fdate(taskStart(a))} → ${fdate(a.date)}${+a.duree ? ` (${a.duree} j)` : ' (jalon)'}`, ` ${ACT_ST[actStatus(a, today)][0]} · ${clean0(a.phase)}${spOf(P, a) ? ' · 🎨 ' + spOf(P, a).nom : ''}`, ...edges.filter(e => e.holder === a).map(e => ` ${e.type === 'avant' ? 'avant' : 'après'} « ${shortLabel(e.other.label, 30)} » (${e.delay} j)${e.bad ? ' ⚠' : ''}`)]; } } } } },
      plugins: [{ id: 'sp-bands', beforeDatasetsDraw(ch) { // lignes teintées selon le sous-projet de la tâche
        const a = ch.chartArea, c = ch.ctx, rh = (a.bottom - a.top) / items.length; c.save();
        items.forEach((it, i) => { const col = spColor(P, it); if (!col) return; c.globalAlpha = .13; c.fillStyle = col; c.fillRect(0, a.top + i * rh, a.right, rh); c.globalAlpha = 1; c.fillRect(0, a.top + i * rh, 4, rh); });
        c.restore(); } }, { id: 'gantt-links', afterDatasetsDraw(ch) {
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
