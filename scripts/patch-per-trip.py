# -*- coding: utf-8 -*-
# 计次口径回退: 按程计次(每程1张票=1次, 往返2, 区间外不计);
# 中转=每程自行查询(12306单次查询限1个中转站, 对中转次数无限制), 不做两两压票
MP = 'miniprogram/pages/index/index.js'
s = open(MP, encoding='utf-8').read()

# 1) 按程计次(去掉组票)
old = """    // 最省次数: 相邻可出程段两两合成一张联程票(单中转合一, 每张1次), 余段单票; 区间外不计
    let ticketGroups = [];
    if (cc) {
      const legIdx = [];
      cc.segs.forEach((sg, i) => { if (i < state.trips.length && sg.ok) legIdx.push(i); });
      for (let k = 0; k < legIdx.length; k += 2) ticketGroups.push(legIdx.slice(k, k + 2));
    }
    const roundAll = state.trips.some(t => t.round);
    const used = ticketGroups.length * (roundAll ? 2 : 1);
    this._ticketGroups = ticketGroups;"""
new = """    // 按程计次: 每程=1张票(每程可自行加一次中转查询, 中转次数不限), 单程1次/往返2次, 区间外不计
    const roundAll = state.trips.some(t => t.round);
    const used = cc ? state.trips.reduce((sum, t, i) => sum + ((segOf(i) && segOf(i).ok) ? (t.round ? 2 : 1) : 0), 0) : 0;"""
assert old in s; s = s.replace(old, new, 1)

# 2) 明细弹窗: 逐程说明(不再组票)
old = """  showCntTip() {
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
new = """  showCntTip() {
    const cc = this._cc;
    if (!cc) return;
    const lines = cc.segs.map((sg, i) => {
      const isTrip = i < state.trips.length;
      const t = isTrip ? state.trips[i] : null;
      if (!isTrip || sg.ok === false) {
        return (isTrip ? '区间外 ' : '回程 ') + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：需购成人票（不计学生次数）';
      }
      return '第' + (i + 1) + '张 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：'
        + (sg.inInt ? '直达' : '中转·经' + sg.hub) + (t && t.round ? ' · 往返 2 次' : ' · 1 次');
    });
    this.setData({ cntTip: { show: true, lines, used: this.data.used, budget: state.budget, remain: state.budget - (typeof this.data.used === 'number' ? this.data.used : 0) } });
  },"""
assert old in s; s = s.replace(old, new, 1)
open(MP, 'w', encoding='utf-8', newline='\n').write(s)
b = open(MP, 'rb').read(); open(MP, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP 按程计次 完成')

# ============ 网页 planner ============
p = 'scripts/planner.tpl.html'
s = open(p, encoding='utf-8').read()
old = """  // 最省次数: 相邻可出程段两两合成联程票, 余段单票
  const sgOkArr = cc.segs.map((sg, i) => (i < state.trips.length && sg.ok) ? i : -1).filter(i => i >= 0);
  const tGroups = [];
  for (let k = 0; k < sgOkArr.length; k += 2) tGroups.push(sgOkArr.slice(k, k + 2));
  const minUsed = tGroups.length * (roundAny() ? 2 : 1);
  used = minUsed;
  remain = Math.max(0, state.budget - used);"""
new = """  // 按程计次: 每程=1张票(可带一次中转查询, 次数不限), 单程1次/往返2次, 区间外不计
  used = state.trips.reduce((sum, t, i) => {
    const sg = cc.segs[i];
    return sum + (sg && sg.ok ? (t.round ? 2 : 1) : 0);
  }, 0);
  remain = Math.max(0, state.budget - used);"""
assert old in s; s = s.replace(old, new, 1)

old = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">最省方案：'+tGroups.length+' 张票 · '+used+' 次'+(roundAny()?'（往返×2）':'')+' · 剩余 '+remain+' 次</div>'+"""
new = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">按程购票：'+okN+' 张票 · '+used+' 次'+(roundAny()?'（往返×2）':'')+' · 剩余 '+remain+' 次</div>'+"""
assert old in s; s = s.replace(old, new, 1)

old = """  html+='<details><summary>🎫 次数明细（怎么省到最少）</summary>'+
    tGroups.map((g, gi) => {
      const segs = g.map(j => cc.segs[j]);
      const path = segs.map(x => esc(x.a.name) + '→' + esc(x.b.name)).join('→');
      return '<div class="mini-row"><div class="n">第' + (gi + 1) + '张 ' + path + '</div><div class="d">' + (segs.length === 2 ? '两段合成联程票（中转合一）' : (segs[0].inInt ? '直达' : '中转')) + ' · 1 次</div></div>';
    }).join('') +
    cc.segs.filter((sg, i) => i < state.trips.length && !sg.ok).map(sg =>
      '<div class="mini-row"><div class="n">区间外 ' + esc(sg.a.name) + '→' + esc(sg.b.name) + '</div><div class="d">需购成人票 · 不计</div></div>').join('') +
    '<div style="font-size:11.5px;color:var(--mut);margin-top:6px">每张票=1次（含中转联程）；相邻两段可合成一张单中转联程票；勾全程往返每张×2。</div>' +
    '</details>';"""
new = """  html+='<details><summary>🎫 次数明细（每程怎么消耗）</summary>'+
    cc.segs.map((sg, i) => {
      if (i >= state.trips.length || !sg.ok) {
        return '<div class="mini-row"><div class="n">' + (i >= state.trips.length ? '回程 ' : '区间外 ') + esc(sg.a.name) + '→' + esc(sg.b.name) + '</div><div class="d">' + (i >= state.trips.length ? '随往返计' : '需购成人票·不计') + '</div></div>';
      }
      const t = state.trips[i];
      return '<div class="mini-row"><div class="n">第' + (i + 1) + '张 ' + esc(sg.a.name) + '→' + esc(sg.b.name) + '</div><div class="d">' + (sg.inInt ? '直达' : '中转·经' + esc(sg.hub)) + (t && t.round ? ' · 往返 2 次' : ' · 1 次') + '</div></div>';
    }).join('') +
    '<div style="font-size:11.5px;color:var(--mut);margin-top:6px">每程=1张票（每程查询时可自行选 1 个中转站，对中转次数无限制）；勾全程往返每张×2；区间外程需成人票。</div>' +
    '</details>';"""
assert old in s; s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('网页 planner 按程计次 完成')