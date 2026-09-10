/* 阶段5.2 测试 — POI 融入旅行方案(Day 行程由真实 POI 驱动)
 * 全程 mock: 不发起任何真实百度请求(不消耗并发额度); 使用与真实 SDK 一致的
 * LocalSearch 协议(构造参数回调 + results.getCurrentNumPois()/getPoi(i)) */
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

const SH_POIS = [
  { title: '外滩', address: '上海市黄浦区中山东一路', uid: 'u-sh-1', point: { lat: 31.2400, lng: 121.4900 } },
  { title: '豫园', address: '上海市黄浦区福佑路168号', uid: 'u-sh-2', point: { lat: 31.2270, lng: 121.4930 } },
  { title: '东方明珠广播电视塔', address: '上海市浦东新区世纪大道1号', uid: 'u-sh-3', point: { lat: 31.2397, lng: 121.4990 } },
  { title: '南京路步行街', address: '上海市黄浦区南京东路', uid: 'u-sh-4', point: { lat: 31.2350, lng: 121.4750 } },
  { title: '田子坊', address: '上海市黄浦区泰康路210弄', uid: 'u-sh-5', point: { lat: 31.2090, lng: 121.4680 } },
  { title: '上海博物馆', address: '上海市黄浦区人民大道201号', uid: 'u-sh-6', point: { lat: 31.2280, lng: 121.4750 } },
];

/* 可控 POI 源: holder.pois 决定 LocalSearch 返回内容 */
function makeHolder() { return { pois: SH_POIS }; }

function boot(holder) {
  const html = fs.readFileSync(path.join(BASE, 'railgo.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://railgo.local/', pretendToBeVisual: true });
  const w = dom.window;
  w.RAILGO_CONFIG = { BAIDU_MAP_AK: 'TEST_AK' };
  const fetchCalls = [];
  w.fetch = (u) => { fetchCalls.push(String(u)); return Promise.reject(new Error('no network in test')); };

  // ---- mock BMapGL(与真实 SDK 协议一致) ----
  function Point(lng, lat) { this.lng = lng; this.lat = lat; }
  function Size(a, b) { this.w = a; this.h = b; }
  function Label(t) { this.text = t; }
  function Marker() { }
  Marker.prototype.setLabel = function () {}; Marker.prototype.addEventListener = function () {};
  function Polyline() { }
  function InfoWindow(h) { this.html = h; }
  function Map() { this._o = []; }
  ['centerAndZoom', 'enableScrollWheelZoom', 'enableDragging', 'enableContinuousZoom', 'addControl',
    'setViewport', 'setCenter', 'setZoom', 'panTo', 'openInfoWindow', 'destroy'].forEach(m => { Map.prototype[m] = function () {}; });
  Map.prototype.getZoom = function () { return 12; };
  Map.prototype.addOverlay = function (x) { this._o.push(x); };
  Map.prototype.removeOverlay = function (x) { const i = this._o.indexOf(x); if (i >= 0) this._o.splice(i, 1); };
  Map.prototype.clearOverlays = function () { this._o = []; };
  Map.prototype.getOverlays = function () { return this._o; };
  function LocalSearch(city, opts) {
    this._city = city; this._opts = opts || {};
    this.onSearchComplete = this._opts.onSearchComplete || null; // 真实协议: 构造参数
  }
  LocalSearch.prototype.setPageCapacity = function () {};
  LocalSearch.prototype.search = function (q, ro) {
    const self = this;
    setTimeout(() => {
      const pois = holder.pois || [];
      const results = { getCurrentNumPois: () => pois.length, getPoi: i => pois[i] };
      self.onSearchComplete && self.onSearchComplete(results);
    }, 5);
  };
  LocalSearch.prototype.searchNearby = LocalSearch.prototype.search;
  w.BMapGL = { Map, Point, Marker, Polyline, Label, Size, InfoWindow, LocalSearch, NavigationControl: function () {}, ScaleControl: function () {} };

  ['mock-data.js', 'railgo.core.js', 'baidu-api.js', 'baidu-map.js', 'railgo.js'].forEach(f =>
    w.eval(fs.readFileSync(path.join(BASE, f), 'utf8')));
  return { w, d: w.document, fetchCalls };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function clickDestCity(w, d) {
  const cards = [...d.querySelectorAll('.city-card')];
  const dest = cards.find(c => !/出发城市/.test(c.textContent)) || cards[cards.length - 1];
  dest.click();
  return dest.textContent.trim().slice(0, 16);
}

test('S1. 真实 POI → 城市 Day 行程由百度真实景点驱动', async () => {
  const holder = makeHolder();
  const { w, d } = boot(holder);
  await sleep(80);
  clickDestCity(w, d);
  await sleep(120); // 等 LocalSearch mock 回调 + UI 更新
  const plan = d.getElementById('cityPlanBox').textContent;
  assert.ok(/外滩|豫园|东方明珠/.test(plan), '行程使用真实 POI 名称: ' + plan.slice(0, 60));
  assert.ok(/百度地图/.test(d.getElementById('detailTitle').textContent), '标题标注百度地图来源');
  assert.ok(/时长为预计/.test(d.getElementById('detailTitle').textContent), '明确标注时长为预计');
});

test('S2. POI 列表与行程同源(真实性标注一致)', async () => {
  const holder = makeHolder();
  const { w, d } = boot(holder);
  await sleep(80);
  clickDestCity(w, d);
  await sleep(120);
  const box = d.getElementById('poiBox');
  const items = box.querySelectorAll('.poi-item').length;
  assert.strictEqual(items, SH_POIS.length);
  assert.ok(/百度地图/.test(box.textContent), '列表标注百度地图');
  assert.ok(/上海博物馆/.test(d.getElementById('cityPlanBox').textContent), '行程含第 6 个真实景点');
});

test('S3. POI 不可用(空结果) → 行程回退 mock 版, 不伪造', async () => {
  const holder = makeHolder();
  const { w, d } = boot(holder);
  await sleep(80);
  clickDestCity(w, d);
  await sleep(120);
  assert.ok(/预计游玩/.test(d.getElementById('cityPlanBox').textContent), '先确认真实版已生效(预计游玩为 POI 版标记)');
  // 同城再次进入但 POI 返回空 → 应回退 mock 版行程
  holder.pois = [];
  clickDestCity(w, d);
  await sleep(120);
  const plan = d.getElementById('cityPlanBox').textContent;
  assert.ok(!/预计游玩/.test(plan), '真实 POI 版行程已撤下');
  assert.ok(/【模拟】/.test(plan), '回退为 mock 版行程(原有行为)');
  const title = d.getElementById('detailTitle').textContent;
  assert.ok(/模拟/.test(title) && !/百度地图/.test(title), '标题回退为模拟标注: ' + title);
});

test('S4. 零真实网络请求: 无 place/v2/search、无百度 Web 服务', async () => {
  const holder = makeHolder();
  const { w, d, fetchCalls } = boot(holder);
  await sleep(80);
  clickDestCity(w, d);
  await sleep(120);
  const bad = fetchCalls.filter(u => /place\/v2|place\/v3|geocod|direction/.test(u));
  assert.strictEqual(bad.length, 0, '不得发起 Web 服务请求: ' + JSON.stringify(bad));
});

test('S5. 行程由 POI 驱动时不产生未捕获异常', async () => {
  const holder = makeHolder();
  const { w, d } = boot(holder);
  const errs = [];
  w.addEventListener('error', e => errs.push(e.message));
  await sleep(80);
  clickDestCity(w, d);
  await sleep(150);
  assert.deepStrictEqual(errs, []);
});