/* RailGo 核心算法 — 纯函数可测试(UMD)
 * 复用主项目思路: Haversine + 城市级铁路图 Dijkstra + 贪心/全排列 + 可解释评分
 * 不含任何学生票判定逻辑(按约定不动原核心)。
 * 全部估算值带 {est:true} 或直接来自 mock 数据。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mock-data'));
  else root.RailGoCore = factory(root.RailGoMock);
})(typeof self !== 'undefined' ? self : this, function (MOCK) {
  'use strict';

  const D = MOCK.RAIL_EDGES;

  /* ---------- 基础几何(与主项目一致, WGS84 近似) ---------- */
  function hav(a, b) {
    const dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  const distKm = (a, b) => hav(a, b);
  const cityById = id => MOCK.CITIES.find(c => c.id === id) || null;
  const cityByName = name => MOCK.CITIES.find(c => c.name === name || c.id === name) || null;

  /* ---------- 铁路图(双向边) + Dijkstra ---------- */
  function buildGraph(edges) {
    const g = {};
    for (const e of edges) {
      (g[e.from] = g[e.from] || []).push(e);
      (g[e.to] = g[e.to] || []).push({ from: e.to, to: e.from, km: e.km, durationMin: e.durationMin, fare: e.fare, transfers: e.transfers });
    }
    return g;
  }
  const GRAPH = buildGraph(D);

  function dijkstra(fromId, toId) {
    const INF = Infinity, dist = {}, prev = {}, dur = {}, fare = {};
    const seen = {};
    Object.keys(GRAPH).forEach(k => { dist[k] = INF; dur[k] = 0; fare[k] = 0; });
    dist[fromId] = 0;
    const q = [fromId];
    while (q.length) {
      q.sort((a, b) => dist[a] - dist[b]);
      const u = q.shift();
      if (u === toId) break;
      if (seen[u]) continue;
      seen[u] = true;
      for (const e of GRAPH[u] || []) {
        const v = e.to;
        if (seen[v]) continue;
        const nd = dist[u] + e.km;
        if (nd < dist[v]) {
          dist[v] = nd; dur[v] = dur[u] + e.durationMin; fare[v] = fare[u] + e.fare;
          prev[v] = { from: u, edge: e };
          q.push(v);
        }
      }
    }
    if (dist[toId] === INF) return null;
    const path = [];
    let cur = toId;
    while (cur !== fromId) { const p = prev[cur]; path.unshift({ from: p.from, to: cur, edge: p.edge }); cur = p.from; }
    return { km: Math.round(dist[toId]), durationMin: Math.round(dur[toId]), fare: Math.round(fare[toId]), path, est: true };
  }

  /* 两城铁路连接(缺失边时用几何直线兜底估算, 明确 est) */
  function railBetween(aId, bId) {
    const r = dijkstra(aId, bId);
    if (r) return r;
    const A = cityById(aId), B = cityById(bId);
    const km = Math.round(distKm(A, B) * 1.15);
    return { km, durationMin: Math.round(km / 250 * 60 + 15), fare: Math.round(km * 0.46), path: [], est: true, fallback: true };
  }

  /* ---------- 城市游玩: 每个城市选景点, 按"距站近/价值高"贪心填日 ---------- */
  function planCity(cityId, days, budgetPerDay) {
    const city = cityById(cityId);
    if (!city) return null;
    const ats = MOCK.ATTRACTIONS.filter(a => a.cityId === cityId).sort((a, b) => b.value - a.value);
    const budget = budgetPerDay || 200;
    // 每天最多游玩时长(约 7 小时=420 分钟, 含交通)
    const dayPlan = [];
    let day = { day: 1, spots: [], minutes: 0, cost: 0 };
    const pushOrNext = spot => {
      const m = spot.visitMinutes + 40; // 40min 城市交通/移动估算
      if (day.minutes + m > 420 && day.spots.length) {
        dayPlan.push(day); day = { day: day.day + 1, spots: [], minutes: 0, cost: 0 };
      }
      day.spots.push(spot); day.minutes += m; day.cost += spot.ticket || 0;
    };
    ats.forEach(s => { if (dayPlan.length + (day.spots.length ? 1 : 0) < days) pushOrNext(s); });
    if (day.spots.length) dayPlan.push(day);
    const totalTicket = dayPlan.reduce((s, d) => s + d.cost, 0);
    return { cityId, days: dayPlan.length, dayPlan, totalTicket, est: true, source: 'mock' };
  }

  /* ---------- 预算 ---------- */
  function estimateBudget(route, options) {
    const daily = options.budgetPerDay || 200; // 住宿+餐饮+市内杂费/天
    let rail = 0, cityTrans = 0, stay = 0, food = 0, ticket = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const r = railBetween(route[i], route[i + 1]);
      rail += r.fare;
      cityTrans += 30; // 每城市内交通估算
    }
    const nights = Math.max(0, options.days - 1);
    stay = nights * (options.stayPerNight || 90);
    food = options.days * (options.foodPerDay || 60);
    // 景点门票
    route.forEach(c => { const p = planCity(c, 1, 300); ticket += p ? p.totalTicket : 0; });
    const total = rail + cityTrans + stay + food + ticket;
    return { rail: Math.round(rail), cityTrans: Math.round(cityTrans), stay: Math.round(stay), food: Math.round(food), ticket: Math.round(ticket), total: Math.round(total), est: true, source: 'mock' };
  }

  /* ---------- 时间可行性 ---------- */
  function timeFeasible(route, days) {
    const railH = route.slice(0, -1).reduce((s, _, i) => s + railBetween(route[i], route[i + 1]).durationMin / 60, 0);
    const cityDays = days - railH / 10; // 每 10h 铁路约折 1 个整天给跨城
    const cities = route.length - 1;
    if (cityDays < cities * 1.2) return { ok: 'no', reason: '跨城交通占用时间过高', railH: railH.toFixed(1) };
    if (cityDays < cities * 1.8) return { ok: 'tight', reason: '每个城市停留偏紧', railH: railH.toFixed(1) };
    return { ok: 'ok', reason: '时间分配合理', railH: railH.toFixed(1) };
  }

  /* ---------- 评分(可解释) ---------- */
  function routeScore(route, days, budget, opts) {
    // 总城数 = 目的地(不含起点)
    const destCount = route.length - 1;
    let railKm = 0, railH = 0, fare = 0, trans = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const r = railBetween(route[i], route[i + 1]);
      railKm += r.km; railH += r.durationMin / 60; fare += r.fare; trans += (r.path.length > 1 ? 1 : 0);
    }
    // 游玩价值: 每城取 top 景点
    const ats = route.filter(c => c !== route[0]).reduce((n, c) => n + MOCK.ATTRACTIONS.filter(a => a.cityId === c).length, 0);
    const budgetRatio = Math.min(1, budget / Math.max(1, fare + days * 150));
    let s = 40, detail = [];
    const add = (label, v) => { s += v; detail.push({ label, v }); };
    add('城市可玩性', Math.min(25, ats * 2));
    add('路线顺畅', Math.max(-10, Math.min(20, destCount * 4 - railKm / 400)));
    add('预算匹配', Math.round(budgetRatio * 20));
    const tf = timeFeasible(route, days);
    add('时间合理', tf.ok === 'no' ? -15 : tf.ok === 'tight' ? -4 : 20);
    add('换乘', -trans * 3);
    add('城市内部交通', -destCount * 2);
    return { score: Math.max(0, Math.min(100, Math.round(s))), detail, railKm: Math.round(railKm), railH: railH.toFixed(1), fare: Math.round(fare), transfers: trans, destCount, ats };
  }

  /* ---------- 多城排序 ---------- */
  function permute(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      permute(rest).forEach(p => out.push([arr[i]].concat(p)));
    }
    return out;
  }

  /* 返回 { route:[start,...order], score, reason }
   * mode: 'user' 用户顺序 | 'smart' 智能(全排列+评分) */
  function planRoute(startId, destIds, days, budget, mode, opts) {
    const fixed = destIds.filter((d, i) => d !== startId && destIds.indexOf(d) === i); // 去重(保序)+排除起点
    if (!fixed.length) return { route: [startId, startId], score: 0, reason: '没有目的地' };
    if (mode === 'user') {
      const route = [startId].concat(fixed);
      const sc = routeScore(route, days, budget, opts);
      return { route, score: sc.score, reason: '按用户指定顺序', detail: sc };
    }
    // smart: ≤7 全排列, 否则贪心+局部交换
    let best = null, bestRoute = null;
    const cands = fixed.length <= 7 ? permute(fixed) : null;
    if (cands) {
      for (const order of cands) {
        const route = [startId].concat(order);
        const sc = routeScore(route, days, budget, opts);
        if (!best || sc.score > best) { best = sc.score; bestRoute = route; }
      }
    } else {
      // 贪心: 从起点出发每次去最近未访城市; 再 2-opt 交换
      let cur = startId, rest = fixed.slice(), route = [startId];
      while (rest.length) {
        rest.sort((a, b) => railBetween(cur, a).km - railBetween(cur, b).km);
        const nxt = rest.shift(); route.push(nxt); cur = nxt;
      }
      // 局部交换(相邻)
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 1; i < route.length - 2; i++) {
          const a = route.slice(); [a[i], a[i + 1]] = [a[i + 1], a[i]];
          if (routeScore(a, days, budget, opts).score > routeScore(route, days, budget, opts).score) { route = a; improved = true; }
        }
      }
      bestRoute = route;
      best = routeScore(route, days, budget, opts).score;
    }
    const sc = routeScore(bestRoute, days, budget, opts);
    return { route: bestRoute, score: sc.score, reason: '智能优化(枚举/贪心+局部交换, 按评分)', detail: sc };
  }

  /* ---------- 中途城市推荐 ----------
   * 阶段7.1: 评分改由 Value Engine(evaluateStop) 产出 —— 不再使用临时公式 80+value/3-addFare/30。
   * 对外字段保持兼容(cityId/name/score/stopDays/detour/value/addFare/est), 供现有 UI 与测试使用。 */
  function suggestStop(startId, endId, days, opts) {
    const o = opts || {};
    const fixedDays = Math.max(0, days - Math.ceil(railBetween(startId, endId).durationMin / 60 / 10) - 1);
    if (fixedDays < 1) return { suggestable: false, reason: '时间不足, 不建议增加中途城市' };
    // 未提供预算时, 按"仅直达行程花费的 1.6 倍"作为可接受上限(数据推导, 非编造)
    const budget = (typeof o.budget === 'number' && o.budget > 0)
      ? o.budget
      : Math.max(800, Math.round(estimateBudget([startId, endId], { days: days }).total * 1.6));
    const evals = evaluateStops(startId, endId, days, budget, o.preference);
    const ok = evals.filter(e => e.feasible);
    if (!ok.length) {
      const why = evals.length ? '沿途城市在当前时间/预算下均不建议插入' : '没有合适的顺路城市';
      return { suggestable: false, reason: why, evaluations: evals };
    }
    const candidates = ok.slice(0, 3).map(e => {
      const sumValue = MOCK.ATTRACTIONS.filter(a => a.cityId === e.candidateId).reduce((s, a) => s + (a.value || 0), 0);
      const stopDays = Math.max(1, Math.ceil((e.placeValue.timeRequired || 4) / VALUE_THRESHOLDS.activeHoursPerDay));
      return {
        cityId: e.candidateId, name: e.candidateName,
        score: e.score,                       // 旅行价值(Value Engine)
        recommendation: e.recommendation,
        stopDays: stopDays,
        detour: e.addedKm, value: sumValue, addFare: e.addedFare,
        reasonCodes: e.reasonCodes, reasons: e.reasons,
        tripEvaluation: e,
        est: true,
      };
    });
    return { suggestable: true, candidates, evaluations: evals, budgetUsed: budget };
  }

