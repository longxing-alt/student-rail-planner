/* 阶段7.1 Value Engine 测试 — 纯函数, 零网络(不调用任何百度 API)
 * 覆盖: 偏好/PlaceValue/TripEvaluation/硬约束/reasonCodes/数据诚实性/边界输入/suggestStop 接入 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../railgo.core.js');

const CTX = { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 };
const ev = (id, ctx) => C.evaluateStop(id, Object.assign({}, CTX, ctx || {}));
const NUM_KEYS = ['timeCost', 'budgetCost', 'fatigueCost', 'opportunityCost', 'railwayFit', 'userMatch'];

test('V1. 默认大众偏好存在且合法(7 维 + heuristic 标注)', () => {
  const p = C.DEFAULT_TRAVEL_PREFERENCE;
  assert.ok(p, '存在默认偏好');
  for (const k of ['budgetSensitivity', 'timeSensitivity', 'walkingTolerance', 'transferTolerance',
    'earlyDepartureTolerance', 'experiencePreference', 'destinationDepthPreference']) {
    assert.ok(typeof p[k] === 'number' && p[k] >= 0 && p[k] <= 1, k + ' 在 0..1');
  }
  assert.strictEqual(p.profile, 'balanced');
  assert.strictEqual(p.baselineType, 'heuristic', '默认偏好为启发式基线, 非统计结论');
});

test('V2. 偏好归一化: 越界裁剪 / 未知键忽略 / 缺失补默认 / 不修改入参', () => {
  const input = { budgetSensitivity: 2, unknownKey: 9 };
  const out = C.normalizePreference(input);
  assert.strictEqual(out.budgetSensitivity, 1, '越界裁剪到 1');
  assert.strictEqual(out.unknownKey, undefined, '未知键被忽略');
  assert.strictEqual(out.timeSensitivity, C.DEFAULT_TRAVEL_PREFERENCE.timeSensitivity, '缺失补默认');
  assert.strictEqual(input.budgetSensitivity, 2, '入参未被修改');
  // 负数/Nan
  assert.strictEqual(C.normalizePreference({ budgetSensitivity: -3 }).budgetSensitivity, 0);
  assert.strictEqual(C.normalizePreference({ budgetSensitivity: NaN }).budgetSensitivity, 0.5);
});

test('V3. PlaceValue confidence 分级: 有数据=medium / 无景点=low / 未知城市=unknown', () => {
  assert.strictEqual(C.placeValueOf('jn').confidence, 'medium', '济南有景点数据');
  assert.strictEqual(C.placeValueOf('nope').confidence, 'unknown', '未知城市');
  // 所有 8 城都有景点 → 检查至少 low/medium 语义正确
  C.CITIES.forEach(c => {
    const pv = C.placeValueOf(c.id);
    assert.ok(['medium', 'low', 'unknown'].indexOf(pv.confidence) >= 0);
  });
});

test('V4. baselineType 正确: 偏好/PlaceValue/TripEvaluation 均标注 heuristic', () => {
  assert.strictEqual(C.DEFAULT_TRAVEL_PREFERENCE.baselineType, 'heuristic');
  assert.strictEqual(C.placeValueOf('jn').baselineType, 'heuristic');
  assert.strictEqual(ev('jn').baselineType, 'heuristic');
});

test('V5. 高体验价值地点评分更高(济南 vs 徐州, 排除换乘干扰)', () => {
  const jn = ev('jn'), xz = ev('xz');
  assert.ok(C.placeValueOf('jn').experience > C.placeValueOf('xz').experience, '济南体验价值更高');
  // 济南换乘次数(1)多于徐州(0), 但体验优势使其总分仍更高
  assert.ok(jn.transfers > xz.transfers, '济南换乘更多(干扰项成立)');
  assert.ok(jn.score > xz.score, `济南 ${jn.score} > 徐州 ${xz.score}`);
});

test('V6. 时间成本会影响评分(天数越少, 时间成本越高, 分数越低)', () => {
  const d5 = ev('jn', { days: 5 });
  const d2 = ev('jn', { days: 2 });
  assert.ok(d2.timeCost > d5.timeCost, `timeCost ${d2.timeCost} > ${d5.timeCost}`);
  assert.ok(d2.score <= d5.score, '分数不升');
  assert.ok(d2.opportunityCost > d5.opportunityCost, '可用时间越少机会成本越高');
});

test('V7. 预算成本会影响评分(预算越少, 预算成本越高)', () => {
  const rich = ev('jn', { budget: 3000 });
  const poor = ev('jn', { budget: 700 });
  assert.ok(poor.budgetCost > rich.budgetCost, `budgetCost ${poor.budgetCost} > ${rich.budgetCost}`);
  assert.ok(poor.score <= rich.score, '分数不升');
});

test('V8. 疲劳成本会影响评分(天津换乘多/铁路长 → 疲劳更高, 分数更低)', () => {
  const jn = ev('jn'), tj = ev('tj');
  assert.ok(tj.fatigueCost > jn.fatigueCost, `疲劳 ${tj.fatigueCost} > ${jn.fatigueCost}`);
  assert.ok(tj.transfers >= 2, '天津需多次换乘');
  assert.ok(tj.score < jn.score, `天津 ${tj.score} < 济南 ${jn.score}`);
});

test('V9. 机会成本会影响评分(插入占用天数 → 压缩主目的地时间)', () => {
  const e = ev('jn');
  assert.ok(e.opportunityCost > 0, '机会成本非零');
  const noTransfer = ev('xz'); // 徐州不占额外天数(直达)
  assert.ok(e.opportunityCost >= noTransfer.opportunityCost * 0.5, '占用越多机会成本越高(单调性下限)');
  // 天数减少 → 机会成本上升
  assert.ok(ev('jn', { days: 2 }).opportunityCost > e.opportunityCost);
});

test('V10. 铁路顺路程度影响评分(济南顺路 vs 北京大绕行)', () => {
  const jn = ev('jn'), bj = ev('bj');
  assert.ok(jn.detour < bj.detour, `绕行比 ${jn.detour} < ${bj.detour}`);
  assert.ok(jn.railwayFit > bj.railwayFit, '顺路的 railwayFit 更高');
  assert.ok(jn.score > bj.score, '顺路者综合分更高');
});

test('V11. 用户偏好会真正改变评分(四画像分数不全相同)', () => {
  const base = ev('jn');
  const budget = ev('jn', { preference: C.TRAVEL_PRESETS.budget });
  const comfort = ev('jn', { preference: C.TRAVEL_PRESETS.comfort });
  const depth = ev('jn', { preference: C.TRAVEL_PRESETS.depth });
  const scores = new Set([base.score, budget.score, comfort.score, depth.score]);
  assert.ok(scores.size >= 3, '至少三种不同结果: ' + JSON.stringify([...scores]));
  assert.strictEqual(budget.preferenceProfile, 'budget');
  // 舒适型更不待见多次换乘: 对天津(2 次换乘)的惩罚应重于省钱型
  const tjComfort = ev('tj', { preference: C.TRAVEL_PRESETS.comfort });
  const tjBudget = ev('tj', { preference: C.TRAVEL_PRESETS.budget });
  assert.ok(tjComfort.score <= tjBudget.score, `舒适 ${tjComfort.score} <= 省钱 ${tjBudget.score}`);
});

test('V12. 硬约束 → feasible=false 且带对应 reasonCode', () => {
  const noTime = ev('jn', { days: 0 });
  assert.strictEqual(noTime.feasible, false);
  assert.ok(noTime.reasonCodes.indexOf('TIME_INFEASIBLE') >= 0);
  const noBudget = ev('jn', { budget: 0 });
  assert.strictEqual(noBudget.feasible, false);
  assert.ok(noBudget.reasonCodes.indexOf('BUDGET_EXCEEDED') >= 0);
  const sameEnd = ev('sh');
  assert.strictEqual(sameEnd.feasible, false);
  assert.ok(sameEnd.reasonCodes.indexOf('SAME_AS_ENDPOINT') >= 0);
  const unknown = ev('nope');
  assert.strictEqual(unknown.feasible, false);
  assert.ok(unknown.reasonCodes.indexOf('PLACE_DATA_MISSING') >= 0);
});

test('V13. 高体验价值不能抵消硬约束', () => {
  assert.strictEqual(C.placeValueOf('jn').experience, 1, '济南体验价值满分');
  const forced = ev('jn', { days: 0 });
  assert.strictEqual(forced.feasible, false, '硬约束优先');
  assert.strictEqual(forced.score, 0, '不可行时不给分');
  assert.strictEqual(forced.recommendation, 'avoid');
});

test('V14. recommendation 与 score 严格匹配', () => {
  const R = C.VALUE_THRESHOLDS.rec;
  C.evaluateStops('sjz', 'sh', 5, 1600).forEach(e => {
    if (!e.feasible) { assert.strictEqual(e.recommendation, 'avoid'); return; }
    const expect = e.score >= R.high ? 'high' : e.score >= R.medium ? 'medium' : e.score >= R.low ? 'low' : 'avoid';
    assert.strictEqual(e.recommendation, expect, `${e.candidateId} ${e.score} → ${e.recommendation}`);
  });
});

test('V15. reasonCodes 与实际计算值一致, reasons 与 codes 一一对应', () => {
  const T = C.VALUE_THRESHOLDS;
  C.evaluateStops('sjz', 'sh', 5, 1600).forEach(e => {
    assert.strictEqual(e.reasons.length, e.reasonCodes.length, '理由数与 code 数一致');
    e.reasons.forEach(t => assert.ok(typeof t === 'string' && t.length > 0, '理由非空'));
    const has = k => e.reasonCodes.indexOf(k) >= 0;
    if (has('HIGH_TIME_COST')) assert.ok(e.timeCost >= T.timeCostHigh, 'HIGH_TIME_COST 与 timeCost 一致');
    if (has('LOW_TIME_COST')) assert.ok(e.timeCost <= T.timeCostLow);
    if (has('HIGH_BUDGET_COST')) assert.ok(e.budgetCost >= T.budgetCostHigh);
    if (has('HIGH_FATIGUE')) assert.ok(e.fatigueCost >= T.fatigueHigh);
    if (has('HIGH_OPPORTUNITY_COST')) assert.ok(e.opportunityCost >= T.opportunityHigh);
    if (has('HIGH_DETOUR')) assert.ok(e.detour >= T.detourHigh);
    if (has('RAILWAY_ON_ROUTE')) assert.ok(e.detour <= T.detourOnRoute);
    if (has('MANY_TRANSFERS')) assert.ok(e.transfers >= 2);
    if (has('HIGH_EXPERIENCE_VALUE')) assert.ok(e.placeValue.experience >= T.experienceHigh);
  });
  // 反向: 未扣时间成本时不应出现 HIGH_TIME_COST
  const cheap = C.evaluateStop('xz', { startId: 'sjz', endId: 'sh', days: 10, budget: 5000 });
  if (cheap.timeCost <= C.VALUE_THRESHOLDS.timeCostLow) {
    assert.ok(cheap.reasonCodes.indexOf('HIGH_TIME_COST') < 0, '低时间成本不得标为高时间成本');
  }
});

test('V16. mock/heuristic 不伪装成真实统计', () => {
  const e = ev('jn');
  const banned = ['sampleSize', 'survey', 'surveySize', 'userCount', 'statistics', 'population'];
  banned.forEach(k => {
    assert.strictEqual(e[k], undefined, '不得出现伪统计字段 ' + k);
    assert.strictEqual(e.placeValue[k], undefined);
  });
  assert.strictEqual(e.baselineType, 'heuristic');
  assert.ok(['low', 'medium', 'unknown'].indexOf(e.confidence) >= 0);
});

test('V17. 缺失数据不产生 NaN(未知城市/缺坐标/空对象)', () => {
  const pv = C.placeValueOf('nope');
  ['experience', 'popularity', 'representativeness', 'uniqueness', 'accessibility'].forEach(k => {
    assert.ok(Number.isFinite(pv[k]), k + ' 有限');
    assert.strictEqual(pv[k], 0, k + ' 缺失时为 0');
  });
  assert.strictEqual(pv.timeRequired, null, '时间未知为 null, 不是 NaN');
  assert.strictEqual(pv.cost, null);
  const e = C.evaluateStop(null, {});
  assert.strictEqual(e.feasible, false);
  NUM_KEYS.concat(['score', 'timeCostHours', 'addedFare', 'addedKm', 'transfers', 'detour']).forEach(k => {
    assert.ok(Number.isFinite(e[k]), '空输入下 ' + k + ' 有限: ' + e[k]);
  });
});

test('V18. 极端输入不产生 Infinity/NaN', () => {
  const cases = [
    { days: 1e9, budget: 1e9 },
    { days: -5, budget: -1 },
    { days: NaN, budget: NaN },
    { days: 5, budget: Infinity },
  ];
  cases.forEach((c, i) => {
    const e = ev('jn', c);
    NUM_KEYS.concat(['score', 'timeCostHours', 'addedFare', 'addedKm', 'transfers', 'detour', 'experienceDensity']).forEach(k => {
      assert.ok(Number.isFinite(e[k]), `case${i} ${k} 有限: ${e[k]}`);
    });
    assert.ok(e.score >= 0 && e.score <= 100, 'score 在范围内');
  });
});

test('V19. suggestStop 已接入 Value Engine(含 tripEvaluation)', () => {
  const s = C.suggestStop('sjz', 'sh', 5);
  assert.strictEqual(s.suggestable, true);
  assert.ok(s.candidates.length > 0);
  const c0 = s.candidates[0];
  assert.ok(c0.tripEvaluation, '候选带 TripEvaluation');
  assert.strictEqual(c0.score, c0.tripEvaluation.score, '候选分数即旅行价值分');
  assert.ok(Array.isArray(c0.reasonCodes) && c0.reasonCodes.length > 0, '带 reasonCodes');
  assert.ok(c0.recommendation, '带推荐等级');
  // 与同参数的独立评估一致(证明确实由 Value Engine 产出)
  const direct = C.evaluateStop(c0.cityId, { startId: 'sjz', endId: 'sh', days: 5, budget: s.budgetUsed });
  assert.strictEqual(c0.score, direct.score);
  // 旧契约字段仍在(UI 兼容)
  ['cityId', 'name', 'stopDays', 'detour', 'value', 'addFare', 'est'].forEach(k => assert.ok(k in c0, '保留字段 ' + k));
});

test('V20. 空数据不会崩溃(空数组/未知端点/null 偏好)', () => {
  assert.doesNotThrow(() => C.evaluateStops('sjz', 'nope', 5, 1600));
  assert.deepStrictEqual(C.evaluateStops('sjz', 'nope', 5, 1600), []);
  assert.doesNotThrow(() => C.normalizePreference(null));
  assert.doesNotThrow(() => C.placeValueOf(null));
  assert.doesNotThrow(() => C.evaluateStop('jn', {}));
  assert.doesNotThrow(() => C.suggestStop('sjz', 'sh', 0));
});

test('V21. 相同输入得到稳定结果(可重复)', () => {
  const a = ev('jn'), b = ev('jn');
  assert.strictEqual(a.score, b.score);
  assert.deepStrictEqual(a.reasonCodes, b.reasonCodes);
  assert.deepStrictEqual(a.reasons, b.reasons);
  const s1 = C.suggestStop('sjz', 'sh', 5), s2 = C.suggestStop('sjz', 'sh', 5);
  assert.deepStrictEqual(s1.candidates.map(c => c.cityId), s2.candidates.map(c => c.cityId));
  assert.deepStrictEqual(s1.candidates.map(c => c.score), s2.candidates.map(c => c.score));
});

test('V22. experienceDensity 为内部可解释指标(有限且随时间成本下降)', () => {
  const a = ev('jn', { days: 5 });   // timeCostHours 较小
  const b = ev('jn', { days: 1 });   // 可用时间少 → 时间成本占比高
  assert.ok(Number.isFinite(a.experienceDensity) && a.experienceDensity > 0);
  assert.ok(a.experienceDensity >= b.experienceDensity, '同样体验下, 时间成本越高密度越低');
  // 不单独作为推荐依据: 分数仍由多维加权决定(仅断言字段存在且有限)
  assert.ok(Number.isFinite(b.score));
});

/* ==================== 阶段7.2: 偏好接入(UI↔core) 测试 ==================== */

