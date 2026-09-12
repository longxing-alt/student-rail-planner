/* RailGo TripState — UI 状态与协调层(不碰 Core 算法)
 *
 * 职责边界:
 *   Core(railgo.core.js) = 业务事实源(评分/评价/路线/预算), 只读调用, 不改语义
 *   本文件              = 单一事实来源(SSOT): 用户意图 + 城市顺序 + 城市体验 + 交互状态
 *   页面(app.js)        = 只把 state 投影成 DOM, 不自行计算价格/时间/评分
 *
 * 所有数值必须来自 Core 返回; 无法由 Core 得出的项标注 est:true 并在 UI 明示"估算"。
 */
(function (root) {
  'use strict';

  /* ---------- 体验时长档位(用户可选项) ----------
   * 语义: 愿意为"途经城市"额外投入多少时间(不是城市内总时长)
   * 0h = 不停留; 其余按档位映射到城市内可安排的体验条数 */
  var STAY_OPTIONS = [
    { id: '0h', label: '不停留', hours: 0 },
    { id: '2h', label: '2 小时', hours: 2 },
    { id: '4h', label: '4 小时', hours: 4 },
    { id: '8h', label: '6-8 小时', hours: 8 },
    { id: '1d', label: '1 天', hours: 10 },
    { id: '2d', label: '2 天以上', hours: 16 }
  ];

  /* 停留时长 → 体验条数(上层协调规则, 非评分)
   * 依据: Core 的 VALUE_THRESHOLDS.activeHoursPerDay(每日有效游玩时长)
   * 单条体验按 2h 估(与 mock ATTRACTIONS 的 visitMinutes 120~150 量级一致) */
  function slotsForHours(hours) {
    if (!hours) return 0;
    return Math.max(1, Math.min(6, Math.round(hours / 2)));
  }

  function createTripState() {
    return {
      /* ---- 出行意图 ---- */
      origin: null,          // {id,name,lat,lon}
      destination: null,     // {id,name,lat,lon}
      days: 5,
      budget: 1860,
      preference: { preset: 'balanced', pace: 0.5 },
      stopoverHours: 4,      // 途中体验时长档位(小时)

      /* ---- 路线(Core 产出的候选) ---- */
      candidates: [],        // generateRouteCandidates().candidates
      activeCandidate: 0,
      routeCities: [],       // [{id,name,lat,lon,kind:'origin'|'stop'|'dest'}]

      /* ---- 城市体验(每城独立) ---- */
      cityPlans: {},         // { cityId: { stayHours, slots, experiences:[{id,name,lat,lng,type,locked,excluded,visited,source}] } }
      selectedCityId: null,

      /* ---- 总览(Core 产出) ---- */
      totals: null,          // {rail,stay,food,ticket,cityTrans,total,est} + {hours}

      /* ---- 交互状态 ---- */
      ui: {
        status: 'idle',      // idle | dragging | dropping | recalculating | updated | error
        message: '',
        draggingCity: null,  // 拖拽中的候选城市
        dropIndex: null,     // 拖拽目标插入位
        error: ''
      }
    };
  }

  var S = createTripState();

  /* Core 引用(由页面注入, 避免本文件依赖加载顺序) */
  var C = null, M = null;
  function useCore(core, mock) { C = core; M = mock; return S; }

  /* ---------- 事件订阅(极简发布订阅) ---------- */
  var listeners = [];
  function subscribe(fn) { listeners.push(fn); return function () { listeners = listeners.filter(f => f !== fn); }; }
  function emit(kind, detail) {
    listeners.forEach(function (fn) { try { fn(S, kind, detail || {}); } catch (e) { /* 单订阅者异常不影响其余 */ } });
  }

  /* ---------- 城市解析 ---------- */
  function city(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    return C ? C.cityByName(String(v).trim()) : null;
  }
  function setEndpoint(which, name) {
    var c = city(name);
    if (!c) { S.ui.error = '未收录该城市'; S.ui.status = 'error'; emit('error'); return null; }
    if (which === 'origin') S.origin = { id: c.id, name: c.name, lat: c.lat, lon: c.lon };
    else S.destination = { id: c.id, name: c.name, lat: c.lat, lon: c.lon };
    emit('endpoint', { which: which });
    return c;
  }

  /* ---------- 路线重建: 由 routeCities 重算候选与总览 ---------- */
  function recomputeRoute() {
    if (!C || !S.origin || !S.destination) { S.candidates = []; S.totals = null; return; }
    var stops = S.routeCities.filter(function (n) { return n.kind === 'stop'; }).map(function (n) { return n.id; });
    var dests = stops.concat([S.destination.id]);
    var rc;
    try {
      rc = C.generateRouteCandidates(S.origin.id, dests, S.days, S.budget);
    } catch (e) {
      S.ui.status = 'error'; S.ui.error = '路线生成失败'; S.candidates = []; return;
    }
    S.candidates = rc.candidates || [];
    if (S.activeCandidate >= S.candidates.length) S.activeCandidate = 0;
    recomputeTotals();
  }

  /* ---------- 总览: 全部来自 Core ---------- */
  function recomputeTotals() {
    var c = S.candidates[S.activeCandidate];
    if (!c || !C) { S.totals = null; return null; }
    var ids = c.cities;                       // Core 给出的实际城市序列(含起点与终点)
    var stay = C.estimateBudget(ids, { days: S.days });
    // 城市内体验耗时: 仅统计已选中的体验(用 Core 的景点 visitMinutes 字段)
    var expMin = 0;
    Object.keys(S.cityPlans).forEach(function (cid) {
      var cp = S.cityPlans[cid];
      (cp.experiences || []).forEach(function (x) { if (!x.excluded && x.visitMinutes) expMin += x.visitMinutes; });
    });
    S.totals = {
      rail: stay.rail, cityTrans: stay.cityTrans, stay: stay.stay,
      food: stay.food, ticket: stay.ticket, total: stay.total,
      est: stay.est, source: stay.source,
      days: S.days,
      experienceMinutes: expMin,
      experienceHours: Math.round(expMin / 60 * 10) / 10
    };
    emit('totals');
    return S.totals;
  }

  /* ---------- 沿途候选城市(消费 Core 的 suggestStop / evaluateStops) ---------- */
  function stopCandidates() {
    if (!C || !S.origin || !S.destination) return [];
    var endId = routeEndId();
    if (!endId || endId === S.origin.id) return [];
    var r;
    try {
      r = C.suggestStop(S.origin.id, endId, S.days, { budget: S.budget, preference: pref() });
    } catch (e) { return []; }
    if (!r.suggestable || !r.candidates) return [];
    var used = {};
    S.routeCities.forEach(function (n) { if (n.kind === 'stop') used[n.id] = 1; });
    // 不显示数字评分: 只输出序号 + 自然语言理由(取 Core reasons 前两条)
    return r.candidates
      .filter(function (cd) { return !used[cd.cityId]; })
      .map(function (cd, i) {
        return {
          id: cd.cityId, name: cd.name,
          rank: i + 1,
          stopDays: cd.stopDays,
          reasons: (cd.reasons || []).slice(0, 2),
          reasonCodes: cd.reasonCodes || [],
          lowConfidence: !!cd.lowConf
        };
      });
  }

  /* 路线终点: 有中途停留则以其为终点, 否则目的地 */
  function routeEndId() {
    var stops = S.routeCities.filter(function (n) { return n.kind === 'stop'; });
    if (stops.length) return stops[stops.length - 1].id;
    return S.destination ? S.destination.id : null;
  }

  function pref() {
    if (!C) return null;
    try { return C.paceToPreference(S.preference.pace, S.preference.preset); }
    catch (e) { return C.normalizePreference(null); }
  }

  /* ---------- 城市增删(拖拽/点击调用) ---------- */
  function addStop(cityId, atIndex) {
    var c = city(cityId);
    if (!c) return false;
    if (S.routeCities.some(function (n) { return n.id === c.id; })) return false;
    if (S.origin && c.id === S.origin.id) return false;
    if (S.destination && c.id === S.destination.id) return false;
    var node = { id: c.id, name: c.name, lat: c.lat, lon: c.lon, kind: 'stop' };
    var stops = S.routeCities.filter(function (n) { return n.kind === 'stop'; });
    var idx = (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= stops.length) ? atIndex : stops.length;
    stops.splice(idx, 0, node);
    rebuildRouteNodes(stops);
    ensureCityPlan(c.id);
    fillExperiences(c.id, {});       // 建好后立即按当前停留时长填充体验
    S.ui.status = 'updated'; S.ui.message = '已加入 ' + c.name;
    emit('route');
    return true;
  }
  function removeStop(cityId) {
    var stops = S.routeCities.filter(function (n) { return n.kind === 'stop'; });
    var next = stops.filter(function (n) { return n.id !== cityId; });
    if (next.length === stops.length) return false;   // 没找到该中途城市
    rebuildRouteNodes(next);
    delete S.cityPlans[cityId];
    if (S.selectedCityId === cityId) S.selectedCityId = null;
    S.ui.status = 'updated'; S.ui.message = '已移除';
    emit('route');
    return true;
  }
  function rebuildRouteNodes(stops) {
    var arr = [];
    if (S.origin) arr.push({ id: S.origin.id, name: S.origin.name, lat: S.origin.lat, lon: S.origin.lon, kind: 'origin' });
    stops.forEach(function (s) { arr.push(s); });
    if (S.destination) arr.push({ id: S.destination.id, name: S.destination.name, lat: S.destination.lat, lon: S.destination.lon, kind: 'dest' });
    S.routeCities = arr;
    recomputeRoute();
  }
  function resetRoute() {
    S.routeCities = [];
    S.cityPlans = {};
    S.selectedCityId = null;
    rebuildRouteNodes([]);
  }

  /* ---------- 城市体验 ---------- */
  function ensureCityPlan(cityId) {
    if (S.cityPlans[cityId]) return S.cityPlans[cityId];
    var hours = S.stopoverHours;
    var plan = { stayHours: hours, slots: slotsForHours(hours), experiences: [], source: 'mock' };
    S.cityPlans[cityId] = plan;
    return plan;
  }

  /* 从 Core/mock 取候选体验点(城市内). 只取有坐标的(能画到地图) */
  function experiencePool(cityId) {
    if (!M) return [];
    return (M.ATTRACTIONS || [])
      .filter(function (a) { return a.cityId === cityId; })
      .map(function (a) {
        return { id: a.id, name: a.name, type: a.type, lat: a.lat, lng: a.lon, visitMinutes: a.visitMinutes, value: a.value, source: a.source };
      });
  }

  /* 生成/补足体验集合: 尊重 locked / excluded / visited
   * 不新建评分: 排序依据 Core 的 placeValueOf 中的景点 value(数据自带) */
  function fillExperiences(cityId, opts) {
    var o = opts || {};
    var plan = ensureCityPlan(cityId);
    var pool = experiencePool(cityId);
    var keep = (plan.experiences || []).filter(function (x) { return o.onlyUnlocked ? x.locked : true; });
    var uniq = {};
    keep.forEach(function (x) { uniq[x.id] = 1; });
    var usable = pool.filter(function (p) {
      if (uniq[p.id]) return false;
      if (plan.excluded && plan.excluded[p.id]) return false;                                     // 不想去(持久排除)
      if (plan.removedThisSession && plan.removedThisSession[p.id]) return false;                   // 本轮已删除, 不原样补回
      if (plan.experiences.some(function (x) { return x.id === p.id && x.excluded; })) return false;
      if (plan.visited && plan.visited[p.id]) return false;                                        // 去过
      return true;
    });
    usable.sort(function (a, b) { return (b.value || 0) - (a.value || 0); });   // 用数据自带 value 排序
    var need = Math.max(0, plan.slots - keep.length);
    // 换一组: 先排除本轮已展示过的, 有足够替补时应尽量给新面孔
    if (o.rotate && usable.length > need) {
      var shown = plan.shown || {};
      var fresh = usable.filter(function (p) { return !shown[p.id]; });
      if (fresh.length >= need) usable = fresh;
    }
    var picked = usable.slice(0, need);
    plan.experiences = keep.concat(picked);
    plan.shown = plan.shown || {};
    picked.forEach(function (p) { plan.shown[p.id] = 1; });
    plan.stayHours = S.stopoverHours;
    plan.slots = slotsForHours(S.stopoverHours);
    emit('cityPlan', { cityId: cityId });
    recomputeTotals();
    return plan.experiences;
  }

  function setStopoverHours(hours) {
    S.stopoverHours = hours;
    Object.keys(S.cityPlans).forEach(function (cid) {
      var plan = S.cityPlans[cid];
      plan.slots = slotsForHours(hours);
      plan.stayHours = hours;
      if (plan.slots < (plan.experiences || []).length) {
        // 缩短停留: 优先保留已锁定, 其余按现有顺序截断
        var locked = plan.experiences.filter(function (x) { return x.locked; });
        var rest = plan.experiences.filter(function (x) { return !x.locked; });
        plan.experiences = locked.concat(rest.slice(0, Math.max(0, plan.slots - locked.length)));
      }
      if (plan.slots > (plan.experiences || []).length) fillExperiences(cid, {});
    });
    emit('stopover');
    recomputeTotals();
  }

  function toggleLock(cityId, expId) { return setFlag(cityId, expId, 'locked'); }
  function toggleExcluded(cityId, expId) { return setFlag(cityId, expId, 'excluded'); }
  function toggleVisited(cityId, expId) { return setFlag(cityId, expId, 'visited'); }
  function setFlag(cityId, expId, flag) {
    var plan = S.cityPlans[cityId];
    if (!plan) return false;
    var x = plan.experiences.find(function (e) { return e.id === expId; });
    if (!x) return false;
    x[flag] = !x[flag];
    if (flag === 'excluded') {
      plan.excluded = plan.excluded || {};
      if (x.excluded) {
        plan.excluded[expId] = 1;
        plan.experiences = plan.experiences.filter(function (e) { return e.id !== expId; });
        fillExperiences(cityId, {});          // 补一个替代(排除项不会再被选中)
      } else {
        delete plan.excluded[expId];
      }
    }
    if (flag === 'visited') {
      plan.visited = plan.visited || {};
      if (x.visited) plan.visited[expId] = 1; else delete plan.visited[expId];
    }
    emit('cityPlan', { cityId: cityId, flag: flag });
    recomputeTotals();
    return true;
  }
  function removeExperience(cityId, expId) {
    var plan = S.cityPlans[cityId];
    if (!plan) return false;
    var removed = plan.experiences.find(function (e) { return e.id === expId; });
    if (removed && removed.locked) return false;   // 锁定项不可删(需先解锁)
    plan.experiences = plan.experiences.filter(function (e) { return e.id !== expId; });
    // 本次已移除的点不参与补位(避免"删了又被原样补回"); 但用户显式"不想去"才持久排除
    plan.removedThisSession = plan.removedThisSession || {};
    plan.removedThisSession[expId] = 1;
    fillExperiences(cityId, {});
    return true;
  }
  function rotateExperiences(cityId) {
    var plan = S.cityPlans[cityId];
    var before = (plan && plan.experiences ? plan.experiences.filter(function (e) { return !e.locked; }).map(function (e) { return e.id; }) : []);
    fillExperiences(cityId, { rotate: true, onlyUnlocked: true });
    var after = S.cityPlans[cityId].experiences.filter(function (e) { return !e.locked; }).map(function (e) { return e.id; });
    var changed = before.length !== after.length || before.some(function (id, i) { return id !== after[i]; });
    S.ui.lastRotate = { cityId: cityId, changed: changed, reason: changed ? '' : '该城市可选体验已全部用上，没有可替换的备选' };
    return S.cityPlans[cityId];
  }

  /* ---------- 交互状态 ---------- */
  function setUI(patch) {
    Object.keys(patch || {}).forEach(function (k) { S.ui[k] = patch[k]; });
    emit('ui');
  }

  var API = {
    STAY_OPTIONS: STAY_OPTIONS,
    slotsForHours: slotsForHours,
    state: S,
    useCore: useCore,
    subscribe: subscribe,
    emit: emit,
    setEndpoint: setEndpoint,
    pref: pref,
    resetRoute: resetRoute,
    recomputeRoute: recomputeRoute,
    recomputeTotals: recomputeTotals,
    stopCandidates: stopCandidates,
    routeEndId: routeEndId,
    addStop: addStop,
    removeStop: removeStop,
    ensureCityPlan: ensureCityPlan,
    experiencePool: experiencePool,
    fillExperiences: fillExperiences,
    setStopoverHours: setStopoverHours,
    toggleLock: toggleLock,
    toggleExcluded: toggleExcluded,
    toggleVisited: toggleVisited,
    removeExperience: removeExperience,
    rotateExperiences: rotateExperiences,
    setUI: setUI
  };
  root.RailGoTrip = API;
})(typeof window !== 'undefined' ? window : this);
