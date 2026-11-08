// Content script: connects the page's <video>/<audio> to the 8D engine and answers the popup.
// Runs on YouTube by default, and on any other site the user switches on from the popup.
(function () {
  'use strict';
  if (window.__eightDAudioLoaded) return; // never run twice in the same page
  window.__eightDAudioLoaded = true;

  const { createEngine, DEFAULTS } = window.EightDEngine;
  const KEYS = Object.keys(DEFAULTS);
  const host = location.hostname;
  const siteKey = 'site:' + host;

  let audioContext = null;
  let bus = null; // every media element feeds this
  let engine = null;
  const connected = new WeakSet();

  let settings = Object.assign({}, DEFAULTS);
  let preset = 'classic';
  let perSite = false; // settings stored for this site only
  let autoStart = false;
  let lastError = '';

  function pick(obj) {
    const out = {};
    for (const k of KEYS) if (obj && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
    return out;
  }

  // Global settings live at the top level of storage.sync (v1 used intensity/rotationSpeed
  // there, so old saves keep working). Per-site settings live in storage.local.
  const ready = new Promise((resolve) => {
    chrome.storage.sync.get(null, (global) => {
      chrome.storage.local.get(siteKey, (local) => {
        const site = local[siteKey];
        settings = Object.assign({}, DEFAULTS, pick(global));
        preset = global.preset || 'classic';
        if (site) {
          autoStart = !!site.autoStart;
          if (site.settings) {
            perSite = true;
            settings = Object.assign({}, settings, pick(site.settings));
            preset = site.preset || preset;
          }
        }
        if (engine) engine.set(settings);
        resolve();
      });
    });
  });

  let saveTimer = null;
  function saveSoon() {
    // storage.sync allows ~120 writes a minute; sliders fire far more, so batch them.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    if (perSite) {
      chrome.storage.local.set({ [siteKey]: { settings, preset, autoStart } });
    } else {
      chrome.storage.sync.set(Object.assign({ preset }, settings));
      chrome.storage.local.get(siteKey, (l) => {
        if (autoStart) chrome.storage.local.set({ [siteKey]: { autoStart } });
        else if (l[siteKey]) chrome.storage.local.remove(siteKey);
      });
    }
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

  // Web Audio outputs silence for DRM media and for cross-origin media without CORS.
  // Attaching to those would mute the page, so refuse instead.
  function blockedReason(media) {
    if (media.mediaKeys) return 'This site protects its audio (DRM), so 8D can\'t be applied here.';
    const src = media.currentSrc || media.src || '';
    if (/^https?:/i.test(src)) {
      try {
        const u = new URL(src, location.href);
        if (u.origin !== location.origin && !media.crossOrigin) {
          return 'This site streams audio from another server that blocks effects, so 8D can\'t be applied here.';
        }
      } catch (e) { /* ignore */ }
    }
    return '';
  }

  function ensureGraph() {
    const media = findMedia();
    if (!media) { lastError = 'No audio or video found on this page yet. Press play, then try again.'; return false; }
    if (!connected.has(media)) {
      const reason = blockedReason(media);
      if (reason) { lastError = reason; return connected.size > 0; }
    }
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      bus = audioContext.createGain();
      engine = createEngine(audioContext, bus, audioContext.destination);
      engine.set(settings);
    }
    if (!connected.has(media)) {
      try {
        audioContext.createMediaElementSource(media).connect(bus);
        connected.add(media);
        media.addEventListener('play', () => audioContext.resume());
      } catch (e) {
        console.warn('[8D Audio] could not attach to media element:', e);
        lastError = 'Couldn\'t connect to this player.';
        return connected.size > 0;
      }
    }
    lastError = '';
    return true;
  }

  function enable() {
    if (!ensureGraph()) return false;
    audioContext.resume();
    return engine.setEnabled(true);
  }
  function disable() {
    if (engine) engine.setEnabled(false);
    return false;
  }
  const isOn = () => !!(engine && engine.enabled);

  // Pages like YouTube swap players without reloading; re-attach when one shows up.
  let mo = null;
  function watch() {
    if (mo) return;
    let pending = null;
    mo = new MutationObserver(() => {
      if (pending || (!isOn() && !(autoStart && !autoTried))) return;
      pending = setTimeout(() => {
        pending = null;
        if (isOn()) ensureGraph();
        else tryAutoStart();
      }, 500);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  watch();

  let autoTried = false;
  function tryAutoStart() {
    if (autoTried || !autoStart) return;
    const media = findMedia();
    if (!media) return;
    autoTried = true;
    enable();
  }
  ready.then(tryAutoStart);

  function state() {
    return Object.assign({}, settings, {
      enabled: isOn(),
      preset,
      perSite,
      autoStart,
      host,
      error: lastError,
    });
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
      case 'toggle':
        sendResponse({ enabled: isOn() ? disable() : enable(), error: lastError });
        break;
      case 'setEnabled':
        sendResponse({ enabled: request.value ? enable() : disable(), error: lastError });
        break;
      case 'getState':
        ready.then(() => sendResponse(state()));
        return true; // async
      case 'getPosition':
        sendResponse(isOn() ? engine.position() : null);
        break;
      case 'set': // { patch, preset? }
        Object.assign(settings, pick(request.patch));
        if (request.preset !== undefined) preset = request.preset;
        if (engine) engine.set(settings);
        saveSoon();
        sendResponse({ ok: true });
        break;
      case 'setPerSite':
        perSite = !!request.value;
        if (!perSite) {
          // fall back to the global settings
          chrome.storage.sync.get(null, (g) => {
            settings = Object.assign({}, DEFAULTS, pick(g));
            preset = g.preset || 'classic';
            if (engine) engine.set(settings);
            saveNow();
            sendResponse(state());
          });
          return true;
        }
        saveNow();
        sendResponse(state());
        break;
      case 'setAutoStart':
        autoStart = !!request.value;
        saveNow();
        sendResponse(state());
        break;
      // v1 messages, kept so nothing old breaks
      case 'setIntensity':
        settings.intensity = request.value; if (engine) engine.set(settings); saveSoon();
        sendResponse({ ok: true });
        break;
      case 'setRotationSpeed':
        settings.rotationSpeed = request.value; if (engine) engine.set(settings); saveSoon();
        sendResponse({ ok: true });
        break;
      case 'getIntensity':
        sendResponse({ intensity: settings.intensity });
        break;
      default:
        return false;
    }
    return false;
  });
})();
