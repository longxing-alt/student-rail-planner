/* 生成小程序 map 组件用的图钉 PNG（node 零依赖: zlib + 手写 PNG chunk） */
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
/* 画圆形图钉: 半径 r 的圆 + 白色描边, 4x 超采样抗锯齿 */
function pinPNG(size, hex, border = '#ffffff') {
  const S = size * 4, r = size / 2 - 2, br = r + 2;
  const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const b = [255, 255, 255];
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let ra = 0, ga = 0, ba = 0, aa = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const dx = (x * 4 + sx + 0.5) - (size * 2), dy = (y * 4 + sy + 0.5) - (size * 2);
      const d = Math.hypot(dx, dy);
      let a = 0, col = rgb;
      if (d <= r * 4) { a = 1; }
      else if (d <= br * 4) { const f = (br * 4 - d) / 4; a = Math.min(1, f); col = b; }
      ra += col[0] * a; ga += col[1] * a; ba += col[2] * a; aa += a;
    }
    const i = (y * size + x) * 4;
    const a = aa / 16;
    px[i] = a ? Math.round(ra / aa) : 0; px[i + 1] = a ? Math.round(ga / aa) : 0;
    px[i + 2] = a ? Math.round(ba / aa) : 0; px[i + 3] = Math.round(a * 255);
  }
  // 扫描行 → 过滤字节0 → deflate
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.resolve(import.meta.dirname, '../miniprogram/images');
fs.mkdirSync(out, { recursive: true });
const pins = {
  'pin-s.png': '#06b6d4',   // 学校 青
  'pin-h.png': '#059669',   // 家 绿
  'pin-ok.png': '#22c55e',  // 区间内 绿
  'pin-mid.png': '#8b5cf6', // 中转/边缘 紫
  'pin-bad.png': '#52525b', // 全价 灰
};
for (const [f, hex] of Object.entries(pins)) {
  fs.writeFileSync(path.join(out, f), pinPNG(34, hex));
  console.log('生成', f, hex);
}
// 校验: PNG 魔数
for (const f of Object.keys(pins)) {
  const b = fs.readFileSync(path.join(out, f));
  if (b[0] !== 0x89 || b[1] !== 0x50) { console.error(f, 'PNG 校验失败'); process.exit(1); }
}
console.log('全部图钉生成并校验通过');
