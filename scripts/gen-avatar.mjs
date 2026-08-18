/* 生成小程序头像: 144x144 圆角渐变底 + 白色列车图形（复用零依赖 PNG 编码器） */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function writePNG(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const S = 144, SS = 4; // 4x 超采样
const px = Buffer.alloc(S * S * 4);
const bgTop = [6, 182, 212], bgBot = [16, 185, 129];
const white = [255, 255, 255], win = [13, 148, 136], wheel = [6, 78, 59];

function roundedRect(x0, y0, x1, y1, r) { // 超采样坐标
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    if (x < x0 + r && y < y0 + r) return (x - x0 - r) ** 2 + (y - y0 - r) ** 2 <= r * r;
    if (x > x1 - r && y < y0 + r) return (x - x1 + r) ** 2 + (y - y0 - r) ** 2 <= r * r;
    if (x < x0 + r && y > y1 - r) return (x - x0 - r) ** 2 + (y - y1 + r) ** 2 <= r * r;
    if (x > x1 - r && y > y1 - r) return (x - x1 + r) ** 2 + (y - y1 + r) ** 2 <= r * r;
    return true;
  };
}
const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const bg = roundedRect(0, 0, S * SS, S * SS, 32 * SS);
const body = roundedRect(30 * SS, 48 * SS, 114 * SS, 100 * SS, 12 * SS);
const win1 = roundedRect(38 * SS, 58 * SS, 56 * SS, 80 * SS, 5 * SS);
const win2 = roundedRect(62 * SS, 58 * SS, 80 * SS, 80 * SS, 5 * SS);
const win3 = roundedRect(86 * SS, 58 * SS, 104 * SS, 80 * SS, 5 * SS);
const wl = circle(50 * SS, 110 * SS, 9 * SS);
const wr = circle(94 * SS, 110 * SS, 9 * SS);
const rail = (x, y) => (y >= 118 * SS && y <= 122 * SS) || (y >= 126 * SS && y <= 130 * SS);

for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let rA = 0, gA = 0, bA = 0, aA = 0;
  for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
    const X = x * SS + sx + 0.5, Y = y * SS + sy + 0.5;
    let col = null, a = 1;
    const t = Y / (S * SS);
    if (bg(X, Y)) col = [bgTop[0] + (bgBot[0] - bgTop[0]) * t, bgTop[1] + (bgBot[1] - bgTop[1]) * t, bgTop[2] + (bgBot[2] - bgTop[2]) * t];
    if (rail(X, Y)) col = [255, 255, 255];
    if (body(X, Y)) col = white;
    if (wr(X, Y) || wl(X, Y)) col = wheel;
    if (win1(X, Y) || win2(X, Y) || win3(X, Y)) col = win;
    if (!col) { a = 0; col = [0, 0, 0]; }
    rA += col[0] * a; gA += col[1] * a; bA += col[2] * a; aA += a;
  }
  const i = (y * S + x) * 4, a = aA / (SS * SS);
  px[i] = a ? Math.round(rA / aA) : 0;
  px[i + 1] = a ? Math.round(gA / aA) : 0;
  px[i + 2] = a ? Math.round(bA / aA) : 0;
  px[i + 3] = Math.round(a * 255);
}

const out = path.resolve(import.meta.dirname, '../miniprogram/images/avatar.png');
fs.writeFileSync(out, writePNG(S, px));
console.log('已生成', out, fs.statSync(out).size + 'B', '< 2M ✓');
