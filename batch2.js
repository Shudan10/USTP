'use strict';
// USTP batch 2: deepslate, nether blocks, food and mob drops, each in three styles —
//   A Clean Modern · B Natural Realistic · C Bold
//   node batch2.js --samples=<dir>   → one labelled comparison sheet per family (rows A, B, C)
const fs = require('fs'), path = require('path');
const { pngBuf } = require('./imageio');
const g = require('./gen.js');
const it = require('./items.js');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mk } = it;
const ifbm = it.fbm;   // item-space noise: ifbm(x, y, seed)
const N = 128;
const con = (v, k) => (v - 0.5) * k + 0.5;

// ---------------------------------------------------------------- block styles
const STYLE = {
  A: { label: 'Clean Modern', ct: 0.75, grain: 0.025, relief: 0.15, crack: 0, joint: 1.5, jointK: 0.5, bevel: 3, chip: 0, light: 0.45, rough: 0.55, vari: 0.12 },
  B: { label: 'Natural Realistic', ct: 1.8, grain: 0.1, relief: 0.6, crack: 0.7, joint: 2.5, jointK: 0.3, bevel: 5, chip: 5, light: 0.7, rough: 0.92, vari: 0.3, strata: true },
  C: { label: 'Bold', ct: 1.4, grain: 0.035, relief: 0.3, crack: 0, joint: 3, jointK: 0.1, bevel: 7, chip: 0, light: 1.0, rough: 0.4, vari: 0.2, glow: true },
};
const PAL = {
  deepslate: { A: G('#34353c', '#41434b', '#4e5059', '#5c5e68'), B: G('#22232a', '#33343c', '#45464f', '#5a5b64', '#6d6e78'), C: G('#101118', '#1d2030', '#2e3450', '#4a5584') },
  netherrack: { A: G('#4a1b1b', '#5e2423', '#722e2c', '#863a36'), B: G('#3a1212', '#5a1d1c', '#7a2a26', '#94403a', '#a8574f'), C: G('#2a0808', '#4d0f0f', '#7a1616', '#a82222') },
  netherbrick: { A: G('#2a1418', '#381b20', '#46232a', '#552c33'), B: G('#1f0d10', '#2e1418', '#3f1d22', '#55282e'), C: G('#14070a', '#2a0e14', '#45162a', '#6a2040') },
  blackstone: { A: G('#1f1d22', '#29272d', '#343138', '#3f3c44'), B: G('#141216', '#221f25', '#302c34', '#423d46', '#4f4954'), C: G('#09080b', '#16131d', '#251f33', '#3b3155') },
  basalt: { A: G('#3e3e44', '#4b4b52', '#5a5a62', '#6a6a73'), B: G('#2a2a2f', '#3c3c42', '#505057', '#66666e'), C: G('#18181c', '#2c2c36', '#444456', '#6a6a88') },
  soulsand: { A: G('#3b2c22', '#4b392d', '#5c4738', '#6d5644'), B: G('#2b1d15', '#3f2c20', '#57402f', '#6e5340'), C: G('#241812', '#3a2a20', '#4f3a2c', '#64492f') },
};
const EMBER = [1, 0.48, 0.1], SOUL = [0.37, 0.95, 1];

// stone face: broad tone, optional strata and cracks (natural), fine grain
function surface(x, y, s, st) {
  let n = fbm(x, y, 4, 4, 5, s);
  if (st.strata) n = n * 0.6 + fbm(x, y, 2, 16, 4, s + 50) * 0.4;
  let crack = 0;
  if (st.crack) {
    const w = worley(x, y, 5, s + 3), mask = sstep(0.55, 0.68, fbm(x, y, 3, 3, 3, s + 5));
    crack = (1 - sstep(0, 0.045, w.f2 - w.f1)) * mask * st.crack;
  }
  const gr = (h2(s + 9, x, y) - 0.5) * st.grain;
  return { v: con(n, st.ct) + gr - crack * 0.35, h: 0.5 + (n - 0.5) * st.relief + gr * 0.5 - crack * 0.4 };
}
// masonry layouts → cell id + distance (px) to the nearest joint; natural style chips the edges
function cellAt(x, y, L, s, chip) {
  const wx = x + (chip ? (fbm(x, y, 8, 8, 2, s + 40) - 0.5) * chip * 2 : 0), wy = y + (chip ? (fbm(x, y, 8, 8, 2, s + 41) - 0.5) * chip * 2 : 0);
  if (L.type === 'grid') {
    const row = Math.floor(wy / L.bh), bx = wx + (L.offset ? (((row % 2) + 2) % 2) * L.bw / 2 : 0), cols = N / L.bw;
    const col = ((Math.floor(bx / L.bw) % cols) + cols) % cols, lx = ((bx % L.bw) + L.bw) % L.bw, ly = ((wy % L.bh) + L.bh) % L.bh;
    return { id: row * 131 + col, d: Math.min(lx, ly, L.bw - lx, L.bh - ly) };
  }
  if (L.type === 'cobble') { const w = worley(wx, wy, L.k, s, 0.9); return { id: w.id, d: (w.f2 - w.f1) * N / L.k * 0.5 }; }
  if (L.type === 'columns') {
    const col = Math.floor(wx / L.cw), lx = ((wx % L.cw) + L.cw) % L.cw, sh = h2(s, col, 3) * N, ly = (((wy + sh) % L.ch) + L.ch) % L.ch;
    return { id: col * 97 + Math.floor((wy + sh) / L.ch), d: Math.min(lx, L.cw - lx, L.ch < N ? Math.min(ly, L.ch - ly) : 99), lx: lx / L.cw };
  }
  return { id: 0, d: edgeDist(x, y) + 0.5 };   // 'slab': one panel
}
function masonry(fam, key, L, s, o = {}) {
  const st = STYLE[key], pal = PAL[fam][key], t = new Tex();
  const jw = L.type === 'slab' ? st.joint : st.joint * (o.jointScale || 1);
  t.each((x, y, i) => {
    const c = cellAt(x, y, L, s, L.type === 'slab' ? 0 : st.chip);
    if (c.d < jw) { // joint / reveal
      const glow = st.glow && o.glowJoint;
      t.col(i, glow ? o.glowJoint : mul(grad(pal, 0.2), st.jointK * 2));
      t.h[i] = 0.08; t.r[i] = 0.95; if (glow) t.e[i] = 0.85;
      return;
    }
    const tone = (h2(s, c.id, 1) - 0.5) * st.vari, f = surface(x, y, s + (c.id % 7) * 13, st);
    let v = f.v + tone, h = f.h + sstep(jw, jw + st.bevel, c.d) * 0.3;
    if (L.type === 'columns' && key !== 'B') { h += Math.sin(Math.PI * c.lx) * 0.15; v += (Math.sin(Math.PI * c.lx) - 0.6) * 0.12; }
    t.col(i, grad(pal, v)); t.h[i] = clamp(h); t.r[i] = st.rough;
  });
  if (o.motif) o.motif(t, st);
  return t;
}
const groove = (t, test) => t.each((x, y, i) => { if (test(x, y)) { t.col(i, mul(t.get(i), 0.5)); t.h[i] = 0.15; } });

function netherrack(key, s) {
  const st = STYLE[key], t = masonry('netherrack', key, { type: 'slab' }, s, {});
  // rack has no reveal frame: rebuild as pure rock, then add pits (natural) or ember veins (bold)
  t.each((x, y, i) => {
    const f = surface(x, y, s, { ...st, ct: key === 'A' ? 1.3 : st.ct * 1.1, grain: key === 'A' ? 0.06 : st.grain });
    let c = grad(PAL.netherrack[key], f.v), h = f.h;
    if (key === 'B') { const p = worley(x, y, 22, s + 6); if (p.f1 < 0.16) { c = mul(c, 0.35 + p.f1 * 2); h = 0.15; } }
    if (key === 'C') {
      const w = worley(x, y, 5, s + 8), on = w.f2 - w.f1 < 0.04 && fbm(x, y, 3, 3, 2, s + 9) > 0.45;
      if (on) { c = EMBER; h = 0.1; t.e[i] = 0.9; }
    }
    if (key === 'A') { h = 0.5 + (h - 0.5) * 0.4; if (h2(s + 4, x >> 1, y >> 1) < 0.03) c = mul(c, 0.7); }
    t.col(i, c); t.h[i] = clamp(h); t.r[i] = st.rough;
  });
  return t;
}
function soulSand(key, s) {
  const st = STYLE[key], t = new Tex(), faces = [[30, 36], [94, 28], [62, 92]];
  return t.each((x, y, i) => {
    const gr = h2(s, x, y) - 0.5, n = fbm(x, y, 8, 8, 3, s + 1);
    let v = 0.5 + gr * (key === 'A' ? 0.15 : 0.35) + (n - 0.5) * 0.4, h = 0.5 + gr * 0.2, c;
    let face = 0;
    for (const [fx, fy] of faces) {
      const dx = ((x - fx + 192) % N) - 64, dy = ((y - fy + 192) % N) - 64;
      const k = Math.min(sdEllipse(dx, dy, -8, -4, 4, 5), sdEllipse(dx, dy, 8, -4, 4, 5), sdEllipse(dx, dy, 0, 9, 7, 4));
      face = Math.max(face, 1 - sstep(-1.5, 1.5, k));
    }
    c = grad(PAL.soulsand[key], v);
    if (face > 0) {
      if (key === 'C') { c = mix(c, SOUL, face); t.e[i] = face * 0.8; }
      else c = mul(c, 1 - face * (key === 'A' ? 0.45 : 0.75));
      h -= face * 0.35;
    }
    t.col(i, c); t.h[i] = clamp(h); t.r[i] = st.rough;
  });
}

