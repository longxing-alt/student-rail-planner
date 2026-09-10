/* 阶段5.1 LocalSearch 通道测试 — mock BMapGL.LocalSearch, 不消耗真实配额 */
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

/* mock BMapGL.LocalSearch / Point / Poi */
function makeMockNS(opts) {
  const o = opts || {};
  const calls = [];
  function Point(lng, lat) { this.lng = lng; this.lat = lat; }
  function Poi(title, lat, lng, address, uid, tel) {
    this._t = title; this._lat = lat; this._lng = lng; this._a = address; this._uid = uid; this._tel = tel;
  }
  Poi.prototype.getTitle = function () { return this._t; };
  Poi.prototype.getPoint = function () { return { lat: this._lat, lng: this._lng }; };
  Poi.prototype.getAddress = function () { return this._a; };
  Poi.prototype.getUid = function () { return this._uid; };
  Poi.prototype.getPhoneNumber = function () { return this._tel; };
  function LocalSearch(city, o2) {
    // 真实 SDK 协议: 回调从构造参数 opts.onSearchComplete 读取
    this._city = city; this._opts = o2 || {};
    this.onSearchComplete = this._opts.onSearchComplete || null;
    this._pois = []; calls.push({ type: 'new', city });
  }
  LocalSearch.prototype.setPageCapacity = function (n) { this._cap = n; };
  LocalSearch.prototype.search = function (query, ro) {
    calls.push({ type: 'search', query, ro });
    if (o.behavior === 'throw') throw new Error('boom'); // 同步抛出 → 实现侧必须捕获
    const self = this;
    setTimeout(() => {
      if (o.behavior === 'timeout') return; // 不回调 → 触发超时
      let pois;
      if (o.behavior === 'fail') pois = [];
      else if (o.pois) pois = o.pois;
      else pois = [
        new Poi('趵突泉', 36.66, 117.01, '济南市历下区', 'uid-1', '0531-123'),
        new Poi('大明湖', 36.67, 117.02, '济南市历下区', 'uid-2', null),
      ];
      // 真实协议: results 对象提供 getCurrentNumPois/getPoi
      const results = { getCurrentNumPois: () => pois.length, getPoi: i => pois[i] };
      self.onSearchComplete && self.onSearchComplete(results);
    }, 5);
  };
  LocalSearch.prototype.searchNearby = function (query, center, radius, ro) {
    calls.push({ type: 'nearby', query, center: { lat: center.lat, lng: center.lng }, radius, ro });
    const self = this;
    setTimeout(() => {
      const pois = o.pois || [new Poi('附近景点A', center.lat + 0.001, center.lng + 0.001, 'addr', 'uid-n1', null)];
      const results = { getCurrentNumPois: () => pois.length, getPoi: i => pois[i] };
      self.onSearchComplete && self.onSearchComplete(results);
    }, 5);
  };
  return { ns: { LocalSearch, Point }, calls };
}

function boot(withNs, opts) {
  const dom = new JSDOM('<!doctype html>', { url: 'https://railgo.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  w.eval(fs.readFileSync(path.join(BASE, 'mock-data.js'), 'utf8'));
  let calls = [];
  if (withNs) { const m = makeMockNS(opts); w.BMapGL = m.ns; calls = m.calls; }
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-api.js'), 'utf8'));
  const B = w.RailGoBaidu;
  B.__storage = w.localStorage;
  B.__calls = calls;
  B.__win = w;
  return B;
}

test('L1. LocalSearch 可用性探测', () => {
  assert.strictEqual(boot(false).localSearchAvailable(), false);
  assert.strictEqual(boot(true).localSearchAvailable(), true);
});

test('L2. 适配器: getPoint/getTitle/getAddress/getUid/getPhoneNumber → 项目 POI 结构', () => {
  const B = boot(false);
  function P() {}
  P.prototype.getTitle = () => '趵突泉';
  P.prototype.getPoint = () => ({ lat: 36.66, lng: 117.01 });
  P.prototype.getAddress = () => '济南市历下区';
  P.prototype.getUid = () => 'u1';
  P.prototype.getPhoneNumber = () => '0531-1';
  const a = B.adaptLocalSearchPoi(new P(), 'attraction');
  assert.strictEqual(a.id, 'u1');
  assert.strictEqual(a.name, '趵突泉');
  assert.strictEqual(a.address, '济南市历下区');
  assert.strictEqual(a.lat, 36.66);
  assert.strictEqual(a.lng, 117.01);
  assert.strictEqual(a.category, 'attraction');
  assert.strictEqual(a.telephone, '0531-1');
  assert.strictEqual(a.source, 'baidu');
});

test('L3. 适配器: 缺坐标返回 null(不伪造)', () => {
  const B = boot(false);
  function P() {} P.prototype.getTitle = () => 'X';
  assert.strictEqual(B.adaptLocalSearchPoi(new P(), 'attraction'), null);
});

test('L4. 适配器兼容属性式 Poi(title/point 属性而非方法)', () => {
  const B = boot(false);
  const a = B.adaptLocalSearchPoi({ title: '属性式', point: { lat: 1, lng: 2 }, address: 'a', uid: 'u' }, 'hotel');
  assert.strictEqual(a.name, '属性式');
  assert.strictEqual(a.lat, 1);
});

test('L5. localSearchPOI 成功: 返回标准化 POI(带 category/source)', async () => {
  const B = boot(true);
  const r = await B.localSearchPOI('景点', '济南', 'attraction');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(r.data[0].name, '趵突泉');
  assert.strictEqual(r.data[0].source, 'baidu');
  assert.strictEqual(r.data[0].category, 'attraction');
});

test('L6. localSearchPOI: 无 JSAPI → NO_JSAPI 不崩溃', async () => {
  const B = boot(false);
  const r = await B.localSearchPOI('景点', '济南', 'attraction');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorCode, 'NO_JSAPI');
});

test('L7. localSearchPOI: 超时保护(不回调时 8s 内返回 TIMEOUT)', async () => {
  const B = boot(true, { behavior: 'timeout' });
  const t0 = Date.now();
  const r = await B.localSearchPOI('景点', '济南', 'attraction');
  const dt = Date.now() - t0;
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorCode, 'TIMEOUT');
  assert.ok(dt >= 7000 && dt < 11000, '耗时 ' + dt + 'ms');
}, { timeout: 15000 });

