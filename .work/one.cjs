const HO=require('./head_logic.js');
const NW=require('./new_logic.js');
const cases=[['北京西','福州','肇庆东'],['石家庄','长沙南','苏州'],['太原南','合肥南','苏州'],['呼和浩特东','广州南','抚顺北']];
const mk=L=>n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const pad=(s,n)=>{s=String(s);while(s.length<n)s+=' ';return s;};
for(const [a,b,c] of cases){
  const Sh=mk(HO)(a),Hh=mk(HO)(b),Ph=mk(HO)(c);
  const Sn=mk(NW)(a),Hn=mk(NW)(b),Pn=mk(NW)(c);
  console.log('== '+a+'<->'+b+' 去'+c+' ==');
  console.log('  HEAD: band='+HO.bandOK(Sh,Hh,Ph)+' chan='+HO.chanOK(Sh,Hh,Ph)+' fast='+HO.beltV2(Sh,Hh,Ph,true)+' full='+HO.beltV2(Sh,Hh,Ph,false)+' near='+HO.nearOK(Sh,Hh).has(c));
  console.log('  NEW : band='+NW.bandOK(Sn,Hn,Pn)+' chan='+NW.chanOK(Sn,Hn,Pn)+' fast='+NW.beltV2(Sn,Hn,Pn,true)+' full='+NW.beltV2(Sn,Hn,Pn,false)+' near='+NW.nearOK(Sn,Hn).has(c));
}
