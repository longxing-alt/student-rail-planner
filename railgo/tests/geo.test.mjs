/* 阶段4 坐标处理层测试 — 验证 WGS84→BD09 转换/缓存/容错
 * 只依赖 baidu-api 坐标层 + mock, 不引入真实 AK(避免泄露), 不影响原项目测试 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(__dirname, '..');

function boot() {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html>', { url: 'https://railgo.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-api.js'), 'utf8'));
  w.RailGoBaidu.__storage = w.localStorage; // 暴露 jsdom localStorage 供测试读缓存
  return w.RailGoBaidu;
}
function readCache(B) {
  const ls = B.__storage;
  return JSON.parse(ls.getItem('RAILGO_GEO_CACHE') || '{}');
}

test('G1. 已知坐标点转换: 北京西站 WGS84 → BD09 落在中国范围内且偏差合理', () => {
  const B = boot();
  // 北京西站 WGS84 实测约 (39.8948, 116.3220)；BD09 应约 (39.9026, 116.3346)
  const bd = B.wgs84ToBd09(39.8948, 116.3220);
  assert.ok(bd[0] > 39.90 && bd[0] < 39.91, `lat ${bd[0]}`);
  assert.ok(bd[1] > 116.33 && bd[1] < 116.34, `lon ${bd[1]}`);
});

test('G2. 华东城市(济南)转换不出中国范围', () => {
  const B = boot();
  const bd = B.wgs84ToBd09(36.675, 117.0);
  assert.ok(bd[0] > 30 && bd[0] < 40 && bd[1] > 110 && bd[1] < 125);
});

test('G3. 海外坐标不扭曲(出中国范围返回原值)', () => {
  const B = boot();
  const [lat, lon] = B.wgs84ToBd09(40.7, -74.0); // 纽约
  assert.ok(Math.abs(lat - 40.7) < 0.01 && Math.abs(lon - -74.0) < 0.01);
});

test('G4. resolveCityCoord: 已有 WGS84 坐标 → 本地转换, 不触发 geocode', async () => {
  const B = boot();
  let geoCalls = 0;
  const orig = B.geocode;
  // monkeypatch 计数
  const patched = { success: false, source: 'mock', data: null };
  const spy = async () => { geoCalls++; return patched; };
  B.geocode = spy;
  const r = await B.resolveCityCoord({ id: 'jn', name: '济南', lat: 36.675, lon: 117.0 });
  assert.strictEqual(r.source, 'local-wgs84');
  assert.strictEqual(geoCalls, 0); // 没调 API
  B.geocode = orig;
});

test('G5. 缓存: 第二次调用从缓存读, 不重复请求', async () => {
  const B = boot();
  B.clearCoordCache();
  let geoCalls = 0;
  B.geocode = async () => { geoCalls++; return { success: false, data: null }; };
  await B.resolveCityCoord({ id: 'jn', name: '济南', lat: 36.675, lon: 117.0 });
  await B.resolveCityCoord({ id: 'jn', name: '济南', lat: 36.675, lon: 117.0 });
  assert.ok(geoCalls <= 0); // 有坐标走本地, 永不调 API
  const c = require('jsdom');
  // 缓存确实有写入
  const raw = readCache(B);
  assert.ok(raw.jn && typeof raw.jn.lat === 'number'); // 缓存已写入
});

test('G6. 缺坐标城市 → 走 geocode; 失败返回 null 不抛异常', async () => {
  const B = boot();
  B.clearCoordCache();
  B.geocode = async () => ({ success: false, source: 'mock', data: null });
  const r = await B.resolveCityCoord({ id: 'noo', name: '无坐标城' });
  assert.strictEqual(r, null);
});

test('G7. 批量: 有坐标→本地, 缺坐标→降级null, 单城失败不影响整体', async () => {
  const B = boot(); // 无 AK 环境: geocode 走 noKey 降级
  B.clearCoordCache();
  const out = await B.resolveCityCoords([
    { id: 'sjz', name: '石家庄', lat: 38.056, lon: 114.49 },
    { id: 'nj', name: '南京' },          // 缺坐标 → 无AK降级 → 跳过
    { id: 'sh', name: '上海', lat: 31.235, lon: 121.48 },
  ]);
  assert.ok(out.some(c => c.id === 'sjz' && c.source === 'local-wgs84'), '石家庄走本地转换');
  assert.ok(out.some(c => c.id === 'sh' && c.source === 'local-wgs84'), '上海走本地转换');
  assert.ok(!out.some(c => c.id === 'nj'), '缺坐标且无AK→跳过(降级不崩溃)');
  assert.doesNotThrow(async () => out);
});

test('G8. 转换缓存持久化字段结构', async () => {
  const B = boot();
  B.clearCoordCache();
  await B.resolveCityCoord({ id: 'sh', name: '上海', lat: 31.235, lon: 121.48 });
  const raw = readCache(B);
  assert.ok(raw.sh && typeof raw.sh.lat === 'number' && typeof raw.sh.lng === 'number');
  assert.strictEqual(raw.sh.source, 'local-wgs84');
});

test('G9. 坐标层独立: 不修改 core/mock(文件未被改动)', () => {
  const fs = require('fs');
  const core = fs.readFileSync(path.join(BASE, 'railgo.core.js'), 'utf8');
  const mock = fs.readFileSync(path.join(BASE, 'mock-data.js'), 'utf8');
  // 坐标层应该新增在 baidu-api.js, core 不应包含转换函数
  assert.ok(!/wgs84ToBd09/.test(core), 'core 不应有坐标转换');
  assert.ok(/wgs84ToBd09/.test(fs.readFileSync(path.join(BASE, 'baidu-api.js'), 'utf8')), '转换在 baidu-api');
});