'use strict';
// ============ Immobilier : composants visuels partagés (anneaux, jauge, tuiles, score de santé) ============
const IMC = { indigo: '#6366f1', green: '#10b981', amber: '#f59e0b', orange: '#f97316', red: '#ef4444', blue: '#0ea5e9', violet: '#8b5cf6', pink: '#ec4899', slate: '#94a3b8', teal: '#14b8a6' };

/** « dans 12 j », « retard de 5 j »… */
const relDays = (d, today = todayIso()) => {
  const n = Math.round((pdate(d) - pdate(today)) / 864e5);
  return n === 0 ? 'aujourd’hui' : n > 0 ? (n < 62 ? `dans ${n} j` : `dans ${Math.round(n / 30.4)} mois`) : (n > -62 ? `retard de ${-n} j` : `retard de ${Math.round(-n / 30.4)} mois`);
};

/** Carte colorée avec titre (et sous-titre discret). */
const vcard = (color, title, sub, ...kids) => h('div', { class: 'card ccard', style: { '--ac': color } }, h('h2', {}, title, sub ? h('small', {}, sub) : null), ...kids);

/** Tuile d'indicateur claire (icône, libellé, valeur, détail). */
const tile = (ico, label, value, sub, color) => h('div', { class: 'tile', style: { '--tc': color } }, h('div', { class: 'ti' }, ico), h('div', { style: { minWidth: 0 } }, h('div', { class: 'tl' }, label), h('div', { class: 'tv' }, value), sub ? h('div', { class: 'ts' }, sub) : null));

/** Pastille colorée. */
const pill = (text, color) => h('span', { class: 'pill', style: { '--pc': color } }, text);

/** Anneau avec texte central [ligne 1, ligne 2]. */
function vDonut(canvas, labels, data, colors, center, o = {}) {
  return chart(canvas, {
    type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 3, borderColor: css('--card'), hoverOffset: 6 }] },
    options: { cutout: o.cutout ?? '68%', plugins: { legend: { position: o.legend ?? 'bottom', labels: { boxWidth: 10, usePointStyle: true, padding: 12 } }, tooltip: o.tooltip ?? { callbacks: { label: c => ` ${c.label} : ${o.fmt ? o.fmt(c.parsed) : c.parsed}` } } } },
    plugins: [{ id: 'center', afterDraw(ch) {
      if (!center) return; const a = ch.chartArea, cx = (a.left + a.right) / 2, cy = (a.top + a.bottom) / 2, c = ch.ctx;
      c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = css('--text'); c.font = '800 24px "Segoe UI", sans-serif'; c.fillText(center[0], cx, cy - (center[1] ? 8 : 0));
      if (center[1]) { c.fillStyle = css('--muted'); c.font = '12px "Segoe UI", sans-serif'; c.fillText(center[1], cx, cy + 14); } c.restore(); } }],
  });
}

/** Demi-jauge 0-100. */
function vGauge(canvas, value, color, caption) {
  return chart(canvas, {
    type: 'doughnut', data: { datasets: [{ data: [value, 100 - value], backgroundColor: [color, css('--line')], borderWidth: 0, borderRadius: 8 }] },
    options: { rotation: -90, circumference: 180, cutout: '76%', layout: { padding: { bottom: 4 } }, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    plugins: [{ id: 'gauge', afterDraw(ch) {
      const arc = ch.getDatasetMeta(0).data[0], c = ch.ctx; if (!arc) return;
      c.save(); c.textAlign = 'center'; c.fillStyle = color; c.font = '800 34px "Segoe UI", sans-serif'; c.fillText(String(value), arc.x, arc.y - 24);
      c.fillStyle = css('--muted'); c.font = '12px "Segoe UI", sans-serif'; c.fillText(caption, arc.x, arc.y - 4); c.restore(); } }],
  });
}

/** Score de santé du financement (0-100) à partir de la simulation. */
function immoHealth(sim, P) {
  const s = sim.summary, tot = Math.max(1, s.totalProjet), f = []; let score = 100;
  if (s.manque > 0.5) { score -= Math.min(50, 20 + s.manque / tot * 400); f.push({ k: 'bad', t: `Manque de fonds : ${eur0(s.manque)}` }); } else f.push({ k: 'ok', t: 'Toutes les échéances sont couvertes' });
  if (s.relaisUtilise) { score -= 8; f.push({ k: 'warn', t: `Prêt relais nécessaire (max ${eur0(s.relaisMax)})` }); } else f.push({ k: 'ok', t: 'Prêt relais non nécessaire' });
  if (s.reserveEntamee > 0.5) { score -= Math.min(15, 5 + s.reserveEntamee / Math.max(1, +P.epargne.reserve || 1) * 10); f.push({ k: 'warn', t: `Réserve entamée de ${eur0(s.reserveEntamee)}` }); } else f.push({ k: 'ok', t: 'Réserve de sécurité préservée' });
  if (sim.alerts.some(a => /non soldé|restent .* à rembourser/i.test(a.text))) { score -= 15; f.push({ k: 'bad', t: 'Prêt relais non soldé à son échéance' }); }
  score -= Math.min(8, sim.alerts.filter(a => a.level === 'warn').length * 2);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const [label, color] = score >= 80 ? ['Solide', IMC.green] : score >= 60 ? ['À surveiller', IMC.amber] : score >= 35 ? ['Fragile', IMC.orange] : ['Critique', IMC.red];
  return { score, label, color, factors: f };
}
