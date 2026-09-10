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
        // 官方加载形式; 经典 4.0 与 GL(v=1.0&type=webgl) 均适用此 URL 结构
        el.src = 'https://api.map.baidu.com/api?v=' + (root.RAILGO_MAP_VER || '4.0') + '&ak=' + encodeURIComponent(ak);
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
  }

  function getMap() { return mapInstance; }

  /* 测试用: 重置单例状态(不影响生产逻辑) */
  function _reset() { sdkPromise = null; destroyMap(); }

  const API = { getAK, isAvailable, loadSdk, initMap, destroyMap, getMap, detectNS, _reset, SCRIPT_ID };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.RailGoBaiduMap = API;
})();