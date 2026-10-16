'use strict';
// USTP batch 7: base decor blocks, badlands, deep caves (sculk & amethyst), music discs
//   A Clean Modern · B Natural Realistic · C Bold
//   node batch7.js <bedrock-samples/resource_pack> --samples=<dir>   → labelled A/B/C comparison sheets
//   node batch7.js <bedrock-samples/resource_pack> [--preview=<dir>] → build the styles in choices.json
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const it = require('./items.js');
const b2 = require('./batch2.js');
const b3 = require('./batch3.js');
const { readImage, pngBuf, grayToRGB, writeFile } = require('./imageio');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mk } = it;
const { STYLE, PAL, masonry, sheet, texToRGBA } = b2;
const { STEEL, BRASS } = b3;
const N = 128, ifbm = it.fbm, ITEM_STYLE = { A: 'modern', B: 'realistic', C: 'bold' };
const VARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null, VT = VARG ? path.join(VARG, 'textures') : null;
const clear = (t, i) => { t.a[i] = 0; t.col(i, [0, 0, 0]); t.h[i] = 0; };
const metal = (t, i, pal, v, h = 0.8, rough = 0.3) => { t.col(i, grad(pal, v)); t.m[i] = 1; t.r[i] = rough; t.h[i] = h; };
const glowPx = (t, i, c, e = 1) => { t.col(i, c); t.e[i] = e; t.m[i] = 0; t.r[i] = 0.3; };
const WOODS = { A: G('#7b5830', '#987244', '#b28a56', '#c69f68'), B: G('#5e4022', '#7e5a34', '#9a7246', '#b08858', '#c49c6a'), C: G('#6a3a14', '#9a5a22', '#c87e34', '#f0a650') };
const DARK = { A: G('#2a1e14', '#3a2a1c', '#4a3626', '#5a4430'), B: G('#1e140c', '#2e2016', '#3e2c1e', '#4e3a28'), C: G('#140a04', '#28160a', '#422612', '#603a1e') };
const wood = (t, i, x, y, s, k, pal = WOODS[k], vertical = false) => { t.col(i, grad(pal, 0.3 + fbm(x, y, vertical ? 16 : 2, vertical ? 2 : 16, 3, s) * 0.55 + (k === 'B' ? (h2(s, x >> 1, y >> 3) - 0.5) * 0.12 : 0))); t.h[i] = 0.55; t.r[i] = 0.75; t.m[i] = 0; };

