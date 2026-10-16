'use strict';
// USTP batch 6: nature extras, End dimension, dyes & brewing, boats/minecarts/signs
//   A Clean Modern · B Natural Realistic · C Bold
//   node batch6.js <bedrock-samples/resource_pack> --samples=<dir>   → labelled A/B/C comparison sheets
//   node batch6.js <bedrock-samples/resource_pack> [--preview=<dir>] → build the styles in choices.json
// Colours for potions, dyes, boats and signs are sampled from the vanilla textures, so it needs the vanilla path for both.
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const it = require('./items.js');
const b2 = require('./batch2.js');
const { readImage } = require('./imageio');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mk } = it;
const { STYLE, PAL, masonry, sheet, texToRGBA } = b2;
const N = 128, ifbm = it.fbm, ITEM_STYLE = { A: 'modern', B: 'realistic', C: 'bold' };
const ORG = (base, dark, light, extra = {}) => mk({ kind: 'organic', base, dark, light, metal: 0, rough: 0.6, gloss: 20, spec: 0.3, ...extra });
const ORGc = (c, extra = {}) => mk({ kind: 'organic', base: c, dark: c.map(v => v * 0.3), light: c.map(v => clamp(v * 0.4 + 0.65)), metal: 0, rough: 0.5, gloss: 24, spec: 0.4, ...extra });
const polyline = (x, y, pts, r) => Math.min(...pts.slice(1).map((p, k) => sdSeg(x, y, pts[k][0], pts[k][1], p[0], p[1], r)));
const rotE = (x, y, cx, cy, rx, ry, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, rx, ry); };
const ball = (cx, cy, r, mat, extra = {}) => ({ d: P => sdCircle(P.x, P.y, cx, cy, r), mat, profile: 'round', bw: r, z: 1, ...extra });

const VARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const VT = VARG ? path.join(VARG, 'textures') : null;
// mean colour of a vanilla texture; `vivid` keeps only saturated pixels (the liquid in a potion, not its glass)
function vanillaColour(rel, vivid = false) {
  if (!VT) return null;
  const f = ['png', 'tga'].map(e => path.join(VT, `${rel}.${e}`)).find(fs.existsSync); if (!f) return null;
  const im = readImage(f); let r = 0, gg = 0, b = 0, k = 0;
  for (let i = 0; i < im.w * Math.min(im.w, im.h); i++) {
    const a = im.data[i * 4 + 3], R = im.data[i * 4] / 255, Gc = im.data[i * 4 + 1] / 255, B = im.data[i * 4 + 2] / 255;
    if (a < 128) continue;
    const w = vivid ? (Math.max(R, Gc, B) - Math.min(R, Gc, B)) ** 3 : 1;   // vivid: let the most saturated pixels decide
    r += R * w; gg += Gc * w; b += B * w; k += w;
  }
  if (!k || (vivid && k < 1e-3)) return null;
  let c = [r / k, gg / k, b / k];
  if (vivid) { // liquids read best bright and saturated
    const mx = Math.max(...c) || 1, l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    c = c.map(v => l + (v - l) * 1.25).map(v => clamp(v * 0.92 / mx));
  }
  return c;
}