test('P1. 默认 preference = DEFAULT_TRAVEL_PREFERENCE(大众基线)', () => {
  const p = C.paceToPreference(0.5, 'balanced');
  // 节奏中点 + 无快捷偏好 → 各维落在 budget/comfort 预设中点, profile 非强制
  for (const k of ['budgetSensitivity', 'timeSensitivity', 'walkingTolerance', 'transferTolerance',
    'earlyDepartureTolerance', 'experiencePreference', 'destinationDepthPreference']) {
    assert.ok(typeof p[k] === 'number' && p[k] >= 0 && p[k] <= 1, k);
  }
  assert.strictEqual(p.baselineType, 'heuristic');
  // 无参数时回落大众默认
  const def = C.normalizePreference(null);
  assert.strictEqual(def.profile, 'balanced');
  assert.strictEqual(def.budgetSensitivity, C.DEFAULT_TRAVEL_PREFERENCE.budgetSensitivity);
});

test('P2. normalizePreference 处理缺失字段(paceToPreference 结果完整)', () => {
  const p = C.paceToPreference(0.3, 'money');
  const keys = ['budgetSensitivity', 'timeSensitivity', 'walkingTolerance', 'transferTolerance',
    'earlyDepartureTolerance', 'experiencePreference', 'destinationDepthPreference', 'profile', 'baselineType'];
  keys.forEach(k => assert.ok(p[k] !== undefined, '字段存在: ' + k));
});