/* ==================== 阶段1: 三方案候选系统 ====================
 * generateRouteCandidates(): 综合/省钱/轻松 三套 RouteCandidate
 * 评分维度归一化 0..1, 按模式权重加权 → 0..100, 可解释 breakdown
 * 全部为本地计算 + 模拟估算; source:"computed" */
const MODES = {
  balanced: { icon: '⭐', title: '综合推荐', desc: '在时间、预算和游玩价值之间取得平衡',
    weights: { tourism: 30, time: 25, budget: 20, rail: 15, transfer: 10 } },
  money: { icon: '💰', title: '省钱优先', desc: '尽可能降低旅行总成本',
    weights: { budget: 45, rail: 25, tourism: 10, time: 20, transfer: 0 } },
  relax: { icon: '🌿', title: '轻松旅行', desc: '少赶路、少换乘、每个城市多停留',
    weights: { time: 30, transfer: 25, budget: 10, rail: 15, tourism: 20 } },
};

function dimsOf(route, days, budget) {
  let km = 0, h = 0, fare = 0, tr = 0;
  const legs = [];
  for (let i = 0; i < route.length - 1; i++) {
    const r = railBetween(route[i], route[i + 1]);
    km += r.km; h += r.durationMin / 60; fare += r.fare; tr += (r.path.length > 1 ? 1 : 0);
    legs.push({ from: cityById(route[i]).name, to: cityById(route[i + 1]).name, km: r.km, durationMin: r.durationMin, fare: r.fare, transfers: r.path.length > 1 ? 1 : 0, source: 'computed' });
  }
  const direct = railBetween(route[0], route[route.length - 1]).km;
  const detour = Math.max(0, (km - direct) / Math.max(1, direct));
  const value = MOCK.ATTRACTIONS.filter(a => route.slice(1).includes(a.cityId)).reduce((s, a) => s + a.value, 0);
  const fe = timeFeasible(route, days);
  return {
    km: Math.round(km), h: Math.round(h * 10) / 10, fare: Math.round(fare), tr, detour: Math.round(detour * 100) / 100,
    value, fe,
    tourismDim: Math.min(1, value / 40),
    timeDim: fe.ok === 'ok' ? 1 : fe.ok === 'tight' ? 0.65 : 0.25,
    transferDim: Math.max(0, 1 - tr / 3),
    railDim: Math.max(0, 1 - detour / 0.6),
    railCostDim: Math.max(0, 1 - fare / (fare + 600)),
    legs, direct: Math.round(direct),
  };
}

