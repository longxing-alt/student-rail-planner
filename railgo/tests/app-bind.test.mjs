/* RailGo 新 UI 绑定测试 — TripState 协调层 + 页面投影
 * 独立于既有 10 套测试; 不修改任何旧断言。
 * 用法: node --test railgo/tests/app-bind.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(here, '..');

const C = require('../railgo.core.js');
const M = require('../mock-data.js');

/* 在独立沙箱里加载 TripState(它是 UMD, 依赖注入 Core/Mock) */
function loadTrip() {
  const src = fs.readFileSync(path.join(BASE, 'trip-state.js'), 'utf8');
  const sandbox = { window: {}, console };
  new Function('window', 'console', src + '\n;return window.RailGoTrip;')(sandbox.window, console);
  const T = sandbox.window.RailGoTrip;
  T.useCore(C, M);
  return T;
}
function tripWithBJSH() {
  const T = loadTrip();
  T.setEndpoint('origin', '北京');
  T.setEndpoint('destination', '上海');
  T.state.days = 5; T.state.budget = 1860;
  T.recomputeRoute();
  return T;
}

/* ==================== T: TripState 状态层 ==================== */

test('T1. 起终点设定后生成候选, 总览来自 Core(不自行计算)', () => {
  const T = tripWithBJSH();
  assert.ok(T.state.candidates.length >= 1, '生成候选');
  const tot = T.state.totals;
  assert.ok(tot && typeof tot.total === 'number', '有总览');
  // 与 Core 直接调用一致(证明总览取自 Core)
  const direct = C.estimateBudget(['bj', 'sh'], { days: 5 });
  assert.strictEqual(tot.total, direct.total, '总价与 Core estimateBudget 一致');
  assert.strictEqual(tot.rail, direct.rail, '铁路费用一致');
  assert.strictEqual(tot.est, true, '明确标记估算');
});

test('T2. 沿途候选不含数字评分, 只有序号 + 自然语言理由', () => {
  const T = tripWithBJSH();
  const list = T.stopCandidates();
  assert.ok(list.length >= 1, '有沿途候选');
  list.forEach(c => {
    assert.strictEqual(typeof c.rank, 'number', '有序号');
    assert.ok(typeof c.name === 'string' && c.name.length > 0, '有城市名');
    assert.ok(Array.isArray(c.reasons) && c.reasons.length > 0, '有自然语言理由');
    assert.ok(c.score === undefined, '不得暴露 score(UI 不显示数字评分)');
    c.reasons.forEach(r => assert.ok(!/^[A-Z_]+$/.test(r), '理由不得是英文 code'));
  });
  // 南京应排第一(与 Core suggestStop 一致)
  assert.strictEqual(list[0].name, '南京', '首个推荐=南京');
});

test('T3. 加入中途城市 → 路线更新 + 总价变化 + 体验非空', () => {
  const T = tripWithBJSH();
  const before = T.state.totals.total;
  assert.ok(T.addStop('nj'), '加入成功');
  assert.deepStrictEqual(T.state.routeCities.map(n => n.name), ['北京', '南京', '上海']);
  assert.notStrictEqual(T.state.totals.total, before, '总价随城市增加变化');
  assert.ok(T.state.cityPlans.nj.experiences.length > 0, '加入后立即有体验(按停留时长)');
});

test('T4. 重复加入同一城市被拒绝', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  assert.strictEqual(T.addStop('nj'), false, '不可重复加入');
  assert.deepStrictEqual(T.state.routeCities.map(n => n.name), ['北京', '南京', '上海']);
});

test('T5. 移除中途城市 → 恢复原路线与总价', () => {
  const T = tripWithBJSH();
  const base = T.state.totals.total;
  T.addStop('nj');
  assert.ok(T.removeStop('nj'), '移除成功');
  assert.deepStrictEqual(T.state.routeCities.map(n => n.name), ['北京', '上海']);
  assert.strictEqual(T.state.totals.total, base, '总价回到基准');
  assert.strictEqual(T.state.cityPlans.nj, undefined, '城市计划已清除不留残留');
});

test('T6. 停留时长 4h → 8h 增加体验数量', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(4); T.fillExperiences('nj', {});
  const n4 = T.state.cityPlans.nj.experiences.length;
  T.setStopoverHours(8);
  const n8 = T.state.cityPlans.nj.experiences.length;
  assert.ok(n8 > n4, `8h 体验(${n8}) 应多于 4h(${n4})`);
});

