const fs=require('fs');
const L=require('../miniprogram/utils/logic.js');
const HO=require('./head_logic.js');
const flips=JSON.parse(fs.readFileSync('.work/flips4.json','utf8'));
const up=flips.filter(r=>r.old===0&&r.new===2);
const dn=flips.filter(r=>r.old===2&&r.new===0);
const byKey={}; up.forEach(r=>{(byKey[r.S+'|'+r.H]=byKey[r.S+'|'+r.H]||[]).push(r);});
const st=n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};

// 评分: 越"依赖被削弱的带宽"越优先实测
function score(r){
  const ratio=r.p/Math.max(1,r.band);
  let s=0;
  if(r.L>=2500) s+=40; else if(r.L>=1500) s+=25; else if(r.L>=800) s+=12;
  if(r.p>600) s+=25; else if(r.p>300) s+=15; else if(r.p>150) s+=8;
  if(ratio>0.95) s+=30; else if(ratio>0.8) s+=15;
  // 用户场景加权
  if(r.S==='厦门北'&&r.H==='石家庄') s+=100;
  if(r.P==='永城北') s+=60;
  return s;
}
const ranked=up.slice().sort((a,b)=>score(b)-score(a));

// 输出:  用户原场景全量  永城  高分样本(不同区间, 去重)
const lines=[];
lines.push('# 待 12306 实测清单（2026-09-15）');
lines.push('');
lines.push('本清单只列**本次改动后判定发生翻转**的样本，且**尚无真机实测**。');
lines.push('已有实测记录的样本（镇江/扬州东/滁州/苏沪同城圈/哈尔滨昆明 等）不重复。');
lines.push('');

lines.push('## 一、用户原始场景：区间 厦门  石家庄');
lines.push('');
lines.push('> 区间固定为「厦门北  石家庄」（L=1531km），下面只换票面起终点。');
lines.push('');
const xm=up.filter(r=>(r.S==='厦门北'&&r.H==='石家庄'));
lines.push('| 票面 | 工具判定 | 目的地 t | p(km) | 说明 |');
lines.push('|---|---|---|---|---|');
const want=['泉州','莆田','福州','宁德','漳州','龙岩','南昌西','武汉','三明北','南平','永城北'];
want.forEach(p=>{ const r=xm.find(x=>x.P===p); if(r) lines.push('| '+r.P+'  厦门北 |  可出 | '+r.t+' | '+r.p+' | 通道网补沿海线后进入图 |'); });
lines.push('');
lines.push('另外这 2 条是**同区间但票面反向**（厦门北  目的地），也应同判：');
lines.push('');
lines.push('| 票面 | 工具判定 | t | p |');
lines.push('|---|---|---|---|');
['泉州','莆田','福州','南京','苏州','永城北'].forEach(p=>{const r=xm.find(x=>x.P===p); if(r) lines.push('| 厦门北  '+r.P+' |  可出 | '+r.t+' | '+r.p+' |');});
lines.push('');

lines.push('## 二、永城（本次新增的车站）');
lines.push('');
lines.push('| 区间 | 票面 | 工具判定 | 说明 |');
lines.push('|---|---|---|---|');
up.filter(r=>r.P==='永城北').slice(0,12).forEach(r=>lines.push('| '+r.S+'  '+r.H+' |  永城北 |  可出 | 新增站，此前无法输入 |'));
lines.push('');

lines.push('## 三、高风险翻转样本（宽松中带 / 贴边，最需要实测）');
lines.push('');
lines.push('这些是 02 翻转中**最依赖「宽中带」**的：区间很长、垂直偏离 p 很大、或 p 贴着带宽上限。');
lines.push('若 12306 拒绝其中任一条，说明 **L2500 时 p 上限 (0.55L) 过宽**，需要收紧');
lines.push('这与 rules-notes 里已记录的 `海口沈阳徐州`（实测拦、模型判可出）是同一个问题。');
lines.push('');
lines.push('| # | 区间 | 票面 | L | t | p | 带宽 | p/带宽 |');
lines.push('|---|---|---|---|---|---|---|---|');
const seen=new Set();
let n=0;
for(const r of ranked){
  if(r.P==='永城北') continue;
  const k=r.S+'|'+r.H; if(seen.has(k)) continue; seen.add(k);
  if(n>=25) break;
  n++;
  lines.push('| '+n+' | '+r.S+'  '+r.H+' |  '+r.P+' | '+r.L+' | '+r.t+' | '+r.p+' | '+r.band+' | '+(r.p/r.band).toFixed(2)+' |');
}
lines.push('');

lines.push('## 四、被收紧的样本（工具从「可出」改判「拦截」，请确认拦得对）');
lines.push('');
lines.push('| # | 区间 | 票面 | 原因 |');
lines.push('|---|---|---|---|');
const dnSeen=new Set(); let m2=0;
const chain=['湛江','湛江西','海口','海口东','三亚','儋州','白马井','东方','文昌','琼海','万宁','徐闻'];
for(const r of dn){
  const k=r.S+'|'+r.H+'|'+r.P; if(dnSeen.has(k))continue; dnSeen.add(k);
  if(m2>=12) break; m2++;
  const why = chain.indexOf(r.P)>=0 ? '雷州-海南链末端（原设计就不该放）' : 'nearOK 多跳泄漏（原判定错误）';
  lines.push('| '+m2+' | '+r.S+'  '+r.H+' |  '+r.P+' | '+why+' |');
}
lines.push('');
lines.push('---');
lines.push('');
lines.push('## 反馈方式');
lines.push('');
lines.push('每条回我「区间 + 票面 + 12306 结果（可出/被拒 + 报错原文）」即可，例如：');
lines.push('');
lines.push('```');
lines.push('厦门北  石家庄，泉州  厦门北： 可出');
lines.push('厦门北  石家庄，北京西： 区间不符');
lines.push('```');
fs.writeFileSync('.work/VERIFY.md', lines.join(String.fromCharCode(10)), 'utf8');
console.log('written,', lines.length, 'lines');
console.log('up total', up.length, 'dn total', dn.length);

