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

  let state = { dests: [], mode: 'smart', pref: 'play', stopSuggest: true, candidates: [], active: 0 };

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
  function renderActive(start, days, budget) {
    const c = state.candidates[state.active];
    if (!c) return;
    renderSum(c, budget);
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
  function showCity(cityId) {
    const c = C.cityById(cityId);
    if (!c) return;
    $('detailSection').hidden = false;
    $('detailTitle').innerHTML = '📍 ' + c.name + ' · 游玩规划 <span class="badge mock">模拟</span>';
    const ats = M.ATTRACTIONS.filter(a => a.cityId === cityId);
    const stay = (M.STAY.filter(s => s.cityId === cityId).sort((a, b) => b.score - a.score))[0];
    const foods = M.FOOD.filter(f => f.cityId === cityId);
    const plan = C.planCity(cityId, 2, 300);
    let html = '<div class="day-card"><h4>🚉 到达车站</h4><div class="it">' + c.name + ' 站（高铁/普速同城，模拟）</div>' +
      (stay ? '<div class="stay-rec">🏨 推荐住宿区域：<b>' + stay.name + '</b>（便利度 ' + stay.score + '）— ' + stay.note + '</div>' : '') + '</div>';
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
    if (foods.length) {
      html += '<div class="food-rec"><h4 style="font-size:13px">🍜 附近餐饮（演示数据，无评分/人均）</h4>' +
        foods.map(f => '<span class="item">' + f.name + ' · ' + f.type + ' · 距站 ' + f.kmFromStation + ' km · ' + f.priceNote + '</span>').join('') +
        '<div class="hint">接入百度 POI 后显示真实名称/坐标/分类；评分与人均以官方实际返回为准。</div></div>';
    }
    $('detailBody').innerHTML = html;
    $('detailSection').scrollIntoView({ behavior: 'smooth' });
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
    const sug = C.suggestStop(startId, endId, days);
    if (!sug.suggestable) {
      box.innerHTML = '<div class="stop-card">💡 ' + sug.reason + '</div>';
      return;
    }
    let html = '<div class="stop-card" style="background:#eef4ff;border-color:#bcd4ff">💡 你的行程时间较充裕，发现 ' + sug.candidates.length + ' 个适合中途停留的城市：</div>';
    sug.candidates.forEach(cd => {
      html += '<div class="stop-card">' +
        '<span class="tt">📍 ' + cd.name + '</span> <span class="badge">推荐指数 ' + cd.score + '</span>' +
        '<div class="row-m">' +
        '<span>建议停留 ' + cd.stopDays + ' 天</span>' +
        '<span>铁路绕行：' + (cd.detour <= 60 ? '低' : cd.detour <= 150 ? '中' : '高') + '（+' + cd.detour + ' km）</span>' +
        '<span>旅游价值：' + (cd.value >= 20 ? '高' : '中高') + '</span>' +
        '<span>预算影响：+¥' + cd.addFare + '【模拟】</span>' +
        '</div>' +
        '<button class="btn small ghost" data-add="' + cd.cityId + '" style="margin-top:8px">加入 ' + cd.name + ' 并重新规划</button>' +
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
    BM.clearOverlays();                 // 清旧 Marker/Polyline, 防叠加
    BM.addMarkers(coords);
    BM.drawPolyline(coords);            // 旅行路线示意(非铁路轨道)
    BM.fitView(coords);                 // 自动视野
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
    $('inDest').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAddDest').click(); });
    $('btnPlan').addEventListener('click', plan);
    bindSeg('segUser', 'user'); bindSeg('segSmart', 'smart');
    $('inSuggestStop').addEventListener('change', e => { state.stopSuggest = e.target.checked; });
  }

  function init() {
    fillCityList(); renderChips(); bind(); initAk(); demos();
    $('inStart').value = '石家庄';
    state.dests = [{ id: 'sh', name: '上海' }];
    $('inDays').value = 5; $('inBudget').value = 1600;
    renderChips();
    plan(); plannedOnce = true;
  }
  init();
})();