/* RailGo 第一版核心测试 — 独立于原项目 tests, 不改动原有 422 项测试 */
'use strict';
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const C = require('../railgo.core.js');
const B = require('../baidu-api.js');
const { JSDOM } = require('jsdom');

function loadPage() {
  const base = path.join(__dirname, '..');
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'railgo.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://railgo.local/', pretendToBeVisual: true });
  const w = dom.window;
  ['mock-data.js', 'railgo.core.js', 'baidu-api.js'].forEach(f => w.eval(fs.readFileSync(path.join(base, f), 'utf8')));
  w.eval(fs.readFileSync(path.join(base, 'railgo.js'), 'utf8'));
  return w;
}

const NAME = id => C.cityById(id).name;

test('1. 用户指定顺序不改变', () => {
  const r = C.planRoute('sjz', ['jn', 'nj', 'sh'], 5, 1500, 'user');
  assert.deepStrictEqual(r.route, ['sjz', 'jn', 'nj', 'sh']);
  assert.match(r.reason, /用户指定顺序/);
});

test('2. 智能排序产生与用户顺序可能不同但评分更高或相等', () => {
  const user = C.planRoute('sjz', ['jn', 'nj', 'sh', 'hz'], 6, 1800, 'user');
  const smart = C.planRoute('sjz', ['jn', 'nj', 'sh', 'hz'], 6, 1800, 'smart');
  assert.ok(smart.score >= user.score, `smart ${smart.score} >= user ${user.score}`);
  assert.deepStrictEqual(new Set(smart.route), new Set(['sjz', 'jn', 'nj', 'sh', 'hz'])); // 城市集合不变
});

test('3. 中途城市推荐: 石→沪 5 天 应给出候选济南', () => {
  const sug = C.suggestStop('sjz', 'sh', 5);
  assert.ok(sug.suggestable);
  assert.ok(sug.candidates.some(c => c.cityId === 'jn'));
});

test('4. 时间不足: 3 天 4 城 → no', () => {
  const r = C.planRoute('sjz', ['jn', 'nj', 'sh', 'hz'], 3, 1500, 'user');
  const f = C.timeFeasible(r.route, 3);
  assert.strictEqual(f.ok, 'no');
});

test('5. 预算不足: 6天4城 预算800 → 总费用>预算', () => {
  const r = C.planRoute('sjz', ['jn', 'nj', 'sh', 'hz'], 6, 800, 'user');
  const b = C.estimateBudget(r.route, { days: 6 });
  assert.ok(b.total > 800);
});

test('6. RouteScore 范围与可解释明细', () => {
  const r = C.planRoute('sjz', ['jn', 'nj', 'sh'], 5, 1500, 'user');
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(Array.isArray(r.detail.detail) && r.detail.detail.length >= 4);
  assert.ok(r.detail.detail.every(d => typeof d.label === 'string' && typeof d.v === 'number'));
});

test('7. 城市不存在 → 返回 null', () => {
  assert.strictEqual(C.cityByName('不存在的城市'), null);
});

test('8. 目的地重复 → 过滤为单一(且不等于起点)', () => {
  const r = C.planRoute('sjz', ['jn', 'jn', 'sh'], 5, 1500, 'user');
  assert.deepStrictEqual(r.route, ['sjz', 'jn', 'sh']);
});

test('9. 旅行天数不足(0/负数) → 时间可行返回 no', () => {
  const r = C.planRoute('sjz', ['jn'], 0, 800, 'user');
  assert.strictEqual(C.timeFeasible(r.route, 0).ok, 'no');
});

test('10. 百度 API 未配置 → 调用不崩溃且返回 source=mock', async () => {
  // 清空 AK
  const { JSDOM } = require('jsdom');
  const dom2 = new JSDOM('', { url: 'https://x/' });
  try { dom2.window.localStorage.clear(); } catch (e) {}
  // 用带 window 的实例测
  const w2 = dom2.window;
  Object.defineProperty(w2, 'localStorage', { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} }, configurable: true });
  const res = B.searchPOI('大明湖', '济南');
  assert.ok(res instanceof Promise);
  const out = await res;
  assert.strictEqual(out.success, false);
  assert.strictEqual(out.source, 'mock');
  assert.match(out.message, /not configured/);
});

test('页面级: 百度未配置仍渲染路线/中途/详情/地图', () => {
  const w = loadPage();
  const d = w.document;
  const sum = d.getElementById('sumBox').textContent;
  assert.ok(sum.includes('上海')); // demo4 默认
  assert.ok(d.getElementById('stopBox').textContent.length > 0);
  assert.ok(d.querySelectorAll('.city-card').length >= 2);
  assert.ok(d.querySelectorAll('#mapSvg line').length >= 1);
  assert.match(d.getElementById('mapNote').textContent, /未配置|演示/);
});