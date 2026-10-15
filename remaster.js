'use strict';
// USTP remaster: brings every vanilla Bedrock block, item and block-entity texture up to 128x in the
// USTP style (soft natural shading, relief lighting, vibrant grading), carrying over Mojang's
// Vibrant Visuals MERS maps and adding heightmaps. Hand-made textures from gen.js are kept as-is.
//
// Usage: node remaster.js <bedrock-samples/resource_pack> [--only=<substring>] [--sheet=<file.png>]
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'textures'))) {
  console.error('Usage: node remaster.js <path to Mojang bedrock-samples/resource_pack>');
  process.exit(1);
}
const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const ONLY = arg('only'), SHEET = arg('sheet');
const OUT = path.join(__dirname, 'USTP', 'textures');
const FOLDERS = [
  { dir: 'blocks', mode: 'tile' },
  { dir: 'items', mode: 'item' },
  { dir: 'entity/chest', mode: 'entity' },
  { dir: 'entity/bed', mode: 'entity' },
  { dir: 'entity/shulker', mode: 'entity' },
];
const TARGET = 128;               // pixels per block face / item icon
const PBR_SUFFIX = /_(mers|mer|normal|heightmap)$/;

// ---------------------------------------------------------------- noise (tileable over 128)
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
function h2(s, x, y) {
  let h = Math.imul(s | 0, 0x9E3779B1) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x5bd1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, p, s) {
  const fx = x / TARGET * p, fy = y / TARGET * p, x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const X0 = ((x0 % p) + p) % p, X1 = (X0 + 1) % p, Y0 = ((y0 % p) + p) % p, Y1 = (Y0 + 1) % p;
  return lerp(lerp(h2(s, X0, Y0), h2(s, X1, Y0), tx), lerp(h2(s, X0, Y1), h2(s, X1, Y1), tx), ty);
}
const fbm = (x, y, p, s) => (vnoise(x, y, p, s) + 0.5 * vnoise(x, y, p * 2, s + 1) + 0.25 * vnoise(x, y, p * 4, s + 2)) / 1.75;
const seedOf = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ---------------------------------------------------------------- decoders
function unfilter(l, p, f, bpp) {
  for (let i = 0; i < l.length; i++) {
    const a = i >= bpp ? l[i - bpp] : 0, b = p[i], c = i >= bpp ? p[i - bpp] : 0;
    let x = l[i];
    if (f === 1) x += a; else if (f === 2) x += b; else if (f === 3) x += (a + b) >> 1;
    else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); x += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    l[i] = x & 255;
  }
}
function readPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w, h, bd, ct, il, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); p += 12 + len;
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, (ch * bd) >> 3);
  const out = new Uint8Array(w * h * 4), maxv = (1 << Math.min(bd, 8)) - 1;
  const passes = il ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let off = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil(pw * ch * bd / 8); let prev = Buffer.alloc(stride);
    for (let r = 0; r < ph; r++) {
      const f = raw[off], line = Buffer.from(raw.subarray(off + 1, off + 1 + stride)); off += 1 + stride;
      unfilter(line, prev, f, bpp); prev = line;
      const val = (c, k) => {
        const n = c * ch + k;
        if (bd === 8) return line[n]; if (bd === 16) return line[n * 2];
        const bit = n * bd; return (line[bit >> 3] >> (8 - bd - (bit & 7))) & maxv;
      };
      for (let c = 0; c < pw; c++) {
        const o = ((y0 + r * dy) * w + x0 + c * dx) * 4; let R, G, B, A = 255;
        if (ct === 0) { const v = val(c, 0); R = G = B = bd < 8 ? Math.round(v * 255 / maxv) : v; if (trns && bd <= 8 && v === trns.readUInt16BE(0)) A = 0; }
        else if (ct === 2) { R = val(c, 0); G = val(c, 1); B = val(c, 2); if (trns && bd === 8 && R === trns.readUInt16BE(0) && G === trns.readUInt16BE(2) && B === trns.readUInt16BE(4)) A = 0; }
        else if (ct === 3) { const i = val(c, 0); R = pal[i * 3]; G = pal[i * 3 + 1]; B = pal[i * 3 + 2]; if (trns && i < trns.length) A = trns[i]; }
        else if (ct === 4) { R = G = B = val(c, 0); A = val(c, 1); }
        else { R = val(c, 0); G = val(c, 1); B = val(c, 2); A = val(c, 3); }
        out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
      }
    }
  }
  return { w, h, data: out };
}
function readTGA(b) {
  const idl = b[0], cmt = b[1], it = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17], px = bpp >> 3;
  if (cmt || ![1, 3, 4].includes(px)) throw new Error(`unsupported TGA (cmap ${cmt}, ${bpp}bpp)`);
  const n = w * h, out = new Uint8Array(n * 4); let p = 18 + idl;
  const put = (i, o) => {
    if (px === 1) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = b[o]; out[i * 4 + 3] = 255; }
    else { out[i * 4] = b[o + 2]; out[i * 4 + 1] = b[o + 1]; out[i * 4 + 2] = b[o]; out[i * 4 + 3] = px === 4 ? b[o + 3] : 255; }
  };
  if (it === 2 || it === 3) for (let i = 0; i < n; i++) put(i, p + i * px);
  else if (it === 10 || it === 11) {
    let i = 0;
    while (i < n) {
      const hd = b[p++], cnt = (hd & 127) + 1;
      if (hd & 128) { for (let k = 0; k < cnt && i < n; k++) put(i++, p); p += px; }
      else for (let k = 0; k < cnt && i < n; k++) { put(i++, p); p += px; }
    }
  } else throw new Error(`unsupported TGA type ${it}`);
  if (!(desc & 0x20)) { // bottom-left origin → flip
    const row = w * 4, tmp = new Uint8Array(row);
    for (let y = 0; y < h >> 1; y++) { const a = y * row, z = (h - 1 - y) * row; tmp.set(out.subarray(a, a + row)); out.copyWithin(a, z, z + row); out.set(tmp, z); }
  }
  return { w, h, data: out };
}
const readImage = f => (f.endsWith('.tga') ? readTGA : readPNG)(fs.readFileSync(f));

