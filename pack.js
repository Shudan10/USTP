'use strict';
// Packs ./USTP into one USTP.mcpack (a plain zip with manifest.json at the root) that carries three
// quality levels as Bedrock subpacks, chosen in the pack's settings (gear icon):
//   128x Full (base textures) · 64x Balanced · 32x Performance
// The 64x / 32x subpacks hold every texture downsampled; when one is selected its files override the base.
// Each subpack declares a memory_tier so the game can steer lower-memory devices to the lighter levels.
//   node pack.js   → USTP.mcpack
// Images are stored as-is (already compressed); JSON is deflated.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { readImage, pngBuf, tgaBuf, isTintMask } = require('./imageio');

const SRC = path.join(__dirname, 'USTP'), DEST = path.join(__dirname, 'USTP.mcpack');
const SUBPACKS = [   // ascending memory; folder_name is the path under subpacks/
  { folder_name: 'performance_32x', name: '32x Performance: phones, Switch and older consoles', memory_tier: 1, halvings: 2 },
  { folder_name: 'balanced_64x', name: '64x Balanced: tablets and mid-range devices', memory_tier: 2, halvings: 1 },
  { folder_name: 'full_128x', name: '128x Full quality: PC, Xbox Series X|S and PS5', memory_tier: 4, halvings: 0 },
];
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
function downscale(file, data, times) {
  let img = readImage(file); const straight = file.endsWith('.tga') && isTintMask(img);
  for (let k = 0; k < times && img.w > 1 && img.h > 1; k++) img = halve(img, straight);
  if (file.endsWith('.tga')) return tgaBuf(img.w, img.h, img.data);
  const ch = { 2: 3, 6: 4 }[data[25]] || 3, px = new Uint8Array(img.w * img.h * ch);
  for (let i = 0; i < img.w * img.h; i++) for (let c = 0; c < ch; c++) px[i * ch + c] = img.data[i * 4 + c];
  return pngBuf(img.w, img.h, ch, px);
}

const parts = [], central = [];
let offset = 0;
function add(rel, data) { // rel ending in '/' is a directory entry
  const name = Buffer.from(rel), crc = zlib.crc32(data), deflate = /\.(json|txt|lang)$/.test(rel), body = deflate ? zlib.deflateRawSync(data, { level: 9 }) : data;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8);
  h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); // 1980-01-01, keeps builds reproducible
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  parts.push(h, name, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10);
  c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42); if (rel.endsWith('/')) c.writeUInt32LE(0x10, 38);
  central.push(c, name);
  offset += h.length + name.length + body.length;
}

const files = walk(SRC);
for (const file of files) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  let data = fs.readFileSync(file);
  if (rel === 'manifest.json') { const m = JSON.parse(data); m.subpacks = SUBPACKS.map(({ folder_name, name, memory_tier }) => ({ folder_name, name, memory_tier })); data = Buffer.from(JSON.stringify(m, null, 2)); }
  add(rel, data);
}
const textures = files.filter(f => /\.(png|tga)$/.test(f) && path.relative(SRC, f).startsWith('textures'));
for (const sp of SUBPACKS) {
  add(`subpacks/${sp.folder_name}/`, Buffer.alloc(0));
  if (!sp.halvings) continue;   // the full level uses the base textures as they are
  for (const file of textures) add(`subpacks/${sp.folder_name}/${path.relative(SRC, file).split(path.sep).join('/')}`, downscale(file, fs.readFileSync(file), sp.halvings));
  console.log(`  ${sp.folder_name}: ${textures.length} textures`);
}
const cd = Buffer.concat(central), end = Buffer.alloc(22), count = central.length / 2;
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(DEST, Buffer.concat([...parts, cd, end]));
console.log(`Packed ${count} entries → ${path.basename(DEST)} (${(fs.statSync(DEST).size / 1048576).toFixed(1)} MB)`);
