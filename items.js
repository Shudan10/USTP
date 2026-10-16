'use strict';
// USTP modern equipment: renders swords, tools, spears and armor as 128x icons with real lighting —
// signed-distance shapes, bevelled height fields, chrome-style environment reflections and gem facets.
// Writes colour + MERS + texture set into USTP/textures/items. Run after gen.js, before remaster.js.
//   node items.js [--sheet=<file.png>]
const fs = require('fs'), path = require('path');
const { pngBuf, writeFile } = require('./imageio');

const N = 128, SS = 3, M = N * SS;
const OUT = path.join(__dirname, 'USTP', 'textures', 'items');
const SHEET = (process.argv.find(a => a.startsWith('--sheet=')) || '').split('=')[1];

// ---------------------------------------------------------------- math
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
function h2(s, x, y) {
  let h = Math.imul(s | 0, 0x9E3779B1) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul((y | 0) + 0x5bd1, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vn(x, y, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y); let tx = x - x0, ty = y - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  return lerp(lerp(h2(s, x0, y0), h2(s, x0 + 1, y0), tx), lerp(h2(s, x0, y0 + 1), h2(s, x0 + 1, y0 + 1), tx), ty);
}
const fbm = (x, y, s) => (vn(x, y, s) + 0.5 * vn(x * 2, y * 2, s + 1) + 0.25 * vn(x * 4, y * 4, s + 2)) / 1.75;
function cell(x, y, k, s) { // voronoi cell id + edge distance, for gem facets and chainmail
  const cx = Math.floor(x / k), cy = Math.floor(y / k); let f1 = 1e9, f2 = 1e9, id = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const gx = cx + dx, gy = cy + dy, px = (gx + h2(s, gx, gy)) * k, py = (gy + h2(s + 9, gx, gy)) * k, d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = gx * 7919 + gy; } else if (d < f2) f2 = d;
  }
  return { id, edge: f2 - f1 };
}

