'use strict';
// USTP batch 4: farm & nature blocks, torches, redstone & rails, ice & snow — each in three styles
//   A Clean Modern · B Natural Realistic · C Bold
//   node batch4.js --samples=<dir>                       → labelled A/B/C comparison sheets
//   node batch4.js <bedrock-samples/resource_pack> [--preview=<dir>]   → build the styles in choices.json
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const b2 = require('./batch2.js');
const b3 = require('./batch3.js');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { STYLE, masonry, sheet, texToRGBA, PAL } = b2;
const { STEEL, BRASS } = b3;
const N = 128;
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const metal = (t, i, pal, v, h = 0.8, rough = 0.3) => { t.col(i, grad(pal, v)); t.m[i] = 1; t.r[i] = rough; t.h[i] = h; };
const clear = (t, i) => { t.a[i] = 0; t.col(i, [0, 0, 0]); t.h[i] = 0; };
const glowPx = (t, i, c, e = 1) => { t.col(i, c); t.e[i] = e; t.m[i] = 0; t.r[i] = 0.4; };

// ---------------------------------------------------------------- farm & nature
const PUMP = { A: G('#b85a0a', '#d8730f', '#f08a1a', '#ffa63a'), B: G('#7e3804', '#a8500c', '#c86a14', '#e0852a', '#eea050'), C: G('#7a2400', '#c04800', '#ff6a00', '#ff9a30') };
const MELON = { A: G('#2e6a14', '#3e8a1c', '#56a828', '#7ac83c'), B: G('#1e4a0c', '#2e6a14', '#4a8a22', '#6aa834', '#8cc04c'), C: G('#0c3a04', '#1e6a0a', '#3aa814', '#7ae830') };
const HAY = { A: G('#9a7a1a', '#c09a28', '#dcb83c', '#f0d460'), B: G('#7a5a10', '#a07a1c', '#c09a30', '#d8b448', '#ead070'), C: G('#8a5a00', '#c88a00', '#ffb400', '#ffe060') };
const CACT = { A: G('#1e5a28', '#2a7434', '#3a8e42', '#52a85a'), B: G('#123e1a', '#1e5a26', '#2e7434', '#468e48', '#62a85e'), C: G('#06381a', '#0e5c26', '#1a8a36', '#3ac85a') };
const TWINE = { A: G('#5a2a1a', '#7a3a24', '#9a4c30'), B: G('#3a1a0e', '#5a2a18', '#7a3c24'), C: G('#6a0a0a', '#a81818', '#e03030') };
const RIB = { A: 0.18, B: 0.28, C: 0.45 };
function pumpkinSide(k, s, face = null) {
  const t = new Tex(), st = STYLE[k];
  return t.each((x, y, i) => {
    const lx = x % 16, curve = Math.sin(Math.PI * (lx + 0.5) / 16), n = fbm(x, y, 4, 4, 4, s);
    let v = 0.35 + curve * 0.4 + (n - 0.5) * (k === 'B' ? 0.4 : 0.15);
    if (k === 'B' && worley(x, y, 9, s + 3).f1 < 0.1) v -= 0.25;
    t.col(i, grad(PUMP[k], v)); t.h[i] = 0.35 + curve * 0.45; t.r[i] = k === 'A' ? 0.35 : k === 'B' ? 0.85 : 0.5;
    if (lx === 0 || (k === 'C' && lx === 15)) { t.col(i, mul(t.get(i), 1 - RIB[k] * 1.6)); t.h[i] = 0.15; }
    if (face) {
      const eye = (cx) => { const dx = Math.abs(x - cx), dy = y - 36; return dy >= 0 && dy <= 22 && dx <= dy * 0.7; };
      const mouth = y >= 74 && y <= 98 && x >= 26 && x <= 102 && !(y < 84 && Math.abs(((x - 26) % 19) - 9.5) < 4) && !(y > 90 && Math.abs(((x - 35) % 19) - 9.5) < 3.5);
      if (eye(40) || eye(88) || mouth) {
        if (face === 'on') { const c = mix([1, 0.55, 0.08], [1, 0.92, 0.45], sstep(98, 36, y)); glowPx(t, i, c, 1); }
        else { t.col(i, k === 'C' ? [0.04, 0.01, 0] : [0.12, 0.05, 0.01]); t.h[i] = 0.05; t.m[i] = 0; }
      }
    }
  });
}
function pumpkinTop(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const a = Math.atan2(y - 63.5, x - 63.5), r = Math.hypot(x - 63.5, y - 63.5), rib = Math.abs(Math.sin(a * 6));
    t.col(i, grad(PUMP[k], 0.3 + (1 - rib) * 0.35 + (fbm(x, y, 4, 4, 3, s) - 0.5) * 0.2 + Math.min(r, 64) / 64 * 0.15)); t.h[i] = 0.4 + (1 - rib) * 0.3;
    if (rib < 0.08 && r > 14) { t.col(i, mul(t.get(i), 1 - RIB[k])); t.h[i] = 0.2; }
    if (r < 12) { t.col(i, grad(G('#2a3a10', '#4a5a1e', '#6a7a2e'), 0.4 + (12 - r) / 24)); t.h[i] = 0.9; t.r[i] = 0.8; }
  });
}
function melonSide(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const stripe = Math.sin(Math.PI * 2 * (x / N * 6 + (fbm(x, y, 3, 2, 3, s) - 0.5) * 0.7));
    const n = fbm(x, y, 8, 8, 3, s + 1);
    t.col(i, grad(MELON[k], 0.5 + stripe * (k === 'C' ? 0.42 : 0.28) + (n - 0.5) * (k === 'B' ? 0.35 : 0.12))); t.h[i] = 0.5 + stripe * 0.08; t.r[i] = k === 'A' ? 0.3 : 0.6;
  });
}
function melonTop(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const a = Math.atan2(y - 63.5, x - 63.5), r = Math.hypot(x - 63.5, y - 63.5), stripe = Math.sin(a * 6 + r * 0.03);
    t.col(i, grad(MELON[k], 0.5 + stripe * 0.3 + (fbm(x, y, 6, 6, 3, s) - 0.5) * 0.2)); t.h[i] = 0.5; t.r[i] = k === 'A' ? 0.3 : 0.6;
    if (r < 10) t.col(i, grad(G('#5a6a1e', '#7a8a2e', '#9aaa40'), 0.5));
  });
}
function haySide(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const strand = fbm(x, y, 40, 2, 3, s), fine = h2(s, x, y >> 3);
    t.col(i, grad(HAY[k], 0.25 + strand * 0.6 + (fine - 0.5) * (k === 'B' ? 0.25 : 0.1))); t.h[i] = 0.4 + strand * 0.3; t.r[i] = 0.95;
    for (const by of [20, 108]) if (Math.abs(y - by) < (k === 'C' ? 7 : 5)) { t.col(i, grad(TWINE[k], 0.4 + Math.sin(x * 0.8 + y) * 0.3)); t.h[i] = 0.8; }
  });
}
function hayTop(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const c = worley(x, y, 32, s), cut = 1 - Math.min(1, c.f1 / 0.45);
    t.col(i, grad(HAY[k], 0.25 + cut * 0.5 + (h2(s, c.id, 1) - 0.5) * 0.25)); t.h[i] = 0.3 + cut * 0.5; t.r[i] = 0.95;
    for (const bx of [20, 108]) if (Math.abs(x - bx) < (k === 'C' ? 7 : 5)) { t.col(i, grad(TWINE[k], 0.5)); t.h[i] = 0.85; }
  });
}
function cactusSide(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const spineRow = [12, 52, 92].some(r => y >= r && y < r + 6);
    if ((x < 8 || x > 119) && !spineRow) { clear(t, i); return; }
    if (x < 8 || x > 119) { t.col(i, [0.92, 0.9, 0.78]); t.h[i] = 0.9; t.r[i] = 0.6; return; }  // spines poking out of the inset
    const lx = (x - 8) % 16, curve = Math.sin(Math.PI * (lx + 0.5) / 16);
    t.col(i, grad(CACT[k], 0.3 + curve * 0.5 + (fbm(x, y, 4, 8, 3, s) - 0.5) * (k === 'B' ? 0.3 : 0.1))); t.h[i] = 0.3 + curve * 0.5; t.r[i] = 0.55;
    if (lx === 0) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.15; }
    if (lx === 8 && ((y + (x >> 4) * 11) % 24) < 3) { t.col(i, k === 'C' ? [1, 1, 0.85] : [0.92, 0.9, 0.78]); t.h[i] = 1; }
  });
}
function cactusCap(k, s, bottom) {
  const t = new Tex();
  return t.each((x, y, i) => {
    if (edgeDist(x, y) < 8) { clear(t, i); return; }
    const a = Math.atan2(y - 63.5, x - 63.5), r = Math.hypot(x - 63.5, y - 63.5), rib = Math.abs(Math.sin(a * 4));
    t.col(i, mul(grad(CACT[k], 0.35 + (1 - rib) * 0.35 + (fbm(x, y, 6, 6, 3, s) - 0.5) * 0.15), bottom ? 0.75 : 1)); t.h[i] = 0.4 + (1 - rib) * 0.3; t.r[i] = 0.55;
    if (!bottom && r < 8) { t.col(i, k === 'C' ? [1, 0.85, 0.2] : [0.85, 0.82, 0.5]); t.h[i] = 0.9; }
  });
}
function sugarCane(k, s) {
  const t = new Tex(), pal = { A: G('#5a9a3a', '#7ab84a', '#9ad060', '#bce880'), B: G('#3e7428', '#5a9238', '#7aac4a', '#9ac460'), C: G('#2a7a14', '#4aa820', '#7ad83a', '#b0ff60') }[k];
  return t.each((x, y, i) => {
    const stalk = [[24, 7], [64, 8], [102, 7]].find(([cx, w]) => Math.abs(x - cx) <= w);
    if (!stalk) { clear(t, i); return; }
    const [cx, w] = stalk, curve = Math.cos((x - cx) / w * Math.PI / 2), node = ((y + cx) % 32) < 3;
    t.col(i, grad(pal, 0.25 + curve * 0.55 + (fbm(x, y, 8, 2, 2, s) - 0.5) * 0.15)); t.h[i] = 0.3 + curve * 0.5; t.r[i] = 0.5;
    if (node) { t.col(i, mul(t.get(i), k === 'C' ? 0.55 : 0.75)); t.h[i] = 0.7; }
  });
}

