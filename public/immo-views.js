'use strict';
// ============ Immobilier : pages Suivi et Plan d'actions (présentation colorée avec graphiques) ============
const ACT_ST = { fait: ['Fait', IMC.green], encours: ['En cours', IMC.blue], afaire: ['À faire', IMC.slate], retard: ['En retard', IMC.red], na: ['Non applicable', IMC.slate] };
const actStatus = (a, today) => a.statut === 'fait' ? 'fait' : a.date < today ? 'retard' : a.statut === 'encours' ? 'encours' : 'afaire';
const PHASE_PAL = ['#8b5cf6', '#6366f1', '#ec4899', '#f59e0b', '#0ea5e9', '#10b981', '#14b8a6'];
const urgencyColor = (a, today) => a.date < today ? IMC.red : a.date <= addDays(today, 7) ? IMC.amber : IMC.blue;
const stackOpts = (horizontal) => ({ indexAxis: horizontal ? 'y' : 'x', scales: { x: { stacked: true, grid: { display: !!horizontal }, ticks: { maxRotation: 45, precision: 0 } }, y: { stacked: true, grid: { display: !horizontal }, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } });

// ====================================================== Suivi
async function pageSuivi(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…')); const P = await immoLoad(); v.innerHTML = ''; if (S.page !== 'immo-suivi') return;
  const sim = sim0(P), s = sim.summary, today = todayIso(), amt = a => a.montantReel != null && a.montantReel !== '' ? +a.montantReel : P.prix * (+a.pct || 0) / 100;
  const paid = P.appels.filter(a => a.statut === 'paye'), called = P.appels.filter(a => a.statut === 'appele'), sorted = [...P.appels].sort((a, b) => a.date.localeCompare(b.date));
  const paidAmt = sum(paid.map(amt)), calledAmt = sum(called.map(amt)), nxt = sorted.find(a => a.statut !== 'paye'), paidPct = P.prix ? paidAmt / P.prix * 100 : 0;
  v.append(immoHeader(P));
  v.append(h('div', { class: 'grid g4' }, kpi('k2', 'Appels payés', eur0(paidAmt), `${pc1(paidPct)} du prix · ${paid.length}/${P.appels.length} étapes`, '✅'), kpi(called.length ? 'k1' : 'k4', 'Appelés, à payer', eur0(calledAmt), called.length ? called.map(a => a.label).join(', ').slice(0, 60) : 'aucun appel en cours', '📨'),
    kpi('k3', 'Reste à payer', eur0(Math.max(0, P.prix - paidAmt)), 'sur le prix du bien', '🧮'), kpi('k4', 'Prochaine échéance', nxt ? fdate(nxt.date) : '–', nxt ? `${nxt.label} · ${eur0(amt(nxt))} · ${relDays(nxt.date, today)}` : 'tout est payé', '⏰')));

  // -- paiement du prix + cumul prévu / payé
  v.append(h('div', { class: 'grid g12', style: { marginTop: '14px' } },
    vcard(IMC.green, '💳 Paiement du prix', `${pc1(paidPct)} réglé`, h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imSD' }))),
    vcard(IMC.indigo, '📈 Appels de fonds : prévu et payé', 'cumul', h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imSuivi' })))));
  vDonut($('#imSD'), ['Payé', 'Appelé, à payer', 'Reste à appeler'], [Math.round(paidAmt), Math.round(calledAmt), Math.round(Math.max(0, P.prix - paidAmt - calledAmt))], [IMC.green, IMC.amber, '#cbd5e1'], [Math.round(paidPct) + ' %', 'réglé'], { fmt: eur0 });
  const planned = []; let cp = 0; for (const a of sorted) { cp += P.prix * (+a.pct || 0) / 100; planned.push({ x: a.date, y: Math.round(cp) }); }
  const realPts = []; let cr = 0; for (const a of [...paid].sort((x, y) => (x.dateReelle || x.date).localeCompare(y.dateReelle || y.date))) { cr += amt(a); realPts.push({ x: a.dateReelle || a.date, y: Math.round(cr) }); }
  const labels = [...new Set([...planned.map(p => p.x), ...realPts.map(p => p.x), today])].sort();
  const stepVal = (pts, d) => { let y = 0; for (const p of pts) if (p.x <= d) y = p.y; return y; };
  chart($('#imSuivi'), { type: 'line', data: { labels: labels.map(fdate), datasets: [
    { label: 'Prévu (cumul)', data: labels.map(d => stepVal(planned, d)), borderColor: '#94a3b8', borderDash: [6, 4], borderWidth: 2.5, stepped: true, pointRadius: 3 },
    { label: 'Payé (cumul)', data: labels.map(d => d <= today ? stepVal(realPts, d) : null), borderColor: '#10b981', backgroundColor: ctx => gradient(ctx, '#10b981'), fill: true, borderWidth: 3, stepped: true, pointRadius: 4 }] },
    options: { scales: { y: { ticks: { callback: eurTick }, suggestedMax: P.prix }, x: { grid: { display: false } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom' } } } });

  // -- tableau de suivi des appels
  const rows = sorted.map(a => { const i = P.appels.indexOf(a), planned = P.prix * (+a.pct || 0) / 100, over = a.statut !== 'paye' && a.date < today;
    return h('tr', { class: over ? 'rowshort' : a.statut === 'paye' ? 'rowpaid' : a.statut === 'appele' ? 'rowcalled' : '' }, h('td', {}, h('b', {}, a.label), over ? h('span', { class: 'badge', style: { marginLeft: '6px', color: 'var(--bad)' } }, 'échéance dépassée') : null), h('td', { class: 'num nw' }, fdate(a.date), h('div', { class: 'sub' }, a.statut === 'paye' ? '' : relDays(a.date, today))), h('td', { class: 'r num' }, eur0(planned)),
      h('td', { style: { width: '112px' } }, sel(a, 'statut', ST_APPEL, { now: true, after: () => { if (a.statut === 'paye') { a.dateReelle ||= todayIso(); if (a.montantReel == null) a.montantReel = Math.round(planned * 100) / 100; } } })),
      h('td', { style: { width: '118px' } }, bind(a, 'montantReel', { type: 'number', step: '0.01', ph: String(Math.round(planned)), fk: 'mr' + i })), h('td', { style: { width: '140px' } }, bind(a, 'dateReelle', { type: 'date' })),
      h('td', { class: 'r num ' + (a.montantReel != null && Math.abs(a.montantReel - planned) > 1 ? 'neg' : 'muted') }, a.montantReel != null ? signed(Math.round(a.montantReel - planned)).replace(/,00/, '') : '–')); });
  v.append(vcard(IMC.indigo, '📋 Suivi des appels de fonds', `${paid.length} payé(s) · ${called.length} appelé(s) · ${P.appels.length - paid.length - called.length} à venir`, h('div', { class: 'tablewrap' }, h('table', {}, th('Étape', 'Date prévue', ['Montant prévu', 'r'], 'Statut', ['Montant réel (€)', 'r'], 'Payé le', ['Écart', 'r']), h('tbody', {}, rows))),
    h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '12px' } }, 'Passer une étape en « Payé » la retire de la simulation à venir : l’épargne de départ doit alors refléter le solde réel (date de référence du projet).')));

  // -- prévu vs réel par étape + frais annexes
  const fPaid = sum(P.frais.filter(f => f.paye).map(f => +f.montant || 0)), fTodo = sum(P.frais.filter(f => !f.paye).map(f => +f.montant || 0));
  v.append(h('div', { class: 'pair' },
    vcard(IMC.pink, '⚖️ Prévu et réel par étape', null, h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imSE2' }))),
    vcard(IMC.amber, '🧾 Frais annexes', `${eur0(fPaid)} réglés sur ${eur0(fPaid + fTodo)}`, h('div', { class: 'chart-box', style: { height: '150px' } }, h('canvas', { id: 'imSF' })),
      h('div', { class: 'tablewrap', style: { marginTop: '8px' } }, h('table', {}, th('Frais', 'Date prévue', ['Montant', 'r'], 'Réglé'), h('tbody', {}, P.frais.map(f => h('tr', { class: f.paye ? 'rowpaid' : '' }, h('td', {}, f.label), h('td', { class: 'num nw' }, fdate(f.date)), h('td', { class: 'r num' }, eur0(f.montant)), h('td', {}, chk(f, 'paye', f.paye ? 'payé' : 'à payer'))))))))));
  chart($('#imSE2'), { type: 'bar', data: { labels: sorted.map(a => a.label.length > 18 ? a.label.slice(0, 17) + '…' : a.label), datasets: [
    { label: 'Prévu', data: sorted.map(a => Math.round(P.prix * (+a.pct || 0) / 100)), backgroundColor: sorted.map(a => a.statut === 'prevu' ? '#cbd5e1' : '#94a3b8'), borderRadius: 5 },
    { label: 'Réel (payé)', data: sorted.map(a => a.statut === 'paye' ? Math.round(amt(a)) : null), backgroundColor: IMC.green, borderRadius: 5 },
    { label: 'Appelé', data: sorted.map(a => a.statut === 'appele' ? Math.round(amt(a)) : null), backgroundColor: IMC.amber, borderRadius: 5 }] },
    options: { scales: { y: { ticks: { callback: eurTick } }, x: { grid: { display: false }, ticks: { maxRotation: 55 } } }, plugins: { tooltip: tipEur, legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } } } } });
  vDonut($('#imSF'), ['Réglés', 'À payer'], [Math.round(fPaid), Math.round(fTodo)], [IMC.green, IMC.amber], [P.frais.length ? Math.round(fPaid / Math.max(1, fPaid + fTodo) * 100) + ' %' : '–', 'réglés'], { cutout: '62%', legend: 'right', fmt: eur0 });

  // -- tâches et plan d'actions
  { const acts = P.actions, nDone = acts.filter(a => a.statut === 'fait').length, nLate = acts.filter(a => a.statut !== 'fait' && a.date < today).length, nTask = acts.filter(a => a.tache).length;
    const todo = acts.filter(a => a.statut !== 'fait').sort((a, b) => ((a.date < today ? 0 : 1) - (b.date < today ? 0 : 1)) || (a.prio === 'haute' ? 0 : 1) - (b.prio === 'haute' ? 0 : 1) || a.date.localeCompare(b.date));
    const shown = todo.slice(0, 12);
    v.append(vcard(IMC.green, '✅ Tâches et plan d’actions', `${nDone}/${acts.length} faites${nLate ? ' · ' + nLate + ' en retard' : ''}${nTask ? ' · ' + nTask + ' tâche(s) perso' : ''}`,
      h('div', { class: 'progress', style: { '--c': nLate ? IMC.amber : IMC.green, height: '12px', margin: '0 0 6px' } }, h('i', { style: { width: (acts.length ? nDone / acts.length * 100 : 0) + '%' } })),
      taskQuickAdd(P),
      shown.length ? h('div', { class: 'tablewrap', style: { marginTop: '8px' } }, h('table', {}, th('', 'Action', 'Phase', 'Échéance', 'Statut'), h('tbody', {}, shown.map(a => { const over = a.date < today;
        return h('tr', { class: over ? 'rowshort' : '' }, h('td', { style: { width: '30px' } }, h('input', { type: 'checkbox', title: 'Marquer comme fait', onchange: () => { a.statut = 'fait'; commit(); } })),
          h('td', {}, h('b', {}, a.label), a.tache ? h('span', { class: 'badge', style: { marginLeft: '6px', color: 'var(--primary)' } }, 'ma tâche') : null, a.prio === 'haute' ? h('span', { class: 'badge', style: { marginLeft: '6px', color: 'var(--bad)' } }, '❗') : null, a.notes ? h('div', { class: 'sub', style: { maxWidth: 'none', whiteSpace: 'normal' } }, a.notes) : null),
          h('td', { class: 'muted', style: { fontSize: '12px' } }, a.phase.replace(/^\d+\.\s*/, '')), h('td', { class: 'nw' }, fdate(a.date), ' ', pill(relDays(a.date, today), urgencyColor(a, today))), h('td', { style: { width: '120px' } }, sel(a, 'statut', ST_ACTION))); })))) : h('div', { class: 'muted', style: { marginTop: '8px' } }, acts.length ? '🎉 Toutes les actions sont faites.' : 'Aucune action : générez le plan dans « Plan d’actions » ou ajoutez vos tâches ci-dessus.'),
      h('div', { class: 'toolbar', style: { margin: '8px 0 0' } }, h('a', { class: 'btn sm sec', href: '#/immo-actions', style: { textDecoration: 'none' } }, todo.length > shown.length ? `Voir les ${todo.length - shown.length} autres actions →` : 'Ouvrir le plan d’actions →')))); }

  // -- épargne réelle vs prévue + prêt relais
  const linked = P.epargne.sources.filter(x => S.data.accounts.some(a => a.number === x.compte));
  const real = sum(linked.map(x => S.data.accounts.find(a => a.number === x.compte).balance)), simNow = [...sim.snaps].reverse().find(p => p.date <= today) ?? sim.snaps[0], gap = real - simNow.cash;
  const R = P.relais, tire = +R.montantTire || 0;
  v.append(h('div', { class: 'pair' },
    vcard(IMC.blue, '🐖 Épargne réelle et prévue', linked.length ? (gap >= 0 ? 'en avance sur le plan' : 'en retard sur le plan') : null,
      linked.length ? [h('div', { class: 'tiles' }, tile('💰', 'Solde réel', eur0(real), linked.map(x => x.label).join(', ').slice(0, 40), IMC.green), tile('🎯', 'Prévu (simulation)', eur0(simNow.cash), 'à ce jour', IMC.indigo), tile(gap >= 0 ? '📈' : '📉', 'Écart', signed(Math.round(gap)).replace(/,00/, ''), gap >= 0 ? 'avance' : 'retard', gap >= 0 ? IMC.green : IMC.red)),
        h('div', { class: 'chart-box', style: { height: '110px', marginTop: '8px' } }, h('canvas', { id: 'imSE' }))]
        : h('div', { class: 'empty', style: { padding: '18px' } }, 'Liez vos comptes d’épargne (Paramètres › Épargne dédiée) pour comparer le réel au prévu.'),
      h('div', { class: 'toolbar', style: { margin: '8px 0 0' } }, h('a', { class: 'btn sm sec', href: '#/immo-params', style: { textDecoration: 'none' } }, 'Gérer l’épargne'))),
    vcard(IMC.orange, '🌉 Prêt relais', R.actif ? (s.relaisUtilise ? 'nécessaire selon la simulation' : 'non nécessaire selon la simulation') : null,
      R.actif ? [h('div', { class: 'tiles' }, tile('📏', 'Plafond', eur0(R.montant), `${fdate(R.dateDebut)} → ${fdate(addM(R.dateDebut, +R.dureeMois || 24))}`, IMC.orange), tile('🎯', 'Simulation', s.relaisUtilise ? eur0(s.relaisMax) : 'Non utilisé', s.relaisUtilise ? '1er déblocage ' + fdate(s.relaisPremierDeblocage) : '', s.relaisUtilise ? IMC.amber : IMC.green), tile('💸', 'Débloqué réellement', eur0(tire), tire ? `échéance dans ${Math.max(0, monthsDiff(today, addM(R.dateDebut, +R.dureeMois || 24)))} mois` : 'rien de débloqué', IMC.violet)),
        h('div', { class: 'progress', style: { '--c': IMC.orange, height: '12px', margin: '10px 0 4px' } }, h('i', { style: { width: Math.min(100, R.montant ? tire / R.montant * 100 : 0) + '%' } })), h('div', { class: 'muted', style: { fontSize: '12px' } }, `${R.montant ? pc1(tire / R.montant * 100) : '0 %'} du plafond utilisé`),
        h('div', { class: 'grid g3', style: { marginTop: '10px' } }, fld('Montant débloqué', bind(R, 'montantTire', { type: 'number', step: '500', ph: '0', fk: 'rt' })), fld('Débloqué le', bind(R, 'dateTirage', { type: 'date' })), fld('Remboursé le', bind(R, 'dateRemboursement', { type: 'date' }))),
        tire ? h('div', { class: 'tip', style: { marginTop: '10px' } }, `Intérêts mensuels estimés : ${eur0(tire * (+R.tauxPct || 0) / 1200)}.`) : null]
        : h('div', { class: 'empty', style: { padding: '18px' } }, 'Prêt relais désactivé.'))));
  if (linked.length) chart($('#imSE'), { type: 'bar', data: { labels: ['Réel', 'Prévu'], datasets: [{ data: [Math.round(real), Math.round(simNow.cash)], backgroundColor: [IMC.green, IMC.indigo], borderRadius: 6 }] },
    options: { indexAxis: 'y', scales: { x: { ticks: { callback: eurTick } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + eur0(c.parsed.x) } } } } });
}

// ====================================================== Plan d'actions
async function pageActions(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…')); const P = await immoLoad();
  try { S.immoFiles = (await (await fetch('/api/immo/files/counts')).json()).counts ?? {}; } catch { S.immoFiles ??= {}; }
  v.innerHTML = ''; if (S.page !== 'immo-actions') return;
  const sim = sim0(P), today = todayIso(), A = P.actions, st = S.immoAct ??= { phase: '', statut: '' }, naSet = new Set(A.filter(a => !condState(P, sim, a).ok).map(a => a.id)), stOf = a => (naSet.has(a.id) ? 'na' : actStatus(a, today)), cnt = k => A.filter(a => stOf(a) === k).length;
  const phases = immoPhasesUsed(P), done = cnt('fait'), late = cnt('retard'), doing = cnt('encours'), afaire = cnt('afaire');
  const soon = A.filter(a => !naSet.has(a.id) && a.statut !== 'fait' && a.date >= today && a.date <= addDays(today, 30)).sort((a, b) => a.date.localeCompare(b.date));
  v.append(immoHeader(P));
  v.append(h('div', { class: 'grid g4' }, kpi('k3', 'Actions', String(A.length), `${phases.length} phases`, '✅'), kpi('k2', 'Réalisées', String(done), A.length ? pc1(done / A.length * 100) + ' du plan' : '–', '🎯'), kpi(late ? 'k1' : 'k4', 'En retard', String(late), late ? 'à traiter en priorité' : 'aucune', '⏰'), kpi('k4', 'À 30 jours', String(soon.length), soon[0] ? `prochaine : ${fdate(soon[0].date)}` : 'rien d’imminent', '🗓️')));
  const urgent = A.filter(a => !naSet.has(a.id) && a.statut !== 'fait' && (a.date < today || a.date <= addDays(today, 45) || a.prio === 'haute')).sort((a, b) => ((a.date < today ? 0 : 1) - (b.date < today ? 0 : 1)) || a.date.localeCompare(b.date)).slice(0, 12);
  const urgentCard = vcard(IMC.red, '🔥 À traiter en priorité', urgent.length ? `${urgent.length} action(s) · retards, échéances à 45 jours et priorités` : null, urgent.length ? h('div', { class: 'urgentgrid' }, urgent.map(a => h('div', { class: 'actrow st-' + stOf(a), style: { '--sc': urgencyColor(a, today) } },
    h('input', { type: 'checkbox', title: 'Marquer comme fait', onchange: () => { a.statut = 'fait'; commit(); } }),
    h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'actl' }, a.label, a.prio === 'haute' ? ' ❗' : ''), h('div', { class: 'sub', style: { maxWidth: 'none' } }, a.phase.replace(/^\d+\.\s*/, ''))),
    pill(relDays(a.date, today), urgencyColor(a, today))))) : h('div', { class: 'empty', style: { padding: '20px' } }, '🎉 Rien d’urgent : toutes les actions des 45 prochains jours sont faites.'));
  urgentCard.style.marginTop = '14px';
  v.append(urgentCard);
  v.append(h('div', { class: 'card ccard', style: { '--ac': IMC.indigo } }, h('div', { class: 'toolbar', style: { margin: 0 } },
    h('button', { class: 'btn', onclick: () => { const gen = immoGenActions(P, sim); let add = 0, upd = 0; for (const g of gen) { const e = A.find(a => a.key === g.key); if (!e) { A.push({ id: uid(), statut: 'afaire', auto: true, ...g }); add++; } else if (e.auto && e.statut !== 'fait') { if (!e.deps?.length) e.date = g.date; e.label = g.label; e.notes = g.notes; e.phase = g.phase; upd++; } } commit(); toast(`${add} action(s) ajoutée(s), ${upd} mise(s) à jour`); } }, A.length ? '↻ Mettre à jour le plan' : '✨ Générer le plan d’actions'),
    h('button', { class: 'btn sec', onclick: () => editAction(P, null) }, '＋ Ajouter une action'),
    h('button', { class: 'btn sec', title: 'Liste des phases, ordre, renommage et modèles de tâches', onclick: () => phasesModal(P) }, '🗂️ Phases et modèles'),
    h('select', { onchange: e => { st.phase = e.target.value; render(); } }, h('option', { value: '' }, 'Toutes les phases'), phases.map(p => h('option', { value: p, selected: st.phase === p }, p))),
    h('select', { title: 'Ordre des actions dans chaque phase', onchange: e => { st.order = e.target.value; render(); } }, [['dep', '🔗 Regroupées par dépendances'], ['date', '📅 Par date']].map(([k, l]) => h('option', { value: k, selected: (st.order ?? 'dep') === k }, l))),
    h('select', { onchange: e => { st.statut = e.target.value; render(); } }, h('option', { value: '' }, 'Tous les statuts'), Object.entries(ST_ACTION).map(([k, l]) => h('option', { value: k, selected: st.statut === k }, l))),
    h('span', { style: { marginLeft: 'auto' } }, pdfBtn('📄 Plan en PDF', () => immoActionsPdf(P, sim)))),
    h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '12px' } }, 'Le plan est généré à partir des dates, des appels de fonds et de la simulation (déblocages du relais inclus). Vos actions, tâches et statuts sont conservés quand vous le mettez à jour.')));
  v.append(taskQuickAdd(P));
  if (!A.length) { v.append(h('div', { class: 'card empty', style: { marginTop: '14px' } }, 'Aucune action : cliquez sur « Générer le plan d’actions ».')); return; }
  const phaseNav = h('div', { class: 'chips phasenav' }), phaseBox = h('div', {}); // phases en haut de l'écran ; tableau de bord, Gantt et calendrier en dessous
  v.append(phaseNav, railLegend(), phaseBox);

  // -- tableau de bord : répartition, avancement par phase, échéances par mois
  v.append(h('div', { class: 'grid g3', style: { marginTop: '14px' } },
    vcard(IMC.indigo, '🎯 Répartition', `${A.length} actions`, h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imAS' }))),
    vcard(IMC.pink, '🧱 Avancement par phase', null, h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imAP' }))),
    vcard(IMC.blue, '🗓️ Échéances par mois', 'réalisées · à venir · en retard', h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imAM' })))));
  const KEYS = ['fait', 'encours', 'afaire', 'retard'];
  vDonut($('#imAS'), KEYS.map(k => ACT_ST[k][0]), KEYS.map(cnt), KEYS.map(k => ACT_ST[k][1]), [Math.round(done / A.length * 100) + ' %', 'réalisé'], { cutout: '66%' });
  chart($('#imAP'), { type: 'bar', data: { labels: phases.map(p => p.replace(/^\d+\.\s*/, '')), datasets: KEYS.map(k => ({ label: ACT_ST[k][0], data: phases.map(p => A.filter(a => a.phase === p && stOf(a) === k).length), backgroundColor: ACT_ST[k][1], borderRadius: 3 })) }, options: stackOpts(true) });
  const dates = A.map(a => a.date).sort(), months = []; for (let m = dates[0].slice(0, 7) + '-01'; m <= dates[dates.length - 1]; m = addM(m, 1)) months.push(m);
  chart($('#imAM'), { type: 'bar', data: { labels: months.map(mlab), datasets: KEYS.map(k => ({ label: ACT_ST[k][0], data: months.map(m => A.filter(a => a.date.slice(0, 7) === m.slice(0, 7) && stOf(a) === k).length), backgroundColor: ACT_ST[k][1], borderRadius: 3 })) }, options: stackOpts(false) });

  { const g = taskGanttCard(P, today); v.append(g.el); g.init(); }

  // -- calendrier des phases + à traiter en priorité
  const ph = phases.map(p => { const l = A.filter(a => a.phase === p).map(a => a.date).sort(); return { p, s: l[0], e: l[l.length - 1], n: A.filter(a => a.phase === p).length, d: A.filter(a => a.phase === p && a.statut === 'fait').length }; }), t0 = ph[0].s, off = d => monthsDiff(t0, d) + (pdate(d).getDate() - 1) / 31;
  v.append(vcard(IMC.violet, '📅 Calendrier des phases', 'aujourd’hui = ligne bleue', h('div', { class: 'chart-box mid' }, h('canvas', { id: 'imPh' }))));
  chart($('#imPh'), { type: 'bar', data: { labels: ph.map(x => x.p.replace(/^\d+\.\s*/, '') + ` (${x.d}/${x.n})`), datasets: [{ data: ph.map(x => [off(x.s), Math.max(off(x.e), off(x.s) + .4)]), backgroundColor: ph.map((_, i) => PHASE_PAL[i % 7]), borderRadius: 6, borderSkipped: false }] },
    options: { indexAxis: 'y', scales: { x: { ticks: { callback: x => mlab(addM(t0, Math.round(x))), maxTicksLimit: 8 }, grid: { color: css('--line') } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fdate(ph[c.dataIndex].s)} → ${fdate(ph[c.dataIndex].e)}` } } } },
    plugins: [{ id: 'today', afterDraw(ch) { const x = ch.scales.x.getPixelForValue(off(today)); if (x >= ch.chartArea.left && x <= ch.chartArea.right) { const c = ch.ctx; c.save(); c.strokeStyle = '#0ea5e9'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, ch.chartArea.top); c.lineTo(x, ch.chartArea.bottom); c.stroke(); c.restore(); } } }] });

  // -- une carte colorée par phase
  const navItems = [], allPhases = immoPhases(P); // toutes les phases, même vides : on peut y ajouter une tâche directement
  for (const p of allPhases) {
    if (st.phase && p !== st.phase) continue;
    const list = A.filter(a => a.phase === p && (!st.statut || a.statut === st.statut)).sort((a, b) => a.date.localeCompare(b.date)), seq = depSequence(P, list, st.order ?? 'dep'); if (!list.length && (st.statut || A.some(a => a.phase === p))) continue;
    const all = A.filter(a => a.phase === p), dn = all.filter(a => a.statut === 'fait').length, col = PHASE_PAL[allPhases.indexOf(p) % 7];
    navItems.push([p, col, dn, all.length]);
    phaseBox.append(vcard(col, p, `${dn}/${all.length} faites`, h('div', { class: 'progress', style: { '--c': col, marginBottom: '8px', height: '6px' } }, h('i', { style: { width: (all.length ? dn / all.length * 100 : 0) + '%' } })),
      seq.map(a => { if (a.__hdr) return chainHeader(P, a.__hdr, p); const s = stOf(a);
        return h('div', { class: 'actrow st-' + s, 'data-aid': a.id, style: { '--sc': ACT_ST[s][1] } },
          h('input', { type: 'checkbox', checked: a.statut === 'fait', title: 'Fait', onchange: e => { a.statut = e.target.checked ? 'fait' : 'afaire'; S.immoFocus = a.phase; commit(); } }),
          h('div', { style: { flex: 1, minWidth: 0 } }, h('div', { class: 'actl' }, a.label, a.tache ? h('span', { class: 'badge', style: { marginLeft: '8px', color: 'var(--primary)' } }, 'ma tâche') : null, a.prio === 'haute' ? h('span', { class: 'badge', style: { marginLeft: '6px', color: 'var(--bad)' } }, '❗ prioritaire') : null), a.notes ? h('div', { class: 'sub', style: { maxWidth: 'none', whiteSpace: 'normal' } }, a.notes) : null, fileBadge(a), crossBadges(P, a), condChips(P, sim, a)),
          h('span', { class: 'num muted nw', style: { fontSize: '12.5px' } }, fdate(a.date), +a.duree ? ' · ' + a.duree + ' j' : ''), s === 'fait' ? pill('Fait', IMC.green) : s === 'na' ? pill('Non applicable', IMC.slate) : pill(relDays(a.date, today), urgencyColor(a, today)), h('div', { style: { width: '108px' } }, sel(a, 'statut', ST_ACTION)),
          h('button', { class: 'icon-btn', title: 'Modifier', onclick: () => editAction(P, a) }, '✏️'), h('button', { class: 'icon-btn', title: 'Supprimer', onclick: () => { S.immoFocus = a.phase; removeAction(P, a); commit(); } }, '🗑️')); }), phaseQuickAdd(P, p)));
  }
  // rails de dépendances : tracés après mise en page, retracés si la carte change de taille (ajout, modification, police, fenêtre)
  for (const c of phaseBox.children) { const p = c.querySelector(':scope > h2')?.textContent; const ph = allPhases.find(x => p?.startsWith(x)); if (!ph) continue; const redraw = () => drawRails(c, P, ph); requestAnimationFrame(redraw); setTimeout(redraw, 400); if (window.ResizeObserver) { let w = c.clientWidth; new ResizeObserver(() => { if (Math.abs(c.clientWidth - w) > 1) { w = c.clientWidth; redraw(); } }).observe(c); } }
  const cardOf = p0 => [...phaseBox.children].find(x => x.querySelector(':scope > h2')?.textContent.startsWith(p0));
  navItems.forEach(([p, col, dn, n]) => phaseNav.append(h('button', { class: 'chip toggle', style: { borderColor: col }, title: dn + '/' + n + ' faites', onclick: () => { const c = cardOf(p); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'start' }); flashCard(c); } } }, p.replace(/^\d+\.\s*/, '') + ' · ' + dn + '/' + n)));
  // après un ajout, une modification ou un changement de statut : on reste sur la phase concernée
  if (S.immoFocus) { // la mise en page peut encore bouger (graphiques, polices) : on recale la phase à plusieurs reprises
    const p0 = S.immoFocus; S.immoFocus = null; let k = 0;
    const go = () => { const c = cardOf(p0); if (!c) return; const d = c.getBoundingClientRect().top - 56; if (Math.abs(d) > 6) window.scrollBy(0, d); if (!k++) flashCard(c); if (k < 5) setTimeout(go, [0, 150, 350, 600, 900][k] - [0, 0, 150, 350, 600][k]); };
    setTimeout(go, 60);
  }
}
function flashCard(c) { c.classList.add('flashcard'); setTimeout(() => c.classList.remove('flashcard'), 1800); }
