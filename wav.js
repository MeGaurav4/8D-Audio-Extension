// AudioBuffer -> 16-bit PCM WAV (with light dither). Works in the browser and in node tests.
(function (root) {
  'use strict';
  function encodeWav(buffer) {
    const ch = buffer.numberOfChannels;
    const sr = buffer.sampleRate;
    const len = buffer.length;
    const bytes = 44 + len * ch * 2;
    const ab = new ArrayBuffer(bytes);
    const v = new DataView(ab);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, bytes - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, len * ch * 2, true);
    const data = [];
    for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < ch; c++) {
        let x = data[c][i] + (Math.random() - Math.random()) / 65536; // TPDF dither
        x = Math.max(-1, Math.min(1, x));
        v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
        o += 2;
      }
    }
    return ab;
  }
  const api = { encodeWav };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EightDWav = api;
})(typeof self !== 'undefined' ? self : this);
