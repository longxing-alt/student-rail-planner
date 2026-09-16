import io
src = (
"const L=require('../miniprogram/utils/logic.js');\n"
"const fs=require('fs');\n"
"const S=L.STATIONS;\n"
"const out={\n"
"  yongcheng: S.filter(function(x){return x[0].indexOf('\\u6c38\\u57ce')===0;}),\n"
"  quanzhou: S.filter(function(x){return x[0].indexOf('\\u6cc9\\u5dde')===0;}),\n"
"  count: S.length,\n"
"};\n"
"fs.writeFileSync('.work/yc.json', JSON.stringify(out));\n"
"console.log('ok');\n"
)
io.open('.work/yc2.cjs','w',encoding='utf-8',newline='\n').write(src)
print('written')
