/* 中转审计: 遍历 verify-data/real-data.json 全部实测样本
   ① 是否存在"直达(inInt) 又同时出中转(hub)" 的段
   ② 所有中转段 hub 是否在区间带内(bandOK) / 与端点同名 / 同城(显示层会被滤掉)
   ③ 与用户实测期望(real: ok/bad) 逐条比对 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const L = new Function(logicSrc + '\nreturn {STATIONS,stToObj,dist,corridor,planTrip,chainV2,beltV2,bandOK,chanOK};')();
const st = n => { const o = L.stToObj(L.STATIONS.find(s => s[0] === n || s[1] === n)); return o; };
const data = JSON.parse(fs.readFileSync(path.join(root, 'verify-data/real-data.json'), 'utf8'));

let both = 0, hubBad = 0, hubSameCity = 0, hubSameName = 0, mismatch = 0, checked = 0, transferShown = 0;
const hubCitySamples = [];
const mismatchSamples = [];
const transitDetail = [];

for (const e of data) {
  const S = st(e.school), H = st(e.home);
  const O = st(e.origin || e.school), D = st(e.dest);
  if (!S || !H || !D) continue;
  checked++;
  const cc = L.chainV2(S, H, [], O, D, false); // 单目的地: 无中间站
  if (!cc) continue;
  const expectOk = e.real === 'ok';
  let segOkCount = 0, hasHubSeg = false, dual = 0;
  const segs = [];
  for (const sg of cc.segs) {
    if (sg.inInt && sg.hub) { both++; dual++; }
    if (sg.hub) {
      hasHubSeg = true; transferShown++;
      // hub 合理性: 在档内? 同名? 同城?
      const hObj = st(sg.hub);
      if (!hObj) { hubBad++; console.log('  !! hub 不在 STATIONS:', e.school, e.home, e.dest, 'hub=', sg.hub); continue; }
      if (!L.bandOK(S, H, hObj)) { hubBad++; console.log('  !! hub 不在区间带内:', e.school, e.home, e.dest, 'hub=', sg.hub); }
      if (hObj.name === sg.a.name || hObj.name === sg.b.name || hObj.name === S.name || hObj.name === H.name) { hubSameName++; console.log('  !! hub 与端点同名:', e.school, e.home, e.dest, 'hub=', sg.hub); }
      if (hObj.city === sg.a.city || hObj.city === sg.b.city || hObj.city === S.city || hObj.city === H.city) {
        if (hObj.name !== S.name && hObj.name !== H.name) { hubSameCity++; hubCitySamples.push(e.school + '⇄' + e.home + ' ' + e.dest + ' → 经' + sg.hub + '(同城)'); }
      }
    }
    segs.push((sg.inInt ? '直达' : sg.hub ? '中转·经' + sg.hub : '区间外') + ' ' + sg.a.name + '→' + sg.b.name);
  }
  const predOk = cc.okN === cc.segs.length;
  if (expectOk !== predOk && !e.transfer) { mismatch++; mismatchSamples.push(e.school + '⇄' + e.home + ' ' + e.dest + ' 期望' + e.real + ' 判定' + (predOk ? 'ok' : 'bad') + ' (' + segs.join('; ') + ')'); }
  if (hasHubSeg && (e.transfer || !expectOk)) transitDetail.push((e.transfer ? '[中转样本] ' : '') + e.school + '⇄' + e.home + ' 去' + e.dest + ' → ' + segs.join(' | '));
}

console.log('===== 审计结果 (共 ' + checked + ' 条可判样本) =====');
console.log('① 直达(inInt)且同时出中转(hub) 的段数:', both, both ? '!!!检查' : '✓ 无(判定互斥)');
console.log('② hub 不在区间带内:', hubBad, '| hub 与端点同名:', hubSameName);
console.log('③ hub 与端点同城(判定层在用, 显示层被滤):', hubSameCity);
if (hubCitySamples.length) { console.log('   同城中转明细:'); hubCitySamples.forEach(s => console.log('     -', s)); }
console.log('④ 中转可出段总数(样本中出现过中转方案):', transferShown);
console.log('⑤ 与实测期望不符(非中转样本):', mismatch);
if (mismatchSamples.length) mismatchSamples.forEach(s => console.log('     -', s));
console.log('===== 出现过中转方案的样本明细(供核对) =====');
transitDetail.forEach(s => console.log(' -', s));