const BLOCK_SAMPLES = {
  deepslate: [
    ['cobbled_deepslate', (k, s) => masonry('deepslate', k, { type: 'cobble', k: k === 'C' ? 6 : 7 }, s, { jointScale: 1.3 })],
    ['deepslate_bricks', (k, s) => masonry('deepslate', k, { type: 'grid', bw: 32, bh: 16, offset: true }, s)],
    ['deepslate_tiles', (k, s) => masonry('deepslate', k, { type: 'grid', bw: 32, bh: 32 }, s)],
    ['polished_deepslate', (k, s) => masonry('deepslate', k, { type: 'slab' }, s)],
    ['chiseled_deepslate', (k, s) => masonry('deepslate', k, { type: 'slab' }, s, {
      motif: t => groove(t, (x, y) => { const e = edgeDist(x, y), r = Math.hypot(x - 63.5, y - 63.5); return (e >= 14 && e < 16) || (r > 24 && r < 27) || (Math.abs(x - 63.5) + Math.abs(y - 63.5) > 40 && Math.abs(x - 63.5) + Math.abs(y - 63.5) < 42.5 && e > 16); }) })],
  ],
  nether: [
    ['netherrack', (k, s) => netherrack(k, s)],
    ['nether_brick', (k, s) => masonry('netherbrick', k, { type: 'grid', bw: 32, bh: 16, offset: true }, s, { glowJoint: EMBER })],
    ['blackstone', (k, s) => masonry('blackstone', k, { type: 'cobble', k: 4 }, s, { jointScale: 0.6 })],
    ['basalt_side', (k, s) => masonry('basalt', k, { type: 'columns', cw: 32, ch: k === 'B' ? 64 : N }, s)],
    ['soul_sand', (k, s) => soulSand(k, s)],
  ],
};

// ---------------------------------------------------------------- item designs (front view, 128x)
const ORG = (base, dark, light, extra = {}) => mk({ kind: 'organic', base, dark, light, metal: 0, rough: 0.6, ...extra });
const FOODM = {
  appleSkin: ORG('#d8232a', '#4c070b', '#fff2e8', { gloss: 45, spec: 0.7, mottle: 0.15, grain: 0.25 }),
  leaf: ORG('#4fa12e', '#163d0c', '#e8ffd0', { gloss: 18, spec: 0.25 }),
  stem: ORG('#6b4423', '#26150a', '#c9a07a', { gloss: 10, spec: 0.1 }),
  crust: ORG('#c47a2c', '#4a2206', '#ffe7b0', { gloss: 14, spec: 0.25, mottle: 0.3 }),
  crumb: ORG('#f1d79a', '#a07a3a', '#fffaf0', { gloss: 6, spec: 0.05 }),
  meat: ORG('#7a3a1e', '#240b03', '#e8a070', { gloss: 22, spec: 0.35, mottle: 0.35, grain: 0.6 }),
  fat: ORG('#e6cfa0', '#8a6a40', '#fffaf0', { gloss: 20, spec: 0.3 }),
  carrot: ORG('#f07a1a', '#6a2a00', '#ffe0b0', { gloss: 26, spec: 0.4, mottle: 0.2 }),
  cookie: ORG('#c88a45', '#4e2c0c', '#ffe0a8', { gloss: 10, spec: 0.15, mottle: 0.35, grain: 0.7 }),
  choc: ORG('#3a1d0c', '#0e0603', '#c08a60', { gloss: 30, spec: 0.5 }),
  bone: ORG('#eee6d0', '#6e6452', '#ffffff', { gloss: 16, spec: 0.25, mottle: 0.15 }),
  pearl: ORG('#1fa38c', '#04201c', '#e8fffb', { gloss: 70, spec: 1.0, emis: 0.12 }),
  slime: ORG('#79d35a', '#1e5a14', '#f0ffe0', { gloss: 90, spec: 1.1, mottle: 0.1 }),
  blaze: ORG('#ffb21f', '#6a2a00', '#fff6c8', { gloss: 30, spec: 0.4, emis: 0.75 }),
  powder: ORG('#5c5c5c', '#141414', '#cfcfcf', { gloss: 10, spec: 0.15, mottle: 0.4, grain: 1.5 }),
};
const rotEllipse = (x, y, cx, cy, rx, ry, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, rx, ry); };
const scatter = (n, seed, f) => { const out = []; for (let k = 0; k < n; k++) { const p = f(h2(seed, k, 1), h2(seed, k, 2), h2(seed, k, 3)); if (p) out.push(p); } return out; };

const ITEM_DESIGNS = {
  apple: () => [
    { d: P => Math.max(Math.min(sdCircle(P.x, P.y, 50, 74, 33), sdCircle(P.x, P.y, 78, 74, 33), sdCircle(P.x, P.y, 64, 88, 32)), -sdCircle(P.x, P.y, 64, 38, 8)),
      mat: FOODM.appleSkin, profile: 'round', bw: 30, z: 1, paint: P => mix(FOODM.appleSkin.base, [1, 0.78, 0.25], sstep(0.58, 0.8, ifbm(P.x * 0.1, P.y * 0.035, 7)) * 0.55) },
    { d: P => sdSeg(P.x, P.y, 63, 44, 68, 20, 3), mat: FOODM.stem, profile: 'round', bw: 3, z: 6 },
    { d: P => rotEllipse(P.x, P.y, 84, 26, 15, 6.5, -0.45), mat: FOODM.leaf, profile: 'round', bw: 5, z: 7,
      deco: P => (Math.abs(rotEllipse(P.x, P.y, 84, 26, 15, 0.01, -0.45)) < 0.7 ? { dh: -0.8, dark: 0.3 } : null) },
  ],
  bread: () => [
    { d: P => sdSeg(P.u, P.v, -40, 0, 40, 0, 24), mat: FOODM.crust, profile: 'round', bw: 20, z: 1,
      paint: P => mix(FOODM.crust.base, [0.55, 0.28, 0.08], sstep(-10, 20, -P.v) * 0.45) },
    ...[-22, 0, 22].map(k => ({ d: P => sdSeg(P.u, P.v, k - 6, -14, k + 6, 14, 2.6), mat: FOODM.crumb, profile: 'bevel', bw: 1.5, z: 14 })),
  ],
  steak: () => {
    const outer = [[28, 40], [60, 24], [98, 32], [110, 62], [100, 98], [64, 110], [30, 100], [18, 70]];
    const inner = outer.map(([x, y]) => [64 + (x - 64) * 0.86, 66 + (y - 66) * 0.86]);
    return [
      { d: P => sdPoly(P.x, P.y, outer), mat: FOODM.fat, profile: 'bevel', bw: 4, z: 1 },
      { d: P => sdPoly(P.x, P.y, inner), mat: FOODM.meat, profile: 'bevel', bw: 6, z: 3,
        deco: P => ((((P.x + P.y) % 22) + 22) % 22 < 3.5 ? { dh: -1, dark: 0.6 } : null) },
      { d: P => Math.min(sdSeg(P.x, P.y, 50, 54, 74, 78, 4), sdCircle(P.x, P.y, 47, 51, 6), sdCircle(P.x, P.y, 77, 81, 6)), mat: FOODM.bone, profile: 'round', bw: 5, z: 9 },
    ];
  },
  carrot: () => [
    { d: P => sdPoly(P.u, P.v, [[-64, 0], [26, -14], [38, -11], [40, 0], [38, 11], [26, 14]]), mat: FOODM.carrot, profile: 'ridge', bw: 14, z: 1,
      deco: P => (Math.sin(P.u * 0.8) > 0.88 ? { dh: -0.8, dark: 0.25 } : null) },
    ...[[66, -14], [72, 2], [62, 16]].map(([u, v]) => ({ d: P => sdSeg(P.u, P.v, 38, 0, u, v, 4.8), mat: FOODM.leaf, profile: 'round', bw: 4.8, z: 3 })),
  ],
  cookie: () => {
    const chips = [[44, 46], [78, 40], [60, 68], [90, 72], [40, 82], [70, 96], [54, 50]];
    return [
      { d: P => sdCircle(P.x, P.y, 64, 66, 48) + (ifbm(P.x * 0.2, P.y * 0.2, 5) - 0.5) * 4, mat: FOODM.cookie, profile: 'bevel', bw: 9, z: 1 },
      { d: P => Math.min(...chips.map(([x, y], k) => sdCircle(P.x, P.y, x, y, 5 + (k % 3)))), mat: FOODM.choc, profile: 'round', bw: 4, z: 8 },
    ];
  },
  bone: () => [
    { d: P => Math.min(sdSeg(P.u, P.v, -44, 0, 44, 0, 7), sdCircle(P.u, P.v, -50, -7, 9.5), sdCircle(P.u, P.v, -50, 7, 9.5), sdCircle(P.u, P.v, 50, -7, 9.5), sdCircle(P.u, P.v, 50, 7, 9.5)),
      mat: FOODM.bone, profile: 'round', bw: 8, z: 1 },
  ],
  ender_pearl: () => [
    { d: P => sdCircle(P.x, P.y, 64, 64, 42), mat: FOODM.pearl, profile: 'round', bw: 42, z: 1,
      paint: P => { const a = Math.atan2(P.y - 64, P.x - 64), r = Math.hypot(P.x - 64, P.y - 64), t = Math.sin(a * 2 + r * 0.14 + ifbm(P.x * 0.05, P.y * 0.05, 3) * 4);
        return r < 13 ? [0.02, 0.18, 0.16] : mix([0.04, 0.32, 0.28], [0.2, 0.86, 0.72], sstep(-0.2, 0.8, t)); } },
  ],
  slimeball: () => [
    { d: P => Math.min(sdCircle(P.x, P.y, 64, 68, 38), sdCircle(P.x, P.y, 40, 50, 14), sdCircle(P.x, P.y, 88, 84, 12)), mat: FOODM.slime, profile: 'round', bw: 30, z: 1,
      paint: P => (Math.hypot(P.x - 60, P.y - 70) < 16 ? [0.28, 0.6, 0.22] : FOODM.slime.base) },
  ],
  blaze_rod: () => [
    { d: P => sdSeg(P.u, P.v, -64, 0, 64, 0, 7.5), mat: FOODM.blaze, profile: 'round', bw: 7.5, z: 1, axis: 'u',
      deco: P => (Math.sin(P.u * 0.55) > 0.7 ? { dh: -1.2, dark: 0.4 } : null) },
  ],
  gunpowder: () => {
    const grains = scatter(140, 99, (a, b, c) => { const x = 20 + a * 88, y = 46 + b * 66; return sdEllipse(x, y, 64, 94, 44, 32) < 0 && y > 94 - (44 - Math.abs(x - 64)) * 0.95 ? [x, y, 5.5 + c * 3] : null; });
    return [{ d: P => Math.min(...grains.map(([x, y, r]) => sdCircle(P.x, P.y, x, y, r))), mat: FOODM.powder, profile: 'round', bw: 4, z: 1 }];
  },
};
const ITEM_SAMPLES = {
  food: [['apple', 'apple'], ['bread', 'bread'], ['beef_cooked', 'steak'], ['carrot', 'carrot'], ['cookie', 'cookie']],
  mob_drops: [['bone', 'bone'], ['ender_pearl', 'ender_pearl'], ['slimeball', 'slimeball'], ['blaze_rod', 'blaze_rod'], ['gunpowder', 'gunpowder']],
};
const ITEM_STYLE = { A: 'modern', B: 'realistic', C: 'bold' };

