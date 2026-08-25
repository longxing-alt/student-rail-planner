# -*- coding: utf-8 -*-
# 小程序: 中转行展示/分步弹窗/采用状态说明 (仿网页 planner)
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

# 1) 行状态: hub → '⇄ 可中转哪里出票·推荐X'
old = """    const segTxt = i => { const sg = segOf(i); return sg ? (sg.inInt ? '区间内' : sg.hub ? '中转·经' + sg.hub + '（点此看说明）' : '区间外') : ''; };"""
new = """    const segTxt = i => { const sg = segOf(i); return sg ? (sg.inInt ? '区间内' : sg.hub ? '⇄ 可中转哪里出票·推荐' + sg.hub : '区间外·需购成人票') : ''; };"""
assert old in s; s = s.replace(old, new, 1)

# 2) 中转候选(区间内枢纽, 按距发站近排序) — 页面级工具
old = """/* 最优区间端点(联程): 枚举全部车站, 联程段覆盖(okN)优先 → 平局按 段端点p/L最小 → 距当前端点近 */"""
new = """/* 区间内可选中转站(空间带, 按推荐从高到低=距发站近) */
function hubsOf(S, H, dep) {
  const out = [];
  for (const sc of STATIONS) {
    if (sc[4] !== 1) continue;
    const T = { name: sc[0], city: sc[1], lat: sc[2], lon: sc[3] };
    if (T.name === S.name || T.name === H.name) continue;
    if (!logic.bandOK(S, H, T)) continue;
    out.push({ name: T.name, km: Math.round(dist(dep || S, T)) });
  }
  out.sort((a, b) => a.km - b.km);
  return out.slice(0, 8);
}
/* 最优区间端点(联程): 枚举全部车站, 联程段覆盖(okN)优先 → 平局按 段端点p/L最小 → 距当前端点近 */"""
assert old in s; s = s.replace(old, new, 1)

# 3) tfmTap → 分步向导数据(仿网页)
old = """  /* 中转段点击: 原生弹窗说明(区间不变/中转站/首段学生票/后续放行/全程1次) */
  tfmTap(e) {
    const i = Number(e.currentTarget.dataset.i);
    const cc = this._cc;
    const sg = cc && cc.segs[i];
    if (!sg || !sg.hub) return;
    const S = state.school, H = state.home;
    wx.showModal({
      title: '⇄ 中转购买说明',
      content: '优惠区间 ' + (S ? S.name : '学校') + ' ⇄ ' + (H ? H.name : '家') + ' 不变。' + NL
        + '① 12306 选「中转」，中转站填 ' + sg.hub + '（区间内站）。' + NL
        + '② 首段 ' + (sg.a ? sg.a.name : '') + ' → ' + sg.hub + ' 按学生票购买（两端都在区间内）。' + NL
        + '③ 后续段 ' + sg.hub + ' → ' + (sg.b ? sg.b.name : '') + ' 随联程放行。' + NL
        + '全程计 1 次优惠；实际以 12306 出票为准。',
      showCancel: false, confirmText: '知道了',
    });
  },"""
new = """  /* 中转段点击: 分步向导(与网页端一致) */
  tfmTap(e) {
    const i = Number(e.currentTarget.dataset.i);
    const cc = this._cc;
    const sg = cc && cc.segs[i];
    if (!sg || !sg.hub) return;
    const S = state.school, H = state.home;
    const dep = state.depart || H;
    const cands = hubsOf(S, H, (sg.a && sg.a.name) ? sg.a : dep);
    this.setData({ tfm: {
      show: true, step: 1, i,
      hub: sg.hub, a: sg.a ? sg.a.name : '', b: sg.b ? sg.b.name : '',
      S: S ? S.name : '学校', H: H ? H.name : '家', cands,
    } });
  },
  tfmPick(j) {
    const tfm = this.data.tfm;
    if (!tfm || !tfm.cands[j]) return;
    this.setData({ 'tfm.hub': tfm.cands[j].name, 'tfm.step': 3 }); // 后续步骤以选中站为例
  },
  tfmNext() { const st = Math.min(4, this.data.tfm.step + 1); this.setData({ 'tfm.step': st }); },
  tfmPrev() { const st = Math.max(1, this.data.tfm.step - 1); this.setData({ 'tfm.step': st }); },
  closeTfm() { this.setData({ 'tfm.show': false }); },"""
assert old in s; s = s.replace(old, new, 1)

# 4) 采用推荐区间: 状态说明(仿网页 adoptNote)
old = """  applySuggestion() {
    const s = this.data.modal.suggest;
    if (!s) return;
    state.home = { name: s.name, city: s.city, lat: s.lat, lon: s.lon };
    this.setData({ ivH: state.home.name, planned: true });
    this.renderAll();
    this.closeModal();
    this.setStatus('区间端点改为 ' + state.home.name + '（学校 ' + state.school.name + ' ↔ ' + state.home.name + '），颜色已按新区间判定；出发地保持 ' + state.depart.name);
  },"""
