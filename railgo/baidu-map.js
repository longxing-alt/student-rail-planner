/* RailGo · 百度地图 JSAPI 加载与初始化封装（阶段 2：最小可用接入）
 *
 * 依据百度官方文档核实（非凭记忆）：
 *  - 浏览器端 AK 才能接入 JS API；必须配置 Referer 白名单（本地开发需含 localhost/127.0.0.1）
 *  - 容器元素必须已存在于页面；初始化为 map.centerAndZoom(point, zoom)
 *  - 地图坐标要求 BD09（本项目站表为 WGS84 近似 → 阶段4 统一转换，本阶段仅取近似中心）
 *  - JSAPI 4.0 经典命名空间为 BMap；JSAPI GL 历史版为 BMapGL(v=1.0&type=webgl)
 *    本加载器运行时探测命名空间，两者皆可工作，不假设某一种。
 *
 * 安全：AK 仅从 window.RAILGO_CONFIG / localStorage 读取，绝不硬编码、绝不打印。
 */
(function () {
  'use strict';
  const root = (typeof window !== 'undefined') ? window : globalThis;

  const AK_KEY = 'RAILGO_BAIDU_AK';
  const SDK_TIMEOUT_MS = 9000;
  const SCRIPT_ID = 'railgo-baidu-sdk';

  let sdkPromise = null;   // 单次加载承诺(模块级单例, 防重复插入 script)
  let mapInstance = null;  // 当前地图实例
  let markerMap = null;    // cityId → Marker, 用于去重(铁路层)
  let currentPolyline = null; // 当前路线, 用于清理(铁路层)
  let poiMarkers = [];     // 阶段5: POI Marker 独立数组, 与铁路层彻底隔离
  let routeOverlays = [];  // 阶段6.2: 城市内路线 Polyline 独立数组(第三组)

  function getAK() {
    const cfg = root.RAILGO_CONFIG;
    if (cfg && cfg.BAIDU_MAP_AK) return cfg.BAIDU_MAP_AK;
    try { return root.localStorage.getItem(AK_KEY) || ''; } catch (e) { return ''; }
  }
  function isAvailable() { return !!getAK(); }

  /* 运行时探测已注入的百度命名空间 */
  function detectNS() {
    if (root.BMapGL && root.BMapGL.Map) return root.BMapGL;
    if (root.BMap && root.BMap.Map) return root.BMap;
    return null;
  }

  /**
   * 加载 SDK —— 单例承诺, 重复调用不会重复插入 script。
   * 成功: {ok:true, ns}
   * 失败: {ok:false, code, message}  code ∈ NO_AK | NETWORK_ERROR | TIMEOUT | NO_NAMESPACE
   */
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(resolve => {
      const ak = getAK();
      if (!ak) return resolve({ ok: false, code: 'NO_AK', message: '未配置百度地图 AK' });

      // 已加载过(例如页面其他脚本注入) → 直接复用
      const ns = detectNS();
      if (ns) return resolve({ ok: true, ns });

      let settled = false;
      const done = r => { if (!settled) { settled = true; resolve(r); } };

      // 若脚本节点已存在但尚未就绪, 复用同一节点等待, 不重复插入
      let el = root.document.getElementById(SCRIPT_ID);
      if (!el) {
        el = root.document.createElement('script');
        el.id = SCRIPT_ID;
        el.type = 'text/javascript';
        el.async = true;
        // 直接加载 getscript(而非 api?v=4.0): api 端点内部用 document.write 注入
        // getscript, 而 Chromium 会忽略"异步动态插入脚本"的 document.write →
        // BMapGL 永不定义(真实浏览器已验证)。直连 getscript 实测 BMapGL/
        // LocalSearch 均立即可用, 故直接使用该方式。
        el.src = 'https://api.map.baidu.com/getscript?v=' + (root.RAILGO_MAP_VER || '4.0') +
          '&ak=' + encodeURIComponent(ak) + '&services=&t=' + Date.now();
        el.onerror = () => done({ ok: false, code: 'NETWORK_ERROR', message: '百度地图 SDK 加载失败(网络或 AK/Referer 限制)' });
        root.document.head.appendChild(el);
      }

      const t0 = Date.now();
      const timer = setInterval(() => {
        const n = detectNS();
        if (n) { clearInterval(timer); done({ ok: true, ns: n }); return; }
        if (Date.now() - t0 > SDK_TIMEOUT_MS) {
          clearInterval(timer);
          done({ ok: false, code: 'TIMEOUT', message: '百度地图 SDK 加载超时' });
        }
      }, 120);
    });
    return sdkPromise;
  }

  /**
   * 初始化地图 —— 失败不抛异常, 返回统一结构供 UI 决定是否回退 SVG。
   * @param {string} containerId 已存在于页面的容器 id
   * @param {{lat:number, lon:number, zoom?:number}} center 默认中心(WGS84 近似)
   */
  async function initMap(containerId, center) {
    const r = await loadSdk();
    if (!r.ok) return { ok: false, ...r, fallback: true };
    const container = root.document.getElementById(containerId);
    if (!container) return { ok: false, code: 'NO_CONTAINER', message: '地图容器不存在', fallback: true };
    try {
      destroyMap(); // 幂等: 避免重复初始化造成资源叠加
      const ns = r.ns;
      const map = new ns.Map(containerId);           // BMap.Map / BMapGL.Map
      const pt = new ns.Point(center.lon, center.lat); // 官方: 经度在前
      map.centerAndZoom(pt, center.zoom || 6);
      if (map.enableScrollWheelZoom) map.enableScrollWheelZoom(true);
      if (map.enableDragging) map.enableDragging(true);
      if (map.enableContinuousZoom) map.enableContinuousZoom(true);
      // 基础控件(经典版提供; GL 亦有同名类)
      try {
        if (ns.NavigationControl && map.addControl) map.addControl(new ns.NavigationControl());
        if (ns.ScaleControl && map.addControl) map.addControl(new ns.ScaleControl());
      } catch (e) { /* 控件非必需, 失败不影响地图 */ }
      mapInstance = map;
      return { ok: true, ns, map, source: 'baidu' };
    } catch (e) {
      return { ok: false, code: 'INIT_ERROR', message: (e && e.message) || '地图初始化失败', fallback: true };
    }
  }

  function destroyMap() {
    try {
      if (mapInstance && mapInstance.clearOverlays) mapInstance.clearOverlays();
      if (mapInstance && mapInstance.destroy) mapInstance.destroy();
    } catch (e) { /* 忽略销毁异常 */ }
    mapInstance = null;
    markerMap = null;
    currentPolyline = null;
    poiMarkers = [];
  }

  function getMap() { return mapInstance; }

  /* ==================== 阶段 3: 铁路旅行方案可视化 API ====================
   * 全部基于已初始化地图; 未初始化/缺坐标均安全返回, 不抛异常。
   * 注意: 这些是"RailGo 旅行路线示意", 不是铁路真实轨道; 不调用百度驾车/步行。
   */

  /**
   * 添加城市 Marker(去重: 同 key 的城市只更新不重复添加)
   * @param {Array<{id:string,name:string,lat:number,lon:number,role:'start'|'mid'|'end'}>} cities
   */
  function addMarkers(cities) {
    const map = mapInstance, ns = detectNS();
    if (!map || !ns) return { ok: false, code: 'NO_MAP' };
    if (!markerMap) markerMap = {};
    const labels = { start: '（出发）', mid: '', end: '（终点）' };
    const colors = { start: '#1a1f2e', mid: '#3a5bd9', end: '#129a5f' };
    for (const c of cities || []) {
      if (!c || typeof c.lat !== 'number' || typeof c.lon !== 'number') continue; // 缺坐标跳过
      try {
        const pt = new ns.Point(c.lon, c.lat);
        const cfg = { title: c.name };
        if (c.role === 'start' || c.role === 'end') cfg.label = { text: c.name + (labels[c.role] || ''), position: 'top' };
        if (c.role === 'mid') cfg.label = { text: c.name, position: 'top' };
        const mk = new ns.Marker(pt, cfg);
        if (mk.setLabel) mk.setLabel(new ns.Label(c.name + (labels[c.role] || ''), { offset: new ns.Size(0, -20) }));
        map.addOverlay(mk);
        // 去重: 若已有同 cityId 的旧 marker 先移除
        if (markerMap[c.id]) { try { map.removeOverlay(markerMap[c.id]); } catch (e) {} }
        markerMap[c.id] = mk;
        // 点击显示城市名
        if (mk.addEventListener) mk.addEventListener('click', () => {
          const info = new ns.InfoWindow('<b>' + c.name + '</b>（' + (labels[c.role] || '途经城市') + '）');
          map.openInfoWindow(info, pt);
        });
      } catch (e) { /* 单个 Marker 失败不影响其余 */ }
    }
    return { ok: true, count: Object.keys(markerMap).length };
  }

  /**
   * 绘制旅行路线(Polyline, 虚线示意)
   * @param {Array<{lat,lon}>} pts 有序坐标
   */
  function drawPolyline(pts) {
    const map = mapInstance, ns = detectNS();
    if (!map || !ns) return { ok: false, code: 'NO_MAP' };
    clearPolyline();
    const valid = (pts || []).filter(p => p && typeof p.lat === 'number' && typeof p.lon === 'number');
    if (valid.length < 2) return { ok: true, count: 0 };
    try {
      const line = new ns.Polyline(valid.map(p => new ns.Point(p.lon, p.lat)), {
        strokeColor: '#3a5bd9', strokeWeight: 4, strokeOpacity: 0.85, strokeStyle: 'dashed',
      });
      map.addOverlay(line);
      currentPolyline = line;
      return { ok: true, count: 1 };
    } catch (e) {
      return { ok: false, code: 'DRAW_ERROR', message: (e && e.message) || '绘制失败' };
    }
  }

  /** 清除全部覆盖物(Marker + Polyline), 防止切换方案时叠加 */
  function clearOverlays() {
    try { if (mapInstance && mapInstance.clearOverlays) mapInstance.clearOverlays(); } catch (e) {}
    markerMap = {}; currentPolyline = null;
    poiMarkers = []; // 铁路层清理时同步重置 POI 引用(覆盖物已被 clearOverlays 清空)
    routeOverlays = []; // 6.2: 路线引用同步重置(同上)
  }
  function clearPolyline() {
    try { if (mapInstance && currentPolyline && mapInstance.removeOverlay) mapInstance.removeOverlay(currentPolyline); } catch (e) {}
    currentPolyline = null;
  }

  /** 自动调整视野使全部点可见 */
  function fitView(pts) {
    const map = mapInstance, ns = detectNS();
    if (!map) return false;
    const valid = (pts || []).filter(p => p && typeof p.lat === 'number' && typeof p.lon === 'number');
    if (!valid.length) return false;
    if (valid.length === 1) {
      try { map.setCenter(new ns.Point(valid[0].lon, valid[0].lat)); map.setZoom(12); return true; } catch (e) { return false; }
    }
    try { map.setViewport(valid.map(p => new ns.Point(p.lon, p.lat))); return true; } catch (e) { return false; }
  }

  /** 测试用: 重置单例状态(不影响生产逻辑) */
  function _reset() { sdkPromise = null; destroyMap(); }

  /* ==================== 阶段5: POI 覆盖物(与铁路层分组隔离) ====================
   * 关键: clearPoiOverlays 只删 POI, 不动铁路 Marker/Polyline; 反之亦然。
   * POI 数据由调用方(railgo.js)经 baidu-api.searchPoi 取得并标准化。
   */

  /** 渲染 POI Marker(先清旧 POI, 再画新的, 避免无限叠加) */
  function addPoiMarkers(pois, opts) {
    const map = mapInstance, ns = detectNS();
    if (!map || !ns) return { ok: false, code: 'NO_MAP', count: 0 };
    clearPoiOverlays();
    const o = opts || {};
    let n = 0;
    for (const p of pois || []) {
      if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') continue; // 缺坐标跳过
      try {
        const pt = new ns.Point(p.lng, p.lat);
        const mk = new ns.Marker(pt, { title: p.name });
        if (mk.setLabel) mk.setLabel(new ns.Label(p.name, { offset: new ns.Size(0, -18) }));
        if (mk.addEventListener) mk.addEventListener('click', () => {
          try {
            const html = '<b>' + p.name + '</b><br>' + (p.address || '') +
              (p.telephone ? '<br>电话: ' + p.telephone : '') +
              '<div style="color:#888;font-size:11px">来源: ' + (p.source === 'baidu' ? '百度地图' : '演示数据') + '</div>';
            map.openInfoWindow(new ns.InfoWindow(html), pt);
          } catch (e) {}
          if (o.onPoiClick) o.onPoiClick(p);
        });
        map.addOverlay(mk);
        poiMarkers.push(mk);
        n++;
      } catch (e) { /* 单个失败不影响其余 */ }
    }
    return { ok: true, count: n };
  }

  /** 只清除 POI 覆盖物 —— 铁路 Marker/Polyline 保持不动 */
  function clearPoiOverlays() {
    const map = mapInstance;
    if (map && map.removeOverlay) {
      poiMarkers.forEach(m => { try { map.removeOverlay(m); } catch (e) {} });
    }
    poiMarkers = [];
  }

  /** 定位到某个 POI(仅平移, 不反复改 zoom) */
  function panToPoi(poi) {
    const map = mapInstance, ns = detectNS();
    if (!map || !ns || !poi || typeof poi.lat !== 'number') return false;
    try { map.panTo(new ns.Point(poi.lng, poi.lat)); if (map.setZoom) map.setZoom(Math.max(14, map.getZoom ? map.getZoom() : 14)); return true; } catch (e) { return false; }
  }

  /** 首次展示某城 POI 时, 让 POI 大致可见(不因单点点击反复跳) */
  function fitPoiView(pois) {
    const map = mapInstance, ns = detectNS();
    if (!map || !ns) return false;
    const valid = (pois || []).filter(p => p && typeof p.lat === 'number' && typeof p.lng === 'number');
    if (!valid.length) return false;
    try {
      if (valid.length === 1) { map.setCenter(new ns.Point(valid[0].lng, valid[0].lat)); map.setZoom(14); return true; }
      map.setViewport(valid.map(p => new ns.Point(p.lng, p.lat)));
      return true;
    } catch (e) { return false; }
  }

  function getPoiMarkerCount() { return poiMarkers.length; }

  /* ==================== 阶段6.2: 城市内路线覆盖物(第三组, 独立生命周期) ====================
   * 铁路(markerMap/currentPolyline) / POI(poiMarkers) / 路线(routeOverlays) 三组互不干扰:
   * clearRouteOverlays 只删路线; clearPoiOverlays 只删 POI; clearOverlays 为"全清"语义
   * (方案切换用), 会同时重置三组引用(覆盖物已被 clearOverlays 清空)。
   */
  /** 绘制路线覆盖物(每个 RouteSegment 一条 Polyline, 真机路线用其 path; mock 用两端点直线)
   * @param {Array<{path?:Array<{lat,lng}>, from?:Object, to?:Object, source?:string}>} segments */
  function addRouteOverlays(segments) {
    const map = mapInstance, ns = detectNS();
    if (!map || !ns || !ns.Polyline) return { ok: false, code: 'NO_MAP', count: 0 };
    clearRouteOverlays();
    let n = 0;
    for (const seg of segments || []) {
      if (!seg) continue;
      let pts = Array.isArray(seg.path) && seg.path.length >= 2 ? seg.path : null;
      if (!pts && seg.from && seg.to &&
        typeof seg.from.lat === 'number' && typeof seg.from.lng === 'number' &&
        typeof seg.to.lat === 'number' && typeof seg.to.lng === 'number') {
        pts = [{ lat: seg.from.lat, lng: seg.from.lng }, { lat: seg.to.lat, lng: seg.to.lng }];
      }
      if (!pts) continue;
      try {
        const real = seg.source === 'baidu';
        const line = new ns.Polyline(pts.map(p => new ns.Point(p.lng, p.lat)), {
          strokeColor: real ? '#0f9d58' : '#9aa4b2',
          strokeWeight: 5,
          strokeOpacity: real ? 0.9 : 0.7,
          strokeStyle: real ? 'solid' : 'dashed',
        });
        map.addOverlay(line);
        routeOverlays.push(line);
        n++;
      } catch (e) { /* 单条失败不影响其余 */ }
    }
    return { ok: true, count: n };
  }

  /** 只清除路线覆盖物 —— 铁路与 POI 保持不动 */
  function clearRouteOverlays() {
    const map = mapInstance;
    if (map && map.removeOverlay) {
      routeOverlays.forEach(l => { try { map.removeOverlay(l); } catch (e) {} });
    }
    routeOverlays = [];
  }

  function getRouteOverlayCount() { return routeOverlays.length; }

  const API = { getAK, isAvailable, loadSdk, initMap, destroyMap, getMap, detectNS, addMarkers, drawPolyline, clearOverlays, clearPolyline, fitView, addPoiMarkers, clearPoiOverlays, panToPoi, fitPoiView, getPoiMarkerCount, addRouteOverlays, clearRouteOverlays, getRouteOverlayCount, _reset, SCRIPT_ID };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.RailGoBaiduMap = API;
})();