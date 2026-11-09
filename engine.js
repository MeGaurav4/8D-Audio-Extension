// 8D audio engine. Pure Web Audio, no page/DOM access, so the same code runs in the
// content script, the file converter page, and the tests.
//
// Graph:
//   input ─┬─> bypassGain ─────────────────────────────────────────────┬─> output
//          └─> EQ (bass/mid/treble) ─┬─> effDry ────────────┐           │
//                                    └─> panner (HRTF) ─┬─> effWet ─────┼─> effectGain ┘
//                                                       └─> convolver ─> reverbGain ┘
// The panner position is driven by oscillators running on the audio thread, so motion
// stays perfectly smooth even when the tab is in the background.
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({
    intensity: 1.5, // 0.5 – 3 (v1 slider)
    rotationSpeed: 0.02, // v1 meaning: radians per 16 ms
    pattern: 'circle',
    reverb: 0, // 0 – 1
    bass: 0, // dB, -12 – 12
    mid: 0,
    treble: 0,
    syncBpm: false,
    bpm: 120,
    beatsPerLap: 8,
  });

  // Each pattern: Fourier coefficients for X (left/right), Y (up/down), Z (front/back)
  // at the base rotation frequency. real -> cos(n·t), imag -> sin(n·t).
  const PATTERNS = Object.freeze({
    circle: { label: 'Circle', x: { re: [0, 1] }, z: { im: [0, 1] } },
    figure8: { label: 'Figure 8', x: { im: [0, 1] }, z: { im: [0, 0, 0.7] } },
    pingpong: { label: 'Side to side', x: { im: [0, 1.1, 0, -0.12] }, z: { re: [0, 0, 0.35] } },
    halo: { label: 'Halo', x: { re: [0, 1] }, z: { im: [0, 1] }, y: { im: [0, 0, 0, 0.55] } },
    wander: { label: 'Wander', x: { re: [0, 0.75, 0, 0.3] }, z: { im: [0, 0.7, 0.35] }, y: { im: [0, 0, 0, 0, 0, 0.25] } },
  });

  const PRESETS = Object.freeze({
    classic: { label: 'Classic 8D', intensity: 1.5, rotationSpeed: 0.02, pattern: 'circle', reverb: 0, bass: 0, mid: 0, treble: 0 },
    slow: { label: 'Slow orbit', intensity: 1.8, rotationSpeed: 0.01, pattern: 'circle', reverb: 0.15, bass: 0, mid: 0, treble: 0 },
    fast: { label: 'Fast spin', intensity: 2.2, rotationSpeed: 0.06, pattern: 'circle', reverb: 0.1, bass: 0, mid: 0, treble: 0 },
    hall: { label: 'Concert hall', intensity: 1.6, rotationSpeed: 0.015, pattern: 'circle', reverb: 0.55, bass: 2, mid: 0, treble: -1 },
    lofi: { label: 'Lo-fi room', intensity: 1.4, rotationSpeed: 0.012, pattern: 'wander', reverb: 0.35, bass: 3, mid: 0, treble: -6 },
    halo: { label: 'Halo', intensity: 2.0, rotationSpeed: 0.025, pattern: 'halo', reverb: 0.25, bass: 0, mid: 0, treble: 1 },
    pingpong: { label: 'Ping-pong', intensity: 2.5, rotationSpeed: 0.03, pattern: 'pingpong', reverb: 0.1, bass: 0, mid: 0, treble: 0 },
  });

  // HRTF filtering loses level; this brings the moving sound back near the original
  // loudness. A soft limiter after it catches any peaks.
  const WET_MAKEUP = 2.0;
  const RAMP = 0.08; // seconds; every change glides (no clicks)

  function speedToHz(rotationSpeed) { return rotationSpeed / 0.016 / (2 * Math.PI); }
  function hzToSpeed(hz) { return hz * 2 * Math.PI * 0.016; }
  function secondsPerLap(rotationSpeed) { return 1 / speedToHz(rotationSpeed); }
  function bpmToSpeed(bpm, beatsPerLap) { return hzToSpeed(bpm / 60 / beatsPerLap); }
  function intensityToWet(intensity) {
    const t = Math.min(1, Math.max(0, (intensity - 0.5) / 2.5));
    return 0.4 + 0.6 * t;
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Which preset these settings are, or '' for custom. The highlighted preset is always
  // worked out from the settings, so it can never disagree with what you hear.
  function presetFor(settings) {
    if (!settings || settings.syncBpm) return '';
    for (const [id, p] of Object.entries(PRESETS)) {
      if (Object.keys(p).every((k) => k === 'label' || settings[k] === p[k])) return id;
    }
    return '';
  }

  // Evaluate a pattern at phase t (radians) -> {x, y, z}. Used by the popup visualizer.
  function positionAt(patternName, t) {
    const p = PATTERNS[patternName] || PATTERNS.circle;
    const ev = (c) => {
      if (!c) return 0;
      let s = 0;
      (c.re || []).forEach((a, n) => { s += a * Math.cos(n * t); });
      (c.im || []).forEach((b, n) => { s += b * Math.sin(n * t); });
      return s;
    };
    return { x: ev(p.x), y: ev(p.y), z: ev(p.z) };
  }

  function makeWave(ctx, c) {
    const n = Math.max((c && c.re ? c.re.length : 0), (c && c.im ? c.im.length : 0), 2);
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    if (c && c.re) c.re.forEach((v, i) => { re[i] = v; });
    if (c && c.im) c.im.forEach((v, i) => { im[i] = v; });
    re[0] = 0; im[0] = 0;
    return ctx.createPeriodicWave(re, im, { disableNormalization: true });
  }

  // Stereo decaying noise = a simple, natural-sounding room. Seeded so renders repeat.
  function makeImpulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = rnd() * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  function createEngine(ctx, input, output) {
    output = output || ctx.destination;
    const g = () => ctx.createGain();

    const bypassGain = g();
    const effectGain = g();
    const effDry = g();
    const effWet = g();
    const reverbGain = g();
    bypassGain.gain.value = 1;
    effectGain.gain.value = 0;
    reverbGain.gain.value = 0;

    const bass = ctx.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 120; bass.gain.value = 0;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.8; mid.gain.value = 0;
    const treble = ctx.createBiquadFilter();
    treble.type = 'highshelf'; treble.frequency.value = 8000; treble.gain.value = 0;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1000; // listener always inside refDistance -> no volume loss
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.value = 0;
    panner.positionY.value = 0;
    panner.positionZ.value = 0;

    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.4);

    const oscX = ctx.createOscillator();
    const oscY = ctx.createOscillator();
    const oscZ = ctx.createOscillator();
    oscX.connect(panner.positionX);
    oscY.connect(panner.positionY);
    oscZ.connect(panner.positionZ);

    input.connect(bypassGain).connect(output);
    input.connect(bass).connect(mid).connect(treble);
    treble.connect(effDry).connect(effectGain);
    treble.connect(panner);
    panner.connect(effWet).connect(effectGain);
    panner.connect(convolver).connect(reverbGain).connect(effectGain);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 4;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    effectGain.connect(limiter).connect(output);

    const s = Object.assign({}, DEFAULTS);
    let enabled = false;
    // phase tracking for the visualizer (oscillator phase is continuous across changes)
    let phase0 = 0;
    let t0 = ctx.currentTime;
    let hz = 0;

    const glide = (param, value) => {
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, RAMP / 3);
    };
    const effectiveSpeed = () => (s.syncBpm ? bpmToSpeed(s.bpm, s.beatsPerLap) : s.rotationSpeed);

    function applySpeed() {
      const now = ctx.currentTime;
      phase0 += 2 * Math.PI * hz * (now - t0);
      t0 = now;
      hz = speedToHz(effectiveSpeed());
      [oscX, oscY, oscZ].forEach((o) => glide(o.frequency, hz));
    }
    function applyPattern() {
      const p = PATTERNS[s.pattern] || PATTERNS.circle;
      oscX.setPeriodicWave(makeWave(ctx, p.x));
      oscY.setPeriodicWave(makeWave(ctx, p.y));
      oscZ.setPeriodicWave(makeWave(ctx, p.z));
    }
    function applyMix() {
      const w = intensityToWet(s.intensity);
      glide(effWet.gain, Math.sin(w * Math.PI / 2) * WET_MAKEUP); // equal-power crossfade
      glide(effDry.gain, Math.cos(w * Math.PI / 2));
      glide(reverbGain.gain, clamp(s.reverb, 0, 1) * 0.6 * WET_MAKEUP);
      glide(bypassGain.gain, enabled ? 0 : 1);
      glide(effectGain.gain, enabled ? 1 : 0);
    }
    function applyEq() {
      glide(bass.gain, clamp(s.bass, -12, 12));
      glide(mid.gain, clamp(s.mid, -12, 12));
      glide(treble.gain, clamp(s.treble, -12, 12));
    }

    hz = speedToHz(effectiveSpeed());
    [oscX, oscY, oscZ].forEach((o) => { o.frequency.value = hz; });
    applyPattern();
    oscX.start(); oscY.start(); oscZ.start();

    function set(patch) {
      if (!patch) return;
      let speed = false, pattern = false;
      for (const k of Object.keys(patch)) {
        if (!(k in DEFAULTS)) continue;
        const v = patch[k];
        if (k === 'pattern') { if (PATTERNS[v]) { s.pattern = v; pattern = true; } continue; }
        if (k === 'syncBpm') { s.syncBpm = !!v; speed = true; continue; }
        if (!Number.isFinite(v)) continue;
        if ((k === 'rotationSpeed' || k === 'bpm' || k === 'beatsPerLap') && v <= 0) continue;
        s[k] = v;
        if (k === 'rotationSpeed' || k === 'bpm' || k === 'beatsPerLap') speed = true;
      }
      if (pattern) applyPattern();
      if (speed) applySpeed();
      applyMix();
      applyEq();
    }

    return {
      get enabled() { return enabled; },
      get intensity() { return s.intensity; },
      get rotationSpeed() { return s.rotationSpeed; },
      get settings() { return Object.assign({}, s); },
      setEnabled(on) { enabled = !!on; applyMix(); return enabled; },
      setIntensity(v) { set({ intensity: v }); },
      setRotationSpeed(v) { set({ rotationSpeed: v }); },
      set,
      // where the sound is right now, x/z in -1..1 (x = right, z = back), y = up
      position() {
        const t = phase0 + 2 * Math.PI * hz * (ctx.currentTime - t0);
        return positionAt(s.pattern, t);
      },
      nodes: { limiter, bypassGain, effectGain, effDry, effWet, reverbGain, panner, convolver, bass, mid, treble, oscX, oscY, oscZ },
    };
  }

  const api = {
    createEngine, DEFAULTS, PATTERNS, PRESETS,
    speedToHz, hzToSpeed, secondsPerLap, bpmToSpeed, intensityToWet, positionAt, presetFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EightDEngine = api;
})(typeof self !== 'undefined' ? self : this);
