# v2 网页版增强: 绕远倍数可调+重置, 搭桥法提示, 地图默认关闭
src = open('index.html', encoding='utf-8').read()

# 1) state 增加 ratioMax
old = "const state = {\n  ratio: 1.5,"
new = "const state = {\n  ratio: 1.5,\n  ratioMax: 2.5, // 绕行比上限(实测校准最优; 网页端可调, 用户值优先)"
assert old in src
src = src.replace(old, new, 1)

# 2) chanOK 使用 state.ratioMax (用户可调; 小程序未设则用 RATIO_MAX=2.5)
old = "  return (dS[P.city] + dH[P.city]) <= RATIO_MAX * L + 1e-6;"
new = "  return (dS[P.city] + dH[P.city]) <= (state.ratioMax || RATIO_MAX) * L + 1e-6;"
assert old in src
src = src.replace(old, new, 1)

# 3) CSS: 搭桥提示样式
old = ".trip-row:hover{border-color:#d6d3d1;background:#fff}"
new = """.trip-row:hover{border-color:#d6d3d1;background:#fff}
.bridge-tip{font-size:12px;color:#b45309;background:#fffbeb;border:1px dashed #f59e0b;border-radius:9px;padding:6px 9px;margin-top:6px;line-height:1.6}"""
assert old in src
src = src.replace(old, new, 1)

# 4) 设置面板 HTML: 绕远倍数输入 + 重置
old = """          <button class="btn btn-ghost btn-sm" id="mapToggleBtn" onclick="toggleMap()">🗺️ 收起地图</button>
        </div>
        <div id="demoTip" """
new = """          <button class="btn btn-ghost btn-sm" id="mapToggleBtn" onclick="toggleMap()">🗺️ 查看地图</button>
        </div>
        <div id="ratioSettings" style="display:flex;gap:8px;align-items:center;margin:8px 0 10px;flex-wrap:wrap">
          <span class="hint" style="margin:0">绕远倍数（通道网判定上限）</span>
          <input id="ratioMaxInput" type="number" min="1" max="20" step="0.1" style="width:76px;padding:4px 6px;border:1px solid var(--line);border-radius:8px;font-size:13px"
                 title="越大越宽松(放行更多), 越小越严格; 默认 2.5 为 58 条实测最优" onchange="setRatioMax(this.value)">
          <button class="btn btn-ghost btn-sm" onclick="resetRatioMax()">↺ 重置(2.5)</button>
          <span class="hint" id="ratioMaxHint" style="margin:0;font-size:12px"></span>
        </div>
        <div id="demoTip" """
assert old in src
src = src.replace(old, new, 1)

# 5) 参数 JS + 重置 (插到 toggleMap 前)
old = "function toggleMap() {"
new = """/* ---------- 绕远倍数(绕行比上限) 参数: 默认最优2.5, 用户可改, 用户值优先(localStorage) ---------- */
function loadRatioMax() {
  let v = null;
  try { const raw = localStorage.getItem('srp_ratioMax'); if (raw != null && isFinite(+raw)) v = +raw; } catch (e) { }
  state.ratioMax = (v && v >= 1 && v <= 20) ? v : 2.5;
  const el = document.getElementById('ratioMaxInput');
  if (el) el.value = state.ratioMax;
  const hint = document.getElementById('ratioMaxHint');
  if (hint) hint.textContent = state.ratioMax === 2.5
    ? '默认最优（≈2.5: 石家庄1.3✓ / 深圳2.2✗ 之间校准）'
    : '用户设定 ' + state.ratioMax + '（按你的值判定）';
  _nearCache = null; // 绕行比变化 → 通道/同城缓存失效
}
function setRatioMax(v) {
  state.ratioMax = Math.min(20, Math.max(1, +v || 2.5));
  try { localStorage.setItem('srp_ratioMax', state.ratioMax); } catch (e) { }
  loadRatioMax();
  renderAll();
}
function resetRatioMax() {
  try { localStorage.removeItem('srp_ratioMax'); } catch (e) { }
  loadRatioMax();
  renderAll();
}
function toggleMap() {"""
assert old in src
src = src.replace(old, new, 1)

# 6) init(): 载入用户绕远倍数
old = """  document.getElementById('mapToggleBtn').textContent = '🗺️ 查看地图'; // 地图默认收起"""
new = """  document.getElementById('mapToggleBtn').textContent = '🗺️ 查看地图'; // 地图默认收起
  loadRatioMax(); // 载入用户绕远倍数(若有)"""
assert old in src
src = src.replace(old, new, 1)

# 7) 全价行程卡片 → 搭桥法提示 (非链模式)
old = """    const main = '<b>' + esc(tp.text) + '</b>' +
      '<div class="sub">' + esc(fromName) + ' 到 ' + esc(tp.station ? tp.station.name : '坐标点') + ' · ' + Math.round(p.direct) + ' km</div>';"""
new = """    const main = '<b>' + esc(tp.text) + '</b>' +
      '<div class="sub">' + esc(fromName) + ' 到 ' + esc(tp.station ? tp.station.name : '坐标点') + ' · ' + Math.round(p.direct) + ' km</div>' +
      (!p.ok ? '<div class="bridge-tip">⚡ <b>搭桥法</b>（实测有效）：先购「区间内→' + esc(fromName) + '」的合法学生票，再买「' + esc(fromName) + '→' + esc(tp.station.name) + '」，12306 按联程放行，最后退掉第一张。</div>' : '');"""
assert old in src
src = src.replace(old, new, 1)

# 8) 链模式下 区间外 段 → 搭桥法提示
old = """      const main = '<b>' + esc(tp.text) + '</b>' +
        '<div class="sub">' + esc(fromShown) + ' 到 ' + esc(tp.station ? tp.station.name : '坐标点') +
        (kmTxt != null ? ' · ' + kmTxt + ' km' : '') + '</div>';"""
new = """      const main = '<b>' + esc(tp.text) + '</b>' +
        '<div class="sub">' + esc(fromShown) + ' 到 ' + esc(tp.station ? tp.station.name : '坐标点') +
        (kmTxt != null ? ' · ' + kmTxt + ' km' : '') + '</div>' +
        (!(seg && seg.inInt) ? '<div class="bridge-tip">⚡ <b>搭桥法</b>（实测有效）：先购「区间内→' + esc(fromShown) + '」合法票获得联程上下文，再购后续各段，最后退掉桥票。</div>' : '');"""
assert old in src
src = src.replace(old, new, 1)

open('index.html', 'w', encoding='utf-8', newline='\n').write(src)
b = open('index.html', 'rb').read()
open('index.html', 'wb').write(b.replace(b'\r\n', b'\n'))
print('网页版增强完成: ratioMax可调+重置+localStorage, 搭桥提示(全价/区间外卡片), 地图默认收起与标签修复')