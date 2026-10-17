'use strict';
// ============ Administration : base de données SQLite ============
let dbSel = null; // table affichée
const dbBytes = n => (n < 1024 ? n + ' o' : n < 1048576 ? (n / 1024).toFixed(1).replace('.', ',') + ' Ko' : (n / 1048576).toFixed(2).replace('.', ',') + ' Mo');
const DB_ROLES = {
  db_history: 'Mesures quotidiennes de la taille de la base (alimentent la prévision de volume)',
  categories: 'Catégories de dépenses et de revenus', rules: 'Règles de catégorisation automatique', overrides: 'Corrections manuelles de catégorie par opération', manual_accounts: 'Comptes saisis à la main',
  manual_ops: 'Opérations saisies à la main', prompt_journal: 'Journal des prompts et des demandes', analyses: 'Analyses (IA ou locales) enregistrées', biens: 'Biens immobiliers (fiche, charges, appels de fonds, travaux, estimations…)',
  immo_project: 'Projet d’achat VEFA (paramètres, financements, planning)', immo_actions: 'Actions du plan d’actions (phases, dates, dépendances, conditions)', config: 'Réglages : IA, licence, prévisions, alias de comptes, modèles de prompts…', meta: 'Version du schéma, dates, origine des données',
};

async function pageDb(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  let st; try { st = await (await apiFetch('/api/db/status')).json(); } catch (e) { st = { error: String(e.message || e) }; }
  if (S.page !== 'db') return; v.innerHTML = '';
  if (st.error && !st.tables) { v.append(h('div', { class: 'card' }, h('div', { class: 'tip warn' }, '⚠️ Base de données indisponible : ', st.error, '. Les données sont conservées dans data/store.json.'), h('a', { class: 'btn', href: apiUrl('/api/db/export'), style: { marginTop: '10px' } }, '⬇️ Exporter les données (JSON)'))); return; }
  const rows = sum(st.tables.map(t => t.rows)), fdt = d => (d ? new Date(d).toLocaleString('fr-FR') : '—');
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Moteur', st.engine, 'module intégré à Node (node:sqlite), sans installation', '🗄️'),
    kpi('k2', 'Taille', dbBytes(st.size), `${st.tables.length} tables · ${rows.toLocaleString('fr-FR')} lignes`, '💾'),
    kpi('k4', 'Dernière écriture', fdt(st.updated).slice(0, 16), `création ${fdt(st.created).slice(0, 10)} · schéma v${st.schema}`, '🕒'),
    kpi(st.error ? 'k1' : 'k2', 'État', st.error ? 'Repli JSON' : 'Opérationnelle', st.error ? st.error : (st.migratedFrom ? 'migrée depuis ' + st.migratedFrom.split(' · ')[0] : 'écriture transactionnelle'), st.error ? '⚠️' : '✅')));

  try { dbVolumeSection(v, await (await apiFetch('/api/db/volumes')).json()); } catch (e) { v.append(h('div', { class: 'tip warn', style: { marginTop: '14px' } }, '⚠️ Volumes indisponibles : ', String(e.message || e))); }
  if (S.page !== 'db') return;
  const out = h('div', { class: 'muted', style: { margin: '8px 0 0', fontSize: '13px' } });
  const act = (label, fn, cls = 'sec') => h('button', { class: 'btn sm ' + cls, onclick: async e => { e.target.disabled = true; try { await fn(); } catch (er) { out.textContent = '⚠️ ' + er.message; } e.target.disabled = false; } }, label);
  const post = async url => { const r = await apiFetch(url, { method: 'POST' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; };
  v.append(h('div', { class: 'card ccard', style: { '--ac': '#6366f1' } }, h('h2', {}, '🛠️ Outils', h('small', {}, 'contrôle, entretien, export')),
    h('div', { class: 'toolbar', style: { margin: 0 } },
      act('🔍 Contrôler l’intégrité', async () => { const j = await post('/api/db/check'); out.textContent = j.ok ? '✅ Intégrité vérifiée : la base est saine (' + fdt(j.at) + ').' : '❌ Anomalies : ' + j.result.join(' ; '); }),
      act('🧹 Optimiser (compacter)', async () => { const j = await post('/api/db/vacuum'); out.textContent = `✅ Fichier compacté : ${dbBytes(j.before)} → ${dbBytes(j.after)}.`; }),
      act('♻️ Réécrire depuis la mémoire', async () => { if (!confirm('Réécrire toutes les tables avec les données actuellement en mémoire de l’application ?')) return; const j = await post('/api/db/resync'); out.textContent = '✅ ' + j.written.length + ' section(s) réécrite(s) : ' + j.written.join(', ') + '.'; }),
      h('a', { class: 'btn sm sec', href: apiUrl('/api/db/file'), title: 'Copie cohérente du fichier SQLite (ouvrable avec DB Browser for SQLite)' }, '⬇️ Télécharger la base (.db)'),
      h('a', { class: 'btn sm sec', href: apiUrl('/api/db/export') }, '⬇️ Exporter en JSON')),
    out,
    h('p', { class: 'muted', style: { margin: '10px 0 0', fontSize: '12.5px' } }, 'Fichier : ', h('code', {}, st.file), st.mirror ? [' · copie lisible : ', h('code', {}, 'data/store.json'), ' (' + dbBytes(st.mirror.size) + ', ' + fdt(st.mirror.at) + ') utilisée par les sauvegardes'] : null)));

  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, 'Tables', h('small', {}, 'cliquer sur une table pour afficher son contenu (lecture seule)')),
    h('div', { class: 'tablewrap' }, h('table', {}, th('Table', 'Contenu', ['Lignes', 'r'], 'Colonnes'),
      h('tbody', {}, st.tables.map(t => h('tr', { class: dbSel === t.name ? 'rowcalled' : '', style: { cursor: 'pointer' }, onclick: () => { dbSel = t.name; render(); } },
        h('td', {}, h('b', {}, t.name)), h('td', { class: 'muted' }, DB_ROLES[t.name] ?? ''), h('td', { class: 'r num' }, String(t.rows)), h('td', { class: 'muted', style: { fontSize: '12px' } }, t.columns.join(', ')))))))));

  if (dbSel) {
    const d = await (await apiFetch('/api/db/table?name=' + encodeURIComponent(dbSel) + '&limit=300')).json(); if (S.page !== 'db') return;
    v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '📋 ' + dbSel, h('small', {}, `${d.total} ligne(s)${d.total > 300 ? ' · 300 premières affichées' : ''}`)),
      d.rows.length ? h('div', { class: 'tablewrap', style: { maxHeight: '480px' } }, h('table', {}, th(...d.columns), h('tbody', {}, d.rows.map(r => h('tr', {}, d.columns.map(c => h('td', { style: { fontSize: '12.5px', maxWidth: '360px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: String(r[c] ?? '') }, r[c] == null ? '' : String(r[c])))))))) : h('div', { class: 'empty' }, 'Table vide.')));
  }
  v.append(h('div', { class: 'tip', style: { marginTop: '18px' } }, '🗄️ Les données sont écrites dans la base à chaque modification (seules les tables concernées, dans une transaction). Les relevés PDF et les documents restent des fichiers (dossier Documents). Les sauvegardes « Données » archivent une copie lisible des données ; leur restauration réimporte cette copie dans la base.'));
}
