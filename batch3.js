'use strict';
// USTP batch 3: plants & flowers, doors & trapdoors, workstations, cave stones — each in three styles
//   A Clean Modern · B Natural Realistic · C Bold
//   node batch3.js --samples=<dir>   → one labelled comparison sheet per family (rows A, B, C)
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const it = require('./items.js');
const b2 = require('./batch2.js');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { sdCircle, sdEllipse, sdSeg, sdPoly, mk } = it;
const { STYLE, PAL, masonry, surface, sheet, texToRGBA } = b2;
const N = 128, ifbm = it.fbm;
const ORG = (base, dark, light, extra = {}) => mk({ kind: 'organic', base, dark, light, metal: 0, rough: 0.7, ...extra });

// ---------------------------------------------------------------- plants (sprites drawn with the item renderer)
const PM = {
  blade: ORG('#b4b4b4', '#3a3a3a', '#ffffff', { gloss: 14, spec: 0.2, mottle: 0.2 }),       // greyscale: biome-tinted
  stem: ORG('#4f8a2e', '#163a0a', '#d8ffc0', { gloss: 14, spec: 0.2 }),
  leaf: ORG('#4fa12e', '#163d0c', '#e8ffd0', { gloss: 18, spec: 0.25, mottle: 0.2 }),
  poppy: ORG('#d81e22', '#4a0406', '#fff0f0', { gloss: 30, spec: 0.4 }),
  dark: ORG('#1a1410', '#000000', '#806040', { gloss: 10, spec: 0.1 }),
  dandelion: ORG('#ffd21e', '#8a5a00', '#fffbe0', { gloss: 16, spec: 0.25, mottle: 0.3, grain: 1.2 }),
  bark: ORG('#6b4423', '#26150a', '#c9a07a', { gloss: 10, spec: 0.1, mottle: 0.3 }),
  wheat: ORG('#d8b048', '#6a4a10', '#fff4c0', { gloss: 18, spec: 0.3, mottle: 0.2 }),
  straw: ORG('#c8a048', '#5a3e10', '#fff0c0', { gloss: 10, spec: 0.15 }),
};
const blade = (x0, lean, top, w) => [[x0 - w, 128], [x0 - w * 0.4 + lean * 0.5, (128 + top) / 2], [x0 + lean, top], [x0 + w * 0.4 + lean * 0.5, (128 + top) / 2], [x0 + w, 128]];
const PLANTS = {
  tallgrass: () => Array.from({ length: 15 }, (_, k) => {
    const x0 = 10 + h2(31, k, 1) * 108, lean = (h2(31, k, 2) - 0.5) * 50, top = 18 + h2(31, k, 3) * 50, w = 4 + h2(31, k, 4) * 3, P0 = blade(x0, lean, top, w);
    return { d: P => sdPoly(P.x, P.y, P0), mat: PM.blade, profile: 'ridge', bw: 4, z: 1 + k * 0.2 };
  }),
  flower_rose: () => [
    { d: P => it.sdSeg(P.x, P.y, 64, 128, 62, 56, 3), mat: PM.stem, profile: 'round', bw: 3, z: 1 },
    { d: P => Math.min(sdEllipse(P.x, P.y, 46, 96, 15, 6), sdEllipse(P.x, P.y, 82, 86, 15, 6)), mat: PM.leaf, profile: 'round', bw: 5, z: 2 },
    { d: P => Math.min(...[0, 1, 2, 3, 4].map(k => { const a = k * 1.2566 - 1.57; return sdCircle(P.x, P.y, 62 + Math.cos(a) * 14, 44 + Math.sin(a) * 14, 15); })), mat: PM.poppy, profile: 'round', bw: 10, z: 4,
      deco: P => (Math.hypot(P.x - 62, P.y - 44) < 26 && Math.abs(Math.sin(Math.atan2(P.y - 44, P.x - 62) * 2.5)) < 0.06 ? { dh: -1, dark: 0.35 } : null) },
    { d: P => sdCircle(P.x, P.y, 62, 44, 8), mat: PM.dark, profile: 'round', bw: 6, z: 12 },
  ],
  flower_dandelion: () => [
    { d: P => it.sdSeg(P.x, P.y, 64, 128, 64, 62, 3), mat: PM.stem, profile: 'round', bw: 3, z: 1 },
    { d: P => Math.min(sdEllipse(P.x, P.y, 48, 108, 16, 5), sdEllipse(P.x, P.y, 80, 112, 16, 5)), mat: PM.leaf, profile: 'round', bw: 4, z: 2 },
    { d: P => Math.min(sdCircle(P.x, P.y, 64, 50, 20), ...Array.from({ length: 12 }, (_, k) => sdCircle(P.x, P.y, 64 + Math.cos(k * 0.5236) * 18, 50 + Math.sin(k * 0.5236) * 18, 7))), mat: PM.dandelion, profile: 'round', bw: 16, z: 4 },
  ],
  sapling_oak: () => [
    { d: P => Math.min(it.sdSeg(P.x, P.y, 64, 128, 62, 60, 4.5), it.sdSeg(P.x, P.y, 63, 88, 82, 66, 2.5), it.sdSeg(P.x, P.y, 63, 80, 44, 62, 2.5)), mat: PM.bark, profile: 'round', bw: 4, z: 1 },
    ...[[62, 40, 24], [38, 58, 18], [88, 58, 19], [64, 64, 16]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.25, P.y * 0.25, 9 + k) - 0.5) * 8, mat: PM.leaf, profile: 'round', bw: r * 0.8, z: 3 + k })),
  ],
  wheat_stage_7: () => [26, 46, 64, 82, 102].flatMap((x, k) => {
    const top = 18 + (k % 2) * 10, lean = (k - 2) * 4;
    return [
      { d: P => it.sdSeg(P.x, P.y, x, 128, x + lean, top + 40, 2.2), mat: PM.straw, profile: 'round', bw: 2, z: 1 },
      { d: P => Math.min(...[0, 1, 2, 3, 4, 5].map(j => Math.min(sdEllipse(P.x, P.y, x + lean - 4, top + 8 + j * 7, 4, 6), sdEllipse(P.x, P.y, x + lean + 4, top + 11 + j * 7, 4, 6)))), mat: PM.wheat, profile: 'round', bw: 4, z: 2 },
    ];
  }),
};
const TINT = { tallgrass: [0.56, 0.74, 0.35] };   // preview-only: the game tints greyscale grass by biome

