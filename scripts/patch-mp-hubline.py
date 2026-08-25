# -*- coding: utf-8 -*-
# 小程序: 中转行内嵌"最终中转可选①②③…(点选应用)" + 覆盖
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

# 1) renderAll: 应用覆盖 + 行内背包数据
old = """    const segOf = i => (cc && cc.segs[i]) ? cc.segs[i] : null;
    const segOk = i => { const sg = segOf(i); return !!(sg && (sg.inInt || sg.hub)); };
    const segHub = i => { const sg = segOf(i); return !!(sg && sg.hub); };"""
new = """    const segOf = i => (cc && cc.segs[i]) ? cc.segs[i] : null;
    const segOk = i => { const sg = segOf(i); return !!(sg && (sg.inInt || sg.hub)); };
    const segHub = i => { const sg = segOf(i); return !!(sg && sg.hub); };
    if (cc) cc.segs.forEach((sg2, i2) => { if (this.hubOverride && this.hubOverride[i2]) { sg2.hub = this.hubOverride[i2]; sg2.ok = sg2.inInt || !!sg2.hub; } });"""
assert old in s; s = s.replace(old, new, 1)

old = """    const rows = state.trips.map((t, i) => {
      const ok = segOk(i), hub = segHub(i);
      const j = planned && S && H ? (ok ? (hub ? 1 : 2) : 0) : -1;
      return {
        key: 't' + t.id, id: t.id, text: t.text,
        boxCls: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : '',
        ring: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : 'none',
        status: j >= 1 ? segTxt(i) : '',
        anim: false,
      };
    });"""
new = """    const NUMS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];
    const rows = state.trips.map((t, i) => {
      const ok = segOk(i), hub = segHub(i);
      const j = planned && S && H ? (ok ? (hub ? 1 : 2) : 0) : -1;
      const sg = segOf(i);
      const hubs = hubsOf(S, H, sg && sg.a ? sg.a : (state.depart || H));
      const hubChips = hubs.map((hc, k) => ({ m: NUMS[k] || k + '.', n: hc.name, cur: hc.name === (sg && sg.hub) }));
      return {
        key: 't' + t.id, id: t.id, text: t.text,
        boxCls: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : '',
        ring: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : 'none',
        status: j >= 1 ? segTxt(i) : '',
        hub: hub ? sg.hub : '', hubs: hub ? hubChips : [],
        anim: false,
      };
    });"""
assert old in s; s = s.replace(old, new, 1)

# 2) setHubTap: 行内点选最终中转站
old = """  tfmPick(j) {"""
new = """  setHubTap(e) {
    const i = Number(e.currentTarget.dataset.i);
    const j = Number(e.currentTarget.dataset.j);
    const sg = this._cc && this._cc.segs[i];
    if (!sg || !sg.hub) return;
    const hubs = hubsOf(state.school, state.home, sg.a || state.depart || state.home);
    const c = hubs[j]; if (!c) return;
    this.hubOverride = this.hubOverride || {};
    this.hubOverride[i] = c.name;   // 该段最终中转=所选站
    this.renderAll();
  },
  tfmPick(j) {"""
assert old in s; s = s.replace(old, new, 1)

# 3) onPlan/applySuggestion: 新规划重置中转选择
old = """  onPlan() {
    if (!state.trips.length) { this.setStatus('先添加想去的地方'); return; }"""
new = """  onPlan() {
    this.hubOverride = {}; // 新规划重置中转选择
    if (!state.trips.length) { this.setStatus('先添加想去的地方'); return; }"""
assert old in s; s = s.replace(old, new, 1)
old = """    state.home = { name: s.name, city: s.city, lat: s.lat, lon: s.lon };
    this.setData({ ivH: state.home.name, planned: true });"""
new = """    state.home = { name: s.name, city: s.city, lat: s.lat, lon: s.lon };
    this.hubOverride = {};
    this.setData({ ivH: state.home.name, planned: true });"""
assert old in s; s = s.replace(old, new, 1)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 renderAll 行内候选 + setHubTap 完成')

# 4) wxml: 行内"最终中转可选"行
p = 'miniprogram/pages/index/index.wxml'
s = open(p, encoding='utf-8').read()
old = """          <text class="status" wx:if="{{item.status}}">{{item.status}}</text>
          <text class="x" data-id="{{item.id}}" catchtap="removeTrip">✕</text>"""
new = """          <text class="status" wx:if="{{item.status}}">{{item.status}}</text>
          <view wx:if="{{item.hub}}" class="hub-line">
            <text class="hub-tag">最终中转可选：</text>
            <text wx:for="{{item.hubs}}" wx:key="n" wx:for-item="hb" class="hub-chip {{hb.cur?'on':''}}" data-i="{{index}}" data-j="{{index2 || hb.idx}}" catchtap="setHubTap">{{hb.m}}{{hb.n}}</text>
          </view>
          <text class="x" data-id="{{item.id}}" catchtap="removeTrip">✕</text>"""
assert old in s; s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 wxml: 行内最终中转 完成')

# 修正: wxml 里 data-j 需要真实索引(嵌套wx:for), 用 hubChips 带 idx 字段
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()
old = "      const hubChips = hubs.map((hc, k) => ({ m: NUMS[k] || k + '.', n: hc.name, cur: hc.name === (sg && sg.hub) }));"
new = "      const hubChips = hubs.map((hc, k) => ({ m: NUMS[k] || (k + 1) + '.', n: hc.name, cur: hc.name === (sg && sg.hub), idx: k }));"
assert old in s; s = s.replace(old, new, 1)
old = "data-j=\"{{index2 || hb.idx}}\""
new = "data-j=\"{{hb.idx}}\""
assert old in s; s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('索引修正完成')

# 5) wxss: hub-line
p = 'miniprogram/pages/index/index.wxss'
s = open(p, encoding='utf-8').read()
s += """
/* 1.0.13: 行内最终中转候选 */
.hub-line{flex-basis:100%;padding:7px 2px 2px;font-size:11px;color:#a16207;line-height:1.7}
.hub-tag{color:#92400e}
"""
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 wxss: hub-line 完成')