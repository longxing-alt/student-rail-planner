/* 小程序页面功能测试（简化版·按原型重构后）
 * jsdom + wx 模拟 驱动 D:\mini 真实页面代码(index.js + logic.js)
 * 覆盖: 演示数据/步骤流程/目的地增删/拖拽/一键规划/弹窗推荐/采用改区间端点/框体着色
 * 用法: node tests/mp-flow.test.mjs */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';

const root = path.resolve(import.meta.dirname, '..');
const logicSrc = fs.readFileSync(path.join(root, 'miniprogram/utils/logic.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8');

function loadLogic() {
  const m = { exports: {} };
  new Function('module', logicSrc)(m);
  return m.exports;
}
const logic = loadLogic();

/* ---- wx 模拟 ---- */
const storage = {};
const fakeWx = {
  getStorageSync: () => undefined,
  setStorageSync: () => { },
  pageScrollTo: () => { },
  showModal: o => { o.success && o.success({ confirm: true }); },
  createSelectorQuery: () => {
    const tasks = [];
    const q = {
      select: () => ({ boundingClientRect: c => { tasks.push(() => c && c({ top: 100, left: 20, width: 320, height: 60 })); return q; } }),
      selectAll: () => ({ boundingClientRect: c => { tasks.push(() => c && c([0, 1, 2, 3, 4, 5, 6].map(i => ({ top: i * 68, bottom: (i + 1) * 68, left: 20, width: 320 })))); return q; } }),
      selectViewport: () => ({ scrollOffset: c => { tasks.push(() => c && c({ scrollTop: 0 })); return q; } }),
      exec: cb => { tasks.forEach(t => t()); if (cb) cb([{ top: 100, left: 20, width: 320, height: 60 }, { scrollTop: 0 }]); },
    };
    return q;
  },
};

/* ---- 加载页面 ---- */
let pageDef = null;
const fakePage = def => { pageDef = def; };
new Function('Page', 'wx', 'require', pageSrc)(fakePage, fakeWx, () => logic);
assert(pageDef, 'Page() 未定义');

function inst() {
  const o = { ...pageDef };
  o.data = JSON.parse(JSON.stringify(pageDef.data));
  o.setData = function (patch) {
    for (const k of Object.keys(patch)) {
      const parts = k.split('.');
      let cur = this.data;
      for (let i = 0; i < parts.length - 1; i++) { if (cur[parts[i]] == null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
      cur[parts[parts.length - 1]] = patch[k];
    }
  };
  o.createSelectorQuery = () => fakeWx.createSelectorQuery();
  return o;
}
const sync = () => new Promise(r => setTimeout(r, 30));

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, extra != null ? JSON.stringify(extra).slice(0, 200) : ''); }
}
function resetState() {
  logic.state.school = null; logic.state.depart = null; logic.state.home = null;
  logic.state.trips = []; logic.state.chainEnd = null; logic.state.routeStart = null;
}

