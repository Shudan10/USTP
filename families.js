'use strict';
// USTP block families: redesigns whole colour / wood / copper families with gen.js's generators,
// taking each variant's colour from the vanilla texture so every dye and wood keeps its identity.
// Run after gen.js:  node families.js <bedrock-samples/resource_pack>
const fs = require('fs'), path = require('path');
const { readImage } = require('./imageio');
const g = require('./gen.js');
const { N, Tex, S, G, grad, mul, mix, tint, clamp, sstep, fbm, h2, worley, edgeDist, save, made } = g;

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(path.join(SRC, 'textures', 'blocks'))) {
  console.error('Usage: node families.js <path to Mojang bedrock-samples/resource_pack>');
  process.exit(1);
}
const VB = path.join(SRC, 'textures', 'blocks');
const exts = name => ['png', 'tga'].filter(e => fs.existsSync(path.join(VB, `${name}.${e}`)));

// mean colour of a vanilla texture's visible pixels (first frame), and how saturated it is
function vanilla(name) {
  const e = exts(name);
  if (!e.length) return null;
  const im = readImage(path.join(VB, `${name}.${e[0]}`)), n = im.w * Math.min(im.w, im.h);
  let r = 0, gg = 0, b = 0, k = 0;
  for (let i = 0; i < n; i++) if (im.data[i * 4 + 3] > 127) { r += im.data[i * 4]; gg += im.data[i * 4 + 1]; b += im.data[i * 4 + 2]; k++; }
  const c = [r / k / 255, gg / k / 255, b / k / 255];
  return { c, sat: Math.max(...c) - Math.min(...c), exts: e };
}
// a 4-stop palette around a mean colour
const palFrom = (c, k = [0.55, 0.8, 1, 1.18]) => k.map((s, i) => [i / (k.length - 1), c.map(v => clamp(v * s))]);
// save in whichever formats vanilla uses for this name (some exist as both .png and .tga)
function saveLike(t, name, o = {}) {
  const v = exts(name);
  if (!v.length) return false;
  if (v.includes('tga')) save(t, name, { ...o, tga: true });
  if (v.includes('png')) save(t, name, { ...o, alpha: o.alpha || o.cutout, tga: false, pbr: v.includes('tga') ? false : o.pbr });
  return true;
}

const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'silver', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const count0 = made.length;

// ---------------------------------------------------------------- dyed families
function wool(s, c) { // tight basket-weave fabric with soft fuzz
  const t = new Tex();
  return t.each((x, y, i) => {
    const horiz = ((x >> 2) + (y >> 2)) % 2 === 0, local = horiz ? (y % 4 + 0.5) / 4 : (x % 4 + 0.5) / 4;
    const thread = Math.sin(Math.PI * local), fuzz = fbm(x, y, 16, 16, 3, s) - 0.5, ply = Math.sin((horiz ? x : y) * 1.6) * 0.04;
    t.col(i, mul(c, 0.72 + 0.3 * thread + fuzz * 0.12 + ply)); t.h[i] = 0.35 + 0.35 * thread; t.r[i] = 0.97;
  }).bake(0.35, 0.4);
}
function terracotta(s, c) { // fired clay: smooth matte with soft mottling and faint kiln strata
  const t = new Tex();
  return t.each((x, y, i) => {
    const n = fbm(x, y, 3, 3, 4, s), st = Math.sin(Math.PI * 2 * (y / N * 3 + (fbm(x, y, 2, 2, 2, s + 1) - 0.5) * 0.4)) * 0.025;
    t.col(i, mul(c, 0.92 + (n - 0.5) * 0.16 + st + (h2(s, x, y) - 0.5) * 0.03)); t.h[i] = 0.5 + (n - 0.5) * 0.15; t.r[i] = 0.9;
  }).bake(0.25, 0.3);
}
function powder(s, c) { // loose concrete powder: fine grain with small clumps
  const t = new Tex();
  return t.each((x, y, i) => {
    const clump = worley(x, y, 24, s), n = fbm(x, y, 8, 8, 3, s + 1), gr = h2(s + 2, x, y) - 0.5;
    const k = 0.86 + (n - 0.5) * 0.18 + gr * 0.22 + (clump.f1 < 0.25 ? 0.06 : 0);
    t.col(i, mul(c, k)); t.h[i] = 0.45 + gr * 0.2 + (clump.f1 < 0.25 ? 0.15 : 0); t.r[i] = 1;
  }).bake(0.3, 0.4);
}
function stainedGlass(s, c) { // tinted pane with a slim light frame and two reflection streaks
  const t = new Tex(), frameC = mix(c, [1, 1, 1], 0.45);
  return t.each((x, y, i) => {
    const d = edgeDist(x, y);
    if (d < 4) { t.col(i, mul(frameC, d < 1 ? 0.7 : d < 3 ? 1.05 : 0.9)); t.a[i] = 1; t.h[i] = d === 1 || d === 2 ? 0.85 : 0.4; t.r[i] = 0.15; return; }
    const u = x + y, streak = (u > 30 && u < 33 && x < 34) || (u > 40 && u < 42 && x < 44);
    t.col(i, streak ? mix(c, [1, 1, 1], 0.7) : c); t.a[i] = streak ? 0.75 : 0.5; t.h[i] = 0.5; t.r[i] = 0.04;
  });
}
for (const dye of DYES) {
  const w = vanilla(`wool_colored_${dye}`); if (w) saveLike(wool(S(), w.c), `wool_colored_${dye}`);
  const tc = vanilla(`hardened_clay_stained_${dye}`); if (tc) saveLike(terracotta(S(), tc.c), `hardened_clay_stained_${dye}`);
  const p = vanilla(`concrete_powder_${dye}`); if (p) saveLike(powder(S(), p.c), `concrete_powder_${dye}`);
  const gl = vanilla(`glass_${dye}`); if (gl) saveLike(stainedGlass(S(), gl.c), `glass_${dye}`, { alpha: true });
}
{ const v = vanilla('hardened_clay'); if (v) saveLike(terracotta(S(), v.c), 'hardened_clay'); }

