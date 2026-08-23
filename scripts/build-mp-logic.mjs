/* 从 index.html 的 PURE LOGIC 段抽取生成 miniprogram/utils/logic.js（保证与网页版逐字一致） */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = html.indexOf('// ==== PURE LOGIC START ====');
const end = html.indexOf('// ==== PURE LOGIC END ====');
if (start < 0 || end < 0) { console.error('未找到 PURE LOGIC 标记'); process.exit(1); }
const body = html.slice(start, end + '// ==== PURE LOGIC END ===='.length);
if (body.includes('document.') || body.includes('window.') || body.includes('fetch(')) {
  console.error('PURE LOGIC 段包含 DOM/网络依赖，请检查'); process.exit(1);
}
const out = body + `

/* ---- 小程序版导出（供 pages 与测试使用） ---- */
module.exports = {
  STATIONS, HUBS, state,
  hav, dist, corridor, inIntervalBelt, directCovered,
  bandOK, chanOK, beltV2, railAdj, nearOK,
  planTrip, transferPlan, planOneWay, evalWith, evalAll,
  chainEval, chainEndPoint, chainMidStations, chainEvalCurrent, planGroups, foldBackBadStation,
  cleanCity, stationOf, nearestStation, stToObj,
};
`;
const dest = path.join(root, 'miniprogram', 'utils', 'logic.js');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log('已生成', dest, (out.length / 1024).toFixed(1) + 'KB');
