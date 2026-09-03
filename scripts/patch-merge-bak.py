# -*- coding: utf-8 -*-
# 计次定稿: 展示"可合并购票"最少张数(相邻可出段两两合一,每张1次) + 注明分开买数
MP = 'miniprogram/pages/index/index.js'
s = open(MP, encoding='utf-8').read()

old = """    // 按程计次: 每程=1张票(每程可自行加一次中转查询, 中转次数不限), 单程1次/往返2次, 区间外不计
    const roundAll = state.trips.some(t => t.round);
    const used = cc ? state.trips.reduce((sum, t, i) => sum + ((segOf(i) && segOf(i).ok) ? (t.round ? 2 : 1) : 0), 0) : 0;"""
new = """    // 计次: 相邻可出程段两两合成一张票(每张1次) → 最少购票张数; 分开买则每程各1张
    const roundAll = state.trips.some(t => t.round);
    const okLegs = [];
    if (cc) cc.segs.forEach((sg, i) => { if (i < state.trips.length && sg.ok) okLegs.push(i); });
    const groups = [];
    for (let k = 0; k < okLegs.length; k += 2) groups.push(okLegs.slice(k, k + 2));
    this._ticketGroups = groups;
    const used = groups.length * (roundAll ? 2 : 1);
    const sepaUsed = (okLegs.length) * (roundAll ? 2 : 1);"""
assert old in s; s = s.replace(old, new, 1)

old = """      return '第' + (i + 1) + '张 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：'
        + (sg.inInt ? '直达' : '中转·经' + sg.hub) + (t && t.round ? ' · 往返 2 次' : ' · 1 次');"""
new = """      if (sg.ok && groups2.has(i)) {
        return '第' + (gno.get(i)) + '张 ' + (sg.a ? sg.a.name : '') + '→' + (sg.b ? sg.b.name : '') + '：'
          + (sg.inInt ? '直达' : '中转·经' + sg.hub) + (t && t.round ? ' · 往返 2 次' : ' · 1 次')
          + (g2.get(i) ? '（与下一程合一）' : '');
      }
      return '';"""
raise SystemExit('placeholder — 采用下方函数替换方式')