// ---------------------------------------------------------------- comparison sheets
const GLYPH = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
};
function texToRGBA(t) {
  const out = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { for (let k = 0; k < 3; k++) out[i * 4 + k] = Math.round(clamp(t.c[i * 3 + k]) * 255); out[i * 4 + 3] = Math.round(clamp(t.a[i]) * 255); }
  return out;
}
function sheet(file, rows) { // rows: [{ key, tiles: [rgba…] }]
  const LBL = 56, GAP = 6, cols = rows[0].tiles.length, W = LBL + cols * (N + GAP), H = rows.length * (N + GAP) + GAP, px = new Uint8Array(W * H * 3).fill(28);
  rows.forEach(({ key, tiles }, r) => {
    const oy = GAP + r * (N + GAP);
    GLYPH[key].forEach((line, gy) => [...line].forEach((ch, gx) => {
      if (ch !== '#') return;
      for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const d = ((oy + 43 + gy * 6 + y) * W + 13 + gx * 6 + x) * 3; px[d] = px[d + 1] = px[d + 2] = 235; }
    }));
    tiles.forEach((rgba, c) => {
      const ox = LBL + c * (N + GAP);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const s = (y * N + x) * 4, a = rgba[s + 3] / 255, bg = ((x >> 3) + (y >> 3)) & 1 ? 62 : 50, d = ((oy + y) * W + ox + x) * 3;
        for (let k = 0; k < 3; k++) px[d + k] = Math.round(rgba[s + k] * a + bg * (1 - a));
      }
    });
  });
  fs.writeFileSync(file, pngBuf(W, H, 3, px));
}

