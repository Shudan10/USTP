'use strict';
// USTP plank styles: smooth, modern takes on wood planks. The chosen style (choices.json "planks")
// is used for every *_planks block by gen.js, families.js and batch9.js via plankBlock().
//   A Smooth wide boards · B Chevron parquet · C Vertical slats · D Seamless veneer
//   E Laminate flooring · F Wide-plank · G Narrow strip floor · H Basketweave parquet   (E–H: realistic, muted, matte)
//   W Soft boards · X Clean veneer · Y Brushed oak · Z Long bevelled planks   (W–Z: soft figure, no hairlines)
//   node planks.js --samples=<dir> [--rows=EFGH]   → comparison sheet across six woods
const fs = require('fs'), path = require('path');
const { pngBuf } = require('./imageio');

const N = 128;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
function h2(s, x, y) {
  let h = Math.imul(s | 0, 0x9E3779B1) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x5bd1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// smooth 1-D value noise, for long straight grain lines
const n1 = (t, s) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return h2(s, i, 0) * (1 - u) + h2(s, i + 1, 0) * u; };
const grainAt = (along, across, s, k = 1) => (n1(across * 0.45 + n1(along * 0.02, s + 3) * 3, s) - 0.5) * 0.5 * k + (n1(across * 1.6, s + 1) - 0.5) * 0.18 * k;