// ---------------------------------------------------------------- encoders
function pngBuf(w, h, ch, px) {
  const ct = { 1: 0, 3: 2, 4: 6 }[ch], stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ct;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 7 })), chunk('IEND', Buffer.alloc(0))]);
}
function tgaBuf(w, h, rgba) {
  const b = Buffer.alloc(18 + w * h * 4); b[2] = 2; b.writeUInt16LE(w, 12); b.writeUInt16LE(h, 14); b[16] = 32; b[17] = 0x28;
  for (let i = 0; i < w * h; i++) { b[18 + i * 4] = rgba[i * 4 + 2]; b[19 + i * 4] = rgba[i * 4 + 1]; b[20 + i * 4] = rgba[i * 4]; b[21 + i * 4] = rgba[i * 4 + 3]; }
  return b;
}
function writeImage(file, img, forceAlpha) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (file.endsWith('.tga')) return fs.writeFileSync(file, tgaBuf(img.w, img.h, img.data));
  let opaque = !forceAlpha;
  for (let i = 3; opaque && i < img.data.length; i += 4) if (img.data[i] !== 255) opaque = false;
  if (!opaque) return fs.writeFileSync(file, pngBuf(img.w, img.h, 4, img.data));
  const rgb = new Uint8Array(img.w * img.h * 3);
  for (let i = 0; i < img.w * img.h; i++) { rgb[i * 3] = img.data[i * 4]; rgb[i * 3 + 1] = img.data[i * 4 + 1]; rgb[i * 3 + 2] = img.data[i * 4 + 2]; }
  fs.writeFileSync(file, pngBuf(img.w, img.h, 3, rgb));
}

