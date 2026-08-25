# -*- coding: utf-8 -*-
# 小程序: 中转行橙色(edge)+点击弹说明 (在 git 恢复后的干净版上应用)
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

# 1) renderAll: segHub + status 文案 + this._cc
old = """    const segOf = i => (cc && cc.segs[i]) ? cc.segs[i] : null;
    const segOk = i => { const sg = segOf(i); return !!(sg && (sg.inInt || sg.hub)); };
    const segTxt = i => { const sg = segOf(i); return sg ? (sg.inInt ? '区间内' : sg.hub ? '中转·经' + sg.hub : '区间外') : ''; };"""
new = """    const segOf = i => (cc && cc.segs[i]) ? cc.segs[i] : null;
    const segOk = i => { const sg = segOf(i); return !!(sg && (sg.inInt || sg.hub)); };
    const segHub = i => { const sg = segOf(i); return !!(sg && sg.hub); };
    const segTxt = i => { const sg = segOf(i); return sg ? (sg.inInt ? '区间内' : sg.hub ? '中转·经' + sg.hub + '（点此看说明）' : '区间外') : ''; };
    this._cc = cc;"""
assert old in s; s = s.replace(old, new, 1)

# 2) 圆点: 中转→edge橙
old = """      if (!t.station || !planned || !S || !H) return null;
      const ok = segOk(i);
      const { t: tt } = corridor(S, H, t.station);
      const left = Math.min(90, Math.max(10, (tt + 0.05) / 1.1 * 100));
      return { left: +left.toFixed(1), cls: ok ? 'ok' : 'bad', name: t.text };"""
new = """      if (!t.station || !planned || !S || !H) return null;
      const ok = segOk(i), hub = segHub(i);
      const { t: tt } = corridor(S, H, t.station);
      const left = Math.min(90, Math.max(10, (tt + 0.05) / 1.1 * 100));
      return { left: +left.toFixed(1), cls: ok ? (hub ? 'edge' : 'ok') : 'bad', name: t.text };"""
assert old in s; s = s.replace(old, new, 1)

# 3) 行: 中转→edge
old = """    const rows = state.trips.map((t, i) => {
      const j = planned && S && H ? (segOk(i) ? 2 : 0) : -1;
      return {
        key: 't' + t.id, id: t.id, text: t.text,
        boxCls: j === 2 ? 'ok' : j === 0 ? 'bad' : '',
        ring: j === 2 ? 'ok' : j === 0 ? 'bad' : 'none',
        status: j === 2 ? segTxt(i) : '',
        anim: false,
      };
    });"""
new = """    const rows = state.trips.map((t, i) => {
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
assert old in s; s = s.replace(old, new, 1)

# 4) onPlan modal dests: 中转→橙
old = """    modal.dests = state.trips.map((t, i) => {
      const sg = cc0 ? cc0.segs[i] : null;
      const ok = !!(sg && (sg.inInt || sg.hub));
      const c = sg && sg.inInt ? '区间内·可买' : sg && sg.hub ? '中转可出·经' + sg.hub : '超区间·不能买';
      return { text: t.text, c, cls: ok ? 'g2' : 'b2' };
    });"""
new = """    modal.dests = state.trips.map((t, i) => {
      const sg = cc0 ? cc0.segs[i] : null;
      const c = sg && sg.inInt ? '区间内·可买' : sg && sg.hub ? '中转可出·经' + sg.hub : '超区间·不能买';
      const cls = sg && sg.inInt ? 'g2' : sg && sg.hub ? 'e2' : 'b2';
      return { text: t.text, c, cls };
    });"""
assert old in s; s = s.replace(old, new, 1)

# 5) tfmTap: 点击中转行 → 原生弹窗(正确 \\n 转义)
old = """  closeModal() { this.setData({ 'modal.show': false }); },"""
NL = chr(92) + 'n'  # 反斜杠+n 文本
new = """  closeModal() { this.setData({ 'modal.show': false }); },
  /* 中转段点击: 原生弹窗说明(区间不变/中转站/首段学生票/后续放行/全程1次) */
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
assert old in s; s = s.replace(old, new, 1)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read()
open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序中转橙色+点击弹窗 已重打(干净)')