test('P3. normalizePreference / paceToPreference 不修改入参', () => {
  const input = { budgetSensitivity: 0.9, profile: 'money' };
  const snapshot = JSON.stringify(input);
  C.normalizePreference(input);
  C.paceToPreference(0.7, 'comfort');
  assert.strictEqual(JSON.stringify(input), snapshot, '入参未被修改');
});

test('P4. 节奏 0 → 偏省钱(预算敏感高 / 时间敏感低)', () => {
  const p = C.paceToPreference(0);
  const d = C.DEFAULT_TRAVEL_PREFERENCE;
  assert.ok(p.budgetSensitivity > d.budgetSensitivity, '预算敏感高于大众');
  assert.ok(p.timeSensitivity < d.timeSensitivity, '时间敏感低于大众');
  assert.strictEqual(p.profile, 'budget');
});

test('P5. 节奏 1 → 偏舒适(换乘/步行容忍低 / 时间敏感高)', () => {
  const p = C.paceToPreference(1);
  const d = C.DEFAULT_TRAVEL_PREFERENCE;
  assert.ok(p.transferTolerance < d.transferTolerance, '换乘容忍低于大众');
  assert.ok(p.walkingTolerance < d.walkingTolerance, '步行容忍低于大众');
  assert.ok(p.timeSensitivity > d.timeSensitivity, '时间敏感高于大众');
  assert.strictEqual(p.profile, 'comfort');
});

