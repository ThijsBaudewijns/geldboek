// Minimale PNG-lezer/schrijver (alleen Node-ingebouwd: zlib). Voor de iconen (fase 8).
// decode: 8-bit, kleurtype 2 (RGB) of 6 (RGBA), zonder interlace. encode: 8-bit RGB (kleurtype 2), dus nooit transparant.
'use strict';
const zlib = require('zlib');

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Alle chunks: [{ type, data }]. */
function chunks(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('geen PNG');
  const out = [];
  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    out.push({ type, data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

function info(buf) {
  const ihdr = chunks(buf).find((c) => c.type === 'IHDR').data;
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType: ihdr[9],
    interlace: ihdr[12],
    chunkTypes: chunks(buf).map((c) => c.type)
  };
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** -> { width, height, channels, pixels: Buffer (rij na rij, channels bytes per pixel) } */
function decode(buf) {
  const i = info(buf);
  if (i.bitDepth !== 8 || i.interlace !== 0 || (i.colorType !== 2 && i.colorType !== 6)) {
    throw new Error('niet ondersteunde PNG (bitdiepte ' + i.bitDepth + ', kleurtype ' + i.colorType + ')');
  }
  const ch = i.colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(chunks(buf).filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const stride = i.width * ch;
  const px = Buffer.alloc(stride * i.height);
  for (let y = 0; y < i.height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x];
      const a = x >= ch ? px[dst + x - ch] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= ch && y > 0 ? px[dst - stride + x - ch] : 0;
      let r;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) r = v + paeth(a, b, c);
      else throw new Error('onbekend filter ' + f);
      px[dst + x] = r & 0xff;
    }
  }
  return { width: i.width, height: i.height, channels: ch, pixels: px };
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGB-PNG (kleurtype 2). pixels: RGB- of RGBA-buffer; alpha wordt op `background` (standaard wit) platgeslagen. */
function encodeRGB(width, height, pixels, channels, background) {
  const bg = background || [255, 255, 255];
  const ch = channels || 3;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    rows[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * ch;
      const d = y * (width * 3 + 1) + 1 + x * 3;
      const alpha = ch === 4 ? pixels[s + 3] / 255 : 1;
      for (let k = 0; k < 3; k++) rows[d + k] = Math.round(pixels[s + k] * alpha + bg[k] * (1 - alpha));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { info, decode, encodeRGB, crc32 };
