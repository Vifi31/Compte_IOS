// Génère MANIFEST.json pour un dossier de programme : node scripts/manifest.mjs [dossier]
import fs from 'fs';
import path from 'path';
import { buildManifest, MANIFEST_FILE } from '../lib/manifest.mjs';

const root = path.resolve(process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..'));
const mf = buildManifest({ root, store: null, nodeVersion: process.version, installed: process.argv.includes('--installed') });
fs.writeFileSync(path.join(root, MANIFEST_FILE), JSON.stringify(mf, null, 2));
console.log(`${MANIFEST_FILE} : v${mf.version}, ${mf.summary.files} fichiers, empreinte ${mf.integrity.slice(0, 16)}…`);
