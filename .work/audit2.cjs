const fs=require('fs');
const HO=require('./head_logic.js');
const NW=require('./new_logic.js');
const rows=JSON.parse(fs.readFileSync('.work/flips2.json','utf8'));
const mk=L=>n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const oH=mk(HO), oN=mk(NW);
const out=[];
for(const r of rows){
  const Sh=oH(r.S),Hh=oH(r.H),Ph=oH(r.P);
  const Sn=oN(r.S),Hn=oN(r.H),Pn=oN(r.P);
  if(!Sh||!Hh||!Ph||!Sn||!Hn||!Pn) continue;
  const oldBand=HO.bandOK(Sh,Hh,Ph), oldChan=HO.chanOK(Sh,Hh,Ph);
  const oldFast=HO.beltV2(Sh,Hh,Ph,true);           // 不含 nearOK
  const oldNear=HO.nearOK(Sh,Hh).has(r.P);
  const newBand=NW.bandOK(Sn,Hn,Pn), newChan=NW.chanOK(Sn,Hn,Pn);
  const newFast=NW.beltV2(Sn,Hn,Pn,true);
  const newNear=NW.nearOK(Sn,Hn).has(r.P);
  const oldPath = oldFast===2 ? (oldBand&&oldChan?'band&chan':'other') : (oldNear?'nearOK':'none');
  const newPath = newFast===2 ? (newBand&&newChan?'band&chan':'other') : (newNear?'nearOK':'none');
  out.push({S:r.S,H:r.H,P:r.P,old:r.old,new:r.new,L:r.L,t:r.t,p:r.p,band:r.band,oldPath,newPath,oldBand,oldChan,newBand,newChan});
}
fs.writeFileSync('.work/flips4.json',JSON.stringify(out));
console.log('rows',out.length);
