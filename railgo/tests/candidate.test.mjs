/* 阶段1 三方案候选系统测试 — 独立, 不改动原项目测试 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../railgo.core.js');

function gen(dests, days, budget) { return C.generateRouteCandidates('sjz', dests, days, budget); }

test('C1. 返回综合/省钱/轻松 3 个候选', () => {
  const { candidates } = gen(['jn', 'nj', 'sh'], 5, 1500);
  assert.strictEqual(candidates.length, 3);
  assert.deepStrictEqual(candidates.map(c => c.type), ['balanced', 'money', 'relax']);
});

test('C2. 候选结构完整(RouteCandidate 契约)', () => {
  const { candidates } = gen(['jn', 'nj', 'sh'], 5, 1500);
  candidates.forEach(c => {
    assert.ok(c.id && c.title && c.description);
    assert.ok(Array.isArray(c.cities) && c.cities.length >= 2);
    assert.ok(Array.isArray(c.segments) && c.segments.length === c.cities.length - 1);
    assert.ok(typeof c.transport.distanceKm === 'number' && typeof c.transport.detourRatio === 'number');
    assert.ok(typeof c.budget.total === 'number' && typeof c.budget.rail === 'number');
    assert.ok(typeof c.score === 'number');
    assert.ok(c.scoreBreakdown && typeof c.scoreBreakdown.tourism === 'number');
    assert.ok(Array.isArray(c.reasons) && Array.isArray(c.warnings));
    assert.strictEqual(c.source, 'computed');
  });
});

test('C3. 分数在 0-100 且 breakdown 各维 ≤ 对应分母', () => {
  const { candidates } = gen(['jn', 'nj', 'sh', 'hz'], 6, 1800);
  candidates.forEach(c => {
    assert.ok(c.score >= 0 && c.score <= 100);
    for (const k of ['tourism', 'time', 'budget', 'rail', 'transfer']) {
      assert.ok(c.scoreBreakdown[k] >= 0 && c.scoreBreakdown[k] <= c.breakdownDenom[k], `${k} ${c.scoreBreakdown[k]}<=${c.breakdownDenom[k]}`);
    }
  });
});

test('C4. 预算紧张时省钱方案城市数 ≤ 综合方案', () => {
  const { candidates } = gen(['jn', 'nj', 'sh', 'hz'], 5, 800);
  const b = candidates.find(c => c.type === 'balanced'), m = candidates.find(c => c.type === 'money');
  assert.ok(m.cities.length <= b.cities.length, `money ${m.cities.length} <= balanced ${b.cities.length}`);
  assert.ok(m.budget.total <= b.budget.total, `money ¥${m.budget.total} <= balanced ¥${b.budget.total}`);
});

test('C5. 预算充足时省钱不砍城市(全玩)', () => {
  const { candidates } = gen(['jn', 'nj', 'sh', 'hz'], 6, 3000);
  const m = candidates.find(c => c.type === 'money');
  assert.strictEqual(m.cities.length, 5); // 起点+4城
});

test('C6. 轻松旅行: 每城停留 ≥1 天且总和 = 天数', () => {
  const { candidates } = gen(['jn', 'nj', 'sh'], 6, 1800);
  const r = candidates.find(c => c.type === 'relax');
  const sum = r.daysPerCity.reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, r.days);
  assert.ok(r.daysPerCity.every(d => d >= 1));
});

test('C7. 超预算候选带警告', () => {
  const { candidates } = gen(['jn', 'nj', 'sh', 'hz'], 5, 800);
  const b = candidates.find(c => c.type === 'balanced');
  assert.ok(b.budget.total > 800);
  assert.ok(b.warnings.some(w => w.includes('超预算')));
});

test('C8. 无目的地 → 空候选', () => {
  assert.deepStrictEqual(gen([], 5, 1500).candidates, []);
});

test('C9. 目的地重复 → 去重后生成候选', () => {
  const { candidates } = gen(['jn', 'jn', 'sh'], 5, 1500);
  assert.strictEqual(candidates.length, 3);
  const b = candidates[0];
  assert.strictEqual(b.cityNames.filter(n => n === '济南').length, 1);
});

test('C10. 各模式路线在城市集合上一致(不丢城市, 除省钱主动砍城)', () => {
  const { candidates } = gen(['jn', 'nj', 'sh'], 6, 2500);
  const expect = new Set(['sjz', 'jn', 'nj', 'sh']);
  candidates.forEach(c => {
    assert.deepStrictEqual(new Set(c.cities), expect);
  });
});