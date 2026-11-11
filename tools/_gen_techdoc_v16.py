# -*- coding: utf-8 -*-
"""技术文档 v1.16 全新重写生成器。

排版规范（用户明确要求）：
  - 目录条目页码使用 Times New Roman
  - 图 N-M 编号标注在图【下方】，居中
  - 表 N-M 编号标注在表【上方】，居中
  - 正文小标题使用专业术语
  - 页脚页码使用 Times New Roman
  - 保留原 v1.15 文件不动，输出 v1.16

内容依据：2026-11-11 网站真实状态（104 只精灵 / 23 站 / 22 馆 / 20 属性 /
  主线 117 节点 4 结局 / 成就册 11 枚 / 全国大地图路牌 / 隐藏结局等）。
"""
import docx
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy, os

OUT_DOCX = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.16.docx"
IMG_DIR = r"C:\Users\lenovo\Desktop\文物精灵网站\_文档素材"

# ---------- 字体常量 ----------
F_TITLE = "黑体"           # 大标题
F_HEAD  = "微软雅黑"        # 标题
F_BODY  = "宋体"            # 正文中文
F_ASCII = "Times New Roman" # 正文英文/数字/页码

ACCENT = RGBColor(0x36, 0x5F, 0x91)   # 标题蓝（沿用 v1.15）
ACCENT2 = RGBColor(0x4F, 0x81, 0xBD)  # 次级蓝

def set_run(r, text=None, size=10.5, bold=False, font=F_BODY, ascii_font=F_ASCII, color=None):
    if text is not None:
        r.text = text
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.name = font
    rPr = r._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:eastAsia'), font)
    rFonts.set(qn('w:ascii'), ascii_font)
    rFonts.set(qn('w:hAnsi'), ascii_font)
    if color is not None:
        r.font.color.rgb = color
    return r

def para(doc, text, size=10.5, bold=False, align=None, font=F_BODY, color=None,
         space_before=0, space_after=6, line=1.5, indent_first=None):
    p = doc.add_paragraph()
    if align is not None:
        p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if indent_first is not None:
        pf.first_line_indent = Pt(indent_first)
    set_run(p.add_run(), text, size=size, bold=bold, font=font, color=color)
    return p

def heading(doc, text, level=1):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    if level == 1:
        set_run(p.add_run(), text, size=16, bold=True, font=F_HEAD, color=ACCENT)
        pf.space_before = Pt(18); pf.space_after = Pt(10)
    elif level == 2:
        set_run(p.add_run(), text, size=13, bold=True, font=F_HEAD, color=ACCENT2)
        pf.space_before = Pt(12); pf.space_after = Pt(6)
    else:
        set_run(p.add_run(), text, size=11.5, bold=True, font=F_HEAD, color=RGBColor(0x33,0x33,0x33))
        pf.space_before = Pt(8); pf.space_after = Pt(4)
    # 大纲级别（供 TOC 识别）
    pPr = p._element.get_or_add_pPr()
    outline = OxmlElement('w:outlineLvl')
    outline.set(qn('w:val'), str(level-1))
    pPr.append(outline)
    return p

def add_caption(doc, text, size=9, bold=True):
    """图/表题注（图在下、表在上，均为居中）。"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(8)
    set_run(p.add_run(), text, size=size, bold=bold, font=F_HEAD, color=RGBColor(0x40,0x40,0x40))
    return p

def add_figure(doc, img_path, caption, width_cm=14.5):
    """插入图片 + 图题（题注在图下方）。"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run()
    run.add_picture(img_path, width=Cm(width_cm))
    add_caption(doc, caption)

def add_table_caption(doc, caption):
    """表题（在表上方），keep_with_next 保证与表格同页。"""
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.keep_with_next = True
    set_run(p.add_run(), caption, size=9, bold=True, font=F_HEAD, color=RGBColor(0x40,0x40,0x40))
    return p