// Each style returns { v (0..1 tone), h (height), r (roughness) } for a pixel; the caller maps v through the wood palette.
const STYLES = {
  // A: three long boards per block, staggered hairline end joints, satin finish
  A: (x, y, s) => {
    const bh = N / 4, row = Math.floor(y / bh), ly = y % bh, off = Math.floor(h2(s, row, 0) * N), xx = (x + off) % N;
    const tone = (h2(s, row, 7) - 0.5) * 0.12, g = grainAt(x, y + row * 40, s + row, 0.8);
    let v = 0.55 + tone + g, h = 0.6, r = 0.45;
    const dy = Math.min(ly, bh - 1 - ly), dx = Math.min(xx, N - 1 - xx);
    if (dy < 1 || dx < 1) { v = 0.18; h = 0.25; } else if (dy < 2) { v += ly < 2 ? 0.06 : -0.06; h = 0.5; }
    return { v, h, r };
  },
  // B: chevron parquet — 45° staves in alternating columns
  B: (x, y, s) => {
    const W = 32, c = Math.floor(x / W), u = x % W, dir = c % 2 ? 1 : -1, v0 = y + dir * u + 256, slat = Math.floor(v0 / 16), across = v0 % 16;
    const tone = (h2(s, slat * 5 + c, 3) - 0.5) * 0.16, g = grainAt(u * 1.4, across + slat * 16, s + slat, 0.7);
    let v = 0.55 + tone + g, h = 0.6;
    if (across < 1 || u === 0) { v = 0.2; h = 0.25; }
    return { v, h, r: 0.4 };
  },
  // C: vertical slats with deep shadow gaps, like an acoustic slat wall
  C: (x, y, s) => {
    const P = 16, lx = x % P, col = Math.floor(x / P);
    if (lx >= 13) return { v: 0.08, h: 0.05, r: 0.9 };
    const round = Math.sin(Math.PI * (lx + 0.5) / 13), tone = (h2(s, col, 5) - 0.5) * 0.1;
    return { v: 0.42 + tone + round * 0.18 + grainAt(y, x, s + col, 0.6), h: 0.45 + round * 0.4, r: 0.45 };
  },
  // D: seamless book-matched veneer — four large panels, near-invisible seams, low-sheen lacquer
  D: (x, y, s) => {
    const px = x % 64, py = y % 64, panel = (x >> 6) + (y >> 6) * 2, mirror = (x >> 6) % 2 ? 63 - px : px;
    let v = 0.56 + (h2(s, panel, 1) - 0.5) * 0.06 + grainAt(py, mirror, s, 0.55), h = 0.6;
    if (px === 0 || py === 0) { v -= 0.08; h = 0.5; }
    return { v, h, r: 0.32 };
  },
};
// ---- E–H: realistic architectural flooring — muted tones, fine straight grain with cathedral arches,
// staggered boards of mixed length, hairline joints, flat matte finish
const PARTITIONS = [[64, 64], [48, 80], [32, 96], [96, 32], [40, 48, 40], [80, 48], [56, 72], [32, 48, 48]];
function realGrain(along, across, width, s, board) {
  const centre = width / 2 + (h2(s, board, 2) - 0.5) * width * 0.4, d = across - centre;
  const fine = (n1(across * 1.7 + n1(along * 0.012, s + board) * 2.5, s + board) - 0.5) * 0.16;
  const cathedral = Math.sin(d * d * 0.05 + along * 0.045 + h2(s, board, 3) * 6) * 0.05 * (1 - Math.min(1, Math.abs(d) / width));
  const pores = h2(s + board, Math.floor(along / 3), Math.floor(across)) < 0.04 ? -0.05 : 0;
  return fine + cathedral + pores;
}
function rowFloor(x, y, s, rowH, opts = {}) {
  const row = Math.floor(y / rowH), ly = y % rowH, parts = PARTITIONS[Math.floor(h2(s, row, 11) * PARTITIONS.length)], off = Math.floor(h2(s, row, 12) * N);
  let xx = (x + off) % N, start = 0, b = 0;
  while (b < parts.length - 1 && xx >= start + parts[b]) { start += parts[b]; b++; }
  const lx = xx - start, len = parts[b], board = row * 17 + b;
  let v = 0.52 + (h2(s, board, 1) - 0.5) * (opts.vari ?? 0.12) + realGrain(lx + h2(s, board, 4) * 200, ly, rowH, s, board) * (opts.grain ?? 1), h = 0.55;
  if (opts.knots) { const kx = h2(s, board, 5) * len, ky = h2(s, board, 6) * rowH, kd = Math.hypot((lx - kx) / 1.6, ly - ky); if (kd < 3.5) v -= 0.22 * (1 - kd / 3.5); else if (kd < 7) v += Math.sin(kd * 2) * 0.03; }
  if (ly === 0 || lx === 0) { v -= 0.2; h = 0.45; }
  return { v, h, r: 0.62 };
}
Object.assign(STYLES, {
  E: (x, y, s) => rowFloor(x, y, s, 32),
  F: (x, y, s) => rowFloor(x, y, s + 7, 128 / 3 | 0, { knots: true, grain: 1.25, vari: 0.16 }),
  G: (x, y, s) => rowFloor(x, y, s + 13, 16, { grain: 0.8, vari: 0.18 }),
  H: (x, y, s) => { // basketweave parquet: 32×32 squares of two boards, orientation alternating like a chequerboard
    const S = 32, cx = Math.floor(x / S), cy = Math.floor(y / S), lx = x % S, ly = y % S, horiz = (cx + cy) % 2 === 0;
    const across = horiz ? ly : lx, along = horiz ? lx : ly, half = Math.floor(across / 16), la = across % 16, board = (cx * 4 + cy) * 2 + half;
    let v = 0.52 + (h2(s, board, 1) - 0.5) * 0.14 + realGrain(along * 1.5, la, 16, s, board) * 0.85, h = 0.55;
    if (la === 0 || along === 0) { v -= 0.2; h = 0.45; }
    return { v, h, r: 0.6 };
  },
});
// ---- W–Z: soft-figure styles — broad grain instead of fine hairlines, bevelled joints instead of dark lines
// smooth, tileable 2-D value noise over the 128 tile (cells across x and y)
function vn2(x, y, cx, cy, s) {
  const fx = x / N * cx, fy = y / N * cy, x0 = Math.floor(fx), y0 = Math.floor(fy); let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const X0 = ((x0 % cx) + cx) % cx, X1 = (X0 + 1) % cx, Y0 = ((y0 % cy) + cy) % cy, Y1 = (Y0 + 1) % cy;
  return (h2(s, X0, Y0) * (1 - tx) + h2(s, X1, Y0) * tx) * (1 - ty) + (h2(s, X0, Y1) * (1 - tx) + h2(s, X1, Y1) * tx) * ty;
}
const softFigure = (x, y, s) => (vn2(x, y, 2, 12, s) - 0.5) * 0.22 + (vn2(x, y, 4, 24, s + 1) - 0.5) * 0.08;   // long soft streaks along the board
const bevel = (d, w) => (d < w ? (1 - d / w) : 0);   // 1 at the joint, fading to 0 across w px
function boards(x, y, s, rowH, lens) { // staggered boards → { board, lx, ly, len, dx (px to end joint), dy (px to side joint) }
  const row = Math.floor(y / rowH), ly = y % rowH, off = Math.floor(h2(s, row, 12) * N), parts = lens[row % lens.length];
  let xx = (x + off) % N, start = 0, b = 0;
  while (b < parts.length - 1 && xx >= start + parts[b]) { start += parts[b]; b++; }
  const lx = xx - start; return { board: row * 17 + b, lx, ly, len: parts[b], dx: Math.min(lx, parts[b] - 1 - lx), dy: Math.min(ly, rowH - 1 - ly) };
}
Object.assign(STYLES, {
  W: (x, y, s) => { // soft boards: four wide boards, soft figure, light bevel joints
    const b = boards(x, y, s, 32, [[128], [64, 64], [128], [80, 48]]), e = Math.max(bevel(b.dy, 3), bevel(b.dx, 3));
    return { v: 0.55 + (h2(s, b.board, 1) - 0.5) * 0.1 + softFigure(x + b.board * 37, y, s) - e * 0.12 + (b.ly < 2 ? 0.04 : 0), h: 0.6 - e * 0.25, r: 0.45 };
  },
  X: (x, y, s) => { // clean veneer: two large horizontal panels with a smooth flame (cathedral) figure
    const panel = y < 64 ? 0 : 1, ly = y % 64, d = ly - 32 + (vn2(x, y, 2, 2, s + 4) - 0.5) * 10, flame = Math.sin(d * d * 0.012 + x * 0.05 + panel * 2) * 0.07;
    const e = bevel(Math.min(ly, 63 - ly), 2.5);
    return { v: 0.56 + flame + (vn2(x, y, 2, 8, s + panel) - 0.5) * 0.12 - e * 0.1, h: 0.62 - e * 0.2, r: 0.35 };
  },
  Y: (x, y, s) => { // brushed oak: wire-brushed matte texture, soft V-groove joints
    const b = boards(x, y, s + 3, 42, [[72, 56], [48, 80], [96, 32]]), vg = Math.max(bevel(b.dy, 4), bevel(b.dx, 3));
    const brush = (h2(s, Math.floor(x / 6), y) - 0.5) * 0.035;
    return { v: 0.54 + (h2(s, b.board, 1) - 0.5) * 0.1 + softFigure(x + b.board * 23, y, s + 5) * 0.8 + brush - vg * 0.16, h: 0.6 - vg * 0.35, r: 0.7 };
  },
  Z: (x, y, s) => { // long bevelled planks with a few soft knots
    const b = boards(x, y, s + 9, 32, [[128], [96, 32], [128], [48, 80]]), e = Math.max(bevel(b.dy, 4), bevel(b.dx, 4));
    let v = 0.55 + (h2(s, b.board, 1) - 0.5) * 0.12 + softFigure(x + b.board * 29, y, s + 7) * 0.6;
    const kx = h2(s, b.board, 5) * b.len, ky = 8 + h2(s, b.board, 6) * 16, kd = Math.hypot((b.lx - kx) / 1.8, b.ly - ky);
    if (h2(s, b.board, 7) < 0.5 && kd < 5) v -= 0.16 * (1 - kd / 5);
    const top = b.ly < 4 ? (4 - b.ly) / 4 : 0, bottom = b.ly > 27 ? (b.ly - 27) / 4 : 0;
    return { v: v + top * 0.08 - bottom * 0.14 - bevel(b.dx, 4) * 0.1, h: 0.62 - e * 0.35, r: 0.5 };
  },
});
const MUTED = new Set(['E', 'F', 'G', 'H']);   // these styles desaturate the wood palette toward natural tones
const STYLE_NAMES = { A: 'Smooth wide boards', B: 'Chevron parquet', C: 'Vertical slats', D: 'Seamless veneer', E: 'Laminate flooring', F: 'Wide-plank', G: 'Narrow strip floor', H: 'Basketweave parquet', W: 'Soft boards', X: 'Clean veneer', Y: 'Brushed oak', Z: 'Long bevelled planks' };
// gentle muting: keeps each wood's warmth (0.6 made oak read grey in-game)
const mute = pal => pal.map(([p, c]) => { const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; return [p, c.map(v => clamp(l + (v - l) * 0.85))]; });
// oak tones offered for planks_oak (choices.json "oak_tone"); gen.js swaps the oak plank palette when one is set
const hexC = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const P4 = (...cs) => cs.map((c, i) => [i / (cs.length - 1), hexC(c)]);
const OAK_TONES = {
  1: P4('#8c6436', '#a87e46', '#c2965a', '#d6ac6e'),   // honey oak
  2: P4('#9c7a4e', '#b8935f', '#cfab74', '#e0c08a'),   // natural light oak
  3: P4('#946020', '#b47a2c', '#cc923c', '#e2aa52'),   // golden oak
  4: P4('#6e4a26', '#8a5e32', '#a47442', '#b88a54'),   // warm medium oak
};
const OAK_NAMES = { 1: 'Honey oak', 2: 'Natural light oak', 3: 'Golden oak', 4: 'Warm medium oak' };
function oakTone() { try { const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')).oak_tone; return t ? OAK_TONES[t] : null; } catch { return null; } }

// paint a gen.js Tex with the given style and wood palette (gen's grad/palette format)
function plankBlock(t, s, pal, style, grad) {
  const key = style || chosenStyle(), f = STYLES[key], p0 = MUTED.has(key) ? mute(pal) : pal;
  return t.each((x, y, i) => { const p = f(x, y, s); t.col(i, grad(p0, clamp(p.v))); t.h[i] = p.h; t.r[i] = p.r; t.m[i] = 0; });
}
function chosenStyle() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')).planks || null; } catch { return null; }
}

// ---------------------------------------------------------------- comparison sheet
if (require.main === module) {
  const dir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
  if (!dir) { console.error('Usage: node planks.js --samples=<dir>'); process.exit(1); }
  const g = require('./gen.js'), { Tex, G, grad } = g;
  const WOODS = [g.WOOD.oak.plank, g.WOOD.spruce.plank, g.WOOD.birch.plank, g.WOOD.big_oak.plank, G('#b47a76', '#cc928c', '#dea8a0', '#ecbeb6'), G('#4a1e2e', '#62283c', '#7a344a', '#8e4258')];
  const GLYPH = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  };
  const ROWS = (process.argv.find(a => a.startsWith('--rows=')) || '--rows=ABCD').split('=')[1].split('');
  const LBL = 56, GAP = 6, cols = WOODS.length, W = LBL + cols * (N + GAP), H = ROWS.length * (N + GAP) + GAP, px = new Uint8Array(W * H * 3).fill(28);
  ROWS.forEach((key, r) => {
    const oy = GAP + r * (N + GAP);
    GLYPH[key].forEach((line, gy) => [...line].forEach((ch, gx) => { if (ch !== '#') return; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const d = ((oy + 43 + gy * 6 + y) * W + 13 + gx * 6 + x) * 3; px[d] = px[d + 1] = px[d + 2] = 235; } }));
    WOODS.forEach((pal, c) => {
      const t = plankBlock(new Tex(), 500 + c * 17, pal, key, grad).bake(0.45), ox = LBL + c * (N + GAP);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, d = ((oy + y) * W + ox + x) * 3; for (let k = 0; k < 3; k++) px[d + k] = Math.round(clamp(t.c[i * 3 + k]) * 255); }
    });
  });
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `choices_planks_${ROWS.join('')}.png`);
  fs.writeFileSync(out, pngBuf(W, H, 3, px));
  console.log('Wrote', out);
}
module.exports = { plankBlock, chosenStyle, oakTone, OAK_TONES, OAK_NAMES, STYLES, STYLE_NAMES };
