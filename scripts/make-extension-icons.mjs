// Raster znaku z assets/brand/icon.svg (granat #13294B, czerwień #C8102E) do PNG wtyczki.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const NAVY = [0x13, 0x29, 0x4b, 255];
const WHITE = [255, 255, 255, 255];
const RED = [0xc8, 0x10, 0x2e, 255];

function inRound(px, py, x, y, w, h, r) {
  if (px < x || py < y || px >= x + w || py >= y + h) return false;
  const left = px < x + r;
  const right = px >= x + w - r;
  const top = py < y + r;
  const bottom = py >= y + h - r;
  if (!left && !right) return true;
  if (!top && !bottom) return true;
  const cx = left ? x + r : x + w - r;
  const cy = top ? y + r : y + h - r;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function draw(size) {
  const s = size / 225;
  const buf = Buffer.alloc(size * size * 4);
  const px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      if (inRound(cx, cy, 0, 0, size, size, 46.5 * s)) px(x, y, NAVY);
      if (inRound(cx, cy, 46.5 * s, 41.25 * s, 48 * s, 142.5 * s, 6 * s)) px(x, y, WHITE);
      if (inRound(cx, cy, 130.5 * s, 41.25 * s, 48 * s, 142.5 * s, 6 * s)) px(x, y, WHITE);
      if (cx >= 30 * s && cx < 195 * s && cy >= 88.5 * s && cy < 112.5 * s) px(x, y, WHITE);
      if (cx >= 30 * s && cx < 195 * s && cy >= 112.5 * s && cy < 136.5 * s) px(x, y, RED);
    }
  }
  return buf;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "extension", "icons");
fs.mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(dir, `icon-${size}.png`), png(size, draw(size)));
}
console.log("ikony wtyczki gotowe");
