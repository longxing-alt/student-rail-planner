const L=require('../miniprogram/utils/logic.js');
const fs=require('fs');
const st=n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const cases=[
{a:'\u5317\u4eac\u897f',b:'\u8d35\u9633\u5317',c:'\u5e7f\u5dde\u5357',ok:0},
{a:'\u6d77\u53e3',b:'\u798f\u5dde',c:'\u798f\u5dde',ok:1},
{a:'\u6d77\u53e3',b:'\u798f\u5dde',c:'\u5f90\u5dde',ok:0},
{a:'\u6d77\u53e3',b:'\u6c88\u9633',c:'\u5f90\u5dde',ok:0},
{a:'\u6d77\u53e3',b:'\u54c8\u5c14\u6ee8',c:'\u5f90\u5dde',ok:0},
{a:'\u54c8\u5c14\u6ee8',b:'\u6210\u90fd',c:'\u6e5b\u6c5f',ok:0},
{a:'\u54c8\u5c14\u6ee8',b:'\u6210\u90fd',c:'\u4e09\u4e9a',ok:0},
{a:'\u54c8\u5c14\u6ee8',b:'\u6210\u90fd',c:'\u6df1\u5733',ok:1},
{a:'\u54c8\u5c14\u6ee8',b:'\u6606\u660e',c:'\u6e5b\u6c5f',ok:0},
{a:'\u54c8\u5c14\u6ee8',b:'\u6606\u660e',c:'\u5317\u6d77',ok:1},
{a:'\u6b66\u6c49',b:'\u4e09\u4e9a',c:'\u6df1\u5733',ok:1},
{a:'\u82cf\u5dde',b:'\u4e0a\u6d77',c:'\u6b66\u6c49',ok:1},
{a:'\u82cf\u5dde',b:'\u4e0a\u6d77',c:'\u5317\u4eac\u5357',ok:0},
{a:'\u5357\u4eac',b:'\u5408\u80a5',c:'\u5f00\u5c01\u5317',ok:0},
{a:'\u6ec1\u5dde',b:'\u9547\u6c5f',c:'\u4e0a\u6d77',ok:0},
{a:'\u5e7f\u5dde',b:'\u4f5b\u5c71',c:'\u53a6\u95e8\u5317',ok:1},
{a:'\u5317\u4eac\u897f',b:'\u77f3\u5bb6\u5e84',c:'\u5eca\u574a',ok:1},
{a:'\u6d77\u53e3',b:'\u6c88\u9633',c:'\u798f\u5dde',ok:1}
];
const out=cases.map(c=>{
  const S=st(c.a),H=st(c.b),P=st(c.c);
  if(!S||!H||!P) return {a:c.a,b:c.b,c:c.c,ok:c.ok,note:'miss'};
  const Ld=L.dist(S,H), co=L.corridor(S,H,P);
  const w=(co.t<0)?Math.max(250,0.2*Ld):(co.t>1)?Math.max(75,0.4*Ld):Math.max(60,0.55*Ld);
  return {a:c.a,b:c.b,c:c.c,ok:c.ok,L:Math.round(Ld),t:+co.t.toFixed(3),p:Math.round(co.p),w:Math.round(w),belt:L.beltV2(S,H,P,true)};
});
fs.writeFileSync('.work/key.json',JSON.stringify(out));console.log('ok');
