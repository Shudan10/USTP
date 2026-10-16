'use strict';
// USTP cut-stone styles (Modern Arch direction: honed stone, muted grey, thin flat joints, matte).
// The chosen style (choices.json "cut_stone") redraws the stone-brick family and smooth stone.
//   I Large ashlar · J Honed square tiles · K Random ashlar · L Slim modern brick
//   node stonecut.js --samples=<dir>          → comparison sheet
//   node stonecut.js                          → (re)build the blocks into USTP/ with the chosen style
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const { pngBuf } = require('./imageio');
const { Tex, G, grad, mul, mix, clamp, fbm, h2, worley, edgeDist } = g;
const N = 128;

const STONE = G('#6e7072', '#7e8082', '#8e9092', '#9ea0a2', '#aeb0b2');
const MORTAR = [0.36, 0.37, 0.38];
// layouts → { id, d (px to joint), lx, ly } for a pixel
const ROWS_K = [24, 40, 32, 32];   // random ashlar course heights (sum 128)
const LAYOUT = {
  I: (x, y) => { const bh = 32, bw = 64, row = Math.floor(y / bh), bx = (x + (row % 2) * 32) % N, col = Math.floor(bx / bw), lx = bx % bw, ly = y % bh; return { id: row * 7 + col, d: Math.min(lx, ly, bw - 1 - lx, bh - 1 - ly) }; },
  J: (x, y) => { const S = 64, lx = x % S, ly = y % S; return { id: (x >> 6) + (y >> 6) * 2, d: Math.min(lx, ly, S - 1 - lx, S - 1 - ly) }; },
  K: (x, y, s) => {
    let top = 0, row = 0; while (y >= top + ROWS_K[row]) { top += ROWS_K[row]; row++; }
    const bh = ROWS_K[row], ly = y - top, widths = [[48, 80], [32, 56, 40], [72, 56], [40, 40, 48]][row], off = Math.floor(h2(s, row, 9) * N), bx = (x + off) % N;
    let start = 0, b = 0; while (b < widths.length - 1 && bx >= start + widths[b]) { start += widths[b]; b++; }
    const lx = bx - start; return { id: row * 11 + b, d: Math.min(lx, ly, widths[b] - 1 - lx, bh - 1 - ly) };
  },
  L: (x, y) => { const bh = 16, bw = 64, row = Math.floor(y / bh), bx = (x + (row % 2) * 32) % N, lx = bx % bw, ly = y % bh; return { id: row * 5 + Math.floor(bx / bw), d: Math.min(lx, ly, bw - 1 - lx, bh - 1 - ly) }; },
};
const STYLE_NAMES = { I: 'Large ashlar', J: 'Honed square tiles', K: 'Random ashlar', L: 'Slim modern brick' };

// honed stone face: soft mottling, fine grain, rare darker inclusions; joints thin, flat and slightly recessed
function honed(t, s, cell, o = {}) {
  return t.each((x, y, i) => {
    const c = cell(x, y), n = fbm(x, y, 4, 4, 4, s + (c.id % 9) * 3), fine = (h2(s, x, y) - 0.5) * 0.05;
    let v = 0.5 + (h2(s, c.id, 1) - 0.5) * 0.12 + (n - 0.5) * 0.3 + fine;
    const w = worley(x, y, 22, s + 5); if (w.f1 < 0.07 && h2(s, w.id, 3) < 0.3) v -= 0.15;
    let col = grad(STONE, clamp(v)), h = 0.55, r = 0.55;
    if (c.d < (o.joint ?? 1.5)) { col = mul(MORTAR, 0.9 + n * 0.2); h = 0.3; r = 0.9; }
    else if (c.d < (o.joint ?? 1.5) + 1) { col = mul(col, 1.06); h = 0.5; }
    if (o.moss) { const m = fbm(x, y, 6, 6, 3, s + 20) + (c.d < 4 ? 0.25 : 0); if (m > 0.68) { col = mix(col, [0.32, 0.45, 0.2], clamp((m - 0.68) * 5)); r = 0.9; } }
    t.col(i, col); t.h[i] = h; t.r[i] = r;
  });
}
const slabCell = (x, y) => ({ id: 0, d: edgeDist(x, y) });
const sideCell = (x, y) => ({ id: y < 64 ? 0 : 1, d: Math.min(edgeDist(x, y), Math.abs(y - 63.5) - 0.5) });
function chiseled(t, s, style) {
  honed(t, s, LAYOUT[style] === LAYOUT.J ? LAYOUT.J : slabCell);
  return t.each((x, y, i) => {
    const e = edgeDist(x, y), m = Math.max(Math.abs(x - 63.5), Math.abs(y - 63.5));
    if ((e >= 14 && e < 16) || (m > 22 && m < 24.5)) { t.col(i, mul(t.get(i), 0.7)); t.h[i] = 0.3; } else if (m <= 22) t.h[i] = 0.75;
  });
}
const BUILDS = style => [
  ['stonebrick', s => honed(new Tex(), s, (x, y) => LAYOUT[style](x, y, s))],
  ['stonebrick_mossy', s => honed(new Tex(), s, (x, y) => LAYOUT[style](x, y, s), { moss: true })],
  ['stonebrick_cracked', s => require('./batch2.js').cracksOn(honed(new Tex(), s, (x, y) => LAYOUT[style](x, y, s)), s + 1, 5)],
  ['stonebrick_carved', s => chiseled(new Tex(), s, style)],
  ['stone_slab_top', s => honed(new Tex(), s, style === 'J' ? LAYOUT.J : slabCell)],
  ['stone_slab_side', s => honed(new Tex(), s, sideCell)],
];
const chosen = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')).cut_stone || null; } catch { return null; } };

if (require.main === module) {
  const dir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
  if (dir) {
    const GLYPH = {
      I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'], J: ['#####', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
      K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    };
    const keys = Object.keys(LAYOUT), cols = 6, LBL = 56, GAP = 6, W = LBL + cols * (N + GAP), H = keys.length * (N + GAP) + GAP, px = new Uint8Array(W * H * 3).fill(28);
    keys.forEach((key, r) => {
      const oy = GAP + r * (N + GAP);
      GLYPH[key].forEach((line, gy) => [...line].forEach((ch, gx) => { if (ch !== '#') return; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const d = ((oy + 43 + gy * 6 + y) * W + 13 + gx * 6 + x) * 3; px[d] = px[d + 1] = px[d + 2] = 235; } }));
      BUILDS(key).forEach(([, fn], c) => { const t = fn(700 + c * 13).bake(0.4), ox = LBL + c * (N + GAP); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x, d = ((oy + y) * W + ox + x) * 3; for (let k = 0; k < 3; k++) px[d + k] = Math.round(clamp(t.c[i * 3 + k]) * 255); } });
    });
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'choices_cut_stone.png'), pngBuf(W, H, 3, px));
    console.log('Wrote', path.join(dir, 'choices_cut_stone.png'));
  } else {
    const style = chosen(); if (!style) { console.log('No cut_stone style in choices.json — keeping the original stone bricks.'); process.exit(0); }
    BUILDS(style).forEach(([name, fn], k) => g.save(fn(17000 + k * 29).bake(0.4), name));
    console.log(`Cut stone: rebuilt ${BUILDS(style).length} blocks in style ${style} (${STYLE_NAMES[style]}).`);
  }
}
module.exports = { BUILDS, STYLE_NAMES };