// ---------------------------------------------------------------- signed distance shapes
const sdCircle = (x, y, cx, cy, r) => Math.hypot(x - cx, y - cy) - r;
const sdEllipse = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
const sdBox = (x, y, cx, cy, hx, hy, r = 0) => {
  const dx = Math.abs(x - cx) - hx + r, dy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r;
};
const sdSeg = (x, y, ax, ay, bx, by, r) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay, t = clamp((px * dx + py * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - dx * t, py - dy * t) - r;
};
function sdPoly(x, y, P) {
  let d = (x - P[0][0]) ** 2 + (y - P[0][1]) ** 2, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i, i++) {
    const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1], wx = x - P[i][0], wy = y - P[i][1];
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey)), bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = y >= P[i][1], c2 = y < P[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
const mirror = P => P.map(([x, y]) => [128 - x, y]).reverse();

// ---------------------------------------------------------------- materials
const MAT = {
  wood: { kind: 'wood', base: '#a57444', dark: '#4a2c14', light: '#e2b57c', metal: 0, rough: 0.7 },
  stone: { kind: 'stone', base: '#8e9195', dark: '#3f4246', light: '#d2d5d9', metal: 0, rough: 0.8 },
  copper: { kind: 'metal', base: '#d27a4b', dark: '#5a2810', light: '#ffd7b4', metal: 1, rough: 0.32 },
  iron: { kind: 'metal', base: '#b8c0c8', dark: '#3e454d', light: '#ffffff', metal: 1, rough: 0.2 },
  gold: { kind: 'metal', base: '#f0bd34', dark: '#6e4504', light: '#fff4b8', metal: 1, rough: 0.16 },
  diamond: { kind: 'gem', base: '#3fdbe4', dark: '#085a6c', light: '#f0ffff', metal: 0, rough: 0.05, emis: 0.1, glow: '#8ff8ff' },
  netherite: { kind: 'metal', base: '#5a5257', dark: '#121012', light: '#e2cfd9', metal: 1, rough: 0.28, sheen: '#8a3a3a', glow: '#ff6a26' },
  ember: { kind: 'gem', base: '#ff6a1f', dark: '#5a1000', light: '#fff0c0', metal: 0, rough: 0.1, emis: 0.9 },
  chainmail: { kind: 'chain', base: '#aeb4ba', dark: '#2e3237', light: '#f4f7fa', metal: 1, rough: 0.34 },
  steel: { kind: 'metal', base: '#6d7279', dark: '#1e2125', light: '#dfe4ea', metal: 1, rough: 0.3 },
  leather: { kind: 'leather', base: '#4a3324', dark: '#1c120b', light: '#9a7558', metal: 0, rough: 0.75 },
  carbon: { kind: 'leather', base: '#2e2c2b', dark: '#0c0b0b', light: '#7c7a78', metal: 0, rough: 0.55 },
  glass: { kind: 'visor', base: '#1d2a36', dark: '#05080c', light: '#9fd8ff', metal: 0, rough: 0.04 },
  rubber: { kind: 'leather', base: '#26221f', dark: '#0a0908', light: '#5d5752', metal: 0, rough: 0.9 },
};
// colours given as '#rrggbb' become [r, g, b]; used for MAT and for inline materials
function mk(m) { for (const k of ['base', 'dark', 'light', 'sheen', 'glow']) if (typeof m[k] === 'string') m[k] = hex(m[k]); return m; }
for (const m of Object.values(MAT)) mk(m);
const matOf = p => (typeof p.mat === 'string' ? MAT[p.mat] : p.mat);

const L = norm([-0.55, -0.62, 0.56]), HV = norm([L[0], L[1], L[2] + 1]);
// reflected-environment brightness: bright sky, dark horizon band, mid ground — the "chrome" read
const env = t => (t < 0 ? lerp(1.0, 0.28, sstep(-0.55, 0, t)) : lerp(0.28, 0.58, sstep(0, 0.14, t)) - t * 0.12);

function shade(mat, P, n, part, edge, seed) {
  const diff = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]), nh = Math.max(0, n[0] * HV[0] + n[1] * HV[1] + n[2] * HV[2]);
  const ry = 2 * n[2] * n[1], rx = 2 * n[2] * n[0];
  let c, metal = mat.metal, rough = mat.rough, emis = 0;
  if (mat.kind === 'metal' || mat.kind === 'chain') {
    const aniso = part.axis === 'u' ? (fbm(P.u * 0.08, P.v * 2.2, seed) - 0.5) * 0.35 : (fbm(P.x * 0.05, P.y * 0.05, seed) - 0.5) * 0.18;
    const e = env(ry * 0.85 + (P.y - 60) / 128 * 0.9 - rx * 0.25 + aniso);
    c = add(scale(mix(mat.dark, mat.base, 0.2 + 0.5 * diff), 0.4), mix(mat.base, mat.light, 0.25), e * 0.85);
    if (mat.sheen) c = add(c, mat.sheen, 0.12 * (1 - e));
    c = add(c, mat.light, Math.pow(nh, 60) * 1.1 + (edge ? 0.25 : 0));
    rough += aniso * 0.1;
    if (mat.kind === 'chain') {
      const row = Math.floor(P.y / 4), cx = (Math.floor(P.x / 5 + (row % 2) * 0.5) + 0.5 - (row % 2) * 0.5) * 5, ring = Math.abs(Math.hypot(P.x - cx, P.y - (row + 0.5) * 4) - 2.1);
      if (ring > 0.75) c = scale(c, 0.22); else c = add(c, mat.light, (0.75 - ring) * 0.35);
    }
  } else if (mat.kind === 'gem') {
    const f = cell(P.x, P.y, 15, seed + 5), tilt = [(h2(seed, f.id, 1) - 0.5) * 0.5, (h2(seed, f.id, 2) - 0.5) * 0.5];
    const g = norm([n[0] + tilt[0], n[1] + tilt[1], n[2]]), d2 = Math.max(0, g[0] * L[0] + g[1] * L[1] + g[2] * L[2]);
    const sp = Math.pow(Math.max(0, g[0] * HV[0] + g[1] * HV[1] + g[2] * HV[2]), 40);
    c = mix(mat.dark, mat.base, 0.25 + 0.75 * d2);
    c = add(c, mat.light, sp * 1.2 + (f.edge < 0.45 ? 0.08 : 0) + (edge ? 0.3 : 0));
    emis = mat.emis * (0.5 + d2);
  } else if (mat.kind === 'visor') {
    const e = env(ry * 0.8 + (P.y - 60) / 60);
    c = add(mix(mat.dark, mat.base, 0.5), mat.light, e * 0.45 + Math.pow(nh, 30));
  } else if (mat.kind === 'organic') {
    const base = part.paint ? part.paint(P) : mat.base, wrapL = clamp((n[0] * L[0] + n[1] * L[1] + n[2] * L[2] + 0.35) / 1.35);
    const t = (fbm(P.x * (mat.grain || 0.5), P.y * (mat.grain || 0.5), seed) - 0.5) * (mat.mottle ?? 0.25);
    c = scale(mix(mat.dark, base, clamp(0.25 + 0.75 * wrapL + t)), 0.55 + 0.6 * wrapL);
    c = add(c, mat.light, Math.pow(nh, mat.gloss || 20) * (mat.spec ?? 0.35) + (edge ? 0.1 : 0));
    emis = (mat.emis || 0) * (0.6 + 0.4 * wrapL);
  } else { // wood, stone, leather: matte with grain
    let t;
    if (mat.kind === 'wood') t = fbm(part.axis === 'u' ? P.u * 0.06 : P.x * 0.6, part.axis === 'u' ? P.v * 1.3 : P.y * 0.06, seed) * 0.8 + 0.1;
    else if (mat.kind === 'stone') t = fbm(P.x * 0.35, P.y * 0.35, seed) * 0.7 + (h2(seed, P.x * 3 | 0, P.y * 3 | 0) - 0.5) * 0.15 + 0.15;
    else t = 0.55 + (fbm(P.x * 0.8, P.y * 0.8, seed) - 0.5) * 0.25;
    c = scale(mix(mat.dark, mat.base, clamp(t * 1.3)), 0.42 + 0.78 * diff);
    c = add(c, mat.light, Math.pow(nh, 24) * (mat.kind === 'leather' ? 0.25 : 0.12) + (edge ? 0.12 : 0));
  }
  return { c, metal, rough: clamp(rough, 0.02, 1), emis };
}

