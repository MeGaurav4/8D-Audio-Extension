// 8D audio engine. Pure Web Audio, no page/DOM access, so it can be tested on its own.
// Graph:
//   input ─┬─> dryGain ────────────────────────────┬─> output
//          └─> panner (HRTF) ─> wetGain ───────────┘
// The panner position is driven by two oscillators (sine + cosine) running on the
// audio thread, so rotation stays perfectly smooth even when the tab is in the background.
(function (root) {
  'use strict';

  const DEFAULTS = Object.freeze({ intensity: 1.5, rotationSpeed: 0.02 });
  const RAMP = 0.08; // seconds, used for every gain/frequency change (no clicks)

  // v1.0 moved rotationSpeed radians every 16 ms. Keep that meaning for the slider.
  function speedToHz(rotationSpeed) {
    return rotationSpeed / 0.016 / (2 * Math.PI);
  }
  function secondsPerLap(rotationSpeed) {
    return 1 / speedToHz(rotationSpeed);
  }
  // v1.0 "intensity" (0.5–3) only changed loudness. Now it sets how much of the sound
  // circles your head versus staying centred, at equal loudness.
  function intensityToWet(intensity) {
    const t = Math.min(1, Math.max(0, (intensity - 0.5) / 2.5));
    return 0.4 + 0.6 * t;
  }

  function createEngine(ctx, input, output) {
    output = output || ctx.destination;

    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1000; // listener always inside refDistance -> no volume loss
    panner.maxDistance = 10000;
    panner.rolloffFactor = 1;
    panner.positionX.value = 0;
    panner.positionY.value = 0;
    panner.positionZ.value = 0;

    // cosine -> X, sine -> Z, radius fixed at 1 (HRTF only cares about direction)
    const cosWave = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]), { disableNormalization: true });
    const sinWave = ctx.createPeriodicWave(new Float32Array([0, 0]), new Float32Array([0, 1]), { disableNormalization: true });
    const oscX = ctx.createOscillator();
    const oscZ = ctx.createOscillator();
    oscX.setPeriodicWave(cosWave);
    oscZ.setPeriodicWave(sinWave);
    oscX.connect(panner.positionX);
    oscZ.connect(panner.positionZ);

    input.connect(dryGain);
    input.connect(panner);
    panner.connect(wetGain);
    dryGain.connect(output);
    wetGain.connect(output);

    let enabled = false;
    let intensity = DEFAULTS.intensity;
    let rotationSpeed = DEFAULTS.rotationSpeed;

    function setHz() {
      const hz = speedToHz(rotationSpeed);
      const now = ctx.currentTime;
      [oscX, oscZ].forEach((o) => {
        o.frequency.cancelScheduledValues(now);
        o.frequency.setTargetAtTime(hz, now, RAMP / 3);
      });
    }
    function applyMix() {
      const now = ctx.currentTime;
      let wet = 0;
      let dry = 1;
      if (enabled) {
        const w = intensityToWet(intensity);
        // equal-power crossfade keeps loudness steady
        wet = Math.sin(w * Math.PI / 2);
        dry = Math.cos(w * Math.PI / 2);
      }
      wetGain.gain.cancelScheduledValues(now);
      dryGain.gain.cancelScheduledValues(now);
      wetGain.gain.setTargetAtTime(wet, now, RAMP / 3);
      dryGain.gain.setTargetAtTime(dry, now, RAMP / 3);
    }

    const hz0 = speedToHz(rotationSpeed);
    oscX.frequency.value = hz0;
    oscZ.frequency.value = hz0;
    oscX.start();
    oscZ.start();

    return {
      get enabled() { return enabled; },
      get intensity() { return intensity; },
      get rotationSpeed() { return rotationSpeed; },
      setEnabled(on) { enabled = !!on; applyMix(); return enabled; },
      setIntensity(v) { if (Number.isFinite(v)) { intensity = v; applyMix(); } },
      setRotationSpeed(v) { if (Number.isFinite(v) && v > 0) { rotationSpeed = v; setHz(); } },
      nodes: { dryGain, wetGain, panner, oscX, oscZ },
    };
  }

  const api = { createEngine, DEFAULTS, speedToHz, secondsPerLap, intensityToWet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EightDEngine = api;
})(typeof self !== 'undefined' ? self : this);