// ---------------------------------------------------------------- doors & trapdoors (pixel art on Tex)
const WOODP = { oak: G('#7b5830', '#987244', '#b28a56', '#c69f68') };
const STEEL = { A: G('#5a6068', '#8a9098', '#b8bec6', '#dce0e6'), B: G('#2a2c30', '#45484e', '#62666c', '#7e8288'), C: G('#16181e', '#2a2e38', '#424858', '#646c80') };
const BRASS = G('#6a4808', '#b8861a', '#f0c850', '#fff0b0');
let METAL_OVERRIDE = null;   // copper doors: set for the duration of one door/trapdoor
function material(t, i, x, y, s, key, metal, pal) {
  if (metal) {
    const brush = fbm(x, y, 2, 24, 3, s), plate = key === 'B' ? fbm(x, y, 4, 4, 3, s + 1) * 0.25 : 0;
    t.col(i, grad(METAL_OVERRIDE || STEEL[key], 0.35 + brush * 0.4 + plate)); t.m[i] = 1; t.r[i] = key === 'B' ? 0.55 : 0.3;
  } else {
    const grain = fbm(x, y, 16, 2, 4, s), knot = key === 'B' && worley(x, y, 4, s + 7).f1 < 0.08 ? -0.2 : 0;
    const sat = key === 'C' ? 1.12 : 1;
    t.col(i, grad(pal, (0.3 + grain * 0.55 + knot) * (key === 'A' ? 0.92 : 1) + (key === 'A' ? 0.08 : 0)).map(v => v * sat)); t.r[i] = 0.75;
  }
  t.h[i] = 0.55;
}
const setMetal = (t, i, pal, v, h = 0.8, rough = 0.3) => { t.col(i, grad(pal, v)); t.m[i] = 1; t.r[i] = rough; t.h[i] = h; };
const hole = (t, i) => { t.a[i] = 0; t.col(i, [0, 0, 0]); t.h[i] = 0; };
function door(key, half, metal, pal = WOODP.oak, s = 1) {
  const t = new Tex(), upper = half === 'upper';
  return t.each((x, y, i) => {
    material(t, i, x, y, s, key, metal, pal);
    const yy = upper ? y : y + 128;   // y across the whole two-block door (0..255)
    if (key === 'A') {
      const d = Math.min(x, 127 - x, upper ? y : 999, upper ? 999 : 127 - y);
      if (d < 2) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.2; }
      const inX = x > 14 && x < 113, inY = yy > 14 && yy < 241;
      if (inX && inY && (Math.abs(x - 14.5) < 1 || Math.abs(x - 112.5) < 1 || Math.abs(yy - 14.5) < 1 || Math.abs(yy - 240.5) < 1)) { t.col(i, mul(t.get(i), 0.65)); t.h[i] = 0.35; }
      if (upper) for (const [x0, x1] of [[28, 52], [76, 100]]) {
        const dx = Math.max(x0 - x, x - x1, 0), dy = Math.max(26 - y, y - 104, 0), inside = x >= x0 && x <= x1 && y >= 26 && y <= 104;
        if (inside && Math.min(x - x0, x1 - x, y - 26, 104 - y) >= 3) hole(t, i);
        else if (inside || Math.hypot(dx, dy) < 1) setMetal(t, i, STEEL.A, 0.75);
      }
      if (!upper && x >= 100 && x <= 106 && y >= 6 && y <= 50) setMetal(t, i, STEEL.A, 0.55 + 0.3 * Math.sin((x - 100) / 6 * Math.PI), 0.95, 0.2);
    } else if (key === 'B') {
      if (!metal && x % 32 === 0) { t.col(i, mul(t.get(i), 0.4)); t.h[i] = 0.15; }
      if (metal && (yy % 64 === 0)) { t.col(i, mul(t.get(i), 0.4)); t.h[i] = 0.15; }
      for (const sy of [18, 236]) if (Math.abs(yy - sy) < 6) {
        setMetal(t, i, G('#141414', '#2a2a2c', '#3e3e42'), 0.4 + fbm(x, y, 8, 8, 2, s + 3) * 0.4, 0.75, 0.7);
        if (Math.hypot(((x + 16) % 32) - 16, yy - sy) < 2.6) setMetal(t, i, G('#2a2a2c', '#6a6a70', '#a0a0a6'), 0.8, 0.95, 0.5);
      }
      if (upper && x > 24 && x < 104 && y > 30 && y < 96) {
        if (Math.abs(x - 64) < 3.5 || Math.abs(y - 63) < 3.5 || x < 28 || x > 100 || y < 34 || y > 92) { material(t, i, x, y, s + 5, key, metal, pal); t.h[i] = 0.75; }
        else hole(t, i);
      }
      if (!upper && Math.abs((x - 16) - (112 - y)) < 8 && x > 10 && x < 118 && y > 10 && y < 118) { material(t, i, x + 40, y, s + 9, key, metal, pal); t.col(i, mul(t.get(i), 0.88)); t.h[i] = 0.8; }
      if (!upper && Math.abs(Math.hypot(x - 104, y - 44) - 7) < 1.8) setMetal(t, i, G('#1a1a1a', '#3a3a3e', '#7a7a80'), 0.6, 0.9, 0.6);
    } else { // C: chunky frame, deep inner panel, brass details
      const fd = Math.min(x, 127 - x, upper ? y : 999, upper ? 999 : 127 - y);
      if (fd < 12) { t.col(i, mul(t.get(i), 0.45)); t.h[i] = fd < 2 ? 0.3 : 0.85; }
      else if (fd < 16) t.h[i] = lerpH(fd - 12);
      if (upper) {
        const r = Math.hypot(x - 64, y - 62);
        if (r < 28) hole(t, i); else if (r < 36) setMetal(t, i, BRASS, 0.4 + 0.5 * (1 - Math.abs(r - 32) / 4), 0.9, 0.15);
      } else {
        const m = Math.abs(x - 64) + Math.abs(y - 60);
        if (m > 28 && m < 34) setMetal(t, i, BRASS, 0.7, 0.75, 0.2);
        if (Math.hypot(x - 102, y - 30) < 6) setMetal(t, i, BRASS, 0.85, 0.95, 0.15);
      }
    }
  });
}
const lerpH = k => 0.35 + k * 0.05;
function trapdoor(key, metal, pal = WOODP.oak, s = 2) {
  const t = new Tex();
  return t.each((x, y, i) => {
    material(t, i, x, y, s, key, metal, pal);
    const d = edgeDist(x, y);
    if (key === 'A') {
      if (d < 2) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.2; }
      for (const sx of [26, 50, 74, 98]) if (Math.abs(x - sx - 4) <= 5 && y > 20 && y < 108) {
        if (Math.abs(x - sx - 4) <= 3 && y > 22 && y < 106) hole(t, i); else setMetal(t, i, STEEL.A, 0.75);
      }
    } else if (key === 'B') {
      if (!metal && y % 32 === 0) { t.col(i, mul(t.get(i), 0.4)); t.h[i] = 0.15; }
      for (const sy of [24, 104]) if (Math.abs(y - sy) < 5) {
        setMetal(t, i, G('#141414', '#2a2a2c', '#3e3e42'), 0.5, 0.75, 0.7);
        if (Math.hypot(((x + 16) % 32) - 16, y - sy) < 2.4) setMetal(t, i, G('#2a2a2c', '#6a6a70', '#a0a0a6'), 0.8, 0.95, 0.5);
      }
      for (const [cx, cy] of [[40, 64], [88, 64]]) if (Math.abs(x - cx) < 10 && Math.abs(y - cy) < 10) hole(t, i);
    } else {
      if (d < 12) { t.col(i, mul(t.get(i), 0.45)); t.h[i] = d < 2 ? 0.3 : 0.85; }
      for (const cx of [38, 64, 90]) for (const cy of [38, 64, 90]) {
        const r = Math.hypot(x - cx, y - cy);
        if (r < 8) hole(t, i); else if (r < 11) setMetal(t, i, BRASS, 0.75, 0.85, 0.2);
      }
    }
  });
}