function modeScore(route, days, budget, mode, d) {
  const w = MODES[mode].weights;
  const vals = {
    tourism: d.tourismDim, time: d.timeDim, budget: d.budgetDim,
    rail: mode === 'money' ? d.railCostDim : d.railDim, transfer: d.transferDim,
  };
  let s = 0;
  for (const k in w) s += w[k] * vals[k];
  return Math.round(s);
}

function allocateDays(cities, days, mode) {
  const n = cities.length;
  if (days <= n) return cities.map(() => 1);
  const arr = cities.map(() => 1);
  let left = days - n;
  if (mode === 'money') { arr[n - 1] += left; return arr; }
  if (mode === 'relax') {
    const idx = cities.map((c, i) => ({ i, v: MOCK.ATTRACTIONS.filter(a => a.cityId === c).reduce((s, a) => s + a.value, 0) })).sort((a, b) => b.v - a.v);
    while (left > 0) { const t = idx.shift(); if (!t) break; arr[t.i]++; left--; }
    if (left > 0) arr[n - 1] += left;
    return arr;
  }
  let i = 0;
  while (left > 0) { arr[i % n]++; i++; left--; }
  return arr;
}

function buildCandidate(type, startId, fixed, days, budget) {
  const scorer = m => r => {
    const d = dimsOf(r, days, budget);
    const bud = estimateBudget(r, { days, stayPerNight: 70, foodPerDay: 50 });
    d.budgetDim = Math.min(1, budget / Math.max(1, bud.total));
    return modeScore(r, days, budget, m, d);
  };
  const bestPerm = scorerFn => {
    let best = null, br = null;
    const cands = fixed.length <= 7 ? permute(fixed) : null;
    if (cands) {
      for (const order of cands) {
        const r = [startId].concat(order);
        const s = scorerFn(r);
        if (!best || s > best) { best = s; br = r; }
      }
      return br;
    }
    let cur = startId, rest = fixed.slice(), r = [startId];
    while (rest.length) {
      rest.sort((a, b) => railBetween(cur, a).km - railBetween(cur, b).km);
      const nxt = rest.shift(); r.push(nxt); cur = nxt;
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 1; i < r.length - 2; i++) {
        const a = r.slice(); [a[i], a[i + 1]] = [a[i + 1], a[i]];
        if (scorerFn(a) > scorerFn(r)) { r = a; improved = true; }
      }
    }
    return r;
  };
  let route;
  if (type === 'money') {
    route = bestPerm(scorer('money'));
    // 省钱: 若超预算, 循环删掉一城(保留最有价值的前缀顺序), 直到预算内或只剩1城
    let cur = fixed.slice();
    let curRoute = route;
    let curTotal = estimateBudget(curRoute, { days, stayPerNight: 70, foodPerDay: 50 }).total;
    while (curTotal > budget && cur.length > 1) {
      let bestAlt = null, bestTotal = Infinity;
      for (let i = 0; i < cur.length; i++) {
        const sub = cur.slice(0, i).concat(cur.slice(i + 1));
        if (!sub.length) continue;
        const r = [startId].concat(sub);
        const b = estimateBudget(r, { days, stayPerNight: 70, foodPerDay: 50 });
        if (b.total < bestTotal) { bestTotal = b.total; bestAlt = r; }
      }
      if (!bestAlt || bestTotal >= curTotal) break;
      curRoute = bestAlt; curTotal = bestTotal; cur = curRoute.slice(1);
    }
    route = curRoute;
  } else {
    route = bestPerm(scorer(type));
  }
  if (!route) route = [startId].concat(fixed);

  const opts = { days, stayPerNight: type === 'money' ? 70 : type === 'relax' ? 110 : 90, foodPerDay: type === 'money' ? 50 : type === 'relax' ? 70 : 60 };
  const d = dimsOf(route, days, budget);
  const bud = estimateBudget(route, opts);
  d.budgetDim = Math.min(1, budget / Math.max(1, bud.total));
  const w = MODES[type].weights;
  const score = modeScore(route, days, budget, type, d);
  const daysArr = allocateDays(route.slice(1), days, type);
  const breakdown = {
    tourism: Math.round(w.tourism * d.tourismDim),
    time: Math.round(w.time * d.timeDim),
    budget: Math.round(w.budget * d.budgetDim),
    rail: Math.round(w.rail * (type === 'money' ? d.railCostDim : d.railDim)),
    transfer: Math.round(w.transfer * d.transferDim),
  };
  const reasons = [], warnings = [];
  if (d.tourismDim >= 0.6) reasons.push('游玩价值充足');
  if (d.timeDim >= 1) reasons.push('时间安排合理'); else if (d.timeDim > 0.25) warnings.push('行程偏紧');
  if (d.budgetDim >= 1) reasons.push('预算充足'); else warnings.push('预计超预算 ¥' + Math.max(0, bud.total - budget));
  if (type !== 'money' && d.detour <= 0.15) reasons.push('铁路路线顺畅');
  if (d.tr === 0) reasons.push('全程直达, 换乘少'); else if (d.tr > 1) warnings.push('存在 ' + d.tr + ' 次换乘');
  if (type === 'relax') reasons.push('每个城市停留充裕, 强度较低');
  if (type === 'money' && route.length - 1 < fixed.length) reasons.push('减少城市以控制成本');
  return {
    id: type + '-' + Math.random().toString(36).slice(2, 6),
    type, title: MODES[type].title, icon: MODES[type].icon, description: MODES[type].desc,
    cities: route, cityNames: route.map(id => cityById(id).name),
    segments: d.legs, days, daysPerCity: daysArr,
    transport: { distanceKm: d.km, travelHours: d.h, transferCount: d.tr, detourRatio: d.detour, directKm: d.direct },
    budget: { rail: bud.rail, hotel: bud.stay, food: bud.food, attraction: bud.ticket, localTransport: bud.cityTrans, other: 0, total: bud.total },
    score, scoreBreakdown: breakdown, breakdownDenom: w,
    reasons, warnings, source: 'computed',
  };
}

