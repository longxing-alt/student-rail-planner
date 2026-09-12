/* RailGo 新 UI 绑定层
 *
 * 职责: 把 TripState(SSOT) 投影成 DOM; 把用户操作转成 TripState 变更。
 * 严禁在本文件内: 计算价格/时间/评分、重排城市价值、绕过 TripState 直接改 DOM 数据。
 * 地图复用 baidu-map.js 的既有 overlay 分层(铁路/POI/城市路线), 不新建地图实例。
 */
(function () {
  'use strict';
  var C = window.RailGoCore, M = window.RailGoMock, T = window.RailGoTrip;
  var BM = window.RailGoBaiduMap, BAIDU = window.RailGoBaidu;
  var $ = function (id) { return document.getElementById(id); };

  T.useCore(C, M);

  /* ---------- 小工具 ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function flash(el) { if (!el) return; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  function cityById(id) { return C.cityById(id); }

  /* ---------- 顶部摘要 ---------- */
  function renderSummary() {
    var s = T.state, tot = s.totals;
    var names = s.routeCities.map(function (n) { return n.name; });
    $('sumRoute').textContent = names.length ? names.join(' → ') : '设定起点与终点开始';
    $('sumDays').textContent = s.days + ' 天';
    var totalEl = $('sumTotal');
    if (tot) {
      var txt = '¥' + tot.total;
      if (totalEl.textContent !== txt) { totalEl.textContent = txt; flash(totalEl); }
      else totalEl.textContent = txt;
    } else totalEl.textContent = '—';
    var fe = $('sumFeasible');
    if (!s.candidates.length) { fe.textContent = '待规划'; fe.className = ''; return; }
    var c = s.candidates[s.activeCandidate];
    var over = tot && tot.total > s.budget;
    var tf = C.timeFeasible(c.cities, s.days);
    if (tf.ok === 'no') { fe.textContent = '时间不足'; fe.className = 'bad'; }
    else if (over) { fe.textContent = '超预算'; fe.className = 'bad'; }
    else if (tf.ok === 'tight') { fe.textContent = '行程偏紧'; fe.className = 'warn'; }
    else { fe.textContent = '路线可行'; fe.className = 'ok'; }
  }

  /* ---------- 铁路主线 ---------- */
  function renderRail() {
    var box = $('railNodes'), s = T.state;
    // 插槽仅在"有候选且路线中还没有中途城市"时才有意义(避免遮挡已存在的城市节点)
    var hasStop = s.routeCities.some(function (n) { return n.kind === 'stop'; });
    $('dropSlot').hidden = true;
    var slotInner = document.querySelector('#dropSlot .drop-inner');
    if (slotInner) slotInner.innerHTML = hasStop ? '拖入此处可替换' : '拖入此处';
    if (!s.routeCities.length) {
      box.innerHTML = '<div class="rail-empty">在上方设定起点与终点，或从右侧把想去的中途城市拖到这条线上</div>';
      return;
    }
    box.innerHTML = s.routeCities.map(function (n) {
      var cls = 'rail-node ' + n.kind + (n.kind === 'stop' && s.selectedCityId === n.id ? ' selected' : '');
      var sub = '';
      if (n.kind === 'stop') {
        var cp = s.cityPlans[n.id];
        sub = cp ? (cp.stayHours ? cp.stayHours + ' 小时 · ' + cp.experiences.length + ' 个体验' : '不停留') : '';
      } else {
        sub = n.kind === 'origin' ? '出发' : '终点';
      }
      return '<div class="' + cls + '" data-city="' + n.id + '" data-kind="' + n.kind + '"' +
        (n.kind === 'stop' ? ' draggable="true"' : '') + '>' +
        (n.kind === 'stop' ? '<button class="remove" data-remove="' + n.id + '" title="移除">✕</button>' : '') +
        '<span class="dot"></span><span class="label">' + esc(n.name) + '</span>' +
        '<span class="sub">' + esc(sub) + '</span></div>';
    }).join('');

    box.querySelectorAll('.rail-node.stop').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.dataset.remove) return;
        selectCity(el.dataset.city);
      });
      // 城市节点可在主线内拖动重排(顺序模式: 按用户顺序)
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'reorder:' + el.dataset.city);
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', function () { el.classList.remove('dragging'); });
    });
    box.querySelectorAll('[data-remove]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.dataset.remove;
        T.removeStop(id);
        toast('已移除 ' + (cityById(id) || {}).name);
      });
    });
  }

  /* ---------- 沿途候选 ---------- */
  function renderCands() {
    var box = $('candList');
    if (!T.state.routeCities.length) {
      box.innerHTML = '<div class="cands-empty">先设定起点与终点，这里会列出最值得停留的沿途城市。</div>';
      return;
    }
    var list = T.stopCandidates();
    if (!list.length) {
      box.innerHTML = '<div class="cands-empty">当前行程下没有更合适的沿途城市，或已全部加入路线。</div>';
      return;
    }
    box.innerHTML = list.map(function (c) {
      return '<div class="cand" draggable="true" data-city="' + c.id + '">' +
        '<div class="cand-top"><span class="cand-rank">' + c.rank + '</span>' +
        '<span class="cand-name">' + esc(c.name) + '</span>' +
        '<span class="cand-time">建议 ' + c.stopDays + ' 天</span></div>' +
        '<div class="cand-why">' + esc(c.reasons.join(' · ')) + (c.lowConfidence ? ' · 近邻中转未实测' : '') + '</div>' +
        '<button class="btn small ghost cand-add" data-add="' + c.id + '">加入路线</button>' +
        '</div>';
    }).join('');
    box.querySelectorAll('.cand').forEach(function (el) {
      el.addEventListener('dragstart', function (e) {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', 'add:' + el.dataset.city);
        el.classList.add('dragging');
        T.setUI({ status: 'dragging', draggingCity: el.dataset.city });
        // 仅当路线中还没有中途城市时才显示中央插槽(避免遮挡已存在的城市节点)
        var hasStop = T.state.routeCities.some(function (n) { return n.kind === 'stop'; });
        $('dropSlot').hidden = hasStop;
      });
      el.addEventListener('dragend', function () {
        el.classList.remove('dragging');
        $('dropSlot').hidden = true;
        T.setUI({ status: 'idle', draggingCity: null });
      });
    });
    box.querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () { addCity(b.dataset.add); });
    });
  }

  function addCity(id) {
    setBusy(true);
    var ok = T.addStop(id);
    setBusy(false);
    if (!ok) { toast('该城市已在路线中'); return; }
    var name = (cityById(id) || {}).name || id;
    selectCity(id);
    toast('已加入 ' + name + '，已重新规划');
    markEntering(id);
  }
  function markEntering(id) {
    var el = document.querySelector('.rail-node[data-city="' + id + '"]');
    if (el) { el.classList.add('entering'); }
  }

  /* ---------- 拖拽: 铁路主线作为放置目标 ---------- */
  function bindRailDrop() {
    var rail = $('rail'), slot = $('dropSlot');
    rail.addEventListener('dragover', function (e) {
      e.preventDefault();
      var dt = e.dataTransfer;
      if (dt) dt.dropEffect = 'copy';
      slot.hidden = false;
      slot.classList.add('active');
    });
    rail.addEventListener('dragleave', function (e) {
      if (rail.contains(e.relatedTarget)) return;
      slot.classList.remove('active');
    });
    rail.addEventListener('drop', function (e) {
      e.preventDefault();
      slot.classList.remove('active'); slot.hidden = true;
      var data = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
      if (data.indexOf('add:') === 0) {
        addCity(data.slice(4));
      } else if (data.indexOf('reorder:') === 0) {
        toast('顺序已在路线中；如需调整请移除后重新加入');
      }
    });
  }

  /* ---------- 城市体验栏 ---------- */
  function selectCity(cityId) {
    T.state.selectedCityId = cityId;
    renderRail();
    renderCityBar();
    focusMapOnCity(cityId);
  }

  function renderCityBar() {
    var s = T.state, cid = s.selectedCityId;
    var bar = $('citybar');
    if (!cid || !s.cityPlans[cid]) { bar.hidden = true; return; }
    bar.hidden = false;
    var plan = s.cityPlans[cid], city = cityById(cid);
    $('cbName').textContent = city ? city.name : cid;
    $('cbStay').textContent = plan.stayHours ? plan.stayHours + ' 小时' : '不停留';
    $('cbCount').textContent = plan.experiences.length + ' 个体验';
    var idx = T.STAY_OPTIONS.findIndex(function (o) { return o.hours === plan.stayHours; });
    $('stayRange').value = idx >= 0 ? idx : 2;
    renderExpLine(cid, city);
  }

  function renderExpLine(cid, city) {
    var plan = T.state.cityPlans[cid];
    var box = $('expLine');
    var station = { lat: city.lat, lon: city.lon };
    var ICON = { historical: '🏛', park: '🌳', museum: '🏛', food: '🍜', modern: '🌆', nature: '⛰', shopping: '🛍' };
    var html = '<div class="exp-station"><span class="ic">🚉</span><span class="nm">' + esc(city.name) + '站</span></div>';
    var list = plan.experiences || [];
    list.forEach(function (x, i) {
      html += '<div class="exp-conn" data-seg="' + i + '"></div>';
      html += '<div class="exp enter' + (x.locked ? ' locked' : '') + '" data-exp="' + x.id + '">' +
        '<span class="ic" title="' + esc(x.name) + '">' + (ICON[x.type] || '📍') + '</span>' +
        '<span class="nm">' + esc(x.name) + '</span>' +
        '<span class="dur">' + (x.visitMinutes ? Math.round(x.visitMinutes / 60 * 10) / 10 + ' h' : '—') + '</span>' +
        '<span class="exp-tools">' +
        '<button data-act="lock" class="' + (x.locked ? 'on' : '') + '" title="锁定(换一组时保留)">🔒</button>' +
        '<button data-act="exclude" title="不想去">✕</button>' +
        '<button data-act="visited" title="去过">✓</button>' +
        '</span></div>';
    });
    if (plan.stayHours > 0) {
      html += '<div class="exp-conn"></div>';
      html += '<div class="exp-add"><span class="ic" data-add-exp="1" title="换一个体验">＋</span><span class="nm">更多</span></div>';
    }
    html += '<div class="exp-conn"></div>';
    html += '<div class="exp-station"><span class="ic">🚉</span><span class="nm">' + esc(city.name) + '站</span></div>';
    if (!list.length) {
      box.innerHTML = '<div class="exp-empty">当前停留时长下没有安排城市体验。把上方滑杆向右调可增加体验。</div>';
      return;
    }
    box.innerHTML = html;

    box.querySelectorAll('[data-exp]').forEach(function (el) {
      var expId = el.dataset.exp;
      el.querySelectorAll('[data-act]').forEach(function (b) {
        b.addEventListener('click', function (e) {
          e.stopPropagation();
          var act = b.dataset.act;
          if (act === 'lock') T.toggleLock(cid, expId);
          else if (act === 'exclude') {
            var nm = (plan.experiences.find(function (x) { return x.id === expId; }) || {}).name;
            el.classList.add('leave');
            setTimeout(function () { T.toggleExcluded(cid, expId); toast('已记下：不想去 ' + nm); }, 180);
            return;
          }
          else if (act === 'visited') { T.toggleVisited(cid, expId); toast('已标记去过'); }
          renderCityBar();
          focusMapOnCity(cid);
        });
      });
    });
    var addBtn = box.querySelector('[data-add-exp]');
    if (addBtn) addBtn.addEventListener('click', function () { rotate(cid); });
  }

  function rotate(cid) {
    setBusy(true);
    setTimeout(function () {
      T.rotateExperiences(cid);
      setBusy(false);
      renderCityBar();
      focusMapOnCity(cid);
      var info = T.state.ui.lastRotate;
      if (info && info.changed) toast('已换一组未锁定的体验');
      else toast((info && info.reason) || '没有可替换的备选体验');
    }, 120);
  }

  function bindStayRange() {
    $('stayRange').addEventListener('input', function (e) {
      var opt = T.STAY_OPTIONS[+e.target.value];
      if (!opt) return;
      var cid = T.state.selectedCityId;
      setBusy(true);
      T.setStopoverHours(opt.hours);
      if (cid) { T.fillExperiences(cid, {}); T.state.selectedCityId = cid; }
      setBusy(false);
      renderRail(); renderCityBar(); focusMapOnCity(cid);
    });
    $('btnRotate').addEventListener('click', function () {
      if (T.state.selectedCityId) rotate(T.state.selectedCityId);
    });
    $('btnRemoveCity').addEventListener('click', function () {
      var cid = T.state.selectedCityId;
      if (!cid) return;
      var nm = (cityById(cid) || {}).name || cid;
      T.removeStop(cid);
      renderRail(); renderCityBar();
      toast('已移除 ' + nm + '，路线已恢复');
    });
  }

  /* ---------- 地图(复用既有分层 overlay) ---------- */
  var mapReady = false, mapHadPoi = false;
  function applyCityPlanToMap(cid) {
    if (!mapReady || !BM) return;
    var plan = T.state.cityPlans[cid];
    if (!plan) return;
    var city = cityById(cid);
    var pois = (plan.experiences || []).map(function (x) {
      return { id: x.id, name: x.name, lat: x.lat, lng: x.lng, source: x.source || 'mock' };
    });
    BM.clearRouteOverlays();
    BM.clearPoiOverlays();
    if (pois.length) {
      BM.addPoiMarkers(pois, {});
      mapHadPoi = true;
    }
    // 车站 → 体验点 → 车站(与体验栏顺序一致)
    var seq = [{ id: 'station-in', name: city.name + '站', lat: city.lat, lng: city.lon, source: 'mock' }]
      .concat(pois)
      .concat([{ id: 'station-out', name: city.name + '站', lat: city.lat, lng: city.lon, source: 'mock' }]);
    var segs = [];
    for (var i = 0; i < seq.length - 1; i++) segs.push({ from: seq[i], to: seq[i + 1] });
    if (segs.length) BM.addRouteOverlays(segs);
    BM.fitPoiView(seq);
  }
  function focusMapOnCity(cid) {
    if (!mapReady || !BM || !cid) return;
    var city = cityById(cid);
    if (!city) return;
    applyCityPlanToMap(cid);
  }
  async function initMapAsync() {
    if (!BM || !BM.isAvailable()) {
      $('mapFallbackText').textContent = '未配置百度地图 Key，当前为无地图模式';
      $('mapNote').textContent = '城市内路线顺序以上方体验栏为准（不请求任何外部接口）';
      return;
    }
    var center = T.state.origin || T.state.destination;
    if (!center) return;
    try {
      var r = await BM.initMap('baiduMap', { lat: center.lat, lon: center.lon, zoom: 6 });
      if (!r || !r.ok) {
        $('mapFallbackText').textContent = '地图初始化失败：' + ((r && r.message) || '未知原因');
        return;
      }
      mapReady = true;
      $('baiduMap').hidden = false;
      $('mapFallback').hidden = true;
      $('mapNote').textContent = '真实地图 · 城市内路线优先使用步行路径，不可用时以虚线示意（估算）';
      drawRailOnMap();
    } catch (e) {
      $('mapFallbackText').textContent = '地图加载异常：' + (e && e.message ? e.message : '未知');
    }
  }
  function drawRailOnMap() {
    if (!mapReady || !BM) return;
    var pts = T.state.routeCities.map(function (n) { return { id: n.id, name: n.name, lat: n.lat, lon: n.lon }; });
    if (pts.length < 2) return;
    BM.clearOverlays();
    mapHadPoi = false;
    BM.addMarkers(pts);
    BM.drawPolyline(pts);
    BM.fitView(pts);
  }

  /* ---------- 交互状态 ---------- */
  var busyTimer = null;
  function setBusy(on) {
    var st = document.querySelector('.stage');
    if (!st) return;
    if (on) {
      st.classList.add('busy');
      T.setUI({ status: 'recalculating' });
      clearTimeout(busyTimer);
      busyTimer = setTimeout(function () { st.classList.remove('busy'); T.setUI({ status: 'idle' }); }, 600);
    } else {
      setTimeout(function () { st.classList.remove('busy'); }, 160);
    }
  }

  /* ---------- 渲染总入口 ---------- */
  function renderAll() {
    renderSummary();
    renderRail();
    renderCands();
    renderCityBar();
    drawRailOnMap();
  }

  /* ---------- 输入区 ---------- */
  function fillCityList() {
    $('cityList').innerHTML = M.CITIES.map(function (c) { return '<option value="' + c.name + '">'; }).join('');
  }
  function renderStopoverChips() {
    $('stopoverChips').innerHTML = T.STAY_OPTIONS.map(function (o) {
      return '<span class="chip' + (o.hours === T.state.stopoverHours ? ' on' : '') + '" data-hours="' + o.hours + '">' + o.label + '</span>';
    }).join('');
    $('stopoverChips').querySelectorAll('[data-hours]').forEach(function (el) {
      el.addEventListener('click', function () {
        T.setStopoverHours(+el.dataset.hours);
        renderStopoverChips();
        var cid = T.state.selectedCityId;
        if (cid) {
          T.fillExperiences(cid, {});
          renderCityBar();
        }
        renderRail(); renderSummary();
      });
    });
  }
  function bindSetup() {
    $('btnPlan').addEventListener('click', function () {
      var o = $('inOrigin').value.trim(), d = $('inDest').value.trim();
      if (!o || !d) { toast('请填写起点与终点'); return; }
      if (!T.setEndpoint('origin', o)) { toast('未收录起点城市'); return; }
      if (!T.setEndpoint('destination', d)) { toast('未收录终点城市'); return; }
      T.state.days = +$('inDays').value;
      T.state.budget = +$('inBudget').value;
      T.resetRoute();
      setBusy(true);
      renderAll();
      setBusy(false);
      $('setup').classList.add('collapsed');
      renderSummary();
      initMapAsync();
      var missing = T.stopCandidates().length;
      toast('已生成路线' + (missing ? '，右侧列出 ' + missing + ' 个值得停留的城市' : ''));
    });
    $('btnEdit').addEventListener('click', function () {
      var s = $('setup');
      s.classList.toggle('collapsed');
      if (!s.classList.contains('collapsed')) $('inOrigin').focus();
    });
    $('prefChips').querySelectorAll('[data-pref]').forEach(function (el) {
      el.addEventListener('click', function () {
        $('prefChips').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        el.classList.add('on');
        T.state.preference.preset = el.dataset.pref;
        T.recomputeRoute();
        renderCands(); renderSummary(); renderRail();
        if (T.state.selectedCityId) renderCityBar();
      });
    });
    ['inDays', 'inBudget'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        T.state.days = +$('inDays').value;
        T.state.budget = +$('inBudget').value;
        T.recomputeRoute();
        renderAll();
      });
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    fillCityList();
    renderStopoverChips();
    bindSetup();
    bindStayRange();
    bindRailDrop();
    T.subscribe(function (S, kind) {
      if (kind === 'route' || kind === 'cityPlan' || kind === 'totals' || kind === 'stopover') renderAll();
      else if (kind === 'endpoint') renderSummary();
    });
    // 预填默认值(不自动规划, 由用户点"生成路线")
    $('inOrigin').value = '北京';
    $('inDest').value = '上海';
    renderAll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