def add_table(doc, header, rows, widths=None, caption=None):
    # 表题在表格【上方】：先插入题注，再插入表格
    if caption:
        add_table_caption(doc, caption)
    t = doc.add_table(rows=1+len(rows), cols=len(header))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    # 表头
    for j, h in enumerate(header):
        cell = t.rows[0].cells[j]
        cell.text = ""
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        set_run(p.add_run(), h, size=9.5, bold=True, font=F_HEAD)
        shd = OxmlElement('w:shd'); shd.set(qn('w:val'),'clear'); shd.set(qn('w:fill'),'DCE6F1')
        cell._element.get_or_add_tcPr().append(shd)
    # 数据行
    for i, row in enumerate(rows):
        for j, val in enumerate(row):
            cell = t.rows[i+1].cells[j]
            cell.text = ""
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT if j>0 and len(str(val))>12 else WD_ALIGN_PARAGRAPH.CENTER
            set_run(p.add_run(), str(val), size=9.5, font=F_BODY)
    # 所有行禁止行内拆分（cantSplit），表头跨页重复
    for r in t.rows:
        trPr = r._element.get_or_add_trPr()
        cantSplit = OxmlElement('w:cantSplit')
        trPr.append(cantSplit)
    # 表头行跨页重复
    trPr0 = t.rows[0]._element.get_or_add_trPr()
    tblHeader = OxmlElement('w:tblHeader'); tblHeader.set(qn('w:val'),'true')
    trPr0.append(tblHeader)
    return t

# ---------- 页脚页码（Times New Roman） ----------
def add_page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # 段落级字体（PAGE 域更新后继承此字体，保证数字为 Times New Roman）
    pPr = p._element.get_or_add_pPr()
    pRPr = pPr.find(qn('w:rPr'))
    if pRPr is None:
        pRPr = OxmlElement('w:rPr')
        pPr.append(pRPr)
    rFonts = pRPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        pRPr.append(rFonts)
    rFonts.set(qn('w:ascii'), F_ASCII)
    rFonts.set(qn('w:hAnsi'), F_ASCII)
    rFonts.set(qn('w:eastAsia'), F_ASCII)
    sz = pRPr.find(qn('w:sz'))
    if sz is None:
        sz = OxmlElement('w:sz'); pRPr.append(sz)
    sz.set(qn('w:val'), '18')  # 9pt = 18 half-points
    # 插入 PAGE 域
    run = p.add_run()
    fldChar1 = OxmlElement('w:fldChar'); fldChar1.set(qn('w:fldCharType'),'begin')
    instrText = OxmlElement('w:instrText'); instrText.set(qn('xml:space'),'preserve'); instrText.text = 'PAGE'
    fldChar2 = OxmlElement('w:fldChar'); fldChar2.set(qn('w:fldCharType'),'end')
    run._r.append(fldChar1); run._r.append(instrText); run._r.append(fldChar2)
    # run 级也设一遍（双保险）
    set_run(run, size=9, font=F_ASCII, ascii_font=F_ASCII)

# ============================================================
# 文档构建
# ============================================================
doc = Document()

# 页面设置 A4
sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.left_margin = Cm(2.2)
sec.right_margin = Cm(2.2)
sec.top_margin = Cm(2.4)
sec.bottom_margin = Cm(2.2)

# 默认样式
normal = doc.styles['Normal']
normal.font.name = F_ASCII
normal.font.size = Pt(10.5)
normal.element.rPr.rFonts.set(qn('w:eastAsia'), F_BODY)

# ============ 封面 ============
for _ in range(4):
    para(doc, "", space_after=0)
para(doc, "文 物 精 灵", size=40, bold=True, font=F_TITLE, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=8)
para(doc, "RELIC SOUL", size=16, bold=True, font=F_ASCII, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)
para(doc, "燕赵拾遗 · 数字文物图鉴", size=14, font=F_HEAD, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=30)
para(doc, "技 术 文 档", size=22, bold=True, font=F_TITLE, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)
para(doc, "Technical Documentation of the Relic Soul Project", size=11, font=F_ASCII, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=30)
para(doc, "让每一个中国文物，都鲜活起来。", size=12, font=F_HEAD, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=40)
for label, val in [
    ("文档类型", "项目技术文档"),
    ("项目名称", "文物精灵 · RELIC SOUL"),
    ("项目形态", "纯静态单页 Web 应用（HTML5 + CSS3 + 原生 JavaScript）"),
    ("技术主题", "AI 视觉识别 · 多模态大模型集成 · 端侧图像处理 · 国风交互设计"),
    ("文档页数", "30 页以内"),
    ("版本 / 日期", "V1.6 · 2026-11"),
]:
    para(doc, f"{label}：{val}", size=11, font=F_BODY, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=6, bold=False)

doc.add_page_break()

