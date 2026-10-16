'use strict';
// USTP batch 8: every remaining item family, in the Clean Modern style the user chose for the rest.
// Colours come from the vanilla textures (dominant / vivid colours), so every variant keeps its identity.
//   node batch8.js <bedrock-samples/resource_pack> [--preview=<dir>]
const fs = require('fs'), path = require('path');
const it = require('./items.js');
const b2 = require('./batch2.js');
const { readImage, pngBuf, writeFile } = require('./imageio');
const { sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mk } = it;
const N = 128, ifbm = it.fbm, h2 = it.h2, clamp = it.clamp, mix = it.mix, sstep = it.sstep;
const VARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (!VARG && require.main === module) { console.error('Usage: node batch8.js <bedrock-samples/resource_pack> [--preview=<dir>]'); process.exit(1); }
const VT = VARG && path.join(VARG, 'textures');

// ---------------------------------------------------------------- colour sampling
function pixels(rel) {
  const f = ['png', 'tga'].map(e => path.join(VT, `${rel}.${e}`)).find(fs.existsSync); if (!f) return [];
  const im = readImage(f), out = [];
  for (let i = 0; i < im.w * Math.min(im.w, im.h); i++) if (im.data[i * 4 + 3] > 127) out.push([im.data[i * 4] / 255, im.data[i * 4 + 1] / 255, im.data[i * 4 + 2] / 255]);
  return out;
}
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], sat = c => Math.max(...c) - Math.min(...c);
function vivid(rel, fallback = [0.7, 0.7, 0.7]) {
  let r = 0, g = 0, b = 0, k = 0;
  for (const c of pixels(rel)) { const w = sat(c) ** 3; r += c[0] * w; g += c[1] * w; b += c[2] * w; k += w; }
  if (k < 1e-3) return fallback;
  const c = [r / k, g / k, b / k], mx = Math.max(...c) || 1; return c.map(v => clamp(v * 0.9 / mx));
}
function mean(rel, fallback = [0.6, 0.6, 0.6]) { const p = pixels(rel).filter(c => lum(c) > 0.08); if (!p.length) return fallback; return [0, 1, 2].map(k => p.reduce((s, c) => s + c[k], 0) / p.length); }
function twoColours(rel) { // k-means (k = 2) over the non-outline pixels: body colour + spot colour
  const p = pixels(rel).filter(c => lum(c) > 0.07); if (p.length < 4) return [[0.7, 0.6, 0.5], [0.3, 0.2, 0.1]];
  let a = p[0], b = p[p.length >> 1];
  for (let it2 = 0; it2 < 8; it2++) {
    const A = [], B = [];
    for (const c of p) ((c[0] - a[0]) ** 2 + (c[1] - a[1]) ** 2 + (c[2] - a[2]) ** 2 < (c[0] - b[0]) ** 2 + (c[1] - b[1]) ** 2 + (c[2] - b[2]) ** 2 ? A : B).push(c);
    if (A.length) a = [0, 1, 2].map(k => A.reduce((s, c) => s + c[k], 0) / A.length);
    if (B.length) b = [0, 1, 2].map(k => B.reduce((s, c) => s + c[k], 0) / B.length);
    if (it2 === 7) return A.length >= B.length ? [a, b] : [b, a];
  }
}
const ORGc = (c, extra = {}) => mk({ kind: 'organic', base: c, dark: c.map(v => v * 0.3), light: c.map(v => clamp(v * 0.4 + 0.65)), metal: 0, rough: 0.5, gloss: 24, spec: 0.4, ...extra });
const ORG = (base, dark, light, extra = {}) => mk({ kind: 'organic', base, dark, light, metal: 0, rough: 0.6, gloss: 20, spec: 0.3, ...extra });
const GEM = (base, dark, light, emis = 0) => mk({ kind: 'gem', base, dark, light, metal: 0, rough: 0.05, emis });
const toXY = (u, v) => [64 + (u + v) / Math.SQRT2, 64 + (v - u) / Math.SQRT2];
const polyline = (x, y, pts, r) => Math.min(...pts.slice(1).map((p, k) => sdSeg(x, y, pts[k][0], pts[k][1], p[0], p[1], r)));
const rotE = (x, y, cx, cy, rx, ry, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, rx, ry); };
const ball = (cx, cy, r, mat, extra = {}) => ({ d: P => sdCircle(P.x, P.y, cx, cy, r), mat, profile: 'round', bw: r, z: 1, ...extra });
const MET = { iron: 'iron', gold: 'gold', diamond: 'diamond', netherite: 'netherite', copper: 'copper' };
const WOOD = c => ORGc(c, { gloss: 14, spec: 0.25, mottle: 0.25 });
const PAPER = ORG('#f2ead8', '#9a8e74', '#ffffff', { gloss: 8, spec: 0.1, mottle: 0.15 });
const CLAY = ORG('#b4683e', '#4a2410', '#ffd8b8', { gloss: 10, spec: 0.15, mottle: 0.25 });
const SLATE = ORG('#3e4a44', '#121816', '#b8c8c0', { gloss: 16, spec: 0.25, mottle: 0.2 });
const GLASS = ORG('#d8eef4', '#5a7a88', '#ffffff', { gloss: 90, spec: 1.2, mottle: 0.05 });

