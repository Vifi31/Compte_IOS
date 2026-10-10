'use strict';
// ============ Biens immobiliers : constantes et moteur de calculs ============
// (aucun accès au DOM : utilisable par les pages et les exports PDF)
const B_TYPES = { appartement: 'Appartement', maison: 'Maison', terrain: 'Terrain', local: 'Local commercial', autre: 'Autre' };
const B_STATUTS = { projet: 'Projet / en cours', detenu: 'Detenu', vendu: 'Vendu' };
const B_USAGES = { residence: 'Résidence principale', investissement: 'Investissement locatif', mixte: 'Mixte' };
const B_ETATS = { neuf: 'Neuf', bon: 'Bon', moyen: 'Moyen', 'a-renover': 'À rénover' };
const B_DPE = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** Mensualité d'un crédit (capital + assurance), arrondie au centime. */
function bienMensualite(c) {
  if (!c?.actif || !(+c.montant > 0)) return 0;
  const cap = +c.montant, m = Math.round(+c.dureeMois || 0), taux = (+c.tauxPct || 0) / 1200;
  const base = m > 0 ? (taux ? cap * taux / (1 - Math.pow(1 + taux, -m)) : cap / m) : 0;
  return r2m(base + cap * (+c.assurancePct || 0) / 1200);
}
/** Dernière valeur estimée connue : estimation enregistrée, sinon saisie manuelle, sinon prix d'achat. */
const bienValeur = b => {
  const e = (b.estimations ?? [])[0];
  if (e?.centre != null) return +e.centre || 0;
  if (b.valeurActuelle != null && b.valeurActuelle !== '') return +b.valeurActuelle || 0;
  return +b.prixAchat || 0;
};
/** Valeur mini / maxi de la dernière estimation (null si aucune). */
const bornesValeur = b => { const e = (b.estimations ?? [])[0]; return e ? { mini: e.mini, centre: e.centre, maxi: e.maxi } : null; };
/** Rendement brut : revenus réellement perçus (catégories de revenus rattachées) sur 12 mois, à défaut le loyer déclaré. */
const bienRendement = b => bienRentabilite(b).brut;
const bienLabel = b => b ? (b.nom || 'Bien sans nom') + (b.ville ? ' · ' + b.ville : '') : 'Bien';
const pc1b = x => (Math.round(x * 10) / 10).toString().replace('.', ',') + ' %';

/**
 * Toutes les opérations rattachées au bien (catégories choisies, identifiants choisis, motifs de libellé), y compris celles exclues du calcul (_excl).
 * La catégorie mémorisée du bien (opCats) remplace la catégorie courante de l'opération : elle reste stable si les règles de catégorie évoluent.
 */
function bienOpsAll(b, all = S.data.operations) {
  const pats = (b.accroche ?? []).map(a => String(a?.pattern ?? '').trim().toUpperCase()).filter(Boolean);
  const ids = new Set(b.opIds ?? []), catIds = new Set(b.catIds ?? []), memo = b.opCats ?? {}, excl = new Set(b.opExcl ?? []);
  return all.filter(o => ids.has(o.id) || catIds.has(memo[o.id] ?? o.categoryId) || (pats.length > 0 && pats.some(p => `${o.title} ${o.label} ${o.details}`.toUpperCase().includes(p))))
    .map(o => { const c = memo[o.id]; const x = c && c !== o.categoryId ? { ...o, categoryId: c, _orig: o.categoryId } : o; return excl.has(o.id) ? { ...x, _excl: true } : x; });
}
/** Opérations comptées dans les dépenses et statistiques : rattachées, hors lignes exclues ou supprimées. */
const bienOps = (b, all = S.data.operations) => bienOpsAll(b, all).filter(o => !o._excl);
const bienOpsTotal = (b, ops) => sum(ops.filter(o => o.amount < 0).map(o => -o.amount));

