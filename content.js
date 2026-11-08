// Content script: connects the page's <video>/<audio> to the 8D engine and answers the popup.
(function () {
  'use strict';
  if (window.__eightDAudioLoaded) return; // never run twice in the same page
  window.__eightDAudioLoaded = true;

  const { createEngine, DEFAULTS } = window.EightDEngine;

  let audioContext = null;
  let bus = null; // every media element feeds this
  let engine = null;
  const connected = new WeakSet();
  let intensity = DEFAULTS.intensity;
  let rotationSpeed = DEFAULTS.rotationSpeed;

  chrome.storage.sync.get(['intensity', 'rotationSpeed'], (result) => {
    intensity = result.intensity || DEFAULTS.intensity;
    rotationSpeed = result.rotationSpeed || DEFAULTS.rotationSpeed;
    if (engine) {
      engine.setIntensity(intensity);
      engine.setRotationSpeed(rotationSpeed);
    }
  });

  // chrome.storage.sync allows ~120 writes a minute; sliders fire far more, so batch them.
  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.sync.set({ intensity, rotationSpeed }), 400);
  }

  function findMedia() {
    const all = Array.from(document.querySelectorAll('video, audio'));
    return (
      document.querySelector('video.html5-main-video') ||
      all.find((m) => !m.paused) ||
      all[0] ||
      null
    );
  }

  function ensureGraph() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      bus = audioContext.createGain();
      engine = createEngine(audioContext, bus, audioContext.destination);
      engine.setIntensity(intensity);
      engine.setRotationSpeed(rotationSpeed);
    }
    const media = findMedia();
    if (!media) return false;
    if (!connected.has(media)) {
      try {
        audioContext.createMediaElementSource(media).connect(bus);
        connected.add(media);
        media.addEventListener('play', () => audioContext.resume());
      } catch (e) {
        console.warn('[8D Audio] could not attach to media element:', e);
        return connected.size > 0;
      }
    }
    return true;
  }

  function enable() {
    if (!ensureGraph()) {
      console.warn('[8D Audio] no audio or video element on this page yet');
      return false;
    }
    audioContext.resume();
    return engine.setEnabled(true);
  }

  function disable() {
    if (engine) engine.setEnabled(false);
    return false;
  }

  // YouTube swaps pages without reloading; re-attach if a new player shows up.
  const observer = new MutationObserver(() => {
    if (engine && engine.enabled) ensureGraph();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'toggle': {
        const on = engine && engine.enabled ? disable() : enable();
        sendResponse({ enabled: on });
        break;
      }
      case 'getState':
        sendResponse({ enabled: !!(engine && engine.enabled), intensity, rotationSpeed });
        break;
      case 'setIntensity':
        intensity = request.value;
        if (engine) engine.setIntensity(intensity);
        saveSoon();
        sendResponse({ ok: true });
        break;
      case 'getIntensity':
        sendResponse({ intensity });
        break;
      case 'setRotationSpeed':
        rotationSpeed = request.value;
        if (engine) engine.setRotationSpeed(rotationSpeed);
        saveSoon();
        sendResponse({ ok: true });
        break;
      default:
        return false;
    }
    return false; // all responses above are synchronous
  });
})();