// ---------------------------------------------------------------- upscaling
// Frame-aware addressing: animated strips are stacks of square frames; tiles wrap within a frame,
// items/entities treat outside pixels as transparent.
function addr(w, h, wrapMode, frameH) {
  return (x, y, cy) => {
    if (wrapMode) {
      const f0 = Math.floor(cy / frameH) * frameH;
      return (f0 + ((y - f0) % frameH + frameH) % frameH) * w + ((x % w) + w) % w;
    }
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
}
// Scale2x (EPX): doubles pixel art while rounding diagonal steps instead of blurring them
function scale2x(img, wrapMode, frameH) {
  const { w, h } = img, src = new Uint32Array(img.data.buffer, img.data.byteOffset, w * h);
  const W = w * 2, H = h * 2, outB = new Uint8Array(W * H * 4), out = new Uint32Array(outB.buffer), at = addr(w, h, wrapMode, frameH);
  const px = (x, y, cy) => { const i = at(x, y, cy); return i < 0 ? 0 : src[i]; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = src[y * w + x], A = px(x, y - 1, y), B = px(x + 1, y, y), C = px(x - 1, y, y), D = px(x, y + 1, y);
    const o = y * 2 * W + x * 2;
    out[o] = C === A && C !== D && A !== B ? A : P;
    out[o + 1] = A === B && A !== C && B !== D ? B : P;
    out[o + W] = D === C && D !== B && C !== A ? C : P;
    out[o + W + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return { w: W, h: H, data: outB };
}
function nearest(img, f) {
  const W = Math.round(img.w * f), H = Math.round(img.h * f), out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const s = (Math.min(img.h - 1, Math.floor(y / f)) * img.w + Math.min(img.w - 1, Math.floor(x / f))) * 4, o = (y * W + x) * 4;
    out[o] = img.data[s]; out[o + 1] = img.data[s + 1]; out[o + 2] = img.data[s + 2]; out[o + 3] = img.data[s + 3];
  }
  return { w: W, h: H, data: out };
}
function upscale(img, f, wrapMode, keepRGB) {
  // normalise fully transparent pixels so EPX edge tests compare cleanly (unless alpha is a tint mask)
  if (!keepRGB) for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) img.data[i - 3] = img.data[i - 2] = img.data[i - 1] = 0;
  let frameH = img.h > img.w && img.h % img.w === 0 ? img.w : img.h;
  while (f >= 2) { img = scale2x(img, wrapMode, frameH); frameH *= 2; f /= 2; }
  return f > 1.01 ? nearest(img, f) : img;
}

// ---------------------------------------------------------------- styling
function blur(src, w, h, R, wrapMode, frameH) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), at = addr(w, h, wrapMode, frameH);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0; for (let k = -R; k <= R; k++) { const i = at(x + k, y, y); if (i >= 0) { s += src[i]; n++; } } tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0; for (let k = -R; k <= R; k++) { const i = at(x, y + k, y); if (i >= 0) { s += tmp[i]; n++; } } out[y * w + x] = s / n;
  }
  return out;
}
function stylize(img, mode, seed, scale, mask) {
  const { w, h, data } = img, n = w * h, tile = mode === 'tile';
  const frameH = h > w && h % w === 0 ? w : h;
  // a tint-mask TGA keeps meaningful colour under alpha 0, so treat it as fully opaque while styling
  const alpha = new Float32Array(n); for (let i = 0; i < n; i++) alpha[i] = mask ? 1 : data[i * 4 + 3] / 255;
  const ch = [0, 1, 2].map(k => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = data[i * 4 + k] / 255 * alpha[i]; return a; });
  const R = Math.max(1, Math.round(scale / (tile ? 3 : 4)));
  // soften the pixel grid into painted shapes (premultiplied so transparent pixels don't bleed in)
  const ba = blur(alpha, w, h, R, tile, frameH), bc = ch.map(c => blur(c, w, h, R, tile, frameH));
  const soft = tile ? 0.5 : 0.35;
  const lum = new Float32Array(n), col = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const a = alpha[i] || 1;
    for (let k = 0; k < 3; k++) {
      const sharp = ch[k][i] / a, smooth = ba[i] > 0.001 ? bc[k][i] / ba[i] : sharp;
      col[k][i] = alpha[i] > 0 ? lerp(sharp, smooth, soft) : 0;
    }
    lum[i] = 0.299 * col[0][i] + 0.587 * col[1][i] + 0.114 * col[2][i];
  }
  // height: broad luminance relief + fine natural grain
  const hb = blur(lum, w, h, Math.max(1, R), tile, frameH), height = new Float32Array(n);
  let lo = 1, hi = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; height[i] = hb[i] * 0.8 + fbm(x, y % frameH, 16, seed) * 0.2;
    if (alpha[i] > 0) { lo = Math.min(lo, height[i]); hi = Math.max(hi, height[i]); }
  }
  for (let i = 0; i < n; i++) height[i] = alpha[i] > 0 ? 0.25 + 0.5 * (height[i] - lo) / (hi - lo || 1) : 0;
  const hs = blur(height, w, h, 3, tile, frameH), at = addr(w, h, tile, frameH);
  const H = (x, y, cy) => { const i = at(x, y, cy); return i < 0 ? 0 : height[i]; };
  const A = (x, y, cy) => { const i = at(x, y, cy); return i < 0 ? 0 : alpha[i]; };
  const edge = Math.max(2, Math.round(scale / 3));
  const out = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (alpha[i] === 0) continue;
    const dx = H(x + 1, y, y) - H(x - 1, y, y), dy = H(x, y + 1, y) - H(x, y - 1, y);
    let k = 1 - (dx + dy) * (tile ? 2.2 : 1.6) + (height[i] - hs[i]) * 1.1;
    k *= 1 + (fbm(x, y % frameH, 32, seed + 7) - 0.5) * 0.08 + (h2(seed, x, y) - 0.5) * 0.035;
    if (!tile) { // crisp modern icon edges: top-left rim light, bottom-right shade, darker silhouette
      if (A(x - edge, y - edge, y) < 0.5) k *= 1.14;
      if (A(x + edge, y + edge, y) < 0.5) k *= 0.82;
      if (A(x - 1, y, y) < 0.5 || A(x + 1, y, y) < 0.5 || A(x, y - 1, y) < 0.5 || A(x, y + 1, y) < 0.5) k *= 0.7;
    }
    k = clamp(k, 0.5, 1.45);
    let r = col[0][i] * k, g = col[1][i] * k, b = col[2][i] * k;
    // vibrant grade: lift saturation of coloured pixels only (greyscale tint masks stay neutral), gentle contrast
    const L = 0.299 * r + 0.587 * g + 0.114 * b, s = Math.max(r, g, b) - Math.min(r, g, b);
    if (s > 0.05) { const v = 1 + 0.22 * (1 - s); r = L + (r - L) * v; g = L + (g - L) * v; b = L + (b - L) * v; }
    r = (r - 0.5) * 1.05 + 0.5; g = (g - 0.5) * 1.05 + 0.5; b = (b - 0.5) * 1.05 + 0.5;
    out[i * 4] = Math.round(clamp(r) * 255); out[i * 4 + 1] = Math.round(clamp(g) * 255); out[i * 4 + 2] = Math.round(clamp(b) * 255);
    out[i * 4 + 3] = mode === 'item' ? (alpha[i] >= 0.5 ? 255 : 0) : data[i * 4 + 3];
  }
  return { img: { w, h, data: out }, height };
}

