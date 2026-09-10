/* 阶段3 地图可视化测试 — 用 mock BMap 命名空间验证 Marker/Polyline/视野/清理
 * 不依赖真实网络与真实 AK(避免泄露), 不改动原项目测试 */
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { JSDOM } = require('jsdom');

const BASE = path.join(__dirname, '..');

/* mock 百度命名空间: 记录所有 overlay 操作, 供断言 */
function mockNS(log) {
  function Point(lon, lat) { this.lon = lon; this.lat = lat; }
  function Label(text, opt) { this.text = text; this.opt = opt; }
  function Size(w, h) { this.w = w; this.h = h; }
  function Marker(pt, cfg) { this.pt = pt; this.cfg = cfg; this._click = null; }
  Marker.prototype.addEventListener = function (ev, fn) { if (ev === 'click') this._click = fn; };
  Marker.prototype.setLabel = function (l) { this.label = l; };
  function Polyline(pts, opt) { this.pts = pts; this.opt = opt; }
  function InfoWindow(html) { this.html = html; }
  function Map(id) {
    this.id = id; this.overlays = []; this.center = null; this.zoom = null; this.removed = [];
    log.push({ op: 'newMap', id });
  }
  Map.prototype.centerAndZoom = function (pt, z) { this.center = pt; this.zoom = z; };
  Map.prototype.addOverlay = function (o) { this.overlays.push(o); log.push({ op: 'add', type: o.constructor.name }); };
  Map.prototype.removeOverlay = function (o) { this.removed.push(o); const i = this.overlays.indexOf(o); if (i >= 0) this.overlays.splice(i, 1); };
  Map.prototype.clearOverlays = function () { this.overlays = []; log.push({ op: 'clear' }); };
  Map.prototype.setViewport = function (pts) { this.viewport = pts; log.push({ op: 'setViewport', n: pts.length }); };
  Map.prototype.setCenter = function (pt) { this.center = pt; };
  Map.prototype.setZoom = function (z) { this.zoom = z; };
  Map.prototype.enableScrollWheelZoom = function () {};
  Map.prototype.enableDragging = function () {};
  Map.prototype.enableContinuousZoom = function () {};
  Map.prototype.addControl = function (c) { log.push({ op: 'addControl' }); };
  Map.prototype.destroy = function () { log.push({ op: 'destroy' }); };
  Map.prototype.openInfoWindow = function (w, pt) { this.info = { w, pt }; };
  return { Map, Point, Label, Size, Marker, Polyline, InfoWindow, NavigationControl: function () {}, ScaleControl: function () {} };
}

function boot() {
  const log = [];
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="baiduMap"></div></body></html>', { url: 'https://railgo.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK_NOT_REAL' };
  w.BMap = mockNS(log);
  w.eval(fs.readFileSync(path.join(BASE, 'baidu-map.js'), 'utf8'));
  return { w, log, BM: w.RailGoBaiduMap };
}

const ROUTES = {
  case1: [{ id: 'sjz', name: '石家庄', lat: 38.056, lon: 114.490, role: 'start' }, { id: 'jn', name: '济南', lat: 36.675, lon: 117.0, role: 'mid' }, { id: 'sh', name: '上海', lat: 31.235, lon: 121.48, role: 'end' }],
  case2: [{ id: 'bj', name: '北京', lat: 39.895, lon: 116.322, role: 'start' }, { id: 'nj', name: '南京', lat: 32.062, lon: 118.802, role: 'mid' }, { id: 'sh', name: '上海', lat: 31.235, lon: 121.48, role: 'end' }],
  single: [{ id: 'jn', name: '济南', lat: 36.675, lon: 117.0, role: 'start' }],
};

test('M1. 初始化地图成功(命名空间探测 + centerAndZoom)', async () => {
  const { BM, w } = boot();
  const r = await BM.initMap('baiduMap', { lat: 38.056, lon: 114.49, zoom: 6 });
  assert.strictEqual(r.ok, true);
  assert.ok(BM.getMap());
});

