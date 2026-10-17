'use strict';
// ============ Administration › Manifeste ============
async function mfApi(path, method = 'GET', body) {
  const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); } return j;
}

async function pageManifest(v) {
  v.append(h('div', { class: 'loading' }, 'Calcul des empreintes…'));
  const D = await mfApi('/api/manifest');
  v.innerHTML = ''; if (S.page !== 'manifest') return;
  const M = D.manifest, sv = D.saved, st = S.mf ??= { q: '', verify: null };
  const status = !sv ? ['k1', 'Non enregistré', 'Générez MANIFEST.json', '⚠️'] : sv.matches ? ['k2', 'Conforme', `manifeste du ${fmtDT(sv.generatedAt)}`, '✅'] : ['k1', 'Modifié', `depuis le manifeste v${sv.version}`, '✏️'];

  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Version', 'v' + M.version, M.copyright, '🏷️'),
    kpi('k4', 'Fichiers du programme', String(M.summary.files), fmtBytes(M.summary.bytes), '📁'),
    kpi('k2', 'Composants tiers', String(M.dependencies.length), 'dépendances et runtime', '🧩'),
    kpi(status[0], 'Intégrité', status[1], status[2], status[3])));

  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '📋 Manifeste du programme', h('small', {}, 'identité, composants, licences, empreintes SHA-256')),
    h('p', { class: 'muted', style: { marginTop: 0 } }, `Le fichier ${D.file} (dossier ${D.dir}) décrit le programme et l’empreinte de chacun de ses fichiers. Il permet de vérifier qu’aucun fichier n’a été altéré depuis sa génération.`),
    h('div', { class: 'toolbar', style: { margin: 0 } },
      h('button', { class: 'btn', onclick: async () => { const r = await mfApi('/api/manifest/write', 'POST'); toast(`✅ ${r.written} généré (${r.files} fichiers)`); st.verify = null; render(); } }, '💾 Générer / mettre à jour MANIFEST.json'),
      h('button', { class: 'btn sec', onclick: async () => { st.verify = await mfApi('/api/manifest/verify', 'POST'); render(); } }, '🔍 Vérifier l’intégrité'),
      h('a', { class: 'btn sec', href: apiUrl('/api/manifest/download'), style: { textDecoration: 'none' } }, '⬇ Télécharger (JSON)'),
      pdfBtn('📄 Exporter en PDF', () => exportManifestPdf(M, sv)))));

  if (st.verify) {
    const r = st.verify, n = r.modified.length + r.removed.length + r.added.length;
    v.append(h('div', { class: 'card', style: { marginTop: '18px', borderLeft: `5px solid ${r.ok ? 'var(--good)' : 'var(--warn)'}` } },
      h('h2', {}, r.ok ? '✅ Intégrité vérifiée' : `⚠️ ${n} écart(s) avec le manifeste v${r.version}`, h('small', {}, `${r.checked} fichiers contrôlés`)),
      r.ok ? h('p', { class: 'muted', style: { margin: 0 } }, 'Tous les fichiers du programme correspondent au manifeste enregistré.') : h('div', { class: 'difflist' }, r.modified.map(f => h('div', { class: 'mod' }, '~ ' + f)), r.added.map(f => h('div', { class: 'add' }, '+ ' + f)), r.removed.map(f => h('div', { class: 'del' }, '− ' + f))),
      r.ok ? null : h('p', { class: 'muted', style: { marginBottom: 0 } }, 'Si ces changements sont voulus (nouvelle version), régénérez le manifeste.')));
  }

  const q = st.q.trim().toLowerCase(), files = M.files.filter(f => !q || f.path.toLowerCase().includes(q));
  v.append(h('div', { class: 'grid g2', style: { marginTop: '18px' } },
    h('div', { class: 'card' }, h('h2', {}, 'Identité'),
      h('dl', { class: 'kv' }, ...[['Nom', M.name], ['Produit', M.product], ['Description', M.description || '—'], ['Titulaire', M.holder], ['Licence', `${M.license.type} (${M.license.spdx})`], ['Environnement', `Node ${M.runtime.node} · ${M.runtime.platform}/${M.runtime.arch}${M.runtime.installed ? ' · installé' : ' · développement'}`], ['Généré', fmtDT(M.generatedAt)]].flatMap(([k, val]) => [h('dt', {}, k), h('dd', {}, val)])),
      h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, 'Empreinte globale (SHA-256)'), h('code', { style: { wordBreak: 'break-all', fontSize: '11.5px' } }, M.integrity))),
    h('div', { class: 'card' }, h('h2', {}, 'Fonctionnalités'), h('ul', { style: { margin: 0, paddingLeft: '20px', lineHeight: 1.7 } }, M.features.map(f => h('li', {}, f))))));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `Fichiers (${files.length}/${M.files.length})`),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', class: 'grow', placeholder: '🔍 Filtrer par nom de fichier…', value: st.q, oninput: e => { st.q = e.target.value; clearTimeout(S._t); S._t = setTimeout(() => { render(); setTimeout(() => { const i = $('input[type=search]'); i?.focus(); i?.setSelectionRange(99, 99); }, 80); }, 300); } })),
    h('div', { class: 'tablewrap', style: { maxHeight: '420px' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Fichier'), h('th', { class: 'r' }, 'Taille'), h('th', {}, 'SHA-256'))),
      h('tbody', {}, files.map(f => h('tr', {}, h('td', {}, f.path), h('td', { class: 'r muted num' }, fmtBytes(f.size)), h('td', { class: 'muted', style: { fontFamily: 'Consolas, monospace', fontSize: '11.5px' } }, f.sha256.slice(0, 32) + '…'))))))));
}
