document.addEventListener('DOMContentLoaded', () => {
  const { DEFAULTS, PRESETS, PATTERNS, secondsPerLap, bpmToSpeed, positionAt } = window.EightDEngine;
  const $ = (id) => document.getElementById(id);

  const toggleButton = $('toggle');
  const enableSiteButton = $('enableSite');
  const errorBox = $('error');
  const live = $('live');
  const controlsDiv = $('controls');
  const canvas = $('viz');
  const c2d = canvas.getContext('2d');

  const sliders = {
    intensity: { el: $('intensity'), out: $('intensityValue'), fmt: (v) => v },
    rotationSpeed: { el: $('rotationSpeed'), out: $('rotationSpeedValue'), fmt: (v) => v },
    reverb: { el: $('reverb'), out: $('reverbValue'), fmt: (v) => Math.round(v * 100) + '%' },
    bass: { el: $('bass'), out: $('bassValue'), fmt: (v) => (v > 0 ? '+' : '') + v + ' dB' },
    mid: { el: $('mid'), out: $('midValue'), fmt: (v) => (v > 0 ? '+' : '') + v + ' dB' },
    treble: { el: $('treble'), out: $('trebleValue'), fmt: (v) => (v > 0 ? '+' : '') + v + ' dB' },
  };

  const isYouTube = (url) => !!url && /^https:\/\/([a-z0-9-]+\.)*youtube\.com\//.test(url);
  const isWeb = (url) => !!url && /^https?:\/\//.test(url);

  let tab = null;
  let s = Object.assign({}, DEFAULTS, { enabled: false, preset: 'classic' });

  // ---------- messaging ----------
  function send(message) {
    return new Promise((resolve) => {
      if (!tab) return resolve(null);
      chrome.tabs.sendMessage(tab.id, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  }
  async function getStateOrInject() {
    let state = await send({ action: 'getState' });
    if (state) return state;
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['engine.js', 'content.js'] });
      state = await send({ action: 'getState' });
    } catch (e) { state = null; }
    return state;
  }

  // ---------- UI ----------
  function showError(msg) {
    errorBox.textContent = msg || '';
    errorBox.classList.toggle('show', !!msg);
  }
  function setBadge(on) {
    if (!tab) return;
    chrome.action.setBadgeText({ tabId: tab.id, text: on ? '8D' : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#ddff00' });
    if (chrome.action.setBadgeTextColor) chrome.action.setBadgeTextColor({ tabId: tab.id, color: '#1e1e1e' });
  }
  function updateButtonText(enabled) {
    toggleButton.textContent = enabled ? 'Disable 8D Audio' : 'Enable 8D Audio';
    toggleButton.classList.toggle('on', !!enabled);
  }
  function lapText() {
    const speed = s.syncBpm ? bpmToSpeed(s.bpm, s.beatsPerLap) : s.rotationSpeed;
    return secondsPerLap(speed).toFixed(1) + 's per lap' + (s.syncBpm ? ' (synced to ' + s.bpm + ' BPM)' : '');
  }
  function render() {
    for (const [k, sl] of Object.entries(sliders)) {
      sl.el.value = s[k];
      sl.out.textContent = sl.fmt(Number(s[k]));
    }
    $('lapValue').textContent = lapText();
    $('pattern').value = s.pattern;
    $('syncBpm').checked = !!s.syncBpm;
    $('bpm').value = s.bpm;
    $('beatsPerLap').value = String(s.beatsPerLap);
    sliders.rotationSpeed.el.disabled = !!s.syncBpm;
    $('perSite').checked = !!s.perSite;
    $('autoStart').checked = !!s.autoStart;
    document.querySelectorAll('.chip[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === s.preset));
  }

  // presets + patterns
  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.preset = id;
    b.textContent = p.label;
    b.addEventListener('click', () => {
      const patch = {};
      for (const k of Object.keys(p)) if (k !== 'label') patch[k] = p[k];
      patch.syncBpm = false;
      Object.assign(s, patch, { preset: id });
      render();
      send({ action: 'set', patch, preset: id });
    });
    $('presets').appendChild(b);
  }
  for (const [id, p] of Object.entries(PATTERNS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = p.label;
    $('pattern').appendChild(o);
  }

  function change(patch) {
    Object.assign(s, patch, { preset: '' }); // a manual tweak = custom
    render();
    send({ action: 'set', patch, preset: '' });
  }

  for (const [k, sl] of Object.entries(sliders)) {
    sl.el.addEventListener('input', () => change({ [k]: parseFloat(sl.el.value) }));
  }
  $('pattern').addEventListener('change', (e) => change({ pattern: e.target.value }));
  $('syncBpm').addEventListener('change', (e) => change({ syncBpm: e.target.checked }));
  $('bpm').addEventListener('change', (e) => {
    const v = Math.min(220, Math.max(40, parseFloat(e.target.value) || 120));
    change({ bpm: v });
  });
  $('beatsPerLap').addEventListener('change', (e) => change({ beatsPerLap: parseInt(e.target.value, 10) }));

  // tap tempo: average of the last few taps
  let taps = [];
  $('tap').addEventListener('click', () => {
    const now = performance.now();
    taps = taps.filter((t) => now - t < 3000);
    taps.push(now);
    if (taps.length >= 3) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
      if (bpm >= 40 && bpm <= 220) change({ bpm, syncBpm: true });
    }
  });

  $('perSite').addEventListener('change', async (e) => {
    const st = await send({ action: 'setPerSite', value: e.target.checked });
    if (st) { s = Object.assign(s, st); render(); }
  });
  $('autoStart').addEventListener('change', async (e) => {
    const st = await send({ action: 'setAutoStart', value: e.target.checked });
    if (st) { s = Object.assign(s, st); render(); }
  });

  $('resetControls').addEventListener('click', () => {
    const patch = Object.assign({}, DEFAULTS);
    Object.assign(s, patch, { preset: 'classic' });
    render();
    send({ action: 'set', patch, preset: 'classic' });
  });

  $('editControls').addEventListener('click', () => controlsDiv.classList.toggle('visible'));
  $('openConverter').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') }));

  toggleButton.addEventListener('click', async () => {
    const r = await send({ action: 'toggle' });
    if (!r) { showError('Lost the page. Refresh it and try again.'); return; }
    s.enabled = r.enabled;
    updateButtonText(r.enabled);
    setBadge(r.enabled);
    showError(r.enabled ? '' : r.error);
  });

  // ---------- visualizer ----------
  function drawViz(pos) {
    const W = canvas.width, R = W / 2 - 10;
    c2d.clearRect(0, 0, W, W);
    c2d.strokeStyle = '#3a3a3a';
    c2d.beginPath(); c2d.arc(W / 2, W / 2, R, 0, Math.PI * 2); c2d.stroke();
    // path preview
    c2d.strokeStyle = 'rgba(221,255,0,0.18)';
    c2d.beginPath();
    for (let i = 0; i <= 64; i++) {
      const p = positionAt(s.pattern, (i / 64) * Math.PI * 2);
      const x = W / 2 + p.x * R * 0.85, y = W / 2 + p.z * R * 0.85;
      i ? c2d.lineTo(x, y) : c2d.moveTo(x, y);
    }
    c2d.stroke();
    // head (nose points up = front)
    c2d.fillStyle = '#555';
    c2d.beginPath(); c2d.arc(W / 2, W / 2, 9, 0, Math.PI * 2); c2d.fill();
    c2d.beginPath(); c2d.moveTo(W / 2 - 4, W / 2 - 8); c2d.lineTo(W / 2, W / 2 - 14); c2d.lineTo(W / 2 + 4, W / 2 - 8); c2d.fill();
    if (pos) {
      const size = 6 + (pos.y || 0) * 4;
      c2d.fillStyle = '#ddff00';
      c2d.beginPath();
      c2d.arc(W / 2 + pos.x * R * 0.85, W / 2 + pos.z * R * 0.85, Math.max(3, size), 0, Math.PI * 2);
      c2d.fill();
    }
  }
  async function vizLoop() {
    const pos = s.enabled ? await send({ action: 'getPosition' }) : null;
    drawViz(pos);
    setTimeout(() => requestAnimationFrame(vizLoop), 50);
  }

  // ---------- start ----------
  chrome.commands.getAll((cmds) => {
    const c = cmds.find((x) => x.name === 'toggle-8d');
    if (c && c.shortcut) document.querySelector('.footer span').textContent = 'Shortcut ' + c.shortcut;
  });
  document.querySelector('.footer span:last-child').textContent = 'v' + chrome.runtime.getManifest().version;

  function unavailable(text) {
    toggleButton.textContent = text;
    toggleButton.disabled = true;
    live.style.display = 'none';
  }

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    tab = tabs[0];
    if (!tab || !isWeb(tab.url)) { unavailable('Not available on this page'); return; }
    const origin = new URL(tab.url).origin + '/*';
    $('host').textContent = new URL(tab.url).hostname;

    if (!isYouTube(tab.url)) {
      const granted = await chrome.permissions.contains({ origins: [origin] });
      if (!granted) {
        unavailable('Not on this site yet');
        enableSiteButton.style.display = 'block';
        enableSiteButton.addEventListener('click', async () => {
          // must be called straight from the click
          const ok = await chrome.permissions.request({ origins: [origin] });
          if (!ok) return;
          await new Promise((r) => chrome.runtime.sendMessage({ action: 'siteEnabled', tabId: tab.id }, r));
          location.reload();
        });
        return;
      }
    }

    const state = await getStateOrInject();
    if (!state) { unavailable('Error: Refresh the page'); return; }
    s = Object.assign(s, state);
    updateButtonText(s.enabled);
    setBadge(s.enabled);
    render();
    vizLoop();
  });
});
