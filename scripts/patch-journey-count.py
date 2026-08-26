# -*- coding: utf-8 -*-
# 计次定稿v3: 连续可出段组(run)=1次(无绕路,非往返); 断程(区间外成人票)切分; 往返×2
MP = 'miniprogram/pages/index/index.js'
s = open(MP, encoding='utf-8').read()

old = """    // 计次: 相邻可出程段两两合一(一次中转查询, 每张1次)→最少购票; 分开买=每程1张
    const roundAll = state.trips.some(t => t.round);
    const okLegs = [];
    if (cc) cc.segs.forEach((sg, i) => { if (i < state.trips.length && sg.ok) okLegs.push(i); });
    const groups = [];
    for (let k = 0; k < okLegs.length; k += 2) groups.push(okLegs.slice(k, k + 2));
    this._ticketGroups = groups;
    const used = groups.length * (roundAll ? 2 : 1);
    this._sepaUsed = okLegs.length * (roundAll ? 2 : 1);"""
new = """    // 计次: 连续可出段=同一趟行程(无绕路,非往返)→1次; 区间外断程会切分行程; 往返×2
    const roundAll = state.trips.some(t => t.round);
    const runs = [];
    let cur = [];
    if (cc) cc.segs.forEach((sg, i) => {
      if (i < state.trips.length && sg.ok) { cur.push(i); }
      else if (cur.length) { runs.push(cur); cur = []; }
    });
    if (cur.length) runs.push(cur);
    this._ticketRuns = runs;
    const used = Math.max(1, runs.length) * (roundAll ? 2 : 1);"""
assert old in s; s = s.replace(old, new, 1)

start = s.index('  showCntTip() {')
end = s.index('  closeCntTip()', start)
new_fn = """  showCntTip() {
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

"""
s = s[:start] + new_fn + s[end:]
open(MP, 'w', encoding='utf-8', newline='\n').write(s)
b = open(MP, 'rb').read(); open(MP, 'wb').write(b.replace(b'\r\n', b'\n'))
print('MP 连续行程计次 完成')

# ============ 网页 planner ============
p = 'scripts/planner.tpl.html'
s = open(p, encoding='utf-8').read()
old = """  // 计次: 相邻可出段两两合一→最少购票; 分开买=每程1张
  const sgOkArr2 = cc.segs.map((sg, i) => (i < state.trips.length && sg.ok) ? i : -1).filter(i => i >= 0);
  const tGroups2 = [];
  for (let k = 0; k < sgOkArr2.length; k += 2) tGroups2.push(sgOkArr2.slice(k, k + 2));
  used = tGroups2.length * (roundAny() ? 2 : 1);
  sepaUsed2 = sgOkArr2.length * (roundAny() ? 2 : 1);
  remain = Math.max(0, state.budget - used);"""
new = """  // 计次: 连续可出段=同一趟行程(无绕路,非往返)→1次; 区间外断程切分; 往返×2
  const okRuns = [];
  let curR = [];
  cc.segs.forEach((sg, i) => {
    if (i < state.trips.length && sg.ok) curR.push(i);
    else if (curR.length) { okRuns.push(curR); curR = []; }
  });
  if (curR.length) okRuns.push(curR);
  used = Math.max(1, okRuns.length) * (roundAny() ? 2 : 1);
  remain = Math.max(0, state.budget - used);"""
assert old in s; s = s.replace(old, new, 1)
old = "  let used=0, remain=Math.max(0,state.budget), sepaUsed2=0;"
new = "  let used=0, remain=Math.max(0,state.budget);"
assert old in s; s = s.replace(old, new, 1)
# 摘要行
old = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">可合并购票：'+tGroups2.length+' 张票 · '+used+' 次'+(roundAny()?'（往返×2）':'')+'（分开买 '+sepaUsed2+' 次）· 剩余 '+remain+' 次</div>'+"""
new = """    (hubN?(' · 中转 '+hubN+' 段（'+esc(hubList)+'）'):'')+
    '<div style="font-size:11px;color:var(--ok);font-weight:600;margin-top:2px">连续联程（无绕路·非往返）：'+okRuns.length+' 趟行程 · 共 '+used+' 次'+(roundAny()?'（往返×2）':'')+' · 剩余 '+remain+' 次</div>'+"""
assert old in s; s = s.replace(old, new, 1)
# 明细 details 替换为行程 run
start = s.index("  html+='<details><summary>🎫 次数明细（可合并购票）</summary>'")
end = s.index("html+='<details><summary>更多家端点", start)
end = s.rindex("</details>';", start, end) + len("</details>';")
new_details = """  html+='<details><summary>🎫 次数明细（连续行程怎么计）</summary>'+
    okRuns.map((run, ri) => {
      const segs = run.map(j => cc.segs[j]);
      const path = segs.map(x => esc(x.a.name) + '→' + esc(x.b.name)).join('→');
      const tags = segs.map(x => x.inInt ? '直达' : '中转·经' + esc(x.hub)).join(' / ');
      return '<div class="mini-row"><div class="n">行程' + (ri + 1) + ' ' + path + '</div><div class="d">全程联程（无绕路）· 计 1 次（' + tags + '）</div></div>';
    }).join('') +
    cc.segs.filter((sg, i) => i < state.trips.length && !sg.ok).map(sg =>
      '<div class="mini-row"><div class="n">区间外 ' + esc(sg.a.name) + '→' + esc(sg.b.name) + '</div><div class="d">需购成人票（此段断开行程）</div></div>').join('') +
    '<div style="font-size:11.5px;color:var(--mut);margin-top:6px">规则：同一趟连续行程（不折返、不往返）无论分几张票/几次中转，全程计 1 次；勾全程往返则 ×2；区间外段需成人票并断开行程。</div>'+
    '</details>';"""
s = s[:start] + new_details + s[end:]
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('网页 planner 连续行程计次 完成')