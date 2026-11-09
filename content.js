// Content script: connects the page's <video>/<audio> to the 8D engine and answers the popup.
// Runs on YouTube by default, and on any other site the user switches on from the popup.
// Its modes are explicit state machines from machines.js (POWER, AUTOSTART, SCOPE).
(function () {
  'use strict';
  if (window.__eightDAudioLoaded) return; // never run twice in the same page
  window.__eightDAudioLoaded = true;

  const { createEngine, DEFAULTS, presetFor } = window.EightDEngine;
  const { createMachine, DEFS } = window.EightDMachines;
  const KEYS = Object.keys(DEFAULTS);
  const host = location.hostname;
  const siteKey = 'site:' + host;

  let audioContext = null;
  let bus = null; // every media element feeds this
  let engine = null;
  const connected = new WeakSet();
  let connectedCount = 0;

  let settings = Object.assign({}, DEFAULTS);
  let autoStart = false; // the saved preference; the AUTOSTART machine tracks this page load
  let lastError = '';

  const power = createMachine(DEFS.POWER);
  const auto = createMachine(DEFS.AUTOSTART);
  const scope = createMachine(DEFS.SCOPE);

  // POWER owns the engine's on/off and the toolbar badge: nothing else flips them.
  power.onChange((to, from) => {
    if ((to === 'on') === (from === 'on')) return; // detached -> off changes nothing audible
    if (engine) engine.setEnabled(to === 'on');
    tellBadge(to === 'on');
  });
  function tellBadge(on) {
    try {
      if (chrome.runtime.sendMessage) chrome.runtime.sendMessage({ action: 'powerChanged', enabled: on }, () => void chrome.runtime.lastError);
    } catch (e) { /* extension reloaded; nothing to update */ }
  }
  tellBadge(false); // a fresh page starts off, so clear a badge left from before a reload

  function pick(obj) {
    const out = {};
    for (const k of KEYS) if (obj && obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
    return out;
  }
  function setAutoStart(on) {
    autoStart = !!on;
    auto.send(autoStart ? 'ARM' : 'DISARM');
  }

  // Global settings live at the top level of storage.sync (v1 used intensity/rotationSpeed
  // there, so old saves keep working). Per-site settings live in storage.local.
  const ready = new Promise((resolve) => {
    chrome.storage.sync.get(null, (global) => {
      chrome.storage.local.get(siteKey, (local) => {
        const site = local[siteKey];
        settings = Object.assign({}, DEFAULTS, pick(global));
        if (site) {
          setAutoStart(site.autoStart);
          if (site.settings) {
            scope.send('USE_SITE');
            settings = Object.assign({}, settings, pick(site.settings));
          }
        }
        if (engine) engine.set(settings);
        resolve();
      });
    });
  });

  // ---------- saving ----------
  let saveTimer = null;
  function saveSoon() {
    // storage.sync allows ~120 writes a minute; sliders fire far more, so batch them.
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    const preset = presetFor(settings); // stored only so older readers still find it
    if (scope.is('site')) {
      chrome.storage.local.set({ [siteKey]: { settings, preset, autoStart } });
    } else {
      chrome.storage.sync.set(Object.assign({ preset }, settings));
      chrome.storage.local.get(siteKey, (l) => {
        if (autoStart) chrome.storage.local.set({ [siteKey]: { autoStart } });
        else if (l[siteKey]) chrome.storage.local.remove(siteKey);
      });
    }
  }
  // A tweak made just before switching scope belongs to the scope it was made in.
  function flushSave() { if (saveTimer) saveNow(); }

  function applySettings(patch) {
    Object.assign(settings, pick(patch));
    if (engine) engine.set(settings);
    saveSoon();
  }

  // ---------- media ----------
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

  // Connects the current player. Returns true when at least one player is connected.
  function ensureGraph() {
    const media = findMedia();
    if (!media) { lastError = 'No audio or video found on this page yet. Press play, then try again.'; return false; }
    if (!connected.has(media)) {
      const reason = blockedReason(media);
      if (reason) { lastError = reason; return connectedCount > 0; }
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
        connectedCount++;
        media.addEventListener('play', () => audioContext.resume());
      } catch (e) {
        console.warn('[8D Audio] could not attach to media element:', e);
        lastError = 'Couldn\'t connect to this player.';
        return connectedCount > 0;
      }
    }
    power.send('ATTACHED'); // detached -> off; ignored once attached
    lastError = '';
    return true;
  }

  function enable() {
    if (!ensureGraph()) return false;
    audioContext.resume();
    power.send('ENABLE');
    return isOn();
  }
  function disable() {
    power.send('DISABLE');
    return isOn();
  }
  const isOn = () => power.is('on');

  // Pages like YouTube swap players without reloading; re-attach when one shows up.
  let pending = null;
  const mo = new MutationObserver(() => {
    if (pending || !(isOn() || auto.is('armed'))) return;
    pending = setTimeout(() => {
      pending = null;
      if (isOn()) ensureGraph();
      else tryAutoStart();
    }, 500);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  function tryAutoStart() {
    if (!auto.is('armed') || !findMedia()) return;
    auto.send('FIRE');
    enable();
  }
  ready.then(tryAutoStart);

  function state() {
    return Object.assign({}, settings, {
      enabled: isOn(),
      power: power.state,
      preset: presetFor(settings),
      perSite: scope.is('site'),
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
      case 'set': // { patch } (a `preset` field from older popups is ignored: it's derived)
        applySettings(request.patch);
        sendResponse({ ok: true });
        break;
      case 'setPerSite':
        flushSave();
        if (request.value) {
          scope.send('USE_SITE');
          saveNow();
          sendResponse(state());
          break;
        }
        scope.send('USE_GLOBAL');
        // fall back to the global settings
        chrome.storage.sync.get(null, (g) => {
          settings = Object.assign({}, DEFAULTS, pick(g));
          if (engine) engine.set(settings);
          saveNow();
          sendResponse(state());
        });
        return true;
      case 'setAutoStart':
        setAutoStart(request.value);
        saveNow();
        sendResponse(state());
        break;
      // v1 messages, kept so nothing old breaks
      case 'setIntensity':
        applySettings({ intensity: request.value });
        sendResponse({ ok: true });
        break;
      case 'setRotationSpeed':
        applySettings({ rotationSpeed: request.value });
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
