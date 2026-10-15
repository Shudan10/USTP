'use strict';
// Packs ./USTP into ./USTP_128x.mcpack (a plain zip with manifest.json at the root).
// Images are stored as-is (already compressed); JSON is deflated.
const fs = require('fs'), path = require('path'), zlib = require('zlib');

const SRC = path.join(__dirname, 'USTP'), DEST = path.join(__dirname, 'USTP_128x.mcpack');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

const parts = [], central = [];
let offset = 0;
for (const file of walk(SRC)) {
  const name = Buffer.from(path.relative(SRC, file).split(path.sep).join('/'));
  const data = fs.readFileSync(file), crc = zlib.crc32(data);
  const deflate = /\.(json|txt|lang)$/.test(file), body = deflate ? zlib.deflateRawSync(data, { level: 9 }) : data;
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(deflate ? 8 : 0, 8);
  h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12); // 1980-01-01, keeps builds reproducible
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26);
  parts.push(h, name, body);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(deflate ? 8 : 0, 10);
  c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += h.length + name.length + body.length;
}
const cd = Buffer.concat(central), end = Buffer.alloc(22), count = central.length / 2;
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(DEST, Buffer.concat([...parts, cd, end]));
console.log(`Packed ${count} files → ${path.basename(DEST)} (${(fs.statSync(DEST).size / 1048576).toFixed(1)} MB)`);