// ---------------------------------------------------------------- templates
function spawnEgg(rel) {
  const [body, spot] = twoColours(rel), seed = (rel.length * 131) | 0;
  return [{ d: P => sdEllipse(P.x, P.y, 64, 70, 36, 46) - Math.max(0, (70 - P.y) * 0.08), mat: ORGc(body, { gloss: 40, spec: 0.5 }), profile: 'round', bw: 32, z: 1,
    paint: P => { const c = it.cell(P.x, P.y, 16, seed); return h2(seed, c.id, 1) < 0.45 && c.edge > 2.2 ? spot : body; } }];
}
function bundle(c, mode) { // mode: closed | open | open_back | open_front
  const m = ORGc(c, { gloss: 12, spec: 0.2, mottle: 0.25 }), dark = ORGc(c.map(v => v * 0.35), { gloss: 6, spec: 0.1 });
  const body = P => Math.min(sdEllipse(P.x, P.y, 64, 82, 44, 36), sdBox(P.x, P.y, 64, 48, 18, 10, 6));
  if (mode === 'closed') return [{ d: body, mat: m, profile: 'round', bw: 22, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 42, 22, 5, 3), mat: ORG('#c8a070', '#5a4020', '#fff0d0'), profile: 'round', bw: 4, z: 6 }, ball(64, 26, 9, m, { z: 5 })];
  const lip = P => sdEllipse(P.x, P.y, 64, 48, 40, 12);
  if (mode === 'open_front') return [{ d: P => Math.max(body(P), 50 - P.y), mat: m, profile: 'round', bw: 22, z: 1 }];
  if (mode === 'open_back') return [{ d: P => Math.min(Math.max(body(P), P.y - 60), lip(P)), mat: m, profile: 'round', bw: 18, z: 1 }, { d: P => sdEllipse(P.x, P.y, 64, 50, 34, 8), mat: dark, profile: 'bevel', bw: 2, z: 4 }];
  return [{ d: P => Math.min(body(P), lip(P)), mat: m, profile: 'round', bw: 22, z: 1 }, { d: P => sdEllipse(P.x, P.y, 64, 50, 34, 8), mat: dark, profile: 'bevel', bw: 2, z: 4 }];
}
function arrow(head) {
  const [tx, ty] = toXY(-56, 0), [hx, hy] = toXY(44, 0), [px, py] = toXY(68, 0), perp = [1 / Math.SQRT2, 1 / Math.SQRT2];
  const fl = s => { const [ax, ay] = toXY(-60, 0), [bx, by] = toXY(-38, 0); return [[ax, ay], [bx, by], [bx + perp[0] * 9 * s, by + perp[1] * 9 * s], [ax + perp[0] * 11 * s, ay + perp[1] * 11 * s]]; };
  return [{ d: P => sdSeg(P.x, P.y, tx, ty, hx, hy, 2.4), mat: 'wood', profile: 'round', bw: 2.4, z: 1 },
    { d: P => Math.min(sdPoly(P.x, P.y, fl(1)), sdPoly(P.x, P.y, fl(-1))), mat: ORG('#f2f2f2', '#8a8a92', '#ffffff'), profile: 'bevel', bw: 2, z: 2 },
    { d: P => sdPoly(P.x, P.y, [[hx + perp[0] * 9, hy + perp[1] * 9], [px, py], [hx - perp[0] * 9, hy - perp[1] * 9]]), mat: ORGc(head, { gloss: 60, spec: 0.8, emis: 0.2 }), profile: 'ridge', bw: 5, z: 3 }];
}
function mapItem(c, marker) {
  return [{ d: P => sdPoly(P.x, P.y, [[18, 22], [110, 18], [114, 106], [22, 110]]), mat: PAPER, profile: 'bevel', bw: 4, z: 1,
    paint: P => (ifbm(P.x * 0.05, P.y * 0.05, 3) > 0.55 ? [0.78, 0.86, 0.66] : ifbm(P.x * 0.05, P.y * 0.05, 3) < 0.38 ? [0.68, 0.8, 0.9] : PAPER.base) },
    ...(marker ? [{ d: P => sdPoly(P.x, P.y, [[64, 40], [80, 66], [64, 90], [48, 66]]), mat: ORGc(c, { emis: 0.1 }), profile: 'ridge', bw: 6, z: 5 }] : [])];
}
function bulb(level) {
  const glow = level / 15;
  return [{ d: P => Math.min(sdCircle(P.x, P.y, 64, 54, 34), sdPoly(P.x, P.y, [[44, 74], [84, 74], [76, 96], [52, 96]])), mat: ORG('#fff0b0', '#8a7030', '#ffffff', { gloss: 80, spec: 1, emis: 0.2 + glow * 0.8 }), profile: 'round', bw: 26, z: 1,
    paint: P => mix([0.45, 0.42, 0.35], [1, 0.92, 0.55], glow) },
    { d: P => sdBox(P.x, P.y, 64, 106, 14, 10, 3), mat: 'steel', profile: 'bevel', bw: 3, z: 3, deco: P => (Math.abs(P.y - 102) < 1 || Math.abs(P.y - 110) < 1 ? { dark: 0.4 } : null) }];
}
function bed(c) {
  return [{ d: P => sdBox(P.x, P.y, 64, 70, 54, 16, 4), mat: WOOD([0.6, 0.42, 0.26]), profile: 'bevel', bw: 4, z: 1 },
    ...[16, 112].map(x => ({ d: P => sdBox(P.x, P.y, x, 92, 5, 10, 2), mat: WOOD([0.45, 0.3, 0.18]), profile: 'bevel', bw: 2, z: 0.5 })),
    { d: P => sdBox(P.x, P.y, 72, 58, 46, 12, 6), mat: ORGc(c, { gloss: 10, spec: 0.15, mottle: 0.15 }), profile: 'round', bw: 8, z: 4 },
    { d: P => sdBox(P.x, P.y, 26, 52, 14, 9, 6), mat: ORG('#f4f2ee', '#9a9890', '#ffffff'), profile: 'round', bw: 7, z: 5 }];
}
function harness(c) {
  const m = ORGc(c, { gloss: 16, spec: 0.25 });
  return [{ d: P => Math.min(Math.abs(sdEllipse(P.x, P.y, 64, 64, 46, 34)) - 6, sdBox(P.x, P.y, 64, 64, 6, 34, 2)), mat: m, profile: 'round', bw: 5, z: 1 },
    ...[[22, 64], [106, 64], [64, 30], [64, 98]].map(([x, y]) => ({ d: P => Math.abs(sdCircle(P.x, P.y, x, y, 7)) - 2.4, mat: 'iron', profile: 'round', bw: 2.4, z: 4 }))];
}
function candle(c) {
  return [{ d: P => sdBox(P.x, P.y, 64, 84, 16, 34, 3), mat: ORGc(c, { gloss: 30, spec: 0.4 }), profile: 'round', bw: 10, z: 1, deco: P => (Math.abs(P.y - 52) < 2 && Math.abs(P.x - 64) < 16 ? { dh: 0.6 } : null) },
    { d: P => sdSeg(P.x, P.y, 64, 50, 64, 40, 1.6), mat: ORG('#2a2a2a', '#000000', '#808080'), profile: 'round', bw: 1.6, z: 3 }];
}
function cushion(c) { return [{ d: P => sdBox(P.x, P.y, 64, 68, 46, 30, 16), mat: ORGc(c, { gloss: 14, spec: 0.2, mottle: 0.15 }), profile: 'round', bw: 22, z: 1, deco: P => (Math.hypot(P.x - 64, P.y - 68) < 4 ? { dh: -2, dark: 0.3 } : null) }]; }
function fishBucket(c) {
  return [{ d: P => polyline(P.x, P.y, Array.from({ length: 17 }, (_, k) => { const a = Math.PI + k * Math.PI / 16; return [64 + Math.cos(a) * 42, 44 + Math.sin(a) * 30]; }), 2.4), mat: 'steel', profile: 'round', bw: 2.4, z: 1 },
    { d: P => Math.min(sdPoly(P.x, P.y, [[20, 44], [108, 44], [96, 112], [32, 112]]), sdEllipse(P.x, P.y, 64, 112, 32, 6)), mat: 'iron', profile: 'bevel', bw: 5, z: 2 },
    { d: P => sdEllipse(P.x, P.y, 64, 44, 44, 10), mat: 'iron', profile: 'bevel', bw: 3, z: 4 },
    { d: P => sdEllipse(P.x, P.y, 64, 45, 38, 7), mat: ORG('#2a6ae8', '#081a5a', '#e0f0ff', { gloss: 80, spec: 1 }), profile: 'bevel', bw: 2, z: 6 },
    { d: P => Math.min(sdEllipse(P.x, P.y, 60, 40, 16, 8), sdPoly(P.x, P.y, [[74, 40], [86, 30], [86, 50]])), mat: ORGc(c, { gloss: 40, spec: 0.5 }), profile: 'round', bw: 6, z: 9 }];
}
function doorItem(c, metal) {
  const m = metal ? metal : WOOD(c);
  return [{ d: P => sdBox(P.x, P.y, 64, 64, 30, 58, 3), mat: m, profile: 'bevel', bw: 4, z: 1,
    deco: P => ([[52, 30], [76, 30]].some(([x, y]) => Math.abs(P.x - x) < 7 && Math.abs(P.y - y) < 18) ? { dh: -2, dark: 0.75 } : Math.abs(P.y - 64) < 1 ? { dh: -1, dark: 0.3 } : null) },
    { d: P => sdBox(P.x, P.y, 84, 78, 2.5, 10, 1.5), mat: 'steel', profile: 'round', bw: 2.5, z: 4 }];
}
function chainItem(metal) { return [0, 1, 2, 3].map(k => { const [cx, cy] = toXY(-42 + k * 28, 0), vertical = k % 2; return { d: P => Math.abs(rotE(P.x, P.y, cx, cy, vertical ? 7 : 16, vertical ? 16 : 7, -Math.PI / 4)) - 3.5, mat: metal, profile: 'round', bw: 3.5, z: 1 + (vertical ? 0.5 : 0) }; }); }
function lantern(metal, flame) {
  return [{ d: P => Math.min(sdBox(P.x, P.y, 64, 76, 30, 34, 4), sdBox(P.x, P.y, 64, 36, 20, 6, 2)), mat: metal, profile: 'bevel', bw: 4, z: 1 },
    { d: P => Math.abs(sdCircle(P.x, P.y, 64, 24, 10)) - 2.5, mat: metal, profile: 'round', bw: 2.5, z: 1 },
    { d: P => sdBox(P.x, P.y, 64, 76, 22, 26, 3), mat: ORGc(flame, { gloss: 40, spec: 0.5, emis: 1 }), profile: 'round', bw: 14, z: 3, deco: P => (Math.abs(P.x - 64) < 2 ? { dh: 1, dark: 0.3 } : null) }];
}
function seeds(c) { return [[48, 60, -0.6], [74, 52, 0.4], [60, 84, 0.1], [86, 80, -0.3], [40, 88, 0.8]].map(([x, y, a], k) => ({ d: P => rotE(P.x, P.y, x, y, 11, 7, a), mat: ORGc(c, { gloss: 30, spec: 0.4 }), profile: 'round', bw: 6, z: 1 + k })); }
function sherd(c, seed) {
  const glyphs = [P => Math.abs(sdCircle(P.x, P.y, 64, 64, 18)) < 2, P => Math.abs(P.x - 64) < 2 || Math.abs(P.y - 64) < 2, P => Math.abs(Math.abs(P.x - 64) + Math.abs(P.y - 64) - 20) < 2, P => Math.abs(sdPoly(P.x, P.y, [[64, 40], [86, 80], [42, 80]])) < 2];
  const glyph = glyphs[seed % glyphs.length];
  return [{ d: P => sdPoly(P.x, P.y, [[22, 34], [60, 18], [104, 30], [110, 76], [84, 108], [36, 104], [16, 70]]), mat: ORGc(c, { gloss: 10, spec: 0.15, mottle: 0.25 }), profile: 'bevel', bw: 8, z: 1, deco: P => (glyph(P) ? { dh: -1.5, dark: 0.55 } : null) }];
}
function template(c) {
  return [{ d: P => sdBox(P.x, P.y, 64, 64, 46, 46, 8), mat: SLATE, profile: 'bevel', bw: 6, z: 1 },
    { d: P => sdPoly(P.x, P.y, [[64, 30], [92, 64], [64, 98], [36, 64]]), mat: ORGc(c, { gloss: 40, spec: 0.6, emis: 0.15 }), profile: 'ridge', bw: 10, z: 4 }];
}
function bannerPattern(c) { return [{ d: P => sdBox(P.x, P.y, 64, 64, 40, 50, 3), mat: PAPER, profile: 'bevel', bw: 4, z: 1 }, { d: P => sdCircle(P.x, P.y, 64, 64, 18), mat: ORGc(c), profile: 'bevel', bw: 3, z: 4 }]; }
function horseArmor(metal) {
  return [{ d: P => sdPoly(P.x, P.y, [[16, 64], [40, 40], [88, 36], [112, 54], [108, 80], [70, 92], [24, 88]]), mat: metal, profile: 'bevel', bw: 8, z: 1, deco: P => (Math.abs(P.x - 64) < 1 ? { dh: -1, dark: 0.35 } : null) },
    { d: P => sdPoly(P.x, P.y, [[86, 36], [112, 22], [118, 44], [110, 56]]), mat: metal, profile: 'bevel', bw: 5, z: 3 }];
}
function nautilusArmor(metal) { return [{ d: P => Math.max(sdCircle(P.x, P.y, 64, 66, 46), -sdCircle(P.x, P.y, 86, 82, 16)), mat: metal, profile: 'round', bw: 30, z: 1, deco: P => (Math.sin(Math.atan2(P.y - 66, P.x - 64) * 3 + Math.log(Math.hypot(P.x - 64, P.y - 66) + 1) * 9) > 0.8 ? { dh: -1, dark: 0.3 } : null) }]; }
function emptySlot(shape) { const grey = ORG('#8a8a8a', '#3a3a3a', '#c8c8c8', { gloss: 4, spec: 0.05 }); return [{ d: P => Math.abs(shape(P)) - 3, mat: grey, profile: 'round', bw: 3, z: 1 }]; }

