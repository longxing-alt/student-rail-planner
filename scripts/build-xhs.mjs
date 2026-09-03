/* eslint-disable */
// 小红书小工具构建: 将 xhs/student-rail-planner.html 转为合规产物 xhs/dist/{index.html,app.js} 并打包 zip
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'xhs', 'student-rail-planner.html'), 'utf8');
const outDir = path.join(root, 'xhs', 'dist');
fs.mkdirSync(outDir, { recursive: true });

// 1) 提取 <style> 与 <script>
const style = (src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const script = (src.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';
if (!style || !script) throw new Error('style/script 提取失败');

// 2) 脚本内动态行内事件 → data-* (源码为紧凑写法 '+t.id+' 无空格, 须用精确子串替换)
let js = script;
const DY = [
  ['onclick="rm(\'+t.id+\')"', 'data-rm="\'+t.id+\'"'],
  ['onclick="setHub(\'+i+\',\'+j+\')"', 'data-hub="\'+i+\',\'+j+\'"'],
  ['onclick="openTfm(\'+i+\')"', 'data-tfm="\'+i+\'"'],
  ['onclick="adopt(\\\'\'+sup.st.name+\'\\\')"', 'data-adopt="\'+sup.st.name+\'"'],
  ['onclick="adopt(\\\'\'+r.s[0]+\'\\\')"', 'data-adopt="\'+r.s[0]+\'"'],
  ['onclick="tfmPick(\'+j+\')"', 'data-tfmpick="\'+j+\'"'],
  ['onclick="resetRatio()"', 'data-reset=""'],
  ['ondragstart="tStart(event,\'+t.id+\')" ondragover="tOver(event,\'+t.id+\')" ondrop="tDrop(event,\'+t.id+\')"', 'data-drag="\'+t.id+\'"'],
  ['oninput="setRatio(this.value)"', ''],
];
for (const [f, t] of DY) js = js.split(f).join(t);
if (/\son[a-z]+="/.test(js)) {
  const left = js.match(/\son[a-z]+="[^"]*"/g) || [];
  throw new Error('app.js 仍有行内事件: ' + left.join(', '));
}

// 3) 末尾注入事件绑定与委托(经典脚本, ES2017)
js += `
/* ===== 小红书容器绑定(替换行内事件) ===== */
(function () {
  function on(id, ev, fn) { var el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
  on('schoolInput', 'keydown', function (e) { if (e.key === 'Enter') nextSchool(); });
  on('homeInput', 'keydown', function (e) { if (e.key === 'Enter') nextHome(); });
  on('tripInput', 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addTrip(); } });
  on('btnSchool', 'click', nextSchool);
  on('btnHome', 'click', nextHome);
  on('btnAdd', 'click', addTrip);
  on('btnPlan', 'click', onPlan);
  on('btnClear', 'click', clearAll);
  on('btnReset', 'click', resetRatio);
  on('tfmNext', 'click', tfmNext);
  on('tfmPrev', 'click', tfmPrev);
  on('tfmClose', 'click', closeTfm);
  on('tfmMask', 'click', function (e) { if (e.target === this) closeTfm(); });
  on('roundAll', 'change', function (e) { setRound(e.target.checked); });
  /* 范围滑杆: 页面内任意 id=ratioRange 元素(静态+弹窗模板)统一走 input 委托 */
  document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'ratioRange') setRatio(parseFloat(ev.target.value)); });
  /* 动态元素点击委托 */
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-rm],[data-adopt],[data-tfm],[data-hub],[data-tfmpick],[data-reset]') : null;
    if (!t) return;
    if (t.hasAttribute('data-rm')) rm(parseInt(t.getAttribute('data-rm'), 10));
    else if (t.hasAttribute('data-adopt')) adopt(t.getAttribute('data-adopt'));
    else if (t.hasAttribute('data-tfm')) openTfm(parseInt(t.getAttribute('data-tfm'), 10));
    else if (t.hasAttribute('data-hub')) { var p = t.getAttribute('data-hub').split(','); setHub(parseInt(p[0], 10), parseInt(p[1], 10)); }
    else if (t.hasAttribute('data-tfmpick')) tfmPick(parseInt(t.getAttribute('data-tfmpick'), 10));
    else if (t.hasAttribute('data-reset')) resetRatio();
  });
  /* 行程拖动委托(原为行内 ondragstart/ondragover/ondrop) */
  document.addEventListener('dragstart', function (ev) { var t = ev.target && ev.target.closest ? ev.target.closest('[data-drag]') : null; if (t) tStart(ev, parseInt(t.getAttribute('data-drag'), 10)); });
  document.addEventListener('dragover', function (ev) { var t = ev.target && ev.target.closest ? ev.target.closest('[data-drag]') : null; if (t) tOver(ev, parseInt(t.getAttribute('data-drag'), 10)); });
  document.addEventListener('drop', function (ev) { var t = ev.target && ev.target.closest ? ev.target.closest('[data-drag]') : null; if (t) tDrop(ev, parseInt(t.getAttribute('data-drag'), 10)); });
})();
`;

// 4) 组装 index.html: 去行内事件/加 id/外部脚本
let html = src
  .replace(/<script>[\s\S]*?<\/script>/, '')
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />')
  .replace(/onclick="nextSchool\(\)"/g, 'id="btnSchool"')
  .replace(/onclick="nextHome\(\)"/g, 'id="btnHome"')
  .replace(/onclick="addTrip\(\)"/g, 'id="btnAdd"')
  .replace(/onclick="onPlan\(\)"/g, 'id="btnPlan"')
  .replace(/onclick="clearAll\(\)"/g, 'id="btnClear"')
  .replace(/onclick="resetRatio\(\)"/g, 'id="btnReset"')
  .replace(/onclick="closeTfm\(\)"/g, 'id="tfmClose"')
  .replace(/oninput="setRatio\(this\.value\)"/g, 'id="ratioRange"')
  .replace(/onchange="setRound\(this\.checked\)"/g, 'id="roundAll"')
  .replace(/onkeydown="[^"]*"/g, '')
  .replace(/<div class="tfm" id="tfm"/, '<div class="tfm" id="tfmMask"')
  .replace(/<input type="range"[^>]*?>/g, '<input type="range" id="ratioRange" min="1" max="6" step="0.1">')
  .replace(/<link[^>]*>/g, '')
  .replace(/\son[a-z]+="[^"]*"/g, '') // 清除全部残留行内事件(绑定已由 app.js 完成)
  .replace(/<\/body>/, '<script src="app.js"></script>\n</body>');

// 5) 写文件
fs.writeFileSync(path.join(outDir, 'index.html'), html);
fs.writeFileSync(path.join(outDir, 'app.js'), js);
console.log('产物: xhs/dist/index.html (%d KB) + app.js (%d KB)', (html.length / 1024).toFixed(1), (js.length / 1024).toFixed(1));