// ---------------------------------------------------------------- renderer
const PROFILE = {
  ridge: (k, p) => Math.min(k, p.bw || 7) * 0.55,
  bevel: (k, p) => sstep(0, p.bw || 2.5, k) * (p.bw || 2.5) * 0.8,
  round: (k, p) => { const r = p.bw || 4, q = Math.min(k, r); return Math.sqrt(Math.max(0, r * r - (r - q) * (r - q))); },
};
// style: 'modern' (soft light, thin rim) · 'realistic' (surface detail, softer rim) · 'bold' (toon bands, saturated, thick outline)
function render(name, parts, seed, opts = {}) {
  const style = opts.style || 'modern';
  const n = M * M, glow = new Uint8Array(n), layer = new Int16Array(n).fill(-1), H = new Float32Array(n), K = new Float32Array(n), dark = new Float32Array(n), edgeF = new Uint8Array(n);
  for (let sy = 0; sy < M; sy++) for (let sx = 0; sx < M; sx++) {
    const x = (sx + 0.5) / SS, y = (sy + 0.5) / SS, P = { x, y, u: ((x - 64) - (y - 64)) / Math.SQRT2, v: ((x - 64) + (y - 64)) / Math.SQRT2 };
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k], d = p.d(P);
      if (d >= 0) continue;
      const i = sy * M + sx; layer[i] = k; K[i] = -d;
      let h = (p.z || 2) + PROFILE[p.profile || 'bevel'](-d, p);
      if (p.form) h += p.form(P);
      if (p.deco) { const r = p.deco(P, -d); if (r) { h += r.dh || 0; dark[i] = r.dark || 0; edgeF[i] = r.edge ? 1 : 0; if (r.seam && matOf(p).glow) glow[i] = 1; } }
      if (p.edgeBand && -d < p.edgeBand) edgeF[i] = 1;
      H[i] = h; break;
    }
  }
  const col = new Float32Array(n * 3), mer = new Float32Array(n * 3);
  for (let sy = 0; sy < M; sy++) for (let sx = 0; sx < M; sx++) {
    const i = sy * M + sx; if (layer[i] < 0) continue;
    const hAt = (x, y) => (x < 0 || y < 0 || x >= M || y >= M || layer[y * M + x] < 0 ? 0 : H[y * M + x]);
    const gx = (hAt(sx + 1, sy) - hAt(sx - 1, sy)) * SS / 2, gy = (hAt(sx, sy + 1) - hAt(sx, sy - 1)) * SS / 2;
    const nrm = norm([-gx * 0.6, -gy * 0.6, 1]), p = parts[layer[i]];
    const x = (sx + 0.5) / SS, y = (sy + 0.5) / SS, P = { x, y, u: ((x - 64) - (y - 64)) / Math.SQRT2, v: ((x - 64) + (y - 64)) / Math.SQRT2 };
    const mat = matOf(p), s = shade(mat, P, nrm, p, edgeF[i], seed + layer[i] * 101);
    if (style === 'realistic') { // richer surface detail, slightly muted natural colour
      s.c = scale(s.c, 1 + (fbm(P.x * 0.45, P.y * 0.45, seed + 77) - 0.5) * 0.35 + (fbm(P.x * 1.6, P.y * 1.6, seed + 79) - 0.5) * 0.18 + (h2(seed + 78, sx, sy) - 0.5) * 0.08);
      const l = 0.299 * s.c[0] + 0.587 * s.c[1] + 0.114 * s.c[2]; s.c = s.c.map(v => l + (v - l) * 0.85);
    }
    if (style === 'bold') { // cel shading: quantise brightness against the material's base colour, then push saturation
      const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], b = p.paint ? p.paint(P) : mat.base, r = lum(s.c) / Math.max(0.04, lum(b));
      const band = r > 1.35 ? 1.45 : r > 0.95 ? 1.1 : r > 0.62 ? 0.82 : 0.55, q = scale(b, band), L2 = lum(q);
      s.c = [L2 + (q[0] - L2) * 1.35, L2 + (q[1] - L2) * 1.35, L2 + (q[2] - L2) * 1.35];
    }
    if (glow[i]) { s.c = mat.glow; s.emis = 1; s.metal = 0; dark[i] = 0; }
    const k = 1 - dark[i];
    col[i * 3] = s.c[0] * k; col[i * 3 + 1] = s.c[1] * k; col[i * 3 + 2] = s.c[2] * k;
    mer[i * 3] = s.metal; mer[i * 3 + 1] = s.emis; mer[i * 3 + 2] = s.rough;
  }
  // downsample to 128 with hard cutout alpha (held items are extruded from the alpha mask)
  const rgba = new Uint8Array(N * N * 4), mers = new Uint8Array(N * N * 4), cover = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let r = 0, g = 0, b = 0, a = 0, m0 = 0, m1 = 0, m2 = 0;
    for (let j = 0; j < SS; j++) for (let k = 0; k < SS; k++) {
      const i = (y * SS + j) * M + x * SS + k; if (layer[i] < 0) continue;
      a++; r += col[i * 3]; g += col[i * 3 + 1]; b += col[i * 3 + 2]; m0 += mer[i * 3]; m1 += mer[i * 3 + 1]; m2 += mer[i * 3 + 2];
    }
    const o = (y * N + x) * 4; cover[y * N + x] = a / (SS * SS);
    if (a * 2 < SS * SS) continue;
    rgba[o] = Math.round(clamp(r / a) * 255); rgba[o + 1] = Math.round(clamp(g / a) * 255); rgba[o + 2] = Math.round(clamp(b / a) * 255); rgba[o + 3] = 255;
    mers[o] = Math.round(m0 / a * 255); mers[o + 1] = Math.round(m1 / a * 255); mers[o + 2] = Math.round(m2 / a * 255); mers[o + 3] = 255;
  }
  // dark rim on the silhouette so icons read at small sizes (thick ink line for the bold style)
  const rimW = style === 'bold' ? 3 : 1, rimK = style === 'bold' ? 0.12 : style === 'realistic' ? 0.72 : 0.55, solid = rgba.map((v, k) => (k % 4 === 3 ? v : 0));
  const out = (xx, yy) => xx < 0 || yy < 0 || xx >= N || yy >= N || !solid[(yy * N + xx) * 4 + 3];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4; if (!rgba[o + 3]) continue;
    let near = false;
    for (let d = 1; d <= rimW && !near; d++) near = out(x - d, y) || out(x + d, y) || out(x, y - d) || out(x, y + d);
    if (near) for (let c = 0; c < 3; c++) rgba[o + c] = Math.round(rgba[o + c] * rimK);
  }
  if (opts.write === false) return rgba;
  fs.mkdirSync(path.dirname(path.join(OUT, name)), { recursive: true });
  writeFile(path.join(OUT, name + '.png'), pngBuf(N, N, 4, rgba));
  writeFile(path.join(OUT, name + '_mers.png'), pngBuf(N, N, 4, mers));
  const base = path.basename(name);
  writeFile(path.join(OUT, name + '.texture_set.json'), JSON.stringify({ format_version: '1.21.30', 'minecraft:texture_set': { color: base, metalness_emissive_roughness_subsurface: base + '_mers' } }, null, 2));
  made.push({ name, rgba });
  return rgba;
}
const made = [];

