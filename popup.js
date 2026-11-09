document.addEventListener('DOMContentLoaded', () => {
  const { DEFAULTS, PRESETS, PATTERNS, secondsPerLap, bpmToSpeed, positionAt, presetFor } = window.EightDEngine;
  const { createMachine, DEFS } = window.EightDMachines;
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
  let origin = '';
  let s = Object.assign({}, DEFAULTS); // the page's settings, as last reported
  let errorText = ''; // shown under the button; cleared on every successful step

  // Everything the popup shows comes from this one machine (see AGENTS.md, POPUP).
  const view = createMachine(DEFS.POPUP);
  view.onChange(renderView);

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
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['engine.js', 'machines.js', 'content.js'] });
      state = await send({ action: 'getState' });
    } catch (e) { state = null; }
    return state;
  }

  // ---------- UI ----------
  const VIEW = {
    //                  button text                 button on?  live controls  "use on this site"
    loading:              ['Connecting…',             false,      false,         false],
    unsupported:          ['Not available on this page', false,   false,         false],
    needsPermission:      ['Not on this site yet',    false,      false,         true],
    requestingPermission: ['Waiting for permission…', false,      false,         true],
    off:                  ['Enable 8D Audio',         true,       true,          false],
    turningOn:            ['Turning on…',             false,      true,          false],
    on:                   ['Disable 8D Audio',        true,       true,          false],
    turningOff:           ['Turning off…',            false,      true,          false],
    failed:               ['Try again',               true,       false,         false],
  };
  function renderView() {
    const st = view.state;
    const [text, clickable, showLive, showSite] = VIEW[st];
    toggleButton.textContent = text;
    toggleButton.disabled = !clickable;
    toggleButton.classList.toggle('on', st === 'on' || st === 'turningOff');
    toggleButton.setAttribute('aria-busy', String(['loading', 'turningOn', 'turningOff', 'requestingPermission'].includes(st)));
    live.style.display = showLive ? '' : 'none';
    if (!showLive) controlsDiv.classList.remove('visible');
    enableSiteButton.style.display = showSite ? 'block' : 'none';
    enableSiteButton.disabled = st === 'requestingPermission';
    errorBox.textContent = errorText;
    errorBox.classList.toggle('show', !!errorText);
  }
  function fail(msg) {
    errorText = msg;
    view.send('LOST') || view.send('FAIL');
    renderView();
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
    const preset = presetFor(s);
    document.querySelectorAll('.chip[data-preset]').forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));
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
      change(patch);
    });
    $('presets').appendChild(b);
  }
  for (const [id, p] of Object.entries(PATTERNS)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = p.label;
    $('pattern').appendChild(o);
  }

  // Every settings change goes through here; the highlighted preset is derived from s.
  async function change(patch) {
    Object.assign(s, patch);
    render();
    const ok = await send({ action: 'set', patch });
    if (!ok) fail('Lost the page. Refresh it and try again.');
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

  // On failure the checkbox snaps back to what the page really has.
  async function setOption(action, value) {
    const st = await send({ action, value });
    if (st) Object.assign(s, st);
    render();
    if (!st) fail('Lost the page. Refresh it and try again.');
  }
  $('perSite').addEventListener('change', (e) => setOption('setPerSite', e.target.checked));
  $('autoStart').addEventListener('change', (e) => setOption('setAutoStart', e.target.checked));

  $('resetControls').addEventListener('click', () => change(Object.assign({}, DEFAULTS)));

  $('editControls').addEventListener('click', () => controlsDiv.classList.toggle('visible'));
  $('openConverter').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('converter.html') }));

  toggleButton.addEventListener('click', async () => {
    if (view.is('failed')) { view.send('RETRY'); start(); return; }
    if (!view.send('TOGGLE')) return; // already switching: ignore double clicks
    const r = await send({ action: 'setEnabled', value: view.is('turningOn') });
    if (!r) { fail('Lost the page. Refresh it and try again.'); return; }
    errorText = r.enabled ? '' : (r.error || '');
    view.send(r.enabled ? 'TURNED_ON' : (view.is('turningOn') ? 'REFUSED' : 'TURNED_OFF'));
    renderView();
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
    const pos = view.is('on', 'turningOff') ? await send({ action: 'getPosition' }) : null;
    drawViz(pos);
    setTimeout(() => requestAnimationFrame(vizLoop), 50);
  }

  // ---------- start ----------
  chrome.commands.getAll((cmds) => {
    const c = cmds.find((x) => x.name === 'toggle-8d');
    if (c && c.shortcut) document.querySelector('.footer span').textContent = 'Shortcut ' + c.shortcut;
  });
  document.querySelector('.footer span:last-child').textContent = 'v' + chrome.runtime.getManifest().version;

  enableSiteButton.addEventListener('click', async () => {
    if (!view.send('REQUEST')) return;
    // must be called straight from the click
    const ok = await chrome.permissions.request({ origins: [origin] }).catch(() => false);
    if (!ok) { view.send('DENIED'); return; }
    await new Promise((r) => chrome.runtime.sendMessage({ action: 'siteEnabled', tabId: tab.id }, r));
    view.send('GRANTED');
    start();
  });

  // loading -> one of: unsupported, needsPermission, off, on, failed
  async function start() {
    errorText = '';
    renderView();
    if (!tab || !isWeb(tab.url)) { view.send('UNSUPPORTED'); return; }
    origin = new URL(tab.url).origin + '/*';
    $('host').textContent = new URL(tab.url).hostname;
    if (!isYouTube(tab.url) && !(await chrome.permissions.contains({ origins: [origin] }))) {
      view.send('NEEDS_PERMISSION');
      return;
    }
    const state = await getStateOrInject();
    if (!state) { fail('Couldn\'t reach this page. Refresh it and try again.'); return; }
    s = Object.assign(s, state);
    render();
    view.send(state.enabled ? 'READY_ON' : 'READY_OFF');
  }

  renderView();
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    tab = tabs[0];
    start();
    vizLoop();
  });
});
