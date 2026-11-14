# -*- coding: utf-8 -*-
"""技术文档 v1.17 → v1.18：标题全黑 + 口语化表述改为专业术语 + 排版微调。"""
import docx
from docx.shared import Pt, Cm, RGBColor
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.17.docx"
DST = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.18.docx"

d = docx.Document(SRC)

# ================================================================
# ① 标题颜色：蓝色 → 黑色
# ================================================================
BLACK = RGBColor(0, 0, 0)
# 样式级蓝色
style_fixed = 0
for name in ['Heading 1', 'Heading 2', 'Heading 3', 'Title', 'Subtitle']:
    try:
        st = d.styles[name]
        st.font.color.rgb = BLACK
        style_fixed += 1
    except KeyError:
        pass
print(f"① 样式级标题颜色改黑：{style_fixed} 个样式")

# run 级蓝色（5.9~5.12 四个 Heading 2）
run_fixed = 0
for p in d.paragraphs:
    for r in p.runs:
        if r.font.color and r.font.color.rgb and str(r.font.color.rgb) in ('4F81BD', '365F91', '17365D'):
            r.font.color.rgb = BLACK
            run_fixed += 1
print(f"① run 级标题颜色改黑：{run_fixed} 处")

# ================================================================
# ② 口语化 / 拟人化表述 → 专业术语
# ================================================================
def sub_para(p, old, new):
    if old not in p.text:
        return False
    full = p.text.replace(old, new)
    runs = p.runs
    if runs:
        runs[0].text = full
        for r in runs[1:]:
            r.text = ""
    else:
        p.add_run(full)
    return True

PRO_REWRITE = [
    # ---- 5.9 剧情主线与逐级解锁 ----
    ("引导用户「走一步、亮一步」；隐藏结局的门槛是「支线完成数 + 向文物提问次数 ≥ 3」",
     "以此实现渐进式节点解锁；隐藏结局的触发条件为「支线完成数 + 向文物提问次数 ≥ 3」"),
    ("每站三条道选一只结缘、各配一条手写支线",
     "每站设置三条叙事路径供玩家择一结缘，并各配一条手写支线"),
    # ---- 5.11 成就册 ----
    ("三列布局空出的第 12 格不删，写成「这一格空着，等你回来落笔」，把「未完成」变成叙事的一部分。",
     "三列布局下空出的第 12 格予以保留，并以「这一格空着，等你回来落笔」作为占位文案，将「未达成」纳入叙事表达。"),
    # ---- 5.12 内容创作拓展 ----
    ("拟人漫画则把文物交给 AI 画成「会抱怨、会认路的打工人」",
     "拟人漫画则将文物交由 AI 生成人格化的职业设定形象"),
    ("两者共同把厚重的历史叙事转化为可玩、可分享的个性化表达。",
     "两者共同将厚重的历史叙事转化为具备可玩性与可分享性的个性化表达。"),
    # ---- 4.14 记录章节 ----
    ("主线仍是一条「到站 → 报年代 → 文物说你来了」的线性流程，AI 与叙事是两张皮",
     "主线仍为「到站 → 报年代 → 文物提示抵达」的线性流程，AI 能力与叙事内容相互独立、未形成耦合"),
    ("把 AI 放进主线，把叙事做成可收集的结构",
     "将 AI 能力嵌入主线流程，并将叙事内容重构为可收集的结构化数据"),
    # ---- 摘要与全文通用口语 ----
    ("让每一个中国文物，都鲜活起来。", "让每一件中国文物，都鲜活起来。"),
]

rewritten = 0
for p in d.paragraphs:
    for old, new in PRO_REWRITE:
        if old in p.text:
            if sub_para(p, old, new):
                rewritten += 1
print(f"② 专业术语改写：{rewritten} 处")

# 对未匹配项做兜底报告（帮助定位）
unmatched = []
for old, new in PRO_REWRITE:
    found = any(old in p.text for p in d.paragraphs)
    if not found:
        unmatched.append(old[:30])
if unmatched:
    print("② 未匹配（需检查）：")
    for u in unmatched:
        print("   -", u)

# ================================================================
# ③ 排版微调
# ================================================================
# 标题段前距保持紧凑（继承 v1.17 已设），确保不超页
print("③ 排版：沿用 v1.17 紧凑排版参数，未增内容")

d.save(DST)
print("已保存", DST, "段落数", len(d.paragraphs))
