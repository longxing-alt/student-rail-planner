import io, json, subprocess
# ? node ?? JSON, python ?(???????)
script = r'''
const fs=require('fs');
const L=require('/REPLACE/miniprogram/utils/logic.js');
const S=L.STATIONS;
const g=L.railAdj();
const nodes=Object.keys(g).filter(k=>k!=='pt'&&k!=='nodes');
const badCities=S.filter(s=>!(s[2]>15&&s[2]<55&&s[3]>73&&s[3]<135)).map(s=>s[0]);
const out={
  stations:S.length, hubs:L.HUBS.length, cities:new Set(S.map(s=>s[1])).size,
  dupNames:S.length-new Set(S.map(s=>s[0])).size,
  badCoord:badCities, graphCities:nodes.length,
  graphNoCoord:nodes.filter(c=>!g.pt[c]),
  emptyCity:S.filter(s=>!s[1]).length,
  emptyName:S.filter(s=>!s[0]).length,
  yongcheng: (L.stationOf('???')||[]),
};
fs.writeFileSync('.work/data.json', JSON.stringify(out,null,1));
console.log('written');
'''
io.open('.work/dump.cjs','w',encoding='utf-8',newline='\n').write(script.replace('/REPLACE','..'))