// ---------------------------------------------------------------- torches (the model only reads the column x 56–71, y 48–127)
const FLAME = { torch: [1, 0.72, 0.25], soul: [0.35, 0.92, 1], redOn: [1, 0.16, 0.1], redOff: [0.32, 0.05, 0.05], copper: [0.45, 1, 0.55] };
function torch(k, s, flame, lit = true) {
  const t = new Tex(), stickWood = G('#3e2814', '#6a4524', '#8e6234', '#a87a44');
  return t.each((x, y, i) => {
    if (x < 56 || x > 71 || y < 48) { clear(t, i); return; }
    const lx = x - 56, round = Math.sin(Math.PI * (lx + 0.5) / 16);
    if (y < 64) { // the lit tip / cap
      const ty = (y - 48) / 16, hot = mix(flame, [1, 1, 0.92], (k === 'A' ? 0.55 : 0.35) * (1 - ty) * round);
      if (k === 'B') glowPx(t, i, mix(flame, [1, 0.95, 0.6], 1 - ty), lit ? 1 : 0);
      else glowPx(t, i, k === 'C' ? flame.map(v => clamp(v * 1.15)) : hot, lit ? 1 : 0);
      t.h[i] = 0.7 + round * 0.3;
      return;
    }
    if (k === 'A') metal(t, i, STEEL.A, 0.25 + round * 0.6, 0.5 + round * 0.4, 0.25);
    else if (k === 'B') { t.col(i, mul(grad(stickWood, 0.3 + fbm(x, y, 16, 2, 3, s) * 0.6), 0.6 + round * 0.55)); t.h[i] = 0.5 + round * 0.4; t.r[i] = 0.8; if (y < 76) { t.col(i, mul([0.42, 0.34, 0.24], 0.6 + round * 0.5 * ((x + y) % 4 < 2 ? 1 : 0.7))); } }
    else { t.col(i, mul([0.12, 0.12, 0.14], 0.6 + round * 0.8)); t.h[i] = 0.5 + round * 0.4; t.r[i] = 0.3; if (y >= 66 && y < 70) glowPx(t, i, flame.map(v => v * 0.8), lit ? 0.8 : 0); }
  });
}
const TORCHES = [['torch_on', FLAME.torch, true], ['soul_torch', FLAME.soul, true], ['redstone_torch_on', FLAME.redOn, true], ['redstone_torch_off', FLAME.redOff, false], ['copper_torch', FLAME.copper, true]];

