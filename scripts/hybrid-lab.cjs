/* 混合权重实验室(本地, 不合并/不提交): 几何走廊 vs 铁路通道网络 加权判定
 * 用法: node scripts/hybrid-lab.cjs  → 打印 两大大区间 × 各权重 判别矩阵
 * 权重档: W1纯几何 ... W5纯网络; 判色: score≥75绿 ≥40橙 else红
 * score = wG*100*(几何belt/2) + wN*100*(网络两端∈通道站集)
 * 注: 图为近似铁路邻接(主干线+关键支线), 终端支线(深圳/丹东/大连等)按其语义处理, 详见输出注释 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const L = new Function(logicSrc + '\nreturn {STATIONS,stToObj,dist,corridor,coreLimit,edgeLimit,planTrip};')();
const st = n => L.stToObj(L.STATIONS.find(s => s[0] === n || s[1] === n));

/* ---- 几何 belt: 2=绿 1=橙 0=红 (与小程序两端判定一致) ---- */
function belt(S, H, P) {
  const Ln = L.dist(S, H);
  if (Ln < 15) return L.dist(S, P) <= 150 ? 2 : 0;
  const { t, p } = L.corridor(S, H, P);
  if (t >= -0.05 && t <= 1.05 && p <= L.coreLimit(Ln, t)) return 2;
  if (t >= -0.5 && t <= 1.5 && p <= L.edgeLimit(Ln, t)) return 1;
  return 0;
}
function geom(S, H, P) { const { t, p } = L.corridor(S, H, P); return { t: +t.toFixed(2), p: Math.round(p) }; }

/* ---- 铁路邻接图(近似主干线; 城市级) ---- */
const EDGES = [
  ['哈尔滨', '长春'], ['长春', '沈阳'], ['沈阳', '北京'],            // 京哈
  ['北京', '石家庄'], ['石家庄', '郑州'], ['郑州', '武汉'], ['武汉', '长沙'], ['长沙', '衡阳'], ['衡阳', '广州'], // 京广
  ['郑州', '西安'], ['西安', '成都'],                              // 陇海+宝成/西成
  ['成都', '重庆'], ['重庆', '遵义'], ['遵义', '贵阳'],              // 成渝+渝贵/川黔
  ['长沙', '贵阳'], ['长沙', '南昌'],                               // 沪昆(近似)
  ['南昌', '深圳'],                                                 // 京九(近似)
  ['北京', '南昌'],                                                 // 京九北段(近似)
  ['衡阳', '桂林'],                                                 // 衡柳
  ['桂林', '柳州'], ['柳州', '南宁'],                                // 湘桂
  ['贵阳', '柳州'],                                                 // 黔桂
  ['柳州', '湛江'],                                                 // 黎湛(近似)
  ['南宁', '昆明'], ['昆明', '成都'],                              // 南昆+成昆(南宁通道)
  ['广州', '湛江'],                                                 // 江湛/广茂(近似)
  ['广州', '深圳'],                                                 // 广深(终端: 深圳仅经广州)
  ['北京', '天津'], ['天津', '济南'], ['济南', '徐州'], ['徐州', '郑州'], // 京沪(近似)
  ['沈阳', '丹东'], ['沈阳', '大连'],                                // 终端支线(用于网络外边界测试)
];
const adj = {};
function cityOf(s) { return s ? s.city : null; }
for (const [a, b] of EDGES) {
  (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a);
}
const CITY_NET = new Set(EDGES.flat());

/* ---- 通道站集: 所有简单路径上的城市 (DFS, 跳数上限) ---- */
function netSet(S, H) {
  const s = cityOf(S), h = cityOf(H);
  const hit = new Set();
  if (!CITY_NET.has(s) || !CITY_NET.has(h)) { hit.has = () => false; return hit; }
  hit.add(s); hit.add(h);
  const seen = new Set([s]);
  (function dfs(u) {
    if (u === h) return 1;
    let multi = 0;
    for (const v of adj[u] || []) {
      if (seen.has(v)) continue;
      seen.add(v);
      const r = dfs(v);
      if (r) { hit.add(v); multi = 1; }
      seen.delete(v);
    }
    return multi;
  })(s);
  return hit;
}

