# -*- coding: utf-8 -*-
# 统一样式 v3: 单一设计语言覆盖层(纯CSS, 结构/ID不动, 测试安全)
src = open('index.html', encoding='utf-8').read()

V3 = """
/* ==================== ★ 统一样式 v3：单一主色 / 收敛杂色 / 简化层次 ==================== */
body{font-family:'Inter',-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;line-height:1.6}
/* 导航: 单行极简 */
nav{border-bottom:1px solid var(--line);background:#fff}
nav .brand{font-size:14px;font-weight:800;letter-spacing:-.01em}
nav .logo{width:26px;height:26px;font-size:12px;border-radius:8px}
.nav-link{font-size:12.5px;font-weight:600;color:var(--muted);padding:5px 11px;border-radius:8px}
.nav-link:hover{color:var(--text);background:#f5f5f4}
/* 版面: 收敛宽度与留白 */
.workspace{max-width:780px;margin:18px auto 4px;border-radius:16px}
.ws-divider{margin:0;opacity:.55}
.sec-title{font-size:17px;font-weight:800;margin:26px 0 2px}
.kicker{font-size:10.5px;font-weight:700;letter-spacing:.09em}
.sec-sub{font-size:12px;margin-bottom:12px}
/* 按钮: 同族化 */
.btn-primary{background:linear-gradient(135deg,#0d9488,#059669);box-shadow:0 2px 10px rgba(13,148,136,.22)}
.btn-ghost{background:#fff;border:1px solid #d6d3d1;color:#52525b}
.btn-danger{color:#dc2626}
/* 状态徽章: 统一描边+淡底, 三种语义色 + 中性 */
.chip{font-size:11px;font-weight:600;padding:2px 9px;border-radius:99px;border:1px solid}
.chip-blue{color:#0d9488;background:rgba(13,148,136,.07);border-color:rgba(13,148,136,.25)}
.chip-green{color:#15803d;background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.28)}
.chip-red{color:#dc2626;background:rgba(220,38,38,.06);border-color:rgba(220,38,38,.24)}
.chip-orange{color:#d97706;background:rgba(245,158,11,.09);border-color:rgba(245,158,11,.3)}
.chip-violet{color:#57534e;background:#fafaf9;border-color:#e7e5e4}
/* 提示条: 统一一种样式(细框白底) */
.advice{background:#fff;border:1px solid var(--line);color:#52525b;box-shadow:none;padding:9px 12px;font-size:12.5px}
.demo-tip,.warn-banner,.ok-banner,.bridge-tip{border-radius:10px;font-size:12.5px}
.warn-banner,.ok-banner{padding:9px 12px;background:#fff}
.warn-banner{border:1px solid rgba(220,38,38,.28);color:#b91c1c}
.ok-banner{border:1px solid rgba(22,163,74,.28);color:#15803d}
#fiveDayTip{font-size:11.5px;padding:6px 10px;border-radius:9px}
/* 参数卡: 更轻 */
.param-card{padding:10px 12px;margin:8px 0 10px;border-radius:12px}
.param-title{font-size:12px}
.param-hint{font-size:11px}
/* 结果强调: 数字大而清, 说明一行 */
#usedBig{font-size:36px;font-weight:800}
.ws-top .hint{font-size:12.5px}
/* 行程卡片: 紧凑统一 */
.trip-row{padding:9px 11px;border-radius:11px;background:#fff;border:1px solid var(--line)}
.sub{font-size:12px;color:var(--muted)}
/* 优化列表: 紧凑, 弱化冗余 */
.opt-row{padding:9px 12px;border-radius:11px;background:#fff;border:1px solid var(--line);margin-bottom:7px}
.opt-main b{font-size:13px;font-weight:700}
.opt-meta .chip{font-size:10.5px;padding:1px 8px}
/* 页脚: 单行小字 */
footer{font-size:11.5px;color:var(--muted-2);padding:18px 0 30px;text-align:center}
/* 区间线: 更细更浅 */
.iv-line{height:2px}
/* 其它杂色收敛 */
#resultHint{font-size:12px;color:var(--muted)}
.ver{font-size:10.5px}
"""

anchor = "/* 嵌入模式(朋友网站 iframe/embed=1): 简洁干净, 突出区间规划主题 */"
assert anchor in src
src = src.replace(anchor, V3 + "\n" + anchor, 1)

open('index.html', 'w', encoding='utf-8', newline='\n').write(src)
b = open('index.html', 'rb').read()
open('index.html', 'wb').write(b.replace(b'\r\n', b'\n'))
print('统一样式 v3 覆盖层已写入')