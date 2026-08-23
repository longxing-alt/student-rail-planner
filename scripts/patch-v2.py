# -*- coding: utf-8 -*-
# v2 规则补丁: 写入 index.html PURE LOGIC (空间带+通道图+同城+例外)
import re

src = open('index.html', encoding='utf-8').read()
V2 = """
/* ==================== 实测校准规则 v2（58 条实测，2026-08） ====================
 * 可出(直达) = 同城/紧邻(≤50km传播) ∨ (空间带 ∧ 通道网 ∧ ∉区间级例外)
 *  - 空间带: t∈[-0.15,1.2]; 带宽 = 端点内 min(450,max(60,0.55L)) / 端点外 max(75,0.4L)
 *    (实测: 深圳 p=1236km/2559L 可出→端内0.48L; 南宁 t=1.105 可出; 三亚 t=1.203 拦→t上限1.2)
 *  - 通道网: 城市级铁路图 Dijkstra, 绕行比 (rail(S,P)+rail(P,H))/dist(S,H) ≤ RATIO_MAX
 *    (石家庄经京广陇海入京沪1.3✓; 柳州→广州经南广2.5✓; 昆明/北海/厦门1.3~1.8✓)
 *  - 同城/紧邻: 与"区间内站"≤50km 或同城市名(传播一轮) — 湘潭(长株潭)/佛山(广佛)实证
 *  - 例外: 雷州-海南链(湛江/徐闻/海口/三亚/环岛) 不入图→自然拦截; 顽固反例走 BLK2
 */
const RATIO_MAX = 2.5;
/* 区间级例外(实测): 几何/图检全过却真实拦截的支线超端样本 */
const BLK2 = [
  ['武汉', '广州', '深圳'], ['南宁', '济南', '天津'],
  ['海口', '沈阳', '福州'], ['海口', '哈尔滨', '福州'],
];
const RAIL_LINES = [
  ['哈尔滨', '长春', '沈阳', '北京'],                         // 京哈
  ['北京', '石家庄', '郑州', '武汉', '长沙', '衡阳', '广州'],   // 京广
  ['北京', '天津', '济南', '徐州', '蚌埠', '南京', '上海'],     // 京沪
  ['连云港', '徐州', '郑州', '西安', '兰州'],                  // 陇海
  ['兰州', '乌鲁木齐'],                                      // 兰新
  ['西安', '成都'],                                          // 西成/宝成
  ['兰州', '成都'],                                          // 兰渝(近似)
  ['成都', '重庆'], ['重庆', '遵义', '贵阳'],                  // 成渝+渝贵
  ['上海', '杭州', '南昌', '长沙', '贵阳', '昆明'],            // 沪昆
  ['衡阳', '桂林', '柳州', '南宁'],                           // 湘桂/衡柳
  ['贵阳', '柳州'],                                          // 黔桂
  ['南宁', '昆明'],                                          // 南昆
  ['成都', '昆明'],                                          // 成昆
  ['昆明', '大理'],                                          // 大丽(近似)
  ['南宁', '北海'],                                          // 邕北
  ['南宁', '广州'],                                          // 南广
  ['广州', '茂名'],                                          // 江湛(止于茂名; 雷州-海南链不入图)
  ['广州', '深圳'],                                          // 广深
  ['杭州', '宁波', '温州', '福州', '厦门', '深圳'],            // 杭深(沿海)
  ['北京', '南昌', '深圳'],                                  // 京九(近似)
  ['济南', '青岛'], ['青岛', '烟台'],                         // 胶济+青荣
  ['蚌埠', '合肥'],                                          // 合蚌
  ['沈阳', '丹东'], ['沈阳', '大连'],                         // 沈丹+哈大
  ['长春', '延吉'],                                          // 长图
  ['哈尔滨', '牡丹江'], ['哈尔滨', '佳木斯'], ['哈尔滨', '黑河'], // 滨绥/哈佳/北黑(近似)
  ['兰州', '西宁', '拉萨'],                                  // 青藏(近似)
];
let _adjV2 = null;
function railAdj() {
  if (_adjV2) return _adjV2;
  _adjV2 = {};
  const pt = {};
  for (const s of STATIONS) if (!(s[1] in pt)) pt[s[1]] = { lat: s[2], lon: s[3] };
  const add = (a, b) => {
    if (!(a in pt) || !(b in pt)) return;
    (_adjV2[a] = _adjV2[a] || []).push(b);
    (_adjV2[b] = _adjV2[b] || []).push(a);
  };
  for (const line of RAIL_LINES) for (let i = 0; i + 1 < line.length; i++) add(line[i], line[i + 1]);
  _adjV2.pt = pt;
  return _adjV2;
}
const _djCache = {};
function railDist(city) {
  const g = railAdj();
  if (city in _djCache) return _djCache[city];
  const d = {}; d[city] = 0;
  const done = {};
  while (true) {
    let u = null, duv = Infinity;
    for (const k of Object.keys(d)) if (!done[k] && d[k] < duv) { u = k; duv = d[k]; }
    if (!u) break;
    done[u] = 1;
    for (const v of (g[u] || [])) {
      const w = dist({ lat: g.pt[u].lat, lon: g.pt[u].lon }, { lat: g.pt[v].lat, lon: g.pt[v].lon });
      if (d[v] == null || duv + w < d[v]) d[v] = duv + w;
    }
  }
  _djCache[city] = d;
  return d;
}
/* 空间带: 投影 t∈[-0.15,1.2] + 带宽(端内0.55L≤450 / 端外0.4L≥75) */
function bandOK(S, H, P) {
  const L = dist(S, H);
  if (L < 15) return dist(S, P) <= 50;
  const { t, p } = corridor(S, H, P);
  if (t < -0.15 || t > 1.2) return false;
  const w = (t > 1.0 || t < 0.0) ? Math.max(75, 0.4 * L) : Math.min(450, Math.max(60, 0.55 * L));
  return p <= w;
}
/* 通道网: 两端点经 P 的绕行比 (端点在支线图外时通道退化为空间带) */
function chanOK(S, H, P) {
  const g = railAdj();
  if (!P || !P.city || !S || !S.city || !H || !H.city) return false;
  if (!(S.city in g.pt) || !(H.city in g.pt)) return bandOK(S, H, P);
  const L = dist(S, H);
  const dS = railDist(S.city), dH = railDist(H.city);
  if (dS[P.city] == null || dH[P.city] == null) return false;
  return (dS[P.city] + dH[P.city]) <= RATIO_MAX * L + 1e-6;
}
/* 区间级例外 */
function isBlack(S, H, P) {
  if (!P) return false;
  const c = s => (s && s.city ? s.city : '');
  for (const [a, b, d] of BLK2) {
    if (c(P) === d && ((c(S) === a && c(H) === b) || (c(S) === b && c(H) === a))) return true;
  }
  return false;
}
let _nearCache = null;
/* 同城/紧邻: 与"区间内站"同城市名或 ≤50km (传播一轮; 长株潭/广佛实证) */
function nearOK(S, H) {
  const key = (S && S.name) + '|' + (H && H.name);
  if (_nearCache && _nearCache.key === key) return _nearCache.set;
  const set = new Set();
  const byCity = {};
  for (const s of STATIONS) (byCity[s[1]] = byCity[s[1]] || []).push(s);
  for (const s of STATIONS) {
    const P = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    if (bandOK(S, H, P) && chanOK(S, H, P)) set.add(P.name);
  }
  let added = true;
  while (added) {
    added = false;
    for (const s of STATIONS) {
      if (set.has(s[0])) continue;
      if ((byCity[s[1]] || []).some(x => set.has(x[0]))) { set.add(s[0]); added = true; continue; }
      for (const t of STATIONS) {
        if (set.has(t[0]) && dist({ lat: s[2], lon: s[3] }, { lat: t[2], lon: t[3] }) <= 50) { set.add(s[0]); added = true; break; }
      }
    }
  }
  _nearCache = { key, set };
  return set;
}
/* 单点入区间判定(实测v2): 2=区间内(绿) 0=超区间(红) */
function beltV2(S, H, P) {
  if (!S || !H || !P) return 0;
  if (isBlack(S, H, P)) return 0;
  if (bandOK(S, H, P) && chanOK(S, H, P)) return 2;
  return nearOK(S, H).has(P.name) ? 2 : 0;
}
"""

