// Objet process de l'appli mobile (injecté par esbuild) : environnement vide, pas d'arrêt ni de signaux.
export const process = {
  env: { COMPTES_ROOT: '/app', COMPTES_HOME: '/comptes' }, argv: [], version: 'mobile', versions: {}, platform: 'android', arch: 'arm64', execPath: '', pid: 0,
  cwd: () => '/app', uptime: () => performance.now() / 1000, exit: () => {}, on: () => {}, once: () => {}, off: () => {}, emit: () => false,
  loadEnvFile: () => { throw new Error('pas de fichier .env'); }, nextTick: (f, ...a) => queueMicrotask(() => f(...a)), memoryUsage: () => ({ rss: 0, heapUsed: 0, heapTotal: 0 }),
};
export { Buffer } from 'buffer';