test('M2. 案例1 石→济→沪: 3 Marker + 1 Polyline + 视野适应', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 38, lon: 114 });
  const m = BM.addMarkers(ROUTES.case1);
  const p = BM.drawPolyline(ROUTES.case1);
  const f = BM.fitView(ROUTES.case1);
  assert.strictEqual(m.count, 3);
  assert.strictEqual(p.count, 1);
  assert.strictEqual(f, true);
  const map = BM.getMap();
  assert.strictEqual(map.overlays.filter(o => o.constructor.name === 'Marker').length, 3);
  assert.strictEqual(map.overlays.filter(o => o.constructor.name === 'Polyline').length, 1);
  assert.strictEqual(map.viewport.length, 3);
});

test('M3. 案例2 京→宁→沪: 同样 3 Marker + 1 Polyline', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 39, lon: 116 });
  const m = BM.addMarkers(ROUTES.case2);
  const p = BM.drawPolyline(ROUTES.case2);
  assert.strictEqual(m.count, 3);
  assert.strictEqual(p.count, 1);
});

test('M4. 单城市: 只 1 Marker, 无 Polyline, 视野用 setCenter', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 36, lon: 117 });
  const m = BM.addMarkers(ROUTES.single);
  const p = BM.drawPolyline(ROUTES.single);
  const f = BM.fitView(ROUTES.single);
  assert.strictEqual(m.count, 1);
  assert.strictEqual(p.count, 0); // 不足两点不画线
  assert.strictEqual(f, true);
});

test('M5. 缺坐标城市: 优雅跳过不崩溃', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 36, lon: 117 });
  const bad = [{ id: 'x', name: '无坐标城', lat: undefined, lon: 117 }, { id: 'jn', name: '济南', lat: 36.675, lon: 117 }];
  const m = BM.addMarkers(bad);
  assert.strictEqual(m.count, 1); // 只加了有坐标的
  assert.doesNotThrow(() => BM.drawPolyline(bad));
});

test('M6. 快速切换两个方案: 无 Marker/Polyline 叠加', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 38, lon: 114 });
  BM.addMarkers(ROUTES.case1); BM.drawPolyline(ROUTES.case1);
  BM.clearOverlays();
  BM.addMarkers(ROUTES.case2); BM.drawPolyline(ROUTES.case2);
  const map = BM.getMap();
  assert.strictEqual(map.overlays.filter(o => o.constructor.name === 'Marker').length, 3);
  assert.strictEqual(map.overlays.filter(o => o.constructor.name === 'Polyline').length, 1);
});

test('M7. 重复 addMarkers 同城不叠加(去重)', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 38, lon: 114 });
  BM.addMarkers(ROUTES.case1); BM.addMarkers(ROUTES.case1);
  const map = BM.getMap();
  assert.strictEqual(map.overlays.filter(o => o.constructor.name === 'Marker').length, 3);
});

test('M8. 未初始化地图时 API 安全返回(不抛异常)', () => {
  const { BM } = boot();
  // 未 initMap, 直接调用
  assert.strictEqual(BM.addMarkers([{ id: 'a', name: 'A', lat: 1, lon: 1 }]).ok, false);
  assert.strictEqual(BM.drawPolyline([{ lat: 1, lon: 1 }]).ok, false);
  assert.strictEqual(BM.fitView([{ lat: 1, lon: 1 }]), false);
  assert.doesNotThrow(() => BM.clearOverlays());
});

test('M9. 点击 Marker 有信息窗口(城市名)', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 38, lon: 114 });
  BM.addMarkers([{ id: 'jn', name: '济南', lat: 36.675, lon: 117, role: 'mid' }]);
  const mk = BM.getMap().overlays[0];
  assert.ok(typeof mk._click === 'function');
  mk._click();
  assert.ok(BM.getMap().info, '存在信息窗口');
});

test('M10. 空路线不崩溃', async () => {
  const { BM } = boot();
  await BM.initMap('baiduMap', { lat: 38, lon: 114 });
  assert.doesNotThrow(() => { BM.addMarkers([]); BM.drawPolyline([]); BM.fitView([]); });
});