// ---------------------------------------------------------------- nature extras (sprites + blocks)
const NM = {
  grey: ORG('#b4b4b4', '#3a3a3a', '#ffffff', { gloss: 14, spec: 0.2, mottle: 0.2 }),             // biome-tinted
  stemW: ORG('#e8e0cc', '#7a7060', '#ffffff', { gloss: 10, spec: 0.15 }),
  capRed: ORG('#d01e1e', '#4a0404', '#fff0f0', { gloss: 40, spec: 0.6 }),
  capBrown: ORG('#9a6a44', '#3a2412', '#f0d0b0', { gloss: 18, spec: 0.25, mottle: 0.25 }),
  dot: ORG('#f4f0e8', '#8a8680', '#ffffff', { gloss: 20, spec: 0.3 }),
  leaf: ORG('#3e8a2a', '#123a0a', '#e0ffd0', { gloss: 18, spec: 0.25, mottle: 0.2 }),
  berry: ORG('#c8203a', '#4a0410', '#fff0f4', { gloss: 60, spec: 0.9 }),
  lichen: ORG('#7a8a7a', '#2a3a2e', '#e0f0e4', { gloss: 10, spec: 0.15, mottle: 0.4 }),
  glowDot: ORG('#c8ffe8', '#4aa888', '#ffffff', { gloss: 30, spec: 0.5, emis: 1 }),
  root: ORG('#a88a6a', '#4a3420', '#f0e0c8', { gloss: 8, spec: 0.1 }),
};
const SPRITES = {
  vine: () => [[20, 0], [58, 0], [96, 0]].flatMap(([x0], k) => {
    const pts = Array.from({ length: 9 }, (_, j) => [x0 + Math.sin(j * 0.9 + k) * 10, j * 16]);
    const leaves = pts.slice(1).flatMap(([x, y], j) => [[x + 9, y - 4, 0.6], [x - 9, y + 4, -0.6]].map(([lx, ly, a]) => [lx, ly, a + (j % 2 ? 0.3 : -0.3)]));
    return [{ d: P => Math.min(polyline(P.x, P.y, pts, 1.8), ...leaves.map(([lx, ly, a]) => rotE(P.x, P.y, lx, ly, 9, 6, a))), mat: NM.grey, profile: 'round', bw: 4, z: 1 + k * 0.3 }];
  }),
  waterlily: () => [{ d: P => Math.max(sdCircle(P.x, P.y, 64, 64, 56), -sdPoly(P.x, P.y, [[64, 64], [128, 30], [128, 56]])), mat: NM.grey, profile: 'bevel', bw: 4, z: 1,
    deco: P => (Math.abs(Math.sin(Math.atan2(P.y - 64, P.x - 64) * 7)) < 0.05 && Math.hypot(P.x - 64, P.y - 64) > 8 ? { dh: -0.6, dark: 0.25 } : null) }],
  mushroom_red: () => [{ d: P => sdBox(P.x, P.y, 64, 96, 9, 28, 6), mat: NM.stemW, profile: 'round', bw: 8, z: 1 }, { d: P => Math.max(sdEllipse(P.x, P.y, 64, 74, 46, 40), P.y - 74), mat: NM.capRed, profile: 'round', bw: 22, z: 3 },
    ...[[46, 52, 6], [70, 44, 7], [84, 62, 5], [56, 66, 4]].map(([x, y, r]) => ball(x, y, r, NM.dot, { z: 20 }))],
  mushroom_brown: () => [{ d: P => sdBox(P.x, P.y, 64, 98, 8, 26, 6), mat: NM.stemW, profile: 'round', bw: 8, z: 1 }, { d: P => Math.max(sdEllipse(P.x, P.y, 64, 76, 50, 22), P.y - 80), mat: NM.capBrown, profile: 'round', bw: 14, z: 3 }],
  sweet_berry_bush_stage0: () => berryBush(0), sweet_berry_bush_stage1: () => berryBush(1), sweet_berry_bush_stage2: () => berryBush(2), sweet_berry_bush_stage3: () => berryBush(3),
  glow_lichen: () => { const pts = []; for (let k = 0; k < 26; k++) pts.push([12 + h2(71, k, 1) * 104, 12 + h2(71, k, 2) * 104, 6 + h2(71, k, 3) * 8]);
    return [{ d: P => Math.min(...pts.map(([x, y, r]) => sdCircle(P.x, P.y, x, y, r))) + (ifbm(P.x * 0.2, P.y * 0.2, 4) - 0.5) * 6, mat: NM.lichen, profile: 'round', bw: 4, z: 1 }, ...pts.filter((_, k) => k % 3 === 0).map(([x, y]) => ball(x, y, 2.5, NM.glowDot, { z: 10 }))]; },
  hanging_roots: () => [20, 40, 58, 76, 96, 110].map((x, k) => ({ d: P => polyline(P.x, P.y, [[x, 0], [x + 4, 40], [x - 3, 80], [x + 2, 110 - (k % 3) * 18]], 2.2), mat: NM.root, profile: 'round', bw: 2.2, z: 1 + k * 0.1 })),
};
function berryBush(stage) {
  const leaves = [[34, 96, 18], [64, 84, 22], [94, 96, 18], [46, 64, 16], [82, 62, 16], [64, 46, 14]].slice(0, 2 + stage + (stage > 1 ? 1 : 0));
  const berries = stage < 2 ? [] : [[40, 80], [70, 70], [88, 88], [56, 100], [78, 50], [48, 56]].slice(0, stage === 2 ? 3 : 6);
  return [
    { d: P => Math.min(...[[64, 128, 40, 70], [64, 128, 88, 66], [64, 128, 64, 44]].map(([a, b, c, d]) => sdSeg(P.x, P.y, a, b, c, d, 2.4))), mat: NM.root, profile: 'round', bw: 2, z: 1 },
    ...leaves.map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y + (3 - stage) * 10, r * (0.6 + stage * 0.13)) + (ifbm(P.x * 0.2, P.y * 0.2, 5 + k) - 0.5) * 7, mat: NM.leaf, profile: 'round', bw: 8, z: 2 + k * 0.2 })),
    ...berries.map(([x, y]) => ball(x, y, 6, stage === 2 ? ORG('#4a8a2a', '#123a0a', '#e0ffd0', { gloss: 40, spec: 0.6 }) : NM.berry, { z: 10 })),
  ];
}
const TINTED_SPRITES = { vine: [0.42, 0.6, 0.22], waterlily: [0.34, 0.55, 0.2] };   // preview-only tints
PAL.mushRed = { A: G('#9a1010', '#c01a1a', '#d82626', '#e84040'), B: G('#7a0808', '#a01414', '#c02020', '#d83434', '#e85050'), C: G('#7a0000', '#c00000', '#ff2020', '#ff6060') };
PAL.mushBrown = { A: G('#6a4a30', '#7e5a3c', '#926a48', '#a67c56'), B: G('#4e3420', '#6a4830', '#865c3e', '#a07250'), C: G('#4a2a10', '#7a4a20', '#a86a30', '#d89048') };
PAL.mushStem = { A: G('#c8c0aa', '#d8d0bc', '#e8e2d0', '#f4f0e4'), B: G('#a8a08a', '#c0b8a0', '#d4ccb4', '#e6dfca'), C: G('#c8b890', '#e0d4b0', '#f0e8d0', '#ffffff') };
PAL.moss = { A: G('#3e6a1e', '#4e8226', '#5e9a30', '#72b23c'), B: G('#2a4e12', '#3e6a1c', '#548626', '#6aa232'), C: G('#1a5a0a', '#2e8a12', '#4ac01e', '#80f040') };
function mushSkin(k, s, pal, spots) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const n = fbm(x, y, 6, 6, 4, s); let v = 0.5 + (n - 0.5) * (k === 'B' ? 0.5 : 0.2), h = 0.5 + (n - 0.5) * 0.2;
    t.col(i, grad(PAL[pal][k], v)); t.r[i] = k === 'A' ? 0.4 : 0.8;
    if (spots) { const w = worley(x, y, 5, s + 2); if (w.f1 < 0.22 && h2(s, w.id, 1) < 0.6) { t.col(i, mix([0.95, 0.93, 0.88], [1, 1, 1], 1 - w.f1 / 0.22)); h = 0.75; } }
    t.h[i] = h;
  });
}
function mushStem(k, s) { const t = new Tex(); return t.each((x, y, i) => { const f = fbm(x, y, 24, 2, 3, s); t.col(i, grad(PAL.mushStem[k], 0.3 + f * 0.6)); t.h[i] = 0.4 + f * 0.3; t.r[i] = 0.8; }); }
function mushInside(k, s) { const t = new Tex(); return t.each((x, y, i) => { const w = worley(x, y, 18, s), p = w.f1 < 0.2; t.col(i, p ? [0.72, 0.58, 0.52] : grad(G('#d8c0b0', '#e8d4c4', '#f4e6d8'), 0.4 + fbm(x, y, 6, 6, 3, s) * 0.5)); t.h[i] = p ? 0.3 : 0.6; t.r[i] = 0.9; }); }
function mossBlock(k, s) { const t = new Tex(); return t.each((x, y, i) => { const w = worley(x, y, 22, s), tuft = 1 - Math.min(1, w.f1 / 0.5), n = fbm(x, y, 8, 8, 3, s + 1); t.col(i, grad(PAL.moss[k], 0.2 + tuft * 0.55 + (n - 0.5) * (k === 'B' ? 0.4 : 0.15))); t.h[i] = 0.3 + tuft * 0.5; t.r[i] = 0.95; }); }

