'use strict';
// USTP batch 9: every remaining block family that has a plain cube face or a simple cut-out sprite,
// in the Clean Modern style. Colours come from vanilla so variants keep their identity. Textures that wrap
// complex 3D models (candles, chains, anvils, lecterns…) or are engine-drawn (water, lava, portals) stay remastered.
//   node batch9.js <bedrock-samples/resource_pack> [--preview=<dir>]
const fs = require('fs'), path = require('path');
const g = require('./gen.js');
const it = require('./items.js');
const b2 = require('./batch2.js');
const b3 = require('./batch3.js');
const { readImage } = require('./imageio');
const { Tex, G, grad, mul, mix, clamp, sstep, fbm, h2, worley, edgeDist } = g;
const { sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mk } = it;
const { STYLE, PAL, masonry, texToRGBA } = b2;
const N = 128, K = 'A', ST = STYLE.A, ifbm = it.fbm;
const VARG = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
if (!VARG && require.main === module) { console.error('Usage: node batch9.js <bedrock-samples/resource_pack> [--preview=<dir>]'); process.exit(1); }
const VB = VARG && path.join(VARG, 'textures', 'blocks');

// ---------------------------------------------------------------- vanilla colour helpers
const vfile = n => ['png', 'tga'].map(e => path.join(VB, `${n}.${e}`)).find(fs.existsSync);
function px(n) { const f = vfile(n); if (!f) return []; const im = readImage(f), out = []; for (let i = 0; i < im.w * Math.min(im.w, im.h); i++) if (im.data[i * 4 + 3] > 127) out.push([im.data[i * 4] / 255, im.data[i * 4 + 1] / 255, im.data[i * 4 + 2] / 255]); return out; }
const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], sat = c => Math.max(...c) - Math.min(...c);
function mean(n, fb = [0.6, 0.6, 0.6]) { const p = px(n); if (!p.length) return fb; return [0, 1, 2].map(k => p.reduce((s, c) => s + c[k], 0) / p.length); }
function vivid(n, fb) { let r = 0, gg = 0, b = 0, k = 0; for (const c of px(n)) { const w = sat(c) ** 3; r += c[0] * w; gg += c[1] * w; b += c[2] * w; k += w; } if (k < 1e-3) return fb || mean(n); const c = [r / k, gg / k, b / k], mx = Math.max(...c) || 1; return c.map(v => clamp(v * 0.9 / mx)); }
function clusters(n, k = 3) { // k-means palette, sorted dark → light
  const p = px(n).filter(c => lum(c) > 0.04); if (p.length < k) return Array.from({ length: k }, () => mean(n));
  let cs = Array.from({ length: k }, (_, j) => p[Math.floor((j + 0.5) / k * p.length)]);
  for (let r = 0; r < 10; r++) { const sum = cs.map(() => [0, 0, 0, 0]); for (const c of p) { let bi = 0, bd = 9; cs.forEach((q, j) => { const d = (c[0] - q[0]) ** 2 + (c[1] - q[1]) ** 2 + (c[2] - q[2]) ** 2; if (d < bd) { bd = d; bi = j; } }); sum[bi][0] += c[0]; sum[bi][1] += c[1]; sum[bi][2] += c[2]; sum[bi][3]++; } cs = cs.map((q, j) => (sum[j][3] ? sum[j].slice(0, 3).map(v => v / sum[j][3]) : q)); }
  return cs.sort((a, b) => lum(a) - lum(b));
}
const palFrom = (c, k = [0.55, 0.8, 1, 1.18]) => k.map((s, i) => [i / (k.length - 1), c.map(v => clamp(v * s))]);
let dyn = 0;
const masonryC = (c, layout, s, o) => { const key = 'dyn' + dyn++; PAL[key] = { A: palFrom(c, o && o.k) }; return masonry(key, K, layout, s, o); };
function rockC(c, s, o = {}) { // clean natural stone/soil face in a vanilla colour
  const t = new Tex(), pal = palFrom(c, o.k);
  return t.each((x, y, i) => {
    const f = b2.surface(x, y, s, { ...ST, ct: o.ct || ST.ct }); let v = f.v, h = 0.5 + (f.h - 0.5) * 0.5;
    if (o.speck) { const w = worley(x, y, 26, s + 11); if (w.f1 < 0.16) v += h2(s, w.id, 2) < 0.5 ? -0.2 : 0.18; }
    if (o.pores) { const w = worley(x, y, 18, s + 6); if (w.f1 < 0.12) { v -= 0.3; h = 0.2; } }
    if (o.strata) v += Math.sin(Math.PI * 2 * (y / N * o.strata + (fbm(x, y, 3, 2, 2, s + 2) - 0.5) * 0.4)) * 0.06;
    t.col(i, grad(pal, v)); t.h[i] = clamp(h); t.r[i] = o.r ?? ST.rough; t.m[i] = o.m || 0;
  });
}
const metalC = (c, s, o = {}) => g.metalPanel(new Tex(), s, palFrom(c, [0.45, 0.82, 1.05, 1.3]), { tile: o.tile || 64, metal: o.metal ?? 1, rough: o.rough ?? 0.3 });
const groove = (t, test, k = 0.5) => t.each((x, y, i) => { if (test(x, y)) { t.col(i, mul(t.get(i), k)); t.h[i] = 0.15; } });
const glowAt = (t, test, c, e = 0.9) => t.each((x, y, i) => { if (test(x, y)) { t.col(i, c); t.e[i] = e; t.m[i] = 0; } });

// sprites drawn with the item renderer and saved as cut-out block textures
const ORG = (base, dark, light, extra = {}) => mk({ kind: 'organic', base, dark, light, metal: 0, rough: 0.6, gloss: 20, spec: 0.3, ...extra });
const ORGc = (c, extra = {}) => mk({ kind: 'organic', base: c, dark: c.map(v => v * 0.3), light: c.map(v => clamp(v * 0.4 + 0.65)), metal: 0, rough: 0.6, gloss: 20, spec: 0.3, ...extra });
const polyline = (x, y, pts, r) => Math.min(...pts.slice(1).map((p, k) => sdSeg(x, y, pts[k][0], pts[k][1], p[0], p[1], r)));
const rotE = (x, y, cx, cy, rx, ry, a) => { const c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy; return sdEllipse(dx * c + dy * s, -dx * s + dy * c, 0, 0, rx, ry); };
function spriteTex(name, parts, seed) {
  const { rgba, mers } = it.render(name, parts, seed, { style: 'modern', write: false, rimW: 1, withMers: true }), t = new Tex();
  for (let i = 0; i < N * N; i++) { t.col(i, [0, 1, 2].map(c => rgba[i * 4 + c] / 255)); t.a[i] = rgba[i * 4 + 3] / 255; t.m[i] = mers[i * 4] / 255; t.e[i] = mers[i * 4 + 1] / 255; t.r[i] = mers[i * 4 + 2] / 255 || 0.7; t.h[i] = t.a[i] ? 0.6 : 0; }
  t.sprite = true; return t;
}
const fan = c => [{ d: P => Math.max(sdCircle(P.x, P.y, 64, 118, 70), -sdCircle(P.x, P.y, 64, 118, 20), P.y - 118, -Math.min(...[-0.9, -0.45, 0, 0.45, 0.9].map(a => Math.abs(Math.atan2(P.x - 64, 118 - P.y) - a) * Math.hypot(P.x - 64, P.y - 118) - 10))),
  mat: ORGc(c, { gloss: 16, spec: 0.25 }), profile: 'round', bw: 6, z: 1, deco: P => (Math.abs(Math.sin(Math.atan2(P.x - 64, 118 - P.y) * 9)) < 0.08 ? { dh: -0.6, dark: 0.3 } : null) }];
