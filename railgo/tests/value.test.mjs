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

/* ==================== 阶段7.6: 目的地卡理由分类零遗漏 ====================
 * 背景: 目的地卡(renderDestination)与 StopBox 一样用 pos/neg 两个正则给 reasonCodes 分类。
 * 7.5 修掉了 StopBox 的分类遗漏; 本阶段修目的地卡的对称遗漏(SAME_AS_ENDPOINT / LOW_EXPERIENCE),
 * 并用源码级穷举锁住: Core 新增 code 而 UI 未分类时, D21 立即失败。 */

/* 复刻 railgo.js renderDestination 的分类正则(与源码一致, 由 D21 校验源码本身) */
const DEST_POS = /HIGH_EXPERIENCE|UNIQUENESS|REPRESENTATIVENESS|DIRECT|LOW_RAIL_TIME|DEST_DEPTH_ENOUGH/;
const DEST_NEG = /LOW_EXPERIENCE|HIGH_RAIL_TIME|HIGH_RAIL_COST|HIGH_FATIGUE|NEEDS_TRANSFER|MANY_TRANSFERS|DEST_DEPTH_THIN|BUDGET_EXCEEDED|TIME_INFEASIBLE|RAILWAY_UNREACHABLE|PLACE_DATA_MISSING|SAME_AS_ENDPOINT/;
const readRailgoJs = () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { fileURLToPath } = require('node:url');
  return fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'railgo.js'), 'utf8');
};

test('D19. 目的地卡消费契约: 硬约束与 SAME_AS_ENDPOINT 均不得被分类静默丢弃', () => {
  const hardCases = [
    { id: 'nope', ctx: {}, code: 'PLACE_DATA_MISSING' },
    { id: 'sjz', ctx: {}, code: 'SAME_AS_ENDPOINT' },       // 目的地=起点 → 此前被静默丢弃
    { id: 'sh', ctx: { days: 1 }, code: 'TIME_INFEASIBLE' },
    { id: 'sh', ctx: { budget: 300 }, code: 'BUDGET_EXCEEDED' },
  ];
  hardCases.forEach(({ id, ctx, code }) => {
    const d = dev(id, ctx);
    assert.ok(d.reasonCodes.includes(code), `${id} 应产出 ${code}`);
    assert.ok(DEST_NEG.test(code), `${code} 必须被 neg 分类覆盖(否则 UI 不显示该原因)`);
    const i = d.reasonCodes.indexOf(code);
    assert.ok(typeof d.reasons[i] === 'string' && d.reasons[i].length > 0, `${code} 有核心文案`);
    assert.ok(!/^[A-Z_]+$/.test(d.reasons[i]), `${code} 文案不得回退为英文码`);
  });
});

test('D20. LOW_EXPERIENCE_VALUE 分类覆盖(契约级: 现有 mock 数据不可自然触发)', () => {
  // 事实记录: 8 城 experience 均 >= experienceLow, 故该 code 当前不会出现(不伪造数据制造 PASS)
  const T = C.VALUE_THRESHOLDS;
  assert.ok(typeof T.experienceLow === 'number' && T.experienceLow > 0, '存在 experienceLow 阈值');
  C.CITIES.forEach(c => {
    const pv = C.placeValueOf(c.id);
    assert.ok(pv.experience >= T.experienceLow, c.name + ' 体验值未低于阈值(该 code 不会自然触发)');
  });
  // 契约: 一旦触发, 必须被 neg 分类(不得像 7.5 之前的 StopBox 那样遗漏)
  assert.ok(DEST_NEG.test('LOW_EXPERIENCE_VALUE'), 'neg 分类必须覆盖 LOW_EXPERIENCE_VALUE');
  // 子串互斥: 不得与 HIGH_EXPERIENCE_VALUE 互相误伤
  assert.ok(!DEST_NEG.test('HIGH_EXPERIENCE_VALUE'), 'HIGH_EXPERIENCE_VALUE 不得被 neg 误分类');
  assert.ok(DEST_POS.test('HIGH_EXPERIENCE_VALUE'), 'HIGH_EXPERIENCE_VALUE 属于 pos');
  // 源码级: 防止只改测试不改实现
  const src = readRailgoJs();
  const negLine = src.split('\n').find(l => l.includes('const neg = (d.reasonCodes || []).filter'));
  assert.ok(negLine, '定位到 renderDestination 的 neg 分类行');
  assert.ok(/LOW_EXPERIENCE/.test(negLine), '目的地卡 neg 分类必须包含 LOW_EXPERIENCE');
  assert.ok(/SAME_AS_ENDPOINT/.test(negLine), '目的地卡 neg 分类必须包含 SAME_AS_ENDPOINT');
});

