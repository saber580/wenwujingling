# -*- coding: utf-8 -*-
"""技术文档 v1.15 → v1.16（增量补充版，修正插入顺序 + 压缩页数）。"""
import docx
from docx.shared import Pt, Cm
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.15.docx"
DST = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.16.docx"
IMG = r"C:\Users\lenovo\Desktop\文物精灵网站\_文档素材"

d = docx.Document(SRC)

# ============ ⓪-0 微调页边距（下边距 1.1 → 0.9cm，腾出末页） ============
for sec in d.sections:
    sec.bottom_margin = Cm(0.9)
print("⓪-0 下边距 1.1 → 0.9cm")

# ============ ⓪ 全文行距收紧（腾出页数，不删内容） ============
# 正文主体段落 1.12 → 1.0（单倍行距），省约 2 页
tight = 0
for p in d.paragraphs:
    if p.style.name != 'Normal':
        continue
    pf = p.paragraph_format
    if pf.line_spacing and abs(pf.line_spacing - 1.120833333) < 1e-6:
        pf.line_spacing = 1.0
        tight += 1
print(f"⓪ 行距收紧：{tight} 个正文段落 1.12 → 1.0")

# ============ ① 数据一致性替换 ============
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

REPL = {67: [("Git 提交 109 次", "Git 提交 112 次")],
        97: [("109 次 Git 提交", "112 次 Git 提交")]}
miss = []
for idx, pairs in REPL.items():
    for old, new in pairs:
        if not sub_para(d.paragraphs[idx], old, new):
            miss.append((idx, old))
print("① 数字替换:", "全部命中" if not miss else f"未命中 {miss}")

# ============ ①b 精简第 8 章展望（腾 1 页，不动核心内容） ============
TRIM = {
    "当前的 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）、20 类属性体系与数据驱动的架构，天然支持地域与内容的横向扩展。在保持「地域叙事」特色的同时，可以逐步接入更多省份的博物馆资源，形成以省为单元、以历史时间轴为纵深的中华文物数字图谱。":
    "当前的 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）与数据驱动架构，天然支持横向扩展，可逐步接入更多省份馆藏，形成以省为单元、以历史时间轴为纵深的中华文物数字图谱。",
    "「拍照识别 → 唤醒精灵 → 收进图鉴」的路径已完成验证。下一步可与博物馆合作，在展厅部署专属二维码与 AR 打卡点，实现线上收集与线下参观的打通——观众进入展厅后用手机扫描展签，文物精灵即从展柜中「苏醒」并加入图鉴。这将成为一种新的观展体验。":
    "「拍照识别 → 唤醒精灵 → 收进图鉴」的路径已完成验证。下一步可与博物馆合作，在展厅部署二维码与 AR 打卡点，观众扫码后文物精灵即从展柜中「苏醒」并加入图鉴，打通线上收集与线下参观。",
    "项目已具备 AI 识别、AI 赋彩、AI 茶话会、AI 海报、AI 幻化等多项生成能力，本质上已是一个小型文化创作工具集。未来可进一步开放 UGC 能力——允许用户为文物创作故事、参与精灵形象设计、分享自己的打卡作品，让文物传播从「官方单向输出」转向「用户共同参与」。":
    "项目已具备 AI 识别、赋彩、茶话会、海报、幻化等多项生成能力，本质上已是一个小型文化创作工具集。未来可开放 UGC 能力——允许用户为文物创作故事、参与形象设计、分享打卡作品，让传播从「官方单向输出」转向「用户共同参与」。",
}
trim_done = 0
for p in d.paragraphs:
    for old, new in TRIM.items():
        if p.text.strip() == old:
            sub_para(p, old, new)
            trim_done += 1
print(f"①b 展望精简：{trim_done} 段")

