/* 逻辑一致性测试: 网页版(index.html PURE LOGIC) vs 小程序版(miniprogram/utils/logic.js)
 * 同一批场景在两份实现上运行, 结果必须完全一致 → 证明移植零偏差 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

/* 网页版: 从 index.html 抽取 PURE LOGIC 段 eval */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const s = html.indexOf('// ==== PURE LOGIC START ====');
const e = html.indexOf('// ==== PURE LOGIC END ====') + '// ==== PURE LOGIC END ===='.length;
const webLogic = new Function(html.slice(s, e) + '\nreturn { chainEval, chainEvalCurrent, chainMidStations, chainEndPoint, planGroups, evalWith, evalAll, planTrip, dist, corridor, STATIONS, state, stToObj, foldBackBadStation };')();
/* 小程序版 */
const mpLogic = require('../miniprogram/utils/logic.js');

/* 场景: 学校/家/行程/链参数 */
const SCENES = [
  { name: '空链', S: '武汉', H: '长沙', trips: [], chainEnd: null, routeStart: null, ratio: 1.5, round: false },
  { name: '演示线', S: '武汉', H: '长沙', trips: ['岳阳', '重庆'], chainEnd: null, routeStart: null, ratio: 1.5, round: false },
  { name: '往返', S: '武汉', H: '长沙', trips: ['岳阳', '重庆'], chainEnd: null, routeStart: null, ratio: 1.5, round: true },
  { name: '折返', S: '石家庄', H: '贵阳北', trips: ['长沙', '岳阳'], chainEnd: null, routeStart: null, ratio: 1.5, round: false },
  { name: '自定义终点', S: '武汉', H: '长沙', trips: ['岳阳', '重庆'], chainEnd: '广州', routeStart: null, ratio: 1.5, round: false },
  { name: '自定义起点', S: '武汉', H: '长沙', trips: ['岳阳', '重庆'], chainEnd: null, routeStart: '郑州', ratio: 1.5, round: false },
  { name: '绕行严', S: '武汉', H: '长沙', trips: ['岳阳', '重庆'], chainEnd: null, routeStart: null, ratio: 1.0, round: false },
  { name: '拉远家', S: '清远', H: '广州', trips: ['武汉', '南京', '上海', '扬州', '苏州', '杭州', '广州'], chainEnd: null, routeStart: null, ratio: 1.5, round: false },
  { name: '同城', S: '武汉', H: '武汉', trips: ['长沙'], chainEnd: null, routeStart: null, ratio: 1.5, round: false },
  { name: '长途', S: '哈尔滨西', H: '三亚', trips: ['北京', '郑州', '武汉', '长沙', '广州'], chainEnd: null, routeStart: null, ratio: 1.5, round: false },
];

function setup(lg, sc) {
  const st = (name) => {
    const row = lg.STATIONS.find(x => x[0] === name) || lg.STATIONS.find(x => x[1] === name) || lg.STATIONS.find(x => x[1].includes(name));
    return lg.stToObj(row);
  };
  lg.state.school = { text: sc.S, point: { lat: st(sc.S).lat, lon: st(sc.S).lon }, station: st(sc.S) };
  lg.state.home = { text: sc.H, point: { lat: st(sc.H).lat, lon: st(sc.H).lon }, station: st(sc.H) };
  lg.state.trips = sc.trips.map((name, i) => ({
    id: i + 1, text: name, point: { lat: st(name).lat, lon: st(name).lon }, station: st(name), round: false,
  }));
  lg.state.chainEnd = sc.chainEnd ? st(sc.chainEnd) : null;
  lg.state.routeStart = sc.routeStart ? st(sc.routeStart) : null;
  lg.state.ratio = sc.ratio;
  lg.state.chainRound = sc.round;
  lg.state.chainMode = true;
}

const fns = ['chainEvalCurrent', 'planGroups', 'evalAll', 'foldBackBadStation'];
let n = 0;
for (const sc of SCENES) {
  setup(webLogic, sc);
  setup(mpLogic, sc);
  for (const fn of fns) {
    const a = JSON.parse(JSON.stringify(webLogic[fn]()));
    const b = JSON.parse(JSON.stringify(mpLogic[fn]()));
    try {
      assert.deepStrictEqual(b, a);
      n++;
      console.log('✓', sc.name, '·', fn);
    } catch (err) {
      console.error('✗', sc.name, '·', fn);
      console.error('  web:', JSON.stringify(a).slice(0, 300));
      console.error('  mp :', JSON.stringify(b).slice(0, 300));
      process.exit(1);
    }
  }
  // 优化器候选抽查: 前3个站的 chainEval 一致
  for (const cand of ['北京西', '广州南', '西安北', '上海虹桥']) {
    const row = webLogic.STATIONS.find(x => x[0] === cand);
    if (!row) continue;
    const S = webLogic.state.school.station;
    const a = webLogic.chainEval(S, webLogic.stToObj(row), webLogic.chainMidStations(), webLogic.state.routeStart || S, webLogic.chainEndPoint() || webLogic.stToObj(row));
    const b = mpLogic.chainEval(mpLogic.state.school.station, mpLogic.stToObj(row), mpLogic.chainMidStations(), mpLogic.state.routeStart || mpLogic.state.school.station, mpLogic.chainEndPoint() || mpLogic.stToObj(row));
    assert.deepStrictEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)));
    n++;
  }
}
// 独立模式抽查
for (const sc of SCENES.slice(0, 6)) {
  setup(webLogic, sc); setup(mpLogic, sc);
  webLogic.state.chainMode = false; mpLogic.state.chainMode = false;
  const a = JSON.parse(JSON.stringify(webLogic.evalAll()));
  const b = JSON.parse(JSON.stringify(mpLogic.evalAll()));
  assert.deepStrictEqual(b, a);
  n++;
}
console.log(`\n结果: ${n} 项网页版/小程序版对比全部一致`);