// ---------------------------------------------------------------- base decor
function ladder(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const rail = (x >= 16 && x <= 31) || (x >= 96 && x <= 111), rung = (y % 32) >= 8 && (y % 32) < 22 && x > 16 && x < 111;
    if (!rail && !rung) { clear(t, i); return; }
    wood(t, i, x, y, s + (rail ? 0 : 7), k, WOODS[k], rail);
    const lx = rail ? ((x >= 96 ? x - 96 : x - 16) + 0.5) / 16 : ((y % 32) - 8 + 0.5) / 14;
    t.col(i, mul(t.get(i), 0.7 + Math.sin(Math.PI * lx) * 0.4)); t.h[i] = 0.4 + Math.sin(Math.PI * lx) * 0.4;
    if (k !== 'B' && rung && rail) metal(t, i, k === 'C' ? BRASS : STEEL.A, 0.7, 0.9, 0.25);
  });
}
function ironBars(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const bars = [12, 44, 76, 108].find(c => Math.abs(x - c) <= 5), cross = Math.abs(y - 20) <= 4 || Math.abs(y - 108) <= 4;
    if (bars === undefined && !cross) { clear(t, i); return; }
    const lx = bars !== undefined ? (x - bars + 5.5) / 11 : (Math.abs(y - 20) <= 4 ? y - 16 : y - 104 + 0.5) / 9;
    metal(t, i, STEEL[k], 0.2 + Math.sin(Math.PI * clamp(lx)) * 0.65, 0.4 + Math.sin(Math.PI * clamp(lx)) * 0.5, k === 'B' ? 0.6 : 0.25);
    if (k === 'B' && fbm(x, y, 8, 8, 3, s) > 0.62) { t.col(i, mix(t.get(i), [0.42, 0.24, 0.12], 0.6)); t.r[i] = 0.9; t.m[i] = 0.3; }
  });
}
const BAMBOO = { A: G('#8a8a2a', '#aaa83a', '#c8c450', '#e0dc70'), B: G('#6a6a1e', '#8a882c', '#a8a43e', '#c4be56'), C: G('#7a7a00', '#b0aa10', '#e0d820', '#fff460') };
function scaffold(k, s, face) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const d = edgeDist(x, y), frame = d < 12, diag = face === 'side' && Math.abs(x - y) < 7 && d >= 12, slat = face === 'top' && d >= 12 && (y % 24) < 10;
    if (!frame && !diag && !slat) { clear(t, i); return; }
    const along = frame ? (Math.min(x, 127 - x) < Math.min(y, 127 - y) ? y : x) : x + y, across = frame ? (d + 0.5) / 12 : 0.5;
    t.col(i, grad(BAMBOO[k], 0.3 + Math.sin(Math.PI * across) * 0.5 + (fbm(along, 0, 16, 1, 2, s) - 0.5) * 0.2)); t.h[i] = 0.4 + Math.sin(Math.PI * across) * 0.4; t.r[i] = 0.6;
    if (frame && (along % 32) < 3) t.col(i, mul(t.get(i), 0.65));
    if (frame && d < 1) t.col(i, mul(t.get(i), 0.6));
  });
}
function jukebox(k, s, face) {
  const t = new Tex();
  return t.each((x, y, i) => {
    wood(t, i, x, y, s, k, face === 'top' ? WOODS[k] : DARK[k]);
    const d = edgeDist(x, y);
    if (d < 6) { wood(t, i, x, y, s + 3, k); t.col(i, mul(t.get(i), 0.85)); t.h[i] = 0.8; }
    if (face === 'top') { if (Math.abs(y - 63.5) < 4 && Math.abs(x - 63.5) < 40) { t.col(i, [0.04, 0.03, 0.03]); t.h[i] = 0.05; } else if (Math.abs(y - 63.5) < 8 && Math.abs(x - 63.5) < 44) metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.5, 0.7, 0.3); }
    else if (Math.hypot(x - 63.5, y - 63.5) < 30 && Math.hypot(x - 63.5, y - 63.5) % 6 < 2) { t.col(i, mul(t.get(i), 0.5)); t.h[i] = 0.3; }
  });
}
function noteblock(k, s) {
  const t = new Tex();
  return t.each((x, y, i) => {
    wood(t, i, x, y, s, k, DARK[k]);
    if (edgeDist(x, y) < 6) { wood(t, i, x, y, s + 3, k); t.h[i] = 0.8; }
    const r = Math.hypot(x - 63.5, y - 63.5);
    if (r < 38) { const hole = Math.hypot(((x - 63.5 + 64) % 10) - 5, ((y - 63.5 + 64) % 10) - 5) < 2.6; if (hole) { t.col(i, [0.03, 0.02, 0.02]); t.h[i] = 0.05; } else metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.5, 0.6, 0.35); }
    if (r >= 38 && r < 42) metal(t, i, k === 'C' ? BRASS : STEEL[k], 0.75, 0.85, 0.25);
  });
}
const BOOKS = ['#7b2b23', '#2d4f7c', '#3f6b3a', '#8a6a2a', '#5a2f6b', '#2f6b6b', '#a0482a', '#d6c7a1'];
function chiseledShelf(k, s, face) {
  const t = new Tex();
  return t.each((x, y, i) => {
    wood(t, i, x, y, s, k);
    if (face === 'side' || face === 'top') { if ((face === 'top' ? y : x) % 32 === 0) t.col(i, mul(t.get(i), 0.5)); return; }
    const col = Math.floor(x / 42.67), row = y < 64 ? 0 : 1, lx = x - col * 42.67, ly = y - row * 64, inSlot = lx > 6 && lx < 37 && ly > 8 && ly < 58;
    if (!inSlot) { if (edgeDist(x, y) < 4) t.col(i, mul(t.get(i), 0.8)); return; }
    t.col(i, [0.08, 0.05, 0.03]); t.h[i] = 0.05;
    if (face === 'occupied') { const b = Math.floor((lx - 6) / 10), c = g.hex(BOOKS[(b + col * 3 + row * 5) % BOOKS.length]), bl = (lx - 6) % 10;
      if (bl < 9) { t.col(i, mul(c, 0.75 + 0.3 * Math.sin(Math.PI * (bl + 0.5) / 9) + (ly < 16 || ly > 50 ? 0.25 : 0))); t.h[i] = 0.6; t.r[i] = 0.7; } }
  });
}
const IRONC = { A: G('#2a2c30', '#3e4146', '#55585e', '#6c7076'), B: G('#1c1c1e', '#2c2c30', '#3e3e44', '#505058'), C: G('#0e0f14', '#1e212c', '#303648', '#4a5470') };
function cauldron(k, s, face) {
  const t = new Tex();
  return t.each((x, y, i) => {
    metal(t, i, IRONC[k], 0.35 + fbm(x, y, 4, 4, 3, s) * (k === 'B' ? 0.5 : 0.25), 0.6, k === 'B' ? 0.7 : 0.35);
    const d = edgeDist(x, y);
    if (face === 'top') { if (d >= 14) clear(t, i); else if (d >= 10) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.3; } return; }
    if (face === 'side') { if (y > 96 && (x < 24 || x > 103)) { t.h[i] = 0.75; } else if (y > 96) { clear(t, i); return; } if (Math.abs(y - 16) < 4) metal(t, i, k === 'C' ? BRASS : IRONC[k], 0.75, 0.85, 0.3); }
    if (k === 'B' && fbm(x, y, 8, 8, 3, s + 5) > 0.66) { t.col(i, mix(t.get(i), [0.4, 0.22, 0.1], 0.55)); t.m[i] = 0.3; }
  });
}
const OBS = G('#0b0712', '#1a1027', '#2d1c46', '#4a3274');
function enchanting(k, s, face) {
  const t = new Tex(), cloth = { A: G('#5a0e14', '#8a1a20', '#b02a2e', '#d04040'), B: G('#3e080c', '#6a1218', '#8e1e24', '#ae3036'), C: G('#4a0010', '#9a0020', '#e00a30', '#ff5070') }[k];
  return t.each((x, y, i) => {
    const w = worley(x, y, 5, s), edge = 1 - sstep(0, 0.08, w.f2 - w.f1);
    t.col(i, grad(OBS, 0.12 + h2(s, w.id, 1) * 0.3 + edge * 0.35)); t.h[i] = 0.5 + h2(s, w.id, 1) * 0.3; t.r[i] = 0.1;
    if (face === 'top') {
      const d = edgeDist(x, y);
      if (d >= 6) { t.col(i, grad(cloth, 0.35 + fbm(x, y, 16, 16, 3, s) * 0.4)); t.h[i] = 0.6; t.r[i] = 0.9; t.m[i] = 0; }
      if (d >= 6 && d < 10) metal(t, i, BRASS, 0.75, 0.75, 0.2);
      if (Math.hypot(x - 63.5, y - 63.5) < 14) { t.col(i, [0.6, 0.25, 0.85]); t.e[i] = 0.6; }   // glowing sigil
    }
    if (face === 'side' && y < 32) { t.col(i, grad(cloth, 0.35 + fbm(x, y, 16, 4, 3, s) * 0.4)); t.h[i] = 0.6; t.r[i] = 0.9; t.m[i] = 0; if (y > 26) metal(t, i, BRASS, 0.7, 0.8, 0.2); }
  });
}

