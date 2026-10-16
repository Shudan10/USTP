'use strict';
// USTP batch 5: ores & materials, ranged & special weapons, tools & utility items, ocean blocks
//   A Clean Modern · B Natural Realistic · C Bold
//   node batch5.js --samples=<dir>                                   → labelled A/B/C comparison sheets
//   node batch5.js <bedrock-samples/resource_pack> [--preview=<dir>] → build the styles in choices.json
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const it = require('./items.js');
const b2 = require('./batch2.js');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mk } = it;
const { STYLE, PAL, masonry, sheet, texToRGBA } = b2;
const N = 128, ifbm = it.fbm, ITEM_STYLE = { A: 'modern', B: 'realistic', C: 'bold' };
const ORG = (base, dark, light, extra = {}) => mk({ kind: 'organic', base, dark, light, metal: 0, rough: 0.6, gloss: 20, spec: 0.3, ...extra });
const METAL = (base, dark, light, extra = {}) => mk({ kind: 'metal', base, dark, light, metal: 1, rough: 0.25, ...extra });
const GEM = (base, dark, light, emis = 0, extra = {}) => mk({ kind: 'gem', base, dark, light, metal: 0, rough: 0.05, emis, ...extra });
const toXY = (u, v) => [64 + (u + v) / Math.SQRT2, 64 + (v - u) / Math.SQRT2];
const polyline = (x, y, pts, r) => Math.min(...pts.slice(1).map((p, k) => sdSeg(x, y, pts[k][0], pts[k][1], p[0], p[1], r)));
const rotE = (x, y, cx, cy, rx, ry, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, rx, ry); };
const ball = (cx, cy, r, mat, extra = {}) => ({ d: P => sdCircle(P.x, P.y, cx, cy, r), mat, profile: 'round', bw: r, z: 1, ...extra });
const lumps = (pts, mat, seed, z = 1) => pts.map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.2, P.y * 0.2, seed + k) - 0.5) * 9, mat, profile: 'round', bw: r * 0.8, z: z + k * 0.3 }));
const pile = (mat, seed) => { const out = []; for (let k = 0; k < 140; k++) { const x = 20 + h2(seed, k, 1) * 88, y = 46 + h2(seed, k, 2) * 66, r = 5.5 + h2(seed, k, 3) * 3; if (sdEllipse(x, y, 64, 94, 44, 32) < 0 && y > 94 - (44 - Math.abs(x - 64)) * 0.95) out.push([x, y, r]); } return [{ d: P => Math.min(...out.map(([x, y, r]) => sdCircle(P.x, P.y, x, y, r))), mat, profile: 'round', bw: 4, z: 1 }]; };

// ---------------------------------------------------------------- materials
const M = {
  iron: 'iron', gold: 'gold', copper: 'copper', netherite: 'netherite', steel: 'steel', diamond: 'diamond', wood: 'wood', leather: 'leather', carbon: 'carbon', glass: 'glass',
  emerald: GEM('#2ad46a', '#05401b', '#d8ffe4', 0.08),
  lapis: GEM('#2a52c8', '#081a5a', '#c8d8ff', 0.04),
  amethyst: GEM('#a46ae0', '#2e0e5a', '#f4e8ff', 0.12),
  quartz: GEM('#ece6dc', '#8a8078', '#ffffff', 0),
  coal: mk({ kind: 'gem', base: '#2a2a2e', dark: '#060608', light: '#9a9aa8', metal: 0, rough: 0.35, emis: 0 }),
  charcoal: ORG('#2e2622', '#0a0806', '#8a7a70', { gloss: 8, spec: 0.1, mottle: 0.35 }),
  rawIron: ORG('#d8b8a0', '#5a4434', '#fff4ec', { gloss: 18, spec: 0.35, mottle: 0.4, grain: 0.6 }),
  rawGold: ORG('#f0b830', '#6a4204', '#fff4c0', { gloss: 26, spec: 0.5, mottle: 0.4, grain: 0.6 }),
  rawCopper: ORG('#d87848', '#5a2410', '#ffd8c0', { gloss: 22, spec: 0.4, mottle: 0.45, grain: 0.6 }),
  scrap: METAL('#4a3e3e', '#120c0c', '#b8a4a4', { rough: 0.5 }),
  flint: mk({ kind: 'gem', base: '#46464c', dark: '#0e0e12', light: '#c0c0cc', metal: 0, rough: 0.2, emis: 0 }),
  clay: ORG('#9aa2b2', '#3a4250', '#f0f4ff', { gloss: 14, spec: 0.2 }),
  brick: ORG('#b85a3a', '#4a1a0a', '#ffd0b0', { gloss: 10, spec: 0.15, mottle: 0.3, grain: 0.8 }),
  netherbrick: ORG('#4a1e24', '#140608', '#c08088', { gloss: 10, spec: 0.15, mottle: 0.3, grain: 0.8 }),
  resin: ORG('#e8701a', '#5a2200', '#ffe0b0', { gloss: 50, spec: 0.8 }),
  glowdust: ORG('#ffd040', '#7a5000', '#fffbe0', { gloss: 14, spec: 0.25, mottle: 0.4, grain: 1.5, emis: 0.7 }),
  redstone: ORG('#d8140e', '#4a0000', '#ffb0a0', { gloss: 14, spec: 0.25, mottle: 0.4, grain: 1.5, emis: 0.6 }),
};
const ingot = (mat, stamp = true) => [
  { d: P => sdPoly(P.x, P.y, [[12, 100], [116, 100], [100, 46], [28, 46]]), mat, profile: 'bevel', bw: 12, z: 1, deco: P => (stamp && Math.abs(sdBox(P.x, P.y, 64, 73, 22, 9, 3)) < 1 ? { dh: -1, dark: 0.3 } : null) },
];
const nugget = mat => [...lumps([[50, 72, 18], [76, 62, 15], [70, 86, 13]], mat, 7)];
const brilliant = mat => [{ d: P => sdPoly(P.x, P.y, [[22, 50], [44, 26], [84, 26], [106, 50], [64, 112]]), mat, profile: 'ridge', bw: 16, z: 1,
  deco: P => ([[44, 26, 64, 50], [84, 26, 64, 50], [22, 50, 106, 50]].some(([x0, y0, x1, y1]) => Math.abs(sdSeg(P.x, P.y, x0, y0, x1, y1, 0)) < 0.8) ? { dh: 0.6, edge: true } : null) }];
