# -*- coding: utf-8 -*-
"""软著材料生成器(当前版本): 源程序/操作手册/使用手册/申请信息汇总 DOCX + PDF + zip
以 2026-09-03 当前代码为准(index.html 3135 行 + 计数 v2 规则)。"""
import os, io, re, sys, glob
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'soft-copyright')
os.makedirs(OUT, exist_ok=True)

NAME = '学生优惠票区间规划软件'
SHORT = '学生票区间规划器'
VER = 'V1.0'
AUTHOR = '龙兴榆'
# 当前主源文件(判定核心 + 界面, 单文件应用)
SRC_FILE = os.path.join(ROOT, 'index.html')
LINES_TOTAL = 3135  # wc -l index.html
FINISH_DATE = '2026年9月3日'


def new_doc():
    d = Document()
    sec = d.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    st = d.styles['Normal']
    st.font.name = '宋体'
    st.font.size = Pt(10.5)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    return d


def add_para(d, text, bold=False, size=None, align=None, mono=False):
    p = d.add_paragraph()
    r = p.add_run(text)
    r.font.name = 'Courier New' if mono else '宋体'
    if mono:
        r.element.rPr.rFonts.set(qn('w:eastAsia'), '宋体')
    r.font.bold = bold
    if size:
        r.font.size = Pt(size)
    if align:
        p.alignment = align
    return p


def set_header(d, text):
    sec = d.sections[0]
    h = sec.header.paragraphs[0]
    h.text = ''
    r = h.add_run(text)
    r.font.name = '宋体'
    r.font.size = Pt(9)
    r.font.color.rgb = RGBColor(0x66, 0x66, 0x66)


def docx_to_pdf(docx_path, pdf_path):
    """MS Word COM 转 PDF。"""
    import win32com.client
    word = win32com.client.Dispatch('Word.Application')
    word.Visible = False
    try:
        doc = word.Documents.Open(os.path.abspath(docx_path))
        doc.SaveAs(os.path.abspath(pdf_path), FileFormat=17)  # 17 = PDF
        doc.Close(False)
        print('  PDF ✓', os.path.basename(pdf_path), os.path.getsize(pdf_path), 'B')
        return True
    finally:
        word.Quit()


