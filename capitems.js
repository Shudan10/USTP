'use strict';
// Caps every item icon (and its lighting map) in USTP/textures/items at 64 px wide.
// All item icons — including other add-ons' — share one texture sheet. At 128x ours filled it, so add-on
// items (e.g. a minimap mod's) were left without room and rendered pink. 64x matches what Faithful 64x uses.
//   node capitems.js   (run after the generators, before pack.js)
const fs = require('fs'), path = require('path');
const { readImage, pngBuf, tgaBuf, writeFile, isTintMask } = require('./imageio');

const MAX = 64, DIR = path.join(__dirname, 'USTP', 'textures', 'items');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// 2× box downsample; colour averaged over opaque samples only, alpha kept as a hard cut-out
// (held items are extruded from it), except tint-mask TGAs whose alpha is data and gets averaged straight
function halve(img, straight) {
  const W = img.w >> 1, H = img.h >> 1, out = new Uint8Array(W * H * 4), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = ((y * 2 + dy) * img.w + x * 2 + dx) * 4;
      a += d[i + 3];
      if (straight || d[i + 3] > 0) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    }
    const o = (y * W + x) * 4;
    if (n) { out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); }
    out[o + 3] = straight ? Math.round(a / 4) : (a >= 510 ? 255 : 0);
  }
  return { w: W, h: H, data: out };
}

let capped = 0;
for (const file of walk(DIR).filter(f => /\.(png|tga)$/.test(f))) {
  let img = readImage(file); if (img.w <= MAX) continue;
  const straight = file.endsWith('.tga') && isTintMask(img), mers = /_mers?\.png$/.test(file);
  while (img.w > MAX) img = halve(img, straight || mers);
  if (mers) for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;   // lighting maps stay opaque
  if (file.endsWith('.tga')) writeFile(file, tgaBuf(img.w, img.h, img.data));
  else {
    const buf = fs.readFileSync(file), ch = { 0: 3, 2: 3, 6: 4 }[buf[25]] || 4, px = new Uint8Array(img.w * img.h * ch);
    for (let i = 0; i < img.w * img.h; i++) for (let c = 0; c < ch; c++) px[i * ch + c] = img.data[i * 4 + c];
    writeFile(file, pngBuf(img.w, img.h, ch, px));
  }
  capped++;
}
let px = 0; for (const f of walk(DIR).filter(f => /\.(png|tga)$/.test(f) && !/_mers?\./.test(f))) { const im = readImage(f); px += im.w * im.h; }
console.log(`Capped ${capped} item textures at ${MAX}px. Item sheet now ${(px / 1e6).toFixed(2)} Mpx of colour.`);
