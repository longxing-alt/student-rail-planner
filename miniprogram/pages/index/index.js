/* 学生票区间规划器 · 小程序版（按简化原型重构）
 * 计算使用 utils/logic.js 真实车站库与几何函数
 * 流程: ①学校 → ②出发地(区间端点+起点) → ③目的地 → 🚀一键规划 → 弹窗推荐改区间 → 框体着色+区间线+消耗次数 */
const logic = require('../../utils/logic.js');
function logOp(msg){ console.log('[操作] ' + (msg||"")); }
const { state, dist, corridor, STATIONS, cleanCity } = logic;

/* ---------- 离线解析 ---------- */
function resolvePlace(q) {
  q = String(q || '').trim();
  if (!q) return Promise.resolve(null);
  const qn = cleanCity(q);
  const hits = STATIONS.filter(s => s[0] === qn || s[1] === qn || s[1].includes(qn) || qn.includes(s[1]));
  if (!hits.length) return Promise.resolve(null);
  const h = hits.find(s => s[4]) || hits[0];
  return Promise.resolve({ point: { lat: h[2], lon: h[3] }, station: { name: h[0], city: h[1], lat: h[2], lon: h[3] } });
}

/* 单点判定(实测校准v2): 2=区间内(绿) 0=超区间(红) — 空间带+通道网+同城, 见 logic.beltV2 */
function beltOf(S, H, P) { return logic.beltV2(S, H, P); }
/* 行程判定 = 真正出发地(柳州/出发地) → 目的地, 两端都须在区间内(实测: 柳州→深圳, 柳州不在区间→拦截) */
function judge(S, H, D) {
  const O = state.depart || S;
  const a = beltOf(S, H, O), b = beltOf(S, H, D);
  return Math.min(a, b); // 两端取较严
}
/* 自动最优联程排序: 使最多路段落在区间内(联程段覆盖), 平局取总里程短 */
function bestRoute(S, H, trips) {
  const arr = trips.slice();
  if (arr.length <= 1) return arr;
  const sts = arr.map(t => t.station);
  const ticketCount = oks => { let t = 0, r = 0; for (const o of oks) { if (o) r++; else { t += Math.ceil(r / 2); r = 0; } } return t + Math.ceil(r / 2); };
  const evalOrder = ord => {
    const oks = []; let dirN = 0, km = 0, prev = H, sim = 0;
    for (let k = 0; k < ord.length; k++) {
      const i = ord[k], q = sts[i];
      const d = logic.beltV2(S, H, prev) === 2 && logic.beltV2(S, H, q) === 2;
      oks.push(d); if (d) dirN++;
      if (ord[k] === k) sim++;           // 与原始输入顺序一致度
      km += dist(prev, q); prev = q;
    }
    km += dist(prev, H);
    return { tickets: ticketCount(oks), okN: oks.filter(Boolean).length, dirN, sim, km };
  };
  const better = (a, b) => a.tickets !== b.tickets ? a.tickets < b.tickets
    : a.okN !== b.okN ? a.okN > b.okN
    : a.dirN !== b.dirN ? a.dirN > b.dirN
    : a.sim !== b.sim ? a.sim > b.sim
    : a.km < b.km;
  const n = arr.length;
  let bestOrd = null, bestScore = null;
  if (n <= 9) {
    const perm = [], used = new Array(n).fill(0);
    (function dfs() {
      if (perm.length === n) {
        const sc = evalOrder(perm);
        if (!bestScore || better(sc, bestScore)) { bestScore = sc; bestOrd = perm.slice(); }
        return;
      }
      for (let i = 0; i < n; i++) if (!used[i]) { used[i] = 1; perm.push(i); dfs(); used[i] = 0; perm.pop(); }
    })();
  } else {
    let cur = H, ord = [], left = sts.map((_, i) => i);
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < left.length; k++) { const d = dist(cur, sts[left[k]]); if (d < bd) { bd = d; bi = k; } }
      ord.push(left[bi]); cur = sts[left[bi]]; left.splice(bi, 1);
    }
    let improved = true;
    while (improved) {
      improved = false;
      for (let i = 0; i < n - 1; i++) {
        const a = ord.slice(), tmp = a[i]; a[i] = a[i + 1]; a[i + 1] = tmp;
        if (better(evalOrder(a), evalOrder(ord))) { ord = a; improved = true; }
      }
    }
    bestOrd = ord;
  }
  return bestOrd.map(i => arr[i]);
}
/* 排序: 按离出发地由近到远(越走越远, 天然不折返) */
function sortByDepart(trips) {
  const dep = state.depart;
  return trips.slice().sort((a, b) => dist(dep, a.station) - dist(dep, b.station));
}
/* 区间内可选中转站(空间带, 按推荐从高到低=距发站近; 与端点同城不算中转) */
function hubsOf(S, H, dep) {
  const out = [];
  if (!S || !H) return out;
  const d0 = dep || S;
  for (const sc of STATIONS) {
    if (sc[4] !== 1) continue;
    const T = { name: sc[0], city: sc[1], lat: sc[2], lon: sc[3] };
    if (T.name === S.name || T.name === H.name) continue;
    if (T.city === S.city || T.city === H.city || T.city === d0.city) continue; // 同城=没换地方, 不算中转
    if (!logic.bandOK(S, H, T)) continue;
    out.push({ name: T.name, km: Math.round(dist(d0, T)) });
  }
  out.sort((a, b) => a.km - b.km);
  return out.slice(0, 8);
}

