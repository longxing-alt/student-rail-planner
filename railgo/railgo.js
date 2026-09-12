/* RailGo 页面交互 — 三方案候选系统 + 时间轴 + 中途推荐 + 城市详情 + 预算 + 演示地图 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}; // jsdom 测试垫片, 浏览器原生有
  }
  const M = window.RailGoMock, C = window.RailGoCore, BAIDU = window.RailGoBaidu;
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let state = { dests: [], mode: 'smart', pref: 'balanced', pace: 0.5, stopSuggest: true, candidates: [], active: 0, poiCity: null, poiCat: 'attraction', mockPlanHTML: '', planSource: 'mock', dayPlans: [] };

  /* ---------- 城市解析 ---------- */
  function resolveCity(q) { return q ? C.cityByName(String(q).trim()) : null; }

  function fillCityList() {
    $('cityList').innerHTML = M.CITIES.map(c => '<option value="' + c.name + '">').join('');
  }

  function renderChips() {
    const box = $('destChips');
    box.innerHTML = '';
    const start = resolveCity($('inStart').value);
    if (start) box.innerHTML += '<span class="dest-chip start">🏠 ' + start.name + '</span>';
    state.dests.forEach((d, i) => {
      const s = document.createElement('span');
      s.className = 'dest-chip';
      s.innerHTML = (i === 0 ? '📍 ' : '') + d.name + '<span class="x" data-i="' + i + '">✕</span>';
      box.appendChild(s);
    });
    box.querySelectorAll('.x').forEach(x => x.addEventListener('click', () => {
      state.dests.splice(+x.dataset.i, 1); renderChips();
    }));
  }

  function bindSeg(id, val) {
    const el = $(id);
    el.addEventListener('click', () => {
      document.querySelectorAll('.seg').forEach(s => s.classList.remove('on'));
      el.classList.add('on');
      state.mode = val;
      $('lockHint').textContent = val === 'user' ? '将严格按你添加的顺序执行，不做跨城重排。' : '将自动寻找评分最高的城市顺序。';
    });
  }

  /* ---------- 核心: 生成三方案 ---------- */
  function plan() {
    const start = resolveCity($('inStart').value);
    if (!start) { alert('起点城市未收录（演示仅支持: ' + M.CITIES.map(c => c.name).join('/') + '）'); return; }
    if (!state.dests.length) { alert('请先添加至少一个目的地'); return; }
    const days = +$('inDays').value, budget = +$('inBudget').value;
    const destIds = state.dests.map(d => d.id);
    const RC = C.generateRouteCandidates(start.id, destIds, days, budget);
    state.candidates = RC.candidates;
    state.active = 0;
    renderCandidates();
    if (state.candidates.length) renderActive(start, days, budget);
    maybeSuggestStop(start.id, state.candidates.length ? state.candidates[0].cities : [start.id, start.id], days, budget);
    $('resSection').hidden = false;
    $('resSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 三方案卡片 ---------- */
  function renderCandidates() {
    const box = $('candidateList');
    if (!box) return;
    if (!state.candidates.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="hint" style="margin-bottom:6px">为你生成了 ' + state.candidates.length + ' 种旅行方式，点击卡片切换：</div>';
    state.candidates.forEach((c, i) => {
      const card = document.createElement('div');
      card.className = 'candidate-card' + (i === state.active ? ' on' : '');
      card.dataset.i = i;
      card.innerHTML =
        '<div class="cc-head"><span class="cc-icon">' + c.icon + '</span> <b>' + c.title + '</b>' +
        '<span class="cc-score">' + c.score + ' 分</span></div>' +
        '<div class="cc-route">' + c.cityNames.join(' → ') + '</div>' +
        '<div class="cc-meta">' + c.days + ' 天 · ¥' + c.budget.total + ' · ' + c.transport.distanceKm + ' km · 换乘 ' + c.transport.transferCount + '</div>' +
        '<div class="cc-tags">' + c.reasons.slice(0, 3).map(r => '<span class="tag ok">' + r + '</span>').join('') +
        c.warnings.slice(0, 2).map(w => '<span class="tag warn">' + w + '</span>').join('') + '</div>' +
        '<button class="btn small" style="margin-top:8px">查看方案</button>';
      card.querySelector('.btn').addEventListener('click', e => { e.stopPropagation(); setActive(i); });
      card.addEventListener('click', () => setActive(i));
      box.appendChild(card);
    });
  }

  function setActive(i) {
    state.active = i;
    renderCandidates();
    const start = resolveCity($('inStart').value);
    if (start && state.candidates[i]) renderActive(start, +$('inDays').value, +$('inBudget').value);
  }

  /* ---------- 渲染选中方案 ---------- */
  /* ---------- 阶段7.3: 目的地价值卡片(只渲染 core 结果, 不在 UI 计算) ---------- */
  function renderDestination(startId, c, days, budget) {
    const box = $('destBox');
    if (!box) return;
    const destId = c && c.cities && c.cities.length ? c.cities[c.cities.length - 1] : null;
    if (!destId) { box.innerHTML = ''; return; }
    let d;
    try {
      d = C.destinationEvaluation(destId, { startId: startId, days: days, budget: budget, preference: currentPreference() });
    } catch (e) { box.innerHTML = ''; return; }
    if (!d || !d.destName) { box.innerHTML = ''; return; }
    const REC = { high: '强烈推荐', medium: '值得考虑', low: '慎重考虑', avoid: '不建议' };
    const ra = d.railAccess || {};
    // 阶段7.6: 文案统一由 Core 提供(reasonCodes 仅用于分类, 不在 UI 重新定义文案)
    // 分类必须覆盖 destinationEvaluation 产出的全部 code, 不得静默丢弃(SAME_AS_ENDPOINT 曾漏)
    const reasonMap = {};
    (d.reasonCodes || []).forEach((k, i) => { reasonMap[k] = (d.reasons && d.reasons[i]) || k; });
    const pos = (d.reasonCodes || []).filter(k => /HIGH_EXPERIENCE|UNIQUENESS|REPRESENTATIVENESS|DIRECT|LOW_RAIL_TIME|DEST_DEPTH_ENOUGH/.test(k));
    const neg = (d.reasonCodes || []).filter(k => /LOW_EXPERIENCE|HIGH_RAIL_TIME|HIGH_RAIL_COST|HIGH_FATIGUE|NEEDS_TRANSFER|MANY_TRANSFERS|DEST_DEPTH_THIN|BUDGET_EXCEEDED|TIME_INFEASIBLE|RAILWAY_UNREACHABLE|PLACE_DATA_MISSING|SAME_AS_ENDPOINT/.test(k));
    box.innerHTML = '<div class="dest-card">' +
      '<div class="dt">📍 ' + esc(d.destName) + ' · 目的地价值 <span class="dscore">' + d.score + '</span> <span class="badge ' + (d.recommendation === 'high' ? 'ok' : d.recommendation === 'avoid' ? 'warn' : '') + '">' + (REC[d.recommendation] || d.recommendation) + '</span>' +
      '<span class="badge mock">与"方案匹配度"含义不同</span></div>' +
      '<div class="dmeta">' +
      '<span>铁路 ' + (ra.railHours != null ? ra.railHours + ' h' : '—') + (ra.railKm != null ? ' · ' + ra.railKm + ' km' : '') + '</span>' +
      '<span>' + (ra.direct ? '直达' : (ra.transfers != null ? '换乘 ' + ra.transfers + ' 次' : '不可达')) + '</span>' +
      '<span>票价 ¥' + (ra.railFare != null ? ra.railFare : '—') + '【模拟】</span>' +
      '<span>整趟预计 ¥' + (d.totalTrip != null ? d.totalTrip : '—') + ' / 预算</span>' +
      '</div>' +
      (pos.length ? '<div class="reason-line pos">✓ ' + pos.map(k => reasonMap[k] || k).join(' · ') + '</div>' : '') +
      (neg.length ? '<div class="reason-line neg">⚠ ' + neg.map(k => reasonMap[k] || k).join(' · ') + '</div>' : '') +
      '</div>';
  }

  function renderActive(start, days, budget) {
    const c = state.candidates[state.active];
    if (!c) return;
    renderSum(c, budget);
    renderDestination(start.id, c, days, budget);
    renderVerdict(c, budget, days);
    renderTimeline(c);
    Promise.resolve(renderMap(c.cities)).catch(() => { try { renderSvgMap(c.cities); } catch (e) {} });
    renderBudget(c.budget, budget);
  }

  function renderSum(c, budget) {
    const d = c.transport;
    const over = c.budget.total > budget;
    $('sumBox').innerHTML =
      '<div class="route">' + c.cityNames.map((n, i) => (i ? '<span class="arrow">→</span>' : '') + n).join('') + '</div>' +
      '<div>' + c.icon + ' ' + c.title + ' · 推荐指数 <span class="score">' + c.score + '</span> / 100 ' +
      '<span class="badge mock">估算</span>' + (over ? '<span class="est">（超预算 ¥' + (c.budget.total - budget) + '）</span>' : '') + '</div>' +
      '<div class="metrics">' +
      '<span>总铁路距离 约 ' + d.distanceKm + ' km【模拟】</span>' +
      '<span>铁路时间 约 ' + d.travelHours + ' h【模拟】</span>' +
      '<span>交通费用 ¥' + c.budget.rail + '【模拟】</span>' +
      '<span>换乘 ' + d.transferCount + ' 次</span>' +
      '<span>城市 ' + (c.cityNames.length - 1) + ' 个</span>' +
      '<span>游玩 ' + c.days + ' 天</span>' +
      '<span>预算 ¥' + c.budget.total + ' / ¥' + budget + '</span>' +
      '</div>' +
      '<div class="breakdown">' +
      '<span>铁路 ¥' + c.budget.rail + '</span><span>住宿 ¥' + c.budget.hotel + '</span>' +
      '<span>餐饮 ¥' + c.budget.food + '</span><span>门票 ¥' + c.budget.attraction + '</span><span>市内 ¥' + c.budget.localTransport + '</span>' +
      '</div>' +
      '<div class="score-detail">' +
      '<div class="line"><span>游玩价值</span><b class="pos">' + c.scoreBreakdown.tourism + '/' + c.breakdownDenom.tourism + '</b></div>' +
      '<div class="line"><span>时间合理</span><b class="pos">' + c.scoreBreakdown.time + '/' + c.breakdownDenom.time + '</b></div>' +
      '<div class="line"><span>预算匹配</span><b class="pos">' + c.scoreBreakdown.budget + '/' + c.breakdownDenom.budget + '</b></div>' +
      '<div class="line"><span>铁路便利</span><b class="pos">' + c.scoreBreakdown.rail + '/' + c.breakdownDenom.rail + '</b></div>' +
      '<div class="line"><span>换乘/绕行</span><b class="pos">' + c.scoreBreakdown.transfer + '/' + c.breakdownDenom.transfer + '</b></div>' +
      '</div>' +
      '<div class="hint" style="margin-top:6px">' + (c.reasons.length ? '✓ ' + c.reasons.join(' · ') : '') +
      (c.warnings.length ? '<br>⚠ ' + c.warnings.join(' · ') : '') + '</div>';
  }

  function renderVerdict(c, budget, days) {
    const v = $('verdictBox');
    const fe = C.timeFeasible(c.cities, days);
    if (fe.ok === 'no') {
      v.innerHTML = '<div class="verdict no">✕ 当前方案不可行：' + fe.reason + '（铁路约 ' + fe.railH + ' h）。建议减少城市或增加天数。</div>';
    } else if (c.budget.total > budget) {
      v.innerHTML = '<div class="verdict tight">⚠ 当前方案预计超预算 ¥' + (c.budget.total - budget) + '。' +
        '<button class="btn small warn" id="btnAutoAdjust">自动调整（优先省钱方案）</button></div>';
      $('btnAutoAdjust').addEventListener('click', () => { state.active = 1; renderCandidates(); renderActive(resolveCity($('inStart').value), days, budget); });
    } else if (fe.ok === 'tight') {
      v.innerHTML = '<div class="verdict tight">⚠ 行程偏紧：' + fe.reason + '，可换「🌿 轻松旅行」方案。</div>';
    } else {
      v.innerHTML = '<div class="verdict ok">✓ ' + c.title + '方案可行：时间与预算均合理。</div>';
    }
  }

  /* ---------- 时间轴 ---------- */
  function renderTimeline(c) {
    const box = $('timeline');
    box.innerHTML = '';
    c.cities.forEach((id, i) => {
      const city = C.cityById(id);
      const node = document.createElement('div');
      node.className = 'node' + (i > 0 && i < c.cities.length - 1 ? ' stay' : '');
      const dayStay = i > 0 ? (c.daysPerCity[i - 1] || 1) : null;
      const legs = i > 0 ? ['<span>🚄 ' + c.segments[i - 1].km + ' km · ' + Math.round(c.segments[i - 1].durationMin / 60 * 10) / 10 + ' h · ¥' + c.segments[i - 1].fare + '</span>'] : [];
      node.innerHTML =
        '<div class="left"><span class="dot"></span>' + (i < c.cities.length - 1 ? '<span class="rail"></span>' : '') + '</div>' +
        '<div class="node-body"><div class="city-card" data-id="' + id + '">' +
        '<span class="tt">' + (i === 0 ? '🏠 ' : '📍 ') + city.name + '</span>' +
        (dayStay ? '<span class="stay">停留 ' + dayStay + ' 天</span>' : '') +
        '<div class="meta">' + (legs.join('') || '出发城市') + ' <span class="badge mock">模拟</span></div>' +
        '</div></div>';
      box.appendChild(node);
    });
    box.querySelectorAll('.city-card').forEach(el => el.addEventListener('click', () => showCity(el.dataset.id)));
  }

  /* ---------- 城市详情 ---------- */
  /* ==================== 阶段6.2: DayPlan 数据结构 ====================
   * 5.2 的"POI → HTML 字符串"升级为"POI → DayPlan → (路线) → HTML"。
   * 顺序保持 5.2 既定逻辑: LocalSearch 相关度顺序取前 6 条, 每 3 条一天; 不重排。
   * 约束: routes.length === spots.length - 1 (0 景点 0 段 / 1 景点 0 段 / 3 景点 2 段)。
   */
  const DAY_SPOTS = 3;   // 与 5.2 一致
  const DAY_MAX_SPOTS = 6;

  function buildDayPlans(list) {
    const ats = (list || []).slice(0, DAY_MAX_SPOTS);
    const days = [];
    for (let d = 0; d < Math.ceil(ats.length / DAY_SPOTS); d++) {
      const spots = ats.slice(d * DAY_SPOTS, (d + 1) * DAY_SPOTS);
      days.push({ day: d + 1, spots: spots, routes: new Array(Math.max(0, spots.length - 1)).fill(null) });
    }
    return days;
  }

  /* 同一 Day 内相邻景点路线: 串行(低请求量优先), 单段失败不影响整天 */
  async function computeRoutes(days, cityId) {
    const BM = window.RailGoBaidu;
    if (!BM || typeof BM.localRoute !== 'function') return days;
    for (const dp of days) {
      for (let i = 0; i < dp.spots.length - 1; i++) {
        if (dp.routes[i]) continue; // 已有结果不重复请求
        try {
          dp.routes[i] = await BM.localRoute('walking', dp.spots[i], dp.spots[i + 1], { cityId: cityId });
        } catch (e) {
          dp.routes[i] = { from: dp.spots[i], to: dp.spots[i + 1], mode: 'walking', distanceM: null, durationS: null, source: 'mock', est: true, status: 'failed', errorCode: 'EXCEPTION', path: null };
        }
      }
    }
    return days;
  }

  /* 距离/时间格式化(项目内唯一实现) */
  function fmtDist(m) {
    if (typeof m !== 'number' || !isFinite(m)) return '—';
    return m < 1000 ? Math.round(m) + ' 米' : (Math.round(m / 100) / 10) + ' 公里';
  }
  function fmtDur(s) {
    if (typeof s !== 'number' || !isFinite(s)) return '—';
    const min = Math.round(s / 60);
    if (min < 60) return min + ' 分钟';
    const h = Math.floor(min / 60), m2 = min % 60;
    return h + ' 小时' + (m2 ? ' ' + m2 + ' 分钟' : '');
  }

  /* 路线小节 HTML: 真实(百度地图) vs 估算(预计)明确区分, 不混淆 */
  function routeLineHTML(r) {
    if (!r || r.status === 'failed') {
      return '<div class="route-line failed">🚶 步行 · 路线暂不可用</div>';
    }
    const tag = r.source === 'baidu'
      ? '<span class="badge ok">百度地图</span>'
      : '<span class="badge mock">预计</span>';
    return '<div class="route-line">🚶 步行 · 约 ' + fmtDur(r.durationS) + ' · ' + fmtDist(r.distanceM) + ' ' + tag + '</div>';
  }

  /* DayPlan[] → HTML(纯渲染, 不含任何网络请求) */
  function buildDayPlanHTML(days, isReal) {
    let html = '';
    days.forEach(dp => {
      html += '<div class="day-card"><h4>Day ' + dp.day +
        (isReal ? ' <span class="badge ok">百度地图</span>' : '') + '</h4><div class="step-line">';
      let t = 9;
      dp.spots.forEach((s, i) => {
        html += '<div><span class="time">' + (t < 12 ? '0' + t : t) + ':00</span> <b>' + esc(s.name) + '</b> <span class="trans">' +
          (isReal ? '预计游玩 2 h' : '游玩 ' + (s.visitMinutes ? Math.round(s.visitMinutes / 60 * 10) / 10 + ' h' : '—')) + '</span></div>';
        t = Math.min(20, t + 3);
        if (i < dp.spots.length - 1) {
          html += routeLineHTML(dp.routes[i]);
          t = Math.min(20, t + 1);
        }
      });
      html += '<div><span class="time">18:00</span> 晚餐 → 返回住宿区域</div></div></div>';
    });
    return html;
  }

  /* 按 DayPlan 渲染当前城市行程(渲染入口, 供 applyPoiToPlan / 路线回来后调用) */
  function renderCityPlan(days, isReal) {
    const box = $('cityPlanBox');
    if (!box) return;
    box.innerHTML = buildDayPlanHTML(days, isReal);
    if (isReal && days.length) {
      const extra = '<div class="info-panel"><h4>🗺️ 景点（百度地图）</h4>' +
        days.reduce((a, d) => a.concat(d.spots), []).map(a =>
          '<div class="it">· ' + esc(a.name) + ' <small>' + esc(a.address || '') + '</small></div>').join('') +
        '<div class="hint">名称/地址来自百度地图；游玩时长与步行时间为预计，开放时间与票价以官方为准。</div></div>';
      box.innerHTML += extra;
    }
  }

  /* 阶段5.2: mock 版行程(真实 POI 不可用时的回退, 与原行为一致) */
  function buildMockPlanHTML(plan, ats) {
    let html = '';
    (plan.dayPlan || []).forEach((d, di) => {
      html += '<div class="day-card"><h4>Day ' + (di + 1) + '</h4><div class="step-line">';
      let t = 9;
      d.spots.forEach(s => {
        html += '<div><span class="time">' + (t < 12 ? '0' + t : t) + ':00</span> <b>' + s.name + '</b> <span class="trans">游玩 ' + Math.round(s.visitMinutes / 60 * 10) / 10 + ' h</span>' + (s.ticket ? ' · 门票 ¥' + s.ticket : '') + '</div>';
        t = Math.min(20, t + Math.ceil(s.visitMinutes / 60) + 1);
        html += '<div><span class="time">' + t + ':00</span> <span class="trans">🚌 城市交通 / 🚶 步行 约 40 min【模拟】</span></div>';
        t = Math.min(20, t + 1);
      });
      html += '<div><span class="time">18:00</span> 晚餐 → 返回住宿区域</div></div></div>';
    });
    if (ats.length) {
      html += '<div class="info-panel"><h4>🗺️ 核心景点</h4>' +
        ats.slice(0, 4).map(a => '<div class="it">· ' + a.name + ' <small>游玩 ' + Math.round(a.visitMinutes / 60 * 10) / 10 + ' h · 价值 ' + a.value + (a.ticket ? ' · 门票 ¥' + a.ticket : ' · 免费') + '</small></div>').join('') + '</div>';
    }
    return html;
  }

  /* 把 POI 结果应用到行程区: 真实结果 → DayPlan(+路线) → 渲染; 否则回退 mock 行程 */
  let cityPlanSeq = 0;
  async function applyPoiToPlan(r) {
    const box = $('cityPlanBox');
    if (!box || !state.poiCity) return;
    const list = (r && r.data) || [];
    const isReal = !!(r && r.source === 'baidu' && list.length);
    if (!isReal) {
      box.innerHTML = state.mockPlanHTML || box.innerHTML;
      state.planSource = 'mock';
      setDetailTitle(false);
      return;
    }
    // 1) 数据准备(顺序不重排)
    const cityId = state.poiCity.id;
    const days = buildDayPlans(list);
    state.dayPlans = days;
    state.planSource = 'baidu';
    setDetailTitle(true);
    // 2) 先渲染(路线占位), 再异步计算路线后重渲染 —— 渲染不触发请求
    renderCityPlan(days, true);
    const mySeq = ++cityPlanSeq;
    const BM = window.RailGoBaiduMap;
    if (BM && BM.getMap && BM.getMap()) BM.clearRouteOverlays(); // 清旧城路线
    await computeRoutes(days, cityId);                            // 串行, 自带缓存/竞态(6.1)
    // 3) 城市级竞态: 旧城市的路线结果不得渲染到当前城市
    if (mySeq !== cityPlanSeq) return;
    if (!state.poiCity || state.poiCity.id !== cityId) return;
    renderCityPlan(days, true);
    // 4) 地图: 第三组 overlay(真机 path / mock 直线)
    if (BM && BM.addRouteOverlays && BM.getMap && BM.getMap()) {
      const segs = [];
      days.forEach(dp => dp.routes.forEach(x => { if (x && x.status !== 'failed') segs.push(x); }));
      BM.addRouteOverlays(segs);
      if (segs.length) BM.fitPoiView(segs.map(s => ({ lat: s.from.lat, lng: s.from.lng })).concat(days[days.length - 1].spots));
    }
  }

  function setDetailTitle(isReal) {
    const t = $('detailTitle');
    if (!t || !state.poiCity) return;
    t.innerHTML = '📍 ' + esc(state.poiCity.name) + ' · 游玩规划 ' +
      (isReal ? '<span class="badge ok">百度地图</span><span class="badge mock">时长为预计</span>' : '<span class="badge mock">模拟</span>');
  }

  function showCity(cityId) {
    const c = C.cityById(cityId);
    if (!c) return;
    $('detailSection').hidden = false;
    $('detailTitle').innerHTML = '📍 ' + c.name + ' · 游玩规划 <span class="badge mock">模拟</span>';
    const ats = M.ATTRACTIONS.filter(a => a.cityId === cityId);
    const stay = (M.STAY.filter(s => s.cityId === cityId).sort((a, b) => b.score - a.score))[0];
    const foods = M.FOOD.filter(f => f.cityId === cityId);
    const plan = C.planCity(cityId, 2, 300);
    state.mockPlanHTML = buildMockPlanHTML(plan, ats); // 5.2: 缓存 mock 版, 真实 POI 不可用时回退
    let html = '<div class="day-card"><h4>🚉 到达车站</h4><div class="it">' + c.name + ' 站（高铁/普速同城，模拟）</div>' +
      (stay ? '<div class="stay-rec">🏨 推荐住宿区域：<b>' + stay.name + '</b>（便利度 ' + stay.score + '）— ' + stay.note + '</div>' : '') + '</div>' +
      '<div id="cityPlanBox">' + state.mockPlanHTML + '</div>';
    if (foods.length) {
      html += '<div class="food-rec"><h4 style="font-size:13px">🍜 附近餐饮（演示数据，无评分/人均）</h4>' +
        foods.map(f => '<span class="item">' + f.name + ' · ' + f.type + ' · 距站 ' + f.kmFromStation + ' km · ' + f.priceNote + '</span>').join('') +
        '<div class="hint">接入百度 POI 后显示真实名称/坐标/分类；评分与人均以官方实际返回为准。</div></div>';
    }
    $('detailBody').innerHTML = html;
    // 阶段5: 载入该城 POI(景点默认分类), 与地图 Marker 同步
    state.poiCity = { id: cityId, name: c.name };
    state.poiCat = state.poiCat || 'attraction';
    bindPoiTabs();
    loadPoi(cityId, c.name, state.poiCat, true);
    $('detailSection').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------- 阶段7.2: 旅行偏好 → TravelPreference ---------- */
  function currentPreference() {
    try { return C.paceToPreference(state.pace, state.pref); }
    catch (e) { return C.normalizePreference(null); }   // 异常回落大众默认
  }

  function bindPreferenceControls() {
    const chips = $('prefChips');
    if (chips && !chips._bound) {
      chips._bound = true;
      chips.querySelectorAll('[data-pref]').forEach(el => el.addEventListener('click', () => {
        chips.querySelectorAll('[data-pref]').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        state.pref = el.dataset.pref;
        replanAfterPrefChange();
      }));
    }
    const pace = $('inPace');
    if (pace && !pace._bound) {
      pace._bound = true;
      const onPace = () => {
        const pv = Number(pace.value);            // 注意: 不能用 x || 50, 滑块 0 是合法值(会因 falsy 被误回退)
        state.pace = Math.max(0, Math.min(1, (isFinite(pv) ? pv : 50) / 100));
        const lab = $('paceValue'); if (lab) lab.textContent = pace.value;
        replanAfterPrefChange();
      };
      pace.addEventListener('input', onPace);
      pace.addEventListener('change', onPace);
    }
  }

  /* 偏好变化: 重算沿途价值(若已有规划结果), 不重置用户输入、不发任何网络请求 */
  function replanAfterPrefChange() {
    state.candidates = state.candidates || [];
    if (!state.candidates.length) return;
    const c = state.candidates[state.active];
    if (!c) return;
    // 偏好变化只影响价值评估, 不应影响主流程: 单点失败不阻断页面
    try {
      maybeSuggestStop(c.cities[0], c.cities, +$('inDays').value, +$('inBudget').value);
      const st = resolveCity($('inStart').value);
      if (st) renderDestination(st.id, c, +$('inDays').value, +$('inBudget').value);
    } catch (e) {
      if (window.console && console.warn) console.warn('[RailGo] 偏好重算失败:', e && e.message);
    }
  }

  /* ---------- 阶段5: POI 列表 + Marker 同步 ---------- */
  let poiReqSeq = 0;
  function bindPoiTabs() {
    const tabs = $('poiTabs');
    if (!tabs || tabs._bound) return;
    tabs._bound = true;
    tabs.querySelectorAll('[data-cat]').forEach(el => el.addEventListener('click', () => {
      tabs.querySelectorAll('[data-cat]').forEach(x => x.classList.remove('on'));
      el.classList.add('on');
      state.poiCat = el.dataset.cat;
      if (state.poiCity) loadPoi(state.poiCity.id, state.poiCity.name, state.poiCat, true);
    }));
    if (state.poiCat) {
      tabs.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x.dataset.cat === state.poiCat));
    }
  }

  async function loadPoi(cityId, cityName, category, fitView) {
    const box = $('poiBox');
    if (!box) return;
    const myReq = ++poiReqSeq;
    box.innerHTML = '<div class="poi-loading">正在获取' + (BAIDU.POI_CATEGORIES[category] || {}).label + '…</div>';
    let r;
    try {
      r = await BAIDU.searchPoi(cityName, category);
    } catch (e) {
      if (myReq === poiReqSeq) box.innerHTML = '<div class="poi-empty">网络异常，请稍后重试</div>';
      return;
    }
    // 竞态: 旧请求晚返回 → 丢弃, 不覆盖新结果
    if (myReq !== poiReqSeq || r.superseded) return;
    if (state.poiCity && state.poiCity.id !== cityId) return; // 城市已切换
    const list = (r && r.data) || [];
    if (!r || !r.ok) {
      box.innerHTML = '<div class="poi-empty">' + esc((r && r.message) || '地点信息暂时无法获取') + '</div>';
      return;
    }
    if (!list.length) { box.innerHTML = '<div class="poi-empty">暂未找到相关地点</div>'; return; }
    // 阶段5.2: 景点分类的真实 POI 同时驱动本城行程(Day/景点列表) —— POI 融入旅行方案
    if (category === 'attraction') {
      // 异步路线流程: 捕获异常, 避免未处理的 Promise 拒绝(行程已先行渲染, 失败不影响页面)
      Promise.resolve(applyPoiToPlan(r)).catch(() => {});
    }
    const label = (BAIDU.POI_CATEGORIES[category] || {}).label || category;
    const srcTag = r.source === 'baidu' ? '<span class="badge ok">百度地图</span>' : '<span class="badge mock">演示数据</span>';
    let html = '<div class="hint" style="margin-bottom:6px">' + cityName + ' · ' + label + ' ' + list.length + ' 项 ' + srcTag +
      (r.stale && r.message ? '　<span style="color:var(--warn)">' + esc(r.message) + '</span>' : '') + '</div>';
    list.forEach((p, i) => {
      html += '<div class="poi-item" data-i="' + i + '">' +
        '<b>' + esc(p.name) + '</b>' +
        '<div class="poi-meta">' + esc(p.address || '') + (p.telephone ? ' · ' + esc(p.telephone) : '') + '</div>' +
        '</div>';
    });
    box.innerHTML = html;
    // 列表 ↔ Marker 同步: 点击列表项定位
    box.querySelectorAll('.poi-item').forEach(el => el.addEventListener('click', () => {
      const p = list[+el.dataset.i];
      box.querySelectorAll('.poi-item').forEach(x => x.classList.remove('on'));
      el.classList.add('on');
      const BM = window.RailGoBaiduMap;
      if (BM && BM.panToPoi) BM.panToPoi(p);
    }));
    // 地图 Marker(与铁路层隔离); 首次展示该城 POI 时适应视野
    const BM = window.RailGoBaiduMap;
    if (BM && BM.getMap && BM.getMap()) {
      BM.addPoiMarkers(list, {});
      if (fitView) BM.fitPoiView(list);
    } else {
      // 无百度地图(演示模式) → 用 SVG 叠加简示
      renderPoiOnSvg(list);
    }
  }

  /* 演示模式(SVG)下的 POI 点位简示 */
  function renderPoiOnSvg(list) {
    const svg = $('mapSvg');
    if (!svg) return;
    svg.querySelectorAll('.poi-dot').forEach(n => n.remove());
    const pts = list.filter(p => typeof p.lat === 'number');
    if (!pts.length) return;
    const lats = pts.map(p => p.lat), lons = pts.map(p => p.lng);
    const minLat = Math.min.apply(null, lats) - 0.02, maxLat = Math.max.apply(null, lats) + 0.02;
    const minLon = Math.min.apply(null, lons) - 0.03, maxLon = Math.max.apply(null, lons) + 0.03;
    const px = lon => (lon - minLon) / (maxLon - minLon) * 800 + 100;
    const py = lat => (maxLat - lat) / (maxLat - minLat) * 240 + 50;
    let g = '';
    pts.forEach(p => { g += '<circle class="poi-dot" cx="' + px(p.lng) + '" cy="' + py(p.lat) + '" r="5" fill="#d97706"><title>' + esc(p.name) + '</title></circle>'; });
    svg.insertAdjacentHTML('beforeend', g);
  }

  function renderBudget(bud, budget) {
    $('budgetCard').hidden = false;
    const over = bud.total - budget;
    $('budgetBox').innerHTML =
      '<div class="metrics" style="display:flex;flex-wrap:wrap;gap:10px">' +
      ['铁路 ¥' + bud.rail, '住宿 ¥' + bud.hotel, '餐饮 ¥' + bud.food, '景点 ¥' + bud.attraction, '市内 ¥' + bud.localTransport, '合计 ¥' + bud.total].map(x => '<span style="background:#f4f5fa;border-radius:8px;padding:4px 10px;font-size:13px">' + x + '</span>').join('') +
      '</div>' +
      (over > 0 ? '<div class="verdict tight" style="margin-top:10px">⚠ 超预算 ¥' + over + '，可切换「💰 省钱优先」方案或使用自动调整。</div>' : '<div class="verdict ok" style="margin-top:10px">✓ 预算内可行。</div>');
  }

  /* ---------- 中途城市推荐 ---------- */
  function maybeSuggestStop(startId, route, days, budget) {
    const box = $('stopBox');
    box.innerHTML = '';
    if (!state.stopSuggest) return;
    const endId = route[route.length - 1];
    if (endId === startId || route.length > 3) return;
    const sug = C.suggestStop(startId, endId, days, { budget: budget, preference: currentPreference() });
    if (!sug.suggestable) {
      box.innerHTML = '<div class="stop-card">💡 ' + sug.reason + '</div>';
      return;
    }
    // 阶段7.2: 展示 Value Engine 的判断(值得去程度 + 成本明细 + 理由), 而非旧"推荐指数"
    const REC_TXT = { high: '强烈推荐', medium: '值得考虑', low: '慎重考虑', avoid: '不建议' };
    const recCls = { high: 'ok', medium: '', low: 'warn', avoid: 'warn' };
    const pref = currentPreference();
    let html = '<div class="stop-card" style="background:#eef4ff;border-color:#bcd4ff">💡 在当前行程下，发现 ' +
      sug.candidates.length + ' 个值得考虑的中途停留城市：' +
      '<span class="hint">（偏好：' + esc(pref.profile) + ' · 节奏 ' + Math.round(state.pace * 100) + '）</span></div>';
    sug.candidates.forEach(cd => {
      const e = cd.tripEvaluation || {};
      // 阶段7.5: 文案统一由 Core 提供(reasonCodes 仅用于分类, 不在 UI 重新定义文案)
      // 优先用候选顶层 reasons(suggestStop 已提升), 回退到 tripEvaluation.reasons
      const codes = e.reasonCodes || [];
      const texts = (cd.reasons && cd.reasons.length ? cd.reasons : e.reasons) || [];
      const reasonMap = {};
      codes.forEach((k, i) => { reasonMap[k] = texts[i] || k; });
      const pos = codes.filter(k => /HIGH_EXPERIENCE|UNIQUENESS|REPRESENTATIVENESS|ON_ROUTE|LOW_TIME_COST|LOW_BUDGET_COST/.test(k));
      const neg = codes.filter(k => /LOW_EXPERIENCE|HIGH_TIME_COST|HIGH_BUDGET_COST|HIGH_FATIGUE|HIGH_OPPORTUNITY_COST|MANY_TRANSFERS|HIGH_DETOUR/.test(k));
      html += '<div class="stop-card">' +
        '<span class="tt">📍 ' + esc(cd.name) + '</span> ' +
        '<span class="badge ' + (recCls[cd.recommendation] || '') + '">值得去 ' + cd.score + ' · ' + (REC_TXT[cd.recommendation] || cd.recommendation) + '</span>' +
        '<div class="row-m">' +
        '<span>建议停留 ' + cd.stopDays + ' 天</span>' +
        '<span>增加时间 约 ' + (e.timeCostHours != null ? e.timeCostHours : '—') + ' h</span>' +
        '<span>增加预算 约 ¥' + (e.addedFare != null ? e.addedFare : cd.addFare) + '【模拟】</span>' +
        '<span>换乘 ' + (e.transfers != null ? e.transfers : '—') + ' 次</span>' +
        '<span>铁路绕行 ' + (cd.detour <= 60 ? '低' : cd.detour <= 150 ? '中' : '高') + '（+' + cd.detour + ' km）</span>' +
        '</div>' +
        (pos.length ? '<div class="reason-line pos">✓ ' + pos.map(k => reasonMap[k]).join(' · ') + '</div>' : '') +
        (neg.length ? '<div class="reason-line neg">⚠ ' + neg.map(k => reasonMap[k]).join(' · ') + '</div>' : '') +
        '<button class="btn small ghost" data-add="' + cd.cityId + '" style="margin-top:8px">加入 ' + esc(cd.name) + ' 并重新规划</button>' +
        '</div>';
    });
    html += '<button class="btn small ghost" id="btnNoStop">暂不增加</button>';
    box.innerHTML = html;
    box.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.add;
      if (!state.dests.find(d => d.id === id)) { const c = C.cityById(id); state.dests.unshift({ id: c.id, name: c.name }); renderChips(); }
      plan();
    }));
    const no = $('btnNoStop');
    if (no) no.addEventListener('click', () => { state.stopSuggest = false; box.innerHTML = '<div class="stop-card">已选择不增加中途城市。</div>'; });
  }

  /* ---------- 地图: 有 AK 走百度 JSAPI, 否则/失败回退 SVG 演示 ---------- */
  async function renderMap(route) {
    const BM = window.RailGoBaiduMap;
    const hasAk = BM && BM.isAvailable();
    if (hasAk) {
      const center = { lat: C.cityById(route[0]).lat, lon: C.cityById(route[0]).lon, zoom: 6 };
      const r = await BM.initMap('baiduMap', center);
      if (r.ok) {
        $('baiduMap').hidden = false;
        $('mapSvg').hidden = true;
        const ph = $('mapPlaceholder'); if (ph) ph.hidden = true;
        try { drawRouteOnBaidu(BM, route); } catch (e) { /* 绘制异常不影响底图 */ }
        $('mapNote').textContent = '百度地图 JSAPI 已加载（' + (r.ns === window.BMapGL ? 'GL' : '经典 4.0') + '）。线路为 RailGo 规划的旅行路线示意，非铁路轨道轨迹。';
        return;
      }
      // 失败 → 回退 SVG, 并说明原因(不含 AK)
      $('mapNote').innerHTML = '<span style="color:var(--warn)">百度地图不可用（' + esc(r.message || r.code) + '），已切换演示地图模式。</span>';
      $('baiduMap').hidden = true;
    }
    renderSvgMap(route);
  }

  /* 在百度地图上绘制 RailGo 规划结果: 仅调用地图层, 不含地图 API 细节
   * 坐标经 baidu-api 坐标层统一转换(WGS84→BD09), 本地完成不请求 API */
  async function drawRouteOnBaidu(BM, route) {
    const raw = route.map((id, i) => {
      const c = C.cityById(id);
      if (!c || typeof c.lat !== 'number') return null; // 缺坐标优雅跳过
      return { id: c.id, name: c.name, lat: c.lat, lon: c.lon, role: i === 0 ? 'start' : (i === route.length - 1 ? 'end' : 'mid') };
    }).filter(Boolean);
    // 统一坐标转换(唯一入口); 失败时回退原坐标, 不中断
    let coords = raw;
    try {
      const bd = await BAIDU.resolveCityCoords(raw);
      if (bd && bd.length) {
        const map = {};
        bd.forEach(b => { map[b.id] = b; });
        coords = raw.map(r => (map[r.id] ? { id: r.id, name: r.name, lat: map[r.id].lat, lon: map[r.id].lng, role: r.role } : r));
      }
    } catch (e) { /* 转换失败保留原坐标 */ }
    BM.clearOverlays();                 // 清旧 Marker/Polyline(含旧 POI/旧路线), 防叠加
    BM.addMarkers(coords);
    BM.drawPolyline(coords);            // 旅行路线示意(非铁路轨道)
    BM.fitView(coords);                 // 自动视野
    state.dayPlans = [];                // 6.2: 方案切换后旧 DayPlan 失效
    // 方案切换后重建 POI: 城市仍在路线中→重载(列表与 Marker 保持同步); 否则清空
    const pc = state.poiCity;
    if (pc) {
      if (coords.some(c => c.id === pc.id)) loadPoi(pc.id, pc.name, state.poiCat, false);
      else { state.poiCity = null; const pb = $('poiBox'); if (pb) pb.innerHTML = ''; }
    }
  }

  /* SVG 演示地图(保留为 fallback) */
  function renderSvgMap(route) {
    $('mapSvg').hidden = false;
    const svg = $('mapSvg');
    const W = 1000, H = 340;
    let ns = '', edges = '';
    const pos = {};
    const lats = route.map(id => C.cityById(id).lat), lons = route.map(id => C.cityById(id).lon);
    const minLat = Math.min.apply(null, lats) - 0.5, maxLat = Math.max.apply(null, lats) + 0.5;
    const minLon = Math.min.apply(null, lons) - 0.6, maxLon = Math.max.apply(null, lons) + 0.6;
    const px = lon => (lon - minLon) / (maxLon - minLon) * (W - 160) + 80;
    const py = lat => (maxLat - lat) / (maxLat - minLat) * (H - 120) + 50;
    route.forEach(id => { const c = C.cityById(id); pos[id] = [px(c.lon), py(c.lat)]; });
    for (let i = 0; i < route.length - 1; i++) {
      const a = pos[route[i]], b = pos[route[i + 1]];
      edges += '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="#5b8def" stroke-width="3" stroke-dasharray="8 5"/>';
    }
    route.forEach((id, i) => {
      const c = C.cityById(id);
      ns += '<g><circle cx="' + pos[id][0] + '" cy="' + pos[id][1] + '" r="' + (i === 0 ? 13 : 10) + '" fill="' + (i === 0 ? '#1a1f2e' : '#3a5bd9') + '"/><text x="' + pos[id][0] + '" y="' + (pos[id][1] + (i === 0 ? -20 : 26)) + '" text-anchor="middle" font-size="15" font-weight="700">' + c.name + '</text></g>';
    });
    svg.innerHTML = edges + ns;
    const ak = BAIDU.getAK();
    $('mapNote').textContent = ak
      ? '百度地图 AK 已配置：可启用真实地图（坐标注意 WGS84→BD09 转换）。'
      : '百度地图 API 未配置 → 当前为演示地图模式（SVG 示意）。配置 AK 后升级为真实地图。';
  }

  /* ---------- API 设置 ---------- */
  function initAk() {
    const ak = BAIDU.getAK();
    $('inAk').value = ak;
    $('akState').textContent = ak ? '✓ 已配置（' + ak.slice(0, 4) + '…）' : '未配置 → 演示模式';
    $('btnSaveAk').addEventListener('click', () => {
      const v = $('inAk').value.trim();
      try { localStorage.setItem('RAILGO_BAIDU_AK', v); } catch (e) {}
      $('akState').textContent = v ? '✓ 已保存' : '已清除';
      planIfReady();
    });
    $('btnClearAk').addEventListener('click', () => {
      try { localStorage.removeItem('RAILGO_BAIDU_AK'); } catch (e) {}
      $('inAk').value = ''; $('akState').textContent = '未配置 → 演示模式';
      planIfReady();
    });
  }
  let plannedOnce = false;
  function planIfReady() { if (plannedOnce) plan(); }

  /* ---------- 演示场景 ---------- */
  function demos() {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = '<h2>🧪 演示场景（一键载入）</h2><div class="chip-row" id="demoRow"></div>';
    document.querySelector('main').insertBefore(wrap, $('detailSection'));
    const items = [
      ['Demo1 石→杭 3天¥1000', ['杭州'], 3, 1000],
      ['Demo2 按序 济→宁→沪 5天¥1500', ['济南', '南京', '上海'], 5, 1500],
      ['Demo3 智能 4 城 6天¥1800', ['济南', '南京', '上海', '杭州'], 6, 1800],
      ['Demo4 中途推荐 石→沪 5天', ['上海'], 5, 1600],
      ['Demo5 时间不足 3天4城', ['济南', '南京', '上海', '杭州'], 3, 1500],
      ['Demo6 预算不足 ¥800', ['济南', '南京', '上海', '杭州'], 5, 800],
      ['Demo8 济南2天', ['济南'], 4, 800],
    ];
    items.forEach(it => {
      const b = document.createElement('button');
      b.className = 'btn small ghost';
      b.textContent = it[0];
      b.addEventListener('click', () => {
        $('inDays').value = it[2]; $('inBudget').value = it[3];
        state.dests = it[1].map(n => { const c = resolveCity(n); return { id: c.id, name: c.name }; });
        state.mode = it[0].indexOf('按序') >= 0 ? 'user' : 'smart';
        document.querySelectorAll('.seg').forEach(s => s.classList.remove('on'));
        $(state.mode === 'user' ? 'segUser' : 'segSmart').classList.add('on');
        renderChips();
        if (it[0].indexOf('Demo4') >= 0) state.stopSuggest = true;
        plan();
      });
      wrap.querySelector('#demoRow').appendChild(b);
    });
  }

  /* ---------- 绑定 ---------- */
  function bind() {
    $('btnAddDest').addEventListener('click', () => {
      const v = $('inDest').value.trim();
      const c = resolveCity(v);
      if (!c) { alert('城市未收录（演示支持: ' + M.CITIES.map(x => x.name).join('/') + '）'); return; }
      if (state.dests.find(d => d.id === c.id)) { alert('该城市已在列表中'); return; }
      const s = resolveCity($('inStart').value);
      if (s && s.id === c.id) { alert('目的地不能与起点相同'); return; }
      state.dests.push({ id: c.id, name: c.name });
      $('inDest').value = '';
      renderChips();
    });
    $('btnOptimize').addEventListener('click', () => {
      const st = resolveCity($('inStart').value);
      const days = +$('inDays').value, budget = +$('inBudget').value;
      if (!st) return;
      const box = $('optBox');
      if (!box) return;
      const startId = st.id;
      const endId = state.dests.length ? state.dests[state.dests.length - 1].id : startId;
      const cands = state.dests.map(d => d.id).filter(id => id !== startId && id !== endId);
      if (!cands.length) { box.innerHTML = '<div class="reason-line">未提供候选目的地</div>'; return; }
      const r = C.optimizeStopSelection(startId, endId, days, budget, cands, currentPreference());
      const lines = [];
      lines.push('<div class="dest-card"><div class="dt">⚡ 智能筛选结果 <span class="badge mock">推荐加入</span></div><div class="dmeta">');
      lines.push('<span>候选: ' + cands.length + ' 个</span><span>推荐: ' + r.selected.length + ' 个</span><span>剩余: ' + r.remainingDays + ' 天 / ¥' + r.remainingBudget + '</span></div>');
      if (!r.selected.length) {
        lines.push('<div class="reason-line neg">当前天数/预算不足以增加中途站点</div>');
      } else {
        // 阶段7.7: 文案统一由 Core 提供; 展示全部 reasons(此前只取 reasons[0], 其余被丢弃)
        // reasonCodes 仅用于 ✓/⚠ 分类, 不在 UI 重新定义文案
        r.selected.forEach(x => {
          const name = C.cityById(x.id)?.name || x.id;
          const codes = x.reasonCodes || [];
          const texts = x.reasons || [];
          const reasonMap = {};
          codes.forEach((k, i) => { reasonMap[k] = texts[i] || k; });
          const pos = codes.filter(k => /HIGH_EXPERIENCE|UNIQUENESS|REPRESENTATIVENESS|ON_ROUTE|LOW_TIME_COST|LOW_BUDGET_COST/.test(k));
          const neg = codes.filter(k => /LOW_EXPERIENCE|HIGH_TIME_COST|HIGH_BUDGET_COST|HIGH_FATIGUE|HIGH_OPPORTUNITY_COST|MANY_TRANSFERS|HIGH_DETOUR/.test(k));
          lines.push('<div class="reason-line pos">✓ ' + esc(name) + ' · 价值 ' + x.score +
            (pos.length ? ' · ' + pos.map(k => reasonMap[k]).join(' · ') : '') + '</div>');
          if (neg.length) lines.push('<div class="reason-line neg">⚠ ' + neg.map(k => reasonMap[k]).join(' · ') + '</div>');
        });
      }
      if (r.rejected.length) {
        lines.push('<div class="reason-line neg">未入选: ' + r.rejected.map(x => C.cityById(x.id)?.name || x.id).join('、') + '</div>');
      }
      lines.push('</div>');
      box.innerHTML = lines.join('');
    });
    $('inDest').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAddDest').click(); });
    $('btnPlan').addEventListener('click', plan);
    bindSeg('segUser', 'user'); bindSeg('segSmart', 'smart');
    $('inSuggestStop').addEventListener('change', e => { state.stopSuggest = e.target.checked; });
  }

  function init() {
    fillCityList(); renderChips(); bind(); bindPreferenceControls(); initAk(); demos();
    $('inStart').value = '石家庄';
    state.dests = [{ id: 'sh', name: '上海' }];
    $('inDays').value = 5; $('inBudget').value = 1600;
    renderChips();
    plan(); plannedOnce = true;
  }
  init();
})();