// ---- périodes : regroupement mensuel / trimestriel / annuel
const B_GRAN = [['m', 'Mois'], ['t', 'Trimestre'], ['a', 'Année']];
const bAddM = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const bPerKey = (d, g) => g === 'a' ? d.slice(0, 4) : g === 't' ? d.slice(0, 4) + '-T' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1) : d.slice(0, 7);
const bPerLabel = (k, g) => g === 'a' ? k : g === 't' ? k.slice(5) + ' ' + k.slice(0, 4) : monthLabel(k);
/** Périodes continues de `from` à `to` (AAAA-MM) : total des dépenses et cumul. `rows` : dépenses { o, b } (o = opération). */
function bienBuckets(rows, from, to, g) {
  const keys = [];
  for (let m = from; m <= to; m = bAddM(m, 1)) { const k = bPerKey(m + '-01', g); if (!keys.includes(k)) keys.push(k); }
  let cum = 0;
  return keys.map(k => {
    const inK = rows.filter(r => bPerKey(r.o.date, g) === k), total = -sum(inK.map(r => r.o.amount));
    cum += total;
    return { key: k, label: bPerLabel(k, g), total, cumul: cum, n: inK.length, rows: inK };
  });
}

// ==================================================== Estimation de valeur (DVF)
/** Percentile interpolé d'une liste déjà triée. */
function estPct(sorted, q) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const estStats = vals => {
  const s = [...vals].sort((a, b) => a - b), n = s.length;
  const avg = n ? sum(s) / n : 0;
  return { n, min: s[0] ?? 0, max: s[n - 1] ?? 0, p10: estPct(s, .1), p25: estPct(s, .25), p50: estPct(s, .5), p75: estPct(s, .75), p90: estPct(s, .9), avg: Math.round(avg * 10) / 10 };
};
/** Étage libre (« 3e », « RDC »…) → valeur numérique (RDC = 0). */
function etageNum(t) {
  const s = String(t || '').toUpperCase();
  if (/RDC|RE-DE-CH|PLAIN.?PIED/.test(s)) return 0;
  const m = s.match(/\d+/); return m ? +m[0] : null;
}
/** Ajustements de caractéristiques appliqués au €/m² médian, en % (éditables). */
function estAdjustments(b) {
  const out = [], isA = b.type !== 'maison';
  if (b.etat && B_ETATS[b.etat]) out.push({ key: 'etat', label: 'État général', pct: { neuf: 12, bon: 0, moyen: -8, 'a-renover': -18 }[b.etat], detail: B_ETATS[b.etat] });
  if (b.dpe) out.push({ key: 'dpe', label: 'Performance énergétique', pct: { A: 8, B: 6, C: 3, D: 0, E: -5, F: -12, G: -20 }[b.dpe] ?? 0, detail: 'DPE ' + b.dpe });
  if (b.exterieur) out.push({ key: 'exterieur', label: 'Extérieur (balcon, terrasse, jardin)', pct: 5, detail: 'oui' });
  if (b.garage) out.push({ key: 'garage', label: 'Garage ou place de parking', pct: 4, detail: 'oui' });
  if (isA && b.ascenseur) out.push({ key: 'ascenseur', label: 'Ascenseur', pct: 3, detail: 'oui' });
  const en = etageNum(b.etage);
  if (isA && en != null) {
    const base = en === 0 ? -3 : en === 1 ? 2 : en <= 4 ? 4 : 0;
    const noLift = !b.ascenseur && en >= 3 ? -5 : 0;
    out.push({ key: 'etage', label: 'Étage', pct: base + noLift, detail: b.etage + (noLift ? ', sans ascenseur' : '') });
  }
  if (b.type === 'maison' && +b.terrain > 200) out.push({ key: 'terrain', label: 'Terrain', pct: Math.min(10, Math.round((+b.terrain - 200) / 100)), detail: Math.round(+b.terrain) + ' m²' });
  return out.map(a => ({ ...a, on: true }));
}
/** Facteur cumulé des ajustements activés. */
const estFactor = adj => adj.filter(a => a.on).reduce((f, a) => f * (1 + (+a.pct || 0) / 100), 1);

