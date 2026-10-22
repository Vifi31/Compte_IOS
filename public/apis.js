'use strict';
// ============ Administration › API : services externes et API interne de Comptes ============
let apisTab = (() => { try { return localStorage.getItem('apisTab') || 'ext'; } catch { return 'ext'; } })();
let apisJournalSvc = '', apisRoutesQ = '', apisTester = { method: 'GET', path: '/api/ping', body: '' }, apisTesterOut = null;
const APIS_CAT = { ia: ['🧠', 'Intelligence artificielle', '#8b5cf6'], geo: ['🗺️', 'Géographie et adresses', '#0ea5e9'], immo: ['🏘️', 'Immobilier', '#10b981'] };
const apisDate = d => (d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
const apisOk = ok => h('span', { class: 'pill', style: { '--pc': ok ? '#059669' : '#dc2626' } }, ok ? 'OK' : 'Erreur');
async function apisCall(path, method = 'GET', body) {
  const r = await apiFetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }), j = await r.json();
  if (!r.ok) { toast('⚠️ ' + (j.error || 'Erreur')); throw new Error(j.error); }
  return j;
}
const apisSwitch = (on, onch, title) => h('label', { class: 'switch', title }, h('input', { type: 'checkbox', checked: on, onchange: e => onch(e.target.checked) }), h('span'));

async function pageApis(v) {
  v.append(h('div', { class: 'loading' }, 'Chargement…'));
  let D; try { D = await apisCall('/api/apis'); } catch { return; }
  if (S.page !== 'apis') return; v.innerHTML = '';
  const tab = (id, label) => h('button', { class: apisTab === id ? 'on' : '', onclick: () => { apisTab = id; try { localStorage.setItem('apisTab', id); } catch { /* préférence facultative */ } render(); } }, label);
  v.append(h('div', { class: 'toolbar' }, h('div', { class: 'seg' }, tab('ext', '🌐 Services externes'), tab('int', '🔗 API interne de Comptes'))));
  if (apisTab === 'int') return apisInternal(v, D);
  return apisExternal(v, D);
}