// ---------------------------------------------------------------- equipment designs
// Tools are laid out on the icon diagonal: u runs handle (bottom-left) → tip (top-right), v across it.
// Screen position of (u, v) is x = 64 + (u + v)/√2, y = 64 + (v − u)/√2, so heads stay inside v − u > −88.
const handleMat = t => (t === 'wood' ? 'wood' : 'carbon');
const fitting = t => (t === 'wood' || t === 'stone' ? 'steel' : t);   // collars, guards, pommels
const gripWrap = P => { const s = Math.sin(P.u * 1.1 + P.v * 0.8); return { dh: s > 0.55 ? 0.7 : 0, dark: s < -0.6 ? 0.4 : 0 }; };
const seam = (on, glowing = true) => (on ? { dh: -1.4, dark: 0.45, seam: glowing } : null);
const handle = (t, u0, u1, r = 4.4) => [
  { d: P => sdSeg(P.u, P.v, u0, 0, u1, 0, r), mat: handleMat(t), profile: 'round', bw: r, z: 1, axis: 'u' },
  { d: P => sdSeg(P.u, P.v, u0 + 1, 0, u0 + 24, 0, r + 0.7), mat: 'leather', profile: 'round', bw: r + 0.7, z: 1.3, axis: 'u', deco: gripWrap },
  { d: P => sdCircle(P.u, P.v, u0 - 2.5, 0, r + 2.2), mat: fitting(t), profile: 'round', bw: r + 2.2, z: 1.5 },
];

