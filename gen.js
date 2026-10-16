'use strict';
// USTP — Ultimate Survival Texture Pack: procedural Bedrock texture generator (128x, RTX + Vibrant Visuals PBR)
// Run: node gen.js   → builds the ./USTP pack folder and ./preview.png
const fs = require('fs'), path = require('path'), zlib = require('zlib'), crypto = require('crypto');
const { tgaBuf, grayToRGB } = require('./imageio');

const N = 128;
const ROOT = __dirname;
const OUT = path.join(ROOT, 'USTP');
const BLK = path.join(OUT, 'textures', 'blocks');

// ---------------------------------------------------------------- math & noise
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const con = (v, k, mid = 0.5) => (v - mid) * k + mid;
const wrap = v => ((Math.round(v) % N) + N) % N;
const TAU = Math.PI * 2;

function h2(s, x, y) {
  let h = Math.imul(s | 0, 0x9E3779B1) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x5bd1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Tileable value noise: px/py = cell counts across the tile (integers)
function vnoise(x, y, px, py, s) {
  const fx = x / N * px, fy = y / N * py, x0 = Math.floor(fx), y0 = Math.floor(fy);
  let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const X0 = ((x0 % px) + px) % px, X1 = (X0 + 1) % px, Y0 = ((y0 % py) + py) % py, Y1 = (Y0 + 1) % py;
  return lerp(lerp(h2(s, X0, Y0), h2(s, X1, Y0), tx), lerp(h2(s, X0, Y1), h2(s, X1, Y1), tx), ty);
}
function fbm(x, y, px, py, oct, s, g = 0.5) {
  let v = 0, a = 1, t = 0;
  for (let o = 0; o < oct; o++) { v += a * vnoise(x, y, px << o, py << o, s + o * 131); t += a; a *= g; }
  return v / t;
}
// Tileable worley: k cells across
function worley(x, y, k, s, jit = 1) {
  const fx = x / N * k, fy = y / N * k, cx = Math.floor(fx), cy = Math.floor(fy);
  let f1 = 9, f2 = 9, id = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const gx = cx + dx, gy = cy + dy, wx = ((gx % k) + k) % k, wy = ((gy % k) + k) % k;
    const px = gx + 0.5 + (h2(s, wx, wy) - 0.5) * jit, py = gy + 0.5 + (h2(s + 17, wx, wy) - 0.5) * jit;
    const d = Math.hypot(px - fx, py - fy);
    if (d < f1) { f2 = f1; f1 = d; id = wx * k + wy; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id };
}

// ---------------------------------------------------------------- color
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const G = (...cs) => cs.map((c, i) => [i / (cs.length - 1), hex(c)]);
function grad(stops, t) {
  t = clamp(t);
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const a = stops[i - 1], b = stops[i], u = (t - a[0]) / (b[0] - a[0] || 1);
    return [lerp(a[1][0], b[1][0], u), lerp(a[1][1], b[1][1], u), lerp(a[1][2], b[1][2], u)];
  }
  return stops[stops.length - 1][1].slice();
}
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const tint = (c, t) => [c[0] * t[0], c[1] * t[1], c[2] * t[2]];

// ---------------------------------------------------------------- texture buffer
class Tex {
  constructor() {
    this.c = new Float32Array(N * N * 3); this.a = new Float32Array(N * N).fill(1);
    this.h = new Float32Array(N * N).fill(0.5); this.m = new Float32Array(N * N);
    this.e = new Float32Array(N * N); this.r = new Float32Array(N * N).fill(0.85);
  }
  each(f) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) f(x, y, y * N + x); return this; }
  col(i, c) { this.c[i * 3] = c[0]; this.c[i * 3 + 1] = c[1]; this.c[i * 3 + 2] = c[2]; }
  get(i) { return [this.c[i * 3], this.c[i * 3 + 1], this.c[i * 3 + 2]]; }
  clone() { const t = new Tex(); for (const k of ['c', 'a', 'h', 'm', 'e', 'r']) t[k].set(this[k]); return t; }
  // Bake soft directional light (top-left) + cavity AO from the heightmap into color
  bake(light = 0.55, ao = 0.6) {
    const h = this.h, bl = new Float32Array(N * N), tmp = new Float32Array(N * N), R = 3;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let k = -R; k <= R; k++) s += h[y * N + wrap(x + k)]; tmp[y * N + x] = s / (2 * R + 1); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let s = 0; for (let k = -R; k <= R; k++) s += tmp[wrap(y + k) * N + x]; bl[y * N + x] = s / (2 * R + 1); }
    return this.each((x, y, i) => {
      const dx = h[y * N + wrap(x + 1)] - h[y * N + wrap(x - 1)], dy = h[wrap(y + 1) * N + x] - h[wrap(y - 1) * N + x];
      const k = clamp(1 - (dx + dy) * light * 2 + (h[i] - bl[i]) * ao * 2, 0.45, 1.5);
      this.col(i, mul(this.get(i), k));
    });
  }
}
function rect(t, x0, y0, x1, y1, f) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) f(x, y, wrap(y) * N + wrap(x)); }
const edgeDist = (x, y, T = N) => { const lx = x % T, ly = y % T; return Math.min(lx, ly, T - 1 - lx, T - 1 - ly); };