// Alpha is a tint mask (not cutout) when most fully-transparent pixels still carry real colour
function isTintMask(img) {
  let zero = 0, coloured = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) { zero++; if (img.data[i - 3] + img.data[i - 2] + img.data[i - 1] > 30) coloured++; }
  return zero > 0 && coloured / zero > 0.6;
}

// ---------------------------------------------------------------- pipeline
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
const handMade = new Set(walk(path.join(OUT, 'blocks')).filter(f => /\.(png|tga)$/.test(f)).map(f => path.relative(OUT, f).replace(/\.(png|tga)$/, '').split(path.sep).join('/')));
const stats = { color: 0, pbr: 0, skipped: 0, failed: [] };
const sheetItems = [];

for (const { dir, mode } of FOLDERS) {
  const files = walk(path.join(SRC, 'textures', dir));
  const images = files.filter(f => /\.(png|tga)$/.test(f));
  const byBase = new Map(images.map(f => [f.replace(/\.(png|tga)$/, ''), f]));
  for (const file of images) {
    const base = file.replace(/\.(png|tga)$/, ''), rel = path.relative(path.join(SRC, 'textures'), base).split(path.sep).join('/');
    if (PBR_SUFFIX.test(base) || (ONLY && !rel.includes(ONLY))) continue;
    if (handMade.has(rel)) { stats.skipped++; continue; }
    try {
      const src = readImage(file), frame = Math.min(src.w, src.h > src.w && src.h % src.w === 0 ? src.w : src.h);
      const f = mode === 'entity' ? 8 : Math.max(1, Math.min(8, TARGET / frame));
      const mask = mode === 'tile' && isTintMask(src);
      const big = upscale(src, f, mode === 'tile', mask);
      const seed = seedOf(rel), { img, height } = stylize(big, mode, seed, f, mask);
      writeImage(path.join(OUT, rel + path.extname(file)), img, mode === 'item');
      stats.color++;
      if (sheetItems.length < 400) sheetItems.push({ rel, img });

      // Vibrant Visuals / RTX: carry over Mojang's MERS for this texture, add our heightmap
      const setFile = base + '.texture_set.json';
      if (mode !== 'entity' && fs.existsSync(setFile)) {
        const set = JSON.parse(fs.readFileSync(setFile, 'utf8'))['minecraft:texture_set'] || {};
        const name = path.basename(base), ts = { color: set.color ?? name };
        const merKey = ['metalness_emissive_roughness_subsurface', 'metalness_emissive_roughness'].find(k => k in set);
        if (merKey) {
          const ref = set[merKey], mf = typeof ref === 'string' && byBase.get(path.join(path.dirname(base), ref));
          if (mf) {
            const m = readImage(mf), mbig = upscale(m, img.w / m.w, mode === 'tile');
            for (let i = 0; i < mbig.w * mbig.h; i++) {   // a little natural variation in roughness
              const x = i % mbig.w, y = (i / mbig.w) | 0;
              mbig.data[i * 4 + 2] = Math.round(clamp(mbig.data[i * 4 + 2] / 255 + (fbm(x, y % TARGET, 16, seed + 3) - 0.5) * 0.12) * 255);
            }
            writeImage(path.join(OUT, rel + '_mers.png'), mbig, true);
            ts.metalness_emissive_roughness_subsurface = name + '_mers';
          } else ts[merKey] = ref;
        }
        const hm = new Uint8Array(img.w * img.h); for (let i = 0; i < hm.length; i++) hm[i] = Math.round(clamp(height[i]) * 255);
        fs.writeFileSync(path.join(OUT, rel + '_heightmap.png'), pngBuf(img.w, img.h, 1, hm));
        ts.heightmap = name + '_heightmap';
        fs.writeFileSync(path.join(OUT, rel + '.texture_set.json'), JSON.stringify({ format_version: '1.21.30', 'minecraft:texture_set': ts }, null, 2));
        stats.pbr++;
      }
    } catch (e) { stats.failed.push(`${rel}: ${e.message}`); }
  }
}