/**
 * Estimation à partir de ventes réelles (DVF) : comparables par commune / type / surface,
 * valeurs aberrantes exclues, €/m² médian ajusté des caractéristiques du bien.
 */
function estCompute(b, muts, opts = {}) {
  const surf = +b.surface || 0;
  if (!(surf > 0)) return { error: 'Renseignez la surface du bien pour estimer sa valeur.' };
  const type = b.type === 'maison' ? 'maison' : 'appartement';
  const rayon = opts.rayon != null ? +opts.rayon : .4, depuis = opts.depuis || '', pieces = +b.pieces || 0;
  let comps = muts.filter(m => m.type === type && (rayon > 0 ? m.surface >= surf * (1 - rayon) && m.surface <= surf * (1 + rayon) : Math.abs(m.surface - surf) <= 1)); // 0 % : surface identique (à 1 m² près)
  if (opts.pieces && pieces) comps = comps.filter(m => !m.pieces || Math.abs(m.pieces - pieces) <= 1);
  if (depuis) comps = comps.filter(m => m.date >= depuis);
  comps.sort((x, y) => Math.abs(x.surface - surf) - Math.abs(y.surface - surf) || y.date.localeCompare(x.date));
  if (!comps.length) return { error: 'Aucune vente comparable trouvée dans cette commune : élargissez la période ou le rayon de surface.' };
  const all = comps.map(m => m.ppsm).sort((x, y) => x - y);
  let vals = all;
  if (opts.trim !== false && all.length >= 8) vals = all.slice(Math.floor(all.length * .1), Math.ceil(all.length * .9));
  const S = estStats(vals), adj = estAdjustments(b), factor = estFactor(adj);
  const val = p => Math.round(p * surf * factor);
  return {
    type, n: all.length, surface: surf, ppsm: S, factor: Math.round(factor * 1000) / 1000,
    mini: val(S.p25), centre: val(S.p50), maxi: val(S.p75), ppsmMini: Math.round(S.p25 * factor * 10) / 10, ppsmCentre: Math.round(S.p50 * factor * 10) / 10, ppsmMaxi: Math.round(S.p75 * factor * 10) / 10,
    adj, comps: comps.slice(0, 60), faible: all.length < 6,
  };
}
/** Même calcul à partir d'un seul €/m² de référence saisi à la main (repli hors ligne). */
function estFromPpsm(b, ppsm) {
  const surf = +b.surface || 0;
  if (!(surf > 0) || !(ppsm > 0)) return { error: 'Surface et prix au m² sont nécessaires.' };
  const adj = estAdjustments(b), factor = estFactor(adj), val = p => Math.round(p * surf * factor);
  return { n: 0, surface: surf, factor: Math.round(factor * 1000) / 1000, mini: val(ppsm * .9), centre: val(ppsm), maxi: val(ppsm * 1.1), ppsmCentre: Math.round(ppsm * factor * 10) / 10, adj, comps: [], manuel: true };
}

// ---- natures de documents (liste modifiable, enregistrée côté serveur)
const B_KINDS_DEFAULT = [{ id: 'acte', label: 'Acte & notaire', icon: '📜' }, { id: 'diagnostic', label: 'Diagnostics', icon: '🔬' }, { id: 'quittance', label: 'Quittances', icon: '🧾' }, { id: 'facture', label: 'Factures', icon: '🧾' }, { id: 'taxe', label: 'Avis d’imposition', icon: '🏛️' }, { id: 'assurance', label: 'Contrats d’assurance', icon: '🛡️' }, { id: 'autre', label: 'Autre', icon: '📎' }];
const docKinds = () => (typeof BS !== 'undefined' && BS?.kinds?.length ? BS.kinds : B_KINDS_DEFAULT);
const docKindLabel = id => docKinds().find(k => k.id === id)?.label ?? 'Autre';
const docKindIcon = id => docKinds().find(k => k.id === id)?.icon ?? '📎';