// ---------------------------------------------------------------- workstations
PAL.stoneW = { A: G('#5e6166', '#71747a', '#84878d', '#979aa0'), B: G('#46494e', '#5d6066', '#74777d', '#8b8e94', '#a1a4aa'), C: G('#22252c', '#363b46', '#4e5566', '#6e7890') };
function barrelSide(key, s = 3, pal = WOODP.oak) {
  const t = new Tex(), hoop = key === 'A' ? STEEL.A : key === 'B' ? G('#2a1a10', '#4a3020', '#6a4a30', '#8a6440') : BRASS, hw = { A: 3, B: 5, C: 6 }[key];
  return t.each((x, y, i) => {
    const lx = x % 16, curve = Math.sin(Math.PI * (lx + 0.5) / 16);
    material(t, i, x, y, s + (x >> 4) * 17, key, false, pal);
    t.col(i, mul(t.get(i), (key === 'A' ? 0.85 : 0.75) + curve * (key === 'C' ? 0.4 : 0.25))); t.h[i] = 0.4 + curve * 0.3;
    if (lx === 0) { t.col(i, mul(t.get(i), 0.45)); t.h[i] = 0.15; }
    for (const hy of [24, 104]) if (Math.abs(y - hy) <= hw) {
      setMetal(t, i, hoop, 0.35 + 0.5 * (1 - Math.abs(y - hy) / (hw + 1)), 0.85, key === 'B' ? 0.7 : 0.25);
      if (key === 'B' && Math.abs(y - hy) <= 1.5 && lx === 8) setMetal(t, i, G('#1a1a1a', '#5a5a60', '#9a9aa0'), 0.9, 0.95, 0.5);
    }
  });
}
function barrelTop(key, s = 4, pal = WOODP.oak) {
  const t = new Tex(), ring = key === 'A' ? STEEL.A : key === 'B' ? G('#1a1a1a', '#3a3a3e', '#5e5e64') : BRASS;
  return t.each((x, y, i) => {
    material(t, i, y, x, s, key, false, pal);   // boards run across the lid
    if (y % 32 === 0) { t.col(i, mul(t.get(i), 0.45)); t.h[i] = 0.15; }
    const r = Math.hypot(x - 63.5, y - 63.5), rw = { A: 3, B: 5, C: 7 }[key];
    if (r > 50 && r < 50 + rw) setMetal(t, i, ring, 0.4 + 0.4 * Math.sin(Math.PI * (r - 50) / rw), 0.85, key === 'B' ? 0.7 : 0.25);
    if (r >= 50 + rw) { t.col(i, mul(t.get(i), key === 'C' ? 0.5 : 0.75)); t.h[i] = 0.45; }
    if (Math.abs(y - 63.5) < 3 && Math.abs(x - 63.5) < 22) setMetal(t, i, ring, 0.7, 0.95, 0.3);
  });
}
function stoneBody(key, s, layout = { type: 'grid', bw: 32, bh: 16, offset: true }) { return masonry('stoneW', key, layout, s); }
function smokerFront(key, s = 5) {
  const t = stoneBody(key, s, key === 'A' ? { type: 'slab' } : { type: 'grid', bw: 32, bh: 16, offset: true });
  return t.each((x, y, i) => {
    if (x >= 22 && x <= 106 && y >= 48 && y <= 114) {          // firebox door
      const d = Math.min(x - 22, 106 - x, y - 48, 114 - y);
      setMetal(t, i, STEEL[key], d < 3 ? 0.75 : 0.35 + fbm(x, y, 2, 16, 2, s) * 0.2, d < 3 ? 0.9 : 0.6, 0.4);
      if (y > 70 && y < 104 && x > 32 && x < 96 && (x - 32) % 10 < 4) { t.col(i, [0.04, 0.04, 0.05]); t.h[i] = 0.1; t.m[i] = 0; }
    }
    if (y >= 14 && y <= 30 && x >= 40 && x <= 88) setMetal(t, i, STEEL[key], (x - 40) % 8 < 4 ? 0.2 : 0.7, 0.7, 0.45);   // vent
    if (key !== 'A' && y >= 116) { material(t, i, x, y, s + 9, key, false, WOODP.oak); t.col(i, mul(t.get(i), 0.7)); }
  });
}
function blastFront(key, s = 6) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const pd = edgeDist(x, y, 64);
    setMetal(t, i, STEEL[key], 0.35 + fbm(x, y, 2, 24, 3, s) * 0.35, pd < 2 ? 0.2 : 0.75, key === 'B' ? 0.6 : 0.3);
    if (pd < 2) t.col(i, mul(t.get(i), 0.5));
    if (key !== 'A' && Math.hypot(((x + 0) % 64) - 6, ((y + 0) % 64) - 6) < 2.5) setMetal(t, i, STEEL[key], 0.9, 0.95, 0.3);
    if (x >= 28 && x <= 100 && y >= 62 && y <= 114) {
      const d = Math.min(x - 28, 100 - x, y - 62, 114 - y);
      if (d < 4) setMetal(t, i, key === 'C' ? BRASS : STEEL[key], 0.8, 0.9, 0.25);
      else { t.col(i, [0.04, 0.04, 0.05]); t.h[i] = 0.05; t.m[i] = 0; if ((x - 32) % 12 < 4) setMetal(t, i, STEEL[key], 0.45, 0.4, 0.5); }
    }
    for (const vx of [34, 54, 74, 94]) if (Math.abs(x - vx) < 4 && y > 18 && y < 44) { t.col(i, [0.05, 0.05, 0.06]); t.h[i] = 0.1; t.m[i] = 0; }
  });
}
function smithingFront(key, s = 7) {
  const t = new Tex(), dark = G('#1e140c', '#2e2016', '#3e2c1e', '#4e3a28');
  return t.each((x, y, i) => {
    material(t, i, x, y, s, key, false, dark);
    if (x % 32 === 0) { t.col(i, mul(t.get(i), 0.5)); t.h[i] = 0.15; }
    if (y < 20) setMetal(t, i, STEEL[key], 0.4 + fbm(x, y, 2, 16, 2, s) * 0.3, 0.85, 0.3);
    if (y >= 108) setMetal(t, i, STEEL[key], 0.35, 0.8, 0.4);
    // hammer emblem
    if (Math.abs(x - 64) < 4 && y > 44 && y < 98) setMetal(t, i, key === 'C' ? BRASS : STEEL[key], 0.6, 0.9, 0.25);
    if (Math.abs(y - 44) < 8 && Math.abs(x - 64) < 22) setMetal(t, i, key === 'C' ? BRASS : STEEL[key], 0.8, 0.95, 0.2);
  });
}

// ---------------------------------------------------------------- cave stones
Object.assign(PAL, {
  tuff: { A: G('#5a5c55', '#696b63', '#787a71', '#878980'), B: G('#45473f', '#5a5c53', '#6e7066', '#83857a', '#979a8e'), C: G('#2e3a35', '#43554c', '#5d7468', '#86a090') },
  calcite: { A: G('#cfd0cc', '#dcddd9', '#e8e9e5', '#f3f4f0'), B: G('#b8b8b0', '#cfcfc8', '#e0e0d8', '#efefe8', '#fafaf5'), C: G('#a8b4c8', '#c8d4e4', '#e4ecf6', '#ffffff') },
  dripstone: { A: G('#7a6152', '#8a6f5e', '#9a7d6a', '#aa8c78'), B: G('#5e4436', '#7a5a48', '#95725c', '#ad8a72', '#c4a088'), C: G('#4a2c1c', '#6e4128', '#965a36', '#c47a48') },
  mud: { A: G('#2e2a2c', '#393436', '#443e40', '#4f494b'), B: G('#221e1f', '#302a2b', '#3e3739', '#4c4547'), C: G('#1a1418', '#2a2028', '#3c2e3a', '#55405a') },
  mudbrick: { A: G('#806454', '#8e705e', '#9c7c69', '#aa8874'), B: G('#6a4e3e', '#82604c', '#987260', '#ae8670'), C: G('#5a3424', '#7a4a32', '#9e6444', '#c8845a') },
});
function rock(fam, key, s, o = {}) { // jointless natural stone face
  const st = { ...STYLE[key], ...(o.strata ? { strata: true } : {}) }, t = new Tex();
  return t.each((x, y, i) => {
    const f = surface(x, y, s, st);
    let v = f.v, h = f.h;
    if (o.bands) { const b = Math.sin(Math.PI * 2 * (y / N * o.bands + (fbm(x, y, 3, 2, 2, s + 2) - 0.5) * 0.5)); v += b * (key === 'A' ? 0.06 : 0.12); h += b * 0.08; }
    if (o.pores && key !== 'A') { const p = worley(x, y, 20, s + 6); if (p.f1 < 0.14) { v -= 0.35; h = 0.15; } }
    if (o.speck) { const k = worley(x, y, 26, s + 11); if (k.f1 < 0.18) v += h2(s, k.id, 2) < 0.5 ? -0.25 : 0.2; }
    if (key === 'A') h = 0.5 + (h - 0.5) * 0.5;
    t.col(i, grad(PAL[fam][key], v)); t.h[i] = clamp(h); t.r[i] = o.wet ? (key === 'B' ? 0.35 : 0.45) : STYLE[key].rough;
    if (o.wet && key === 'C') t.r[i] = 0.25;
  });
}