# ============ 目录页 ============
para(doc, "目  录", size=18, bold=True, font=F_TITLE, align=WD_ALIGN_PARAGRAPH.CENTER, space_after=16)
# 插入 TOC 域（Word 打开后 F9 更新）
p = doc.add_paragraph()
run = p.add_run()
fld = OxmlElement('w:fldChar'); fld.set(qn('w:fldCharType'),'begin'); fld.set(qn('w:dirty'),'true')
instr = OxmlElement('w:instrText'); instr.set(qn('xml:space'),'preserve')
instr.text = 'TOC \\o "1-2" \\h \\z \\u'
sep = OxmlElement('w:fldChar'); sep.set(qn('w:fldCharType'),'separate')
txt = OxmlElement('w:t'); txt.text = "（打开后按 F9 更新目录）"
end = OxmlElement('w:fldChar'); end.set(qn('w:fldCharType'),'end')
run._r.append(fld); run._r.append(instr); run._r.append(sep); run._r.append(txt); run._r.append(end)
set_run(run, size=10.5, font=F_BODY)

doc.add_page_break()

# ============ 摘要 ============
heading(doc, "摘 要", 1)
para(doc, "本文介绍「文物精灵（RELIC SOUL）」的设计与实现。系统以燕赵地区馆藏文物为对象，将文物知识组织为可收集、可对话、可对战的「精灵」形态，面向青少年与文博爱好者提供低门槛的文物科普入口。系统以原生 Web 技术实现，部署为纯静态站点，双击即可运行。", indent_first=21)
para(doc, "交付规模为：单页入口、40 个 JavaScript 模块、17 个样式表，合计 48,193 行代码（HTML 1,118 行、CSS 8,425 行、JavaScript 38,650 行），不依赖任何前端框架；数据层收录 104 只文物精灵、707 道题目、20 类属性、22 家博物馆；主线剧情含 117 个节点、4 种结局与 11 枚成就，工程侧配备 91 个构建与校验脚本，Git 提交 110 次。", indent_first=21)
para(doc, "在模型调用之外，系统另设三层自研结构。站内知识层将档案切分为 1,431 个片段并建立倒排索引，使生成内容可回溯到原文；内容层补充 8 组文物对比、30 条工艺词条、15 组易混器物辨析与 100 条真实提问语料，为检索与判卷提供可比对的结构化材料；评测台以 108 条带标注用例覆盖十个环节，任何人点击即可重跑，单次约 260 ms。三者共同构成「可回溯、可校验、可回归」的闭环。", indent_first=21)
para(doc, "AI 能力共 8 项，分云端与本机两条路径：识别、对话生成与图像生成调用云端大模型；复原、赋彩、判卷与海报合成以本机算法实现。为应对模型开通状态不可知的问题，系统实现候选模型顺序探测与缓存复用，云端不可用时自动降级至本机识别引擎，主流程不中断。相关测试、校验脚本与复现方式见第 6 章。", indent_first=21)
para(doc, "关键词：文物数字化；大模型应用；结构化输出校验；降级设计；原生 Web", size=10, bold=True)

doc.add_page_break()

# ============ 1 项目概述 ============
heading(doc, "1  项目概述", 1)

heading(doc, "1.1  项目背景", 2)
para(doc, "博物馆的说明牌是「静态」的：一件文物只对应一段文字，观众走马观花，很难真正「认识」它。青少年对传统文化的兴趣，往往停留在「看过」而非「记住」。本项目尝试用游戏化的方式重构博物馆叙事——把一件件馆藏文物，做成拥有姓名、朝代与脾气的「精灵」，让观众在收集、对战、对话中，主动走近文物。", indent_first=21)

heading(doc, "1.2  项目定位", 2)
para(doc, "「文物精灵」是一款面向青少年与文博爱好者的国风 Web 应用。它以「游戏化收集」为骨架，以「AI 多模态交互」为亮点，把严肃的文物知识转化为可玩、可感、可分享的体验。作品定位为「数字文物图鉴 + AI 互动工坊」的复合形态，既可用于馆校合作的科普教学，也可作为个人探索文博世界的入口。", indent_first=21)

heading(doc, "1.3  建设目标", 2)
para(doc, "本项目的建设目标有三：其一，构建覆盖全国 22 家博物馆、104 件文物的精灵化知识图鉴，让每一件文物都有姓名、有档案、有性格；其二，用 AI 打通「识宝 → 语音讲解 → 赋彩海报」的多模态闭环，让用户拍照即可与文物互动；其三，以一条贯穿全国的剧情主线（22 站、117 节点、4 结局）串联收集与探索，用叙事驱动学习动机。", indent_first=21)