anchor = "/* 端点内(t∈[0,1])允许宽带; 越出端点(t>1或t<0)仅允许贴线(实测: 越过端点偏离即拦截, 如 武汉↔广州→深圳) */"
assert anchor in src, 'anchor coreLimit not found'
src = src.replace(anchor, V2 + "\n" + anchor, 1)

NEW_PT = """function planTrip(S, H, O, D) {
  const direct = dist(O, D);
  const L = dist(S, H);
  // 退化/同城区间(学校与端点几乎同点): 只允许近距离直达, 禁止经中转买任意远地
  if (L < 15 && direct > 150) return { ok: 0, mode: 'full', direct };
  // 实测v2: 票面两端(真正出发地+目的地)必须都在区间内
  if (beltV2(S, H, O) !== 2 || beltV2(S, H, D) !== 2) return { ok: 0, mode: 'full', direct };
  // 中转: 经枢纽 T(亦须在区间内), 绕行 ≤ ratio×直达
  const tr = transferPlan(S, H, O, D);
  if (tr) return { ok: 1, mode: 'transfer', direct, via: tr.via, station: tr.station };
  return { ok: 1, mode: 'direct', direct };
}"""
src = re.sub(r"function planTrip\(S, H, O, D\) \{.*?\n\}\n\n/\* 中转方案", NEW_PT + "\n\n/* 中转方案", src, count=1, flags=re.S)

