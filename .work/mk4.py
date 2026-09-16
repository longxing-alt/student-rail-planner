import io
def u(s): return ''.join('\\u%04x'%ord(c) for c in s)
cases=[
 ('\u5317\u4eac\u897f','\u8d35\u9633\u5317','\u5e7f\u5dde\u5357',0),
 ('\u6d77\u53e3','\u798f\u5dde','\u798f\u5dde',1),
 ('\u6d77\u53e3','\u798f\u5dde','\u5f90\u5dde',0),
 ('\u6d77\u53e3','\u6c88\u9633','\u5f90\u5dde',0),
 ('\u6d77\u53e3','\u54c8\u5c14\u6ee8','\u5f90\u5dde',0),
 ('\u54c8\u5c14\u6ee8','\u6210\u90fd','\u6e5b\u6c5f',0),
 ('\u54c8\u5c14\u6ee8','\u6210\u90fd','\u4e09\u4e9a',0),
 ('\u54c8\u5c14\u6ee8','\u6210\u90fd','\u6df1\u5733',1),
 ('\u54c8\u5c14\u6ee8','\u6606\u660e','\u6e5b\u6c5f',0),
 ('\u54c8\u5c14\u6ee8','\u6606\u660e','\u5317\u6d77',1),
 ('\u6b66\u6c49','\u4e09\u4e9a','\u6df1\u5733',1),
 ('\u82cf\u5dde','\u4e0a\u6d77','\u6b66\u6c49',1),
 ('\u82cf\u5dde','\u4e0a\u6d77','\u5317\u4eac\u5357',0),
 ('\u5357\u4eac','\u5408\u80a5','\u5f00\u5c01\u5317',0),
 ('\u6ec1\u5dde','\u9547\u6c5f','\u4e0a\u6d77',0),
 ('\u5e7f\u5dde','\u4f5b\u5c71','\u53a6\u95e8\u5317',1),
 ('\u5317\u4eac\u897f','\u77f3\u5bb6\u5e84','\u5eca\u574a',1),
 # ??? mid ???????(???????"????<449")
 ('\u6d77\u53e3','\u6c88\u9633','\u798f\u5dde',1),
]
rows=[]
for a,b,c,ok in cases:
    rows.append("{a:'%s',b:'%s',c:'%s',ok:%d}"%(u(a),u(b),u(c),ok))
src=("const L=require('../miniprogram/utils/logic.js');\n"
     "const fs=require('fs');\n"
     "const st=n=>{const s=L.STATIONS.find(x=>x[0]===n)||L.STATIONS.find(x=>x[1]===n);return s?L.stToObj(s):null;};\n"
     "const cases=[\n"+',\n'.join(rows)+"\n];\n"
     "const out=cases.map(c=>{\n"
     "  const S=st(c.a),H=st(c.b),P=st(c.c);\n"
     "  if(!S||!H||!P) return {a:c.a,b:c.b,c:c.c,ok:c.ok,note:'miss'};\n"
     "  const Ld=L.dist(S,H), co=L.corridor(S,H,P);\n"
     "  const w=(co.t<0)?Math.max(250,0.2*Ld):(co.t>1)?Math.max(75,0.4*Ld):Math.max(60,0.55*Ld);\n"
     "  return {a:c.a,b:c.b,c:c.c,ok:c.ok,L:Math.round(Ld),t:+co.t.toFixed(3),p:Math.round(co.p),w:Math.round(w),belt:L.beltV2(S,H,P,true)};\n"
     "});\n"
     "fs.writeFileSync('.work/key.json',JSON.stringify(out));console.log('ok');\n")
io.open('.work/key2.cjs','w',encoding='utf-8',newline='\n').write(src)
print('written')