const stepCut = mat => [{ d: P => sdPoly(P.x, P.y, [[44, 18], [84, 18], [104, 38], [104, 90], [84, 110], [44, 110], [24, 90], [24, 38]]), mat, profile: 'bevel', bw: 14, z: 1,
  deco: P => (Math.abs(sdBox(P.x, P.y, 64, 64, 22, 34, 6)) < 0.8 ? { dh: 0.5, edge: true } : null) }];
const shard = (mat, pts) => [{ d: P => sdPoly(P.x, P.y, pts), mat, profile: 'ridge', bw: 14, z: 1 }];
const MATERIALS = {
  iron_ingot: () => ingot(M.iron), gold_ingot: () => ingot(M.gold), copper_ingot: () => ingot(M.copper), netherite_ingot: () => ingot(M.netherite),
  netherite_scrap: () => lumps([[56, 68, 26], [80, 80, 18], [44, 88, 16]], M.scrap, 11),
  diamond: () => brilliant(M.diamond), emerald: () => stepCut(M.emerald), dye_powder_blue: () => shard(M.lapis, [[30, 60], [58, 24], [100, 40], [96, 84], [60, 106], [24, 92]]),
  amethyst_shard: () => shard(M.amethyst, [[40, 108], [30, 70], [52, 20], [70, 44], [96, 34], [88, 92]]),
  quartz: () => [[46, 70, 16], [72, 56, 18], [64, 88, 14]].map(([x, y, r], k) => ({ d: P => sdPoly(P.x, P.y, [[x, y - r * 1.5], [x + r * 0.8, y - r * 0.4], [x + r * 0.8, y + r], [x - r * 0.8, y + r], [x - r * 0.8, y - r * 0.4]]), mat: M.quartz, profile: 'ridge', bw: r * 0.6, z: 1 + k })),
  coal: () => [{ d: P => sdPoly(P.x, P.y, [[28, 56], [50, 28], [86, 30], [106, 58], [94, 96], [56, 106], [26, 88]]) + (ifbm(P.x * 0.15, P.y * 0.15, 3) - 0.5) * 8, mat: M.coal, profile: 'ridge', bw: 16, z: 1 }],
  charcoal: () => [{ d: P => sdPoly(P.x, P.y, [[28, 56], [50, 28], [86, 30], [106, 58], [94, 96], [56, 106], [26, 88]]), mat: M.charcoal, profile: 'bevel', bw: 10, z: 1, deco: P => ((P.x + P.y * 0.3) % 12 < 1.5 ? { dh: -0.8, dark: 0.4 } : null) }],
  raw_iron: () => lumps([[52, 70, 24], [80, 58, 20], [74, 90, 18], [42, 94, 14]], M.rawIron, 21),
  raw_gold: () => lumps([[52, 70, 24], [80, 58, 20], [74, 90, 18], [42, 94, 14]], M.rawGold, 25),
  raw_copper: () => lumps([[52, 70, 24], [80, 58, 20], [74, 90, 18], [42, 94, 14]], M.rawCopper, 29),
  iron_nugget: () => nugget(M.iron), gold_nugget: () => nugget(M.gold), copper_nugget: () => nugget(M.copper),
  flint: () => shard(M.flint, [[30, 96], [36, 50], [62, 22], [96, 34], [100, 78], [70, 108]]),
  clay_ball: () => [ball(64, 68, 36, M.clay)],
  brick: () => [{ d: P => sdBox(P.u, P.v, 0, 0, 50, 22, 4), mat: M.brick, profile: 'bevel', bw: 8, z: 1, axis: 'u' }],
  netherbrick: () => [{ d: P => sdBox(P.u, P.v, 0, 0, 50, 22, 4), mat: M.netherbrick, profile: 'bevel', bw: 8, z: 1, axis: 'u' }],
  resin_brick: () => [{ d: P => sdBox(P.u, P.v, 0, 0, 50, 22, 4), mat: M.resin, profile: 'bevel', bw: 8, z: 1, axis: 'u' }],
  resin_clump: () => lumps([[56, 70, 26], [80, 60, 18], [72, 92, 16]], M.resin, 33),
  glowstone_dust: () => pile(M.glowdust, 41),
  redstone_dust: () => pile(M.redstone, 43),
};