const SAMPLES = {
  plants: Object.keys(PLANTS),
  doors: [['door_wood_upper', k => door(k, 'upper', false)], ['door_wood_lower', k => door(k, 'lower', false)], ['trapdoor', k => trapdoor(k, false)], ['door_iron_upper', k => door(k, 'upper', true)], ['iron_trapdoor', k => trapdoor(k, true)]],
  workstations: [['barrel_side', k => barrelSide(k)], ['barrel_top', k => barrelTop(k)], ['smoker_front_off', k => smokerFront(k)], ['blast_furnace_front_off', k => blastFront(k)], ['smithing_table_front', k => smithingFront(k)]],
  cave_stones: [['tuff', k => rock('tuff', k, 11, { speck: true, pores: true })], ['calcite', k => rock('calcite', k, 12, { speck: true })], ['dripstone_block', k => rock('dripstone', k, 13, { bands: 7 })],
    ['mud', k => rock('mud', k, 14, { wet: true })], ['mud_bricks', k => masonry('mudbrick', k, { type: 'grid', bw: 32, bh: 16, offset: true }, 15)]],
};
const ITEM_STYLE = { A: 'modern', B: 'realistic', C: 'bold' };

const samplesDir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
if (samplesDir && require.main === module) {
  fs.mkdirSync(samplesDir, { recursive: true });
  sheet(path.join(samplesDir, 'choices_plants.png'), ['A', 'B', 'C'].map(key => ({ key, tiles: SAMPLES.plants.map((name, k) => {
    const rgba = it.render(name, PLANTS[name](), 300 + k * 11, { style: ITEM_STYLE[key], write: false, rimW: 1 });   // thin stems and blades: keep the outline to 1px
    const tint = TINT[name]; if (tint) for (let p = 0; p < rgba.length; p += 4) for (let c = 0; c < 3; c++) rgba[p + c] = Math.round(rgba[p + c] * tint[c]);
    return rgba;
  }) })));
  for (const fam of ['doors', 'workstations', 'cave_stones']) {
    sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => ({ key, tiles: SAMPLES[fam].map(([, fn]) => texToRGBA(fn(key).bake(STYLE[key].light))) })));
  }
  console.log('Wrote batch 3 comparison sheets to', samplesDir);
}
// ================================================================ full families (chosen styles)
// ---- plants: more designs on the same sprite toolkit
const rotE = (x, y, cx, cy, rx, ry, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, rx, ry); };
const polyline = (x, y, pts, r) => Math.min(...pts.slice(1).map((p, k) => sdSeg(x, y, pts[k][0], pts[k][1], p[0], p[1], r)));
const C = (hexBase, hexDark, hexLight, extra) => ORG(hexBase, hexDark, hexLight, { gloss: 22, spec: 0.3, ...extra });
Object.assign(PM, {
  orchid: C('#46a8e8', '#0a3a6a', '#f0faff'), white: C('#f4f4f0', '#8a8a86', '#ffffff'), yellowC: C('#f8c820', '#7a5000', '#fff8d0'),
  allium: C('#b46ad8', '#3a1450', '#fbeaff'), tulipRed: C('#e02828', '#5a0606', '#fff0f0'), tulipOrange: C('#f07a1a', '#6a2a00', '#fff0d8'),
  tulipWhite: C('#f0f0ec', '#8a8a84', '#ffffff'), tulipPink: C('#f090b8', '#7a2a4a', '#fff4f8'), cornflower: C('#3a5ae0', '#0a1450', '#e8f0ff'),
  wither: C('#2a2626', '#060404', '#8a8080'), torch: C('#ff6a1a', '#6a1400', '#fff0b0'), peony: C('#f0b0d8', '#7a3a5a', '#fff8fc'),
  lilac: C('#c890e0', '#4a2060', '#fbf0ff'), rose: C('#d01830', '#4a0008', '#fff0f0'), sunPetal: C('#ffd21e', '#8a5a00', '#fffbe0'),
  sunCore: C('#5a3410', '#1a0c02', '#c08a50', { mottle: 0.5, grain: 1.5 }), birchBark: C('#e8e4da', '#5a5650', '#ffffff'),
  spruce: C('#2e5a34', '#0a1e0e', '#c8f0c8'), jungle: C('#3a9a24', '#0c3a06', '#e0ffd0'), acacia: C('#7a9a2a', '#283a06', '#f0ffd0'),
  darkLeaf: C('#2e6a1e', '#0a2406', '#d0f0c0'), dead: C('#8a6a3a', '#2e1e0a', '#e0c8a0', { gloss: 8, spec: 0.1 }), crop: C('#4fa12e', '#163d0c', '#e8ffd0'),
  carrotTop: C('#f07a1a', '#6a2a00', '#ffe0b0'), potatoTop: C('#d8b06a', '#5e4216', '#fff4d0'), beetTop: C('#8a1838', '#2a0410', '#ffd0e0'),
  beetStem: C('#a8203a', '#3a0410', '#ffd0d8'), bluetCenter: C('#f8d020', '#7a5000', '#fffbe0'),
});
const stemTo = (x, y, r = 3, from = [64, 128]) => ({ d: P => sdSeg(P.x, P.y, from[0], from[1], x, y, r), mat: PM.stem, profile: 'round', bw: r, z: 1 });
const leaves2 = (y1 = 96, y2 = 86) => ({ d: P => Math.min(sdEllipse(P.x, P.y, 46, y1, 15, 6), sdEllipse(P.x, P.y, 82, y2, 15, 6)), mat: PM.leaf, profile: 'round', bw: 5, z: 2 });
const petalRing = (cx, cy, n, dist, rx, ry, mat, z = 4) => ({ d: P => Math.min(...Array.from({ length: n }, (_, k) => { const a = k * 2 * Math.PI / n; return rotE(P.x, P.y, cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, rx, ry, a); })), mat, profile: 'round', bw: Math.min(rx, ry), z });
const dot = (x, y, r, mat, z = 10) => ({ d: P => sdCircle(P.x, P.y, x, y, r), mat, profile: 'round', bw: r, z });
const blob = (pts, mat, z0 = 3, seed = 1) => pts.map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.25, P.y * 0.25, seed + k) - 0.5) * 7, mat, profile: 'round', bw: r * 0.8, z: z0 + k * 0.3 }));
const blades = (n, seed, topMin, topMax, mat = PM.blade, wMin = 4, x0 = 10, x1 = 118) => Array.from({ length: n }, (_, k) => {
  const x = x0 + h2(seed, k, 1) * (x1 - x0), lean = (h2(seed, k, 2) - 0.5) * 50, top = topMin + h2(seed, k, 3) * (topMax - topMin), w = wMin + h2(seed, k, 4) * 3, P0 = blade(x, lean, top, w);
  return { d: P => sdPoly(P.x, P.y, P0), mat, profile: 'ridge', bw: 4, z: 1 + k * 0.2 };
});
const frond = (pts, mat, seed) => { // fern frond: curved rib with leaflets along both sides
  const leafs = [];
  for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], a = Math.atan2(y1 - y0, x1 - x0), sz = 10 * (1 - k / pts.length) + 3; for (const side of [-1, 1]) leafs.push([x1 + Math.cos(a + side * 1.3) * sz * 0.8, y1 + Math.sin(a + side * 1.3) * sz * 0.8, sz, a + side * 1.3]); }
  return [{ d: P => Math.min(polyline(P.x, P.y, pts, 1.6), ...leafs.map(([x, y, sz, a]) => rotE(P.x, P.y, x, y, sz, sz * 0.38, a))), mat, profile: 'round', bw: 3, z: 1 + seed * 0.1 }];
};
const fernFronds = (seed, yTop = 18, mat = PM.blade) => [[-30, 0], [-12, 0], [10, 0], [28, 0], [0, 1]].flatMap(([lean], k) => {
  const pts = Array.from({ length: 8 }, (_, j) => { const t = j / 7; return [64 + lean * t * 1.6 + (k - 2) * 6, 128 - t * (128 - yTop - k * 6) + Math.sin(t * 3) * 4]; });
  return frond(pts, mat, seed + k);
});
const grassSprite = (n, seed, topMin, topMax) => blades(n, seed, topMin, topMax);
const sapling = (trunk, leafMat, crown) => [{ d: P => polyline(P.x, P.y, trunk, 4), mat: trunk.mat || PM.bark, profile: 'round', bw: 4, z: 1 }, ...blob(crown, leafMat, 3)];
const cropBlades = (stage, max, mat, seed, ears) => {
  const h = 18 + (stage / max) * 90, n = 6 + stage;
  return [...blades(n, seed, 128 - h, 128 - h * 0.7, mat, 2.5, 20, 108), ...(ears || [])];
};
function wheatStage(stage) {
  if (stage === 7) return RIPE_WHEAT();
  const mat = stage >= 5 ? C('#a8b040', '#3a4010', '#f0f0c0') : PM.crop;
  return cropBlades(stage, 7, mat, 40 + stage);
}
function leafyCrop(stage, mat, seed, topMat) { // carrots / potatoes / beetroots: tufts that grow, roots showing when ripe
  const h = 22 + stage * 22, tufts = [36, 64, 92].flatMap((x, k) => [[x - 8, 128 - h * (0.7 + 0.1 * k), 7 + stage * 2], [x + 8, 128 - h * (0.6 + 0.12 * k), 6 + stage * 2]]);
  const stems = [36, 64, 92].map(x => ({ d: P => sdSeg(P.x, P.y, x, 128, x, 128 - h * 0.6, 2), mat: PM.stem, profile: 'round', bw: 2, z: 1 }));
  return [...stems, ...blob(tufts.map(([x, y, r]) => [x, y, r]), mat, 2, seed), ...(stage === 3 && topMat ? [36, 64, 92].map(x => ({ d: P => sdEllipse(P.x, P.y, x, 122, 10, 7), mat: topMat, profile: 'round', bw: 6, z: 20 })) : [])];
}
Object.assign(PLANTS, {
  fern: () => fernFronds(3),
  double_plant_grass_bottom: () => grassSprite(18, 61, 0, 30),
  double_plant_grass_top: () => grassSprite(14, 62, 20, 70),
  double_plant_fern_bottom: () => fernFronds(5, -40),
  double_plant_fern_top: () => fernFronds(7, 30),
  flower_blue_orchid: () => [stemTo(62, 58), leaves2(), { d: P => sdPoly(P.x, P.y, Array.from({ length: 10 }, (_, k) => { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 9 : 24; return [62 + Math.cos(a) * r, 44 + Math.sin(a) * r]; })), mat: PM.orchid, profile: 'ridge', bw: 6, z: 4 }, dot(62, 44, 5, PM.white)],
  flower_allium: () => [stemTo(64, 44), leaves2(108, 100), ...blob(Array.from({ length: 16 }, (_, k) => [64 + Math.cos(k * 2.4) * (k % 3) * 8, 34 + Math.sin(k * 2.4) * (k % 3) * 8, 7]), PM.allium, 4, 13)],
  flower_houstonia: () => [[44, 66], [64, 50], [84, 64]].flatMap(([x, y]) => [stemTo(x, y, 2, [x + (64 - x) * 0.3, 128]), petalRing(x, y, 4, 6, 6, 4, PM.white), dot(x, y, 3, PM.bluetCenter)]),
  flower_tulip_red: () => tulip(PM.tulipRed), flower_tulip_orange: () => tulip(PM.tulipOrange), flower_tulip_white: () => tulip(PM.tulipWhite), flower_tulip_pink: () => tulip(PM.tulipPink),
  flower_oxeye_daisy: () => [stemTo(64, 50), leaves2(), petalRing(64, 44, 14, 15, 10, 3.6, PM.white), dot(64, 44, 8, PM.yellowC, 12)],
  flower_cornflower: () => [stemTo(64, 52), leaves2(), { d: P => sdPoly(P.x, P.y, Array.from({ length: 20 }, (_, k) => { const a = k * Math.PI / 10, r = k % 2 ? 12 : 23; return [64 + Math.cos(a) * r, 44 + Math.sin(a) * r]; })), mat: PM.cornflower, profile: 'ridge', bw: 6, z: 4 }, dot(64, 44, 5, C('#1a2a80', '#050a30', '#a0b0ff'))],
  flower_lily_of_the_valley: () => [{ d: P => Math.min(rotE(P.x, P.y, 50, 92, 9, 36, 0.15), rotE(P.x, P.y, 80, 96, 9, 32, -0.2)), mat: PM.leaf, profile: 'round', bw: 6, z: 1 },
    { d: P => polyline(P.x, P.y, [[62, 128], [62, 60], [70, 34], [90, 30], [102, 40]], 2), mat: PM.stem, profile: 'round', bw: 2, z: 2 }, ...[[66, 50], [72, 40], [84, 36], [96, 42], [102, 52]].map(([x, y]) => dot(x, y + 6, 5.5, PM.white, 6))],
  flower_wither_rose: () => PLANTS.flower_rose().map((p, k) => (k === 2 ? { ...p, mat: PM.wither } : k === 1 ? { ...p, mat: C('#3a3a2a', '#0a0a06', '#9a9a80') } : p)),
  flower_rose_blue: () => PLANTS.flower_blue_orchid(),
  torchflower: () => [stemTo(64, 60), leaves2(), ...[-0.5, 0, 0.5].map(a => ({ d: P => rotE(P.x, P.y, 64 + Math.sin(a) * 14, 40 - Math.cos(a) * 8, 7, 20, a), mat: PM.torch, profile: 'round', bw: 6, z: 4 })), dot(64, 52, 6, PM.yellowC, 8)],
  double_plant_rose_bottom: () => blob([[30, 40, 22], [64, 30, 24], [98, 42, 22], [40, 80, 24], [88, 82, 24], [64, 110, 26]], PM.darkLeaf, 1, 21),
  double_plant_rose_top: () => [...blob([[36, 90, 22], [92, 92, 22], [64, 104, 24]], PM.darkLeaf, 1, 23), ...[[40, 60, 12], [76, 48, 13], [62, 80, 12], [94, 70, 11]].map(([x, y, r]) => ({ ...dot(x, y, r, PM.rose, 8), deco: P => (Math.abs(Math.sin(Math.hypot(P.x - x, P.y - y) * 0.9 + Math.atan2(P.y - y, P.x - x))) < 0.15 ? { dh: -0.6, dark: 0.35 } : null) }))],
  double_plant_paeonia_bottom: () => blob([[34, 40, 20], [64, 34, 22], [96, 42, 20], [44, 84, 24], [86, 86, 24], [64, 112, 24]], PM.leaf, 1, 25),
  double_plant_paeonia_top: () => [...blob([[40, 96, 20], [88, 98, 20]], PM.leaf, 1, 27), ...[[44, 58], [82, 52], [64, 80]].flatMap(([x, y], k) => blob([[x - 7, y, 11], [x + 7, y - 3, 11], [x, y + 6, 11], [x, y - 8, 10]], PM.peony, 6 + k, 30 + k))],
  double_plant_syringa_bottom: () => blob([[34, 40, 20], [64, 34, 22], [96, 42, 20], [44, 84, 24], [86, 86, 24], [64, 112, 24]], PM.leaf, 1, 33),
  double_plant_syringa_top: () => [...blob([[40, 100, 18], [88, 102, 18]], PM.leaf, 1, 35), ...[[40, 70], [64, 52], [88, 72]].flatMap(([x, y], k) => blob(Array.from({ length: 7 }, (_, j) => [x + (j % 2 ? 6 : -6), y - j * 7 + 20, 8 - j * 0.6]), PM.lilac, 6 + k, 40 + k))],
  double_plant_sunflower_bottom: () => [stemTo(64, 0, 5), { d: P => Math.min(rotE(P.x, P.y, 40, 70, 24, 9, 0.4), rotE(P.x, P.y, 88, 50, 24, 9, -0.4)), mat: PM.leaf, profile: 'round', bw: 6, z: 2 }],
  double_plant_sunflower_top: () => [stemTo(64, 40, 5)],
  double_plant_sunflower_front: () => [petalRing(64, 64, 24, 46, 16, 6, PM.sunPetal, 1), dot(64, 64, 34, PM.sunCore, 6)],
  double_plant_sunflower_back: () => [petalRing(64, 64, 24, 46, 16, 6, C('#c8a018', '#5a4000', '#fff0b0'), 1), dot(64, 64, 36, PM.leaf, 6)],
  sapling_birch: () => sapling(Object.assign([[64, 128], [62, 60]], { mat: PM.birchBark }), C('#7ab84a', '#24440c', '#f0ffe0'), [[62, 42, 22], [40, 58, 16], [86, 58, 17]]),
  sapling_spruce: () => [{ d: P => sdSeg(P.x, P.y, 64, 128, 64, 30, 4), mat: PM.bark, profile: 'round', bw: 4, z: 1 }, ...[[100, 46], [74, 36], [50, 26]].map(([y, w], k) => ({ d: P => sdPoly(P.x, P.y, [[64, y - 30], [64 + w, y], [64 - w, y]]), mat: PM.spruce, profile: 'ridge', bw: 6, z: 2 + k }))],
  sapling_jungle: () => [stemTo(64, 50, 4), ...[-1.1, -0.5, 0.1, 0.7, 1.3].map((a, k) => ({ d: P => rotE(P.x, P.y, 64 + Math.sin(a) * 28, 50 - Math.cos(a) * 22, 9, 24, a), mat: PM.jungle, profile: 'round', bw: 6, z: 2 + k * 0.2 }))],
  sapling_acacia: () => [{ d: P => polyline(P.x, P.y, [[64, 128], [60, 90], [72, 60], [66, 44]], 4), mat: PM.bark, profile: 'round', bw: 4, z: 1 }, ...blob([[48, 40, 18], [70, 34, 20], [92, 42, 16]], PM.acacia, 3, 51)],
  sapling_roofed_oak: () => sapling(Object.assign([[64, 128], [64, 62]], { mat: PM.bark }), PM.darkLeaf, [[64, 44, 26], [36, 60, 20], [92, 60, 20], [64, 70, 18]]),
  deadbush: () => [{ d: P => Math.min(polyline(P.x, P.y, [[64, 128], [62, 90], [44, 60], [30, 36]], 2.4), polyline(P.x, P.y, [[62, 92], [80, 62], [96, 34]], 2.2), polyline(P.x, P.y, [[52, 74], [58, 48], [54, 24]], 1.8), polyline(P.x, P.y, [[80, 62], [100, 64]], 1.6), polyline(P.x, P.y, [[44, 60], [24, 62]], 1.6)), mat: PM.dead, profile: 'round', bw: 2.2, z: 1 }],
});
function tulip(mat) { return [stemTo(64, 56), leaves2(104, 94), { d: P => Math.min(sdEllipse(P.x, P.y, 55, 46, 10, 18), sdEllipse(P.x, P.y, 73, 46, 10, 18)), mat, profile: 'round', bw: 8, z: 4 }, { d: P => Math.max(sdEllipse(P.x, P.y, 64, 44, 11, 20), -(P.y - 26)), mat, profile: 'round', bw: 9, z: 6 }]; }
const RIPE_WHEAT = PLANTS.wheat_stage_7;   // the sample design, kept before the stage loop replaces the key
for (let s = 0; s <= 7; s++) PLANTS[`wheat_stage_${s}`] = () => wheatStage(s);
for (let s = 0; s <= 3; s++) {
  PLANTS[`carrots_stage_${s}`] = () => leafyCrop(s, PM.crop, 60 + s, PM.carrotTop);
  PLANTS[`potatoes_stage_${s}`] = () => leafyCrop(s, PM.crop, 70 + s, PM.potatoTop);
  PLANTS[`beetroots_stage_${s}`] = () => leafyCrop(s, PM.beetStem, 80 + s, PM.beetTop);
}
PLANTS.carrots_stage3 = PLANTS.carrots_stage_3;
// tall grass, ferns and double grass/fern are drawn in greyscale (PM.blade): the game tints them by biome
const CARRIED = { tallgrass_carried: 'tallgrass', fern_carried: 'fern', double_plant_grass_carried: 'double_plant_grass_top', double_plant_fern_carried: 'double_plant_fern_top' };

