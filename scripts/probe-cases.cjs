/* 案例验证(只读,不写逻辑): 案例1 哈尔滨/成都×桂林/石家庄; 案例2 海口/福州→徐州 及沈阳/哈尔滨/广州桥 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const idx = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const logicSrc = idx.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/)[1];
const L = new Function(logicSrc + '\nreturn {STATIONS,HUBS,stToObj,dist,corridor,planTrip,coreLimit,edgeLimit};')();
const st = n => L.stToObj(L.STATIONS.find(s => s[0] === n || s[1] === n));

/* 复刻小程序 beltOf: 2=核心绿 1=边缘橙 0=红 */
function belt(S, H, P) {
  const Ln = L.dist(S, H);
  if (Ln < 15) return L.dist(S, P) <= 150 ? 2 : 0;
  const { t, p } = L.corridor(S, H, P);
  if (t >= -0.05 && t <= 1.05 && p <= L.coreLimit(Ln, t)) return 2;
  if (t >= -0.5 && t <= 1.5 && p <= L.edgeLimit(Ln, t)) return 1;
  return 0;
}
function geom(S, H, P) {
  const { t, p } = L.corridor(S, H, P);
  return { t: +t.toFixed(3), p: Math.round(p), core: Math.round(L.coreLimit(L.dist(S, H), t)), edge: Math.round(L.edgeLimit(L.dist(S, H), t)) };
}
function show(tag, S, H, O, D) {
  const r = L.planTrip(S, H, O, D);
  const gO = geom(S, H, O), gD = geom(S, H, D);
  console.log(`\n[${tag}] 区间 ${S.name}↔${H.name}  L=${Math.round(L.dist(S,H))}km`);
  console.log(`  发站 ${O.name}: t=${gO.t} p=${gO.p}km 带(core=${gO.core}/edge=${gO.edge})→ belt=${belt(S,H,O)}`);
  console.log(`  到站 ${D.name}: t=${gD.t} p=${gD.p}km 带(core=${gD.core}/edge=${gD.edge})→ belt=${belt(S,H,D)}`);
  console.log(`  judge=min(${belt(S,H,O)},${belt(S,H,D)}) = ${Math.min(belt(S,H,O), belt(S,H,D))} | planTrip: ${r.ok===1?'可出':'拦截'} (${r.mode}${r.station?' 经'+r.station.name:''})`);
}

console.log('======== 案例1: 哈尔滨/成都 × 桂林/石家庄 (实测: 两种朝向均能出票) ========');
show('1a 学校=哈尔滨 出发=成都', st('哈尔滨'), st('成都'), st('成都'), st('桂林'));
show('1a 学校=哈尔滨 出发=成都', st('哈尔滨'), st('成都'), st('成都'), st('石家庄'));
show('1b 学校=成都 出发=哈尔滨', st('成都'), st('哈尔滨'), st('哈尔滨'), st('石家庄'));
show('1b 学校=成都 出发=哈尔滨', st('成都'), st('哈尔滨'), st('哈尔滨'), st('桂林'));
show('1c 字面: 石家庄→桂林票(学校成都)', st('成都'), st('哈尔滨'), st('石家庄'), st('桂林'));
show('1c 字面: 石家庄→桂林票(学校哈尔滨)', st('哈尔滨'), st('成都'), st('石家庄'), st('桂林'));

console.log('\n======== 案例2: 海口↔福州 → 徐州 (实测: 沈阳/哈尔滨端点均无法出票; 广州→福州先行可解) ========');
show('2 当前 学校=海口 出发=福州', st('海口'), st('福州'), st('福州'), st('徐州'));
show('2 改端点=沈阳', st('海口'), st('沈阳'), st('福州'), st('徐州'));
show('2 改端点=哈尔滨', st('海口'), st('哈尔滨'), st('福州'), st('徐州'));
show('2 桥接段 广州→福州 (区间海口↔福州)', st('海口'), st('福州'), st('广州'), st('福州'));
show('2 回到本段 福州→徐州(有广州→福州在手)', st('海口'), st('福州'), st('福州'), st('徐州'));
process.exit(0);