// ---------------------------------------------------------------- writers
function pngBuf(w, h, ch, px) {
  const ct = { 1: 0, 3: 2, 4: 6 }[ch], stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ct;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const b8 = v => Math.round(clamp(v) * 255);
const made = [];
function save(t, name, o = {}) {
  const file = path.join(BLK, name); fs.mkdirSync(path.dirname(file), { recursive: true });
  const rgba = Buffer.alloc(N * N * 4), rgb = Buffer.alloc(N * N * 3);
  for (let i = 0; i < N * N; i++) for (let k = 0; k < 3; k++) { rgba[i * 4 + k] = rgb[i * 3 + k] = b8(t.c[i * 3 + k]); rgba[i * 4 + 3] = b8(t.a[i]); }
  if (o.tga) fs.writeFileSync(file + '.tga', tgaBuf(N, N, rgba));
  else fs.writeFileSync(file + '.png', o.alpha ? pngBuf(N, N, 4, rgba) : pngBuf(N, N, 3, rgb));
  made.push({ name, rgba, cutout: !!(o.alpha || o.tga) && !o.mask });
  if (o.pbr === false) return;
  const mer = Buffer.alloc(N * N * 3), hm = Buffer.alloc(N * N);
  for (let i = 0; i < N * N; i++) { mer[i * 3] = b8(t.m[i]); mer[i * 3 + 1] = b8(t.e[i]); mer[i * 3 + 2] = b8(t.r[i]); hm[i] = b8(t.h[i]); }
  fs.writeFileSync(file + '_mer.png', pngBuf(N, N, 3, mer));
  fs.writeFileSync(file + '_heightmap.png', grayToRGB(N, N, hm));
  const base = path.basename(name);
  fs.writeFileSync(file + '.texture_set.json', JSON.stringify({
    format_version: '1.16.100',
    'minecraft:texture_set': { color: base, metalness_emissive_roughness: base + '_mer', heightmap: base + '_heightmap' },
  }, null, 2));
}

// ---------------------------------------------------------------- palettes
const P = {
  stone: G('#595c61', '#6d7075', '#81848a', '#96999e', '#adb0b4'),
  smooth: G('#8a8d91', '#9fa2a5', '#b2b4b7', '#c3c5c7'),
  deep: G('#28292f', '#373840', '#474851', '#5a5b65'),
  andesite: G('#686b6c', '#7f8282', '#949797', '#a9abab'),
  diorite: G('#a6a6a3', '#c1c0bc', '#d8d7d3', '#edece8'),
  granite: G('#7a4e40', '#935f4f', '#a8735e', '#c08b74'),
  dirt: G('#46301f', '#5b3d27', '#714f30', '#886341', '#9c7752'),
  wetdirt: G('#271810', '#372216', '#472d1d', '#573826', '#664430'),
  sand: G('#c9b681', '#d9c894', '#e6d8a8', '#f0e5bd'),
  sandstone: G('#bea66b', '#d0ba81', '#ddcb95', '#e9daa9'),
  mortar: G('#2b2b2c', '#3f3f41', '#515154'),
  brick: G('#6e2f22', '#8c3d2b', '#a64d35', '#bc6145', '#cd7a5b'),
  brickMortar: G('#8d8a84', '#a7a49d', '#bdbab3'),
  moss: G('#2f4a17', '#44661f', '#5b8228', '#76a035'),
  quartz: G('#a7a39c', '#d6d3cc', '#ede9e3', '#fbfaf6'),
  glow: G('#4d300d', '#9c5f22', '#e6a23c', '#ffd66a', '#fff4c4'),
};
const WOOD = {
  oak: { plank: G('#7b5830', '#987244', '#b28a56', '#c69f68'), ring: G('#7a5a33', '#9c7848', '#b8935f', '#caa673'), bark: G('#33240f', '#4b3720', '#644d2e', '#7a6240') },
  spruce: { plank: G('#4c351e', '#66472a', '#7c5835', '#8f6941'), ring: G('#5d4026', '#76532f', '#8d683f', '#a07a4b'), bark: G('#1f150b', '#352414', '#4b351f', '#5d4429') },
  birch: { plank: G('#ae9a67', '#c6b27e', '#d7c593', '#e4d5a7'), ring: G('#a88e5f', '#c4a978', '#d6be8e', '#e3cfa2'), bark: G('#b5b0a3', '#d2cec2', '#e8e5dc', '#f6f4ee') },
  big_oak: { plank: G('#2b1d0f', '#3d2a16', '#50391f', '#62492a'), ring: G('#3e2914', '#523720', '#664630', '#76553a'), bark: G('#1a130b', '#2b2014', '#3b2e1e', '#4a3c29') },
};

let SEEDC = 1; const S = () => (SEEDC++) * 7919;

// ---------------------------------------------------------------- generators
function rock(t, s, pal, o = {}) {
  const sc = o.sc || 4, ct = o.ct || 1.8;
  return t.each((x, y, i) => {
    let n = fbm(x, y, sc, sc, 5, s);
    if (o.strata) n = n * 0.55 + fbm(x, y, o.strata[0], o.strata[1], 4, s + 50) * 0.45;
    const w = worley(x, y, o.cells || 5, s + 3), mask = sstep(0.56, 0.68, fbm(x, y, 3, 3, 3, s + 5));
    const crack = (1 - sstep(0, 0.045, w.f2 - w.f1)) * mask * (o.crack ?? 0.5);
    const gr = (h2(s + 9, x, y) - 0.5) * (o.grain ?? 0.08);
    let c = grad(pal, con(n, ct) + gr - crack * 0.3);
    if (o.speck) {
      const k = worley(x, y, o.speck, s + 11);
      if (k.f1 < (o.speckR || 0.24)) { const r = h2(s + 12, k.id, 0); c = mix(c, hex(o.speckCols[Math.floor(r * o.speckCols.length)]), 0.7); }
    }
    t.col(i, c);
    t.h[i] = clamp(0.5 + (n - 0.5) * 0.9 - crack * 0.45 + gr * 0.5);
    t.r[i] = o.r ?? 0.85;
  });
}
// Modern polished tile: soft stone with a crisp reveal + bevel at the border
function frame(t, o = {}) {
  const g = o.groove ?? 2, b = o.bevel ?? 4, T = o.tile || N;
  return t.each((x, y, i) => {
    const d = edgeDist(x, y, T);
    if (d < g) { t.col(i, mul(t.get(i), 0.62)); t.h[i] = 0.15; t.r[i] = 0.9; }
    else if (d < g + b) t.h[i] = lerp(0.35, t.h[i], (d - g + 1) / (b + 1));
  });
}
function polished(t, s, pal, o = {}) {
  rock(t, s, pal, { sc: 3, ct: 0.9, crack: 0, grain: 0.035, r: 0.4, ...o });
  t.each((x, y, i) => { t.h[i] = 0.6 + (t.h[i] - 0.5) * 0.15; });
  return frame(t, o);
}
function dirt(t, s, pal = P.dirt, o = {}) {
  return t.each((x, y, i) => {
    const n = fbm(x, y, 5, 5, 5, s);
    let v = con(n, 1.6) + (h2(s, x, y) - 0.5) * 0.14, h = n * 0.7;
    let c = grad(pal, v);
    const p = worley(x, y, 18, s + 4);
    if (p.f1 < 0.22 && h2(s, p.id, 2) < 0.3) {
      const k = 1 - p.f1 / 0.22;
      c = mix(c, h2(s, p.id, 3) < 0.6 ? hex('#8f8577') : hex('#2a1d14'), 0.65); c = mul(c, 0.85 + k * 0.3); h = 0.6 + k * 0.3;
    }
    t.col(i, c); t.h[i] = clamp(h); t.r[i] = o.r ?? 0.95;
  });
}
function grassTop(t, s) {
  t.each((x, y, i) => { const n = fbm(x, y, 6, 6, 4, s), v = 0.42 + n * 0.3; t.col(i, [v * 1.02, v, v * 0.94]); t.h[i] = 0.35 + n * 0.2; t.r[i] = 0.8; });
  const R = rng(s);
  for (let k = 0; k < 1600; k++) {
    const x0 = R() * N, y0 = R() * N, ang = R() * TAU, len = 3 + R() * 6, tone = 0.48 + R() * 0.38, warm = 0.94 + R() * 0.12;
    for (let j = 0; j < len; j++) {
      const i = wrap(y0 + Math.sin(ang) * j) * N + wrap(x0 + Math.cos(ang) * j), f = j / len, v = tone * (0.72 + 0.4 * f);
      t.col(i, [v * warm, v, v * (2 - warm) * 0.95]); t.h[i] = 0.5 + 0.45 * f;
    }
  }
  return t.bake(0.5, 0.8);
}
function grassSide(s, ds, carried) {
  const t = dirt(new Tex(), ds).bake();
  const edge = x => 20 + vnoise(x, 0, 8, 1, s) * 14 + (h2(s, x >> 2, 9) < 0.28 ? 4 + h2(s, x >> 2, 10) * 14 : 0) + vnoise(x, 0, 32, 1, s + 1) * 4;
  const tc = hex('#7cbd52');
  t.each((x, y, i) => {
    const e = edge(x);
    if (y < e) {
      const n = fbm(x, y, 24, 3, 3, s + 1), v = (0.4 + n * 0.42 + (1 - y / e) * 0.06) * (y > e - 3 ? 0.78 : 1);
      t.col(i, carried ? tint([v, v, v * 0.94], tc) : [v * 1.02, v, v * 0.94]); t.a[i] = 1; t.h[i] = 0.7 + n * 0.25; t.r[i] = 0.8;
    } else {
      if (y < e + 3) { t.col(i, mul(t.get(i), 0.62)); t.h[i] *= 0.7; }
      t.a[i] = carried ? 1 : 0;
    }
  });
  return t;
}
function cobble(t, s, pal, o = {}) {
  t.each((x, y, i) => {
    const wx = x + (fbm(x, y, 4, 4, 2, s + 30) - 0.5) * 16, wy = y + (fbm(x, y, 4, 4, 2, s + 31) - 0.5) * 16;
    const w = worley(wx, wy, o.k || 6, s, 0.9), e = w.f2 - w.f1, n = fbm(x, y, 8, 8, 4, s + 2);
    const base = o.pebbleCols ? grad(G(...o.pebbleCols[Math.floor(h2(s, w.id, 5) * o.pebbleCols.length)]), 0.5) : null;
    if (e < (o.gap || 0.08)) { t.col(i, grad(pal, 0.05 + n * 0.15)); t.h[i] = 0.05 + e; t.r[i] = 0.95; }
    else {
      const bump = sstep(o.gap || 0.08, 0.45, e), tone = (h2(s, w.id, 1) - 0.5) * 0.35;
      const v = 0.45 + tone + (n - 0.5) * 0.6 + bump * 0.14;
      t.col(i, base ? mul(base, 0.6 + v * 0.8) : grad(pal, v)); t.h[i] = clamp(0.3 + bump * 0.55 + (n - 0.5) * 0.15); t.r[i] = o.r ?? 0.9;
    }
  });
  return t;
}
function moss(t, s, amt = 0.4) {
  return t.each((x, y, i) => {
    const n = fbm(x, y, 5, 5, 4, s), m = n + (0.5 - t.h[i]) * 0.6;
    const k = sstep(1 - amt, 1 - amt + 0.12, m);
    if (k > 0) { t.col(i, mix(t.get(i), grad(P.moss, fbm(x, y, 16, 16, 3, s + 1) + (h2(s, x, y) - 0.5) * 0.3), k)); t.h[i] = lerp(t.h[i], 0.55 + n * 0.2, k); t.r[i] = 0.92; }
  });
}
function cracks(t, s, count = 4) {
  const R = rng(s);
  for (let c = 0; c < count; c++) {
    let x = R() * N, y = R() * N, a = R() * TAU; const len = 25 + R() * 40;
    for (let j = 0; j < len; j++) {
      a += (R() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a);
      const i = wrap(y) * N + wrap(x); t.col(i, mul(t.get(i), 0.45)); t.h[i] = 0.08;
      const i2 = wrap(y + 1) * N + wrap(x + 1); t.col(i2, mul(t.get(i2), 0.8));
    }
  }
  return t;
}
function bricks(t, s, o) {
  const { bw, bh, mort } = o;
  return t.each((x, y, i) => {
    const row = Math.floor(y / bh), bx = x + (row % 2) * bw / 2, col = Math.floor(bx / bw) % (N / bw);
    const lx = bx % bw, ly = y % bh, d = Math.min(lx, ly, bw - 1 - lx, bh - 1 - ly), id = row * 97 + col;
    const n = fbm(x, y, 8, 8, 4, s + 1);
    if (d < mort) { t.col(i, grad(o.mortP, n + (h2(s, x, y) - 0.5) * 0.2)); t.h[i] = 0.12 + n * 0.1; t.r[i] = 0.95; }
    else {
      const tone = (h2(s, id, 1) - 0.5) * o.vari, round = sstep(mort - 0.5, mort + 3, d);
      const spot = fbm(x, y, 3, 3, 3, s + 5 + id) < 0.35 ? -0.08 : 0;
      t.col(i, grad(o.pal, 0.5 + tone + (n - 0.5) * 0.55 + spot + (h2(s + 2, x, y) - 0.5) * 0.06));
      t.h[i] = 0.5 + round * 0.3 + (n - 0.5) * 0.15; t.r[i] = o.r ?? 0.85;
    }
  });
}
function planks(t, s, pal) {
  const bh = N / 4;
  return t.each((x, y, i) => {
    const row = Math.floor(y / bh), ly = y % bh, off = Math.floor(h2(s, row, 0) * N), xx = (x + off) % N, seg = Math.floor(xx / 64), lx = xx % 64;
    const tone = (h2(s, row * 7 + seg, 2) - 0.5) * 0.24, grain = fbm(x, y, 3, 24, 4, s + row * 13 + seg);
    const ring = 0.5 + 0.5 * Math.sin(TAU * (ly / bh * 3 + fbm(x, y, 4, 4, 2, s + 3) * 1.6));
    let v = 0.5 + tone + (grain - 0.5) * 0.9 + (ring - 0.5) * 0.1, h;
    const dy = Math.min(ly, bh - 1 - ly), dx = Math.min(lx, 63 - lx);
    if (dy < 1 || dx < 1) { v = 0.04; h = 0.08; }
    else h = 0.62 + (grain - 0.5) * 0.25 - (dy < 3 ? (3 - dy) * 0.08 : 0) - (dx < 3 ? (3 - dx) * 0.08 : 0);
    let c = grad(pal, v);
    // small steel fixings at board ends (modern touch)
    const nx = Math.min(Math.abs(lx - 5), Math.abs(lx - 58)), ny = Math.abs(ly - bh / 2 + 0.5);
    if (nx < 1.5 && ny < 1.5) { c = hex('#4a4a4a'); h = 0.7; t.m[i] = 1; t.r[i] = 0.35; } else t.r[i] = 0.72;
    t.col(i, c); t.h[i] = h;
  });
}
function logSide(t, s, pal, birch) {
  return t.each((x, y, i) => {
    const wx = x + (fbm(x, y, 4, 2, 2, s + 5) - 0.5) * 10;
    if (birch) {
      const n = fbm(x, y, 4, 8, 3, s), len = fbm(x, y, 3, 24, 3, s + 9), patch = fbm(x, y, 2, 5, 3, s + 11);
      let c = grad(pal, 0.35 + n * 0.6), h = 0.6 + n * 0.1;
      if (len < 0.34 || patch < 0.28) { c = mix(c, hex('#262321'), len < 0.3 || patch < 0.24 ? 0.92 : 0.5); h = 0.35; }
      t.col(i, c); t.h[i] = h; t.r[i] = 0.75;
    } else {
      const n = fbm(wx, y, 16, 2, 4, s), groove = sstep(0.42, 0.3, n), plate = fbm(x, y, 8, 10, 3, s + 7);
      t.col(i, grad(pal, 0.2 + n * 0.75 - groove * 0.25 + (plate - 0.5) * 0.2));
      t.h[i] = clamp(n - groove * 0.45 + (plate - 0.5) * 0.1); t.r[i] = 0.92;
    }
  });
}
function logTop(t, s, barkP, ringP, birch) {
  return t.each((x, y, i) => {
    const dx = x - 63.5, dy = y - 63.5, ch = Math.max(Math.abs(dx), Math.abs(dy)), d = lerp(Math.hypot(dx, dy), ch, 0.4), n = fbm(x, y, 6, 6, 3, s);
    if (ch > N / 2 - 7 - n * 3) {
      const b = fbm(x, y, 16, 16, 3, s + 1);
      t.col(i, birch ? grad(barkP, 0.4 + b * 0.6) : grad(barkP, 0.2 + b * 0.7)); t.h[i] = 0.4 + b * 0.3; t.r[i] = 0.9;
    } else {
      const ring = 0.5 + 0.5 * Math.sin(d * 0.6 + n * 5), sap = ch > N / 2 - 13 ? 0.12 : 0, core = d < 6 ? -0.15 : 0;
      const ang = Math.atan2(dy, dx), crk = Math.abs(ang - (h2(s, 0, 1) * TAU - Math.PI)) < 0.02 * (50 - d) / 50 && d < 46 && d > 4;
      t.col(i, grad(ringP, crk ? 0.02 : 0.38 + ring * 0.3 + (n - 0.5) * 0.25 + sap + core));
      t.h[i] = crk ? 0.15 : 0.62 + ring * 0.08; t.r[i] = 0.82;
    }
  });
}
function leaves(s, kind) {
  const t = new Tex();
  if (kind === 'spruce') {
    t.each((x, y, i) => { t.a[i] = 0; const v = 0.22 + fbm(x, y, 6, 6, 2, s) * 0.15; t.col(i, [v, v, v]); t.h[i] = 0.2; });
    const R = rng(s);
    for (let k = 0; k < 3800; k++) {
      const x0 = R() * N, y0 = R() * N, ang = (R() < 0.5 ? 0.8 : 2.35) + (R() - 0.5) * 0.4, len = 4 + R() * 5, tone = 0.42 + R() * 0.42;
      for (let j = 0; j < len; j++) { const i = wrap(y0 + Math.sin(ang) * j) * N + wrap(x0 + Math.cos(ang) * j), v = tone * (0.8 + 0.25 * j / len); t.col(i, [v, v * 1.01, v * 0.96]); t.a[i] = 1; t.h[i] = 0.5 + 0.4 * j / len; }
    }
  } else {
    const k = kind === 'big_oak' ? 7 : 9;
    t.each((x, y, i) => {
      const wx = x + (fbm(x, y, 4, 4, 2, s + 7) - 0.5) * 12, w = worley(wx, y, k, s), lr = w.f1;
      let v = 0.36 + (1 - lr / 0.6) * 0.36 + (h2(s, w.id, 1) - 0.5) * 0.22 + (h2(s + 1, x, y) - 0.5) * 0.06;
      if (w.f2 - w.f1 < 0.06) v *= 0.62;
      const g = fbm(x, y, 6, 6, 3, s + 3), warm = 1 + (h2(s, w.id, 4) - 0.5) * 0.1;
      t.col(i, [v * warm, v, v * (2 - warm) * 0.97]); t.a[i] = g < 0.36 || lr > 0.64 ? 0 : 1; t.h[i] = clamp(1 - lr); t.r[i] = 0.62;
    });
  }
  return t.bake(0.4, 0.5);
}
function ore(t, s, oreP, o) {
  const k = o.cells || 6;
  return t.each((x, y, i) => {
    const w = worley(x, y, k, s);
    if (h2(s, w.id, 3) > o.density) return;
    const rad = 0.24 + (fbm(x, y, 16, 16, 3, s + 4) - 0.5) * 0.34 + (h2(s, w.id, 5) - 0.5) * 0.1;
    if (w.f1 < rad) {
      const f = worley(x, y, k * 4, s + 21), core = 1 - w.f1 / rad;
      const facet = o.gem ? h2(s + 22, f.id, 0) : fbm(x, y, 24, 24, 3, s + 23);
      const lum = facet * 0.6 + core * 0.4;
      t.col(i, grad(oreP, lum)); t.h[i] = 0.65 + core * 0.3 - (o.gem ? f.f1 * 0.15 : 0);
      t.m[i] = o.metal || 0; t.r[i] = o.rough ?? 0.4; t.e[i] = (o.emis || 0) * lum;
    } else if (w.f1 < rad + 0.05) { t.col(i, mul(t.get(i), 0.55)); t.h[i] *= 0.7; }
  });
}
function metalPanel(t, s, pal, o = {}) {
  const T = o.tile || 64;
  return t.each((x, y, i) => {
    const lx = x % T, ly = y % T, d = edgeDist(x, y, T), tile = (x / T | 0) + (y / T | 0) * (N / T);
    const brush = fbm(x, y, 1, 48, 3, s + tile * 7) * 0.7 + fbm(x, y, 4, 4, 3, s + 3) * 0.3;
    let v = 0.32 + brush * 0.5, h = 0.75;
    if (d < 2) { v = 0.1; h = 0.15; } else if (d < 5) { h = 0.4 + (d - 2) / 3 * 0.35; v += lx < ly ? 0.08 : -0.04; }
    const bd = Math.hypot(Math.min(lx, T - 1 - lx) - 8.5, Math.min(ly, T - 1 - ly) - 8.5);
    if (bd < 2.8) { h = 0.92 - bd * 0.1; v = 0.78 - bd * 0.12; }
    t.col(i, grad(pal, v)); t.h[i] = h; t.m[i] = d < 2 ? 0.2 : (o.metal ?? 1); t.r[i] = (o.rough ?? 0.3) + (1 - brush) * 0.12; t.e[i] = o.emis ? o.emis * v : 0;
  });
}
function gemBlock(t, s, pal, o = {}) {
  const T = 64, tones = [0.58, 0.82, 0.42, 0.96];
  return t.each((x, y, i) => {
    const lx = x % T, ly = y % T, d = edgeDist(x, y, T), cx = lx - 31.5, cy = ly - 31.5, m = Math.max(Math.abs(cx), Math.abs(cy));
    const q = Math.abs(cx) > Math.abs(cy) ? (cx > 0 ? 0 : 1) : (cy > 0 ? 2 : 3), n = fbm(x, y, 8, 8, 3, s);
    let v = (m < 13 ? 0.72 : tones[q]) + (n - 0.5) * 0.18, h = m < 13 ? 0.95 : 1 - (m - 13) / 19 * 0.6;
    if (h2(s, x, y) < 0.006) v = 1;
    if (d < 2) { v = 0.05; h = 0.1; }
    t.col(i, grad(pal, v)); t.h[i] = h; t.m[i] = o.metal || 0; t.r[i] = o.rough ?? 0.1; t.e[i] = (o.emis || 0) * v;
  });
}
function concrete(t, s, c) {
  const base = hex(c);
  return t.each((x, y, i) => {
    const n = fbm(x, y, 6, 6, 4, s); let k = 1 + (n - 0.5) * 0.12 + (h2(s, x, y) - 0.5) * 0.05, h = 0.5 + (n - 0.5) * 0.1;
    if (h2(s + 3, x, y) < 0.004) { k *= 0.72; h -= 0.2; }
    t.col(i, mul(base, k)); t.h[i] = h; t.r[i] = 0.82;
  });
}
function quartz(t, s, o = {}) {
  t.each((x, y, i) => {
    const n = fbm(x, y, 3, 3, 5, s), vein = Math.pow(1 - Math.abs(Math.sin(TAU * (x / N + y / N) * 0.5 + n * 9)), 22) * 0.35;
    t.col(i, grad(P.quartz, 0.86 - vein - (n - 0.5) * 0.16 + (h2(s, x, y) - 0.5) * 0.03)); t.h[i] = 0.62; t.r[i] = 0.28;
  });
  if (o.frame) frame(t, { groove: 2, bevel: 3 });
  if (o.inset) t.each((x, y, i) => { const d = edgeDist(x, y); if (d >= 14 && d < 16) { t.col(i, mul(t.get(i), 0.75)); t.h[i] = 0.3; } });
  return t;
}
function sand(t, s, pal) {
  return t.each((x, y, i) => {
    const n = fbm(x, y, 4, 4, 4, s), rip = Math.sin(TAU * (y / N * 7 + x / N + fbm(x, y, 3, 3, 3, s + 2) * 1.2));
    let v = 0.5 + (n - 0.5) * 0.7 + rip * 0.06 + (h2(s, x, y) - 0.5) * 0.2;
    if (h2(s + 5, x, y) < 0.02) v -= 0.35;
    t.col(i, grad(pal, v)); t.h[i] = 0.5 + rip * 0.12 + (n - 0.5) * 0.2; t.r[i] = 0.95;
  });
}

// ---------------------------------------------------------------- build
function main() {
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(BLK, { recursive: true });

const stoneT = s => rock(new Tex(), s, P.stone, { speck: 22, speckR: 0.12, speckCols: ['#4d5055', '#a3a6aa'] });
const deepT = s => rock(new Tex(), s, P.deep, { strata: [2, 24], crack: 1 });
const SST = S(), DST = S();

// Natural terrain
save(stoneT(SST).bake(), 'stone');
save(deepT(DST).bake(), 'deepslate/deepslate');
save(rock(new Tex(), S(), P.deep, { sc: 6, cells: 4, crack: 1 }).bake(), 'deepslate/deepslate_top');
save(rock(new Tex(), S(), P.andesite, { speck: 24, speckCols: ['#55585a', '#b7b9b9', '#6d7072'] }).bake(), 'stone_andesite');
save(rock(new Tex(), S(), P.diorite, { speck: 22, speckCols: ['#3f3f3d', '#6d6c68', '#8a8985', '#ffffff'] }).bake(), 'stone_diorite');
save(rock(new Tex(), S(), P.granite, { speck: 26, speckCols: ['#4e2e25', '#d9a68f', '#6a3c30', '#e7c3b3'] }).bake(), 'stone_granite');
save(polished(new Tex(), S(), P.andesite).bake(), 'stone_andesite_smooth');
save(polished(new Tex(), S(), P.diorite).bake(), 'stone_diorite_smooth');
save(polished(new Tex(), S(), P.granite).bake(), 'stone_granite_smooth');
const DIRT = S();
save(dirt(new Tex(), DIRT).bake(), 'dirt');
const GS = S();
save(grassTop(new Tex(), GS), 'grass_top');
save(grassSide(GS + 1, DIRT, false), 'grass_side', { tga: true, mask: true });
save(grassSide(GS + 1, DIRT, true), 'grass_side_carried');
save(sand(new Tex(), S(), P.sand).bake(0.4), 'sand');
save(cobble(new Tex(), S(), P.stone, { k: 16, gap: 0.1, pebbleCols: [['#6a6662', '#8e8a85'], ['#7d746b', '#a39a8e'], ['#55524f', '#787470'], ['#8c8681', '#b0aaa3'], ['#6d5f52', '#8f7f70']] }).bake(), 'gravel');
const COB = S();
save(cobble(new Tex(), COB, P.stone).bake(), 'cobblestone');
save(moss(cobble(new Tex(), COB, P.stone), S(), 0.42).bake(), 'cobblestone_mossy');
save(rock(new Tex(), S(), G('#8a909c', '#9aa0ab', '#aab0ba'), { ct: 0.7, crack: 0, grain: 0.04, r: 0.7 }).bake(0.3), 'clay');
save(rock(new Tex(), S(), G('#d8e1ea', '#eaf0f5', '#f8fbfe'), { ct: 0.8, crack: 0, grain: 0.03, r: 0.55 }).bake(0.25), 'snow');
{ const s = S(), t = new Tex(); t.each((x, y, i) => {
    const w = worley(x, y, 5, s), tone = h2(s, w.id, 1), edge = 1 - sstep(0, 0.08, w.f2 - w.f1), n = fbm(x, y, 8, 8, 3, s + 2);
    t.col(i, grad(G('#0b0712', '#1a1027', '#2d1c46', '#4a3274', '#7b5bb0'), 0.12 + tone * 0.32 + edge * 0.38 + (n - 0.5) * 0.15));
    t.h[i] = 0.5 + tone * 0.3 - edge * 0.2; t.r[i] = 0.1;
  }); save(t.bake(), 'obsidian'); }
save(rock(new Tex(), S(), G('#161616', '#353535', '#595959', '#8a8a8a'), { sc: 6, ct: 3, cells: 7, crack: 1 }).bake(0.8), 'bedrock');
for (const wet of [false, true]) {
  const t = dirt(new Tex(), DIRT + 5, wet ? P.wetdirt : P.dirt, { r: wet ? 0.4 : 0.95 });
  t.each((x, y, i) => { const f = Math.sin(TAU * y / N * 4); t.h[i] = clamp(0.5 + f * 0.32 + (t.h[i] - 0.5) * 0.3); t.col(i, mul(t.get(i), 0.9 + f * 0.12)); });
  save(t.bake(0.7), wet ? 'farmland_wet' : 'farmland_dry');
}

// Sandstone family
{
  const s = S(), side = new Tex();
  side.each((x, y, i) => {
    const st = Math.sin(TAU * (y / N * 6 + (fbm(x, y, 3, 2, 3, s) - 0.5) * 0.6)), n = fbm(x, y, 8, 8, 4, s + 1);
    let v = 0.5 + st * 0.15 + (n - 0.5) * 0.35 + (h2(s, x, y) - 0.5) * 0.1, h = 0.55 + st * 0.08;
    if (y < 16) { v = 0.62 + (n - 0.5) * 0.15; h = 0.7; }
    if (y === 16 || y === 17) { v = 0.22; h = 0.2; }
    if (y > N - 6) v -= 0.1;
    side.col(i, grad(P.sandstone, v)); side.h[i] = h; side.r[i] = 0.9;
  });
  save(side.bake(), 'sandstone_normal');
  save(frame(sand(new Tex(), s + 2, P.sandstone), { groove: 1, bevel: 3 }).bake(0.3), 'sandstone_top');
  save(cracks(rock(new Tex(), s + 3, P.sandstone, { ct: 1.2, crack: 0.6 }), s + 4, 3).bake(), 'sandstone_bottom');
  const cut = frame(sand(new Tex(), s + 5, P.sandstone), { groove: 2, bevel: 3 });
  cut.each((x, y, i) => { if (y === 63 || y === 64) { cut.col(i, mul(cut.get(i), 0.6)); cut.h[i] = 0.15; } });
  save(cut.bake(0.5), 'sandstone_smooth');
  const carved = frame(sand(new Tex(), s + 6, P.sandstone), { groove: 3, bevel: 4 });
  carved.each((x, y, i) => {
    const m = Math.abs(x - 63.5) + Math.abs(y - 63.5);
    if (m > 26 && m < 31) { carved.col(i, mul(carved.get(i), 0.62)); carved.h[i] = 0.2; } else if (m <= 26) carved.h[i] = 0.78;
  });
  save(carved.bake(0.6), 'sandstone_carved');
}

// Wood
for (const [k, w] of Object.entries(WOOD)) {
  const birch = k === 'birch';
  save(logSide(new Tex(), S(), w.bark, birch).bake(0.6), 'log_' + k);
  save(logTop(new Tex(), S(), w.bark, w.ring, birch).bake(0.4), 'log_' + k + '_top');
  save(planks(new Tex(), S(), w.plank).bake(0.6), 'planks_' + k);
  const ls = S(), lt = leaves(ls, k);
  save(lt, 'leaves_' + k, { tga: true });
  const carriedTint = hex({ oak: '#59ae30', spruce: '#619961', birch: '#80a755', big_oak: '#4a9a25' }[k]);
  const car = lt.clone(); car.each((x, y, i) => car.col(i, tint(car.get(i), carriedTint)));
  save(car, 'leaves_' + k + '_carried', { tga: true });
  const op = lt.clone(); op.each((x, y, i) => { if (op.a[i] === 0) { op.col(i, mul(op.get(i), 0.4)); op.a[i] = 1; } });
  save(op, 'leaves_' + k + '_opaque');
}

// Masonry & modern architecture
const BR = S();
save(bricks(new Tex(), BR, { bw: 32, bh: 16, mort: 2, pal: P.brick, mortP: P.brickMortar, vari: 0.3 }).bake(), 'brick');
const SB = S(), sbOpt = { bw: 64, bh: 32, mort: 2, pal: P.stone, mortP: P.mortar, vari: 0.22 };
save(bricks(new Tex(), SB, sbOpt).bake(), 'stonebrick');
save(moss(bricks(new Tex(), SB, sbOpt), S(), 0.4).bake(), 'stonebrick_mossy');
save(cracks(bricks(new Tex(), SB, sbOpt), S(), 6).bake(), 'stonebrick_cracked');
{
  const t = polished(new Tex(), S(), P.stone, { groove: 3, bevel: 5 });
  t.each((x, y, i) => {
    const d = Math.hypot(x - 63.5, y - 63.5), e = edgeDist(x, y);
    if ((d > 30 && d < 35) || (e >= 12 && e < 14)) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.2; } else if (d <= 30) t.h[i] = 0.8;
  });
  save(t.bake(0.6), 'stonebrick_carved');
}
const SM = S();
save(polished(new Tex(), SM, P.smooth, { groove: 1, bevel: 3 }).bake(0.4), 'stone_slab_top');
{ const t = polished(new Tex(), SM + 1, P.smooth, { groove: 1, bevel: 3 }); t.each((x, y, i) => { if (y === 63 || y === 64) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.15; } }); save(t.bake(0.4), 'stone_slab_side'); }
save(quartz(new Tex(), S(), { frame: true }).bake(0.4), 'quartz_block_side');
save(quartz(new Tex(), S(), { frame: true, inset: true }).bake(0.4), 'quartz_block_top');
save(quartz(new Tex(), S()).bake(0.3), 'quartz_block_bottom');
{
  const s = S(), t = new Tex();
  t.each((x, y, i) => {
    const d = edgeDist(x, y);
    if (d < 4) { t.a[i] = 1; t.col(i, hex(d < 1 ? '#8fa3ad' : d < 3 ? '#e6eff3' : '#bccbd3')); t.h[i] = d === 1 || d === 2 ? 0.85 : 0.4; t.r[i] = 0.15; }
    else {
      const u = x + y, v = (N - 1 - x) + (N - 1 - y);
      const streak = (u > 30 && u < 33 && x < 34) || (u > 40 && u < 42 && x < 44) || (v > 22 && v < 24 && x > 104);
      t.a[i] = streak && x > 6 && y > 6 && x < N - 7 && y < N - 7 ? 1 : 0; t.col(i, hex('#eef7fb')); t.h[i] = 0.5; t.r[i] = 0.05;
    }
  });
  save(t, 'glass', { alpha: true });
}
const CONCRETE = { white: '#d3d9da', orange: '#e26302', magenta: '#ab319f', light_blue: '#2389c7', yellow: '#f1b015', lime: '#5fa918', pink: '#d6668f', gray: '#363a3e', silver: '#7e7e75', cyan: '#15778a', purple: '#64209d', blue: '#2c2e90', brown: '#61341b', green: '#4a5c25', red: '#8f2121', black: '#090a0f' };
for (const [k, c] of Object.entries(CONCRETE)) save(concrete(new Tex(), S(), c).bake(0.2, 0.3), 'concrete_' + k);