// ---- workstations: remaining faces
const glowSlits = (t, x0, x1, y0, y1) => t.each((x, y, i) => { if (x > x0 && x < x1 && y > y0 && y < y1 && t.c[i * 3] < 0.08) { const v = 1 - (y - y0) / (y1 - y0) * 0.5; t.col(i, [1, 0.45 * v + 0.15, 0.05]); t.e[i] = 0.9; t.m[i] = 0; } });
const WS = {
  barrel_side: k => barrelSide(k), barrel_top: k => barrelTop(k),
  barrel_top_open: k => { const t = barrelTop(k); return t.each((x, y, i) => { if (Math.hypot(x - 63.5, y - 63.5) < 50) { t.col(i, mul(t.get(i), 0.18)); t.h[i] = 0.05; } }); },
  barrel_bottom: k => barrelTop(k, 8),
  smoker_front_off: k => smokerFront(k), smoker_front_on: k => glowSlits(smokerFront(k), 32, 96, 70, 104),
  smoker_side: k => { const t = stoneBody(k, 21); return t.each((x, y, i) => { if (y >= 106) { material(t, i, x, y, 22, k, false, WOODP.oak); t.col(i, mul(t.get(i), 0.7)); } if (Math.abs(y - 40) < 5) setMetal(t, i, STEEL[k], 0.45, 0.8, 0.6); }); },
  smoker_top: k => { const t = new Tex(); return t.each((x, y, i) => { setMetal(t, i, STEEL[k], 0.35 + fbm(x, y, 4, 4, 3, 23) * 0.3, 0.7, 0.6); if (edgeDist(x, y) < 3) t.col(i, mul(t.get(i), 0.5)); if (x > 32 && x < 96 && y > 32 && y < 96 && (x % 12) < 4) { t.col(i, [0.05, 0.05, 0.05]); t.h[i] = 0.1; t.m[i] = 0; } }); },
  smoker_bottom: k => stoneBody(k, 24, { type: 'slab' }),
  blast_furnace_front_off: k => blastFront(k), blast_furnace_front_on: k => glowSlits(blastFront(k), 32, 96, 66, 110),
  blast_furnace_side: k => { const t = blastFront(k); return t.each((x, y, i) => { if (y > 58) setMetal(t, i, STEEL[k], 0.35 + fbm(x, y, 2, 24, 3, 25) * 0.35, edgeDist(x, y, 64) < 2 ? 0.2 : 0.75, 0.6); }); },
  blast_furnace_top: k => { const t = new Tex(); return t.each((x, y, i) => { setMetal(t, i, STEEL[k], 0.3 + fbm(x, y, 3, 3, 3, 26) * 0.35, 0.7, 0.6); if (edgeDist(x, y, 64) < 2) t.col(i, mul(t.get(i), 0.45)); if (Math.hypot(x - 64, y - 64) < 18) { t.col(i, [0.05, 0.05, 0.06]); t.h[i] = 0.1; t.m[i] = 0; } }); },
  smithing_table_front: k => smithingFront(k),
  smithing_table_side: k => { const t = smithingFront(k); return t.each((x, y, i) => { if (y > 30 && y < 104 && Math.abs(x - 64) < 26) { material(t, i, x, y, 27, k, false, G('#1e140c', '#2e2016', '#3e2c1e', '#4e3a28')); if (x % 32 === 0) t.col(i, mul(t.get(i), 0.5)); } }); },
  smithing_table_top: k => { const t = new Tex(); return t.each((x, y, i) => { setMetal(t, i, STEEL[k], 0.3 + fbm(x, y, 2, 2, 4, 28) * 0.4, 0.75, 0.55); const d = edgeDist(x, y); if (d < 3) t.col(i, mul(t.get(i), 0.5)); if (Math.hypot(Math.min(x, 127 - x) - 10, Math.min(y, 127 - y) - 10) < 3) setMetal(t, i, STEEL[k], 0.9, 0.95, 0.4); }); },
  smithing_table_bottom: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, x, y, 29, k, false, G('#1e140c', '#2e2016', '#3e2c1e', '#4e3a28')); if (x % 32 === 0) t.col(i, mul(t.get(i), 0.5)); }); },
  loom_front: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, x, y, 30, k, false, WOODP.oak); const inner = x > 18 && x < 110 && y > 22 && y < 100; if (inner) { const th = (x - 18) % 8 < 3; t.col(i, th ? (((x - 18) / 8 | 0) % 3 === 0 ? [0.8, 0.2, 0.2] : ((x - 18) / 8 | 0) % 3 === 1 ? [0.9, 0.85, 0.75] : [0.25, 0.4, 0.75]) : [0.12, 0.08, 0.05]); t.h[i] = th ? 0.6 : 0.2; t.r[i] = 0.95; } if (Math.abs(y - 108) < 6 || Math.abs(y - 16) < 6) { material(t, i, y, x, 31, k, false, WOODP.oak); t.h[i] = 0.8; } }); },
  loom_side: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, x, y, 32, k, false, WOODP.oak); if (x % 32 === 0) t.col(i, mul(t.get(i), 0.45)); if (Math.abs(y - 64) < 6) { material(t, i, y, x, 33, k, false, WOODP.oak); t.col(i, mul(t.get(i), 0.85)); t.h[i] = 0.8; } }); },
  loom_top: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, y, x, 34, k, false, WOODP.oak); if (y % 32 === 0) t.col(i, mul(t.get(i), 0.45)); if (Math.hypot(x - 64, y - 64) < 14) { t.col(i, [0.85, 0.82, 0.74]); t.h[i] = 0.7 + Math.sin(Math.hypot(x - 64, y - 64) * 1.5) * 0.1; } }); },
  loom_bottom: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, y, x, 35, k, false, WOODP.oak); if (y % 32 === 0) t.col(i, mul(t.get(i), 0.45)); }); },
  cartography_table_top: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, x, y, 36, k, false, G('#3e2c1e', '#5a4028', '#765634', '#8e6a40')); if (x > 12 && x < 116 && y > 12 && y < 116) { const grid = (x % 16 === 0 || y % 16 === 0); t.col(i, grid ? [0.72, 0.62, 0.45] : [0.93, 0.87, 0.72].map(v => v - fbm(x, y, 4, 4, 3, 37) * 0.08)); t.h[i] = 0.6; t.r[i] = 0.95; const r = Math.hypot(x - 84, y - 44); if (r < 12) t.col(i, r < 2 ? [0.7, 0.1, 0.1] : [0.6, 0.55, 0.45]); } }); },
  cartography_table_side1: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, x, y, 38, k, false, G('#3e2c1e', '#5a4028', '#765634', '#8e6a40')); if (x % 32 === 0) t.col(i, mul(t.get(i), 0.45)); if (y < 14) { t.col(i, [0.9, 0.84, 0.7]); t.h[i] = 0.7; } }); },
  cartography_table_side2: k => WS.cartography_table_side1(k),
  cartography_table_side3: k => { const t = WS.cartography_table_side1(k); return t.each((x, y, i) => { if (x > 30 && x < 98 && y > 36 && y < 96) { t.col(i, [0.9, 0.84, 0.7].map(v => v - fbm(x, y, 4, 4, 3, 39) * 0.1)); t.h[i] = 0.7; if (Math.abs(x - 64) < 1 || Math.abs(y - 66) < 1) t.col(i, [0.6, 0.5, 0.35]); } }); },
  composter_side: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, y, x, 40, k, false, WOODP.oak); const slat = y % 20; if (slat < 3) { t.col(i, mul(t.get(i), 0.35)); t.h[i] = 0.1; } if (x < 10 || x > 117) { material(t, i, x, y, 41, k, false, WOODP.oak); t.col(i, mul(t.get(i), 0.8)); t.h[i] = 0.8; } }); },
  composter_top: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, y, x, 42, k, false, WOODP.oak); if (edgeDist(x, y) >= 12) { t.a[i] = 0; t.col(i, [0, 0, 0]); } else if (edgeDist(x, y) >= 10) t.col(i, mul(t.get(i), 0.5)); }); },
  composter_bottom: k => { const t = new Tex(); return t.each((x, y, i) => { material(t, i, y, x, 43, k, false, WOODP.oak); if (y % 32 === 0) t.col(i, mul(t.get(i), 0.45)); }); },
};