// ---------------------------------------------------------------- End dimension
Object.assign(PAL, {
  endstone: { A: G('#d8d49c', '#e2deaa', '#eae6b8', '#f2efc8'), B: G('#c4bc84', '#d4cc94', '#e0daa6', '#ece6b8', '#f6f2cc'), C: G('#b8a860', '#d8cc80', '#f0e8a8', '#fffbd8') },
  purpur: { A: G('#8a5a8a', '#9a6a9a', '#aa7aaa', '#ba8cba'), B: G('#6e446e', '#865a86', '#9e6e9e', '#b484b4', '#c69ac6'), C: G('#5a1a6a', '#8a3aa0', '#b860d0', '#e8a0ff') },
  endframe: { A: G('#2e5a4e', '#3a6e60', '#468272', '#549684'), B: G('#1e4238', '#2c5a4c', '#3a7060', '#4a8674'), C: G('#06362e', '#0e5a4a', '#1a8a70', '#30c09a') },
  chorus: { A: G('#6a4a7a', '#7e5a8e', '#926ea2', '#a684b6'), B: G('#4e3260', '#664878', '#7e5e90', '#9676a8'), C: G('#4a1a6a', '#7a3aa0', '#a860d0', '#d8a0ff') },
});
function endStone(k, s) {
  const t = new Tex(), st = STYLE[k];
  return t.each((x, y, i) => {
    const f = b2.surface(x, y, s, st); let v = f.v, h = f.h;
    const p = worley(x, y, 20, s + 6); if (p.f1 < (k === 'A' ? 0.1 : 0.16)) { v -= 0.3; h = 0.15; }
    t.col(i, grad(PAL.endstone[k], v)); t.h[i] = clamp(k === 'A' ? 0.5 + (h - 0.5) * 0.5 : h); t.r[i] = st.rough;
  });
}
function purpurPillar(k, s) { const t = masonry('purpur', k, { type: 'columns', cw: 32, ch: N }, s); return t; }
function purpurTop(k, s) { const t = masonry('purpur', k, { type: 'slab' }, s); return t.each((x, y, i) => { const e = edgeDist(x, y); if (e === 20 || e === 21 || e === 40 || e === 41) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.2; } }); }
function endframe(k, s, part) {
  const t = masonry('endframe', k, { type: 'slab' }, s);
  return t.each((x, y, i) => {
    if (part === 'side') { if (y > 80) { const f = b2.surface(x, y, s + 3, STYLE[k]); t.col(i, grad(PAL.endstone[k], f.v)); t.h[i] = f.h; t.m[i] = 0; } else if (y > 74) { t.col(i, mul(t.get(i), 0.5)); t.h[i] = 0.2; } }
    if (part === 'top') { const d = Math.max(Math.abs(x - 63.5), Math.abs(y - 63.5)); if (d < 26) { t.col(i, [0.05, 0.08, 0.07]); t.h[i] = 0.05; } else if (d < 32) { t.col(i, mul(t.get(i), 1.25)); t.h[i] = 0.85; } }
  });
}
function chorus(k, s, part) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const n = fbm(x, y, 6, 6, 4, s), w = worley(x, y, 10, s + 1);
    let v = 0.3 + n * 0.5 + (w.f2 - w.f1 < 0.06 ? -0.2 : 0);
    if (part === 'flower') v = 0.5 + (1 - Math.min(1, w.f1 / 0.5)) * 0.4;
    t.col(i, part === 'dead' ? mul(grad(PAL.chorus[k], v), 0.6) : grad(PAL.chorus[k], v + (part === 'flower' ? 0.2 : 0))); t.h[i] = 0.3 + v * 0.5; t.r[i] = 0.7;
  });
}