// ---------------------------------------------------------------- ranged & special weapons
const W = {
  string: ORG('#f0f0ec', '#8a8a86', '#ffffff', { gloss: 10, spec: 0.15 }),
  feather: ORG('#f2f2f2', '#8a8a92', '#ffffff', { gloss: 10, spec: 0.15 }),
  fletch: ORG('#c8302a', '#4a0806', '#ffd0c8', { gloss: 14, spec: 0.2 }),
  tipGrey: METAL('#b8b8b8', '#3a3a3a', '#ffffff'),           // tinted by the potion colour in-game
  prismarine: METAL('#5ab4a0', '#123e36', '#e8fff8', { rough: 0.3 }),
  rocket: ORG('#c82828', '#4a0606', '#ffd8d8', { gloss: 30, spec: 0.4 }),
};
function bowParts(pull, arrow) {
  const limb = Array.from({ length: 31 }, (_, k) => { const u = -62 + k * (124 / 30); return toXY(u, -34 * (1 - (u / 62) ** 2) + pull * 0.35 * (1 - (u / 62) ** 2)); });
  const [ax, ay] = toXY(-62, 0), [bx, by] = toXY(62, 0), [nx, ny] = toXY(0, pull);
  return [
    { d: P => Math.min(sdSeg(P.x, P.y, ax, ay, nx, ny, 1.4), sdSeg(P.x, P.y, nx, ny, bx, by, 1.4)), mat: W.string, profile: 'round', bw: 1.4, z: 1 },
    { d: P => polyline(P.x, P.y, limb, 4.2), mat: M.wood, profile: 'round', bw: 4.2, z: 2 },
    { d: P => { const [gx, gy] = toXY(0, -34); return sdCircle(P.x, P.y, gx, gy, 7); }, mat: M.leather, profile: 'round', bw: 6, z: 4 },
    ...[-62, 62].map(u => { const [cx, cy] = toXY(u, 0); return ball(cx, cy, 5, M.steel, { z: 5 }); }),
    ...(arrow ? arrowParts(0, pull, -1, 0.85) : []),
  ];
}
// arrow along the bow's v axis (pointing up-left) when nocked, or along the icon diagonal
function arrowParts(u0, v0, dir = 0, scale = 1, opts = {}) {
  const at = t => (dir ? toXY(u0, v0 - t * scale) : toXY(t * scale, 0));
  const [tx, ty] = at(-56), [hx, hy] = at(44), [px, py] = at(68);
  const side = dir ? [1 / Math.SQRT2, 1 / Math.SQRT2] : [1 / Math.SQRT2, -1 / Math.SQRT2], perp = dir ? [1 / Math.SQRT2, -1 / Math.SQRT2] : [1 / Math.SQRT2, 1 / Math.SQRT2];
  const tip = [[hx + perp[0] * 9, hy + perp[1] * 9], [px, py], [hx - perp[0] * 9, hy - perp[1] * 9]];
  const fl = s => { const [ax, ay] = at(-60), [bx, by] = at(-38); return [[ax, ay], [bx, by], [bx + perp[0] * 9 * s, by + perp[1] * 9 * s], [ax + perp[0] * 11 * s, ay + perp[1] * 11 * s]]; };
  void side;
  const parts = [];
  if (!opts.headOnly) {
    parts.push({ d: P => sdSeg(P.x, P.y, tx, ty, hx, hy, 2.4), mat: M.wood, profile: 'round', bw: 2.4, z: 6 });
    parts.push({ d: P => Math.min(sdPoly(P.x, P.y, fl(1)), sdPoly(P.x, P.y, fl(-1))), mat: W.fletch, profile: 'bevel', bw: 2, z: 7 });
  }
  if (!opts.noHead) parts.push({ d: P => sdPoly(P.x, P.y, tip), mat: opts.headMat || M.steel, profile: 'ridge', bw: 5, z: 8 });
  return parts;
}
function crossbowParts(state) { // state: standby | pull0..2 | arrow | firework
  const pullU = { standby: 30, pull0: 18, pull1: 6, pull2: -6, arrow: -6, firework: -6 }[state];
  const limb = Array.from({ length: 21 }, (_, k) => { const v = -50 + k * 5; return toXY(34 + (1 - (v / 50) ** 2) * 6, v); });
  const [ax, ay] = toXY(34, -50), [bx, by] = toXY(34, 50), [nx, ny] = toXY(pullU, 0);
  return [
    { d: P => sdBox(P.u, P.v, -14, 0, 50, 6, 3), mat: M.wood, profile: 'bevel', bw: 4, z: 1, axis: 'u' },
    { d: P => sdBox(P.u, P.v, -48, 7, 10, 7, 3), mat: M.leather, profile: 'bevel', bw: 3, z: 2 },
    { d: P => Math.min(sdSeg(P.x, P.y, ax, ay, nx, ny, 1.3), sdSeg(P.x, P.y, nx, ny, bx, by, 1.3)), mat: W.string, profile: 'round', bw: 1.3, z: 3 },
    { d: P => polyline(P.x, P.y, limb, 4.5), mat: M.steel, profile: 'round', bw: 4.5, z: 4 },
    { d: P => sdBox(P.u, P.v, 34, 0, 6, 8, 2), mat: M.iron, profile: 'bevel', bw: 2, z: 5 },
    ...(state === 'arrow' ? arrowParts(0, 0, 0, 0.7) : []),
    ...(state === 'firework' ? [{ d: P => sdSeg(P.u, P.v, -6, 0, 46, 0, 6), mat: W.rocket, profile: 'round', bw: 6, z: 7, axis: 'u' }, { d: P => sdPoly(P.u, P.v, [[46, -7], [60, 0], [46, 7]]), mat: ORG('#e8e0d0', '#6a6050', '#ffffff'), profile: 'ridge', bw: 4, z: 8 }] : []),
  ];
}
const RANGED = {
  bow_standby: () => bowParts(0, false), bow_pulling_0: () => bowParts(12, true), bow_pulling_1: () => bowParts(20, true), bow_pulling_2: () => bowParts(28, true),
  crossbow_standby: () => crossbowParts('standby'), crossbow_pulling_0: () => crossbowParts('pull0'), crossbow_pulling_1: () => crossbowParts('pull1'), crossbow_pulling_2: () => crossbowParts('pull2'),
  crossbow_arrow: () => crossbowParts('arrow'), crossbow_firework: () => crossbowParts('firework'),
  arrow: () => arrowParts(0, 0), tipped_arrow_base: () => arrowParts(0, 0, 0, 1, { noHead: true }), tipped_arrow_head: () => arrowParts(0, 0, 0, 1, { headOnly: true, headMat: W.tipGrey }),
  trident: () => [
    { d: P => sdSeg(P.u, P.v, -76, 0, 28, 0, 3.6), mat: W.prismarine, profile: 'round', bw: 3.6, z: 1, axis: 'u', deco: P => (P.u < -50 && Math.sin(P.u * 1.4) > 0.5 ? { dark: 0.35 } : null) },
    { d: P => Math.min(sdBox(P.u, P.v, 30, 0, 4, 18, 2), sdPoly(P.u, P.v, [[30, -3], [76, 0], [30, 3]]), sdPoly(P.u, P.v, [[30, -18], [60, -16], [34, -12]]), sdPoly(P.u, P.v, [[30, 18], [60, 16], [34, 12]])), mat: W.prismarine, profile: 'ridge', bw: 4, z: 3 },
  ],
  mace: () => [
    { d: P => sdSeg(P.u, P.v, -66, 0, 14, 0, 4.4), mat: M.carbon, profile: 'round', bw: 4.4, z: 1, axis: 'u', deco: P => (P.u < -36 && Math.sin(P.u * 1.2 + P.v) > 0.5 ? { dh: 0.6, dark: 0.3 } : null) },
    { d: P => sdPoly(P.u, P.v, Array.from({ length: 16 }, (_, k) => { const a = k * Math.PI / 8, r = k % 2 ? 15 : 26; return [36 + Math.cos(a) * r, Math.sin(a) * r]; })), mat: M.steel, profile: 'ridge', bw: 8, z: 3 },
    ball(...toXY(36, 0), 9, M.gold, { z: 6 }),
  ],
};