test('T7. 缩短停留时长时优先保留锁定项', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(8);
  const first = T.state.cityPlans.nj.experiences[0];
  T.toggleLock('nj', first.id);
  T.setStopoverHours(2);
  const after = T.state.cityPlans.nj.experiences;
  assert.ok(after.some(e => e.id === first.id), '锁定项在缩短停留后仍保留');
});

test('T8. 锁定项不被"换一组"替换', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  const exps = T.state.cityPlans.nj.experiences;
  assert.ok(exps.length >= 2, '前提: 至少 2 个体验');
  T.toggleLock('nj', exps[0].id);
  T.rotateExperiences('nj');
  assert.ok(T.state.cityPlans.nj.experiences.some(e => e.id === exps[0].id), '锁定项仍在');
  assert.ok(T.state.cityPlans.nj.experiences.find(e => e.id === exps[0].id).locked, '锁定标记保留');
});

test('T9. "不想去"后换一组不会再次出现, 且补入替代', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  const exps = T.state.cityPlans.nj.experiences;
  const target = exps.find(e => !e.locked);
  T.toggleExcluded('nj', target.id);
  assert.ok(!T.state.cityPlans.nj.experiences.some(e => e.id === target.id), '立即移出');
  T.rotateExperiences('nj');
  T.rotateExperiences('nj');
  assert.ok(!T.state.cityPlans.nj.experiences.some(e => e.id === target.id), '换两组后仍不出现');
});

test('T10. "去过"后不再被推荐', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(2);
  const target = T.state.cityPlans.nj.experiences[0];
  T.toggleVisited('nj', target.id);
  T.removeExperience('nj', target.id);
  T.fillExperiences('nj', {});
  assert.ok(!T.state.cityPlans.nj.experiences.some(e => e.id === target.id), '去过的点不再补回');
});

test('T11. 删除体验后不原样补回, 且其余体验保留', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(8);
  const before = T.state.cityPlans.nj.experiences.map(e => e.id);
  const victim = before[1];
  assert.ok(T.removeExperience('nj', victim), '删除成功');
  const after = T.state.cityPlans.nj.experiences.map(e => e.id);
  assert.ok(!after.includes(victim), '被删项不再出现(不被原样补回)');
  assert.ok(after.includes(before[0]), '其它体验仍在');
});

test('T11b. 锁定项不可删除(需先解锁)', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  const exps = T.state.cityPlans.nj.experiences;
  T.toggleLock('nj', exps[0].id);
  assert.strictEqual(T.removeExperience('nj', exps[0].id), false, '锁定项拒绝删除');
  assert.ok(T.state.cityPlans.nj.experiences.some(e => e.id === exps[0].id), '锁定项仍在');
});

test('T12. 体验总时长随停留时长变化(总览联动)', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(2);
  const h2 = T.state.totals.experienceHours;
  T.setStopoverHours(8);
  const h8 = T.state.totals.experienceHours;
  assert.ok(h8 > h2, `体验时长随停留增加(${h2} → ${h8})`);
});

test('T13. 偏好变化重算候选与候选排序(消费 Core)', () => {
  const T = tripWithBJSH();
  T.state.preference.preset = 'money';
  T.recomputeRoute();
  assert.ok(T.state.candidates.length >= 1, '重算后仍有候选');
  const list = T.stopCandidates();
  assert.ok(list.length >= 1, '候选列表可用');
  assert.ok(list.every(c => c.score === undefined), '仍不暴露数字评分');
});

test('T14. 预算硬约束: 极小预算下总览仍来自 Core 且标记估算', () => {
  const T = tripWithBJSH();
  T.state.budget = 300;
  T.recomputeRoute();
  const tot = T.state.totals;
  assert.ok(tot && typeof tot.total === 'number', '有总览');
  const direct = C.estimateBudget(['bj', 'sh'], { days: 5 });
  assert.strictEqual(tot.total, direct.total, '即使超预算也与 Core 一致');
});

test('T15. 非法城市输入给出错误状态而非抛异常', () => {
  const T = loadTrip();
  const r = T.setEndpoint('origin', '不存在的城市名');
  assert.strictEqual(r, null, '解析失败返回 null');
  assert.strictEqual(T.state.ui.status, 'error', '进入 error 状态');
  assert.ok(T.state.ui.error.length > 0, '有可展示的错误文案');
});

test('T16. 3 个城市的多城市路线(北京→南京→杭州→上海)', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.addStop('hz');
  assert.deepStrictEqual(T.state.routeCities.map(n => n.name), ['北京', '南京', '杭州', '上海']);
  const tot = T.state.totals;
  const direct = C.estimateBudget(T.state.candidates[T.state.activeCandidate].cities, { days: 5 });
  assert.strictEqual(tot.total, direct.total, '多城市总价仍来自 Core');
});