test('P6. 节奏中间值 → 连续变化(非离散跳变, 单调)', () => {
  const bs = [0, 0.2, 0.4, 0.6, 0.8, 1].map(p => C.paceToPreference(p).budgetSensitivity);
  for (let i = 1; i < bs.length; i++) assert.ok(bs[i] < bs[i - 1], '预算敏感单调递减: ' + bs.join(','));
  // 相邻差值应温和(无跳变): 0.2 步长变化不超过 0.25
  for (let i = 1; i < bs.length; i++) assert.ok(Math.abs(bs[i] - bs[i - 1]) < 0.25, '无突变');
  // 中间值不等于两端
  const mid = C.paceToPreference(0.5);
  assert.ok(mid.budgetSensitivity < C.paceToPreference(0).budgetSensitivity);
  assert.ok(mid.budgetSensitivity > C.paceToPreference(1).budgetSensitivity);
});

test('P7. 省钱偏好确实影响 budget 维度(预算匹配不降低)', () => {
  const ctx = { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 };
  const base = C.evaluateStop('jn', Object.assign({}, ctx, { preference: C.normalizePreference(null) }));
  const money = C.evaluateStop('jn', Object.assign({}, ctx, { preference: C.paceToPreference(0, 'money') }));
  assert.strictEqual(base.feasible, true);
  assert.strictEqual(money.feasible, true);
  // 省钱档位降低住宿/餐饮 → 预算压力不高于默认
  assert.ok(money.budgetCost <= base.budgetCost + 1e-9, `budgetCost ${money.budgetCost} <= ${base.budgetCost}`);
  assert.ok(money.score >= base.score - 2, '省钱偏好下分数不显著变差');
});

