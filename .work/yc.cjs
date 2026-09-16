const L=require('../miniprogram/utils/logic.js');
console.log('typeof stationOf:', typeof L.stationOf);
const s=L.stationOf('???');
console.log('stationOf(???) =', s);
console.log('STATIONS ??:', L.STATIONS.filter(x=>x[0].indexOf('??')===0));
console.log('STATIONS ?? 6 ?:', JSON.stringify(L.STATIONS.slice(-6)));
