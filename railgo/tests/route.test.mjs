/* 阶段6.1 测试 — 单段步行路线(localRoute)
 * 全程 mock: 不发起任何真实百度请求。
 * mock BMapGL.WalkingRoute 严格采用 bundle 确证的协议:
 *   构造参数 onSearchComplete / search(start,end) / getResults() →
 *   results.getStatus()/getNumPlans()/getPlan(i) → plan.getDistance(false)/getDuration(false) */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(__dirname, '..');
const { JSDOM } = require('jsdom');

/* holder 控制 mock 行为:
 *  behavior: 'ok' | 'empty' | 'fail' | 'timeout' | 'throw'
 *  delayMs: 每个请求延迟数组(竞态用), 缺省 5ms */
function makeHolder() { return { behavior: 'ok', distance: 1234, duration: 888, delays: null, calls: [] }; }

function boot(holder, opts) {
  const o = opts || {};
  const dom = new JSDOM('<!doctype html>', { url: 'https://railgo.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  const fetchCalls = [];
  w.fetch = u => { fetchCalls.push(String(u)); return Promise.reject(new Error('no network in test')); };
  if (!o.noWalkingRoute) {
    function Point(lng, lat) { this.lng = lng; this.lat = lat; }
    let idx = 0;
    function WalkingRoute(container, opts2) {
      this._container = container; this._opts = opts2 || {};
      this.onSearchComplete = this._opts.onSearchComplete || null; // 构造参数协议
    }
    WalkingRoute.prototype.search = function (s, e) {
      const myIdx = idx++;
      holder.calls.push({ start: { lat: s.lat, lng: s.lng }, end: { lat: e.lat, lng: e.lng } });
      if (holder.behavior === 'throw') throw new Error('boom');
      const self = this;
      const delay = holder.delays ? (holder.delays[myIdx % holder.delays.length]) : 5;
      setTimeout(() => {
        if (holder.behavior === 'timeout') return; // 不回调
        let results;
        if (holder.behavior === 'fail') {
          // 真实协议无 getStatus; 失败以"取结果时抛错"表达 → 实现侧应转 SEARCH_ERROR
          results = { getNumPlans: () => { throw new Error('route failed'); } };
        } else if (holder.behavior === 'empty') {
          results = { getNumPlans: () => 0, getPlan: () => undefined };
        } else {
          // 真实结果类(bundle 确证): 只有 getNumPlans/getPlan; plan 有 getDistance/getDuration
          const plan = {
            getDistance: raw => raw === false ? holder.distance : '1.2公里',
            getDuration: raw => raw === false ? holder.duration : '15分钟',
          };
          results = { getNumPlans: () => 1, getPlan: i => (i === 0 ? plan : undefined) };
        }
        self._results = results;
        self.onSearchComplete && self.onSearchComplete(results);
      }, delay);
    };
    WalkingRoute.prototype.getResults = function () { return this._results; };
    w.BMapGL = { Point, WalkingRoute };
  }
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-api.js'), 'utf8'));
  const B = w.RailGoBaidu;
  B.__storage = w.localStorage;
  B.__holder = holder;
  B.__winDoc = () => w.document;
  B.__fetchCalls = fetchCalls;
  return B;
}

const REAL_A = { id: 'u-a', name: '外滩', lat: 31.2400, lng: 121.4900, source: 'baidu' };
const REAL_B = { id: 'u-b', name: '豫园', lat: 31.2270, lng: 121.4930, source: 'baidu' };
const MOCK_A = { id: 'sh-外滩', name: '外滩', lat: 31.240, lng: 121.490, source: 'mock' };
const MOCK_B = { id: 'sh-豫园', name: '豫园', lat: 31.227, lng: 121.493, source: 'mock' };

test('R1. WalkingRoute 成功: 真实数值/单位字段/source=baidu/est=false', async () => {
  const holder = makeHolder();
  const B = boot(holder);
  B.clearRouteCache();
  const r = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.source, 'baidu');
  assert.strictEqual(r.est, false);
  assert.strictEqual(r.distanceM, 1234);
  assert.strictEqual(r.durationS, 888);
  assert.strictEqual(r.errorCode, null);
  assert.strictEqual(r.mode, 'walking');
  assert.strictEqual(r.from.id, 'u-a');
  assert.strictEqual(r.to.id, 'u-b');
  assert.strictEqual(holder.calls.length, 1);
  assert.ok(B.__winDoc().getElementById('railgo-route-container'), '真实通道会惰性创建隐藏容器');
});

test('R2. 空结果 → EMPTY + 进入 mock fallback', async () => {
  const holder = makeHolder(); holder.behavior = 'empty';
  const B = boot(holder);
  B.clearRouteCache();
  const r = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r.status, 'ok');       // mock 估算可用
  assert.strictEqual(r.source, 'mock');
  assert.strictEqual(r.est, true);
  assert.strictEqual(r.errorCode, 'EMPTY');
  assert.ok(r.distanceM > 0 && r.durationS > 0);
});

