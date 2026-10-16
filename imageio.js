'use strict';
// Minimal PNG/TGA reading and writing shared by remaster.js and pack.js (no dependencies).
const fs = require('fs'), path = require('path'), zlib = require('zlib');

// ---------------------------------------------------------------- decoders
function unfilter(l, p, f, bpp) {
  for (let i = 0; i < l.length; i++) {
    const a = i >= bpp ? l[i - bpp] : 0, b = p[i], c = i >= bpp ? p[i - bpp] : 0;
    let x = l[i];
    if (f === 1) x += a; else if (f === 2) x += b; else if (f === 3) x += (a + b) >> 1;
    else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); x += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    l[i] = x & 255;
  }
}
function readPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, w, h, bd, ct, il, pal = null, trns = null; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len); p += 12 + len;
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') pal = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = Math.max(1, (ch * bd) >> 3);
  const out = new Uint8Array(w * h * 4), maxv = (1 << Math.min(bd, 8)) - 1;
  const passes = il ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let off = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx), ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil(pw * ch * bd / 8); let prev = Buffer.alloc(stride);
    for (let r = 0; r < ph; r++) {
      const f = raw[off], line = Buffer.from(raw.subarray(off + 1, off + 1 + stride)); off += 1 + stride;
      unfilter(line, prev, f, bpp); prev = line;
      const val = (c, k) => {
        const n = c * ch + k;
        if (bd === 8) return line[n]; if (bd === 16) return line[n * 2];
        const bit = n * bd; return (line[bit >> 3] >> (8 - bd - (bit & 7))) & maxv;
      };
      for (let c = 0; c < pw; c++) {
        const o = ((y0 + r * dy) * w + x0 + c * dx) * 4; let R, G, B, A = 255;
        if (ct === 0) { const v = val(c, 0); R = G = B = bd < 8 ? Math.round(v * 255 / maxv) : v; if (trns && bd <= 8 && v === trns.readUInt16BE(0)) A = 0; }
        else if (ct === 2) { R = val(c, 0); G = val(c, 1); B = val(c, 2); if (trns && bd === 8 && R === trns.readUInt16BE(0) && G === trns.readUInt16BE(2) && B === trns.readUInt16BE(4)) A = 0; }
        else if (ct === 3) { const i = val(c, 0); R = pal[i * 3]; G = pal[i * 3 + 1]; B = pal[i * 3 + 2]; if (trns && i < trns.length) A = trns[i]; }
        else if (ct === 4) { R = G = B = val(c, 0); A = val(c, 1); }
        else { R = val(c, 0); G = val(c, 1); B = val(c, 2); A = val(c, 3); }
        out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
      }
    }
  }
  return { w, h, data: out };
}
function readTGA(b) {
  const idl = b[0], cmt = b[1], it = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17], px = bpp >> 3;
  if (cmt || ![1, 3, 4].includes(px)) throw new Error(`unsupported TGA (cmap ${cmt}, ${bpp}bpp)`);
  const n = w * h, out = new Uint8Array(n * 4); let p = 18 + idl;
  const put = (i, o) => {
    if (px === 1) { out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = b[o]; out[i * 4 + 3] = 255; }
    else { out[i * 4] = b[o + 2]; out[i * 4 + 1] = b[o + 1]; out[i * 4 + 2] = b[o]; out[i * 4 + 3] = px === 4 ? b[o + 3] : 255; }
  };
  if (it === 2 || it === 3) for (let i = 0; i < n; i++) put(i, p + i * px);
  else if (it === 10 || it === 11) {
    let i = 0;
    while (i < n) {
      const hd = b[p++], cnt = (hd & 127) + 1;
      if (hd & 128) { for (let k = 0; k < cnt && i < n; k++) put(i++, p); p += px; }
      else for (let k = 0; k < cnt && i < n; k++) { put(i++, p); p += px; }
    }
  } else throw new Error(`unsupported TGA type ${it}`);
  if (!(desc & 0x20)) { // bottom-left origin → flip
    const row = w * 4, tmp = new Uint8Array(row);
    for (let y = 0; y < h >> 1; y++) { const a = y * row, z = (h - 1 - y) * row; tmp.set(out.subarray(a, a + row)); out.copyWithin(a, z, z + row); out.set(tmp, z); }
  }
  return { w, h, data: out };
}
const readImage = f => (f.endsWith('.tga') ? readTGA : readPNG)(fs.readFileSync(f));

// ---------------------------------------------------------------- encoders
function pngBuf(w, h, ch, px) {
  const ct = { 1: 0, 3: 2, 4: 6 }[ch], stride = w * ch, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = ct;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 7 })), chunk('IEND', Buffer.alloc(0))]);
}
// Bottom-left origin (descriptor 0x08): the layout every vanilla Bedrock TGA uses
function tgaBuf(w, h, rgba) {
  const b = Buffer.alloc(18 + w * h * 4); b[2] = 2; b.writeUInt16LE(w, 12); b.writeUInt16LE(h, 14); b[16] = 32; b[17] = 0x08;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, o = 18 + ((h - 1 - y) * w + x) * 4;
    b[o] = rgba[s + 2]; b[o + 1] = rgba[s + 1]; b[o + 2] = rgba[s]; b[o + 3] = rgba[s + 3];
  }
  return b;
}
// Heightmaps as RGB: Bedrock never ships 1-channel PNGs and the PBR atlas builder reads them past the end
function grayToRGB(w, h, g) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) px[i * 3] = px[i * 3 + 1] = px[i * 3 + 2] = g[i];
  return pngBuf(w, h, 3, px);
}
// Windows can briefly lock a file that was just written (indexing / antivirus), so retry instead of failing
function writeFile(file, data) {
  for (let tries = 0; ; tries++) {
    try { return fs.writeFileSync(file, data); }
    catch (e) { if (tries >= 8 || !['UNKNOWN', 'EBUSY', 'EPERM', 'EACCES'].includes(e.code)) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (tries + 1)); }
  }
}
function writeImage(file, img, forceAlpha) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (file.endsWith('.tga')) return writeFile(file, tgaBuf(img.w, img.h, img.data));
  let opaque = !forceAlpha;
  for (let i = 3; opaque && i < img.data.length; i += 4) if (img.data[i] !== 255) opaque = false;
  if (!opaque) return writeFile(file, pngBuf(img.w, img.h, 4, img.data));
  const rgb = new Uint8Array(img.w * img.h * 3);
  for (let i = 0; i < img.w * img.h; i++) { rgb[i * 3] = img.data[i * 4]; rgb[i * 3 + 1] = img.data[i * 4 + 1]; rgb[i * 3 + 2] = img.data[i * 4 + 2]; }
  writeFile(file, pngBuf(img.w, img.h, 3, rgb));
}

// Alpha is a tint mask (not cutout) when most fully-transparent pixels still carry real colour
function isTintMask(img) {
  let zero = 0, coloured = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] === 0) { zero++; if (img.data[i - 3] + img.data[i - 2] + img.data[i - 1] > 30) coloured++; }
  return zero > 0 && coloured / zero > 0.6;
}

module.exports = { writeFile, readPNG, readTGA, readImage, pngBuf, tgaBuf, grayToRGB, writeImage, isTintMask };