// ---------------------------------------------------------------- badlands
const RSAND = { A: G('#a8521e', '#bc6226', '#cc7232', '#dc8644'), B: G('#8a3e14', '#a8501c', '#c06228', '#d27636', '#e08a48'), C: G('#9a2e00', '#c84a08', '#f06a18', '#ff9a48') };
function redSand(k, s) { const t = new Tex(); return t.each((x, y, i) => { const n = fbm(x, y, 4, 4, 4, s), rip = Math.sin(Math.PI * 2 * (y / N * 7 + x / N + fbm(x, y, 3, 3, 3, s + 2) * 1.2)), gr = h2(s, x, y) - 0.5; t.col(i, grad(RSAND[k], 0.5 + (n - 0.5) * (k === 'A' ? 0.3 : 0.6) + rip * 0.05 + gr * (k === 'A' ? 0.08 : 0.2))); t.h[i] = 0.5 + rip * 0.12; t.r[i] = 0.95; }); }
function redSandstone(k, s, part) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const st = Math.sin(Math.PI * 2 * (y / N * 6 + (fbm(x, y, 3, 2, 3, s) - 0.5) * (k === 'A' ? 0.2 : 0.6))), n = fbm(x, y, 8, 8, 4, s + 1);
    let v = 0.5 + st * (k === 'C' ? 0.2 : 0.12) + (n - 0.5) * (k === 'B' ? 0.4 : 0.15), h = 0.55 + st * 0.06;
    if (part === 'normal' && y < 16) { v = 0.62; h = 0.75; } if (part === 'normal' && (y === 16 || y === 17)) { v = 0.15; h = 0.2; }
    if (part === 'top' || part === 'smooth') { v = 0.55 + (n - 0.5) * 0.2; h = 0.6; const d = edgeDist(x, y); if (d < 2) { v = 0.25; h = 0.2; } if (part === 'smooth' && (y === 63 || y === 64)) { v = 0.25; h = 0.2; } }
    if (part === 'bottom') { v = 0.45 + (n - 0.5) * 0.4; const w = worley(x, y, 5, s + 4); if (k !== 'A' && w.f2 - w.f1 < 0.04) { v -= 0.25; h = 0.2; } }
    if (part === 'carved') { const d = edgeDist(x, y), m = Math.abs(x - 63.5) + Math.abs(y - 63.5); if (d < 3 || (m > 26 && m < 31)) { v = 0.2; h = 0.2; } else if (m <= 26) h = 0.8; }
    t.col(i, grad(RSAND[k], v)); t.h[i] = h; t.r[i] = 0.9;
  });
}