# ============ ①c 精简 8.1 项目总结（合并 bullet + 删引言，腾行） ============
TRIM2 = {
    "「文物精灵」以河北燕赵文物为内容基座，构建了集「打卡收集—答题对战—AI 识别—内容创作」于一体的国风数字图鉴网页。项目在三个方面达到预期目标：":
    None,
    "▪ 建成了覆盖 23 个站点、104 只精灵、20 类属性、707 道题的完整内容体系；":
    "▪ 内容方面：建成覆盖 23 站、104 只精灵、20 类属性、707 道题的完整内容体系，每只精灵均具备来历、知识库、回忆漫画与自述题库，且数据与逻辑严格分离、可自动校验；",
    "▪ 每只精灵均具备各自的来历、知识库、回忆漫画与自述题库，内容深度足以支撑多轮游玩；":
    None,
    "▪ 数据与逻辑严格分离，并配备自动校验脚本，后续扩充内容的边际成本接近为零。":
    None,
    "▪ 落地了 8 项 AI 能力，覆盖视觉识别、文本生成、图像生成、图像处理、智能交互五个方向；":
    "▪ 技术方面：落地 8 项 AI 能力，覆盖视觉识别、文本生成、图像生成、图像处理、智能交互五个方向，每项均做「云端 + 本机」两套实现；并自研本机识别引擎与复原算法，实现三级密钥读取链与自动择优机制，联网与否均可使用；",
    "▪ 每项 AI 功能都做了「云端 + 本机」两套实现，联网与否都能正常使用；":
    None,
    "▪ 自研本机识别引擎（背景剔除 + 加权色相 + 归一化比对）与本机复原算法（分级饱和度补偿 + 邻域修补 + 双线性超分），在无网络、无密钥条件下依然提供真实算法输出；":
    None,
    "▪ 实现三级密钥读取链与自动择优机制，同时满足安全合规与演示灵活性的双重约束。":
    None,
    "▪ 以中国红、鎏金、宣纸为基调，构建五套纯程序绘制的国风动态背景与属性驱动的纹样系统；":
    "▪ 体验方面：以中国红、鎏金、宣纸为基调，构建五套纯程序绘制的国风动态背景与属性驱动的纹样系统，开场画卷、2D 对战舞台、茶话会气泡等环节均做了仪式化设计，并坚持「零配置可运行」；",
    "▪ 开场画卷、扉页牌阵、2D 对战舞台、茶话会气泡等交互环节均做了仪式化设计；":
    None,
    "▪ 坚持「零配置可运行」——双击 index.html 即可完整运行，评审方无需任何密钥即可评估全部功能。":
    None,
}
trim2 = 0
for p in d.paragraphs:
    for old, new in TRIM2.items():
        if p.text.strip() == old:
            if new is None:
                # 删除该段落
                p._element.getparent().remove(p._element)
            else:
                sub_para(p, old, new)
            trim2 += 1
print(f"①c 总结精简：{trim2} 处")

# ============ ①d 收紧 Heading 1 段前距（腾行，不影响正文观感） ============
from docx.shared import Pt as _Pt
h1 = d.styles['Heading 1']
h1.paragraph_format.space_before = _Pt(14)
h2 = d.styles['Heading 2']
h2.paragraph_format.space_before = _Pt(8)
print("①d Heading 段前距收紧完成")

# ============ ①e 精简结语与展望引导（最后腾 3 行） ============
TRIM3 = {
    "从更长的周期看，「文物精灵」具备向三个方向持续演进的潜力：":
    "「文物精灵」具备向三个方向持续演进的潜力：",
    "结语：文物不应止于玻璃展柜中的静物。「文物精灵」尝试以 AI 与游戏化方式，使沉睡千年的古物「开口说话」，让燕赵大地的文物进入年轻群体的视野——正如项目扉页所写：":
    "结语：文物不应止于玻璃展柜中的静物。「文物精灵」尝试以 AI 与游戏化方式，让燕赵大地的文物走进年轻群体的视野——正如扉页所写：",
    "沉睡千年的古物一朝苏醒，跨越岁月长河，自燕赵大地而来，向你诉说埋藏在器物之中的千年故事。愿随君寻访博物，邂逅文物精灵，共览华夏文脉。":
    "沉睡千年的古物一朝苏醒，跨越岁月长河，自燕赵大地而来，向你诉说埋藏在器物之中的千年故事。愿随君寻访博物，共览华夏文脉。",
}
trim3 = 0
for p in d.paragraphs:
    for old, new in TRIM3.items():
        if p.text.strip() == old:
            sub_para(p, old, new)
            trim3 += 1