// Ores
const ORES = {
  coal: { pal: G('#0d0d0f', '#1f1f23', '#33333a', '#4a4a52'), rough: 0.6 },
  iron: { pal: G('#6b4a32', '#a77a55', '#d5ab86', '#ecd2b8'), metal: 1, rough: 0.4 },
  gold: { pal: G('#7a5208', '#c8920f', '#f2c93a', '#fff0a0'), metal: 1, rough: 0.28 },
  copper: { pal: G('#6b3418', '#b0582c', '#e07b45', '#7dc4a4'), metal: 1, rough: 0.38 },
  diamond: { pal: G('#0f5a63', '#1fb2bf', '#64e8ee', '#d8ffff'), gem: true, rough: 0.08, emis: 0.25 },
  emerald: { pal: G('#05401b', '#0f8a3b', '#2fd16b', '#b9ffd2'), gem: true, rough: 0.08, emis: 0.2 },
  redstone: { pal: G('#4a0000', '#a30d06', '#ff2a12', '#ff9b80'), gem: true, rough: 0.3, emis: 0.55 },
  lapis: { pal: G('#0a1a5c', '#1c3fae', '#3c6cf0', '#a8c4ff'), gem: true, rough: 0.25, emis: 0.05 },
};
for (const [k, o] of Object.entries(ORES)) {
  const s = S(), opt = { ...o, density: k === 'diamond' || k === 'emerald' ? 0.28 : 0.42 };
  save(ore(stoneT(SST), s, o.pal, opt).bake(), k + '_ore');
  save(ore(deepT(DST), s + 1, o.pal, opt).bake(), 'deepslate/deepslate_' + k + '_ore');
}
// Storage blocks — modern panels
save(metalPanel(new Tex(), S(), G('#5e6266', '#a9adb0', '#d8dbdd', '#f4f5f6'), { rough: 0.28 }).bake(0.5), 'iron_block');
save(metalPanel(new Tex(), S(), G('#7a5207', '#d39a12', '#f6cf3e', '#fff3a6'), { rough: 0.22 }).bake(0.5), 'gold_block');
save(metalPanel(new Tex(), S(), G('#6b3016', '#b0582c', '#df7d4d', '#f6b58c'), { rough: 0.35 }).bake(0.5), 'copper_block');
save(metalPanel(new Tex(), S(), G('#060607', '#151518', '#26262b', '#3c3c44'), { metal: 0, rough: 0.55 }).bake(0.5), 'coal_block');
save(gemBlock(new Tex(), S(), ORES.diamond.pal, { emis: 0.12 }).bake(0.5), 'diamond_block');
save(gemBlock(new Tex(), S(), ORES.emerald.pal, { emis: 0.1 }).bake(0.5), 'emerald_block');
save(gemBlock(new Tex(), S(), ORES.lapis.pal, { rough: 0.3 }).bake(0.5), 'lapis_block');
save(gemBlock(new Tex(), S(), ORES.redstone.pal, { rough: 0.35, emis: 0.4 }).bake(0.5), 'redstone_block');

