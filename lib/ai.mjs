// Appel d'un fournisseur d'IA : Anthropic, compatibles OpenAI (dont plusieurs offres gratuites), Ollama / LM Studio en local.
// group : local (sans IA) | paid | free-api (offre gratuite limitée, via Internet) | free-local (modèle sur votre PC)
// protocol : protocole d'appel (anthropic | openai | ollama) ; localModel : rien ne quitte l'ordinateur.
// Les appels passent par extFetch (lib/apis.mjs) : service activable, adresse modifiable, appel journalisé.
import { extFetch, recordCall, endpointOf } from './apis.mjs';

export const PROVIDERS = {
  local: { label: 'Analyse locale (sans IA externe)', group: 'local', model: '', endpoint: '', note: 'Statistiques locales, aucune donnée envoyée, aucun coût.' },
  anthropic: { label: 'Anthropic (Claude)', group: 'paid', protocol: 'anthropic', model: 'claude-sonnet-5-5', endpoint: 'https://api.anthropic.com', models: ['claude-sonnet-5-5', 'claude-haiku-4-5-20251001'], keyUrl: 'https://console.anthropic.com/settings/keys', note: 'API Messages d’Anthropic. Clé API payante à l’usage.' },
  openai: { label: 'Compatible OpenAI', group: 'paid', protocol: 'openai', model: 'gpt-4o-mini', endpoint: 'https://api.openai.com/v1', models: ['gpt-4o-mini'], keyUrl: 'https://platform.openai.com/api-keys', note: 'OpenAI ou tout service compatible (adresse modifiable).' },

  gemini: { label: 'Google Gemini', group: 'free-api', protocol: 'openai', model: 'gemini-2.0-flash', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'], keyUrl: 'https://aistudio.google.com/apikey', note: 'Offre gratuite généreuse (limites par minute et par jour). Clé gratuite via Google AI Studio.' },
  groq: { label: 'Groq (Llama, très rapide)', group: 'free-api', protocol: 'openai', model: 'llama-3.3-70b-versatile', endpoint: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], keyUrl: 'https://console.groq.com/keys', note: 'Offre gratuite avec limites de débit. Modèles Llama open source, réponses très rapides.' },
  openrouter: { label: 'OpenRouter (modèles « :free »)', group: 'free-api', protocol: 'openai', model: 'meta-llama/llama-3.3-70b-instruct:free', endpoint: 'https://openrouter.ai/api/v1', models: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-2-9b-it:free', 'mistralai/mistral-7b-instruct:free', 'deepseek/deepseek-chat-v3-0324:free'], keyUrl: 'https://openrouter.ai/keys', note: 'Catalogue de modèles gratuits (suffixe :free), la liste évolue. Une clé gratuite suffit.' },
  mistral: { label: 'Mistral AI', group: 'free-api', protocol: 'openai', model: 'mistral-small-latest', endpoint: 'https://api.mistral.ai/v1', models: ['mistral-small-latest', 'open-mistral-nemo'], keyUrl: 'https://console.mistral.ai/api-keys', note: 'Palier gratuit « Experiment » (débit limité). Éditeur français.' },
  cerebras: { label: 'Cerebras', group: 'free-api', protocol: 'openai', model: 'llama3.1-8b', endpoint: 'https://api.cerebras.ai/v1', models: ['llama3.1-8b', 'llama-3.3-70b'], keyUrl: 'https://cloud.cerebras.ai', note: 'Offre gratuite avec quotas ; modèles Llama.' },
  github: { label: 'GitHub Models', group: 'free-api', protocol: 'openai', model: 'gpt-4o-mini', endpoint: 'https://models.inference.ai.azure.com', models: ['gpt-4o-mini', 'Meta-Llama-3.1-70B-Instruct', 'Mistral-large-2407'], keyUrl: 'https://github.com/marketplace/models', note: 'Gratuit (limites de prototypage) avec un compte GitHub : la clé est un jeton d’accès personnel GitHub.' },
  huggingface: { label: 'Hugging Face', group: 'free-api', protocol: 'openai', model: 'meta-llama/Llama-3.1-8B-Instruct', endpoint: 'https://router.huggingface.co/v1', models: ['meta-llama/Llama-3.1-8B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'], keyUrl: 'https://huggingface.co/settings/tokens', note: 'Crédits d’inférence gratuits mensuels avec un compte ; jeton d’accès Hugging Face.' },

  ollama: { label: 'Ollama (modèle local)', group: 'free-local', protocol: 'ollama', localModel: true, model: 'llama3.2:3b', endpoint: 'http://localhost:11434', models: ['llama3.2:3b', 'llama3.1:8b', 'qwen2.5:7b', 'mistral:7b', 'gemma2:9b', 'phi3.5'], keyUrl: 'https://ollama.com/download', note: 'Gratuit et confidentiel : le modèle tourne sur votre PC (installer Ollama, puis télécharger un modèle : bouton ci-dessous ou « ollama pull llama3.2:3b »). 8 Go de mémoire conseillés.' },
  lmstudio: { label: 'LM Studio (modèle local)', group: 'free-local', protocol: 'openai', localModel: true, keyOptional: true, model: 'local-model', endpoint: 'http://localhost:1234/v1', models: ['local-model'], keyUrl: 'https://lmstudio.ai', note: 'Gratuit et confidentiel : chargez un modèle dans LM Studio puis démarrez son serveur local ; indiquez le nom du modèle chargé.' },
};

async function post(svc, url, headers, body, timeoutMs = 120000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await extFetch(svc, url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* texte brut */ }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}` + (json?.error?.message ? ' — ' + json.error.message : json?.error && typeof json.error === 'string' ? ' — ' + json.error : raw ? ' — ' + raw.slice(0, 200) : ''));
    return json;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Délai dépassé (le fournisseur IA n\u2019a pas répondu)');
    const code = e.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || e.message === 'fetch failed') throw new Error(`Connexion impossible à ${new URL(url).origin}${code ? ' (' + code + ')' : ''} : vérifiez que le service est démarré et que l\u2019adresse est correcte.`);
    throw e;
  } finally { clearTimeout(t); }
}

export async function callAI(cfg, key, { system, user }) {
  const p = cfg.provider, def = PROVIDERS[p];
  if (!def || p === 'local') throw new Error('Aucun fournisseur IA configuré');
  const proto = def.protocol, model = cfg.model || def.model, base = (cfg.endpoint || endpointOf('ai:' + p) || def.endpoint).replace(/\/+$/, ''), max = Math.min(8000, Math.max(300, +cfg.maxTokens || 2000));
  if (proto !== 'ollama' && !def.keyOptional && !key) throw new Error('Clé API manquante : renseignez-la dans Analyse › Paramètres IA' + (def.keyUrl ? ' (clé à obtenir sur ' + def.keyUrl + ')' : ''));
  if (proto === 'anthropic') {
    const j = await post('ai:' + p, base + '/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, { model, max_tokens: max, system, messages: [{ role: 'user', content: user }] });
    const text = (j.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    if (!text) throw new Error('Réponse vide du fournisseur'); return { text, model: j.model ?? model };
  }
  if (proto === 'openai') {
    const j = await post('ai:' + p, base + '/chat/completions', key ? { authorization: 'Bearer ' + key } : {}, { model, max_tokens: max, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
    const text = j.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Réponse vide du fournisseur'); return { text, model: j.model ?? model };
  }
  return callOllama(cfg, { system, user, max });
}

// ---------------- Ollama : adresse, modèles installés, téléchargement
const ollamaBase = cfg => (cfg.endpoint || endpointOf('ai:ollama') || PROVIDERS.ollama.endpoint).replace(/\/+$/, '').replace(/\/(api|v1)$/i, '');
async function get(url, timeoutMs = 4000, svc = 'ai:ollama') {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try { const r = await extFetch(svc, url, { signal: ctl.signal }); if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return await r.json(); } finally { clearTimeout(t); }
}
export async function ollamaModels(cfg) {
  const base = ollamaBase(cfg);
  const tags = await get(base + '/api/tags');
  let version = ''; try { version = (await get(base + '/api/version')).version || ''; } catch { /* ancienne version */ }
  return { base, version, models: (tags.models ?? []).map(m => ({ name: m.name, size: m.size ?? 0 })) };
}
/** « llama3.1 » → « llama3.1:8b » si seul ce modèle est installé ; retourne le nom à utiliser (ou null si absent). */
function resolveInstalled(want, installed) {
  const names = installed.map(m => m.name);
  if (names.includes(want)) return want;
  if (!want.includes(':')) { const hit = names.find(n => n === want + ':latest') ?? names.find(n => n.startsWith(want + ':')); if (hit) return hit; }
  return null;
}
// POST sans délai d'en-têtes (fetch coupe à 5 min) : les modèles locaux sur processeur peuvent être très lents
async function postLong(url, body, timeoutMs) {
  const u = new URL(url), mod = await import(u.protocol === 'https:' ? 'node:https' : 'node:http'), data = JSON.stringify(body), t0 = performance.now();
  const log = (status, error) => recordCall({ service: 'ai:ollama', method: 'POST', url, status, ms: performance.now() - t0, ok: !error, error });
  return new Promise((res0, rej0) => {
    const resolve = v => { log(200); res0(v); }, reject = e => { log(0, e.message); rej0(e); };
    const req = mod.request(u, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(raw); } catch { /* texte brut */ }
        if (res.statusCode >= 400) return reject(new Error(res.statusCode + ' ' + (res.statusMessage || '') + (json?.error ? ' — ' + (typeof json.error === 'string' ? json.error : json.error.message) : raw ? ' — ' + raw.slice(0, 200) : '')));
        resolve(json);
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Délai dépassé (le modèle local n’a pas répondu)')); });
    req.on('error', e => reject(new Error('Connexion impossible à ' + u.origin + ' (' + (e.code || e.message) + ')')));
    req.end(data);
  });
}

async function callOllama(cfg, { system, user, max }) {
  const base = ollamaBase(cfg); let model = cfg.model || '';
  let installed = null;
  try { installed = (await ollamaModels(cfg)).models; } catch (e) {
    throw new Error(`Ollama ne répond pas sur ${base} : démarrez l\u2019application Ollama (ou « ollama serve »), ou corrigez l\u2019adresse.`);
  }
  if (!model) model = installed[0]?.name || PROVIDERS.ollama.model;          // sans choix : premier modèle installé
  const found = resolveInstalled(model, installed);
  if (!found) {
    throw new Error(`Modèle « ${model} » introuvable dans Ollama. ` + (installed.length ? 'Modèles installés : ' + installed.map(m => m.name).join(', ') + '. Choisissez-en un dans Analyse › Paramètres IA, ou ' : 'Aucun modèle n\u2019est installé. ') + `${installed.length ? 't' : 'T'}éléchargez-le avec le bouton « Télécharger » des Paramètres IA ou la commande : ollama pull ${model}`);
  }
  const j = await postLong(base + '/api/chat', { model: found, stream: false, options: { num_predict: max, num_ctx: Math.min(32768, Math.max(4096, Math.ceil((system.length + user.length) / 2.2) + max + 512)) }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, 1800000);
  const text = j.message?.content?.trim();
  if (!text) throw new Error('Réponse vide du fournisseur'); return { text, model: j.model ?? found };
}

// téléchargement d'un modèle (suivi de progression)
const pulls = new Map();
export function pullStatus(model) { return pulls.get(model) ?? null; }
export async function startPull(cfg, model) {
  const cur = pulls.get(model); if (cur && !cur.done && !cur.error) return cur;
  const st = { model, status: 'démarrage…', completed: 0, total: 0, done: false, error: null, startedAt: Date.now() }; pulls.set(model, st);
  (async () => {
    try {
      const res = await extFetch('ai:ollama', ollamaBase(cfg) + '/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: model, stream: true }) });
      if (!res.ok) { const t = await res.text(); throw new Error(res.status + ' ' + (JSON.parse(t || '{}').error ?? res.statusText)); }
      const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;
          const j = JSON.parse(line); if (j.error) throw new Error(j.error);
          st.status = j.status ?? st.status; if (j.total) { st.total = j.total; st.completed = j.completed ?? 0; }
        }
      }
      st.done = true; st.status = 'terminé';
    } catch (e) { st.error = e.cause?.code === 'ECONNREFUSED' ? 'Ollama ne répond pas : démarrez-le puis réessayez.' : String(e.message || e); }
  })();
  return st;
}

/** Modèles disponibles d'un fournisseur local (Ollama : /api/tags ; LM Studio : /models). */
export async function listLocalModels(cfg) {
  const def = PROVIDERS[cfg.provider];
  if (def?.protocol === 'ollama') return { kind: 'ollama', ...(await ollamaModels(cfg)) };
  if (def?.localModel) { const base = (cfg.endpoint || def.endpoint).replace(/\/+$/, ''); const j = await get(base + '/models', 4000, 'ai:' + cfg.provider); return { kind: 'openai', base, version: '', models: (j.data ?? []).map(m => ({ name: m.id, size: 0 })) }; }
  throw new Error('Ce fournisseur n\u2019a pas de liste de modèles locale');
}
