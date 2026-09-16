const fs=require('fs');
const real=JSON.parse(fs.readFileSync('verify-data/real-data.json','utf8'));
function load(mut){
  let src=fs.readFileSync('miniprogram/utils/logic.js','utf8');
  if(mut) src=mut(src);
  const m={exports:{}}; new Function('module',src)(m); return m.exports;
}
function run(tag,mut){
  const L=load(mut);
  const st=n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};
  let ok=0,bad=0,skip=0;const fails=[];
  for(const e of real){
    if(e.real!=='ok'&&e.real!=='bad'){skip++;continue;}
    const S=st(e.school),H=st(e.home),O=st(e.origin||e.school),D=st(e.dest);
    if(!D||!S||!H||!O){skip++;continue;}
    let f;
    if(e.transfer){const cc=L.chainV2(S,H,[],O,D,false);const sg=cc&&cc.segs[0];f=!!(sg&&(sg.inInt||sg.hub));}
    else f=L.planTrip(S,H,O,D).ok===1;
    if((f?1:0)===(e.real==='ok'?1:0))ok++;else{bad++;fails.push(e.school+'/'+e.home+' '+O.name+'->'+D.name+' 期望'+e.real);}
  }
  console.log('['+tag+'] 吻合 '+ok+' / 不符 '+bad+' / 跳过 '+skip);
  fails.slice(0,6).forEach(f=>console.log('    x '+f));
  return bad;
}
const CAP450 = s => s.replace(
  'const w = (t < 0.0) ? Math.max(250, 0.2 * L)\n        : (t > 1.0) ? Math.max(75, 0.4 * L)\n        : Math.max(60, 0.55 * L);',
  'const w = (t < 0.0) ? Math.min(450, Math.max(250, 0.2 * L))\n        : (t > 1.0) ? Math.max(75, 0.4 * L)\n        : Math.min(450, Math.max(60, 0.55 * L));');
run('现状(无450上限)',null);
let applied=false;
run('加 450 上限(按注释规范)', s=>{const o=CAP450(s); if(o===s){console.log('  !! 替换未生效');return s;} applied=true; return o;});
console.log('替换生效:', applied);
