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

const { PATTERNS, PRESETS, positionAt, bpmToSpeed } = require('../engine.js');

test('Classic preset is the v1 sound', () => {
  const c = PRESETS.classic;
  assert.strictEqual(c.intensity, 1.5);
  assert.strictEqual(c.rotationSpeed, 0.02);
  assert.strictEqual(c.pattern, 'circle');
  assert.strictEqual(c.reverb, 0);
});

test('every preset uses a real pattern', () => {
  for (const p of Object.values(PRESETS)) assert.ok(PATTERNS[p.pattern], p.label);
});

test('BPM sync: 120 bpm, 8 beats per lap = 4 s lap', () => {
  assert.ok(Math.abs(secondsPerLap(bpmToSpeed(120, 8)) - 4) < 1e-9);
});

test('circle pattern goes all the way round', () => {
  const a = positionAt('circle', 0), b = positionAt('circle', Math.PI / 2);
  assert.ok(Math.abs(a.x - 1) < 1e-9 && Math.abs(b.z - 1) < 1e-9);
});

for (const name of Object.keys(PATTERNS)) {
  test(`pattern ${name} renders, moves, stays sane`, opts, async () => {
    const [L, R] = await render(5, (e) => { e.set({ pattern: name, rotationSpeed: 0.05, intensity: 3 }); e.setEnabled(true); });
    const w = windows(L, R, SR / 10);
    const bal = w.map(([l, r]) => (l - r) / (l + r + 1e-9));
    assert.ok(Math.max(...bal) - Math.min(...bal) > 0.3, 'sound should move');
    for (let i = 0; i < L.length; i += 101) assert.ok(Number.isFinite(L[i]) && Math.abs(L[i]) < 2);
  });
}

test('reverb adds a tail after the sound stops', opts, async () => {
  const tail = async (reverb) => {
    const ctx = new WA.OfflineAudioContext(2, SR * 3, SR);
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env);
    const e = createEngine(ctx, env, ctx.destination);
    e.set({ reverb }); e.setEnabled(true);
    osc.start(); osc.stop(1);
    const b = await ctx.startRendering();
    return rms(b.getChannelData(0), Math.floor(SR * 1.3), Math.floor(SR * 1.8));
  };
  const dry = await tail(0), wet = await tail(0.8);
  assert.ok(wet > dry * 10 && wet > 0.005, `tail ${wet} vs ${dry}`);
});

test('bass boost makes lows louder', opts, async () => {
  const low = async (bass) => {
    const ctx = new WA.OfflineAudioContext(2, SR * 2, SR);
    const osc = ctx.createOscillator(); osc.frequency.value = 60;
    const quiet = ctx.createGain(); quiet.gain.value = 0.05; osc.connect(quiet);
    const e = createEngine(ctx, quiet, ctx.destination);
    e.set({ bass }); e.setEnabled(true); osc.start();
    const b = await ctx.startRendering();
    return rms(b.getChannelData(0), SR, 2 * SR) + rms(b.getChannelData(1), SR, 2 * SR);
  };
  assert.ok(await low(9) > (await low(0)) * 1.8);
});

test('file conversion: render + WAV encode', opts, async () => {
  const { encodeWav } = require('../wav.js');
  const SR2 = 16000;
  const ctx = new WA.OfflineAudioContext(2, SR2 * 2, SR2);
  const osc = ctx.createOscillator();
  const e = createEngine(ctx, osc, ctx.destination);
  e.set(PRESETS.hall); e.setEnabled(true); osc.start();
  const out = await ctx.startRendering();
  const wav = new DataView(encodeWav(out));
  assert.strictEqual(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)), 'RIFF');
  assert.strictEqual(wav.getUint32(24, true), SR2);
  assert.strictEqual(wav.byteLength, 44 + SR2 * 2 * 2 * 2);
});