print(f"①e 结语精简：{trim3} 处")

# ============ ①f 精简表 8-1（缩短文字 + 修正旧数据） ============
t81 = d.tables[-1]
T81_ROWS = {
    1: ["识别准确率", "本机算法依据色彩与轮廓判断，同材质不同器型易混淆", "引入轻量端侧特征模型，或利用云端结果反向调整本机候选权重"],
    2: ["内容规模", "104 只精灵虽覆盖主要馆藏，但与全省文物总量仍有差距", "扩充至 200 只以上，按文物等级组织专题合集"],
    3: ["用户体系", "仅支持本地存档，换设备后进度不同步，缺少分享功能", "保持默认离线，提供可选的云端存档与打卡排行"],
    4: ["真实打卡", "「打卡站点」依赖用户自觉，无法确认是否实际到馆", "结合定位或馆内二维码，打通线上收集与线下参观"],
}
def set_cell_text(cell, text):
    ps = cell.paragraphs
    for extra in ps[1:]:
        extra._element.getparent().remove(extra._element)
    p = ps[0]
    runs = p.runs
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r._element.getparent().remove(r._element)
    else:
        p.add_run(text)
for ri, data in T81_ROWS.items():
    for ci, val in enumerate(data):
        set_cell_text(t81.rows[ri].cells[ci], val)
print("①f 表 8-1 精简完成")

# ============ ①g 删除结语前后的空段落（腾行） ============
paras = d.paragraphs
for i, p in enumerate(paras):
    if p.text.strip().startswith("结语："):
        # 删除前面的空段落
        j = i - 1
        while j >= 0 and not paras[j].text.strip():
            paras[j]._element.getparent().remove(paras[j]._element)
            j -= 1
        # 删除后面的空段落
        k = i + 1
        while k < len(paras) and not paras[k].text.strip():
            # 保留诗句段之前的空行最多1个，其余删除
            paras[k]._element.getparent().remove(paras[k]._element)
            k += 1
        break
print("①g 结语空段落清理完成")

# ============ ② 新增 3 节（正序插入） ============
anchor = None
for p in d.paragraphs:
    if p.style.name == 'Heading 1' and p.text.strip().startswith('6'):
        anchor = p
        break
assert anchor is not None
anchor_el = anchor._element

def _rn(rPr, size_half, font_east='宋体'):
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), 'Times New Roman')
    rFonts.set(qn('w:hAnsi'), 'Times New Roman')
    rFonts.set(qn('w:eastAsia'), font_east)
    rPr.append(rFonts)
    sz = OxmlElement('w:sz'); sz.set(qn('w:val'), str(size_half)); rPr.append(sz)
    szCs = OxmlElement('w:szCs'); szCs.set(qn('w:val'), str(size_half)); rPr.append(szCs)

def el_heading(text, level=2):
    p = OxmlElement('w:p')
    pPr = OxmlElement('w:pPr')
    # Word 内置标题样式 ID：Heading 1 = '1'，Heading 2 = '21'，Heading 3 = '31'
    style_id = {'1': '1', '2': '21', '3': '31'}[str(level)]
    ps = OxmlElement('w:pStyle'); ps.set(qn('w:val'), style_id); pPr.append(ps)
    p.append(pPr)
    r = OxmlElement('w:r'); rPr = OxmlElement('w:rPr')
    rPr.append(OxmlElement('w:b'))
    c = OxmlElement('w:color'); c.set(qn('w:val'), '4F81BD' if level == 2 else '365F91'); rPr.append(c)
    _rn(rPr, 26 if level == 2 else 28, '微软雅黑')
    r.append(rPr)
    t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = text; r.append(t)
    p.append(r)
    return p

def el_body(text):
    p = OxmlElement('w:p')
    pPr = OxmlElement('w:pPr')
    ind = OxmlElement('w:ind'); ind.set(qn('w:firstLine'), '420'); ind.set(qn('w:firstLineChars'), '200'); pPr.append(ind)
    sp = OxmlElement('w:spacing'); sp.set(qn('w:line'), '269'); sp.set(qn('w:lineRule'), 'auto'); sp.set(qn('w:after'), '42'); pPr.append(sp)
    p.append(pPr)
    r = OxmlElement('w:r'); rPr = OxmlElement('w:rPr'); _rn(rPr, 18, '宋体'); r.append(rPr)
    t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = text; r.append(t)
    p.append(r)
    return p