// ---------------------------------------------------------------- deep caves
const SCULK = { A: G('#041418', '#0a2228', '#123238', '#1c444a'), B: G('#020a0e', '#061820', '#0c262e', '#16363e'), C: G('#00080e', '#001a24', '#00303c', '#004a5a') };
const SOULC = [0.2, 0.95, 1];
PAL.sculkBase = SCULK;   // catalyst underside: plain dark sculk stone
function sculkFrame(k, s, frame, vein = false) {
  const t = new Tex(), pulse = 0.55 + 0.45 * Math.sin(frame / 4 * Math.PI * 2);
  return t.each((x, y, i) => {
    const n = fbm(x, y, 6, 6, 4, s), w = worley(x, y, 8, s + 1), vline = w.f2 - w.f1 < (vein ? 0.07 : 0.035);
    if (vein && !vline) { clear(t, i); return; }
    t.col(i, grad(SCULK[k], 0.25 + n * 0.6)); t.h[i] = 0.4 + n * 0.3; t.r[i] = 0.5;
    const dot = worley(x, y, 18, s + 2);
    if (dot.f1 < 0.12 && h2(s, dot.id, 1) < 0.35) glowPx(t, i, SOULC.map(v => v * (0.5 + 0.5 * pulse)), 0.4 + 0.6 * pulse);
    if (vline && !vein && k !== 'A') glowPx(t, i, SOULC.map(v => v * 0.45 * pulse + 0.05), 0.35 * pulse);
    if (vein && vline) { t.col(i, grad(SCULK[k], 0.6)); if (h2(s, x >> 2, y >> 2) < 0.15) glowPx(t, i, SOULC, pulse); }
  });
}
function catalyst(k, s, face, bloom) {
  const t = face === 'bottom' ? masonry('sculkBase', k, { type: 'slab' }, s) : sculkFrame(k, s, 0);
  const bone = G('#8a8676', '#b8b4a2', '#dcd8c6', '#f4f0e0');
  return t.each((x, y, i) => {
    if (face === 'top') { const r = Math.hypot(x - 63.5, y - 63.5); if (r > 18 && r < 34) { t.col(i, grad(bone, 0.4 + fbm(x, y, 8, 8, 3, s) * 0.5)); t.h[i] = 0.8; t.e[i] = 0; t.r[i] = 0.7; } if (r <= 18) { if (bloom) glowPx(t, i, SOULC, 0.9); else { t.col(i, [0.02, 0.08, 0.1]); t.h[i] = 0.1; } } }
    if (face === 'side') { if (y > 80) { t.col(i, grad(bone, 0.4 + fbm(x, y, 8, 8, 3, s) * 0.5)); t.h[i] = 0.7; t.e[i] = 0; } if (y > 70 && y <= 80 && ((x + 4) % 16) < 6) { t.col(i, grad(bone, 0.85)); t.h[i] = 0.85; t.e[i] = 0; } if (bloom && y < 70 && h2(s + 9, x >> 3, y >> 3) < 0.1) glowPx(t, i, SOULC, 0.9); }
  });
}
const AME = { A: G('#5a3a9a', '#7a52c0', '#9a70dc', '#c0a0f4'), B: G('#3e2470', '#5c3a96', '#7c56b8', '#a07ad6', '#c0a0ec'), C: G('#3a0a8a', '#6a1ad0', '#a040ff', '#e0a0ff') };
function amethystBlock(k, s, budding) {
  const t = new Tex();
  return t.each((x, y, i) => {
    const w = worley(x, y, k === 'C' ? 5 : 7, s), tilt = h2(s, w.id, 1), edge = w.f2 - w.f1 < 0.035;
    t.col(i, grad(AME[k], 0.25 + tilt * 0.6 + (edge ? 0.25 : 0))); t.h[i] = 0.4 + tilt * 0.4; t.r[i] = 0.15; t.e[i] = k === 'C' ? 0.08 : 0;
    if (budding) { const b = worley(x, y, 6, s + 3); if (b.f1 < 0.16 && h2(s, b.id, 2) < 0.5) { t.col(i, mul(t.get(i), 0.4 + b.f1 * 2)); t.h[i] = 0.15; } }
  });
}
const CRYSTAL = mk({ kind: 'gem', base: '#9a70dc', dark: '#2e0e5a', light: '#f4e8ff', metal: 0, rough: 0.05, emis: 0.12 });
const crystals = list => list.map(([x, len, w, a], k) => { const c = Math.cos(a), sn = Math.sin(a), bx = x, by = 126, tx = bx + sn * len, ty = by - c * len;
  return { d: P => sdPoly(P.x, P.y, [[bx - c * w, by - sn * w], [tx - c * w * 0.6, ty - sn * w * 0.6], [bx + sn * (len + w), by - c * (len + w)], [tx + c * w * 0.6, ty + sn * w * 0.6], [bx + c * w, by + sn * w]]), mat: CRYSTAL, profile: 'ridge', bw: w * 0.8, z: 1 + k }; });