heading(doc, "1.4  核心成果", 2)
para(doc, "项目交付的核心成果包括：① 104 只文物精灵图鉴与 20 类属性体系；② 覆盖 22 站的剧情主线与 11 枚成就的成就册；③ 8 项 AI 能力（识别、对话、图像生成、复原、赋彩、判卷、海报、随机事件）；④ 三层自研知识结构（知识层 / 内容层 / 评测台）；⑤ 全国大地图与河北路牌导航；⑥ 完整的测试脚本与可复现文档。", indent_first=21)

# ============ 2 需求分析 ============
heading(doc, "2  需求分析", 1)

heading(doc, "2.1  用户角色与场景", 2)
para(doc, "系统面向三类典型用户角色。其一为「青少年探索者」：以收集精灵、通关剧情为主要动机，需要低门槛的引导与即时的正反馈；其二为「文博爱好者」：关注文物的真实性、知识深度与可溯源性，需要严谨的档案与引用；其三为「教育工作者」：需要可复现、可验证的教学材料与评测工具。", indent_first=21)
add_table(doc,
    ["角色", "核心诉求", "对应功能"],
    [
        ["青少年探索者", "收集、通关、成就感", "精灵图鉴 / 剧情主线 / 成就册 / 对战捕捉"],
        ["文博爱好者", "知识真实、可溯源", "站内知识层 / [n] 引用 / 对比辨析"],
        ["教育工作者", "可复现、可评测", "评测台 / 校验脚本 / 复现指南"],
    ],
    caption="表 2-1  用户角色与功能映射")
para(doc, "典型使用场景为：用户在河北博物院前拍照一件青铜器，系统识别后给出年代、材质与馆藏线索，一键「听它亲口讲解」，再生成一张专属赋彩海报分享；或沿剧情主线从沧州出发，逐站捕捉精灵，最终抵达「华夏」站集齐图鉴。", indent_first=21)

heading(doc, "2.2  功能需求", 2)
para(doc, "功能需求按「知识获取」「互动玩法」「叙事驱动」三条线组织。知识获取线包含精灵图鉴浏览、属性检索、站内知识检索与引用溯源；互动玩法线包含 AI 识宝、AI 茶话会、文物修复拼图、AI 赋彩、打卡海报与心仪卡工坊；叙事驱动线包含 22 站剧情主线、支线任务、AI 随机事件与成就册。", indent_first=21)

heading(doc, "2.3  非功能需求", 2)
para(doc, "非功能需求强调四点：① 可用性——纯静态部署，双击即可运行，无需后端依赖；② 性能——首屏 JavaScript 体积削减 73%，核心模块具备 TypeScript 声明文件；③ 可靠性——云端模型不可用时自动降级至本机引擎，主流程不中断；④ 安全——大模型输出经多层校验与内容过滤，敏感信息不入公开仓库。", indent_first=21)

heading(doc, "2.4  技术约束与设计取舍", 2)
para(doc, "项目面临两个硬约束：其一，交付形态为纯静态站点，无法依赖服务端渲染或重型后端；其二，模型开通状态在评审环境不可预知，AI 能力必须设计降级路径。据此做出两项取舍：前端采用原生 JavaScript（零框架、零构建），以换取部署的极致简单；AI 层采用「云端优先、本机兜底」的双路架构，以换取可用性。", indent_first=21)

# ============ 3 系统架构设计 ============
heading(doc, "3  系统架构设计", 1)