test('T17. 城市计划之间互相独立(不串数据)', () => {
  const T = tripWithBJSH();
  T.addStop('nj'); T.addStop('jn');
  T.setStopoverHours(8);
  T.fillExperiences('nj', {}); T.fillExperiences('jn', {});
  const njIds = T.state.cityPlans.nj.experiences.map(e => e.id);
  const jnIds = T.state.cityPlans.jn.experiences.map(e => e.id);
  assert.ok(njIds.length && jnIds.length, '两城都有体验');
  assert.ok(njIds.every(id => id.startsWith('nj-')), '南京体验均属南京');
  assert.ok(jnIds.every(id => id.startsWith('jn-')), '济南体验均属济南');
  assert.strictEqual(njIds.filter(id => jnIds.includes(id)).length, 0, '无交叉');
});

test('T18. 所有体验点都有坐标(保证能画到地图)', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(8);
  T.state.cityPlans.nj.experiences.forEach(x => {
    assert.strictEqual(typeof x.lat, 'number', x.name + ' 有 lat');
    assert.strictEqual(typeof x.lng, 'number', x.name + ' 有 lng');
  });
});

test('T19. 不修改 Core: 调用前后 Core 导出与关键函数仍可用', () => {
  const T = tripWithBJSH();
  T.addStop('nj');
  T.setStopoverHours(8);
  T.rotateExperiences('nj');
  ['generateRouteCandidates', 'evaluateStop', 'evaluateStops', 'placeValueOf', 'destinationEvaluation', 'estimateBudget', 'railBetween', 'suggestStop', 'optimizeStopSelection']
    .forEach(fn => assert.strictEqual(typeof C[fn], 'function', fn + ' 仍存在'));
});

test('T20. 页面文件齐备且引用顺序正确', () => {
  ['app.html', 'app.css', 'app.js', 'trip-state.js'].forEach(f => {
    assert.ok(fs.existsSync(path.join(BASE, f)), f + ' 存在');
  });
  const html = fs.readFileSync(path.join(BASE, 'app.html'), 'utf8');
  const order = ['mock-data.js', 'railgo.core.js', 'baidu-api.js', 'baidu-map.js', 'trip-state.js', 'app.js'];
  let last = -1;
  order.forEach(f => {
    const i = html.indexOf(f);
    assert.ok(i > last, f + ' 在引用顺序中位置正确');
    last = i;
  });
  // 复用既有地图层, 不重复引入
  assert.ok(!/new BMap|BMapGL\.Map/.test(html), '不在页面内直接创建地图实例');
});

test('T21. 旧页面未被改动(旧测试基线不受影响)', () => {
  const old = fs.readFileSync(path.join(BASE, 'railgo.html'), 'utf8');
  assert.ok(old.indexOf('id="candidateList"') >= 0, '旧页面结构保持');
  assert.ok(old.indexOf('id="mapSvg"') >= 0, '旧页面地图容器保持');
  const app = fs.readFileSync(path.join(BASE, 'app.html'), 'utf8');
  assert.ok(app.indexOf('app.js') >= 0, '新页面使用独立绑定层');
});

test('T22. 新 UI 不显示英文 reason code / 开发者占位文案', () => {
  // 只检查"会出现在界面上的字符串", 不误判代码标识符(如 paceToPreference / typeof undefined)
  const files = ['app.html', 'app.js', 'trip-state.js'];
  const bad = /Map Engine Active|Itinerary|Mapbox|TODO|FIXME/;
  files.forEach(f => {
    const s = fs.readFileSync(path.join(BASE, f), 'utf8');
    assert.ok(!bad.test(s), f + ' 无开发者占位文案');
  });
  // 界面文案中不得出现裸的 undefined / null / NaN 字面量
  const html = fs.readFileSync(path.join(BASE, 'app.html'), 'utf8');
  assert.ok(!/>\s*(undefined|null|NaN)\s*</.test(html), 'HTML 文案无 undefined/null/NaN');
  // 代码中不得把内部 reason code 直接拼进文案
  const js = fs.readFileSync(path.join(BASE, 'app.js'), 'utf8');
  assert.ok(!/textContent\s*=\s*[^;]*reasonCodes/.test(js), '不把 reasonCodes 直接当文案');
  assert.ok(!/\+\s*codes\.join/.test(js), '不拼接 codes 数组');
});
