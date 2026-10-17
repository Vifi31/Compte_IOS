// Construit le moteur local de l'appli mobile : lib/app.mjs + adaptateurs → public/mobile/engine.js (esbuild).
// Les modules Node (fs, node:sqlite, zlib…) sont remplacés par les adaptateurs de mobile/shims/.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'mobile');
const shim = f => path.join(ROOT, 'mobile', 'shims', f);
const misc = shim('node-misc.mjs');
const alias = {
  fs: shim('fs.mjs'), zlib: shim('zlib.mjs'), crypto: shim('crypto.mjs'), 'node:sqlite': shim('sqlite.mjs'),
  path: 'path-browserify', os: misc, url: misc, child_process: misc, http: misc, https: misc,
};
for (const k of Object.keys(alias)) if (!k.startsWith('node:')) alias['node:' + k] = alias[k];

fs.rmSync(OUT, { recursive: true, force: true });
const t0 = Date.now();
await build({
  entryPoints: [path.join(ROOT, 'mobile', 'engine.mjs')], outfile: path.join(OUT, 'engine.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', conditions: ['browser'], mainFields: ['browser', 'module', 'main'],
  alias, inject: [shim('process.mjs')], define: { global: 'globalThis' },
  minify: !process.env.NO_MINIFY, sourcemap: true, legalComments: 'linked', metafile: true, logLevel: 'warning',
});
fs.copyFileSync(path.join(ROOT, 'node_modules/sql.js/dist/sql-wasm.wasm'), path.join(OUT, 'sql-wasm.wasm'));
fs.copyFileSync(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'), path.join(OUT, 'pdf.worker.mjs'));
const size = f => (fs.statSync(path.join(OUT, f)).size / 1024 / 1024).toFixed(2) + ' Mo';
console.log(`Moteur mobile construit en ${Date.now() - t0} ms : engine.js ${size('engine.js')}, sql-wasm.wasm ${size('sql-wasm.wasm')}, pdf.worker.mjs ${size('pdf.worker.mjs')}`);


// Dossier web de l'appli Capacitor (capacitor.config.json › webDir) : l'interface, Chart.js et le moteur local.
const WWW = path.join(ROOT, 'mobile', 'www');
fs.rmSync(WWW, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), WWW, { recursive: true });
fs.mkdirSync(path.join(WWW, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'node_modules/chart.js/dist/chart.umd.js'), path.join(WWW, 'vendor', 'chart.js'));
console.log('Appli web prête pour Capacitor :', path.relative(ROOT, WWW));
