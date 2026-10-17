// Serveur local : API JSON (cœur dans lib/app.mjs) + fichiers statiques. Aucune dépendance autre que pdfjs-dist / chart.js.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { api, json, importStatements, operationsCount } from './lib/app.mjs';
import { ROOT, PORT } from './lib/paths.mjs';
const PUBLIC = path.join(ROOT, 'public');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let file = url.pathname === '/vendor/chart.js'
      ? path.join(ROOT, 'node_modules/chart.js/dist/chart.umd.js')
      : path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) && !file.includes('chart.umd.js')) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) { console.error(e); json(res, 500, { error: String(e.message || e) }); }
});

console.log('Import des relevés…');
await importStatements();
server.listen(PORT, '127.0.0.1', () => console.log(`Comptes → http://localhost:${PORT}  (${operationsCount()} opérations)`));