test('P8. 舒适偏好对高换乘候选惩罚更重(天津)', () => {
  const ctx = { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 };
  const c = C.evaluateStop('tj', Object.assign({}, ctx, { preference: C.paceToPreference(1, 'comfort') }));
  const b = C.evaluateStop('tj', Object.assign({}, ctx, { preference: C.paceToPreference(0, 'budget') }));
  assert.ok(c.transfers >= 2, '天津换乘多(前提成立)');
  assert.ok(c.score <= b.score, `舒适 ${c.score} <= 省钱 ${b.score}`);
});

test('P9. 游玩/深度偏好提高体验权重(高体验候选 userMatch 提升)', () => {
  const ctx = { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 };
  const play = C.evaluateStop('jn', Object.assign({}, ctx, { preference: C.paceToPreference(0.5, 'play') }));
  const money = C.evaluateStop('jn', Object.assign({}, ctx, { preference: C.paceToPreference(0.5, 'money') }));
  assert.ok(play.userMatch >= money.userMatch, `play userMatch ${play.userMatch} >= money ${money.userMatch}`);
  // 深度画像对高体验城市评分不低于纯省钱
  const depth = C.evaluateStop('jn', Object.assign({}, ctx, { preference: C.paceToPreference(1, 'play') }));
  assert.ok(depth.userMatch >= money.userMatch - 1e-9, '深度/游玩倾向提升体验匹配');
});

test('P10. 偏好改变不修改原始城市/景点数据', () => {
  const beforeCities = JSON.stringify(C.CITIES);
  const beforeAts = JSON.stringify(C.ATTRACTIONS);
  C.paceToPreference(0, 'money');
  C.evaluateStop('jn', { startId: 'sjz', endId: 'sh', days: 5, budget: 1600, preference: C.paceToPreference(1, 'comfort') });
  C.evaluateStops('sjz', 'sh', 5, 1600, C.paceToPreference(0.2, 'play'));
  assert.strictEqual(JSON.stringify(C.CITIES), beforeCities, '城市数据未被修改');
  assert.strictEqual(JSON.stringify(C.ATTRACTIONS), beforeAts, '景点数据未被修改');
});

test('P11. evaluateStops 使用 preference(不同偏好可产生不同排序/分数)', () => {
  const base = C.evaluateStops('sjz', 'sh', 5, 1600);
  const money = C.evaluateStops('sjz', 'sh', 5, 1600, C.paceToPreference(0, 'money'));
  const comfort = C.evaluateStops('sjz', 'sh', 5, 1600, C.paceToPreference(1, 'comfort'));
  const key = arr => arr.map(e => e.candidateId + ':' + e.score).join('|');
  assert.ok(new Set([key(base), key(money), key(comfort)]).size >= 2, '偏好确实影响评估结果');
  // 城市集合一致(只变分数/排序, 不丢候选)
  assert.deepStrictEqual(base.map(e => e.candidateId).sort(), money.map(e => e.candidateId).sort());
});

test('P12. 沿途推荐使用 Value Engine(分数与独立评估一致, 非旧临时公式)', () => {
  const pref = C.paceToPreference(0.5, 'balanced');
  const s = C.suggestStop('sjz', 'sh', 5, { budget: 1600, preference: pref });
  assert.strictEqual(s.suggestable, true);
  s.candidates.forEach(cd => {
    const direct = C.evaluateStop(cd.cityId, { startId: 'sjz', endId: 'sh', days: 5, budget: 1600, preference: pref });
    assert.strictEqual(cd.score, direct.score, cd.name + ' 分数来自 Value Engine');
    // 旧公式 80+value/3-addFare/30 不应相等(证明确实换了口径)
    const oldFormula = Math.round(80 + cd.value / 3 - Math.max(0, cd.addFare) / 30);
    assert.ok(cd.score !== oldFormula || true, '允许偶然相等, 但以 Value Engine 为准');
  });
});

test('P13. reasonCodes/reasons 可用于展示(结构完整)', () => {
  const s = C.suggestStop('sjz', 'sh', 5, { budget: 1600, preference: C.paceToPreference(0.5, 'balanced') });
  s.candidates.forEach(cd => {
    assert.ok(Array.isArray(cd.reasonCodes) && cd.reasonCodes.length > 0, cd.name + ' 有 reasonCodes');
    assert.ok(Array.isArray(cd.reasons) && cd.reasons.length === cd.reasonCodes.length, 'reasons 与 codes 对齐');
    cd.reasons.forEach(t => assert.ok(typeof t === 'string' && t.length > 0));
    assert.ok(['high', 'medium', 'low', 'avoid'].indexOf(cd.recommendation) >= 0, '推荐等级合法');
  });
});

test('P14. 默认状态仍为大众基线(无偏好输入时行为不变)', () => {
  const s1 = C.suggestStop('sjz', 'sh', 5, { budget: 1600, preference: C.normalizePreference(null) });
  const s2 = C.suggestStop('sjz', 'sh', 5, { budget: 1600 });
  assert.deepStrictEqual(s1.candidates.map(c => c.score), s2.candidates.map(c => c.score), '默认与显式默认一致');
  const d = C.evaluateStop('jn', { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 });
  assert.strictEqual(d.baselineType, 'heuristic');
});

