'use strict';
// ============ Accès à l'API : point de passage unique entre l'interface et les données ============
// Sur PC, chaque appel part vers le serveur Node (server.mjs), exactement comme un fetch.
// Dans l'appli mobile autonome, le moteur local (mobile/engine.mjs, construit dans /mobile/engine.js) s'enregistre
// avec apiUseLocal() : il reçoit la même requête (méthode, adresse /api/…, en-têtes, corps) et rend une Response.
// Mode local : appli Capacitor, ou ?moteur=local dans l'adresse (essai dans un navigateur, ?moteur=serveur pour revenir).

let API_LOCAL = null, API_LOCAL_OPEN = null;
const API_WANT_LOCAL = (() => {
  if (window.Capacitor?.isNativePlatform?.()) return true;
  const q = new URLSearchParams(location.search).get('moteur');
  try { if (q) localStorage.setItem('comptes.moteur', q); return (q || localStorage.getItem('comptes.moteur')) === 'local'; } catch { return q === 'local'; }
})();
let apiLocalReady = null;
if (API_WANT_LOCAL) {
  apiLocalReady = new Promise((ok, ko) => { window.__apiLocalOk = ok; setTimeout(() => ko(new Error('Moteur local non chargé')), 60000); });
  const s = document.createElement('script'); s.type = 'module'; s.src = '/mobile/engine.js';
  s.onerror = () => console.error('Moteur local introuvable : lancez « npm run mobile:build »');
  document.head.append(s);
}

/** Enregistre le moteur local : handler(request) → Promise<Response> ; openFile(url, download) ouvre ou télécharge un fichier. */
function apiUseLocal(handler, openFile = null) { API_LOCAL = handler; API_LOCAL_OPEN = openFile; window.__apiLocalOk?.(); }

/** Vrai quand l'application tourne sans serveur (appli mobile autonome). */
const apiIsLocal = () => API_WANT_LOCAL;

/** Remplace fetch pour toutes les adresses /api/… : même signature, même Response. */
async function apiFetch(url, opts = {}) {
  if (!API_WANT_LOCAL) return fetch(url, opts);
  await apiLocalReady;
  return API_LOCAL(new Request(new URL(url, location.origin), opts));
}

/**
 * Adresse d'un fichier servi par l'API (lien de téléchargement, aperçu PDF).
 * Sur PC elle est inchangée ; en mode local, le lien est intercepté au clic et le fichier lu par le moteur.
 */
const apiUrl = url => (API_WANT_LOCAL ? '#api-fichier=' + encodeURIComponent(url) : url);

/** Ouvre un fichier de l'API dans un nouvel onglet (aperçu d'un rapport…). */
function apiOpen(url) {
  if (!API_WANT_LOCAL) return window.open(url, '_blank');
  apiLocalReady.then(() => API_LOCAL_OPEN(url, false)).catch(e => toast('⚠️ ' + e.message));
}

if (API_WANT_LOCAL) document.addEventListener('click', ev => {
  const a = ev.target.closest?.('a[href^="#api-fichier="]'); if (!a) return;
  ev.preventDefault(); ev.stopPropagation();
  const url = decodeURIComponent(a.getAttribute('href').slice('#api-fichier='.length));
  apiLocalReady.then(() => API_LOCAL_OPEN(url, a.hasAttribute('download') || /[?&]download=1\b/.test(url) || !a.target)).catch(e => toast('⚠️ ' + e.message));
}, true);