function sword(t) {
  const blade = [[-30, -10], [36, -9], [76, 0], [36, 9], [-30, 10]];
  const guard = [[-41, -25], [-35, -27], [-28, -11], [-28, 11], [-35, 27], [-41, 25], [-37.5, 10], [-37.5, -10]];
  return [
    { d: P => sdSeg(P.u, P.v, -64, 0, -38, 0, 4.8), mat: 'leather', profile: 'round', bw: 4.8, z: 1, axis: 'u', deco: gripWrap },
    { d: P => sdPoly(P.u, P.v, [[-74, 0], [-69, -6.5], [-63, -6.5], [-63, 6.5], [-69, 6.5]]), mat: fitting(t), profile: 'bevel', bw: 2.5, z: 1.5 },
    { d: P => sdPoly(P.u, P.v, blade), mat: t, profile: 'ridge', bw: 10, z: 1, axis: 'u', edgeBand: 1.6,
      deco: P => seam(Math.abs(P.v) < 1.8 && P.u > -26 && P.u < 32) },
    { d: P => sdPoly(P.u, P.v, guard), mat: fitting(t), profile: 'bevel', bw: 2.6, z: 3, deco: P => seam(Math.abs(P.v) < 0.8 && P.u > -37) },
    { d: P => sdPoly(P.u, P.v, [[-37, 0], [-33, -4.5], [-29, 0], [-33, 4.5]]), mat: t === 'netherite' ? 'ember' : t === 'diamond' ? 'diamond' : 'glass', profile: 'round', bw: 3.5, z: 5 },
  ];
}
function pickaxe(t) {
  const arc = v => 38 - v * v / 100, thick = v => 9.5 * (1 - Math.pow(Math.min(1, Math.abs(v) / 56), 1.8)) + 0.9;
  return [
    ...handle(t, -72, 40),
    { d: P => Math.max(Math.abs(P.u - arc(P.v)) - thick(P.v), Math.abs(P.v) - 56), mat: t, profile: 'ridge', bw: 7, z: 2, axis: 'v', edgeBand: 1.4,
      deco: P => seam(Math.abs(P.u - arc(P.v)) < 0.9 && Math.abs(P.v) > 11 && Math.abs(P.v) < 40) },
    { d: P => sdBox(P.u, P.v, 37, 0, 9.5, 9, 2), mat: fitting(t), profile: 'bevel', bw: 2.4, z: 5, deco: P => seam(Math.abs(P.u - 37) < 0.8, false) },
  ];
}
function axe(t) {
  const bladeP = [[20, -6], [34, -6], [36, -17], [50, -30], [46, -40], [34, -46], [16, -46], [4, -38], [18, -17]];   // narrow neck flaring into a crescent edge
  return [
    ...handle(t, -72, 40),
    { d: P => sdPoly(P.u, P.v, bladeP), mat: t, profile: 'bevel', bw: 5, z: 2, axis: 'u',
      deco: P => (P.v < -40 ? { edge: true } : seam(Math.abs(P.v + 26) < 0.8 && P.u > 10 && P.u < 46)) },
    { d: P => sdBox(P.u, P.v, 24, 3, 14, 9, 2.5), mat: fitting(t), profile: 'bevel', bw: 2.4, z: 4.5, deco: P => seam(Math.abs(P.u - 24) < 0.8 && P.v > -3, false) },
  ];
}
function shovel(t) {
  return [
    ...handle(t, -72, 22),
    { d: P => Math.min(sdBox(P.u, P.v, 40, 0, 16, 18, 4), sdCircle(P.u, P.v, 52, 0, 18)), mat: t, profile: 'bevel', bw: 3.5, z: 2, axis: 'u',
      form: P => (Math.abs(P.v) / 18) ** 2 * 3, edgeBand: 1.5, deco: P => seam(Math.abs(P.v) < 0.8 && P.u > 28 && P.u < 58) },
    { d: P => sdBox(P.u, P.v, 22, 0, 7.5, 7.5, 2), mat: fitting(t), profile: 'bevel', bw: 2.4, z: 4.5 },
  ];
}
function hoe(t) {
  const bladeP = [[36, -6], [52, -6], [54, -34], [44, -40], [37, -33]];
  return [
    ...handle(t, -72, 46),
    { d: P => sdPoly(P.u, P.v, bladeP), mat: t, profile: 'bevel', bw: 3.5, z: 2, axis: 'u', deco: P => (P.v < -33 ? { edge: true } : seam(Math.abs(P.u - 45) < 0.8 && P.v < -10)) },
    { d: P => sdBox(P.u, P.v, 44, 0, 9, 8, 2), mat: fitting(t), profile: 'bevel', bw: 2.4, z: 4.5 },
  ];
}
function spear(t) {
  const tip = [[38, -4.5], [48, -12], [64, -8.5], [83, 0], [64, 8.5], [48, 12], [38, 4.5]];
  return [
    { d: P => sdSeg(P.u, P.v, -82, 0, 40, 0, 3.5), mat: handleMat(t), profile: 'round', bw: 3.5, z: 1, axis: 'u' },
    { d: P => sdSeg(P.u, P.v, -40, 0, -18, 0, 4.3), mat: 'leather', profile: 'round', bw: 4.3, z: 1.3, axis: 'u', deco: gripWrap },
    { d: P => sdPoly(P.u, P.v, tip), mat: t, profile: 'ridge', bw: 10, z: 1.5, axis: 'u', edgeBand: 1.4, deco: P => seam(Math.abs(P.v) < 0.9 && P.u > 44 && P.u < 72) },
    { d: P => sdBox(P.u, P.v, 37, 0, 5.5, 5.5, 1.8), mat: fitting(t), profile: 'bevel', bw: 2.2, z: 3.5, deco: P => (Math.sin(P.u * 2.2) > 0.6 ? { dark: 0.3 } : null) },
  ];
}

