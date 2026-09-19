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
const makeQueryResult = () => (fakeWx._qnode ? [fakeWx._qnode] : [{ top: 100, left: 20, width: 320, height: 60 }, { scrollTop: 0 }]);

const fakeWx = {
  getStorageSync: () => undefined,
  setStorageSync: () => { },
  pageScrollTo: () => { },
  showModal: o => { o.success && o.success({ confirm: true }); },
  getWindowInfo: () => ({ dpr: 2, windowWidth: 375, windowHeight: 667 }),
  getSetting: o => { o.success && o.success({ authSetting: { 'scope.writePhotosAlbum': true } }); },
  openSetting: o => { o.success && o.success({ authSetting: {} }); },
  saveImageToPhotosAlbum: o => { o.success && o.success({ errMsg: 'saveImageToPhotosAlbum:ok' }); },
  canvasToTempFilePath: o => { o.success && o.success({ tempFilePath: '/tmp/poster.png' }); },
  getImageInfo: o => { o.success && o.success({ path: o.src, width: 600, height: 600 }); },
  _drawn: [],
  _texts: [],
  _drawnSrc: [],
  _qnode: null,
  createSelectorQuery: () => {
    const tasks = [];
    const q = {
      select: () => ({
        boundingClientRect: c => { tasks.push(() => c && c({ top: 100, left: 20, width: 320, height: 60 })); return q; },
        fields: (optOrCb, maybeCb) => {
          const c = (typeof optOrCb === 'function') ? optOrCb : maybeCb;
          const node = {
            width: 0, height: 0,
            createImage: () => {
              const o = {
                width: 600, height: 600, _src: '',
                set src(v) { this._src = v; fakeWx._drawnSrc.push(v); setTimeout(() => { o.onload && o.onload(); }, 5); },
                get src() { return this._src; },
              };
              return o;
            },
            getContext: () => ({
              scale: () => { }, createLinearGradient: () => ({ addColorStop: () => { } }),
              fillRect: () => { }, beginPath: () => { }, moveTo: () => { }, lineTo: () => { },
              quadraticCurveTo: () => { }, closePath: () => { }, fill: () => { }, arc: () => { },
              fillText: (t) => { fakeWx._texts.push(String(t)); }, measureText: s => ({ width: String(s || '').length * 8 }), drawImage: (...a) => { fakeWx._drawn.push(a); },
              stroke: () => { }, strokeStyle: '', lineWidth: 1,
              fillStyle: '', font: '',
            }),
          };
          fakeWx._qnode = { node: node, width: 600, height: 900 };
          tasks.push(() => c && c({ node: node, width: 600, height: 900 }));
          return q;
        },
      }),
      selectAll: () => ({ boundingClientRect: c => { tasks.push(() => c && c([0, 1, 2, 3, 4, 5, 6].map(i => ({ top: i * 68, bottom: (i + 1) * 68, left: 20, width: 320 })))); return q; } }),
      selectViewport: () => ({ scrollOffset: c => { tasks.push(() => c && c({ scrollTop: 0 })); return q; } }),
      exec: cb => { tasks.forEach(t => t()); if (cb) cb(makeQueryResult()); },
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
  check('学校=北京西', logic.state.school && logic.state.school.name === '北京西' && p.data.showStart === true);
  check('区间端点自动选取(非学校同城)', logic.state.home && logic.state.home.city !== '北京', logic.state.home && logic.state.home.name);
  check('自动端点来自候选列表', ['武汉','上海','北京','杭州'].some(c => logic.state.home.city === c), logic.state.home.name);
  p.setData({ departInput: '' }); // 留空 = 从学校出发
  await p.nextStart.call(p); await sync();
  check('出发地默认=学校', logic.state.depart && logic.state.depart.name === '北京西' && p.data.showDest === true);
  check('区间端点独立于出发地', logic.state.home.name !== logic.state.depart.name || logic.state.home.city !== '北京');
  for (const c of ['哈尔滨', '昆明', '长沙', '贵阳', '乌鲁木齐', '北京']) {
    p.setData({ tripInput: c });
    await p.addTrip.call(p); await sync();
  }
  check('添加 6 个目的地', p.data.tripCount === 6);
  check('起点行=出发地(默认学校)', /北京/.test(p.data.startName), p.data.startName);
  check('规划前: 行精简(无圆点/状态/中转候选, 与网页添加列表一致)', p.data.rows.every(r => (r.ring === '' || r.ring === 'none') && r.status === '' && !r.hub && r.hubs.length === 0));

  console.log('== 场景2: 一键规划 ==');
  p.onPlan.call(p); await sync();
  check('规划标记', p.data.planned === true);
  check('最省组票: 前2段合成1张联程票 → 消耗 1 次', p.data.used === 1 && p.data.remain === 3);
  check('判定: 1绿5红(联程6段·按输入顺序)', p.data.okN === 1 && p.data.badN === 5);
  check('框体已着色(无空白)', p.data.rows.some(r => r.boxCls === 'bad' || r.boxCls === 'edge') && p.data.rows.every(r => r.boxCls !== ''));
  check('规划后: 行展开(圆点+状态出现)', p.data.rows.every(r => r.ring !== '' || r.status !== '' || r.hub !== '') && p.data.rows.some(r => r.status !== ''));
  check('弹窗推荐弹出', p.data.modal.show === true && p.data.modal.suggest && p.data.modal.suggest.name === '桂林北');
  console.log('  推荐:', p.data.modal.suggest.name, '| 预览:', p.data.modal.g2 + '绿/' + p.data.modal.e2 + '橙/' + p.data.modal.b2 + '红', '| 顺序:', p.data.rows.map(r => r.text).join('→')); // 注: cap带宽(0.55L≤450km)后推荐由南宁东→崇左南

  console.log('== 场景3: 采用推荐区间(只改端点) ==');
  const departBefore = logic.state.depart.name;
  p.applySuggestion.call(p); await sync();
  check('区间端点变为桂林北(2026-09-19 排序修正: 稳健覆盖优先+区间短优先, 同覆盖平局由南宁改判桂林北; 模型输出无实测依据)', logic.state.home && logic.state.home.name === '桂林北');
  check('出发地保持不变', logic.state.depart.name === departBefore);
  check('弹窗关闭', p.data.modal.show === false);
  check('颜色按新区间: 4绿0橙2红(联程6段·含2中转)', p.data.okN === 4 && p.data.edgeN === 0 && p.data.badN === 2);
  check('区间线右端更新', p.data.ivH === '桂林北');

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

  console.log('\n== 场景8: 分享携带结果 / 落地复现 ==');
  resetState();
  const p8 = inst();
  await p8.onLoad.call(p8); await sync();
  p8.setData({ schoolInput: '北京' }); await p8.nextSchool.call(p8); await sync();
  p8.setData({ departInput: '' }); await p8.nextStart.call(p8); await sync();
  p8.setData({ tripInput: '武汉' }); await p8.addTrip.call(p8); await sync();
  await p8.onPlan.call(p8); await sync();
  const share = p8.onShareAppMessage.call(p8);
  check('分享 path 携带 S/H/T 参数', /S=/.test(share.path) && /H=/.test(share.path) && /T=/.test(share.path), share.path);
  check('分享标题含区间(学校⇄自动端点)', /北京西/.test(share.title) && /武汉/.test(share.title), share.title);
  const q = share.path.split('?')[1];
  const opts = {};
  q.split('&').forEach(kv => { const [k, v] = kv.split('='); opts[k] = v; });
  resetState();
  const p8b = inst();
  await p8b.onLoad.call(p8b, opts); await sync();
  check('落地后学校=北京西', logic.state.school && logic.state.school.name === '北京西');
  check('落地后区间端点已恢复', !!(logic.state.home && logic.state.home.name), logic.state.home && logic.state.home.name);
  check('落地后目的地自动恢复', logic.state.trips.length === 1 && logic.state.trips[0].station.name === '武汉', logic.state.trips.map(t => t.station && t.station.name));
  check('落地后直接出结果', p8b.data.planned === true && p8b.data.tripCount === 1);
  check('落地后城市步骤可见', p8b.data.showStart === true && p8b.data.showDest === true);

  console.log('\n== 场景9: 学校记忆 + 修改确认 ==');
  let mem = null;
  fakeWx.setStorageSync = (k, v) => { mem = { k, v }; };
  fakeWx.getStorageSync = () => (mem && mem.k === 'srp_school' ? mem.v : '');
  resetState();
  const p9 = inst();
  await p9.onLoad.call(p9); await sync();
  p9.setData({ schoolInput: '上海' }); await p9.nextSchool.call(p9); await sync();
  check('设置学校后写入本机记忆(存标准站名)', !!mem && mem.k === 'srp_school' && /^上海/.test(mem.v || ''), mem);
  resetState();
  const p9b = inst();
  await p9b.onLoad.call(p9b); await sync();
  check('下次打开自动填入学校(解析为同城枢纽站)', !!(logic.state.school && /^上海/.test(logic.state.school.name)), logic.state.school && logic.state.school.name);
  check('自动填入后直接进入②步(出发地)', p9b.data.showStart === true && /^上海/.test(p9b.data.ivS));
  let modalArgs = null;
  fakeWx.showModal = o => { modalArgs = o; o.success && o.success({ confirm: true }); };
  p9b.changeSchool.call(p9b);
  check('修改学校有二次确认弹窗', !!modalArgs && /修改学校/.test(modalArgs.title || '') && /学信网/.test(modalArgs.content || ''), modalArgs && modalArgs.title);
  check('确认后清空学校待重填', logic.state.school === null && p9b.data.showStart === false && p9b.data.schoolInput === '');

  console.log('\n== 场景10: 图片分享(海报) ==');
  fakeWx.getStorageSync = () => '';
  resetState();
  const p10 = inst();
  await p10.onLoad.call(p10); await sync();
  p10.setData({ schoolInput: '北京' }); await p10.nextSchool.call(p10); await sync();
  p10.setData({ departInput: '' }); await p10.nextStart.call(p10); await sync();
  p10.setData({ tripInput: '武汉' }); await p10.addTrip.call(p10); await sync();
  await p10.onPlan.call(p10); await sync();
  check('海报初始未打开', p10.data.poster.show === false);
  fakeWx._drawn = []; fakeWx._drawnSrc = []; fakeWx._texts = [];
  p10.openPoster.call(p10); await sync(); await sync();
  check('点“生成图片”打开海报弹窗', p10.data.poster.show === true);
  check('canvas 绘制后导出临时图片', p10.data.poster.path === '/tmp/poster.png', p10.data.poster.path);
  check('海报请求加载小程序码 /images/qrcode.png', fakeWx._drawnSrc.indexOf('/images/qrcode.png') >= 0, fakeWx._drawnSrc);
  check('小程序码已绘制到海报上', fakeWx._drawn.length >= 1, fakeWx._drawn.length);
  check('海报显示总次数(计次 v3)', fakeWx._texts.some(t => /总次数：/.test(t)), fakeWx._texts.filter(t => /总次数/.test(t)));
  check('海报区间大字绘制(学校名+家端点名)', fakeWx._texts.some(t => t === '北京西') && fakeWx._texts.some(t => t === '武汉'), fakeWx._texts.slice(0, 8));
  check('海报高度随内容自适应(1 目的地更短, 5 目的更高)', p10._posterH(1) <= 700 && p10._posterH(5) > p10._posterH(1), p10._posterH(1) + '/' + p10._posterH(5));
  check('码图绘制区域为 106x106 方块(留白边)', fakeWx._drawn.length >= 1 && fakeWx._drawn[0][3] === 106 && fakeWx._drawn[0][4] === 106, fakeWx._drawn[0] && fakeWx._drawn[0].slice(3));
  let saved = false;
  fakeWx.saveImageToPhotosAlbum = o => { saved = true; o.success && o.success({ errMsg: 'ok' }); };
  p10.savePoster.call(p10); await sync();
  check('保存到相册已调用', saved === true);
  check('保存后状态提示成功', /已保存/.test(p10.data.status || ''), p10.data.status);
  p10.closePoster.call(p10);
  check('关闭海报弹窗', p10.data.poster.show === false);

  console.log('\n== 场景10b: 海报显示中转信息 ==');
  resetState();
  const p10b = inst();
  await p10b.onLoad.call(p10b); await sync();
  p10b.setData({ schoolInput: '北京' }); await p10b.nextSchool.call(p10b); await sync();
  p10b.setData({ departInput: '北京' }); await p10b.nextStart.call(p10b); await sync();
  p10b.setData({ tripInput: '沈阳' }); await p10b.addTrip.call(p10b); await sync();
  await p10b.onPlan.call(p10b); await sync();
  check('该场景确实需要中转(前置条件)', !!(p10b.data.rows[0] && p10b.data.rows[0].hub), p10b.data.rows[0] && p10b.data.rows[0].hub);
  fakeWx._drawn = []; fakeWx._drawnSrc = []; fakeWx._texts = [];
  p10b.openPoster.call(p10b); await sync(); await sync();
  const hubTxt = fakeWx._texts.filter(t => /· 经/.test(t));
  check('海报绘制了中转注记(含"· 经"+枢纽名)', hubTxt.length >= 1, hubTxt);
  check('中转行内容与 Core 判定一致', hubTxt.some(t => t.indexOf(p10b.data.rows[0].hub) >= 0), hubTxt + ' vs ' + p10b.data.rows[0].hub);
  p10b.closePoster.call(p10b);

  console.log('\n== 场景11: 资源与样式守卫(防回归) ==');
  const qrPath = path.join(root, 'miniprogram/images/qrcode.png');
  check('小程序码资源存在', fs.existsSync(qrPath));
  if (fs.existsSync(qrPath)) {
    const buf = fs.readFileSync(qrPath);
    const isPng = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    check('码图为合法 PNG', isPng);
    check('码图为正方形(防拉伸变形)', w === h, w + 'x' + h);
    check('码图边长 >= 300px(保证可识别)', w >= 300, w);
  }
  const wxss = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxss'), 'utf8');
  const ipt = (wxss.match(/\.ipt\s*\{[^}]*\}/) || [''])[0];
  const num = (re, s) => { const m = s.match(re); return m ? parseFloat(m[1]) : NaN; };
  const hIpt = num(/height:\s*([\d.]+)rpx/, ipt), lhIpt = num(/line-height:\s*([\d.]+)rpx/, ipt);
  const fsIpt = num(/font-size:\s*([\d.]+)rpx/, ipt);
  check('输入框有确定高度(不被 padding 压塌)', hIpt >= 80, hIpt);
  check('输入框行高 >= 字号(文字不被裁切)', lhIpt >= fsIpt, lhIpt + ' vs ' + fsIpt);
  check('输入框无上下 padding(不与固定高度冲突)', !/padding:\s*[\d.]+rpx\s+[\d.]+rpx/.test(ipt), ipt);
  check('输入框字号 >= 28rpx(打字看得清)', fsIpt >= 28, fsIpt);
  const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8');
  check('三处输入框均用 .ipt(样式统一生效)', (wxml.match(/class="ipt"/g) || []).length === 3, (wxml.match(/class="ipt"/g) || []).length);
  check('海报绘制未残留旧的 _qrImg 缓存写法', !/this\._qrImg/.test(pageSrc));

  console.log('\n== 场景12: 首次进入可完整体验(审核合规) ==');
  const wxmlSrc = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8');
  const jsSrc2 = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8');
  // 首次进入必须有示例入口, 否则审核员看到空白表单会判"无法完整体验"
  check('首屏存在示例入口', /startDemo/.test(wxmlSrc), '需 catchtap="startDemo"');
  // 首次进入显示一行提示(含"看示例"入口), 不整页铺开说明
  check('首屏有首次提示行', /class="first-tip"/.test(wxmlSrc));
  check('提示行含"看示例"入口', /catchtap="startDemo"/.test(wxmlSrc));
  check('提示行仅在未填写时出现', /first-tip" wx:if="\{\{!everFilled && !showStart\}\}"/.test(wxmlSrc));
  // 示例 = 逐步自动演示(动效引导), 复用现有 nextSchool/nextStart/addTrip/onPlan
  const demoFn = jsSrc2.match(/playDemo\(fast\)\s*\{[\s\S]*?\n  \},/);
  check('playDemo 已实现', !!demoFn);
  if (demoFn) {
    check('演示复用 nextSchool', /self\.nextSchool\(\)/.test(demoFn[0]));
    check('演示复用 nextStart', /self\.nextStart\(\)/.test(demoFn[0]));
    check('演示复用 addTrip', /self\.addTrip\(\)/.test(demoFn[0]));
    check('演示带动效状态(pulseStep)', /pulseStep/.test(demoFn[0]));
  }
  const fillFn = jsSrc2.match(/_demoFillAll\(\)\s*\{[\s\S]*?\n  \},/);
  check('_demoFillAll 已实现', !!fillFn);
  if (fillFn) check('补齐路径复用 onPlan', /this\.onPlan\(\)/.test(fillFn[0]));
  check('演示可跳过(skipDemo)', /skipDemo\(\)/.test(jsSrc2));
  // 防回归: catchtap 会传事件对象, 若直接当 fast 会跳步; 必须只认显式 true
  check('playDemo 只认显式 true 作为 fast', /fast = \(fast === true\)/.test(jsSrc2));
  check('存在独立入口 startDemo(传 false)', /startDemo\(\)\s*\{\s*this\.playDemo\(false\)/.test(jsSrc2));
  check('演示条在 WXML 中', /class="demo-bar"/.test(wxmlSrc));
  check('步骤卡片有 pulse 高亮位', /pulseStep===\d\?'pulse'/.test(wxmlSrc));
  // 无登录/无账号体系(3.3.4 不适用) 且无网络请求
  check('小程序无登录逻辑', !/wx\.login|getUserProfile|getUserInfo/.test(jsSrc2));
  check('小程序无网络请求', !/wx\.request|wx\.uploadFile/.test(jsSrc2));
  // 隐私说明必须出现在页脚
  check('页脚声明"不联网/不上传"', /不联网、不上传任何信息/.test(wxmlSrc));
  // loadDemo 功能验证: 调用后应直接产出结果
  resetState();
  const p12 = inst();
  await p12.onLoad.call(p12); await sync();
  check('初始状态 seenDemo=false(首次进入显示示例入口)', p12.data.seenDemo === false);
  // 逐步演示的中间状态: 起始应 pulse 步骤1 且未出结果
  const p12b = inst();
  await p12b.onLoad.call(p12b); await sync();
  p12b.startDemo.call(p12b, { type: 'tap' }); await sync();   // 模拟真实点击(传事件对象)
  check('演示开始: pulse 步骤1 且未规划', p12b.data.pulseStep === 1 && p12b.data.planned === false, p12b.data.pulseStep);
  check('演示开始: 显示演示条', p12b.data.demoPlaying === true);
  p12b.skipDemo.call(p12b); await sync();
  check('跳过演示后补齐并出结果', p12b.data.planned === true && p12b.data.tripCount === 2, p12b.data.tripCount);

  p12.playDemo.call(p12, true); await sync();
  check('示例(fast)后直接出结果(planned=true)', p12.data.planned === true);
  check("示例后有目的地", p12.data.tripCount === 2, p12.data.tripCount);
  const demoCls = p12.data.rows.map(r => r.boxCls);
  check('示例后有判定着色', demoCls.every(c => c !== ''), demoCls);
  // 示例须展示工具的核心价值: 能出的段 + 不能出的段 都被判定出来(真实结果, 不造假)
  check('示例同时含可出段与不可出段', demoCls.includes('edge') && demoCls.includes('bad'), demoCls);
  check('示例展示中转建议(核心能力)', p12.data.rows.some(r => r.hub), p12.data.rows.map(r => r.hub));
  check('示例后 seenDemo=true(示例入口收起)', p12.data.seenDemo === true);
  check('示例后区间为 北京西⇄武汉', /北京/.test(p12.data.ivS) && /武汉/.test(p12.data.ivH), p12.data.ivS + '⇄' + p12.data.ivH);
  // 修改学校后: 首次提示不应重现(用户已填过), 且应聚焦步骤1
  p12.changeSchool.call(p12); await sync();
  check('修改学校后 everFilled 保持 true(首次提示不重现)', p12.data.everFilled === true);
  check('修改学校后聚焦步骤1', p12.data.focusNow === 1, p12.data.focusNow);

  console.log('== 场景9: 郑州/郑州 → 天津/青岛/日照 推荐(2026-09-19 用户实测回归) ==');
  // 用户实测: 线上版推荐"把家改到新乡", 但区间 郑州⇄新乡 买不了 郑州→天津(12306 拦"区间不符")
  // 根因: 极短区间"同城圈600km"退化分支被推荐当覆盖依据 + 排序 p/L 平局偏向长区间(牡丹江)
  // 修复: smartBest 稳健口径(coverR)优先 → 期望推荐 烟台(稳健覆盖3段, 区间最短)
  resetState();
  const p13 = inst();
  await p13.onLoad.call(p13); await sync();
  p13.setData({ schoolInput: '郑州' }); await p13.nextSchool.call(p13); await sync();
  p13.setData({ departInput: '郑州' }); await p13.nextStart.call(p13); await sync();
  for (const c of ['天津', '青岛', '日照']) {
    p13.setData({ tripInput: c });
    await p13.addTrip.call(p13); await sync();
  }
  p13.onPlan.call(p13); await sync();
  const sgg = p13.data.modal.suggest;
  check('弹窗推荐存在', !!sgg, p13.data.modal);
  check('推荐不落在同城圈退化候选(新乡/开封/兰考)', !!sgg && !['新乡东', '新乡', '开封北', '开封', '兰考南', '兰考'].includes(sgg.name), sgg && sgg.name);
  check('推荐不落在长区间摊薄候选(牡丹江)', !!sgg && sgg.city !== '牡丹江', sgg && sgg.name);
  check('推荐为稳健覆盖端点 烟台(模型锁定, 非实测; 实测依据=走廊带0.44L边界样本)', !!sgg && sgg.city === '烟台', sgg && sgg.name);
  check('推荐不标低把握(稳健覆盖=展示覆盖)', !!sgg && !sgg.lowConf, sgg && sgg.lowConf);
  check('预览: 3 个能买直达', p13.data.modal.g2 === 3 && p13.data.modal.b2 === 0, p13.data.modal.g2 + '/' + p13.data.modal.b2);

  console.log('== 场景12: 计次 v3(涉及往返一律 2 次) ==');
  // 旧口径: 回程段不计次 + 整条 ×2 —— 去程含折返时往返被算成 4 次
  // v3: 回程段参与切分计次(去1+回1=2), 闭环趟(三角形/环形, 终点≈本趟起点≤40km)计 2
  const mk = async (school, home, depart, trips, round) => {
    resetState();
    const q = inst();
    await q.onLoad.call(q); await sync();
    q.setData({ schoolInput: school }); await q.nextSchool.call(q); await sync();
    if (home) logic.state.home = logic.stToObj(logic.STATIONS.find(s => s[0] === home)) || logic.state.home; // 小程序无直接输入家的入口, 测试直接设区间端点
    q.setData({ departInput: depart }); await q.nextStart.call(q); await sync();
    for (const c of trips) { q.setData({ tripInput: c }); await q.addTrip.call(q); await sync(); }
    if (round) logic.state.trips.forEach(t => { t.round = true; });
    q.onPlan.call(q); await sync();
    return q;
  };
  const r1 = await mk('郑州', '商丘', '郑州', ['商丘'], true);
  check('① 简单往返(勾选往返) = 2 次', r1.data.used === 2, r1.data.used);
  const r2 = await mk('郑州', '商丘', '郑州', ['开封北', '商丘'], true);
  check('② 去程含折返的往返 = 2 次(旧口径 bug: 4 次)', r2.data.used === 2, r2.data.used);
  const r3 = await mk('厦门北', '石家庄', '石家庄', ['郑州东'], true);
  check('③ 区间内往返 = 2 次', r3.data.used === 2, r3.data.used);
  const r4 = await mk('郑州', '济南', '郑州', ['天津', '青岛', '济南'], true);
  check('④ 三角形线路(含回程) = 2 次', r4.data.used === 2, r4.data.used);
  const r5 = await mk('北京', '武汉', '北京', ['石家庄', '长沙'], false);
  check('⑤ 多目的地单程 = 1 次(不变)', r5.data.used === 1, r5.data.used);
  const r6 = await mk('郑州', '商丘', '郑州', ['开封北', '商丘'], false);
  check('⑥ 单程不勾往返 = 1 次(不变)', r6.data.used === 1, r6.data.used);

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
};
flow().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
