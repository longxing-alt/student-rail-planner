/* planner.html jsdom 冒烟: 三步输入 → 一键规划 → 检查结果与JS错误 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../planner.html', 'utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://local.test/' });
const w = dom.window;
w.addEventListener('error', e => errors.push((e.error && e.error.stack) || e.message || String(e.error)));
setTimeout(() => {
  const d = w.document;
  const $ = id => d.getElementById(id);
  try {
    $('schoolInput').value = '武汉';
    d.querySelector('#stepSchool .btn').onclick();
    $('homeInput').value = '石家庄';
    d.querySelector('#stepHome .btn').onclick();
    $('tripInput').value = '拉萨';
    d.querySelector('#stepTrips .ghost').onclick();
    d.querySelector('#stepTrips .btn').onclick();
  } catch (e) { errors.push('交互异常: ' + e.stack); }
  setTimeout(() => {
    const res = $('result').innerHTML;
    console.log('结果区:', res ? res.slice(0, 220).replace(/\s+/g, ' ') : '(空!)');
    console.log('JS错误:', errors.length ? errors.slice(0, 3) : '无');
    process.exit(errors.length && res === '' ? 1 : 0);
  }, 200);
}, 200);