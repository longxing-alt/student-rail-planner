import io,json,re
rows=json.load(io.open('.work/flips2.json',encoding='utf-8'))
dn=[r for r in rows if r['old']==2 and r['new']==0]
# ???????
new=io.open('index.html',encoding='utf-8').read()
na=new.index('const RAIL_LINES = ['); nb=new.index('\n];',na)
newc=set(re.findall(r"'([^']+)'", new[na:nb]))
head=io.open('.work/index-head.html',encoding='utf-8',errors='replace').read()
ha=head.index('const RAIL_LINES = ['); hb=head.index('\n];',ha)
oldc=set(re.findall(r"'([^']+)'", head[ha:hb]))
# CHAIN ?
chain=['??','??','??','??','??','??','??','??','??']
from collections import Counter
cat=Counter(); ex={}
for r in dn:
    P=r['P']
    if P in chain: k='D_??-???(???)'
    elif P in oldc and P in newc: k='A_???????nearOK/????????'
    elif P not in oldc: k='B_???????'
    else: k='C_??????'
    cat[k]+=1
    ex.setdefault(k,[]).append('%s<->%s ?%s (t=%.2f p=%d/L=%d)'%(r['S'],r['H'],P,r['t'],r['p'],r['L']))
print('===== ?? 2->0 ?? =====')
for k,v in cat.most_common(): print('  %-40s %d' % (k,v))
print()
for k in cat:
    print('--- %s ---' % k)
    for s in ex[k][:6]: print('   ', s)
