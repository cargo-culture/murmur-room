import test from 'node:test';
import assert from 'node:assert/strict';
import { persona, newAgent, initialState, addMessage, nextAgent, agentPrompt, observerPrompt } from '../server/core.js';

test('seeds create reproducible agent parameters', () => {
  assert.deepEqual(persona(1234), persona(1234));
  const one = newAgent('A', 1234), two = newAgent('B', 5678);
  assert.equal(one.seed, 1234); assert.notDeepEqual(one.persona, two.persona);
});
test('round robin skips pruned agents and keeps history attributed', () => {
  const state = initialState(); const a = newAgent('A', 1), b = newAgent('B', 2), c = newAgent('C', 3); state.agents.push(a,b,c);
  assert.equal(nextAgent(state), a);
  addMessage(state, a.id, 'hello'); assert.equal(nextAgent(state), b);
  b.active = false; assert.equal(nextAgent(state), c);
  assert.match(agentPrompt(state, c), /A: hello/);
  assert.match(observerPrompt(state), /A: hello/);
});
