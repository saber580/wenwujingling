# -*- coding: utf-8 -*-
"""v1.19 收尾：统一站数口径 23 站 -> 22 站（隐藏第零站单独注明）。"""
import sys

import docx

PATH = r"C:/Users/lenovo/Desktop/文物精灵网站/01-技术文档-文物精灵-v1.19.docx"

d = docx.Document(PATH)
fixed = 0

# 第 1 处：8.1 项目总结「建成覆盖 23 站」
for p in d.paragraphs:
    if p.text.startswith("▪ 内容方面：建成覆盖") and "23 站" in p.text:
        for r in p.runs:
            if "23" in r.text:
                r.text = r.text.replace("23", "22")
        fixed += 1
        print("  ✓ 8.1 项目总结：23 站 -> 22 站")

    # 第 2 处：8.1「当前 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）」
    if p.text.startswith("当前") and "23 站结构" in p.text:
        for r in p.runs:
            if "23" in r.text:
                r.text = r.text.replace("23", "22")
            elif r.text.strip() == "+":
                r.text = "，另有"
        fixed += 1
        print("  ✓ 8.1 结构说明：23 站 -> 22 站（，另有隐藏「华夏」站）")

# 表格里也扫一遍
for tb in d.tables:
    for row in tb.rows:
        for cell in row.cells:
            for p in cell.paragraphs:
                if "23 站" in p.text:
                    for r in p.runs:
                        if "23" in r.text:
                            r.text = r.text.replace("23", "22")
                    fixed += 1
                    print("  ✓ 表格：23 站 -> 22 站 |", p.text[:40])

if fixed == 0:
    print("  ! 未找到需要修正的「23 站」")
    sys.exit(1)

d.save(PATH)
print("\n已保存:", PATH)

# ---- 复核 ----
d2 = docx.Document(PATH)
full = "\n".join(p.text for p in d2.paragraphs)
for tb in d2.tables:
    for row in tb.rows:
        for cell in row.cells:
            full += "\n" + cell.text
print("复核：'23 站' 剩余", full.count("23 站"), "次 | '22 站' 共", full.count("22 站"), "次")