// ---------------------------------------------------------------- woods
function stripped(s, pal) { // bark-free log side: long vertical grain, faint growth bands
  const t = new Tex();
  return t.each((x, y, i) => {
    const grain = fbm(x, y, 20, 2, 4, s), band = Math.sin(Math.PI * 2 * (x / N * 6 + fbm(x, y, 3, 2, 2, s + 1) * 0.8)) * 0.05;
    t.col(i, grad(pal, 0.3 + grain * 0.55 + band)); t.h[i] = 0.5 + (grain - 0.5) * 0.3; t.r[i] = 0.75;
  }).bake(0.45);
}
const WOODS = [
  { planks: 'planks_acacia', side: 'log_acacia', top: 'log_acacia_top', ss: 'stripped_acacia_log', st: 'stripped_acacia_log_top' },
  { planks: 'planks_jungle', side: 'log_jungle', top: 'log_jungle_top', ss: 'stripped_jungle_log', st: 'stripped_jungle_log_top' },
  { planks: 'mangrove_planks', side: 'mangrove_log_side', top: 'mangrove_log_top', ss: 'stripped_mangrove_log_side', st: 'stripped_mangrove_log_top' },
  { planks: 'cherry_planks', side: 'cherry_log_side', top: 'cherry_log_top', ss: 'stripped_cherry_log_side', st: 'stripped_cherry_log_top' },
  { planks: 'pale_oak_planks', side: 'pale_oak_log_side', top: 'pale_oak_log_top', ss: 'stripped_pale_oak_log_side', st: 'stripped_pale_oak_log_top' },
  { planks: 'poplar_planks', side: 'poplar_log_side', top: 'poplar_log_top', ss: 'stripped_poplar_log_side', st: 'stripped_poplar_log_top' },
  // hand-made in gen.js already; only their stripped logs are new
  { planks: 'planks_oak', ss: 'stripped_oak_log', st: 'stripped_oak_log_top' },
  { planks: 'planks_spruce', ss: 'stripped_spruce_log', st: 'stripped_spruce_log_top' },
  { planks: 'planks_birch', ss: 'stripped_birch_log', st: 'stripped_birch_log_top' },
  { planks: 'planks_big_oak', ss: 'stripped_dark_oak_log', st: 'stripped_dark_oak_log_top' },
];
for (const w of WOODS) {
  const pv = vanilla(w.planks); if (!pv) continue;
  const plankP = palFrom(pv.c, [0.62, 0.82, 1, 1.15]);
  if (w.side) {
    saveLike(g.planks(new Tex(), S(), plankP).bake(0.6), w.planks);
    const bv = vanilla(w.side), barkP = palFrom(bv ? bv.c : mul(pv.c, 0.6), [0.45, 0.7, 0.95, 1.15]);
    saveLike(g.logSide(new Tex(), S(), barkP, false).bake(0.6), w.side);
    saveLike(g.logTop(new Tex(), S(), barkP, plankP, false).bake(0.4), w.top);
  }
  const sv = vanilla(w.ss), strP = palFrom(sv ? sv.c : pv.c, [0.7, 0.88, 1.02, 1.15]);
  saveLike(stripped(S(), strP), w.ss);
  saveLike(g.logTop(new Tex(), S(), palFrom(sv ? sv.c : pv.c, [0.55, 0.72, 0.85, 0.95]), plankP, false).bake(0.4), w.st);
}

