'use strict';
// USTP chests: paints the chest model's unfolded texture (lid, base and latch boxes) for every chest
// variant, in the style picked in choices.json ("chest"). Ships colour + MERS + texture set per variant.
//   A Honey oak + steel · B Walnut + brass · C Minimal light oak · D Industrial
//   node chest.js <bedrock-samples/resource_pack> --samples=<dir>   → sheet of 3D previews (rows A–D)
//   node chest.js <bedrock-samples/resource_pack>                   → build every chest into USTP/ with the chosen style
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const P = require('./planks.js');
const { pngBuf, writeFile, readImage } = require('./imageio');
const { G, grad, clamp, h2, worley } = g;

const S = 8;   // texels → pixels: the 64×64 chest layout becomes 512×512 (128x density)
const VARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const VC = VARG && path.join(VARG, 'textures', 'entity', 'chest');
const OUT = path.join(__dirname, 'USTP', 'textures', 'entity', 'chest');

const WOOD = { honey: P.OAK_TONES[1], walnut: G('#3a2414', '#4e321c', '#644228', '#7a5434'), light: G('#b89a6a', '#ccb080', '#dcc496', '#e8d4aa') };
const METAL = { steel: G('#3e424a', '#6c7279', '#9aa0a8', '#c8ccd2'), brass: G('#5a3c06', '#946c18', '#c89a38', '#ecc870'), black: G('#0e0e10', '#1a1a1e', '#26262c', '#34343c'), gunmetal: G('#22242a', '#32353c', '#43464e', '#555962') };
const OBSIDIAN = G('#0b0712', '#160d22', '#24163a', '#3a2858');
const STYLES = {
  A: { body: 'wood:honey', trim: 'steel', latch: 'steel', corners: true },
  B: { body: 'wood:walnut', trim: 'brass', latch: 'brass', corners: true },
  C: { body: 'wood:light', trim: null, latch: 'black', corners: false },
  D: { body: 'metal:gunmetal', lidTop: 'wood:honey', trim: 'steel', latch: 'steel', corners: true, bolts: true },
};
const STYLE_NAMES = { A: 'Honey oak + steel', B: 'Walnut + brass', C: 'Minimal light oak', D: 'Industrial' };

function meanColour(file) {
  const im = readImage(file); let r = 0, gg = 0, b = 0, k = 0;
  for (let i = 0; i < im.w * im.h; i++) if (im.data[i * 4 + 3] > 127) { r += im.data[i * 4]; gg += im.data[i * 4 + 1]; b += im.data[i * 4 + 2]; k++; }
  return [r / k / 255, gg / k / 255, b / k / 255];
}
const palFrom = (c, k = [0.45, 0.8, 1.05, 1.3]) => k.map((s, i) => [i / (k.length - 1), c.map(v => clamp(v * s))]);

// surface materials → { c, m, e, r } at face-local pixel (x, y)
function surface(spec, x, y, seed, variant) {
  if (variant.ender) { const w = worley(x % 128, y % 128, 5, seed); return { c: grad(OBSIDIAN, 0.2 + h2(seed, w.id, 1) * 0.5 + (w.f2 - w.f1 < 0.05 ? 0.3 : 0)), m: 0, e: 0, r: 0.15 }; }
  if (variant.copper) return { c: grad(variant.copper, 0.35 + ((h2(seed, x >> 2, y) - 0.5) * 0.06) + 0.25 * (P.STYLES.X(x % 128, y % 128, seed).v - 0.5)), m: variant.metal, e: 0, r: 0.35 };
  const [kind, name] = spec.split(':');
  if (kind === 'wood') return { c: grad(WOOD[name], clamp(P.STYLES.X(x % 128, y % 128, seed).v)), m: 0, e: 0, r: 0.4 };
  return { c: grad(METAL[name], 0.4 + (h2(seed, x >> 3, y) - 0.5) * 0.08), m: 1, e: 0, r: 0.35 };
}
function trimAt(style, variant, x, y, seed) {
  if (variant.ender) return { c: [0.1, 0.08, 0.14], m: 0.5, e: 0, r: 0.3 };
  const pal = variant.copper ? palFrom(variant.copper.map ? variant.copper[2][1] : [0.7, 0.4, 0.3], [0.35, 0.6, 0.85, 1.05]) : METAL[style.trim || 'black'];
  return { c: grad(pal, 0.45 + (h2(seed, x, y >> 3) - 0.5) * 0.08), m: 1, e: 0, r: 0.3 };
}