const CAVE_SPRITES = {
  amethyst_cluster: () => crystals([[64, 92, 13, 0], [36, 64, 10, -0.5], [92, 70, 10, 0.45], [50, 44, 8, -0.2], [80, 46, 8, 0.25]]),
  large_amethyst_bud: () => crystals([[64, 72, 12, 0], [42, 46, 9, -0.45], [86, 50, 9, 0.4]]),
  medium_amethyst_bud: () => crystals([[64, 52, 11, 0], [46, 34, 8, -0.4], [82, 36, 8, 0.4]]),
  small_amethyst_bud: () => crystals([[64, 34, 10, 0], [50, 22, 7, -0.4], [78, 24, 7, 0.4]]),
};

// ---------------------------------------------------------------- music discs (items)
function vividColour(rel) {
  if (!VT) return null;
  const f = path.join(VT, rel + '.png'); if (!fs.existsSync(f)) return null;
  const im = readImage(f); let r = 0, gg = 0, b = 0, k = 0;
  for (let i = 0; i < im.w * im.h; i++) { if (im.data[i * 4 + 3] < 128) continue; const R = im.data[i * 4] / 255, Gc = im.data[i * 4 + 1] / 255, B = im.data[i * 4 + 2] / 255, w = (Math.max(R, Gc, B) - Math.min(R, Gc, B)) ** 3; r += R * w; gg += Gc * w; b += B * w; k += w; }
  if (k < 1e-3) return null;
  const c = [r / k, gg / k, b / k], mx = Math.max(...c) || 1; return c.map(v => clamp(v * 0.9 / mx));
}
const VINYL = mk({ kind: 'organic', base: [0.08, 0.08, 0.1], dark: [0.01, 0.01, 0.015], light: [0.75, 0.78, 0.85], metal: 0, rough: 0.2, gloss: 60, spec: 0.9, mottle: 0.05 });
function disc(label) {
  const lab = mk({ kind: 'organic', base: label, dark: label.map(v => v * 0.35), light: label.map(v => clamp(v * 0.4 + 0.65)), metal: 0, rough: 0.5, gloss: 30, spec: 0.4 });
  return [
    { d: P => sdCircle(P.x, P.y, 64, 64, 54), mat: VINYL, profile: 'bevel', bw: 3, z: 1, deco: P => { const r = Math.hypot(P.x - 64, P.y - 64); return r > 20 && r % 5 < 1 ? { dh: -0.4, dark: 0.25 } : null; } },
    { d: P => Math.max(sdCircle(P.x, P.y, 64, 64, 18), -sdCircle(P.x, P.y, 64, 64, 3.5)), mat: lab, profile: 'bevel', bw: 2, z: 3 },
  ];
}
const DISC_FRAGMENT = () => [{ d: P => Math.max(sdCircle(P.x, P.y, 64, 64, 54), -sdPoly(P.x, P.y, [[64, 64], [128, 10], [128, 128], [0, 128], [0, 70]])), mat: VINYL, profile: 'bevel', bw: 3, z: 1, deco: P => (Math.hypot(P.x - 64, P.y - 64) % 5 < 1 ? { dh: -0.4, dark: 0.25 } : null) }];

