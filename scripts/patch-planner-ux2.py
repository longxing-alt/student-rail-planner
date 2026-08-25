# -*- coding: utf-8 -*-
# planner UX第2批: 出发地独立步 / 链统一routeChainAt / 自动补加 / emoji精简
p = 'scripts/planner.tpl.html'
s = open(p, encoding='utf-8').read()

# 1) 出发地独立步骤
old = """  <div class="card step" id="stepTrips">
    <h2><span class="step-no">3</span>想去哪（按顺序串联成一条路线）</h2>"""
new = """  <div class="card step" id="stepDepart">
    <h2><span class="step-no">3</span>出发地（票面起点，默认=家）</h2>
    <input type="text" id="departInput" placeholder="默认与家同站，可改" autocomplete="off">
    <button class="btn" onclick="nextDepart()">下一步</button>
  </div>

  <div class="card step" id="stepTrips">
    <h2><span class="step-no">4</span>想去哪（按顺序串联成一条路线）</h2>"""
assert old in s; s = s.replace(old, new, 1)

old = """  state.home={text:$('homeInput').value.trim(),point:r.point,station:r.station};
  state.depart=state.home.station;
  $('homeInput').value=r.station.name;
  locateDepartLine();
  showStep('Trips');
}"""
new = """  state.home={text:$('homeInput').value.trim(),point:r.point,station:r.station};
  state.depart=state.home.station; // 出发地默认=家
  $('homeInput').value=r.station.name;
  $('departInput').value=r.station.name;
  locateDepartLine();
  showStep('Depart');
}
function nextDepart(){
  const q=$('departInput').value.trim();
  const r=q?resolvePlace(q):null;
  if(q&&!r){setErr('stepDepart','未收录该站');return;}
  if(r)state.depart=r.station; // 可改票面起点(判定仍按 学校⇄家)
  locateDepartLine();
  showStep('Trips');
}"""
assert old in s; s = s.replace(old, new, 1)

# 2) routeChainAt 统一形态(推荐/优化与路线同链)
old = """function routeChain(S,H){
  const sts=state.trips.map(t=>t.station);
  const dep=state.depart||H;
  if(roundAny()) return chainV2(S,H,sts,dep,dep);          // 全程往返: 出发→各程→回出发
  if(!sts.length) return chainV2(S,H,[],dep,dep);
  return chainV2(S,H,sts.slice(0,-1),dep,sts[sts.length-1]); // 单程: 出发→各程(终点=最后一程, 不重复)
}"""
new = """function routeChainAt(S,H2){
  const sts=state.trips.map(t=>t.station);
  const dep=state.depart||H2;
  if(roundAny()) return chainV2(S,H2,sts,dep,dep);           // 全程往返: 出发→各程→回出发
  if(!sts.length) return chainV2(S,H2,[],dep,dep);
  return chainV2(S,H2,sts.slice(0,-1),dep,sts[sts.length-1]); // 单程: 出发→各程(终点=最后一程, 不重复)
}
function routeChain(S,H){return routeChainAt(S,H);}"""
assert old in s; s = s.replace(old, new, 1)

s = s.replace("""    const H2={name:s[0],city:s[1],lat:s[2],lon:s[3]};
    const cc=chainV2(S,H2,sts,H2,H2,true);
    const cover=cc.okN;""",
              """    const H2={name:s[0],city:s[1],lat:s[2],lon:s[3]};
    const cc=routeChainAt(S,H2);
    const cover=cc.okN;""")
s = s.replace("""    const H2={name:s[0],city:s[1],lat:s[2],lon:s[3]};
    const cc=chainV2(S,H2,sts,H2,H2,true);
    if(!cc||cc.okN===0)continue;""",
              """    const H2={name:s[0],city:s[1],lat:s[2],lon:s[3]};
    const cc=routeChainAt(S,H2);
    if(!cc||cc.okN===0)continue;""")

# 3) 一键规划: 未点添加的输入自动补入
old = """function onPlan(){
  if(!state.school||!state.home){$('tripErr').textContent='请先完成 学校 与 出发地';return;}
  statsPlan();"""
new = """function onPlan(){
  if(!state.school||!state.home){$('tripErr').textContent='请先完成 学校 与 出发地';return;}
  if($('tripInput').value.trim()) addTrip(); // 忘记点添加? 自动补入
  if(!state.trips.length){$('tripErr').textContent='还没有目的地';return;}
  statsPlan();"""
assert old in s; s = s.replace(old, new, 1)

# 4) emoji 精简
s = s.replace('<button class="btn" onclick="onPlan()">🚀 一键规划</button>',
              '<button class="btn" onclick="onPlan()">一键规划</button>')
s = s.replace("✅ 联程全程可出 🎉", "✅ 联程全程可出")
s = s.replace("📍 出发地：", "出发地：")
s = s.replace("⚡ <b>搭桥法</b>", "<b>搭桥法</b>")
s = s.replace("💡 把<b>家</b>改成", "把<b>家</b>改成")
s = s.replace("💡 当前区间已是最优", "当前区间已是最优")

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read(); open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('planner UX第2批完成: 出发地独立步/链统一/自动补加/emoji精简')