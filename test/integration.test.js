import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('companion serves site and routes agent, observer, pruning and access checks', { timeout: 20000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'murmur-test-')); const port = 43000 + Math.floor(Math.random() * 1000);
  const executable = resolve('fixtures/mock-codex.js'); await chmod(executable, 0o755);
  const child = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, MURMUR_PORT: String(port), MURMUR_TOKEN: 'test-secret', MURMUR_DATA: join(dir, 'room.json'), MURMUR_CODEX: executable }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}`;
  const request = async (path, body, headers = {}) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Murmur-Token': 'test-secret', 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return [response.status, response.headers.get('content-type'), await response.text()];
  };
  try {
    let ready = false; for (let i = 0; i < 60; i++) { try { await fetch(base + '/health'); ready = true; break; } catch { await new Promise(r => setTimeout(r, 50)); } } assert.ok(ready);
    assert.match((await request('/'))[2], /Murmur/);
    assert.equal((await request('/api/state', undefined, { Origin: 'https://evil.example' }))[0], 403);
    assert.equal((await request('/api/state', undefined, { 'X-Murmur-Token': 'wrong' }))[0], 401);
    assert.equal((await request('/api/agents', { name: 'Ada', seed: 123 }))[0], 200);
    assert.equal((await request('/api/message', { content: 'Hello Ada' }))[0], 200);
    let state = JSON.parse((await request('/api/state'))[2]); const id = state.agents[0].id;
    assert.equal((await request('/api/turn', { id }))[0], 202);
    for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 40)); state = JSON.parse((await request('/api/state'))[2]); if (!state.busy && state.messages.length === 2) break; }
    assert.equal(state.messages[1].actor, id);
    assert.match(state.messages[1].content, /I hear you/);
    for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 40)); state = JSON.parse((await request('/api/state'))[2]); if (state.observations.length) break; }
    assert.match(state.observations.at(-1).text, /discussing the opening/);
    assert.equal(state.messages.length, 2, 'observer must not speak in the room');
    assert.equal((await request('/api/settings', { auto: true, maxTurns: 2, delayMs: 1000 }))[0], 200);
    for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 40)); state = JSON.parse((await request('/api/state'))[2]); if (state.turnCount === 2 && !state.busy && !state.settings.auto) break; }
    assert.equal(state.turnCount, 2); assert.equal(state.settings.auto, false);
    assert.equal((await request('/api/prune', { id }))[0], 200);
    assert.equal(JSON.parse((await request('/api/state'))[2]).agents[0].active, false);
    assert.equal((await request('/api/turn', { id }))[0], 400);
    assert.equal((await request('/api/restore', { id }))[0], 200);
  } finally { child.kill(); await rm(dir, { recursive: true, force: true }); }
});