// ---------------------------------------------------------------- redstone & rails
const TIE = { A: G('#1e1c1c', '#2e2a2a', '#3e3a38'), B: G('#3a2a1a', '#5a4228', '#7a5a38', '#8e6c48'), C: G('#08080a', '#141418', '#222228') };
const RAIL = { A: STEEL.A, B: G('#3a2014', '#5e3a22', '#7a5434', '#8a6a52'), C: G('#3a3e48', '#8a90a0', '#d8dce8', '#ffffff') };
const GOLD = G('#6a4808', '#b8861a', '#f0c850', '#fff0b0');
function railStraight(k, s, o = {}) {
  const t = new Tex(), rp = o.gold ? GOLD : RAIL[k];
  return t.each((x, y, i) => {
    const onRail = (x >= 16 && x <= 31) || (x >= 96 && x <= 111), onTie = (y % 32) >= 8 && (y % 32) < 24 && x >= 8 && x <= 119;
    if (!onRail && !onTie && !(o.line && x >= 58 && x <= 69)) { clear(t, i); return; }
    if (onTie) { t.col(i, grad(TIE[k], 0.3 + fbm(x, y, 2, 16, 3, s) * 0.6)); t.h[i] = 0.4; t.r[i] = 0.85; if (k === 'B' && Math.hypot(((x + 4) % 40) - 4, (y % 32) - 16) < 2.5) metal(t, i, RAIL.B, 0.8, 0.7, 0.6); }
    if (onRail) { const lx = (x >= 96 ? x - 96 : x - 16), top = Math.sin(Math.PI * (lx + 0.5) / 16); metal(t, i, rp, 0.2 + top * 0.75, 0.6 + top * 0.35, k === 'B' && !o.gold ? 0.65 : 0.2); }
    if (o.line && x >= 58 && x <= 69 && !onRail) { if (o.powered) glowPx(t, i, [1, 0.12, 0.08], 0.9); else { t.col(i, [0.35, 0.05, 0.05]); t.h[i] = 0.5; } }
    if (o.plate && x >= 40 && x <= 87 && y >= 44 && y <= 83) { const d = Math.min(x - 40, 87 - x, y - 44, 83 - y); metal(t, i, STEEL[k], d < 3 ? 0.8 : 0.45, 0.65, 0.35); if (d >= 6 && d < 10) { if (o.powered) glowPx(t, i, [1, 0.15, 0.1], 0.9); else t.col(i, [0.4, 0.06, 0.06]); } }
  });
}
function railTurned(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const r = Math.hypot(128 - x, 128 - y), a = Math.atan2(128 - y, 128 - x), onRail = (r >= 17 && r <= 32) || (r >= 97 && r <= 112);
    const tieA = (a / (Math.PI / 2)) * 4.0, onTie = (tieA % 1) > 0.25 && (tieA % 1) < 0.75 && r >= 9 && r <= 120;
    if (!onRail && !onTie) { clear(t, i); return; }
    if (onTie) { t.col(i, grad(TIE[k], 0.3 + fbm(x, y, 8, 8, 3, s) * 0.6)); t.h[i] = 0.4; t.r[i] = 0.85; }
    if (onRail) { const lr = r >= 97 ? r - 97 : r - 17, top = Math.sin(Math.PI * (lr + 0.5) / 16); metal(t, i, RAIL[k], 0.2 + top * 0.75, 0.6 + top * 0.35, k === 'B' ? 0.65 : 0.2); }
  });
}
PAL.mech = { A: G('#5e6166', '#71747a', '#84878d', '#979aa0'), B: G('#46494e', '#5d6066', '#74777d', '#8b8e94', '#a1a4aa'), C: G('#1a1d24', '#2c313c', '#424a5a', '#606c84') };
const mechBody = (k, s, layout) => masonry('mech', k, layout || (k === 'B' ? { type: 'cobble', k: 6 } : { type: 'slab' }), s);
const WOOD = G('#7b5830', '#987244', '#b28a56', '#c69f68');
function pistonSide(k, s) {
  const t = mechBody(k, s);
  return t.each((x, y, i) => {
    if (y < 32) { t.col(i, grad(WOOD, 0.3 + fbm(x, y, 2, 16, 3, s) * 0.6)); t.h[i] = 0.6; t.r[i] = 0.75; t.m[i] = 0; if (y === 31 || y === 0) t.col(i, mul(t.get(i), 0.5)); }
    else if (y < 38) metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.6, 0.85, 0.3);
  });
}
function pistonTop(k, s, sticky) {
  const t = new Tex();
  return t.each((x, y, i) => {
    t.col(i, grad(WOOD, 0.3 + fbm(x, y, 16, 2, 3, s) * 0.6)); t.h[i] = 0.55; t.r[i] = 0.75;
    if (y % 32 === 0) t.col(i, mul(t.get(i), 0.5));
    const d = edgeDist(x, y); if (d < 8) metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.45 + (d < 2 ? -0.2 : 0.2), 0.8, 0.3);
    if (sticky && d >= 10) { const n = fbm(x, y, 6, 6, 3, s + 2); if (n > 0.42) { t.col(i, mix([0.35, 0.65, 0.25], [0.6, 0.9, 0.45], n)); t.h[i] = 0.75; t.r[i] = 0.15; } }
  });
}
function pistonBottom(k, s) { const t = mechBody(k, s, { type: 'slab' }); return t.each((x, y, i) => { if (Math.hypot(x - 63.5, y - 63.5) < 20) metal(t, i, STEEL[k], 0.35, 0.4, 0.4); }); }
function pistonInner(k, s) { const t = mechBody(k, s, { type: 'slab' }); return t.each((x, y, i) => { const r = Math.hypot(x - 63.5, y - 63.5); if (r < 24) metal(t, i, STEEL[k], 0.6 - r / 60, 0.7, 0.3); }); }
function observerFace(k, s, part, lit = false) {
  const t = mechBody(k, s, { type: 'slab' });
  return t.each((x, y, i) => {
    if (part === 'front') {
      const eye = (x >= 26 && x <= 50 || x >= 78 && x <= 102) && y >= 36 && y <= 62, mouth = x >= 40 && x <= 88 && y >= 82 && y <= 92;
      if (eye || mouth) { t.col(i, [0.04, 0.04, 0.05]); t.h[i] = 0.05; t.m[i] = 0; if (eye && Math.abs(y - 49) < 4 && (Math.abs(x - 38) < 4 || Math.abs(x - 90) < 4)) t.col(i, k === 'C' ? [0.9, 0.2, 0.2] : [0.55, 0.12, 0.12]); }
    } else if (part === 'back') {
      if (Math.hypot(x - 63.5, y - 63.5) < 12) { if (lit) glowPx(t, i, [1, 0.15, 0.1], 0.9); else { t.col(i, [0.3, 0.06, 0.06]); t.h[i] = 0.3; } }
      if (x >= 24 && x <= 104 && (y === 30 || y === 98)) t.col(i, mul(t.get(i), 0.5));
    } else if (part === 'side') { if (Math.abs(y - 63.5) < 6 && x > 12 && x < 116) metal(t, i, STEEL[k], 0.55, 0.85, 0.3); }
    else if (part === 'top') { if (Math.abs(x - 63.5) < 4 && y > 12 && y < 116) { t.col(i, [0.5, 0.08, 0.08]); t.h[i] = 0.4; } }
  });
}
function dispenserFront(k, s, vertical, dropper) {
  const t = mechBody(k, s, k === 'B' ? { type: 'cobble', k: 6 } : { type: 'grid', bw: 64, bh: 64 });
  return t.each((x, y, i) => {
    const r = dropper ? null : Math.hypot(x - 63.5, y - (vertical ? 63.5 : 58)), box = dropper && Math.abs(x - 63.5) < 18 && Math.abs(y - 63.5) < (vertical ? 18 : 10);
    if (dropper ? box : r < 18) { t.col(i, [0.03, 0.03, 0.04]); t.h[i] = 0.02; t.m[i] = 0; }
    else if (!dropper && r < 23) metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.7, 0.85, 0.3);
    else if (dropper && Math.abs(x - 63.5) < 22 && Math.abs(y - 63.5) < (vertical ? 22 : 14)) metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.7, 0.85, 0.3);
  });
}

