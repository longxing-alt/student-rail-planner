const fs=require('fs');
const L=require('../miniprogram/utils/logic.js');
console.log('===== D. ????? =====');
const S=L.STATIONS;
const fail=[];
if(!(S.length>=420)) fail.push('??? '+S.length);
if(new Set(S.map(s=>s[0])).size!==S.length) fail.push('????');
if(!S.every(s=>s[2]>15&&s[2]<55&&s[3]>73&&s[3]<135)) fail.push('????');
if(!S.every(s=>typeof s[1]==='string'&&s[1].length>0)) fail.push('???');
if(!S.every(s=>typeof s[0]==='string'&&s[0].length>0)) fail.push('???');
if(L.HUBS.length!==35) fail.push('??? '+L.HUBS.length);
console.log('??',S.length,'| ??',L.HUBS.length,'| ??',new Set(S.map(s=>s[1])).size);
console.log('??????:', S.filter(s=>!(s[2]>15&&s[2]<55&&s[3]>73&&s[3]<135)).map(s=>s[0]).join(',')||'(?)');
// ????????
const g=L.railAdj();
const nodes=Object.keys(g).filter(k=>k!=='pt'&&k!=='nodes');
const bad=[]; nodes.forEach(c=>{ if(!g.pt[c]) bad.push(c); });
console.log('?????',nodes.length,'| ?????:',bad.join(',')||'(?)');
// ????????????(?????)
console.log('????????:', bad.length);
console.log('??:', fail.length? ' '+fail.join('; ') : ' ????');
