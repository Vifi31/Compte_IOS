// Titulaire(s) des comptes, lus dans l'en-tête des relevés (ex. « MR DUPONT MARIE »).
// Sert à reconnaître les virements entre ses propres comptes sans coder de nom en dur.
const CIVILITE = /^(M|MR|MME|MLLE)\.?\s+/i;

export const holderName = h => String(h || '').replace(CIVILITE, '').trim().toUpperCase();

/** true si `who` (début du libellé de contrepartie) est le nom d'un titulaire. */
export function isOwnName(who, holders) {
  const w = String(who || '').toUpperCase().replace(CIVILITE, '').trim();
  return (holders ?? []).map(holderName).filter(Boolean).some(n => w === n || w.startsWith(n + ' '));
}