// Armor: front-facing, sleek segmented plates with a tinted visor for the modern look
function helmet(t) {
  const shell = P => Math.max(Math.min(sdEllipse(P.x, P.y, 64, 60, 46, 45), sdBox(P.x, P.y, 64, 88, 45, 23, 9)), -sdBox(P.x, P.y, 64, 110, 22, 22, 6));
  return [
    { d: shell, mat: t, profile: 'bevel', bw: 4, z: 2, form: P => Math.sqrt(Math.max(0, 1 - ((P.x - 64) / 47) ** 2)) * 7,
      deco: P => {
        if (Math.abs(P.x - 64) < 2.2 && P.y < 56) return { dh: 1.8 };                       // centre crest
        if (P.y > 80 && Math.abs(Math.abs(P.x - 64) - 31) < 0.8) return seam(true);       // cheek plates
        if (P.y < 58 && Math.abs(sdEllipse(P.x, P.y, 64, 60, 39, 38)) < 0.8) return seam(true);
        return null;
      } },
    { d: P => Math.max(sdBox(P.x, P.y, 64, 70, 40, 7.5, 5), -sdBox(P.x, P.y, 64, 81, 8, 4, 2)), mat: 'glass', profile: 'bevel', bw: 2, z: 8 },
  ];
}
function chestplate(t) {
  const torso = [[38, 18], [52, 26], [76, 26], [90, 18], [100, 30], [98, 60], [94, 112], [64, 121], [34, 112], [30, 60], [28, 30]];
  const pad = [[4, 44], [12, 28], [34, 18], [46, 28], [42, 52], [22, 60], [6, 56]];
  return [
    { d: P => Math.max(sdPoly(P.x, P.y, torso), -sdEllipse(P.x, P.y, 64, 20, 15, 11)), mat: t, profile: 'bevel', bw: 4, z: 2,
      form: P => Math.sqrt(Math.max(0, 1 - ((P.x - 64) / 40) ** 2)) * 8,
      deco: P => {
        if (Math.abs(P.x - 64) < 0.8 && P.y > 34) return seam(true);
        if (Math.abs(P.y - (62 + Math.abs(P.x - 64) * 0.28)) < 0.8) return seam(true);
        for (const yy of [80, 94, 107]) if (Math.abs(P.y - yy) < 0.7 && Math.abs(P.x - 64) < 24) return seam(false);
        return null;
      } },
    { d: P => Math.min(sdPoly(P.x, P.y, pad), sdPoly(P.x, P.y, mirror(pad))), mat: t, profile: 'bevel', bw: 5, z: 5,
      form: P => { const cx = P.x < 64 ? 25 : 103; return Math.sqrt(Math.max(0, 1 - Math.hypot(P.x - cx, P.y - 40) / 24)) * 5; },
      deco: P => seam(Math.abs(P.y - (44 - Math.abs(P.x - 64) * 0.12)) < 0.7, false) },
    { d: P => sdCircle(P.x, P.y, 64, 50, 6), mat: t === 'diamond' ? 'diamond' : t === 'netherite' ? 'ember' : 'glass', profile: 'round', bw: 6, z: 11 },
  ];
}
function leggings(t) {
  const legL = [[30, 32], [62, 32], [60, 119], [35, 119]];
  return [
    { d: P => sdBox(P.x, P.y, 64, 25, 37, 9.5, 3), mat: t, profile: 'bevel', bw: 3, z: 3, deco: P => seam(Math.abs(P.y - 25) < 0.7) },
    { d: P => Math.min(sdPoly(P.x, P.y, legL), sdPoly(P.x, P.y, mirror(legL))), mat: t, profile: 'bevel', bw: 4, z: 2,
      form: P => { const cx = P.x < 64 ? 47 : 81; return Math.sqrt(Math.max(0, 1 - ((P.x - cx) / 16) ** 2)) * 6; },
      deco: P => seam(Math.abs(P.y - 58) < 0.7 || Math.abs(P.y - 101) < 0.7, false) },
    { d: P => Math.min(sdBox(P.x, P.y, 48, 79, 11, 9, 4), sdBox(P.x, P.y, 80, 79, 11, 9, 4)), mat: t, profile: 'bevel', bw: 4, z: 6,
      deco: P => seam(Math.abs(P.y - 79) < 0.7) },
  ];
}
function boots(t) {
  const left = [[22, 28], [54, 28], [54, 84], [58, 106], [10, 106], [8, 96], [22, 84]];
  const right = left.map(([x, y]) => [x + 56, y]);
  const footShape = P => Math.min(sdPoly(P.x, P.y, left), sdPoly(P.x, P.y, right));
  return [
    { d: footShape, mat: t, profile: 'bevel', bw: 4, z: 2,
      form: P => { const cx = P.x < 64 ? 38 : 94; return P.y < 84 ? Math.sqrt(Math.max(0, 1 - ((P.x - cx) / 17) ** 2)) * 6 : 2; },
      deco: P => seam(Math.abs(P.y - 50) < 0.7 || Math.abs(P.y - 84) < 0.7) },
    { d: P => Math.min(sdEllipse(P.x, P.y, 22, 95, 13, 8), sdEllipse(P.x, P.y, 78, 95, 13, 8)), mat: t, profile: 'round', bw: 6, z: 4 },
    { d: P => Math.max(footShape(P), 101 - P.y), mat: 'rubber', profile: 'bevel', bw: 1.5, z: 3 },
  ];
}

