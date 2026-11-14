# -*- coding: utf-8 -*-
"""在 4.15 末尾插入「线上验证」段（不改章节结构，控制页数）"""
import copy, docx
from docx.text.paragraph import Paragraph

P = r'C:/Users/lenovo/Desktop/文物精灵网站/01-技术文档-文物精灵-v1.19.docx'
d = docx.Document(P)

KEY = '线上验证：'
if any(KEY in p.text for p in d.paragraphs):
    print('已存在，跳过')
else:
    anchor = None
    for p in d.paragraphs:
        if p.text.strip().startswith('node tools/_check_vn.js'):
            anchor = p
            break
    if anchor is None:
        raise SystemExit('未找到锚点')

    # 复制 4.15 正文段的格式（Normal，带首行缩进）
    tpl = None
    for p in d.paragraphs:
        if p.text.strip().startswith('叙事层：22 站按'):
            tpl = p
            break
    if tpl is None:
        raise SystemExit('未找到模板段')

    new_el = copy.deepcopy(tpl._p)
    anchor._p.addnext(new_el)
    np = Paragraph(new_el, anchor._parent)

    # 清空所有 run，只留第一个承载文本
    runs = np.runs
    for r in runs[1:]:
        r._element.getparent().remove(r._element)
    txt = ('线上验证：以上结论无需本地部署即可核验。浏览器打开 '
           'https://123.57.21.18/#/ident 上传任意文物立绘，端侧引擎在浏览器内完成推理，'
           '结果卡片会标注推理后端与置信度；打开 https://123.57.21.18/#/arena 选择'
           '「查无此物」组任一题，右侧管线明确弃答并说明档案中无此器物；'
           '打开 https://123.57.21.18/#/eval 点击「重跑」，可复现本期金标集的通过率。'
           '三处均为线上实时运行，非静态截图。')
    runs[0].text = txt
    runs[0].bold = False
    print('插入完成，字数', len(txt))

d.save(P)
print('saved')