function generateRouteCandidates(startId, destIds, days, budget) {
  const fixed = destIds.filter((d, i) => d !== startId && destIds.indexOf(d) === i);
  if (!fixed.length) return { candidates: [], source: 'computed' };
  return { candidates: ['balanced', 'money', 'relax'].map(t => buildCandidate(t, startId, fixed, days, budget)), source: 'computed' };
}

/* ==================== 阶段7.1: 旅行价值评价引擎 (Value Engine) ====================
 * 回答的问题与"方案匹配度"(dimsOf/modeScore)不同:
 *   方案匹配度 → 三个方案里哪个更符合用户偏好
 *   旅行价值   → 某个城市/地点, 在当前铁路旅行里到底值不值得去
 * 纯计算: 无 DOM / 无网络 / 无百度 SDK; 只复用 railBetween/estimateBudget/timeFeasible。
 * 数据诚实性: 主观维度均为启发式基线, 结果带 baselineType:'heuristic' 与 confidence,
 *            不伪装成用户行为统计; 缺失数据降低 confidence 而非编造。
 */

/* ---- 集中配置(可调工程参数, 非统计结论; 阈值集中在此便于校准) ---- */
const VALUE_THRESHOLDS = {
  // 成本维度高低阈值(0..1 归一化后)
  timeCostHigh: 0.50, timeCostLow: 0.20,
  budgetCostHigh: 0.35, budgetCostLow: 0.12,
  fatigueHigh: 0.55, fatigueLow: 0.25,
  opportunityHigh: 0.45, opportunityLow: 0.15,
  // 铁路/体验
  detourOnRoute: 0.15, detourHigh: 0.45,
  experienceHigh: 0.60, experienceLow: 0.35,
  uniquenessHigh: 0.60, representativenessHigh: 0.70,
  // 硬约束: 加入后总花费超过预算的该比例 → 不可行
  budgetHardRatio: 1.25,
  // 推荐等级阈值(score)
  rec: { high: 80, medium: 65, low: 50 },
  // 每天有效活动小时(工程假设, 非统计值)
  activeHoursPerDay: 8,
};

/* ---- 大众默认偏好: 启发式基线(非统计结论) ---- */
const DEFAULT_TRAVEL_PREFERENCE = {
  budgetSensitivity: 0.5,        // 高=在意花钱
  timeSensitivity: 0.5,          // 高=在意总时长
  walkingTolerance: 0.5,         // 高=能走
  transferTolerance: 0.5,        // 高=不怕换乘
  earlyDepartureTolerance: 0.5,  // 高=能早起
  experiencePreference: 0.5,     // 高=愿意为体验多付出
  destinationDepthPreference: 0.5, // 高=在意主目的地深度(反对被切碎)
  profile: 'balanced',
  baselineType: 'heuristic',
};

/* ---- 预设画像(供 7.2 UI 使用; 当前仅算法层) ---- */
const TRAVEL_PRESETS = {
  budget: { profile: 'budget', budgetSensitivity: 0.85, timeSensitivity: 0.40, walkingTolerance: 0.65, transferTolerance: 0.60, earlyDepartureTolerance: 0.65, experiencePreference: 0.45, destinationDepthPreference: 0.45 },
  comfort: { profile: 'comfort', budgetSensitivity: 0.35, timeSensitivity: 0.70, walkingTolerance: 0.35, transferTolerance: 0.25, earlyDepartureTolerance: 0.30, experiencePreference: 0.55, destinationDepthPreference: 0.60 },
  depth: { profile: 'depth', budgetSensitivity: 0.45, timeSensitivity: 0.50, walkingTolerance: 0.60, transferTolerance: 0.50, earlyDepartureTolerance: 0.45, experiencePreference: 0.85, destinationDepthPreference: 0.85 },
};

function _clamp01(v) { return !isFinite(v) ? 0 : Math.max(0, Math.min(1, v)); }

/**
 * 阶段7.2: 节奏滑块(0=省钱 … 1=舒适) → 连续 TravelPreference
 * 以 TRAVEL_PRESETS.budget ↔ TRAVEL_PRESETS.comfort 线性插值, 中间值产生渐进差异
 * (而非在离散预设间跳变); 结果过 normalizePreference 保证合法。
 * @param {number} pace 0..1
 * @param {string} [quickPref] 快捷偏好: balanced|play|time|money|comfort
 */
const QUICK_PREF_MODS = {
  balanced: {},
  play:    { experiencePreference: +0.25, destinationDepthPreference: +0.15 },
  time:    { timeSensitivity: +0.25, transferTolerance: -0.10 },
  money:   { budgetSensitivity: +0.30 },
  comfort: { transferTolerance: -0.25, walkingTolerance: -0.15, earlyDepartureTolerance: -0.15, timeSensitivity: +0.10 },
};

function paceToPreference(pace, quickPref) {
  const p = (typeof pace === 'number' && isFinite(pace)) ? _clamp01(pace) : 0.5;
  const a = TRAVEL_PRESETS.budget, b = TRAVEL_PRESETS.comfort;
  const out = {};
  for (const k of ['budgetSensitivity', 'timeSensitivity', 'walkingTolerance', 'transferTolerance',
    'earlyDepartureTolerance', 'experiencePreference', 'destinationDepthPreference']) {
    out[k] = _clamp01(a[k] + (b[k] - a[k]) * p);
  }
  const mod = QUICK_PREF_MODS[quickPref] || {};
  for (const k of Object.keys(mod)) out[k] = _clamp01((out[k] || 0.5) + mod[k]);
  // profile 语义: 选了快捷偏好则用它; 否则节奏明显偏某一端才标该端, 中点视为大众默认
  out.profile = (quickPref && quickPref !== 'balanced') ? quickPref
    : (Math.abs(p - 0.5) < 0.1 ? 'balanced' : (p < 0.5 ? 'budget' : 'comfort'));
  out.baselineType = 'heuristic';
  return normalizePreference(out);
}

/** 偏好归一化: 缺失字段用大众默认补齐, 越界裁剪, 不修改入参 */
function normalizePreference(p) {
  const out = Object.assign({}, DEFAULT_TRAVEL_PREFERENCE);
  if (p && typeof p === 'object') {
    for (const k of Object.keys(DEFAULT_TRAVEL_PREFERENCE)) {
      if (k === 'profile' || k === 'baselineType') { if (typeof p[k] === 'string') out[k] = p[k]; continue; }
      if (typeof p[k] === 'number' && isFinite(p[k])) out[k] = _clamp01(p[k]);
    }
  }
  return out;
}