function main() {
const TIERS = ['wood', 'stone', 'copper', 'iron', 'gold', 'diamond', 'netherite'];
const ARMOR = ['chainmail', 'copper', 'iron', 'gold', 'diamond', 'netherite'];
let seed = 1;
for (const t of TIERS) {
  render(`${t}_sword`, sword(t), seed++ * 977);
  render(`${t}_pickaxe`, pickaxe(t), seed++ * 977);
  render(`${t}_axe`, axe(t), seed++ * 977);
  render(`${t}_shovel`, shovel(t), seed++ * 977);
  render(`${t}_hoe`, hoe(t), seed++ * 977);
  render(`spear/${t}_spear`, spear(t), seed++ * 977);
}
for (const t of ARMOR) {
  render(`${t}_helmet`, helmet(t), seed++ * 977);
  render(`${t}_chestplate`, chestplate(t), seed++ * 977);
  render(`${t}_leggings`, leggings(t), seed++ * 977);
  render(`${t}_boots`, boots(t), seed++ * 977);
}

if (SHEET) {
  const cols = 10, rows = Math.ceil(made.length / cols), W = cols * N, H = rows * N, px = new Uint8Array(W * H * 3);
  made.forEach(({ rgba }, k) => {
    const ox = (k % cols) * N, oy = Math.floor(k / cols) * N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const s = (y * N + x) * 4, a = rgba[s + 3] / 255, bg = ((x >> 3) + (y >> 3)) & 1 ? 70 : 55, d = ((oy + y) * W + ox + x) * 3;
      for (let c = 0; c < 3; c++) px[d + c] = Math.round(rgba[s + c] * a + bg * (1 - a));
    }
  });
  fs.writeFileSync(SHEET, pngBuf(W, H, 3, px));
}
// tell remaster.js to leave these icons alone (gen.js starts the list)
const HANDMADE = path.join(__dirname, '.handmade.json');
const listed = new Set(fs.existsSync(HANDMADE) ? JSON.parse(fs.readFileSync(HANDMADE, 'utf8')) : []);
for (const m of made) listed.add('items/' + m.name);
fs.writeFileSync(HANDMADE, JSON.stringify([...listed], null, 1));
console.log(`Rendered ${made.length} modern equipment icons.`);
}

if (require.main === module) main();
module.exports = { N, render, mk, MAT, made, sdCircle, sdEllipse, sdBox, sdSeg, sdPoly, mirror, cell, fbm, h2, hex, mix, clamp, sstep };
