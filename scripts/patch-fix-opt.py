# -*- coding: utf-8 -*-
# 优化修复: 太原/梧州入图; smartBest p/L 决胜(两端); 优化器 fail 优先; 推荐行真正加粗
import re
src = open('index.html', encoding='utf-8').read()

# 1) 图补太原(石太/郑太)/梧州(南广)
old = "  ['北京', '石家庄', '郑州', '信阳', '武汉', '岳阳', '长沙', '衡阳', '广州'], // 京广"
new = "  ['北京', '石家庄', '太原', '郑州', '信阳', '武汉', '岳阳', '长沙', '衡阳', '广州'], // 京广(+石太/郑太)"
assert old in src; src = src.replace(old, new, 1)
old = "  ['南宁', '广州'],                                          // 南广"
new = "  ['南宁', '梧州', '广州'],                                     // 南广(+梧州)"
assert old in src; src = src.replace(old, new, 1)

# 2) web mSmartBest: 补 railAdj 过滤 + p/L 决胜
old = """function mSmartBest(S, H, trips) {
  let best = null;
  const curCover = trips.filter(t => mJudge(S, H, t.station) === 2).length;
  for (const s of STATIONS) {
    if (s[0] === S.name) continue;
    const H2 = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    const cover = trips.filter(t => mJudge(S, H2, t.station) === 2).length;
    if (cover < curCover) continue;
    const bad = trips.filter(t => mJudge(S, H2, t.station) === 0).length;
    const km = dist({ lat: s[2], lon: s[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cover > best.cover || (cover === best.cover && (bad < best.bad || (bad === best.bad && km < best.km)))) {
      best = { st: { name: s[0], city: s[1], lat: s[2], lon: s[3] }, cover, bad };
    }
  }
  return best;
}"""
new = """function mSmartBest(S, H, trips) {
  let best = null;
  const curCover = trips.filter(t => mJudge(S, H, t.station) === 2).length;
  for (const s of STATIONS) {
    if (s[0] === S.name) continue;
    if (!railAdj().nodes.has(s[1])) continue; // 推荐只考虑通道网内端点(图外支线/海岛可手动填写)
    const H2 = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    const coveredTrips = trips.filter(t => mJudge(S, H2, t.station) === 2);
    const cover = coveredTrips.length;
    if (cover < curCover) continue;
    const bad = trips.filter(t => mJudge(S, H2, t.station) === 0).length;
    // 平局质量: 被覆盖行程的最大垂直偏离比 p/L 最小(更居中) → 再按距当前家近
    const Lh = dist(S, H2);
    let pMax = 0;
    for (const t of coveredTrips) {
      if (!t.station) continue;
      const { p } = corridor(S, H2, t.station);
      pMax = Math.max(pMax, p / (Lh || 1));
    }
    const km = dist({ lat: s[2], lon: s[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cover > best.cover || (cover === best.cover && (bad < best.bad ||
      (bad === best.bad && (pMax < best.pMax || (pMax === best.pMax && km < best.km)))))) {
      best = { st: { name: s[0], city: s[1], lat: s[2], lon: s[3] }, cover, bad, pMax };
    }
  }
  return best;
}"""
assert old in src; src = src.replace(old, new, 1)

# 3) optimizer save 排序: 覆盖 → 全价少 → 次数少 → 离家近
old = """    list.sort((a, b) => (b.covered - a.covered) || (a.used - b.used) ||
      ((b.sameCity ? 1 : 0) - (a.sameCity ? 1 : 0)) || (kmOf(a) - kmOf(b)));"""
new = """    list.sort((a, b) => (b.covered - a.covered) || (a.fail - b.fail) || (a.used - b.used) ||
      ((b.sameCity ? 1 : 0) - (a.sameCity ? 1 : 0)) || (kmOf(a) - kmOf(b)));"""
assert old in src; src = src.replace(old, new, 1)

# 4) 推荐行真正加粗: 标题加粗 + 徽章
old = """    const isBest = c.st[0] === smartName;
    return '<div class="opt-row ' + (isBest ? 'best' : '') + '">' +
      '<div class="opt-main"><b>' + (isBest ? '⭐ ' : '') + esc(c.st[0]) + ' · ' + esc(c.st[1]) + '</b>' +"""