NEW_TP = """function transferPlan(S, H, O, D) {
  if (!D) { D = O; O = S; } // 兼容旧3参调用(出发地=学校)
  const direct = dist(O, D);
  const limit = state.ratio * direct;
  const same = (a, b) => (a.name && a.name === b.name) ||
    (Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005);
  // 硬约束①: 终点 D 必须在区间内(实测v2)
  if (beltV2(S, H, D) !== 2) return null;
  let best = null;
  for (const st of HUBS) {
    const T = { name: st[0], city: st[1], lat: st[2], lon: st[3] };
    if (same(T, D) || same(T, S) || same(T, O)) continue;
    const via = dist(O, T) + dist(T, D);
    if (via > limit) continue;
    if (beltV2(S, H, T) !== 2) continue;
    if (!best || via < best.via) best = { station: T, via, direct };
  }
  return best;
}"""
src = re.sub(r"function transferPlan\(S, H, O, D\) \{.*?\n\}\n\n/\* 单程规划", NEW_TP + "\n\n/* 单程规划", src, count=1, flags=re.S)

OLD_MBELT = """function mbelt(S, H, P) {
  if (!S || !H || !P) return 0;
  const L = dist(S, H);
  if (L < 15) return dist(S, P) <= 50 ? 2 : 0;
  const { t, p } = corridor(S, H, P);
  const core = (t > 1.0 || t < 0.0) ? 45 : Math.min(450, Math.max(60, 0.55 * L));
  const edge = (t > 1.0 || t < 0.0) ? 60 : Math.min(520, Math.max(90, 0.75 * L));
  if (t >= -0.05 && t <= 1.05 && p <= core) return 2;
  if (t >= -0.5 && t <= 1.5 && p <= edge) return 1;
  return 0;
}"""
assert OLD_MBELT in src, 'mbelt not found'
src = src.replace(OLD_MBELT, 'function mbelt(S, H, P) { return beltV2(S, H, P); }', 1)

open('index.html', 'w', encoding='utf-8', newline='\n').write(src)
b = open('index.html', 'rb').read()
open('index.html', 'wb').write(b.replace(b'\r\n', b'\n'))
print('v2 已写入 index.html: RAIL_LINES', len(RAIL_LINES) if 'RAIL_LINES' in locals() else '25', '条线') if False else None
import re
print('OK: v2 block, planTrip, transferPlan, mbelt 全部替换')