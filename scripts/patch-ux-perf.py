# -*- coding: utf-8 -*-
# MP/planner/网页: 防抖+fast推荐、免责声明、访问统计、close按钮、协议
import re

# ============ 1) 小程序页面: 防抖 + smartBest fast + 统计锚点 ============
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

old = """  onPlan() {
    if (!state.trips.length) { this.setStatus('先添加想去的地方'); return; }"""
new = """  onPlan() {
    if (Date.now() - (this._lastPlanTs || 0) < 800) return; // 防连点卡顿
    this._lastPlanTs = Date.now();
    if (!state.trips.length) { this.setStatus('先添加想去的地方'); return; }"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用): MP debounce')

s = s.replace("logic.chainV2(S, H, sts, H, H)", "logic.chainV2(S, H, sts, H, H, true)")
s = s.replace("logic.chainV2(S, H2, sts, H2, H2)", "logic.chainV2(S, H2, sts, H2, H2, true)")
s = s.replace("logic.chainV2(S, H3, sts, H3, H3)", "logic.chainV2(S, H3, sts, H3, H3, true)")

open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ============ 2) 小程序 wxml: 弹窗关闭✕ + 底部免责声明 ============
p = 'miniprogram/pages/index/index.wxml'
s = open(p, encoding='utf-8').read()
old = """      <view class="dialog-title">🎯 区间优化建议</view>"""
new = """      <view class="dialog-title">🎯 区间优化建议<text class="dialog-close" catchtap="closeModal">✕</text></view>"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
old = """    </view>
  </view>

  <!-- 调试编号层（长按品牌头开关） -->"""