// ---------------------------------------------------------------- families
const BLOCKS = {
  decor: k => [
    ['ladder', s => ladder(k, s), true], ['iron_bars', s => ironBars(k, s), true],
    ['scaffolding_side', s => scaffold(k, s, 'side'), true], ['scaffolding_top', s => scaffold(k, s, 'top'), true], ['scaffolding_bottom', s => scaffold(k, s, 'bottom'), true],
    ['jukebox_side', s => jukebox(k, s, 'side')], ['jukebox_top', s => jukebox(k, s, 'top')], ['noteblock', s => noteblock(k, s)],
    ['chiseled_bookshelf_empty', s => chiseledShelf(k, s, 'empty')], ['chiseled_bookshelf_occupied', s => chiseledShelf(k, s, 'occupied')], ['chiseled_bookshelf_side', s => chiseledShelf(k, s, 'side')], ['chiseled_bookshelf_top', s => chiseledShelf(k, s, 'top')],
    ['cauldron_side', s => cauldron(k, s, 'side'), true], ['cauldron_top', s => cauldron(k, s, 'top'), true], ['cauldron_bottom', s => cauldron(k, s, 'bottom')], ['cauldron_inner', s => cauldron(k, s, 'inner')],
    ['enchanting_table_top', s => enchanting(k, s, 'top')], ['enchanting_table_side', s => enchanting(k, s, 'side')], ['enchanting_table_bottom', s => enchanting(k, s, 'bottom')],
  ],
  badlands: k => [['red_sand', s => redSand(k, s)], ...['normal', 'top', 'bottom', 'carved', 'smooth'].map(p => [`red_sandstone_${p}`, s => redSandstone(k, s, p)])],
  caves: k => [
    ['sculk', s => sculkFrame(k, s, 0), false, f => sculkFrame(k, s0(), f)], ['sculk_vein', s => sculkFrame(k, s, 0, true), true, f => sculkFrame(k, s0() + 5, f, true)],
    ['sculk_catalyst_top', s => catalyst(k, s, 'top', false)], ['sculk_catalyst_top_bloom', s => catalyst(k, s, 'top', true)], ['sculk_catalyst_side', s => catalyst(k, s, 'side', false)], ['sculk_catalyst_side_bloom', s => catalyst(k, s, 'side', true)], ['sculk_catalyst_bottom', s => catalyst(k, s, 'bottom')],
    ['amethyst_block', s => amethystBlock(k, s, false)], ['budding_amethyst', s => amethystBlock(k, s, true)],
  ],
};
const s0 = () => 15000;
const SAMPLES = {
  decor: ['ladder', 'jukebox_side', 'noteblock', 'chiseled_bookshelf_occupied', 'enchanting_table_top'],
  badlands: ['red_sand', 'red_sandstone_normal', 'red_sandstone_top', 'red_sandstone_carved', 'red_sandstone_bottom'],
  caves: ['sculk', 'sculk_catalyst_top_bloom', 'sculk_catalyst_side', 'amethyst_block', 'amethyst_cluster'],
  discs: ['record_cat', 'record_13', 'record_pigstep', 'record_otherside', 'music_disc_relic'],
};
function discDesigns() {
  const names = VT ? fs.readdirSync(path.join(VT, 'items')).filter(f => /^(record_|music_disc_).*\.png$/.test(f)).map(f => f.slice(0, -4)) : SAMPLES.discs;
  const out = {};
  for (const n of names) out[n] = () => disc(vividColour('items/' + n) || [0.8, 0.8, 0.8]);
  out.disc_fragment_5 = DISC_FRAGMENT;
  return out;
}
function renderSample(fam, name, key, k) {
  if (fam === 'discs') return it.render(name, discDesigns()[name](), 1300 + k * 7, { style: ITEM_STYLE[key], write: false });
  if (CAVE_SPRITES[name]) return it.render(name, CAVE_SPRITES[name](), 1400 + k * 7, { style: ITEM_STYLE[key], write: false, rimW: 1 });
  return texToRGBA(BLOCKS[fam](key).find(e => e[0] === name)[1](9000 + k * 23).bake(STYLE[key].light));
}