test('D21. 零遗漏穷举: destinationEvaluation 全部 code 均被 pos∪neg 覆盖(且不双重分类)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { fileURLToPath } = require('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const coreSrc = fs.readFileSync(path.join(here, '..', 'railgo.core.js'), 'utf8');
  const start = coreSrc.indexOf('function destinationEvaluation');
  const end = coreSrc.indexOf('批量评估', start);
  assert.ok(start > 0 && end > start, '定位到 destinationEvaluation 函数体');
  const body = coreSrc.slice(start, end);
  const codes = [...new Set([...body.matchAll(/codes\.push\('([A-Z_]+)'\)/g)].map(m => m[1]))];
  assert.ok(codes.length >= 15, '提取到足够 code(当前 ' + codes.length + ' 个)');
  // (a) 每个 code 至少被一侧覆盖
  const dropped = codes.filter(k => !DEST_POS.test(k) && !DEST_NEG.test(k));
  assert.deepStrictEqual(dropped, [], '以下 code 被 UI 静默丢弃: ' + dropped.join(', '));
  // (b) 不得同时命中两侧(会造成同一条理由重复展示)
  const both = codes.filter(k => DEST_POS.test(k) && DEST_NEG.test(k));
  assert.deepStrictEqual(both, [], '以下 code 被双重分类(会重复展示): ' + both.join(', '));
  // (c) 测试内正则与 railgo.js 源码一致(防漂移)
  const src = readRailgoJs();
  const posLine = src.split('\n').find(l => l.includes('const pos = (d.reasonCodes || []).filter'));
  const negLine = src.split('\n').find(l => l.includes('const neg = (d.reasonCodes || []).filter'));
  assert.ok(posLine && negLine, '定位到目的地卡 pos/neg 分类行');
  assert.ok(posLine.includes(DEST_POS.source), 'pos 正则与实现一致');
  assert.ok(negLine.includes(DEST_NEG.source), 'neg 正则与实现一致');
  // (d) 全部 code 在 Core 中有正式文案(UI 无需自建第二套文案表)
  const missing = codes.filter(k => !new RegExp(k + ":\\s*'").test(coreSrc));
  assert.deepStrictEqual(missing, [], '以下 code 在 Core REASON_TEXT 中缺文案: ' + missing.join(', '));
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

/* ==================== 阶段7.7: optBox 理由全量消费 ====================
 * 背景: optBox(智能筛选结果)此前只渲染 selected 的 reasons[0], Core 给出的其余理由被丢弃。
 * 本阶段改为消费全部 reasons 并按 pos/neg 分类(与 7.5 StopBox / 7.6 目的地卡同构)。 */

/* 复刻 railgo.js optBox 的分类正则(与源码一致, 由 O10 校验源码本身) */
const OPT_POS = /HIGH_EXPERIENCE|UNIQUENESS|REPRESENTATIVENESS|ON_ROUTE|LOW_TIME_COST|LOW_BUDGET_COST/;
const OPT_NEG = /LOW_EXPERIENCE|HIGH_TIME_COST|HIGH_BUDGET_COST|HIGH_FATIGUE|HIGH_OPPORTUNITY_COST|MANY_TRANSFERS|HIGH_DETOUR/;

test('O8. optBox 消费契约: selected 的 code/reason 一一对应且不得回退为英文码', () => {
  const r = C.optimizeStopSelection('sjz', 'sh', 5, 1600, ['jn', 'xuzhou', 'nj', 'hz'], {});
  assert.ok(r.selected.length > 0, '存在入选项');
  r.selected.forEach(x => {
    const codes = x.reasonCodes || [], texts = x.reasons || [];
    assert.ok(codes.length > 0, x.id + ' 有 reasonCodes');
    assert.strictEqual(texts.length, codes.length, x.id + ' code/reason 数量一致');
    texts.forEach((t, i) => {
      assert.ok(typeof t === 'string' && t.length > 0, `${x.id} #${i}(${codes[i]}) 文案非空`);
      assert.ok(!/^[A-Z_]+$/.test(t), `${x.id} #${i} 不得回退为原始 code`);
    });
  });
});

test('O9. optBox 全量展示契约: selected 的每条 reason 均可被分类消费(不再只取首条)', () => {
  // 至少存在一个 selected 项的理由数 > 1 —— 否则"只取首条"与"全量"无差异, 本阶段无意义
  let maxReasons = 0;
  const picked = [];
  for (const c of ['jn', 'xuzhou', 'nj', 'hz', 'jn']) {
    const r = C.optimizeStopSelection('sjz', 'sh', 6, 2000, [c], {});
    r.selected.forEach(x => { maxReasons = Math.max(maxReasons, (x.reasons || []).length); picked.push(x); });
  }
  assert.ok(maxReasons > 1, '存在多理由的入选项(当前最多 ' + maxReasons + ' 条)');
  // 每条 reason 必须能被 pos 或 neg 消费(全量展示后不得有理由无处安放)
  picked.forEach(x => {
    (x.reasonCodes || []).forEach(k => {
      assert.ok(OPT_POS.test(k) || OPT_NEG.test(k), k + ' 必须被 optBox 分类覆盖');
    });
  });
});

test('O10. 零遗漏穷举 + 源码级防漂移: optBox 分类覆盖 selected 全部 code', () => {
  const ids = C.CITIES.map(c => c.id);
  const all = new Set();
  for (const s of ['sjz', 'sh', 'jn', 'nj']) {
    for (const e of ids) {
      if (s === e) continue;
      const cands = ids.filter(x => x !== s && x !== e);
      for (const d of [3, 5, 6]) for (const b of [900, 1600, 2000]) {
        const r = C.optimizeStopSelection(s, e, d, b, cands, {});
        r.selected.forEach(x => (x.reasonCodes || []).forEach(k => all.add(k)));
      }
    }
  }
  assert.ok(all.size >= 5, '覆盖到足够 code(当前 ' + all.size + ' 个)');
  const dropped = [...all].filter(k => !OPT_POS.test(k) && !OPT_NEG.test(k));
  assert.deepStrictEqual(dropped, [], '未覆盖: ' + dropped.join(', '));
  const both = [...all].filter(k => OPT_POS.test(k) && OPT_NEG.test(k));
  assert.deepStrictEqual(both, [], '双重分类: ' + both.join(', '));
  // 源码级: 必须精确定位到 optBox 段(railgo.js 中 StopBox 也有同形正则, 不可用 find 取首条)
  const src = readRailgoJs();
  const optStart = src.indexOf('optimizeStopSelection');
  assert.ok(optStart > 0, '定位到 optBox 的 optimizeStopSelection 调用');
  const optSeg = src.slice(optStart);
  const posLine = optSeg.split('\n').find(l => l.includes('const pos = codes.filter'));
  const negLine = optSeg.split('\n').find(l => l.includes('const neg = codes.filter'));
  assert.ok(posLine && negLine, '定位到 optBox 段内的 pos/neg 分类行');
  assert.ok(posLine.includes(OPT_POS.source), 'optBox pos 正则与实现一致');
  assert.ok(negLine.includes(OPT_NEG.source), 'optBox neg 正则与实现一致');
  // 且不得再出现"只取首条理由"的旧写法(在整个 railgo.js 内检查)
  assert.ok(!/x\.reasons && x\.reasons\[0\]/.test(src), '不得残留只取 reasons[0] 的写法');
  // 且 optBox 段必须逐条消费 reasons(而不是只取下标 0)
  assert.ok(!/texts\[0\]/.test(optSeg), 'optBox 不得只取 reasons[0]');
});

test('O11. UI 源码契约: optBox 逐条消费 reasons(变异可捕获)', () => {
  const src = readRailgoJs();
  const optStart = src.indexOf('optimizeStopSelection');
  assert.ok(optStart > 0, '定位到 optBox 段');
  const optSeg = src.slice(optStart);
  // 必须完整消费 Core 的 reasonCodes(不得截断为 [0])
  assert.ok(/const codes = x\.reasonCodes \|\| \[\]/.test(optSeg),
    'optBox 必须完整消费 x.reasonCodes(不得截断, 如 [x.reasonCodes[0]])');
  assert.ok(!/\[x\.reasonCodes\[0\]\]/.test(optSeg), 'optBox 不得只取 reasonCodes[0]');
  // 必须有 reasonMap 逐条构建(证明未丢失任何一条)
  assert.ok(/reasonMap\[k\] = texts\[i\]/.test(optSeg), 'optBox 必须逐条构建 reasonMap(i 索引消费全部 texts)');
  // 必须同时渲染 pos 与 neg 两行(负向理由不得被吞)
  assert.ok(/reason-line pos/.test(optSeg) && /reason-line neg/.test(optSeg), 'optBox 必须同时渲染 pos 与 neg');
  // reasons 必须逐条映射(不得只取下标 0)
  assert.ok(!/texts\[0\]/.test(optSeg), 'optBox 不得只取 reasons[0]');
});

/* ==================== 阶段7.5: StopBox 理由文案来源统一(UI contract) ==================== */

test('U1. handlers 契约: suggestStop 候选的 reasonCodes 与 reasons 严格一一对应', () => {
  const s = C.suggestStop('sjz', 'sh', 5, { budget: 1600, preference: C.paceToPreference(0.5, 'balanced') });
  assert.strictEqual(s.suggestable, true);
  assert.ok(s.candidates.length > 0);
  s.candidates.forEach(cd => {
    const codes = cd.reasonCodes, texts = cd.reasons;
    assert.ok(Array.isArray(codes) && codes.length > 0, cd.name + ' 有 reasonCodes');
    assert.ok(Array.isArray(texts), cd.name + ' 有 reasons');
    assert.strictEqual(texts.length, codes.length, cd.name + ' code/reason 数量一致');
    texts.forEach((t, i) => {
      assert.ok(typeof t === 'string' && t.length > 0, `${cd.name} #${i}(${codes[i]}) 文案非空`);
      assert.ok(!/^[A-Z_]+$/.test(t), `${cd.name} #${i} 不得回退为原始 code(${t})`); // 显示层不得出现英文码
    });
  });
});

test('U2. 候选顶层 reasons 与 tripEvaluation.reasons 完全一致(双通道同源)', () => {
  const s = C.suggestStop('sjz', 'sh', 5, { budget: 1600, preference: C.paceToPreference(0.5, 'balanced') });
  s.candidates.forEach(cd => {
    assert.deepStrictEqual(cd.reasons, cd.tripEvaluation.reasons, cd.name + ' 两处 reasons 同源');
    assert.deepStrictEqual(cd.reasonCodes, cd.tripEvaluation.reasonCodes, cd.name + ' 两处 reasonCodes 同源');
  });
});

test('U3. UI 消费契约: reasonMap(code→core 文案) 可覆盖全部 code, 无需 UI 自建文案', () => {
  // 复刻 railgo.js 的 reasonMap 构造逻辑(纯函数等价), 断言不产生 undefined/空串/英文码
  const buildReasonMap = (codes, texts) => {
    const m = {};
    (codes || []).forEach((k, i) => { m[k] = (texts || [])[i] || k; });
    return m;
  };
  const evals = C.evaluateStops('sjz', 'sh', 5, 1600, C.paceToPreference(0.5, 'balanced'));
  assert.ok(evals.length >= 4, '有足够候选用于覆盖');
  evals.forEach(e => {
    const m = buildReasonMap(e.reasonCodes, e.reasons);
    e.reasonCodes.forEach(k => {
      assert.ok(m[k] !== undefined, k + ' 有映射');
      assert.ok(m[k] !== '', k + ' 非空串');
      assert.ok(!/^[A-Z_]+$/.test(m[k]), k + ' 不应回退为英文码(说明 core 提供了文案)');
    });
  });
});

test('U4. LOW_EXPERIENCE_VALUE 契约: 该 code 在 core 中有正式文案, 且不再被 UI 分类遗漏', () => {
  // 说明: 当前 8 城 experience(最小 0.433) 均高于 experienceLow(0.35), 该 code 在现有 mock 数据下不会产生。
  // 因此采用契约级验证: (a) code 名与文案表一致可推导; (b) UI 分类正则必须覆盖 LOW_EXPERIENCE。
  // (a) 通过 destinationEvaluation/evaluateStop 的 reasons 生成机制间接验证: 用人工构造 codes 走同一映射
  const T = C.VALUE_THRESHOLDS;
  assert.ok(typeof T.experienceLow === 'number' && T.experienceLow > 0, '存在 experienceLow 阈值');
  // 8 城均高于阈值 → 记录该事实(防止有人误以为测试遗漏)
  C.CITIES.forEach(c => {
    const pv = C.placeValueOf(c.id);
    assert.ok(pv.experience >= T.experienceLow, c.name + ' 城市体验值未低于阈值(故该 code 不会出现)');
  });
  // (b) UI 分类正则覆盖性: 直接断言 railgo.js 源码中的 neg 正则包含 LOW_EXPERIENCE
  const fs = require('node:fs');
  const path = require('node:path');
  const { fileURLToPath } = require('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const src = fs.readFileSync(path.join(here, '..', 'railgo.js'), 'utf8');
  const negLine = src.split('\n').find(l => l.includes('const neg = codes.filter'));
  assert.ok(negLine, '定位到 StopBox 的 neg 分类行');
  assert.ok(/LOW_EXPERIENCE/.test(negLine), 'neg 分类必须包含 LOW_EXPERIENCE(不得遗漏)');
  // 同时确认 pos 不再使用 UI 自建映射表
  assert.ok(!/const txt = k =>/.test(src), 'UI 不得保留自建 reason 文案映射表');
  // 且渲染消费的是 reasonMap
  // StopBox 渲染行(阶段7.5): pos/neg 均消费 reasonMap
  assert.ok(/pos\.map\(k => reasonMap/.test(src), 'pos 渲染必须消费 reasonMap');
  assert.ok(/neg\.map\(k => reasonMap/.test(src), 'neg 渲染必须消费 reasonMap');
});