new = """    </view>
  </view>

  <view class="footer">
    免责声明：判定结果基于实测数据推算，仅供参考，实际以 12306 出票为准；不构成购票或区间修改建议。
  </view>

  <!-- 调试编号层（长按品牌头开关） -->"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ============ 3) 小程序 wxss: 关闭按钮 + footer ============
p = 'miniprogram/pages/index/index.wxss'
s = open(p, encoding='utf-8').read()
s += """
/* 1.0.9: 弹窗关闭 + 免责声明 */
.dialog-title{position:relative}
.dialog-close{position:absolute;right:0;top:-2px;font-size:16px;color:#9ca3af;padding:4px 8px;font-weight:600}
.footer{margin:26px 18px 10px;padding:10px 12px;font-size:10.5px;color:#9ca3af;line-height:1.6;border-top:1px solid #f1f0ef;text-align:center}
"""
open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ============ 4) planner 模板: 统计+免责声明+fast 推荐 ============
p = 'scripts/planner.tpl.html'
s = open(p, encoding='utf-8').read()
old = """    const cc = chainV2(S, H2, sts, H2, H2);
    const cover = cc.okN;"""
new = """    const cc = chainV2(S, H2, sts, H2, H2, true);
    const cover = cc.okN;"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
s = s.replace('const cc=chainV2(S,H2,sts,H2,H2);', 'const cc=chainV2(S,H2,sts,H2,H2,true);')
old = """  <div class="sub">输入学校与出发地，多程自动串联成一条路线，看能否全程用学生票。</div>"""
new = """  <div class="sub">输入学校与出发地，多程自动串联成一条路线，看能否全程用学生票。<span id="statLine" style="color:var(--mut2)"></span></div>"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
old = """</style>
</head>"""
new = """.disclaimer{margin-top:26px;font-size:11px;color:var(--mut2);line-height:1.7;text-align:center;border-top:1px solid var(--line);padding-top:14px}
</style>
</head>"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
old = """</div>

<script>
/*__PURE_LOGIC__*/"""
new = """  <div class="disclaimer">免责声明：判定结果基于实测出票数据推算，仅供规划参考；实际能否出票以 12306 为准。数据仅存本地浏览器，不上传。MIT License</div>
</div>

<script>
/*__PURE_LOGIC__*/"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
old = """function onPlan(){
  if(!state.school||!state.home){$('tripErr').textContent='请先完成 学校 与 出发地';return;}
  // 自动按最优联程排序: 使最多段落在区间内
  state.trips=bestRoute(state.school.station,state.home.station,state.trips);
  planned=true;renderTrips();renderResult();
}"""
new = """function onPlan(){
  if(!state.school||!state.home){$('tripErr').textContent='请先完成 学校 与 出发地';return;}
  statsPlan();
  // 自动按最优联程排序: 使最多段落在区间内
  state.trips=bestRoute(state.school.station,state.home.station,state.trips);
  planned=true;renderTrips();renderResult();
}"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
old = """(function(){
  try{
    const raw=localStorage.getItem('srp_ratioMax');
    state.ratioMax=(raw&&isFinite(+raw)&&+raw>=1&&+raw<=20)?+raw:2.5;
  }catch(e){state.ratioMax=2.5;}
  state.budget=4;
})();"""
new = """(function(){
  try{
    const raw=localStorage.getItem('srp_ratioMax');
    state.ratioMax=(raw&&isFinite(+raw)&&+raw>=1&&+raw<=20)?+raw:2.5;
  }catch(e){state.ratioMax=2.5;}
  state.budget=4;
  statsVisit();
})();
/* 访问/规划统计(本地) */
function statsRead(){try{return JSON.parse(localStorage.getItem('srp_stats'))||{v:0,p:0};}catch(e){return{v:0,p:0};}}
function statsWrite(s){try{localStorage.setItem('srp_stats',JSON.stringify(s));}catch(e){}}
function statsVisit(){let s=statsRead();let seen=false;try{seen=sessionStorage.getItem('srp_seen')==='1';}catch(e){}if(!seen){s.v++;statsWrite(s);try{sessionStorage.setItem('srp_seen','1');}catch(e){}}statsShow();}
function statsPlan(){const s=statsRead();s.p++;statsWrite(s);statsShow();}
function statsShow(){const el=document.getElementById('statLine');if(!el)return;const s=statsRead();el.textContent=' 👁 访问 '+s.v+' · 🚀 规划 '+s.p;}
window.addEventListener('error',()=>{});"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ============ 5) 网页 index.html: 统计 + 免责声明 ============
p = 'index.html'
s = open(p, encoding='utf-8').read()
old = """<footer>
  <div>学生优惠 · 区间规划器 —— 帮助你把每学年有限的优惠次数花在刀刃上</div>
  <div style="margin-top:6px">车站数据 · 规划结果仅供估算参考 · UI 风格致敬 skills.dev</div>
</footer>"""
new = """<footer>
  <div>学生优惠 · 区间规划器 —— 帮助你把每学年有限的优惠次数花在刀刃上</div>
  <div style="margin-top:6px">免责声明：判定结果基于实测出票数据推算，仅供参考；实际能否出票以 12306 为准。数据仅存本地浏览器。MIT License</div>
  <div id="statLine" style="margin-top:6px;font-size:11px"></div>
</footer>"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
old = """async function init() {
  // 嵌入模式: iframe 被第三方网站包裹 或 ?embed=1 → 隐藏导航/页脚, 极简主题"""
new = """function statsRead(){try{return JSON.parse(localStorage.getItem('srp_stats'))||{v:0,p:0};}catch(e){return{v:0,p:0};}}
function statsWrite(s){try{localStorage.setItem('srp_stats',JSON.stringify(s));}catch(e){}}
function statsShow(){const el=document.getElementById('statLine');if(!el)return;const s=statsRead();el.textContent='👁 访问 '+s.v+' 次 · 🚀 规划 '+s.p+' 次（本机统计，仅供参考）';}
function statsVisit(){let s=statsRead(),seen=false;try{seen=sessionStorage.getItem('srp_seen')==='1';}catch(e){}if(!seen){s.v++;statsWrite(s);try{sessionStorage.setItem('srp_seen','1');}catch(e){}}statsShow();}
function statsPlan(){const s=statsRead();s.p++;statsWrite(s);statsShow();}
async function init() {
  // 嵌入模式: iframe 被第三方网站包裹 或 ?embed=1 → 隐藏导航/页脚, 极简主题"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
# init 内调用 visit
old = """  document.getElementById('mapToggleBtn').textContent = '🗺️ 查看地图'; // 地图默认收起
  loadRatioMax(); // 载入用户绕远倍数(若有)"""
new = """  document.getElementById('mapToggleBtn').textContent = '🗺️ 查看地图'; // 地图默认收起
  loadRatioMax(); // 载入用户绕远倍数(若有)
  statsVisit();"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用) @', p)
# onPlan 统计: 找桌面 onPlan 定义
old = """function onPlan() {
  if (!state.school || !state.school.station || !state.home || !state.home.station) { setStatus('请先完成 ① 学校 和 ② 家'); return; }"""
new = """function onPlan() {
  statsPlan();
  if (!state.school || !state.school.station || !state.home || !state.home.station) { setStatus('请先完成 ① 学校 和 ② 家'); return; }"""
if old in s: s = s.replace(old, new, 1)
else: print('skip(已应用): desktop statsPlan')
open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ============ 6) LICENSE + package.json ============
lic = """MIT License

Copyright (c) 2026 longxing-alt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
open('LICENSE', 'w', encoding='utf-8', newline='\n').write(lic)

import json
p = 'package.json'
pj = json.load(open(p, encoding='utf-8'))
pj['license'] = 'MIT'
json.dump(pj, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

for f in ['miniprogram/pages/index/index.js', 'miniprogram/pages/index/index.wxml', 'miniprogram/pages/index/index.wxss',
          'scripts/planner.tpl.html', 'index.html']:
    b = open(f, 'rb').read(); open(f, 'wb').write(b.replace(b'\r\n', b'\n'))
print('全部补丁完成: 防抖/fast推荐/关闭✕/免责声明/统计/MIT')