/* 新版逻辑全量验证报告 (本地): 58条实测逐条对照 + 关键样本 + 演示 + 优化案例 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const L = new Function(logicSrc + '\nreturn {STATIONS,stToObj,dist,corridor,planTrip,beltV2,bandOK,chanOK,isBlack,railAdj};')();
const st = n => L.stToObj(L.STATIONS.find(s => s[0] === n || s[1] === n));
const data = JSON.parse(fs.readFileSync(path.join(root, 'verify-data/real-data.json'), 'utf8'));

console.log('═══ 一、58 条实测逐条对照 ═══');
let ok = 0, fail = 0, skip = 0;
for (const e of data) {
  const sc = e.school, hc = e.home, oc = e.origin || sc, dc = e.dest;
  if (!dc || dc.includes('/') || dc.includes('·') || !e.real) { skip++; continue; }
  const S = st(sc), H = st(hc), O = st(oc), D = st(dc);
  if (!S || !H || !O || !D) { skip++; continue; }
  const r = L.planTrip(S, H, O, D);
  const expect = e.real === 'ok' ? '可出' : '拦';
  const got = r.ok ? '可出' : '拦';
  const mk = r.ok === (e.real === 'ok' ? 1 : 0);
  if (mk) ok++; else { fail++; console.log('  ✗', sc, hc, oc, '→', dc, '实:', expect, '模:', got); }
}
console.log(`实测: ${ok} 吻合 / ${fail} 不符 / ${skip} 跳过（58 条）\n`);

console.log('═══ 二、关键真实样本复核 ═══');
const samples = [
  ['A 湛江西端点', '武汉', '湛江西', '柳州', '深圳', 1],
  ['B 三亚端点', '武汉', '三亚', '柳州', '深圳', 1],
  ['C 柳州→广州', '武汉', '柳州', '柳州', '广州', 1],
  ['D 武汉↔长沙→广州', '武汉', '长沙', '武汉', '广州', 0],
  ['E 武汉↔广州→深圳', '武汉', '广州', '武汉', '深圳', 0],
  ['F 南宁东↔济南西→天津', '南宁东', '济南西', '济南', '天津', 0],
  ['案例2a 海口↔福州→徐州', '海口', '福州', '福州', '徐州', 0],
  ['案例2b 海口↔沈阳→福州', '海口', '沈阳', '福州', '徐州', 0],
  ['案例2c 海口↔哈尔滨→福州', '海口', '哈尔滨', '福州', '徐州', 0],
  ['湛江(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '湛江', 0],
  ['三亚(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '三亚', 0],
  ['海口(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '海口', 0],
  ['北海(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '北海', 1],
  ['茂名(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '茂名', 1],
  ['防城港(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '防城港', 1],
  ['丹东(哈↔成)', '哈尔滨', '成都', '哈尔滨', '丹东', 1],
  ['延吉(哈↔成)', '哈尔滨', '成都', '哈尔滨', '延吉', 1],
  ['牡丹江(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '牡丹江', 1],
  ['黑河(哈↔昆)', '哈尔滨', '昆明', '哈尔滨', '黑河', 1],
  ['湘潭→长沙(哈↔昆)', '哈尔滨', '昆明', '湘潭', '长沙', 1],
  ['佛山→广州(哈↔昆)', '哈尔滨', '昆明', '佛山', '广州', 1],
  ['京沪组·青岛', '北京', '上海', '北京', '青岛', 1],
  ['京沪组·烟台', '北京', '上海', '北京', '烟台', 1],
  ['京沪组·宁波', '北京', '上海', '北京', '宁波', 1],
  ['京沪组·温州(拦)', '北京', '上海', '北京', '温州', 0],
  ['京沪组·福州(拦)', '北京', '上海', '北京', '福州', 0],
  ['京沪组·石家庄', '北京', '上海', '北京', '石家庄', 1],
  ['京沪组·郑州', '北京', '上海', '北京', '郑州', 1],
  ['京沪组·桂林(拦)', '北京', '上海', '北京', '桂林', 0],
];
for (const [name, a, b, c, d, want] of samples) {
  const S = st(a), H = st(b), O = st(c), D = st(d);
  if (!S || !H || !O || !D) { console.log('  ⚠ 缺站:', name); continue; }
  const r = L.planTrip(S, H, O, D);
  const mk = r.ok === want;
  console.log(`  ${mk ? '✓' : '✗'} ${name}: 模型=${r.ok ? '可出' : '拦'} 实测=${want ? '可出' : '拦'}`);
}

console.log('\n═══ 三、演示(北京↔石家庄 + 6目的地) 与 优化案例 ═══');
// 演示: 通过 beltV2 快速复算
const Sd = st('北京'), Hd = st('石家庄');
for (const c of ['哈尔滨', '昆明', '长沙', '贵阳', '乌鲁木齐', '北京']) {
  const D = st(c);
  console.log(`  演示 当前: ${c} belt=${L.beltV2(Sd, Hd, D)}`);
}
// 优化案例: 目标端点直接判
for (const [name, s, h, d] of [
  ['A 长春/太原 想去武汉 → 推荐武汉', '长春', '太原', '武汉'],
  ['B 梧州/南宁 想去广州 → 推荐广州南', '梧州', '南宁', '广州'],
]) {
  const S = st(s), H = st(h), D = st(d);
  // 模型内联 smartBest(p/L 决胜)
  let best = null;
  for (const x of L.STATIONS) {
    if (x[0] === S.name) continue;
    if (!L.railAdj().nodes.has(x[1])) continue;
    const H2 = { name: x[0], city: x[1], lat: x[2], lon: x[3] };
    const cov = L.beltV2(S, H2, D) === 2 ? 1 : 0;
    if (cov < 0) continue;
    const bad = L.beltV2(S, H2, D) === 0 ? 1 : 0;
    const Lh = L.dist(S, H2);
    const { p } = L.corridor(S, H2, D);
    const pMax = p / (Lh || 1);
    const km = L.dist({ lat: x[2], lon: x[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cov > best.cover || (cov === best.cover && (bad < best.bad || (bad === best.bad && (pMax < best.pMax || (pMax === best.pMax && km < best.km)))))) {
      best = { st: x, cover: cov, bad, pMax };
    }
  }
  console.log(`  ${name} → 模型推荐: ${best ? best.st[0] : '(空)'} (覆盖${best && best.cover}, p/L=${best ? best.pMax.toFixed(2) : '-'})`);
}
process.exit(0);