// ---------------------------------------------------------------- tools & utility items
const U = {
  water: ORG('#2a6ae8', '#081a5a', '#e0f0ff', { gloss: 80, spec: 1 }),
  lava: ORG('#ff6a10', '#6a1000', '#fff0a0', { gloss: 40, spec: 0.6, emis: 0.9 }),
  milk: ORG('#f4f2ee', '#9a9890', '#ffffff', { gloss: 40, spec: 0.5 }),
  powder: ORG('#eef4fa', '#9aa8b8', '#ffffff', { gloss: 10, spec: 0.2, mottle: 0.3, grain: 1.2 }),
  paper: ORG('#f2ead8', '#9a8e74', '#ffffff', { gloss: 8, spec: 0.1, mottle: 0.15 }),
  cover: ORG('#7a3a22', '#2a0e06', '#e0a080', { gloss: 18, spec: 0.3, mottle: 0.25 }),
  enchant: ORG('#6a2a9a', '#1e0636', '#f0d0ff', { gloss: 30, spec: 0.5, emis: 0.15 }),
  quill: ORG('#f2f2f2', '#8a8a92', '#ffffff', { gloss: 10, spec: 0.15 }),
  rope: ORG('#c8a070', '#5a4020', '#fff0d0', { gloss: 10, spec: 0.15, mottle: 0.3 }),
  tag: ORG('#d8c8a8', '#6a5a40', '#ffffff', { gloss: 14, spec: 0.2 }),
  carrot: ORG('#f07a1a', '#6a2a00', '#ffe0b0', { gloss: 26, spec: 0.4 }),
  fungus: ORG('#16a08a', '#043a32', '#c8fff0', { gloss: 20, spec: 0.3 }),
  horn: ORG('#c8b89a', '#5a4a34', '#ffffff', { gloss: 24, spec: 0.35, mottle: 0.3 }),
  bristle: ORG('#d8c090', '#6a5a30', '#ffffff', { gloss: 8, spec: 0.1, mottle: 0.4, grain: 2 }),
};
function bucket(fill) {
  return [
    { d: P => polyline(P.x, P.y, Array.from({ length: 17 }, (_, k) => { const a = Math.PI + k * Math.PI / 16; return [64 + Math.cos(a) * 42, 44 + Math.sin(a) * 30]; }), 2.4), mat: M.steel, profile: 'round', bw: 2.4, z: 1 },
    { d: P => Math.min(sdPoly(P.x, P.y, [[20, 44], [108, 44], [96, 112], [32, 112]]), sdEllipse(P.x, P.y, 64, 112, 32, 6)), mat: M.iron, profile: 'bevel', bw: 5, z: 2, form: P => Math.sqrt(Math.max(0, 1 - ((P.x - 64) / 46) ** 2)) * 6,
      deco: P => (Math.abs(P.y - 76) < 1.2 || Math.abs(P.y - 96) < 1.2 ? { dh: -1, dark: 0.3 } : null) },
    { d: P => sdEllipse(P.x, P.y, 64, 44, 44, 10), mat: M.iron, profile: 'bevel', bw: 3, z: 4 },
    { d: P => sdEllipse(P.x, P.y, 64, 45, 38, 7), mat: fill || ORG('#2a2c30', '#0a0a0c', '#8a8c90'), profile: 'bevel', bw: 2, z: 6 },
  ];
}
const book = (cover, extra = []) => [
  { d: P => sdBox(P.x, P.y, 66, 66, 38, 46, 4), mat: U.paper, profile: 'bevel', bw: 3, z: 1, deco: P => (P.x > 98 && Math.sin(P.y * 1.6) > 0.3 ? { dark: 0.2 } : null) },
  { d: P => sdBox(P.x, P.y, 60, 64, 38, 46, 5), mat: cover, profile: 'bevel', bw: 5, z: 3, deco: P => (Math.abs(P.x - 30) < 1.2 ? { dh: -1, dark: 0.35 } : null) },
  ...extra,
];
const stickRod = (u0, u1, r = 3, mat = M.wood) => ({ d: P => sdSeg(P.u, P.v, u0, 0, u1, 0, r), mat, profile: 'round', bw: r, z: 1, axis: 'u' });
const TOOLS = {
  shears: () => [
    { d: P => Math.min(Math.abs(sdCircle(P.x, P.y, 34, 94, 13)) - 4, Math.abs(sdCircle(P.x, P.y, 56, 106, 11)) - 4), mat: M.carbon, profile: 'round', bw: 4, z: 1 },
    { d: P => sdPoly(P.x, P.y, [[40, 82], [48, 88], [108, 22], [102, 18]]), mat: M.steel, profile: 'ridge', bw: 5, z: 2 },
    { d: P => sdPoly(P.x, P.y, [[50, 96], [56, 102], [114, 40], [110, 32]]), mat: M.iron, profile: 'ridge', bw: 5, z: 3 },
    ball(56, 82, 4.5, M.gold, { z: 6 }),
  ],
  flint_and_steel: () => [
    { d: P => Math.max(Math.abs(sdCircle(P.x, P.y, 50, 74, 28)) - 5, P.x - 64), mat: M.steel, profile: 'round', bw: 5, z: 1 },
    { d: P => sdPoly(P.x, P.y, [[72, 46], [96, 34], [110, 60], [92, 84], [70, 72]]), mat: M.flint, profile: 'ridge', bw: 10, z: 2 },
  ],
  fishing_rod_uncast: () => [stickRod(-70, 66, 2.6), { d: P => sdCircle(P.u, P.v, -40, 8, 7), mat: M.steel, profile: 'round', bw: 6, z: 3 },
    { d: P => Math.min(polyline(P.x, P.y, [toXY(66, 0), [112, 70], [112, 100]], 1), Math.abs(sdCircle(P.x, P.y, 106, 104, 6)) - 1.5), mat: W.string, profile: 'round', bw: 1, z: 2 }],
  fishing_rod_cast: () => [stickRod(-70, 66, 2.6), { d: P => sdCircle(P.u, P.v, -40, 8, 7), mat: M.steel, profile: 'round', bw: 6, z: 3 }],
  carrot_on_a_stick: () => [stickRod(-70, 66, 2.6), { d: P => polyline(P.x, P.y, [toXY(66, 0), [112, 70]], 1), mat: W.string, profile: 'round', bw: 1, z: 2 }, { d: P => sdPoly(P.x, P.y, [[104, 64], [120, 80], [112, 108], [100, 80]]), mat: U.carrot, profile: 'ridge', bw: 6, z: 4 }],
  warped_fungus_on_a_stick: () => [stickRod(-70, 66, 2.6), { d: P => polyline(P.x, P.y, [toXY(66, 0), [112, 74]], 1), mat: W.string, profile: 'round', bw: 1, z: 2 }, { d: P => Math.max(sdEllipse(P.x, P.y, 110, 92, 15, 12), P.y - 94), mat: U.fungus, profile: 'round', bw: 8, z: 4 }, { d: P => sdSeg(P.x, P.y, 110, 92, 110, 108, 3), mat: ORG('#e8d0a0', '#6a5030', '#ffffff'), profile: 'round', bw: 3, z: 3 }],
  bucket_empty: () => bucket(null), bucket_water: () => bucket(U.water), bucket_lava: () => bucket(U.lava), bucket_milk: () => bucket(U.milk), bucket_powder_snow: () => bucket(U.powder),
  lead: () => [{ d: P => Math.min(Math.abs(sdEllipse(P.x, P.y, 60, 60, 38, 30)) - 4.5, Math.abs(sdEllipse(P.x, P.y, 68, 70, 34, 26)) - 4.5, sdSeg(P.x, P.y, 90, 88, 110, 114, 4.5)), mat: U.rope, profile: 'round', bw: 4.5, z: 1, deco: P => (Math.sin((P.x + P.y) * 0.9) > 0.6 ? { dh: -0.6, dark: 0.25 } : null) }],
  name_tag: () => [{ d: P => Math.max(sdPoly(P.x, P.y, [[36, 30], [104, 30], [104, 98], [36, 98], [16, 64]]), -sdCircle(P.x, P.y, 32, 64, 5)), mat: U.tag, profile: 'bevel', bw: 4, z: 1 },
    { d: P => Math.abs(sdCircle(P.x, P.y, 20, 44, 14)) - 2, mat: W.string, profile: 'round', bw: 2, z: 2 }],
  saddle: () => [{ d: P => sdPoly(P.x, P.y, [[16, 54], [44, 36], [84, 34], [112, 50], [104, 76], [64, 86], [24, 78]]), mat: M.leather, profile: 'bevel', bw: 10, z: 1, deco: P => (Math.abs(sdPoly(P.x, P.y, [[16, 54], [44, 36], [84, 34], [112, 50], [104, 76], [64, 86], [24, 78]]) + 5) < 0.8 ? { dh: -0.6, dark: 0.35 } : null) },
    { d: P => Math.min(sdSeg(P.x, P.y, 40, 80, 40, 104, 2.5), sdSeg(P.x, P.y, 88, 80, 88, 104, 2.5)), mat: M.leather, profile: 'round', bw: 2.5, z: 2 },
    { d: P => Math.min(Math.abs(sdBox(P.x, P.y, 40, 110, 8, 6, 3)) - 2, Math.abs(sdBox(P.x, P.y, 88, 110, 8, 6, 3)) - 2), mat: M.iron, profile: 'round', bw: 2, z: 3 }],
  book_normal: () => book(U.cover), book_written: () => book(U.cover, [{ d: P => sdBox(P.x, P.y, 62, 48, 18, 4, 1.5), mat: M.gold, profile: 'bevel', bw: 1.5, z: 8 }]),
  book_writable: () => book(U.cover, [{ d: P => Math.min(sdSeg(P.x, P.y, 70, 96, 112, 18, 3), rotE(P.x, P.y, 100, 36, 18, 6, -1.08)), mat: U.quill, profile: 'round', bw: 4, z: 9 }, ball(70, 96, 3.5, M.carbon, { z: 10 })]),
  book_enchanted: () => book(U.enchant, [{ d: P => Math.min(...[[44, 36], [78, 58], [52, 84], [86, 92]].map(([x, y]) => sdPoly(P.x, P.y, [[x, y - 7], [x + 2, y - 2], [x + 7, y], [x + 2, y + 2], [x, y + 7], [x - 2, y + 2], [x - 7, y], [x - 2, y - 2]]))), mat: GEM('#f8e8ff', '#a070d0', '#ffffff', 0.9), profile: 'ridge', bw: 3, z: 9 }]),
  paper: () => [{ d: P => sdPoly(P.x, P.y, [[26, 22], [100, 18], [106, 104], [30, 110]]), mat: U.paper, profile: 'bevel', bw: 4, z: 1, form: P => Math.sin((P.x - 26) / 80 * Math.PI) * 3 }],
  map_empty: () => [{ d: P => sdPoly(P.x, P.y, [[22, 22], [106, 22], [106, 106], [22, 106]]), mat: U.paper, profile: 'bevel', bw: 4, z: 1, deco: P => ((P.x % 14 < 1 || P.y % 14 < 1) ? { dark: 0.12 } : null) }],
  stick: () => [stickRod(-58, 58, 4)],
  brush: () => [stickRod(-64, 20, 4), { d: P => sdBox(P.u, P.v, 26, 0, 8, 10, 2), mat: M.copper, profile: 'bevel', bw: 2, z: 2 }, { d: P => sdBox(P.u, P.v, 50, 0, 18, 13, 5), mat: U.bristle, profile: 'round', bw: 8, z: 3, axis: 'u' }],
  spyglass: () => [{ d: P => Math.min(sdSeg(P.u, P.v, -50, 0, 0, 0, 9), sdSeg(P.u, P.v, 0, 0, 52, 0, 11)), mat: M.copper, profile: 'round', bw: 9, z: 1, axis: 'u', deco: P => (Math.abs(P.u) < 1.2 || Math.abs(P.u - 40) < 1.2 ? { dh: -1, dark: 0.35 } : null) },
    { d: P => sdBox(P.u, P.v, 56, 0, 3, 11, 1), mat: M.glass, profile: 'bevel', bw: 2, z: 3 }],
  minecart_normal: () => [{ d: P => sdPoly(P.x, P.y, [[14, 44], [114, 44], [104, 96], [24, 96]]), mat: M.iron, profile: 'bevel', bw: 6, z: 1, deco: P => (Math.abs(P.y - 60) < 1 ? { dh: -1, dark: 0.35 } : null) },
    { d: P => sdEllipse(P.x, P.y, 64, 46, 46, 6), mat: ORG('#1a1a1e', '#000000', '#5a5a60'), profile: 'bevel', bw: 2, z: 3 },
    ...[38, 90].map(x => ({ d: P => sdCircle(P.x, P.y, x, 102, 11), mat: M.carbon, profile: 'round', bw: 8, z: 4 }))],
  compass_item: () => [ball(64, 64, 44, M.iron), { d: P => sdCircle(P.x, P.y, 64, 64, 34), mat: ORG('#e8e0d0', '#7a7060', '#ffffff'), profile: 'bevel', bw: 2, z: 6 },
    { d: P => sdPoly(P.x, P.y, [[64, 30], [70, 64], [58, 64]]), mat: ORG('#d81e22', '#4a0406', '#fff0f0'), profile: 'ridge', bw: 3, z: 8 }, { d: P => sdPoly(P.x, P.y, [[64, 98], [70, 64], [58, 64]]), mat: M.steel, profile: 'ridge', bw: 3, z: 8 }],
  clock_item: () => [ball(64, 64, 44, M.gold), { d: P => sdCircle(P.x, P.y, 64, 64, 34), mat: ORG('#f4ecd8', '#8a7a58', '#ffffff'), profile: 'bevel', bw: 2, z: 6, deco: P => ([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(k => Math.hypot(P.x - 64 - Math.cos(k * 0.5236) * 28, P.y - 64 - Math.sin(k * 0.5236) * 28) < 2) ? { dark: 0.7 } : null) },
    { d: P => Math.min(sdSeg(P.x, P.y, 64, 64, 64, 38, 2.2), sdSeg(P.x, P.y, 64, 64, 82, 70, 2.2)), mat: M.carbon, profile: 'round', bw: 2, z: 8 }],
  goat_horn: () => [{ d: P => polyline(P.x, P.y, [[24, 104], [40, 80], [64, 56], [92, 40], [112, 40], [118, 56]], 1) - (P.x < 24 ? 0 : 3 + (P.x - 24) * 0.09), mat: U.horn, profile: 'round', bw: 8, z: 1, deco: P => (Math.sin(P.x * 0.6 + P.y * 0.3) > 0.85 ? { dh: -0.8, dark: 0.25 } : null) }],
};

// ---------------------------------------------------------------- ocean blocks
Object.assign(PAL, {
  prismBrick: { A: G('#3e8a7e', '#4ea092', '#62b6a6', '#7ccabb'), B: G('#2a6a60', '#3a8478', '#509c8e', '#68b2a2', '#80c6b6'), C: G('#0e5a5a', '#1a8a84', '#2ac0b0', '#6af0de') },
  prismDark: { A: G('#22423a', '#2c5448', '#386656', '#467866'), B: G('#162e28', '#223e36', '#2e5044', '#3c6252'), C: G('#06261e', '#0e4234', '#1a6a52', '#30a080') },
});
const CORAL = { blue: ['#2a5ad8', '#7aa8ff'], pink: ['#d84a9a', '#ffa8d8'], purple: ['#9a3ad0', '#e0a0ff'], red: ['#d02a2a', '#ff9a8a'], yellow: ['#e8c81a', '#fff090'] };
function coralBlock(k, s, colour, dead) {
  const t = new Tex(), [c0, c1] = dead ? ['#7a7672', '#b8b4ae'] : CORAL[colour], pal = G('#000000', c0, c1).map(([p, c], i) => [p, i === 0 ? c.map((v, j) => g.hex(c0)[j] * 0.35) : c]);
  return t.each((x, y, i) => {
    let v, h;
    if (colour === 'pink') { const m = Math.sin(fbm(x, y, 4, 4, 3, s) * 30); v = 0.5 + m * 0.35; h = 0.5 + m * 0.3; }                                   // brain: maze ridges
    else if (colour === 'purple') { const w = worley(x, y, 12, s); v = 0.35 + (1 - Math.min(1, w.f1 / 0.5)) * 0.6; h = v; }                            // bubble: domes
    else if (colour === 'yellow') { const r = Math.sin((x + fbm(x, y, 2, 4, 2, s) * 40) * 0.5); v = 0.5 + r * 0.35; h = 0.5 + r * 0.25; }             // horn: ridges
    else if (colour === 'red') { const w = worley(x, y, 7, s); v = (w.f2 - w.f1) < 0.08 ? 0.85 : 0.35 + fbm(x, y, 6, 6, 3, s + 1) * 0.3; h = v; }    // fire: branching lines
    else { const w = worley(x, y, 16, s); v = w.f1 < 0.25 ? 0.15 : 0.55 + fbm(x, y, 6, 6, 3, s + 1) * 0.35; h = w.f1 < 0.25 ? 0.15 : 0.6; }         // tube: pores
    if (k === 'A') { v = 0.5 + (v - 0.5) * 0.6; h = 0.5 + (h - 0.5) * 0.5; }
    if (k === 'B') v += (fbm(x, y, 16, 16, 3, s + 7) - 0.5) * 0.25;
    if (k === 'C' && !dead) v = 0.2 + v * 0.95;
    t.col(i, grad(pal, clamp(v))); t.h[i] = clamp(h); t.r[i] = dead ? 0.95 : 0.7;
  });
}
function sponge(k, s, wet) {
  const t = new Tex(), pal = wet ? G('#6a6a1a', '#9a9a2a', '#b8b840', '#d0d060') : G('#a88a1e', '#d0b02e', '#e8cc48', '#f8e070');
  return t.each((x, y, i) => {
    const w = worley(x, y, k === 'C' ? 10 : 14, s), pore = w.f1 < (k === 'A' ? 0.22 : 0.3);
    let v = pore ? 0.12 : 0.5 + fbm(x, y, 6, 6, 3, s + 1) * 0.4;
    if (k === 'B' && !pore) v += (h2(s, x, y) - 0.5) * 0.2;
    t.col(i, grad(pal, v)); t.h[i] = pore ? 0.15 : 0.6; t.r[i] = wet ? 0.3 : 0.95;
  });
}
const OCEAN = k => [
  ['prismarine_bricks', s => masonry('prismBrick', k, { type: 'grid', bw: 32, bh: 32, offset: true }, s)],
  ['prismarine_dark', s => masonry('prismDark', k, { type: 'grid', bw: 64, bh: 64 }, s, { motif: t => t.each((x, y, i) => { if ((x % 64 === 32 || y % 64 === 32) && edgeDist(x, y, 64) > 6) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.2; } }) })],
  ['sponge', s => sponge(k, s, false)], ['sponge_wet', s => sponge(k, s, true)],
  ...Object.keys(CORAL).flatMap(c => [[`coral_${c}`, s => coralBlock(k, s, c, false)], [`coral_${c}_dead`, s => coralBlock(k, s, c, true)]]),
];

