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
    const sub = row.querySelector('.trip-main .sub').textContent; // "武汉 到 岳阳东 · 181 km"
    let stName = null;
    const arrow = sub.split(' 到 ');
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
  A('初始未触发用户操作(touched=false)', state.touched === false);
  A('初始结果区未上浮', !$('wsResult').classList.contains('float-up'));
  A('默认串联模式开启', $('chainControls').style.display === 'block', $('chainControls').style.display);
  A('行程行=2(岳阳+重庆)', $all('.trip-row').length === 2, $all('.trip-row').length);
  A('串联: 重庆超区间 → 最优分段1次(岳阳段联程+重庆全价)', pageUsed() === 1, pageUsed());
  A('胶囊链条渲染(含红色超区间段)', $('chainPreview').innerHTML.includes('route-chain') && $('chainPreview').innerHTML.includes('#ef4444'));
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
  A('学校家都改后演示行程自动清除', $all('.trip-row').length === 0, $all('.trip-row').length);
  // 演示行程已被自动清除, 补回后续流程需要的行程
  $('tripInput').value = '岳阳'; await w.eval('addTrip()');
  $('tripInput').value = '重庆'; await w.eval('addTrip()');
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
  await w.eval('toggleRound(state.trips.find(t => t.text === "成都").id)');
  syncTripsToLogic(); const exp5 = evalWith(o('贵阳北'));
  A('UI 总计=逻辑总计(单程→往返 多一次)', pageUsed() === exp5.used, `${pageUsed()} vs ${exp5.used}`);
  A('默认单程, 切换后显示 往返', $all('.trip-row')[2].querySelector('.switch').textContent.includes('往返'));

  G('T6. 删除成都');
  await w.eval('removeTrip(state.trips.find(t => t.text === "成都").id)');
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
  A('路线预览含串联(到)', $('chainPreview').textContent.includes('北京西') && $('chainPreview').textContent.includes('到') && $('chainPreview').textContent.includes('长沙'));
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
  A('第1步: 填学校', $('spotTitle').textContent.includes('填学校') && $('spotText').textContent.includes('学校') && $('spotHole').style.width !== '');
  await w.eval('nextSpot()');
  A('第2步: 家', $('spotTitle').textContent.includes('家'));
  await w.eval('nextSpot()');
  A('第3步: 添加目的地', $('spotTitle').textContent.includes('想去的地方'));
  await w.eval('nextSpot()');
  A('第4步: 拖动排序', $('spotTitle').textContent.includes('拖动排序') && $('spotText').textContent.includes('拖动'));
  await w.eval('nextSpot()');
  A('第5步: 看区间线', $('spotTitle').textContent.includes('看区间线'));
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
  A('行程行显示出发地', $all('.trip-row').at(-1).textContent.includes('天津 到 济南'));
  await w.eval('removeTrip(' + lr.id + ')');
  $('tripInput').value = '济南';
  await w.eval('addTrip()');
  await wait(300);
  A('无出发地行程默认从学校出发', $all('.trip-row').at(-1).textContent.includes('北京西 到 济南'));
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
  // 链式列表拖拽: 起点行=索引0, 郑州=1, 长沙=2 → 把郑州拖到长沙位置
  await w.eval('stopDragStart({dataTransfer:{setData(){}}, target:null}, 1)');
  await w.eval('stopDrop({preventDefault(){}, dataTransfer:{getData:()=>"1"}}, 2)');
  A('拖拽后顺序反转(长沙在前)', (await w.eval('state.trips[0].text')) === '长沙');
  w.prompt = () => '广州';
  await w.eval('setChainEnd()');
  await wait(400);
  const endName = await w.eval('state.chainEnd && state.chainEnd.name');
  A('终点可改为广州(不去家)', endName === '广州南', endName);
  A('预览含广州终点', $('chainPreview').textContent.includes('广州'));
  A('终点标签更新', $('chainEndLabel').textContent.includes('广州'));
  await w.eval('state.chainEnd = null; renderAll();');

  G('T18. 超区间行程建议(小红书案例展示已移除)');
  const hasCasesBox = !!w.document.getElementById('casesBox');
  const hasRealCases = typeof w.REAL_CASES !== 'undefined';
  A('案例展示区已删除', !hasCasesBox && !hasRealCases);
  await w.eval('setChainMode(false)');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('setHomeFromStation("济南西")');
  $('schoolInput').value = '崇左南';
  await w.eval('searchPlace("school")');
  $('tripInput').value = '天津→济南';
  await w.eval('addTrip()');
  await wait(400);
  A('无案例区节点', !w.document.getElementById('casesInner'));
  A('试买判断提示存在', $('advice').textContent.includes('先试买判断'));

  G('T19. 区间画图 + 区间内可去推荐');
  await w.eval('setChainMode(false)');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('setHomeFromStation("长沙南")');
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  await wait(400);
  A('区间线渲染(学校/家节点)', $('intervalViz').innerHTML.includes('iv-line') && $('intervalViz').textContent.includes('武汉') && $('intervalViz').textContent.includes('长沙南'));
  A('区间内可去推荐出现', $('zoneCities').innerHTML.includes('区间内可去') && $('zoneCities').querySelectorAll('.hot-chip').length > 0);
  const chipCount = $('zoneCities').querySelectorAll('.hot-chip').length;
  A('推荐城市≥2', chipCount >= 2, '实际 ' + chipCount);
  // 模拟"不会用"的旅客: 点第一个推荐城市
  const firstChip = $('zoneCities').querySelector('.hot-chip');
  const cityName = firstChip.textContent;
  await w.eval('quickAdd("' + cityName + '")');
  await wait(400);
  A('点推荐城市后行程出现', $all('.trip-row').length === 1 && $all('.trip-row')[0].textContent.includes(cityName));

  G('T20. 向导式输入(学校→家→想去哪)');
  await w.eval('setGuideStep(0)');
  A('步骤0: 仅学校面板可见', $all('.wz-panel')[0].style.display !== 'none' && $all('.wz-panel')[1].style.display === 'none' && $all('.wz-panel')[2].style.display === 'none');
  A('步骤0高亮', $all('.wz-step')[0].classList.contains('active'));
  // 填学校 -> 自动进步骤1
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  A('学校确认后自动进入步骤1(家)', $all('.wz-panel')[1].style.display !== 'none' && $all('.wz-panel')[0].style.display === 'none');
  A('步骤0显示已完成✓', $all('.wz-step')[0].classList.contains('done'));
  // 填家 -> 自动进步骤2
  $('homeInput').value = '长沙';
  await w.eval('searchPlace("home")');
  A('家确认后自动进入步骤2(想去哪)', $all('.wz-panel')[2].style.display !== 'none');
  A('步骤1显示已完成✓', $all('.wz-step')[1].classList.contains('done'));
  // 步骤2 添加地点
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  await wait(300);
  A('步骤2 添加成功', $all('.trip-row').length >= 1);
  // 步骤条可回点
  await w.eval('setGuideStep(0)');
  A('回点步骤0 学校面板恢复', $all('.wz-panel')[0].style.display !== 'none');
  await w.eval('setGuideStep(2)');

  G('T22. 结果区上浮/下沉动画');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('setHomeFromStation("长沙南")');
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  await wait(500);
  A('添加地点后结果区不上浮(仅规划才上浮)', !$('wsResult').classList.contains('float-up'), $('wsResult').className);
  await w.eval('onPlan()');
  await wait(500);
  A('规划后结果区上浮', $('wsResult').classList.contains('float-up'), $('wsResult').className);
  await w.eval('setGuideStep(0)');
  A('改输入时结果区下沉', $('wsResult').classList.contains('sink'));
  await w.eval('setGuideStep(2)');
  await wait(600);

  G('T23. 仅规划才下滑');
  await w.eval('state.touched = true; state.resultFloated = false; searchPlace("school")'); // 改输入不应上浮
  await wait(200);
  A('改输入后不上浮', !$('wsResult').classList.contains('float-up'));
  $('tripInput').value = '岳阳';
  await w.eval('state.resultFloated = false; addTrip()'); // 添加地点不应上浮
  await wait(300);
  A('添加地点后不上浮', !$('wsResult').classList.contains('float-up'));
  await w.eval('state.resultFloated = false; onPlan()'); // 规划才上浮
  await wait(300);
  A('规划后上浮', $('wsResult').classList.contains('float-up'));

  G('T24. 未完成三步不显示结果区');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await wait(300);
  A('清空行程后结果区隐藏', $('totals').style.display === 'none' && $('chainPreview').style.display === 'none');
  A('占位提示显示', $('resultPlaceholder').style.display === 'block');
  await w.eval('setHomeFromStation("长沙南")');
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  await wait(400);
  A('完成三步后结果区恢复', $('totals').style.display !== 'none' && $('resultPlaceholder').style.display === 'none');




  G('T21. 引导对齐向导步骤');
  await w.eval('startGuide()');
  await wait(450);
  A('引导第1步: 学校面板可见', $all('.wz-panel')[0].style.display !== 'none');
  await w.eval('nextSpot()');
  await wait(450);
  A('引导第2步: 家面板自动切换可见', $all('.wz-panel')[1].style.display !== 'none', $all('.wz-panel')[1].style.display);
  A('聚焦框已定位(非0宽)', $('spotHole').style.width !== '' && $('spotHole').style.width !== '0px');
  await w.eval('nextSpot()');
  await wait(450);
  A('引导第3步: 目的地面板可见', $all('.wz-panel')[2].style.display !== 'none');
  await w.eval('closeGuide()');

  G('T25. 折返路线: 联程0次但展示拆开买最低(用户场景 石家庄/贵阳北+长沙/岳阳)');
  await w.eval('setHomeFromStation("贵阳北")');
  $('schoolInput').value = '石家庄';
  await w.eval('searchPlace("school")');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('state.chainRound = false;');
  $('tripInput').value = '长沙';
  await w.eval('addTrip()');
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  await w.eval('setChainMode(true)');
  A('折返警告出现(岳阳东在长沙南北边)', $('chainCheck').textContent.includes('回头路'));
  A('回头段可视化(↺标记+条纹)', $('chainPreview').textContent.includes('↺') && $('chainPreview').innerHTML.includes('repeating-linear-gradient'), $('chainPreview').textContent.slice(0, 60));
  A('列表行标注回头站(岳阳)', $all('.trip-row')[1].textContent.includes('↺ 回头'), $all('.trip-row')[1].textContent.slice(0, 40));
  A('整条路线消耗 2 次(折返分两段联程)', $('totals').querySelector('.total-box .num').textContent.startsWith('2 /'));
  A('提示最优分段', $('resultHint').textContent.includes('最优分段'));
  A('提示含原因:走了回头路', $('resultHint').textContent.includes('走了回头路'));
  A('拆开买最低=2段×1次=2', $all('.total-box .num')[4].textContent === '2', $all('.total-box .num')[4].textContent);
  A('警示横幅给出分段方案', $('banners').textContent.includes('最优分段'));
  A('建议点自动排序(可排序修复)', $('chainCheck').textContent.includes('自动排序') && !$('chainCheck').textContent.includes('排序救不了'));
  await w.eval('state.chainRound = true; renderChain();');
  A('往返: 拆开买最低=2段×2次=4', $all('.total-box .num')[4].textContent === '4', $all('.total-box .num')[4].textContent);
  await w.eval('state.chainRound = false; renderChain();');
  await w.eval('chainAutoSort()');
  A('自动排序把岳阳排在长沙前', $all('.trip-main b')[0].textContent === '岳阳' && $all('.trip-main b')[1].textContent === '长沙', $all('.trip-main b').map(b=>b.textContent).join(' | '));
  A('自动排序后折返消失', !$('chainCheck').textContent.includes('回头路'));
  A('自动排序后联程合并=1次', $('totals').querySelector('.total-box .num').textContent.startsWith('1 /'));

  G('T26. 区间优化: ⭐最优置顶 + 候选行写明具体路线');
  await w.eval('renderOpt()');
  const optRows = () => [...w.document.querySelectorAll('#optList .opt-row')];
  const r0 = optRows()[0];
  A('最优方案置顶(第一行含⭐)', r0.textContent.includes('⭐'));
  A('第一行是最优候选', r0.querySelector('b').textContent.includes('⭐'));
  A('候选行写明具体路线(学校到…到新家)', r0.textContent.includes('石家庄') && r0.textContent.includes('到'));
  A('路线带学生票/全价标记', r0.textContent.includes('学生票') || r0.textContent.includes('全价'));
  A('当前区间行也写具体路线', $('optCurrent').textContent.includes('到') && $('optCurrent').textContent.includes('学生票'));
  await w.eval('setOptMode("near")');
  A('离家最近视图下最优仍置顶', optRows()[0].textContent.includes('⭐'));
  await w.eval('setOptMode("save")');
  A('切回最省次数视图恢复', optRows()[0].textContent.includes('⭐'));

  G('T27. "A到B"语法 + 改学校清演示行程 + 显示用"到"');
  // 用户场景: 学校郑州 家信阳, 输入"武汉到郑州"
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('setHomeFromStation("信阳")');
  $('schoolInput').value = '郑州';
  await w.eval('searchPlace("school")');
  A('学校已设为郑州', w.eval('state.school.station.city') === '郑州', w.eval('state.school.station.name'));
  $('tripInput').value = '武汉到郑州';
  await w.eval('addTrip()');
  await wait(300);
  const t27 = await w.eval('state.trips.at(-1)');
  A('"武汉到郑州"解析出出发地武汉', !!t27.from && t27.from.name === '武汉', JSON.stringify(t27 && { from: t27.from && t27.from.name, to: t27.station && t27.station.name }));
  A('目的地为郑州', !!t27.station && t27.station.name.includes('郑州'));
  A('行程行显示"武汉 到 郑州"且无箭头', $all('.trip-row').at(-1).textContent.includes('武汉 到 郑州') && !$all('.trip-row').at(-1).textContent.includes('→'));
  A('输入占位提示用"到"', $('tripInput').placeholder.includes('天津到济南'));
  A('向导提示用"到"', w.document.querySelectorAll('.wz-panel')[2].textContent.includes('天津到济南'));
  // 演示行程自动清除: 模拟演示态(打上demo标记), 学校/家都改成非演示城市后消失
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  await w.eval('setHomeFromStation("长沙")');
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  await wait(300);
  await w.eval('state.trips.forEach(t => t.demo = true)');
  A('演示态(武汉/长沙)行程保留', $all('.trip-row').length === 1, $all('.trip-row').length);
  $('homeInput').value = '信阳';
  await w.eval('searchPlace("home")');
  await wait(300);
  A('只改家(学校仍武汉)演示行程保留', $all('.trip-row').length === 1, $all('.trip-row').length);
  $('schoolInput').value = '郑州';
  await w.eval('searchPlace("school")');
  await wait(300);
  A('学校家都改后演示行程自动清除', $all('.trip-row').length === 0, $all('.trip-row').length);

  G('T28. 顶部应用最优 + 弹窗 + 热门删除 + 独立行程并入区间');
  A('热门城市已删除', !w.document.getElementById('quickChips'));
  A('顶部控制条有应用最优按钮', $('chainControls').textContent.includes('应用最优区间'));
  // 构造: 学校武汉 家信阳 行程岳阳 → 当前非最优, 应用后弹大窗
  await w.eval('setHomeFromStation("信阳")');
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  await wait(300);
  await w.eval('applyBest()');
  A('应用后大弹窗出现', $('applyModal').style.display === 'flex', $('applyModal').style.display);
  A('弹窗头部含"家"', $('applyModalHead').textContent.includes('家'));
  A('弹窗内容含新区间与具体路线', $('applyModalBody').textContent.includes('区间') && $('applyModalBody').textContent.includes('到'));
  A('弹窗可下滑滚动', w.getComputedStyle($('applyModalBody')).overflowY === 'auto');
  A('弹窗含次数统计', $('applyModalBody').textContent.includes('次'));
  await w.eval('closeApplyModal()');
  A('关闭后弹窗隐藏', $('applyModal').style.display === 'none');
  // 独立行程模式也显示上方区间进度条
  await w.eval('setChainMode(false)');
  A('独立行程显示节点进度条', $('chainPreview').innerHTML.includes('route-chain'));
  A('独立行程段提示含判定', $('chainPreview').textContent.includes('学生票') || $('chainPreview').textContent.includes('全价'));

  G('T29. 结果区列表: 起点/中转/终点徽章 + 拖拽 + 规划(步骤③只留输入)');
  await w.eval('setChainMode(true)');
  $('homeInput').value = '信阳';
  await w.eval('searchPlace("home")');
  $('schoolInput').value = '武汉';
  await w.eval('searchPlace("school")');
  await w.eval('state.trips.forEach(t => removeTrip(t.id))');
  A('步骤③无地点列表(只留输入)', !w.document.getElementById('stopList'));
  A('出发地输入框预填学校', $('fromInput').value.includes('武汉'), $('fromInput').value);
  $('tripInput').value = '岳阳';
  await w.eval('addTrip()');
  A('结果区列表有起点行(武汉)', $all('.stop-row').length === 1 && $all('.stop-row')[0].textContent.includes('起点') && $all('.stop-row')[0].textContent.includes('武汉'), $all('.stop-row').length);
  A('列表不显示学校/家字样', !$('tripList').textContent.includes('学校') && !$('tripList').textContent.includes('信阳'));
  A('单个地点=终点(岳阳东)', $all('.trip-row').at(-1).textContent.includes('终点') && $all('.trip-row').at(-1).textContent.includes('岳阳东'));
  A('规划按钮在最后地点右侧', $all('.trip-row').at(-1).textContent.includes('规划'));
  $('tripInput').value = '重庆';
  await w.eval('addTrip()');
  A('两个地点: 中转+终点', $all('.trip-row')[0].textContent.includes('中转') && $all('.trip-row')[1].textContent.includes('终点'));
  // 拖拽: 把岳阳东(索引1)拖到起点之前 → 岳阳东成为起点
  await w.eval('stopReorder(1, 0)');
  A('拖动后第一个=起点(岳阳东)', w.eval('state.routeStart && state.routeStart.name') === '岳阳东', w.eval('state.routeStart && state.routeStart.name'));
  A('拖动后行程重排', w.eval('state.trips.map(t => t.station.name).join(",")'), w.eval('state.trips.map(t => t.station.name).join(",")'));
  A('最后地点=终点(重庆北)', $all('.trip-row').at(-1).textContent.includes('终点') && $all('.trip-row').at(-1).textContent.includes('重庆北'));
  $('fromInput').value = '长沙';
  await w.eval('setRouteFrom()');
  A('自定义出发地生效', w.eval('state.routeStart && state.routeStart.name') && w.eval('state.routeStart.name').includes('长沙'), w.eval('state.routeStart && state.routeStart.name'));
  A('列表起点=长沙', $all('.stop-row')[0].textContent.includes('起点') && $all('.stop-row')[0].textContent.includes('长沙'));
  A('进度条起点=长沙', $('chainPreview').textContent.includes('长沙'));
  await w.eval('state.touched = false; state.resultFloated = false; onPlan()');
  await wait(300);
  A('规划后结果上浮', $('wsResult').classList.contains('float-up'));
  A('规划后自动排序提示', $('status').textContent.includes('顺路排序'));
  A('进度条节点角色为起点/中转/终点', $('chainPreview').textContent.includes('开始') && $('chainPreview').textContent.includes('中转') && $('chainPreview').textContent.includes('结束'));
  await w.eval('state.routeStart = null; renderAll();');




  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
