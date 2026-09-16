/* ??: ????(???? + ??? + chanOK?? + nearOK??) ?? HEAD ?????
 * ??: ??"????"????????, ??????/???????? */
const fs=require('fs');
function load(html){
  const m=html.match(/\/\/ ==== PURE LOGIC START ====\n([\s\S]*?)\/\/ ==== PURE LOGIC END ====/);
  return new Function(m[1]+'\nreturn {STATIONS,stToObj,dist,beltV2,planTrip,chainV2,corridor,bandOK,chanOK,railAdj,state};')();
}
const OLD=load(fs.readFileSync('.work/index-head.html','utf8'));
const NEW=load(fs.readFileSync('index.html','utf8'));
const o={}, n={};
OLD.STATIONS.forEach(s=>o[s[0]]=s); NEW.STATIONS.forEach(s=>n[s[0]]=s);
const common=OLD.STATIONS.map(s=>s[0]).filter(x=>n[x]);
const added=Object.keys(n).filter(x=>!o[x]);

function beltTest(L,m,Sn,Hn,Pn){
  const S=m[Sn],H=m[Hn],P=m[Pn];
  if(!S||!H||!P) return null;
  const S2=L.stToObj(S),H2=L.stToObj(H),P2=L.stToObj(P);
  if(L.dist(S2,H2)<15) return null;
  return L.beltV2(S2,H2,P2,false);
}
// ????(??? + ??????????)
const hubs=OLD.STATIONS.filter(s=>s[4]).map(s=>s[0]);
const intervals=[];
for(let i=0;i<hubs.length;i++) for(let j=i+1;j<hubs.length;j++) intervals.push([hubs[i],hubs[j]]);
// ????? = ????(????)
const dests=Object.keys(n);
const flips=[];
let checked=0;
for(const [Sn,Hn] of intervals){
  for(const Pn of dests){
    const a=beltTest(OLD,o,Sn,Hn,Pn), b=beltTest(NEW,n,Sn,Hn,Pn);
    if(a===null||b===null) continue;
    checked++;
    if(a!==b) flips.push({S:Sn,H:Hn,P:Pn,old:a,new:b,isNew:!o[Pn]});
  }
}
fs.writeFileSync('.work/flips.json', JSON.stringify(flips));
const newSt=flips.filter(f=>f.isNew);
const up=flips.filter(f=>f.old===0&&f.new===2).length;
const down=flips.filter(f=>f.old===2&&f.new===0).length;
fs.writeFileSync('.work/flip-summary.json', JSON.stringify({checked,flips:flips.length,up,down,newStationFlips:newSt.length},null,1));
console.log('checked',checked,'flips',flips.length,'0->2',up,'2->0',down,'?????',newSt.length);