const ITEM_FAMILIES = { materials: MATERIALS, ranged: RANGED, tools: TOOLS };
const SAMPLE_NAMES = {
  materials: ['iron_ingot', 'gold_ingot', 'diamond', 'emerald', 'raw_copper'],
  ranged: ['bow_standby', 'bow_pulling_2', 'crossbow_arrow', 'trident', 'mace'],
  tools: ['shears', 'flint_and_steel', 'bucket_water', 'fishing_rod_uncast', 'book_enchanted'],
  ocean: ['prismarine_bricks', 'prismarine_dark', 'sponge', 'coral_blue', 'coral_pink'],
};

const samplesDir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
if (samplesDir && require.main === module) {
  fs.mkdirSync(samplesDir, { recursive: true });
  for (const fam of ['materials', 'ranged', 'tools']) sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => ({ key, tiles: SAMPLE_NAMES[fam].map((n, k) => it.render(n, ITEM_FAMILIES[fam][n](), 800 + k * 7, { style: ITEM_STYLE[key], write: false })) })));
  sheet(path.join(samplesDir, 'choices_ocean.png'), ['A', 'B', 'C'].map(key => { const list = OCEAN(key); return { key, tiles: SAMPLE_NAMES.ocean.map((n, k) => texToRGBA(list.find(e => e[0] === n)[1](7000 + k * 19).bake(STYLE[key].light))) }; }));
  console.log('Wrote batch 5 comparison sheets to', samplesDir);
}

const vanillaArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (vanillaArg && require.main === module) {
  const choices = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')), VT = path.join(vanillaArg, 'textures');
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = {};
  let ni = 0, nb = 0;
  for (const [fam, designs] of Object.entries(ITEM_FAMILIES)) {
    const key = choices[fam]; if (!key) continue;
    for (const [name, fn] of Object.entries(designs)) {
      if (!fs.existsSync(path.join(VT, 'items', name + '.png'))) { console.warn('skip (not a vanilla png item):', name); continue; }
      (previews[fam] = previews[fam] || []).push(it.render(name, fn(), 900 + ni * 13, { style: ITEM_STYLE[key] }));
      listed.add('items/' + name); ni++;
    }
  }
  if (choices.ocean) for (const [name, fn] of OCEAN(choices.ocean)) {
    if (!['png', 'tga'].some(e => fs.existsSync(path.join(VT, 'blocks', `${name}.${e}`)))) { console.warn('skip (not in vanilla):', name); continue; }
    const t = fn(13000 + nb * 31).bake(STYLE[choices.ocean].light);
    g.save(t, name); listed.add('blocks/' + name); nb++;
    (previews.ocean = previews.ocean || []).push(texToRGBA(t));
  }
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); for (const [fam, tiles] of Object.entries(previews)) b2.grid(path.join(previewDir, `batch5_${fam}.png`), tiles, 10); }
  console.log(`Batch 5: ${ni} items, ${nb} blocks.`);
}
module.exports = { MATERIALS, RANGED, TOOLS, OCEAN, SAMPLE_NAMES };
