/* 全量计算: 所有 学校↔出发地 区间 × 所有站点的判定(仅记录 区间内/边缘)
 * 生成: verify-data/all-intervals.csv + all-intervals.json.gz + 汇总 summary.json
 * 运行: node scripts/gen-all-intervals.mjs */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const { STATIONS, dist, corridor } = new Function(logicSrc + '\nreturn {STATIONS,dist,corridor};')();

function judge(S, H, D) {
  const L = dist(S, H);
  if (L < 15) return dist(S, D) <= 50 ? 2 : (dist(S, D) <= 120 ? 1 : 0);
  const { t, p } = corridor(S, H, D);
  const core = (t > 1.0 || t < 0.0) ? 45 : Math.min(450, Math.max(60, 0.55 * L));
  const edge = (t > 1.0 || t < 0.0) ? 60 : Math.min(520, Math.max(90, 0.75 * L));
  if (t >= -0.05 && t <= 1.05 && p <= core) return 2;
  if (t >= -0.5 && t <= 1.5 && p <= edge) return 1;
  return 0;
}

const dir = path.join(root, 'verify-data');
fs.mkdirSync(dir, { recursive: true });
const csv = fs.createWriteStream(path.join(dir, 'all-intervals.csv'));
const json = fs.createWriteStream(path.join(dir, 'all-intervals.json')); // 预留gzip
const gz = zlib.createGzip();
gz.pipe(fs.createWriteStream(path.join(dir, 'all-intervals.json.gz')));

json.write('{');
let first = true, pairs = 0;
let totOk = 0, totEdge = 0, sumOkPerPair = 0, maxOk = 0, maxOkPair = '';
const t0 = Date.now();
const N = STATIONS.length;
for (let i = 0; i < N; i++) {
  if (i % 30 === 0) console.log('进度', i, '/', N, '· 已用', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  const S = { lat: STATIONS[i][2], lon: STATIONS[i][3] };
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    const H = { lat: STATIONS[j][2], lon: STATIONS[j][3] };
    const ok = [], edge = [];
    for (let k = 0; k < N; k++) {
      if (k === i || k === j) continue;
      const st = STATIONS[k];
      if (st[1] === STATIONS[i][1] || st[1] === STATIONS[j][1]) continue; // 同城跳过
      const c = judge(S, H, { lat: st[2], lon: st[3] });
      if (c === 2) ok.push(st[0]);
      else if (c === 1) edge.push(st[0]);
    }
    const key = STATIONS[i][0] + '|' + STATIONS[j][0];
    if (!first) json.write(',');
    first = false;
    json.write(JSON.stringify([key, ok, edge]));
    csv.write(STATIONS[i][0] + ',' + STATIONS[j][0] + ',' + Math.round(dist(S, H)) + ',"' + ok.join('|') + '","' + edge.join('|') + '"\n');
    pairs++;
    totOk += ok.length; totEdge += edge.length;
    const n = ok.length;
    sumOkPerPair += n;
    if (n > maxOk) { maxOk = n; maxOkPair = key; }
  }
}
json.write('}');
json.end();
csv.end();
gz.write('{');
// 重新 gzip: 简单起见从内存 gzip
setTimeout(() => { console.log('done'); }, 50);

/* 文件收尾(gzip 单独) 由下方同步方式重做 */
setTimeout(() => {
  const raw = fs.readFileSync(path.join(dir, 'all-intervals.json'), 'utf8');
  fs.writeFileSync(path.join(dir, 'all-intervals.json.gz'), zlib.gzipSync(raw, { level: 9 }));
  const sum = {
    pairs, stations: N,
    inIntervalTotal: totOk, edgeTotal: totEdge,
    avgInPerPair: +(sumOkPerPair / pairs).toFixed(2),
    maxIn: maxOk, maxInPair: maxOkPair,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
    csvSizeKB: +(fs.statSync(path.join(dir, 'all-intervals.csv')).size / 1024).toFixed(0),
    jsonSizeKB: +(fs.statSync(path.join(dir, 'all-intervals.json')).size / 1024).toFixed(0),
    gzSizeKB: +(fs.statSync(path.join(dir, 'all-intervals.json.gz')).size / 1024).toFixed(0),
  };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(sum, null, 2));
  console.log('=== 汇总 ===');
  console.log(JSON.stringify(sum, null, 2));
}, 100);
