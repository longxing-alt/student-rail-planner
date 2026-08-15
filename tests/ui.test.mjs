// 学生优惠区间规划器 —— UI 端到端测试（jsdom 驱动真实页面脚本 + Leaflet 桩）
// 核心思路: 纯逻辑模块给出"期望值", 页面 DOM 渲染结果必须与之一致（UI↔逻辑契约测试）
// 运行: node tests/ui.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const logicCode = html.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];

/* 纯逻辑侧: 期望值来源 */
const { STATIONS, state, evalWith } = new Function(logicCode + '\nreturn {STATIONS,state,evalWith,dist};')();
const ST = Object.fromEntries(STATIONS.map(s => [s[0], s]));
const o = n => { const s = ST[n]; return { name: s[0], city: s[1], lat: s[2], lon: s[3], hub: !!s[4] }; };
const expected = (schoolName, homeName, trips) => {
  state.school = { station: o(schoolName) };
  return evalWith(o(homeName)); // trips 从页面 state 同步
};

/* Leaflet 桩: 所有方法可链式空操作, 始终返回自身代理 */
const chainStub = () => {
  const handler = {
    get: (t, k) => {
      if (k === 'getLatLng') return () => ({ lat: 30, lng: 112 });
      if (k === 'getContainer') return () => ({ style: {} });
      if (k === 'hasLayer') return () => false;
      if (k === 'then') return undefined; // 避免被当作 thenable
      return () => proxy;
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
};

/* 组装测试页面: 移除原始内联脚本(待重注入), 去掉外部CDN脚本, 注入桩 + 应用脚本 */
const stubCode = `
window.__chainStub = ${chainStub.toString()};
window.L = {
  map: () => window.__chainStub(), tileLayer: () => window.__chainStub(), featureGroup: () => window.__chainStub(),
  layerGroup: () => ({ addLayer: () => {} }), marker: () => window.__chainStub(), polyline: () => window.__chainStub(),
  circleMarker: () => window.__chainStub(), divIcon: () => ({ className: 'x' }), latLngBounds: () => window.__chainStub(),
  control: { layers: () => window.__chainStub() },
};`;
const testHtml = html
  .replace(/<script src="https:\/\/unpkg\.com[^>]*><\/script>/g, '')
  .replace(/<script>[\s\S]*?<\/script>\s*<\/body>/, '<script>' + stubCode + '</script>\n<script>\n' + appScript + '\n</script>\n</body>');
const dom = new JSDOM(testHtml, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
const $ = id => w.document.getElementById(id);
const $all = sel => [...w.document.querySelectorAll(sel)];
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const A = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${name} ${extra}`); } };
const G = name => console.log(`\n== ${name} ==`);

/* 页面行程 → 纯逻辑行程同步, 并返回纯逻辑期望结果 */
function syncTripsToLogic() {
  state.trips = $all('.trip-row').map((row, i) => {
    const text = row.querySelector('.trip-main b').textContent;
    const sub = row.querySelector('.trip-main .sub').textContent; // "武汉 → 岳阳东 · 181 km"
    let stName = null;
    const arrow = sub.split(' → ');
    if (arrow.length >= 2) stName = arrow[1].split(' · ')[0];
    const st = stName && ST[stName] ? o(stName) : null;
    const sw = row.querySelector('.switch input');
    return { id: i + 1, text, station: st, round: sw ? sw.checked : false };
  });
  return state.trips;
}
function pageUsed() { return parseInt($('totals').querySelector('.total-box .num').textContent.split(' / ')[0], 10); }
/* 用户可见文本中是否含 NaN/undefined（排除脚本源码） */
function visibleBadText() {
  const walker = w.document.createTreeWalker(w.document.body, w.NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const p = walker.currentNode.parentElement;
    if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) continue;
    const t = walker.currentNode.textContent;
    if (t.includes('NaN') || t.includes('undefined')) return true;
  }
  return false;
}
const pageSchoolName = () => w.eval('state.school && state.school.station && state.school.station.name');
const pageHomeName = () => w.eval('state.home && state.home.station && state.home.station.name');

async function main() {
  await wait(150); // 等待 init() 完成
  G('T1. 初始加载(演示数据, 联程默认)');
  A('默认串联模式开启', $('chainControls').style.display === 'block', $('chainControls').style.display);
  A('行程行=2(岳阳+重庆)', $all('.trip-row').length === 2, $all('.trip-row').length);
  A('串联: 路线不可合并(重庆超区间) → 0次', pageUsed() === 0);
  A('直线图渲染(含红色全价段)', $('routeLine').innerHTML.includes('route-bar') && $('routeLine').innerHTML.includes('#ef4444'));
  A('建议条: 提示把家改到重庆', $('advice').textContent.includes('改到') && $('advice').textContent.includes('重庆'));
  A('优化候选=9(当前+8)', $all('.opt-row').length === 9, $all('.opt-row').length);
  A('页面无 NaN/undefined', !visibleBadText());
  A('提示含演示', $('status').textContent.includes('演示'));
  A('demoTip 显示且含演示说明', $('demoTip').style.display === 'block' && $('demoTip').textContent.includes('演示说明'));
  // 切到独立行程模式, 继续原流程
  await w.eval('setChainMode(false)');
  A('切独立模式: 岳阳直达1+重庆全价0 = 1次', pageUsed() === 1);

  G('T2. 修改学校 → 北京');
  $('schoolInput').value = '北京';
  await w.eval('searchPlace("school")');
  const schName = await pageSchoolName();
  A('学校吸附=北京西', schName === '北京西', schName);
  state.school = { station: o('北京西') };
  syncTripsToLogic(); const exp2 = evalWith(o('长沙南')); // 家仍为长沙南
  A('UI 总计=逻辑总计', pageUsed() === exp2.used, `${pageUsed()} vs ${exp2.used}`);
  A('结果提示含 北京西', $('resultHint').textContent.includes('北京西'));
  A('修改学校后 demoTip 隐藏', $('demoTip').style.display === 'none');

  G('T3. 修改家 → 贵阳北');
  $('homeInput').value = '贵阳北';
  await w.eval('searchPlace("home")');
  const homeName3 = await pageHomeName();
  A('家吸附=贵阳北', homeName3 === '贵阳北', homeName3);
  syncTripsToLogic(); const exp3 = evalWith(o('贵阳北'));
  A('UI 总计=逻辑总计', pageUsed() === exp3.used, `${pageUsed()} vs ${exp3.used}`);
  A('结果提示含 贵阳北', $('resultHint').textContent.includes('贵阳北'));

  G('T4. 添加行程 成都(默认单程)');
  $('tripInput').value = '成都';
  await w.eval('addTrip()');
  A('行程行=3(演示2+成都)', $all('.trip-row').length === 3, $all('.trip-row').length);
  syncTripsToLogic(); const exp4 = evalWith(o('贵阳北'));
  A('UI 总计=逻辑总计', pageUsed() === exp4.used, `${pageUsed()} vs ${exp4.used}`);
  const cdRow = $all('.trip-row')[2];
  const cdPlan = exp4.perTrip.find(t => t.text === '成都').plan;
  const badge = cdRow.querySelector('.chip').textContent;
  A('成都徽章=逻辑判定', (cdPlan.mode === 'direct' && badge.includes('直达')) || (cdPlan.mode === 'transfer' && badge.includes('中转')) || (cdPlan.mode === 'full' && badge.includes('全价')), badge);

  G('T5. 切换成都 → 单程');
  await w.eval('toggleRound(' + state.trips.find(t => t.text === '成都').id + ')');
  syncTripsToLogic(); const exp5 = evalWith(o('贵阳北'));
  A('UI 总计=逻辑总计(单程→往返 多一次)', pageUsed() === exp5.used, `${pageUsed()} vs ${exp5.used}`);
  A('默认单程, 切换后显示 往返', $all('.trip-row')[2].querySelector('.switch').textContent.includes('往返'));

  G('T6. 删除成都');
  await w.eval('removeTrip(' + state.trips.find(t => t.text === '成都').id + ')');
  A('行程行=2(删除成都后)', $all('.trip-row').length === 2);
  syncTripsToLogic(); const exp6 = evalWith(o('贵阳北'));
  A('UI 总计=逻辑总计', pageUsed() === exp6.used, `${pageUsed()} vs ${exp6.used}`);

  G('T7. 采用候选区间端点 石家庄');
  await w.eval('setHomeFromStation("石家庄")');
  A('家输入框=石家庄 · 石家庄', $('homeInput').value.includes('石家庄'), $('homeInput').value);
  syncTripsToLogic(); const exp7 = evalWith(o('石家庄'));
  A('UI 总计=逻辑总计', pageUsed() === exp7.used, `${pageUsed()} vs ${exp7.used}`);
  A('当前区间行含 石家庄', $('optCurrent').textContent.includes('石家庄'));

  G('T8. 应用最优区间');
  const before = $('status').textContent;
  await w.eval('applyBest()');
  A('状态提示更新(最优/已应用)', $('status').textContent !== before && ($('status').textContent.includes('最优') || $('status').textContent.includes('已应用')), $('status').textContent.slice(0, 60));
  const homeName8 = await pageHomeName();
  syncTripsToLogic(); const exp8 = evalWith(o(homeName8));
  A('应用后 UI 总计=逻辑总计', pageUsed() === exp8.used, `${pageUsed()} vs ${exp8.used}`);

  G('T9. 视图切换: 覆盖全部');
  await w.eval('setOptMode("full")');
  const rows9 = $all('.opt-row');
  A('覆盖全部视图行>0', rows9.length > 0);
  const candRows9 = [...w.document.querySelectorAll('#optList .opt-row')];
  A('候选行全部覆盖 2/2', candRows9.length > 0 && candRows9.every(r => r.textContent.includes('覆盖 2/2')), candRows9.map(r => (r.textContent.match(/覆盖 \d\/\d/) || [''])[0]).join(','));
  A('视图按钮高亮', $all('.opt-tab')[1].classList.contains('active'));
  await w.eval('setOptMode("save")');

  G('T10. 预算修改');
  $('budgetInput').value = 2;
  $('budgetInput').dispatchEvent(new w.Event('change'));
  A('总计分母=2', $('totals').querySelector('.total-box .num').textContent.includes('/ 2'));
  A('剩余=预算-已用', parseInt($all('.total-box .num')[1].textContent, 10) === 2 - pageUsed());
  A('预算内提示出现', $('banners').textContent.length > 0);
  $('budgetInput').value = 4;
  $('budgetInput').dispatchEvent(new w.Event('change'));

  G('T11. 中转比例滑块');
  $('ratioInput').value = 2.0;
  $('ratioInput').dispatchEvent(new w.Event('input'));
  A('比例显示 2.00×', $('ratioVal').textContent === '2.00×', $('ratioVal').textContent);
  const homeName11 = await pageHomeName();
  syncTripsToLogic(); const exp11 = evalWith(o(homeName11));
  A('UI 总计=逻辑总计(比例2.0)', pageUsed() === exp11.used, `${pageUsed()} vs ${exp11.used}`);
  $('ratioInput').value = 1.5;
  $('ratioInput').dispatchEvent(new w.Event('input'));

  G('T12. 快速添加城市(快捷按钮路径)');
  await w.eval('quickAdd("上海")');
  A('行程行=3(演示2+上海)', $all('.trip-row').length === 3);
  const homeName12 = await pageHomeName();
  syncTripsToLogic(); const exp12 = evalWith(o(homeName12));
  A('UI 总计=逻辑总计', pageUsed() === exp12.used, `${pageUsed()} vs ${exp12.used}`);

  G('T13. 空学校防护(不崩溃)');
  const beforeHint = $('resultHint').textContent;
  $('schoolInput').value = '不存在的城市XYZ';
  await w.eval('searchPlace("school")');
  A('解析失败有提示', $('status').textContent.includes('未能解析'));
  A('页面未崩溃', $('resultHint') !== null);

  G('T14. 串联路线模式');
  await w.eval('setHomeFromStation("贵阳北")');
  $('schoolInput').value = '北京';
  await w.eval('searchPlace("school")');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  A('行程已清空', $all('.trip-row').length === 0);
  $('tripInput').value = '郑州';
  await w.eval('addTrip()');
  $('tripInput').value = '长沙';
  await w.eval('addTrip()');
  A('已添加 郑州+长沙', $all('.trip-row').length === 2);
  await w.eval('setChainMode(true)');
  A('串联控件显示', $('chainControls').style.display === 'block');
  A('批量按钮隐藏', $('batchBtns').style.display === 'none');
  A('路线预览含箭头串联', $('chainPreview').textContent.includes('北京西') && $('chainPreview').textContent.includes('→') && $('chainPreview').textContent.includes('贵阳北'));
  A('校验含学生票标记', $('chainCheck').textContent.includes('学生票'));
  A('串联总计=1次(单程)', $('totals').querySelector('.total-box .num').textContent.startsWith('1 /'));
  A('串联无折返警告', !$('chainCheck').textContent.includes('折返'));
  await w.eval('chainAutoSort()');
  A('自动排序: 郑州在长沙前', $all('.trip-main b')[0].textContent === '郑州' && $all('.trip-main b')[1].textContent === '长沙');
  await w.eval('state.chainRound = true; renderChain();');
  A('整条路线往返=2次', $('totals').querySelector('.total-box .num').textContent.startsWith('2 /'));
  A('往返标签', $('chainRoundLabel').textContent.includes('往返'));
  await w.eval('state.trips.reverse(); renderAll();');
  A('反序出现回头路警告', $('chainCheck').textContent.includes('回头路'));
  await w.eval('setChainMode(false)');
  A('切回独立模式控件隐藏', $('chainControls').style.display === 'none');

  G('T15. 导航二级菜单 + 动画聚焦引导');
  A('下拉菜单默认关闭', !$('rulesMenu').classList.contains('open'));
  await w.eval('toggleRulesMenu({stopPropagation:()=>{}})');
  A('点击后展开', $('rulesMenu').classList.contains('open'));
  A('下拉含计算规则与官方对照', $('rulesMenu').textContent.includes('计算规则') && $('rulesMenu').textContent.includes('官方规则对照'));
  await w.eval('document.getElementById("rulesMenu").classList.remove("open")');
  A('地图选点模式已移除', $all('.map-mode').length === 0 && !($all('.map-tools')[0] || {textContent:''}).textContent.includes('设学校'));
  A('首次访问 spotlight 引导显示', $('spotlight').style.display === 'block');
  await wait(450); // 等聚焦框动画定位(380ms)
  A('第1步: 设置区间·学校', $('spotTitle').textContent.includes('设置区间') && $('spotText').textContent.includes('学校') && $('spotHole').style.width !== '');
  await w.eval('nextSpot()');
  A('第2步: 家', $('spotTitle').textContent.includes('家'));
  await w.eval('nextSpot()');
  A('第3步: 添加目的地', $('spotTitle').textContent.includes('想去的地方'));
  await w.eval('nextSpot()');
  A('第4步: 看结果(直线图)', $('spotTitle').textContent.includes('看结果'));
  A('最后一步显示完成按钮', $('spotDone').style.display !== 'none');
  await w.eval('closeGuide()');
  A('完成后 spotlight 隐藏', $('spotlight').style.display === 'none');
  await w.eval('startGuide()');
  A('导航可重新开始引导', $('spotlight').style.display === 'block');
  await w.eval('closeGuide()');

  G('T16. 行程出发地');
  await w.eval('setChainMode(false)');
  $('tripInput').value = '天津→济南';
  await w.eval('addTrip()');
  await wait(300);
  const lr = await w.eval('state.trips.at(-1)');
  A('添加成功', !!lr && lr.text === '天津→济南', lr && lr.text);
  A('出发地已解析为天津站', lr && lr.from && lr.from.name === '天津', lr && lr.from && lr.from.name);
  A('目的地为济南西', lr && lr.station && lr.station.name === '济南西', lr && lr.station && lr.station.name);
  A('行程行显示出发地', $all('.trip-row').at(-1).textContent.includes('天津 → 济南'));
  await w.eval('removeTrip(' + lr.id + ')');
  $('tripInput').value = '济南';
  await w.eval('addTrip()');
  await wait(300);
  A('无出发地行程默认从学校出发', $all('.trip-row').at(-1).textContent.includes('北京西 → 济南'));
  const tid = await w.eval('state.trips.at(-1).id');
  await w.eval('removeTrip(' + tid + ')');
  $('tripInput').value = '济南';
  await w.eval('addTrip()');
  await wait(300);
  const tid2 = await w.eval('state.trips.at(-1).id');
  w.prompt = () => '郑州';
  await w.eval('editFrom(' + tid2 + ')');
  await wait(400);
  const fromName = await w.eval('state.trips.find(t => t.id === ' + tid2 + ').from && state.trips.find(t => t.id === ' + tid2 + ').from.name');
  A('editFrom 设置出发地郑州', fromName === '郑州东', fromName);
  await w.eval('removeTrip(' + tid2 + ')');

  G('T17. 拖拽排序 + 串联终点 + 5天规则');
  await w.eval('state.chainRound = false; setChainMode(true)');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  $('tripInput').value = '郑州';
  await w.eval('addTrip()');
  $('tripInput').value = '长沙';
  await w.eval('addTrip()');
  await wait(300);
  A('5天规则提示存在(日历天)', $('fiveDayTip').style.display === 'block' && $('fiveDayTip').textContent.includes('5 个日历天'));
  A('默认单程(串联)', $('chainRoundLabel').textContent.includes('单程'));
  const firstId = await w.eval('state.trips[0].id');
  const secondId = await w.eval('state.trips[1].id');
  await w.eval('tripDragStart({}, ' + firstId + ')');
  await w.eval('tripDrop({preventDefault(){}}, ' + secondId + ')');
  A('拖拽后顺序反转(长沙在前)', (await w.eval('state.trips[0].text')) === '长沙');
  w.prompt = () => '广州';
  await w.eval('setChainEnd()');
  await wait(400);
  const endName = await w.eval('state.chainEnd && state.chainEnd.name');
  A('终点可改为广州(不去家)', endName === '广州南', endName);
  A('预览含广州终点', $('chainPreview').textContent.includes('广州'));
  A('终点标签更新', $('chainEndLabel').textContent.includes('广州'));
  await w.eval('state.chainEnd = null; renderAll();');

  G('T18. 案例库');
  const caseCount = await w.eval('REAL_CASES.length');
  A('案例库 15 条', caseCount >= 15, '实际 ' + caseCount);
  await w.eval('setChainMode(false)');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('setHomeFromStation("济南西")');
  $('schoolInput').value = '崇左南';
  await w.eval('searchPlace("school")');
  $('tripInput').value = '天津→济南';
  await w.eval('addTrip()');
  await wait(400);
  A('案例渲染含超区间案例', $('casesInner').textContent.includes('超区间'));
  A('试买判断提示存在', $('advice').textContent.includes('先试买判断'));

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