def gen_source():
    print('== 源程序 ==')
    d = new_doc()
    set_header(d, f'{NAME}{VER}　源程序　　第  页')
    add_para(d, NAME, bold=True, size=16, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(d, f'{SHORT} {VER}', bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(d, '源程序', bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(d, f'著作权人：{AUTHOR}', align=WD_ALIGN_PARAGRAPH.CENTER)
    lines = open(SRC_FILE, encoding='utf-8').read().split('\n')
    # 前 30 页 + 后 30 页 (每页 50 行)
    per = 50
    head, tail = lines[:30 * per], lines[-30 * per:]
    show = head + [''] + tail if len(lines) > 60 * per else lines
    n = 0
    for ln in show:
        n += 1
        add_para(d, ln if ln.strip() else '', mono=True)
    print(f'  源代码行: {len(show)} (总 {len(lines)} 行, 前30+后30页)')
    d.save(os.path.join(OUT, f'源程序_{SHORT}{VER}.docx'))
    print('  DOCX ✓')
    docx_to_pdf(os.path.join(OUT, f'源程序_{SHORT}{VER}.docx'), os.path.join(OUT, f'源程序_{SHORT}{VER}.pdf'))


OPS = [
    (NAME, 16, True, 'center'),
    (f'{SHORT} {VER}', 14, True, 'center'),
    ('操作手册', 14, True, 'center'),
    (f'（著作权人：{AUTHOR}）', 10.5, False, 'center'),
    ('一、软件简介', 13, True, 'left'),
    ('学生优惠票区间规划软件（简称：学生票区间规划器）是一款面向在校大学生的 12306 学生优惠票规划工具。软件在"学校端固定、家庭端可调"的前提下，基于真实出票实测数据校准的判定模型，帮助用户规划任意出行路线并自动计算优惠次数。',
     10.5, False, 'left'),
    ('软件主要解决三个问题：其一，能去哪——直观展示学校与家之间的优惠区间走廊及区间内可去的城市；其二，怎么去——直达优先、必要时一次中转，自动给出中转站与联程路线；其三，去一趟扣几次——按 12306 实际规则计算直达、中转、往返、全价各扣几次。',
     10.5, False, 'left'),
    ('二、运行环境', 13, True, 'left'),
    ('硬件环境：普通个人电脑或智能手机，可运行现代浏览器即可。', 10.5, False, 'left'),
    '软件环境：Windows、macOS、Linux、Android、iOS 等任意支持 HTML5 的操作系统。',
    '支持浏览器：Chrome、Edge、Firefox、Safari 等现代浏览器。',
    '开发环境：Windows 10/11，Visual Studio Code，Node.js 18+（仅开发测试用）。',
    ('三、安装与启动', 13, True, 'left'),
    ('本软件为纯前端单文件应用，无需安装。在线使用：访问 GitHub Pages 部署地址（https://longxing-alt.github.io/student-rail-planner/）即可直接使用；本地运行：下载 index.html 后用浏览器直接打开。',
     10.5, False, 'left'),
    ('四、快速上手（三步向导）', 13, True, 'left'),
    ('第一步"学校"：输入学校所在城市（如"北京"）。学校端点固定不可修改，需与学信网信息一致。', 10.5, False, 'left'),
    ('第二步"出发地"：输入出发城市（如"石家庄"），区间端点初值即此站，后续可采用推荐区间替换。', 10.5, False, 'left'),
    '第三步"想去哪"：逐个添加目的地（如"武汉"），支持拖动排序与往返勾选，点击"一键规划"完成。',
    '规划完成后，结果区展示：路线链路图（含中转站标注）、每段判定（直达/中转可出/区间外）、连续行程计次、剩余次数、以及把家端点改到哪个站能直达的建议卡。',
    ('五、功能说明', 13, True, 'left'),
    ('5.1 区间可视化：页面实时绘制"学校⇄家"区间走廊线，已添加的目的地按投影位置着色，绿色=区间内直达、橙色=中转可出、红色=超区间需全价。', 10.5, False, 'left'),
    '5.2 串联路线与自动排序：多个目的地按最优联程自动排序，使最多段落在区间内；折返段自动检出并提示。',
    '5.3 中转方案：仅当直达不可行时，工具按"发站在区间内 + 中转站在区间走廊带内"给出一次中转方案，列出候选中转站（与学校/家同城者已排除），并给出分步购票说明弹窗。',
    '5.4 区间优化与推荐：枚举通道网内全部车站作为家端点候选，按"覆盖段数最多 → 直达段最多 → 端点居中 → 距家近"排序；与学校同城的站不会被推荐（避免生成无法认定的退化区间）。',
    '5.5 计次统计：连续行程（不折返、非往返）无论几段只计 1 次；往返 ×2；区间外段需全价并断开行程。结果区实时显示已用次数与剩余额度。',
    '5.6 其他功能：高级设置可调绕行比阈值（默认 2.5，实测最优）；地图联动；规则菜单含与官方规则对照。',
    ('六、优惠次数计算规则', 13, True, 'left'),
    ('软件内置判定规则经真实出票实测校准：', 10.5, False, 'left'),
    '1. 直达：车票两端均在区间走廊带内，学生票，计 1 次。',
    '2. 中转：发站在区间内、中转站在走廊带内（枢纽级车站），一次中转后放行，全程计 1 次。',
    '3. 往返：同一行程往返计 2 次。',
    '4. 全价：任一端超出区间带，需购全价成人票，不消耗优惠次数。',
    '5. 联程：同一连续行程（不折返、不往返）5 日内完成只计 1 次。',
    '6. 同城站：学校/家所在城市的其他车站视为同城（50km 近邻圈规则）。',
    '7. 极短区间：两端近邻圈（≤600km）内城市可直达；此类中转方案标注"未实测"，提示用户真机验证。',
    ('七、常见问题', 13, True, 'left'),
    '问：为什么直达不行却给出中转？答：直达被拦时，先区间内到中转站再续接，可保住学生票价；若愿意改区间，结果下方"把家改成 XX → 直达"建议一键采用。',
    '问：为什么推荐把家改到很远的城市？答：家庭端点决定区间长度，拉长可覆盖更多行程；推荐已排除与学校同城（无法认定）与当前家同城（无意义）的站。',
    '问：修改家庭地址有什么限制？答：学校端固定不可动（须与学信网一致），家庭端可任意修改；实际修改需在 12306"学生资质核验"中操作。',
    ('八、版权声明', 13, True, 'left'),
    f'本软件由 {AUTHOR} 独立开发，著作权归开发者所有。软件数据与规划结果仅供估算参考，实际购票请以 12306 官方为准。',
]


def gen_manual():
    print('== 操作手册 ==')
    d = new_doc()
    set_header(d, f'{NAME}{VER}　操作手册　　第  页')
    for item in OPS:
        if isinstance(item, tuple):
            text, size, bold, align = item
            add_para(d, text, bold=bold, size=size, align={'center': WD_ALIGN_PARAGRAPH.CENTER, 'left': None}[align])
        else:
            add_para(d, item)
    d.save(os.path.join(OUT, f'操作手册_{SHORT}{VER}.docx'))
    print('  DOCX ✓')
    docx_to_pdf(os.path.join(OUT, f'操作手册_{SHORT}{VER}.docx'), os.path.join(OUT, f'操作手册_{SHORT}{VER}.pdf'))


def gen_usage():
    print('== 使用手册 ==')
    d = new_doc()
    set_header(d, f'{NAME}{VER}　使用手册　　第  页')
    add_para(d, NAME, bold=True, size=16, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(d, f'{SHORT} {VER}', bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(d, '使用手册', bold=True, size=14, align=WD_ALIGN_PARAGRAPH.CENTER)
    add_para(d, f'（著作权人：{AUTHOR}）', align=WD_ALIGN_PARAGRAPH.CENTER)
    # 界面截图(已有, 若在则插入)
    shots = sorted(glob.glob(os.path.join(OUT, 'screenshots', '1_*.png'))) + \
            sorted(glob.glob(os.path.join(OUT, 'screenshots', '2_*.png'))) + \
            sorted(glob.glob(os.path.join(OUT, 'screenshots', '3_*.png'))) + \
            sorted(glob.glob(os.path.join(OUT, 'screenshots', '4_*.png')))
    intro = [
        '一、软件简介', '本手册配合界面截图介绍软件日常使用流程。',
        '二、使用流程',
        '1. 打开软件：浏览器访问部署地址或本地打开 index.html。',
        '2. 三步向导：学校 → 出发地 → 想去哪（支持拖动排序、往返勾选）。',
        '3. 一键规划：查看链路图、判定颜色、计次与剩余额度。',
        '4. 中转方案：直达不可行时点"⇄ 可中转哪里出票"查看分步购票说明。',
        '5. 采用推荐区间：点击建议卡"采用推荐区间"，家端点替换为推荐站，直达段即时转绿。',
        '三、界面说明',
        '主界面向导区：三步输入卡片，当前步骤高亮，支持返回上一步修改。',
        '规划结果区：链路 chips + 段行 + 计次统计 + 推荐卡。',
        '地图联动区：学校/家图钉可拖动，直观查看区间覆盖。',
        '区间优化区：候选端点列表，点击"采用"应用最优区间。',
        '四、注意事项',
        '判定基于实测出票数据校准，实际以 12306 为准；数据仅存本地浏览器。',
    ]
    for i, t in enumerate(intro):
        add_para(d, t, bold=t.startswith(('一、', '二、', '三、', '四、')), size=12 if t.startswith(('一、', '二、', '三、', '四、')) else None)
        if t == '三、界面说明' and shots:
            pass
    if shots:
        add_para(d, '五、界面截图', bold=True, size=12)
        for s in shots:
            try:
                d.add_picture(s, width=Cm(14))
            except Exception as e:
                print('  截图插入失败', s, e)
    d.save(os.path.join(OUT, f'使用手册_{SHORT}{VER}.docx'))
    print('  DOCX ✓, 截图', len(shots), '张')
    docx_to_pdf(os.path.join(OUT, f'使用手册_{SHORT}{VER}.docx'), os.path.join(OUT, f'使用手册_{SHORT}{VER}.pdf'))


INFO = [
    ('软件著作权登记　申请信息汇总', 16, True, 'center'), (f'{SHORT} {VER}', 12, False, 'center'), ('', 10.5, False, 'left'),
    ('一、软件基本信息', 13, True, 'left'),
    (f'【软件全称】{NAME}', 10.5, False, 'left'),
    (f'【软件简称】{SHORT}', 10.5, False, 'left'),
    (f'【版本号】{VER}', 10.5, False, 'left'),
    ('【软件分类】应用软件', 10.5, False, 'left'), ('【开发方式】独立开发', 10.5, False, 'left'),
    ('【开发的硬件环境】Intel/AMD 通用个人计算机', 10.5, False, 'left'),
    ('【运行的硬件环境】个人电脑或智能手机', 10.5, False, 'left'),
    ('【开发该软件的操作系统】Windows 10/11', 10.5, False, 'left'),
    ('【软件开发环境/开发工具】Visual Studio Code、Node.js 18+', 10.5, False, 'left'),
    ('【该软件的运行平台/操作系统】任意支持 HTML5 的浏览器（Chrome/Edge/Firefox/Safari）', 10.5, False, 'left'),
    ('【软件运行支撑环境/支持软件】无依赖，纯前端单文件（Leaflet 地图库经 CDN 加载）', 10.5, False, 'left'),
    ('【编程语言】JavaScript（HTML/CSS/JS）', 10.5, False, 'left'),
    (f'【源程序量】{LINES_TOTAL} 行（约 165 KB）', 10.5, False, 'left'),
    (f'【开发完成日期】{FINISH_DATE}', 10.5, False, 'left'),
    (f'【首次发表日期】{FINISH_DATE}', 10.5, False, 'left'),
    ('【发表状态】已发表（GitHub Pages 公开访问）', 10.5, False, 'left'),
    ('【软件用途】面向在校大学生，规划 12306 学生优惠票出行路线与优惠次数', 10.5, False, 'left'),
    ('【主要功能】区间可视化、串联路线规划、直达/中转判定、连续行程计次、区间端点优化（推荐直达、排除同城退化端点）、地图联动', 10.5, False, 'left'),
    ('二、著作权人信息（个人）', 13, True, 'left'),
    (f'【姓名】{AUTHOR}', 10.5, False, 'left'),
    ('【证件类型】中华人民共和国居民身份证', 10.5, False, 'left'),
    ('【证件号码】522725200508149830', 10.5, False, 'left'),
    ('【国籍】中国', 10.5, False, 'left'),
    ('三、申请材料清单', 13, True, 'left'),
    ('1. 软件著作权登记申请表：在中国版权保护中心官网 https://www.ccopyright.com.cn 在线填写并打印。', 10.5, False, 'left'),
    ('2. 源程序：提交版 PDF（前 30 页 + 后 30 页，每页 50 行）；完整源码备查见 DOCX。', 10.5, False, 'left'),
    ('3. 操作手册 / 使用手册（含界面截图）：见本目录对应 PDF。', 10.5, False, 'left'),
    ('4. 著作权人身份证明：本人身份证正反面复印件（个人登记）。', 10.5, False, 'left'),
    ('四、提交流程提示', 13, True, 'left'),
    ('1. 官网注册并实名认证。2. 在线填写申请表（字段与本汇总一致）。3. 上传源程序 PDF 与手册 PDF。4. 受理后约 30-60 个工作日出证（可加急）。', 10.5, False, 'left'),
]


def gen_info():
    print('== 申请信息汇总 ==')
    d = new_doc()
    set_header(d, f'{NAME}{VER}　申请信息汇总　　第  页')
    for text, size, bold, align in INFO:
        add_para(d, text, bold=bold, size=size, align=WD_ALIGN_PARAGRAPH.CENTER if align == 'center' else None)
    d.save(os.path.join(OUT, f'软著申请信息汇总_{SHORT}{VER}.docx'))
    print('  DOCX ✓')
    docx_to_pdf(os.path.join(OUT, f'软著申请信息汇总_{SHORT}{VER}.docx'), os.path.join(OUT, f'软著申请信息汇总_{SHORT}{VER}.pdf'))


def package():
    print('== 打包 zip ==')
    import zipfile
    zp = os.path.join(OUT, f'软著登记材料_{SHORT}{VER}.zip')
    if os.path.exists(zp):
        os.remove(zp)
    files = [f'软著申请信息汇总_{SHORT}{VER}.pdf', f'源程序_{SHORT}{VER}.pdf', f'操作手册_{SHORT}{VER}.pdf', f'使用手册_{SHORT}{VER}.pdf']
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files:
            p = os.path.join(OUT, f)
            if os.path.exists(p):
                z.write(p, f)
                print('  +', f, os.path.getsize(p), 'B')
            else:
                print('  - 缺失(跳过):', f)
    print('  zip:', os.path.getsize(zp), 'B')


if __name__ == '__main__':
    gen_source()
    gen_manual()
    gen_usage()
    gen_info()
    package()
    print('完成 →', OUT)