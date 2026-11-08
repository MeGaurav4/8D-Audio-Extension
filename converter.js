// File converter: decode -> render offline through the same 8D engine -> WAV download.
(function () {
  'use strict';
  const { createEngine, DEFAULTS, PRESETS, PATTERNS, secondsPerLap } = window.EightDEngine;
  const { encodeWav } = window.EightDWav;
  const $ = (id) => document.getElementById(id);

  const s = Object.assign({}, DEFAULTS, { syncBpm: false });
  let preset = 'classic';
  const queue = []; // { file, row, done }

  const fields = {
    intensity: (v) => v,
    rotationSpeed: null,
    reverb: (v) => Math.round(v * 100) + '%',
    bass: (v) => (v > 0 ? '+' : '') + v + ' dB',
    treble: (v) => (v > 0 ? '+' : '') + v + ' dB',
  };

  function render() {
    for (const k of Object.keys(fields)) {
      $(k).value = s[k];
      if (fields[k]) $(k + 'Value').textContent = fields[k](Number(s[k]));
    }
    $('lapValue').textContent = secondsPerLap(s.rotationSpeed).toFixed(1) + 's per lap';
    $('pattern').value = s.pattern;
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.preset === preset));
  }

  for (const [id, p] of Object.entries(PRESETS)) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.preset = id;
    b.textContent = p.label;
    b.onclick = () => {
      for (const k of Object.keys(p)) if (k !== 'label') s[k] = p[k];
      preset = id;
      render();
    };
    $('presets').appendChild(b);
  }
  for (const [id, p] of Object.entries(PATTERNS)) {
    const o = document.createElement('option');
    o.value = id; o.textContent = p.label;
    $('pattern').appendChild(o);
  }
  for (const k of Object.keys(fields)) {
    $(k).addEventListener('input', () => { s[k] = parseFloat($(k).value); preset = ''; render(); });
  }
  $('pattern').addEventListener('change', (e) => { s.pattern = e.target.value; preset = ''; render(); });

  // start from the user's popup settings
  chrome.storage.sync.get(null, (g) => {
    for (const k of Object.keys(DEFAULTS)) if (g[k] !== undefined) s[k] = g[k];
    s.syncBpm = false;
    preset = g.preset || 'classic';
    render();
  });
  render();

  // ---------- files ----------
  const drop = $('drop');
  const input = $('files');
  drop.onclick = () => input.click();
  input.onchange = () => addFiles(input.files);
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

  function addFiles(list) {
    for (const file of list) {
      const row = document.createElement('div');
      row.className = 'file';
      row.innerHTML = '<div><div class="name"></div><div class="status">Ready</div></div><span class="action"></span>';
      row.querySelector('.name').textContent = file.name;
      $('list').appendChild(row);
      queue.push({ file, row, done: false });
    }
    updateCount();
  }
  function updateCount() {
    const todo = queue.filter((q) => !q.done).length;
    $('count').textContent = queue.length ? `${queue.length} file${queue.length > 1 ? 's' : ''}, ${todo} to convert` : 'No files yet';
    $('convert').disabled = todo === 0;
  }

  async function convertOne(item) {
    const status = item.row.querySelector('.status');
    const action = item.row.querySelector('.action');
    status.textContent = 'Reading…';
    const bytes = await item.file.arrayBuffer();
    const decoder = new AudioContext();
    let decoded;
    try {
      decoded = await decoder.decodeAudioData(bytes);
    } finally {
      decoder.close();
    }
    const tail = s.reverb > 0 ? 2.5 : 0.2;
    const sr = decoded.sampleRate;
    const ctx = new OfflineAudioContext(2, Math.ceil((decoded.duration + tail) * sr), sr);
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    const engine = createEngine(ctx, src, ctx.destination);
    engine.set(s);
    engine.setEnabled(true);
    // skip the on-switch fade for files: full effect from the first sample
    const n = engine.nodes;
    [n.bypassGain, n.effectGain].forEach((g) => g.gain.cancelScheduledValues(0));
    n.bypassGain.gain.value = 0;
    n.effectGain.gain.value = 1;
    src.start();

    status.innerHTML = '';
    const bar = document.createElement('progress');
    bar.max = 1;
    status.appendChild(bar);
    const timer = setInterval(() => { bar.value = ctx.currentTime / (decoded.duration + tail); }, 200);
    let out;
    try {
      out = await ctx.startRendering();
    } finally {
      clearInterval(timer);
    }
    const blob = new Blob([encodeWav(out)], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const name = item.file.name.replace(/\.[^.]+$/, '') + ' (8D).wav';
    status.textContent = `Done · ${(blob.size / 1048576).toFixed(1)} MB WAV`;
    const a = document.createElement('a');
    a.href = url; a.download = name; a.textContent = 'Download';
    action.appendChild(a);
    const player = document.createElement('audio');
    player.controls = true; player.src = url;
    item.row.appendChild(player);
  }

  $('convert').onclick = async () => {
    $('convert').disabled = true;
    for (const item of queue) {
      if (item.done) continue;
      try {
        await convertOne(item);
      } catch (e) {
        console.error(e);
        item.row.querySelector('.status').textContent = 'Couldn\'t read this file. Try MP3 or WAV.';
      }
      item.done = true;
      updateCount();
    }
  };
})();