// paint one chest texture. double → 30-texel-wide boxes on a 128×64 layout
function paintChest(style, variant, double) {
  const tw = double ? 128 : 64, W = tw * S, H = 64 * S, col = new Float32Array(W * H * 3), mers = new Float32Array(W * H * 3), alpha = new Uint8Array(W * H);
  const st = STYLES[style], bw = double ? 30 : 14, TB = 10, SB = 7;   // trim band and seam band widths (px)
  const put = (x, y, s) => { const i = y * W + x; col[i * 3] = s.c[0]; col[i * 3 + 1] = s.c[1]; col[i * 3 + 2] = s.c[2]; mers[i * 3] = s.m; mers[i * 3 + 1] = s.e; mers[i * 3 + 2] = s.r; alpha[i] = 255; };
  const face = (tx, ty, tw2, th, fn) => { for (let y = 0; y < th * S; y++) for (let x = 0; x < tw2 * S; x++) put(tx * S + x, ty * S + y, fn(x, y, tw2 * S, th * S)); };
  const shade = (s, k) => ({ ...s, c: s.c.map(v => clamp(v * k)) });
  const seam = variant.ender ? { c: [0.3, 1, 0.65], m: 0, e: 1, r: 0.3 } : variant.trapped ? { c: [0.8, 0.12, 0.1], m: 0, e: 0.15, r: 0.3 } : null;
  for (const box of [{ v: 0, h: 5, lid: true }, { v: 19, h: 10, lid: false }]) {
    const d = 14, u = 0, v = box.v, seed = box.lid ? 31 : 47;
    const side = (fx, fy, fw, fh) => {
      let s = surface(st.body, fx, fy + (box.lid ? 0 : 60), seed, variant);
      const corner = st.corners && (fx < TB || fx >= fw - TB), seamBand = box.lid ? fy >= fh - SB : fy < SB;
      if (corner || (st.trim && seamBand) || variant.ender && (corner || seamBand)) { s = trimAt(st, variant, fx, fy, seed); if (corner && (fx === TB - 1 || fx === fw - TB)) s = shade(s, 0.6); }
      if (!st.trim && seamBand && (box.lid ? fy === fh - 1 : fy === 0)) s = shade(s, 0.45);
      if (seam && (box.lid ? fy >= fh - 3 : fy < 3)) s = seam;
      if (st.bolts && corner && Math.hypot((fx < TB ? fx : fw - 1 - fx) - TB / 2, (fy % 20) - 10) < 2.5) s = shade(trimAt(st, variant, fx, fy, seed), 1.35);
      return s;
    };
    const top = (fx, fy, fw, fh) => {
      const edge = Math.min(fx, fy, fw - 1 - fx, fh - 1 - fy);
      let s = box.lid ? surface(st.lidTop || st.body, fx, fy, seed + 3, variant) : shade(surface(st.body, fx, fy, seed + 5, variant), 0.6);   // base top is the inside of the chest
      if (box.lid && st.trim && edge < TB) { s = trimAt(st, variant, fx, fy, seed); if (edge === TB - 1) s = shade(s, 0.6); }
      if (box.lid && !st.trim && edge < 2) s = shade(s, 0.7);
      return s;
    };
    const bottom = (fx, fy) => shade(surface(st.body, fx, fy, seed + 7, variant), 0.7);
    face(u + d, v, bw, d, top); face(u + d + bw, v, bw, d, bottom);
    face(u, v + d, d, box.h, side); face(u + d, v + d, bw, box.h, side); face(u + d + bw, v + d, d, box.h, side); face(u + 2 * d + bw, v + d, bw, box.h, side);
  }
  // latch: 2×4×1 box at the top-left corner of the layout
  const latchMat = (fx, fy) => {
    if (variant.ender) return { c: [0.3, 1, 0.65], m: 0, e: 1, r: 0.3 };
    if (variant.trapped) return { c: [0.75, 0.12, 0.1], m: 0.6, e: 0, r: 0.25 };
    const s = trimAt({ ...st, trim: st.latch }, variant, fx, fy, 9); return { ...s, c: s.c.map(v => clamp(v * 1.15)) };
  };
  for (const [tx, ty, w2, h2_] of [[1, 0, 2, 1], [3, 0, 2, 1], [0, 1, 1, 4], [1, 1, 2, 4], [3, 1, 1, 4], [4, 1, 2, 4]]) face(tx, ty, w2, h2_, latchMat);
  return { W, H, col, mers, alpha };
}

