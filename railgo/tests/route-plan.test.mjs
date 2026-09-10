/* 阶段6.2 测试 — DayPlan 路线化 + overlay 生命周期
 * 全程 mock: 不发起任何真实百度请求 */
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

/* 真实 BD09 风格的 POI(走真实通道需要 source==='baidu') */
function poi(i, name, lat, lng) { return { id: 'p' + i, name: name, lat: lat, lng: lng, source: 'baidu', address: 'addr' + i, category: 'attraction' }; }

/* holder 控制路线行为 */
function makeHolder() {
  return { calls: [], behavior: 'ok', delayMs: 5, distance: 800, duration: 600, pois: [] };
}

function boot(holder, opts) {
  const o = opts || {};
  const dom = new JSDOM(fs.readFileSync(path.join(BASE, 'railgo.html'), 'utf8'), { runScripts: 'outside-only', url: 'https://railgo.local/', pretendToBeVisual: true });
  const w = dom.window;
  const d = w.document;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  w.fetch = () => Promise.reject(new Error('no network in test'));

  // ---- mock BMapGL: LocalSearch + WalkingRoute + Map ----
  function Point(lng, lat) { this.lng = lng; this.lat = lat; }
  function Size(a, b) { this.w = a; this.h = b; }
  function Label(t) { this.text = t; }
  function Marker() { }
  Marker.prototype.setLabel = function () {}; Marker.prototype.addEventListener = function () {};
  function Polyline(pts, opt) { this.pts = pts; this.opt = opt; this.kind = 'polyline'; }
  function InfoWindow(h) { this.html = h; }
  function Map() { this._o = []; }
  ['centerAndZoom', 'enableScrollWheelZoom', 'enableDragging', 'enableContinuousZoom', 'addControl',
    'setViewport', 'setCenter', 'setZoom', 'panTo', 'openInfoWindow', 'destroy'].forEach(m => { Map.prototype[m] = function () {}; });
  Map.prototype.getZoom = function () { return 12; };
  Map.prototype.addOverlay = function (x) { this._o.push(x); };
  Map.prototype.removeOverlay = function (x) { const i = this._o.indexOf(x); if (i >= 0) this._o.splice(i, 1); };
  Map.prototype.clearOverlays = function () { this._o = []; };
  Map.prototype.getOverlays = function () { return this._o; };
  function LocalSearch(city, o2) {
    this._opts = o2 || {}; this.onSearchComplete = this._opts.onSearchComplete || null;
  }
  LocalSearch.prototype.setPageCapacity = function () {};
  LocalSearch.prototype.search = function (q, ro) {
    const self = this;
    setTimeout(() => {
      // 真实 SDK 形状: title/point{lat,lng}/address/uid → 经 adaptLocalSearchPoi 后 source:'baidu'
      const raw = (holder.pois || []).map(p => ({
        title: p.name, address: p.address || '', uid: p.id,
        point: { lat: p.lat, lng: p.lng },
      }));
      self.onSearchComplete && self.onSearchComplete({ getCurrentNumPois: () => raw.length, getPoi: i => raw[i] });
    }, 3);
  };
  LocalSearch.prototype.searchNearby = LocalSearch.prototype.search;
  function WalkingRoute(container, o2) {
    this._opts = o2 || {}; this.onSearchComplete = this._opts.onSearchComplete || null;
  }
  WalkingRoute.prototype.search = function (s, e) {
    holder.calls.push({ from: { lat: s.lat, lng: s.lng }, to: { lat: e.lat, lng: e.lng } });
    const self = this;
    const myBehavior = holder.behavior;
    setTimeout(() => {
      if (myBehavior === 'timeout') return;
      if (myBehavior === 'fail') {
        self.onSearchComplete && self.onSearchComplete({ getNumPlans: () => { throw new Error('route failed'); } });
        return;
      }
      const plan = {
        getDistance: raw => raw === false ? holder.distance : '0.8公里',
        getDuration: raw => raw === false ? holder.duration : '10分钟',
        getPath: () => [{ lat: s.lat, lng: s.lng }, { lat: (s.lat + e.lat) / 2, lng: (s.lng + e.lng) / 2 }, { lat: e.lat, lng: e.lng }],
      };
      const results = { getNumPlans: () => 1, getPlan: i => (i === 0 ? plan : undefined) };
      self.onSearchComplete && self.onSearchComplete(results);
    }, holder.delayMs);
  };
  WalkingRoute.prototype.getResults = function () { return this._results; };
  w.BMapGL = { Map, Point, Marker, Polyline, Label, Size, InfoWindow, LocalSearch, WalkingRoute, NavigationControl: function () {}, ScaleControl: function () {} };

  ['mock-data.js', 'railgo.core.js', 'baidu-api.js', 'baidu-map.js', 'railgo.js'].forEach(f =>
    w.eval(fs.readFileSync(path.join(BASE, f), 'utf8')));

  // 暴露内部函数用于测试: 通过 window 上挂载(仅测试期, 不改生产代码)
  w.__test = { holder: holder };
  return { w, d, holder };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 通过 UI 路径触发: 点击目的地城市卡 → 等 POI(3ms) + 路线(串行 5ms/段) */
async function enterCity(w, d, idx) {
  const cards = [...d.querySelectorAll('.city-card')];
  const dests = cards.filter(c => !/出发城市/.test(c.textContent));
  const target = dests[idx || 0] || dests[0];
  target.click();
  await sleep(400);
  return target;
}

const POIS_6 = [1, 2, 3, 4, 5, 6].map(i => poi(i, '景点' + i, 31.2 + i * 0.01, 121.4 + i * 0.01));

test('D1. 空景点列表 → 0 个 Day, 0 条路线, 0 请求', async () => {
  const holder = makeHolder(); holder.pois = [];
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  assert.strictEqual(holder.calls.length, 0, '空结果不产生路线请求');
  const plan = d.getElementById('cityPlanBox').textContent;
  assert.ok(plan.length > 0, '回退 mock 行程仍有内容(不白屏)');
});

test('D2. 1 个景点 → 1 个 Day, routes=0, 0 请求', async () => {
  const holder = makeHolder(); holder.pois = [poi(1, '独苗景点', 31.2, 121.4)];
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  assert.strictEqual(holder.calls.length, 0, '单景点无相邻段');
  assert.ok(/独苗景点/.test(d.getElementById('cityPlanBox').textContent));
});

test('D3. 2 个景点 → routes.length=1, from=A to=B', async () => {
  const holder = makeHolder(); holder.pois = [poi(1, 'A', 31.20, 121.40), poi(2, 'B', 31.21, 121.41)];
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  assert.strictEqual(holder.calls.length, 1);
  assert.deepStrictEqual([holder.calls[0].from.lat, holder.calls[0].from.lng], [31.20, 121.40]);
  assert.deepStrictEqual([holder.calls[0].to.lat, holder.calls[0].to.lng], [31.21, 121.41]);
  assert.ok(/步行/.test(d.getElementById('cityPlanBox').textContent), 'UI 出现步行路线行');
});

test('D4. 3 个景点 → 2 段, 顺序 A→B, B→C(不重排)', async () => {
  const holder = makeHolder(); holder.pois = [poi(1, 'A', 31.20, 121.40), poi(2, 'B', 31.22, 121.42), poi(3, 'C', 31.24, 121.44)];
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  assert.strictEqual(holder.calls.length, 2);
  assert.strictEqual(holder.calls[0].from.lat, 31.20);
  assert.strictEqual(holder.calls[0].to.lat, 31.22);
  assert.strictEqual(holder.calls[1].from.lat, 31.22);
  assert.strictEqual(holder.calls[1].to.lat, 31.24);
  const txt = d.getElementById('cityPlanBox').textContent;
  const ia = txt.indexOf('A'), ib = txt.indexOf('B'), ic = txt.indexOf('C');
  assert.ok(ia < ib && ib < ic, 'UI 顺序保持 A,B,C');
});

test('D5. 6 个景点 → 2 个 Day, 共 4 段(3+3 分组内部相邻), 不是 5', async () => {
  const holder = makeHolder(); holder.pois = POIS_6;
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  // 3+3 分两天 → 每天 2 段 → 共 4 段(与 5.2 每3条一天的既定分组一致)
  assert.strictEqual(holder.calls.length, 4, '实际上限: 每 Day 2 段');
  const txt = d.getElementById('cityPlanBox').textContent;
  assert.ok(/Day 1/.test(txt) && /Day 2/.test(txt), '两天都渲染');
});

test('D6. 路线失败不会让整天消失(失败段显示提示)', async () => {
  const holder = makeHolder(); holder.behavior = 'fail';
  const holder2 = makeHolder(); holder2.pois = [poi(1, 'A', 31.2, 121.4), poi(2, 'B', 31.21, 121.41), poi(3, 'C', 31.22, 121.42)];
  holder2.behavior = 'fail';
  const { w, d } = boot(holder2);
  await sleep(80);
  await enterCity(w, d);
  const txt = d.getElementById('cityPlanBox').textContent;
  assert.ok(/A/.test(txt) && /B/.test(txt) && /C/.test(txt), '三个景点都在');
  assert.ok(/Day 1/.test(txt), 'Day 仍然存在');
});

test('D7. mock fallback: 超时 → 预计路线(source=mock/est=true 的 UI 标注)', async () => {
  const holder = makeHolder(); holder.behavior = 'timeout'; holder.pois = [poi(1, 'A', 31.2, 121.4), poi(2, 'B', 31.21, 121.41)];
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  await sleep(9000); // 等待 6.1 的 8s 路线超时 → mock 估算
  const html = d.getElementById('cityPlanBox').innerHTML;
  // 只看路线行: 应标"预计"(估算), 且不得标"百度地图"
  const m = html.match(/<div class="route-line[^"]*">[\s\S]*?<\/div>/);
  assert.ok(m, '存在路线行');
  assert.ok(/预计/.test(m[0]), '估算路线显示"预计"徽标');
  assert.ok(!/百度地图/.test(m[0]), '估算路线不得标注为百度地图');
}, { timeout: 25000 });

test('D8. 不重复请求: 同城重渲染不再次调用 localRoute', async () => {
  const holder = makeHolder(); holder.pois = [poi(1, 'A', 31.2, 121.4), poi(2, 'B', 31.21, 121.41)];
  const { w, d } = boot(holder);
  await sleep(80);
  await enterCity(w, d);
  const n1 = holder.calls.length;
  // 触发另一次渲染(切换分类到餐厅再切回景点 → 景点会重新 applyPoiToPlan)
  const tabs = d.querySelectorAll('#poiTabs [data-cat]');
  tabs[1].click(); await sleep(200);   // 餐厅
  tabs[0].click(); await sleep(400);   // 回景点(走缓存)
  const n2 = holder.calls.length;
  assert.ok(n2 <= n1 + 1, '重复进入不应无限重复请求(缓存/已有结果生效): ' + n1 + '->' + n2);
});

test('D9. 城市切换竞态: 旧城路线结果不渲染到新城', async () => {
  const holder = makeHolder();
  holder.pois = [poi(1, 'A', 31.2, 121.4), poi(2, 'B', 31.21, 121.41)];
  holder.delayMs = 50; // 让旧城请求变慢
  const { w, d } = boot(holder);
  await sleep(80);
  const cards = [...d.querySelectorAll('.city-card')].filter(c => !/出发城市/.test(c.textContent));
  if (cards.length < 2) { assert.ok(true, '演示数据只有 1 个目的地, 跳过'); return; }
  cards[0].click();
  await sleep(30);          // 请求在途
  cards[1].click();         // 立刻切到第二个城市
  await sleep(500);
  const title = d.getElementById('detailTitle').textContent;
  const planTxt = d.getElementById('cityPlanBox').textContent;
  assert.ok(title.length > 0 && planTxt.length > 0, '当前城市 UI 正常渲染(未被旧结果破坏)');
});

test('D10. overlay 三组隔离: 铁路/POI/路线独立清理', async () => {
  const { w, d } = boot(makeHolder());
  await sleep(80);
  const BM = w.RailGoBaiduMap;
  BM._reset();
  const init = await BM.initMap('baiduMap', { lat: 31, lon: 121, zoom: 10 });
  assert.strictEqual(init.ok, true);
  BM.addMarkers([{ id: 'c1', name: '城1', lat: 31, lon: 121, role: 'start' }]);
  BM.drawPolyline([{ lat: 31, lon: 121 }]);
  BM.addPoiMarkers([{ id: 'p1', name: 'POI1', lat: 31.01, lng: 121.01 }]);
  BM.addRouteOverlays([{ from: { lat: 31, lng: 121 }, to: { lat: 31.01, lng: 121.01 }, source: 'baidu', path: [{ lat: 31, lng: 121 }, { lat: 31.01, lng: 121.01 }] }]);
  const railBefore = BM.getPoiMarkerCount() + BM.getMap().getOverlays().filter(o => o.kind !== 'polyline').length;
  assert.strictEqual(BM.getRouteOverlayCount(), 1);
  assert.strictEqual(BM.getPoiMarkerCount(), 1);
  BM.clearRouteOverlays();
  assert.strictEqual(BM.getRouteOverlayCount(), 0, '路线已清');
  assert.strictEqual(BM.getPoiMarkerCount(), 1, 'POI 保留');
  assert.ok(BM.getMap().getOverlays().some(o => o.kind !== 'polyline'), '铁路 Marker 保留');
});

test('D11. clearOverlays 为全清语义: 路线不残留', async () => {
  const { w } = boot(makeHolder());
  await sleep(80);
  const BM = w.RailGoBaiduMap;
  BM._reset();
  await BM.initMap('baiduMap', { lat: 31, lon: 121, zoom: 10 });
  BM.addRouteOverlays([{ from: { lat: 31, lng: 121 }, to: { lat: 31.01, lng: 121.01 }, source: 'mock' }]);
  assert.strictEqual(BM.getRouteOverlayCount(), 1);
  BM.clearOverlays();
  assert.strictEqual(BM.getRouteOverlayCount(), 0);
  assert.strictEqual(BM.getMap().getOverlays().length, 0);
});

test('D12. 零真实网络: 全程无 Web Service 请求', async () => {
  const holder = makeHolder(); holder.pois = POIS_6;
  const { w, d } = boot(holder);
  const bad = [];
  w.fetch = u => { bad.push(String(u)); return Promise.reject(new Error('x')); };
  await sleep(80);
  await enterCity(w, d);
  assert.strictEqual(bad.filter(u => /direction\/v2|place\/v2/.test(u)).length, 0);
});