const samplesDir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
if (samplesDir) {
  fs.mkdirSync(samplesDir, { recursive: true });
  for (const [fam, list] of Object.entries(BLOCK_SAMPLES)) {
    sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => ({ key, tiles: list.map(([name, fn], k) => texToRGBA(fn(key, 4000 + k * 31).bake(STYLE[key].light))) })));
  }
  for (const [fam, list] of Object.entries(ITEM_SAMPLES)) {
    sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => ({ key, tiles: list.map(([name, design], k) => it.render(name, ITEM_DESIGNS[design](), 500 + k * 7, { style: ITEM_STYLE[key], write: false })) })));
  }
  console.log('Wrote comparison sheets to', samplesDir);
}
// ---------------------------------------------------------------- full item families
const GEM = (base, dark, light, emis = 0) => mk({ kind: 'gem', base, dark, light, metal: 0, rough: 0.05, emis });
Object.assign(FOODM, {
  beefRaw: ORG('#c8323a', '#480a10', '#ffd8d0', { gloss: 30, spec: 0.45, mottle: 0.2 }),
  porkRaw: ORG('#f09a9a', '#7a3434', '#fff4f0', { gloss: 26, spec: 0.4 }),
  porkCooked: ORG('#b8703a', '#4a2008', '#ffd8a8', { gloss: 22, spec: 0.35, mottle: 0.3 }),
  chickenRaw: ORG('#f4c4a8', '#8a5a44', '#fffaf4', { gloss: 18, spec: 0.3, mottle: 0.25 }),
  chickenCooked: ORG('#c88232', '#4e2204', '#ffe0a0', { gloss: 24, spec: 0.45, mottle: 0.3 }),
  muttonRaw: ORG('#c8423e', '#4a0e0c', '#ffd8d0', { gloss: 26, spec: 0.4 }),
  muttonCooked: ORG('#8a4a2a', '#2e1206', '#e8b080', { gloss: 22, spec: 0.35, mottle: 0.3 }),
  rabbitRaw: ORG('#e8a090', '#7a3e34', '#fff4f0', { gloss: 22, spec: 0.35 }),
  rabbitCooked: ORG('#b0672e', '#40200a', '#ffd8a0', { gloss: 22, spec: 0.35 }),
  cod: ORG('#a89878', '#3e3424', '#ffffff', { gloss: 30, spec: 0.5, mottle: 0.25 }),
  fishCooked: ORG('#c89a5a', '#4a2e10', '#fff0d0', { gloss: 20, spec: 0.35, mottle: 0.3 }),
  salmon: ORG('#e0603a', '#5a1a0a', '#fff0e0', { gloss: 30, spec: 0.5 }),
  salmonCooked: ORG('#c8743c', '#4a220a', '#ffe0b8', { gloss: 22, spec: 0.35 }),
  clown: ORG('#f07818', '#5a2400', '#fff0e0', { gloss: 40, spec: 0.6 }),
  puffer: ORG('#f0c830', '#6a4a00', '#fffbe0', { gloss: 30, spec: 0.5 }),
  eyeBlack: ORG('#101010', '#000000', '#ffffff', { gloss: 60, spec: 1 }),
  bowl: ORG('#8a5a2c', '#2e1a08', '#e0b080', { gloss: 14, spec: 0.2, mottle: 0.3 }),
  stew: ORG('#9a6a40', '#3a220e', '#f0d0a0', { gloss: 40, spec: 0.6 }),
  potato: ORG('#d8b06a', '#5e4216', '#fff4d0', { gloss: 12, spec: 0.2, mottle: 0.35 }),
  potatoBaked: ORG('#e0a040', '#5a3008', '#fff0c0', { gloss: 18, spec: 0.3, mottle: 0.3 }),
  potatoBad: ORG('#b8c070', '#3e4a10', '#f4ffd0', { gloss: 12, spec: 0.2, mottle: 0.45 }),
  melonRind: ORG('#3a8a2a', '#0e3008', '#d8ffc0', { gloss: 22, spec: 0.35 }),
  melonFlesh: ORG('#e8384a', '#6a0a14', '#fff0f0', { gloss: 30, spec: 0.4, mottle: 0.2 }),
  berry: ORG('#c8203a', '#4a0410', '#fff0f4', { gloss: 60, spec: 0.9 }),
  glowBerry: ORG('#ffb030', '#7a3a00', '#fffbe0', { gloss: 50, spec: 0.8, emis: 0.8 }),
  beet: ORG('#8a1838', '#2a0410', '#ffd0e0', { gloss: 30, spec: 0.45 }),
  chorus: ORG('#8a5aa0', '#2e1440', '#f4e0ff', { gloss: 20, spec: 0.3, mottle: 0.35 }),
  chorusPop: ORG('#c8a8d8', '#5a3a6a', '#ffffff', { gloss: 14, spec: 0.25, mottle: 0.3 }),
  kelp: ORG('#3a4a20', '#10160a', '#b0c080', { gloss: 16, spec: 0.25, mottle: 0.35 }),
  glass: ORG('#d6eef4', '#5a7a88', '#ffffff', { gloss: 90, spec: 1.2, mottle: 0.05 }),
  honey: ORG('#f0a020', '#6a3a00', '#fff4c0', { gloss: 60, spec: 0.9 }),
  cork: ORG('#a87a4a', '#3e2810', '#f0d0a0', { gloss: 8, spec: 0.1, mottle: 0.4 }),
  frosting: ORG('#f4f0ec', '#a09890', '#ffffff', { gloss: 30, spec: 0.4 }),
  sponge: ORG('#e0b070', '#6a4818', '#fff4d8', { gloss: 10, spec: 0.15, mottle: 0.4 }),
  cherry: ORG('#d0182a', '#4a0008', '#fff0f0', { gloss: 70, spec: 1 }),
  pieCrust: ORG('#d89a50', '#5a3410', '#fff0c8', { gloss: 14, spec: 0.2, mottle: 0.3 }),
  pieFill: ORG('#e8781a', '#6a2a00', '#ffe0b0', { gloss: 40, spec: 0.5 }),
  string: ORG('#f0f0f0', '#7a7a80', '#ffffff', { gloss: 12, spec: 0.2 }),
  flesh: ORG('#8a5a3a', '#2a1406', '#e0b090', { gloss: 26, spec: 0.35, mottle: 0.45 }),
  blazePowder: ORG('#ffb020', '#7a3000', '#fff6c8', { gloss: 14, spec: 0.25, mottle: 0.4, grain: 1.5, emis: 0.6 }),
  spiderEye: ORG('#b01a28', '#3a0408', '#ffe0e4', { gloss: 70, spec: 1 }),
  fermented: ORG('#7a2e4a', '#24081a', '#ffd8f0', { gloss: 30, spec: 0.5, mottle: 0.4 }),
  feather: ORG('#f2f2f2', '#8a8a92', '#ffffff', { gloss: 10, spec: 0.15 }),
  leather: ORG('#9a5a2a', '#36180a', '#e8b080', { gloss: 16, spec: 0.25, mottle: 0.4 }),
  hide: ORG('#b8906a', '#4a3420', '#f4e0c8', { gloss: 8, spec: 0.1, mottle: 0.55, grain: 1.2 }),
  tear: ORG('#d8f0f4', '#6a8a98', '#ffffff', { gloss: 90, spec: 1.2 }),
  magma: ORG('#e8501a', '#3a0a00', '#fff0b0', { gloss: 40, spec: 0.6, emis: 0.5 }),
  membrane: ORG('#b8c0d8', '#4a5068', '#ffffff', { gloss: 30, spec: 0.4, mottle: 0.25 }),
  shell: ORG('#8a5a9a', '#2a1238', '#f0d8ff', { gloss: 30, spec: 0.45 }),
  eggShell: ORG('#f0e0c0', '#8a7454', '#ffffff', { gloss: 26, spec: 0.35, mottle: 0.15 }),
  comb: ORG('#f0b020', '#6a3a00', '#fff4c0', { gloss: 50, spec: 0.7 }),
  scute: ORG('#c08070', '#4a2a22', '#fff0e8', { gloss: 24, spec: 0.35, mottle: 0.3 }),
  breeze: ORG('#a8b8e8', '#3a4478', '#ffffff', { gloss: 40, spec: 0.6, emis: 0.2 }),
  nautilus: ORG('#e8d8c0', '#6a5440', '#ffffff', { gloss: 40, spec: 0.6 }),
  wind: ORG('#c8d8f8', '#4a5a88', '#ffffff', { gloss: 40, spec: 0.5, emis: 0.15 }),
  crystal: GEM('#bfe8dc', '#2e6a5c', '#ffffff', 0.35),
  shard: GEM('#5aa898', '#123e36', '#e8fff8', 0.05),
  star: GEM('#f4f6ff', '#8a90b0', '#ffffff', 0.6),
  echo: Object.assign(GEM('#0e4a5a', '#02141a', '#9ff8ff', 0.2), { glow: [0.3, 0.95, 1] }),
});
const M = FOODM;
const toXY = (u, v) => [64 + (u + v) / Math.SQRT2, 64 + (v - u) / Math.SQRT2];
const polyline = (x, y, pts, r) => Math.min(...pts.slice(1).map((p, k) => sdSeg(x, y, pts[k][0], pts[k][1], p[0], p[1], r)));
const sdHex = (x, y, cx, cy, r) => { const dx = Math.abs(x - cx), dy = Math.abs(y - cy); return Math.max(dx * 0.866 + dy * 0.5, dy) - r; };
const star = (cx, cy, n, R, r, rot = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, k) => { const a = rot + k * Math.PI / n, q = k % 2 ? r : R; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; });
const ball = (cx, cy, r, mat, extra = {}) => ({ d: P => sdCircle(P.x, P.y, cx, cy, r), mat, profile: 'round', bw: r, z: 1, ...extra });
const marble = (raw, fatC) => P => mix(raw.base, fatC, sstep(0.6, 0.72, ifbm(P.x * 0.16, P.y * 0.16, 11)) * 0.55);
const grill = P => ((((P.x + P.y) % 22) + 22) % 22 < 3.5 ? { dh: -1, dark: 0.6 } : null);

