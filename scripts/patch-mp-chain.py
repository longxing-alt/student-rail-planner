# -*- coding: utf-8 -*-
# 小程序联程化: onPlan/renderAll/smartBest → chainV2 段级判定(与规划页一致)
src = open('miniprogram/pages/index/index.js', encoding='utf-8').read()

# 1) 去掉自动排序(联程=按拖拽顺序)
old = """    state.trips = sortByDepart(state.trips);
    // 先标记已规划, 再渲染, 保证框体/区间线着色"""
new = """    // 联程: 顺序=用户拖拽顺序(不再按距离自动排序)
    // 先标记已规划, 再渲染, 保证框体/区间线着色"""
assert old in src; src = src.replace(old, new, 1)

# 2) smartBest → 联程段覆盖版
old = """/* 最优区间端点: 枚举全部车站, 覆盖优先 → 超区间少 → 距当前端点近 */
function smartBest(S, H, trips) {
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
new = """/* 最优区间端点(联程): 枚举全部车站, 联程段覆盖(okN)优先 → 平局按 段端点p/L最小 → 距当前端点近 */
function smartBest(S, H, trips) {
  const sts = trips.map(t => t.station);
  const curCover = logic.chainV2(S, H, sts, H, H).okN;
  let best = null;
  for (const s of STATIONS) {
    if (s[0] === S.name) continue;
    if (!logic.railAdj().nodes.has(s[1])) continue; // 推荐只考虑通道网内端点(图外支线/海岛可手动填写)
    if (H && s[1] === H.city) continue; // 不再推荐当前家同城
    const H2 = { name: s[0], city: s[1], lat: s[2], lon: s[3] };
    const cc = logic.chainV2(S, H2, sts, H2, H2);
    const cover = cc ? cc.okN : 0;
    if (cover < curCover) continue;
    const Lh = dist(S, H2);
    let pMax = 0;
    for (const sg of (cc ? cc.segs : [])) {
      if (sg.inInt) { const { p } = corridor(S, H2, sg.b); pMax = Math.max(pMax, p / (Lh || 1)); }
    }
    const km = dist({ lat: s[2], lon: s[3] }, { lat: H.lat, lon: H.lon });
    if (!best || cover > best.cover || (cover === best.cover && (pMax < best.pMax || (pMax === best.pMax && km < best.km)))) {
      best = { st: { name: s[0], city: s[1], lat: s[2], lon: s[3] }, cover, pMax };
    }
  }
  return best;
}"""
assert old in src; src = src.replace(old, new, 1)

# 3) onPlan: 弹窗/状态 改联程段判定
old = """    // 推荐区间端点
    const best = smartBest(S, H, state.trips);
    const suggest = best && best.st.name !== H.name ? best.st : null;
    let modal = { show: true, suggest: null, g2: 0, e2: 0, b2: 0, isDest: false, altern: '', dests: [] };
    if (suggest) {
      const H2 = { name: suggest.name, city: suggest.city, lat: suggest.lat, lon: suggest.lon };
      const j2 = state.trips.map(t => judge(S, H2, t.station));
      modal = { show: true, suggest,
        g2: j2.filter(x => x === 2).length, e2: j2.filter(x => x === 1).length, b2: j2.filter(x => x === 0).length };
      // 推荐端点恰为目的地 → 可能绕路, 给出就近替代
      modal.isDest = state.trips.some(t => t.station && (t.station.name === suggest.name || t.station.city === suggest.city));
      const curCover = state.trips.filter(t => judge(S, H, t.station) === 2).length;
      const destNames = state.trips.map(t => t.station && t.station.name);
      const destCities = state.trips.map(t => t.station && t.station.city);
      let alt = null, aKm = 0, aCover = 0;
      for (const ss of STATIONS) {
        if (ss[0] === S.name || ss[0] === suggest.name) continue;
        const H3 = { name: ss[0], city: ss[1], lat: ss[2], lon: ss[3] };
        const cov = state.trips.filter(t => judge(S, H3, t.station) === 2).length;
        if (cov < curCover) continue;
        if (destNames.includes(ss[0]) || destCities.includes(ss[1])) continue;
        const km = dist({ lat: ss[2], lon: ss[3] }, { lat: H.lat, lon: H.lon });
        if (!alt || cov > aCover || (cov === aCover && km < aKm)) { alt = ss; aKm = km; aCover = cov; }
      }
      if (alt) modal.altern = alt[0] + ' · ' + alt[1] + '（覆盖 ' + aCover + '，出发地不动）';
    }
    // 每个目的地的当前判定(颜色), 指明哪里不行
    modal.dests = state.trips.map(t => {
      const j = judge(S, H, t.station);
      return {
        text: t.text,
        c: j === 2 ? '区间内·可买' : j === 1 ? '可能被查' : '超区间·不能买',
        cls: j === 2 ? 'g2' : j === 1 ? 'e2' : 'b2',
      };
    });
    this.setData({ modal });
    this.setStatus('已按离出发地由近到远排序：出发地 ' + state.depart.name + ' → ' + state.trips.map(t => t.text).join(' → '));"""
new = """    // 联程路线: 出发地 → 各程 → 出发地, 逐段判定(与规划页一致)
    const sts = state.trips.map(t => t.station);
    const cc0 = logic.chainV2(S, H, sts, H, H);
    const N = cc0 ? cc0.segs.length : 0;
    // 推荐区间端点(联程段覆盖)
    const best = smartBest(S, H, state.trips);
    const suggest = best && best.st.name !== H.name ? best.st : null;
    let modal = { show: true, suggest: null, g2: 0, e2: 0, b2: 0, isDest: false, altern: '', dests: [] };
    if (suggest) {
      const H2 = { name: suggest.name, city: suggest.city, lat: suggest.lat, lon: suggest.lon };
      const cc2 = logic.chainV2(S, H2, sts, H2, H2);
      const j2 = cc2 ? cc2.segs.map(sg => (sg.inInt ? 2 : 0)) : [];
      modal = { show: true, suggest,
        g2: j2.filter(x => x === 2).length, e2: 0, b2: j2.filter(x => x === 0).length };
      // 推荐端点恰为目的地 → 可能绕路, 给出就近替代
      modal.isDest = state.trips.some(t => t.station && (t.station.name === suggest.name || t.station.city === suggest.city));
      const curCover = cc0 ? cc0.okN : 0;
      const destNames = state.trips.map(t => t.station && t.station.name);
      const destCities = state.trips.map(t => t.station && t.station.city);
      let alt = null, aKm = 0, aCover = 0;
      for (const ss of STATIONS) {
        if (ss[0] === S.name || ss[0] === suggest.name) continue;
        if (s[1] === H.city) continue;
        const H3 = { name: ss[0], city: ss[1], lat: ss[2], lon: ss[3] };
        const cc3 = logic.chainV2(S, H3, sts, H3, H3);
        const cov = cc3 ? cc3.okN : 0;
        if (cov < curCover) continue;
        if (destNames.includes(ss[0]) || destCities.includes(ss[1])) continue;
        const km = dist({ lat: ss[2], lon: ss[3] }, { lat: H.lat, lon: H.lon });
        if (!alt || cov > aCover || (cov === aCover && km < aKm)) { alt = ss; aKm = km; aCover = cov; }
      }
      if (alt) modal.altern = alt[0] + ' · ' + alt[1] + '（覆盖 ' + aCover + '，出发地不动）';
    }
    // 每段当前判定(颜色), 指明哪里不行
    modal.dests = state.trips.map((t, i) => {
      const ok = cc0 ? cc0.segs[i].inInt : false;
      return { text: t.text, c: ok ? '区间内·可买' : '超区间·不能买', cls: ok ? 'g2' : 'b2' };
    });
    this.setData({ modal });
    const segTxt = cc0 ? cc0.segs.map(sg => (sg.inInt ? '✓' : '✗') + sg.b.name).join(' → ') : '';
    this.setStatus('联程路线：' + state.depart.name + ' → ' + state.trips.map(t => t.text).join(' → ') + ' → ' + state.depart.name + ' || ' + segTxt);"""
assert old in src; src = src.replace(old, new, 1)

# 4) renderAll: 行/圆点/统计 用联程段
old = """  renderAll() {
    const S = state.school, H = state.home;
    const planned = this.data.planned;
    // 区间线圆点
    const ivDots = state.trips.map(t => {
      if (!t.station || !planned || !S || !H) return null;
      const j = judge(S, H, t.station);
      const { t: tt } = corridor(S, H, t.station);
      const left = Math.min(90, Math.max(10, (tt + 0.05) / 1.1 * 100));
      return { left: +left.toFixed(1), cls: j === 2 ? 'ok' : j === 1 ? 'edge' : 'bad', name: t.text };
    }).filter(Boolean);
    // 列表
    const rows = state.trips.map((t, i) => {
      const j = planned && S && H ? judge(S, H, t.station) : -1;
      return {
        key: 't' + t.id, id: t.id, text: t.text,
        boxCls: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : '',
        ring: j === 2 ? 'ok' : j === 1 ? 'edge' : j === 0 ? 'bad' : 'none',
        status: j === 2 ? '区间内' : j === 1 ? '可能被查' : j === 0 ? '超区间' : '',
        anim: false,
      };
    });
    // 消耗次数
    const okN = S && H ? state.trips.filter(t => judge(S, H, t.station) === 2).length : 0;
    const edgeN = S && H ? state.trips.filter(t => judge(S, H, t.station) === 1).length : 0;
    const badN = S && H ? state.trips.filter(t => judge(S, H, t.station) === 0).length : 0;
    const used = (okN + edgeN) > 0 ? 1 : 0;"""
new = """  renderAll() {
    const S = state.school, H = state.home;
    const planned = this.data.planned;
    // 联程路线段判定
    let cc = null;
    if (planned && S && H && state.trips.length) cc = logic.chainV2(S, H, state.trips.map(t => t.station), H, H);
    const segOf = i => (cc && cc.segs[i]) ? cc.segs[i].inInt : false;
    // 区间线圆点
    const ivDots = state.trips.map((t, i) => {
      if (!t.station || !planned || !S || !H) return null;
      const ok = segOf(i);
      const { t: tt } = corridor(S, H, t.station);
      const left = Math.min(90, Math.max(10, (tt + 0.05) / 1.1 * 100));
      return { left: +left.toFixed(1), cls: ok ? 'ok' : 'bad', name: t.text };
    }).filter(Boolean);
    // 列表
    const rows = state.trips.map((t, i) => {
      const j = planned && S && H ? (segOf(i) ? 2 : 0) : -1;
      return {
        key: 't' + t.id, id: t.id, text: t.text,
        boxCls: j === 2 ? 'ok' : j === 0 ? 'bad' : '',
        ring: j === 2 ? 'ok' : j === 0 ? 'bad' : 'none',
        status: j === 2 ? '区间内' : j === 0 ? '区间外' : '',
        anim: false,
      };
    });
    // 消耗次数(联程: 全程可出=1次/往返2次)
    const okN = cc ? cc.okN : 0;
    const badN = cc ? cc.segs.length - cc.okN : 0;
    const used = cc && cc.okAll ? (state.trips.some(t => t.round) ? 2 : 1) : 0;"""
assert old in src; src = src.replace(old, new, 1)

open('miniprogram/pages/index/index.js', 'w', encoding='utf-8', newline='\n').write(src)
b = open('miniprogram/pages/index/index.js', 'rb').read()
open('miniprogram/pages/index/index.js', 'wb').write(b.replace(b'\r\n', b'\n'))
print('小程序联程化完成: onPlan/renderAll/smartBest → chainV2 段级')