# -*- coding: utf-8 -*-
# 小程序: 路由改为"出发地=起点"(单程不回程), 与网页一致; 操作日志
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

# 统一路由助手(插在 chainV2 相关之前, smartBest 上方)
helper = """
/* 联程路由(与网页 routeChainAt 一致): 出发地=起点; 单程不回程; 全程往返才回程 */
function mpChain(S, H, sts, fast) {
  const dep = state.depart || H;
  if (sts.some ? sts.some(t => t.round) : false) return logic.chainV2(S, H, sts.map(t => t.station), dep, dep, fast);
  const arr = sts.map ? sts.map(t => t.station) : sts;
  if (!arr.length) return logic.chainV2(S, H, [], dep, dep, fast);
  return logic.chainV2(S, H, arr.slice(0, -1), dep, arr[arr.length - 1], fast);
}
"""
anchor = "/* 最优区间端点(联程): 枚举全部车站, 联程段覆盖(okN)优先 → 平局按 段端点p/L最小 → 距当前端点近 */"
assert anchor in s
s = s.replace(anchor, helper + anchor, 1)

# 1) smartBest 两处
old = "  const curCover = logic.chainV2(S, H, sts, H, H, true).okN;"
new = "  const curCover = mpChain(S, H, trips, true).okN;"
assert old in s; s = s.replace(old, new, 1)
old = """    const H2={name:sc[0],city:sc[1],lat:sc[2],lon:sc[3]};
    const cc = logic.chainV2(S, H2, sts, H2, H2, true);"""
new = """    const H2={name:sc[0],city:sc[1],lat:sc[2],lon:sc[3]};
    const cc = mpChain(S, H2, trips, true);"""
assert old in s; s = s.replace(old, new, 1)

# 2) onPlan cc0
old = "    const cc0 = logic.chainV2(S, H, sts, H, H, true);"
new = "    const cc0 = mpChain(S, H, state.trips, true);"
assert old in s; s = s.replace(old, new, 1)

# 3) renderAll cc
old = "    if (planned && S && H && state.trips.length) cc = logic.chainV2(S, H, state.trips.map(t => t.station), H, H);"
new = "    if (planned && S && H) cc = mpChain(S, H, state.trips, false);"
assert old in s; s = s.replace(old, new, 1)

# 4) 弹窗预览 cc2
old = "      const cc2 = logic.chainV2(S, H2, sts, H2, H2, true);"
new = "      const cc2 = mpChain(S, H2, state.trips, true);"
assert old in s; s = s.replace(old, new, 1)

# 5) 操作日志
old = """  nextSchool() {"""
new = """  logOp(msg) { console.log('[操作] ' + msg); },
  nextSchool() {"""
assert old in s; s = s.replace(old, new, 1)
for fn, msg in [
    ('  nextSchool() {', '[操作] 设置学校'),
    ('  nextDepart() {', '[操作] 设置出发地'),
    ('  addTrip() {', '[操作] 添加目的地'),
    ('  removeTrip(e) {', '[操作] 删除目的地'),
    ('  clearAll() {', '[操作] 清空全部'),
    ('  onPlan() {', '[操作] 一键规划'),
    ('  applySuggestion() {', '[操作] 采用推荐区间'),
    ('  tfmTap(e) {', '[操作] 点击中转段'),
    ('  setHubTap(e) {', '[操作] 选择中转站'),
]:
    a = fn + '\n'
    if a in s:
        s = s.replace(a, fn + '\n    this.logOp("' + msg + '");\n', 1)
        print('打点:', msg)
    else:
        print('未命中:', fn)

open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read()
open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('路由修复+操作日志 完成')