test('R3. SDK 不存在 → NO_JSAPI + mock', async () => {
  const holder = makeHolder();
  const B = boot(holder, { noWalkingRoute: true });
  B.clearRouteCache();
  const r = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r.source, 'mock');
  assert.strictEqual(r.errorCode, 'NO_JSAPI');
  assert.strictEqual(holder.calls.length, 0);
});

test('R4. 搜索失败(status!=0) → SEARCH_ERROR + mock', async () => {
  const holder = makeHolder(); holder.behavior = 'fail';
  const B = boot(holder);
  B.clearRouteCache();
  const r = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r.source, 'mock');
  assert.strictEqual(r.errorCode, 'SEARCH_ERROR');
});

test('R5. 超时 → TIMEOUT + mock(不重试)', async () => {
  const holder = makeHolder(); holder.behavior = 'timeout';
  const B = boot(holder);
  B.clearRouteCache();
  const r = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r.source, 'mock');
  assert.strictEqual(r.errorCode, 'TIMEOUT');
  assert.strictEqual(holder.calls.length, 1, '恰好 1 次请求, 不自动重试');
}, { timeout: 15000 });

test('R6. 缓存命中: 第二次不再调用 search', async () => {
  const holder = makeHolder();
  const B = boot(holder);
  B.clearRouteCache();
  const r1 = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r1.source, 'baidu');
  const r2 = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r2.source, 'baidu');
  assert.strictEqual(r2.cached, true);
  assert.strictEqual(holder.calls.length, 1, '仅 1 次真实请求');
});

test('R7. mock 不污染缓存: 失败后恢复成功可再次真实请求', async () => {
  const holder = makeHolder(); holder.behavior = 'timeout';
  const B = boot(holder);
  B.clearRouteCache();
  const r1 = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r1.source, 'mock');
  // 恢复成功, 同一 from/to 应再次走真实通道(未被 mock 缓存)
  holder.behavior = 'ok';
  const r2 = await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r2.source, 'baidu');
  assert.strictEqual(holder.calls.length, 2);
}, { timeout: 15000 });

test('R8. 竞态: 旧请求不覆盖新请求(超时路径, 8s 上限)', async () => {
  const holder = makeHolder();
  holder.delays = [5]; // 第一个先完成
  const B = boot(holder);
  B.clearRouteCache();
  const pA = B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh', force: true });
  const pB = B.localRoute('walking', REAL_A, MOCK_B, { cityId: 'sh', force: true }); // mock POI → 立即返回
  const [rA, rB] = await Promise.all([pA, pB]);
  assert.ok(rB.reqId > rA.reqId);
  assert.strictEqual(rA.superseded, true, '旧请求被标记 superseded');
  assert.notStrictEqual(rB.superseded, true, '新请求为最新');
});

test('R9. mock POI 坐标分流: 绝不送入真实 WalkingRoute', async () => {
  const holder = makeHolder();
  const B = boot(holder);
  B.clearRouteCache();
  const r = await B.localRoute('walking', MOCK_A, MOCK_B, { cityId: 'sh' });
  assert.strictEqual(holder.calls.length, 0, 'WGS84 mock 坐标不得进入百度路线');
  assert.strictEqual(r.source, 'mock');
  assert.strictEqual(r.est, true);
  assert.ok(r.distanceM > 0);
  // 混合(一真一假)同样不得进真实通道
  const r2 = await B.localRoute('walking', REAL_A, MOCK_B, { cityId: 'sh' });
  assert.strictEqual(holder.calls.length, 0);
  assert.strictEqual(r2.source, 'mock');
});

test('R10. from.id === to.id → 0 距离直接返回, 不发请求', async () => {
  const holder = makeHolder();
  const B = boot(holder);
  const r = await B.localRoute('walking', REAL_A, REAL_A, { cityId: 'sh' });
  assert.strictEqual(r.distanceM, 0);
  assert.strictEqual(r.durationS, 0);
  assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.source, 'mock');
  assert.strictEqual(r.est, true);
  assert.strictEqual(holder.calls.length, 0);
});

test('R11. 其他 mode 明确不支持, 不偷调其他服务', async () => {
  const holder = makeHolder();
  const B = boot(holder);
  const r = await B.localRoute('driving', REAL_A, REAL_B, { cityId: 'sh' });
  assert.strictEqual(r.status, 'failed');
  assert.strictEqual(r.errorCode, 'UNSUPPORTED_MODE');
  assert.strictEqual(holder.calls.length, 0);
});

test('R12. 零真实网络: 不产生任何 Web Service 请求', async () => {
  const holder = makeHolder();
  const B = boot(holder);
  B.clearRouteCache();
  await B.localRoute('walking', REAL_A, REAL_B, { cityId: 'sh' });
  const bad = B.__fetchCalls.filter(u => /direction\/v2|place\/v2/.test(u));
  assert.strictEqual(bad.length, 0, '禁止 Web Service 路线/POI 请求: ' + JSON.stringify(bad));
});
