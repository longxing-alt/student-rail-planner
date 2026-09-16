
const fs=require('fs');
const L=require('../miniprogram/utils/logic.js');
const flips=JSON.parse(fs.readFileSync('.work/flips.json','utf8'));
const st=n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
const out=[];
for(const f of flips){
  const S=st(f.S),H=st(f.H),P=st(f.P);
  if(!S||!H||!P) continue;
  const Ld=L.dist(S,H); const c=L.corridor(S,H,P);
  const band = c.t<0?Math.max(250,0.2*Ld): c.t>1?Math.max(75,0.4*Ld):Math.max(60,0.55*Ld);
  out.push({S:f.S,H:f.H,P:f.P,old:f.old,new:f.new,L:Math.round(Ld),t:+c.t.toFixed(3),p:Math.round(c.p),band:Math.round(band),pRatio:+(c.p/Ld).toFixed(3)});
}
fs.writeFileSync('.work/flips2.json',JSON.stringify(out));
console.log('rows',out.length);