function steakLike(meat, cooked, bone = true) {
  const outer = [[28, 40], [60, 24], [98, 32], [110, 62], [100, 98], [64, 110], [30, 100], [18, 70]];
  const inner = outer.map(([x, y]) => [64 + (x - 64) * 0.86, 66 + (y - 66) * 0.86]);
  return [
    { d: P => sdPoly(P.x, P.y, outer), mat: M.fat, profile: 'bevel', bw: 4, z: 1 },
    { d: P => sdPoly(P.x, P.y, inner), mat: meat, profile: 'bevel', bw: 6, z: 3, deco: cooked ? grill : null, paint: cooked ? null : marble(meat, [0.95, 0.85, 0.8]) },
    ...(bone ? [{ d: P => Math.min(sdSeg(P.x, P.y, 50, 54, 74, 78, 4), sdCircle(P.x, P.y, 47, 51, 6), sdCircle(P.x, P.y, 77, 81, 6)), mat: M.bone, profile: 'round', bw: 5, z: 9 }] : []),
  ];
}
function porkchop(meat, cooked) {
  const outer = [[22, 54], [50, 26], [92, 22], [114, 50], [106, 90], [70, 110], [32, 102], [16, 78]];
  const inner = outer.map(([x, y]) => [64 + (x - 64) * 0.78, 66 + (y - 66) * 0.78]);
  return [
    { d: P => sdPoly(P.x, P.y, outer), mat: M.fat, profile: 'bevel', bw: 5, z: 1 },
    { d: P => sdPoly(P.x, P.y, inner), mat: meat, profile: 'bevel', bw: 7, z: 4, deco: cooked ? grill : null },
  ];
}
function chop(meat, cooked) { // mutton: round chop on a bone handle
  return [
    { d: P => Math.min(sdSeg(P.x, P.y, 78, 50, 108, 20, 5.5), sdCircle(P.x, P.y, 110, 16, 7), sdCircle(P.x, P.y, 104, 14, 6)), mat: M.bone, profile: 'round', bw: 5, z: 1 },
    { d: P => sdEllipse(P.x, P.y, 54, 74, 40, 34), mat: M.fat, profile: 'round', bw: 18, z: 2 },
    { d: P => sdEllipse(P.x, P.y, 52, 76, 33, 27), mat: meat, profile: 'round', bw: 16, z: 4, deco: cooked ? grill : null, paint: cooked ? null : marble(meat, [0.95, 0.85, 0.8]) },
  ];
}
function drumstick(meat, scale = 1) { // chicken / rabbit leg along the diagonal
  const s = scale;
  return [
    { d: P => Math.min(sdSeg(P.u, P.v, 10 * s, 0, 52 * s, 0, 5 * s), sdCircle(P.u, P.v, 56 * s, -5 * s, 7 * s), sdCircle(P.u, P.v, 56 * s, 5 * s, 7 * s)), mat: M.bone, profile: 'round', bw: 5 * s, z: 1 },
    { d: P => sdEllipse(P.u, P.v, -16 * s, 0, 40 * s, 28 * s), mat: meat, profile: 'round', bw: 22 * s, z: 2 },
  ];
}
function fish(mat, o = {}) {
  return [
    { d: P => sdPoly(P.x, P.y, [[90, 64], [118, 38], [110, 64], [118, 90]]), mat, profile: 'bevel', bw: 3, z: 1 },
    { d: P => sdPoly(P.x, P.y, [[44, 46], [62, 28], [76, 46]]), mat, profile: 'bevel', bw: 3, z: 1 },
    { d: P => sdEllipse(P.x, P.y, 56, 66, 44, 24), mat, profile: 'round', bw: 20, z: 2, deco: o.deco || (P => (Math.abs(P.x - 36 + Math.abs(P.y - 66) * 0.3) < 0.8 ? { dh: -1, dark: 0.4 } : null)), paint: o.paint },
    ...(o.eye === false ? [] : [ball(28, 60, 4.5, M.eyeBlack, { z: 30 })]),
  ];
}
function bowl(fill, extras = []) {
  return [
    { d: P => Math.min(Math.max(sdEllipse(P.x, P.y, 64, 64, 50, 46), 64 - P.y), sdEllipse(P.x, P.y, 64, 64, 50, 12)), mat: M.bowl, profile: 'bevel', bw: 5, z: 1, form: P => (P.y > 64 ? Math.sqrt(Math.max(0, 1 - ((P.x - 64) / 50) ** 2)) * 6 : 0) },
    { d: P => sdEllipse(P.x, P.y, 64, 63, 42, 8.5), mat: fill, profile: 'bevel', bw: 3, z: 9 },
    ...extras,
  ];
}
function potato(mat, extra = []) {
  return [
    { d: P => { const c = Math.cos(0.6), s = Math.sin(0.6), dx = P.x - 64, dy = P.y - 66; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, 44, 28) + (ifbm(P.x * 0.12, P.y * 0.12, 4) - 0.5) * 8; },
      mat, profile: 'round', bw: 22, z: 1, deco: P => ([[48, 58], [74, 50], [80, 80], [52, 84]].some(([x, y]) => Math.hypot(P.x - x, P.y - y) < 2.4) ? { dh: -1, dark: 0.55 } : null) },
    ...extra,
  ];
}
const apple = mat => {
  const parts = ITEM_DESIGNS.apple();
  if (mat) { parts[0] = { ...parts[0], mat, paint: null }; parts[2] = { ...parts[2], mat }; }
  return parts;
};
const carrot = mat => { const parts = ITEM_DESIGNS.carrot(); return mat ? parts.map(p => ({ ...p, mat })) : parts; };
function melon(gold) {
  const seeds = [[40, 62], [58, 74], [78, 72], [92, 60], [64, 88]];
  return [
    { d: P => Math.max(sdCircle(P.x, P.y, 64, 40, 58), 40 - P.y), mat: M.melonRind, profile: 'bevel', bw: 4, z: 1 },
    { d: P => Math.max(sdCircle(P.x, P.y, 64, 40, 48), 44 - P.y), mat: M.melonFlesh, profile: 'bevel', bw: 4, z: 3 },
    { d: P => Math.min(...seeds.map(([x, y]) => sdEllipse(P.x, P.y, x, y, 2.6, 4))), mat: M.eyeBlack, profile: 'round', bw: 2, z: 8 },
    ...(gold ? [{ d: P => Math.min(...[[50, 54], [70, 60], [86, 74], [56, 90], [34, 72], [76, 88]].map(([x, y]) => sdCircle(P.x, P.y, x, y, 3.2))), mat: 'gold', profile: 'round', bw: 3, z: 9 }] : []),
  ];
}
function berries(mat) {
  const pts = [[44, 70], [70, 62], [58, 90], [86, 86], [34, 96]];
  return [
    { d: P => polyline(P.x, P.y, [[60, 18], [62, 40], [44, 70]], 2.2), mat: M.stem, profile: 'round', bw: 2, z: 1 },
    { d: P => polyline(P.x, P.y, [[62, 40], [72, 62]], 2), mat: M.stem, profile: 'round', bw: 2, z: 1 },
    ...pts.map(([x, y]) => ball(x, y, 14, mat, { z: 3 })),
    { d: P => Math.min(rotEllipse(P.x, P.y, 46, 28, 15, 6, 0.5), rotEllipse(P.x, P.y, 76, 30, 15, 6, -0.5)), mat: M.leaf, profile: 'round', bw: 5, z: 5 },
  ];
}
function cluster(mat, pts) { return pts.map(([x, y, r]) => ball(x, y, r, mat, { z: r / 4 })); }
function pile(mat, seed) {
  const grains = scatter(140, seed, (a, b, c) => { const x = 20 + a * 88, y = 46 + b * 66; return sdEllipse(x, y, 64, 94, 44, 32) < 0 && y > 94 - (44 - Math.abs(x - 64)) * 0.95 ? [x, y, 5.5 + c * 3] : null; });
  return [{ d: P => Math.min(...grains.map(([x, y, r]) => sdCircle(P.x, P.y, x, y, r))), mat, profile: 'round', bw: 4, z: 1 }];
}

