/* RailGo 页面交互 — 规划、时间轴、中途推荐、城市详情、预算、演示地图 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {}; // jsdom 测试垫片, 浏览器原生有
  }
  const M = window.RailGoMock, C = window.RailGoCore, BAIDU = window.RailGoBaidu;

  let state = { dests: [], mode: 'smart', pref: 'play', stopSuggest: true };

  /* ---------- 城市解析 ---------- */
  function resolveCity(q) {
    if (!q) return null;
    return C.cityByName(String(q).trim()) || null;
  }

  /* ---------- 渲染 datalist / 起点标签 ---------- */
  function fillCityList() {
    const dl = $('cityList');
    dl.innerHTML = M.CITIES.map(c => '<option value="' + c.name + '">').join('');
  }

  /* ---------- 目的地 chips ---------- */
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

  /* ---------- 模式/偏好 ---------- */
  function bindSeg(id, val) {
    const el = $(id);
    el.addEventListener('click', () => {
      document.querySelectorAll('.seg').forEach(s => s.classList.remove('on'));
      el.classList.add('on');
      state.mode = val;
      $('lockHint').textContent = val === 'user' ? '将严格按你添加的顺序执行，不做跨城重排。' : '将自动寻找评分最高的城市顺序。';
    });
  }

  /* ---------- 核心: 开始规划 ---------- */
  function plan() {
    const start = resolveCity($('inStart').value);
    if (!start) { alert('起点城市未收录（演示仅支持: ' + M.CITIES.map(c => c.name).join('/') + '）'); return; }
    if (!state.dests.length) { alert('请先添加至少一个目的地'); return; }
    const days = +$('inDays').value, budget = +$('inBudget').value;
    const destIds = state.dests.map(d => d.id);
    const res = C.planRoute(start.id, destIds, days, budget, state.mode);
    const feasible = C.timeFeasible(res.route, days);

    // 超预算自动提示
    const bud = C.estimateBudget(res.route, { days, budget });
    renderSum(start, res, feasible, bud, budget, days);
    renderVerdict(res, feasible, bud, budget, days);
    renderTimeline(start, res.route, days);
    renderMap(start, res.route);
    renderBudget(bud, budget);
    maybeSuggestStop(start.id, res.route, days, budget);
    $('resSection').hidden = false;
    $('resSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderSum(start, res, feasible, bud, budget, days) {
    const d = res.detail;
    const names = res.route.map(id => C.cityById(id).name);
    const routeHtml = names.map((n, i) => (i ? '<span class="arrow">→</span>' : '') + n).join('');
    const over = bud.total > budget ? '<span class="est">（超预算 ¥' + (bud.total - budget) + '，见下方自动调整）</span>' : '';
    $('sumBox').innerHTML =
      '<div class="route">' + routeHtml + '</div>' +
      '<div>推荐指数 <span class="score">' + res.score + '</span> / 100 ' +
      '<span class="badge mock">估算</span>' + over + '</div>' +
      '<div class="metrics">' +
      '<span>总铁路距离 约 ' + d.railKm + ' km【模拟】</span>' +
      '<span>铁路时间 约 ' + d.railH + ' h【模拟】</span>' +
      '<span>交通费用 ¥' + d.fare + '【模拟】</span>' +
      '<span>换乘 ' + d.transfers + ' 次</span>' +
      '<span>城市 ' + (names.length - 1) + ' 个</span>' +
      '<span>游玩 ' + days + ' 天</span>' +
      '<span>预算 ¥' + bud.total + ' / ¥' + budget + '</span>' +
      '</div>' +
      '<div class="breakdown">' +
      '<span>铁路 ¥' + bud.rail + '</span><span>城市交通 ¥' + bud.cityTrans + '</span>' +
      '<span>住宿 ¥' + bud.stay + '</span><span>餐饮 ¥' + bud.food + '</span><span>门票 ¥' + bud.ticket + '</span>' +
      '</div>' +
      '<div class="score-detail">' + d.detail.map(x =>
        '<div class="line"><span>' + x.label + '</span><b class="' + (x.v >= 0 ? 'pos' : 'neg') + '">' + (x.v >= 0 ? '+' : '') + x.v + '</b></div>').join('') +
      '</div>';
  }

  function renderVerdict(res, feasible, bud, budget, days) {
    const v = $('verdictBox');
    if (feasible.ok === 'no') {
      v.innerHTML = '<div class="verdict no">✕ 当前方案不可行：' + feasible.reason + '（铁路约 ' + feasible.railH + ' h）。建议减少城市至 ' +
        Math.max(1, Math.floor(days / 2)) + ' 个，或增加天数。</div>';
    } else if (bud.total > budget) {
      v.innerHTML = '<div class="verdict tight">⚠ 当前方案预计超预算 ¥' + (bud.total - budget) + '。' +
        '<button class="btn small warn" id="btnAutoAdjust">自动调整</button></div>';
      $('btnAutoAdjust').addEventListener('click', () => autoAdjust());
    } else if (feasible.ok === 'tight') {
      v.innerHTML = '<div class="verdict tight">⚠ 行程偏紧：' + feasible.reason + '，建议每城停留不少于 1 整天。</div>';
    } else {
      v.innerHTML = '<div class="verdict ok">✓ 行程合理：时间与预算均可行。</div>';
    }
  }

  /* 自动调整: 砍目的地(保留用户锁定顺序的前缀), 直到预算/时间可行 */
  function autoAdjust() {
    const start = resolveCity($('inStart').value);
    const days = +$('inDays').value, budget = +$('inBudget').value;
    let keep = state.dests.length;
    let best = null;
    while (keep > 0) {
      const ids = state.dests.slice(0, keep).map(d => d.id);
      const res = C.planRoute(start.id, ids, days, budget, 'user');
      const bud = C.estimateBudget(res.route, { days, budget });
      const f = C.timeFeasible(res.route, days);
      if (bud.total <= budget && f.ok !== 'no') { best = { keep, res, bud, f }; break; }
      keep--;
    }
    const v = $('verdictBox');
    if (!best) {
      v.innerHTML = '<div class="verdict no">✕ 当前预算/时间下没有可行方案，请提高预算或增加天数。</div>';
      return;
    }
    const names = best.res.route.map(id => C.cityById(id).name).join(' → ');
    v.innerHTML = '<div class="verdict tight">已自动调整：建议只玩 <b>' + best.keep + ' 城</b>：' + names +
      '（总 ¥' + best.bud.total + ' / 预算 ¥' + budget + '）。' +
      '<button class="btn small" id="btnApplyAdjust">应用此方案</button></div>';
    $('btnApplyAdjust').addEventListener('click', () => {
      state.dests = state.dests.slice(0, best.keep);
      renderChips(); plan();
    });
  }

  /* ---------- 时间轴 ---------- */
  function renderTimeline(start, route, days) {
    const box = $('timeline');
    box.innerHTML = '';
    // 每城停留天数: 按价值分配
    const n = route.length - 1;
    const cityDays = [];
    let rem = Math.max(n, Math.round(days * 0.6));
    route.slice(1).forEach((id, i) => {
      const v = M.ATTRACTIONS.filter(a => a.cityId === id).length;
      const share = i === n - 1 ? Math.max(1, rem - (n - 1 - i)) : Math.max(1, Math.round(v * 1.2));
      cityDays.push(Math.min(share, rem - (n - 1 - i)) || 1);
      rem -= cityDays[i];
    });
    route.forEach((id, i) => {
      const c = C.cityById(id);
      const node = document.createElement('div');
      node.className = 'node' + (i > 0 && i < route.length - 1 ? ' stay' : '');
      const isStart = i === 0;
      const dayStay = i > 0 ? cityDays[i - 1] : null;
      const legs = [];
      if (i > 0) {
        const r = C.railBetween(route[i - 1], id);
        legs.push('<span>🚄 ' + r.km + ' km · ' + Math.round(r.durationMin / 60 * 10) / 10 + ' h · ¥' + r.fare + '</span>');
      }
      node.innerHTML =
        '<div class="left"><span class="dot"></span>' + (i < route.length - 1 ? '<span class="rail"></span>' : '') + '</div>' +
        '<div class="node-body"><div class="city-card" data-id="' + id + '">' +
        '<span class="tt">' + (isStart ? '🏠 ' : '📍 ') + c.name + '</span>' +
        (dayStay ? '<span class="stay">停留 ' + dayStay + ' 天</span>' : '') +
        (i > 0 ? '<div class="meta">' + legs.join('') + ' <span class="badge mock">模拟</span></div>' : '<div class="meta">出发城市</div>') +
        '</div></div>';
      box.appendChild(node);
    });
    box.querySelectorAll('.city-card').forEach(el => el.addEventListener('click', () => showCity(el.dataset.id)));
  }

  /* ---------- 城市详情(车站/住宿/景点/餐饮 + 每日) ---------- */
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
      (stay ? '<div class="stay-rec">🏨 推荐住宿区域：<b>' + stay.name + '</b>（便利度 ' + stay.score + '）— ' + stay.note + '</div>' : '') +
      '</div>';
    (plan.dayPlan || []).forEach((d, di) => {
      html += '<div class="day-card"><h4>Day ' + (di + 1) + '</h4><div class="step-line">';
      let t = di === 0 ? 9 : 9;
      d.spots.forEach(s => {
        html += '<div><span class="time">' + (t < 12 ? '0' + t : t) + ':00</span> <b>' + s.name + '</b> <span class="trans">游玩 ' + Math.round(s.visitMinutes / 60 * 10) / 10 + ' h</span>' + (s.ticket ? ' · 门票 ¥' + s.ticket : '') + '</div>';
        t += Math.ceil(s.visitMinutes / 60) + 1;
        html += '<div><span class="time">' + t + ':00</span> <span class="trans">🚌 城市交通 / 🚶 步行 约 40 min【模拟】</span></div>';
        t += 1;
        if (t > 20) t = 20;
      });
      html += '<div><span class="time">' + (di === 0 ? 18 : 18) + ':00</span> 晚餐 → 返回住宿区域</div></div></div>';
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

  /* ---------- 预算 ---------- */
  function renderBudget(bud, budget) {
    $('budgetCard').hidden = false;
    const over = bud.total - budget;
    $('budgetBox').innerHTML =
      '<div class="metrics" style="display:flex;flex-wrap:wrap;gap:10px">' +
      ['铁路交通 ¥' + bud.rail, '城市交通 ¥' + bud.cityTrans, '住宿 ¥' + bud.stay, '餐饮 ¥' + bud.food, '景点 ¥' + bud.ticket, '合计 ¥' + bud.total].map(x => '<span style="background:#f4f5fa;border-radius:8px;padding:4px 10px;font-size:13px">' + x + '</span>').join('') +
      '</div>' +
      (over > 0 ? '<div class="verdict tight" style="margin-top:10px">⚠ 预计超预算 ¥' + over + '，可用【自动调整】减少城市/降低住宿与餐饮档位。</div>' : '<div class="verdict ok" style="margin-top:10px">✓ 预算内可行。</div>');
  }

  /* ---------- 中途城市推荐 ---------- */
  function maybeSuggestStop(startId, route, days, budget) {
    const box = $('stopBox');
    box.innerHTML = '';
    if (!state.stopSuggest) return;
    const endId = route[route.length - 1];
    if (endId === startId || route.length > 3) return; // 只对 直达两城 且 未加中途 的情况
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
      // 插在起点之后(途经), 保持用户顺序模式为假→智能
      const dup = state.dests.find(d => d.id === id);
      if (!dup) { const c = C.cityById(id); state.dests.unshift({ id: c.id, name: c.name }); renderChips(); }
      plan();
    }));
    $('btnNoStop') && ($('btnNoStop').addEventListener('click', () => { state.stopSuggest = false; box.innerHTML = '<div class="stop-card">已选择不增加中途城市。</div>'; }));
  }

  /* ---------- 演示地图(SVG 城际连线; 无 AK) ---------- */
  function renderMap(start, route) {
    const svg = $('mapSvg');
    const W = 1000, H = 340;
    let ns = '', edges = '';
    const pos = {}, lats = route.map(id => C.cityById(id).lat), lons = route.map(id => C.cityById(id).lon);
    const minLat = Math.min.apply(null, lats) - 0.5, maxLat = Math.max.apply(null, lats) + 0.5;
    const minLon = Math.min.apply(null, lons) - 0.6, maxLon = Math.max.apply(null, lons) + 0.6;
    const px = lon => (lon - minLon) / (maxLon - minLon) * (W - 160) + 80;
    const py = lat => (maxLat - lat) / (maxLat - minLat) * (H - 120) + 50;
    route.forEach(id => {
      const c = C.cityById(id); pos[id] = [px(c.lon), py(c.lat)];
    });
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

  /* ---------- 8 个演示场景快捷按钮(底部) ---------- */
  function demos() {
    const wrap = document.createElement('div');
    wrap.className = 'card';
    wrap.innerHTML = '<h2>🧪 演示场景（一键载入）</h2><div class="chip-row" id="demoRow"></div>';
    document.querySelector('main').insertBefore(wrap, $('detailSection'));
    const items = [
      ['Demo1 石家庄→杭州 3天¥1000', ['杭州'], 3, 1000],
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
    // 默认载入 Demo4 场景: 石家庄→上海 5天, 演示中途推荐
    $('inStart').value = '石家庄';
    state.dests = [{ id: 'sh', name: '上海' }];
    $('inDays').value = 5; $('inBudget').value = 1600;
    renderChips();
    plan(); plannedOnce = true;
  }
  init();
})();