// ---------------------------------------------------------------- dyes & brewing (items)
const GLASS = ORG('#d8eef4', '#5a7a88', '#ffffff', { gloss: 90, spec: 1.2, mottle: 0.05 });
const CORK = ORG('#a87a4a', '#3e2810', '#f0d0a0', { gloss: 8, spec: 0.1, mottle: 0.4 });
function bottle(kind, liquid, opts = {}) { // kind: drinkable | splash | lingering
  const body = kind === 'lingering' ? (P => Math.min(sdPoly(P.x, P.y, [[50, 40], [78, 40], [104, 108], [24, 108]]), sdBox(P.x, P.y, 64, 108, 40, 6, 6)))
    : kind === 'splash' ? (P => Math.min(sdCircle(P.x, P.y, 64, 80, 34), sdBox(P.x, P.y, 64, 42, 13, 14, 4))) : (P => Math.min(sdCircle(P.x, P.y, 64, 80, 36), sdBox(P.x, P.y, 64, 38, 10, 16, 3)));
  const fillTop = kind === 'lingering' ? 64 : 62;
  return [
    ...(kind === 'splash' ? [{ d: P => Math.abs(sdCircle(P.x, P.y, 98, 70, 16)) - 3.5, mat: GLASS, profile: 'round', bw: 3.5, z: 0.5 }] : []),
    { d: body, mat: GLASS, profile: 'round', bw: 28, z: 1 },
    ...(liquid ? [{ d: P => Math.max(body(P) + 4, fillTop - P.y), mat: liquid, profile: 'round', bw: 24, z: 3, paint: opts.paint }] : []),
    ...(opts.overlayOnly ? [] : [{ d: P => sdBox(P.x, P.y, 64, kind === 'splash' ? 24 : 20, kind === 'splash' ? 15 : 12, 7, 2), mat: CORK, profile: 'bevel', bw: 2.5, z: 8 }]),
  ];
}
const xpLiquid = ORG('#7ae82a', '#1a5a04', '#f8ffd0', { gloss: 60, spec: 0.9, emis: 0.7 });
function dye(c) { // a glossy paint droplet
  const m = ORGc(c, { gloss: 60, spec: 0.8 });
  return [{ d: P => Math.min(sdCircle(P.x, P.y, 64, 78, 32), sdPoly(P.x, P.y, [[64, 18], [92, 66], [36, 66]])), mat: m, profile: 'round', bw: 28, z: 1 }];
}
const DYE_SPECIAL = {
  dye_powder_black: () => [{ d: P => sdEllipse(P.x, P.y, 64, 62, 34, 38), mat: ORG('#1e1e2a', '#04040a', '#8a8aa8', { gloss: 50, spec: 0.7 }), profile: 'round', bw: 26, z: 1 },
    { d: P => Math.min(...[44, 58, 72, 86].map(x => sdSeg(P.x, P.y, x, 92, x + (x - 64) * 0.3, 118, 3.5))), mat: ORG('#2a2a38', '#06060c', '#8a8aa8'), profile: 'round', bw: 3, z: 0.5 }],
  dye_powder_glow: () => [{ d: P => sdEllipse(P.x, P.y, 64, 62, 34, 38), mat: ORG('#1aa89a', '#033a34', '#c8fff6', { gloss: 50, spec: 0.7, emis: 0.6 }), profile: 'round', bw: 26, z: 1 },
    { d: P => Math.min(...[44, 58, 72, 86].map(x => sdSeg(P.x, P.y, x, 92, x + (x - 64) * 0.3, 118, 3.5))), mat: ORG('#16806e', '#033a34', '#c8fff6', { emis: 0.4 }), profile: 'round', bw: 3, z: 0.5 }],
  dye_powder_brown: () => [[44, 74, -0.5], [72, 58, 0.3], [78, 90, 1.1]].map(([x, y, a], k) => ({ d: P => rotE(P.x, P.y, x, y, 22, 13, a), mat: ORG('#6a3e1e', '#1e0e04', '#e0b088', { gloss: 30, spec: 0.5 }), profile: 'round', bw: 11, z: 1 + k,
    deco: P => (Math.abs(rotE(P.x, P.y, x, y, 18, 0.01, a)) < 0.8 ? { dh: -0.8, dark: 0.4 } : null) })),
  dye_powder_white: () => { const out = []; for (let k = 0; k < 140; k++) { const x = 20 + h2(77, k, 1) * 88, y = 46 + h2(77, k, 2) * 66, r = 5.5 + h2(77, k, 3) * 3; if (sdEllipse(x, y, 64, 94, 44, 32) < 0 && y > 94 - (44 - Math.abs(x - 64)) * 0.95) out.push([x, y, r]); }
    return [{ d: P => Math.min(...out.map(([x, y, r]) => sdCircle(P.x, P.y, x, y, r))), mat: ORG('#f0eee8', '#8a8880', '#ffffff', { gloss: 10, spec: 0.15, mottle: 0.3, grain: 1.5 }), profile: 'round', bw: 4, z: 1 }]; },
};