/** 铁路邻接度(城市级, 来自现有 RAIL_LINES 图, 非编造) */
function _railDegree(cityId) {
  const adj = GRAPH[cityId] || [];
  return new Set(adj.map(e => e.to)).size;
}
const _MAX_DEGREE = Math.max(1, ...MOCK.CITIES.map(c => _railDegree(c.id)));

/**
 * PlaceValue: 地点本身的价值(与"是否当前值得去"无关)
 * 来源: experience/popularity/representativeness/uniqueness 基于 mock 景点数据推导(heuristic);
 *       accessibility 基于铁路图邻接度; timeRequired/cost 来自景点 visitMinutes/ticket。
 */
function placeValueOf(cityOrId) {
  const id = (cityOrId && typeof cityOrId === 'object') ? cityOrId.id : cityOrId;
  const city = cityById(id);
  if (!city) {
    return { cityId: null, experience: 0, popularity: 0, representativeness: 0, uniqueness: 0,
      accessibility: 0, timeRequired: null, cost: null, confidence: 'unknown', baselineType: 'unknown',
      sampleAttractions: 0 };
  }
  const ats = MOCK.ATTRACTIONS.filter(a => a.cityId === id);
  const sorted = ats.slice().sort((a, b) => b.value - a.value);
  const top3 = sorted.slice(0, 3);
  const sumAll = ats.reduce((s, a) => s + (a.value || 0), 0);
  const top1 = sorted.length ? (sorted[0].value || 0) : 0;
  const types = new Set(ats.map(a => a.type)).size;
  const ticketSum = ats.reduce((s, a) => s + (a.ticket || 0), 0);
  const visitTop3 = top3.reduce((s, a) => s + (a.visitMinutes || 0), 0);

  const experience = _clamp01(sumAll / 30);              // mock value 合计归一(8 城实测范围 13~35)
  const representativeness = _clamp01(top1 / 10);        // 最强单点的代表性
  const uniqueness = _clamp01((top1 / 10) * 0.6 + (types / 6) * 0.4); // 高价值 + 类型多样性
  const popularity = _clamp01((ats.length / 6) * 0.5 + (sumAll / 30) * 0.5); // 启发式代理, 非客流统计
  const accessibility = _clamp01(_railDegree(id) / _MAX_DEGREE);
  // 时间: 前 3 个景点游玩 + 每点 40min 市内移动 + 90min 车站/接驳缓冲
  const timeRequired = ats.length ? Math.round(((visitTop3 + 40 * top3.length + 90) / 60) * 10) / 10 : null;
  const cost = ats.length ? ticketSum : null;
  return {
    cityId: id, experience, popularity, representativeness, uniqueness, accessibility,
    timeRequired, cost,
    confidence: ats.length ? 'medium' : 'low',   // 有景点数据=中; 无数据=低(不编造)
    baselineType: 'heuristic',
    sampleAttractions: ats.length,
  };
}

/* reasonCode → 可读理由(由实际计算值生成, 保证解释与算法一致) */
const REASON_TEXT = {
  HIGH_EXPERIENCE_VALUE: '城市体验价值较高',
  LOW_EXPERIENCE_VALUE: '可体验内容较少',
  HIGH_UNIQUENESS: '体验具有独特性',
  HIGH_REPRESENTATIVENESS: '城市代表性较强',
  RAILWAY_ON_ROUTE: '铁路基本顺路，无需明显绕行',
  HIGH_DETOUR: '需要明显绕行',
  LOW_TIME_COST: '预计只增加较少时间',
  HIGH_TIME_COST: '明显增加总旅行时间',
  LOW_BUDGET_COST: '额外预算很少',
  HIGH_BUDGET_COST: '额外预算偏高',
  HIGH_FATIGUE: '会明显增加旅途疲劳',
  HIGH_OPPORTUNITY_COST: '会压缩后续城市的有效游玩时间',
  MANY_TRANSFERS: '需要多次换乘',
  RAILWAY_UNREACHABLE: '铁路无法顺路衔接',
  TIME_INFEASIBLE: '加入后整体时间不可行',
  BUDGET_EXCEEDED: '加入后总预算明显超出',
  SAME_AS_ENDPOINT: '与起点或终点相同',
  PLACE_DATA_MISSING: '缺少该城市的体验数据',
  // 阶段7.3: 目的地(终点)专用
  RAILWAY_DIRECT: '铁路可从起点直达',
  RAILWAY_NEEDS_TRANSFER: '铁路需中转到达',
  HIGH_RAIL_TIME: '铁路耗时占比较高',
  LOW_RAIL_TIME: '铁路耗时较短',
  HIGH_RAIL_COST: '铁路票价占预算比例较高',
  DEST_DEPTH_ENOUGH: '停留天数足以深入体验',
  DEST_DEPTH_THIN: '停留天数偏少，体验可能不足',
};

/**
 * TripEvaluation: 某候选城市/地点"在当前行程中值不值得去"
 * @param {string} candidateId 候选城市
 * @param {{startId:string, endId:string, days:number, budget:number, preference?:object}} ctx
 */
