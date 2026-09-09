/* RailGo · 百度地图 API 抽象层
 * 原则: AK 从 localStorage(window.RAILGO_CONFIG) 读, 绝不写死/不入 git。
 * 无 AK → 全部函数返回 {success:false, source:"mock", message:"Baidu API key not configured", data:[]}, 不崩溃。
 * 有 AK → 返回 {success:true, source:"baidu", data:...} (服务端 Web API, JSONP/CORS 视文档; 这里按官方 REST 封装)。
 * 诚实标注: 评分/人均/营业状态 等字段百度并不保证稳定返回 → 字段存在才展示。
 */
(function () {
  'use strict';
  const root = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : globalThis);
  const AK_KEY = 'RAILGO_BAIDU_AK';

  function getAK() {
    if (root.RAILGO_CONFIG && root.RAILGO_CONFIG.BAIDU_MAP_AK) return root.RAILGO_CONFIG.BAIDU_MAP_AK;
    try { return localStorage.getItem(AK_KEY) || ''; } catch (e) { return ''; }
  }

  function noKey(fnName) {
    return Promise.resolve({ success: false, source: 'mock', message: 'Baidu API key not configured', api: fnName, data: [] });
  }

  /* 服务端 REST 封装(地点检索/方向/地理编码均为百度 Web 服务 API, 域名 lbsyun / api.map.baidu.com)
   * 注意: 浏览器直连存在 CORS 限制 → 正式接入应经自建代理/云函数; 此层预留 url 由外部传入。 */
  async function _get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ---------- 对外 API (全部返回 Promise) ---------- */

  /** 关键词 POI 检索(地点检索服务) */
  function searchPOI(query, city, opts) {
    const ak = getAK(); if (!ak) return noKey('searchPOI');
    const p = opts || {};
    const url = 'https://api.map.baidu.com/place/v2/search?query=' + encodeURIComponent(query) +
      '&region=' + encodeURIComponent(city) + '&output=json&ak=' + ak +
      (p.pageSize ? '&page_size=' + p.pageSize : '') + (p.scope ? '&scope=' + p.scope : '');
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: (j.results || []), raw: j }));
  }

  /** 周边检索(圆形区域) */
  function searchNearbyPOI(query, lat, lon, radiusM, opts) {
    const ak = getAK(); if (!ak) return noKey('searchNearbyPOI');
    const p = opts || {};
    const url = 'https://api.map.baidu.com/place/v2/search?query=' + encodeURIComponent(query) +
      '&location=' + lat + ',' + lon + '&radius=' + (radiusM || 1000) + '&output=json&ak=' + ak +
      (p.pageSize ? '&page_size=' + p.pageSize : '');
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: (j.results || []), raw: j }));
  }

  /** 地理编码(城市/地点 → 坐标) */
  function geocode(addr, city) {
    const ak = getAK(); if (!ak) return noKey('geocode');
    const url = 'https://api.map.baidu.com/geocoding/v3/?address=' + encodeURIComponent(addr) +
      (city ? '&city=' + encodeURIComponent(city) : '') + '&output=json&ak=' + ak;
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: j.result ? j.result.location : null, raw: j }));
  }

  /** 逆地理编码 */
  function reverseGeocode(lat, lon) {
    const ak = getAK(); if (!ak) return noKey('reverseGeocode');
    const url = 'https://api.map.baidu.com/reverse_geocoding/v3/?location=' + lat + ',' + lon + '&output=json&ak=' + ak;
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: j.result || null, raw: j }));
  }

  /** 步行路线 */
  function walkingRoute(origin, dest) {
    const ak = getAK(); if (!ak) return noKey('walkingRoute');
    const url = 'https://api.map.baidu.com/direction/v2/walking?origin=' + origin + '&destination=' + dest + '&ak=' + ak;
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: j.result ? j.result.routes : [], raw: j }));
  }

  /** 公交/换乘路线 */
  function transitRoute(origin, dest, city) {
    const ak = getAK(); if (!ak) return noKey('transitRoute');
    const url = 'https://api.map.baidu.com/direction/v2/transit?origin=' + origin + '&destination=' + dest +
      (city ? '&city=' + encodeURIComponent(city) : '') + '&ak=' + ak;
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: j.result ? j.result.routes : [], raw: j }));
  }

  /** 驾车路线 */
  function drivingRoute(origin, dest) {
    const ak = getAK(); if (!ak) return noKey('drivingRoute');
    const url = 'https://api.map.baidu.com/direction/v2/driving?origin=' + origin + '&destination=' + dest + '&ak=' + ak;
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: j.result ? j.result.routes : [], raw: j }));
  }

  /** 坐标转换(WGS84 → BD09, 主项目站表为 WGS84 近似, 展示到百度地图前必须转) */
  function coordConvert(points) {
    const ak = getAK(); if (!ak) return noKey('coordConvert');
    const coords = points.map(p => p.lat + ',' + p.lon).join(';');
    const url = 'https://api.map.baidu.com/geoconv/v1/?coords=' + coords + '&from=1&to=5&ak=' + ak;
    return _get(url).then(j => ({ success: j.status === 0, source: 'baidu', data: j.result || [], raw: j }));
  }

  /** AK 可用性探测 */
  function ping() { return geocode('北京', '北京'); }

  const API = { getAK, searchPOI, searchNearbyPOI, geocode, reverseGeocode, walkingRoute, transitRoute, drivingRoute, coordConvert, ping };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.RailGoBaidu = API;
})();