/* 联程路由(与网页 routeChainAt 一致): 出发地=起点; 单程不回程; 全程往返才回程 */
function mpChain(S, H, trips, fast) {
  const dep = state.depart || H;
  const hasRound = Array.isArray(trips) && trips.length && trips[0] && typeof trips[0]==='object' && 'round' in trips[0] ? trips.some(t=>t.round) : false;
  const arr = (Array.isArray(trips) && trips.length && trips[0] && trips[0].station) ? trips.map(t=>t.station) : trips;
  if (hasRound) return logic.chainV2(S, H, arr, dep, dep, fast);
  if (!arr || !arr.length) return logic.chainV2(S, H, [], dep, dep, fast);
  return logic.chainV2(S, H, arr.slice(0,-1), dep, arr[arr.length-1], fast);
}

/* 最优区间端点(联程): 枚举全部车站, 联程段覆盖(okN)优先 → 平局按 段端点p/L最小 → 距当前端点近 */
function smartBest(S, H, trips) {
  const sts = trips.map(t => t.station);
  const curCover = mpChain(S, H, trips, true).okN;
  let best = null;
  for (const s of STATIONS) {
    if (s[0] === S.name) continue;
    if (!logic.railAdj().nodes.has(s[1])) continue; // 推荐只考虑通道网内端点(图外支线/海岛可手动填写)
    if (H && s[1] === H.city) continue; // 不再推荐当前家同城
    const H2 = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    const cc = mpChain(S, H2, trips, true);
    const cover = cc ? cc.okN : 0;
    if (cover < curCover) continue;
    const Lh = dist(S, H2);
    let pMax = 0;
    for (const sg of (cc ? cc.segs : [])) {
      if (sg.inInt) { const { p } = corridor(S, H2, sg.b); pMax = Math.max(pMax, p / (Lh || 1)); }
    }
    const km = dist({ lat: s[2], lon: s[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cover > best.cover || (cover === best.cover && (pMax < best.pMax || (pMax === best.pMax && km < best.km)))) {
      best = { st: { name: s[0], city: s[1], lat: s[2], lon: s[3] }, cover, pMax };
    }
  }
  return best;
}

Page({
  data: {
    schoolInput: '', departInput: '', tripInput: '',
    showDepart: false, showDest: false,
    startName: '出发地', ivS: '学校', ivH: '出发地', ivDots: [],
    rows: [], tdIndex: -1, tripCount: 0,
    planned: false, used: '–', budget: 4, remain: '–', okN: 0, edgeN: 0, badN: 0,
    tfm: { show: false, step: 1, i: -1, hub: '', a: '', b: '', S: '', H: '', cands: [] },
    cntTip: { show: false, lines: [], used: '–', budget: 4, remain: '–' },
    status: '',
    modal: { show: false, suggest: null, g2: 0, e2: 0, b2: 0 },
    dbg: { on: false, badges: [], showLegend: false,
      list: [
        { n: 1, name: '品牌头' }, { n: 2, name: '状态条' }, { n: 3, name: '学校卡片' },
        { n: 4, name: '出发地卡片' }, { n: 5, name: '区间线' }, { n: 6, name: '目的地列表' },
        { n: 7, name: '起点行(出发地)' }, { n: 8, name: '结果(消耗次数)' }, { n: 9, name: '一键规划按钮' },
        { n: 10, name: '区间建议弹窗' },
      ] },
  },
  onLoad() {
    this.hubOverride = {};
    this._cc = null;
    this.renderAll();
    this.setStatus('填写 ① 学校 开始');
  },
  onShareAppMessage() { return { title: '学生票区间规划器：区间怎么算、怎么改最省次数' }; },

  setStatus(m) { this.setData({ status: String(m || '') }); },

  /* 输入 */
  onSchoolInput(e) { this.setData({ schoolInput: e.detail.value }); },
  onDepartInput(e) { this.setData({ departInput: e.detail.value }); },
  onTripInput(e) { this.setData({ tripInput: e.detail.value }); },

  /* 步骤1 学校 → 步骤2 出发地 */
  async nextSchool() {
    logOp("设置学校");

    const q = this.data.schoolInput.trim();
    if (!q) { this.setStatus('请先输入学校城市'); return; }
    const r = await resolvePlace(q);
    if (!r) { this.setStatus('未收录该城市（内置 ' + STATIONS.length + ' 站），试试输入车站名'); return; }
    state.school = r.station;
    this.setData({ schoolInput: q, ivS: state.school.name, showDepart: true });
    this.setStatus('学校：' + state.school.name + ' · ' + state.school.city + '，填写出发地');
  },
  /* 步骤2 出发地 → 步骤3 目的地 */
  async nextDepart() {
    logOp("设置出发地");
    const q = this.data.departInput.trim();
    if (!q) { this.setStatus('请先输入出发地'); return; }
    const r = await resolvePlace(q);
    if (!r) { this.setStatus('未收录该城市，试试输入车站名'); return; }
    if (!state.school) { this.setStatus('请先完成 ① 学校'); return; }
    state.depart = r.station;
    if (!state.home) state.home = state.depart; // 区间端点初始=出发地; 采用推荐后单独变
    this.setData({
      departInput: q, startName: state.depart.name, ivH: state.home.name,
      showDest: true, planned: false,
    });
    this.renderAll();
    this.setStatus('出发地：' + state.depart.name + '（区间 ' + state.school.name + ' ↔ ' + state.home.name + '），添加想去的地方');
  },

  /* 目的地 */
  async addTrip() {
    logOp("添加目的地");
    const q = this.data.tripInput.trim();
    if (!q) return;
    const r = await resolvePlace(q);
    if (!r) { this.setStatus('未收录 "' + q + '"'); return; }
    const wasPlanned = this.data.planned;
    state.trips.push({ id: ++state._tid, text: q, point: r.point, station: r.station });
    this.setData({ tripInput: '', planned: false }); // 添加后全部卡片回灰, 需再次一键规划
    this.renderAll();
    this.setStatus('已添加：' + q + (wasPlanned ? '（改动后请再次【一键规划】以重新判色）' : ''));
  },
  removeTrip(e) {
    logOp("删除目的地");
    state.trips = state.trips.filter(t => t.id !== e.currentTarget.dataset.id);
    this.setData({ planned: false });
    this.renderAll();
    this.setStatus('已删除（改动后请重新【一键规划】）');
  },
  /* 一键清空目的地（二次确认） */
  clearAll() {
    logOp("清空全部");
    wx.showModal({
      title: '清空全部目的地',
      content: '确定清空全部目的地吗？清空后需重新输入。',
      confirmText: '清空', cancelText: '取消',
      confirmColor: '#dc2626',
      success: res => {
        if (!res.confirm) return;
        state.trips = [];
        this.setData({ planned: false, tripInput: '' });
        this.renderAll();
        this.setStatus('已清空全部目的地');
      },
    });
  },

  /* 触屏拖拽（按住 ≡ 拖动） */
  tdStart(e) {
    const i = +e.currentTarget.dataset.i;
    this._td = { from: i, to: i, t: 0 };
    this.setData({ tdIndex: i });
  },
  tdMove(e) {
    if (!this._td) return;
    const now = Date.now();
    if (now - this._td.t < 40) return;
    this._td.t = now;
    const y = e.touches[0].clientY;
    const self = this;
    this.createSelectorQuery().selectAll('.dest').boundingClientRect(rects => {
      if (!self._td || !rects.length) return;
      let to = self._td.to;
      for (let i = 0; i < rects.length; i++) {
        if (y >= rects[i].top && y <= rects[i].bottom) { to = i; break; }
      }
      if (to !== self._td.to) { self._td.to = to; self.setData({ tdIndex: to }); }
    }).exec();
  },
  tdEnd() {
    if (!this._td) return;
    const { from, to } = this._td; // from=目的地索引(trips) ; to=测得行号(0=起点行, 其余=trips[to-1])
    this._td = null;
    this.setData({ tdIndex: -1 });
    if (to === 0) {
      // 拖到"起点(出发地)" → 该目的地变成新的出发地
      const [it] = state.trips.splice(from, 1);
      const old = state.depart;
      state.depart = it.station;
      if (old) state.trips.push({ id: ++state._tid, text: old.name, point: { lat: old.lat, lon: old.lon }, station: old });
      this.setData({
        departInput: state.depart.name + (state.depart.city ? ' · ' + state.depart.city : ''),
        startName: state.depart.name, planned: false,
      });
      this.renderAll();
      this.setStatus('出发地改为 ' + state.depart.name + '（原出发地 ' + old.name + ' 已加入目的地，请重新规划）');
      return;
    }
    const tTo = to - 1;
    if (from === tTo) return;
    const [it] = state.trips.splice(from, 1);
    state.trips.splice(tTo, 0, it);
    this.setData({ planned: false });
    this.renderAll();
    this.setStatus('已调整顺序（改动后请重新【一键规划】）');
  },

  /* 一键规划: 顺路排序 + 框体着色 + 弹窗推荐 */
  onPlan() {
    logOp("一键规划");
    this.hubOverride = {}; // 新规划重置中转选择
    if (!state.trips.length) { this.setStatus('先添加想去的地方'); return; }
    const S = state.school, H = state.home;
    if (!S || !H) { this.setStatus('请先完成 ①学校 ②出发地'); return; }
    state.trips = bestRoute(S, H, state.trips); // 自动最优联程排序: 最多段落在区间内
    // 先标记已规划, 再渲染, 保证框体/区间线着色
    this.setData({ planned: true });
    this.renderAll();
    // 联程路线: 出发地 → 各程 → 出发地, 逐段判定(与规划页一致)
    const sts = state.trips.map(t => t.station);
    const cc0 = mpChain(S, H, state.trips, true);
    const N = cc0 ? cc0.segs.length : 0;
    // 推荐区间端点(联程段覆盖)
    const best = smartBest(S, H, state.trips);
    const suggest = best && best.st.name !== H.name ? best.st : null;
    let modal = { show: true, suggest: null, g2: 0, e2: 0, b2: 0, isDest: false, altern: '', dests: [] };
    this.setData({ 'modalFlag': '' });
    if (suggest) {
      const H2 = { name: suggest.name, city: suggest.city, lat: suggest.lat, lon: suggest.lon };
      const cc2 = mpChain(S, H2, state.trips, true);
      const j2 = cc2 ? cc2.segs.map(sg => (sg.inInt ? 2 : 0)) : [];
      modal = { show: true, suggest,
        g2: j2.filter(x => x === 2).length, e2: 0, b2: j2.filter(x => x === 0).length };
      // 推荐端点恰为目的地 → 可能绕路, 给出就近替代
      modal.isDest = state.trips.some(t => t.station && (t.station.name === suggest.name || t.station.city === suggest.city));
      const curCover = cc0 ? cc0.okN : 0;
      const destNames = state.trips.map(t => t.station && t.station.name);
      const destCities = state.trips.map(t => t.station && t.station.city);
      let alt = null, aKm = 0, aCover = 0;
      for (const ss of STATIONS) {
        if (ss[0] === S.name || ss[0] === suggest.name) continue;
        if (ss[1] === H.city) continue;
        const H3 = { name: ss[0], city: ss[1], lat: ss[2], lon: ss[3] };
        const cc3 = logic.chainV2(S, H3, sts, H3, H3, true);
        const cov = cc3 ? cc3.okN : 0;
        if (cov < curCover) continue;
        if (destNames.includes(ss[0]) || destCities.includes(ss[1])) continue;
        const km = dist({ lat: ss[2], lon: ss[3] }, { lat: H.lat, lon: H.lon });
        if (!alt || cov > aCover || (cov === aCover && km < aKm)) { alt = ss; aKm = km; aCover = cov; }
      }
      if (alt) modal.altern = alt[0] + ' · ' + alt[1] + '（覆盖 ' + aCover + '，出发地不动）';
    }
    // 每段当前判定(颜色), 指明哪里不行(直达/中转可出/超区间)
    modal.dests = state.trips.map((t, i) => {
      const sg = cc0 ? cc0.segs[i] : null;
      const c = sg && sg.inInt ? '区间内·可买' : sg && sg.hub ? '中转可出·经' + sg.hub : '超区间·不能买';
      const cls = sg && sg.inInt ? 'g2' : sg && sg.hub ? 'e2' : 'b2';
      return { text: t.text, c, cls };
    });
    this.setData({ modal });
    const segTxt = cc0 ? cc0.segs.map(sg => (sg.inInt ? '✓' : '✗') + sg.b.name).join(' → ') : '';
    this.setStatus('联程路线：' + state.depart.name + ' → ' + state.trips.map(t => t.text).join(' → ') + ' → ' + state.depart.name + ' || ' + segTxt);
  },
  /* 采用推荐区间: 只改区间端点, 出发地不动 */
  applySuggestion() {
    logOp("采用推荐区间");
    const s = this.data.modal.suggest;
    if (!s) return;
    state.home = { name: s.name, city: s.city, lat: s.lat, lon: s.lon };
    this.hubOverride = {};
    this.setData({ ivH: state.home.name, planned: true });
    this.renderAll();
    this.closeModal();
    this.setStatus('已按推荐改家为 ' + state.home.name + '；出发地（' + (state.depart ? state.depart.name : state.home.name) + '）不变，已按新区间 ' + state.school.name + ' ⇄ ' + state.home.name + ' 重新判定');
    console.log('[区间分析] 已采用推荐：家→' + state.home.name + '，新区间 ' + state.school.name + ' ⇄ ' + state.home.name);
  },
  closeModal() { this.setData({ 'modal.show': false }); },
  /* 中转段点击: 分步向导(与网页端一致) */
  openTfmAt(i, startStep) {
    const cc = this._cc;
    const sg = cc && cc.segs[i];
    if (!sg) return;
    const S = state.school, H = state.home;
    const dep = state.depart || H;
    const cands = hubsOf(S, H, (sg.a && sg.a.name) ? sg.a : dep);
    this.setData({ tfm: {
      show: true, step: startStep || 1, i,
      hub: sg.hub || (cands[0] ? cands[0].name : ''), a: sg.a ? sg.a.name : '', b: sg.b ? sg.b.name : '',
      S: S ? S.name : '学校', H: H ? H.name : '家', cands,
    } });
  },
  tfmTap(e) {
    const i = Number(e.currentTarget.dataset.i);
    const sg = this._cc && this._cc.segs[i];
    if (!sg || !sg.hub) return;
    this.openTfmAt(i, 1);
  },
  setHubTap(e) {
    logOp("选择中转站");
    const i = Number(e.currentTarget.dataset.i);
    const j = Number(e.currentTarget.dataset.j);
    const sg = this._cc && this._cc.segs[i];
    if (!sg || !sg.hub) return;
    const hubs = hubsOf(state.school, state.home, sg.a || state.depart || state.home);
    const c = hubs[j]; if (!c) return;
    this.hubOverride = this.hubOverride || {};
    this.hubOverride[i] = c.name;   // 该段最终中转=所选站
    this.renderAll();
    this.openTfmAt(i, 3);           // 随即弹出操作说明(第3步: 以所选站为例)
  },
  tfmPick(j) {
    const tfm = this.data.tfm;
    if (!tfm || !tfm.cands[j]) return;
    this.setData({ 'tfm.hub': tfm.cands[j].name, 'tfm.step': 3 }); // 后续步骤以选中站为例
  },
  tfmNext() { const st = Math.min(4, this.data.tfm.step + 1); this.setData({ 'tfm.step': st }); },
  tfmPrev() { const st = Math.max(1, this.data.tfm.step - 1); this.setData({ 'tfm.step': st }); },
  closeTfm() { this.setData({ 'tfm.show': false }); },
  /* 次数疑问: 区间内消耗明细 */
  showCntTip() {
    const cc = this._cc;
    if (!cc) return;
    const runs = this._ticketRuns || [];
    const lines = [];
    runs.forEach((run, ri) => {
      const segs = run.map(j => cc.segs[j]);
      const path = segs.map(x => (x.a ? x.a.name : '') + '→' + (x.b ? x.b.name : '')).join('→');
      const tags = segs.map(x => x.inInt ? '直达' : '中转·经' + x.hub).join(' / ');
      lines.push('行程' + (ri + 1) + ' ' + path + '：全程联程（无绕路）· 计 1 次（' + tags + '）');
    });
    cc.segs.forEach((sg, i) => {
      if (i < state.trips.length && !sg.ok) {
        lines.push('区间外 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：需购成人票（此段断开行程）');
      }
    });
    lines.push('规则：同一趟连续行程（不折返、不往返）无论分几张票/几次中转，全程计 1 次；勾全程往返则 ×2。');
    this.setData({ cntTip: { show: true, lines, used: this.data.used, budget: state.budget, remain: (state.budget - (typeof this.data.used === 'number' ? this.data.used : 0)) } });
  },

  closeCntTip() { this.setData({ 'cntTip.show': false }); },
  noop() { },
  /* 分享方案: 转发/朋友圈 统一文案 */
  shareText() {
    const S = state.school, H = state.home, N = state.trips.length;
    if (S && H) return '学生票区间规划 · ' + S.name + ' ⇄ ' + H.name + (N ? ' · ' + N + ' 程查票' : '');
    return '学生票区间规划 · 看看你的优惠区间能去哪';
  },
  onShareAppMessage() {
    return { title: this.shareText(), path: '/pages/index/index' };
  },


  /* ---------- 渲染 ---------- */
  renderAll() {
    const S = state.school, H = state.home;
    const planned = this.data.planned;
    // 联程路线段判定
    let cc = null;
    if (planned && S && H) cc = mpChain(S, H, state.trips, false);
    const segOf = i => (cc && cc.segs[i]) ? cc.segs[i] : null;
    const segOk = i => { const sg = segOf(i); return !!(sg && (sg.inInt || sg.hub)); };
    const segHub = i => { const sg = segOf(i); return !!(sg && sg.hub); };
    if (cc) cc.segs.forEach((sg2, i2) => { if (this.hubOverride && this.hubOverride[i2]) { sg2.hub = this.hubOverride[i2]; sg2.ok = sg2.inInt || !!sg2.hub; } });
    const segTxt = i => { const sg = segOf(i); return sg ? (sg.inInt ? '区间内' : sg.hub ? (sg.lowConf ? '⚠ 近邻中转·未实测' : '⇄ 可中转哪里出票·推荐' + sg.hub) : '区间外·需购成人票') : ''; };
    this._cc = cc;
    // 区间线圆点
    const ivDots = state.trips.map((t, i) => {
      if (!t.station || !planned || !S || !H) return null;
      const ok = segOk(i), hub = segHub(i);
      const { t: tt } = corridor(S, H, t.station);
      const left = Math.min(90, Math.max(10, (tt + 0.05) / 1.1 * 100));
      return { left: +left.toFixed(1), cls: ok ? (hub ? 'edge' : 'ok') : 'bad', name: t.text };
    }).filter(Boolean);
    // 列表
    const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    // 控制台分析日志(供复制发送分析)
    if (planned && S && H && cc) {
      console.log('[区间分析] 学校 ' + S.name + ' | 家 ' + H.name + ' | 出发地 ' + (state.depart ? state.depart.name : H.name) + ' | 区间长 ' + Math.round(dist(S, H)) + 'km');
      cc.segs.forEach((sg, i) => {
        const hubs = hubsOf(S, H, sg.a || state.depart || H).slice(0, 4).map(h => h.name).join('、');
        console.log('  #' + (i + 1) + ' ' + (sg.a ? sg.a.name : '?') + '→' + (sg.b ? sg.b.name : '?') + '：'
          + (sg.inInt ? '直达 ✓'
            : sg.hub ? '需中转 · 推荐经' + sg.hub + ' | 候选：' + hubs
            : '区间外 · 需购成人票'));
      });
      console.log('  合计 ' + cc.okN + '/' + cc.segs.length + ' 段可出\n');
    }
    const rows = state.trips.map((t, i) => {
      const ok = segOk(i), hub = segHub(i);
      const j = planned && S && H ? (ok ? (hub ? 1 : 2) : 0) : -1;
      const sg = segOf(i);
      // 直达可行→不再显示中转; 直达不行→显示最多4个候选(两行两列)
      const hubs = (planned && S && H && sg && sg.hub) ? hubsOf(S, H, sg && sg.a ? sg.a : (state.depart || H)).slice(0, 4) : [];
      const hubChips = hubs.map((hc, k) => ({ m: NUMS[k] || (k+1) + '.', n: hc.name, cur: hc.name === (sg && sg.hub), idx: k }));
      const plannedNow = planned && S && H;
      return {
        key: 't' + t.id, id: t.id, iIdx: i, text: t.text,
        boxCls: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : '',
        ring: plannedNow && j >= 0 ? (j === 2 ? 'ok' : j === 1 ? 'edge' : 'bad') : 'none', // 规划前圆点透明(不增删节点, 防渲染层错误)
        status: plannedNow && j >= 1 ? segTxt(i) : '',
        hub: plannedNow && hub ? sg.hub : '', hubs: plannedNow && hubChips.length ? hubChips : [],
        tkt: (plannedNow && sg && sg.a && sg.b) ? (sg.a.name + '→' + sg.b.name) : '',
        anim: false,
      };
    });
    // 消耗次数(联程: 全程可出=1次/往返2次)
    const okN = cc ? cc.okN : 0;
    const badN = cc ? cc.segs.length - cc.okN : 0;
    // 计次: 连续可出段=同一趟行程(无绕路,非往返)→1次; 区间外断程会切分行程; 往返×2
    const roundAll = state.trips.some(t => t.round);
    const runs = [];
    let cur = [];
    if (cc) cc.segs.forEach((sg, i) => {
      if (i < state.trips.length && sg.ok) { cur.push(i); }
      else if (cur.length) { runs.push(cur); cur = []; }
    });
    if (cur.length) runs.push(cur);
    this._ticketRuns = runs;
    const used = Math.max(1, runs.length) * (roundAll ? 2 : 1);
    this.setData({
      ivS: S ? S.name : '学校', ivH: H ? H.name : '出发地', ivDots,
      startName: state.depart ? state.depart.name : '出发地',
      rows, tripCount: state.trips.length,
      okN, edgeN: 0, badN, used, remain: state.budget - used,
    });
  },

  /* ---------- 调试编号层 ---------- */
  toggleDbg() {
    const on = !this.data.dbg.on;
    this.setData({ 'dbg.on': on, 'dbg.showLegend': false });
    if (on) this.dbgMeasure();
  },
  toggleDbgLegend() { this.setData({ 'dbg.showLegend': !this.data.dbg.showLegend }); },
  dbgMeasure() {
    if (!this.data.dbg.on) return;
    const sels = ['.brand-bar', '.status', '.step1', '.step2', '.iv-line.top', '.dest-list', '.dest.start', '.result', '.plan-btn', '.dialog'];
    const q = this.createSelectorQuery();
    sels.forEach(s => q.select(s).boundingClientRect());
    const self = this;
    q.exec(res => {
      if (!self.data.dbg.on) return;
      const badges = [];
      (res || []).forEach((r, i) => {
        if (r && r.width > 0 && r.height > 0) badges.push({ n: i + 1, x: Math.round(r.left + r.width), y: Math.round(r.top) });
      });
      self.setData({ 'dbg.badges': badges });
    });
  },
  onPageScroll() {
    if (this.data.dbg.on) {
      const now = Date.now();
      if (now - (this._dbgT || 0) > 200) { this._dbgT = now; this.dbgMeasure(); }
    }
  },
});