/* ---- 混合打分 ---- */
const W = { W1: [1.0, 0.0], W2: [0.75, 0.25], W3: [0.50, 0.50], W4: [0.25, 0.75], W5: [0.0, 1.0] };
function hybrid(geoC_O, geoC_D, netO, netD, wG, wN) {
  const g = Math.min(geoC_O, geoC_D), n = (netO && netD) ? 1 : 0;
  const score = wG * 100 * (g / 2) + wN * 100 * n;
  return score >= 75 ? '绿' : score >= 40 ? '橙' : '红';
}
function row(S, H, O, D, net) {
  const gO = belt(S, H, O), gD = belt(S, H, D);
  const g = Math.min(gO, gD);
  const cO = cityOf(O), cD = cityOf(D);
  const nO = net.has(cO), nD = net.has(cD);
  const geo = geom(S, H, O), ge = geom(S, H, D);
  const cells = Object.entries(W).map(([k, [a, b]]) => hybrid(gO, gD, nO, nD, a, b));
  const uniq = new Set(cells);
  const disc = uniq.size > 1 ? ' ◀判别' : '';
  const gDetail = `O:${O.name} t=${geo.t} p=${geo.p}km belt=${gO} | D:${D.name} t=${ge.t} p=${ge.p}km belt=${gD}`;
  const nDetail = `网O=${nO ? '√' : '×'} 网D=${nD ? '√' : '×'}`;
  return { g, gDetail, nDetail, cells, disc };
}

const intervals = [
  ['哈尔滨', '成都', '大区间❶ 哈尔滨西↔成都东'],
  ['哈尔滨', '遵义', '大区间❷ 哈尔滨西↔遵义'],
  ['石家庄', '南宁', '调整A 石家庄↔南宁(南昆衡柳京广)'],
  ['石家庄', '武汉', '调整B 石家庄↔武汉(京广短区间)'],
  ['哈尔滨', '昆明', '调整C 哈尔滨↔昆明(成昆新走廊)'],
  ['北京', '广州', '调整D 北京↔广州(京广长区间)'],
];
const conds = [
  ['石家庄', '桂林'], ['石家庄', '南宁'], ['长沙', '柳州'], ['桂林', '郑州'], ['哈尔滨', '长沙'],
  ['哈尔滨', '广州'], ['哈尔滨', '深圳'], ['哈尔滨', '丹东'], ['哈尔滨', '天津'], ['哈尔滨', '衡阳'],
  ['哈尔滨', '昆明'], ['哈尔滨', '湛江'], ['昆明', '长沙'], ['郑州', '长沙'],
  ['成都', '南宁'], ['汉口', '衡阳'], ['郑州', '桂林'], ['石家庄', '北京'], ['湘潭', '长沙'],
  ['南昌', '长沙'], ['贵阳', '长沙'], ['哈尔滨', '西安'],
];
for (const [Sn, Hn, title] of intervals) {
  const S = st(Sn), H = st(Hn);
  const net = netSet(S, H);
  console.log('\n========== ' + title + ' (L=' + Math.round(L.dist(S, H)) + 'km) ==========');
  console.log('通道站集(' + Sn + '↔' + Hn + ') 城市数=' + net.size + ': ' + [...net].join('、'));
  for (const [On, Dn] of conds) {
    const O = st(On), D = st(Dn);
    if (!O || !D) { console.log(On + '/' + Dn + ' 缺站'); continue; }
    const r = row(S, H, O, D, net);
    console.log(`  ${On}→${Dn}: ${r.cells.join(' ')}${r.disc}`);
    console.log(`      ${r.gDetail} | ${r.nDetail}`);
  }
}
console.log('\n说明: W1=纯几何(即为当前网页版与小程序原版一致逻辑)  W2=0.75/0.25  W3=0.5/0.5  W4=0.25/0.75  W5=纯网络');
console.log('判色: score≥75绿 / ≥40橙 / 其余红; 几何belt 2绿1橙0红; 网络=两端城市均在通道站集(近似图)');
process.exit(0);