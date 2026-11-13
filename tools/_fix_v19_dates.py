# -*- coding: utf-8 -*-
"""v1.19 定版：去掉 4.15 与表 4-6 的时间，表 4-6 删去「自评」列与合计行。"""
import sys

import docx
from docx.oxml.ns import qn
from docx.shared import Cm

PATH = r"C:/Users/lenovo/Desktop/文物精灵网站/01-技术文档-文物精灵-v1.19.docx"

d = docx.Document(PATH)


def set_text(p, text):
    if p.runs:
        p.runs[0].text = text
        for r in p.runs[1:]:
            r.text = ""
    else:
        p.add_run(text)


def delete_col(tb, idx):
    grid = tb._tbl.tblGrid
    cols = grid.findall(qn("w:gridCol"))
    if idx < len(cols):
        cols[idx].getparent().remove(cols[idx])
    for row in tb.rows:
        row._tr.remove(row.cells[idx]._tc)


# ---- 1) 4.15 标题去日期 ----
h = None
for p in d.paragraphs:
    if p.style.name == "Heading 2" and p.text.strip().startswith("4.15"):
        h = p
        break
if not h:
    sys.exit("未找到 4.15 标题")
old = h.text
set_text(h, old.replace("（2026-11-10）", "").replace("(2026-11-10)", "").strip())
print("✓ 4.15 标题:", h.text)

# ---- 2) 正文去日期与自评表述 ----
intro = None
for p in d.paragraphs:
    if p.text.startswith("本节记录") and "复测结果" in p.text:
        intro = p
        break
if not intro:
    sys.exit("未找到 4.15 引言段")
NEW = (
    "本节记录省赛前的收口工作与复测结果。此前系统的 AI 能力集中在外围工具（识别、茶话会、赋彩），"
    "主线仍为「到站 → 报年代 → 文物提示抵达」的线性流程，AI 能力与叙事内容相互独立、未形成耦合。"
    "本轮将 AI 能力嵌入主线流程，并将叙事内容重构为可收集的结构化数据，并补齐地图与成就两处长期缺口。"
    "所有数字取自本地仓库与线上站点，可按本节末尾命令复现；表 4-6 为按省赛细则逐项的对照与实测证据。"
)
set_text(intro, NEW)
print("✓ 4.15 引言:", intro.text[:60], "...")

# ---- 3) 表题去时间与自评 ----
cap = None
for p in d.paragraphs:
    if p.text.strip().startswith("表 4-6"):
        cap = p
        break
if not cap:
    sys.exit("未找到表 4-6 题注")
set_text(cap, "表 4-6　省赛六维评分对照与实测证据")
print("✓ 表题:", cap.text)

# ---- 4) 表格：删合计行 → 删自评列 → 改表头 → 重排列宽 ----
tb = None
for t in d.tables:
    if len(t.columns) == 4 and t.rows[0].cells[0].text.strip().startswith("评分项"):
        tb = t
        break
if not tb:
    sys.exit("未找到表 4-6")

# 4.1 删合计行
for row in list(tb.rows):
    if row.cells[0].text.strip() == "合计":
        tb._tbl.remove(row._tr)
        print("✓ 删除合计行（含 88.3 自评加权）")

# 4.2 删自评列（第 2 列）
delete_col(tb, 1)
print("✓ 删除「自评」列，剩余列数:", len(tb.columns))

# 4.3 表头去日期
hd = tb.rows[0].cells[2]
set_text(hd.paragraphs[0], "实测证据")
print("✓ 表头:", [c.text.strip() for c in tb.rows[0].cells])

# 4.4 列宽重排
tb.autofit = False
ws = [Cm(3.7), Cm(4.8), Cm(8.5)]
for row in tb.rows:
    for j, c in enumerate(row.cells):
        c.width = ws[j]
print("✓ 列宽:", [round(c.width.cm, 2) for c in tb.rows[0].cells])

d.save(PATH)
print("\n已保存:", PATH)
