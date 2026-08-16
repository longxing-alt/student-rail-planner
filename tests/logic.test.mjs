// 学生优惠区间规划器 —— 核心逻辑测试套件
// 运行: node tests/logic.test.mjs   （从 index.html 提取纯逻辑执行，无浏览器依赖）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const code = html.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/);
if (!code) { console.error('✗ 未找到 PURE LOGIC 标记'); process.exit(1); }
const { STATIONS, HUBS, state, planOneWay, evalWith, dist, corridor, directCovered, transferPlan, chainEval, planGroups } =
  new Function(code[1] + '\nreturn {STATIONS,HUBS,state,planOneWay,evalWith,dist,corridor,directCovered,transferPlan,chainEval,planGroups};')();

/* ---------- 工具 ---------- */
const ST = Object.fromEntries(STATIONS.map(s => [s[0], s]));
const o = n => { const s = ST[n]; return { name: s[0], city: s[1], lat: s[2], lon: s[3], hub: !!s[4] }; };
let pass = 0, fail = 0, group = '';
const A = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`  ✗ [${group}] ${name} ${extra}`); } };
const G = name => { group = name; console.log(`\n== ${name} ==`); };
const P = (S, H, D) => planOneWay(S, H, D);
const setRatio = r => { state.ratio = r; };
const done = () => { console.log(`\n结果: ${pass} 通过, ${fail} 失败`); process.exit(fail ? 1 : 0); };

/* ---------- A. 距离计算（Haversine 已知距离） ---------- */
G('A. 距离计算');
const 北京南 = o('北京南'), 上海虹桥 = o('上海虹桥'), 武汉 = o('武汉'), 广州南 = o('广州南');
const 北京西 = o('北京西'), 贵阳北 = o('贵阳北');
const dBS_SH = dist(北京南, 上海虹桥);
const dWH_GZ = dist(武汉, 广州南);
const dBJ_GY = dist(北京西, 贵阳北);
A('北京南-上海虹桥 ≈1060km', dBS_SH > 1000 && dBS_SH < 1120, `实际 ${Math.round(dBS_SH)}`);
A('武汉-广州南 ≈855km', dWH_GZ > 820 && dWH_GZ < 890, `实际 ${Math.round(dWH_GZ)}`);
A('北京西-贵阳北 ≈1720km', dBJ_GY > 1650 && dBJ_GY < 1800, `实际 ${Math.round(dBJ_GY)}`);
A('对称性: d(A,B)=d(B,A)', Math.abs(dist(武汉, 广州南) - dist(广州南, 武汉)) < 1e-9);
A('零距离: d(A,A)=0', dist(武汉, 武汉) === 0);

/* ---------- B. 走廊几何（合成点精确验证 t/p） ---------- */
G('B. 走廊几何 corridor()');
const S1 = { lat: 30, lon: 110 }, H1 = { lat: 31, lon: 115 }; // 区间长≈492km
let c = corridor(S1, H1, { lat: 30.5, lon: 112.5 });
A('中点 t≈0.5', Math.abs(c.t - 0.5) < 0.01, `t=${c.t.toFixed(3)}`);
A('中点 p≈0', c.p < 1, `p=${c.p.toFixed(2)}km`);
c = corridor(S1, H1, { lat: 30.5, lon: 114 });
A('沿线偏北 p 有限', c.p > 20 && c.p < 50, `p=${c.p.toFixed(1)}`);
c = corridor(S1, H1, { lat: 30, lon: 110 });
A('学校端 t≈0', Math.abs(c.t) < 1e-6);
c = corridor(S1, H1, { lat: 31, lon: 115 });
A('家庭端 t≈1', Math.abs(c.t - 1) < 1e-6);
// 退化区间 L<15km: 武汉==武汉
const cd = corridor(武汉, 武汉, 北京南);
A('退化区间(L<15) t=0 p≈dist', cd.t === 0 && Math.abs(cd.p - dist(武汉, 北京南)) < 20, `p=${cd.p.toFixed(0)} vs ${dist(武汉, 北京南).toFixed(0)}`);