// Light sources
{
  const s = S(), t = new Tex();
  t.each((x, y, i) => {
    const w = worley(x, y, 9, s), n = fbm(x, y, 6, 6, 4, s + 1), v = sstep(0.02, 0.25, w.f2 - w.f1) * 0.7 + n * 0.4;
    t.col(i, grad(P.glow, v)); t.h[i] = v; t.e[i] = sstep(0.45, 0.85, v); t.r[i] = 0.6;
  });
  save(t, 'glowstone');
}
for (const on of [false, true]) {
  const s = S(), t = new Tex();
  t.each((x, y, i) => {
    const d = edgeDist(x, y, 64), outer = edgeDist(x, y);
    if (outer < 6 || d < 3) { t.col(i, grad(G('#1c1410', '#3a2a1e', '#56402d'), fbm(x, y, 8, 8, 3, s))); t.h[i] = outer < 6 ? 0.8 : 0.6; t.r[i] = 0.5; t.m[i] = 0.3; }
    else {
      const w = worley(x, y, 12, s + 2), v = 0.4 + h2(s, w.id, 1) * 0.4 + (1 - sstep(0, 0.1, w.f2 - w.f1)) * -0.25;
      t.col(i, on ? grad(G('#b4561a', '#f4a24a', '#ffd9a0', '#fff6e0'), v) : grad(G('#200c06', '#3f1a0e', '#5c2a18', '#74402a'), v));
      t.h[i] = 0.45; t.r[i] = 0.2; t.e[i] = on ? 0.6 + v * 0.4 : 0;
    }
  });
  save(t, on ? 'redstone_lamp_on' : 'redstone_lamp_off');
}