const flow = async () => {
  console.log('== 场景1: 空白启动 + 手动填写流程 ==');
  resetState();
  const p = inst();
  await p.onLoad.call(p); await sync();
  check('空白启动(无默认数据)', p.data.schoolInput === '' && p.data.departInput === '' && p.data.tripCount === 0);
  check('初始不显示目的地', p.data.showDest === false && p.data.rows.length === 0);
  p.setData({ schoolInput: '北京' });
  await p.nextSchool.call(p); await sync();
  check('学校=北京西', logic.state.school && logic.state.school.name === '北京西' && p.data.showDepart === true);
  p.setData({ departInput: '石家庄' });
  await p.nextDepart.call(p); await sync();
  check('出发地=石家庄', logic.state.depart && logic.state.depart.name === '石家庄' && p.data.showDest === true);
  check('区间端点=出发地', logic.state.home && logic.state.home.name === '石家庄');
  for (const c of ['哈尔滨', '昆明', '长沙', '贵阳', '乌鲁木齐', '北京']) {
    p.setData({ tripInput: c });
    await p.addTrip.call(p); await sync();
  }
  check('添加 6 个目的地', p.data.tripCount === 6);
  check('起点行=石家庄', p.data.startName === '石家庄');
  check('规划前: 行精简(无圆点/状态/中转候选, 与网页添加列表一致)', p.data.rows.every(r => (r.ring === '' || r.ring === 'none') && r.status === '' && !r.hub && r.hubs.length === 0));

  console.log('== 场景2: 一键规划 ==');
  p.onPlan.call(p); await sync();
  check('规划标记', p.data.planned === true);
  check('最省组票: 前2段合成1张联程票 → 消耗 1 次', p.data.used === 1 && p.data.remain === 3);
  check('判定: 2绿4红(联程6段·去程,含1中转)', p.data.okN === 2 && p.data.badN === 4);
  check('框体已着色', p.data.rows.some(r => r.boxCls === 'bad') && p.data.rows.some(r => r.boxCls === 'ok'));
  check('规划后: 行展开(圆点+状态出现)', p.data.rows.every(r => r.ring !== '' || r.status !== '' || r.hub !== '') && p.data.rows.some(r => r.status !== ''));
  check('弹窗推荐弹出', p.data.modal.show === true && p.data.modal.suggest && p.data.modal.suggest.name === '南宁');
  console.log('  推荐:', p.data.modal.suggest.name, '| 预览:', p.data.modal.g2 + '绿/' + p.data.modal.e2 + '橙/' + p.data.modal.b2 + '红', '| 顺序:', p.data.rows.map(r => r.text).join('→')); // 注: cap带宽(0.55L≤450km)后推荐由南宁东→崇左南

  console.log('== 场景3: 采用推荐区间(只改端点) ==');
  const departBefore = logic.state.depart.name;
  p.applySuggestion.call(p); await sync();
  check('区间端点变为南宁', logic.state.home && logic.state.home.name === '南宁');
  check('出发地保持不变', logic.state.depart.name === departBefore);
  check('弹窗关闭', p.data.modal.show === false);
  check('颜色按新区间: 4绿0橙2红(联程6段·含2中转)', p.data.okN === 4 && p.data.edgeN === 0 && p.data.badN === 2);
  check('区间线右端更新', p.data.ivH === '南宁');

  console.log('== 场景4: 规划后可添加(卡片回灰) + 清空 ==');
  p.setData({ tripInput: '苏州' });
  await p.addTrip.call(p); await sync();
  check('规划后仍可添加', p.data.tripCount === 7);
  check('添加后卡片回灰(需重新规划)', p.data.planned === false && p.data.rows.every(r => r.boxCls === ''));
  p.onPlan.call(p); await sync();
  check('再次规划成功', p.data.planned === true && p.data.rows.some(r => r.boxCls !== ''));
  const remId = p.data.rows[0].id;
  p.removeTrip.call(p, { currentTarget: { dataset: { id: remId } } });
  await sync();
  check('删除后 planned 复位', p.data.planned === false && p.data.tripCount === 6);
  p.clearAll.call(p); await sync();
  check('一键清空', p.data.tripCount === 0 && p.data.planned === false);
  p.setData({ tripInput: '苏州' });
  await p.addTrip.call(p); await sync();
  check('清空后可再添加', p.data.tripCount === 1 && p.data.rows.some(r => r.text === '苏州'));

  console.log('== 场景5: 触屏拖拽 ==');
  p.setData({ tripInput: '杭州' });
  await p.addTrip.call(p); await sync();
  const before = p.data.rows.map(r => r.text);
  p.tdStart.call(p, { currentTarget: { dataset: { i: 0 } }, touches: [{ clientY: 68 + 30 }] });
  p.tdMove.call(p, { touches: [{ clientY: 68 * 2 + 30 }] });
  await sync();
  p.tdEnd.call(p); await sync();
  const after = p.data.rows.map(r => r.text);
  check('拖拽排序: ' + before.join(',') + ' → ' + after.join(','), after[1] === before[0] && after[0] === before[1]);
  check('拖拽后 planned 复位', p.data.planned === false);

  console.log('== 场景5b: 拖到起点行 → 设为新出发地 ==');
  const departBefore2 = logic.state.depart.name;
  const dragText = p.data.rows[1].text;
  const dragStation = JSON.parse(JSON.stringify(logic.state.trips[1].station));
  p.tdStart.call(p, { currentTarget: { dataset: { i: 1 } }, touches: [{ clientY: 68 * 1 + 30 }] });
  p.tdMove.call(p, { touches: [{ clientY: 68 * 0 + 30 }] }); // 拖到第0行(起点行)
  await sync();
  p.tdEnd.call(p); await sync();
  check('出发地已改为拖入项', logic.state.depart && logic.state.depart.name === dragStation.name && p.data.startName === dragStation.name);
  check('拖入后 planned 复位', p.data.planned === false);
  console.log('  出发地:', departBefore2, '→', logic.state.depart.name, '| 被拖入:', dragText);

  console.log('== 场景7: 调试编号层 ==');
  p.toggleDbg.call(p);
  check('编号模式开启', p.data.dbg.on === true);
  check('编号徽章已测量', p.data.dbg.badges.length >= 1);
  p.toggleDbg.call(p);
  check('编号模式关闭', p.data.dbg.on === false);

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
};
flow().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
