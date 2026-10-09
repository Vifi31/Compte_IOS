'use strict';
// ============ Immobilier (VEFA) : moteur de simulation ============
// Dates au format AAAA-MM-JJ. Montants en euros.
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pdate = s => new Date(s + 'T00:00:00');
const todayIso = () => iso(new Date());
const addM = (s, n) => { const d = pdate(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return iso(d); };
const addDays = (s, n) => { const d = pdate(s); d.setDate(d.getDate() + n); return iso(d); };
const monthsDiff = (a, b) => (pdate(b).getFullYear() - pdate(a).getFullYear()) * 12 + pdate(b).getMonth() - pdate(a).getMonth();
const r2m = x => Math.round(x * 100) / 100;
const pmt = (cap, tauxPct, n) => { const r = tauxPct / 1200; return n > 0 ? (r ? cap * r / (1 - Math.pow(1 + r, -n)) : cap / n) : 0; };
const uid = () => Math.random().toString(36).slice(2, 9);

/** Calendrier légal usuel d'appels de fonds VEFA : 5 % / 35 % / 70 % / 95 % / 100 % cumulés. */
function immoStandardCalls(P) {
  const doc = P.dateDebutChantier, liv = P.dateLivraison, dur = Math.max(1, monthsDiff(doc, liv)), at = f => addM(doc, Math.round(dur * f));
  return [
    { label: 'Signature de l’acte (dépôt de garantie)', pct: 5, date: P.dateSignature },
    { label: 'Achèvement des fondations', pct: 30, date: at(.12) },
    { label: 'Mise hors d’eau', pct: 35, date: at(.5) },
    { label: 'Achèvement des travaux', pct: 25, date: at(.88) },
    { label: 'Remise des clés (solde)', pct: 5, date: liv },
  ].map(a => ({ id: uid(), statut: 'prevu', montantReel: null, dateReelle: null, ...a }));
}

/** Projet d'exemple (valeurs à adapter). */
function immoDefault() {
  const t = todayIso(), sign = addM(t, 2), doc = addM(sign, 3), liv = addM(doc, 18), vente = addM(liv, -3);
  const P = {
    nom: 'Mon acquisition en VEFA', adresse: '', exemple: true, prix: 300000, dateReference: t, dateSignature: sign, dateDebutChantier: doc, dateLivraison: liv,
    frais: [{ id: uid(), label: 'Frais de notaire (≈ 2,5 %)', montant: 7500, date: sign }, { id: uid(), label: 'Frais de dossier bancaire', montant: 1000, date: sign }, { id: uid(), label: 'Garantie du prêt (caution)', montant: 3000, date: sign }],
    appels: [],
    epargne: { sources: [{ id: uid(), label: 'Livret A', montant: 45000, rendementPct: 1.5, compte: '' }], contributionMensuelle: 700, dateDebutContribution: t, reserve: 5000 },
    financements: [{ id: uid(), type: 'principal', label: 'Prêt principal', montant: 150000, tauxPct: 3.6, dureeMois: 240, assurancePct: 0.3, dateDispo: sign, priorite: 1 }],
    ordre: 'apport', intercalaires: true,
    relais: { actif: true, montant: 100000, tauxPct: 4.2, dureeMois: 24, dateDebut: addM(doc, 6), deblocage: 'besoin', interets: 'mensuels', fraisDossier: 1200 },
    bienActuel: { valeur: 250000, capitalRestantDu: 90000, fraisVentePct: 5 },
    fondsSupp: [{ id: uid(), label: 'Vente du bien actuel (net des frais et du capital restant dû)', type: 'vente', montant: 147500, date: vente, rembourseRelais: true, statut: 'prevu' }],
    actions: [],
  };
  P.appels = immoStandardCalls(P);
  return P;
}

/** Simulation chronologique : fonds disponibles à chaque date, utilisation de l'épargne, des prêts et du prêt relais. */
function immoSimulate(P0, what = {}) {
  const P = JSON.parse(JSON.stringify(P0));
  // scénarios « et si » (non enregistrés)
  if (what.venteDecalageMois) P.fondsSupp.filter(x => x.rembourseRelais).forEach(x => { x.date = addM(x.date, what.venteDecalageMois); });
  if (what.epargneDelta) P.epargne.contributionMensuelle = Math.max(0, (+P.epargne.contributionMensuelle || 0) + what.epargneDelta);
  if (what.relaisMontant != null && P.relais) P.relais.montant = what.relaisMontant;
  const ref = P.dateReference || todayIso(), reserve = +P.epargne.reserve || 0;
  const loans = P.financements.map(l => ({ ...l, montant: +l.montant || 0, drawn: 0, interets: 0 })).sort((a, b) => (a.priorite || 9) - (b.priorite || 9));
  const R = P.relais?.actif ? { ...P.relais, modeInterets: P.relais.interets, montant: +P.relais.montant || 0, out: 0, drawnTotal: 0, interets: 0, maxOut: 0, firstDraw: null, repaidDate: null } : null;
  if (R) R.fin = addM(R.dateDebut, +R.dureeMois || 24);
  const srcTotal = sum(P.epargne.sources.map(s => +s.montant || 0));
  const rend = srcTotal ? sum(P.epargne.sources.map(s => (+s.montant || 0) * (+s.rendementPct || 0))) / srcTotal : 0;
  const callAmount = a => a.montantReel != null && a.montantReel !== '' ? +a.montantReel : r2m(P.prix * (+a.pct || 0) / 100);
  const callsPaid = sum(P.appels.filter(a => a.statut === 'paye').map(callAmount));

  const ev = []; let seq = 0;
  const push = (date, order, type, label, amount, extra = {}) => ev.push({ date, order, type, label, amount, seq: seq++, ...extra });
  const late = d => d < ref;
  for (const a of P.appels) if (a.statut !== 'paye') push(late(a.date) ? ref : a.date, 4, 'appel', a.label, callAmount(a), { id: a.id, pct: +a.pct, late: late(a.date), financeable: true, planned: a.date });
  for (const f of P.frais) if (!f.paye) push(late(f.date) ? ref : f.date, 3, 'frais', f.label, +f.montant || 0, { id: f.id, financeable: false, late: late(f.date), planned: f.date });
  for (const x of P.fondsSupp) { if (x.statut === 'recu' && late(x.date)) continue; push(late(x.date) ? ref : x.date, 1, 'fonds', x.label, +x.montant || 0, { id: x.id, rembourse: !!x.rembourseRelais, planned: x.date }); }
  const endDate = [P.dateLivraison, P.epargne.dateFinContribution, R?.fin, ...ev.map(e => e.date)].filter(Boolean).sort().pop();
  // épargne mensuelle
  const c0 = P.epargne.dateDebutContribution && P.epargne.dateDebutContribution > ref ? P.epargne.dateDebutContribution : ref, cm = +P.epargne.contributionMensuelle || 0;
  if (cm > 0) for (let k = 0, d = c0; d <= (P.epargne.dateFinContribution || P.dateLivraison) && k < 600; k++, d = addM(c0, k)) push(d, 0, 'contrib', 'Épargne mensuelle', cm);
  if (R && R.deblocage === 'unique') push(R.dateDebut < ref ? ref : R.dateDebut, 1, 'relais-debloc', 'Déblocage du prêt relais (en une fois)', R.montant);
  if (R && +R.fraisDossier) push(R.dateDebut < ref ? ref : R.dateDebut, 3, 'frais', 'Frais de dossier du prêt relais', +R.fraisDossier, { financeable: false, planned: R.dateDebut });
  if (R) push(R.fin, 7, 'relais-fin', 'Échéance du prêt relais', 0);
  // échéances mensuelles : intérêts des prêts tirés (intercalaires) et du relais, intérêt de l'épargne
  for (let d = addM(ref.slice(0, 7) + '-01', 1); d <= addM(endDate, 1); d = addM(d, 1)) push(d, 2, 'tick', 'Échéance mensuelle', 0);
  // intérêts de l'épargne : calculés par quinzaine échue (base = solde le plus bas de la quinzaine, comme un livret réglementé), crédités une fois par an, le 31 décembre
  { const y0 = +ref.slice(0, 4), y1 = +endDate.slice(0, 4);
    for (let y = y0; y <= y1; y++) {
      for (let m = 1; m <= 12; m++) for (const dd of ['01', '16']) { const d = `${y}-${String(m).padStart(2, '0')}-${dd}`; if (d > ref) push(d, -1, 'qz', '', 0); }
      if (`${y}-12-31` >= ref) push(`${y}-12-31`, 9, 'yearint', 'Intérêts de l’épargne', 0);
    } }
  ev.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.seq - b.seq);

  let cash = srcTotal, cumCalls = callsPaid, cumFunds = callsPaid, costInterc = 0, costRelais = 0, costFrais = 0, shortTotal = 0;
  let accr = 0, interetsEpargne = 0, qMin = cash, qStart = ref.slice(0, 8) + (+ref.slice(8, 10) >= 16 ? '16' : '01');
  let reserveDip = 0, dipAlert = null; const intShort = { interc: { n: 0, total: 0, first: null }, relais: { n: 0, total: 0, first: null } };
  const rows = [], snaps = [{ date: ref, cash, relais: 0, loans: 0, calls: cumCalls }], alerts = [];
  const fund = (need, date, financeable) => {
    let rem = need, usedCash = 0, usedRelais = 0; const usedLoans = [];
    const useCash = () => { const u = Math.min(rem, Math.max(0, cash - reserve)); cash -= u; rem -= u; usedCash += u; };
    const useLoans = () => { if (!financeable) return; for (const l of loans) { if (rem <= 0.005) break; if (l.dateDispo && l.dateDispo > date) continue; const u = Math.min(rem, l.montant - l.drawn); if (u > 0.005) { l.drawn += u; rem -= u; usedLoans.push({ id: l.id, label: l.label, amount: u }); } } };
    if (P.ordre === 'pret') { useLoans(); useCash(); } else { useCash(); useLoans(); }
    if (rem > 0.005 && R && R.deblocage !== 'unique' && date >= R.dateDebut && date <= R.fin) {
      const u = Math.min(rem, Math.max(0, R.montant - R.drawnTotal));
      if (u > 0.005) { R.out += u; R.drawnTotal += u; rem -= u; usedRelais = u; if (!R.firstDraw) R.firstDraw = date; R.maxOut = Math.max(R.maxOut, R.out); }
    }
    if (rem > 0.005 && cash > 0.005) { const u = Math.min(rem, cash); cash -= u; rem -= u; usedCash += u; reserveDip += u; if (!dipAlert) dipAlert = { date }; }
    return { usedCash, usedLoans, usedRelais, short: rem > 0.005 ? rem : 0 };
  };
  const loansDrawn = () => sum(loans.map(l => l.drawn));
  const snap = date => snaps.push({ date, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) });
  const closeQ = next => { qMin = Math.min(qMin, cash); if (rend) accr += Math.max(0, qMin) * rend / 2400; qMin = cash; qStart = next; };
  for (const e of ev) {
    qMin = Math.min(qMin, cash);
    if (e.type === 'qz') { if (e.date > qStart) closeQ(e.date); continue; }
    const before = { cash, relais: R?.out ?? 0 };
    if (e.type === 'yearint') {
      if (e.date >= qStart) closeQ((+e.date.slice(0, 4) + 1) + '-01-01');
      if (accr > 0.005) {
        const g = accr; accr = 0; cash += g; interetsEpargne += g; qMin = cash;
        rows.push({ ...e, type: 'interets', label: 'Intérêts de l’épargne crédités (quinzaines échues au 31/12)', amount: r2m(g), before, usedCash: 0, usedLoans: [], usedRelais: 0, short: 0, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) }); snap(e.date);
      }
      continue;
    }
    if (e.type === 'contrib') { cash += e.amount; rows.push({ ...e, tech: true, before, usedCash: 0, usedLoans: [], usedRelais: 0, short: 0, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) }); snap(e.date); continue; }
    if (e.type === 'tick') {
      if (P.intercalaires) for (const l of loans) { const i = l.drawn * (+l.tauxPct || 0) / 1200; if (i > 0.005) { const f = fund(i, e.date, false); l.interets += i; costInterc += i; if (f.short) { shortTotal += f.short; const q = intShort.interc; q.n++; q.total += f.short; q.first ??= e.date; } } }
      if (R && R.out > 0) { const i = R.out * (+R.tauxPct || 0) / 1200; R.interets += i; costRelais += i; if (R.modeInterets === 'capitalises') { R.out += i; R.maxOut = Math.max(R.maxOut, R.out); } else { const f = fund(i, e.date, false); if (f.short) { shortTotal += f.short; const q = intShort.relais; q.n++; q.total += f.short; q.first ??= e.date; } } }
      rows.push({ ...e, label: 'Échéance mensuelle (intérêts)', tech: true, before, usedCash: 0, usedLoans: [], usedRelais: 0, short: 0, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) });
      snap(e.date); continue;
    }
    if (e.type === 'fonds' || e.type === 'relais-debloc') {
      cash += e.amount; if (e.type === 'relais-debloc' && R) { R.out += e.amount; R.drawnTotal += e.amount; R.firstDraw = R.firstDraw || e.date; R.maxOut = Math.max(R.maxOut, R.out); }
      let repaid = 0;
      if (e.type === 'fonds' && e.rembourse && R && R.out > 0.005) { repaid = Math.min(R.out, Math.max(0, cash - reserve)); R.out -= repaid; cash -= repaid; if (R.out <= 0.005) { R.out = 0; R.repaidDate = e.date; } else alerts.push({ level: 'warn', date: e.date, text: `Après « ${e.label} », il reste ${eur0(R.out)} de prêt relais à rembourser.` }); }
      rows.push({ ...e, before, usedCash: 0, usedLoans: [], usedRelais: 0, short: 0, repaid, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) }); snap(e.date); continue;
    }
    if (e.type === 'relais-fin') {
      let repaid = 0;
      if (R && R.out > 0.005) { repaid = Math.min(R.out, Math.max(0, cash - reserve)); R.out -= repaid; cash -= repaid; if (R.out > 0.005) { shortTotal += R.out; alerts.push({ level: 'bad', date: e.date, text: `À l’échéance du prêt relais (${fdate(e.date)}), ${eur0(R.out)} restent à rembourser : vente à avancer, prorogation ou apport supplémentaire nécessaires.` }); } else { R.out = 0; R.repaidDate = R.repaidDate || e.date; } }
      rows.push({ ...e, before, usedCash: 0, usedLoans: [], usedRelais: 0, short: 0, repaid, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) }); snap(e.date); continue;
    }
    // appel de fonds ou frais
    const f = fund(e.amount, e.date, e.financeable);
    if (e.type === 'appel') cumCalls += e.amount; else costFrais += e.amount;
    cumFunds += e.amount - f.short; shortTotal += f.short;
    if (f.short) alerts.push({ level: 'bad', date: e.date, text: `« ${e.label} » (${eur0(e.amount)}, ${fdate(e.date)}) : il manque ${eur0(f.short)} de fonds.` });
    if (e.late) alerts.push({ level: 'warn', date: e.date, text: `« ${e.label} » était prévu le ${fdate(e.planned)} : traité à la date de référence.` });
    rows.push({ ...e, before, ...f, cash: r2m(cash), relais: r2m(R?.out ?? 0), loans: r2m(loansDrawn()), calls: r2m(cumCalls) }); snap(e.date);
  }
  // contrôles généraux
  if (intShort.interc.n) alerts.push({ level: 'bad', date: intShort.interc.first, text: `Intérêts intercalaires non couverts sur ${intShort.interc.n} échéance(s) (${eur0(intShort.interc.total)}), dès le ${fdate(intShort.interc.first)}.` });
  if (intShort.relais.n) alerts.push({ level: 'bad', date: intShort.relais.first, text: `Intérêts du prêt relais non couverts sur ${intShort.relais.n} échéance(s) (${eur0(intShort.relais.total)}), dès le ${fdate(intShort.relais.first)}.` });
  if (reserveDip > 0.005) alerts.push({ level: 'warn', date: dipAlert?.date ?? null, text: `La réserve de sécurité est entamée (${eur0(reserveDip)} au total, dès le ${fdate(dipAlert.date)}) pour boucler le financement.` });
  const pctTot = sum(P.appels.map(a => +a.pct || 0));
  if (Math.abs(pctTot - 100) > 0.01) alerts.push({ level: 'warn', date: null, text: `Les appels de fonds totalisent ${pctTot.toFixed(1).replace('.', ',')} % du prix (attendu : 100 %).` });
  if (R && R.out > 0.005 && !alerts.some(a => /relais/i.test(a.text))) alerts.push({ level: 'warn', date: null, text: `Prêt relais non soldé en fin de simulation : ${eur0(R.out)}.` });
  const cumu = []; let cs = 0; for (const a of [...P.appels].sort((x, y) => x.date.localeCompare(y.date))) { cs += +a.pct || 0; cumu.push({ id: a.id, cumulPct: cs }); }
  const totalProjet = (+P.prix || 0) + sum(P.frais.map(f => +f.montant || 0));
  const pays = loans.map(l => ({ id: l.id, label: l.label, drawn: r2m(l.drawn), mensualite: r2m(pmt(l.drawn, l.tauxPct, l.dureeMois) + l.drawn * (+l.assurancePct || 0) / 1200), interetsInterc: r2m(l.interets) }));
  // série mensuelle pour les graphiques
  const series = []; let k = 0;
  for (let d = ref.slice(0, 7) + '-01'; d <= addM(endDate, 1); d = addM(d, 1)) { while (k + 1 < snaps.length && snaps[k + 1].date <= d) k++; series.push({ date: d, ...snaps[k] }); }
  return {
    ref, rows, snaps, series, alerts: alerts.sort((a, b) => (a.date || '9').localeCompare(b.date || '9')), cumu,
    summary: { totalProjet, prix: +P.prix || 0, fraisTotal: sum(P.frais.map(f => +f.montant || 0)), epargneInitiale: srcTotal, epargneContrib: sum(ev.filter(e => e.type === 'contrib').map(e => e.amount)), fondsSupp: sum(ev.filter(e => e.type === 'fonds').map(e => e.amount)),
      pretsTires: r2m(loansDrawn()), relaisUtilise: !!(R && R.drawnTotal > 0.005), relaisMax: r2m(R?.maxOut ?? 0), relaisTotalTire: r2m(R?.drawnTotal ?? 0), relaisPremierDeblocage: R?.firstDraw ?? null, relaisRembourse: R?.repaidDate ?? null, relaisFin: R?.fin ?? null,
      coutInterc: r2m(costInterc), coutRelais: r2m(costRelais), fraisRelais: R ? +R.fraisDossier || 0 : 0, manque: r2m(shortTotal), reserveEntamee: r2m(reserveDip), cashFin: r2m(cash), interetsEpargne: r2m(interetsEpargne), interetsAcquis: r2m(accr), pays, appelsDejaPayes: r2m(callsPaid), endDate },
  };
}

