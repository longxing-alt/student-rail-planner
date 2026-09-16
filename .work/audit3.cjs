const fs=require('fs');
const HO=require('./head_logic.js');
const NW=require('./new_logic.js');
const rows=JSON.parse(fs.readFileSync('.work/flips2.json','utf8'));
const mk=L=>n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const oH=mk(HO), oN=mk(NW);
const dn=rows.filter(r=>r.old===2&&r.new===0);
const mkObj=L=>n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const oh=mkObj(HO), onn=mkObj(NW);
const detail=dn.map(r=>{
  const Sh=oh(r.S),Hh=oh(r.H),Ph=oh(r.P);
  const Sn=onn(r.S),Hn=onn(r.H),Pn=onn(r.P);
  const oldFast=HO.beltV2(Sh,Hh,Ph,true), newFast=NW.beltV2(Sn,Hn,Pn,true);
  return {S:r.S,H:r.H,P:r.P,L:r.L,t:r.t,p:r.p,
    oldFast,newFast,
    oldBand:HO.bandOK(Sh,Hh,Ph),oldChan:HO.chanOK(Sh,Hh,Ph),
    newBand:NW.bandOK(Sn,Hn,Pn),newChan:NW.chanOK(Sn,Hn,Pn)};
});
fs.writeFileSync('.work/dn-detail.json',JSON.stringify(detail));
const bandChan=detail.filter(d=>d.oldFast===2&&d.newFast===0&&!(d.newBand&&d.newChan));
const newChanOnly=bandChan.filter(d=>d.newBand&&!d.newChan);
const newBandOnly=bandChan.filter(d=>!d.newBand&&d.newChan);
const both=bandChan.filter(d=>!d.newBand&&!d.newChan);
fs.writeFileSync('.work/dn-breakdown.json',JSON.stringify({total:bandChan.length,新band过chan不过:newChanOnly.length,新chan过band不过:newBandOnly.length,都不过:both.length},null,1));
console.log('--- band&chan 收紧的细分 ---');
console.log('新 chanOK 不过:',newChanOnly.length);
console.log('新 bandOK 不过:',newBandOnly.length);
console.log('都不过:',both.length);
console.log();
console.log('新chanOK不过样例:');
newChanOnly.slice(0,10).forEach(d=>console.log('  '+d.S+'<->'+d.H+' 去'+d.P+' t='+d.t+' p='+d.p));
