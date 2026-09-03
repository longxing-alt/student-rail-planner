const { JSDOM } = require('jsdom');
const fs = require('fs');
const dom = new JSDOM(fs.readFileSync('xhs/dist/index.html', 'utf8'), { runScripts: 'outside-only', url: 'https://xhs.local/' });
const w = dom.window, d = w.document;
w.eval(fs.readFileSync('xhs/dist/app.js', 'utf8'));
function run(sc, hm, dst) {
  w.clearAll();
  w.schoolInput.value = sc; w.nextSchool();
  w.homeInput.value = hm; w.nextHome();
  w.tripInput.value = dst; w.addTrip(); w.onPlan();
  return d.getElementById('result').textContent;
}
let t = run('广州', '佛山', '乌鲁木齐');
console.log('[极短区间中转 广州⇄佛山→乌鲁木齐]');
console.log('  sum行含未实测:', /未实测/.test(t), '| 链路中转chip有警示:', /长沙南[\s\S]{0,80}未实测|未实测[\s\S]{0,40}长沙南/.test(t), '| 无绿色误标:', !/✓ 可出·中转/.test(t));
t = run('北京', '武汉', '石家庄');
console.log('[北京⇄武汉→石家庄] 全程可出:', /联程全程可出/.test(t), '| 无中转方案:', !/可中转哪里出票|中转 1 段/.test(t));
t = run('北京', '石家庄', '武汉');
console.log('[北京⇄石家庄→武汉] 全程可出:', /联程全程可出/.test(t), '| 链路含天津:', /天津/.test(t), '| 无误标未实测:', !/未实测/.test(t));