// ---- plan d'actions : suggestions générées à partir du projet et de la simulation
function immoGenActions(P, sim) {
  const A = []; const add = (key, phase, label, date, notes = '') => A.push({ key, phase, label, date, notes });
  const sign = P.dateSignature, doc = P.dateDebutChantier, liv = P.dateLivraison, R = P.relais?.actif ? { ...P.relais, fin: addM(P.relais.dateDebut, +P.relais.dureeMois || 24) } : null;
  add('dossier', '1. Avant la signature', 'Constituer le dossier de financement (justificatifs de revenus, épargne, projet)', addM(sign, -3), 'Simuler l’endettement, comparer plusieurs banques et courtiers.');
  add('accord-pret', '1. Avant la signature', 'Obtenir l’accord de principe du prêt principal', addM(sign, -2), `${eur0(sum(P.financements.map(l => +l.montant || 0)))} demandés.`);
  if (R) { add('accord-relais', '1. Avant la signature', 'Obtenir l’accord de principe du prêt relais (durée ' + (R.dureeMois || 24) + ' mois)', addM(R.dateDebut, -3), `${eur0(R.montant)} · à demander au plus tard 3 mois avant le début.`); add('estimation', '1. Avant la signature', 'Faire estimer le bien actuel (2 à 3 agences) et préparer les diagnostics', addM(sign, -2), 'La valeur estimée conditionne le montant du relais accordé.'); }
  add('reservation', '1. Avant la signature', 'Signer le contrat de réservation et verser le dépôt de garantie', addM(sign, -1), 'Vérifier la garantie financière d’achèvement (GFA) et le délai de rétractation de 10 jours.');
  add('acte', '2. Signature de l’acte', 'Signature de l’acte authentique chez le notaire', sign, `Frais à prévoir : ${eur0(sum(P.frais.map(f => +f.montant || 0)))}.`);
  add('assurance-emprunteur', '2. Signature de l’acte', 'Souscrire l’assurance emprunteur et la garantie du prêt', addDays(sign, -7));
  add('virement', '2. Signature de l’acte', `Programmer le virement mensuel vers l’épargne dédiée (${eur0(P.epargne.contributionMensuelle || 0)} / mois)`, P.epargne.dateDebutContribution || sign, `Réserve de sécurité à ne pas entamer : ${eur0(P.epargne.reserve || 0)}.`);
  if (R) add('mise-en-vente', '3. Chantier et appels de fonds', 'Mettre le bien actuel en vente (mandat, annonces, visites)', addM(R.dateDebut, -2), 'Objectif : compromis avant le premier déblocage du relais.');
  add('doc', '3. Chantier et appels de fonds', 'Déclaration d’ouverture de chantier (DOC) : suivre le démarrage des travaux', doc);
  for (const a of P.appels) {
    const row = sim.rows.find(r => r.id === a.id);
    add('appel-' + a.id, '3. Chantier et appels de fonds', `Appel de fonds « ${a.label} » : vérifier l’attestation d’avancement et payer`, addDays(a.date, -10),
      `${a.pct} % — ${eur0(r2m(P.prix * a.pct / 100))} au ${fdate(a.date)}.` + (row ? ` Financement : épargne ${eur0(row.usedCash)}, prêts ${eur0(sum(row.usedLoans.map(l => l.amount)))}${row.usedRelais ? `, prêt relais à débloquer ${eur0(row.usedRelais)}` : ''}${row.short ? `, ⚠️ manque ${eur0(row.short)}` : ''}.` : ''));
  }
  if (R) {
    add('relais-debut', '3. Chantier et appels de fonds', 'Signer l’offre de prêt relais et planifier le déblocage', addM(R.dateDebut, -1), sim.summary.relaisPremierDeblocage ? `Premier déblocage prévu le ${fdate(sim.summary.relaisPremierDeblocage)} (max ${eur0(sim.summary.relaisMax)}).` : 'Selon la simulation, le relais n’est pas nécessaire : à confirmer à chaque appel.');
    const vente = P.fondsSupp.find(x => x.rembourseRelais);
    if (vente) { add('compromis-vente', '4. Vente et remboursement du relais', 'Signer le compromis de vente du bien actuel', addM(vente.date, -3), 'Un compromis signé rassure la banque et sécurise le remboursement du relais.'); add('acte-vente', '4. Vente et remboursement du relais', 'Acte de vente du bien actuel : rembourser le prêt relais', vente.date, `${eur0(vente.montant)} attendus.`); }
    add('relais-echeance', '4. Vente et remboursement du relais', 'Contrôle avant l’échéance du prêt relais (vente conclue, sinon demande de prorogation)', addM(R.fin, -3), `Échéance le ${fdate(R.fin)}.`);
  }
  add('opr', '5. Livraison', 'Visite de pré-livraison (OPR) : lister les réserves', addM(liv, -1), 'Se faire accompagner si besoin ; ne pas payer le solde de 5 % avant levée des réserves.');
  add('cles', '5. Livraison', 'Remise des clés et procès-verbal de livraison', liv, 'Paiement du solde (5 %) et déblocage final du prêt.');
  add('reserves', '5. Livraison', 'Faire lever les réserves (délai d’un mois, relance par courrier recommandé)', addM(liv, 1));
  add('assurance-habitation', '6. Après la livraison', 'Souscrire l’assurance habitation et ouvrir les contrats (énergie, internet)', addDays(liv, -7));
  add('garanties', '6. Après la livraison', 'Garanties : parfait achèvement (1 an) et biennale (2 ans) — noter les échéances', addM(liv, 11), 'Signaler les désordres par courrier recommandé avant la fin de la première année.');
  add('taxe', '6. Après la livraison', 'Déclarer le bien (impôts locaux) et demander les exonérations éventuelles', addM(liv, 2));
  add('budget', '6. Après la livraison', 'Mettre à jour le budget : mensualités des prêts et charges du nouveau logement', liv, sim.summary.pays.map(p => `${p.label} ≈ ${eur0(p.mensualite)}/mois`).join(' · '));
  return A;
}
