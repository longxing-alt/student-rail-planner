const fs=require('fs');
const HO=require('./head_logic.js');
const NW=require('./new_logic.js');
const rows=JSON.parse(fs.readFileSync('.work/flips2.json','utf8'));
const obj=L=>n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const oh=obj(HO), on=obj(NW);
const dn=rows.filter(r=>r.old===2&&r.new===0);
let viaNear=0, viaFast=0;
const viaFastCases=[];
for(const r of dn){
  const oldFast=HO.beltV2(oh(r.S),oh(r.H),oh(r.P),true);
  if(oldFast===2) { viaFast++; viaFastCases.push(r); } else viaNear++;
}
console.log('收紧 '+dn.length+' 条中:');
console.log('  经 nearOK(完整判定含泄漏) =', viaNear);
console.log('  经 band&chan(不含 nearOK) =', viaFast);
console.log();
if(viaFastCases.length){
  console.log('--- 经 fast 路径的(需人工确认) ---');
  viaFastCases.slice(0,30).forEach(r=>console.log('  '+r.S+'<->'+r.H+' 去'+r.P+'  t='+r.t+' p='+r.p+' L='+r.L));
}
