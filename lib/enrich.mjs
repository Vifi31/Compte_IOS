import { isOwnName } from './holders.mjs';
// Enrichissement des opérations : titre lisible, type, virements internes, catégorie.

export const DEFAULT_CATEGORIES = [
  { id: 'courses', name: 'Courses', icon: '🛒', color: '#22c55e', kind: 'expense' },
  { id: 'restaurants', name: 'Restaurants & cafés', icon: '🍽️', color: '#f97316', kind: 'expense' },
  { id: 'transport', name: 'Transport & auto', icon: '🚗', color: '#3b82f6', kind: 'expense' },
  { id: 'logement', name: 'Logement & prêts', icon: '🏠', color: '#8b5cf6', kind: 'expense' },
  { id: 'energie', name: 'Énergie & télécom', icon: '💡', color: '#eab308', kind: 'expense' },
  { id: 'assurances', name: 'Assurances', icon: '🛡️', color: '#06b6d4', kind: 'expense' },
  { id: 'sante', name: 'Santé', icon: '💊', color: '#ef4444', kind: 'expense' },
  { id: 'impots', name: 'Impôts & taxes', icon: '🏛️', color: '#64748b', kind: 'expense' },
  { id: 'loisirs', name: 'Loisirs & sorties', icon: '🎭', color: '#ec4899', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#a855f7', kind: 'expense' },
  { id: 'maison', name: 'Maison & jardin', icon: '🌿', color: '#14b8a6', kind: 'expense' },
  { id: 'dons', name: 'Dons & cotisations', icon: '💝', color: '#f43f5e', kind: 'expense' },
  { id: 'virements-perso', name: 'Virements à des proches', icon: '💸', color: '#f59e0b', kind: 'expense' },
  { id: 'retraits', name: 'Retraits espèces', icon: '💶', color: '#84cc16', kind: 'expense' },
  { id: 'frais', name: 'Frais bancaires', icon: '🏦', color: '#94a3b8', kind: 'expense' },
  { id: 'autres', name: 'Autres dépenses', icon: '📦', color: '#9ca3af', kind: 'expense' },
  { id: 'salaire', name: 'Salaire', icon: '💼', color: '#10b981', kind: 'income' },
  { id: 'loyers', name: 'Loyers / gérance', icon: '🏘️', color: '#0d9488', kind: 'income' },
  { id: 'remboursements', name: 'Remboursements & aides', icon: '🧾', color: '#0ea5e9', kind: 'income' },
  { id: 'interets', name: 'Intérêts', icon: '📈', color: '#6366f1', kind: 'income' },
  { id: 'revenus-divers', name: 'Autres revenus', icon: '💰', color: '#65a30d', kind: 'income' },
  { id: 'virement-interne', name: 'Virements internes', icon: '🔁', color: '#475569', kind: 'transfer' },
];

const R = (pattern, categoryId, sign = 'any') => ({ pattern, categoryId, sign });
export const DEFAULT_RULES = [
  R('PAYE DU MOIS', 'salaire'), R('GERANCE GLOBA', 'loyers'),
  R('MNFCT PRESTATIONS', 'remboursements'), R('DDFIP', 'remboursements', 'credit'), R('DGFIP', 'remboursements', 'credit'),
  R('CREDIT CARTE BANCAIRE', 'remboursements'), R('AVANTAGE TARIFAIRE', 'remboursements'), R('INTERETS', 'interets', 'credit'),
  R('PRELEVEMENT FISCAL', 'impots'), R('PRELEVEMENTS SOCIAUX', 'impots'), R('FINANCES PUBL', 'impots'), R('DIRECTION GENERALE', 'impots'), R('DGFIP', 'impots'),
  R('ECHEANCE PRET', 'logement'),
  R('EDF ', 'energie'), R('ENGIE', 'energie'), R('FREE TELECOM', 'energie'),
  R('LBP ASSURANCES', 'assurances'), R('MAIF', 'assurances'), R('MUNIT', 'assurances'), R('CNP', 'assurances'), R('IDENTICAR', 'assurances'),
  R('MNFCT', 'sante'), R('PHARMACIE', 'sante'), R('PHIE ', 'sante'),
  R('SOCIETE PROTECTRICE', 'dons'), R('WWF', 'dons'), R('CSF ASSOCIATION', 'dons'),
  R('TENUE DE COMPTE', 'frais'), R('COTISATION TRIMESTRIELLE', 'frais'), R('MINIMUM FORFAITAIRE', 'frais'),
  R('RETRAIT DAB', 'retraits'), R('CARTE X', 'retraits'),
  R('LECLERC STATIO', 'transport'), R('STATION SERVIC', 'transport'), R('PETROLEC', 'transport'), R('ASF-', 'transport'), R('COFIROUTE', 'transport'),
  R('APRR', 'transport'), R('RATP', 'transport'), R('TISSEO', 'transport'), R('SNCF', 'transport'), R('PAYBYPHO', 'transport'), R('ALVEA', 'transport'),
  R('BRICO', 'maison'), R('ESPACE VERT', 'maison'), R('OLLYDIS', 'maison'),
  R('LIDL', 'courses'), R('CARREFOUR', 'courses'), R('LECLERC', 'courses'), R('CASINO', 'courses'), R('PICARD', 'courses'), R('NATURALIA', 'courses'),
  R('BOUCHERIE', 'courses'), R('FROMAGE', 'courses'), R('LAIT CHEZ', 'courses'), R('FOURNIL', 'courses'), R('GOURMANDIS', 'courses'), R('NOY DES', 'courses'),
  R('CAVE ', 'courses'), R('VIGNERONS', 'courses'), R('MEME DU QUERCY', 'courses'), R('SUMUP *ETAL', 'courses'), R('INTER MAGASIN', 'courses'), R('LA BRULERIE', 'courses'),
  R('BISTROT', 'restaurants'), R('CHEZ ALAIN', 'restaurants'), R('CHEZ HUANG', 'restaurants'), R('MONUMENT CAFE', 'restaurants'), R('NP COFFEE', 'restaurants'),
  R('NUEVA CHULETTA', 'restaurants'), R('LAO VIET', 'restaurants'), R('VIET 37', 'restaurants'), R('RESTAURANT', 'restaurants'), R('POINTE DE PENM', 'restaurants'),
  R('RELAIS ', 'restaurants'), R('MAISON DARN', 'restaurants'), R('FROM LA CORE', 'restaurants'),
  R('ACTION ', 'shopping'), R('CDISCOUNT', 'shopping'), R('AMAZON', 'shopping'), R('ONEY', 'shopping'), R('AJC COMMERCE', 'shopping'), R('ESQUIROL', 'shopping'), R('MDFRANCE', 'shopping'),
  R('INTERFLORA', 'shopping'),
  R('OLYMPIAHALL', 'loisirs'), R('NOISELINE', 'loisirs'), R('CONCERT', 'loisirs'), R('FORF P.STAT', 'loisirs'),
].map((r, i) => ({ id: 'd' + i, ...r }));

const SMALL = new Set(['DE', 'DU', 'DES', 'ET', 'LA', 'LE', 'LES', 'SUR', 'A', 'AU', 'EN', 'D', 'L']);
function pretty(s) {
  s = s.replace(/\s+/g, ' ').trim();
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters || letters !== letters.toUpperCase()) return s;
  return s.toLowerCase().split(' ').map((w, i) => {
    if (i && SMALL.has(w.toUpperCase())) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

const NICE = [
  [/DIRECTION GENERALE|DGFIP|FINANCES PUBL/, 'Impôts (DGFiP)'],
  [/SOCIETE PROTECTRICE/, 'SPA'],
  [/MNFCT COTISATIONS/, 'Mutuelle MNFCT'],
  [/MUNIT/, 'Assurance emprunteur'],
  [/ROOLE-IDENTICAR/, 'Identicar'],
  [/PRELEVEMENT DE EDF/, 'EDF'],
  [/PRELEVEMENT DE ENGIE/, 'Engie'],
  [/FREE TELECOM/, 'Free (internet)'],
  [/PRELEVEMENT DE MAIF/, 'MAIF'],
];

export function enrich(op, ownNumbers, holders = []) {
  const label = op.label || '';
  const det = op.details || '';
  const full = `${label} ${det}`;
  let kind = 'autre', title = pretty(label), memo = '', opDate = null;
  let m;
  if ((m = label.match(/^ACHAT CB (.*?)\s+(\d\d)\.(\d\d)\.(\d\d)$/))) {
    kind = 'cb'; title = pretty(m[1].replace(/\s+\d{2,}$/, '')); opDate = `20${m[4]}-${m[3]}-${m[2]}`;
  } else if (/^CARTE X\d+/.test(label)) {
    kind = 'retrait';
    const loc = det.replace(/^RETRAIT DAB\s*/, '').split(' | ')[0];
    title = 'Retrait ' + pretty(loc || 'DAB');
  } else if (/^CHEQUE N/.test(label)) {
    kind = 'cheque'; title = 'Chèque ' + label.replace(/^CHEQUE N°\s*/, 'n° ');
  } else if (/^REMISE DE CHEQUES/.test(label)) {
    kind = 'cheque'; title = 'Remise de chèques';
  } else if (/^PRELEVEMENT DE /.test(label)) {
    kind = 'prelevement';
    const nice = NICE.find(([re]) => re.test(full.toUpperCase()));
    title = nice ? nice[1] : pretty(label.replace(/^PRELEVEMENT DE\s*/, ''));
    if (/LBP ASSURANCES/i.test(label)) title = /Habitation/i.test(det) ? 'Assurance habitation' : /Juridique/i.test(det) ? 'Protection juridique' : 'LBP Assurances';
    if (/ECHEANCE PRET/i.test(label)) { const y = det.match(/MANDAT : CRE(\d{4})/); title = 'Échéance prêt' + (y ? ' ' + y[1] : ''); }
    if (/IMPOT TF/.test(full)) title = 'Taxe foncière';
  } else if ((m = label.match(/^VIREMENT (INSTANTANE |PERMANENT )?(DE|A|POUR)\s*(.*)$/))) {
    kind = m[1]?.startsWith('PERMANENT') ? 'virement-permanent' : 'virement';
    const dir = m[2] === 'DE' ? 'de' : 'à';
    let who = m[3].trim();
    const d0 = det.split(' | ')[0];
    if (!who) {
      const toks = d0.replace(/^(Mlle|Mme|M\.|Mr|MR|M)\s+/, '').split(' ');
      const name = []; let i = 0;
      while (i < toks.length && /^[A-ZÀ-Ý][A-ZÀ-Ý'\-]+$/.test(toks[i])) name.push(toks[i++]);
      who = name.length ? name.join(' ') : d0.split(' ').slice(0, 3).join(' ');
      memo = /COMPTE FR/.test(d0) ? '' : toks.slice(i).join(' ');
    }
    title = `Virement ${dir} ${pretty(who)}`;
    if (/CA COMPTE GERANCE/.test(full)) title = 'Gérance (loyers)';
    else if (/PAYE DU MOIS/.test(full)) title = 'Salaire';
    else if (/DDFIP|DGFIP/.test(who)) title = 'Remboursement impôts';
  } else if (/TENUE DE COMPTE|COTISATION|MINIMUM FORFAITAIRE/.test(label)) {
    kind = 'frais';
  } else if (/INTERETS/.test(label)) {
    kind = 'interets'; title = 'Intérêts acquis';
  }

  // virement interne : numéro de compte propre, ou nom du titulaire
  const compact = full.replace(/\s/g, '');
  let internal = false;
  if (/^VIREMENT/.test(label)) {
    if (ownNumbers.some(n => compact.includes(n))) internal = true;
    else {
      const who = (label.replace(/^VIREMENT (INSTANTANE |PERMANENT )?(DE|A|POUR)\s*/, '') + ' ' + det.split(' | ')[0]).trim();
      if (isOwnName(who, holders)) internal = true;
    }
  }
  if (internal) title = op.amount < 0 ? 'Virement interne (sortant)' : 'Virement interne (entrant)';
  return { ...op, title, memo, kind, internal, opDate: opDate || op.date };
}

export function categorize(op, rules, overrides, validIds) {
  const o = overrides[op.id];
  if (o && validIds.has(o)) return { categoryId: o, source: 'manuel' };
  if (op.internal) return { categoryId: 'virement-interne', source: 'auto' };
  const hay = `${op.title} ${op.label} ${op.details}`.toUpperCase();
  const sign = op.amount < 0 ? 'debit' : 'credit';
  for (const r of rules) {
    if (r.sign && r.sign !== 'any' && r.sign !== sign) continue;
    if (hay.includes(r.pattern.toUpperCase()) && validIds.has(r.categoryId)) return { categoryId: r.categoryId, source: 'règle', ruleId: r.id };
  }
  return { categoryId: op.amount < 0 ? 'autres' : 'revenus-divers', source: 'défaut' };
}