// ---------------------------------------------------------------- boats, minecarts, signs (items)
const METALI = 'iron';
function boat(c, chest) {
  const wood = ORGc(c, { gloss: 14, spec: 0.25, mottle: 0.25 }), dark = ORGc(c.map(v => v * 0.5), { gloss: 10, spec: 0.15 });
  return [
    { d: P => sdPoly(P.x, P.y, [[8, 62], [120, 62], [104, 96], [26, 96]]), mat: wood, profile: 'bevel', bw: 6, z: 1, deco: P => (Math.abs(P.y - 74) < 1 || Math.abs(P.y - 86) < 1 ? { dh: -1, dark: 0.35 } : null) },
    { d: P => sdEllipse(P.x, P.y, 64, 63, 54, 6), mat: dark, profile: 'bevel', bw: 2, z: 3 },
    { d: P => Math.min(sdSeg(P.x, P.y, 30, 40, 50, 76, 2.5), sdSeg(P.x, P.y, 98, 40, 78, 76, 2.5)), mat: wood, profile: 'round', bw: 2.5, z: 0.5 },
    ...(chest ? [{ d: P => sdBox(P.x, P.y, 82, 46, 18, 14, 2), mat: ORG('#9a6a30', '#3a2008', '#f0c880', { gloss: 12, spec: 0.2 }), profile: 'bevel', bw: 3, z: 6, deco: P => (Math.abs(P.y - 44) < 1 ? { dh: -1, dark: 0.4 } : null) },
      { d: P => sdBox(P.x, P.y, 82, 47, 3, 4, 1), mat: METALI, profile: 'bevel', bw: 1.5, z: 8 }] : []),
  ];
}
function raft(c) { const wood = ORGc(c, { gloss: 18, spec: 0.3 }); return [26, 42, 58, 74, 90, 106].map((x, k) => ({ d: P => sdBox(P.x, P.y, x, 78, 7, 26, 6), mat: wood, profile: 'round', bw: 6, z: 1 + k * 0.1, deco: P => (Math.abs(P.y - 70) < 1.5 ? { dh: -0.8, dark: 0.4 } : null) })); }
function cart(content) {
  const body = [{ d: P => sdPoly(P.x, P.y, [[14, 54], [114, 54], [104, 100], [24, 100]]), mat: METALI, profile: 'bevel', bw: 6, z: 1, deco: P => (Math.abs(P.y - 70) < 1 ? { dh: -1, dark: 0.35 } : null) },
    ...[38, 90].map(x => ({ d: P => sdCircle(P.x, P.y, x, 104, 11), mat: 'carbon', profile: 'round', bw: 8, z: 4 }))];
  const box = (mat, deco) => ({ d: P => sdBox(P.x, P.y, 64, 40, 32, 22, 2), mat, profile: 'bevel', bw: 4, z: 6, deco });
  return [...body, ...{
    chest: [box(ORG('#9a6a30', '#3a2008', '#f0c880', { gloss: 12, spec: 0.2 }), P => (Math.abs(P.y - 36) < 1 ? { dh: -1, dark: 0.4 } : null))],
    furnace: [box(ORG('#7a7a80', '#2a2a2e', '#e0e0e8', { gloss: 10, spec: 0.15, mottle: 0.3 })), { d: P => sdBox(P.x, P.y, 64, 44, 14, 8, 1), mat: ORG('#ff7a1a', '#6a1a00', '#fff0b0', { emis: 0.9 }), profile: 'bevel', bw: 2, z: 9 }],
    hopper: [{ d: P => sdPoly(P.x, P.y, [[30, 18], [98, 18], [76, 54], [52, 54]]), mat: 'steel', profile: 'bevel', bw: 4, z: 6 }],
    tnt: [box(ORG('#d02a1e', '#4a0804', '#ffd0c8', { gloss: 14, spec: 0.2 }), P => (Math.abs(P.y - 40) < 7 ? { dh: 0.6 } : null)), { d: P => sdBox(P.x, P.y, 64, 40, 32, 6, 1), mat: ORG('#f0ece4', '#8a8680', '#ffffff'), profile: 'bevel', bw: 1.5, z: 8 }],
    command_block: [box(ORG('#c88a4a', '#4a2a10', '#ffe0b8', { gloss: 18, spec: 0.3 })), { d: P => Math.abs(sdBox(P.x, P.y, 64, 40, 18, 10, 2)) - 2, mat: ORG('#3a3a40', '#0a0a0c', '#a0a0a8'), profile: 'round', bw: 2, z: 9 }],
  }[content]];
}
function sign(c, hanging) {
  const wood = ORGc(c, { gloss: 14, spec: 0.25, mottle: 0.25 });
  const lines = P => ([46, 58, 70].some(y => Math.abs(P.y - (hanging ? y + 14 : y)) < 1.2 && P.x > 34 && P.x < 94) ? { dh: -0.8, dark: 0.45 } : null);
  return hanging
    ? [{ d: P => sdBox(P.x, P.y, 64, 16, 50, 6, 2), mat: wood, profile: 'bevel', bw: 2.5, z: 1 }, { d: P => Math.min(sdSeg(P.x, P.y, 34, 20, 34, 38, 2), sdSeg(P.x, P.y, 94, 20, 94, 38, 2)), mat: 'steel', profile: 'round', bw: 2, z: 2 },
      { d: P => sdBox(P.x, P.y, 64, 70, 44, 30, 4), mat: wood, profile: 'bevel', bw: 5, z: 3, deco: lines }]
    : [{ d: P => sdBox(P.x, P.y, 64, 98, 6, 28, 2), mat: wood, profile: 'bevel', bw: 2.5, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 56, 48, 30, 4), mat: wood, profile: 'bevel', bw: 5, z: 3, deco: lines }];
}

