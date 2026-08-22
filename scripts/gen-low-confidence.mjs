/* 全量置信度最低条目(本地): 遍历所有区间×站点, 输出全局低置信 TopK
 * 输出(仅本地, 不推送): verify-data/low-confidence.csv(全部K条) + low-confidence-top150.md(便于阅读) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const { STATIONS, dist, corridor } = new Function(logicSrc + '\nreturn {STATIONS,dist,corridor};')();

function assess(S, H, D) {
  const L = dist(S, H);
  let cls, conf;
  if (L < 15) {
    const d = dist(S, D);
    cls = d <= 50 ? 2 : d <= 120 ? 1 : 0;
    conf = 60;
    return { cls, conf, t: 0, p: Math.round(d) };
  }
  const { t, p } = corridor(S, H, D);
  const core = (t > 1.0 || t < 0.0) ? 45 : Math.min(450, Math.max(60, 0.55 * L));
  const edge = (t > 1.0 || t < 0.0) ? 60 : Math.min(520, Math.max(90, 0.75 * L));
  if (t >= -0.05 && t <= 1.05 && p <= core) { cls = 2; const m = (core - p) / core; conf = Math.round(40 + 60 * Math.max(0, Math.min(1, m))); }
  else if (t >= -0.5 && t <= 1.5 && p <= edge) { cls = 1; const no = (edge - p) / edge; conf = Math.round(35 + 10 * Math.max(0, Math.min(1, no)) - (p <= core ? 15 : 0)); if (conf < 15) conf = 15; }
  else { cls = 0; const m = (p - edge) / edge; conf = Math.round(40 + 60 * Math.max(0, Math.min(1, m))); }
  if ((t < -0.05 && t > -0.15) || (t > 1.05 && t < 1.15)) conf = Math.round(conf * 0.7);
  if (conf < 3) conf = 3; if (conf > 98) conf = 98;
  return { cls, conf, t: +t.toFixed(2), p: Math.round(p) };
}
const LAB = { 0: '拦截', 1: '边缘', 2: '可出' };

/* 最小堆存 TopK(置信度最低的K条; 堆顶=当前K条里最大的/最差的, 新值更小时替换) */
class MinTopK {
  constructor(k) { this.k = k; this.arr = []; }
  get top() { return this.arr[0]; }
  fromTop(x) { return this.arr[0] ? x.conf >= this.arr[0].conf : false; }
  push(x) {
    if (this.arr.length < this.k) { this.arr.push(x); this.up(this.arr.length - 1); }
    else if (x.conf < this.arr[0].conf) { this.arr[0] = x; this.down(0); }
  }
  up(i) { const a = this.arr; while (i > 0) { const p = (i - 1) >> 1; if (a[p].conf < a[i].conf) { [a[p], a[i]] = [a[i], a[p]]; i = p; } else break; } }
  down(i) { const a = this.arr; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < a.length && a[l].conf > a[m].conf) m = l; if (r < a.length && a[r].conf > a[m].conf) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
  sort() { return this.arr.slice().sort((a, b) => a.conf - b.conf); }
}

const K = 5000;
const heap = new MinTopK(K);
const N = STATIONS.length;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const S = { lat: STATIONS[i][2], lon: STATIONS[i][3] };
  for (let j = 0; j < N; j++) {
    if (j === i) continue;
    const H = { lat: STATIONS[j][2], lon: STATIONS[j][3] };
    const L = dist(S, H);
    for (let k = 0; k < N; k++) {
      if (k === i || k === j) continue;
      const st = STATIONS[k];
      if (st[1] === STATIONS[i][1] || st[1] === STATIONS[j][1]) continue;
      const a = assess(S, H, { lat: st[2], lon: st[3] });
      if (heap.fromTop({ conf: a.conf })) continue;
      heap.push({ S: STATIONS[i][0], H: STATIONS[j][0], D: st[0], Dc: st[1], cls: a.cls, conf: a.conf, t: a.t, p: a.p, L: Math.round(L), core: Math.round(Math.max(60, 0.32 * L)), edge: Math.round(Math.max(90, 0.45 * L)) });
    }
  }
}
const rows = heap.sort();
const dir = path.join(root, 'verify-data');
fs.mkdirSync(dir, { recursive: true });
const sh = fs.createWriteStream(path.join(dir, 'low-confidence.csv'));
sh.write('学校,出发地,车站,城市,预测,置信度,t,p(km),区间长km,核心带km,边缘带km\n');
for (const r of rows) sh.write([r.S, r.H, r.D, r.Dc, LAB[r.cls], r.conf, r.t, r.p, r.L, r.core, r.edge].join(',') + '\n');
sh.end();

/* 阅读友好的 top150 */
let md = '# 全量置信度最低条目（' + rows.length + ' 条）\n\n按置信度升序——波动验证这些最快收敛：\n\n';
md += '| 学校 | 出发地 | 车站 | 预测 | 置信 | 依据 |\n|---|---|---|---|---|---|\n';
for (const r of rows.slice(0, 150)) md += `| ${r.S} | ${r.H} | ${r.D}(${r.Dc}) | ${LAB[r.cls]} | ${r.conf}% | t=${r.t} p=${r.p}km 带${r.core}~${r.edge}km 区${r.L}km |\n`;
fs.writeFileSync(path.join(dir, 'low-confidence-top150.md'), md);

console.log('完成: 遍历', N * (N - 1) * N, '条预测, 用时', ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('== 全量置信度最低 25 条 ==');
for (const r of rows.slice(0, 25)) console.log(`  ${r.conf}%  ${r.S}↔${r.H} → ${r.D}(${r.Dc}) 预测=${LAB[r.cls]}  t=${r.t} p=${r.p}km (带${r.core}~${r.edge})`);
console.log('\n文件已写入 verify-data/low-confidence.csv（' + rows.length + ' 条）与 low-confidence-top150.md');
