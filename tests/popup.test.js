// Runs popup.js against a fake DOM + fake chrome APIs to check what the popup shows.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function el(id) {
  const classes = new Set();
  const handlers = {};
  return {
    id, value: '', checked: false, disabled: false, textContent: '', style: {}, dataset: {}, attrs: {},
    width: 120, children: [],
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(ev, f) { (handlers[ev] = handlers[ev] || []).push(f); },
    async fire(ev, e) { for (const f of handlers[ev] || []) await f(e || { target: this }); },
    appendChild(c) { this.children.push(c); },
    getContext: () => new Proxy({}, { get: () => () => {} }),
  };
}

function loadPopup({ url = 'https://www.youtube.com/watch?v=1', state = {}, granted = false, toggleResult, pageGone = false } = {}) {
  const els = {};
  const $ = (id) => (els[id] = els[id] || el(id));
  let page = Object.assign({ intensity: 1.5, rotationSpeed: 0.02, pattern: 'circle', reverb: 0, bass: 0, mid: 0, treble: 0, syncBpm: false, bpm: 120, beatsPerLap: 8, enabled: false, perSite: false, autoStart: false, error: '' }, state);
  const sent = [];
  let domReady = null;
  const sandbox = {
    console, setTimeout: () => 0, requestAnimationFrame: () => 0, performance: { now: () => 0 }, URL, Math, Promise,
    document: {
      addEventListener: (ev, f) => { domReady = f; },
      getElementById: $,
      createElement: () => el(''),
      querySelector: () => el(''),
      querySelectorAll: () => [],
    },
    chrome: {
      runtime: { lastError: undefined, getManifest: () => ({ version: '2.1.0' }), sendMessage: (m, cb) => cb && cb({ ok: true }), getURL: (x) => x },
      commands: { getAll: (cb) => cb([]) },
      tabs: {
        query: (q, cb) => cb([{ id: 7, url }]),
        create() {},
        sendMessage: (id, m, cb) => {
          sent.push(m);
          if (pageGone) return cb(undefined);
          if (m.action === 'getState') return cb(page);
          if (m.action === 'setEnabled') {
            const r = toggleResult || { enabled: m.value, error: '' };
            page.enabled = r.enabled;
            return cb(r);
          }
          return cb({ ok: true });
        },
      },
      scripting: { executeScript: async () => {} },
      permissions: { contains: async () => granted, request: async () => true },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['engine.js', 'machines.js', 'popup.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), sandbox);
  domReady();
  const settle = () => new Promise((r) => setImmediate(r));
  return { $, sent, settle };
}

test('shows Connecting… then Enable once the page answers', async () => {
  const p = loadPopup();
  await p.settle();
  assert.strictEqual(p.$('toggle').textContent, 'Enable 8D Audio');
  assert.strictEqual(p.$('toggle').disabled, false);
});

test('turning on: busy while switching, then Disable', async () => {
  const p = loadPopup();
  await p.settle();
  const click = p.$('toggle').fire('click');
  assert.strictEqual(p.$('toggle').textContent, 'Turning on…');
  assert.strictEqual(p.$('toggle').disabled, true);
  await click;
  assert.strictEqual(p.$('toggle').textContent, 'Disable 8D Audio');
});

test('a refused switch-on shows the reason and stays off', async () => {
  const p = loadPopup({ toggleResult: { enabled: false, error: 'This site protects its audio (DRM)' } });
  await p.settle();
  await p.$('toggle').fire('click');
  assert.strictEqual(p.$('toggle').textContent, 'Enable 8D Audio');
  assert.match(p.$('error').textContent, /DRM/);
});

test('unreachable page offers Try again', async () => {
  const p = loadPopup({ pageGone: true });
  await p.settle(); await p.settle();
  assert.strictEqual(p.$('toggle').textContent, 'Try again');
  assert.strictEqual(p.$('live').style.display, 'none');
});

test('other sites ask for permission first', async () => {
  const p = loadPopup({ url: 'https://example.com/', granted: false });
  await p.settle();
  assert.strictEqual(p.$('enableSite').style.display, 'block');
  assert.strictEqual(p.$('toggle').disabled, true);
});

test('chrome:// pages are not available', async () => {
  const p = loadPopup({ url: 'chrome://extensions/' });
  await p.settle();
  assert.strictEqual(p.$('toggle').textContent, 'Not available on this page');
});