/* ---------- C. 直达判定边界 ---------- */
G('C. 直达判定 directCovered()');
const L1 = dist(S1, H1); // ≈492km, pMax=max(45,0.18L)≈88.6km
A('区间长 492km → pMax≈88.6km', Math.max(45, 0.18 * L1) > 85 && Math.max(45, 0.18 * L1) < 92);
A('t=1.12 边界内 → 直达', directCovered(S1, H1, { lat: 31.12, lon: 115.6 }) === true);
A('t=1.13 边界外 → 非直达', directCovered(S1, H1, { lat: 31.13, lon: 115.6 }) === false);
A('t=-0.10 边界内 → 直达', directCovered(S1, H1, { lat: 29.9, lon: 109.5 }) === true);
A('t=-0.15 边界外 → 非直达', directCovered(S1, H1, { lat: 29.85, lon: 109.25 }) === false);
A('t=0.5 p=32km → 直达', directCovered(S1, H1, { lat: 30.5, lon: 114 }) === true);
A('t=0.5 p=161km → 非直达', directCovered(S1, H1, { lat: 32, lon: 112.5 }) === false);
// 真实数据
const 长沙南 = o('长沙南'), 岳阳东 = o('岳阳东');
A('岳阳东(沿线) → 直达', directCovered(武汉, 长沙南, 岳阳东) === true);
A('北京南(走廊外) → 非直达', directCovered(武汉, 长沙南, 北京南) === false);
// 退化区间: L<15 → 50km 半径
A('S==H 且 D 近 → 直达', directCovered(武汉, 武汉, o('汉口')) === true);
A('S==H 且 D 远 → 非直达', directCovered(武汉, 武汉, 北京南) === false);

/* ---------- D. 中转判定 ---------- */
G('D. 中转判定 transferPlan()');
setRatio(1.5);
const 北京西2 = 北京西;
A('终点超区间(广州) → 不可中转', transferPlan(武汉, 长沙南, 广州南) === null);
A('石家庄在走廊外(t=-1.17)不可作中转', transferPlan(武汉, 长沙南, 北京南) === null);
A('郑州东在走廊外不可作中转', (() => { const t = transferPlan(武汉, 长沙南, o('西安北')); return t === null || t.station.name !== '郑州东'; })());
A('非枢纽站不作中转(信阳东被排除 → 全价)', transferPlan(武汉, 长沙南, o('信阳东')) === null);
A('T==D(终点即枢纽)跳过自身', (() => { const t = transferPlan(武汉, 长沙南, 长沙南); return t === null; })());
A('S==H 时 T==S 被跳过但仍能找到其他枢纽', transferPlan(武汉, 武汉, 北京南) !== null);
A('终点走廊内(株洲西)才可考虑中转', transferPlan(武汉, 长沙南, o('株洲西')) !== null);
// 终点走廊外(拉萨) → 任何 ratio 都不可中转(硬约束)
const 拉萨 = o('拉萨');
[1.0, 1.09, 1.1, 1.5, 2.2].forEach(r => { setRatio(r); A('拉萨走廊外: ratio=' + r + ' 均拒', transferPlan(武汉, 长沙南, 拉萨) === null); });
setRatio(1.5);
A('走廊内株洲西: ratio=1.5 可中转判定', transferPlan(武汉, 长沙南, o('株洲西')) !== null);

/* ---------- E. 单程规划 planOneWay ---------- */
G('E. 单程规划 planOneWay()');
setRatio(1.5);
A('北京=全价', P(武汉, 长沙南, 北京南).mode === 'full');
A('广州(终点超区间)=全价', P(武汉, 长沙南, 广州南).mode === 'full');
A('重庆(终点超区间)=全价', P(武汉, 长沙南, o('重庆北')).mode === 'full');
A('西安=全价', P(武汉, 长沙南, o('西安北')).mode === 'full');
A('岳阳=直达', P(武汉, 长沙南, 岳阳东).mode === 'direct');
A('D==S → 直达', P(武汉, 长沙南, 武汉).mode === 'direct');
A('S==H 近D → 直达', P(武汉, 武汉, o('汉口')).mode === 'direct');
A('S==H 远D → 中转(经某枢纽)', (() => { const p = P(武汉, 武汉, 北京南); return p.mode === 'transfer' && p.ok === 1; })());
A('所有结果数值有限(无NaN)', (() => {
  const pts = [北京南, 广州南, 拉萨, 岳阳东, o('重庆北'), o('西安北'), o('哈尔滨西')];
  return pts.every(d => { const p = P(武汉, 长沙南, d); return [p.direct, p.via].every(v => v == null || isFinite(v)); });
})());

