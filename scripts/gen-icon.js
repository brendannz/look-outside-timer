// Generates build/icon.ico with no external dependencies.
// Draws a pink monitor showing a clock face.
// Uncompressed 32bpp BGRA entries, which every Windows version understands.

const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SS = 3; // supersample factor per axis

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixRgb(c1, c2, t) {
  const k = Math.min(Math.max(t, 0), 1);
  return [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)];
}

function insideRoundedRect(u, v, x0, y0, x1, y1, r) {
  if (u < x0 || u > x1 || v < y0 || v > y1) return false;
  const cx = Math.min(Math.max(u, x0 + r), x1 - r);
  const cy = Math.min(Math.max(v, y0 + r), y1 - r);
  const dx = u - cx;
  const dy = v - cy;
  return dx * dx + dy * dy <= r * r;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? (vx * wx + vy * wy) / len2 : 0;
  t = Math.min(Math.max(t, 0), 1);
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

const BEZEL = [199, 21, 98];        // deep pink frame and stand
const SCREEN_TOP = [255, 150, 194];
const SCREEN_BOT = [255, 95, 158];
const FACE = [255, 246, 250];
const HAND = [124, 15, 62];

const TRANSPARENT = [0, 0, 0, 0];
const opaque = (rgb) => [rgb[0], rgb[1], rgb[2], 255];

// Clock geometry. Hands sit at roughly ten past ten, which reads as a clock
// even when the face is only a few pixels across.
const CX = 0.5;
const CY = 0.425;
const R = 0.205;
const HOUR = [CX + 0.095 * Math.sin(-Math.PI / 3), CY - 0.095 * Math.cos(-Math.PI / 3)];
const MINUTE = [CX + 0.145 * Math.sin(Math.PI / 3), CY - 0.145 * Math.cos(Math.PI / 3)];

/**
 * Colour at a point in normalised [0,1] space.
 * `size` is passed so hand thickness can hold a minimum width in real pixels;
 * a purely proportional stroke would vanish at 16px.
 */
function sample(u, v, size) {
  const stroke = Math.max(0.022, 1.1 / size);

  // Stand base and neck.
  if (insideRoundedRect(u, v, 0.28, 0.86, 0.72, 0.945, 0.035)) return opaque(BEZEL);
  if (u >= 0.435 && u <= 0.565 && v >= 0.74 && v <= 0.87) return opaque(BEZEL);

  // Monitor body.
  if (!insideRoundedRect(u, v, 0.035, 0.075, 0.965, 0.775, 0.11)) return TRANSPARENT;
  if (!insideRoundedRect(u, v, 0.095, 0.135, 0.905, 0.715, 0.06)) return opaque(BEZEL);

  // Clock face on the screen.
  const d = Math.hypot(u - CX, v - CY);
  if (d <= R) {
    if (d <= stroke * 1.3) return opaque(HAND);
    if (distToSegment(u, v, CX, CY, HOUR[0], HOUR[1]) <= stroke) return opaque(HAND);
    if (distToSegment(u, v, CX, CY, MINUTE[0], MINUTE[1]) <= stroke * 0.85) return opaque(HAND);
    return opaque(FACE);
  }

  return opaque(mixRgb(SCREEN_TOP, SCREEN_BOT, (v - 0.135) / (0.715 - 0.135)));
}

// Renders one size into a bottom-up BGRA buffer, supersampled for smooth edges.
function renderBgraBottomUp(size) {
  const buf = Buffer.alloc(size * size * 4);
  const n = SS * SS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, alphaSum = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const p = sample(u, v, size);
          const pa = p[3] / 255;
          // Accumulate premultiplied, so transparent samples add no colour.
          r += p[0] * pa;
          g += p[1] * pa;
          b += p[2] * pa;
          alphaSum += p[3];
        }
      }

      // Un-premultiply: divide by the summed alpha coverage (alphaSum / 255),
      // not by the sample count.
      const scale = alphaSum > 0 ? 255 / alphaSum : 0;
      const row = size - 1 - y; // ICO stores rows bottom-up
      const o = (row * size + x) * 4;
      buf[o] = Math.round(Math.min(b * scale, 255));
      buf[o + 1] = Math.round(Math.min(g * scale, 255));
      buf[o + 2] = Math.round(Math.min(r * scale, 255));
      buf[o + 3] = Math.round(alphaSum / n);
    }
  }
  return buf;
}

function buildImage(size) {
  const xor = renderBgraBottomUp(size);
  const maskRowBytes = Math.ceil(size / 8 / 4) * 4;
  const mask = Buffer.alloc(maskRowBytes * size); // all zero; real alpha is in the XOR data

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);          // biSize
  header.writeInt32LE(size, 4);         // biWidth
  header.writeInt32LE(size * 2, 8);     // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12);          // biPlanes
  header.writeUInt16LE(32, 14);         // biBitCount
  header.writeUInt32LE(0, 16);          // BI_RGB
  header.writeUInt32LE(xor.length + mask.length, 20);

  return Buffer.concat([header, xor, mask]);
}

function buildIco(sizes) {
  const images = sizes.map(buildImage);
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0);
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(sizes.length, 4);

  const entries = [];
  let offset = 6 + sizes.length * 16;
  sizes.forEach((size, i) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(images[i].length, 8);
    e.writeUInt32LE(offset, 12);
    offset += images[i].length;
    entries.push(e);
  });

  return Buffer.concat([dir, ...entries, ...images]);
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'icon.ico');
fs.writeFileSync(out, buildIco(SIZES));
console.log(`Wrote ${out} (${SIZES.join(', ')} px)`);
