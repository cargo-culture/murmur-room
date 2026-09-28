const $ = id => document.getElementById(id);
let endpoint = sessionStorage.getItem('murmur-endpoint') || 'http://127.0.0.1:4317';
let token = sessionStorage.getItem('murmur-token') || '';
let previousRevision = -1, pollBusy = false, state = null;
$('endpoint').value = endpoint; $('token').value = token;
function status(text, online = false) { $('connection').textContent = text; $('connection').classList.toggle('online', online); }
function error(text = '') { $('error').textContent = text; }
async function api(path, body) {
  const response = await fetch(`${endpoint}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Murmur-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); return data;
}
async function action(path, body) { try { error(); await api(path, body); await refresh(true); } catch (e) { error(e.message); } }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function date(value) { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function render(next) {
  const list = $('agents'); list.replaceChildren();
  for (const agent of next.agents) {
    const item = el('div', `agent${agent.active ? '' : ' inactive'}`);
    const head = el('div', 'agent-head'); head.append(el('span', 'avatar', agent.name.slice(0, 1).toUpperCase()), el('strong', '', agent.name)); item.append(head);
    item.append(el('div', 'seed', `${agent.persona.stance} · ${agent.persona.tempo} · ${agent.persona.focus} · #${agent.seed}`));
    const buttons = el('div', 'buttons'); const turn = el('button', '', 'Give floor'); turn.disabled = !agent.active || next.busy; turn.onclick = () => action('/api/turn', { id: agent.id });
    const prune = el('button', '', agent.active ? 'Prune' : 'Restore'); prune.onclick = () => action(agent.active ? '/api/prune' : '/api/restore', { id: agent.id });
    buttons.append(turn, prune); item.append(buttons); list.append(item);
  }
  if (!next.agents.length) list.append(el('p', 'muted', 'No agents yet. Invite one to begin.'));
  const messages = $('messages'); const nearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 100;
  messages.replaceChildren();
  if (!next.messages.length) { const intro = el('div', 'empty'); intro.append(el('b', '', 'The room is quiet.'), el('span', '', 'Invite agents, start with your own thought, then give one the floor.')); messages.append(intro); }
  for (const msg of next.messages) {
    const agent = next.agents.find(a => a.id === msg.actor);
    const item = el('article', `message ${msg.actor === 'user' ? 'user' : msg.actor === 'system' ? 'system' : 'agent'}`);
    item.append(el('div', 'meta', `${msg.actor === 'user' ? 'You' : agent?.name || (msg.actor === 'system' ? 'System' : 'Former agent')} · ${date(msg.time)}`), el('div', 'bubble', msg.content)); messages.append(item);
  }
  if (nearBottom) messages.scrollTop = messages.scrollHeight;
  const notes = $('observations'); notes.replaceChildren();
  for (const note of [...next.observations].reverse()) { const n = el('div', 'observation'); n.append(el('time', '', date(note.time)), el('span', '', note.text)); notes.append(n); }
  if (!next.observations.length) notes.append(el('p', 'muted', 'Notes appear after the conversation begins.'));
  $('count').textContent = `${next.messages.length} messages`; $('working').hidden = !next.busy;
  $('auto').checked = next.settings.auto; $('observer').checked = next.settings.observer;
  if (document.activeElement !== $('max-turns')) $('max-turns').value = next.settings.maxTurns;
  if (document.activeElement !== $('delay')) $('delay').value = next.settings.delayMs / 1000;
}
async function refresh(force = false) {
  if (pollBusy && !force) return; pollBusy = true;
  try { const next = await api('/api/state'); state = next; if (force || next.revision !== previousRevision) { render(next); previousRevision = next.revision; } status('● Companion connected', true); if (next.settings.auto && !next.busy) status('● Automatic flow active', true); }
  catch (e) { status('○ Companion disconnected'); if (force) error(e.message === 'Failed to fetch' ? 'Cannot reach the companion. Check that it is running and that this site is allowed to access the local network.' : e.message); }
  finally { pollBusy = false; }
}
$('connect-form').onsubmit = event => { event.preventDefault();
  const value = $('endpoint').value.trim().replace(/\/+$/, '');
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(value) && !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) return error('Use a loopback HTTP URL or an HTTPS server hostname, without a path.');
  endpoint = value; token = $('token').value.trim(); sessionStorage.setItem('murmur-endpoint', endpoint); sessionStorage.setItem('murmur-token', token); refresh(true);
};
$('add-form').onsubmit = async event => { event.preventDefault(); const name = $('agent-name').value.trim(); if (!name) return; await action('/api/agents', { name }); $('agent-name').value = ''; };
$('composer').onsubmit = async event => { event.preventDefault(); const content = $('message').value.trim(); if (!content) return; await action('/api/message', { content }); $('message').value = ''; };
$('message').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('composer').requestSubmit(); } };
$('auto').onchange = () => action('/api/settings', { auto: $('auto').checked });
$('observer').onchange = () => action('/api/settings', { observer: $('observer').checked });
$('max-turns').onchange = () => action('/api/settings', { maxTurns: Number($('max-turns').value) });
$('delay').onchange = () => action('/api/settings', { delayMs: Number($('delay').value) * 1000 });
$('stop').onclick = () => action('/api/stop', {});
setInterval(() => { if (token) refresh(); }, 1200); if (token) refresh(true); else status('○ Connect companion');
