// Colour-vision check for the candy palette.
// Simulates protanopia, deuteranopia and tritanopia (Machado, Oliveira & Fernandes 2009, severity 1.0)
// and full colour blindness (luminance only), then measures how far apart every pair of candy colours
// stays, as CIEDE2000 colour difference. Usage: node tools/cvd.js [hex hex ...]
'use strict';
const PALETTE = process.argv.slice(2).length ? process.argv.slice(2) : ['#ff3b5c', '#ff9419', '#ffd92e', '#35d05e', '#2f9bff', '#a752f5'];
const NAMES = ['cherry', 'tangerine', 'lemon', 'lime', 'blueberry', 'grape'];
const M = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const toSrgb = v => { v = Math.min(1, Math.max(0, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function simulate(rgb, kind) {
  const lin = rgb.map(toLin);
  if (kind === 'none') return rgb;
  if (kind === 'achromatopsia') { const y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]; return [y, y, y].map(toSrgb); }
  const m = M[kind]; return m.map(row => toSrgb(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
}
function lab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  [x, y, z] = [x, y, z].map(f);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function de2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a, b) => { const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1p = h(a1p, b1), h2p = h(a2p, b2), dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0; if (C1p * C2p) { dhp = h2p - h1p; if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360; }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2 * rad), Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p; if (C1p * C2p) { if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360; hbp /= 2; }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2)), Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + 0.015 * Math.pow(Lbp - 50, 2) / Math.sqrt(20 + Math.pow(Lbp - 50, 2)), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T, Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt(Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh));
}
function report(palette) {
  const kinds = ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'], out = {};
  for (const k of kinds) {
    const labs = palette.map(h => lab(simulate(hex(h), k))), pairs = [];
    for (let i = 0; i < labs.length; i++) for (let j = i + 1; j < labs.length; j++) pairs.push({ a: NAMES[i], b: NAMES[j], de: de2000(labs[i], labs[j]) });
    pairs.sort((x, y) => x.de - y.de);
    out[k] = { min: pairs[0], under20: pairs.filter(p => p.de < 20).map(p => `${p.a}/${p.b} ${p.de.toFixed(1)}`) };
  }
  return out;
}
module.exports = { report, simulate, lab, de2000, hex };
if (require.main === module) {
  const r = report(PALETTE);
  console.log('Closest pair of candy colours per vision type (CIEDE2000; under ~10 is easy to confuse at a glance, 20+ is comfortable)');
  for (const [k, v] of Object.entries(r)) console.log(`${k.padEnd(14)} closest ${v.min.a}/${v.min.b} ${v.min.de.toFixed(1)}   pairs under 20: ${v.under20.join(', ') || 'none'}`);
}