// ---- estimation selon l'éloignement du bien (ventes DVF géolocalisées)
const EST_RADII = [300, 500, 1000, 2000, 5000]; // mètres
function distM(la1, lo1, la2, lo2) {
  const R = 6371000, rad = x => x * Math.PI / 180, dLa = rad(la2 - la1), dLo = rad(lo2 - lo1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
/**
 * Une estimation par rayon autour du bien (300 m … 5 km) puis la commune entière.
 * Le rayon « quartier » retenu est le plus petit rayon qui réunit au moins 8 ventes comparables (à défaut 3).
 */
function estByRadius(b, muts, opts = {}, radii = EST_RADII) {
  const lat = +b.lat, lon = +b.lon; if (!(lat && lon)) return null;
  const withD = muts.filter(m => +m.lat && +m.lon).map(m => ({ ...m, dist: Math.round(distM(lat, lon, +m.lat, +m.lon)) }));
  const rows = radii.map(r => { const sub = withD.filter(m => m.dist <= r); return { r, label: r < 1000 ? r + ' m' : (r / 1000) + ' km', nSales: sub.length, res: sub.length ? estCompute(b, sub, opts) : { error: 'Aucune vente dans ce rayon' } }; });
  rows.push({ r: Infinity, label: 'Commune entière', nSales: muts.length, res: estCompute(b, muts, opts) });
  const good = n => rows.find(x => !x.res.error && x.res.n >= n);
  return { rows, retained: good(8) ?? good(3) ?? null, located: withD.length };
}

// ---- revenus locatifs : opérations créditées des catégories de revenus rattachées au bien (investissement locatif ou mixte)
/** Opérations de revenu du bien, y compris celles exclues du calcul (_excl). */
function bienRevAll(b, all = S.data.operations) {
  const cs = new Set(b.revCatIds ?? []); if (!cs.size) return [];
  const excl = new Set(b.opExcl ?? []);
  return all.filter(o => o.amount > 0 && cs.has(o.categoryId)).map(o => (excl.has(o.id) ? { ...o, _excl: true } : o));
}
const bienRev = (b, all = S.data.operations) => bienRevAll(b, all).filter(o => !o._excl);
const bienRevTotal = ops => sum(ops.map(o => o.amount));
/** Rendement brut réel : revenus perçus des 12 derniers mois civils connus ÷ valeur du bien. */
function bienRendementReel(b) {
  const ops = bienRev(b); if (!ops.length) return null;
  const last = ops.map(o => o.date).sort().at(-1), from = addM(last, -12);
  const tot = sum(ops.filter(o => o.date > from).map(o => o.amount)), v = bienValeur(b);
  return v > 0 ? { annuel: tot, pct: tot / v * 100 } : { annuel: tot, pct: 0 };
}

/**
 * Rentabilité sur les 12 derniers mois d'activité du bien : revenus (catégories rattachées, à défaut loyer déclaré) et dépenses des opérations rattachées.
 * brut = revenus / valeur ; net = (revenus − dépenses) / valeur ; cout = dépenses − revenus (coût net de détention).
 */
function bienRentabilite(b) {
  const val = bienValeur(b), revOps = bienRev(b), depOps = bienOps(b).filter(o => o.amount < 0), real = (b.revCatIds ?? []).length > 0;
  const dates = [...revOps, ...depOps].map(o => o.date).sort(), end = dates.at(-1) ?? todayIso(), from = addM(end, -12);
  const rev = real ? sum(revOps.filter(o => o.date > from).map(o => o.amount)) : (+b.loyerMensuel || 0) * 12;
  const dep = -sum(depOps.filter(o => o.date > from).map(o => o.amount));
  const pc = x => (val > 0 ? x / val * 100 : 0);
  return { source: real ? 'reel' : (rev > 0 ? 'declare' : 'aucun'), rev, dep, net: rev - dep, cout: dep - rev, brut: pc(rev), netPct: pc(rev - dep), cash: (rev - dep) / 12, couverture: dep > 0 ? rev / dep * 100 : null, from, end };
}
