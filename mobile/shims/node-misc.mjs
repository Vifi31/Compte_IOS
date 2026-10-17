// Modules Node sans équivalent sur téléphone : versions neutres pour que le code de lib/ se charge.
export const fileURLToPath = u => decodeURIComponent(new URL(u).pathname);
export const pathToFileURL = p => new URL('file://' + p);
export const tmpdir = () => '/tmp';
export const homedir = () => '/comptes';
export const hostname = () => 'mobile';
export const totalmem = () => (navigator.deviceMemory ?? 0) * 2 ** 30;
export const freemem = () => 0;
export const cpus = () => Array.from({ length: navigator.hardwareConcurrency ?? 1 }, () => ({ model: 'mobile' }));
export const platform = () => 'android';
export const release = () => '';
export const type = () => 'Mobile';
export const EOL = '\n';
const unavailable = what => () => { throw new Error(what + ' indisponible dans l’appli mobile'); };
export const spawn = unavailable('Lancement de processus');
export const exec = spawn, execSync = spawn, execFile = spawn;
export const request = unavailable('Connexion HTTP directe'), get = request, createServer = request;
export default { fileURLToPath, pathToFileURL, tmpdir, homedir, hostname, totalmem, freemem, cpus, platform, release, type, EOL, spawn, exec, execSync, execFile, request, get, createServer };
