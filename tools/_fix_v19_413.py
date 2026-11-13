# -*- coding: utf-8 -*-
"""v1.19 收尾 2：4.13 补一段端侧方案选型权衡（为什么不用现成框架）。"""
import copy

import docx
from docx.text.paragraph import Paragraph

PATH = r"C:/Users/lenovo/Desktop/文物精灵网站/01-技术文档-文物精灵-v1.19.docx"
TEXT = (
    "选型阶段对比过三条现成路径：Transformers.js（以 ONNX Runtime Web 为后端）加载 CLIP 类视觉编码器、"
    "TensorFlow.js 的 MobileNet 迁移学习、ONNX Runtime Web 直接加载轻量 CNN。三者的权重都在 3~10 MB 量级，"
    "弱网与离线场景下的首屏等待和流量成本都不可接受；加之本站每类仅一张模板图，微调 CNN 极易过拟合到单样本的渲染细节。"
    "因此放弃「加载现成模型」，改走「零权重 + 现场训练」的手写管线：全部代码 31.8 KB，预热 1.6~1.8 秒，"
    "代价是特征工程必须自己做扎实——这正是 4.13.1 与 4.13.2 两节的内容。"
)

d = docx.Document(PATH)
paras = d.paragraphs

idx = None
for i, p in enumerate(paras):
    if p.style.name == "Heading 3" and p.text.strip().startswith("4.13.1"):
        idx = i
        break
if idx is None:
    raise SystemExit("未找到 4.13.1 标题")

# 已插入过则跳过
if "Transformers.js" in "".join(p.text for p in paras):
    print("  ! 已存在选型段落，跳过")
    raise SystemExit(0)

intro = paras[idx - 1]
new_xml = copy.deepcopy(intro._p)
paras[idx]._p.addprevious(new_xml)
newp = Paragraph(new_xml, paras[idx]._parent)

# 只留一个 run 并换文
for r in list(newp.runs)[1:]:
    r._r.getparent().remove(r._r)
if newp.runs:
    newp.runs[0].text = TEXT
else:
    newp.add_run(TEXT)

print("  ✓ 已在 4.13 引言后插入选型段")
print("  预览:", newp.text[:80], "...")

d.save(PATH)
print("已保存:", PATH)