/* ---------- F. 计次与汇总 evalWith ---------- */
G('F. 计次与汇总 evalWith()');
state.school = { station: 武汉 };
state.trips = [
  { id: 1, text: '北京', station: 北京南, round: true },
  { id: 2, text: '广州', station: 广州南, round: true },
  { id: 3, text: '重庆', station: o('重庆北'), round: true },
  { id: 4, text: '西安', station: o('西安北'), round: false },
];
let r = evalWith(长沙南);
A('当前区间: 0次/覆盖0/全价4(终点全超区间)', r.used === 0 && r.covered === 0 && r.fail === 4);
A('未覆盖的往返行程=0次', r.perTrip[1].used === 0);
A('单程未覆盖=0次', r.perTrip[3].used === 0);
A('覆盖行程合计=直接+中转', r.covered === r.direct + r.transfer);
A('未覆盖=全价', r.fail === r.perTrip.filter(t => !t.plan.ok).length);
A('used=Σ perTrip.used', r.used === r.perTrip.reduce((s, t) => s + t.used, 0));
A('家=石家庄: 0次/覆盖0', (r = evalWith(o('石家庄')), r.used === 0 && r.covered === 0));
A('家=郑州东: 0次/覆盖0', (r = evalWith(o('郑州东')), r.used === 0 && r.covered === 0));
A('家=重庆北: 2次/覆盖1(重庆往返直达)', (r = evalWith(o('重庆北')), r.used === 2 && r.covered === 1));
A('家=重庆(同城站): 2次/覆盖1', (r = evalWith(o('重庆')), r.used === 2 && r.covered === 1));
A('无行程: 0次/覆盖0', (state.trips = [], (r = evalWith(长沙南), r.used === 0 && r.covered === 0)));
state.trips = [
  { id: 1, text: '北京', station: 北京南, round: true },
  { id: 2, text: '广州', station: 广州南, round: true },
  { id: 3, text: '重庆', station: o('重庆北'), round: true },
  { id: 4, text: '西安', station: o('西安北'), round: false },
];

/* ---------- G. 用户实测场景(北京西↔贵阳北, 8行程=15次) ---------- */
G('G. 用户实测场景回归');
state.school = { station: 北京西 };
state.trips = [
  { id: 1, station: 北京西, round: true }, { id: 2, station: 广州南, round: true },
  { id: 3, station: o('重庆北'), round: true }, { id: 4, station: o('西安北'), round: false },
  { id: 5, station: o('重庆北'), round: true }, { id: 6, station: 北京西, round: true },
  { id: 7, station: 武汉, round: true }, { id: 8, station: 武汉, round: true },
];
r = evalWith(贵阳北);
A('8行程=13次/覆盖7(广州全价, 西安在走廊内直达)', r.used === 13 && r.covered === 7 && r.fail === 1);
A('广州(终点超区间)=全价', r.perTrip[1].plan.mode === 'full');
A('武汉经北京南中转(学校端枢纽)', r.perTrip[6].plan.mode === 'transfer' && r.perTrip[6].plan.station.name === '北京南');
A('北京(0km)直达', r.perTrip[0].plan.mode === 'direct' && r.perTrip[0].plan.direct === 0);
A('西安(走廊内)=直达1次', r.perTrip[3].plan.mode === 'direct' && r.perTrip[3].used === 1);

/* ---------- H. 区间优化智能最优 ---------- */
G('H. 区间优化(智能最优)');
const cur = evalWith(贵阳北);
const best = STATIONS.map(s => {
  const rr = evalWith(o(s[0]));
  return { name: s[0], used: rr.used, covered: rr.covered };
}).filter(c => c.name !== '北京西' && c.covered >= Math.max(1, cur.covered))
  .sort((a, b) => a.used - b.used || b.covered - a.covered)[0];