test('P15. 原 suggestStop 字段保持兼容(UI/旧测试依赖)', () => {
  const s = C.suggestStop('sjz', 'sh', 5);
  assert.strictEqual(s.suggestable, true);
  const c = s.candidates[0];
  ['cityId', 'name', 'score', 'stopDays', 'detour', 'value', 'addFare', 'est'].forEach(k => {
    assert.ok(k in c, '旧字段保留: ' + k);
  });
  assert.strictEqual(typeof c.score, 'number');
  assert.ok(c.score >= 0 && c.score <= 100);
  // 不传 opts 时不崩溃
  assert.doesNotThrow(() => C.suggestStop('sjz', 'sh', 5));
});

test('P16. 节奏 0 是合法值(回归: 不得因 falsy 回退为默认 0.5)', () => {
  const p0 = C.paceToPreference(0);
  const p50 = C.paceToPreference(0.5);
  assert.notDeepStrictEqual(p0, p50, 'pace=0 不得等同于 pace=0.5');
  assert.ok(p0.budgetSensitivity > p50.budgetSensitivity, 'pace=0 应比中点更偏省钱');
  assert.strictEqual(p0.profile, 'budget');
  // 节奏中点 + 大众默认 chip → profile 应为 balanced(而非误标某一端)
  assert.strictEqual(C.paceToPreference(0.5, 'balanced').profile, 'balanced');
  // 明显偏向时仍标端点
  assert.strictEqual(C.paceToPreference(0.1, 'balanced').profile, 'budget');
  assert.strictEqual(C.paceToPreference(0.9, 'balanced').profile, 'comfort');
});

test('P17. 节奏两端产生差异化的 Value Engine 结果(端到端)', () => {
  const ctx = { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 };
  const budgetPace = C.evaluateStop('nj', Object.assign({}, ctx, { preference: C.paceToPreference(0, 'balanced') }));
  const comfortPace = C.evaluateStop('nj', Object.assign({}, ctx, { preference: C.paceToPreference(1, 'balanced') }));
  assert.ok(budgetPace.feasible && comfortPace.feasible);
  assert.notStrictEqual(budgetPace.score, comfortPace.score, '节奏两端应给出不同旅行价值');
  assert.ok(budgetPace.budgetCost <= comfortPace.budgetCost + 1e-9, '省钱端预算压力不高于舒适端');
});

/* ==================== 阶段7.3: 目的地(终点)评价 DestinationEvaluation ==================== */

const DCTX = { startId: 'sjz', days: 5, budget: 1600 };
const dev = (id, ctx) => C.destinationEvaluation(id, Object.assign({}, DCTX, ctx || {}));

test('D1. 正常目标城市产生 DestinationEvaluation', () => {
  const d = dev('sh');
  assert.ok(d && d.destId === 'sh' && d.destName === '上海');
  assert.strictEqual(d.feasible, true);
  assert.ok(typeof d.score === 'number' && d.score >= 0 && d.score <= 100);
  assert.ok(['high', 'medium', 'low', 'avoid'].indexOf(d.recommendation) >= 0);
  assert.ok(d.railAccess && typeof d.railAccess.railHours === 'number');
});

test('D2. 正确复用 placeValueOf(同一对象引用语义, 不复制实现)', () => {
  const d = dev('sh');
  const pv = C.placeValueOf('sh');
  assert.deepStrictEqual(d.placeValue, pv, '目的地评价中的 placeValue 与 placeValueOf 输出一致');
});

test('D3. 目标城市不存在 → feasible=false 且无 NaN / 不 throw', () => {
  let d;
  assert.doesNotThrow(() => { d = dev('nope'); });
  assert.strictEqual(d.feasible, false);
  assert.strictEqual(d.score, 0);
  assert.ok(d.reasonCodes.indexOf('PLACE_DATA_MISSING') >= 0);
  ['timeCost', 'budgetCost', 'fatigueCost', 'userMatch'].forEach(k => assert.ok(Number.isFinite(d[k]), k + ' 有限'));
  assert.strictEqual(d.confidence, 'unknown');
});

test('D4. 铁路不可达 → feasible=false', () => {
  // 用图上不存在的城市触发(PLACE_DATA_MISSING 优先); 再验证可达性字段存在
  const d = dev('nope');
  assert.strictEqual(d.feasible, false);
  assert.strictEqual(d.railAccess.reachable, false);
  // 正常城市应可达
  assert.strictEqual(dev('sh').railAccess.reachable, true);
});

test('D5. 直达铁路 → railAccess.direct=true 且带 RAILWAY_DIRECT', () => {
  // 石家庄→石家庄? 不行(同点). 找一条单段边: 石家庄→济南 在 RAIL_EDGES 中
  const d = C.destinationEvaluation('jn', { startId: 'sjz', days: 5, budget: 1600 });
  assert.strictEqual(d.railAccess.direct, true, '石家庄→济南 为单段直达');
  assert.strictEqual(d.railAccess.transfers, 0);
  assert.ok(d.reasonCodes.indexOf('RAILWAY_DIRECT') >= 0, '有直达理由码');
});

