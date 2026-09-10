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

  /* ==================== 阶段4: 坐标处理层 ====================
   * 目标: RailGo 城市对象(WGS84) → 百度地图坐标(BD09), 全项目唯一转换入口。
   * 设计: 优先本地确定性算法(离线/零配额/无 CORS), 缺坐标才调地理编码 API。
   * 禁止在其他层(组件/railgo.js)再做转换。
   *
   * 体系判定依据(见阶段4报告): 本表 北京西站 (39.895,116.322) 与已知 WGS84
   * 实测 (39.8948,116.3220) 吻合至 4 位小数, 而 BD09 应约 (39.9026,116.3346)
   * → 本表为 WGS84(GPS), 展示到百度地图前必须转 BD09。
   */
  const X_PI = Math.PI * 3000.0 / 180.0;
  const GCJ_A = 6378245.0, GCJ_EE = 0.00669342162296594323;
  const CGEO_CACHE_KEY = 'RAILGO_GEO_CACHE';

  function _outOfChina(lat, lon) { return !(lon > 73.66 && lon < 135.05 && lat > 3.86 && lat < 53.55); }
  function _tLat(x, y) {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return r;
  }
  function _tLon(x, y) {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return r;
  }
  /** WGS84 → GCJ02 (公开标准算法) */
  function wgs84ToGcj02(lat, lon) {
    if (_outOfChina(lat, lon)) return [lat, lon];
    let dLat = _tLat(lon - 105, lat - 35), dLon = _tLon(lon - 105, lat - 35);
    const radLat = lat / 180 * Math.PI;
    let magic = Math.sin(radLat); magic = 1 - GCJ_EE * magic * magic;
    const sq = Math.sqrt(magic);
    dLat = (dLat * 180) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sq) * Math.PI);
    dLon = (dLon * 180) / (GCJ_A / sq * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lon + dLon];
  }
  /** GCJ02 → BD09 (公开标准算法) */
  function gcj02ToBd09(lat, lon) {
    const z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
    const th = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * X_PI);
    return [z * Math.sin(th) + 0.006, z * Math.cos(th) + 0.0065];
  }
  /** WGS84 → BD09 (本地确定性, 离线可用, 无配额) */
  function wgs84ToBd09(lat, lon) {
    const g = wgs84ToGcj02(lat, lon);
    return gcj02ToBd09(g[0], g[1]);
  }

  function _readCache() { try { return JSON.parse(root.localStorage.getItem(CGEO_CACHE_KEY)) || {}; } catch (e) { return {}; } }
  function _writeCache(o) { try { root.localStorage.setItem(CGEO_CACHE_KEY, JSON.stringify(o)); } catch (e) {} }

  /** 解析单个城市为 BD09 坐标 {id,name,lat,lng,source}; 缺坐标才走地理编码 */
  async function resolveCityCoord(city) {
    if (!city) return null;
    const key = city.id || city.name;
    const cache = _readCache();
    if (cache[key] && typeof cache[key].lat === 'number') {
      return { id: city.id, name: city.name, lat: cache[key].lat, lng: cache[key].lng, source: cache[key].source || 'cache' };
    }
    // 优先: 已有 WGS84 坐标 → 本地算法转换(不请求 API, 不重复请求)
    if (typeof city.lat === 'number' && typeof city.lon === 'number') {
      const bd = wgs84ToBd09(city.lat, city.lon);
      const out = { id: city.id, name: city.name, lat: bd[0], lng: bd[1], source: 'local-wgs84' };
      cache[key] = { lat: out.lat, lng: out.lng, source: out.source, ts: Date.now() };
      _writeCache(cache);
      return out;
    }
    // 缺失坐标 → 地理编码(失败返回 null, 由调用方跳过定位)
    try {
      const r = await geocode(city.name, city.name);
      if (r && r.success && r.data && typeof r.data.lat === 'number') {
        const out = { id: city.id, name: city.name, lat: r.data.lat, lng: r.data.lng, source: 'baidu-geocode' };
        cache[key] = { lat: out.lat, lng: out.lng, source: out.source, ts: Date.now() };
        _writeCache(cache);
        return out;
      }
    } catch (e) { /* 网络/配额失败 → 降级 */ }
    return null;
  }

  /** 批量: RailGo 城市列表 → BD09 坐标列表(跳过无法解析的城市, 不抛异常) */
  async function resolveCityCoords(cities) {
    const out = [];
    for (const c of cities || []) {
      try { const r = await resolveCityCoord(c); if (r) out.push(r); } catch (e) { /* 单城失败不影响整体 */ }
    }
    return out;
  }

  function clearCoordCache() { try { root.localStorage.removeItem(CGEO_CACHE_KEY); } catch (e) {} }

  /* ==================== 阶段5: POI 地点检索层 ====================
   * 官方接口(已核实): https://api.map.baidu.com/place/v2/search
   *   - 行政区划检索: query + region + ak; 返回 {status,message,results[]}
   *   - results[]: {name, location:{lat,lng}, address, uid, province, city, area, telephone, detail_info?}
   * 实测重要限制(见阶段5报告):
   *   1) 该端点响应头不含 Access-Control-Allow-Origin → 浏览器 fetch 直连被 CORS 拦截
   *   2) 当前 AK 访问 Web 服务返回 status:240(APP 服务被禁用)
   * 因此本层: 有可用 AK 且未被 CORS 拦截时走真实 API; 否则降级到 mock(明确标注 source),
   * 不伪造评分/价格/评论等字段。UI 只消费 normalizePoi() 的统一结构。
   */
  const POI_CACHE_KEY = 'RAILGO_POI_CACHE';
  const POI_TTL_MS = 24 * 60 * 60 * 1000; // RailGo 自定义客户端缓存策略(非官方推荐值)
  const POI_CATEGORIES = {
    attraction: { label: '景点', query: '景点' },
    restaurant: { label: '餐厅', query: '美食' },
    hotel: { label: '酒店', query: '酒店' },
  };

  /** 百度 POI 原始对象 → RailGo 统一结构(仅映射真实存在的字段, 不造数据) */
  function normalizePoi(raw, category) {
    if (!raw) return null;
    const loc = raw.location || {};
    const lat = typeof loc.lat === 'number' ? loc.lat : (typeof raw.lat === 'number' ? raw.lat : null);
    const lng = typeof loc.lng === 'number' ? loc.lng : (typeof raw.lng === 'number' ? raw.lng : null);
    if (lat === null || lng === null) return null;
    return {
      id: raw.uid || raw.id || (category + ':' + raw.name),
      name: raw.name || '(未命名)',
      address: raw.address || (raw.area ? (raw.city || '') + raw.area : ''),
      lat, lng,
      category: category,
      // 以下字段仅当百度真实返回时才有值(不伪造)
      telephone: raw.telephone || null,
      detailUrl: (raw.detail_info && raw.detail_info.detail_url) || null,
      source: 'baidu',
    };
  }

  /* mock 降级数据(取自 mock-data 的景点/餐饮, 酒店为演示补充; 明确标注 source:'mock') */
  function _mockPoi(cityName, category) {
    const M = root.RailGoMock;
    const cat = POI_CATEGORIES[category] ? POI_CATEGORIES[category].label : category;
    const out = [];
    if (M) {
      const city = M.CITIES.find(c => c.name === cityName || c.id === cityName);
      if (city) {
        if (category === 'attraction') {
          M.ATTRACTIONS.filter(a => a.cityId === city.id).forEach(a => out.push({ id: a.id, name: a.name, address: city.name + '（演示数据）', lat: a.lat, lng: a.lon, category, source: 'mock' }));
        } else if (category === 'restaurant') {
          M.FOOD.filter(f => f.cityId === city.id).forEach((f, i) => out.push({ id: city.id + '-food-' + i, name: f.name, address: f.address || city.name, lat: city.lat + (i + 1) * 0.004, lng: city.lon + (i + 1) * 0.003, category, source: 'mock' }));
        } else if (category === 'hotel') {
          M.STAY.filter(s => s.cityId === city.id).forEach((s, i) => out.push({ id: city.id + '-stay-' + i, name: s.name + '（住宿区域）', address: s.note || city.name, lat: city.lat - (i + 1) * 0.004, lng: city.lon - (i + 1) * 0.003, category, source: 'mock' }));
        }
      }
    }
    return out.slice(0, 8);
  }

  function _poiCacheRead() { try { return JSON.parse(root.localStorage.getItem(POI_CACHE_KEY)) || {}; } catch (e) { return {}; } }
  function _poiCacheWrite(o) { try { root.localStorage.setItem(POI_CACHE_KEY, JSON.stringify(o)); } catch (e) {} }

  /* 竞态保护: 全局递增 requestId, 只有最新请求的结果才被接受 */
  let _poiReqSeq = 0;
  function _nextReqId() { return ++_poiReqSeq; }
  function _isLatest(id) { return id === _poiReqSeq; }

  /**
   * 查询 POI(统一入口) —— 带 TTL 缓存 + 竞态保护 + 降级
   * @returns {Promise<{ok:boolean, source:'baidu'|'mock'|'cache', category, data:Array, message?:string, reqId:number, stale?:boolean}>}
   */
  async function searchPoi(cityName, category, opts) {
    const o = opts || {};
    const reqId = _nextReqId();
    const key = cityName + ':' + category;
    const cache = _poiCacheRead();
    const hit = cache[key];
    const now = Date.now();
    if (!o.force && hit && Array.isArray(hit.data) && (now - (hit.ts || 0) < POI_TTL_MS)) {
      return { ok: true, source: 'cache', category, data: hit.data, reqId, cached: true };
    }
    const cq = POI_CATEGORIES[category] ? POI_CATEGORIES[category].query : category;
    let result = null;
    if (getAK()) {
      try {
        const r = await searchPOI(cq, cityName, { pageSize: o.pageSize || 10 });
        if (r && r.success && Array.isArray(r.data)) {
          const norm = r.data.map(x => normalizePoi(x, category)).filter(Boolean);
          result = { ok: true, source: 'baidu', category, data: norm, reqId };
        } else if (r && r.raw && r.raw.status === 240) {
          result = { ok: false, source: 'baidu', category, data: [], reqId, message: '地图服务配置异常', errorCode: 'SERVICE_DISABLED' };
        }
      } catch (e) {
        // CORS / 网络 / 配额 → 交给降级; 不静默吞掉原因
        result = { ok: false, source: 'baidu', category, data: [], reqId, message: '地点信息暂时无法获取', errorCode: (e && e.name === 'TypeError') ? 'CORS_OR_NETWORK' : 'API_ERROR' };
      }
    }
    // 降级到 mock(仅当未拿到真实结果)
    if (!result || !result.ok) {
      const mock = _mockPoi(cityName, category);
      const fallback = {
        ok: true, source: 'mock', category, data: mock, reqId,
        stale: true,
        message: (result && result.message) || '使用演示数据',
        errorCode: result && result.errorCode,
      };
      return _isLatest(reqId) ? fallback : { ...fallback, superseded: true };
    }
    // 写入缓存(只缓存真实结果, mock 不污染缓存)
    if (category && result.source === 'baidu') {
      cache[key] = { data: result.data, ts: Date.now() };
      _poiCacheWrite(cache);
    }
    return _isLatest(reqId) ? result : { ...result, superseded: true };
  }

  function clearPoiCache() { try { root.localStorage.removeItem(POI_CACHE_KEY); } catch (e) {} }

  const API = { getAK, searchPOI, searchNearbyPOI, geocode, reverseGeocode, walkingRoute, transitRoute, drivingRoute, coordConvert, ping, wgs84ToGcj02, gcj02ToBd09, wgs84ToBd09, resolveCityCoord, resolveCityCoords, clearCoordCache, CGEO_CACHE_KEY, normalizePoi, searchPoi, clearPoiCache, POI_CATEGORIES, POI_CACHE_KEY, POI_TTL_MS };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.RailGoBaidu = API;
})();