// Copyright et licence d'utilisation.
import fs from 'fs';
import path from 'path';

export const LICENSE_TYPES = {
  proprietary: { label: 'Propriétaire — tous droits réservés', spdx: 'LicenseRef-Proprietary' },
  mit: { label: 'MIT', spdx: 'MIT' },
  apache: { label: 'Apache 2.0', spdx: 'Apache-2.0', url: 'https://www.apache.org/licenses/LICENSE-2.0' },
  gpl3: { label: 'GNU GPL v3', spdx: 'GPL-3.0-or-later', url: 'https://www.gnu.org/licenses/gpl-3.0.html' },
  ccbync: { label: 'Creative Commons BY-NC 4.0', spdx: 'CC-BY-NC-4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/legalcode' },
};

export const DEFAULT_EULA = `CONTRAT DE LICENCE D'UTILISATION — {{produit}}

1. Objet
Le présent contrat définit les conditions dans lesquelles {{titulaire}} (le « Titulaire ») concède à l'utilisateur le droit d'utiliser le logiciel {{produit}} (le « Logiciel »).

2. Droit d'utilisation
Le Titulaire concède à l'utilisateur un droit personnel, non exclusif, non transférable et gratuit d'utiliser le Logiciel pour la gestion de ses propres comptes et budgets, sur ses propres équipements.

3. Restrictions
Sauf autorisation écrite du Titulaire, il est interdit de revendre, sous-licencier, louer ou distribuer le Logiciel, de supprimer les mentions de copyright, ou de l'utiliser pour traiter les données de tiers à titre professionnel.

4. Données personnelles
Le Logiciel fonctionne en local : vos relevés, catégories et rapports restent sur votre ordinateur. Si vous configurez un service d'intelligence artificielle externe, seules des données agrégées (totaux par catégorie et par mois) que vous avez validées avant envoi sont transmises à ce service, sous votre responsabilité et selon ses conditions d'utilisation.

5. Propriété intellectuelle
Le Logiciel, son code, ses interfaces et sa documentation sont protégés par le droit d'auteur. © {{annee}} {{titulaire}}. Les composants tiers restent soumis à leurs licences respectives (voir la liste dans la page Licence).

6. Garantie et responsabilité
Le Logiciel est fourni « en l'état », sans garantie d'aucune sorte. Les analyses, prévisions et recommandations sont fournies à titre indicatif et ne constituent pas un conseil financier. Le Titulaire ne saurait être tenu responsable des dommages résultant de l'utilisation du Logiciel ; il appartient à l'utilisateur de vérifier ses données et de faire des sauvegardes.

7. Durée et résiliation
Le contrat est conclu pour la durée d'utilisation du Logiciel. Il prend fin de plein droit en cas de manquement de l'utilisateur à ses obligations ; l'utilisateur doit alors cesser d'utiliser le Logiciel et en supprimer les copies.

8. Droit applicable
Le présent contrat est soumis au droit français.`;

const MIT = (h, y) => `MIT License

Copyright (c) ${y} ${h}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export function defaultLicense() {
  return { holder: 'Vincent Fillaux', year: new Date().getFullYear(), product: 'Comptes', contact: '', licenseType: 'proprietary', eulaEnabled: true, eulaText: '', eulaVersion: 1, acceptance: null };
}
const fill = (t, l) => t.replaceAll('{{titulaire}}', l.holder).replaceAll('{{annee}}', String(l.year)).replaceAll('{{produit}}', l.product);

export function eulaText(l) { return fill(l.eulaText?.trim() ? l.eulaText : DEFAULT_EULA, l); }
export function copyrightLine(l) { return `© ${l.year} ${l.holder}`; }
export function licenseFileText(l) {
  const t = LICENSE_TYPES[l.licenseType] ?? LICENSE_TYPES.proprietary;
  if (l.licenseType === 'mit') return MIT(l.holder, l.year);
  if (l.licenseType === 'proprietary') return `${l.product}\nCopyright ${copyrightLine(l)}. Tous droits réservés.\n\n${eulaText(l)}\n`;
  return `${l.product}\nCopyright ${copyrightLine(l)}\n\nCe logiciel est distribué sous licence ${t.label} (SPDX : ${t.spdx}).\nLe texte complet de la licence est disponible à l'adresse : ${t.url}\n`;
}
export function brief(l) {
  const ok = l.acceptance && l.acceptance.eulaVersion === l.eulaVersion;
  return { holder: l.holder, year: l.year, product: l.product, copyright: copyrightLine(l), licenseType: l.licenseType, needsAcceptance: !!l.eulaEnabled && !ok };
}

/** Licences des composants tiers lues dans node_modules (premier niveau + @portées). */
export function thirdParty(root, nodeVersion) {
  const out = [{ name: 'Node.js', version: nodeVersion.replace(/^v/, ''), license: 'MIT', homepage: 'https://nodejs.org' }];
  const nm = path.join(root, 'node_modules');
  if (!fs.existsSync(nm)) return out;
  const read = dir => { try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); return { name: j.name, version: j.version, license: typeof j.license === 'string' ? j.license : j.license?.type ?? (j.licenses?.map(x => x.type).join(' / ')) ?? 'inconnue', homepage: j.homepage ?? '' }; } catch { return null; } };
  for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (e.name.startsWith('@')) { for (const s of fs.readdirSync(path.join(nm, e.name), { withFileTypes: true })) if (s.isDirectory()) { const r = read(path.join(nm, e.name, s.name)); if (r) out.push(r); } }
    else { const r = read(path.join(nm, e.name)); if (r) out.push(r); }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
export function noticeText(l, list) {
  return `${l.product} — ${copyrightLine(l)}\n\nComposants tiers utilisés et leurs licences :\n\n` + list.map(c => `- ${c.name} ${c.version} — ${c.license}${c.homepage ? ' — ' + c.homepage : ''}`).join('\n') + '\n';
}
