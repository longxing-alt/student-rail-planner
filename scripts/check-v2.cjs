/* v2 规则 58 条实测回测 (本地) */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const L = new Function(logicSrc + '\nreturn {STATIONS,stToObj,dist,corridor,planTrip,chainV2,beltV2,bandOK,chanOK,isBlack,raildistver:1};')();
const st = n => L.stToObj(L.STATIONS.find(s => s[0] === n || s[1] === n));
const data = JSON.parse(fs.readFileSync(path.join(root, 'verify-data/real-data.json'), 'utf8'));

let okN = 0, failN = 0, skipN = 0;
for (const e of data) {
  const sc = e.school, hc = e.home, oc = e.origin || sc, dc = e.dest;
  if (!dc || dc.includes('/') || dc.includes('·') || !e.real) { skipN++; continue; } // 无标注/含多目的地的样本跳过
  const S = st(sc), H = st(hc), O = st(oc), D = st(dc);
  if (!S || !H || !O || !D) { skipN++; console.log('  跳过(缺站):', sc, hc, oc, dc); continue; }
  // 中转样本用 chainV2(含中转路径), 普通样本用 planTrip(直线判定)
  let okFlag;
  if (e.transfer) {
    const cc = L.chainV2(S, H, [], O, D, false);
    const sg = cc && cc.segs && cc.segs[0];
    okFlag = !!(sg && (sg.inInt || sg.hub));   // 直达或可中转 都算可出
  } else {
    okFlag = L.planTrip(S, H, O, D).ok === 1;
  }
  const r = { ok: okFlag ? 1 : 0 };
  const expect = e.real === 'ok' ? 1 : 0;
  const ok = r.ok === expect;
  if (ok) okN++; else {
    failN++;
    console.log(`  ✗ ${sc}/${hc || ''} ${oc}→${dc} 期望${expect ? '可出' : '拦'} 实际${r.ok ? '可出' : '拦'} (${r.mode})`);
  }
}
console.log(`\n回测: ${okN} 吻合 / ${failN} 不符 / ${skipN} 跳过 (共 ${data.length} 条)`);
process.exit(failN ? 1 : 0);