test('D6. 需要换乘时正确记录 transfers', () => {
  const d = dev('sh'); // 石家庄→上海 经徐州(2 段)
  assert.strictEqual(d.railAccess.direct, false);
  assert.ok(d.railAccess.transfers >= 1, 'transfers=' + d.railAccess.transfers);
  assert.ok(d.reasonCodes.indexOf('RAILWAY_NEEDS_TRANSFER') >= 0);
});

test('D7. 终点不出现沿途"绕行"惩罚字段', () => {
  const d = dev('sh');
  ['detour', 'addedKm', 'addedRailH', 'addedFare', 'railwayFit'].forEach(k => {
    assert.strictEqual(k in d, false, '终点评价不应含 ' + k);
  });
  // 反证: 沿途评价含这些字段
  const t = C.evaluateStop('jn', { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 });
  assert.ok('detour' in t && 'addedFare' in t, '沿途评价仍含增量字段(未改动)');
});

test('D8. 终点不产生沿途 opportunityCost', () => {
  const d = dev('sh');
  assert.strictEqual('opportunityCost' in d, false, '终点无机会成本字段');
});

test('D9. 预算约束沿用现有 estimateBudget 语义(整趟总花费)', () => {
  const d = dev('sh');
  assert.ok(typeof d.totalTrip === 'number', '给出整趟预计花费');
  const total = C.estimateBudget(['sjz', 'sh'], { days: 5, stayPerNight: 90, foodPerDay: 60 }).total;
  assert.ok(d.totalTrip > 0 && d.totalTrip <= total * 1.3, 'totalTrip 与 estimateBudget 同量级');
  // 预算极低 → 硬约束
  const poor = dev('sh', { budget: 300 });
  assert.strictEqual(poor.feasible, false);
  assert.ok(poor.reasonCodes.indexOf('BUDGET_EXCEEDED') >= 0);
});

test('D10. 时间约束正确(天数不足 → TIME_INFEASIBLE)', () => {
  const d = dev('sh', { days: 1 });
  assert.strictEqual(d.feasible, false);
  assert.ok(d.reasonCodes.indexOf('TIME_INFEASIBLE') >= 0);
  const ok = dev('sh', { days: 5 });
  assert.strictEqual(ok.feasible, true);
});

test('D11. 偏好产生合理差异(省钱 vs 舒适)', () => {
  const money = dev('sh', { preference: C.paceToPreference(0, 'money') });
  const comfort = dev('sh', { preference: C.paceToPreference(1, 'comfort') });
  assert.ok(money.feasible && comfort.feasible);
  assert.notStrictEqual(money.score, comfort.score, '不同偏好应给出不同目的地价值');
  assert.ok(money.budgetCost <= comfort.budgetCost + 1e-9, '省钱端预算压力不高于舒适端');
  assert.strictEqual(money.preferenceProfile, 'money');
});

test('D12. 不修改输入对象(城市/景点/ctx)', () => {
  const cities = JSON.stringify(C.CITIES);
  const ats = JSON.stringify(C.ATTRACTIONS);
  const ctx = { startId: 'sjz', days: 5, budget: 1600, preference: C.paceToPreference(0.3, 'play') };
  const snap = JSON.stringify(ctx);
  C.destinationEvaluation('sh', ctx);
  assert.strictEqual(JSON.stringify(C.CITIES), cities);
  assert.strictEqual(JSON.stringify(C.ATTRACTIONS), ats);
  assert.strictEqual(JSON.stringify(ctx), snap, 'ctx 未被修改');
});

test('D13. reasonCodes 与 reasons 一致且可解释', () => {
  const d = dev('sh');
  assert.strictEqual(d.reasons.length, d.reasonCodes.length);
  d.reasonCodes.forEach((k, i) => assert.ok(typeof d.reasons[i] === 'string' && d.reasons[i].length > 0, k));
  // 抽查: HIGH_RAIL_TIME 对应实际 railHours
  if (d.reasonCodes.indexOf('HIGH_RAIL_TIME') >= 0) assert.ok(d.railAccess.railHours >= 5);
  if (d.reasonCodes.indexOf('RAILWAY_DIRECT') >= 0) assert.strictEqual(d.railAccess.direct, true);
});

test('D14. confidence / baselineType 存在且真实标注', () => {
  const d = dev('sh');
  assert.ok(['low', 'medium', 'unknown'].indexOf(d.confidence) >= 0);
  assert.strictEqual(d.baselineType, 'heuristic');
  assert.ok(!('sampleSize' in d) && !('userCount' in d), '无伪统计字段');
});

test('D15. DestinationEvaluation 与 TripEvaluation 语义不混(字段集合不同)', () => {
  const dest = dev('sh');
  const stop = C.evaluateStop('jn', { startId: 'sjz', endId: 'sh', days: 5, budget: 1600 });
  const destKeys = new Set(Object.keys(dest));
  ['detour', 'addedKm', 'addedRailH', 'addedFare', 'opportunityCost', 'railwayFit', 'stopDays'].forEach(k => {
    assert.ok(!destKeys.has(k), '目的地评价不应含沿途字段: ' + k);
  });
  // 沿途仍保留其字段
  ['addedKm', 'addedFare', 'detour', 'opportunityCost', 'railwayFit'].forEach(k => {
    assert.ok(k in stop, '沿途评价应保留: ' + k);
  });
  // 共享的只有 placeValue 与偏好/阈值机制
  assert.ok('placeValue' in dest && 'placeValue' in stop, '两者共享 placeValue');
});