// singles (each a small hand design)
const SINGLES = {
  armor_stand: () => [{ d: P => Math.min(sdSeg(P.x, P.y, 64, 18, 64, 110, 4), sdBox(P.x, P.y, 64, 40, 28, 4, 2), sdBox(P.x, P.y, 64, 72, 20, 4, 2), sdBox(P.x, P.y, 64, 112, 34, 5, 2)), mat: WOOD([0.68, 0.5, 0.32]), profile: 'bevel', bw: 3, z: 1 }],
  bowl: () => [{ d: P => Math.min(Math.max(sdEllipse(P.x, P.y, 64, 64, 50, 40), 64 - P.y), sdEllipse(P.x, P.y, 64, 64, 50, 12)), mat: WOOD([0.55, 0.36, 0.18]), profile: 'bevel', bw: 5, z: 1 }, { d: P => sdEllipse(P.x, P.y, 64, 63, 42, 8.5), mat: WOOD([0.3, 0.2, 0.1]), profile: 'bevel', bw: 2, z: 3 }],
  elytra: () => [-1, 1].map(s => ({ d: P => sdPoly(P.x, P.y, [[64, 20], [64 + s * 46, 30], [64 + s * 50, 70], [64 + s * 30, 110], [64 + s * 8, 70]].map(([x, y]) => [x, y])), mat: ORG('#8a8ab0', '#2a2a48', '#e8e8ff', { gloss: 30, spec: 0.4 }), profile: 'bevel', bw: 8, z: 1, deco: P => (Math.sin((P.y - 20) * 0.35) > 0.8 ? { dh: -0.8, dark: 0.3 } : null) })),
  broken_elytra: () => SINGLES.elytra().map(p => ({ ...p, mat: ORG('#5a5a70', '#1a1a28', '#a8a8c0'), deco: P => (Math.abs(Math.sin(P.x * 0.3 + P.y * 0.2)) < 0.08 ? { dh: -2, dark: 0.7 } : null) })),
  totem: () => [{ d: P => Math.min(sdEllipse(P.x, P.y, 64, 34, 22, 20), sdBox(P.x, P.y, 64, 80, 22, 34, 6), sdBox(P.x, P.y, 64, 64, 46, 8, 4)), mat: 'gold', profile: 'bevel', bw: 6, z: 1 }, ...[[56, 32], [72, 32]].map(([x, y]) => ball(x, y, 4, GEM('#2ad46a', '#05401b', '#d8ffe4', 0.4), { z: 6 }))],
  heartofthesea_closed: () => [ball(64, 64, 40, GEM('#2a8ae8', '#06204a', '#d8f0ff', 0.4), { profile: 'round', bw: 40 }), { d: P => Math.abs(sdCircle(P.x, P.y, 64, 64, 40)) - 4, mat: ORG('#c8b890', '#5a4a30', '#ffffff'), profile: 'round', bw: 4, z: 3 }],
  end_crystal: () => [{ d: P => sdPoly(P.x, P.y, [[64, 14], [104, 64], [64, 114], [24, 64]]), mat: GEM('#e8a8ff', '#5a2a7a', '#ffffff', 0.6), profile: 'ridge', bw: 20, z: 1 }, { d: P => Math.abs(sdBox(P.x, P.y, 64, 64, 30, 30, 2)) - 2.5, mat: GEM('#b8c8ff', '#2a3a6a', '#ffffff', 0.3), profile: 'round', bw: 2.5, z: 3 }],
  dragons_breath: () => [{ d: P => Math.min(sdCircle(P.x, P.y, 64, 80, 36), sdBox(P.x, P.y, 64, 38, 10, 16, 3)), mat: GLASS, profile: 'round', bw: 28, z: 1 }, { d: P => Math.max(sdCircle(P.x, P.y, 64, 80, 32), 60 - P.y), mat: ORG('#e070c0', '#5a0a4a', '#fff0ff', { gloss: 60, spec: 0.8, emis: 0.6 }), profile: 'round', bw: 24, z: 3 }, { d: P => sdBox(P.x, P.y, 64, 20, 12, 7, 2), mat: ORG('#a87a4a', '#3e2810', '#f0d0a0'), profile: 'bevel', bw: 2.5, z: 8 }],
  dragon_fireball: () => [ball(64, 64, 34, ORG('#c040ff', '#3a0060', '#ffd8ff', { emis: 1, gloss: 30, spec: 0.5 }))],
  fireball: () => [ball(64, 64, 34, ORG('#ff7a1a', '#6a1400', '#fff0b0', { emis: 1, gloss: 30, spec: 0.5 }), { paint: P => mix([1, 0.45, 0.1], [1, 0.9, 0.4], sstep(0.4, 0.8, ifbm(P.x * 0.1, P.y * 0.1, 3))) })],
  fireworks: () => [{ d: P => sdSeg(P.u, P.v, -40, 0, 30, 0, 12), mat: ORG('#d02a2a', '#4a0606', '#ffd8d8', { gloss: 30, spec: 0.4 }), profile: 'round', bw: 12, z: 1, axis: 'u', deco: P => (Math.abs(P.u + 5) < 3 ? { dh: 0.6, dark: -0.2 } : null) }, { d: P => sdPoly(P.u, P.v, [[30, -12], [52, 0], [30, 12]]), mat: PAPER, profile: 'ridge', bw: 6, z: 2 }, { d: P => sdSeg(P.u, P.v, -62, 0, -40, 0, 1.6), mat: 'carbon', profile: 'round', bw: 1.6, z: 0.5 }],
  fireworks_charge: () => [ball(64, 64, 32, ORG('#4a4a4a', '#141414', '#c0c0c0', { gloss: 20, spec: 0.3, mottle: 0.3 }))],
  flower_pot: () => [{ d: P => sdPoly(P.x, P.y, [[30, 50], [98, 50], [88, 112], [40, 112]]), mat: CLAY, profile: 'bevel', bw: 6, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 50, 38, 6, 3), mat: CLAY, profile: 'bevel', bw: 3, z: 3 }],
  item_frame: () => [{ d: P => Math.max(sdBox(P.x, P.y, 64, 64, 50, 50, 3), -sdBox(P.x, P.y, 64, 64, 36, 36, 2)), mat: WOOD([0.6, 0.42, 0.24]), profile: 'bevel', bw: 5, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 64, 36, 36, 2), mat: ORG('#a87a50', '#4a3018', '#e8c8a0', { gloss: 6, spec: 0.05 }), profile: 'bevel', bw: 2, z: 0.5 }],
  glow_item_frame: () => SINGLES.item_frame().map((p, k) => (k === 1 ? { ...p, mat: ORG('#40e0c0', '#0a5a4a', '#e0fff8', { emis: 0.7 }) } : p)),
  painting: () => [{ d: P => sdBox(P.x, P.y, 64, 64, 52, 40, 3), mat: WOOD([0.55, 0.38, 0.22]), profile: 'bevel', bw: 5, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 64, 42, 30, 1), mat: PAPER, profile: 'bevel', bw: 2, z: 3, paint: P => (P.y > 70 + Math.sin(P.x * 0.1) * 6 ? [0.35, 0.6, 0.3] : P.y > 52 ? [0.5, 0.75, 0.95] : [0.95, 0.8, 0.45]) }],
  quiver: () => [{ d: P => sdBox(P.u, P.v, -6, 0, 46, 14, 8), mat: ORG('#8a5a2a', '#2e1a08', '#e8c098', { gloss: 16, spec: 0.25 }), profile: 'round', bw: 10, z: 1, axis: 'u' }, ...[-6, 0, 6].map(v => ({ d: P => sdPoly(P.u, P.v, [[40, v - 5], [58, v], [40, v + 5]]), mat: ORG('#f2f2f2', '#8a8a92', '#ffffff'), profile: 'ridge', bw: 3, z: 3 }))],
  ruby: () => [{ d: P => sdPoly(P.x, P.y, [[22, 50], [44, 26], [84, 26], [106, 50], [64, 112]]), mat: GEM('#e0203a', '#4a0008', '#ffd8e0', 0.1), profile: 'ridge', bw: 16, z: 1 }],
  snowball: () => [ball(64, 64, 34, ORG('#f4f8fc', '#9aa8b8', '#ffffff', { gloss: 14, spec: 0.2, mottle: 0.15 }))],
  trial_key: () => [{ d: P => Math.min(Math.abs(sdCircle(P.x, P.y, 40, 40, 18)) - 6, sdSeg(P.x, P.y, 52, 52, 104, 104, 5), sdBox(P.x, P.y, 92, 104, 6, 6, 1), sdBox(P.x, P.y, 104, 92, 6, 6, 1)), mat: 'copper', profile: 'round', bw: 5, z: 1 }],
  ominous_trial_key: () => SINGLES.trial_key().map(p => ({ ...p, mat: 'steel' })),
  ominous_bottle: () => [{ d: P => Math.min(sdCircle(P.x, P.y, 64, 80, 36), sdBox(P.x, P.y, 64, 38, 10, 16, 3)), mat: GLASS, profile: 'round', bw: 28, z: 1 }, { d: P => Math.max(sdCircle(P.x, P.y, 64, 80, 32), 60 - P.y), mat: ORG('#2a3a4a', '#060a10', '#b8d0e8', { gloss: 60, spec: 0.8, emis: 0.2 }), profile: 'round', bw: 24, z: 3 }, { d: P => sdBox(P.x, P.y, 64, 20, 12, 7, 2), mat: 'steel', profile: 'bevel', bw: 2.5, z: 8 }],
  turtle_egg: () => [[48, 74, 22], [80, 70, 20], [64, 96, 18]].map(([x, y, r], k) => ({ d: P => sdEllipse(P.x, P.y, x, y, r, r * 1.2), mat: ORG('#e8e4c8', '#7a7458', '#ffffff', { gloss: 30, spec: 0.4 }), profile: 'round', bw: r, z: 1 + k, paint: P => (h2(9, P.x / 7 | 0, P.y / 7 | 0) < 0.15 ? [0.45, 0.62, 0.35] : [0.91, 0.89, 0.78]) })),
  turtle_helmet: () => [{ d: P => Math.max(sdEllipse(P.x, P.y, 64, 72, 50, 44), P.y - 90), mat: ORG('#3a8a3a', '#0a2a0a', '#d8ffd8', { gloss: 30, spec: 0.4 }), profile: 'round', bw: 22, z: 1, paint: P => { const c = it.cell(P.x, P.y, 20, 4); return c.edge < 1.6 ? [0.15, 0.32, 0.14] : [0.24, 0.55, 0.24]; } }],
  turtle_shell_piece: () => [{ d: P => sdPoly(P.x, P.y, [[64, 20], [104, 44], [104, 88], [64, 112], [24, 88], [24, 44]]), mat: ORG('#4a9a3a', '#123a0a', '#e0ffd8', { gloss: 30, spec: 0.4 }), profile: 'bevel', bw: 10, z: 1 }],
  villagebell: () => [{ d: P => Math.min(Math.max(sdEllipse(P.x, P.y, 64, 78, 40, 52), P.y - 100), sdBox(P.x, P.y, 64, 100, 44, 6, 3)), mat: 'gold', profile: 'round', bw: 18, z: 1 }, ball(64, 104, 7, 'steel', { z: 4 })],
  wolf_armor: () => [{ d: P => sdPoly(P.x, P.y, [[16, 60], [40, 42], [92, 40], [112, 58], [104, 84], [64, 94], [24, 84]]), mat: ORG('#c0a080', '#4a3420', '#fff0e0', { gloss: 24, spec: 0.35 }), profile: 'bevel', bw: 8, z: 1, deco: P => ([40, 64, 88].some(x => Math.abs(P.x - x) < 1) ? { dh: -1, dark: 0.35 } : null) }],
  sniffer_egg: () => [{ d: P => sdEllipse(P.x, P.y, 64, 68, 40, 50), mat: ORG('#b8503a', '#4a140a', '#ffd8c8', { gloss: 30, spec: 0.4 }), profile: 'round', bw: 36, z: 1, paint: P => (Math.sin(P.y * 0.25 + Math.sin(P.x * 0.1) * 2) > 0.6 ? [0.35, 0.55, 0.45] : [0.72, 0.31, 0.23]) }],
  blue_egg: () => [{ d: P => sdEllipse(P.x, P.y, 64, 70, 32, 42) - Math.max(0, (70 - P.y) * 0.08), mat: ORG('#a8c8e0', '#3a5468', '#ffffff', { gloss: 26, spec: 0.35 }), profile: 'round', bw: 30, z: 1 }],
  brown_egg: () => [{ d: P => sdEllipse(P.x, P.y, 64, 70, 32, 42) - Math.max(0, (70 - P.y) * 0.08), mat: ORG('#c89a6a', '#5a3a1a', '#fff0e0', { gloss: 26, spec: 0.35 }), profile: 'round', bw: 30, z: 1 }],
  hoglin_meat_raw: () => [{ d: P => sdPoly(P.x, P.y, [[24, 50], [54, 26], [98, 30], [112, 64], [94, 100], [50, 106], [20, 82]]), mat: ORG('#d04a5a', '#4a0a14', '#ffd8e0', { gloss: 30, spec: 0.45 }), profile: 'bevel', bw: 8, z: 1 }],
  hoglin_meat_cooked: () => [{ d: P => sdPoly(P.x, P.y, [[24, 50], [54, 26], [98, 30], [112, 64], [94, 100], [50, 106], [20, 82]]), mat: ORG('#8a4a2a', '#2e1206', '#e8b080', { gloss: 22, spec: 0.35 }), profile: 'bevel', bw: 8, z: 1, deco: P => ((((P.x + P.y) % 22) + 22) % 22 < 3.5 ? { dh: -1, dark: 0.6 } : null) }],
  wheat: () => [26, 46, 64, 82, 102].flatMap((x, k) => [{ d: P => sdSeg(P.x, P.y, x, 124, x + (k - 2) * 4, 54, 2.2), mat: ORG('#c8a048', '#5a3e10', '#fff0c0'), profile: 'round', bw: 2, z: 1 }, { d: P => Math.min(...[0, 1, 2, 3, 4].map(j => Math.min(sdEllipse(P.x, P.y, x + (k - 2) * 4 - 4, 22 + j * 7, 4, 6), sdEllipse(P.x, P.y, x + (k - 2) * 4 + 4, 25 + j * 7, 4, 6)))), mat: ORG('#d8b048', '#6a4a10', '#fff4c0'), profile: 'round', bw: 4, z: 2 }]),
  reeds: () => [40, 64, 88].map((x, k) => ({ d: P => sdBox(P.x, P.y, x, 64, 7, 54, 4), mat: ORG('#7ab84a', '#24440c', '#f0ffe0'), profile: 'round', bw: 6, z: 1 + k, deco: P => (((P.y + x) % 30) < 3 ? { dh: 0.6, dark: 0.25 } : null) })),
  kelp: () => [{ d: P => polyline(P.x, P.y, Array.from({ length: 9 }, (_, j) => [64 + Math.sin(j * 0.9) * 14, 120 - j * 13]), 9), mat: ORG('#3a7a2a', '#0e2a08', '#d0ffc0', { gloss: 30, spec: 0.4 }), profile: 'round', bw: 8, z: 1 }],
  sea_pickle: () => [[48, 70], [76, 62], [62, 92]].map(([x, y], k) => ({ d: P => sdBox(P.x, P.y, x, y, 11, 20, 10), mat: ORG('#7a9a3a', '#24340a', '#f0ffd0', { gloss: 40, spec: 0.5, emis: 0.2 }), profile: 'round', bw: 10, z: 1 + k })),
  nether_sprouts: () => [30, 50, 64, 80, 98].map((x, k) => ({ d: P => sdPoly(P.x, P.y, [[x - 5, 124], [x + (k - 2) * 6, 40 + (k % 2) * 20], [x + 5, 124]]), mat: ORG('#18a08a', '#043a32', '#c8fff0'), profile: 'ridge', bw: 4, z: 1 + k })),
  pink_petals: () => [[44, 50], [80, 44], [60, 80], [90, 84], [36, 88]].flatMap(([x, y], k) => [0, 1, 2, 3, 4].map(j => { const a = j * 1.2566; return { d: P => rotE(P.x, P.y, x + Math.cos(a) * 8, y + Math.sin(a) * 8, 8, 5, a), mat: ORG('#f4a8c8', '#7a3a5a', '#ffffff'), profile: 'round', bw: 4, z: 1 + k }; })),
  leaf_litter: () => [[40, 50, 0.4], [76, 46, -0.6], [56, 80, 1.2], [88, 82, 0.1], [34, 94, -0.9]].map(([x, y, a], k) => ({ d: P => rotE(P.x, P.y, x, y, 20, 10, a), mat: ORG('#a8742a', '#3e2408', '#ffe0a8', { mottle: 0.3 }), profile: 'round', bw: 5, z: 1 + k })),
  wildflowers: () => [[40, 50], [78, 42], [58, 80], [90, 82]].flatMap(([x, y], k) => [{ d: P => Math.min(...[0, 1, 2, 3, 4].map(j => { const a = j * 1.2566; return sdCircle(P.x, P.y, x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6); })), mat: ORG(k % 2 ? '#f8e040' : '#f4f4f0', '#6a5a00', '#ffffff'), profile: 'round', bw: 4, z: 1 + k }, ball(x, y, 4, ORG('#f0a020', '#6a3a00', '#fff0c0'), { z: 6 + k })]),
  bush: () => [[40, 76, 26], [84, 76, 26], [62, 50, 28]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.2, P.y * 0.2, 9 + k) - 0.5) * 8, mat: ORG('#4a9a2e', '#123a0a', '#e0ffd0'), profile: 'round', bw: r * 0.8, z: 1 + k })),
  firefly_bush: () => [...SINGLES.bush(), ...[[44, 40], [86, 54], [64, 84]].map(([x, y]) => ball(x, y, 4, ORG('#f8ff80', '#8a8a00', '#ffffff', { emis: 1 }), { z: 10 }))],
  mangrove_propagule: () => [{ d: P => sdBox(P.x, P.y, 64, 74, 7, 44, 6), mat: ORG('#6a9a3a', '#1e3a0a', '#e0ffd0'), profile: 'round', bw: 6, z: 1 }, { d: P => Math.min(rotE(P.x, P.y, 50, 30, 16, 7, 0.6), rotE(P.x, P.y, 78, 30, 16, 7, -0.6)), mat: ORG('#4a9a2e', '#123a0a', '#e0ffd0'), profile: 'round', bw: 5, z: 2 }],
  hanging_roots: () => [30, 52, 74, 96].map((x, k) => ({ d: P => polyline(P.x, P.y, [[x, 8], [x + 4, 50], [x - 3, 90], [x + 2, 118 - k * 10]], 2.6), mat: ORG('#a88a6a', '#4a3420', '#f0e0c8'), profile: 'round', bw: 2.6, z: 1 })),
  bamboo: () => [{ d: P => sdBox(P.u, P.v, 0, 0, 58, 8, 6), mat: ORG('#8aaa2a', '#2a3a06', '#f0ffc0', { gloss: 30, spec: 0.4 }), profile: 'round', bw: 8, z: 1, axis: 'u', deco: P => (((P.u + 64) % 30) < 3 ? { dh: 0.8, dark: 0.3 } : null) }, { d: P => rotE(P.x, P.y, 92, 30, 16, 6, -0.7), mat: ORG('#5aa82a', '#163a06', '#e8ffd0'), profile: 'round', bw: 5, z: 2 }],
  torchflower_seeds: () => seeds([0.45, 0.5, 0.2]), pitcher_pod: () => [{ d: P => sdEllipse(P.x, P.y, 64, 72, 26, 40), mat: ORG('#5a8a6a', '#18301e', '#e0ffe8'), profile: 'round', bw: 22, z: 1 }],
  brewing_stand: () => [{ d: P => Math.min(sdSeg(P.x, P.y, 64, 18, 64, 100, 4), sdSeg(P.x, P.y, 64, 60, 30, 76, 2.5), sdSeg(P.x, P.y, 64, 60, 98, 76, 2.5)), mat: 'gold', profile: 'round', bw: 3.5, z: 1 }, { d: P => sdEllipse(P.x, P.y, 64, 104, 38, 10), mat: ORG('#4a4a4e', '#141416', '#c0c0c8'), profile: 'bevel', bw: 4, z: 2 }, ...[30, 98].map(x => ball(x, 86, 9, GLASS, { z: 3 }))],
  cauldron: () => [{ d: P => Math.min(Math.max(sdEllipse(P.x, P.y, 64, 60, 50, 52), 40 - P.y), sdEllipse(P.x, P.y, 64, 40, 50, 10)), mat: 'carbon', profile: 'bevel', bw: 6, z: 1 }, { d: P => sdEllipse(P.x, P.y, 64, 40, 42, 7), mat: ORG('#101010', '#000000', '#404040'), profile: 'bevel', bw: 2, z: 3 }],
  campfire: () => [{ d: P => Math.min(sdBox(P.x, P.y, 64, 100, 48, 8, 4), rotE(P.x, P.y, 64, 92, 46, 8, 0.3), rotE(P.x, P.y, 64, 92, 46, 8, -0.3)), mat: WOOD([0.5, 0.34, 0.2]), profile: 'round', bw: 6, z: 1 }, { d: P => sdPoly(P.x, P.y, [[64, 20], [86, 70], [74, 88], [54, 88], [42, 70]]), mat: ORG('#ff8a1a', '#6a1a00', '#fff0b0', { emis: 1 }), profile: 'round', bw: 14, z: 3 }],
  soul_campfire: () => SINGLES.campfire().map((p, k) => (k === 1 ? { ...p, mat: ORG('#3ae8ff', '#003a4a', '#e0ffff', { emis: 1 }) } : p)),
  lantern: () => lantern('carbon', [1, 0.72, 0.25]), soul_lantern: () => lantern('carbon', [0.35, 0.92, 1]),
  hopper: () => [{ d: P => Math.min(sdPoly(P.x, P.y, [[16, 20], [112, 20], [84, 74], [44, 74]]), sdBox(P.x, P.y, 64, 92, 12, 20, 3)), mat: 'steel', profile: 'bevel', bw: 6, z: 1 }, { d: P => sdEllipse(P.x, P.y, 64, 22, 44, 6), mat: ORG('#101012', '#000000', '#404048'), profile: 'bevel', bw: 2, z: 3 }],
  comparator: () => [{ d: P => sdBox(P.x, P.y, 64, 84, 52, 14, 4), mat: ORG('#a8a8a8', '#3a3a3a', '#ffffff'), profile: 'bevel', bw: 5, z: 1 }, ...[[40, 60], [88, 60], [64, 36]].map(([x, y]) => ({ d: P => Math.min(sdBox(P.x, P.y, x, y + 14, 4, 14, 2), sdCircle(P.x, P.y, x, y, 7)), mat: ORG('#ff3a1a', '#5a0000', '#fff0d0', { emis: 0.7 }), profile: 'round', bw: 5, z: 3 }))],
  repeater: () => [{ d: P => sdBox(P.x, P.y, 64, 84, 52, 14, 4), mat: ORG('#a8a8a8', '#3a3a3a', '#ffffff'), profile: 'bevel', bw: 5, z: 1 }, ...[[40, 54], [88, 54]].map(([x, y]) => ({ d: P => Math.min(sdBox(P.x, P.y, x, y + 14, 4, 14, 2), sdCircle(P.x, P.y, x, y, 7)), mat: ORG('#ff3a1a', '#5a0000', '#fff0d0', { emis: 0.7 }), profile: 'round', bw: 5, z: 3 }))],
  lever: () => [{ d: P => sdBox(P.x, P.y, 64, 98, 34, 14, 4), mat: ORG('#8a8a8e', '#2a2a2e', '#e0e0e8'), profile: 'bevel', bw: 5, z: 1 }, { d: P => sdSeg(P.x, P.y, 64, 94, 92, 24, 4.5), mat: WOOD([0.55, 0.38, 0.22]), profile: 'round', bw: 4.5, z: 2 }],
  boat: () => doorItem([0.6, 0.45, 0.28]).slice(0, 0).concat([{ d: P => sdPoly(P.x, P.y, [[8, 62], [120, 62], [104, 96], [26, 96]]), mat: WOOD([0.6, 0.45, 0.28]), profile: 'bevel', bw: 6, z: 1 }]),
  book_portfolio: () => [{ d: P => sdBox(P.x, P.y, 64, 66, 44, 50, 5), mat: ORG('#4a6a8a', '#14202e', '#d8e8f8'), profile: 'bevel', bw: 5, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 40, 24, 6, 2), mat: 'steel', profile: 'bevel', bw: 2, z: 4 }],
  chalkboard_small: () => [{ d: P => sdBox(P.x, P.y, 64, 64, 46, 34, 3), mat: WOOD([0.55, 0.38, 0.22]), profile: 'bevel', bw: 4, z: 1 }, { d: P => sdBox(P.x, P.y, 64, 64, 38, 26, 2), mat: SLATE, profile: 'bevel', bw: 2, z: 3 }],
};
SINGLES.chalkboard_medium = SINGLES.chalkboard_small; SINGLES.chalkboard_large = SINGLES.chalkboard_small;
SINGLES.straw_bed = () => bed([0.85, 0.75, 0.4]);
const SLOT_SHAPES = {
  empty_armor_slot_helmet: P => Math.max(Math.min(sdEllipse(P.x, P.y, 64, 60, 40, 38), sdBox(P.x, P.y, 64, 86, 40, 20, 8)), -sdBox(P.x, P.y, 64, 106, 20, 20, 6)),
  empty_armor_slot_chestplate: P => Math.max(sdPoly(P.x, P.y, [[30, 22], [52, 30], [76, 30], [98, 22], [108, 46], [96, 52], [94, 112], [34, 112], [32, 52], [20, 46]]), -sdEllipse(P.x, P.y, 64, 22, 14, 10)),
  empty_armor_slot_leggings: P => Math.max(sdBox(P.x, P.y, 64, 64, 34, 52, 3), -sdBox(P.x, P.y, 64, 96, 6, 30, 1)),
  empty_armor_slot_boots: P => Math.min(sdPoly(P.x, P.y, [[24, 36], [52, 36], [52, 100], [14, 100], [14, 88], [24, 80]]), sdPoly(P.x, P.y, [[76, 36], [104, 36], [104, 100], [66, 100], [66, 88], [76, 80]])),
  empty_armor_slot_shield: P => sdPoly(P.x, P.y, [[24, 22], [104, 22], [104, 70], [64, 112], [24, 70]]),
};

