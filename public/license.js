'use strict';
// ============ Administration › Licence : copyright, licence d'utilisation, composants tiers ============
async function licApi(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); } return j;
}

async function pageLicense(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  const D = await licApi('/api/license');
  v.innerHTML = ''; if (S.page !== 'license') return;
  const L = D.license, d = { holder: L.holder, year: L.year, product: L.product, contact: L.contact || '', licenseType: L.licenseType, eulaEnabled: L.eulaEnabled };
  const acc = L.acceptance, accOk = acc && acc.eulaVersion === L.eulaVersion;

  v.append(h('div', { class: 'ver-hero' },
    h('div', {}, h('small', {}, 'Copyright'), h('div', { class: 'big', style: { fontSize: '30px' } }, D.brief.copyright)),
    h('div', {}, h('div', { style: { fontWeight: 700, fontSize: '16px' } }, D.types[L.licenseType].label), h('small', {}, D.types[L.licenseType].spdx)),
    h('div', { style: { marginLeft: 'auto', fontSize: '13px', lineHeight: 1.7 } }, accOk ? `✅ Licence acceptée par ${acc.name}` : '⏳ Licence non acceptée', h('br'), accOk ? `le ${fmtDT(acc.at)} (version ${acc.eulaVersion})` : (L.eulaEnabled ? 'Acceptation requise à l’ouverture' : 'Acceptation désactivée'))));

  // ---- copyright
  const holderIn = h('input', { type: 'text', value: d.holder, oninput: e => { d.holder = e.target.value; } });
  const yearIn = h('input', { type: 'number', min: 1990, max: 2100, value: d.year, oninput: e => { d.year = +e.target.value; } });
  const prodIn = h('input', { type: 'text', value: d.product, oninput: e => { d.product = e.target.value; } });
  const contIn = h('input', { type: 'text', value: d.contact, placeholder: 'Courriel ou site (facultatif)', oninput: e => { d.contact = e.target.value; } });
  const typeSel = h('select', { onchange: e => { d.licenseType = e.target.value; } }, Object.entries(D.types).map(([k, t]) => h('option', { value: k, selected: d.licenseType === k }, `${t.label}  (${t.spdx})`)));
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '©️ Copyright et licence du logiciel'),
    h('div', { class: 'grid g3', style: { gap: '14px' } },
      h('div', { class: 'field' }, h('label', {}, 'Titulaire du copyright'), holderIn), h('div', { class: 'field' }, h('label', {}, 'Année'), yearIn), h('div', { class: 'field' }, h('label', {}, 'Nom du produit'), prodIn)),
    h('div', { class: 'grid g2', style: { gap: '14px', marginTop: '14px' } },
      h('div', { class: 'field' }, h('label', {}, 'Licence de diffusion du logiciel'), typeSel), h('div', { class: 'field' }, h('label', {}, 'Contact'), contIn)),
    h('div', { class: 'toolbar', style: { margin: '16px 0 0' } },
      h('button', { class: 'btn', onclick: async () => { await licApi('/api/license', 'PUT', d); S.data = await api('/api/state'); toast('✅ Copyright enregistré'); render(); } }, 'Enregistrer'),
      pdfBtn('📄 Exporter en PDF', exportLicensePdf),
      h('button', { class: 'btn sec', onclick: async () => { await licApi('/api/license', 'PUT', d); const r = await licApi('/api/license/write-files', 'POST'); toast('Fichiers générés : ' + r.written.join(', ')); } }, '📄 Générer LICENSE et NOTICE'),
      h('span', { class: 'muted' }, 'Le copyright apparaît dans le menu, les rapports PDF et le fichier LICENSE.')),
    h('details', { class: 'faq', style: { marginTop: '12px' } }, h('summary', {}, 'Aperçu du fichier LICENSE'), h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap', maxHeight: '320px' } }, D.licenseFile))));

  // ---- licence d'utilisation (EULA)
  const eulaArea = h('textarea', { rows: 16, style: { width: '100%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '10px', padding: '10px 12px', font: '13px Consolas, monospace', color: 'inherit', resize: 'vertical' } }, L.eulaText || D.eulaDefault);
  const enable = h('input', { type: 'checkbox', checked: d.eulaEnabled, onchange: e => { d.eulaEnabled = e.target.checked; } });
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '📜 Licence d’utilisation (contrat utilisateur)', h('small', {}, `version ${L.eulaVersion}`)),
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Texte accepté par l’utilisateur à l’ouverture. Variables : {{titulaire}}, {{annee}}, {{produit}}. Toute modification du texte demande une nouvelle acceptation.'),
    h('label', { class: 'schedon', style: { marginBottom: '12px' } }, enable, h('b', {}, 'Exiger l’acceptation de la licence à l’ouverture de l’application')),
    eulaArea,
    h('div', { class: 'toolbar', style: { margin: '14px 0 0' } },
      h('button', { class: 'btn', onclick: async () => { await licApi('/api/license', 'PUT', { eulaEnabled: d.eulaEnabled, eulaText: eulaArea.value.trim() === D.eulaDefault.trim() ? '' : eulaArea.value }); S.data = await api('/api/state'); toast('✅ Licence d’utilisation enregistrée'); render(); } }, 'Enregistrer la licence'),
      h('button', { class: 'btn sec', onclick: () => { eulaArea.value = D.eulaDefault; } }, '↺ Texte par défaut'),
      h('button', { class: 'btn sec', onclick: () => showEula(false) }, '👁️ Voir comme l’utilisateur'),
      accOk ? h('button', { class: 'btn sec', onclick: async () => { await licApi('/api/license/revoke', 'POST'); S.data = await api('/api/state'); toast('Acceptation retirée'); render(); } }, 'Retirer l’acceptation') : null)));

  // ---- composants tiers
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, `🧩 Composants tiers (${D.thirdParty.length})`, h('small', {}, 'licences des bibliothèques embarquées')),
    h('div', { class: 'tablewrap', style: { maxHeight: '380px' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Composant'), h('th', {}, 'Version'), h('th', {}, 'Licence'), h('th', {}, 'Site'))),
      h('tbody', {}, D.thirdParty.map(c => h('tr', {}, h('td', {}, h('b', {}, c.name)), h('td', { class: 'muted num' }, c.version), h('td', {}, h('span', { class: 'badge' }, c.license)), h('td', { class: 'muted', style: { fontSize: '12px' } }, c.homepage || '')))))),
    h('p', { class: 'muted', style: { marginBottom: 0 } }, 'Ces composants conservent leurs licences d’origine ; la liste est reprise dans le fichier NOTICE.')));
}