// ---- cave stones
const CAVE = k => [
  ['tuff', s => rock('tuff', k, s, { speck: true, pores: true })],
  ['polished_tuff', s => masonry('tuff', k, { type: 'slab' }, s)],
  ['tuff_bricks', s => masonry('tuff', k, { type: 'grid', bw: 64, bh: 32, offset: true }, s)],
  ['chiseled_tuff', s => masonry('tuff', k, { type: 'slab' }, s, { motif: t => b2.motifRing(t) })],
  ['chiseled_tuff_top', s => masonry('tuff', k, { type: 'grid', bw: 64, bh: 64 }, s)],
  ['chiseled_tuff_bricks', s => masonry('tuff', k, { type: 'grid', bw: 64, bh: 32, offset: true }, s, { motif: t => b2.motifRing(t) })],
  ['chiseled_tuff_bricks_top', s => masonry('tuff', k, { type: 'grid', bw: 32, bh: 32 }, s)],
  ['calcite', s => rock('calcite', k, s, { speck: true })],
  ['dripstone_block', s => rock('dripstone', k, s, { bands: 7 })],
  ['mud', s => rock('mud', k, s, { wet: true })],
  ['packed_mud', s => rock('mudbrick', k, s, { bands: 3 })],
  ['mud_bricks', s => masonry('mudbrick', k, { type: 'grid', bw: 32, bh: 16, offset: true }, s)],
];