A('智能最优 ≤ 当前 13 次', best.used <= 13, `实际 ${best.name} ${best.used}次`);
A('智能最优保持覆盖 ≥7', best.covered >= 7);
A('所有候选结果有限', STATIONS.every(s => { const rr = evalWith(o(s[0])); return isFinite(rr.used) && isFinite(rr.covered); }));

/* ---------- I. 数据完整性 ---------- */
G('I. 数据完整性');
A('车站数=367', STATIONS.length === 367);
A('枢纽数=35', HUBS.length === 35);
A('站名唯一', new Set(STATIONS.map(s => s[0])).size === STATIONS.length);
A('坐标范围合法(纬度15-55, 经度73-135)', STATIONS.every(s => s[2] > 15 && s[2] < 55 && s[3] > 73 && s[3] < 135));
A('城市字段非空', STATIONS.every(s => typeof s[1] === 'string' && s[1].length > 0));
A('枢纽都是合法车站', HUBS.every(s => ST[s[0]] !== undefined));
A('全站数量=枢纽+非枢纽', STATIONS.length === HUBS.length + STATIONS.filter(s => !s[4]).length);

/* ---------- J. 极端/退化输入 ---------- */
G('J. 极端与退化输入');
A('D=极端坐标仍行为一致(经区间端点中转, 无NaN)', (() => { const p = P(武汉, 长沙南, { name: 'X', lat: -30, lon: 90 }); return (p.mode === 'transfer' || p.mode === 'full') && isFinite(p.direct); })());
A('D 与 S 同坐标不同对象', P(武汉, 长沙南, { name: 'Y', lat: 30.607, lon: 114.422 }).mode === 'direct');
A('S 与 H 重合且 D 极远', (() => { const p = P(武汉, 武汉, { name: 'Z', lat: 52.5, lon: 120 }); return p.mode === 'full' || p.ok === 1; })());
setRatio(2.2);
A('ratio=2.2: 北京(走廊外)仍不可中转', transferPlan(武汉, 长沙南, 北京南) === null);
A('ratio=2.2: 走廊外的石家庄仍不被选为换乘站', (() => { const t = transferPlan(武汉, 长沙南, 北京南); return t === null || t.station.name !== '石家庄'; })());
setRatio(1.5);

/* ---------- K. 串联路线模式 ---------- */
G('K. 串联路线（北京西↔贵阳北）');
const K = {
  S: o('北京西'), H: o('贵阳北'),
};
let kc = chainEval(K.S, K.H, [o('郑州东'), o('长沙南')]);
A('K1 顺路串联(郑州→长沙)可合并为1次', kc.ok === true && kc.segs.length === 3);
A('K1 无折返', kc.foldback === false);
A('K1 全程 2008km, 最大绕行 1.16×≤1.5', kc.total === 2008 && kc.maxRatio === 1.16);
A('K1 每段都在区间内', kc.segs.every(s => s.inInt));
kc = chainEval(K.S, K.H, [o('长沙南'), o('郑州东')]);
A('K2 反序 → 折返警告、不可合并', kc.foldback === true && kc.ok === false);
kc = chainEval(K.S, K.H, [o('郑州东'), o('广州南'), o('长沙南')]);
A('K3 区间外目的地(广州) → 拦截', kc.ok === false && kc.segs.some(s => !s.inInt));
kc = chainEval(K.S, K.H, [o('郑州东'), o('乌鲁木齐'), o('长沙南')]);
A('K4 绕行超标 → 不可合并', kc.ok === false && kc.maxRatio > 1.5);
kc = chainEval(K.S, K.H, [o('长沙南')]);
A('K5 单中间站串联 ok', kc.ok === true && kc.segs.length === 2);
A('K6 无行程 → null', chainEval(K.S, K.H, []) === null);
A('K7 无学校 → null', chainEval(null, K.H, [o('郑州东')]) === null);