new = """  applySuggestion() {
    const s = this.data.modal.suggest;
    if (!s) return;
    state.home = { name: s.name, city: s.city, lat: s.lat, lon: s.lon };
    this.setData({ ivH: state.home.name, planned: true });
    this.renderAll();
    this.closeModal();
    this.setStatus('已按推荐改家为 ' + state.home.name + '；出发地（' + (state.depart ? state.depart.name : state.home.name) + '）不变，已按新区间 ' + state.school.name + ' ⇄ ' + state.home.name + ' 重新判定');
  },"""
assert old in s; s = s.replace(old, new, 1)

# 5) data: tfm 初始值 + hubsOf 前置依赖(dist/STATIONS 已解构)
old = """    planned: false, used: '–', budget: 4, remain: '–', okN: 0, edgeN: 0, badN: 0,"""
new = """    planned: false, used: '–', budget: 4, remain: '–', okN: 0, edgeN: 0, badN: 0,
    tfm: { show: false, step: 1, i: -1, hub: '', a: '', b: '', S: '', H: '', cands: [] },"""
assert old in s; s = s.replace(old, new, 1)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 index.js: 中转分步向导数据+采用说明 完成')

# 6) wxml: 中转向导弹窗(仿网页分步)
p = 'miniprogram/pages/index/index.wxml'
s = open(p, encoding='utf-8').read()
old = """  <!-- 调试编号层（长按品牌头开关） -->"""
new = """  <!-- 中转购买说明(分步向导, 仿网页) -->
  <view class="mask" wx:if="{{tfm.show}}" bindtap="closeTfm">
    <view class="dialog" catchtap="noop">
      <view class="dialog-title">⇄ 中转购买说明<text class="dialog-close" catchtap="closeTfm">✕</text></view>
      <view class="dialog-body" wx:if="{{tfm.step===1}}">
        <view class="m-line"><b>区间不用改</b>：保持<b>优惠区间为 {{tfm.S}} ⇄ {{tfm.H}}</b> 不变，只做中转。</view>
      </view>
      <view class="dialog-body" wx:if="{{tfm.step===2}}">
        <view class="m-line">选择在 12306 上<b>可以中转的地点</b>（①推荐 ②次选…，点选后以下步骤以它为例）：</view>
        <view class="m-line" style="flex-wrap:wrap;gap:6px" wx:for="{{tfm.cands}}" wx:key="name">
          <text class="hub-chip {{item.name===tfm.hub?'on':''}}" data-j="{{index}}" catchtap="tfmPick">{{index===0?'①':index===1?'②':index===2?'③':index===3?'④':index===4?'⑤':index===5?'⑥':index===6?'⑦':'⑧'}}{{item.name}}</text>
        </view>
      </view>
      <view class="dialog-body" wx:if="{{tfm.step===3}}">
        <view class="m-line">在 12306 购票时选「<b>中转</b>」，中转站填 <b>{{tfm.hub}}</b>。</view>
        <view class="m-line">首段 <b>{{tfm.a}} → {{tfm.hub}}</b> 按学生票购买（两端都在区间内）。</view>
      </view>
      <view class="dialog-body" wx:if="{{tfm.step===4}}">
        <view class="m-line">后续段 <b>{{tfm.hub}} → {{tfm.b}}</b> 随联程放行，全程计 1 次优惠。</view>
        <view class="m-note">实际以 12306 出票为准；若该中转站没有合适后续车，回到上一步换一个站。</view>
      </view>
      <view class="dialog-btns">
        <button hover-class="bh" class="btn ghost sm" wx:if="{{tfm.step>1}}" catchtap="tfmPrev">← 上一步</button>
        <button hover-class="bh" class="btn primary sm" wx:if="{{tfm.step<4}}" catchtap="tfmNext">下一步</button>
        <button hover-class="bh" class="btn primary sm" wx:if="{{tfm.step===4}}" catchtap="closeTfm">知道了</button>
      </view>
    </view>
  </view>

  <!-- 调试编号层（长按品牌头开关） -->"""
assert old in s; s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 wxml: 中转分步向导 完成')

# 7) wxss: hub-chip 样式(仿网页胶囊)
p = 'miniprogram/pages/index/index.wxss'
s = open(p, encoding='utf-8').read()
s += """
/* 1.0.12: 中转候选胶囊(仿网页) */
.hub-chip{display:inline-block;font-size:13px;font-weight:600;color:#d97706;background:rgba(245,158,11,.09);border:1px solid rgba(245,158,11,.35);border-radius:99px;padding:6px 14px;margin:4px 6px 0 0;line-height:1.4}
.hub-chip.on{background:rgba(245,158,11,.18);border-color:#d97706}
"""
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 wxss: hub-chip 完成')