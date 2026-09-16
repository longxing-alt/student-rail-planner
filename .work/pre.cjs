const HO=require('./head_logic.js');
const NW=require('./new_logic.js');
const mk=L=>n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const oH=mk(HO), oN=mk(NW);
const cases=[
 ['海口','沈阳','徐州'],['海口','哈尔滨','徐州'],['海口','沈阳','福州'],
 ['海口','福州','徐州'],['哈尔滨','成都','湛江'],['哈尔滨','昆明','湛江'],
 ['北京西','贵阳北','广州南'],
];
const pad=(s,n)=>{s=String(s); while(s.length<n) s+=' '; return s;};
console.log(pad('案例',24)+pad('L',7)+pad('HEAD',8)+'NEW');
for(const [a,b,c] of cases){
  const Ld=Math.round(NW.dist(oN(a),oN(b)));
  const h=HO.beltV2(oH(a),oH(b),oH(c),true)===2?'可出':'拦截';
  const n=NW.beltV2(oN(a),oN(b),oN(c),true)===2?'可出':'拦截';
  console.log(pad(a+'->'+c,24)+pad(Ld,7)+pad(h,8)+n);
}
