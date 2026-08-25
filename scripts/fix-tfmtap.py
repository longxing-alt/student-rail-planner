# -*- coding: utf-8 -*-
# 重建 tfmTap 的 showModal content（写入真实的 \\n 转义）
p = 'miniprogram/pages/index/index.js'
s = open(p, encoding='utf-8').read()

old_start = s.index('    wx.showModal({')
old_end = s.index("      showCancel: false, confirmText: '知道了',", old_start)
old_end = s.index('    });', old_end) + len('    });')

new_block = (
    "    wx.showModal({\n"
    "      title: '⇄ 中转购买说明',\n"
    "      content: '优惠区间 ' + (S ? S.name : '学校') + ' ⇄ ' + (H ? H.name : '家') + ' 不变。\\n'\n"
    "        + '① 12306 选「中转」，中转站填 ' + sg.hub + '（区间内站）。\\n'\n"
    "        + '② 首段 ' + (sg.a ? sg.a.name : '') + ' → ' + sg.hub + ' 按学生票购买（两端都在区间内）。\\n'\n"
    "        + '③ 后续段 ' + sg.hub + ' → ' + (sg.b ? sg.b.name : '') + ' 随联程放行。\\n'\n"
    "        + '全程计 1 次优惠；实际以 12306 出票为准。',\n"
    "      showCancel: false, confirmText: '知道了',\n"
    "    });\n"
)
s = s[:old_start] + new_block + s[old_end:]
# 若再次出现真实换行(反斜杠被吃掉), 幂等兜底: 把单引号字符串内的真实换行替换为 \n 文本
s = s.replace("不变。\n'", "不变。\\n'").replace("（区间内站）。\n'", "（区间内站）。\\n'")
open(p, 'w', encoding='utf-8', newline='\n').write(s)
b = open(p, 'rb').read()
open(p, 'wb').write(b.replace(b'\r\n', b'\n'))
print('tfmTap 重建完成')