// ---------------------------------------------------------------- families
const BLOCKS = {
  nature: k => [
    ['mushroom_block_skin_red', s => mushSkin(k, s, 'mushRed', true)], ['mushroom_block_skin_brown', s => mushSkin(k, s, 'mushBrown', false)],
    ['mushroom_block_skin_stem', s => mushStem(k, s)], ['mushroom_block_inside', s => mushInside(k, s)], ['moss_block', s => mossBlock(k, s)],
  ],
  end: k => [
    ['end_stone', s => endStone(k, s)], ['end_bricks', s => masonry('endstone', k, { type: 'grid', bw: 32, bh: 16, offset: true }, s)],
    ['purpur_block', s => masonry('purpur', k, { type: 'grid', bw: 64, bh: 64 }, s)], ['purpur_pillar', s => purpurPillar(k, s)], ['purpur_pillar_top', s => purpurTop(k, s)],
    ['endframe_side', s => endframe(k, s, 'side')], ['endframe_top', s => endframe(k, s, 'top')],
    ['chorus_plant', s => chorus(k, s, 'plant')], ['chorus_flower', s => chorus(k, s, 'flower')], ['chorus_flower_dead', s => chorus(k, s, 'dead')],
  ],
};
function itemDesigns(fam) { // name → () => parts; colours come from vanilla
  const out = {};
  if (fam === 'nature') for (const n of Object.keys(SPRITES)) out[n] = SPRITES[n];
  if (fam === 'brewing') {
    const names = VT ? fs.readdirSync(path.join(VT, 'items')).filter(f => /^potion_bottle.*\.png$/.test(f)).map(f => f.slice(0, -4)) : ['potion_bottle_heal', 'potion_bottle_splash_poison', 'potion_bottle_lingering_nightVision'];
    for (const n of names) {
      const kind = n.includes('lingering') ? 'lingering' : n.includes('splash') ? 'splash' : 'drinkable', empty = /_empty$/.test(n);
      out[n] = () => { const c = vanillaColour('items/' + n, true) || [0.25, 0.45, 0.95]; return bottle(kind, empty ? null : ORGc(c, { gloss: 70, spec: 1, emis: 0.15 })); };
    }
    out.potion_overlay = () => bottle('drinkable', ORG('#c8c8c8', '#3a3a3a', '#ffffff', { gloss: 70, spec: 1 }), { overlayOnly: true }).slice(1, 2).map(p => ({ ...p, d: P => Math.max(Math.min(sdCircle(P.x, P.y, 64, 80, 36), sdBox(P.x, P.y, 64, 38, 10, 16, 3)) + 4, 62 - P.y) }));
    out.experience_bottle = () => bottle('drinkable', xpLiquid, { paint: P => mix(xpLiquid.base, [1, 1, 0.6], sstep(0.6, 0.9, ifbm(P.x * 0.12, P.y * 0.12, 3))) });
    out.nether_wart = () => [[50, 60, 16], [76, 56, 17], [62, 84, 18], [40, 86, 12], [88, 84, 12]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.25, P.y * 0.25, 9 + k) - 0.5) * 7, mat: ORG('#a01826', '#3a0408', '#ffc0c8', { gloss: 30, spec: 0.4 }), profile: 'round', bw: r * 0.8, z: 1 + k }));
    out.sugar = () => DYE_SPECIAL.dye_powder_white().map(p => ({ ...p, mat: mk({ kind: 'gem', base: '#f4f4f8', dark: '#9a9aa8', light: '#ffffff', metal: 0, rough: 0.1, emis: 0 }) }));
    const dyes = VT ? fs.readdirSync(path.join(VT, 'items')).filter(f => /^dye_powder_.*\.png$/.test(f)).map(f => f.slice(0, -4)) : ['dye_powder_red'];
    for (const n of dyes) if (n !== 'dye_powder_blue') out[n] = DYE_SPECIAL[n] || (() => dye(vanillaColour('items/' + n) || [0.8, 0.2, 0.2]));
  }
  if (fam === 'vehicles') {
    const items = VT ? fs.readdirSync(path.join(VT, 'items')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)) : ['boat_oak', 'oak_chest_boat', 'sign', 'oak_hanging_sign', 'minecart_chest'];
    const col = n => vanillaColour('items/' + n) || [0.6, 0.45, 0.28];
    for (const n of items) {
      if (/^boat_|_boat$/.test(n) && !/chest/.test(n)) out[n] = () => boat(col(n), false);
      else if (/_chest_boat$/.test(n)) out[n] = () => boat(col(n), true);
      else if (n === 'bamboo_raft') out[n] = () => raft(col(n));
      else if (/^sign(_|$)|_sign$/.test(n) && !/hanging/.test(n)) out[n] = () => sign(col(n), false);
      else if (/_hanging_sign$/.test(n)) out[n] = () => sign(col(n), true);
      else if (/^minecart_(chest|furnace|hopper|tnt|command_block)$/.test(n)) out[n] = () => cart(n.slice(9));
    }
  }
  return out;
}
const SAMPLES = {
  nature: ['vine', 'waterlily', 'mushroom_red', 'mushroom_block_skin_red', 'sweet_berry_bush_stage3'],
  end: ['end_stone', 'end_bricks', 'purpur_block', 'purpur_pillar', 'endframe_top'],
  brewing: ['potion_bottle_heal', 'potion_bottle_splash_poison', 'potion_bottle_lingering_nightVision', 'dye_powder_red', 'experience_bottle'],
  vehicles: ['boat_oak', 'oak_chest_boat', 'minecart_chest', 'sign', 'oak_hanging_sign'],
};
const BLOCK_NAMES = new Set(Object.values(BLOCKS).flatMap(f => f('A').map(e => e[0])));
function renderSample(fam, name, key, k) {
  if (BLOCK_NAMES.has(name)) { const e = BLOCKS[fam](key).find(x => x[0] === name); return texToRGBA(e[1](8000 + k * 23).bake(STYLE[key].light)); }
  const parts = itemDesigns(fam)[name](), rgba = it.render(name, parts, 1000 + k * 7, { style: ITEM_STYLE[key], write: false, rimW: fam === 'nature' ? 1 : undefined });
  const tint = TINTED_SPRITES[name]; if (tint) for (let p = 0; p < rgba.length; p += 4) for (let c = 0; c < 3; c++) rgba[p + c] = Math.round(rgba[p + c] * tint[c]);
  return rgba;
}

