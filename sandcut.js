'use strict';
// USTP cut sandstone styles (honed, matte, muted — matching the wide-plank look).
// The chosen style (choices.json "cut_sandstone") redraws cut sandstone and cut red sandstone.
//   M Two-course slab · N Ashlar blocks · O Fluted · P Square tiles
//   Q Bordered slab · R Seamless · S Chamfered · T Layered   (single course, no middle line)
//   node sandcut.js --samples=<dir> [--rows=QRST]   → comparison sheet (each tile plus a 3×3 wall preview)
//   node sandcut.js                   → (re)build the two blocks into USTP/ with the chosen style
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const { pngBuf } = require('./imageio');
const { Tex, G, grad, mul, clamp, fbm, h2, worley, edgeDist } = g;
const N = 128;

const SAND = { sandstone_smooth: G('#b8a36c', '#c8b47c', '#d6c48e', '#e2d2a2', '#ecdfb4'), red_sandstone_smooth: G('#9a4e24', '#aa5c2e', '#ba6c3a', '#c87c48', '#d48c58') };
const JOINT = 0.55;   // joint/groove darkening
// layouts → { id, d (px to joint), groove (optional shallow groove depth 0..1) }
const LAYOUT = {
  M: (x, y) => ({ id: y < 64 ? 0 : 1, d: Math.min(edgeDist(x, y), Math.abs(y - 63.5) - 0.5) }),
  N: (x, y) => { const bh = 32, bw = 64, row = Math.floor(y / bh), bx = (x + (row % 2) * 32) % N, lx = bx % bw, ly = y % bh; return { id: row * 3 + Math.floor(bx / bw), d: Math.min(lx, ly, bw - 1 - lx, bh - 1 - ly) }; },
  O: (x, y) => { const ly = y % 16; return { id: Math.floor(y / 16), d: edgeDist(x, y), groove: ly < 3 ? Math.sin(Math.PI * (ly + 0.5) / 3) : 0 }; },
  P: (x, y) => { const lx = x % 64, ly = y % 64; return { id: (x >> 6) + (y >> 6) * 2, d: Math.min(lx, ly, 63 - lx, 63 - ly) }; },
  // single-course slabs (no middle line)
  Q: (x, y) => ({ id: 0, d: edgeDist(x, y) }),
  R: () => ({ id: 0, d: 99 }),
  S: (x, y) => ({ id: 0, d: 99, chamfer: Math.max(0, 1 - edgeDist(x, y) / 5) }),
  T: (x, y) => ({ id: 0, d: edgeDist(x, y), strata: 2.6 }),
};
const STYLE_NAMES = { M: 'Two-course slab', N: 'Ashlar blocks', O: 'Fluted', P: 'Square tiles', Q: 'Bordered slab', R: 'Seamless', S: 'Chamfered', T: 'Layered' };

function cutSandstone(style, block, s) {
  const pal = SAND[block], t = new Tex();
  return t.each((x, y, i) => {
    const c = LAYOUT[style](x, y), n = fbm(x, y, 4, 4, 4, s + c.id * 5), strata = Math.sin(Math.PI * 2 * (y / N * (c.strata ? 4 : 9) + (fbm(x, y, 3, 2, 2, s + 2) - 0.5) * 0.3)) * 0.035 * (c.strata || 1);
    let v = 0.5 + (h2(s, c.id, 1) - 0.5) * 0.08 + (n - 0.5) * 0.22 + strata + (h2(s, x, y) - 0.5) * 0.05, h = 0.6, r = 0.75;
    const p = worley(x, y, 24, s + 6); if (p.f1 < 0.06 && h2(s, p.id, 2) < 0.4) { v -= 0.12; h = 0.45; }
    if (c.groove) { v -= c.groove * 0.12; h -= c.groove * 0.3; }
    if (c.chamfer) { v += (x + y < 128 ? 0.08 : -0.1) * c.chamfer; h -= c.chamfer * 0.25; }
    let col = grad(pal, clamp(v));
    if (c.d < 1.5) { col = mul(col, JOINT); h = 0.3; r = 0.9; } else if (c.d < 3) { col = mul(col, 1.05); h = 0.5; }
    t.col(i, col); t.h[i] = h; t.r[i] = r;
  });
}
const chosen = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')).cut_sandstone || null; } catch { return null; } };

if (require.main === module) {
  const dir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
  if (dir) {
    const GLYPH = {
      M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
      Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
      S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
      O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    };
    // per row: cut sandstone, cut red sandstone, then each as a 3×3 wall shrunk into one tile
    const keys = (process.argv.find(a => a.startsWith('--rows=')) || '--rows=MNOP').split('=')[1].split(''), cols = 4, LBL = 56, GAP = 6, W = LBL + cols * (N + GAP), H = keys.length * (N + GAP) + GAP, px = new Uint8Array(W * H * 3).fill(28);
    keys.forEach((key, r) => {
      const oy = GAP + r * (N + GAP);
      GLYPH[key].forEach((line, gy) => [...line].forEach((ch, gx) => { if (ch !== '#') return; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const d = ((oy + 43 + gy * 6 + y) * W + 13 + gx * 6 + x) * 3; px[d] = px[d + 1] = px[d + 2] = 235; } }));
      const tiles = ['sandstone_smooth', 'red_sandstone_smooth'].map((b, k) => cutSandstone(key, b, 900 + k * 7).bake(0.4));
      [0, 1, 2, 3].forEach(c => {
        const t = tiles[c % 2], wall = c >= 2, ox = LBL + c * (N + GAP);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const sx = wall ? (x * 3) % N : x, sy = wall ? (y * 3) % N : y, i = sy * N + sx, d = ((oy + y) * W + ox + x) * 3;
          for (let k = 0; k < 3; k++) px[d + k] = Math.round(clamp(t.c[i * 3 + k]) * 255);
        }
      });
    });
    fs.mkdirSync(dir, { recursive: true }); const out = path.join(dir, `choices_cut_sandstone_${keys.join('')}.png`);
    fs.writeFileSync(out, pngBuf(W, H, 3, px));
    console.log('Wrote', out);
  } else {
    const style = chosen(); if (!style) { console.log('No cut_sandstone style in choices.json — keeping the current cut sandstone.'); process.exit(0); }
    ['sandstone_smooth', 'red_sandstone_smooth'].forEach((b, k) => g.save(cutSandstone(style, b, 18000 + k * 31).bake(0.4), b));
    console.log(`Cut sandstone: rebuilt 2 blocks in style ${style} (${STYLE_NAMES[style]}).`);
  }
}
module.exports = { cutSandstone, STYLE_NAMES };
