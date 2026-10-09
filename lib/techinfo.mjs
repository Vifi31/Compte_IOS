// Informations techniques calculées à partir des sources (utilisées par Administration › Documentation technique).
import fs from 'fs';
import path from 'path';

/** Rôle de chaque fichier source (affiché dans la documentation technique). */
export const FILE_ROLES = {
  'server.mjs': 'Serveur HTTP, état en mémoire, routes de base (catégories, règles, relevés, menus)',
  'lib/paths.mjs': 'Emplacements des fichiers (programme, données, sauvegardes), port, .env',
  'lib/enrich.mjs': 'Catégories et règles par défaut, nettoyage des libellés, classement automatique',
  'lib/holders.mjs': 'Titulaires des comptes (reconnaissance des virements entre ses propres comptes)',
  'lib/manual.mjs': 'Comptes et opérations saisis à la main',
  'lib/extra.mjs': 'Routes des sauvegardes, versions, rapports PDF, manifeste, modèles',
  'lib/features.mjs': 'Routes du journal des prompts, de la licence, de l’IA et du projet immobilier',
  'lib/backup.mjs': 'Service de sauvegarde (ZIP), vérification, restauration, purge',
  'lib/versions.mjs': 'Service de versions du programme (publication, comparaison, restauration, renumérotation)',
  'lib/manifest.mjs': 'Manifeste du programme : composants, licences, empreintes SHA-256',
  'lib/model.mjs': 'Modèles de paramétrage réutilisables (export / import)',
  'lib/license.mjs': 'Copyright, types de licence, contrat d’utilisation, composants tiers',
  'lib/ai.mjs': 'Fournisseurs d’IA (Anthropic, OpenAI, Ollama…), appels, modèles locaux',
  'lib/pdfreport.mjs': 'Rendu PDF générique (pdfkit) à partir d’une description JSON',
  'lib/zip.mjs': 'Lecture et écriture de fichiers ZIP (sans dépendance)',
  'lib/seed-prompts.mjs': 'Journal et modèles de prompt initiaux',
  'lib/techinfo.mjs': 'Calcul des informations de la documentation technique',
  'scripts/parse.mjs': 'Lecture des relevés PDF (pdfjs-dist) : comptes, opérations, contrôles',
  'scripts/dump.mjs': 'Outil de diagnostic : affichage du texte d’un relevé',
  'scripts/manifest.mjs': 'Outil en ligne de commande : génération du manifeste',
  'public/index.html': 'Page unique de l’application (coque, chargement des scripts)',
  'public/style.css': 'Feuille de style (thèmes clair / sombre, composants)',
  'public/app.js': 'Cœur de l’interface : utilitaires, état, tableau de bord, opérations, statistiques, routage',
  'public/menus.js': 'Menus : groupes, libellés, déplacements, création, page « Affichage des menus »',
  'public/forecast.js': 'Prévisions budgétaires modifiables',
  'public/compare.js': 'Comparaison de deux périodes',
  'public/statements.js': 'Relevés : import, affichage par année',
  'public/reports.js': 'Rapports PDF : génération, options, liste des fichiers',
  'public/backups.js': 'Page Sauvegardes',
  'public/versions.js': 'Page Versions',
  'public/prompts.js': 'Page Prompt (journal et modèles)',
  'public/license.js': 'Page Licence et fenêtre d’acceptation',
  'public/manifest.js': 'Page Manifeste',
  'public/model.js': 'Page Modèle',
  'public/exports.js': 'Exports PDF des pages d’administration et de la documentation',
  'public/docs.js': 'Documentation (mode d’emploi) et son plan',
  'public/techdocs.js': 'Documentation technique : schémas, infographies, données calculées',
  'public/analysis.js': 'Analyse IA des dépenses et revenus, paramètres IA',
  'public/analysis-multi.js': 'Analyse pluriannuelle',
  'public/immo-engine.js': 'Moteur de simulation du projet VEFA (événements, financement, intérêts)',
  'public/immo-viz.js': 'Composants visuels de l’immobilier (anneaux, jauge, tuiles, score)',
  'public/immo.js': 'Immobilier : projet, paramètres, planning, PDF',
  'public/immo-views.js': 'Immobilier : pages Suivi et Plan d’actions',
  'public/immo-tasks.js': 'Dépendances entre tâches, contraintes, diagramme de Gantt',
  'public/immo-ai.js': 'Analyse IA du projet immobilier',
  'installer/build-msi.ps1': 'Construction du fichier MSI (API Windows Installer, makecab)',
  'installer/Comptes.ps1': 'Lanceur Windows : démarre node.exe embarqué puis ouvre le navigateur',
};

