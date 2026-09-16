/* 回归测试: 小程序"一键规划后不可编辑/叉点不掉"修复
 * 覆盖:  删除  (dataset 字符串 vs 数字 id)  修改出发地入口  弹窗关闭热区/关闭逻辑
 *       规划后仍可添加目的地  修改出发地后重新规划生效
 * 用法: node tests/mp-edit.test.mjs */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const logicSrc = fs.readFileSync(path.join(root, 'miniprogram/utils/logic.js'), 'utf8');
const pageSrc = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.js'), 'utf8');
const wxmlSrc = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxml'), 'utf8');

const m = { exports: {} };
new Function('module', logicSrc)(m);
const logic = m.exports;

const fakeWx = {
  getStorageSync: () => undefined, setStorageSync: () => { }, pageScrollTo: () => { },
  showModal: o => { o.success && o.success({ confirm: true }); },
  getWindowInfo: () => ({ dpr: 2 }), getSetting: o => { o.success && o.success({ authSetting: {} }); },
  createSelectorQuery: () => {
    const q = {
      select: () => ({ boundingClientRect: c => { c && c({ top: 1, left: 1, width: 1, height: 1 }); return q; }, fields: (a, b) => { const c = typeof a === 'function' ? a : b; c && c({ node: null }); return q; } }),
      selectAll: () => ({ boundingClientRect: c => { c && c([]); return q; } }), exec: cb => { cb && cb([]); },
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
      const ps = k.split('.'); let c = this.data;
      for (let i = 0; i < ps.length - 1; i++) { if (c[ps[i]] == null) c[ps[i]] = {}; c = c[ps[i]]; }
      c[ps[ps.length - 1]] = patch[k];
    }
  };
  return o;
}
const sync = () => new Promise(r => setTimeout(r, 20));
let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { passed++; console.log('  ', n); } else { failed++; console.error('  ', n, e != null ? JSON.stringify(e).slice(0, 200) : ''); } };
function reset() { logic.state.school = null; logic.state.depart = null; logic.state.home = null; logic.state.trips = []; }

const flow = async () => {
  console.log('== 准备: 厦门  石家庄 + 泉州/福州/南昌/武汉 ==');
  reset();
  const p = inst();
  await p.onLoad.call(p); await sync();
  p.setData({ schoolInput: '厦门' }); await p.nextSchool.call(p); await sync();
  const sjz = logic.stToObj(logic.stationOf('石家庄'));
  logic.state.home = sjz;                       // 手动钉区间端点为石家庄
  p.setData({ departInput: '厦门' }); await p.nextStart.call(p); await sync();
  for (const c of ['泉州', '福州', '南昌', '武汉']) { p.setData({ tripInput: c }); await p.addTrip.call(p); await sync(); }
  check('添加 4 个目的地', p.data.tripCount === 4, p.data.tripCount);
  p.onPlan.call(p); await sync();
  check('一键规划后 planned=true', p.data.planned === true);
  check('4 段均可出(含泉州)', p.data.okN === 4 && p.data.badN === 0, { ok: p.data.okN, bad: p.data.badN });
  check('泉州段不再误判', p.data.rows.some(r => r.text === '泉州' && r.boxCls === 'ok'), p.data.rows.map(r => r.text + ':' + r.boxCls));

  console.log('\n==  删除  (WXML dataset 回传字符串) ==');
  const before = p.data.tripCount;
  const idNum = p.data.rows[0].id;
  check('row id 为数字', typeof idNum === 'number', typeof idNum);
  // 真实小程序: data-id="{{item.id}}" 会被序列化为字符串
  p.removeTrip.call(p, { currentTarget: { dataset: { id: String(idNum) } } });
  await sync();
  check('点  后目的地减少 1', p.data.tripCount === before - 1, p.data.tripCount);
  check('删除后 planned 复位(需重新规划)', p.data.planned === false);
  // 异常 dataset 不应崩溃、也不应误删
  const n2 = p.data.tripCount;
  p.removeTrip.call(p, { currentTarget: { dataset: { id: 'abc' } } });
  p.removeTrip.call(p, {});
  await sync();
  check('异常 dataset 不崩溃/不误删', p.data.tripCount === n2, p.data.tripCount);

  console.log('\n==  修改出发地入口 ==');
  check('WXML 有"修改出发地"入口', /catchtap="changeDepart"/.test(wxmlSrc));
  check('index.js 实现 changeDepart', /changeDepart\(\)\s*\{/.test(pageSrc));
  p.onPlan.call(p); await sync();
  check('前置: 规划后 showDepart=true(只读行)', p.data.showDepart === true);
  p.changeDepart.call(p); await sync();
  check('点"修改出发地"后回到可编辑态', p.data.showDepart === false, p.data.showDepart);
  check('回填当前出发地便于修改', /^厦门/.test(p.data.departInput), p.data.departInput);
  check('修改出发地会复位 planned', p.data.planned === false);
  // 改成泉州  应生效
  p.setData({ departInput: '泉州' }); await p.nextStart.call(p); await sync();
  check('出发地已改为泉州', !!(logic.state.depart && /^泉州/.test(logic.state.depart.name)), logic.state.depart && logic.state.depart.name);
  check('改完出发地 showDepart 恢复只读行', p.data.showDepart === true);

  console.log('\n==  规划后仍可添加目的地 ==');
  const n3 = p.data.tripCount;
  p.setData({ tripInput: '南昌' }); await p.addTrip.call(p); await sync();
  check('规划后添加成功', p.data.tripCount === n3 + 1, p.data.tripCount);
  check('添加后 planned 复位', p.data.planned === false);
  check('输入框已清空(便于连续添加)', p.data.tripInput === '', p.data.tripInput);

  console.log('\n== b 输入目的地时弹窗自动收起(防遮挡) ==');
  p.onPlan.call(p); await sync();
  check('前置: 建议弹窗打开', p.data.modal.show === true);
  p.onTripInput.call(p, { detail: { value: '长沙' } }); await sync();
  check('输入目的地后弹窗自动收起', p.data.modal.show === false, p.data.modal.show);
  check('输入值未被吞掉', p.data.tripInput === '长沙', p.data.tripInput);
  p.setData({ tripInput: '' });

  console.log('\n==  弹窗关闭 ==');
  p.onPlan.call(p); await sync();
  check('规划后弹窗打开', p.data.modal.show === true);
  p.closeModal.call(p); await sync();
  check('closeModal 可关闭', p.data.modal.show === false);
  const dlgClose = (wxmlSrc.match(/<view class="dialog-close"/g) || []).length;
  check('4 个弹窗  均改为 view(可设大热区)', dlgClose === 4, dlgClose);
  const wxss = fs.readFileSync(path.join(root, 'miniprogram/pages/index/index.wxss'), 'utf8');
  const closeCss = (wxss.match(/\.dialog-close\s*\{[^}]*\}/) || [''])[0];
  check(' 点击热区 >= 64rpx(实测好点)', /min-width:\s*(6[4-9]|[7-9]\d|\d{3,})rpx/.test(closeCss) && /height:\s*(6[4-9]|[7-9]\d|\d{3,})rpx/.test(closeCss), closeCss.replace(/\s+/g, ' '));

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
};
flow().catch(e => { console.error('测试崩溃:', e); process.exit(1); });
