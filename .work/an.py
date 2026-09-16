import io,json
fl=json.load(io.open('.work/flips.json',encoding='utf-8'))
print('===== ???? =====')
up=[f for f in fl if f['old']==0 and f['new']==2]
dn=[f for f in fl if f['old']==2 and f['new']==0]
print('?? 0->2 :', len(up))
print('?? 2->0 :', len(dn))
# ????
print()
print('--- ?? 2->0 ????(? 25) ---')
seen=set()
for f in dn[:400]:
    k=(f['S'],f['H'])
    if k in seen: continue
    seen.add(k)
    if len(seen)>25: break
    print('  %-6s <-> %-6s  ? %s' % (f['S'],f['H'],f['P']))
# ?????
from collections import Counter
cu=Counter((f['S'],f['H']) for f in up)
cd=Counter((f['S'],f['H']) for f in dn)
print()
print('--- ???????(? 15) ---')
for (s,h),c in cu.most_common(15): print('  %-8s <-> %-8s  ?? %d ????' % (s,h,c))
print()
print('--- ???????(? 15) ---')
for (s,h),c in cd.most_common(15): print('  %-8s <-> %-8s  ?? %d ????' % (s,h,c))