Object.assign(ITEM_DESIGNS, {
  // ---- food
  apple_golden: () => apple('gold'),
  carrot_golden: () => carrot('gold'),
  beef_raw: () => steakLike(M.beefRaw, false),
  beef_cooked: () => steakLike(M.meat, true),
  porkchop_raw: () => porkchop(M.porkRaw, false),
  porkchop_cooked: () => porkchop(M.porkCooked, true),
  mutton_raw: () => chop(M.muttonRaw, false),
  mutton_cooked: () => chop(M.muttonCooked, true),
  chicken_raw: () => drumstick(M.chickenRaw),
  chicken_cooked: () => drumstick(M.chickenCooked),
  rabbit_raw: () => drumstick(M.rabbitRaw, 0.8),
  rabbit_cooked: () => drumstick(M.rabbitCooked, 0.8),
  fish_raw: () => fish(M.cod),
  fish_cooked: () => fish(M.fishCooked, { deco: grill }),
  fish_salmon_raw: () => fish(M.salmon, { paint: P => mix([0.9, 0.36, 0.22], [1, 0.82, 0.7], sstep(60, 84, P.y)) }),
  fish_salmon_cooked: () => fish(M.salmonCooked, { deco: grill }),
  fish_clownfish_raw: () => fish(M.clown, { paint: P => (Math.abs(P.x - 42) < 5 || Math.abs(P.x - 72) < 5 ? [0.98, 0.98, 0.98] : Math.abs(P.x - 42) < 6.5 || Math.abs(P.x - 72) < 6.5 ? [0.08, 0.08, 0.08] : M.clown.base) }),
  fish_pufferfish_raw: () => [
    { d: P => sdPoly(P.x, P.y, star(64, 66, 12, 50, 36, 0.13)), mat: M.puffer, profile: 'bevel', bw: 4, z: 1 },
    ball(64, 66, 38, M.puffer, { z: 2, paint: P => (h2(3, P.x / 9 | 0, P.y / 9 | 0) < 0.25 && Math.hypot((P.x % 9) - 4.5, (P.y % 9) - 4.5) < 2.4 ? [0.5, 0.35, 0.1] : M.puffer.base) }),
    ball(46, 56, 5, M.eyeBlack, { z: 40 }), ball(80, 56, 5, M.eyeBlack, { z: 40 }),
  ],
  mushroom_stew: () => bowl(M.stew),
  beetroot_soup: () => bowl(ORG('#a01828', '#3a0408', '#ffd0d8', { gloss: 50, spec: 0.7 })),
  rabbit_stew: () => bowl(M.stew, [[50, 60, 5, M.carrot], [72, 64, 5, M.potatoBaked], [62, 58, 4, M.rabbitCooked], [80, 59, 4, M.carrot]].map(([x, y, r, m]) => ball(x, y, r, m, { z: 14 }))),
  suspicious_stew: () => bowl(M.stew, [[52, 62, 3.5, M.berry], [74, 60, 3.5, ORG('#4a6ad8', '#101a4a', '#ffffff')], [64, 66, 3.5, ORG('#f0e040', '#5a4a00', '#ffffff')]].map(([x, y, r, m]) => ball(x, y, r, m, { z: 14 }))),
  potato: () => potato(M.potato),
  potato_baked: () => potato(M.potatoBaked, [{ d: P => sdSeg(P.x, P.y, 44, 58, 84, 74, 3), mat: M.crumb, profile: 'bevel', bw: 2, z: 30 }]),
  potato_poisonous: () => potato(M.potatoBad),
  melon: () => melon(false),
  melon_speckled: () => melon(true),
  sweet_berries: () => berries(M.berry),
  glow_berries: () => berries(M.glowBerry),
  beetroot: () => [
    { d: P => Math.min(...[[50, 8], [62, 4], [76, 10]].map(([x, y]) => sdSeg(P.x, P.y, 62, 44, x, y, 4))), mat: M.leaf, profile: 'round', bw: 4, z: 1 },
    { d: P => Math.min(sdCircle(P.x, P.y, 62, 74, 32), sdSeg(P.x, P.y, 62, 90, 52, 122, 3)), mat: M.beet, profile: 'round', bw: 26, z: 3 },
  ],
  chorus_fruit: () => cluster(M.chorus, [[64, 70, 34], [40, 52, 18], [88, 50, 17], [46, 96, 15], [86, 94, 16], [64, 36, 14]]),
  chorus_fruit_popped: () => cluster(M.chorusPop, [[64, 68, 36], [38, 48, 20], [90, 48, 19], [44, 98, 17], [88, 96, 18], [64, 30, 16]]),
  dried_kelp: () => [{ d: P => sdBox(P.u, P.v, 0, 0, 56, 16, 8), mat: M.kelp, profile: 'round', bw: 12, z: 1, axis: 'u', deco: P => (Math.sin(P.u * 0.35) > 0.85 ? { dh: -1.2, dark: 0.45 } : null) }],
  honey_bottle: () => [
    { d: P => Math.min(sdCircle(P.x, P.y, 64, 80, 36), sdBox(P.x, P.y, 64, 38, 11, 16, 3)), mat: M.glass, profile: 'round', bw: 30, z: 1 },
    { d: P => Math.max(sdCircle(P.x, P.y, 64, 82, 31), 60 - P.y), mat: M.honey, profile: 'round', bw: 26, z: 3 },
    { d: P => sdBox(P.x, P.y, 64, 20, 13, 7, 2), mat: M.cork, profile: 'bevel', bw: 2.5, z: 8 },
  ],
  cake: () => [
    { d: P => sdBox(P.x, P.y, 64, 80, 46, 26, 4), mat: M.sponge, profile: 'bevel', bw: 4, z: 1, deco: P => (Math.abs(P.y - 84) < 2 ? { dh: -1, dark: 0.3 } : null) },
    { d: P => Math.min(sdBox(P.x, P.y, 64, 56, 48, 9, 6), ...[34, 58, 86].map(x => sdEllipse(P.x, P.y, x, 66, 7, 9))), mat: M.frosting, profile: 'round', bw: 7, z: 4 },
    ...[[38, 44], [64, 42], [90, 44]].map(([x, y]) => ball(x, y, 7, M.cherry, { z: 10 })),
  ],
  pumpkin_pie: () => [
    { d: P => sdCircle(P.x, P.y, 64, 66, 50) + Math.sin(Math.atan2(P.y - 66, P.x - 64) * 22) * 1.6, mat: M.pieCrust, profile: 'bevel', bw: 6, z: 1 },
    { d: P => sdCircle(P.x, P.y, 64, 66, 38), mat: M.pieFill, profile: 'bevel', bw: 4, z: 6 },
  ],
  // ---- mob drops
  string: () => { const pts = Array.from({ length: 41 }, (_, k) => { const u = -60 + k * 3; return toXY(u, Math.sin(u * 0.12) * 12); }); return [{ d: P => polyline(P.x, P.y, pts, 2.8), mat: M.string, profile: 'round', bw: 2.8, z: 1 }]; },
  rotten_flesh: () => [{ d: P => sdPoly(P.x, P.y, [[24, 44], [46, 22], [80, 30], [106, 22], [112, 56], [98, 86], [104, 108], [64, 104], [30, 110], [18, 80]]), mat: M.flesh, profile: 'bevel', bw: 7, z: 1,
    paint: P => { const n = ifbm(P.x * 0.08, P.y * 0.08, 21); return n > 0.58 ? mix(M.flesh.base, [0.42, 0.55, 0.22], 0.75) : n < 0.36 ? mul(M.flesh.base, 0.55) : M.flesh.base; } }],
  blaze_powder: () => pile(M.blazePowder, 77),
  ender_eye: () => [ball(64, 64, 42, M.pearl, { paint: P => {
    const dx = P.x - 64, dy = P.y - 64, r = Math.hypot(dx, dy);
    if (Math.abs(dx) < 4.5 * (1 - (dy / 18) ** 2) && Math.abs(dy) < 18) return [0.02, 0.03, 0.02];
    if (r < 26) return mix([0.45, 0.75, 0.15], [0.9, 0.95, 0.4], sstep(-0.5, 1, Math.sin(Math.atan2(dy, dx) * 14)) * 0.6);
    return mix([0.04, 0.3, 0.26], [0.16, 0.7, 0.6], sstep(26, 40, r)); } })],
  spider_eye: () => [ball(64, 66, 38, M.spiderEye, { paint: P => (Math.hypot(P.x - 64, P.y - 66) < 9 ? [0.05, 0.02, 0.02] : h2(5, P.x / 7 | 0, P.y / 7 | 0) < 0.12 ? [0.35, 0.03, 0.06] : M.spiderEye.base) })],
  spider_eye_fermented: () => [
    ball(64, 70, 36, M.fermented, { paint: P => (h2(6, P.x / 6 | 0, P.y / 6 | 0) < 0.1 ? [0.97, 0.95, 0.95] : M.fermented.base) }),
    { d: P => Math.max(sdEllipse(P.x, P.y, 64, 36, 30, 18), P.y - 38), mat: ORG('#8a5a3a', '#2a1406', '#e8c8a8'), profile: 'round', bw: 10, z: 30 },
  ],
  feather: () => [
    { d: P => Math.max(sdEllipse(P.u, P.v, 6, 0, 56, 17), -P.u - 46), mat: M.feather, profile: 'round', bw: 10, z: 1, axis: 'u', deco: P => (Math.sin((P.u - Math.abs(P.v) * 1.3) * 0.9) > 0.82 ? { dh: -0.6, dark: 0.12 } : null) },
    { d: P => sdSeg(P.u, P.v, -64, 0, 60, 0, 1.8), mat: ORG('#d8d0c0', '#6a6050', '#ffffff'), profile: 'round', bw: 1.8, z: 20 },
  ],
  leather: () => [{ d: P => sdPoly(P.x, P.y, [[26, 30], [50, 18], [78, 24], [104, 20], [112, 50], [100, 80], [108, 104], [76, 112], [48, 104], [20, 108], [16, 78], [28, 56]]), mat: M.leather, profile: 'bevel', bw: 6, z: 1,
    deco: P => (sdPoly(P.x, P.y, [[26, 30], [50, 18], [78, 24], [104, 20], [112, 50], [100, 80], [108, 104], [76, 112], [48, 104], [20, 108], [16, 78], [28, 56]]) > -8 && sdPoly(P.x, P.y, [[26, 30], [50, 18], [78, 24], [104, 20], [112, 50], [100, 80], [108, 104], [76, 112], [48, 104], [20, 108], [16, 78], [28, 56]]) < -6.5 && Math.sin((P.x + P.y) * 0.8) > 0.3 ? { dh: -0.6, dark: 0.4 } : null) }],
  rabbit_hide: () => [{ d: P => sdPoly(P.x, P.y, [[30, 36], [56, 26], [84, 32], [102, 46], [96, 76], [100, 98], [70, 102], [42, 100], [24, 84], [32, 60]]), mat: M.hide, profile: 'bevel', bw: 6, z: 1 }],
  rabbit_foot: () => [
    { d: P => Math.min(sdEllipse(P.u, P.v, -14, 0, 36, 16), sdSeg(P.u, P.v, -50, 0, -30, 0, 8)), mat: M.hide, profile: 'round', bw: 12, z: 1 },
    { d: P => Math.min(...[-9, 0, 9].map(v => sdCircle(P.u, P.v, 24, v, 6))), mat: ORG('#d8b898', '#5a4430', '#ffffff'), profile: 'round', bw: 5, z: 6 },
  ],
  ghast_tear: () => [{ d: P => Math.min(sdCircle(P.x, P.y, 64, 80, 28), sdPoly(P.x, P.y, [[64, 22], [88, 72], [40, 72]])), mat: M.tear, profile: 'round', bw: 26, z: 1 }],
  magma_cream: () => [ball(64, 66, 38, M.magma, { paint: P => { const w = it.cell(P.x, P.y, 14, 9); return w.edge < 1.6 ? [0.12, 0.03, 0.02] : mix(M.magma.base, [1, 0.85, 0.3], sstep(0.4, 0.9, ifbm(P.x * 0.1, P.y * 0.1, 3))); } })],
  phantom_membrane: () => [{ d: P => Math.max(sdPoly(P.x, P.y, [[16, 40], [64, 22], [112, 40], [104, 92], [64, 108], [24, 92]]), -Math.min(...[34, 64, 94].map(x => sdCircle(P.x, P.y, x, 116, 14)))),
    mat: M.membrane, profile: 'bevel', bw: 5, z: 1, deco: P => ([34, 64, 94].some(x => Math.abs(P.x - x - (P.y - 30) * (x - 64) / 120) < 0.9) ? { dh: 0.8, dark: 0.2 } : null) }],
  prismarine_crystals: () => [[50, 70, 16], [76, 58, 14], [70, 88, 12], [40, 44, 10], [92, 84, 10]].map(([x, y, r], k) => ({ d: P => sdPoly(P.x, P.y, [[x, y - r * 1.3], [x + r * 0.7, y], [x, y + r * 1.3], [x - r * 0.7, y]]), mat: M.crystal, profile: 'ridge', bw: r * 0.6, z: 1 + k })),
  prismarine_shard: () => [{ d: P => sdPoly(P.x, P.y, [[30, 98], [44, 50], [76, 22], [104, 30], [96, 66], [62, 104]]), mat: M.shard, profile: 'ridge', bw: 12, z: 1 }],
  shulker_shell: () => [
    { d: P => Math.max(sdEllipse(P.x, P.y, 64, 84, 50, 56), P.y - 92), mat: M.shell, profile: 'bevel', bw: 6, z: 1, form: P => Math.sqrt(Math.max(0, 1 - ((P.x - 64) / 50) ** 2)) * 8, deco: P => (Math.abs(P.y - 56) < 1 || Math.abs(P.y - 74) < 1 ? { dh: -1.2, dark: 0.4 } : null) },
    { d: P => sdBox(P.x, P.y, 64, 96, 52, 6, 3), mat: M.shell, profile: 'bevel', bw: 3, z: 3 },
  ],
  nether_star: () => [
    { d: P => sdPoly(P.x, P.y, star(64, 64, 4, 58, 16)), mat: M.star, profile: 'ridge', bw: 14, z: 1 },
    { d: P => sdPoly(P.x, P.y, star(64, 64, 4, 34, 10, -Math.PI / 4)), mat: M.star, profile: 'ridge', bw: 9, z: 0.5 },
  ],
  egg: () => [{ d: P => sdEllipse(P.x, P.y, 64, 70, 32, 42) - Math.max(0, (70 - P.y) * 0.08), mat: M.eggShell, profile: 'round', bw: 30, z: 1, paint: P => (h2(8, P.x / 6 | 0, P.y / 6 | 0) < 0.1 ? mul(M.eggShell.base, 0.8) : M.eggShell.base) }],
  honeycomb: () => { const cells = [[44, 50], [72, 50], [58, 74], [86, 74], [30, 74], [44, 98], [72, 98]]; return [{ d: P => Math.min(...cells.map(([x, y]) => sdHex(P.x, P.y, x, y, 13))), mat: M.comb, profile: 'bevel', bw: 4, z: 1, deco: P => (cells.some(([x, y]) => sdHex(P.x, P.y, x, y, 7) < 0) ? { dh: -1.5, dark: 0.3 } : null) }]; },
  armadillo_scute: () => [{ d: P => sdPoly(P.x, P.y, [[24, 40], [64, 22], [104, 40], [100, 84], [64, 108], [28, 84]]), mat: M.scute, profile: 'bevel', bw: 6, z: 1, form: P => Math.sqrt(Math.max(0, 1 - ((P.x - 64) / 44) ** 2)) * 6, deco: P => ([48, 64, 80].some(y => Math.abs(P.y - y) < 1) ? { dh: -1, dark: 0.35 } : null) }],
  breeze_rod: () => [{ d: P => sdSeg(P.u, P.v, -62, 0, 62, 0, 7), mat: M.breeze, profile: 'round', bw: 7, z: 1, axis: 'u', paint: P => (Math.sin(P.u * 0.4 + P.v * 0.5) > 0.4 ? [0.55, 0.45, 0.85] : M.breeze.base) }],
  echo_shard: () => [{ d: P => sdPoly(P.x, P.y, [[34, 102], [40, 58], [66, 20], [94, 34], [90, 78], [60, 110]]), mat: M.echo, profile: 'ridge', bw: 12, z: 1, deco: P => (Math.abs(P.x - 64 + (P.y - 64) * 0.55) < 1.2 && P.y > 30 && P.y < 104 ? { seam: true } : null) }],
  nautilus: () => [ball(64, 66, 44, M.nautilus, { paint: P => { const dx = P.x - 64, dy = P.y - 66, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy); if (r < 10) return [0.2, 0.12, 0.08]; return Math.sin(a * 3 + Math.log(r + 1) * 9) > 0.45 ? [0.55, 0.32, 0.18] : M.nautilus.base; } })],
  wind_charge: () => [ball(64, 64, 34, M.wind, { paint: P => { const dx = P.x - 64, dy = P.y - 64, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy); return Math.sin(a * 2 + r * 0.25) > 0.3 ? [0.95, 0.97, 1] : M.wind.base; } })],
});
const ITEM_FAMILIES = {
  food: ['apple', 'apple_golden', 'bread', 'beef_raw', 'beef_cooked', 'porkchop_raw', 'porkchop_cooked', 'mutton_raw', 'mutton_cooked', 'chicken_raw', 'chicken_cooked', 'rabbit_raw', 'rabbit_cooked',
    'fish_raw', 'fish_cooked', 'fish_salmon_raw', 'fish_salmon_cooked', 'fish_clownfish_raw', 'fish_pufferfish_raw', 'carrot', 'carrot_golden', 'cookie', 'mushroom_stew', 'beetroot_soup', 'rabbit_stew', 'suspicious_stew',
    'potato', 'potato_baked', 'potato_poisonous', 'melon', 'melon_speckled', 'sweet_berries', 'glow_berries', 'beetroot', 'chorus_fruit', 'chorus_fruit_popped', 'dried_kelp', 'honey_bottle', 'cake', 'pumpkin_pie'],
  mob_drops: ['bone', 'string', 'rotten_flesh', 'gunpowder', 'ender_pearl', 'ender_eye', 'slimeball', 'blaze_rod', 'blaze_powder', 'spider_eye', 'spider_eye_fermented', 'feather', 'leather', 'rabbit_hide', 'rabbit_foot',
    'ghast_tear', 'magma_cream', 'phantom_membrane', 'prismarine_crystals', 'prismarine_shard', 'shulker_shell', 'nether_star', 'egg', 'honeycomb', 'armadillo_scute', 'breeze_rod', 'echo_shard', 'nautilus', 'wind_charge'],
};

