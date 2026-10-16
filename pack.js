'use strict';
// Packs ./USTP into a .mcpack (a plain zip with manifest.json at the root).
//   node pack.js          → USTP_128x.mcpack
//   node pack.js --lite   → USTP_64x_Lite.mcpack: every texture halved, installs as a separate pack
// Images are stored as-is (already compressed); JSON is deflated.
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { readImage, pngBuf, tgaBuf, isTintMask } = require('./imageio');

const LITE = process.argv.includes('--lite');
const SRC = path.join(__dirname, 'USTP'), DEST = path.join(__dirname, LITE ? 'USTP_64x_Lite.mcpack' : 'USTP_128x.mcpack');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

// 2× box downsample; premultiplied so cutout edges don't pick up the black behind them,
// except for tint-mask TGAs whose colour under alpha 0 is meaningful
function halve(img, straight) {
  const W = Math.max(1, img.w >> 1), H = Math.max(1, img.h >> 1), out = new Uint8Array(W * H * 4), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const i = (Math.min(img.h - 1, y * 2 + dy) * img.w + Math.min(img.w - 1, x * 2 + dx)) * 4, k = straight ? 1 : d[i + 3] / 255;
      r += d[i] * k; g += d[i + 1] * k; b += d[i + 2] * k; a += d[i + 3];
    }
    const o = (y * W + x) * 4, norm = straight ? 4 : a / 255 || 1;
    out[o] = Math.round(r / norm); out[o + 1] = Math.round(g / norm); out[o + 2] = Math.round(b / norm); out[o + 3] = Math.round(a / 4);
  }
  return { w: W, h: H, data: out };
}
function liteImage(file, data) {
  const img = readImage(file), half = halve(img, file.endsWith('.tga') && isTintMask(img));
  if (file.endsWith('.tga')) return tgaBuf(half.w, half.h, half.data);
  const ch = { 0: 1, 2: 3, 6: 4 }[data[25]] || 4, px = new Uint8Array(half.w * half.h * ch);
  for (let i = 0; i < half.w * half.h; i++) for (let c = 0; c < ch; c++) px[i * ch + c] = half.data[i * 4 + c];
  return pngBuf(half.w, half.h, ch, px);
}
function liteManifest(data) {
  const m = JSON.parse(data), id = s => { const h = crypto.createHash('md5').update(s).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
  m.header.name = 'Ultimate Survival Texture Pack (USTP) 64x Lite';
  m.header.description = 'Lighter 64x build of USTP for lower-memory devices. ' + m.header.description;
  m.header.uuid = id('ustp-lite-header');
  m.modules.forEach((mod, i) => { mod.uuid = id('ustp-lite-module-' + i); });
  return Buffer.from(JSON.stringify(m, null, 2));
}

const parts = [], central = [];
let offset = 0;
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join('/'), name = Buffer.from(rel);
  let data = fs.readFileSync(file);
  if (LITE && rel === 'manifest.json') data = liteManifest(data);
  else if (LITE && rel.startsWith('textures/') && /\.(png|tga)$/.test(rel)) data = liteImage(file, data);
  const crc = zlib.crc32(data), deflate = /\.(json|txt|lang)$/.test(file), body = deflate ? zlib.deflateRawSync(data, { level: 9 }) : data;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8);
  h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); // 1980-01-01, keeps builds reproducible
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  parts.push(h, name, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10);
  c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += h.length + name.length + body.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22), count = central.length / 2;
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(DEST, Buffer.concat([...parts, cd, end]));
console.log(`Packed ${count} files → ${path.basename(DEST)} (${(fs.statSync(DEST).size / 1048576).toFixed(1)} MB)`);