// ---------------------------------------------------------------- ice & snow
const ICE = {
  ice: { A: G('#7ab0e8', '#9cc8f4', '#c2defa', '#e8f4ff'), B: G('#5a8ec8', '#7aa8dc', '#a0c4ec', '#c8e0f8', '#eef6ff'), C: G('#1a7ad8', '#3aa0f8', '#7ac8ff', '#d0f0ff') },
  packed: { A: G('#8eb4e0', '#a8c6ea', '#c4d8f2', '#e2ecfa'), B: G('#6e94c4', '#8eacd6', '#aec6e4', '#ccdcf0', '#e8f0fa'), C: G('#3a78c8', '#5a98e0', '#90c0f4', '#d8ecff') },
  blue: { A: G('#4a7ad8', '#6292e4', '#80acee', '#a8c8f6'), B: G('#2e5aac', '#4672c4', '#628cd8', '#84a8e8', '#a8c4f4'), C: G('#0a3aa8', '#1a5ad8', '#3a84ff', '#8ac0ff') },
  powder: { A: G('#e4ecf2', '#eef3f7', '#f6f9fb', '#ffffff'), B: G('#d0dae2', '#e0e8ee', '#ecf1f5', '#f6f9fb', '#ffffff'), C: G('#c8dcf0', '#e0ecf8', '#f2f8ff', '#ffffff') },
};
function ice(k, s, kind, o = {}) {
  const t = new Tex(), pal = ICE[kind][k];
  return t.each((x, y, i) => {
    const n = fbm(x, y, 3, 3, 4, s), w = worley(x, y, kind === 'blue' ? 5 : 4, s + 1), edge = w.f2 - w.f1;
    let v = 0.45 + (n - 0.5) * 0.5, h = 0.6;
    if (k === 'A') { if (edge < 0.012 && fbm(x, y, 2, 2, 2, s + 4) > 0.5) { v += 0.35; h = 0.4; } v = 0.5 + (v - 0.5) * 0.6 + (1 - y / N) * 0.1; }
    if (k === 'B') { if (edge < 0.025) { v -= 0.3; h = 0.25; } const b = worley(x, y, 22, s + 2); if (b.f1 < 0.12 && h2(s, b.id, 1) < 0.4) { v += 0.35; h = 0.8; } }
    if (k === 'C') { v = 0.3 + h2(s, w.id, 3) * 0.5; if (edge < 0.02) { v = 1; h = 0.9; } }
    if (kind === 'powder') { v = 0.5 + (n - 0.5) * 0.4 + (h2(s, x, y) - 0.5) * 0.15; if (h2(s + 5, x, y) < 0.008) v = 1; h = 0.5 + (n - 0.5) * 0.3; }
    if (o.cracks) { const c = worley(x, y, 6, s + 9); if (c.f2 - c.f1 < 0.02 * o.cracks && fbm(x, y, 3, 3, 2, s + 10) < 0.35 + o.cracks * 0.15) { v -= 0.35; h = 0.2; } }
    t.col(i, grad(pal, v)); t.h[i] = clamp(h); t.r[i] = kind === 'powder' ? 0.9 : kind === 'packed' ? 0.25 : 0.05;
    t.a[i] = o.alpha || 1;
  });
}

