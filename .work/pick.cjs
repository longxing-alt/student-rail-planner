const fs=require('fs');
const rows=JSON.parse(fs.readFileSync('.work/flips4.json','utf8'));
const up=rows.filter(r=>r.old===0&&r.new===2);
// 挑出最值得实测的: 宽松中带(p 大)、贴边、以及新增站的
const pick=[];
function add(tag,r){pick.push(Object.assign({tag},r));}
//  用户的原始场景
[['厦门北','石家庄','泉州'],['厦门北','石家庄','莆田'],['厦门北','石家庄','福州'],['厦门北','石家庄','南昌西'],['厦门北','石家庄','武汉']]
 .forEach(([S,H,P])=>{const r=up.find(x=>x.S===S&&x.H===H&&x.P===P); if(r) add('用户场景',r);});
//  郑徐/永城
[['厦门北','石家庄','永城北'],['北京西','上海虹桥','永城北'],['郑州东','徐州东','永城北']]
 .forEach(([S,H,P])=>{const r=up.find(x=>x.S===S&&x.H===H&&x.P===P); if(r) add('永城/郑徐',r);});
console.log('找到',pick.length,'条');
pick.forEach(r=>console.log(r.tag, r.S+'<->'+r.H+' 去'+r.P, 't='+r.t,'p='+r.p,'L='+r.L));
