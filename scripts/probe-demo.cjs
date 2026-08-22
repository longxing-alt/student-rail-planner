/* 探针: 驱动小程序页面(演示数据)打印弹窗实际值; 并跑 6 个实测样本(planTrip) */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const logicSrc = fs.readFileSync(path.join(root, 'miniprogram/utils/logic.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8');
const m = { exports: {} };
new Function('module', logicSrc)(m);
const logic = m.exports;

const storage = {};
const fakeWx = {
  getStorageSync: () => undefined, setStorageSync: () => { },
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
let pageDef = null;
new Function('Page', 'wx', 'require', pageSrc)(d => { pageDef = d; }, fakeWx, () => logic);

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
const st = n => logic.stToObj(logic.STATIONS.find(s => s[0] === n || s[1] === n));

(async () => {
  // ---- 演示数据(复制 mp-flow 场景1+2) ----
  logic.state.school = null; logic.state.depart = null; logic.state.home = null;
  logic.state.trips = []; logic.state.chainEnd = null; logic.state.routeStart = null;
  const p = inst();
  await p.onLoad.call(p); await sync();
  p.setData({ schoolInput: '北京' });
  await p.nextSchool.call(p); await sync();
  p.setData({ departInput: '石家庄' });
  await p.nextDepart.call(p); await sync();
  for (const c of ['哈尔滨', '昆明', '长沙', '贵阳', '乌鲁木齐', '北京']) {
    p.setData({ tripInput: c });
    await p.addTrip.call(p); await sync();
  }
  p.onPlan.call(p); await sync();
  const md = p.data.modal;
  console.log('DEMO 建议:', md.suggest ? md.suggest.name + '·' + md.suggest.city : '(null)');
  console.log('DEMO 预览:', md.g2 + '绿/' + md.e2 + '橙/' + md.b2 + '红', '| 当前判定:', p.data.okN + '绿/' + p.data.edgeN + '橙/' + p.data.badN + '红');
  console.log('DEMO dests:', md.dests.map(d => d.text + '=' + d.c).join(' '));
  p.applySuggestion.call(p); await sync();
  console.log('采用后区间:', logic.state.home.name, '| ivH:', p.data.ivH, '| 判定:', p.data.okN + '绿/' + p.data.edgeN + '橙/' + p.data.badN + '红');

  // ---- 6 个实测样本(planTrip 两端口径) ----
  const S = n => st(n), H = n => st(n), O = n => st(n), D = n => st(n);
  const cases = [
    ['A 湛江西 柳州→深圳 可出', S('武汉'), H('湛江西'), O('柳州'), D('深圳'), 1],
    ['B 三亚 柳州→深圳 可出', S('武汉'), H('三亚'), O('柳州'), D('深圳'), 1],
    ['C 柳州→广州(武汉↔柳州) 可出', S('武汉'), H('柳州'), O('柳州'), D('广州'), 1],
    ['D 武汉↔长沙→广州 拦截', S('武汉'), H('长沙'), O('武汉'), D('广州'), 0],
    ['E 武汉↔广州→深圳 拦截', S('武汉'), H('广州'), O('武汉'), D('深圳'), 0],
    ['F 天津 南宁东↔济南西 拦截', S('南宁东'), H('济南西'), O('济南'), D('天津'), 0],
  ];
  for (const [name, s, h, o, d, want] of cases) {
    const r = logic.planTrip(s, h, o, d);
    const okStr = r.ok === 1 ? '可出' : '拦截';
    console.log('样本 ' + name + ' → ' + okStr + ' (' + r.mode + (r.station ? ' 经' + r.station.name : '') + ') 期望:' + (want ? '可出' : '拦截') + (r.ok === want ? ' ✓' : ' ✗✗✗'));
  }
  process.exit(0);
})().catch(e => { console.error('崩溃:', e); process.exit(1); });