const coralPlant = c => { const br = [[64, 126, 64, 50], [64, 90, 34, 40], [64, 80, 96, 30], [44, 56, 30, 20], [84, 48, 100, 14]]; return [{ d: P => Math.min(...br.map(([a, b, cc, d]) => sdSeg(P.x, P.y, a, b, cc, d, 7))), mat: ORGc(c, { gloss: 18, spec: 0.3 }), profile: 'round', bw: 7, z: 1 }, ...br.map(([, , cc, d]) => ({ d: P => sdCircle(P.x, P.y, cc, d, 9), mat: ORGc(c.map(v => clamp(v * 1.2)), { gloss: 18, spec: 0.3 }), profile: 'round', bw: 8, z: 2 }))]; };
const fungus = (cap, stem) => [{ d: P => sdBox(P.x, P.y, 64, 100, 6, 28, 4), mat: ORGc(stem), profile: 'round', bw: 6, z: 1 }, { d: P => Math.max(sdEllipse(P.x, P.y, 64, 74, 42, 36), P.y - 76), mat: ORGc(cap, { gloss: 24, spec: 0.35 }), profile: 'round', bw: 18, z: 3 }, ...[[44, 60], [70, 52], [86, 66]].map(([x, y]) => ({ d: P => sdCircle(P.x, P.y, x, y, 5), mat: ORG('#ffd040', '#7a5000', '#fffbe0', { emis: 0.4 }), profile: 'round', bw: 4, z: 8 }))];
const roots = c => [24, 44, 64, 84, 104].map((x, k) => ({ d: P => sdPoly(P.x, P.y, [[x - 6, 126], [x + (k - 2) * 8, 34 + (k % 2) * 22], [x + 6, 126]]), mat: ORGc(c), profile: 'ridge', bw: 5, z: 1 + k * 0.2 }));
const hangingVine = (c, tipBulb) => [44, 64, 84].map((x, k) => ({ d: P => polyline(P.x, P.y, Array.from({ length: 9 }, (_, j) => [x + Math.sin(j * 1.1 + k) * 7, j * 16]), 4.5), mat: ORGc(c), profile: 'round', bw: 4.5, z: 1 + k * 0.2 })).concat(tipBulb ? [{ d: P => sdCircle(P.x, P.y, 64, 112, 10), mat: ORG('#ffb030', '#7a3a00', '#fffbe0', { emis: 0.9 }), profile: 'round', bw: 9, z: 6 }] : []);
const stemSprite = (c, connected) => [{ d: P => connected ? polyline(P.x, P.y, [[64, 128], [64, 60], [128, 40]], 3.2) : polyline(P.x, P.y, [[64, 128], [62, 80], [66, 40]], 3.2), mat: ORGc(c), profile: 'round', bw: 3, z: 1 }, ...(connected ? [] : [{ d: P => Math.min(rotE(P.x, P.y, 48, 52, 14, 6, 0.5), rotE(P.x, P.y, 80, 46, 14, 6, -0.5)), mat: ORGc(c), profile: 'round', bw: 5, z: 2 }])];
const cross = (c, n = 6, top = 30) => Array.from({ length: n }, (_, k) => { const x = 14 + k * (100 / (n - 1)), lean = (h2(5, k, 2) - 0.5) * 40, tp = top + h2(5, k, 3) * 30; return { d: P => sdPoly(P.x, P.y, [[x - 5, 128], [x + lean, tp], [x + 5, 128]]), mat: ORGc(c), profile: 'ridge', bw: 4, z: 1 + k * 0.2 }; });
const flowerOn = (c, petals) => [{ d: P => sdSeg(P.x, P.y, 64, 128, 64, 56, 3), mat: ORG('#4f8a2e', '#163a0a', '#d8ffc0'), profile: 'round', bw: 3, z: 1 }, { d: P => Math.min(...Array.from({ length: petals }, (_, k) => { const a = k * 2 * Math.PI / petals; return sdCircle(P.x, P.y, 64 + Math.cos(a) * 13, 44 + Math.sin(a) * 13, 12); })), mat: ORGc(c, { gloss: 28, spec: 0.35 }), profile: 'round', bw: 9, z: 3 }, { d: P => sdCircle(P.x, P.y, 64, 44, 7), mat: ORG('#f0b020', '#6a4000', '#fff0c0'), profile: 'round', bw: 6, z: 6 }];

