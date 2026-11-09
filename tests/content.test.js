// Runs content.js against a fake page + fake chrome APIs to check the message flow.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let WA = null;
try { WA = require('node-web-audio-api'); } catch (e) { /* skip */ }
const opts = { skip: !WA && 'node-web-audio-api not installed' };

function makePage({ sync = {}, local = {}, media = {}, noMedia = false } = {}) {
  const listeners = [];
  const badge = [];
  const observers = [];
  const store = { sync: Object.assign({}, sync), local: Object.assign({}, local) };
  const area = (name) => ({
    get(keys, cb) {
      const s = store[name];
      if (keys === null) return cb(Object.assign({}, s));
      const ks = Array.isArray(keys) ? keys : [keys];
      const out = {}; ks.forEach((k) => { if (k in s) out[k] = s[k]; }); cb(out);
    },
    set(obj) { Object.assign(store[name], obj); },
    remove(k) { delete store[name][k]; },
  });
  const video = Object.assign({ paused: false, currentSrc: 'blob:https://www.youtube.com/x', crossOrigin: null, mediaKeys: null, addEventListener() {} }, media);
  class FakeCtx extends WA.OfflineAudioContext {
    constructor() { super(2, 44100, 44100); }
    createMediaElementSource() { return this.createGain(); }
    resume() { return Promise.resolve(); }
  }
  const window = {
    location: { hostname: 'www.youtube.com', origin: 'https://www.youtube.com', href: 'https://www.youtube.com/watch' },
    AudioContext: FakeCtx,
  };
  window.self = window;
  const sandbox = {
    window, self: window, console, setTimeout, clearTimeout, URL, Float32Array, Math,
    location: window.location,
    MutationObserver: class { constructor(f) { observers.push(f); } observe() {} },
    document: {
      documentElement: {},
      querySelector: (sel) => (!noMedia && sel.includes('html5-main-video') ? video : null),
      querySelectorAll: () => (noMedia ? [] : [video]),
    },
    chrome: {
      storage: { sync: area('sync'), local: area('local') },
      runtime: {
        onMessage: { addListener: (f) => listeners.push(f) },
        sendMessage: (m, cb) => { badge.push(m); if (cb) cb(); },
        lastError: undefined,
      },
    },
  };
  vm.createContext(sandbox);
  for (const f of ['engine.js', 'machines.js', 'content.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox);
  }
  const send = (msg) => new Promise((resolve) => {
    let done = false;
    const r = listeners[0](msg, {}, (x) => { done = true; resolve(x); });
    if (!r && !done) resolve(undefined);
  });
  return { send, store, sandbox, listeners, badge, observers };
}

test('v1 saved settings are picked up', opts, async () => {
  const p = makePage({ sync: { intensity: 2.4, rotationSpeed: 0.05 } });
  const st = await p.send({ action: 'getState' });
  assert.strictEqual(st.intensity, 2.4);
  assert.strictEqual(st.rotationSpeed, 0.05);
  assert.strictEqual(st.pattern, 'circle');
  assert.strictEqual(st.enabled, false);
});

test('toggle on/off and live position', opts, async () => {
  const p = makePage();
  assert.strictEqual((await p.send({ action: 'toggle' })).enabled, true);
  const pos = await p.send({ action: 'getPosition' });
  assert.ok(pos && Number.isFinite(pos.x));
  assert.strictEqual((await p.send({ action: 'toggle' })).enabled, false);
});

test('script loaded twice only registers once', opts, async () => {
  const p = makePage();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8'), p.sandbox);
  assert.strictEqual(p.listeners.length, 1);
});

test('DRM media is refused instead of muting the page', opts, async () => {
  const p = makePage({ media: { mediaKeys: {} } });
  const r = await p.send({ action: 'toggle' });
  assert.strictEqual(r.enabled, false);
  assert.match(r.error, /DRM/);
});

test('settings save globally, or per site when asked', opts, async () => {
  const p = makePage();
  await p.send({ action: 'set', patch: { reverb: 0.4 }, preset: '' });
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(p.store.sync.reverb, 0.4);
  await p.send({ action: 'setPerSite', value: true });
  await p.send({ action: 'set', patch: { bass: 5 }, preset: '' });
  await new Promise((r) => setTimeout(r, 500));
  assert.strictEqual(p.store.local['site:www.youtube.com'].settings.bass, 5);
  assert.notStrictEqual(p.store.sync.bass, 5);
});

test('old v1 popup messages still work', opts, async () => {
  const p = makePage();
  await p.send({ action: 'setIntensity', value: 2.2 });
  assert.strictEqual((await p.send({ action: 'getIntensity' })).intensity, 2.2);
});

const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('badge follows the real on/off state, and a fresh page clears it', opts, async () => {
  const p = makePage();
  assert.deepStrictEqual(p.badge.map((m) => m.enabled), [false]);
  await p.send({ action: 'toggle' });
  await p.send({ action: 'toggle' });
  assert.deepStrictEqual(p.badge.filter((m) => m.action === 'powerChanged').map((m) => m.enabled), [false, true, false]);
});

test('turning off when never on does nothing (no impossible state)', opts, async () => {
  const p = makePage();
  const r = await p.send({ action: 'setEnabled', value: false });
  assert.strictEqual(r.enabled, false);
  assert.strictEqual((await p.send({ action: 'getState' })).power, 'detached');
});

test('preset is worked out from the settings, never stale', opts, async () => {
  const p = makePage();
  assert.strictEqual((await p.send({ action: 'getState' })).preset, 'classic');
  await p.send({ action: 'set', patch: { reverb: 0.3 }, preset: 'classic' }); // old popup lying about preset
  assert.strictEqual((await p.send({ action: 'getState' })).preset, '');
  await p.send({ action: 'set', patch: { reverb: 0 } });
  assert.strictEqual((await p.send({ action: 'getState' })).preset, 'classic');
  await p.send({ action: 'set', patch: { syncBpm: true } });
  assert.strictEqual((await p.send({ action: 'getState' })).preset, '');
});

test('a tweak right before "remember for this site" is saved globally (where it was made)', opts, async () => {
  const p = makePage();
  await p.send({ action: 'set', patch: { treble: 4 } });
  await p.send({ action: 'setPerSite', value: true }); // within the 400 ms batch window
  assert.strictEqual(p.store.sync.treble, 4);
  await tick(500);
  assert.strictEqual(p.store.local['site:www.youtube.com'].settings.treble, 4);
});

test('auto-start fires once when a player shows up', opts, async () => {
  const p = makePage({ local: { 'site:www.youtube.com': { autoStart: true } } });
  await tick(10);
  const st = await p.send({ action: 'getState' });
  assert.strictEqual(st.enabled, true);
  await p.send({ action: 'toggle' }); // user turns it off
  p.observers[0]();
  await tick(600);
  assert.strictEqual((await p.send({ action: 'getState' })).enabled, false); // not forced back on
});
