# -*- coding: utf-8 -*-
# 小程序: ①卡片右上角"从哪到哪" ②按程最小计次 ③底部次数疑问→区间内明细弹窗
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

# 1) 行数据: tkt 标签(从哪到哪)
old = """        hub: plannedNow && hub ? sg.hub : '', hubs: plannedNow && hubChips.length ? hubChips : [],
        anim: false,"""
new = """        hub: plannedNow && hub ? sg.hub : '', hubs: plannedNow && hubChips.length ? hubChips : [],
        tkt: (plannedNow && sg && sg.a && sg.b) ? (sg.a.name + '→' + sg.b.name) : '',
        anim: false,"""
assert old in s; s = s.replace(old, new, 1)

# 2) 按程计次(每程1张票: 中转联程也算该程1次; 往返×2; 扣除区间外程)
old = """    const used = cc && cc.okAll ? (state.trips.some(t => t.round) ? 2 : 1) : 0;"""
new = """    // 按程计次: 每程=1张票(含中转联程), 单程1次/往返2次, 区间外不计
    const used = cc ? state.trips.reduce((sum, t, i) => {
      const sg = segOf(i);
      return sum + (sg && sg.ok ? (t.round ? 2 : 1) : 0);
    }, 0) : 0;"""
assert old in s; s = s.replace(old, new, 1)

# 3) 次数明细弹窗数据 + 触发
old = """  closeTfm() { this.setData({ 'tfm.show': false }); },"""
new = """  closeTfm() { this.setData({ 'tfm.show': false }); },
  /* 次数疑问: 区间内消耗明细 */
  showCntTip() {
    const S = state.school, H = state.home, cc = this._cc;
    if (!cc) return;
    const lines = cc.segs.map((sg, i) => {
      const isTrip = i < state.trips.length;
      const t = isTrip ? state.trips[i] : null;
      const tag = sg.inInt ? '直达' : sg.hub ? '中转·经' + sg.hub : '区间外';
      const n = (isTrip && t && sg.ok) ? (t.round ? 2 : 1) : 0;
      return (isTrip ? (i + 1) + '. ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') : '回程 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : ''))
        + '：' + tag + (n ? ' · ' + n + ' 次' : ' · 不计');
    });
    const used = lines ? 0 : 0; // 用已计算的 used
    this.setData({ cntTip: { show: true, lines, used: this.data.used, budget: state.budget, remain: state.budget - (typeof this.data.used === 'number' ? this.data.used : 0) } });
  },
  closeCntTip() { this.setData({ 'cntTip.show': false }); },"""
assert old in s; s = s.replace(old, new, 1)

# 4) data: cntTip 初始
old = """    tfm: { show: false, step: 1, i: -1, hub: '', a: '', b: '', S: '', H: '', cands: [] },"""
new = """    tfm: { show: false, step: 1, i: -1, hub: '', a: '', b: '', S: '', H: '', cands: [] },
    cntTip: { show: false, lines: [], used: '–', budget: 4, remain: '–' },"""
assert old in s; s = s.replace(old, new, 1)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP index.js: tkt/按程计次/cntTip 完成')

# 5) wxml: 右上角 tkt + 底部疑问入口 + 明细弹窗
p = 'miniprogram/pages/index/index.wxml'
s = open(p, encoding='utf-8').read()
old = """          <text class="status" wx:if="{{item.status}}">{{item.status}}</text>
          <view wx:if="{{item.hubs.length}}" class="hub-line">"""
new = """          <text class="tkt" wx:if="{{item.tkt}}">{{item.tkt}}</text>
          <text class="status" wx:if="{{item.status}}">{{item.status}}</text>
          <view wx:if="{{item.hubs.length}}" class="hub-line">"""
assert old in s; s = s.replace(old, new, 1)

old = """      <!-- 结果: 消耗次数 -->"""
new = """      <view class="cnt-entry" wx:if="{{planned}}" catchtap="showCntTip">❓ 当前消耗次数有疑问？点此查看区间内明细</view>

      <!-- 结果: 消耗次数 -->"""
assert old in s; s = s.replace(old, new, 1)

old = """  <!-- 中转购买说明(分步向导, 仿网页) -->"""
new = """  <!-- 次数明细弹窗 -->
  <view class="mask" wx:if="{{cntTip.show}}" bindtap="closeCntTip">
    <view class="dialog" catchtap="noop">
      <view class="dialog-title">🎫 次数明细（区间内怎么消耗）<text class="dialog-close" catchtap="closeCntTip">✕</text></view>
      <view class="dialog-body">
        <view class="m-line" wx:for="{{cntTip.lines}}" wx:key="*this">{{item}}</view>
        <view class="m-note">每程=1张票：直达到达计 1 次，中转联程（同一程内）仍计该程 1 次；勾选全程往返再 +1 次/程。区间外程不计学生优惠。</view>
        <view class="m-line"><b>合计 {{cntTip.used}} / {{cntTip.budget}} 次 · 剩余 {{cntTip.remain}} 次</b></view>
      </view>
      <view class="dialog-btns">
        <button hover-class="bh" class="btn primary sm" catchtap="closeCntTip">知道了</button>
      </view>
    </view>
  </view>

  <!-- 中转购买说明(分步向导, 仿网页) -->"""
assert old in s; s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP wxml: tkt/入口/明细弹窗 完成')

# 6) wxss: tkt + cnt-entry
p = 'miniprogram/pages/index/index.wxss'
s = open(p, encoding='utf-8').read()
s += """
/* 1.0.14: 票面标签 + 次数疑问入口 */
.tkt{font-size:10px;color:#a8a29e;margin-left:auto;padding-right:6px}
.cnt-entry{margin-top:2px;padding:10px 12px;font-size:12.5px;color:#4f46e5;background:rgba(79,70,229,.06);border:1px dashed rgba(79,70,229,.3);border-radius:10px;text-align:center}
"""
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP wxss 完成')