// ---------------------------------------------------------------- block designs
const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
function glazed(n, s) { // 4-fold rotational ceramic motif in the tile's own three colours, glossy glaze
  const [c0, c1, c2] = clusters(n, 3), t = new Tex();
  return t.each((x, y, i) => {
    let u = x - 63.5, v = y - 63.5; if (u > 0 && v <= 0) [u, v] = [v, -u]; else if (u > 0 && v > 0) [u, v] = [-u, -v]; else if (u <= 0 && v > 0) [u, v] = [-v, u];
    const r = Math.hypot(u + 64, v + 64), d = Math.abs(u) + Math.abs(v), ring = Math.abs(r - 52) < 6, dia = Math.abs(d - 34) < 5, dot = Math.hypot(u + 26, v + 26) < 8;
    let c = c1; if (ring) c = c0; if (dia) c = c2; if (dot) c = c0; if (Math.hypot(u, v) < 10) c = c2;
    t.col(i, mul(c, 0.92 + (fbm(x, y, 4, 4, 3, s) - 0.5) * 0.08)); t.h[i] = ring || dia ? 0.62 : 0.5; t.r[i] = 0.18;
    if (edgeDist(x, y) < 2) { t.col(i, mul(t.get(i), 0.7)); t.h[i] = 0.3; }
  });
}
function paneTop(n) { const c = mean(n, [0.85, 0.9, 0.95]), t = new Tex(), f = vfile(n), im = f && readImage(f); return t.each((x, y, i) => { const a = im ? im.data[((y >> 3) * im.w + (x >> 3)) * 4 + 3] / 255 : 1; t.col(i, mul(c, 0.85 + Math.sin(Math.PI * ((x % 16) + 0.5) / 16) * 0.25)); t.a[i] = a; t.h[i] = 0.6; t.r[i] = 0.08; }); }
function shulkerTop(n, s) { const c = mean(n); const t = masonryC(c, { type: 'slab' }, s); return groove(t, (x, y) => Math.abs(Math.hypot(x - 63.5, y - 63.5) - 30) < 2); }
function fungusWood(kind, part, s) {
  const c = mean(`huge_fungus/${kind}_planks`, kind === 'crimson' ? [0.45, 0.2, 0.28] : [0.17, 0.42, 0.4]), stem = mean(kind === 'warped' ? 'huge_fungus/warped_stem_side' : `huge_fungus/${kind}_log_side`, c), plankP = palFrom(c, [0.62, 0.82, 1, 1.15]);
  if (part === 'planks') return g.planks(new Tex(), s, plankP);
  if (part === 'log_side') { const t = g.logSide(new Tex(), s, palFrom(stem, [0.45, 0.7, 0.95, 1.15]), false); return glowAt(t, (x, y) => h2(s, x >> 3, y >> 2) < 0.03, kind === 'crimson' ? [1, 0.35, 0.3] : [0.3, 1, 0.9], 0.6); }
  if (part === 'log_top') return g.logTop(new Tex(), s, palFrom(stem, [0.45, 0.7, 0.95, 1.15]), plankP, false);
  if (part === 'stripped_side') { const t = new Tex(); return t.each((x, y, i) => { const gr = fbm(x, y, 20, 2, 4, s); t.col(i, grad(palFrom(stem, [0.7, 0.88, 1.02, 1.15]), 0.3 + gr * 0.55)); t.h[i] = 0.5 + (gr - 0.5) * 0.3; t.r[i] = 0.75; }); }
  if (part === 'stripped_top') return g.logTop(new Tex(), s, palFrom(stem, [0.55, 0.72, 0.85, 0.95]), plankP, false);
  if (part === 'door_top' || part === 'door_lower') return b3.door('A', part === 'door_top' ? 'upper' : 'lower', false, plankP, s);
  if (part === 'trapdoor') return b3.trapdoor('A', false, plankP, s);
}
function bamboo(part, s) {
  const pal = palFrom(mean('bamboo_block', [0.55, 0.62, 0.2]), [0.6, 0.82, 1, 1.15]), plank = palFrom(mean('bamboo_planks', [0.8, 0.72, 0.35]), [0.62, 0.82, 1, 1.15]), strip = palFrom(mean('stripped_bamboo_block', [0.78, 0.72, 0.3]), [0.62, 0.82, 1, 1.15]);
  const t = new Tex();
  if (part === 'block' || part === 'stripped') return t.each((x, y, i) => { const lx = x % 32, curve = Math.sin(Math.PI * (lx + 0.5) / 32), node = (y + (x >> 5) * 17) % 48 < 3; t.col(i, grad(part === 'block' ? pal : strip, 0.3 + curve * 0.55 + (node ? -0.2 : 0))); t.h[i] = 0.4 + curve * 0.4 + (node ? 0.1 : 0); t.r[i] = 0.5; });
  if (part === 'block_top' || part === 'stripped_top') return t.each((x, y, i) => { const r = Math.hypot(((x % 32) - 15.5), ((y % 32) - 15.5)); t.col(i, grad(part === 'block_top' ? pal : strip, r < 9 ? 0.75 : r < 14 ? 0.35 : 0.55)); t.h[i] = r < 14 ? 0.6 : 0.4; t.r[i] = 0.5; });
  if (part === 'planks') return g.planks(t, s, plank);   // follows the chosen plank style
  if (part === 'mosaic') return t.each((x, y, i) => { const cell = ((x >> 5) + (y >> 5)) % 2, lx = cell ? x % 32 : y % 32; t.col(i, grad(plank, 0.3 + Math.sin(Math.PI * ((lx % 8) + 0.5) / 8) * 0.5)); t.h[i] = 0.5; t.r[i] = 0.6; if (edgeDist(x, y, 32) < 1) t.col(i, mul(t.get(i), 0.5)); });
}
function copperExtra(stage, part, s) {
  const n = (stage ? stage + '_' : '') + 'copper', c = mean(n === 'copper' ? 'copper_block' : n, [0.75, 0.45, 0.3]), metal = stage === 'oxidized' ? 0.3 : stage === 'weathered' ? 0.55 : stage === 'exposed' ? 0.8 : 1;
  if (part === 'grate') { const t = metalC(c, s, { tile: 128, metal }); return t.each((x, y, i) => { if ((x % 16) > 3 && (y % 16) > 3 && edgeDist(x, y) > 6) { t.a[i] = 0; t.col(i, [0, 0, 0]); } }); }
  if (part.startsWith('bulb')) { const lit = part.includes('lit'), powered = part.includes('powered'), t = metalC(c, s, { tile: 128, metal }); return t.each((x, y, i) => { const r = Math.hypot(x - 63.5, y - 63.5); if (r < 34) { if (lit) { t.col(i, mix([1, 0.85, 0.5], [1, 0.97, 0.85], 1 - r / 34)); t.e[i] = 1; t.m[i] = 0; } else { t.col(i, mul(c, 0.35)); t.m[i] = 0.2; } t.h[i] = 0.45; } else if (r < 38) { t.col(i, mul(t.get(i), 0.6)); t.h[i] = 0.3; } if (powered && edgeDist(x, y) >= 8 && edgeDist(x, y) < 11) { t.col(i, [1, 0.15, 0.1]); t.e[i] = 0.8; } }); }
  if (part === 'bars') { const t = new Tex(); return t.each((x, y, i) => { const bar = [12, 44, 76, 108].find(cx => Math.abs(x - cx) <= 5), cr = Math.abs(y - 20) <= 4 || Math.abs(y - 108) <= 4; if (bar === undefined && !cr) { t.a[i] = 0; t.col(i, [0, 0, 0]); return; } const lx = bar !== undefined ? (x - bar + 5.5) / 11 : 0.5; t.col(i, grad(palFrom(c, [0.45, 0.82, 1.05, 1.3]), 0.2 + Math.sin(Math.PI * lx) * 0.65)); t.m[i] = metal; t.r[i] = 0.3; t.h[i] = 0.4 + Math.sin(Math.PI * lx) * 0.5; }); }
  if (part.startsWith('chest')) { const t = metalC(c, s, { tile: 128, metal }); return t.each((x, y, i) => { if (Math.abs(y - 44) < 2) { t.col(i, mul(t.get(i), 0.4)); t.h[i] = 0.1; } if (part === 'chest_front' && Math.abs(x - 63.5) < 7 && y > 34 && y < 58) { t.col(i, mul(c, 1.3)); t.h[i] = 0.9; } }); }
}
function beeBlock(kind, face, s) {
  const c = mean(kind === 'hive' ? 'beehive_side' : 'bee_nest_side', [0.7, 0.55, 0.3]), t = kind === 'hive' ? g.planks(new Tex(), s, palFrom(c, [0.62, 0.82, 1, 1.15])) : rockC(c, s, { strata: 6, k: [0.6, 0.82, 1, 1.15] });
  if (face === 'top' || face === 'bottom') return groove(t, (x, y) => Math.abs(Math.hypot(x - 63.5, y - 63.5) - 34) < 2);
  if (face.startsWith('front')) return t.each((x, y, i) => { if (y > 64 && y < 84 && x > 34 && x < 94) { t.col(i, face === 'front_honey' ? [1, 0.7, 0.15] : [0.06, 0.04, 0.02]); t.h[i] = 0.05; t.r[i] = face === 'front_honey' ? 0.1 : 0.9; } });
  return t;
}
const BLOCK = {};
const add = (name, fn) => { BLOCK[name] = fn; };
DYES.forEach(d => { add(`glazed_terracotta_${d}`, s => glazed(`glazed_terracotta_${d}`, s)); add(`glass_pane_top_${d}`, () => paneTop(`glass_pane_top_${d}`)); add(`shulker_top_${d}`, s => shulkerTop(`shulker_top_${d}`, s)); });
add('glass_pane_top', () => paneTop('glass_pane_top')); add('shulker_top_undyed', s => shulkerTop('shulker_top_undyed', s));
for (const kind of ['crimson', 'warped']) {
  add(`huge_fungus/${kind}_planks`, s => fungusWood(kind, 'planks', s)); add(`huge_fungus/${kind}_log_side`, s => fungusWood(kind, 'log_side', s)); add(`huge_fungus/${kind}_log_top`, s => fungusWood(kind, 'log_top', s));
  add(`huge_fungus/stripped_${kind}_stem_side`, s => fungusWood(kind, 'stripped_side', s)); add(`huge_fungus/stripped_${kind}_stem_top`, s => fungusWood(kind, 'stripped_top', s));
  add(`huge_fungus/${kind}_door_top`, s => fungusWood(kind, 'door_top', s)); add(`huge_fungus/${kind}_door_lower`, s => fungusWood(kind, 'door_lower', s)); add(`huge_fungus/${kind}_trapdoor`, s => fungusWood(kind, 'trapdoor', s));
}
// vanilla calls the warped log a stem
add('huge_fungus/warped_stem_side', s => fungusWood('warped', 'log_side', s)); add('huge_fungus/warped_stem_top', s => fungusWood('warped', 'log_top', s));
add('bamboo_block', s => bamboo('block', s)); add('bamboo_block_top', s => bamboo('block_top', s)); add('stripped_bamboo_block', s => bamboo('stripped', s)); add('stripped_bamboo_block_top', s => bamboo('stripped_top', s)); add('bamboo_planks', s => bamboo('planks', s)); add('bamboo_mosaic', s => bamboo('mosaic', s));
for (const stage of ['', 'exposed', 'weathered', 'oxidized']) {
  const p = stage ? stage + '_' : '';
  for (const part of ['bulb', 'bulb_lit', 'bulb_powered', 'bulb_lit_powered']) add(`${p}copper_${part}`, s => copperExtra(stage, part, s));
  add(`${p}copper_grate`, s => copperExtra(stage, 'grate', s)); add(`${p}copper_bars`, s => copperExtra(stage, 'bars', s));
  for (const f of ['front', 'side', 'top']) add(`${p}copper_chest_inventory_${f}`, s => copperExtra(stage, 'chest_' + f, s));
}
const QUARTZ = [0.92, 0.9, 0.86];
add('quartz_block_chiseled', s => { const t = masonryC(QUARTZ, { type: 'slab' }, s); return b2.motifRing(t); }); add('quartz_block_chiseled_top', s => masonryC(QUARTZ, { type: 'slab' }, s));
add('quartz_block_lines', s => masonryC(QUARTZ, { type: 'columns', cw: 32, ch: N }, s)); add('quartz_block_lines_top', s => groove(masonryC(QUARTZ, { type: 'slab' }, s), (x, y) => edgeDist(x, y) === 20));
add('quartz_bricks', s => masonryC(QUARTZ, { type: 'grid', bw: 64, bh: 32, offset: true }, s));
for (const m of ['iron', 'gold', 'copper']) add(`raw_${m}_block`, s => { const t = rockC(mean(`raw_${m}_block`), s, { speck: true, k: [0.5, 0.78, 1.02, 1.25] }); return t.each((x, y, i) => { t.m[i] = 0.6; t.r[i] = 0.4; }); });
add('netherite_block', s => metalC(mean('netherite_block', [0.27, 0.25, 0.26]), s, { rough: 0.25 }));
add('ancient_debris_side', s => rockC(mean('ancient_debris_side'), s, { strata: 5, ct: 1.2 })); add('ancient_debris_top', s => groove(rockC(mean('ancient_debris_top'), s, { ct: 1.1 }), (x, y) => [18, 34, 50].some(r => Math.abs(Math.hypot(x - 63.5, y - 63.5) - r) < 1.5), 0.6));
add('crying_obsidian', s => glowAt(g.metalPanel(new Tex(), s, palFrom([0.12, 0.06, 0.2]), { tile: 128, metal: 0, rough: 0.1 }), (x, y) => fbm(x, y, 8, 8, 3, s) > 0.68, [0.6, 0.2, 1], 0.9));
add('glowing_obsidian', s => glowAt(rockC([0.25, 0.08, 0.06], s, { ct: 1.4, r: 0.15 }), (x, y) => fbm(x, y, 6, 6, 3, s) > 0.62, [1, 0.4, 0.1], 0.9));
add('bone_block_side', s => { const t = new Tex(); return t.each((x, y, i) => { const f = fbm(x, y, 2, 24, 3, s); t.col(i, grad(palFrom([0.88, 0.85, 0.75]), 0.4 + f * 0.4)); t.h[i] = 0.5; t.r[i] = 0.7; }); });
add('bone_block_top', s => groove(masonryC([0.88, 0.85, 0.75], { type: 'slab' }, s), (x, y) => Math.abs(Math.hypot(x - 63.5, y - 63.5) - 30) < 3, 0.75));
for (const f of ['top', 'side', 'bottom']) add(`honey_${f}`, s => { const t = rockC([0.95, 0.65, 0.15], s, { ct: 0.5, r: 0.05 }); return t.each((x, y, i) => { t.a[i] = f === 'side' ? 0.85 : 1; if (edgeDist(x, y) < 6) { t.col(i, mul(t.get(i), 0.8)); t.h[i] = 0.7; } }); });
add('honeycomb', s => { const t = new Tex(); return t.each((x, y, i) => { const row = Math.floor(y / 18), cx = ((x + (row % 2) * 10.5) % 21) - 10.5, cy = (y % 18) - 9, hex = Math.max(Math.abs(cx) * 0.866 + Math.abs(cy) * 0.5, Math.abs(cy)); t.col(i, hex > 7.5 ? [0.85, 0.55, 0.1] : [1, 0.72, 0.15]); t.h[i] = hex > 7.5 ? 0.8 : 0.4; t.r[i] = hex > 7.5 ? 0.6 : 0.1; }); });
add('slime', s => { const t = new Tex(); return t.each((x, y, i) => { const d = edgeDist(x, y), inner = d > 22; t.col(i, inner ? [0.35, 0.7, 0.25] : [0.5, 0.88, 0.38]); t.a[i] = 0.9; t.h[i] = inner ? 0.7 : 0.5; t.r[i] = 0.05; }); });
add('shroomlight', s => glowAt(rockC([1, 0.6, 0.25], s, { ct: 1.2 }), (x, y) => worley(x, y, 10, s).f1 < 0.18, [1, 0.85, 0.5], 1));
add('tnt_side', s => { const t = new Tex(); return t.each((x, y, i) => { const band = y > 40 && y < 88, stick = (x % 32) < 2; t.col(i, band ? [0.95, 0.93, 0.88] : [0.82, 0.16, 0.12]); if (!band && stick) t.col(i, [0.5, 0.08, 0.06]); t.h[i] = band ? 0.6 : 0.5 + Math.sin(Math.PI * ((x % 32) + 0.5) / 32) * 0.25; t.r[i] = 0.7; }); });
add('tnt_top', s => { const t = new Tex(); return t.each((x, y, i) => { const r = Math.hypot(((x % 32) - 15.5), ((y % 32) - 15.5)); t.col(i, r < 3 ? [0.15, 0.15, 0.15] : r < 13 ? [0.82, 0.16, 0.12] : [0.6, 0.1, 0.08]); t.h[i] = r < 13 ? 0.6 : 0.3; t.r[i] = 0.7; }); });
add('tnt_bottom', s => BLOCK.tnt_top(s));
add('resin_block', s => rockC(mean('resin_block', [0.9, 0.45, 0.1]), s, { ct: 0.9, r: 0.25 })); add('resin_bricks', s => masonryC(mean('resin_bricks', [0.85, 0.4, 0.1]), { type: 'grid', bw: 32, bh: 16, offset: true }, s)); add('chiseled_resin_bricks', s => b2.motifRing(masonryC(mean('chiseled_resin_bricks', [0.85, 0.4, 0.1]), { type: 'slab' }, s)));
for (const m of ['cinnabar', 'sulfur']) { add(m, s => rockC(mean(m), s, { speck: true })); add(`${m}_bricks`, s => masonryC(mean(`${m}_bricks`), { type: 'grid', bw: 32, bh: 16, offset: true }, s)); add(`chiseled_${m}`, s => b2.motifRing(masonryC(mean(`chiseled_${m}`), { type: 'slab' }, s))); }
add('potent_sulfur', s => glowAt(rockC(mean('potent_sulfur', [0.85, 0.8, 0.3]), s, { speck: true }), (x, y) => worley(x, y, 14, s).f1 < 0.12, [1, 0.95, 0.4], 0.6));
for (const f of ['side', 'top', 'bottom']) add(`reinforced_deepslate_${f}`, s => { const t = masonryC([0.3, 0.3, 0.33], { type: 'grid', bw: 64, bh: 64 }, s); return t.each((x, y, i) => { if (edgeDist(x, y) < 10) { t.col(i, grad(palFrom([0.75, 0.72, 0.62]), 0.5 + fbm(x, y, 8, 8, 2, s) * 0.3)); t.h[i] = 0.8; } }); });
add('lodestone_side', s => { const t = masonryC([0.6, 0.6, 0.62], { type: 'slab' }, s); return t.each((x, y, i) => { if (Math.abs(y - 64) < 10) { t.col(i, grad(palFrom([0.35, 0.36, 0.4]), 0.5)); t.m[i] = 1; t.r[i] = 0.25; t.h[i] = 0.8; } }); });
add('lodestone_top', s => { const t = masonryC([0.6, 0.6, 0.62], { type: 'slab' }, s); return t.each((x, y, i) => { if (Math.hypot(x - 63.5, y - 63.5) < 24) { t.col(i, [0.32, 0.33, 0.37]); t.m[i] = 1; t.r[i] = 0.25; } }); });
add('respawn_anchor_bottom', s => masonryC([0.12, 0.06, 0.2], { type: 'slab' }, s)); add('respawn_anchor_top_off', s => groove(masonryC([0.12, 0.06, 0.2], { type: 'slab' }, s), (x, y) => Math.abs(Math.hypot(x - 63.5, y - 63.5) - 28) < 3));
add('respawn_anchor_top', s => glowAt(masonryC([0.12, 0.06, 0.2], { type: 'slab' }, s), (x, y) => Math.hypot(x - 63.5, y - 63.5) < 28, [0.75, 0.35, 1]));
for (let lv = 0; lv <= 4; lv++) add(`respawn_anchor_side${lv}`, s => glowAt(masonryC([0.12, 0.06, 0.2], { type: 'slab' }, s), (x, y) => y > 100 && Math.floor((x - 14) / 25) < lv && x > 14 && x < 114 && (x - 14) % 25 < 20, [0.75, 0.35, 1]));
add('daylight_detector_top', s => { const t = g.planks(new Tex(), s, palFrom([0.6, 0.45, 0.28])); return t.each((x, y, i) => { if (edgeDist(x, y) > 10) { t.col(i, [0.25, 0.4, 0.6].map((v, k) => v + ((x + y) % 16 < 2 ? 0.25 : 0))); t.r[i] = 0.05; t.h[i] = 0.7; } }); });
add('daylight_detector_inverted_top', s => { const t = BLOCK.daylight_detector_top(s); return t.each((x, y, i) => { if (edgeDist(x, y) > 10) t.col(i, mul(t.get(i), 0.5)); }); });
add('daylight_detector_side', s => g.planks(new Tex(), s, palFrom([0.6, 0.45, 0.28])));
add('hopper_outside', s => metalC([0.35, 0.36, 0.4], s)); add('hopper_inside', s => metalC([0.22, 0.22, 0.25], s, { tile: 128 })); add('hopper_top', s => { const t = metalC([0.35, 0.36, 0.4], s, { tile: 128 }); return t.each((x, y, i) => { if (edgeDist(x, y) > 14) { t.col(i, [0.05, 0.05, 0.06]); t.h[i] = 0.05; } }); });
add('comparator_off', s => masonryC([0.68, 0.68, 0.68], { type: 'slab' }, s)); add('comparator_on', s => glowAt(masonryC([0.68, 0.68, 0.68], { type: 'slab' }, s), (x, y) => Math.abs(x - 63.5) < 3 && y > 30 && y < 98, [1, 0.15, 0.1]));
add('repeater_off', s => BLOCK.comparator_off(s)); add('repeater_on', s => BLOCK.comparator_on(s));
for (const f of ['side1', 'side2', 'top']) add(`fletcher_table_${f}`, s => { const t = g.planks(new Tex(), s, palFrom([0.75, 0.62, 0.42])); if (f !== 'top') return t; return t.each((x, y, i) => { if (Math.abs(x - y) < 3 && edgeDist(x, y) > 14) { t.col(i, [0.95, 0.95, 0.92]); t.h[i] = 0.8; } }); });
for (const f of ['front', 'front_honey', 'side', 'top', 'bottom']) add(`bee_nest_${f}`, s => beeBlock('nest', f, s));
for (const f of ['front', 'front_honey', 'side', 'top']) add(`beehive_${f}`, s => beeBlock('hive', f, s));
add('coarse_dirt', s => g.dirt(new Tex(), s, palFrom(mean('coarse_dirt', [0.45, 0.32, 0.22]), [0.5, 0.78, 1, 1.2])));
add('dirt_with_roots', s => { const t = g.dirt(new Tex(), s, palFrom(mean('dirt_with_roots', [0.45, 0.32, 0.22]), [0.5, 0.78, 1, 1.2])); return t.each((x, y, i) => { if (Math.abs(Math.sin(x * 0.18 + fbm(x, y, 4, 4, 2, s) * 8)) < 0.06) { t.col(i, [0.72, 0.55, 0.38]); t.h[i] = 0.7; } }); });
add('dirt_podzol_top', s => { const t = new Tex(); return t.each((x, y, i) => { const w = worley(x, y, 22, s); t.col(i, grad(palFrom([0.42, 0.28, 0.15]), 0.3 + (1 - Math.min(1, w.f1 / 0.5)) * 0.5 + (fbm(x, y, 8, 8, 3, s) - 0.5) * 0.2)); t.h[i] = 0.4 + (1 - Math.min(1, w.f1 / 0.5)) * 0.3; t.r[i] = 0.9; }); });
add('dirt_podzol_side', s => { const t = g.dirt(new Tex(), s, palFrom([0.45, 0.32, 0.22], [0.5, 0.78, 1, 1.2])), top = BLOCK.dirt_podzol_top(s + 1); return t.each((x, y, i) => { const e = 18 + fbm(x, 0, 8, 1, 2, s) * 12; if (y < e) { t.col(i, top.get(i)); t.h[i] = top.h[i]; } else if (y < e + 3) t.col(i, mul(t.get(i), 0.6)); }); });
add('grass_path_top', s => { const t = new Tex(); return t.each((x, y, i) => { const n = fbm(x, y, 6, 6, 4, s), w = worley(x, y, 20, s + 1); t.col(i, grad(palFrom([0.58, 0.48, 0.28]), 0.4 + (n - 0.5) * 0.3 + (w.f1 < 0.14 ? 0.2 : 0))); t.h[i] = 0.45 + (w.f1 < 0.14 ? 0.2 : 0); t.r[i] = 0.9; }); });
add('grass_path_side', s => { const t = g.dirt(new Tex(), s, palFrom([0.45, 0.32, 0.22], [0.5, 0.78, 1, 1.2])), top = BLOCK.grass_path_top(s + 1); return t.each((x, y, i) => { if (y < 14) { t.col(i, top.get(i)); t.h[i] = 0.7; } else if (y < 17) t.col(i, mul(t.get(i), 0.55)); }); });
const SNOW = [0.94, 0.96, 0.98];
add('grass_side_snowed', s => { const t = g.dirt(new Tex(), s, palFrom([0.45, 0.32, 0.22], [0.5, 0.78, 1, 1.2])); return t.each((x, y, i) => { const e = 24 + fbm(x, 0, 8, 1, 2, s) * 14; if (y < e) { t.col(i, mul(SNOW, 0.9 + fbm(x, y, 8, 8, 2, s) * 0.12)); t.h[i] = 0.75; t.r[i] = 0.55; t.a[i] = 1; } else if (y < e + 3) t.col(i, mul(t.get(i), 0.6)); }); });
add('grass_block_snow', s => BLOCK.grass_side_snowed(s));
add('grass_carried', s => { const t = new Tex(); return t.each((x, y, i) => { const n = fbm(x, y, 6, 6, 4, s), bl = fbm(x, y, 24, 24, 2, s + 1); t.col(i, mul([0.49, 0.74, 0.32], 0.75 + n * 0.25 + (bl - 0.5) * 0.2)); t.h[i] = 0.4 + bl * 0.3; t.r[i] = 0.8; }); });
for (const kind of ['sand', 'gravel']) for (let st = 0; st <= 3; st++) add(`suspicious_${kind}_${st}`, s => { const base = kind === 'sand' ? g.sand(new Tex(), s, palFrom([0.86, 0.8, 0.6], [0.88, 0.95, 1.02, 1.08])) : rockC([0.55, 0.52, 0.5], s, { speck: true, ct: 1.3 }); return base.each((x, y, i) => { const r = Math.hypot(x - 63.5, y - 70); if (r < 10 + st * 6 && (x + y) % 9 < 3) { base.col(i, mul(base.get(i), 0.7)); base.h[i] = 0.3; } if (st > 0 && Math.hypot(x - 70, y - 64) < st * 5) { base.col(i, [0.62, 0.38, 0.22]); base.h[i] = 0.75; } }); });
for (const f of ['top', 'side']) for (const st of ['active', 'dormant', 'inactive']) add(`creaking_heart_${f}_${st}`, s => { const t = g.logSide(new Tex(), s, palFrom([0.42, 0.36, 0.32], [0.45, 0.7, 0.95, 1.15]), false); return t.each((x, y, i) => { if (Math.hypot(x - 63.5, y - 63.5) < 14) { if (st === 'active') { t.col(i, [1, 0.55, 0.15]); t.e[i] = 1; } else if (st === 'dormant') { t.col(i, [0.55, 0.3, 0.12]); t.e[i] = 0.3; } else t.col(i, [0.25, 0.2, 0.18]); t.h[i] = 0.4; } }); });
add('pale_moss_block', s => { const t = new Tex(); return t.each((x, y, i) => { const w = worley(x, y, 22, s), tuft = 1 - Math.min(1, w.f1 / 0.5); t.col(i, grad(palFrom([0.6, 0.64, 0.58]), 0.3 + tuft * 0.5)); t.h[i] = 0.3 + tuft * 0.5; t.r[i] = 0.95; }); });
add('cake_top', s => { const t = new Tex(); return t.each((x, y, i) => { const d = edgeDist(x, y); t.col(i, d < 8 ? [0.85, 0.62, 0.35] : [0.97, 0.95, 0.92]); t.h[i] = d < 8 ? 0.4 : 0.6; t.r[i] = 0.5; if (d >= 8 && h2(s, x >> 4, y >> 4) < 0.18 && Math.hypot((x % 16) - 8, (y % 16) - 8) < 4) { t.col(i, [0.85, 0.08, 0.12]); t.h[i] = 0.8; } }); });
add('cake_side', s => { const t = new Tex(); return t.each((x, y, i) => { t.col(i, y < 28 + Math.sin(x * 0.3) * 4 ? [0.97, 0.95, 0.92] : mul([0.85, 0.62, 0.35], 0.9 + fbm(x, y, 8, 8, 3, s) * 0.15)); t.h[i] = 0.5; t.r[i] = 0.6; if (Math.abs(y - 80) < 3 && y > 28) t.col(i, [0.85, 0.15, 0.2]); }); });
add('cake_inner', s => { const t = BLOCK.cake_side(s); return t.each((x, y, i) => { if (y >= 32 && h2(s, x >> 2, y >> 2) < 0.2) t.col(i, mul(t.get(i), 0.8)); }); });
add('cake_bottom', s => { const t = new Tex(); return t.each((x, y, i) => { t.col(i, mul([0.85, 0.62, 0.35], 0.85 + fbm(x, y, 8, 8, 3, s) * 0.2)); t.h[i] = 0.5; t.r[i] = 0.7; }); });
// inventory chest icons; `trim` (optional) paints metal edge bands to match the walnut + brass chest model
const chestFace = (c, f, s, latch, trim) => { const t = g.planks(new Tex(), s, palFrom(c, [0.62, 0.82, 1, 1.15])); return t.each((x, y, i) => { const d = edgeDist(x, y); if (d < 6) { if (trim) { t.col(i, mul(trim, 0.9 + (d === 5 ? -0.3 : 0))); t.m[i] = 1; t.r[i] = 0.3; } else t.col(i, mul(t.get(i), 0.7)); t.h[i] = 0.8; } if (f !== 'top' && Math.abs(y - 44) < 3) { t.col(i, mul(t.get(i), 0.4)); t.h[i] = 0.2; } if (f === 'front' && Math.abs(x - 63.5) < 7 && y > 34 && y < 58) { t.col(i, latch); t.m[i] = 1; t.r[i] = 0.25; t.h[i] = 0.9; } }); };
const WALNUT = [0.33, 0.21, 0.12], BRASS_C = [0.82, 0.6, 0.22];
for (const f of ['front', 'side', 'top']) { add(`chest_${f}`, s => chestFace(WALNUT, f, s, BRASS_C, BRASS_C)); add(`ender_chest_${f}`, s => { const t = chestFace([0.12, 0.2, 0.2], f, s, [0.3, 1, 0.7]); return glowAt(t, (x, y) => f === 'front' && Math.abs(x - 63.5) < 7 && y > 34 && y < 58, [0.3, 1, 0.7], 0.8); }); }
add('trapped_chest_front', s => chestFace(WALNUT, 'front', s, [0.8, 0.12, 0.1], BRASS_C));
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'poplar', 'bamboo', 'crimson', 'warped']) add(`${w}_shelf`, s => { const c = mean(`${w}_shelf`, [0.6, 0.45, 0.28]); const t = g.planks(new Tex(), s, palFrom(c, [0.62, 0.82, 1, 1.15])); return t.each((x, y, i) => { if (y > 56 && y < 72) { t.col(i, mul(t.get(i), 1.1)); t.h[i] = 0.85; } if (y >= 72 && y < 76) t.col(i, mul(t.get(i), 0.5)); }); });
add('mob_spawner', s => { const t = new Tex(); return t.each((x, y, i) => { const bar = (x % 21) < 4 || (y % 21) < 4 || edgeDist(x, y) < 5; if (!bar) { t.a[i] = 0; t.col(i, [0, 0, 0]); return; } t.col(i, grad(palFrom([0.22, 0.24, 0.3]), 0.5 + fbm(x, y, 4, 4, 2, s) * 0.3)); t.m[i] = 1; t.r[i] = 0.3; t.h[i] = 0.7; }); });
add('web', s => { const t = new Tex(); return t.each((x, y, i) => { const dx = x - 63.5, dy = y - 63.5, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy), spoke = Math.abs(Math.sin(a * 4)) * r < 1.4, ring = r > 6 && Math.abs((r % 14) - 7) < 0.9; if (!spoke && !ring) { t.a[i] = 0; t.col(i, [0, 0, 0]); return; } t.col(i, [0.92, 0.92, 0.95]); t.h[i] = 0.6; t.r[i] = 0.6; }); });
add('tinted_glass', s => { const t = new Tex(); return t.each((x, y, i) => { const d = edgeDist(x, y); t.col(i, d < 4 ? [0.35, 0.3, 0.42] : [0.2, 0.16, 0.26]); t.a[i] = d < 4 ? 1 : 0.6; t.h[i] = d < 4 ? 0.8 : 0.5; t.r[i] = 0.05; }); });
add('beacon', s => glowAt(masonryC([0.55, 0.9, 0.92], { type: 'slab' }, s), (x, y) => Math.hypot(x - 63.5, y - 63.5) < 20, [0.75, 1, 1], 1));
add('dragon_egg', s => { const t = new Tex(); return t.each((x, y, i) => { const w = worley(x, y, 8, s); t.col(i, grad(palFrom([0.12, 0.05, 0.18]), 0.3 + h2(s, w.id, 1) * 0.5)); if (w.f2 - w.f1 < 0.04) { t.col(i, [0.6, 0.25, 0.85]); t.e[i] = 0.4; } t.h[i] = 0.5; t.r[i] = 0.2; }); });
add('glow_item_frame', s => { const t = g.planks(new Tex(), s, palFrom([0.6, 0.45, 0.28])); return glowAt(t, (x, y) => edgeDist(x, y) < 4, [0.3, 1, 0.85], 0.7); });
add('itemframe_background', s => g.planks(new Tex(), s, palFrom([0.66, 0.5, 0.33])));

