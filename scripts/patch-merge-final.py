# -*- coding: utf-8 -*-
# 计次定稿v2: 展示可合并最少购票(相邻可出段两两合一) + 分开买注明; MP+网页
MP = 'miniprogram/pages/index/index.js'
s = open(MP, encoding='utf-8').read()

# 1) used 块 → 合并口径
old = """    // 按程计次: 每程=1张票(每程可自行加一次中转查询, 中转次数不限), 单程1次/往返2次, 区间外不计
    const roundAll = state.trips.some(t => t.round);
    const used = cc ? state.trips.reduce((sum, t, i) => sum + ((segOf(i) && segOf(i).ok) ? (t.round ? 2 : 1) : 0), 0) : 0;"""
new = """    // 计次: 相邻可出程段两两合一(一次中转查询, 每张1次)→最少购票; 分开买=每程1张
    const roundAll = state.trips.some(t => t.round);
    const okLegs = [];
    if (cc) cc.segs.forEach((sg, i) => { if (i < state.trips.length && sg.ok) okLegs.push(i); });
    const groups = [];
    for (let k = 0; k < okLegs.length; k += 2) groups.push(okLegs.slice(k, k + 2));
    this._ticketGroups = groups;
    const used = groups.length * (roundAll ? 2 : 1);
    this._sepaUsed = okLegs.length * (roundAll ? 2 : 1);"""
assert old in s; s = s.replace(old, new, 1)

# 2) showCntTip 整函数替换
start = s.index('  showCntTip() {')
end = s.index('  closeCntTip()', start)
new_fn = """  showCntTip() {
    const cc = this._cc;
    if (!cc) return;
    const groups = this._ticketGroups || [];
    const lines = [];
    groups.forEach((g, gi) => {
      const segs = g.map(j => cc.segs[j]);
      const path = segs.map(x => (x.a ? x.a.name : '') + '→' + (x.b ? x.b.name : '')).join('→');
      const tag = segs.length === 2 ? '两段合一（一次中转查询，1张票）' : (segs[0].inInt ? '直达单票' : '中转单票');
      lines.push('第' + (gi + 1) + '张 ' + path + '：' + tag + ' · 1 次');
    });
    cc.segs.forEach((sg, i) => {
      if (i < state.trips.length && !sg.ok) {
        lines.push('区间外 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：需购成人票（不计学生次数）');
      }
    });
    const sep = groups.reduce((s2, g) => s2 + g.length, 0);
    lines.push('分开买则每程 1 张 = ' + sep + ' 次（往返×2则各×2）');
    this.setData({ cntTip: { show: true, lines, used: this.data.used, budget: state.budget, remain: (state.budget - (typeof this.data.used === 'number' ? this.data.used : 0)) } });
  },

"""
s = s[:start] + new_fn + s[end:]
open(MP, 'w', encoding='utf-8', newline='\n').write(s)
b = open(MP, 'rb').read(); open(MP, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP 合并计价+明细 完成')

# ============ 网页 planner ============
p = 'scripts/planner.tpl.html'
s = open(p, encoding='utf-8').read()
old = """  // 按程计次: 每程=1张票(可带一次中转查询, 次数不限), 单程1次/往返2次, 区间外不计
  used = state.trips.reduce((sum, t, i) => {
    const sg = cc.segs[i];
    return sum + (sg && sg.ok ? (t.round ? 2 : 1) : 0);
  }, 0);
  remain = Math.max(0, state.budget - used);"""
new = """  // 计次: 相邻可出段两两合一→最少购票; 分开买=每程1张
  const sgOkArr2 = cc.segs.map((sg, i) => (i < state.trips.length && sg.ok) ? i : -1).filter(i => i >= 0);
  const tGroups2 = [];
  for (let k = 0; k < sgOkArr2.length; k += 2) tGroups2.push(sgOkArr2.slice(k, k + 2));
  used = tGroups2.length * (roundAny() ? 2 : 1);
  sepaUsed2 = sgOkArr2.length * (roundAny() ? 2 : 1);
  remain = Math.max(0, state.budget - used);"""
assert old in s; s = s.replace(old, new, 1)
# 声明 sepaUsed2
old = "  let used=0, remain=Math.max(0,state.budget); // 在 tGroups 后按最省方案计算"
new = "  let used=0, remain=Math.max(0,state.budget), sepaUsed2=0;"
assert old in s; s = s.replace(old, new, 1)
# 摘要行
old = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">按程购票：'+okN+' 张票 · '+used+' 次'+(roundAny()?'（往返×2）':'')+' · 剩余 '+remain+' 次</div>'+"""
new = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">可合并购票：'+tGroups2.length+' 张票 · '+used+' 次'+(roundAny()?'（往返×2）':'')+'（分开买 '+sepaUsed2+' 次）· 剩余 '+remain+' 次</div>'+"""
assert old in s; s = s.replace(old, new, 1)
# 明细 details
start = s.index("  html+='<details><summary>🎫 次数明细（每程怎么消耗）</summary>'")
end = s.index("html+='<details><summary>更多家端点", start)
end = s.rindex("</details>';", start, end) + len("</details>';")
new_details = """  html+='<details><summary>🎫 次数明细（可合并购票）</summary>'+
    tGroups2.map((g, gi) => {
      const segs = g.map(j => cc.segs[j]);
      const path = segs.map(x => esc(x.a.name) + '→' + esc(x.b.name)).join('→');
      return '<div class="mini-row"><div class="n">第' + (gi + 1) + '张 ' + path + '</div><div class="d">' + (segs.length === 2 ? '两段合一·一次中转查询' : (segs[0].inInt ? '直达' : '中转')) + ' · 1 次</div></div>';
    }).join('') +
    cc.segs.filter((sg, i) => i < state.trips.length && !sg.ok).map(sg =>
      '<div class="mini-row"><div class="n">区间外 ' + esc(sg.a.name) + '→' + esc(sg.b.name) + '</div><div class="d">需购成人票·不计</div></div>').join('') +
    '<div style="font-size:11.5px;color:var(--mut);margin-top:6px">相邻两段可合成一张票（购票时查询一次中转）；分开买则每程 1 张=每程 1 次；勾全程往返每张×2；区间外程需成人票。</div>'+
    '</details>';"""
s = s[:start] + new_details + s[end:]
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('网页 planner 合并计价+明细 完成')