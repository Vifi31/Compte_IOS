// Moteur local de l'appli mobile : exécute le cœur de l'application (lib/app.mjs) dans la WebView, sans serveur.
// Construit par mobile/build.mjs (esbuild) vers public/mobile/engine.js, chargé par public/api.js en mode local.
// Chaque requête /api/… de l'interface devient un couple req/res minimal, traité par les mêmes routes que sur PC.
import { Buffer } from 'buffer';
import { mount, seed } from './shims/fs.mjs';
import fs from './shims/fs.mjs';
import { initSqlite } from './shims/sqlite.mjs';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pkg from '../package.json';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

const BASE = new URL('.', import.meta.url).href; // dossier du moteur (sql-wasm.wasm, pdf.worker.mjs)

/** Requête façon Node (http.IncomingMessage) à partir d'une Request : corps lisible en flux ou d'un bloc. */
function nodeReq(request, body) {
  const ev = { data: [], end: [], error: [] };
  const req = {
    method: request.method, url: new URL(request.url).pathname + new URL(request.url).search,
    headers: Object.fromEntries(request.headers.entries()),
    on(name, fn) { (ev[name] ??= []).push(fn); if (name === 'end') queueMicrotask(() => { if (body.length) ev.data.forEach(f => f(body)); ev.end.forEach(f => f()); ev.end = []; }); return req; },
    destroy() {}, setTimeout() {},
    async *[Symbol.asyncIterator]() { if (body.length) yield body; },
  };
  return req;
}

/** Réponse façon Node (http.ServerResponse) qui se termine en Response. */
function nodeRes() {
  let done; const finished = new Promise(r => { done = r; });
  const headers = {}, chunks = [];
  const res = {
    statusCode: 200, headersSent: false,
    setHeader: (k, v) => { headers[k.toLowerCase()] = String(v); },
    getHeader: k => headers[k.toLowerCase()],
    writeHead(code, h = {}) { res.statusCode = code; for (const [k, v] of Object.entries(h)) res.setHeader(k, v); res.headersSent = true; return res; },
    write(c) { if (c != null) chunks.push(typeof c === 'string' ? Buffer.from(c) : c); return true; },
    end(c) { res.write(c); done(); return res; },
    on() { return res; }, once() { return res; }, emit() { return false; },
  };
  return { res, finished, response: () => new Response(chunks.length ? Buffer.concat(chunks.map(c => Buffer.from(c))) : null, { status: res.statusCode, headers }) };
}

async function boot() {
  const t0 = performance.now(), n = await mount();
  seed('/app/package.json', JSON.stringify(pkg));
  for (const d of ['/tmp', '/app/lib', '/app/public', '/app/scripts', '/comptes/data', '/comptes/Releves', '/comptes/Biens', '/comptes/Immo', '/comptes/Sauvegardes', '/comptes/Rapports', '/comptes/Versions']) fs.mkdirSync(d, { recursive: true });
  await initSqlite(BASE + 'sql-wasm.wasm');
  GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.mjs';
  const app = await import('../lib/app.mjs');
  await app.importStatements();
  console.log(`Moteur local prêt : ${n} élément(s) chargé(s), ${app.operationsCount()} opération(s), ${Math.round(performance.now() - t0)} ms`);
  return app;
}
const ready = boot();

async function handle(request) {
  const app = await ready, url = new URL(request.url);
  const body = ['GET', 'HEAD'].includes(request.method) ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
  const { res, finished, response } = nodeRes();
  try { await app.api(nodeReq(request, body), res, url); } catch (e) { console.error(e); if (!res.headersSent) app.json(res, 500, { error: String(e.message || e) }); }
  await finished;
  return response();
}

// Liens de fichiers (PDF, ZIP…) : la réponse du moteur est mise dans un objet Blob local.
// Les liens (apiUrl) pointent vers #api-fichier=… : public/api.js intercepte le clic et appelle openFile.
async function openFile(url, download) {
  const r = await handle(new Request(new URL(url, location.origin)));
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Fichier introuvable');
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')?.[1] || url.split('name=').pop() || 'fichier';
  const blob = await r.blob();
  if (Capacitor.isNativePlatform()) { // la WebView Android n'ouvre ni ne télécharge les Blob : fichier temporaire, puis menu « Ouvrir avec / Partager »
    const data = Buffer.from(await blob.arrayBuffer()).toString('base64'), file = decodeURIComponent(name).replace(/[\\/:*?"<>|]/g, '_');
    const { uri } = await Filesystem.writeFile({ path: file, data, directory: Directory.Cache });
    await Share.share({ title: file, url: uri, dialogTitle: download ? 'Enregistrer ou envoyer' : 'Ouvrir avec' });
    return;
  }
  const href = URL.createObjectURL(blob);
  if (download || /attachment/.test(r.headers.get('content-disposition') || '')) { const a = Object.assign(document.createElement('a'), { href, download: decodeURIComponent(name) }); a.click(); }
  else window.open(href, '_blank');
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

apiUseLocal(handle, openFile);

// Bouton « retour » d'Android : referme le menu ou la fenêtre ouverte, sinon page précédente, sinon quitte l'appli.
if (Capacitor.isNativePlatform()) App.addListener('backButton', ({ canGoBack }) => {
  const modal = document.getElementById('modalRoot');
  if (document.body.classList.contains('nav-open')) document.body.classList.remove('nav-open');
  else if (modal?.children.length) modal.innerHTML = '';
  else if (canGoBack && !['', '#', '#/', '#/dashboard'].includes(location.hash)) history.back();
  else App.exitApp();
});
