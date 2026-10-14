// Emplacements des fichiers.
//  - ROOT : le programme (code, node_modules).
//  - HOME : les données de l'utilisateur. Par défaut ROOT (mode développement) ;
//           défini par COMPTES_HOME dans la version installée (MSI), afin que le programme
//           puisse rester en lecture seule et que les données survivent aux mises à jour.
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// .env (facultatif) : ne remplace jamais une variable déjà définie dans l'environnement
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* pas de fichier .env */ }
const custom = process.env.COMPTES_HOME ? path.resolve(process.env.COMPTES_HOME) : null;
export const HOME = custom ?? ROOT;
export const INSTALLED = !!custom;
export const DATA_DIR = path.join(HOME, 'data');
export const RELEVES_DIR = custom ? path.join(custom, 'Releves') : path.join(ROOT, 'Documents', 'Releves');
export const BIENS_DIR = custom ? path.join(custom, 'Biens') : path.join(ROOT, 'Documents', 'Biens');
export const IMMO_DIR = custom ? path.join(custom, 'Immo') : path.join(ROOT, 'Documents', 'Immo'); // pièces jointes des actions du plan d'actions
export const BACKUP_DIR = path.join(HOME, 'Sauvegardes');
export const REPORTS_DIR = path.join(HOME, 'Rapports');
export const VERSIONS_DIR = path.join(HOME, 'Versions');
export const PORT = Number(process.env.COMPTES_PORT || process.env.PORT || 3210);
