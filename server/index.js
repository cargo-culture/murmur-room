import http from 'node:http';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, join } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { initialState, newAgent, addMessage, nextAgent, agentPrompt, observerPrompt, contentHash } from './core.js';
import { codexReply } from './engine.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = resolve(process.env.MURMUR_DATA || join(root, '.data', 'room.json'));
const host = '127.0.0.1';
const port = Number(process.env.MURMUR_PORT || 4317);
const token = process.env.MURMUR_TOKEN || randomBytes(24).toString('hex');
const allowed = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(process.env.MURMUR_ALLOWED_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean)]);
const publicHost = process.env.MURMUR_PUBLIC_HOST?.trim().toLowerCase();
if (publicHost && (!/^[a-z0-9.-]+$/.test(publicHost) || publicHost.includes('..'))) throw new Error('MURMUR_PUBLIC_HOST must be a hostname without scheme or path.');
if (publicHost && (!process.env.MURMUR_TOKEN || process.env.MURMUR_TOKEN.length < 32)) throw new Error('Remote mode requires a persistent MURMUR_TOKEN of at least 32 characters.');
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, ...(publicHost ? [publicHost] : [])]);
const engine = codexReply;
let state = initialState(), busy = false, controller = null, timer = null, observerTimer = null, observerBusy = false, lastObserved = '';
try { state = { ...initialState(), ...JSON.parse(await readFile(dataPath, 'utf8')) }; state.settings.auto = false; } catch (e) { if (e.code !== 'ENOENT') throw e; }
async function save() { await mkdir(dirname(dataPath), { recursive: true }); const temp = `${dataPath}.tmp`; await writeFile(temp, JSON.stringify(state, null, 2)); await rename(temp, dataPath); }
async function observe() {
  if (observerBusy || !state.settings.observer || !state.messages.length) return;
  const hash = contentHash(state); if (hash === lastObserved) return;
  observerBusy = true;
  try {
    const note = await engine(observerPrompt(state));
    if (state.settings.observer && contentHash(state) === hash) {
      state.observations.push({ id: randomBytes(12).toString('hex'), text: note, time: new Date().toISOString() });
      state.observations = state.observations.slice(-50); lastObserved = hash; state.revision++; await save();
    }
  } catch (e) { console.error('Observer:', e.message); }
  finally { observerBusy = false; if (state.settings.observer && contentHash(state) !== hash) scheduleObserve(); }
}
function scheduleObserve() { clearTimeout(observerTimer); observerTimer = setTimeout(observe, 1200); }
function stopAuto() { clearTimeout(timer); state.settings.auto = false; }
function scheduleTurn() {
  clearTimeout(timer);
  if (state.settings.auto && state.turnCount < state.settings.maxTurns && nextAgent(state)) timer = setTimeout(() => turn().catch(e => console.error(e)), state.settings.delayMs);
  else if (state.settings.auto) { stopAuto(); state.revision++; save().catch(console.error); }
}
async function turn(targetId) {
  if (busy) throw Object.assign(new Error('A turn is already running.'), { status: 409 });
  const agent = targetId ? state.agents.find(a => a.id === targetId && a.active) : nextAgent(state);
  if (!agent) throw Object.assign(new Error('No active agent.'), { status: 400 });
  busy = true; activeAgentId = agent.id; controller = new AbortController(); state.revision++;
  const prompt = agentPrompt(state, agent);
  try {
    const reply = await engine(prompt, { signal: controller.signal });
    if (agent.active && state.agents.includes(agent)) {
      addMessage(state, agent.id, reply); state.turnCount++; await save(); scheduleObserve();
    }
  } catch (e) {
    if (e.name !== 'AbortError') { addMessage(state, 'system', `Turn failed for ${agent.name}: ${e.message.slice(0, 500)}`); await save(); stopAuto(); }
  } finally { busy = false; activeAgentId = null; controller = null; state.revision++; scheduleTurn(); }
}
function json(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
async function body(req) {
  let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 32768) throw Object.assign(new Error('Request too large.'), { status: 413 }); }
  try { return JSON.parse(raw || '{}'); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}
