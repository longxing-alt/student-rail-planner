/* 压力审计: 实测区间 × 远方城市, 找出可疑中转方案
   重点: ① 极短区间(<150km)中转放行到任意远 ② 中转后段 T→B 超长 ③ 绕行比超标
   输出供真机验证的怀疑清单 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const L = new Function(idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1] + '\nreturn {STATIONS,stToObj,dist,corridor,planTrip,chainV2,beltV2,bandOK};')();
const st = n => L.stToObj(L.STATIONS.find(s => s[0] === n || s[1] === n));
const near = (a, b) => Math.round(L.dist(a, b));

// 实测过的区间(端点取枢纽站)
const intervals = [
  ['北京西', '石家庄'], ['北京西', '武汉'], ['北京西', '广州南'], ['苏州', '上海虹桥'],
  ['广州南', '佛山'], ['武汉', '柳州'], ['武汉', '长沙南'], ['哈尔滨西', '成都东'],
  ['北京西', '上海虹桥'], ['南宁东', '济南西'], ['成都东', '黄石北'], ['武汉', '乌鲁木齐'],
];
// 远方目的地(压力点)
const dests = ['乌鲁木齐', '拉萨', '三亚', '湛江西', '哈尔滨西', '昆明南', '呼和浩特', '兰州西',
  '西宁', '贵阳北', '银川', '长春西', '郑州东', '西安北', '徐州东', '南昌西', '长沙南', '沈阳北', '福州'];

let suspect = 0;
for (const [sn, hn] of intervals) {
  const S = st(sn), H = st(hn);
  if (!S || !H) continue;
  const Ls = near(S, H);
  const short = Ls < 150;
  for (const dn of dests) {
    const D = st(dn);
    if (!D) continue;
    const cc = L.chainV2(S, H, [], H, D, false); // 从家出发单程
    if (!cc || !cc.segs.length) continue;
    const sg = cc.segs[0];
    if (!sg.hub) continue;
    const hObj = st(sg.hub);
    if (!hObj) continue;
    const via = near(H, hObj) + near(hObj, D);
    const direct = near(H, D);
    const ratio = +(via / Math.max(1, direct)).toFixed(2);
    const tail = near(hObj, D);
    const flags = [];
    if (short) flags.push('极短区间');
    if (tail > 1200) flags.push('后段' + tail + 'km');
    if (ratio > 2.5) flags.push('绕行比' + ratio);
    if (!flags.length) continue;
    suspect++;
    console.log(`[可疑] ${sn}⇄${hn}(${Ls}km) 去${dn}: 经${sg.hub} → 前段${near(H,hObj)}km 后段${tail}km | 绕行比${ratio} | ${flags.join('/')}`);
    if (short) console.log(`        ↑ 极短区间: 端点近邻圈(≤600km)内中转后放行到 ${tail}km 外, 规则未经实测`);
  }
}
console.log(`\n共 ${suspect} 条可疑方案(其中极短区间=${intervals.reduce((n,[a,b])=>n+(near(st(a),st(b))<150?1:0),0)*dests.length} 条组合里筛出)`);