const EXT = /\.(mjs|js|css|html|ps1)$/;
const lines = f => { try { return fs.readFileSync(f, 'utf8').split('\n').length; } catch { return 0; } };
const tidy = p => String(p).replace(/\\\//g, '/').replace(/\([^)]*\)/g, ':id').replace(/\$$/, '');

/** Routes HTTP déclarées dans les sources (p === '/api/…' ou .match(/^\/api\/…$/)). */
function scanRoutes(root) {
  const files = ['server.mjs', ...fs.readdirSync(path.join(root, 'lib')).filter(f => f.endsWith('.mjs') && f !== 'techinfo.mjs').map(f => 'lib/' + f)], out = new Map();
  for (const rel of files) {
    let src; try { src = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    for (const ln of src.split('\n')) {
      let m;
      const re = /p === '(\/api\/[^']+)'(?:\s*&&\s*m === '(\w+)')?/g;
      while ((m = re.exec(ln))) { const k = m[1]; const e = out.get(k) ?? { path: k, methods: new Set(), file: rel }; if (m[2]) e.methods.add(m[2]); out.set(k, e); }
      const re2 = /match\(\/\^(\\\/api\\\/[^$]*?)\$\/\)/g;
      while ((m = re2.exec(ln))) { const k = tidy(m[1]); const e = out.get(k) ?? { path: k, methods: new Set(), file: rel }; const mm = /m === '(\w+)'/g; let x; while ((x = mm.exec(ln))) e.methods.add(x[1]); out.set(k, e); }
    }
  }
  return [...out.values()].map(e => ({ path: e.path, methods: [...e.methods].sort(), file: e.file })).sort((a, b) => a.path.localeCompare(b.path));
}

export function collectTechInfo(root, { store } = {}) {
  const groups = { server: ['server.mjs'], lib: [], public: [], scripts: [], installer: [] };
  const list = d => { try { return fs.readdirSync(path.join(root, d), { withFileTypes: true }).filter(e => e.isFile() && EXT.test(e.name)).map(e => d + '/' + e.name); } catch { return []; } };
  for (const d of ['lib', 'public', 'scripts', 'installer']) groups[d] = list(d);
  const files = Object.entries(groups).flatMap(([g, arr]) => arr.map(f => ({ path: f, group: g, lines: lines(path.join(root, f)), role: FILE_ROLES[f] ?? '' })));
  let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* absent */ }
  const sumBy = g => files.filter(f => f.group === g).reduce((s, f) => s + f.lines, 0);
  const routes = scanRoutes(root);
  const keys = store ? Object.entries(store).map(([k, v]) => ({ key: k, bytes: Buffer.byteLength(JSON.stringify(v ?? null)) })).sort((a, b) => b.bytes - a.bytes) : [];
  return {
    version: pkg.version ?? '', name: pkg.name ?? '', node: process.version, platform: process.platform, arch: process.arch,
    dependencies: pkg.dependencies ?? {}, files, routes,
    totals: { files: files.length, lines: files.reduce((s, f) => s + f.lines, 0), server: sumBy('server') + sumBy('lib') + sumBy('scripts'), front: sumBy('public'), installer: sumBy('installer'), routes: routes.length },
    storeKeys: keys,
  };
}