// ---------------------------------------------------------------- name → design
function designFor(name) {
  const rel = 'items/' + name, m = name.match.bind(name);
  if (/^(spawn_eggs\/spawn_egg_|egg_)/.test(name) || name === 'spawn_egg') return { parts: () => spawnEgg(rel), small: true };
  if (/^bundle/.test(name)) { const base = name.replace(/_open(_back|_front)?$/, ''), mode = /_open_back$/.test(name) ? 'open_back' : /_open_front$/.test(name) ? 'open_front' : /_open$/.test(name) ? 'open' : 'closed'; return { parts: () => bundle(mean('items/' + base, [0.6, 0.42, 0.28]), mode), small: true }; }
  if (/^tipped_arrow/.test(name)) return { parts: () => arrow(vivid(rel, [0.7, 0.7, 0.7])), small: true };
  if (/^map_/.test(name)) return { parts: () => mapItem(vivid(rel), !/empty|filled/.test(name)), small: true };
  if (/^light_block_\d+$/.test(name)) return { parts: () => bulb(+name.split('_')[2]), small: true };
  if (/^bed_/.test(name)) return { parts: () => bed(vivid(rel, mean(rel))), small: true };
  if (/^harness\//.test(name)) return { parts: () => harness(mean(rel)), small: true };
  if (/^candles\//.test(name)) return { parts: () => candle(mean(rel)), small: true };
  if (/_cushion$/.test(name)) return { parts: () => cushion(mean(rel)), small: true };
  if (/^bucket_/.test(name)) return { parts: () => fishBucket(vivid(rel)), small: false };
  if (/(^door_|_door$)/.test(name)) { const metal = name === 'door_iron' ? 'iron' : /copper/.test(name) ? mk({ kind: 'metal', base: mean(rel), dark: mean(rel).map(v => v * 0.35), light: mean(rel).map(v => clamp(v * 0.5 + 0.6)), metal: 1, rough: 0.3 }) : null; return { parts: () => doorItem(mean(rel), metal), small: true }; }
  if (/_chain$/.test(name)) return { parts: () => chainItem(mk({ kind: 'metal', base: mean(rel), dark: mean(rel).map(v => v * 0.35), light: mean(rel).map(v => clamp(v * 0.5 + 0.6)), metal: 1, rough: 0.3 })), small: true };
  if (/_copper_lantern$|^copper_lantern$/.test(name)) return { parts: () => lantern(mk({ kind: 'metal', base: mean(rel), dark: mean(rel).map(v => v * 0.35), light: mean(rel).map(v => clamp(v * 0.5 + 0.6)), metal: 1, rough: 0.3 }), [0.45, 1, 0.55]), small: true };
  if (/^seeds_/.test(name)) return { parts: () => seeds(mean(rel)), small: true };
  if (/_pottery_sherd$/.test(name)) return { parts: () => sherd(mean(rel, [0.7, 0.4, 0.25]), name.length), small: true };
  if (/_smithing_template$/.test(name)) return { parts: () => template(vivid(rel, [0.4, 0.8, 0.7])), small: true };
  if (/banner_pattern$/.test(name)) return { parts: () => bannerPattern(vivid(rel, [0.5, 0.4, 0.3])), small: true };
  if (/_horse_armor$/.test(name) && !/^leather/.test(name)) return { parts: () => horseArmor(MET[name.split('_')[0]] || 'iron'), small: false };
  if (/^nautilus_armor\//.test(name)) return { parts: () => nautilusArmor(MET[name.split('/')[1].split('_')[0]] || 'iron'), small: true };
  if (SLOT_SHAPES[name]) return { parts: () => emptySlot(SLOT_SHAPES[name]), small: true };
  if (SINGLES[name]) return { parts: SINGLES[name], small: true };
  return null;
}

// ---------------------------------------------------------------- build
function halveItem(name) {
  for (const suffix of ['', '_mers']) {
    const file = path.join(__dirname, 'USTP', 'textures', 'items', name + suffix + '.png'), im = readImage(file), W = im.w >> 1, H = im.h >> 1, out = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y * 2 + dy) * im.w + x * 2 + dx) * 4; if (im.data[i + 3]) { r += im.data[i]; g += im.data[i + 1]; b += im.data[i + 2]; a++; } }
      const o = (y * W + x) * 4; if (a < 2) continue;
      out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); out[o + 3] = 255;
    }
    writeFile(file, pngBuf(W, H, 4, out));
  }
}
if (VARG && require.main === module) {
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const pbr = new Set();
  for (const f of walk(path.join(VT, 'items')).filter(f => f.endsWith('.texture_set.json'))) { try { const s = JSON.parse(fs.readFileSync(f, 'utf8'))['minecraft:texture_set']; for (const [k, v] of Object.entries(s)) if (k !== 'color' && typeof v === 'string') pbr.add(path.join(path.dirname(f), v)); } catch { /* skip malformed */ } }
  let n = 0, skipped = [];
  for (const f of walk(path.join(VT, 'items')).filter(f => f.endsWith('.png'))) {
    const base = f.slice(0, -4); if (pbr.has(base) || /_mers?$/.test(base)) continue;
    const name = path.relative(path.join(VT, 'items'), base).split(path.sep).join('/');
    if (listed.has('items/' + name)) continue;
    const d = designFor(name); if (!d) { skipped.push(name); continue; }
    previews.push(it.render(name, d.parts(), 2000 + n * 13, { style: 'modern' }));
    if (d.small) halveItem(name);
    listed.add('items/' + name); n++;
  }
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); b2.grid(path.join(previewDir, 'batch8_items.png'), previews, 16); }
  console.log(`Batch 8: ${n} items redesigned. Left as remaster (${skipped.length}): ${skipped.join(' ')}`);
}
module.exports = { designFor };