const FAMILIES = {
  farm: k => [
    ['pumpkin_side', s => pumpkinSide(k, s)], ['pumpkin_face_off', s => pumpkinSide(k, s, 'off')], ['pumpkin_face_on', s => pumpkinSide(k, s, 'on')], ['pumpkin_top', s => pumpkinTop(k, s)],
    ['melon_side', s => melonSide(k, s)], ['melon_top', s => melonTop(k, s)], ['hay_block_side', s => haySide(k, s)], ['hay_block_top', s => hayTop(k, s)],
    ['cactus_side', s => cactusSide(k, s), true], ['cactus_top', s => cactusCap(k, s, false), true], ['cactus_bottom', s => cactusCap(k, s, true), true], ['reeds', s => sugarCane(k, s), true],
  ],
  lights: k => TORCHES.map(([name, fl, lit]) => [name, s => torch(k, s, fl, lit), true]),
  redstone: k => [
    ['rail_normal', s => railStraight(k, s), true], ['rail_normal_turned', s => railTurned(k, s), true],
    ['rail_golden', s => railStraight(k, s, { gold: true, line: true }), true], ['rail_golden_powered', s => railStraight(k, s, { gold: true, line: true, powered: true }), true],
    ['rail_detector', s => railStraight(k, s, { plate: true }), true], ['rail_detector_powered', s => railStraight(k, s, { plate: true, powered: true }), true],
    ['rail_activator', s => railStraight(k, s, { line: true }), true], ['rail_activator_powered', s => railStraight(k, s, { line: true, powered: true }), true],
    ['piston_side', s => pistonSide(k, s)], ['piston_top_normal', s => pistonTop(k, s, false)], ['piston_top_sticky', s => pistonTop(k, s, true)], ['piston_bottom', s => pistonBottom(k, s)], ['piston_inner', s => pistonInner(k, s)],
    ['observer_front', s => observerFace(k, s, 'front')], ['observer_back', s => observerFace(k, s, 'back')], ['observer_back_lit', s => observerFace(k, s, 'back', true)], ['observer_side', s => observerFace(k, s, 'side')], ['observer_top', s => observerFace(k, s, 'top')],
    ['dispenser_front_horizontal', s => dispenserFront(k, s, false, false)], ['dispenser_front_vertical', s => dispenserFront(k, s, true, false)],
    ['dropper_front_horizontal', s => dispenserFront(k, s, false, true)], ['dropper_front_vertical', s => dispenserFront(k, s, true, true)],
  ],
  ice: k => [
    ['ice', s => ice(k, s, 'ice', { alpha: 0.72 }), true], ['ice_packed', s => ice(k, s, 'packed')], ['blue_ice', s => ice(k, s, 'blue')], ['powder_snow', s => ice(k, s, 'powder')],
    ...[0, 1, 2, 3].map(n => [`frosted_ice_${n}`, s => ice(k, s, 'ice', { alpha: 0.72, cracks: n + 1 }), true]),
  ],
};
const SAMPLE_NAMES = {
  farm: ['pumpkin_side', 'pumpkin_face_on', 'melon_side', 'hay_block_side', 'cactus_side'],
  lights: ['torch_on', 'soul_torch', 'redstone_torch_on', 'redstone_torch_off', 'copper_torch'],
  redstone: ['rail_normal', 'rail_golden_powered', 'piston_side', 'observer_front', 'dispenser_front_horizontal'],
  ice: ['ice', 'ice_packed', 'blue_ice', 'powder_snow', 'frosted_ice_2'],
};
// torches are a 16px column: preview them zoomed so the design is readable
function zoomColumn(rgba) {
  const out = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const sx = Math.floor(44 + x * 40 / N), sy = Math.floor(44 + y * 84 / N), s = (sy * N + sx) * 4, o = (y * N + x) * 4;
    for (let c = 0; c < 4; c++) out[o + c] = rgba[s + c];
  }
  return out;
}