test('L8. localSearchNearby: 关键词+中心+半径 正确传入 searchNearby', async () => {
  const B = boot(true);
  const r = await B.localSearchNearby('景点', { lat: 36.66, lng: 117.01 }, 3000, 'attraction');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.data.length, 1);
  const c = B.__calls.find(x => x.type === 'nearby');
  assert.ok(c, '调用了 searchNearby');
  assert.strictEqual(c.radius, 3000);
  assert.strictEqual(c.center.lng, 117.01);
});

test('L9. localSearchNearby: 半径超限被夹紧(上限 100000)', async () => {
  const B = boot(true);
  await B.localSearchNearby('景点', { lat: 36, lng: 117 }, 999999, 'attraction');
  const c = B.__calls.find(x => x.type === 'nearby');
  assert.strictEqual(c.radius, 100000);
});

test('L10. localSearchNearby: 缺中心坐标 → NO_CENTER 不崩溃', async () => {
  const B = boot(true);
  const r = await B.localSearchNearby('景点', null, 1000, 'attraction');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errorCode, 'NO_CENTER');
});

test('L11. searchPoi 真实通道 = LocalSearch(不再走 Web Service fetch)', async () => {
  const B = boot(true);
  // 若代码偷偷 fetch /place/v2/search, 这里会记录到
  const fetched = [];
  B.__win.fetch = async (u) => { fetched.push(String(u)); return { ok: false, json: async () => ({}) }; };
  B.clearPoiCache();
  const r = await B.searchPoi('济南', 'attraction');
  assert.strictEqual(r.source, 'baidu');
  assert.strictEqual(r.data.length, 2);
  assert.strictEqual(fetched.filter(u => /place\/v2\/search/.test(u)).length, 0, '不得调用 Web Service POI fetch');
  assert.ok(B.__calls.some(c => c.type === 'search'), '使用了 LocalSearch.search');
}, { timeout: 15000 });

test('L12. LocalSearch 空结果: 不伪造, 交给 UI 显示暂未找到', async () => {
  const B = boot(true, { behavior: 'fail' }); // 空结果回调
  B.clearPoiCache();
  const r = await B.searchPoi('济南', 'attraction');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, 'baidu'); // 真实通道的空结果 = 空, 不用 mock 顶替
  assert.strictEqual(r.data.length, 0);
}, { timeout: 15000 });

test('L12b. LocalSearch 异常(抛错) → 降级演示数据(source:mock, 不崩溃)', async () => {
  const B = boot(true, { behavior: 'throw' });
  B.clearPoiCache();
  const r = await B.searchPoi('济南', 'attraction');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, 'mock');
  assert.ok(r.data.length > 0, '演示数据可用, 不崩溃');
}, { timeout: 15000 });

test('L13. searchPoi 缓存仍然有效(LocalSearch 只调一次)', async () => {
  const B = boot(true);
  B.clearPoiCache();
  await B.searchPoi('济南', 'attraction');
  const n1 = B.__calls.filter(c => c.type === 'search').length;
  const r2 = await B.searchPoi('济南', 'attraction');
  const n2 = B.__calls.filter(c => c.type === 'search').length;
  assert.strictEqual(r2.source, 'cache');
  assert.strictEqual(n1, n2, '缓存命中不再发检索');
}, { timeout: 15000 });

test('L14. 竞态处理仍在: 旧请求 superseded', async () => {
  const B = boot(true);
  B.clearPoiCache();
  const p1 = B.searchPoi('济南', 'attraction', { force: true });
  const p2 = B.searchPoi('南京', 'attraction', { force: true });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok(r2.reqId > r1.reqId);
  assert.strictEqual(r2.superseded, undefined);
  assert.ok(r1.superseded === undefined || r1.superseded === true);
}, { timeout: 15000 });

test('L15. searchPOI/searchNearbyPOI 仍存在且保持原职责签名(停用但保留)', () => {
  const B = boot(false);
  assert.strictEqual(typeof B.searchPOI, 'function');
  assert.strictEqual(typeof B.searchNearbyPOI, 'function');
  assert.strictEqual(B.searchPOI.length, 3);        // (query, city, opts)
  assert.strictEqual(B.searchNearbyPOI.length, 5);  // (query, lat, lon, radiusM, opts)
});