function evaluateStop(candidateId, ctx) {
  const c = ctx || {};
  const startId = c.startId, endId = c.endId;
  const days = (typeof c.days === 'number' && isFinite(c.days) && c.days > 0) ? c.days : 0;
  const budget = (typeof c.budget === 'number' && isFinite(c.budget) && c.budget > 0) ? c.budget : 0;
  const pref = normalizePreference(c.preference);
  const pv = placeValueOf(candidateId);
  const codes = [];

  const base = {
    candidateId: candidateId || null,
    candidateName: pv.cityId ? cityById(pv.cityId).name : null,
    placeValue: pv, preferenceProfile: pref.profile, baselineType: 'heuristic',
  };

  // ---- 硬约束 1: 候选非法 ----
  if (!pv.cityId || !startId || !endId) {
    codes.push('PLACE_DATA_MISSING');
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid',
      timeCost: 1, budgetCost: 1, fatigueCost: 1, opportunityCost: 1,
      railwayFit: 0, userMatch: 0, confidence: 'unknown',
      timeCostHours: 0, addedFare: 0, addedKm: 0, transfers: 0, detour: 0,
      reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }
  if (candidateId === startId || candidateId === endId) {
    codes.push('SAME_AS_ENDPOINT');
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid',
      timeCost: 0, budgetCost: 0, fatigueCost: 0, opportunityCost: 0,
      railwayFit: 0, userMatch: 0, confidence: pv.confidence,
      timeCostHours: 0, addedFare: 0, addedKm: 0, transfers: 0, detour: 0,
      reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }

  // ---- 铁路指标(复用现有图, 不改算法) ----
  const direct = railBetween(startId, endId);
  const leg1 = railBetween(startId, candidateId);
  const leg2 = railBetween(candidateId, endId);
  const railReachable = leg1.path.length > 0 && leg2.path.length > 0;

  // ---- 硬约束 2: 铁路无法顺路衔接 ----
  if (!railReachable) {
    codes.push('RAILWAY_UNREACHABLE');
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid',
      timeCost: 1, budgetCost: 1, fatigueCost: 1, opportunityCost: 1,
      railwayFit: 0, userMatch: 0, confidence: pv.confidence,
      timeCostHours: 0, addedFare: 0, addedKm: 0, transfers: 0, detour: 0,
      reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }

  const addedKm = leg1.km + leg2.km - direct.km;
  const addedRailH = Math.max(0, (leg1.durationMin + leg2.durationMin - direct.durationMin) / 60);
  const addedFare = Math.max(0, leg1.fare + leg2.fare - direct.fare);
  const transfers = (leg1.path.length > 1 ? 1 : 0) + (leg2.path.length > 1 ? 1 : 0);
  const detour = Math.max(0, addedKm / Math.max(1, direct.km));
  const stationBufferH = 0.5 * 2; // 每新增一段约 0.5h 车站/衔接缓冲(两段)

  // ---- 时间成本 ----
  const stopHours = (pv.timeRequired != null) ? pv.timeRequired : 0;
  const timeCostH = addedRailH + stationBufferH + stopHours;
  const availableH = Math.max(1, days * VALUE_THRESHOLDS.activeHoursPerDay);
  const timeCost = _clamp01(timeCostH / availableH);

  // ---- 预算成本 ----
  const extraDays = Math.max(0, Math.ceil(stopHours / VALUE_THRESHOLDS.activeHoursPerDay));
  const perNight = pref.budgetSensitivity > 0.5 ? 70 : 100;
  const addedLiving = extraDays * (perNight + 60);
  const addedCost = addedFare + addedLiving;
  const budgetCost = _clamp01(addedCost / Math.max(1, budget));

  // ---- 疲劳成本(粗粒度: 铁路时长 + 换乘 + 城市切换) ----
  const fatigueCost = _clamp01((addedRailH / 8) * 0.5 + transfers * 0.15 + 0.10);

  // ---- 机会成本: 插入该城占用天数 → 压缩主目的地有效时间 ----
  const occupiedDays = Math.max(1, Math.ceil((addedRailH + stationBufferH + stopHours) / VALUE_THRESHOLDS.activeHoursPerDay));
  const opportunityCost = _clamp01((occupiedDays * VALUE_THRESHOLDS.activeHoursPerDay * 0.6) / availableH);

  // ---- 铁路适配 ----
  const railwayFit = _clamp01(1 - detour / 0.6);

  // ---- 便利性(换乘与市内接驳代理) ----
  const convenience = _clamp01(1 - transfers * 0.25 - 0.10);

  // ---- 用户匹配(偏好 × 地点特征) ----
  const expMatch = 1 - Math.abs(pref.experiencePreference - pv.experience);
  const budgetMatch = 1 - Math.abs(pref.budgetSensitivity - (1 - _clamp01((pv.cost != null ? pv.cost : 60) / 200)));
  const depthMatch = pref.destinationDepthPreference > 0.5
    ? _clamp01((pv.timeRequired || 0) / 6)          // 求深度: 停留时长充足是加分
    : _clamp01(1 - (pv.timeRequired || 0) / 10);    // 不求深度: 短平快更好
  const transferMatch = 1 - transfers * (1 - pref.transferTolerance) * 0.5;
  const userMatch = _clamp01(0.35 * expMatch + 0.25 * budgetMatch + 0.25 * depthMatch + 0.15 * transferMatch);

  // ---- 硬约束 3/4: 时间不可行 / 预算明显超出 ----
  const routeAfter = [startId, candidateId, endId];
  const tf = timeFeasible(routeAfter, days);
  const totalAfter = estimateBudget(routeAfter, { days: days, stayPerNight: perNight, foodPerDay: 60 }).total;
  let feasible = true;
  if (!days || tf.ok === 'no') { feasible = false; codes.push('TIME_INFEASIBLE'); }
  if (!budget || totalAfter > budget * VALUE_THRESHOLDS.budgetHardRatio) { feasible = false; codes.push('BUDGET_EXCEEDED'); }
  const experienceDensity = Math.round((pv.experience * 100) / Math.max(0.5, timeCostH) * 10) / 10; // 每小时可获得的体验强度(内部指标, 不单独作为推荐依据)
  if (!feasible) {
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid',
      timeCost, budgetCost, fatigueCost, opportunityCost, railwayFit, userMatch,
      timeCostHours: Math.round(timeCostH * 10) / 10, addedFare: Math.round(addedFare),
      addedKm: Math.round(addedKm), transfers, detour: Math.round(detour * 100) / 100,
      experienceDensity,
      confidence: pv.confidence, reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }

  // ---- 偏好重加权(省钱型: 钱权重↑/时间权重↓; 舒适型: 时间与换乘权重↑; 深度型: 体验权重↑) ----
  const bS = pref.budgetSensitivity, tS = pref.timeSensitivity, eP = pref.experiencePreference;
  const w = {
    time: 0.30 * (0.6 + 0.8 * tS) * (1.20 - 0.40 * bS),
    experience: 0.25 * (0.7 + 0.6 * eP),
    rail: 0.15,
    budget: 0.15 * (0.6 + 0.8 * bS),
    convenience: 0.10 * (0.6 + 0.8 * (1 - pref.transferTolerance)),
    representation: 0.05,
  };
  const wSum = Object.values(w).reduce((s, x) => s + x, 0) || 1;
  for (const k of Object.keys(w)) w[k] = w[k] / wSum; // 归一, 保证 base ≤ 100

  const dims = {
    timeEfficiency: 1 - timeCost,
    experience: pv.experience,
    railwayFit: railwayFit,
    budgetFit: 1 - budgetCost,
    convenience: convenience,
    representation: pv.representativeness,
  };
  const baseScore = 100 * (
    w.time * dims.timeEfficiency + w.experience * dims.experience + w.rail * dims.railwayFit +
    w.budget * dims.budgetFit + w.convenience * dims.convenience + w.representation * dims.representation
  );
  // 惩罚(疲劳/机会成本/换乘), 随偏好缩放
  const fatigueScale = 0.6 + 0.8 * (1 - pref.walkingTolerance);
  const oppScale = 0.6 + 0.8 * pref.destinationDepthPreference;
  const penalty = 25 * fatigueCost * fatigueScale + 25 * opportunityCost * oppScale +
    transfers * 6 * (1 - pref.transferTolerance);
  const score = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));

  // ---- reasonCodes: 与实际计算值一一对应 ----
  if (pv.experience >= VALUE_THRESHOLDS.experienceHigh) codes.push('HIGH_EXPERIENCE_VALUE');
  if (pv.experience < VALUE_THRESHOLDS.experienceLow) codes.push('LOW_EXPERIENCE_VALUE');
  if (pv.uniqueness >= VALUE_THRESHOLDS.uniquenessHigh) codes.push('HIGH_UNIQUENESS');
  if (pv.representativeness >= VALUE_THRESHOLDS.representativenessHigh) codes.push('HIGH_REPRESENTATIVENESS');
  if (detour <= VALUE_THRESHOLDS.detourOnRoute) codes.push('RAILWAY_ON_ROUTE');
  if (detour >= VALUE_THRESHOLDS.detourHigh) codes.push('HIGH_DETOUR');
  if (timeCost <= VALUE_THRESHOLDS.timeCostLow) codes.push('LOW_TIME_COST');
  if (timeCost >= VALUE_THRESHOLDS.timeCostHigh) codes.push('HIGH_TIME_COST');
  if (budgetCost <= VALUE_THRESHOLDS.budgetCostLow) codes.push('LOW_BUDGET_COST');
  if (budgetCost >= VALUE_THRESHOLDS.budgetCostHigh) codes.push('HIGH_BUDGET_COST');
  if (fatigueCost >= VALUE_THRESHOLDS.fatigueHigh) codes.push('HIGH_FATIGUE');
  if (opportunityCost >= VALUE_THRESHOLDS.opportunityHigh) codes.push('HIGH_OPPORTUNITY_COST');
  if (transfers >= 2) codes.push('MANY_TRANSFERS');

  const R = VALUE_THRESHOLDS.rec;
  const recommendation = score >= R.high ? 'high' : score >= R.medium ? 'medium' : score >= R.low ? 'low' : 'avoid';

  return Object.assign(base, {
    feasible: true, score, recommendation,
    timeCost, budgetCost, fatigueCost, opportunityCost, railwayFit, userMatch,
    dims, weights: w,
    timeCostHours: Math.round(timeCostH * 10) / 10,
    addedFare: Math.round(addedFare), addedKm: Math.round(addedKm),
    transfers, detour: Math.round(detour * 100) / 100,
    experienceDensity,
    totalAfter: Math.round(totalAfter),
    confidence: pv.confidence,
    reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
  });
}

