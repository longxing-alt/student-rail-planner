import io,json
rows=json.load(io.open('.work/flips2.json',encoding='utf-8'))
dn=[r for r in rows if r['old']==2 and r['new']==0]
up=[r for r in rows if r['old']==0 and r['new']==2]
print('===== ?? 2->0 ? %d ? =====' % len(dn))
print()
print('%-10s %-10s %-9s %-6s %-7s %-7s %-7s %-8s' % ('??','?','???','L','t','p','p/L','p / band'))
for r in dn[:40]:
    print('%-10s %-10s %-9s %-6d %-7.2f %-7d %-7.3f %-8.2f' % (r['S'],r['H'],r['P'],r['L'],r['t'],r['p'],r['pRatio'], r['p']/max(1,r['band'])))
