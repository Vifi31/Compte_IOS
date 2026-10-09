'use strict';
// ============ Administration › Documentation technique : infrastructure, architecture, principes (schémas et infographies) ============
const TDC = { indigo: '#6366f1', pink: '#ec4899', green: '#10b981', amber: '#f59e0b', blue: '#0ea5e9', violet: '#8b5cf6', slate: '#64748b', red: '#ef4444', teal: '#14b8a6', ink: '#1b1d3a' };

// ---------- mini-bibliothèque SVG (couleurs explicites : les schémas restent lisibles en thème sombre et s'exportent en PNG)
const sx = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const svgT = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? TDC.ink}" text-anchor="${o.anchor ?? 'start'}"${o.italic ? ' font-style="italic"' : ''}>${sx(s)}</text>`;
/** Rectangle avec titre et lignes de texte (o.center : texte centré). */
const svgR = (x, y, w, h, o = {}) => {
  const tx = o.center ? x + w / 2 : x + 12, an = o.center ? 'middle' : 'start';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 10}" fill="${o.fill ?? '#ffffff'}" stroke="${o.stroke ?? '#c7cbe8'}" stroke-width="${o.sw ?? 1.5}"${o.dash ? ' stroke-dasharray="6 4"' : ''}/>`
    + (o.title ? svgT(tx, y + 21, o.title, { size: o.ts ?? 13, weight: 700, fill: o.tc ?? TDC.ink, anchor: an }) : '')
    + (o.lines ?? []).map((l, i) => svgT(tx, y + (o.title ? 41 : 22) + i * 16, l, { size: o.ls ?? 11, fill: o.lc ?? '#475569', anchor: an })).join('');
};
/** Flèche (x1,y1) → (x2,y2) ; o.both : double sens ; o.dash : pointillés ; o.label : texte au milieu. */
const svgA = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c ?? '#64748b'}" stroke-width="${o.w ?? 1.8}"${o.dash ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#ah)"${o.both ? ' marker-start="url(#ah)"' : ''}/>`
  + (o.label ? svgT((x1 + x2) / 2, (y1 + y2) / 2 - 6, o.label, { size: o.ls ?? 10.5, anchor: 'middle', fill: o.lc ?? '#475569', weight: 600 }) : '');
const svgP = (pts, o = {}) => `<polyline points="${pts.map(p => p.join(',')).join(' ')}" fill="none" stroke="${o.c ?? '#64748b'}" stroke-width="${o.w ?? 1.8}"${o.dash ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#ah)"/>`;
const svgDoc = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="'Segoe UI', Arial, sans-serif"><defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#64748b"/></marker></defs><rect width="${w}" height="${h}" rx="14" fill="#f8f9ff"/>${body}</svg>`;
const badge = (x, y, n, c = TDC.indigo) => `<circle cx="${x}" cy="${y}" r="11" fill="${c}"/>` + svgT(x, y + 4, String(n), { size: 12, weight: 700, fill: '#fff', anchor: 'middle' });

// ---------- schémas
const dArch = () => svgDoc(1000, 520,
  svgR(20, 28, 250, 424, { fill: '#eef0ff', stroke: TDC.indigo, title: '🖥️ Navigateur (interface)', tc: TDC.indigo }) +
  svgR(36, 62, 218, 50, { title: 'index.html + style.css', ts: 12, lines: ['coque, thèmes clair / sombre'] }) +
  svgR(36, 122, 218, 50, { title: 'app.js · menus.js', ts: 12, lines: ['état S · h() · render() · routage'] }) +
  svgR(36, 182, 218, 66, { title: 'Pages (scripts globaux)', ts: 12, lines: ['tableau de bord, opérations, stats…', 'immobilier, administration'] }) +
  svgR(36, 258, 218, 50, { title: 'Chart.js', ts: 12, lines: ['graphiques interactifs'] }) +
  svgR(36, 318, 218, 50, { title: 'localStorage', ts: 12, lines: ['thème, filtres, menus ouverts, PDF'] }) +
  svgR(36, 378, 218, 56, { title: 'Aperçu PDF / fichiers', ts: 12, lines: ['onglet du navigateur'] }) +
  svgA(272, 150, 338, 150, { both: true, label: 'HTTP · JSON' }) + svgT(305, 170, '/api/*', { size: 10, anchor: 'middle', fill: '#64748b' }) +
  svgA(272, 250, 338, 250, { both: true, label: 'fichiers' }) + svgT(305, 270, 'statiques', { size: 10, anchor: 'middle', fill: '#64748b' }) +
  svgR(340, 28, 340, 424, { fill: '#ecfdf5', stroke: TDC.green, title: '⚙️ Serveur Node.js · 127.0.0.1:3210', tc: '#047857' }) +
  svgR(356, 62, 308, 50, { title: 'server.mjs', ts: 12, lines: ['routeur HTTP · état en mémoire · import des relevés'] }) +
  svgR(356, 122, 308, 50, { title: 'lib/extra.mjs', ts: 12, lines: ['sauvegardes · versions · rapports · manifeste · modèles'] }) +
  svgR(356, 182, 308, 50, { title: 'lib/features.mjs · lib/manual.mjs', ts: 12, lines: ['prompts · licence · IA · immobilier · comptes manuels'] }) +
  svgR(356, 242, 308, 50, { title: 'scripts/parse.mjs · lib/enrich.mjs', ts: 12, lines: ['lecture des PDF · catégorisation'] }) +
  svgR(356, 302, 308, 50, { title: 'lib/pdfreport.mjs · lib/zip.mjs', ts: 12, lines: ['rendu PDF (pdfkit) · ZIP sans dépendance'] }) +
  svgR(356, 362, 308, 50, { title: 'lib/ai.mjs', ts: 12, lines: ['fournisseurs d’IA (HTTP sortant, facultatif)'] }) +
  svgA(682, 170, 748, 170, { both: true, label: 'fs' }) +
  svgR(750, 28, 230, 262, { fill: '#fffbeb', stroke: TDC.amber, title: '💾 Fichiers locaux', tc: '#b45309', lines: ['data/store.json', 'data/secrets.json (clé IA)', 'Documents/Releves/*.pdf', 'Sauvegardes/*.zip', 'Versions/*.zip', 'Rapports/*.pdf (+ index.json)', 'MANIFEST.json', 'serveur.log (version installée)'], ls: 11.5 }) +
  svgA(682, 388, 748, 388, { dash: true, c: TDC.pink, label: 'facultatif', lc: '#be185d' }) +
  svgR(750, 320, 230, 132, { fill: '#fdf2f8', stroke: TDC.pink, dash: true, title: '☁️ Services d’IA', tc: '#be185d', lines: ['Ollama / LM Studio (local)', 'Gemini · Groq · OpenRouter…', 'Anthropic · OpenAI'] }) +
  svgT(500, 492, 'Tout reste sur votre ordinateur : seul un appel d’IA explicite, avec consentement, envoie des données agrégées.', { size: 12, anchor: 'middle', fill: '#475569', italic: true }));

const dFlow = () => {
  const L = { n: 130, s: 500, f: 870 }, life = x => `<line x1="${x}" y1="62" x2="${x}" y2="450" stroke="#c7cbe8" stroke-width="2" stroke-dasharray="5 5"/>`;
  return svgDoc(1000, 480,
    svgR(40, 20, 180, 38, { fill: '#eef0ff', stroke: TDC.indigo, title: '🖥️ Navigateur', center: true, tc: TDC.indigo }) + svgR(410, 20, 180, 38, { fill: '#ecfdf5', stroke: TDC.green, title: '⚙️ Serveur', center: true, tc: '#047857' }) + svgR(780, 20, 180, 38, { fill: '#fffbeb', stroke: TDC.amber, title: '💾 Fichiers', center: true, tc: '#b45309' }) +
    life(L.n) + life(L.s) + life(L.f) +
    badge(24, 100, 1) + svgA(L.s, 100, L.f - 4, 100, { label: 'lit store.json · analyse les PDF (import)' }) + svgR(L.s - 120, 114, 240, 24, { r: 6, fill: '#ecfdf5', stroke: TDC.green, title: 'état en mémoire prêt', center: true, ts: 11, tc: '#047857' }) +
    badge(24, 178, 2) + svgA(L.n, 178, L.s - 4, 178, { label: 'GET /' }) + svgA(L.s, 204, L.n + 4, 204, { dash: true, label: 'index.html + scripts + style' }) +
    badge(24, 252, 3) + svgA(L.n, 252, L.s - 4, 252, { label: 'GET /api/state' }) + svgR(L.s - 130, 262, 260, 54, { r: 6, fill: '#ecfdf5', stroke: TDC.green, title: 'buildState()', center: true, ts: 11, tc: '#047857', lines: ['opérations + catégories + soldes'], ls: 10.5 }) + svgA(L.s, 334, L.n + 4, 334, { dash: true, label: 'JSON : état complet' }) +
    badge(24, 366, 4) + svgR(L.n - 86, 352, 230, 34, { r: 6, fill: '#eef0ff', stroke: TDC.indigo, title: 'render() : menu, page, graphiques', center: true, ts: 11, tc: TDC.indigo }) +
    badge(24, 414, 5) + svgA(L.n, 414, L.s - 4, 414, { label: 'PUT / POST /api/… (action)' }) + svgA(L.s, 434, L.f - 4, 434, { label: 'écrit store.json' }) + svgA(L.s, 458, L.n + 4, 458, { dash: true, label: 'état à jour → render()' }));
};

const dImport = () => {
  const boxes = [['📄 PDF', ['dossier Documents/Releves', 'dépôt ou glisser-déposer'], TDC.indigo], ['🔎 pdfjs-dist', ['texte + coordonnées', 'x / y de chaque mot'], TDC.blue], ['🧩 parseStatement', ['comptes, colonnes', 'débit / crédit, dates'], TDC.violet], ['✅ Contrôles', ['totaux débit / crédit', 'soldes d’ouverture', 'et de clôture'], TDC.green], ['🧹 enrich()', ['libellé nettoyé', 'virements internes', '(noms des titulaires)'], TDC.amber], ['🏷️ categorize()', ['règles + corrections', 'catégorie finale'], TDC.pink]];
  return svgDoc(1000, 330, boxes.map(([t, l, c], i) => svgR(18 + i * 164, 70, 140, 118, { fill: '#fff', stroke: c, sw: 2.5, title: t, center: true, tc: c, ts: 12.5, lines: l }) + (i < 5 ? svgA(160 + i * 164, 129, 180 + i * 164, 129) : '') + badge(30 + i * 164, 70, i + 1, c)).join('') +
    svgR(18 + 164 * 2, 226, 140 + 164, 70, { dash: true, fill: '#fff', stroke: TDC.slate, title: 'Dédoublonnage', ts: 12, tc: '#334155', lines: ['même date de relevé + mêmes comptes', '→ le second fichier est ignoré (doublon)'] }) +
    svgR(18 + 164 * 4, 226, 140 + 164, 70, { dash: true, fill: '#fff', stroke: TDC.slate, title: 'Corrections manuelles', ts: 12, tc: '#334155', lines: ['store.overrides : une catégorie imposée', 'à une opération reste après réimport'] }) +
    svgT(500, 36, 'Pipeline d’import : chaque relevé PDF devient des opérations enrichies et catégorisées', { size: 14, weight: 700, anchor: 'middle' }));
};

const dStore = () => svgDoc(1000, 430,
  svgR(380, 168, 240, 94, { fill: '#eef0ff', stroke: TDC.indigo, sw: 2.5, title: '🗄️ data/store.json', center: true, tc: TDC.indigo, ts: 15, lines: ['un seul fichier JSON', 'écrit à chaque modification'] }) +
  svgR(20, 20, 310, 128, { fill: '#fff', stroke: TDC.pink, title: '🏷️ Classement', tc: '#be185d', lines: ['categories : nom, icône, couleur, type, budget', 'rules : motif → catégorie (+ sens débit / crédit)', 'overrides : correction par opération', 'accountAliases : noms de comptes'] }) +
  svgR(670, 20, 310, 128, { fill: '#fff', stroke: TDC.green, title: '🏦 Comptes et budgets', tc: '#047857', lines: ['manualAccounts · manualOps : saisie manuelle', 'forecasts : prévisions modifiées par mois', 'catégories : budgets mensuels', '(les relevés PDF restent des fichiers)'] }) +
  svgR(20, 282, 310, 128, { fill: '#fff', stroke: TDC.amber, title: '⚙️ Paramètres', tc: '#b45309', lines: ['settings.menu : libellés, ordre, groupes', 'settings.backup : planification', 'license : copyright, contrat, acceptation', 'ai : fournisseur, modèle (sans la clé)'] }) +
  svgR(670, 282, 310, 128, { fill: '#fff', stroke: TDC.violet, title: '🧩 Modules', tc: '#6d28d9', lines: ['prompts : journal + modèles de prompt', 'analyses : historique des analyses IA', 'immo : projet VEFA (appels, épargne,', 'prêts, relais, actions et dépendances)'] }) +
  svgA(330, 100, 380, 190, { c: TDC.pink }) + svgA(670, 100, 620, 190, { c: TDC.green }) + svgA(330, 330, 380, 240, { c: TDC.amber }) + svgA(670, 330, 620, 240, { c: TDC.violet }) +
  svgR(380, 300, 240, 100, { dash: true, fill: '#fff', stroke: TDC.slate, title: 'Hors du store', ts: 12, center: true, tc: '#334155', lines: ['PDF (Documents/Releves)', 'secrets.json (clé API)', 'sauvegardes, versions, rapports'] }));

const dFront = () => svgDoc(1000, 330,
  svgT(500, 30, 'Cycle de rendu : l’interface est redessinée à partir de l’état S', { size: 14, weight: 700, anchor: 'middle' }) +
  [['hashchange', ['ou clic sur le menu'], TDC.indigo], ['render()', ['détruit les graphiques,', 'repère le champ actif'], TDC.violet], ['PAGES[page](v)', ['la page construit', 'le DOM avec h()'], TDC.blue], ['Chart.js', ['graphiques créés', 'après insertion'], TDC.green], ['Focus restauré', ['data-fk + défilement', 'conservé'], TDC.amber]].map(([t, l, c], i) => svgR(18 + i * 196, 56, 170, 78, { stroke: c, sw: 2.5, title: t, center: true, tc: c, lines: l, ls: 10.5 }) + (i < 4 ? svgA(190 + i * 196, 95, 214 + i * 196, 95) : '')).join('') +
  svgR(18, 210, 220, 78, { stroke: TDC.pink, sw: 2.5, title: 'Action utilisateur', center: true, tc: '#be185d', lines: ['saisie, bouton, glisser-déposer'] }) + svgA(240, 249, 296, 249) +
  svgR(298, 210, 220, 78, { stroke: TDC.slate, sw: 2.5, title: 'api(path, méthode, corps)', center: true, tc: '#334155', lines: ['fetch JSON · erreurs → toast'] }) + svgA(520, 249, 576, 249) +
  svgR(578, 210, 220, 78, { stroke: TDC.green, sw: 2.5, title: 'S.data = réponse', center: true, tc: '#047857', lines: ['l’état serveur est la référence'] }) +
  svgP([[688, 208], [688, 170], [299, 170], [299, 136]], { c: TDC.violet, dash: true }) + svgT(400, 164, 'nouvelle exécution de render()', { size: 11, anchor: 'middle', fill: '#6d28d9', weight: 600 }) +
  svgR(820, 210, 160, 78, { dash: true, stroke: TDC.slate, title: 'localStorage', center: true, tc: '#334155', lines: ['thème, filtres,', 'options PDF'], ls: 10.5 }));

const dImmo = () => svgDoc(1000, 470,
  svgR(18, 20, 260, 420, { fill: '#fff', stroke: TDC.indigo, title: '📅 Événements datés', tc: TDC.indigo, lines: [] }) +
  [['appels de fonds', TDC.pink], ['frais annexes', TDC.amber], ['fonds supplémentaires (vente…)', TDC.green], ['épargne mensuelle', TDC.teal], ['quinzaines (calcul des intérêts)', TDC.blue], ['échéances mensuelles (prêts, relais)', TDC.violet], ['31/12 : intérêts d’épargne crédités', '#84cc16'], ['début / fin du prêt relais', TDC.red]].map(([t, c], i) => `<rect x="34" y="${56 + i * 48}" width="228" height="38" rx="8" fill="${c}22" stroke="${c}" stroke-width="1.5"/>` + svgT(46, 80 + i * 48, t, { size: 11, weight: 600, fill: '#334155' })).join('') +
  svgA(280, 230, 330, 230, { label: 'tri chrono.' }) +
  svgR(332, 20, 330, 420, { fill: '#fff', stroke: TDC.violet, title: '⚙️ immoSimulate() : ordre de financement', tc: '#6d28d9' }) +
  [['1  Épargne utilisable', 'solde − réserve de sécurité', TDC.green], ['2  Prêts (par priorité)', 'si la date de disponibilité est atteinte', TDC.indigo], ['3  Prêt relais', 'dans sa fenêtre, jusqu’au plafond', TDC.amber], ['4  Réserve de sécurité', 'dernier recours (alerte orange)', TDC.pink], ['5  Manque', 'alerte rouge : fonds insuffisants', TDC.red]].map(([t, l, c], i) => svgR(348, 56 + i * 72, 298, 60, { stroke: c, sw: 2, fill: c + '14', title: t, tc: '#1b1d3a', ts: 12.5, lines: [l] }) + (i < 4 ? svgA(497, 116 + i * 72, 497, 128 + i * 72, { w: 1.4 }) : '')).join('') +
  svgA(664, 230, 714, 230, { label: 'résultats' }) +
  svgR(716, 20, 266, 420, { fill: '#fff', stroke: TDC.green, title: '📊 Résultats', tc: '#047857', lines: ['rows : lignes du planning', 'snaps / series : épargne, prêts,', '   relais mois par mois (graphiques)', 'alerts : manques, réserve entamée,', '   relais non soldé…', 'summary : coûts, relais max, manque', 'verdict + score de santé', '', 'Épargne : intérêts par quinzaine', 'échue, crédités le 31/12', '', 'Dépendances de tâches : contraintes', 'avec marge, recalage des dates'], ls: 11 }));

const dSafe = () => svgDoc(1000, 470,
  svgR(18, 20, 470, 210, { fill: '#fff', stroke: TDC.amber, title: '💾 Sauvegardes (archives ZIP dans Sauvegardes/)', tc: '#b45309' }) +
  [['', 'Données', 'Programme', 'Rapports'], ['Sauvegarde « Données »', '✔', '', ''], ['Sauvegarde « Programme »', '', '✔', ''], ['Sauvegarde « Complète »', '✔', '✔', '✔']].map((r, i) => r.map((c, j) => svgT(j === 0 ? 34 : 250 + (j - 1) * 80, 70 + i * 28, c, { size: i === 0 ? 11 : 12, weight: i === 0 || j === 0 ? 700 : 400, fill: c === '✔' ? '#059669' : '#334155', anchor: j === 0 ? 'start' : 'middle' })).join('')).join('') +
  svgT(34, 188, 'Données = store.json + Documents/ · Programme = server.mjs, lib/, public/…', { size: 10.5, fill: '#64748b' }) + svgT(34, 206, 'Planification : un minuteur (60 s) crée la sauvegarde du dernier créneau manqué, puis purge.', { size: 10.5, fill: '#64748b' }) +
  svgR(512, 20, 470, 210, { fill: '#fff', stroke: TDC.indigo, title: '🏷️ Versions du programme (Versions/)', tc: TDC.indigo }) +
  [['mineur', '+0.0.1', TDC.green], ['intermédiaire', '+0.1.0', TDC.amber], ['majeur', '+1.0.0', TDC.red]].map(([t, v, c], i) => svgR(528 + i * 150, 56, 136, 52, { stroke: c, sw: 2, fill: c + '14', title: v, center: true, tc: c, ts: 15, lines: [t] })).join('') +
  svgT(528, 138, 'Publier : instantané ZIP du programme + manifest.json (notes, prompt, niveau)', { size: 11, fill: '#475569' }) + svgT(528, 156, '+ entrée dans CHANGELOG.md · journal des prompts lié à la version', { size: 11, fill: '#475569' }) +
  svgT(528, 182, 'Restaurer : sauvegarde « Programme » de sécurité, puis remplacement des fichiers', { size: 11, fill: '#475569' }) + svgT(528, 200, 'Renuméroter : changer le niveau d’une version recalcule les suivantes', { size: 11, fill: '#475569' }) +
  svgR(18, 256, 964, 196, { fill: '#fff', stroke: TDC.teal, title: '📋 Manifeste et intégrité', tc: '#0f766e' }) +
  svgR(40, 296, 190, 66, { stroke: TDC.slate, title: 'Fichiers du programme', center: true, ts: 12, lines: ['server.mjs, lib/, public/,', 'scripts/…'] }) + svgA(232, 329, 280, 329) +
  svgR(282, 296, 190, 66, { stroke: TDC.teal, title: 'SHA-256 par fichier', center: true, tc: '#0f766e', ts: 12, lines: ['empreinte + taille'] }) + svgA(474, 329, 522, 329) +
  svgR(524, 296, 190, 66, { stroke: TDC.teal, title: 'Empreinte globale', center: true, tc: '#0f766e', ts: 12, lines: ['SHA-256 de la liste'] }) + svgA(716, 329, 764, 329) +
  svgR(766, 296, 196, 66, { stroke: TDC.green, title: 'MANIFEST.json', center: true, tc: '#047857', ts: 12, lines: ['vérification : modifié,', 'supprimé, ajouté'] }) +
  svgT(40, 400, 'Le manifeste contient aussi l’identité, les fonctionnalités, la licence et les composants tiers (licences des dépendances).', { size: 11, fill: '#64748b' }) + svgT(40, 420, 'Il permet de prouver qu’aucun fichier n’a été altéré depuis sa génération.', { size: 11, fill: '#64748b' }));

const dPdf = () => svgDoc(1000, 360,
  [['🧮 Navigateur', ['calcule les chiffres', '(mêmes règles que l’écran)'], TDC.indigo], ['🧾 Spécification JSON', ['title, subtitle, layout,', 'size, charts, blocks[]'], TDC.violet], ['📨 POST /api/reports', ['options : portrait / paysage,', 'A4 / A3, avec / sans graphiques'], TDC.blue], ['🖨️ renderReport()', ['pdfkit : mise en page,', 'pagination, pied de page'], TDC.green], ['📄 Rapports/*.pdf', ['+ index.json (titre,', 'format) · ouverture'], TDC.amber]].map(([t, l, c], i) => svgR(18 + i * 196, 56, 172, 90, { stroke: c, sw: 2.5, title: t, center: true, tc: c, ts: 12.5, lines: l, ls: 10.5 }) + (i < 4 ? svgA(192 + i * 196, 100, 212 + i * 196, 100) : '')).join('') +
  svgT(500, 32, 'De la page affichée au fichier PDF', { size: 14, weight: 700, anchor: 'middle' }) +
  svgT(500, 190, 'Blocs disponibles dans la spécification', { size: 12.5, weight: 700, anchor: 'middle', fill: '#475569' }) +
  (() => { const items = ['kpis', 'h1 · h2 · h3', 'p · text', 'table (multi-lignes, drapeaux)', 'hbars · vbars (empilées)', 'gantt (flèches)', 'image (PNG / JPEG)', 'callout · vigil', 'pagebreak'], cols = [TDC.pink, TDC.indigo, TDC.blue, TDC.green, TDC.amber, TDC.violet, TDC.teal, TDC.red, TDC.slate]; let x = 20, y = 208; return items.map((t, i) => { const w = 28 + t.length * 6.6; if (x + w > 980) { x = 20; y += 40; } const o = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="30" rx="15" fill="' + cols[i] + '22" stroke="' + cols[i] + '"/>' + svgT(x + w / 2, y + 20, t, { size: 11, weight: 600, anchor: 'middle', fill: '#334155' }); x += w + 10; return o; }).join(''); })() +
  svgR(20, 308, 960, 36, { r: 8, dash: true, stroke: TDC.slate, fill: '#fff', title: 'Table des matières : deux passes (la 1re mesure les numéros de page, la 2e les imprime) · en-tête dégradé, pied de page numéroté', ts: 11, tc: '#475569' }));

const dDeploy = () => svgDoc(1000, 430,
  svgR(18, 20, 462, 390, { fill: '#fff', stroke: TDC.indigo, title: '🧑‍💻 Mode développement', tc: TDC.indigo }) +
  svgR(36, 60, 426, 78, { stroke: TDC.slate, title: 'C:\\DVP\\Comptes  (ROOT = HOME)', ts: 12, lines: ['programme + données dans le même dossier', 'node server.mjs  ou  Comptes.bat'] }) +
  svgR(36, 150, 426, 78, { stroke: TDC.slate, title: 'Fichier .env (facultatif)', ts: 12, lines: ['COMPTES_PORT · COMPTES_HOME · COMPTES_AI_KEY', 'ne remplace jamais une variable déjà définie'] }) +
  svgR(36, 240, 426, 78, { stroke: TDC.slate, title: 'GitHub (dépôt privé)', ts: 12, lines: ['code seul : data/, Documents/, Sauvegardes/,', 'Rapports/, Versions/, .env ne sont pas poussés'] }) +
  svgR(36, 330, 426, 62, { dash: true, stroke: TDC.slate, title: 'Versions et journal', ts: 12, lines: ['CHANGELOG.md · Versions/ · journal des prompts'] }) +
  svgR(520, 20, 462, 390, { fill: '#fff', stroke: TDC.green, title: '🪟 Version installée (fichier MSI)', tc: '#047857' }) +
  svgR(538, 60, 426, 78, { stroke: TDC.green, title: 'Programme : %LOCALAPPDATA%\\Programs\\Comptes', ts: 11.5, lines: ['server.mjs, lib/, public/, node_modules,', 'runtime\\node.exe (Node.js embarqué)'] }) +
  svgR(538, 150, 426, 78, { stroke: TDC.amber, title: 'Données : Documents\\Comptes  (COMPTES_HOME)', ts: 11.5, lines: ['data/, Releves/, Sauvegardes/, Rapports/,', 'Versions/, serveur.log, serveur-erreurs.log'] }) +
  svgR(538, 240, 426, 78, { stroke: TDC.violet, title: 'Lanceur Comptes.ps1', ts: 12, lines: ['démarre node.exe si besoin, attend /api/ping,', 'ouvre le navigateur (option -Stop pour arrêter)'] }) +
  svgR(538, 330, 426, 62, { dash: true, stroke: TDC.slate, title: 'Raccourcis : menu Démarrer + Bureau', ts: 12, lines: ['installation par utilisateur, sans droits administrateur'] }) +
  svgA(500, 190, 520, 190, { dash: true }));

const dAI = () => svgDoc(1000, 380,
  svgR(18, 20, 640, 340, { fill: '#ecfdf5', stroke: TDC.green, dash: true, title: '🏠 Votre ordinateur', tc: '#047857' }) +
  [['📊 Données', ['opérations, projet VEFA'], TDC.indigo], ['🧮 Agrégation', ['totaux par catégorie / mois,', 'chiffres du projet'], TDC.violet], ['👁️ Aperçu', ['contenu exact', 'qui sera envoyé'], TDC.blue], ['✅ Consentement', ['case à cocher', '(sauf modèle local)'], TDC.amber]].map(([t, l, c], i) => svgR(34 + i * 156, 70, 138, 90, { stroke: c, sw: 2.5, fill: '#fff', title: t, center: true, tc: c, ts: 12, lines: l, ls: 10.5 }) + (i < 3 ? svgA(174 + i * 156, 115, 188 + i * 156, 115) : '')).join('') +
  svgR(34, 214, 300, 120, { fill: '#fff', stroke: TDC.green, sw: 2.5, title: '🦙 Modèle local (Ollama, LM Studio)', tc: '#047857', ts: 12, lines: ['les données ne quittent pas le PC', 'fenêtre de contexte adaptée à la taille', 'du prompt · attente jusqu’à 30 min', '(modèle lent sur processeur)'], ls: 10.5 }) +
  svgR(352, 214, 290, 120, { fill: '#fff', stroke: TDC.slate, sw: 2, title: '📥 Réponse', tc: '#334155', ts: 12, lines: ['texte Markdown affiché en sections', 'copie · export PDF · historique', '(store.analyses) · journal des prompts'], ls: 10.5 }) +
  svgA(571, 162, 340, 214, { c: TDC.green }) + svgA(334, 274, 350, 274) + svgA(720, 300, 644, 290, { dash: true, c: TDC.pink, label: 'réponse', lc: '#be185d' }) +
  svgA(660, 115, 718, 115, { c: TDC.pink, dash: true, label: 'HTTPS', lc: '#be185d' }) +
  svgR(720, 20, 262, 340, { fill: '#fdf2f8', stroke: TDC.pink, dash: true, title: '☁️ Internet (facultatif)', tc: '#be185d', lines: ['Google Gemini · Groq · OpenRouter', 'Mistral · Cerebras · GitHub Models', 'Hugging Face · Anthropic · OpenAI', '', 'clé API : data/secrets.json', '(jamais dans les sauvegardes,', 'ni dans les modèles, ni sur GitHub)', '', 'sans IA : analyse locale rapide', '(statistiques calculées sur place)'], ls: 11 }));

// ---------- éléments de page
const tdText = (...k) => h('p', {}, ...k);
const tdList = (...items) => h('ul', {}, items.map(i => h('li', {}, ...(Array.isArray(i) ? i : [i]))));
const tdB = t => h('b', {}, t);
const tdCode = t => h('span', { class: 'kbd' }, t);
const tdSub = t => h('h4', {}, t);
const diagram = (svg, caption) => { const el = h('figure', { class: 'diagram', html: '' }); el.innerHTML = `<div class="dsvg">${svg}</div><figcaption>📐 ${sx(caption)}</figcaption>`; el.dataset.svg = svg; el.dataset.cap = caption; return el; };
const tdCards = items => { const el = h('div', { class: 'tdcards' }, items.map(([ico, t, d, c]) => h('div', { class: 'tdcard', style: { '--tc': c } }, h('div', { class: 'tci' }, ico), h('b', {}, t), h('span', { class: 'muted' }, d)))); el._pdf = () => items.flatMap(([ico, t, d]) => [{ t: 'h3', text: t }, { t: 'p', text: d }]); return el; };
const fmtN = n => n.toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const tdTiles = items => { const el = h('div', { class: 'tiles tdtiles' }, items.map(([ico, l, v, s, c]) => tile(ico, l, v, s, c))); el._pdf = () => [{ t: 'kpis', items: items.map(([, l, v, s, c]) => ({ label: l, value: String(v), sub: s || '', color: c })) }]; return el; };
const tdBars = (rows, color) => { const max = Math.max(1, ...rows.map(r => r.value)); const el = h('div', { class: 'tdbars' }, rows.map(r => h('div', { class: 'tdbar' }, h('span', { class: 'tbl' }, r.label, r.sub ? h('small', {}, r.sub) : null), h('span', { class: 'tbt' }, h('i', { style: { width: Math.max(2, r.value / max * 100) + '%', background: r.color ?? color } })), h('span', { class: 'tbv' }, r.text ?? fmtN(r.value))))); el._pdf = () => [{ t: 'hbars', items: rows.map(r => ({ label: r.label, value: r.value, text: r.text ?? fmtN(r.value), color: r.color ?? color })) }]; return el; };
const tdTable = (cols, rows) => { const el = h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c[0])))), h('tbody', {}, rows.map(r => h('tr', {}, r.map((c, i) => h('td', { class: cols[i][2] ?? '' }, c))))))); el._pdf = () => [{ t: 'table', fontSize: 8, columns: cols.map(c => ({ title: c[0], w: c[1] ?? 1 })), rows: rows.map(r => ({ cells: r.map(c => typeof c === 'string' || typeof c === 'number' ? String(c) : (c.textContent ?? '')) })) }]; return el; };
const hsize = n => n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(1).replace('.', ',') + ' Ko' : (n / 1048576).toFixed(1).replace('.', ',') + ' Mo';
const METH_COL = { GET: TDC.green, POST: TDC.blue, PUT: TDC.amber, DELETE: TDC.red };