new = """    const isBest = c.st[0] === smartName;
    return '<div class="opt-row ' + (isBest ? 'best' : '') + '">' +
      '<div class="opt-main"><b style="' + (isBest ? 'font-weight:800;color:var(--blue);font-size:13.5px' : '') + '">' + (isBest ? '⭐ ' : '') + esc(c.st[0]) + ' · ' + esc(c.st[1]) + '</b>' +"""
assert old in src; src = src.replace(old, new, 1)

# 5) CSS: .opt-row.best 强化(蓝框+浅底)
old = ".param-hint{font-size:11.5px;color:var(--muted);line-height:1.5}"
new = """.param-hint{font-size:11.5px;color:var(--muted);line-height:1.5}
.opt-row.best{border:1.5px solid var(--blue)!important;background:var(--blue-soft)!important;box-shadow:0 4px 14px -8px rgba(13,148,136,.35)}"""
assert old in src; src = src.replace(old, new, 1)

open('index.html', 'w', encoding='utf-8', newline='\n').write(src)
b = open('index.html', 'rb').read(); open('index.html', 'wb').write(b.replace(b'\r\n', b'\n'))
print('index.html: 太原/梧州入图; mSmartBest p/L决胜; 优化器fail优先; 推荐行加粗样式')

# ============ 小程序页面 smartBest 同款判定(逻辑一致性) ============
src = open('miniprogram/pages/index/index.js', encoding='utf-8').read()
old = """function smartBest(S, H, trips) {
  let best = null;
  const curCover = trips.filter(t => judge(S, H, t.station) === 2).length;
  for (const s of STATIONS) {
    if (s[0] === S.name) continue;
    if (!logic.railAdj().nodes.has(s[1])) continue; // 推荐只考虑通道网内端点(图外支线/海岛可手动填写)
    const H2 = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    const cover = trips.filter(t => judge(S, H2, t.station) === 2).length;
    if (cover < curCover) continue;
    const bad = trips.filter(t => judge(S, H2, t.station) === 0).length;
    const km = dist({ lat: s[2], lon: s[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cover > best.cover || (cover === best.cover && (bad < best.bad || (bad === best.bad && km < best.km)))) {
      best = { st: { name: s[0], city: s[1], lat: s[2], lon: s[3] }, cover, bad };
    }
  }
  return best;
}"""
new = """function smartBest(S, H, trips) {
  let best = null;
  const curCover = trips.filter(t => judge(S, H, t.station) === 2).length;
  for (const s of STATIONS) {
    if (s[0] === S.name) continue;
    if (!logic.railAdj().nodes.has(s[1])) continue; // 推荐只考虑通道网内端点(图外支线/海岛可手动填写)
    const H2 = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    const coveredTrips = trips.filter(t => judge(S, H2, t.station) === 2);
    const cover = coveredTrips.length;
    if (cover < curCover) continue;
    const bad = trips.filter(t => judge(S, H2, t.station) === 0).length;
    // 平局质量: 被覆盖行程的最大垂直偏离比 p/L 最小(更居中) → 再按距当前家近
    const Lh = dist(S, H2);
    let pMax = 0;
    for (const t of coveredTrips) {
      if (!t.station) continue;
      const { p } = corridor(S, H2, t.station);
      pMax = Math.max(pMax, p / (Lh || 1));
    }
    const km = dist({ lat: s[2], lon: s[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cover > best.cover || (cover === best.cover && (bad < best.bad ||
      (bad === best.bad && (pMax < best.pMax || (pMax === best.pMax && km < best.km)))))) {
      best = { st: { name: s[0], city: s[1], lat: s[2], lon: s[3] }, cover, bad, pMax };
    }
  }
  return best;
}"""
assert old in src; src = src.replace(old, new, 1)
open('miniprogram/pages/index/index.js', 'w', encoding='utf-8', newline='\n').write(src)
b = open('miniprogram/pages/index/index.js', 'rb').read(); open('miniprogram/pages/index/index.js', 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序 smartBest p/L 决胜同步')