// ---------- Services externes ----------
async function apisExternal(v, D) {
  const all = D.services, on = all.filter(s => s.enabled), st = all.map(s => s.stats).filter(Boolean);
  const calls = sum(st.map(s => s.calls)), errors = sum(st.map(s => s.errors)), avg = calls ? Math.round(sum(st.map(s => s.avgMs * s.calls)) / calls) : 0;
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Services', `${on.length} / ${all.length}`, 'activés · ' + all.filter(s => s.hasKey).length + ' clé(s) enregistrée(s)', '🌐'),
    kpi('k4', 'Appels', calls.toLocaleString('fr-FR'), 'dans le journal (1 000 derniers)', '📡'),
    kpi(errors ? 'k1' : 'k2', 'Erreurs', String(errors), calls ? Math.round(100 * errors / calls) + ' % des appels' : 'aucun appel', errors ? '⚠️' : '✅'),
    kpi('k2', 'Temps moyen', avg ? avg.toLocaleString('fr-FR') + ' ms' : '—', 'par appel', '⏱️')));

  for (const [cat, [ico, label, color]] of Object.entries(APIS_CAT)) {
    const list = all.filter(s => s.category === cat); if (!list.length) continue;
    v.append(h('div', { class: 'card ccard', style: { '--ac': color } }, h('h2', {}, ico + ' ' + label, h('small', {}, list.length + ' service(s)')),
      h('div', { class: 'tablewrap' }, h('table', {}, th('Actif', 'Service', 'Adresse', 'Clé', ['Appels', 'r'], 'Dernier appel', ''),
        h('tbody', {}, list.map(s => {
          const out = h('div', { class: 'muted', style: { fontSize: '12px' } });
          return h('tr', { style: { opacity: s.enabled ? 1 : .55 } },
            h('td', {}, apisSwitch(s.enabled, async val => { await apisCall('/api/apis/services/' + encodeURIComponent(s.id), 'PUT', { enabled: val }); toast(val ? 'Service activé' : 'Service désactivé'); render(); }, s.enabled ? 'Désactiver' : 'Activer')),
            h('td', {}, h('b', {}, s.label), s.active ? h('span', { class: 'pill', style: { '--pc': '#6366f1', marginLeft: '6px' } }, 'IA utilisée') : null, s.local ? h('span', { class: 'pill', style: { '--pc': '#059669', marginLeft: '6px' } }, 'sur ce PC') : null, h('div', { class: 'muted', style: { fontSize: '12px', maxWidth: '380px' } }, s.usage || ''), out),
            h('td', { style: { fontSize: '12px', wordBreak: 'break-all', maxWidth: '260px' } }, h('code', {}, s.effectiveEndpoint), s.endpoint ? h('div', { class: 'muted' }, 'adresse personnalisée') : null),
            h('td', { class: 'nw' }, s.category !== 'ia' ? h('span', { class: 'muted' }, 'sans clé') : s.hasKey ? h('code', {}, s.keyHint) : s.needsKey ? h('span', { style: { color: 'var(--danger, #dc2626)', fontWeight: 600 } }, 'manquante') : h('span', { class: 'muted' }, 'facultative')),
            h('td', { class: 'r num' }, s.stats ? `${s.stats.calls}${s.stats.errors ? ' · ' : ''}` : '0', s.stats?.errors ? h('span', { style: { color: '#dc2626' } }, s.stats.errors + ' err.') : null, s.stats ? h('div', { class: 'muted', style: { fontSize: '11.5px' } }, s.stats.avgMs + ' ms') : null),
            h('td', { class: 'nw', style: { fontSize: '12.5px' } }, s.stats ? [apisOk(s.stats.last.ok), ' ', apisDate(s.stats.last.at)] : h('span', { class: 'muted' }, 'jamais'), s.stats?.lastError ? h('div', { class: 'muted', style: { fontSize: '11.5px', maxWidth: '220px', whiteSpace: 'normal' }, title: s.stats.lastError.error }, 'dernière erreur : ' + String(s.stats.lastError.error ?? '').slice(0, 60)) : null),
            h('td', { class: 'nw r' },
              h('button', { class: 'icon-btn', title: 'Tester la connexion', onclick: async e => { e.target.disabled = true; out.textContent = 'Test en cours…'; try { const r = await apisCall('/api/apis/services/' + encodeURIComponent(s.id) + '/test', 'POST'); out.textContent = (r.ok ? '✅ ' : '❌ ') + r.detail + (r.ms ? ' · ' + r.ms + ' ms' : ''); } catch { out.textContent = ''; } e.target.disabled = false; } }, '🔌'),
              h('button', { class: 'icon-btn', title: 'Paramétrer', onclick: () => apisEdit(s) }, '✏️'),
              h('button', { class: 'icon-btn', title: 'Voir le journal de ce service', onclick: () => { apisJournalSvc = s.id; render(); setTimeout(() => $('#apisJournal')?.scrollIntoView({ behavior: 'smooth' }), 50); } }, '📜')));
        }))))));
  }
  v.append(h('p', { class: 'muted', style: { fontSize: '12.5px', margin: '10px 2px 0' } }, 'Les clés sont enregistrées dans data/secrets.json, sur cet ordinateur seulement : elles ne figurent ni dans la base, ni dans les sauvegardes. Le fournisseur IA utilisé se choisit dans Analyse › Paramètres IA ; chaque fournisseur garde sa propre clé.'));
  await apisJournal(v, all, D);
}

