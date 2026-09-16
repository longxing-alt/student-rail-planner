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
  let oldNear=false, newNear=false;
  try{ oldNear=HO.nearOK? HO.nearOK(Sh,Hh).has(r.P):false; }catch(e){}
  try{ newNear=NW.nearOK? NW.nearOK(Sn,Hn).has(r.P):false; }catch(e){}
  out.push({
    S:r.S,H:r.H,P:r.P,old:r.old,new:r.new,L:r.L,t:r.t,p:r.p,band:r.band,
    oldBand:HO.bandOK(Sh,Hh,Ph), oldChan:HO.chanOK(Sh,Hh,Ph),
    newBand:NW.bandOK(Sn,Hn,Pn), newChan:NW.chanOK(Sn,Hn,Pn),
    oldNear,newNear,
  });
}
fs.writeFileSync('.work/flips3.json',JSON.stringify(out));
const dn=out.filter(r=>r.old===2&&r.new===0);
const up=out.filter(r=>r.old===0&&r.new===2);
const dnByOldNear=dn.filter(r=>r.oldNear).length;
const dnByOldBandChan=dn.filter(r=>r.oldBand&&r.oldChan&&!r.oldNear).length;
const dnOther=dn.length-dnByOldNear-dnByOldBandChan;
const upNewChan=up.filter(r=>!r.newBand&&r.newChan).length;
const upNewBand=up.filter(r=>r.newBand).length;
fs.writeFileSync('.work/audit.json',JSON.stringify({
  dnTotal:dn.length, dnOldNear:dnByOldNear, dnOldBandChan:dnByOldBandChan, dnOther,
  upTotal:up.length, upNewBand, upNewChan,
  upMidBigBand: up.filter(r=>r.p>300 && r.L>=2500).length,
  upTight: up.filter(r=>r.p/Math.max(1,r.band)>0.9 && r.p/Math.max(1,r.band)<=1.001).length,
},null,1));
console.log('audit written');