// sprites
const SPRITES = {};
for (const col of ['blue', 'pink', 'purple', 'red', 'yellow']) for (const dead of [false, true]) {
  const sfx = dead ? '_dead' : '', c = () => mean(`coral_fan_${col}${sfx}`, [0.6, 0.6, 0.6]);
  SPRITES[`coral_fan_${col}${sfx}`] = () => fan(c()); SPRITES[`coral_plant_${col}${sfx}`] = () => coralPlant(mean(`coral_plant_${col}${sfx}`, c()));
}
Object.assign(SPRITES, {
  crimson_fungus: () => fungus([0.7, 0.12, 0.12], [0.85, 0.6, 0.5]), warped_fungus: () => fungus([0.1, 0.55, 0.5], [0.85, 0.6, 0.5]),
  crimson_roots: () => roots([0.6, 0.08, 0.15]), warped_roots: () => roots([0.1, 0.6, 0.55]), crimson_roots_pot: () => roots([0.6, 0.08, 0.15]), warped_roots_pot: () => roots([0.1, 0.6, 0.55]),
  weeping_vines: () => hangingVine([0.62, 0.08, 0.1]), weeping_vines_plant: () => hangingVine([0.62, 0.08, 0.1]), weeping_vines_base: () => hangingVine([0.62, 0.08, 0.1]), weeping_vines_bottom: () => hangingVine([0.62, 0.08, 0.1]),
  twisting_vines_base: () => hangingVine([0.1, 0.65, 0.6]), twisting_vines_bottom: () => hangingVine([0.1, 0.65, 0.6]),
  cave_vines_body: () => hangingVine([0.3, 0.55, 0.2]), cave_vines_head: () => hangingVine([0.3, 0.55, 0.2]), cave_vines_body_berries: () => hangingVine([0.3, 0.55, 0.2], true), cave_vines_head_berries: () => hangingVine([0.3, 0.55, 0.2], true),
  nether_sprouts: () => cross([0.1, 0.6, 0.55], 6, 50), nether_wart_stage_0: () => cross([0.55, 0.1, 0.12], 3, 90), nether_wart_stage_1: () => cross([0.6, 0.1, 0.12], 5, 70), nether_wart_stage_2: () => [...cross([0.62, 0.1, 0.12], 5, 50), ...[[40, 50], [64, 40], [88, 52]].map(([x, y]) => ({ d: P => sdCircle(P.x, P.y, x, y, 10), mat: ORGc([0.7, 0.1, 0.12]), profile: 'round', bw: 9, z: 5 }))],
  melon_stem_disconnected: () => stemSprite([0.45, 0.6, 0.2], false), pumpkin_stem_disconnected: () => stemSprite([0.45, 0.6, 0.2], false), melon_stem_connected: () => stemSprite([0.5, 0.55, 0.25], true), pumpkin_stem_connected: () => stemSprite([0.55, 0.5, 0.25], true),
  eyeblossom_blooming: () => flowerOn([0.95, 0.55, 0.15], 6), eyeblossom_dormant: () => flowerOn([0.55, 0.5, 0.5], 5),
  cherry_sapling: () => [{ d: P => sdSeg(P.x, P.y, 64, 128, 62, 60, 4.5), mat: ORG('#5a3a3a', '#1e0e0e', '#c09090'), profile: 'round', bw: 4, z: 1 }, ...[[62, 42, 22], [40, 58, 16], [86, 58, 17]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.25, P.y * 0.25, 9 + k) - 0.5) * 8, mat: ORG('#f0a8c8', '#7a3a5a', '#ffffff'), profile: 'round', bw: r * 0.8, z: 3 + k }))],
  pale_oak_sapling: () => [{ d: P => sdSeg(P.x, P.y, 64, 128, 62, 60, 4.5), mat: ORG('#8a8278', '#2e2a26', '#e0dad0'), profile: 'round', bw: 4, z: 1 }, ...[[62, 42, 22], [40, 58, 16], [86, 58, 17]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.25, P.y * 0.25, 9 + k) - 0.5) * 8, mat: ORG('#9aa696', '#2e362c', '#f0f8ee'), profile: 'round', bw: r * 0.8, z: 3 + k }))],
  pale_hanging_moss_middle: () => hangingVine([0.62, 0.66, 0.6]), pale_hanging_moss_tip: () => hangingVine([0.62, 0.66, 0.6]),
  firefly_bush: () => [[40, 76, 26], [84, 76, 26], [62, 50, 28]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.2, P.y * 0.2, 9 + k) - 0.5) * 8, mat: ORG('#4a7a2e', '#123a0a', '#e0ffd0'), profile: 'round', bw: r * 0.8, z: 1 + k })),
  firefly_bush_firefly: () => [[44, 40], [86, 54], [64, 84], [30, 70]].map(([x, y]) => ({ d: P => sdCircle(P.x, P.y, x, y, 4), mat: ORG('#f8ff80', '#8a8a00', '#ffffff', { emis: 1 }), profile: 'round', bw: 4, z: 1 })),
  bush: () => [[40, 76, 26], [84, 76, 26], [62, 50, 28]].map(([x, y, r], k) => ({ d: P => sdCircle(P.x, P.y, x, y, r) + (ifbm(P.x * 0.2, P.y * 0.2, 9 + k) - 0.5) * 8, mat: ORG('#4a9a2e', '#123a0a', '#e0ffd0'), profile: 'round', bw: r * 0.8, z: 1 + k })),
  flower_paeonia: () => flowerOn([0.95, 0.7, 0.85], 7), golden_dandelion: () => flowerOn([1, 0.82, 0.15], 9), cactus_flower: () => flowerOn([0.95, 0.45, 0.65], 6),
  red_shrub: () => cross([0.6, 0.15, 0.1], 7, 40), short_dry_grass: () => cross([0.75, 0.62, 0.35], 6, 70), tall_dry_grass: () => cross([0.75, 0.62, 0.35], 8, 20),
  leaf_litter: () => [[40, 50, 0.4], [76, 46, -0.6], [56, 80, 1.2], [88, 82, 0.1], [34, 94, -0.9]].map(([x, y, a], k) => ({ d: P => rotE(P.x, P.y, x, y, 20, 10, a), mat: ORG('#a8742a', '#3e2408', '#ffe0a8', { mottle: 0.3 }), profile: 'round', bw: 5, z: 1 + k })),
  frogspawn: () => Array.from({ length: 18 }, (_, k) => ({ d: P => sdCircle(P.x, P.y, 16 + h2(3, k, 1) * 96, 16 + h2(3, k, 2) * 96, 8), mat: ORG('#c8d8d0', '#4a5a54', '#ffffff', { gloss: 80, spec: 1 }), profile: 'round', bw: 7, z: 1 + k * 0.1, paint: P => [0.78, 0.85, 0.82] })),
  vine_carried: () => [20, 58, 96].map((x0, k) => ({ d: P => Math.min(polyline(P.x, P.y, Array.from({ length: 9 }, (_, j) => [x0 + Math.sin(j * 0.9 + k) * 10, j * 16]), 1.8), ...Array.from({ length: 8 }, (_, j) => rotE(P.x, P.y, x0 + Math.sin((j + 1) * 0.9 + k) * 10 + (j % 2 ? 9 : -9), (j + 1) * 16, 9, 6, j % 2 ? 0.6 : -0.6))), mat: ORG('#4a8a2a', '#123a0a', '#e0ffd0'), profile: 'round', bw: 4, z: 1 + k * 0.3 })),
  carried_waterlily: () => [{ d: P => Math.max(sdCircle(P.x, P.y, 64, 64, 56), -sdPoly(P.x, P.y, [[64, 64], [128, 30], [128, 56]])), mat: ORG('#3e8a2a', '#123a0a', '#e0ffd0'), profile: 'bevel', bw: 4, z: 1 }],
  mangrove_propagule: () => [{ d: P => sdBox(P.x, P.y, 64, 74, 7, 44, 6), mat: ORG('#6a9a3a', '#1e3a0a', '#e0ffd0'), profile: 'round', bw: 6, z: 1 }, { d: P => Math.min(rotE(P.x, P.y, 50, 30, 16, 7, 0.6), rotE(P.x, P.y, 78, 30, 16, 7, -0.6)), mat: ORG('#4a9a2e', '#123a0a', '#e0ffd0'), profile: 'round', bw: 5, z: 2 }],
  mangrove_propagule_hanging: () => [{ d: P => sdBox(P.x, P.y, 64, 54, 7, 44, 6), mat: ORG('#6a9a3a', '#1e3a0a', '#e0ffd0'), profile: 'round', bw: 6, z: 1 }],
});

