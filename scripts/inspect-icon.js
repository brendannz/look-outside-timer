// Decodes build/icon.ico and prints one size as text, so the icon can be
// checked without opening an image viewer.
//   node scripts/inspect-icon.js [size]

const fs = require('fs');
const path = require('path');

const icoPath = path.join(__dirname, '..', 'build', 'icon.ico');
const want = Number(process.argv[2] || 32);
const buf = fs.readFileSync(icoPath);

const count = buf.readUInt16LE(4);
const entries = [];
for (let i = 0; i < count; i++) {
  const o = 6 + i * 16;
  entries.push({
    width: buf.readUInt8(o) || 256,
    height: buf.readUInt8(o + 1) || 256,
    bytes: buf.readUInt32LE(o + 8),
    offset: buf.readUInt32LE(o + 12)
  });
}
console.log('sizes in file:', entries.map((e) => e.width).join(', '));

const entry = entries.find((e) => e.width === want) || entries[0];
const size = entry.width;

// BITMAPINFOHEADER, then bottom-up BGRA rows.
const pixOff = entry.offset + 40;
const px = (x, y) => {
  const row = size - 1 - y;
  const o = pixOff + (row * size + x) * 4;
  return { b: buf[o], g: buf[o + 1], r: buf[o + 2], a: buf[o + 3] };
};

console.log(`\n${size}x${size}:`);
// Two pixels per cell horizontally so the output is roughly square.
const RAMP = ' .:-=+*#%@';
let opaque = 0;
let sum = { r: 0, g: 0, b: 0 };
for (let y = 0; y < size; y++) {
  let line = '';
  for (let x = 0; x < size; x++) {
    const p = px(x, y);
    if (p.a > 0) {
      opaque++;
      sum.r += p.r; sum.g += p.g; sum.b += p.b;
    }
    if (p.a < 40) { line += '  '; continue; }
    const lum = (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
    const ch = RAMP[Math.min(RAMP.length - 1, Math.round(lum * (RAMP.length - 1)))];
    line += ch + ch;
  }
  console.log(line);
}

const avg = {
  r: Math.round(sum.r / opaque),
  g: Math.round(sum.g / opaque),
  b: Math.round(sum.b / opaque)
};
console.log(`\nopaque pixels: ${opaque}/${size * size}`);
console.log(`average colour of opaque pixels: rgb(${avg.r}, ${avg.g}, ${avg.b})`);

const distinct = new Set();
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const p = px(x, y);
    if (p.a > 200) distinct.add(`${p.r},${p.g},${p.b}`);
  }
}
console.log(`distinct opaque colours: ${distinct.size}`);
console.log('samples:', [...distinct].slice(0, 8).join('  |  '));