/* ---------- L. 行程出发地 ---------- */
G('L. 行程出发地（区间 南宁东↔济南西）');
const { planTrip } = new Function(code[1] + '\nreturn {planTrip};')();
const LS = o('南宁东'), LH = o('济南西');
let lp = planTrip(LS, LH, o('天津'), o('济南西'));
A('L1 天津→济南: 边缘延伸带(实测可买) → edge', lp.mode === 'edge' && lp.ok === 1);
lp = planTrip(LS, LH, o('武汉'), o('济南西'));
A('L2 武汉→济南: 区间内 → 可出票', lp.ok === 1);
lp = planTrip(LS, LH, o('郑州东'), o('长沙南'));
A('L3 郑州→长沙: 两端走廊内 → 可出票', lp.ok === 1);
lp = planTrip(LS, LH, o('济南西'), o('南宁东'));
A('L4 济南→南宁: 反向行程合法', lp.ok === 1);
lp = planTrip(LS, LH, o('天津'), o('上海虹桥'));
A('L5 天津→上海: 终点远离区间 → 全价', lp.mode === 'full', lp.mode);
A('L7 哈尔滨→济南: 超出延伸带 → 全价', planTrip(LS, LH, o('哈尔滨西'), o('济南西')).mode === 'full');
A('L8 沈阳→济南: 边缘最远可买', planTrip(LS, LH, o('沈阳'), o('济南西')).mode === 'edge');
lp = planTrip(LS, LH, LS, o('武汉'));
const lq = planOneWay(LS, LH, o('武汉'));
A('L6 O=S 时 planTrip 与 planOneWay 等价', lp.mode === lq.mode && lp.ok === lq.ok);

/* ---------- M. 最优分段 planGroups（分组计次 / 拉远家基础） ---------- */
G('M. 最优分段 planGroups');
const mkState = (schoolName) => { state.school = { station: o(schoolName) }; state.chainRound = false; state.ratio = 1.5; };
const pg = cc => planGroups(cc);

mkState('武汉');
const m1 = pg(chainEval(o('武汉'), o('北京西'), [o('郑州东'), o('石家庄')]));
A('M1 全程学生票 → 1组1次', m1.groups.length === 1 && m1.full.length === 0 && m1.used === 1,
  `groups=${m1.groups.length} full=${m1.full.length} used=${m1.used}`);

mkState('清远');
const m2 = pg(chainEval(o('清远'), o('北京西'), [o('武汉'), o('上海虹桥')]));
A('M2 中间超区间站(上海)断开: 前段1组+后段因发站超区间也红 → 1组2全价',
  m2.groups.length === 1 && m2.full.length === 2 && m2.used === 1,
  `groups=${m2.groups.length} full=${m2.full.length} used=${m2.used}`);

mkState('石家庄');
const m3 = pg(chainEval(o('石家庄'), o('贵阳北'), [o('长沙南'), o('岳阳东')]));
A('M3 折返段各自成组(3段全折返) → 3组0全价', m3.groups.length === 3 && m3.full.length === 0 && m3.used === 3,
  `groups=${m3.groups.length} full=${m3.full.length} used=${m3.used}`);

mkState('武汉');
state.ratio = 1.0; // 阈值=1.0: 任何累计绕行(1.010>1.0)都触发分段
const m4 = pg(chainEval(o('武汉'), o('北京西'), [o('郑州东'), o('石家庄')]));
state.ratio = 1.5;
A('M4 组内累计绕行超限 → 拆为2组', m4.groups.length === 2 && m4.used === 2,
  `groups=${m4.groups.length} used=${m4.used}`);

mkState('清远');
const m5 = pg(chainEval(o('清远'), o('广州南'), [o('武汉'), o('南京')]));
A('M5 全超区间(区间太小) → 0组3全价0次', m5.groups.length === 0 && m5.full.length === 3 && m5.used === 0,
  `groups=${m5.groups.length} full=${m5.full.length} used=${m5.used}`);

mkState('武汉');
const m6 = pg(chainEval(o('武汉'), o('北京西'), [o('郑州东')]));
A('M6 单行程 → 1组1次', m6.groups.length === 1 && m6.used === 1);

state.chainRound = true;
const m7 = pg(chainEval(o('武汉'), o('北京西'), [o('郑州东')]));
state.chainRound = false;
A('M7 往返 → used×2', m7.used === 2, `used=${m7.used}`);

mkState('武汉');
const m8 = pg(chainEval(o('武汉'), o('长沙南'), [o('长沙南')]));
A('M8 终点=家锚点 → 1组1次', m8.groups.length === 1 && m8.used === 1);

A('M9 空链 → null', planGroups(null) === null);

done();