function demand(test, message) { if (!test) throw Object.assign(new Error(message), { status: 400 }); }
async function handle(req, res) {
  const origin = req.headers.origin;
  if (origin && !allowed.has(origin)) return json(res, 403, { error: 'Origin not allowed. Set MURMUR_ALLOWED_ORIGIN to your exact Pages origin.' });
  if (!allowedHosts.has(req.headers.host?.toLowerCase())) return json(res, 403, { error: 'Host not allowed.' });
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Murmur-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Private-Network', 'true'); }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const path = new URL(req.url, `http://${host}:${port}`).pathname;
  if (path === '/health') return json(res, 200, { ok: true, runtime: 'local', version: 1 });
  if (path.startsWith('/api/')) {
    const candidate = req.headers['x-murmur-token'] || '';
    const a = Buffer.from(candidate), b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return json(res, 401, { error: 'Invalid room token.' });
    if (req.method === 'GET' && path === '/api/state') return json(res, 200, { ...state, busy });
    demand(req.method === 'POST', 'Method not allowed.');
    const input = await body(req);
    if (path === '/api/message') {
      demand(typeof input.content === 'string' && input.content.trim() && input.content.length <= 8000, 'Message must be 1–8000 characters.');
      addMessage(state, 'user', input.content); await save(); scheduleObserve(); scheduleTurn();
    } else if (path === '/api/agents') {
      demand(typeof input.name === 'string' && input.name.trim(), 'Give the agent a name.');
      demand(state.agents.length < 1000, 'Room limit reached.');
      state.agents.push(newAgent(input.name, Number.isInteger(input.seed) && input.seed >= 0 && input.seed <= 0xffffffff ? input.seed : undefined)); state.revision++; await save(); scheduleTurn();
    } else if (path === '/api/prune') {
      const agent = state.agents.find(a => a.id === input.id); demand(agent, 'Unknown agent.');
      agent.active = false; if (controller && input.id === activeAgentId) controller.abort(); state.revision++; await save(); scheduleTurn();
    } else if (path === '/api/restore') {
      const agent = state.agents.find(a => a.id === input.id); demand(agent, 'Unknown agent.'); agent.active = true; state.revision++; await save(); scheduleTurn();
    } else if (path === '/api/turn') {
      demand(!busy, 'A turn is already running.');
      const agent = state.agents.find(a => a.id === input.id && a.active); demand(agent, 'Choose an active agent.');
      void turn(agent.id); return json(res, 202, { started: true });
    } else if (path === '/api/settings') {
      if ('maxTurns' in input) { demand(Number.isInteger(input.maxTurns) && input.maxTurns >= 1 && input.maxTurns <= 100, 'maxTurns must be 1–100.'); state.settings.maxTurns = input.maxTurns; }
      if ('delayMs' in input) { demand(Number.isInteger(input.delayMs) && input.delayMs >= 1000 && input.delayMs <= 60000, 'delayMs must be 1000–60000.'); state.settings.delayMs = input.delayMs; }
      if ('observer' in input) { demand(typeof input.observer === 'boolean', 'observer must be boolean.'); state.settings.observer = input.observer; if (input.observer) scheduleObserve(); }
      if ('auto' in input) { demand(typeof input.auto === 'boolean', 'auto must be boolean.'); state.settings.auto = input.auto; if (input.auto) state.turnCount = 0; }
      state.revision++; await save(); scheduleTurn();
    } else if (path === '/api/stop') { stopAuto(); controller?.abort(); state.revision++; await save(); }
    else return json(res, 404, { error: 'Unknown action.' });
    return json(res, 200, { ok: true, revision: state.revision });
  }
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const file = path === '/' ? 'index.html' : path.slice(1);
  if (!['index.html', 'app.js', 'style.css'].includes(file)) return json(res, 404, { error: 'Not found.' });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[extname(file)];
  res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8`, 'Cache-Control': 'no-store' });
  res.end(await readFile(join(root, 'docs', file)));
}
let activeAgentId = null;
const server = http.createServer((req, res) => handle(req, res).catch(e => json(res, e.status || 500, { error: e.message })));
server.listen(port, host, () => {
  console.log(`Murmur Room at http://${host}:${port}`);
  console.log(publicHost ? 'Room token: configured privately' : `Room token: ${token}`);
  console.log(`Allowed origins: ${[...allowed].join(', ')}`);
});
