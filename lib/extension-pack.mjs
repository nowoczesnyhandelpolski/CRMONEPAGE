// Deterministyczny ZIP (metoda store). Ten sam układ idzie do downloads/ i do funkcji Pages.

const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 10;

export const EXTENSION_FILES = [
  "manifest.json",
  "content.js",
  "background.js",
  "selectors.mjs",
  "extract.mjs",
  "popup.html",
  "popup.js",
  "dest.mjs",
  "fonts.css",
  "overlay.css",
  "logo.svg",
  "logo-white.svg",
  "icon.svg",
  "fonts/OFL.txt",
  "fonts/poppins-latin-500.woff2",
  "fonts/poppins-latin-ext-500.woff2",
  "fonts/poppins-latin-600.woff2",
  "fonts/poppins-latin-ext-600.woff2",
  "fonts/poppins-latin-700.woff2",
  "fonts/poppins-latin-ext-700.woff2",
  "fonts/poppins-latin-800.woff2",
  "fonts/poppins-latin-ext-800.woff2",
  "zip-store.mjs",
  "shop-extract.mjs",
  "shop-export.mjs",
  "shop-scan.mjs",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png"
];

function crc32(data) {
  let c = ~0;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
}
function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function concat(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const ascii = (s) => Uint8Array.from(String(s), (ch) => ch.charCodeAt(0));

/** @param {Array<{name:string, data:Uint8Array}>} files */
export function zipStore(files) {
  const ordered = files.slice().sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of ordered) {
    const name = ascii(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      name, data
    ]);
    locals.push(local);
    centrals.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]));
    offset += local.length;
  }
  const central = concat(centrals);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(ordered.length), u16(ordered.length),
    u32(central.length), u32(offset), u16(0)
  ]);
  return concat([...locals, central, eocd]);
}

export function readZipStore(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map();
  let offset = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const size = view.getUint32(offset + 22, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
    const start = offset + 30 + nameLen + extraLen;
    out.set(name, bytes.subarray(start, start + size));
    offset = start + size;
  }
  return out;
}

export function decodeZipBase64(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
