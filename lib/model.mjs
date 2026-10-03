// Modèle de paramétrage : configuration réutilisable, sans aucune donnée personnelle.
import { DEFAULT_CATEGORIES, DEFAULT_RULES } from './enrich.mjs';
import { DEFAULT_TEMPLATES } from './seed-prompts.mjs';
import { defaultLicense } from './license.mjs';

export const SECTIONS = {
  categories: 'Catégories (noms, icônes, couleurs, types, budgets)',
  rules: 'Règles de classement automatique',
  menu: 'Affichage et ordre des menus',
  promptTemplates: 'Modèles de prompt d’analyse IA',
  ai: 'Fournisseur d’IA (sans clé API)',
  backup: 'Planification des sauvegardes',
  license: 'Copyright et licence d’utilisation (sans acceptation)',
};
const SYSTEM_CATS = ['autres', 'revenus-divers', 'virement-interne'];
const clone = x => JSON.parse(JSON.stringify(x));

export function exportModel(store, { name, description, sections, appVersion }) {
  const s = new Set(sections?.length ? sections : Object.keys(SECTIONS));
  const content = {};
  if (s.has('categories')) content.categories = clone(store.categories);
  if (s.has('rules')) content.rules = clone(store.rules);
  if (s.has('menu') && store.settings?.menu) content.menu = clone(store.settings.menu);
  if (s.has('promptTemplates')) content.promptTemplates = clone(store.prompts?.templates ?? DEFAULT_TEMPLATES);
  if (s.has('ai')) { const a = store.ai ?? {}; content.ai = { provider: a.provider ?? 'local', model: a.model ?? '', endpoint: a.endpoint ?? '', maxTokens: a.maxTokens ?? 2000 }; }
  if (s.has('backup') && store.settings?.backup) { const { auto, every, weekday, time, type, keep } = store.settings.backup; content.backup = { auto, every, weekday, time, type, keep }; }
  if (s.has('license')) { const l = { ...defaultLicense(), ...(store.license ?? {}) }; content.license = { holder: l.holder, year: l.year, product: l.product, contact: l.contact, licenseType: l.licenseType, eulaEnabled: l.eulaEnabled, eulaText: l.eulaText }; }
  return { schema: 'comptes-model/1', name: String(name || 'Modèle Comptes').slice(0, 80), description: String(description || '').slice(0, 500), createdAt: new Date().toISOString(), appVersion, sections: Object.keys(content), content };
}

export function builtinModel() {
  return { schema: 'comptes-model/1', name: 'Modèle d’origine', description: 'Catégories et règles fournies avec l’application.', createdAt: null, appVersion: '', sections: ['categories', 'rules', 'promptTemplates'],
    content: { categories: clone(DEFAULT_CATEGORIES), rules: clone(DEFAULT_RULES), promptTemplates: clone(DEFAULT_TEMPLATES) } };
}

export function validate(model) {
  if (!model || model.schema !== 'comptes-model/1' || typeof model.content !== 'object') throw new Error('Fichier de modèle invalide (schéma comptes-model/1 attendu)');
  const c = model.content;
  if (c.categories && (!Array.isArray(c.categories) || c.categories.some(x => !x.id || !x.name))) throw new Error('Catégories invalides');
  if (c.rules && (!Array.isArray(c.rules) || c.rules.some(r => !r.pattern || !r.categoryId))) throw new Error('Règles invalides');
}

/** Applique (ou simule) l'import. Retourne un résumé des changements. */
export function applyModel(store, model, { sections, mode = 'merge', dryRun = false }) {
  validate(model);
  const want = new Set((sections?.length ? sections : model.sections ?? Object.keys(model.content)).filter(k => model.content[k] !== undefined));
  const sum = [];
  const target = dryRun ? clone(store) : store;
  const c = model.content;
  if (want.has('categories')) {
    const cur = target.categories, byId = new Map(cur.map(x => [x.id, x]));
    let add = 0, upd = 0, del = 0;
    for (const m of c.categories) { const e = byId.get(m.id); if (!e) { cur.push({ id: m.id, name: m.name, icon: m.icon || '📦', color: m.color || '#9ca3af', kind: m.kind || 'expense', ...(m.budget ? { budget: m.budget } : {}) }); add++; } else { Object.assign(e, { name: m.name, icon: m.icon || e.icon, color: m.color || e.color, kind: m.kind || e.kind }); if (m.budget) e.budget = m.budget; else if (mode === 'replace') delete e.budget; upd++; } }
    if (mode === 'replace') { const keep = new Set([...c.categories.map(x => x.id), ...SYSTEM_CATS]); target.categories = cur.filter(x => keep.has(x.id) || (del++, false)); }
    sum.push(`Catégories : ${add} ajoutée(s), ${upd} mise(s) à jour${del ? `, ${del} supprimée(s)` : ''}`);
  }
  if (want.has('rules')) {
    const valid = new Set(target.categories.map(x => x.id)), imp = c.rules.filter(r => valid.has(r.categoryId));
    if (mode === 'replace') { target.rules = imp.map(r => ({ ...r })); sum.push(`Règles : remplacées par ${imp.length} règle(s)`); }
    else {
      const key = r => `${r.pattern.toUpperCase()}|${r.categoryId}|${r.sign || 'any'}`, have = new Set(target.rules.map(key)); let add = 0;
      for (const r of imp) if (!have.has(key(r))) { target.ruleSeq = (target.ruleSeq || 1000) + 1; target.rules.unshift({ id: 'u' + target.ruleSeq, pattern: r.pattern, categoryId: r.categoryId, sign: r.sign || 'any' }); add++; }
      sum.push(`Règles : ${add} ajoutée(s), ${imp.length - add} déjà présente(s)`);
    }
  }
  const settings = () => (target.settings ??= {});
  if (want.has('menu')) { settings().menu = clone(c.menu); sum.push('Menus : affichage et ordre remplacés'); }
  if (want.has('promptTemplates')) { target.prompts ??= { journal: [], templates: {}, seq: 1000 }; target.prompts.templates = clone(c.promptTemplates); sum.push('Modèles de prompt : remplacés'); }
  if (want.has('ai')) { target.ai = { ...(target.ai ?? {}), ...clone(c.ai) }; sum.push(`IA : fournisseur « ${c.ai.provider} » (la clé API n'est pas modifiée)`); }
  if (want.has('backup')) { settings().backup = { ...(settings().backup ?? {}), ...clone(c.backup), since: new Date().toISOString() }; sum.push('Sauvegardes : planification remplacée'); }
  if (want.has('license')) { const l = { ...defaultLicense(), ...(target.license ?? {}) }; const t = c.license; const textChanged = (t.eulaText ?? '') !== (l.eulaText ?? ''); Object.assign(l, { holder: t.holder, year: t.year, product: t.product, contact: t.contact, licenseType: t.licenseType, eulaEnabled: t.eulaEnabled, eulaText: t.eulaText ?? '' }); if (textChanged) l.eulaVersion = (l.eulaVersion || 1) + 1; target.license = l; sum.push('Licence : copyright et licence d’utilisation remplacés'); }
  return { summary: sum, sections: [...want] };
}