// ---------------------------------------------------------------- build
if (VARG && require.main === module) {
  const HANDMADE = path.join(__dirname, '.handmade.json'), listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
  const previewDir = (process.argv.find(a => a.startsWith('--preview=')) || '').split('=')[1], previews = [];
  const exts = n => ['png', 'tga'].filter(e => fs.existsSync(path.join(VB, `${n}.${e}`)));
  let n = 0, missing = [];
  const put = (name, t) => {
    const e = exts(name); if (!e.length) { missing.push(name); return; }
    if (listed.has('blocks/' + name)) return;
    let cut = false; for (let i = 0; i < N * N; i++) if (t.a[i] < 1) { cut = true; break; }
    if (e.includes('tga')) g.save(t, name, { tga: true });
    if (e.includes('png')) g.save(t, name, { alpha: cut, pbr: !e.includes('tga') });
    listed.add('blocks/' + name); n++; previews.push(texToRGBA(t));
  };
  Object.entries(BLOCK).forEach(([name, fn], k) => { if (!exts(name).length) { missing.push(name); return; } put(name, fn(16000 + k * 37).bake(ST.light)); });
  Object.entries(SPRITES).forEach(([name, fn], k) => { if (!exts(name).length) { missing.push(name); return; } put(name, spriteTex(name, fn(), 2400 + k * 11)); });
  fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
  if (previewDir) { fs.mkdirSync(previewDir, { recursive: true }); b2.grid(path.join(previewDir, 'batch9_blocks.png'), previews, 16); }
  console.log(`Batch 9: ${n} blocks redesigned.` + (missing.length ? ` Not in vanilla (skipped): ${missing.join(' ')}` : ''));
}
module.exports = { BLOCK, SPRITES };
