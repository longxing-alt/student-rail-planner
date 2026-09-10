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

  /* ---------- 中途城市推荐 ---------- */
  function suggestStop(startId, endId, days, opts) {
    const fixedDays = Math.max(0, days - Math.ceil(railBetween(startId, endId).durationMin / 60 / 10) - 1);
    if (fixedDays < 1) return { suggestable: false, reason: '时间不足, 不建议增加中途城市' };
    // 沿途候选 = 与起终点都有铁路边的城市(主轴上), 排除起终点
    const onPath = MOCK.CITIES.filter(c => c.id !== startId && c.id !== endId &&
      railBetween(startId, c.id).path.length && railBetween(c.id, endId).path.length);
    const out = onPath.map(c => {
      const add = railBetween(startId, c.id).fare + railBetween(c.id, endId).fare - railBetween(startId, endId).fare;
      const value = MOCK.ATTRACTIONS.filter(a => a.cityId === c.id).reduce((s, a) => s + a.value, 0);
      return { cityId: c.id, name: c.name, score: Math.round(80 + value / 3 - Math.max(0, add) / 30), stopDays: 1,
        detour: Math.round(railBetween(startId, c.id).km + railBetween(c.id, endId).km - railBetween(startId, endId).km),
        value, addFare: Math.round(add), est: true };
    }).sort((a, b) => b.score - a.score).slice(0, 3);
    if (!out.length) return { suggestable: false, reason: '没有合适的顺路城市' };
    return { suggestable: true, candidates: out };
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

  return { cityById, cityByName, distKm, railBetween, planCity, estimateBudget, timeFeasible, routeScore, planRoute, suggestStop, generateRouteCandidates, MODES, CITIES: MOCK.CITIES, ATTRACTIONS: MOCK.ATTRACTIONS, FOOD: MOCK.FOOD, STAY: MOCK.STAY };
});