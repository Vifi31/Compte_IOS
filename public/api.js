'use strict';
// ============ Accès à l'API : point de passage unique entre l'interface et les données ============
// Sur PC, chaque appel part vers le serveur Node (server.mjs), exactement comme un fetch.
// Dans l'appli mobile autonome, un moteur local s'enregistre avec apiUseLocal() : il reçoit la même
// requête (méthode, adresse /api/…, en-têtes, corps) et rend une Response, sans aucun serveur.

let API_LOCAL = null, API_LOCAL_URL = null;

/** Enregistre le moteur local (appli mobile) : handler(request) → Promise<Response> ; fileUrl(url) → adresse locale d'un fichier. */
function apiUseLocal(handler, fileUrl = null) { API_LOCAL = handler; API_LOCAL_URL = fileUrl; }

/** Vrai quand l'application tourne sans serveur (appli mobile autonome). */
const apiIsLocal = () => !!API_LOCAL;

/** Remplace fetch pour toutes les adresses /api/… : même signature, même Response. */
function apiFetch(url, opts = {}) {
  if (!API_LOCAL) return fetch(url, opts);
  return Promise.resolve().then(() => API_LOCAL(new Request(new URL(url, location.origin), opts)));
}

/**
 * Adresse d'un fichier servi par l'API (lien de téléchargement, aperçu PDF, nouvelle fenêtre).
 * Sur PC elle est inchangée ; le moteur local pourra la réécrire (fichier stocké sur le téléphone).
 */
const apiUrl = url => (API_LOCAL_URL ? API_LOCAL_URL(url) : url);
