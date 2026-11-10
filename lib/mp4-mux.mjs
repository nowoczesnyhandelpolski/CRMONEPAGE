// Minimalny MP4 (AVC, bez dźwięku) dla próbek z VideoEncoder (format avc, długość+NAL).
// Renderer w przeglądarce używa tego, gdy MediaRecorder nie umie MP4. Serwer może użyć tego samego układu.

function ascii(s) {
  return Uint8Array.from(String(s), (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function u32(n) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0);
  return b;
}
function u16(n) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n);
  return b;
}
function u8(n) { return Uint8Array.of(n & 255); }

function box(type, payload) {
  return concat(u32(8 + payload.length), ascii(type), payload);
}
function fullBox(type, version, flags, payload) {
  const head = new Uint8Array(4);
  new DataView(head.buffer).setUint32(0, (version << 24) | (flags & 0xffffff));
  return box(type, concat(head, payload));
}

function matrix() {
  return concat(u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000));
}

function mvhd(timescale, duration) {
  return fullBox("mvhd", 0, 0, concat(
    u32(0), u32(0), u32(timescale), u32(duration),
    u32(0x00010000), u16(0x0100), u16(0), u32(0), u32(0),
    matrix(), new Uint8Array(24), u32(2)
  ));
}

function tkhd(duration, width, height) {
  return fullBox("tkhd", 0, 3, concat(
    u32(0), u32(0), u32(1), u32(0), u32(duration),
    u32(0), u32(0), u16(0), u16(0), u16(0), u16(0),
    matrix(), u32(width << 16), u32(height << 16)
  ));
}

function mdhd(timescale, duration) {
  return fullBox("mdhd", 0, 0, concat(u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0)));
}

function hdlr() {
  return fullBox("hdlr", 0, 0, concat(u32(0), ascii("vide"), u32(0), u32(0), u32(0), ascii("VideoHandler"), u8(0)));
}

function vmhd() { return fullBox("vmhd", 0, 1, concat(u16(0), u16(0), u16(0), u16(0))); }

function dinf() {
  const url = fullBox("url ", 0, 1, new Uint8Array(0));
  const dref = fullBox("dref", 0, 0, concat(u32(1), url));
  return box("dinf", dref);
}

function avc1(width, height, avcC) {
  const compressor = new Uint8Array(32);
  const sample = concat(
    new Uint8Array(6), u16(1),
    u16(0), u16(0), u32(0), u32(0), u32(0),
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000), u32(0), u16(1),
    compressor, u16(0x0018), u16(0xffff),
    box("avcC", avcC)
  );
  return box("avc1", sample);
}

function stsd(width, height, avcC) {
  return fullBox("stsd", 0, 0, concat(u32(1), avc1(width, height, avcC)));
}

function stts(count, delta) {
  return fullBox("stts", 0, 0, concat(u32(1), u32(count), u32(delta)));
}
function stsc(count) {
  return fullBox("stsc", 0, 0, concat(u32(1), u32(1), u32(count), u32(1)));
}
function stsz(sizes) {
  const body = [u32(0), u32(sizes.length)];
  for (const n of sizes) body.push(u32(n));
  return fullBox("stsz", 0, 0, concat(...body));
}
function stco(offset) {
  return fullBox("stco", 0, 0, concat(u32(1), u32(offset)));
}
function stss(keys) {
  const body = [u32(keys.length)];
  for (const n of keys) body.push(u32(n));
  return fullBox("stss", 0, 0, concat(...body));
}

/**
 * @param {{ width:number, height:number, fps?:number, description:Uint8Array, samples:Array<{ data:Uint8Array, key?:boolean }> }} opts
 */
export function muxAvcMp4({ width, height, fps = 24, description, samples }) {
  if (!description?.length) throw new Error("Brak avcC.");
  if (!samples?.length) throw new Error("Brak klatek.");
  const timescale = fps * 1000;
  const delta = 1000;
  const duration = samples.length * delta;
  const sizes = samples.map((s) => s.data.length);
  const keys = [];
  samples.forEach((s, i) => { if (s.key !== false) keys.push(i + 1); });
  if (!keys.length) keys.push(1);
  const stbl = box("stbl", concat(
    stsd(width, height, description),
    stts(samples.length, delta),
    stss(keys),
    stsc(samples.length),
    stsz(sizes),
    stco(0)
  ));
  const minf = box("minf", concat(vmhd(), dinf(), stbl));
  const mdia = box("mdia", concat(mdhd(timescale, duration), hdlr(), minf));
  const trak = box("trak", concat(tkhd(duration, width, height), mdia));
  const moovWithout = box("moov", concat(mvhd(timescale, duration), trak));
  const ftyp = box("ftyp", concat(ascii("isom"), u32(0), ascii("isom"), ascii("iso2"), ascii("avc1"), ascii("mp41")));
  const mdatHeader = 8;
  const dataOffset = ftyp.length + moovWithout.length + mdatHeader;
  const stbl2 = box("stbl", concat(
    stsd(width, height, description),
    stts(samples.length, delta),
    stss(keys),
    stsc(samples.length),
    stsz(sizes),
    stco(dataOffset)
  ));
  const moov = box("moov", concat(mvhd(timescale, duration), box("trak", concat(tkhd(duration, width, height), box("mdia", concat(mdhd(timescale, duration), hdlr(), box("minf", concat(vmhd(), dinf(), stbl2))))))));
  const payload = concat(...samples.map((s) => s.data));
  const mdat = concat(u32(mdatHeader + payload.length), ascii("mdat"), payload);
  if (ftyp.length + moov.length + mdatHeader !== dataOffset) {
    throw new Error("Zły offset MP4.");
  }
  return concat(ftyp, moov, mdat);
}
