// Checks every state machine in machines.js is well formed, and the key flows.
const test = require('node:test');
const assert = require('node:assert');
const { createMachine, DEFS } = require('../machines.js');

test('every transition points at a real state, and every state is reachable', () => {
  for (const [name, def] of Object.entries(DEFS)) {
    assert.ok(def.states[def.initial], `${name}: initial state exists`);
    const seen = new Set([def.initial]);
    const todo = [def.initial];
    while (todo.length) {
      const st = todo.pop();
      for (const [ev, to] of Object.entries(def.states[st].on || {})) {
        assert.ok(def.states[to], `${name}: ${st} --${ev}--> ${to} exists`);
        if (!seen.has(to)) { seen.add(to); todo.push(to); }
      }
    }
    assert.deepStrictEqual([...seen].sort(), Object.keys(def.states).sort(), `${name}: all states reachable`);
  }
});

test('events a state does not allow are ignored', () => {
  const m = createMachine(DEFS.POWER);
  assert.strictEqual(m.send('ENABLE'), false); // can't switch on before attaching
  assert.strictEqual(m.state, 'detached');
  assert.ok(m.send('ATTACHED') && m.send('ENABLE'));
  assert.strictEqual(m.state, 'on');
  assert.strictEqual(m.send('ENABLE'), false);
});

test('auto-start fires once per page', () => {
  const m = createMachine(DEFS.AUTOSTART);
  m.send('ARM'); m.send('FIRE');
  assert.strictEqual(m.state, 'fired');
  assert.strictEqual(m.send('ARM'), false);
});

test('popup ignores a second click while switching', () => {
  const m = createMachine(DEFS.POPUP);
  m.send('READY_OFF');
  assert.ok(m.send('TOGGLE'));
  assert.strictEqual(m.send('TOGGLE'), false);
  m.send('TURNED_ON');
  assert.strictEqual(m.state, 'on');
});

test('converter: one batch at a time, files go queued -> done', () => {
  const b = createMachine(DEFS.BATCH);
  assert.ok(b.send('START'));
  assert.strictEqual(b.send('START'), false);
  const f = createMachine(DEFS.FILE);
  ['START', 'DECODED', 'FINISHED'].forEach((e) => assert.ok(f.send(e)));
  assert.strictEqual(f.state, 'done');
  assert.strictEqual(f.send('START'), false); // a finished file is never converted twice
});

test('change listeners get to, from and event', () => {
  const m = createMachine(DEFS.SCOPE);
  const seen = [];
  m.onChange((to, from, ev) => seen.push([to, from, ev]));
  m.send('USE_SITE');
  assert.deepStrictEqual(seen, [['site', 'global', 'USE_SITE']]);
});

test('preset is derived from settings', () => {
  const { presetFor, DEFAULTS, PRESETS } = require('../engine.js');
  assert.strictEqual(presetFor(DEFAULTS), 'classic');
  for (const [id, p] of Object.entries(PRESETS)) assert.strictEqual(presetFor(Object.assign({}, DEFAULTS, p)), id);
  assert.strictEqual(presetFor(Object.assign({}, DEFAULTS, { reverb: 0.05 })), '');
  assert.strictEqual(presetFor(Object.assign({}, DEFAULTS, { syncBpm: true })), '');
});