const samplesDir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
if (samplesDir && require.main === module) {
  fs.mkdirSync(samplesDir, { recursive: true });
  for (const [fam, names] of Object.entries(SAMPLE_NAMES)) {
    sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => {
      const list = FAMILIES[fam](key);
      return { key, tiles: names.map((n, k) => { const [, fn] = list.find(e => e[0] === n); const rgba = texToRGBA(fn(6000 + k * 29).bake(STYLE[key].light)); return fam === 'lights' ? zoomColumn(rgba) : rgba; }) };
    }));
  }
  console.log('Wrote batch 4 comparison sheets to', samplesDir);
}

const vanillaArg = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (vanillaArg && require.main === module) {
  const choices = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8')), VB = path.join(vanillaArg, 'textures', 'blocks');
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = {};
  const exts = name => ['png', 'tga'].filter(e => fs.existsSync(path.join(VB, `${name}.${e}`)));
  let count = 0;
  for (const [fam, build] of Object.entries(FAMILIES)) {
    const key = choices[fam]; if (!key) continue;
    build(key).forEach(([name, fn, cutout], k) => {
      const e = exts(name); if (!e.length) { console.warn('skip (not in vanilla):', name); return; }
      const t = fn(12000 + count * 31).bake(STYLE[key].light);
      if (e.includes('tga')) g.save(t, name, { tga: true });
      if (e.includes('png')) g.save(t, name, { alpha: !!cutout, pbr: !e.includes('tga') });
      listed.add('blocks/' + name); count++;
      (previews[fam] = previews[fam] || []).push(fam === 'lights' ? zoomColumn(texToRGBA(t)) : texToRGBA(t));
    });
  }
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); for (const [fam, tiles] of Object.entries(previews)) b2.grid(path.join(previewDir, `batch4_${fam}.png`), tiles, 10); }
  console.log(`Batch 4: ${count} textures.`);
}
module.exports = { FAMILIES, SAMPLE_NAMES };
