# -*- coding: utf-8 -*-
# 生成 planner.html: 全新设计单页(复用 index.html 的 PURE LOGIC, 判定逐字一致)
import re

tpl = open('scripts/planner.tpl.html', encoding='utf-8').read()
html = open('index.html', encoding='utf-8').read()
m = re.search(r'// ==== PURE LOGIC START ====\n([\s\S]*?)\n// ==== PURE LOGIC END ====', html)
assert m, 'PURE LOGIC 块未找到'
logic = m.group(1)
assert 'document.' not in logic and 'window.' not in logic and 'fetch(' not in logic

out = tpl.replace('/*__PURE_LOGIC__*/', logic)
open('planner.html', 'w', encoding='utf-8', newline='\n').write(out)
print('planner.html 已生成 (%d KB)' % (len(out) / 1024))