// Utility blocks
{
  const plank = () => planks(new Tex(), 4242, WOOD.oak.plank);
  const darkBand = (t, y0, y1) => rect(t, 0, y0, N, y1, (x, y, i) => { t.col(i, grad(WOOD.big_oak.plank, 0.4 + fbm(x, y, 3, 16, 3, 99) * 0.5)); t.h[i] = 0.8; t.r[i] = 0.6; });
  const steel = (t, x0, y0, x1, y1, tone = 0.6) => rect(t, x0, y0, x1, y1, (x, y, i) => { t.col(i, grad(G('#3d4246', '#8e959a', '#d5dadd'), tone + fbm(x, y, 1, 32, 2, 7) * 0.3)); t.h[i] = 0.85; t.m[i] = 1; t.r[i] = 0.3; });
  const handle = (t, x0, y0, x1, y1) => rect(t, x0, y0, x1, y1, (x, y, i) => { t.col(i, grad(WOOD.spruce.plank, 0.3 + fbm(x, y, 2, 16, 2, 5) * 0.6)); t.h[i] = 0.8; t.r[i] = 0.7; });

  const top = plank();
  top.each((x, y, i) => {
    const d = edgeDist(x, y);
    if (d < 8) { top.col(i, grad(WOOD.big_oak.plank, 0.45 + fbm(x, y, 16, 16, 3, 3) * 0.4)); top.h[i] = 0.85; }
    else { const lx = (x - 8) % 37.3, ly = (y - 8) % 37.3; if (lx < 1.5 || ly < 1.5) { top.col(i, hex('#2a1d10')); top.h[i] = 0.2; } }
  });
  save(top.bake(0.6), 'crafting_table_top');

  const side = plank(); darkBand(side, 0, 14);
  steel(side, 18, 40, 62, 54); for (let k = 0; k < 11; k++) rect(side, 18 + k * 4, 54, 20 + k * 4, 57, (x, y, i) => { side.col(i, hex('#9aa1a6')); side.m[i] = 1; side.h[i] = 0.8; });
  handle(side, 62, 38, 72, 56);
  handle(side, 90, 30, 95, 104); steel(side, 80, 26, 106, 38, 0.45);
  save(side.bake(0.7), 'crafting_table_side');

  const front = plank(); darkBand(front, 0, 14);
  handle(front, 30, 36, 34, 100); steel(front, 22, 28, 54, 36, 0.5); rect(front, 22, 28, 26, 44, (x, y, i) => { front.col(i, hex('#8e959a')); front.m[i] = 1; front.h[i] = 0.85; });
  handle(front, 84, 60, 89, 104); steel(front, 82, 30, 91, 60, 0.55);
  save(front.bake(0.7), 'crafting_table_front');

  const fs_ = S();
  save(polished(new Tex(), fs_, P.stone, { groove: 2, bevel: 4 }).bake(0.5), 'furnace_top');
  const fside = () => { const t = polished(new Tex(), fs_ + 1, P.stone, { groove: 2, bevel: 4 }); t.each((x, y, i) => { if (y === 63 || y === 64) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.15; } }); return t; };
  save(fside().bake(0.5), 'furnace_side');
  for (const on of [false, true]) {
    const t = fside();
    steel(t, 22, 50, 106, 58, 0.35);
    for (let k = 0; k < 5; k++) rect(t, 40 + k * 10, 22, 46 + k * 10, 26, (x, y, i) => { t.col(i, hex('#141414')); t.h[i] = 0.1; });
    rect(t, 28, 58, 100, 108, (x, y, i) => {
      const fy = (108 - y) / 50, n = fbm(x, y * 0.7, 8, 4, 3, 1234);
      if (on) { const v = clamp(1 - fy * 1.4 + (n - 0.5) * 0.8); t.col(i, grad(G('#1a0500', '#8a2200', '#ff6a0e', '#ffd25a', '#fff2c0'), v)); t.e[i] = v; }
      else t.col(i, grad(G('#070707', '#141414', '#202020'), n));
      t.h[i] = 0.05; t.r[i] = 0.9; t.m[i] = 0;
    });
    for (let k = 0; k < 6; k++) steel(t, 32 + k * 12, 94, 36 + k * 12, 108, 0.3);
    save(t.bake(0.5), on ? 'furnace_front_on' : 'furnace_front_off');
  }

  const bs = plank(), R = rng(777), BOOK = ['#7b2b23', '#2d4f7c', '#3f6b3a', '#8a6a2a', '#5a2f6b', '#2f6b6b', '#a0482a', '#d6c7a1', '#3b3b44'];
  for (const [y0, y1] of [[10, 59], [69, 118]]) {
    rect(bs, 0, y0, N, y1, (x, y, i) => { bs.col(i, hex('#1b120a')); bs.h[i] = 0.05; bs.r[i] = 0.9; });
    let x = 2;
    while (x < N - 6) {
      const w = Math.min(5 + Math.floor(R() * 8), N - 2 - x), top = y0 + 2 + Math.floor(R() * 10), c = hex(BOOK[Math.floor(R() * BOOK.length)]);
      rect(bs, x, top, x + w, y1, (px, py, i) => {
        const lx = px - x, round = 0.75 + 0.3 * Math.sin(Math.PI * (lx + 0.5) / w), band = (py - top === 4 || py - top === 5 || y1 - py === 6) ? 1.35 : 1;
        bs.col(i, mul(c, round * band * (0.92 + h2(9, px, py) * 0.12))); bs.h[i] = 0.5 + round * 0.3; bs.r[i] = 0.7;
      });
      x += w + (R() < 0.2 ? 2 : 1);
    }
  }
  save(bs.bake(0.5), 'bookshelf');
}

