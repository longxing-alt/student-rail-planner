const L=require('../miniprogram/utils/logic.js');
const fs=require('fs');
const S=L.STATIONS;
const out={
  yongcheng: S.filter(function(x){return x[0].indexOf('\u6c38\u57ce')===0;}),
  quanzhou: S.filter(function(x){return x[0].indexOf('\u6cc9\u5dde')===0;}),
  count: S.length,
};
fs.writeFileSync('.work/yc.json', JSON.stringify(out));
console.log('ok');