// ---------------------------------------------------------------- 3D preview (isometric, single chest)
function previewChest(t, size = 192) {
  const out = new Uint8Array(size * size * 3).fill(46), c = 0.866, s = 0.5, k = size / 34, ox = size / 2, oy = size * 0.3;
  const sample = (tx, ty) => { const x = Math.min(t.W - 1, Math.max(0, Math.floor(tx * S))), y = Math.min(t.H - 1, Math.max(0, Math.floor(ty * S))), i = y * t.W + x; return [t.col[i * 3], t.col[i * 3 + 1], t.col[i * 3 + 2]]; };
  const boxes = [ // model units; lid on top of base, latch on the front (z = 14)
    { x0: 0, x1: 14, y0: 9, y1: 14, z0: 0, z1: 14, uv: [0, 0], w: 14, h: 5, d: 14 },
    { x0: 0, x1: 14, y0: 0, y1: 10, z0: 0, z1: 14, uv: [0, 19], w: 14, h: 10, d: 14 },
    { x0: 6, x1: 8, y0: 6, y1: 10, z0: 14, z1: 15, uv: [0, 0], w: 2, h: 4, d: 1 },
  ];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const sx = (px - ox) / k, sy = (py - oy) / k;   // screen → iso: sx = (x − z)c, sy = (x + z)s − y
    let best = null, bestDepth = -1e9;
    for (const b of boxes) {
      const [u, v] = b.uv;
      const tries = [
        ['top', (() => { const y = b.y1, a = sx / c, sum = (sy + y) / s, x = (sum + a) / 2, z = (sum - a) / 2; return x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 ? { x, y, z, col: sample(u + b.d + (x - b.x0), v + (z - b.z0)), sh: 1 } : null; })()],
        ['front', (() => { const z = b.z1, x = sx / c + z, y = (x + z) * s - sy; return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 ? { x, y, z, col: sample(u + b.d + (x - b.x0), v + b.d + (b.y1 - y)), sh: 0.85 } : null; })()],
        ['side', (() => { const x = b.x1, z = x - sx / c, y = (x + z) * s - sy; return z >= b.z0 && z <= b.z1 && y >= b.y0 && y <= b.y1 ? { x, y, z, col: sample(u + b.d + b.w + (b.z1 - z), v + b.d + (b.y1 - y)), sh: 0.68 } : null; })()],
      ];
      for (const [, hit] of tries) if (hit) { const depth = hit.x + hit.z + hit.y * 0.01; if (depth > bestDepth) { bestDepth = depth; best = hit; } }
    }
    if (best) for (let q = 0; q < 3; q++) out[(py * size + px) * 3 + q] = Math.round(clamp(best.col[q] * best.sh) * 255);
  }
  return out;
}