heading(doc, "3.1  总体架构", 2)
para(doc, "系统采用分层架构，自上而下分为表现层、应用逻辑层、AI 能力层、数据层与部署层五层。表现层为单页应用（SPA），以哈希路由管理 16 个视图；应用逻辑层由 40 个原生 JavaScript 模块构成，负责游戏化叙事、玩法引擎与状态管理；AI 能力层按「云端 / 本机」双路组织；数据层承载知识索引、精灵档案与题库；部署层由 Nginx 静态站点与 Python MCP 网关组成。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "fig3_1_arch.png"), "图 3-1  系统总体架构")

heading(doc, "3.2  数据架构", 2)
para(doc, "数据层采用「底层数据源 + 三层自研结构」的组织方式。底层为 104 只精灵档案、707 道题目与 22 馆基础数据；其上叠加站内知识层（1431 片段 + 倒排索引）、内容层（对比 / 工艺 / 辨析 / 语料）与评测台（108 条用例）三层自研结构，构成「可回溯、可校验、可回归」的知识闭环。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "fig3_2_data.png"), "图 3-2  数据架构与三层自研结构")

heading(doc, "3.3  关键技术决策", 2)
add_table(doc,
    ["决策点", "方案", "理由"],
    [
        ["前端技术栈", "原生 JavaScript（零框架）", "纯静态部署，无需构建工具链"],
        ["AI 架构", "云端 + 本机双路", "模型不可用时降级，主流程不中断"],
        ["知识溯源", "站内索引 + [n] 角标", "生成内容可回溯到馆藏原文"],
        ["状态管理", "localStorage 存档", "无后端下实现进度持久化"],
        ["路由方案", "哈希路由 + data-page", "16 视图无刷新切换，成就页独立接管"],
    ],
    caption="表 3-1  关键技术决策")

# ============ 4 AI 技术方案 ============
heading(doc, "4  AI 技术方案", 1)

heading(doc, "4.1  AI 能力构成", 2)
para(doc, "系统共集成 8 项 AI 能力，按执行位置分为云端与本机两路。云端能力包括文物识别、对话生成与图像生成三项，调用第三方大模型；本机能力包括文物复原、赋彩、判卷、海报合成与端侧剪影识别五项，以算法实现。", indent_first=21)
add_table(doc,
    ["AI 能力", "执行位置", "技术要点"],
    [
        ["文物识别", "云端", "候选模型探测 + 端侧剪影识别兜底"],
        ["对话生成", "云端", "MCP 工具检索 + [n] 引用溯源"],
        ["图像生成", "云端", "海报 / 赋彩线稿合成"],
        ["文物复原", "本机", "去划痕 / 补缺口 / 恢复原色"],
        ["赋彩 / 判卷", "本机", "色彩迁移 + 规则判分"],
        ["海报合成", "本机", "Canvas 图层合成"],
    ],
    caption="表 4-1  AI 能力清单")

heading(doc, "4.2  关键技术选型依据", 2)
para(doc, "AI 技术选型遵循三条原则。其一，可靠性优先——采用候选模型顺序探测（19 个候选视觉模型），单模型超时自动切换下一候选，避免单点故障；其二，可溯源性——生成式回答一律通过 MCP 工具检索站内知识库，回答中的 [n] 角标可回查原文；其三，可复现性——评测台将 AI 质量做成可重跑的用例，任何改动可回归验证。", indent_first=21)

heading(doc, "4.3  AI 技术集成方式", 2)
para(doc, "AI 能力通过两层集成。工具层以 MCP（Model Context Protocol）协议暴露 8 个只读工具——站内检索（BM25）、双路召回（BM25 + LSA + RRF）、文物档案、文物对比、工艺查询、易混辨析、馆藏浏览与引用核验，模型可自主决定「查什么」。调度层实现候选模型顺序探测、缓存复用与超时控制（10 秒首字、28 秒收尾），确保云端抖动不影响体验。", indent_first=21)

heading(doc, "4.4  AI 能力流水线", 2)
para(doc, "一次完整的 AI 交互遵循统一流水线：用户输入经意图路由分流至云端或本机引擎；云端路径经候选模型探测生成结构化输出，本机路径以算法引擎直接处理；输出统一附加 [n] 引用角标并经覆盖率核验后呈现。云端不可用时，本机引擎与离线事件池接管，主流程不中断。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "fig4_1_ai.png"), "图 4-1  AI 能力流水线与降级路径")

heading(doc, "4.5  站内知识层：把内容变成可检索的证据", 2)
para(doc, "站内知识层将 104 只精灵的档案切分为 1,431 个片段，建立倒排索引。检索采用双路召回：BM25 关键词路负责精确字面匹配，LSA 语义路负责问法归一化，两者经 RRF（倒数排名融合）合并排序。每条命中都携带档案编号、文物名、字段与原文，供回答引用与溯源。", indent_first=21)

heading(doc, "4.6  识别流水线与档案对账", 2)
para(doc, "识别流水线采用「云端优先、端侧兜底」策略。云端识别返回候选结果后，与站内 104 只精灵档案做对账，取置信度与档案匹配度综合最优者；云端不可用时，降级至端侧剪影识别——基于 Hu 不变矩的形状匹配，离线可用、不联网。", indent_first=21)

heading(doc, "4.7  可验证生成：AI 出题的校验、修复与回退", 2)
para(doc, "AI 出题环节实现结构化输出校验。模型输出的题目经格式校验、答案一致性校验与知识库比对；校验失败时进入修复流程（重试或改写），仍失败则回退至站内预置题库。这一机制确保「AI 负责表达，事实由检索结果兜底」。", indent_first=21)

heading(doc, "4.8  评测台：把 AI 质量做成可重跑的用例", 2)
para(doc, "评测台以 108 条带标注用例覆盖十个环节（识别、对话、检索、判卷等），任何人点击即可重跑，单次约 260 毫秒。评测台将「AI 质量」这一模糊概念转化为可度量的用例通过率，为模型切换与 prompt 迭代提供回归依据。", indent_first=21)

heading(doc, "4.9  工具层与 Agent：把「查什么」交给模型", 2)
para(doc, "工具层通过 MCP 协议实现 Agent 化的「规划 → 检索 → 反思」流程。模型收到提问后，自主规划需要调用哪些工具、以什么参数检索，检索结果返回后基于证据作答。引用核验工具在输出前检查 [n] 角标是否都能回查档案，形成「提问 → 检索 → 作答 → 核验」的闭环。", indent_first=21)

heading(doc, "4.10  备选方案与取舍", 2)
para(doc, "在方案演进中，曾评估两种备选路线。其一为「全云端」——所有 AI 能力都调大模型，实现简单但依赖性强、成本高、延迟不稳定；其二为「全本机」——所有能力本地算法实现，可离线但准确率与表达能力有限。最终采用「云端优先、本机兜底」的混合方案，兼顾能力上限与可用性。", indent_first=21)

heading(doc, "4.11  模型输出的多层校验", 2)
para(doc, "模型输出经三层校验。第一层为格式校验，确保结构化输出符合预期 schema；第二层为内容校验，核对答案与知识库的一致性、引用角标的有效性；第三层为安全过滤，拦截不当内容。三层校验共同保证生成内容的可靠与合规。", indent_first=21)

heading(doc, "4.12  效果评估与已知局限", 2)
para(doc, "系统的能力边界明确：本机识别引擎基于色彩、轮廓与纹理的规则判别，准确率低于云端模型；生成式内容存在不确定性，虽有多层校验但仍可能出现事实偏差。相关局限在系统内以「可信度提示」方式向用户明示。", indent_first=21)

# ============ 5 核心功能实现 ============
heading(doc, "5  核心功能实现", 1)

heading(doc, "5.1  开场画卷与首屏统计", 2)
para(doc, "首屏以「山河长卷」国风画卷呈现，顶部为品牌标题与精灵总览，中部为四格统计条（104 件国宝 / 22 个打卡站 / 20 种属性 / 成就入口），底部为栏目入口。统计条第四格作为成就册入口，点击跳转独立成就页。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "01_home.png"), "图 5-1  首页山河长卷", width_cm=13.5)

heading(doc, "5.2  全国大地图与河北路牌", 2)
para(doc, "全国大地图以省级边界 + 站点图钉呈现 22 个打卡站，河北境内叠加「路牌」形制标签（牌面 + 镇馆器物图标 + 站名）。路牌按牌面矩形做 8 方向避让，窄屏自动收图标降字号，点牌跳转对应站点。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "02_map.png"), "图 5-2  全国大地图与路牌", width_cm=13.5)

heading(doc, "5.3  属性体系与精灵数据模型", 2)
para(doc, "每只精灵具备主属性（材质）与副属性（用途）双维度分类：主属性 10 类（青铜器、金银器、陶瓷器、玉器、石雕石刻、漆器、纺织品、竹木牙角器、书画、玻璃器），副属性 10 类（生活用具、陪葬明器、礼器、文献档案、印章、乐器、生产工具、宗教文物、兵器、货币），合计 20 类属性。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "04_spirit.png"), "图 5-3  属性图鉴", width_cm=13.5)

heading(doc, "5.4  答题对战与捕捉机制", 2)
para(doc, "捕捉精灵采用答题对战机制：用户回答文物相关题目，答对即「捕捉」该精灵。题目来源为站内 707 道题库与 AI 出题两条路径，AI 出题经结构化校验后入库。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "03_codex.png"), "图 5-4  精灵图鉴与捕捉", width_cm=13.5)

heading(doc, "5.5  AI 文物识别（拍照 → 讲解 → 海报）", 2)
para(doc, "AI 识宝支持拍照或上传图片，云端模型识别后给出年代、材质与馆藏线索；识别结果附「端侧剪影识别」离线兜底。识别后可一键「听它亲口讲解」（语音合成）并「生成专属赋彩海报」，串成「识宝 → 语音 → 海报」的多模态闭环。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "05_ident.png"), "图 5-5  AI 识宝", width_cm=13.5)

heading(doc, "5.6  AI 精灵茶话会", 2)
para(doc, "茶话会以文物第一人称实时对话，回答经 MCP 工具检索站内知识库并附 [n] 引用角标。对话采用逐字铺开与实时思考态呈现，云端不可用时降级至本机事件池，断网亦可应答。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "06_tea.png"), "图 5-6  AI 茶话会", width_cm=13.5)

heading(doc, "5.7  AI 打卡海报与心仪卡", 2)
para(doc, "打卡海报与心仪卡工坊提供国风可保存分享的视觉产出。海报以 Canvas 图层合成（底纹 + 立绘 + 文案 + 印章），心仪卡支持调色与典藏卡样式。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "09_poster.png"), "图 5-7  打卡海报", width_cm=13.5)

heading(doc, "5.8  AI 文物修复（拼图）与赋彩", 2)
para(doc, "文物修复将文物切成 16 / 32 / 64 块打乱后拼回，空白碎片不计入进度；AI 赋彩对 36 幅黑白线稿上色，支持逐笔涂抹与成品保存。两者均以本机算法实现，离线可用。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "07_dye.png"), "图 5-8  AI 赋彩", width_cm=13.5)

heading(doc, "5.9  剧情主线与流程锁定", 2)
para(doc, "剧情主线为 22 站、117 节点、4 种结局的叙事网络。流程采用「逐级解锁」机制：初始仅「启程 · 七友相送」可进入，走一步亮一步，未解锁节点呈锁定态且不可进入；隐藏结局需满足「支线 + 问话合计三次」的门槛才点亮。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "13_vnmap.png"), "图 5-9  剧情主线流程图", width_cm=13.5)

heading(doc, "5.10  成就册", 2)
para(doc, "成就册为独立页面，11 枚成就全部读取站内真实进度（入册、初入燕赵、一站到底、十一城记、九州行、见器知性、半壁、满架、说书人、四种收梢、走遍二十二站），不另存状态。小像为合成图——国风底纹叠加精灵立绘与暖光暗角，未收录成就以灰度呈现。", indent_first=21)
add_figure(doc, os.path.join(IMG_DIR, "11_achieve.png"), "图 5-10  成就册独立页", width_cm=13.5)

# ============ 6 测试与部署 ============
heading(doc, "6  测试与部署", 1)

heading(doc, "6.1  测试策略", 2)
para(doc, "测试策略覆盖三个层次：单元层以 node --check 校验 40 个 JavaScript 模块的语法正确性；结构层以脚本校验主线节点图（117 节点 / 22 站 / 4 结局的连通性与完整性）；运行时层以无头浏览器逐路由巡检 16 个视图的 JavaScript 异常与资源加载。", indent_first=21)

heading(doc, "6.2  自动化自检", 2)
para(doc, "工程侧配备 91 个构建与校验脚本，覆盖语法检查、主线结构校验、运行时断言、线上资源巡检（202 个资源 HTTP 全量检查）、线上线下 MD5 逐字节比对等。2026-11-11 自检结果：40 模块语法全通过、主线校验全通过、线上资源 0 个 404、16 路由 0 异常。", indent_first=21)
add_table(doc,
    ["自检项", "方法", "结果"],
    [
        ["JS 语法", "node --check × 40 模块", "全部通过"],
        ["主线结构", "结构校验脚本", "117 节点 / 22 站 / 4 结局通过"],
        ["线上资源", "HTTP 全量巡检", "202 资源 0 个 404"],
        ["运行时", "无头浏览器逐路由", "16 路由 0 JS 异常"],
        ["一致性", "MD5 逐字节比对", "本地线上一致"],
    ],
    caption="表 6-1  自检清单与结果")

heading(doc, "6.3  功能测试", 2)
para(doc, "功能测试按「知识获取」「互动玩法」「叙事驱动」三条线逐项验证，覆盖识宝闭环、对话溯源、拼图修复、赋彩、海报、主线解锁、成就册点亮等关键路径，桌面 1440px 与手机 390px 双端均验证通过。", indent_first=21)

heading(doc, "6.4  部署方式与运行环境", 2)
para(doc, "系统部署为纯静态站点，由 Nginx 托管并提供 HTTPS，配合 Python MCP 网关提供工具服务。线上地址可公网访问（详见提交材料中的在线演示链接），评审期间保持可用。", indent_first=21)

heading(doc, "6.5  安全与合规", 2)
para(doc, "安全合规遵循三条原则：API 密钥通过环境变量配置，不写入公开仓库；大模型输出经内容过滤；文物知识内容尊重馆藏事实，不虚构史实。", indent_first=21)

# ============ 7 创新点说明 ============
heading(doc, "7  创新点说明", 1)

heading(doc, "7.1  技术创新点", 2)
para(doc, "技术创新集中在四点：其一，三层自研知识结构（知识层 + 内容层 + 评测台）构成「可回溯、可校验、可回归」的闭环，将生成式内容锚定在馆藏事实上；其二，MCP 工具层 + Agent 化的「规划 → 检索 → 反思」流程，让模型自主决定「查什么」；其三，云端 / 本机双路降级架构，模型不可用时主流程不中断；其四，候选模型顺序探测与缓存复用，规避单点故障。", indent_first=21)

heading(doc, "7.2  应用创新点", 2)
para(doc, "应用创新体现在叙事与体验设计：其一，22 站剧情主线以「先露伤口再给知识」的叙事策略重写，每站确立一个题眼，用情感驱动知识记忆；其二，玩家家乡身份的引入，走到家乡站触发「家门口的质问」，让「青年对家乡文物失联」的议题砸在玩家身上；其三，隐藏结局「此页无字，有手印一枚」，以留白式设计传递「看见比拥有更重要」的立意；其四，成就册的「空格子」设计——11 枚成就留出第 12 格空白，以「等你回来落笔」呼应收集未完的期待。", indent_first=21)

heading(doc, "7.3  创新点小结", 2)
add_table(doc,
    ["类别", "创新点", "价值"],
    [
        ["技术", "三层自研知识结构", "生成内容可回溯、可校验"],
        ["技术", "MCP 工具层 + Agent", "模型自主决定检索策略"],
        ["技术", "双路降级架构", "模型不可用主流程不中断"],
        ["应用", "剧情叙事重写", "情感驱动知识记忆"],
        ["应用", "玩家家乡身份", "议题落地、共情强化"],
        ["应用", "成就册空格子", "留白式叙事设计"],
    ],
    caption="表 7-1  创新点汇总")

# ============ 8 总结与展望 ============
heading(doc, "8  总结与展望", 1)

heading(doc, "8.1  项目总结", 2)
para(doc, "「文物精灵」以原生 Web 技术实现了覆盖全国 22 馆、104 件文物的精灵化图鉴，并以 8 项 AI 能力、三层自研知识结构与一条贯穿全国的剧情主线，完成了「让文物活起来」的产品闭环。项目在技术深度（AI 集成、知识溯源、降级设计）与内容厚度（22 站叙事、成就体系）两个维度均达到既定目标。", indent_first=21)

heading(doc, "8.2  不足与改进方向", 2)
para(doc, "项目仍存在三处不足：其一，前端采用原生 JavaScript，虽利于部署但工程化程度有限，模块间类型约束依赖人工维护；其二，本机识别引擎准确率低于云端模型，端侧体验有待提升；其三，缺乏真实用户数据，商业化路径尚待验证。", indent_first=21)

heading(doc, "8.3  后续展望", 2)
para(doc, "后续将沿三条线演进：内容侧继续扩充馆藏覆盖面与剧情深度；技术侧引入 TypeScript 与构建工具链，提升工程化水平；应用侧探索馆校合作与商业落地的可能路径。", indent_first=21)

# ---------- 页脚页码 ----------
add_page_number_footer(sec)

doc.save(OUT_DOCX)
print("已生成", OUT_DOCX)
print("段落数", len(doc.paragraphs), "表格数", len(doc.tables))
