// Manifeste du programme : identité, composants, licences et empreintes (SHA-256) des fichiers.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { listProgramFiles } from './backup.mjs';
import { thirdParty, defaultLicense, LICENSE_TYPES, copyrightLine } from './license.mjs';

export const MANIFEST_FILE = 'MANIFEST.json';
export const FEATURES = [
  'Import des relevés PDF La Banque Postale (contrôle des totaux et soldes)', 'Tableau de bord, opérations, statistiques par catégorie', 'Catégories, règles de classement, virements internes',
  'Comparaison de deux périodes', 'Prévisions budgétaires annuelles modifiables', 'Rapports PDF', 'Analyse des dépenses et revenus (IA ou locale)',
  'Comptes et opérations manuels', 'Sauvegardes (données, programme, complète) et restauration', 'Gestion des versions et journal des modifications',
  'Journal des prompts et modèles de prompt', 'Copyright et licence d’utilisation', 'Manifeste et modèles de paramétrage', 'Installeur Windows MSI',
];
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (root, f) => path.relative(root, f).replace(/\\/g, '/');

export function buildManifest({ root, store, nodeVersion, installed }) {
  let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* absent */ }
  const lic = { ...defaultLicense(), ...(store?.license ?? {}) };
  const files = listProgramFiles(root).filter(f => path.basename(f) !== MANIFEST_FILE).map(f => { const b = fs.readFileSync(f); return { path: rel(root, f), size: b.length, sha256: sha(b) }; }).sort((a, b) => a.path.localeCompare(b.path));
  const integrity = sha(files.map(f => `${f.path}:${f.sha256}`).join('\n'));
  return {
    schema: 'comptes-manifest/1', name: pkg.name || 'comptes', product: lic.product, version: pkg.version || '0.0.0', description: pkg.description || '',
    generatedAt: new Date().toISOString(), holder: lic.holder, copyright: copyrightLine(lic), license: { type: lic.licenseType, spdx: LICENSE_TYPES[lic.licenseType]?.spdx },
    runtime: { node: nodeVersion, platform: process.platform, arch: process.arch, installed: !!installed },
    features: FEATURES, dependencies: thirdParty(root, nodeVersion), files, summary: { files: files.length, bytes: files.reduce((s, f) => s + f.size, 0) }, integrity,
  };
}

export function readSaved(root) {
  const f = path.join(root, MANIFEST_FILE);
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

/** Compare le manifeste enregistré aux fichiers actuels. */
export function verify(root, saved) {
  const cur = new Map(listProgramFiles(root).filter(f => path.basename(f) !== MANIFEST_FILE).map(f => [rel(root, f), sha(fs.readFileSync(f))]));
  const modified = [], removed = [], added = [];
  for (const f of saved.files) { const c = cur.get(f.path); if (c === undefined) removed.push(f.path); else if (c !== f.sha256) modified.push(f.path); }
  const known = new Set(saved.files.map(f => f.path));
  for (const p of cur.keys()) if (!known.has(p)) added.push(p);
  return { ok: !modified.length && !removed.length && !added.length, modified, removed, added, checked: saved.files.length };
}
