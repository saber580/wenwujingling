# -*- coding: utf-8 -*-
"""v1.19 定版后的最小补充：把「对照实测 · 问倒它」写进已有证据，不新增页。

为什么是最小改动而不是新增一节：
    文档在 29 页，赛程上限 30 页，只剩一页余量。对照台的证据
    （可核 0/3 vs 6/6、查无此物弃答）正好落在表 4-6「AI 安全与可控」这一项上，
    补进那一格的实测证据即可，不动章节结构、不新增图表。

幂等：已经补过就跳过，可反复执行。
用法：python tools/_fix_v19_arena.py
"""
import copy
import os
import sys

import docx

DOC = r"C:/Users/lenovo/Desktop/文物精灵网站/01-技术文档-文物精灵-v1.19.docx"

T_CELL = "；引号点名档案外器物 → 弃答 5/5"
T_PARA = ("另设「对照实测 · 问倒它」页（#/arena），把同一个问题并排交给裸模型与本站管线："
          "冷门文物裸模型硬数据可核 0/3、本站 6/6，查无此物 2 ms 弃答，错误前提两栏均先纠正"
          "（照实显示，不挑题目）。")


def add_run_like(p, text):
    """沿用段落最后一个 run 的中英文字体与字号，避免补充句在版面上突兀"""
    last = p.runs[-1]
    r = p.add_run(text)
    r.font.name = last.font.name
    r.font.size = last.font.size
    r.font.bold = False
    rPr = last._element.rPr
    if rPr is not None:
        W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        for tag in ("rFonts", "szCs"):
            el = rPr.find(W + tag)
            if el is not None:
                r._element.get_or_add_rPr().append(copy.deepcopy(el))
    return r


def main():
    if not os.path.exists(DOC):
        sys.exit("找不到文档：%s" % DOC)
    d = docx.Document(DOC)
    done = []

    # ① 表 4-6「AI 安全与可控」的实测证据补一句
    tb = d.tables[12]
    cell = tb.rows[6].cells[2]
    if "弃答 5/5" in cell.text:
        done.append("表 4-6 已有，跳过")
    else:
        add_run_like(cell.paragraphs[-1], T_CELL)
        done.append("表 4-6 已补：弃答 5/5")

    # ② 4.15 正文补一句指向对照台
    par = None
    for p in d.paragraphs:
        if p.text.strip().startswith("叙事层") and "AI 玩法层" in p.text:
            par = p
            break
    if par is None:
        sys.exit("找不到 4.15 的「叙事层…AI 玩法层」段落，文档结构变了，请人工确认")
    if "#/arena" in par.text:
        done.append("4.15 已有，跳过")
    else:
        add_run_like(par, T_PARA)
        done.append("4.15 已补：对照实测一句")

    d.save(DOC)
    for x in done:
        print("·", x)
    print("\n下一步：python tools/export_techdoc_pdf.py  # 页数应仍为 29")


main()