async function svgToPng(svg, width = 2000) {
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/), w = +m[1], hh = +m[2], img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas'); c.width = width; c.height = Math.round(width * hh / w); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
  return c.toDataURL('image/png');
}

// ---------- page
async function pageTechDocs(v) {
  v.append(h('div', { class: 'loading' }, 'Analyse des sources…'));
  let T; try { T = await (await fetch('/api/techinfo')).json(); } catch { T = null; }
  v.innerHTML = ''; if (S.page !== 'techdocs') return;
  T ??= { version: S.data.version, node: '?', platform: '?', dependencies: {}, files: [], routes: [], totals: { files: 0, lines: 0, server: 0, front: 0, installer: 0, routes: 0 }, storeKeys: [] };
  const tt = T.totals, deps = Object.keys(T.dependencies);

  const SECTIONS = [
    ['overview', '🧭', 'Vue d’ensemble', () => [
      tdText('Comptes est une application ', tdB('locale'), ' : un petit serveur Node.js (sans framework) sert une interface web et lit vos relevés PDF. Les chiffres ci-dessous sont ', tdB('calculés à l’instant'), ' à partir des sources installées.'),
      tdTiles([['🏷️', 'Version', 'v' + T.version, 'Node ' + T.node, TDC.indigo], ['📁', 'Fichiers de code', fmtN(tt.files), 'serveur, interface, outils', TDC.blue], ['🧮', 'Lignes de code', fmtN(tt.lines), `${fmtN(tt.server)} serveur · ${fmtN(tt.front)} interface`, TDC.violet], ['🔌', 'Routes API', fmtN(tt.routes), 'JSON sur HTTP local', TDC.green], ['📦', 'Dépendances', String(deps.length), deps.join(' · '), TDC.amber]]),
      tdSub('Principes de conception'),
      tdCards([['🏠', 'Local d’abord', 'Aucune donnée ne quitte l’ordinateur sans action explicite. Le serveur n’écoute que sur 127.0.0.1.', TDC.green], ['🧱', 'Zéro framework', 'JavaScript natif côté serveur (modules ES) et côté navigateur (fonction h() pour créer le HTML).', TDC.indigo], ['🗄️', 'Un seul fichier de données', 'Le paramétrage tient dans data/store.json : simple à sauvegarder, à lire et à restaurer.', TDC.amber], ['🔌', 'Modules « setup »', 'Chaque domaine expose une fonction setupXxx() qui retourne un gestionnaire de routes : on ajoute une fonction sans toucher au reste.', TDC.violet], ['🔒', 'Confidentialité par défaut', 'Clé API hors sauvegardes, données agrégées pour l’IA, aperçu avant envoi, consentement.', TDC.pink], ['📦', 'Livraison simple', 'Un fichier MSI installe Node.js embarqué + le programme, sans droits administrateur.', TDC.teal]]),
      tdSub('Pile technique'),
      tdList([tdB('Serveur'), ' : Node.js ≥ 22, modules ES, http natif, fs, zlib, crypto — ZIP et rendu des routes écrits à la main.'], [tdB('Lecture des PDF'), ' : pdfjs-dist (texte et coordonnées x/y) ; ', tdB('génération des PDF'), ' : pdfkit.'], [tdB('Interface'), ' : HTML + CSS + JavaScript global, Chart.js pour les graphiques, SVG pour les schémas.'], [tdB('Installation'), ' : PowerShell + API Windows Installer (MSI par utilisateur) ; ', tdB('suivi'), ' : Git / GitHub, versions et journal intégrés.']),
    ]],
    ['arch', '🏛️', 'Architecture générale', () => [
      tdText('L’application suit une architecture ', tdB('client léger / serveur local / fichiers'), ' : le navigateur affiche et interagit, le serveur calcule et écrit, les fichiers sont la seule mémoire durable.'),
      diagram(dArch(), 'Architecture : navigateur, serveur Node.js, fichiers locaux et services d’IA facultatifs'),
      tdList([tdB('Navigateur'), ' : il charge une seule page (index.html) puis une série de scripts globaux ; aucune étape de compilation.'], [tdB('Serveur'), ' : un routeur par domaine (extra, features, manual) essaie la requête tour à tour ; le premier qui la reconnaît répond.'], [tdB('Fichiers'), ' : les relevés PDF sont la source de vérité des opérations bancaires ; store.json contient tout ce que vous paramétrez.'], [tdB('Externe'), ' : uniquement l’IA, uniquement si vous la configurez.']),
    ]],
    ['flow', '🔄', 'Fonctionnement : du démarrage à l’affichage', () => [
      tdText('Au démarrage, le serveur lit store.json puis ', tdB('analyse tous les relevés PDF'), ' (quelques secondes) et garde le résultat en mémoire. Ensuite chaque requête ne fait que combiner cet état avec vos paramètres.'),
      diagram(dFlow(), 'Séquence : démarrage, chargement de la page, état, action de l’utilisateur'),
      tdList([tdB('Chargement'), ' : /api/state renvoie tout ce qu’il faut pour dessiner l’interface (opérations catégorisées, comptes, catégories, règles, menus, licence).'], [tdB('Modification'), ' : toute action est un appel PUT / POST / DELETE ; le serveur écrit store.json puis renvoie le nouvel état, que l’interface adopte et redessine.'], [tdB('Réimport'), ' : ajout, suppression ou restauration d’un relevé relance l’analyse des PDF.']),
    ]],
    ['import', '📥', 'Lecture et enrichissement des relevés PDF', () => [
      diagram(dImport(), 'Du fichier PDF à l’opération catégorisée'),
      tdList([tdB('Extraction'), ' : pdfjs-dist fournit chaque mot avec ses coordonnées ; l’analyse retrouve les colonnes (date, libellé, débit, crédit) à partir des positions, pas du texte brut.'], [tdB('Contrôles'), ' : le total des débits, le total des crédits et les soldes d’ouverture / clôture sont recalculés et comparés à ceux du relevé (✅ / 🟠).'], [tdB('Virements internes'), ' : les titulaires sont lus dans l’en-tête des relevés (lib/holders.mjs) ; un virement vers un titulaire ou un compte connu est classé « virement interne » et exclu des totaux.'], [tdB('Catégorisation'), ' : la première règle qui correspond (motif, sens débit / crédit) gagne ; une correction manuelle (overrides) l’emporte toujours.']),
    ]],
    ['data', '🗄️', 'Stockage et modèle de données', () => [
      diagram(dStore(), 'Contenu de data/store.json et fichiers situés hors du store'),
      tdText('Taille actuelle de chaque clé du fichier de données (calculée à l’instant) :'),
      T.storeKeys.length ? tdBars(T.storeKeys.slice(0, 12).map(k => ({ label: k.key, value: k.bytes, text: hsize(k.bytes) })), TDC.indigo) : tdText('(non disponible)'),
      tdList([tdB('Écriture'), ' : le fichier est réécrit en entier de façon synchrone à chaque modification (usage mono-utilisateur).'], [tdB('Structure souple'), ' : chaque module crée ses clés à la première utilisation (??=), ce qui évite toute migration lors d’une mise à jour.'], [tdB('Sauvegarde'), ' : store.json + Documents/ forment la sauvegarde « données » ; secrets.json en est exclu.']),
    ]],
    ['code', '📚', 'Organisation du code', () => {
      const byDir = g => T.files.filter(f => f.group === g).sort((a, b) => b.lines - a.lines);
      const rowsOf = g => byDir(g).map(f => [f.path, f.role || '–', String(f.lines)]);
      const top = [...T.files].sort((a, b) => b.lines - a.lines).slice(0, 12).map(f => ({ label: f.path.replace(/^(lib|public|scripts|installer)\//, ''), sub: f.group, value: f.lines, color: { lib: TDC.green, server: TDC.green, scripts: TDC.green, public: TDC.indigo, installer: TDC.amber }[f.group] }));
      return [
        tdText('Le code se répartit en quatre dossiers. Les barres montrent les fichiers les plus volumineux (lignes).'),
        tdTiles([['⚙️', 'Serveur', fmtN(tt.server), 'server.mjs · lib/ · scripts/', TDC.green], ['🖥️', 'Interface', fmtN(tt.front), 'public/', TDC.indigo], ['🪟', 'Installeur', fmtN(tt.installer), 'installer/', TDC.amber]]),
        tdBars(top, TDC.indigo),
        ...['server', 'lib', 'scripts', 'public', 'installer'].filter(g => byDir(g).length).flatMap(g => [tdSub({ server: 'Racine', lib: 'lib/ — services du serveur', scripts: 'scripts/ — outils', public: 'public/ — interface', installer: 'installer/ — MSI' }[g]), tdTable([['Fichier', 2.4], ['Rôle', 6], ['Lignes', 0.9, 'r']], rowsOf(g))]),
      ];
    }],
    ['front', '🖥️', 'Interface (front-end)', () => [
      diagram(dFront(), 'Cycle de rendu de l’interface'),
      tdList([tdB('h(tag, attrs, …enfants)'), ' : crée un élément du DOM (classes, style, événements, valeur) ; toute l’interface est construite avec cette seule fonction.'], [tdB('render()'), ' : routeur par hash (#/page). Il détruit les graphiques, redessine la page entière et restaure le champ actif (attribut data-fk) et le défilement : la saisie reste fluide.'], [tdB('Menus dynamiques'), ' : NAV_GROUPS décrit les menus de base ; navModel() y applique libellés, icônes, ordre, déplacements et groupes créés par l’utilisateur (settings.menu).'], [tdB('Saisie dans les tableaux'), ' : l’enregistrement est immédiat mais le recalcul attend la sortie de la ligne (classe « editing »), pour pouvoir remplir une ligne sans que l’écran bouge.'], [tdB('Thèmes'), ' : variables CSS (--primary, --card…) ; les schémas utilisent des couleurs fixes pour rester lisibles dans les deux thèmes.']),
    ]],
    ['api', '🔌', 'API HTTP', () => {
      const dom = new Map(); for (const r of T.routes) { const k = r.path.split('/')[2] ?? ''; (dom.get(k) ?? dom.set(k, []).get(k)).push(r); }
      const el = h('div', { class: 'tdapi' }, [...dom].map(([k, list]) => h('div', { class: 'tdapid' }, h('div', { class: 'tdapih' }, '/api/' + k, h('small', {}, list.length + ' route(s)')), list.map(r => h('div', { class: 'tdroute' }, h('span', { class: 'meths' }, (r.methods.length ? r.methods : ['·']).map(m => h('i', { style: { background: METH_COL[m] ?? TDC.slate } }, m))), h('code', {}, r.path), h('small', {}, r.file))))));
      el._pdf = () => [{ t: 'table', fontSize: 7.5, columns: [{ title: 'Méthodes', w: 1.3 }, { title: 'Chemin', w: 4 }, { title: 'Fichier', w: 2 }], rows: T.routes.map(r => ({ cells: [r.methods.join(' · ') || '–', r.path, r.file] })) }];
      return [tdText(tdB(fmtN(tt.routes) + ' routes'), ' (extraites des sources) : JSON dans les deux sens, erreurs sous la forme ', tdCode('{ "error": "…" }'), '. Les corps de requête sont limités à 5 Mo (30 Mo pour un PDF, 500 Mo pour l’import d’une sauvegarde).'), el];
    }],
    ['immo', '🏗️', 'Moteur de simulation immobilière (VEFA)', () => [
      diagram(dImmo(), 'immoSimulate() : événements datés, ordre de financement, résultats'),
      tdList([tdB('Pur et testable'), ' : immo-engine.js ne touche ni au DOM ni au réseau ; il reçoit le projet (et un scénario « et si ») et retourne planning, courbes, alertes et synthèse.'], [tdB('Intérêts de l’épargne'), ' : base = solde le plus bas de chaque quinzaine (un versement ne compte qu’à la quinzaine suivante, un retrait tout de suite) ; cumul crédité une fois par an, le 31 décembre.'], [tdB('Prêt relais'), ' : utilisé seulement si l’épargne et les prêts ne suffisent pas, dans sa fenêtre de dates et dans la limite de son plafond ; une vente cochée « rembourse le relais » le solde.'], [tdB('Tâches'), ' : chaque action a une échéance, une durée et des dépendances (« après » / « avant » + délai) ; les contraintes ont une marge en jours et un recalage automatique propose les nouvelles dates.']),
    ]],
    ['admin', '🛡️', 'Sauvegardes, versions et manifeste', () => [
      diagram(dSafe(), 'Sauvegardes, versions du programme et manifeste d’intégrité'),
      tdList([tdB('ZIP maison'), ' : lib/zip.mjs écrit et lit les archives (deflate, CRC32) sans dépendance ; les sauvegardes et versions sont de simples ZIP ouvrables partout.'], [tdB('Sécurité des opérations'), ' : une restauration crée d’abord une sauvegarde de sécurité ; une version restaurée remplace les fichiers du programme, jamais vos données.'], [tdB('Heure'), ' : la planification utilise l’heure locale du serveur ; si l’ordinateur était éteint, la sauvegarde manquée est rattrapée au démarrage suivant.']),
    ]],
    ['pdf', '🖨️', 'Génération des PDF', () => [
      diagram(dPdf(), 'Du calcul dans le navigateur au fichier PDF'),
      tdList([tdB('Principe'), ' : le navigateur décrit le document (blocs JSON), le serveur le met en page. Un nouveau type de rapport = une fonction qui retourne une liste de blocs.'], [tdB('Options'), ' : une fenêtre propose orientation, format (A4 / A3) et graphiques ; le serveur retire les graphiques si demandé.'], [tdB('Lisibilité'), ' : lignes de tableau multi-lignes, titres gardés avec leur contenu, drapeaux de couleur, encadrés « points de vigilance ».'], [tdB('Schémas'), ' : un SVG est converti en PNG par le navigateur puis inséré comme image (c’est ainsi que cette documentation s’exporte).']),
    ]],
    ['ai', '🧠', 'Intelligence artificielle', () => [
      diagram(dAI(), 'Chemin des données vers l’IA : agrégation, aperçu, consentement, fournisseur'),
      tdList([tdB('Fournisseurs'), ' : trois protocoles (Anthropic, compatible OpenAI, Ollama) ; des préréglages gratuits (Gemini, Groq, OpenRouter, Mistral, Cerebras, GitHub Models, Hugging Face, LM Studio, Ollama).'], [tdB('Minimisation'), ' : seules des données agrégées sont envoyées (pas d’IBAN, pas de libellés détaillés, pas de noms) ; l’aperçu montre le message exact.'], [tdB('Traçabilité'), ' : chaque envoi est consigné dans le journal des prompts (source « ia », statut envoyé ou erreur).']),
    ]],
    ['deploy', '🪟', 'Installation et déploiement', () => [
      diagram(dDeploy(), 'Mode développement et version installée'),
      tdSub('Variables d’environnement'),
      tdTable([['Variable', 2], ['Rôle', 6]], [['COMPTES_PORT (ou PORT)', 'Port du serveur (3210 par défaut).'], ['COMPTES_HOME', 'Dossier des données (Documents\\Comptes dans la version installée) ; le programme reste en lecture seule.'], ['COMPTES_AI_KEY', 'Clé d’API de l’IA (alternative à data/secrets.json).']]),
      tdList([tdB('MSI'), ' : construit par installer/build-msi.ps1 avec l’API COM Windows Installer et makecab (aucun outil tiers) ; installation par utilisateur, mise à niveau par numéro de version.'], [tdB('Démarrage'), ' : Comptes.ps1 lance node.exe puis ouvre le navigateur ; /api/ping sert de test de disponibilité et /api/shutdown à l’arrêt propre.']),
    ]],
    ['secu', '🔒', 'Sécurité et confidentialité', () => [
      tdCards([['🌐', 'Réseau', 'Le serveur écoute 127.0.0.1 uniquement : il n’est pas joignable depuis un autre ordinateur. Il n’a pas d’authentification : ne l’exposez pas.', TDC.green], ['🔑', 'Secrets', 'La clé d’API est dans data/secrets.json, exclu des sauvegardes, des modèles et du dépôt Git.', TDC.amber], ['🧾', 'Données bancaires', 'Les relevés ne sont jamais envoyés : seules des agrégats peuvent l’être, après aperçu et consentement.', TDC.pink], ['🛡️', 'Fichiers', 'Noms de fichiers validés (liste blanche de caractères), chemins contraints à leur dossier, limites de taille sur chaque envoi.', TDC.indigo], ['✍️', 'Intégrité', 'Manifeste SHA-256 : détecte tout fichier du programme modifié, supprimé ou ajouté.', TDC.teal], ['📜', 'Licence', 'Copyright et contrat d’utilisation avec acceptation tracée (nom, date, version du texte).', TDC.violet]]),
    ]],
    ['conv', '🧰', 'Conventions et extension', () => [
      tdSub('Ajouter une page'),
      tdList(['Créer public/mapage.js avec une fonction pageMaPage(v) qui remplit l’élément v (helpers : h, api, toast, modal, chart, kpi…).', 'Ajouter le script dans index.html, la page dans PAGES (app.js) et l’entrée dans NAV_GROUPS (menus.js).', 'Côté serveur, ajouter les routes dans un module setupXxx() et l’appeler depuis server.mjs.', 'Compléter la documentation (docs.js) : le plan suit automatiquement l’ordre des menus.']),
      tdSub('Suivi des évolutions'),
      tdList(['Chaque demande est consignée dans le journal des prompts, puis rattachée à la version publiée.', 'Les versions se publient depuis Administration › Versions (mineur, intermédiaire, majeur) ; CHANGELOG.md est mis à jour automatiquement.', 'Le fichier MSI se reconstruit avec installer/build-msi.ps1 ; le manifeste se régénère depuis Administration › Manifeste.']),
      tdSub('Modèle réutilisable'),
      tdText('Le dossier C:\\DVP\\Modeles contient une application minimale reprenant le menu Administration (sauvegardes, versions, prompt, licence, manifeste, modèle, menus) pour d’autres projets.'),
    ]],
  ];

  const built = SECTIONS.map(([id, ico, title, fn]) => ({ id, ico, title, nodes: fn() }));
  const go = id => e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const toc = h('nav', { class: 'doctoc card' }, h('b', { style: { display: 'block', marginBottom: '8px' } }, 'Sommaire'), built.map((s, i) => h('a', { class: 'toc2', href: '#/techdocs', onclick: go('td-' + s.id) }, `${i + 1}. ${s.ico} ${s.title}`)));
  const body = h('div', { class: 'docbody' },
    h('div', { class: 'card dochero' }, h('div', { style: { fontSize: '40px' } }, '🛠️'), h('div', {}, h('h2', { style: { fontSize: '22px', margin: '0 0 4px' } }, 'Documentation technique'), h('div', { class: 'muted' }, 'Infrastructure, architecture et principes de fonctionnement de Comptes, avec schémas et infographies.'), h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, `Version ${T.version} · données calculées à partir des sources installées`)), h('div', { style: { marginLeft: 'auto' } }, pdfBtn('📄 Exporter en PDF', () => exportTechDocsPdf(built, T)))),
    built.map((s, i) => h('section', { class: 'card doc', id: 'td-' + s.id, 'data-title': s.title }, h('h3', {}, h('span', { class: 'num' }, i + 1), `${s.ico} ${s.title}`), ...s.nodes)));
  v.append(h('div', { class: 'doclayout' }, toc, body));
}

async function exportTechDocsPdf(built, T) {
  const blocks = [];
  for (const [i, s] of built.entries()) {
    blocks.push({ t: 'h2', tocLevel: 1, text: `${i + 1}. ${s.title}` });
    for (const el of s.nodes) {
      if (el._pdf) { blocks.push(...el._pdf()); continue; }
      if (el.classList?.contains('diagram')) { blocks.push({ t: 'image', data: await svgToPng(el.dataset.svg), caption: el.dataset.cap, scale: 1 }); continue; }
      const tag = el.tagName;
      if (tag === 'H4') blocks.push({ t: 'h3', text: el.textContent.trim() });
      else if (tag === 'P') blocks.push({ t: 'p', text: el.textContent.trim() });
      else if (tag === 'UL' || tag === 'OL') [...el.children].forEach(li => blocks.push({ t: 'p', text: '•  ' + li.textContent.trim(), indent: 12 }));
    }
  }
  return generateReport({ title: 'Documentation technique', file: 'documentation-technique', toc: true, subtitle: `${S.data.license?.product ?? 'Comptes'} · version ${T.version}`, blocks });
}