// ---------------------------------------------------------------- manifest, icon, preview
const uuid = str => { const h = crypto.createHash('md5').update(str).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
  format_version: 2,
  header: {
    name: 'Ultimate Survival Texture Pack (USTP) 128x',
    description: 'Every block and item redone at 128x: natural textures with clean modern-architecture detailing. RTX & Vibrant Visuals PBR',
    uuid: uuid('verdant-arch-header'), version: [3, 0, 0], min_engine_version: [1, 21, 80],
  },
  modules: [{ type: 'resources', uuid: uuid('verdant-arch-resources'), version: [3, 0, 0] }],
  capabilities: ['pbr', 'raytraced'],
}, null, 2));

const byName = Object.fromEntries(made.map(m => [m.name, m]));
function sheet(names, cols, scale = 1) {
  const rows = Math.ceil(names.length / cols), W = cols * N * scale, H = rows * N * scale, px = Buffer.alloc(W * H * 3);
  names.forEach((nm, k) => {
    const src = byName[nm].rgba, ox = (k % cols) * N * scale, oy = Math.floor(k / cols) * N * scale;
    for (let y = 0; y < N * scale; y++) for (let x = 0; x < N * scale; x++) {
      const si = (Math.floor(y / scale) * N + Math.floor(x / scale)) * 4, a = byName[nm].cutout ? src[si + 3] / 255 : 1;
      const bg = ((x >> 3) + (y >> 3)) & 1 ? 70 : 55, di = ((oy + y) * W + ox + x) * 3;
      for (let c = 0; c < 3; c++) px[di + c] = Math.round(src[si + c] * a + bg * (1 - a));
    }
  });
  return pngBuf(W, H, 3, px);
}
fs.writeFileSync(path.join(OUT, 'pack_icon.png'), sheet(['grass_side_carried', 'quartz_block_side', 'planks_oak', 'stonebrick'], 2));
fs.writeFileSync(path.join(ROOT, 'preview.png'), sheet(made.map(m => m.name).filter(n => !n.endsWith('_opaque')), 12));
// remaster.js leaves everything listed here alone (items.js appends its icons)
fs.writeFileSync(path.join(ROOT, '.handmade.json'), JSON.stringify(made.map(m => 'blocks/' + m.name), null, 1));
console.log(`Generated ${made.length} textures.`);
}

if (require.main === module) main();
// families.js reuses the generators for colour/wood/copper families
module.exports = { N, Tex, S, G, hex, grad, mul, mix, tint, clamp, sstep, fbm, vnoise, h2, worley, edgeDist, rect, save, made, frame, rock, sand, planks, logSide, logTop, leaves, metalPanel, concrete, P, WOOD };