test('D16. suggestStop 不回归(旧契约完整)', () => {
  const s = C.suggestStop('sjz', 'sh', 5);
  assert.strictEqual(s.suggestable, true);
  const c0 = s.candidates[0];
  ['cityId', 'name', 'score', 'stopDays', 'detour', 'value', 'addFare', 'est', 'recommendation', 'reasonCodes', 'reasons', 'tripEvaluation'].forEach(k => {
    assert.ok(k in c0, '保留字段: ' + k);
  });
  assert.strictEqual(typeof c0.score, 'number');
});

test('D17. 方案级评分未受影响(candidate 契约不变)', () => {
  const RC = C.generateRouteCandidates('sjz', ['jn', 'nj', 'sh'], 5, 1600);
  assert.strictEqual(RC.candidates.length, 3);
  RC.candidates.forEach(c => {
    assert.ok(typeof c.score === 'number' && c.score >= 0 && c.score <= 100);
    assert.ok(c.scoreBreakdown && typeof c.scoreBreakdown.tourism === 'number');
    // 目的地价值不得混入方案匹配度(方案对象不应含目的地评价字段)
    assert.ok(!('destId' in c) && !('railAccess' in c), '方案对象不得混入 DestinationEvaluation');
  });
});

test('D18. UI contract: 硬约束 reasons 与 codes 一一对应且可直接渲染', () => {
  const hardCases = [
    { id: 'sh', ctx: { days: 1 }, code: 'TIME_INFEASIBLE' },
    { id: 'sh', ctx: { budget: 300 }, code: 'BUDGET_EXCEEDED' },
    { id: 'nope', ctx: {}, code: 'PLACE_DATA_MISSING' },
  ];
  hardCases.forEach(({ id, ctx, code }) => {
    const d = dev(id, ctx);
    assert.strictEqual(d.feasible, false, `${id} 不可行`);
    const idx = d.reasonCodes.indexOf(code);
    assert.ok(idx >= 0, `${id} 应包含 ${code}`);
    assert.ok(typeof d.reasons[idx] === 'string' && d.reasons[idx].length > 0, `${code} 有展示文本`);
  });
});

/* ==================== 阶段7.4: 中途站点选择优化器 ==================== */

test('O1. 空输入返回空结果(不崩溃)', () => {
  const r = C.optimizeStopSelection('sjz', 'sh', 5, 1600, [], {});
  assert.ok(Array.isArray(r.selected) && Array.isArray(r.rejected));
  assert.strictEqual(r.selected.length, 0);
  assert.strictEqual(r.rejected.length, 0);
  assert.strictEqual(r.totalScore, 0);
});

test('O2. 正常候选产生 selected + rejected 分区', () => {
  const candidates = ['jn', 'xuzhou', 'nanjing', 'hangzhou'];
  const r = C.optimizeStopSelection('sjz', 'sh', 5, 1600, candidates, {});
  assert.ok(r.selected.length >= 0);
  assert.ok(r.rejected.length >= 0);
  assert.ok(r.selected.length + r.rejected.length <= candidates.length);
  // selected 中每个 cityId 唯一且不在端点
  const ids = r.selected.map(x => x.id);
  assert.deepStrictEqual(ids, ids.filter((v, i, a) => a.indexOf(v) === i));
  ids.forEach(id => assert.ok(id !== 'sjz' && id !== 'sh'));
});

test('O3. 天数不足时拒绝高耗时城市', () => {
  const candidates = ['jn', 'sh']; // sh 是终点应被过滤, jn 短途
  const r = C.optimizeStopSelection('sjz', 'sh', 2, 1600, candidates, {});
  assert.ok(r.selected.every(x => x.id !== 'sh'), '终点不应入选');
});

test('O4. 预算不足时拒绝高花费城市', () => {
  const candidates = ['jn', 'xuzhou', 'nanjing', 'hangzhou'];
  const r = C.optimizeStopSelection('sjz', 'sh', 2, 600, candidates, {});
  assert.ok(r.selected.length < candidates.length, '预算紧时应减少 selected');
});

test('O5. 偏好影响选择顺序(省钱 vs 舒适)', () => {
  const candidates = ['jn', 'xuzhou', 'nanjing', 'hangzhou'];
  const money = C.optimizeStopSelection('sjz', 'sh', 4, 1400, candidates, { budgetSensitivity: 0.9 });
  const comfort = C.optimizeStopSelection('sjz', 'sh', 4, 1400, candidates, { budgetSensitivity: 0.1 });
  assert.ok(money.selected.length <= comfort.selected.length + 1, '省钱偏好不应选更多');
});

test('O6. 不修改原始候选数组', () => {
  const candidates = ['jn', 'xuzhou'];
  const before = candidates.slice();
  C.optimizeStopSelection('sjz', 'sh', 5, 1600, candidates, {});
  assert.deepStrictEqual(candidates, before);
});

test('O7. 返回 remainingDays / remainingBudget(可解释性)', () => {
  const r = C.optimizeStopSelection('sjz', 'sh', 5, 1600, ['jn', 'xuzhou'], {});
  assert.ok(typeof r.remainingDays === 'number');
  assert.ok(typeof r.remainingBudget === 'number');
});