// ---- doors & trapdoors: every wood plus iron and the copper stages
const DOORS = [
  ['door_wood', 'planks_oak'], ['door_spruce', 'planks_spruce'], ['door_birch', 'planks_birch'], ['door_jungle', 'planks_jungle'], ['door_acacia', 'planks_acacia'], ['door_dark_oak', 'planks_big_oak'],
  ['mangrove_door', 'mangrove_planks', 'top'], ['cherry_door', 'cherry_planks', 'top'], ['bamboo_door', 'bamboo_planks', 'top'], ['pale_oak_door', 'pale_oak_planks', 'top'], ['poplar_door', 'poplar_planks', 'top'],
  ['door_iron', null], ['copper_door', 'copper_block', 'top', true], ['exposed_copper_door', 'exposed_copper', 'top', true], ['weathered_copper_door', 'weathered_copper', 'top', true], ['oxidized_copper_door', 'oxidized_copper', 'top', true],
];
const TRAPDOORS = [['trapdoor', 'planks_oak'], ['spruce_trapdoor', 'planks_spruce'], ['birch_trapdoor', 'planks_birch'], ['jungle_trapdoor', 'planks_jungle'], ['acacia_trapdoor', 'planks_acacia'], ['dark_oak_trapdoor', 'planks_big_oak'],
  ['mangrove_trapdoor', 'mangrove_planks'], ['cherry_trapdoor', 'cherry_planks'], ['bamboo_trapdoor', 'bamboo_planks'], ['pale_oak_trapdoor', 'pale_oak_planks'], ['poplar_trapdoor', 'poplar_planks'],
  ['iron_trapdoor', null], ['copper_trapdoor', 'copper_block', true], ['exposed_copper_trapdoor', 'exposed_copper', true], ['weathered_copper_trapdoor', 'weathered_copper', true], ['oxidized_copper_trapdoor', 'oxidized_copper', true]];