if (SHEET) { // contact sheet of the first textures processed (first 128x128 frame of each)
  const cols = 16, rows = Math.ceil(sheetItems.length / cols), W = cols * TARGET, Hh = rows * TARGET, px = new Uint8Array(W * Hh * 3);
  sheetItems.forEach(({ img }, k) => {
    const ox = (k % cols) * TARGET, oy = Math.floor(k / cols) * TARGET, s = Math.max(1, img.w / TARGET);
    for (let y = 0; y < TARGET; y++) for (let x = 0; x < TARGET; x++) {
      const sx = Math.floor(x * s), sy = Math.floor(y * s), si = (sy * img.w + sx) * 4, bg = ((x >> 3) + (y >> 3)) & 1 ? 70 : 55, di = ((oy + y) * W + ox + x) * 3;
      if (sx >= img.w || sy >= img.h) { px[di] = px[di + 1] = px[di + 2] = bg; continue; }
      const a = img.data[si + 3] / 255;
      for (let c = 0; c < 3; c++) px[di + c] = Math.round(img.data[si + c] * a + bg * (1 - a));
    }
  });
  fs.writeFileSync(SHEET, pngBuf(W, Hh, 3, px));
}
console.log(`Remastered ${stats.color} textures (${stats.pbr} with PBR), kept ${stats.skipped} hand-made.`);
if (stats.failed.length) console.log(`Failed ${stats.failed.length}:\n  ` + stats.failed.join('\n  '));