// leaves: greyscale when vanilla tints them by biome, otherwise matched to vanilla's own colour
const LEAVES = [['leaves_acacia', 'oak'], ['leaves_jungle', 'big_oak'], ['mangrove_leaves', 'oak'], ['cherry_leaves', 'oak'],
  ['pale_oak_leaves', 'oak'], ['azalea_leaves', 'big_oak'], ['orange_poplar_leaves', 'oak'], ['red_poplar_leaves', 'oak'], ['yellow_poplar_leaves', 'oak']];
function meanOf(t) { let r = 0, gg = 0, b = 0, k = 0; for (let i = 0; i < N * N; i++) if (t.a[i] > 0.5) { r += t.c[i * 3]; gg += t.c[i * 3 + 1]; b += t.c[i * 3 + 2]; k++; } return [r / k, gg / k, b / k]; }
for (const [name, kind] of LEAVES) {
  const v = vanilla(name); if (!v) continue;
  const base = g.leaves(S(), kind), m = meanOf(base);
  const colourTo = (t, target) => { const f = target.map((c, k) => c / m[k]); t.each((x, y, i) => t.col(i, tint(t.get(i), f))); return t; };
  const main = v.sat < 0.08 ? base : colourTo(base.clone(), v.c);
  saveLike(main, name, { cutout: true });
  const op = main.clone(); op.each((x, y, i) => { if (op.a[i] === 0) { op.col(i, mul(op.get(i), 0.4)); op.a[i] = 1; } });
  saveLike(op, name + '_opaque', { pbr: false });
  const cv = vanilla(name + '_carried'); if (cv) saveLike(colourTo(base.clone(), cv.c), name + '_carried', { pbr: false, cutout: true });
}

// ---------------------------------------------------------------- copper oxidation stages
const COPPER = [['exposed', 0.8, 0.42], ['weathered', 0.5, 0.58], ['oxidized', 0.2, 0.72]];
for (const [stage, metal, rough] of COPPER) {
  const v = vanilla(`${stage}_copper`); if (!v) continue;
  const pal = palFrom(v.c, [0.45, 0.85, 1.05, 1.3]);
  saveLike(g.metalPanel(new Tex(), S(), pal, { metal, rough }).bake(0.5), `${stage}_copper`);
  const cut = vanilla(`${stage}_cut_copper`); if (cut) saveLike(g.metalPanel(new Tex(), S(), palFrom(cut.c, [0.45, 0.85, 1.05, 1.3]), { tile: 32, metal, rough }).bake(0.5), `${stage}_cut_copper`);
}
{ const v = vanilla('cut_copper'); if (v) saveLike(g.metalPanel(new Tex(), S(), palFrom(v.c, [0.45, 0.85, 1.05, 1.3]), { tile: 32, rough: 0.32 }).bake(0.5), 'cut_copper'); }
for (const stage of ['', 'exposed_', 'weathered_', 'oxidized_']) { // chiseled: one panel with a recessed ring
  const v = vanilla(`${stage}chiseled_copper`); if (!v) continue;
  const t = g.metalPanel(new Tex(), S(), palFrom(v.c, [0.45, 0.85, 1.05, 1.3]), { tile: 128, metal: stage ? 0.5 : 1, rough: stage ? 0.6 : 0.3 });
  t.each((x, y, i) => {
    const d = Math.hypot(x - 63.5, y - 63.5), e = edgeDist(x, y);
    if ((d > 30 && d < 35) || (e >= 14 && e < 16)) { t.col(i, mul(t.get(i), 0.55)); t.h[i] = 0.2; } else if (d <= 30) t.h[i] = 0.85;
  });
  saveLike(t.bake(0.6), `${stage}chiseled_copper`);
}

// ---------------------------------------------------------------- hand-made list for remaster.js
const HANDMADE = path.join(__dirname, '.handmade.json');
const listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
for (const m of made.slice(count0)) listed.add('blocks/' + m.name);
fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
console.log(`Redesigned ${new Set(made.slice(count0).map(m => m.name)).size} family textures.`);