function apisEdit(s) {
  const d = { enabled: s.enabled, endpoint: s.endpoint, timeout: s.timeout ?? '' };
  const key = h('input', { type: 'password', placeholder: s.hasKey ? 'clé enregistrée (' + s.keyHint + ') — laisser vide pour la conserver' : 'coller la clé API', autocomplete: 'off' });
  const field = (label, el, help) => h('div', { class: 'field' }, h('label', {}, label), el, help ? h('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, help) : null);
  modal('✏️ ' + s.label, [
    h('label', { class: 'schedon', style: { display: 'flex', gap: '10px', alignItems: 'center' } }, apisSwitch(d.enabled, val => { d.enabled = val; }), 'Service activé'),
    field('Adresse', h('input', { type: 'text', value: d.endpoint, placeholder: s.defaultEndpoint, oninput: e => { d.endpoint = e.target.value; } }), ['Vide = adresse par défaut : ', h('code', {}, s.defaultEndpoint)]),
    field('Délai maximal (secondes)', h('input', { type: 'number', min: 0, max: 600, value: d.timeout, placeholder: 'défaut du module', oninput: e => { d.timeout = e.target.value; } }), 'Vide ou 0 = délai prévu par le module appelant.'),
    s.category === 'ia' ? field('Clé API', key, s.doc ? ['Obtenir une clé : ', h('a', { class: 'doclink', href: s.doc, target: '_blank', rel: 'noopener' }, s.doc)] : null) : null,
    s.category !== 'ia' && s.doc ? h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Documentation : ', h('a', { class: 'doclink', href: s.doc, target: '_blank', rel: 'noopener' }, s.doc)) : null,
  ], close => [
    s.hasKey ? h('button', { class: 'btn sec', onclick: async () => { if (!confirm('Supprimer la clé enregistrée pour « ' + s.label + ' » ?')) return; await apisCall('/api/apis/services/' + encodeURIComponent(s.id), 'PUT', { key: '__clear__' }); close(); toast('Clé supprimée'); render(); } }, '🗑️ Supprimer la clé') : null,
    h('button', { class: 'btn sec', onclick: close }, 'Annuler'),
    h('button', { class: 'btn', onclick: async () => {
      const body = { enabled: d.enabled, endpoint: d.endpoint.trim(), timeout: +d.timeout || 0 }; if (key.value.trim()) body.key = key.value.trim();
      await apisCall('/api/apis/services/' + encodeURIComponent(s.id), 'PUT', body); close(); toast('✅ Paramètres enregistrés'); render();
    } }, 'Enregistrer')]);
}

async function apisJournal(v, all, D) {
  const names = Object.fromEntries([...all.map(s => [s.id, s.label]), ['interne', 'API interne (accès réseau)']]);
  const J = await apisCall('/api/apis/journal?limit=200' + (apisJournalSvc ? '&service=' + encodeURIComponent(apisJournalSvc) : '')); if (S.page !== 'apis') return;
  const sel = h('select', { onchange: e => { apisJournalSvc = e.target.value; render(); } }, h('option', { value: '' }, 'Tous les services'), Object.entries(names).map(([id, l]) => h('option', { value: id, selected: id === apisJournalSvc }, l)));
  v.append(h('div', { id: 'apisJournal', class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '📜 Journal des appels', h('small', {}, `${J.list.length} affiché(s) · ${J.total} enregistré(s)`)),
    h('div', { class: 'toolbar' }, sel, h('button', { class: 'btn sm sec', onclick: () => render() }, '↻ Actualiser'),
      h('button', { class: 'btn sm sec', onclick: async () => { if (!confirm('Vider le journal des appels ?')) return; await apisCall('/api/apis/journal', 'DELETE'); toast('Journal vidé'); render(); } }, '🧹 Vider')),
    J.list.length ? h('div', { class: 'tablewrap', style: { maxHeight: '420px' } }, h('table', {}, th('Date', 'Service', 'Requête', ['Statut', 'r'], ['Durée', 'r'], 'Détail'),
      h('tbody', {}, J.list.map(e => h('tr', {},
        h('td', { class: 'nw', style: { fontSize: '12.5px' } }, apisDate(e.at)), h('td', { style: { fontSize: '12.5px' } }, names[e.service] ?? e.service),
        h('td', { style: { fontSize: '12px', wordBreak: 'break-all', maxWidth: '340px' } }, h('b', {}, e.method), ' ', e.url),
        h('td', { class: 'r' }, apisOk(e.ok), ' ', h('span', { class: 'muted', style: { fontSize: '12px' } }, e.status || '—')), h('td', { class: 'r num', style: { fontSize: '12.5px' } }, e.ms + ' ms'),
        h('td', { class: 'muted', style: { fontSize: '12px', maxWidth: '260px' } }, [e.who, e.error].filter(Boolean).join(' · ')))))))
      : h('div', { class: 'empty' }, 'Aucun appel enregistré.')));
  void D;
}

// ---------- API interne ----------
async function apisInternal(v, D) {
  const N = D.network, port = N.listening?.port ?? location.port, pending = N.listening && (N.enabled ? N.listening.host !== '0.0.0.0' : N.listening.host === '0.0.0.0');
  const ist = D.internal.stats;
  v.append(h('div', { class: 'grid g4' },
    kpi('k3', 'Routes', String(D.routes.length), 'adresses /api/* de Comptes', '🔗'),
    kpi(N.enabled ? 'k4' : 'k2', 'Accès réseau', N.enabled ? 'Ouvert' : 'Fermé', N.enabled ? 'autres appareils avec jeton' : 'cet ordinateur seulement', N.enabled ? '📶' : '🔒'),
    kpi('k2', 'Jetons', String(D.tokens.filter(t => t.enabled).length), D.tokens.length + ' au total', '🔑'),
    kpi(ist?.errors ? 'k1' : 'k4', 'Appels distants', String(ist?.calls ?? 0), ist?.errors ? ist.errors + ' refusé(s)' : 'aucun refus', '📡')));

  // accès réseau
  v.append(h('div', { class: 'card ccard', style: { '--ac': '#0ea5e9' } }, h('h2', {}, '📶 Accès depuis le réseau local', h('small', {}, 'autres ordinateurs, tablette, domotique, scripts…')),
    h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      apisSwitch(N.enabled, async val => { if (val && !confirm('Ouvrir l’API de Comptes aux appareils du réseau local ?\n\nChaque appel devra présenter un jeton d’accès. Windows peut demander d’autoriser Node.js dans le pare-feu au redémarrage.')) return render(); await apisCall('/api/apis/network', 'PUT', { enabled: val }); render(); }),
      h('b', {}, N.enabled ? 'Accès réseau autorisé' : 'Accès limité à cet ordinateur'),
      h('span', { class: 'muted' }, N.listening ? `écoute actuelle : ${N.listening.host}:${N.listening.port}` : '')),
    pending ? h('div', { class: 'tip warn' }, '♻️ Changement pris en compte au prochain démarrage du serveur. ', h('button', { class: 'btn sm', onclick: apisRestart }, 'Redémarrer maintenant')) : null,
    N.enabled ? h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '10px', lineHeight: 1.7 } },
      'Adresse à utiliser depuis un autre appareil : ', N.addresses.length ? N.addresses.map((a, i) => [i ? ' ou ' : '', h('code', {}, `http://${a}:${port}/api/…`)]) : 'aucune adresse réseau détectée',
      h('br'), 'En-tête à envoyer : ', h('code', {}, 'Authorization: Bearer <jeton>'), ' (ou ', h('code', {}, 'X-Api-Key: <jeton>'), '). Exemple :',
      h('pre', { style: { margin: '6px 0 0', padding: '8px 10px', background: 'var(--card2)', borderRadius: '8px', overflowX: 'auto', fontSize: '12px' } }, `curl -H "Authorization: Bearer cpt_…" http://${N.addresses[0] ?? 'ADRESSE'}:${port}/api/state`),
      'Depuis le réseau : seules les routes /api sont servies ; la gestion des API, les restaurations et l’arrêt restent réservés à cet ordinateur.') : null));

  // jetons
  v.append(h('div', { class: 'card ccard', style: { '--ac': '#f59e0b' } }, h('h2', {}, '🔑 Jetons d’accès', h('small', {}, 'un jeton par programme ou appareil ; enregistré sous forme d’empreinte, affiché une seule fois')),
    h('div', { class: 'toolbar' }, h('button', { class: 'btn sm', onclick: apisNewToken }, '+ Nouveau jeton')),
    D.tokens.length ? h('div', { class: 'tablewrap' }, h('table', {}, th('Actif', 'Nom', 'Portée', 'Jeton', 'Créé', 'Dernier usage', ['Appels', 'r'], ''),
      h('tbody', {}, D.tokens.map(t => h('tr', { style: { opacity: t.enabled ? 1 : .55 } },
        h('td', {}, apisSwitch(t.enabled, async val => { await apisCall('/api/apis/tokens/' + t.id, 'PUT', { enabled: val }); render(); })),
        h('td', {}, h('b', {}, t.name)),
        h('td', {}, h('select', { onchange: async e => { await apisCall('/api/apis/tokens/' + t.id, 'PUT', { scope: e.target.value }); toast('Portée modifiée'); render(); } }, [['lecture', 'Lecture seule (GET)'], ['complet', 'Lecture et modification']].map(([k, l]) => h('option', { value: k, selected: t.scope === k }, l)))),
        h('td', {}, h('code', {}, t.prefix + '…')), h('td', { class: 'nw', style: { fontSize: '12.5px' } }, apisDate(t.created)),
        h('td', { class: 'nw', style: { fontSize: '12.5px' } }, apisDate(t.lastUsed), t.lastIp ? h('div', { class: 'muted' }, t.lastIp) : null), h('td', { class: 'r num' }, String(t.uses)),
        h('td', { class: 'r' }, h('button', { class: 'icon-btn', title: 'Révoquer (supprimer) ce jeton', onclick: async () => { if (!confirm('Révoquer le jeton « ' + t.name + ' » ? Les programmes qui l’utilisent n’auront plus accès.')) return; await apisCall('/api/apis/tokens/' + t.id, 'DELETE'); toast('Jeton révoqué'); render(); } }, '🗑️')))))))
      : h('div', { class: 'empty' }, 'Aucun jeton : créez-en un pour chaque programme ou appareil qui doit appeler Comptes.')));

  // catalogue + testeur
  const q = apisRoutesQ.trim().toLowerCase(), routes = D.routes.filter(r => !q || (r.path + ' ' + r.file + ' ' + r.methods.join(' ')).toLowerCase().includes(q));
  const pick = (m, p) => { apisTester = { ...apisTester, method: m, path: p.replace(/:id/g, '…') }; apisTesterOut = null; render(); setTimeout(() => $('#apisTester')?.scrollIntoView({ behavior: 'smooth' }), 50); };
  const mcol = { GET: '#059669', POST: '#2563eb', PUT: '#d97706', DELETE: '#dc2626' };
  v.append(h('div', { class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '📚 Catalogue des routes', h('small', {}, `${routes.length} / ${D.routes.length} · cliquer pour essayer`)),
    h('div', { class: 'toolbar' }, h('input', { type: 'search', class: 'grow', placeholder: 'Filtrer (chemin, module, méthode)…', value: apisRoutesQ, oninput: e => { apisRoutesQ = e.target.value; clearTimeout(apisInternal.t); apisInternal.t = setTimeout(render, 250); } })),
    h('div', { class: 'tablewrap', style: { maxHeight: '420px' } }, h('table', {}, th('Méthodes', 'Chemin', 'Module'),
      h('tbody', {}, routes.map(r => h('tr', { style: { cursor: 'pointer' }, onclick: () => pick(r.methods[0] ?? 'GET', r.path) },
        h('td', { class: 'nw' }, (r.methods.length ? r.methods : ['GET']).map(m => h('span', { class: 'pill', style: { '--pc': mcol[m] ?? '#64748b', marginRight: '4px' }, onclick: e => { e.stopPropagation(); pick(m, r.path); } }, m))),
        h('td', {}, h('code', {}, r.path)), h('td', { class: 'muted', style: { fontSize: '12.5px' } }, r.file))))))));

  const out = apisTesterOut;
  v.append(h('div', { id: 'apisTester', class: 'card', style: { marginTop: '18px' } }, h('h2', {}, '🧪 Tester une route', h('small', {}, 'appel direct depuis cet écran')),
    h('div', { class: 'toolbar' },
      h('select', { onchange: e => { apisTester.method = e.target.value; render(); } }, ['GET', 'POST', 'PUT', 'DELETE'].map(m => h('option', { selected: m === apisTester.method }, m))),
      h('input', { type: 'text', class: 'grow', value: apisTester.path, placeholder: '/api/…', oninput: e => { apisTester.path = e.target.value; } }),
      h('button', { class: 'btn', onclick: apisSend }, '▶ Envoyer')),
    apisTester.method !== 'GET' ? [h('textarea', { rows: 4, style: { width: '100%', fontFamily: 'Consolas, monospace', fontSize: '12.5px' }, placeholder: 'Corps JSON (facultatif)', oninput: e => { apisTester.body = e.target.value; } }, apisTester.body),
      h('div', { class: 'tip warn' }, '⚠️ ', apisTester.method, ' modifie les données de Comptes : à utiliser en connaissance de cause (une sauvegarde est conseillée).')] : null,
    out ? h('div', { style: { marginTop: '10px' } }, h('div', {}, apisOk(out.ok), ' ', h('b', {}, out.status), ' · ', out.ms + ' ms', ' · ', out.size.toLocaleString('fr-FR') + ' octets', out.type ? h('span', { class: 'muted' }, ' · ' + out.type) : null),
      h('pre', { style: { maxHeight: '420px', overflow: 'auto', background: 'var(--card2)', padding: '10px', borderRadius: '10px', fontSize: '12px', marginTop: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, out.text)) : null));
}

async function apisSend() {
  const { method, path } = apisTester;
  if (!/^\/api\//.test(path)) return toast('⚠️ Le chemin doit commencer par /api/');
  if (method !== 'GET' && !confirm(`Envoyer ${method} ${path} ? Cette requête peut modifier les données.`)) return;
  let body; if (method !== 'GET' && apisTester.body.trim()) { try { body = JSON.stringify(JSON.parse(apisTester.body)); } catch { return toast('⚠️ Corps JSON invalide'); } }
  const t0 = performance.now();
  try {
    const r = await apiFetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body }), type = r.headers.get('content-type') || '', buf = await r.arrayBuffer();
    let text = type.includes('json') || type.startsWith('text') ? new TextDecoder().decode(buf) : `(contenu binaire ${type || ''} non affiché)`;
    if (type.includes('json')) { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* texte brut */ } }
    apisTesterOut = { ok: r.ok, status: r.status, ms: Math.round(performance.now() - t0), size: buf.byteLength, type: type.split(';')[0], text: text.length > 30000 ? text.slice(0, 30000) + '\n… (tronqué)' : text };
  } catch (e) { apisTesterOut = { ok: false, status: 'échec', ms: Math.round(performance.now() - t0), size: 0, type: '', text: String(e.message || e) }; }
  render();
}

