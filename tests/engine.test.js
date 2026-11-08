// Renders audio offline through the engine and checks the effect really happens.
// Needs the free `node-web-audio-api` package (npm install).
const test = require('node:test');
const assert = require('node:assert');
const { createEngine, secondsPerLap, intensityToWet } = require('../engine.js');

let WA = null;
try { WA = require('node-web-audio-api'); } catch (e) { /* skipped below */ }
const opts = { skip: !WA && 'node-web-audio-api not installed' };

const SR = 22050;
function rms(arr, from, to) {
  let s = 0;
  for (let i = from; i < to; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / (to - from));
}
async function render(seconds, setup) {
  const ctx = new WA.OfflineAudioContext(2, SR * seconds, SR);
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  const src = ctx.createGain();
  src.gain.value = 0.5;
  osc.connect(src);
  const engine = createEngine(ctx, src, ctx.destination);
  setup(engine);
  osc.start();
  const buf = await ctx.startRendering();
  return [buf.getChannelData(0), buf.getChannelData(1)];
}
function windows(L, R, win) {
  const out = [];
  for (let i = win; i + win <= L.length; i += win) out.push([rms(L, i, i + win), rms(R, i, i + win)]);
  return out;
}

test('slider maths keep v1.0 meaning', () => {
  assert.ok(Math.abs(secondsPerLap(0.02) - 5.03) < 0.05);
  assert.ok(intensityToWet(0.5) < intensityToWet(1.5) && intensityToWet(1.5) < intensityToWet(3));
});

test('off = untouched sound (both ears equal)', opts, async () => {
  const [L, R] = await render(2, (e) => e.setEnabled(false));
  for (let i = SR; i < 2 * SR; i += 97) assert.ok(Math.abs(L[i] - R[i]) < 1e-4);
});

test('on = sound moves between ears, loudness roughly steady', opts, async () => {
  const [L, R] = await render(6, (e) => { e.setRotationSpeed(0.05); e.setEnabled(true); e.setIntensity(3); }); // ~2s lap
  const w = windows(L, R, SR / 10);
  const bal = w.map(([l, r]) => (l - r) / (l + r + 1e-9));
  assert.ok(Math.max(...bal) > 0.2, 'sound should reach the left side');
  assert.ok(Math.min(...bal) < -0.2, 'sound should reach the right side');
  const loud = w.map(([l, r]) => Math.hypot(l, r));
  const ratio = Math.max(...loud) / Math.min(...loud);
  assert.ok(ratio < 3, 'loudness swing too big: ' + ratio.toFixed(2));
});