/* ==================== 阶段7.3: 目的地(终点)评价 ====================
 * 语义边界(与沿途 TripEvaluation 严格区分):
 *   DestinationEvaluation = 终点城市的【绝对】旅行价值
 *     - railAccess: 起点→终点的绝对铁路可达质量(可达/直达/时长/里程/票价/换乘)
 *     - 无 detour / addedKm / addedRailH / addedFare (终点不存在"绕行"概念)
 *     - 无 opportunityCost (终点不是被插入的可选项, 没有"替代方案"可比)
 *   TripEvaluation(未改动) = 沿途城市的【增量】价值
 * 两者共享 placeValueOf() 与偏好/阈值/理由机制, 但不混为一个分数。
 */

/** 起点→终点的绝对铁路可达信息(复用 railBetween, 不新增算法) */
function _railAccess(startId, destId) {
  const leg = railBetween(startId, destId);
  const reachable = leg.path.length > 0;
  const from = cityById(startId), to = cityById(destId);
  const straightKm = (from && to) ? Math.round(distKm(from, to)) : null;
  const detourRatio = (straightKm && straightKm > 0) ? Math.round((leg.km / straightKm) * 100) / 100 : null;
  return {
    reachable: reachable,
    direct: reachable && leg.path.length === 1,
    railHours: Math.round((leg.durationMin / 60) * 10) / 10,
    railKm: leg.km,
    railFare: leg.fare,
    transfers: reachable ? Math.max(0, leg.path.length - 1) : null,
    detourRatio: detourRatio,
    est: !!leg.est,
  };
}

/**
 * 目的地(终点)绝对旅行价值评价
 * @param {string} destId 目标城市
 * @param {{startId:string, days:number, budget:number, preference?:object}} ctx
 *   budget = 用户整趟旅行总预算(与 plan() 中 +$('inBudget').value 同义)
 */