// ---------------------------------------------------------------- build
//   node batch3.js <bedrock-samples/resource_pack> [--preview=<dir>]   (styles come from choices.json)
const vanillaArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (vanillaArg && require.main === module) {
  const { readImage } = require('./imageio');
  const choices = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')), VB = path.join(vanillaArg, 'textures', 'blocks');
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = {};
  const exts = name => ['png', 'tga'].filter(e => fs.existsSync(path.join(VB, `${name}.${e}`)));
  const meanOf = name => { const e = exts(name); if (!e.length) return null; const im = readImage(path.join(VB, `${name}.${e[0]}`)); let r = 0, gg = 0, b = 0, k = 0; for (let i = 0; i < im.w * Math.min(im.w, im.h); i++) if (im.data[i * 4 + 3] > 127) { r += im.data[i * 4]; gg += im.data[i * 4 + 1]; b += im.data[i * 4 + 2]; k++; } return [r / k / 255, gg / k / 255, b / k / 255]; };
  const palFrom = (c, k) => k.map((s, i) => [i / (k.length - 1), c.map(v => clamp(v * s))]);
  let count = 0;
  const put = (fam, name, t, cutout) => { // save in vanilla's format(s); every override ships its own lighting maps
    const e = exts(name); if (!e.length) { console.warn('skip (not in vanilla):', name); return; }
    if (e.includes('tga')) g.save(t, name, { tga: true });
    if (e.includes('png')) g.save(t, name, { alpha: !!cutout, pbr: !e.includes('tga') });
    listed.add('blocks/' + name); count++;
    (previews[fam] = previews[fam] || []).push(texToRGBA(t));
  };
  const spriteTex = (name, key, tint) => {
    const { rgba, mers } = it.render(name, PLANTS[name](), 300 + count * 11, { style: ITEM_STYLE[key], write: false, rimW: 1, withMers: true });
    const t = new Tex();
    for (let i = 0; i < N * N; i++) {
      t.col(i, [0, 1, 2].map(c => rgba[i * 4 + c] / 255 * (tint ? tint[c] : 1))); t.a[i] = rgba[i * 4 + 3] / 255;
      t.m[i] = mers[i * 4] / 255; t.e[i] = mers[i * 4 + 1] / 255; t.r[i] = mers[i * 4 + 2] / 255 || 0.8; t.h[i] = t.a[i] ? 0.6 : 0;
    }
    return t;
  };
  if (choices.plants) {
    for (const name of Object.keys(PLANTS)) put('plants', name, spriteTex(name, choices.plants), true);
    for (const [name, src] of Object.entries(CARRIED)) { const tint = meanOf(name); put('plants', name, spriteTex(src, choices.plants, tint && tint.map(v => clamp(v / 0.62, 0, 1.4))), true); }
  }
  if (choices.doors) {
    const k = choices.doors;
    for (const [base, planks, naming, copper] of DOORS) {
      const c = planks && meanOf(planks), pal = c ? palFrom(c, [0.62, 0.82, 1, 1.15]) : WOODP.oak;
      METAL_OVERRIDE = copper && c ? palFrom(c, [0.5, 0.82, 1.05, 1.3]) : null;
      const [up, low] = naming === 'top' ? ['_top', '_bottom'] : ['_upper', '_lower'];
      put('doors', base + up, door(k, 'upper', !planks || copper, pal, 51).bake(STYLE[k].light), true);
      put('doors', base + low, door(k, 'lower', !planks || copper, pal, 52).bake(STYLE[k].light), true);
    }
    for (const [name, planks, copper] of TRAPDOORS) {
      const c = planks && meanOf(planks), pal = c ? palFrom(c, [0.62, 0.82, 1, 1.15]) : WOODP.oak;
      METAL_OVERRIDE = copper && c ? palFrom(c, [0.5, 0.82, 1.05, 1.3]) : null;
      put('doors', name, trapdoor(k, !planks || copper, pal, 53).bake(STYLE[k].light), true);
    }
    METAL_OVERRIDE = null;
  }
  if (choices.workstations) for (const [name, fn] of Object.entries(WS)) put('workstations', name, fn(choices.workstations).bake(STYLE[choices.workstations].light), name === 'composter_top');
  if (choices.cave_stones) CAVE(choices.cave_stones).forEach(([name, fn], k) => put('cave_stones', name, fn(9500 + k * 41).bake(STYLE[choices.cave_stones].light)));
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); for (const [fam, tiles] of Object.entries(previews)) b2.grid(path.join(previewDir, `batch3_${fam}.png`), tiles, 10); }
  console.log(`Batch 3: ${count} textures.`);
}

module.exports = { PLANTS, PM, TINT, door, trapdoor, barrelSide, barrelTop, smokerFront, blastFront, smithingFront, rock, WOODP, STEEL, BRASS, SAMPLES, WS, CAVE };
