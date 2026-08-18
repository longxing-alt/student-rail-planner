// 移动端视图（小程序同款）功能测试: jsdom 驱动真实 index.html 脚本
// 覆盖: 空白启动填写 学校/出发地/目的地 → 一键规划(着色/弹窗/次数) → 采用改区间端点
//       → Tab 切换(规划/规则/地图) → 引导可填写(spotlight 不拦截) → 清空
// 运行: node tests/web-mobile.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const appScript = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const chainStub = () => {
  const handler = {
    get: (t, k) => {
      if (k === 'getLatLng') return () => ({ lat: 30, lng: 112 });
      if (k === 'getContainer') return () => ({ style: {} });
      if (k === 'hasLayer') return () => false;
      if (k === 'then') return undefined;
      return () => proxy;
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
};
const stubCode = `
window.__chainStub = ${chainStub.toString()};
window.scrollTo = () => {};
window.Element.prototype.scrollIntoView = function(){};
window.confirm = () => true;
window.L = {
  map: () => window.__chainStub(), tileLayer: () => window.__chainStub(), featureGroup: () => window.__chainStub(),
  layerGroup: () => ({ addLayer: () => {} }), marker: () => window.__chainStub(), polyline: () => window.__chainStub(),
  circleMarker: () => window.__chainStub(), divIcon: () => ({ className: 'x' }), latLngBounds: () => window.__chainStub(),
  control: { layers: () => window.__chainStub() },
};
`;
const testHtml = html
  .replace(/<script src="https:\/\/unpkg\.com[^>]*><\/script>/g, '')
  .replace(/<script>[\s\S]*?<\/script>\s*<\/body>/, '<script>' + stubCode + '</script>\n<script>\n' + appScript + '\n</script>\n</body>');
const dom = new JSDOM(testHtml, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
const w = dom.window;
const $ = id => w.document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const A = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log('  ✗', name, extra); } };
const G = name => console.log('\n==', name, '==');

const flow = async () => {
  await wait(120); // init 演示数据(离线匹配, 微任务级)

  G('移动端: 空白启动填写学校/出发地');
  w.eval('state.school=null;state.home=null;state.trips=[];state.chainEnd=null;state.routeStart=null');
  A('初始无默认数据', w.eval('!state.school && !state.home && state.trips.length===0'));
  A('初始隐藏出发地/目的地卡', $('mDepartCard').style.display === 'none' && $('mDest').style.display === 'none');
  $('mSchoolInput').value = '武汉';
  w.eval('mSchoolNext()');
  await wait(60);
  A('学校=武汉', w.eval('state.school && state.school.station && state.school.station.name==="武汉"'));
  A('出发地卡出现', $('mDepartCard').style.display === 'block');
  $('mDepartInput').value = '长沙';
  w.eval('mDepartNext()');
  await wait(60);
  A('出发地=长沙(区间端点)', w.eval('state.home && state.home.station && state.home.station.name==="长沙南" || (state.home&&state.home.station&&state.home.station.name==="长沙")'));
  A('目的地区出现', $('mDest').style.display === 'block');

  G('移动端: 添加目的地');
  for (const c of ['岳阳', '重庆']) { $('mTripInput').value = c; await w.eval('mAddTrip()'); await wait(60); }
  A('已添加 2 个目的地', w.eval('state.trips.length') === 2);
  A('列表含起点行+2行', $all => $('mList').innerHTML.includes('起点 · 出发地') && /m-dest/g && true);

  G('移动端: 一键规划');
  w.eval('mPlan()');
  await wait(60);
  A('弹窗弹出', $('mModal').style.display === 'flex');
  A('建议推荐(小区间→有推荐)', $('mApplyBtn').style.display !== 'none', $('mApplyBtn').style.display);
  A('消耗 1 次 / 剩余 3', $('mUsedNum').textContent === '1' && $('mRemain').textContent === '3');
  A('chips 含统计', $('mChips').innerHTML.includes('区间内') && $('mChips').innerHTML.includes('超区间'));
  A('列表已着色', $('mList').innerHTML.includes('m-dest bad') && $('mList').innerHTML.includes('m-ring ok'));

  G('移动端: 采用推荐区间(只改端点)');
  const homeBefore = w.eval('state.home.station.name');
  w.eval('mApply()');
  await wait(60);
  const homeAfter = w.eval('state.home.station.name');
  A('区间端点已改为推荐站: ' + homeBefore + ' → ' + homeAfter, homeAfter !== homeBefore);
  A('弹窗已关闭', $('mModal').style.display === 'none');
  A('再次渲染含新端点', $('mIvH').textContent === homeAfter);

  G('移动端: Tab 切换');
  w.eval('mTab("rules")');
  A('规则 tab: body data-tab=rules', w.document.body.getAttribute('data-tab') === 'rules');
  w.eval('mTab("map")');
  A('地图 tab: body data-tab=map + mapWrap 显示', w.document.body.getAttribute('data-tab') === 'map' && $('mapWrap').style.display === 'block');
  w.eval('mTab("plan")');
  A('规划 tab 恢复', w.document.body.getAttribute('data-tab') === 'plan');

  G('引导可填写(spotlight 不拦截)');
  const spotlightRule = [...w.document.styleSheets].some(sh => {
    try { return [...sh.cssRules].some(r => r.selectorText && r.selectorText.includes('#spotlight') && /pointer-events\s*:\s*none/.test(r.style.cssText || '')); } catch (e) { return false; }
  });
  A('CSS: #spotlight pointer-events:none', spotlightRule);
  A('CSS: #spotCard pointer-events:auto', [...w.document.styleSheets].some(sh => {
    try { return [...sh.cssRules].some(r => r.selectorText && r.selectorText.includes('#spotCard') && /pointer-events\s*:\s*auto/.test(r.style.cssText || '')); } catch (e) { return false; }
  }));

  G('移动端: 清空二次确认');
  const tripsBefore = w.eval('state.trips.length');
  w.eval('window.confirm = () => true; mClear()');
  A('确认为真时清空', w.eval('state.trips.length') === 0 && tripsBefore > 0);
  $('mTripInput').value = '郑州';
  await w.eval('mAddTrip()'); await wait(60);
  A('清空后可再添加', w.eval('state.trips.length') === 1);

  console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail ? 1 : 0);
};
flow().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
