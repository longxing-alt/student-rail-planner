/* 阶段5 POI 测试 — 使用 mock, 不消耗真实百度配额, 不输出 AK */
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

/* mock BMapGL.LocalSearch: poiResponder(behavior) 决定行为
 * behavior: 函数 → 返回 Poi 数组; 'empty' → 空; 'throw' → 同步抛错 */
function boot(withAk, poiResponder) {
  const dom = new JSDOM('<!doctype html>', { url: 'https://railgo.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: withAk ? 'TEST_AK' : '' };
  w.eval(fs.readFileSync(path.join(BASE, 'mock-data.js'), 'utf8'));
  function Pt(lng, lat) { this.lng = lng; this.lat = lat; }
  function Poi(t, la, lo, addr, uid, tel) { this._t = t; this._la = la; this._lo = lo; this._a = addr; this._uid = uid; this._tel = tel; }
  Poi.prototype.getTitle = function () { return this._t; };
  Poi.prototype.getPoint = function () { return { lat: this._la, lng: this._lo }; };
  Poi.prototype.getAddress = function () { return this._a; };
  Poi.prototype.getUid = function () { return this._uid; };
  Poi.prototype.getPhoneNumber = function () { return this._tel; };
  function LocalSearch(city, o) {
    this._city = city; this._opts = o || {};
    this.onSearchComplete = this._opts.onSearchComplete || null; // 真实协议: 构造参数
    this._pois = [];
  }
  LocalSearch.prototype.setPageCapacity = function () {};
  LocalSearch.prototype.getNumPois = function () { return this._pois.length; };
  LocalSearch.prototype.getPoi = function (i) { return this._pois[i]; };
  LocalSearch.prototype.search = function (q, ro) {
    if (poiResponder === 'throw') throw new Error('boom');
    const self = this;
    setTimeout(() => {
      if (poiResponder === 'empty') { self._pois = []; }
      else if (typeof poiResponder === 'function') { self._pois = poiResponder(q) || []; }
      else { self._pois = [new Poi('趵突泉', 36.66, 117.01, '济南市历下区', 'uid-1', '0531-1'), new Poi('大明湖', 36.67, 117.02, '济南市历下区', 'uid-2', null)]; }
      const pois = self._pois;
      const results = { getCurrentNumPois: () => pois.length, getPoi: i => pois[i] };
      self.onSearchComplete && self.onSearchComplete(results);
    }, 5);
  };
  w.BMapGL = { LocalSearch, Point: Pt };
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-api.js'), 'utf8'));
  const B = w.RailGoBaidu;
  B.__storage = w.localStorage;
  return B;
}

const OK_RESULT = {
  status: 0, message: 'ok', results: [
    { name: '趵突泉', location: { lat: 36.66, lng: 117.01 }, address: '济南市历下区', uid: 'u1' },
    { name: '大明湖', location: { lat: 36.67, lng: 117.02 }, address: '济南市历下区', uid: 'u2' },
  ],
};
const EMPTY_RESULT = { status: 0, message: 'ok', results: [] };
const DISABLED_RESULT = { status: 240, message: 'APP 服务被禁用' };

test('P1. 景点查询成功(有 AK + 服务可用)', async () => {
  const B = boot(true, null);
  const r = await B.searchPoi('济南', 'attraction', { force: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, 'baidu');
  assert.strictEqual(r.data.length, 2);
});

test('P2. 餐厅查询成功', async () => {
  const B = boot(true, null);
  const r = await B.searchPoi('济南', 'restaurant', { force: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.category, 'restaurant');
});

test('P3. 酒店查询成功', async () => {
  const B = boot(true, null);
  const r = await B.searchPoi('济南', 'hotel', { force: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.category, 'hotel');
});

test('P4. 空结果是真实结果: 不用 mock 顶替(不伪造), 交给 UI 显示"暂未找到"', async () => {
  const B = boot(true, 'empty');
  const r = await B.searchPoi('济南', 'attraction', { force: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.source, 'baidu');   // 空结果仍来自百度, 不伪装成演示数据
  assert.strictEqual(r.data.length, 0); // 空就是空, 不由 RailGo 编造
});

test('P5. LocalSearch 抛错 → 降级 + 演示数据', async () => {
  const B = boot(true, 'throw');
  const r = await B.searchPoi('济南', 'attraction', { force: true });
  assert.strictEqual(r.source, 'mock');
  assert.ok(r.data.length > 0, '降级后仍有演示数据');
});

test('P6. 无 JSAPI(未初始化/无BMapGL) → 降级 mock 不崩溃', async () => {
  const dom = new JSDOM('<!doctype html>', { url: 'https://x/', runScripts: 'outside-only' });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  w.eval(fs.readFileSync(path.join(BASE, 'mock-data.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-api.js'), 'utf8')); // 不注入 BMapGL
  const B = w.RailGoBaidu;
  B.clearPoiCache();
  const r = await B.searchPoi('济南', 'attraction');
  assert.strictEqual(r.source, 'mock');
  assert.ok(r.data.length > 0);
});

test('P7. normalizePoi: 字段映射正确, 缺坐标返回 null', () => {
  const B = boot(false, null);
  const n = B.normalizePoi({ name: 'A', location: { lat: 1, lng: 2 }, address: 'x', uid: 'u' }, 'attraction');
  assert.deepStrictEqual({ id: n.id, name: n.name, address: n.address, lat: n.lat, lng: n.lng, category: n.category },
    { id: 'u', name: 'A', address: 'x', lat: 1, lng: 2, category: 'attraction' });
  assert.strictEqual(B.normalizePoi({ name: 'B' }, 'attraction'), null); // 无坐标
});

test('P8. 不伪造字段: 百度未返回评分/价格时对应字段为 null', async () => {
  const B = boot(true, null);
  const r = await B.searchPoi('济南', 'attraction', { force: true });
  const p = r.data[0];
  assert.strictEqual(p.score, undefined);   // 没有评分字段
  assert.strictEqual(p.price, undefined);   // 没有价格字段
  assert.strictEqual(p.rating, undefined);
});

test('P9. 缓存命中: 二次请求直接读缓存(source=cache)', async () => {
  const B = boot(true, null);
  B.clearPoiCache();
  const r1 = await B.searchPoi('济南', 'attraction', { force: true });
  assert.strictEqual(r1.source, 'baidu');
  const r2 = await B.searchPoi('济南', 'attraction'); // 不 force → 命中缓存
  assert.strictEqual(r2.source, 'cache');
  assert.strictEqual(r2.data.length, r1.data.length);
});

test('P10. 缓存过期: ts 超 TTL 后重新走真实通道', async () => {
  const B = boot(true, null);
  B.clearPoiCache();
  await B.searchPoi('济南', 'attraction', { force: true });
  const cache = JSON.parse(B.__storage.getItem('RAILGO_POI_CACHE'));
  cache['济南:attraction'].ts = Date.now() - (B.POI_TTL_MS + 1000);
  B.__storage.setItem('RAILGO_POI_CACHE', JSON.stringify(cache));
  const r = await B.searchPoi('济南', 'attraction');
  assert.strictEqual(r.source, 'baidu'); // 过期 → 重新检索
});

test('P11. 城市切换: 不同城市各自的缓存与数据', async () => {
  const B = boot(true, null);
  const r1 = await B.searchPoi('济南', 'attraction', { force: true });
  const r2 = await B.searchPoi('南京', 'attraction', { force: true });
  assert.strictEqual(r1.ok && r2.ok, true);
  const cache = JSON.parse(B.__storage.getItem('RAILGO_POI_CACHE'));
  assert.ok(cache['济南:attraction'] && cache['南京:attraction']);
});

test('P12. 分类切换: 不同分类使用不同缓存键', async () => {
  const B = boot(true, null);
  await B.searchPoi('济南', 'attraction', { force: true });
  await B.searchPoi('济南', 'restaurant', { force: true });
  const cache = JSON.parse(B.__storage.getItem('RAILGO_POI_CACHE'));
  assert.ok(cache['济南:attraction'] && cache['济南:restaurant']);
});

test('P13. 竞态: 旧请求返回被标记 superseded, 不覆盖新结果', async () => {
  const B = boot(true, null);
  B.clearPoiCache();
  // 连续发起两个请求, 第一个的 reqId 落后
  const p1 = B.searchPoi('济南', 'attraction', { force: true });
  const p2 = B.searchPoi('南京', 'attraction', { force: true });
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.ok(r2.reqId > r1.reqId);
  assert.strictEqual(r2.superseded, undefined); // 最新请求正常
});

test('P14. POI Marker 与铁路 Marker 隔离: clearPoiOverlays 不影响铁路层', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="m"></div></body>', { url: 'https://x/', runScripts: 'outside-only' });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  // mock BMapGL
  const log = [];
  function Pt(lon, lat) { this.lon = lon; this.lat = lat; }
  function Mk() { this.kind = 'marker'; }
  Mk.prototype.setLabel = function () {}; Mk.prototype.addEventListener = function () {};
  function Map(id) { this.o = []; this.id = id; }
  Map.prototype.centerAndZoom = function () {}; Map.prototype.enableScrollWheelZoom = function () {};
  Map.prototype.enableDragging = function () {}; Map.prototype.enableContinuousZoom = function () {};
  Map.prototype.addControl = function () {}; Map.prototype.addOverlay = function (x) { this.o.push(x); };
  Map.prototype.removeOverlay = function (x) { const i = this.o.indexOf(x); if (i >= 0) this.o.splice(i, 1); };
  Map.prototype.clearOverlays = function () { this.o = []; };
  Map.prototype.setViewport = function () {}; Map.prototype.setCenter = function () {}; Map.prototype.setZoom = function () {};
  Map.prototype.panTo = function () {}; Map.prototype.getZoom = function () { return 12; };
  Map.prototype.openInfoWindow = function () {};
  w.BMapGL = { Map, Point: Pt, Marker: Mk, Polyline: function () {}, Label: function () {}, Size: function () {}, InfoWindow: function () {}, NavigationControl: function () {}, ScaleControl: function () {} };
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-map.js'), 'utf8'));
  const BM = w.RailGoBaiduMap;
  await BM.initMap('m', { lat: 36, lon: 117 });
  BM.addMarkers([{ id: 'jn', name: '济南', lat: 36.67, lon: 117.0, role: 'start' }]);
  const railCount = BM.getMap().o.length;
  assert.strictEqual(railCount, 1);
  BM.addPoiMarkers([{ id: 'p1', name: '趵突泉', lat: 36.66, lng: 117.01 }]);
  assert.strictEqual(BM.getPoiMarkerCount(), 1);
  BM.clearPoiOverlays(); // 只清 POI
  assert.strictEqual(BM.getPoiMarkerCount(), 0);
  assert.strictEqual(BM.getMap().o.length, railCount, '铁路 Marker 仍在');
});

test('P15. 重复查询不无限增加 POI Marker', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="m"></div></body>', { url: 'https://x/', runScripts: 'outside-only' });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  function Pt(l, a) { this.lon = l; this.lat = a; }
  function Mk() {} Mk.prototype.setLabel = function () {}; Mk.prototype.addEventListener = function () {};
  function Map() { this.o = []; }
  ['centerAndZoom', 'enableScrollWheelZoom', 'enableDragging', 'enableContinuousZoom', 'addControl', 'setViewport', 'setCenter', 'setZoom', 'panTo', 'openInfoWindow'].forEach(m => Map.prototype[m] = function () {});
  Map.prototype.getZoom = function () { return 12; };
  Map.prototype.addOverlay = function (x) { this.o.push(x); };
  Map.prototype.removeOverlay = function (x) { const i = this.o.indexOf(x); if (i >= 0) this.o.splice(i, 1); };
  Map.prototype.clearOverlays = function () { this.o = []; };
  w.BMapGL = { Map, Point: Pt, Marker: Mk, Label: function () {}, Size: function () {}, InfoWindow: function () {}, NavigationControl: function () {}, ScaleControl: function () {} };
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-map.js'), 'utf8'));
  const BM = w.RailGoBaiduMap;
  await BM.initMap('m', { lat: 36, lon: 117 });
  for (let i = 0; i < 5; i++) BM.addPoiMarkers([{ id: 'a', name: 'A', lat: 36, lng: 117 }, { id: 'b', name: 'B', lat: 36.1, lng: 117.1 }]);
  assert.strictEqual(BM.getPoiMarkerCount(), 2, '恒为 2, 不叠加');
});