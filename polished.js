'use strict';
// USTP polished deepslate styles (honed dark slate, matching the chamfered cut sandstone direction).
// The chosen style (choices.json "polished_deepslate") redraws deepslate/polished_deepslate.
//   U Seamless honed · V Chamfered slab · W Cleft slate · X Polished veined
//   node polished.js --samples=<dir>   → sheet: current version on top, then U–X (tile + 3×3 wall each)
//   node polished.js                   → (re)build the block into USTP/ with the chosen style
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const { pngBuf, readImage } = require('./imageio');
const { Tex, G, grad, mul, clamp, fbm, h2, worley, edgeDist } = g;
const N = 128, NAME = 'deepslate/polished_deepslate';

const SLATE = G('#383a42', '#454750', '#52545e', '#60626d', '#6f727d');
const STYLE_NAMES = { U: 'Seamless honed', V: 'Chamfered slab', W: 'Cleft slate', X: 'Polished veined' };
function polishedDeepslate(style, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const n = fbm(x, y, 4, 4, 4, s), fine = (h2(s, x, y) - 0.5) * 0.04;
    let v = 0.5 + (n - 0.5) * 0.25 + fine, h = 0.6, r = 0.55, m = 0;
    if (style === 'V') { const ch = Math.max(0, 1 - edgeDist(x, y) / 5); v += (x + y < 128 ? 0.1 : -0.12) * ch; h -= ch * 0.25; }
    if (style === 'W') { // riven surface: layered shelves following the cleavage plane
      const layer = fbm(x, y, 2, 6, 4, s + 3), step = Math.floor(layer * 6) / 6;
      v = 0.42 + step * 0.25 + (n - 0.5) * 0.2 + fine; h = 0.3 + step * 0.6; r = 0.85;
    }
    if (style === 'X') { // glossy with faint mineral veins
      const w = worley(x, y, 4, s + 7), vein = Math.max(0, 1 - (w.f2 - w.f1) / 0.025) * (fbm(x, y, 3, 3, 2, s + 8) > 0.45 ? 1 : 0);
      v = 0.42 + (n - 0.5) * 0.18 + vein * 0.55; r = vein > 0 ? 0.25 : 0.12;
    }
    t.col(i, grad(SLATE, clamp(v))); t.h[i] = clamp(h); t.r[i] = r; t.m[i] = m;
  });
}
const chosen = () => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')).polished_deepslate || null; } catch { return null; } };

if (require.main === module) {
  const dir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
  if (dir) {
    const GLYPH = {
      '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
      U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
      W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    };
    const cur = readImage(path.join(__dirname, 'USTP', 'textures', 'blocks', NAME + '.png'));
    const rows = [['*', i => [cur.data[i * 4] / 255, cur.data[i * 4 + 1] / 255, cur.data[i * 4 + 2] / 255]]];
    for (const k of Object.keys(STYLE_NAMES)) { const t = polishedDeepslate(k, 950).bake(0.4); rows.push([k, i => [t.c[i * 3], t.c[i * 3 + 1], t.c[i * 3 + 2]]]); }
    const LBL = 56, GAP = 6, W = LBL + 2 * (N + GAP), H = rows.length * (N + GAP) + GAP, px = new Uint8Array(W * H * 3).fill(28);
    rows.forEach(([key, at], r) => {
      const oy = GAP + r * (N + GAP);
      GLYPH[key].forEach((line, gy) => [...line].forEach((ch, gx) => { if (ch !== '#') return; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const d = ((oy + 43 + gy * 6 + y) * W + 13 + gx * 6 + x) * 3; px[d] = px[d + 1] = px[d + 2] = 235; } }));
      for (const wall of [false, true]) {
        const ox = LBL + (wall ? N + GAP : 0);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = at((wall ? (y * 3) % N : y) * N + (wall ? (x * 3) % N : x)), d = ((oy + y) * W + ox + x) * 3; for (let k = 0; k < 3; k++) px[d + k] = Math.round(clamp(c[k]) * 255); }
      }
    });
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'choices_polished_deepslate.png'), pngBuf(W, H, 3, px));
    console.log('Wrote', path.join(dir, 'choices_polished_deepslate.png'));
  } else {
    const style = chosen(); if (!style) { console.log('No polished_deepslate style in choices.json — keeping the current polished deepslate.'); process.exit(0); }
    g.save(polishedDeepslate(style, 19000).bake(0.4), NAME);
    console.log(`Polished deepslate: rebuilt in style ${style} (${STYLE_NAMES[style]}).`);
  }
}
module.exports = { polishedDeepslate, STYLE_NAMES };