def el_image(path, width_cm):
    p = OxmlElement('w:p')
    pPr = OxmlElement('w:pPr')
    jc = OxmlElement('w:jc'); jc.set(qn('w:val'), 'center'); pPr.append(jc)
    p.append(pPr)
    # 用临时段落生成 run 再搬移
    tmp = d.add_paragraph()
    run = tmp.add_run()
    run.add_picture(path, width=Cm(width_cm))
    for child in list(tmp._element):
        if child.tag == qn('w:r'):
            p.append(child)
    tmp._element.getparent().remove(tmp._element)
    return p

def el_caption(text):
    p = OxmlElement('w:p')
    pPr = OxmlElement('w:pPr')
    jc = OxmlElement('w:jc'); jc.set(qn('w:val'), 'center'); pPr.append(jc)
    sp = OxmlElement('w:spacing'); sp.set(qn('w:after'), '120'); pPr.append(sp)
    p.append(pPr)
    r = OxmlElement('w:r'); rPr = OxmlElement('w:rPr'); _rn(rPr, 15, '宋体'); r.append(rPr)
    t = OxmlElement('w:t'); t.set(qn('xml:space'), 'preserve'); t.text = text; r.append(t)
    p.append(r)
    return p

def add_section(title, body_paras, img_path, caption, img_w=10.0):
    """正序：标题 → 正文 → 图 → 图题。"""
    els = [el_heading(title, 2)]
    for bp in body_paras:
        els.append(el_body(bp))
    if img_path:
        els.append(el_image(img_path, img_w))
        els.append(el_caption(caption))
    # 正序 addprevious：先插的（标题）在上，后插的（图题）紧贴锚点
    for e in els:
        anchor_el.addprevious(e)

add_section(
    "5.9 剧情主线与逐级解锁",
    ["剧情主线为 22 站、117 节点、4 种结局的叙事网络（含隐藏结局「此页无字，有手印一枚」），每站三条道选一只结缘、各配一条手写支线。流程采用「逐级解锁」机制：初始仅有「启程 · 七友相送」可进入，走完一个节点其后继才点亮，未解锁节点呈锁定态（🔒）且不可进入，引导用户「走一步、亮一步」而非漫无目的地跳转；隐藏结局的门槛是「支线完成数 + 向文物提问次数 ≥ 3」。结构由 VN_STATIONS 自动构链，tools/_check_vn.js 校验 117 节点 / 22 站 / 4 终点。"],
    IMG + r"\13_vnmap.png",
    "图 5-12　剧情主线流程图与逐级解锁",
    img_w=6.5)

add_section(
    "5.10 全国大地图与河北路牌",
    ["全国大地图以省级底图 + 22 枚图钉呈现 22 个打卡站（朱红未点亮 / 玉绿已点亮）。河北境内叠加「路牌」形制标签——牌面 + 镇馆器物图标 + 站名，点牌跳转对应站点；路牌按牌面矩形做 8 方向避让，窄屏自动收起图标并降字号。地图与主线共用同一套站点数据，点亮状态与收集进度实时联动。"],
    IMG + r"\02_map.png",
    "图 5-13　全国大地图与河北路牌运行截图",
    img_w=6.5)

add_section(
    "5.11 成就册独立页",
    ["成就册为独立页面（#/achieve），11 枚成就全部读取站内真实进度（入册、初入燕赵、一站到底、十一城记、九州行、见器知性、半壁、满架、说书人、四种收梢、走遍二十二站），不另存状态。每枚成就配一张合成小像，未收录的成就以灰度呈现；三列布局空出的第 12 格不删，写成「这一格空着，等你回来落笔」，把「未完成」变成叙事的一部分。"],
    IMG + r"\11_achieve.png",
    "图 5-14　成就册独立页运行截图",
    img_w=6.5)

print("② 新增 3 节完成（正序）")
d.save(DST)
print("已保存", DST, "段落数", len(d.paragraphs))