function destinationEvaluation(destId, ctx) {
  const c = ctx || {};
  const startId = c.startId;
  const days = (typeof c.days === 'number' && isFinite(c.days) && c.days > 0) ? c.days : 0;
  const budget = (typeof c.budget === 'number' && isFinite(c.budget) && c.budget > 0) ? c.budget : 0;
  const pref = normalizePreference(c.preference);
  const pv = placeValueOf(destId);
  const codes = [];

  const base = {
    destId: destId || null,
    destName: pv.cityId ? cityById(pv.cityId).name : null,
    placeValue: pv,
    preferenceProfile: pref.profile,
    baselineType: 'heuristic',
  };
  const emptyRail = { reachable: false, direct: false, railHours: null, railKm: null, railFare: null, transfers: null, detourRatio: null, est: true };

  if (!pv.cityId || !startId) {
    codes.push('PLACE_DATA_MISSING');
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid', railAccess: emptyRail,
      timeCost: 1, budgetCost: 1, fatigueCost: 1, userMatch: 0, confidence: 'unknown',
      reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }
  if (destId === startId) {
    codes.push('SAME_AS_ENDPOINT');
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid', railAccess: _railAccess(startId, destId),
      timeCost: 0, budgetCost: 0, fatigueCost: 0, userMatch: 0, confidence: pv.confidence,
      reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }

  const ra = _railAccess(startId, destId);
  if (!ra.reachable) {
    codes.push('RAILWAY_UNREACHABLE');
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid', railAccess: ra,
      timeCost: 1, budgetCost: 1, fatigueCost: 1, userMatch: 0, confidence: pv.confidence,
      reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }

  const stationBufferH = 0.5;
  const railH = ra.railHours || 0;
  const stayHours = (pv.timeRequired != null) ? pv.timeRequired : 0;
  const timeCostH = railH + stationBufferH + stayHours;
  const availableH = Math.max(1, days * VALUE_THRESHOLDS.activeHoursPerDay);
  const timeCost = _clamp01(timeCostH / availableH);
  const budgetCost = _clamp01((ra.railFare || 0) / Math.max(1, budget));
  const fatigueCost = _clamp01((railH / 8) * 0.5 + (ra.transfers || 0) * 0.15);

  const expMatch = 1 - Math.abs(pref.experiencePreference - pv.experience);
  const budgetMatch = 1 - Math.abs(pref.budgetSensitivity - (1 - _clamp01((pv.cost != null ? pv.cost : 60) / 200)));
  const stayDays = Math.max(1, Math.round(days * 0.6));
  const depthRatio = _clamp01(stayDays * VALUE_THRESHOLDS.activeHoursPerDay / Math.max(1, (pv.timeRequired || 4) * 1.2));
  const depthMatch = pref.destinationDepthPreference > 0.5 ? depthRatio : _clamp01(1 - depthRatio * 0.5);
  const transferMatch = 1 - (ra.transfers || 0) * (1 - pref.transferTolerance) * 0.5;
  const userMatch = _clamp01(0.35 * expMatch + 0.25 * budgetMatch + 0.25 * depthMatch + 0.15 * transferMatch);

  const totalTrip = estimateBudget([startId, destId], { days: days, stayPerNight: pref.budgetSensitivity > 0.5 ? 70 : 100, foodPerDay: 60 }).total;
  let feasible = true;
  if (!days || timeCostH > availableH) { feasible = false; codes.push('TIME_INFEASIBLE'); }
  if (!budget || totalTrip > budget * VALUE_THRESHOLDS.budgetHardRatio) { feasible = false; codes.push('BUDGET_EXCEEDED'); }
  if (!feasible) {
    return Object.assign(base, {
      feasible: false, score: 0, recommendation: 'avoid', railAccess: ra,
      timeCost, budgetCost, fatigueCost, userMatch,
      timeCostHours: Math.round(timeCostH * 10) / 10, totalTrip: Math.round(totalTrip),
      confidence: pv.confidence, reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
    });
  }

  const bS = pref.budgetSensitivity, tS = pref.timeSensitivity, eP = pref.experiencePreference;
  const w = {
    time: 0.30 * (0.6 + 0.8 * tS) * (1.20 - 0.40 * bS),
    experience: 0.30 * (0.7 + 0.6 * eP),
    rail: 0.15,
    budget: 0.15 * (0.6 + 0.8 * bS),
    representation: 0.10,
  };
  const wSum = Object.values(w).reduce((x, y) => x + y, 0) || 1;
  for (const k of Object.keys(w)) w[k] = w[k] / wSum;

  const railQuality = _clamp01(1 - (ra.transfers || 0) * 0.3 - (railH / 12) * 0.4);
  const dims = {
    timeEfficiency: 1 - timeCost,
    experience: pv.experience,
    railAccess: railQuality,
    budgetFit: 1 - budgetCost,
    representation: pv.representativeness,
  };
  const baseScore = 100 * (
    w.time * dims.timeEfficiency + w.experience * dims.experience + w.rail * dims.railAccess +
    w.budget * dims.budgetFit + w.representation * dims.representation
  );
  const fatigueScale = 0.6 + 0.8 * (1 - pref.walkingTolerance);
  const penalty = 22 * fatigueCost * fatigueScale + (ra.transfers || 0) * 5 * (1 - pref.transferTolerance);
  const score = Math.max(0, Math.min(100, Math.round(baseScore - penalty)));

  if (ra.direct) codes.push('RAILWAY_DIRECT');
  else if ((ra.transfers || 0) >= 1) codes.push('RAILWAY_NEEDS_TRANSFER');
  if (railH >= 5) codes.push('HIGH_RAIL_TIME');
  else if (railH <= 2) codes.push('LOW_RAIL_TIME');
  if (budgetCost >= VALUE_THRESHOLDS.budgetCostHigh) codes.push('HIGH_RAIL_COST');
  if (pv.experience >= VALUE_THRESHOLDS.experienceHigh) codes.push('HIGH_EXPERIENCE_VALUE');
  if (pv.experience < VALUE_THRESHOLDS.experienceLow) codes.push('LOW_EXPERIENCE_VALUE');
  if (pv.uniqueness >= VALUE_THRESHOLDS.uniquenessHigh) codes.push('HIGH_UNIQUENESS');
  if (pv.representativeness >= VALUE_THRESHOLDS.representativenessHigh) codes.push('HIGH_REPRESENTATIVENESS');
  if (fatigueCost >= VALUE_THRESHOLDS.fatigueHigh) codes.push('HIGH_FATIGUE');
  if ((ra.transfers || 0) >= 2) codes.push('MANY_TRANSFERS');
  if (depthRatio >= 0.8) codes.push('DEST_DEPTH_ENOUGH');
  else if (depthRatio < 0.5) codes.push('DEST_DEPTH_THIN');

  const R = VALUE_THRESHOLDS.rec;
  const recommendation = score >= R.high ? 'high' : score >= R.medium ? 'medium' : score >= R.low ? 'low' : 'avoid';

  return Object.assign(base, {
    feasible: true, score, recommendation, railAccess: ra,
    timeCost, budgetCost, fatigueCost, userMatch,
    dims, weights: w,
    timeCostHours: Math.round(timeCostH * 10) / 10,
    stayDays: stayDays, depthRatio: Math.round(depthRatio * 100) / 100,
    totalTrip: Math.round(totalTrip),
    confidence: pv.confidence,
    reasonCodes: codes, reasons: codes.map(k => REASON_TEXT[k]),
  });
}

/**
 * 批量评估: 起点→终点 沿途可插入城市(与 suggestStop 同一候选口径)
 * @returns {Array<TripEvaluation>} 按 score 降序
 */
function evaluateStops(startId, endId, days, budget, preference) {
  // 端点必须存在, 否则返回空(避免在缺少该节点的图上执行 Dijkstra 而崩溃)
  if (!cityById(startId) || !cityById(endId)) return [];
  const onPath = MOCK.CITIES.filter(c => c.id !== startId && c.id !== endId &&
    railBetween(startId, c.id).path.length && railBetween(c.id, endId).path.length);
  return onPath
    .map(c => evaluateStop(c.id, { startId, endId, days, budget, preference }))
    .sort((a, b) => (b.feasible ? b.score : -1) - (a.feasible ? a.score : -1));
}

  return { cityById, cityByName, distKm, railBetween, planCity, estimateBudget, timeFeasible, routeScore, planRoute, suggestStop, generateRouteCandidates, MODES, CITIES: MOCK.CITIES, ATTRACTIONS: MOCK.ATTRACTIONS, FOOD: MOCK.FOOD, STAY: MOCK.STAY, VALUE_THRESHOLDS, DEFAULT_TRAVEL_PREFERENCE, TRAVEL_PRESETS, normalizePreference, placeValueOf, evaluateStop, evaluateStops, paceToPreference, QUICK_PREF_MODS, destinationEvaluation };
});