// ---- fenêtre d'acceptation (au démarrage si nécessaire, ou aperçu)
async function showEula(required) {
  const D = await licApi('/api/license');
  const name = h('input', { type: 'text', placeholder: 'Votre nom', style: { width: '100%' } });
  const ck = h('input', { type: 'checkbox' });
  const root = $('#modalRoot'); root.innerHTML = '';
  const close = () => { root.innerHTML = ''; };
  const accept = h('button', { class: 'btn', disabled: true, onclick: async () => {
    if (!name.value.trim()) return name.focus();
    await licApi('/api/license/accept', 'POST', { name: name.value }); S.data = await api('/api/state'); close(); toast('✅ Licence acceptée'); render();
  } }, 'J’accepte');
  const upd = () => { accept.disabled = !(ck.checked && name.value.trim()); };
  ck.onchange = upd; name.oninput = upd;
  const refuse = () => { $('#view').innerHTML = ''; $('#view').append(h('div', { class: 'card empty' }, h('h2', { style: { justifyContent: 'center' } }, '🔒 Licence non acceptée'), h('p', {}, 'L’utilisation de l’application nécessite l’acceptation de la licence.'), h('button', { class: 'btn', onclick: () => showEula(true) }, 'Relire la licence'))); close(); };
  const body = required
    ? [h('p', { class: 'muted', style: { margin: 0 } }, `Veuillez lire et accepter la licence d’utilisation pour continuer. ${D.brief.copyright}`),
       h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap', maxHeight: '300px', fontFamily: 'inherit' } }, D.eulaPreview),
       h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer' } }, ck, 'J’ai lu et j’accepte les termes de la licence d’utilisation'),
       h('div', { class: 'field' }, h('label', {}, 'Nom de l’utilisateur'), name)]
    : [h('pre', { class: 'difflist', style: { whiteSpace: 'pre-wrap', maxHeight: '420px', fontFamily: 'inherit' } }, D.eulaPreview)];
  const m = h('div', { class: 'modal wide' }, h('header', {}, h('h3', {}, 'Licence d’utilisation — ' + D.brief.product), required ? null : h('button', { class: 'icon-btn', onclick: close }, '✕')),
    h('div', { class: 'body' }, body), h('footer', {}, required ? [h('button', { class: 'btn sec', onclick: refuse }, 'Refuser'), accept] : [h('button', { class: 'btn', onclick: close }, 'Fermer')]));
  root.append(h('div', { class: 'back', onmousedown: e => { if (!required && e.target.classList.contains('back')) close(); } }, m));
}