function apisNewToken() {
  const d = { name: '', scope: 'lecture' };
  modal('🔑 Nouveau jeton d’accès', [
    h('div', { class: 'field' }, h('label', {}, 'Nom (programme ou appareil)'), h('input', { type: 'text', placeholder: 'ex. Tablette du salon, script de sauvegarde…', oninput: e => { d.name = e.target.value; } })),
    h('div', { class: 'field' }, h('label', {}, 'Portée'), h('select', { onchange: e => { d.scope = e.target.value; } }, h('option', { value: 'lecture' }, 'Lecture seule (GET) — conseillé'), h('option', { value: 'complet' }, 'Lecture et modification'))),
  ], close => [h('button', { class: 'btn sec', onclick: close }, 'Annuler'), h('button', { class: 'btn', onclick: async () => {
    const r = await apisCall('/api/apis/tokens', 'POST', d); close();
    const box = h('input', { type: 'text', value: r.token, readonly: true, style: { fontFamily: 'Consolas, monospace', width: '100%' }, onfocus: e => e.target.select() });
    modal('✅ Jeton créé', [h('div', { class: 'tip warn' }, 'Copiez ce jeton maintenant : il ne sera plus jamais affiché (seule son empreinte est conservée).'), box],
      c2 => [h('button', { class: 'btn sec', onclick: async () => { try { await navigator.clipboard.writeText(r.token); toast('Jeton copié'); } catch { box.select(); document.execCommand('copy'); toast('Jeton copié'); } } }, '📋 Copier'), h('button', { class: 'btn', onclick: () => { c2(); render(); } }, 'Terminé')]);
  } }, 'Créer')]);
}

async function apisRestart() {
  if (!confirm('Redémarrer le serveur Comptes maintenant ?')) return;
  $('#view').innerHTML = ''; $('#view').append(h('div', { class: 'loading' }, '♻️ Redémarrage du serveur…'));
  try { await apiFetch('/api/restart', { method: 'POST' }); } catch { /* le serveur s'arrête */ }
  const t0 = Date.now();
  const poll = async () => { try { const r = await fetch('/api/ping'); if (r.ok) return location.reload(); } catch { /* en attente */ } if (Date.now() - t0 < 90000) setTimeout(poll, 1500); else $('#view').textContent = 'Le serveur ne répond pas : relancez Comptes.bat.'; };
  setTimeout(poll, 2000);
}
