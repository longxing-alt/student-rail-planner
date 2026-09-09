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

  return { cityById, cityByName, distKm, railBetween, planCity, estimateBudget, timeFeasible, routeScore, planRoute, suggestStop, CITIES: MOCK.CITIES, ATTRACTIONS: MOCK.ATTRACTIONS, FOOD: MOCK.FOOD, STAY: MOCK.STAY };
});