// ---------------------------------------------------------------- variants
function variants() {
  const list = [['normal', {}, false], ['double_normal', {}, true], ['trapped', { trapped: true }, false], ['trapped_double', { trapped: true }, true], ['ender', { ender: true }, false]];
  for (const stage of ['default', 'exposed', 'weathered', 'oxidized']) {
    const metal = { default: 1, exposed: 0.8, weathered: 0.55, oxidized: 0.3 }[stage];
    const c = VC && fs.existsSync(path.join(VC, `copper_${stage}.png`)) ? meanColour(path.join(VC, `copper_${stage}.png`)) : [0.75, 0.45, 0.3];
    const v = { copper: palFrom(c), metal };
    list.push([`copper_${stage}`, v, false], [`copper_${stage}_double`, v, true]);
  }
  return list;
}

if (require.main === module) {
  const dir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
  if (dir) {
    const show = ['normal', 'trapped', 'ender', 'copper_default'], all = variants(), SZ = 192, GAP = 8, LBL = 56;
    const keys = Object.keys(STYLES), Wd = LBL + show.length * (SZ + GAP), Hd = keys.length * (SZ + GAP) + GAP, px = new Uint8Array(Wd * Hd * 3).fill(28);
    const GLYPH = { A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'], C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'] };
    keys.forEach((key, r) => {
      const oy = GAP + r * (SZ + GAP);
      GLYPH[key].forEach((line, gy) => [...line].forEach((ch, gx) => { if (ch !== '#') return; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const d = ((oy + SZ / 2 - 20 + gy * 6 + y) * Wd + 13 + gx * 6 + x) * 3; px[d] = px[d + 1] = px[d + 2] = 235; } }));
      show.forEach((name, c) => {
        const [, v, dbl] = all.find(e => e[0] === name), img = previewChest(paintChest(key, v, dbl), SZ), ox = LBL + c * (SZ + GAP);
        for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) for (let q = 0; q < 3; q++) px[((oy + y) * Wd + ox + x) * 3 + q] = img[(y * SZ + x) * 3 + q];
      });
    });
    fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'choices_chest.png'), pngBuf(Wd, Hd, 3, px));
    console.log('Wrote', path.join(dir, 'choices_chest.png'));
  } else {
    let style; try { style = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')).chest; } catch { /* none */ }
    if (!style) { console.log('No chest style in choices.json — keeping the remastered chests.'); process.exit(0); }
    const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
    fs.mkdirSync(OUT, { recursive: true });
    for (const [name, v, dbl] of variants()) {
      const t = paintChest(style, v, dbl), rgba = new Uint8Array(t.W * t.H * 4), mr = new Uint8Array(t.W * t.H * 4);
      for (let i = 0; i < t.W * t.H; i++) { for (let q = 0; q < 3; q++) { rgba[i * 4 + q] = Math.round(clamp(t.col[i * 3 + q]) * 255); mr[i * 4 + q] = Math.round(clamp(t.mers[i * 3 + q]) * 255); } rgba[i * 4 + 3] = t.alpha[i]; mr[i * 4 + 3] = 255; }
      writeFile(path.join(OUT, name + '.png'), pngBuf(t.W, t.H, 4, rgba));
      writeFile(path.join(OUT, name + '_mers.png'), pngBuf(t.W, t.H, 4, mr));
      writeFile(path.join(OUT, name + '.texture_set.json'), JSON.stringify({ format_version: '1.21.30', 'minecraft:texture_set': { color: name, metalness_emissive_roughness_subsurface: name + '_mers' } }, null, 2));
      listed.add('entity/chest/' + name);
    }
    fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
    console.log(`Chests: built ${variants().length} variants in style ${style} (${STYLE_NAMES[style]}).`);
  }
}
module.exports = { paintChest, previewChest, STYLE_NAMES };
