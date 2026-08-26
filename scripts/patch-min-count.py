# -*- coding: utf-8 -*-
# 最少次数购票方案: 相邻可出程段两两合成一张联程票(单中转合一), 余段单票
# 应用于 小程序 renderAll/明细 与 网页 renderResult
MP = 'miniprogram/pages/index/index.js'
s = open(MP, encoding='utf-8').read()

# 1) 计次改为最省组票
old = """    // 按程计次: 每程=1张票(含中转联程), 单程1次/往返2次, 区间外不计
    const used = cc ? state.trips.reduce((sum, t, i) => {
      const sg = segOf(i);
      return sum + (sg && sg.ok ? (t.round ? 2 : 1) : 0);
    }, 0) : 0;"""
new = """    // 最省次数: 相邻可出程段两两合成一张联程票(单中转合一, 每张1次), 余段单票; 区间外不计
    let ticketGroups = [];
    if (cc) {
      const legIdx = [];
      cc.segs.forEach((sg, i) => { if (i < state.trips.length && sg.ok) legIdx.push(i); });
      for (let k = 0; k < legIdx.length; k += 2) ticketGroups.push(legIdx.slice(k, k + 2));
    }
    const roundAll = state.trips.some(t => t.round);
    const used = ticketGroups.length * (roundAll ? 2 : 1);
    this._ticketGroups = ticketGroups;"""
assert old in s; s = s.replace(old, new, 1)

# 2) 明细弹窗: 按组票说明
old = """  showCntTip() {
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
  },"""
new = """  showCntTip() {
    const cc = this._cc;
    if (!cc) return;
    const groups = this._ticketGroups || [];
    const lines = groups.map((g, gi) => {
      const segs = g.map(i => cc.segs[i]);
      const path = segs.map(sg => (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '')).join('→');
      const tag = segs.length === 2 ? '两段合成一张联程票（中转合一）' : (segs[0].inInt ? '直达单票' : '中转单票');
      return '第' + (gi + 1) + '张 ' + path + '：' + tag + ' · 1 次';
    });
    // 区间外程(不计学生次数, 需成人票)
    cc.segs.forEach((sg, i) => {
      if (i < cc.segs.length && sg.ok === false) {
        lines.push('区间外 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：需购成人票（不计次数）');
      }
    });
    this.setData({ cntTip: { show: true, lines, used: this.data.used, budget: state.budget, remain: state.budget - (typeof this.data.used === 'number' ? this.data.used : 0) } });
  },"""
assert old in s; s = s.replace(old, new, 1)

open(MP, 'w', encoding='utf-8', newline='\n').write(s)
b = open(MP, 'rb').read(); open(MP, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP: 最省组票计次 + 明细组票 完成')

# ============ 网页 planner ============
p = 'scripts/planner.tpl.html'
s = open(p, encoding='utf-8').read()
old = """  const hubN=cc.segs.filter(sg=>sg.hub).length;
  const dirN=cc.segs.filter(sg=>sg.inInt).length;"""
new = """  const hubN=cc.segs.filter(sg=>sg.hub).length;
  const dirN=cc.segs.filter(sg=>sg.inInt).length;
  // 最省次数: 相邻可出程段两两合成联程票, 余段单票
  const sgOkArr = cc.segs.map((sg, i) => (i < state.trips.length && sg.ok) ? i : -1).filter(i => i >= 0);
  const tGroups = [];
  for (let k = 0; k < sgOkArr.length; k += 2) tGroups.push(sgOkArr.slice(k, k + 2));
  const minUsed = tGroups.length * (roundAny() ? 2 : 1);
  const remain2 = Math.max(0, state.budget - minUsed);"""
assert old in s; s = s.replace(old, new, 1)

old = """  const used=cc.okAll?(roundAny()?2:1):0;
  const remain=Math.max(0,state.budget-used);"""
new = """  const used=minUsed; // 最省次数口径
  const remain=Math.max(0,state.budget-used);"""
assert old in s; s = s.replace(old, new, 1)

# 摘要行: 最省购票信息
old = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+"""
new = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">最省方案：'+tGroups.length+' 张票 · '+used+' 次'+(roundAny()?'（往返×2）':'')+' · 剩余 '+remain+' 次</div>'+"""
assert old in s; s = s.replace(old, new, 1)

# 底部次数明细: 组票列表
old = """  html+='<details><summary>更多家端点（区间优化）</summary>'+optRows()+'</details>';"""
new = """  html+='<details><summary>🎫 次数明细（怎么省到最少）</summary>'+
    tGroups.map((g, gi) => {
      const segs = g.map(j => cc.segs[j]);
      const path = segs.map(x => esc(x.a.name) + '→' + esc(x.b.name)).join('→');
      return '<div class="mini-row"><div class="n">第' + (gi + 1) + '张 ' + path + '</div><div class="d">' + (segs.length === 2 ? '两段合成联程票（中转合一）' : (segs[0].inInt ? '直达' : '中转')) + ' · 1 次</div></div>';
    }).join('') +
    cc.segs.filter((sg, i) => i < state.trips.length && !sg.ok).map(sg =>
      '<div class="mini-row"><div class="n">区间外 ' + esc(sg.a.name) + '→' + esc(sg.b.name) + '</div><div class="d">需购成人票 · 不计</div></div>').join('') +
    '<div style="font-size:11.5px;color:var(--mut);margin-top:6px">每张票=1次（含中转联程）；相邻两段可合成一张单中转联程票；勾全程往返每张×2。</div>' +
    '</details>';
  html+='<details><summary>更多家端点（区间优化）</summary>'+optRows()+'</details>';"""
assert old in s; s = s.replace(old, new, 1)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('网页 planner: 最省组票 + 次数明细 完成')