// ---------------------------------------------------------------- full block families (chosen styles)
PAL.rednetherbrick = { A: G('#3a0e10', '#4e1416', '#621c1e', '#762628'), B: G('#2c080a', '#45100f', '#5e1a18', '#7a2622'), C: G('#26050a', '#440a12', '#6a1220', '#941a2c') };
PAL.basalttop = PAL.basalt;
function cracksOn(t, s, n, glowC) { // random-walk cracks; glowing for the bold style
  let seed = s;
  const R = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let c = 0; c < n; c++) {
    let x = R() * N, y = R() * N, a = R() * Math.PI * 2;
    const len = 25 + R() * 40;
    for (let j = 0; j < len; j++) {
      a += (R() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a);
      const i = ((Math.round(y) % N + N) % N) * N + ((Math.round(x) % N + N) % N);
      if (glowC) { t.col(i, glowC); t.e[i] = 0.9; } else t.col(i, mul(t.get(i), 0.4));
      t.h[i] = 0.06;
    }
  }
  return t;
}
const motifRing = (t, st, glowC) => t.each((x, y, i) => {
  const e = edgeDist(x, y), r = Math.hypot(x - 63.5, y - 63.5), m = Math.abs(x - 63.5) + Math.abs(y - 63.5);
  if ((e >= 14 && e < 16) || (r > 24 && r < 27) || (m > 40 && m < 42.5 && e > 16)) {
    if (glowC) { t.col(i, glowC); t.e[i] = 0.85; } else t.col(i, mul(t.get(i), 0.5));
    t.h[i] = 0.15;
  }
});
function ore(t, s, pal, o) { // scattered ore nuggets on a finished base
  return t.each((x, y, i) => {
    const w = worley(x, y, 6, s);
    if (h2(s, w.id, 3) > 0.42) return;
    const rad = 0.24 + (fbm(x, y, 16, 16, 3, s + 4) - 0.5) * 0.3, k = 1 - w.f1 / rad;
    if (w.f1 < rad) { t.col(i, grad(pal, fbm(x, y, 24, 24, 3, s + 5) * 0.6 + k * 0.4)); t.h[i] = 0.65 + k * 0.3; t.m[i] = o.metal || 0; t.r[i] = o.rough ?? 0.35; t.e[i] = (o.emis || 0) * k; }
    else if (w.f1 < rad + 0.05) t.col(i, mul(t.get(i), 0.5));
  });
}
function fungalTop(key, s, pal, glowC) { // nylium / wart: dense bumpy fungal mat
  const t = new Tex();
  return t.each((x, y, i) => {
    const w = worley(x, y, 18, s), n = fbm(x, y, 6, 6, 3, s + 1), bump = 1 - Math.min(1, w.f1 / 0.5);
    let c = grad(pal, 0.25 + bump * 0.5 + (n - 0.5) * 0.4);
    if (glowC && h2(s, w.id, 7) < 0.08 && w.f1 < 0.25) { c = glowC; t.e[i] = 0.7; }
    t.col(i, c); t.h[i] = 0.3 + bump * 0.5; t.r[i] = 0.8;
  });
}
function nyliumSide(key, s, pal, glowC) {
  const base = netherrack(key, s), top = fungalTop(key, s + 1, pal, glowC);
  return base.each((x, y, i) => {
    const edge = 22 + vnoiseLine(x, s) * 16;
    if (y < edge) { base.col(i, top.get(i)); base.h[i] = top.h[i]; base.e[i] = top.e[i]; base.r[i] = 0.8; }
    else if (y < edge + 3) base.col(i, mul(base.get(i), 0.55));
  });
}
const vnoiseLine = (x, s) => fbm(x, 0, 8, 1, 2, s + 77);
const NYLIUM = { crimson: G('#3a0410', '#7a0a1e', '#b0182c', '#d8343c'), warped: G('#063a34', '#0c6a5c', '#16998a', '#2ad0b6') };
const WART = { crimson: G('#4a0408', '#7e0c12', '#a8181c', '#d03028'), warped: G('#04352f', '#0a6050', '#128474', '#22b49c') };