const samplesDir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
if (samplesDir && require.main === module) {
  fs.mkdirSync(samplesDir, { recursive: true });
  for (const [fam, names] of Object.entries(SAMPLES)) sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => ({ key, tiles: names.map((n, k) => renderSample(fam, n, key, k)) })));
  console.log('Wrote batch 6 comparison sheets to', samplesDir);
}

if (VARG && !samplesDir && require.main === module) {
  const choices = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8'));
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = {};
  const exts = rel => ['png', 'tga'].filter(e => fs.existsSync(path.join(VT, `${rel}.${e}`)));
  let nb = 0, ni = 0;
  for (const fam of ['nature', 'end', 'brewing', 'vehicles']) {
    const key = choices[fam]; if (!key) continue;
    for (const [name, fn] of BLOCKS[fam] ? BLOCKS[fam](key) : []) {
      if (!exts('blocks/' + name).length) { console.warn('skip (not in vanilla):', name); continue; }
      const t = fn(14000 + nb * 31).bake(STYLE[key].light); g.save(t, name); listed.add('blocks/' + name); nb++;
      (previews[fam] = previews[fam] || []).push(texToRGBA(t));
    }
    for (const [name, fn] of Object.entries(itemDesigns(fam))) {
      if (listed.has('items/' + name)) continue;   // already hand-made by an earlier batch
      if (fam === 'nature') { // sprites are block textures
        const e = exts('blocks/' + name); if (!e.length) { console.warn('skip (not in vanilla):', name); continue; }
        const { rgba, mers } = it.render(name, fn(), 1100 + nb * 11, { style: ITEM_STYLE[key], write: false, rimW: 1, withMers: true });
        const t = new Tex();
        for (let i = 0; i < N * N; i++) { t.col(i, [0, 1, 2].map(c => rgba[i * 4 + c] / 255)); t.a[i] = rgba[i * 4 + 3] / 255; t.m[i] = mers[i * 4] / 255; t.e[i] = mers[i * 4 + 1] / 255; t.r[i] = mers[i * 4 + 2] / 255 || 0.8; t.h[i] = t.a[i] ? 0.6 : 0; }
        if (e.includes('tga')) g.save(t, name, { tga: true });
        if (e.includes('png')) g.save(t, name, { alpha: true, pbr: !e.includes('tga') });
        listed.add('blocks/' + name); nb++; (previews[fam] = previews[fam] || []).push(texToRGBA(t));
        continue;
      }
      if (!exts('items/' + name).includes('png')) { console.warn('skip (not a vanilla png item):', name); continue; }
      (previews[fam] = previews[fam] || []).push(it.render(name, fn(), 1200 + ni * 13, { style: ITEM_STYLE[key] }));
      if (/^(potion_bottle|dye_powder)/.test(name)) halveItem(name);   // ~120 colour variants: 64x keeps the shared item atlas small
      listed.add('items/' + name); ni++;
    }
  }
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); for (const [fam, tiles] of Object.entries(previews)) b2.grid(path.join(previewDir, `batch6_${fam}.png`), tiles, 10); }
  console.log(`Batch 6: ${nb} blocks, ${ni} items.`);
}
// rewrite an already-rendered item icon (colour + MERS) at half size: averaged colour, hard cut-out alpha
function halveItem(name) {
  const { pngBuf, writeFile } = require('./imageio');
  for (const suffix of ['', '_mers']) {
    const file = path.join(__dirname, 'USTP', 'textures', 'items', name + suffix + '.png'), im = readImage(file), W = im.w >> 1, H = im.h >> 1, out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, gg = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y * 2 + dy) * im.w + x * 2 + dx) * 4; if (im.data[i + 3]) { r += im.data[i]; gg += im.data[i + 1]; b += im.data[i + 2]; a++; } }
      const o = (y * W + x) * 4; if (a < 2) continue;
      out[o] = Math.round(r / a); out[o + 1] = Math.round(gg / a); out[o + 2] = Math.round(b / a); out[o + 3] = 255;
    }
    writeFile(file, pngBuf(W, H, 4, out));
  }
}
module.exports = { BLOCKS, itemDesigns, SAMPLES };