const samplesDir = (process.argv.find(a => a.startsWith('--samples=')) || '').split('=')[1];
if (samplesDir && require.main === module) {
  fs.mkdirSync(samplesDir, { recursive: true });
  for (const [fam, names] of Object.entries(SAMPLES)) sheet(path.join(samplesDir, `choices_${fam}.png`), ['A', 'B', 'C'].map(key => ({ key, tiles: names.map((n, k) => renderSample(fam, n, key, k)) })));
  console.log('Wrote batch 7 comparison sheets to', samplesDir);
}

// animated strips (sculk): stack frames and write colour + MER + heightmap like gen.save does
function saveStrip(frames, name, cutout) {
  const H = frames.length * N, rgba = new Uint8Array(N * H * 4), mer = new Uint8Array(N * H * 3), hm = new Uint8Array(N * H), b8 = v => Math.round(clamp(v) * 255);
  frames.forEach((t, f) => { for (let i = 0; i < N * N; i++) { const o = f * N * N + i; for (let c = 0; c < 3; c++) rgba[o * 4 + c] = b8(t.c[i * 3 + c]); rgba[o * 4 + 3] = b8(t.a[i]); mer[o * 3] = b8(t.m[i]); mer[o * 3 + 1] = b8(t.e[i]); mer[o * 3 + 2] = b8(t.r[i]); hm[o] = b8(t.h[i]); } });
  const base = path.join(__dirname, 'USTP', 'textures', 'blocks', name);
  if (cutout) writeFile(base + '.png', pngBuf(N, H, 4, rgba));
  else { const rgb = new Uint8Array(N * H * 3); for (let i = 0; i < N * H; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = rgba[i * 4 + c]; writeFile(base + '.png', pngBuf(N, H, 3, rgb)); }
  writeFile(base + '_mer.png', pngBuf(N, H, 3, mer)); writeFile(base + '_heightmap.png', grayToRGB(N, H, hm));
  writeFile(base + '.texture_set.json', JSON.stringify({ format_version: '1.16.100', 'minecraft:texture_set': { color: name, metalness_emissive_roughness: name + '_mer', heightmap: name + '_heightmap' } }, null, 2));
}

if (VARG && !samplesDir && require.main === module) {
  const choices = JSON.parse(fs.readFileSync(path.join(__dirname, 'choices.json'), 'utf8'));
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = {};
  const exts = rel => ['png', 'tga'].filter(e => fs.existsSync(path.join(VT, `${rel}.${e}`)));
  let nb = 0, ni = 0;
  for (const fam of ['decor', 'badlands', 'caves']) {
    const key = choices[fam]; if (!key) continue;
    for (const [name, fn, cutout, frameFn] of BLOCKS[fam](key)) {
      const e = exts('blocks/' + name); if (!e.length) { console.warn('skip (not in vanilla):', name); continue; }
      if (frameFn) { const frames = [0, 1, 2, 3].map(f => frameFn(f).bake(STYLE[key].light)); saveStrip(frames, name, cutout); listed.add('blocks/' + name); nb++; (previews[fam] = previews[fam] || []).push(texToRGBA(frames[0])); continue; }
      const t = fn(15000 + nb * 31).bake(STYLE[key].light);
      if (e.includes('tga')) g.save(t, name, { tga: true });
      if (e.includes('png')) g.save(t, name, { alpha: !!cutout, pbr: !e.includes('tga') });
      listed.add('blocks/' + name); nb++; (previews[fam] = previews[fam] || []).push(texToRGBA(t));
    }
    if (fam === 'caves') for (const [name, fn] of Object.entries(CAVE_SPRITES)) {
      const e = exts('blocks/' + name); if (!e.length) continue;
      const { rgba, mers } = it.render(name, fn(), 1500 + nb * 11, { style: ITEM_STYLE[key], write: false, rimW: 1, withMers: true });
      const t = new Tex(); for (let i = 0; i < N * N; i++) { t.col(i, [0, 1, 2].map(c => rgba[i * 4 + c] / 255)); t.a[i] = rgba[i * 4 + 3] / 255; t.m[i] = mers[i * 4] / 255; t.e[i] = mers[i * 4 + 1] / 255; t.r[i] = mers[i * 4 + 2] / 255 || 0.2; t.h[i] = t.a[i] ? 0.6 : 0; }
      g.save(t, name, { alpha: true }); listed.add('blocks/' + name); nb++; previews.caves.push(texToRGBA(t));
    }
  }
  if (choices.discs) for (const [name, fn] of Object.entries(discDesigns())) {
    if (!exts('items/' + name).includes('png')) { console.warn('skip (not a vanilla png item):', name); continue; }
    (previews.discs = previews.discs || []).push(it.render(name, fn(), 1600 + ni * 13, { style: ITEM_STYLE[choices.discs] }));
    listed.add('items/' + name); ni++;
  }
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); for (const [fam, tiles] of Object.entries(previews)) b2.grid(path.join(previewDir, `batch7_${fam}.png`), tiles, 10); }
  console.log(`Batch 7: ${nb} blocks, ${ni} items.`);
}
module.exports = { BLOCKS, CAVE_SPRITES, SAMPLES };