const BLOCK_FAMILIES = {
  deepslate: k => [
    ['deepslate/cobbled_deepslate', s => masonry('deepslate', k, { type: 'cobble', k: 7 }, s, { jointScale: 1.3 })],
    ['deepslate/deepslate_bricks', s => masonry('deepslate', k, { type: 'grid', bw: 32, bh: 16, offset: true }, s)],
    ['deepslate/cracked_deepslate_bricks', s => cracksOn(masonry('deepslate', k, { type: 'grid', bw: 32, bh: 16, offset: true }, s), s + 1, 7)],
    ['deepslate/deepslate_tiles', s => masonry('deepslate', k, { type: 'grid', bw: 32, bh: 32 }, s)],
    ['deepslate/cracked_deepslate_tiles', s => cracksOn(masonry('deepslate', k, { type: 'grid', bw: 32, bh: 32 }, s), s + 1, 7)],
    ['deepslate/polished_deepslate', s => masonry('deepslate', k, { type: 'slab' }, s)],
    ['deepslate/chiseled_deepslate', s => masonry('deepslate', k, { type: 'slab' }, s, { motif: t => motifRing(t) })],
  ],
  nether: k => {
    const glow = STYLE[k].glow ? EMBER : null, gold = G('#7a5208', '#c8920f', '#f2c93a', '#fff0a0'), quartz = G('#c8c0b8', '#e8e2da', '#f8f6f2', '#ffffff');
    const bricks = (pal, s) => masonry(pal, k, { type: 'grid', bw: 32, bh: 16, offset: true }, s, { glowJoint: EMBER });
    return [
      ['netherrack', s => netherrack(k, s)],
      ['nether_brick', s => bricks('netherbrick', s)],
      ['red_nether_brick', s => bricks('rednetherbrick', s)],
      ['cracked_nether_bricks', s => cracksOn(bricks('netherbrick', s), s + 1, 6, glow)],
      ['chiseled_nether_bricks', s => masonry('netherbrick', k, { type: 'slab' }, s, { motif: t => motifRing(t, null, glow) })],
      ['blackstone', s => masonry('blackstone', k, { type: 'cobble', k: 4 }, s, { jointScale: 0.6 })],
      ['blackstone_top', s => masonry('blackstone', k, { type: 'cobble', k: 5 }, s, { jointScale: 0.6 })],
      ['polished_blackstone', s => masonry('blackstone', k, { type: 'slab' }, s)],
      ['polished_blackstone_bricks', s => masonry('blackstone', k, { type: 'grid', bw: 32, bh: 32, offset: true }, s)],
      ['cracked_polished_blackstone_bricks', s => cracksOn(masonry('blackstone', k, { type: 'grid', bw: 32, bh: 32, offset: true }, s), s + 1, 6, glow)],
      ['chiseled_polished_blackstone', s => masonry('blackstone', k, { type: 'slab' }, s, { motif: t => motifRing(t, null, glow) })],
      ['gilded_blackstone', s => ore(masonry('blackstone', k, { type: 'cobble', k: 4 }, s, { jointScale: 0.6 }), s + 2, gold, { metal: 1, rough: 0.25, emis: 0.15 })],
      ['basalt_side', s => masonry('basalt', k, { type: 'columns', cw: 32, ch: N }, s)],
      ['basalt_top', s => masonry('basalt', k, { type: 'cobble', k: 4 }, s, { jointScale: 0.8 })],
      ['polished_basalt_side', s => masonry('basalt', k, { type: 'columns', cw: 64, ch: N }, s)],
      ['polished_basalt_top', s => masonry('basalt', k, { type: 'slab' }, s, { motif: t => motifRing(t) })],
      ['smooth_basalt', s => masonry('basalt', k, { type: 'slab' }, s)],
      ['soul_sand', s => soulSand(k, s)],
      ['soul_soil', s => { const t = soulSand('A', s); return k === 'C' ? t.each((x, y, i) => { if (h2(s + 3, x >> 2, y >> 2) < 0.012) { t.col(i, SOUL); t.e[i] = 0.6; } }) : t; }],
      ['crimson_nylium_top', s => fungalTop(k, s, NYLIUM.crimson, glow && [1, 0.4, 0.3])],
      ['crimson_nylium_side', s => nyliumSide(k, s, NYLIUM.crimson, glow && [1, 0.4, 0.3])],
      ['warped_nylium_top', s => fungalTop(k, s, NYLIUM.warped, glow && [0.4, 1, 0.9])],
      ['warped_nylium_side', s => nyliumSide(k, s, NYLIUM.warped, glow && [0.4, 1, 0.9])],
      ['nether_wart_block', s => fungalTop(k, s, WART.crimson, null)],
      ['warped_wart_block', s => fungalTop(k, s, WART.warped, null)],
      ['quartz_ore', s => ore(netherrack(k, s), s + 2, quartz, { rough: 0.2 })],
      ['nether_gold_ore', s => ore(netherrack(k, s), s + 2, gold, { metal: 1, rough: 0.25, emis: 0.1 })],
    ];
  },
};

// ---------------------------------------------------------------- build the chosen styles
//   node batch2.js <bedrock-samples/resource_pack> [--preview=<dir>]   (styles come from choices.json)
const vanillaArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (vanillaArg) {
  const choices = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')), VT = path.join(vanillaArg, 'textures');
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = {};
  let nb = 0, ni = 0;
  for (const [fam, build] of Object.entries(BLOCK_FAMILIES)) {
    const key = choices[fam]; if (!key) continue;
    for (const [name, fn] of build(key)) {
      if (!['png', 'tga'].some(e => fs.existsSync(path.join(VT, 'blocks', name + '.' + e)))) { console.warn('skip (not in vanilla):', name); continue; }
      const t = fn(9000 + nb * 37).bake(STYLE[key].light);
      g.save(t, name); listed.add('blocks/' + name); nb++;
      (previews[fam] = previews[fam] || []).push(texToRGBA(t));
    }
  }
  for (const [fam, names] of Object.entries(ITEM_FAMILIES)) {
    const key = choices[fam]; if (!key) continue;
    for (const name of names) {
      if (!fs.existsSync(path.join(VT, 'items', name + '.png'))) { console.warn('skip (not a vanilla png item):', name); continue; }
      const rgba = it.render(name, ITEM_DESIGNS[name](), 700 + ni * 13, { style: ITEM_STYLE[key] });
      listed.add('items/' + name); ni++;
      (previews[fam] = previews[fam] || []).push(rgba);
    }
  }
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) {
    fs.mkdirSync(previewDir, { recursive: true });
    for (const [fam, tiles] of Object.entries(previews)) grid(path.join(previewDir, `batch2_${fam}.png`), tiles, 10);
  }
  console.log(`Batch 2: ${nb} blocks, ${ni} items.`);
}
function grid(file, tiles, cols) {
  const W = cols * N, H = Math.ceil(tiles.length / cols) * N, px = new Uint8Array(W * H * 3);
  tiles.forEach((rgba, k) => {
    const ox = (k % cols) * N, oy = Math.floor(k / cols) * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const s = (y * N + x) * 4, a = rgba[s + 3] / 255, bg = ((x >> 3) + (y >> 3)) & 1 ? 62 : 50, d = ((oy + y) * W + ox + x) * 3;
      for (let c = 0; c < 3; c++) px[d + c] = Math.round(rgba[s + c] * a + bg * (1 - a));
    }
  });
  fs.writeFileSync(file, pngBuf(W, H, 3, px));
}

module.exports = { STYLE, PAL, BLOCK_SAMPLES, ITEM_DESIGNS, ITEM_STYLE, ITEM_FAMILIES, BLOCK_FAMILIES, masonry, netherrack, soulSand, FOODM, ORG };
