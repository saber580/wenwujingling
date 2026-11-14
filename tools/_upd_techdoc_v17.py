# -*- coding: utf-8 -*-
"""技术文档 v1.15 → v1.17（专业架构图 + 补截图 + 修目录 + 精确编号）。

全部锚点用文本定位，图编号用精确映射，避免索引错乱。
"""
import docx
from docx.shared import Pt, Cm
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.15.docx"
DST = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.17.docx"
IMG = r"C:\Users\lenovo\Desktop\文物精灵网站\_文档素材"

d = docx.Document(SRC)

# ============ 工具函数 ============
def sub_para(p, old, new):
    """替换段落文本（保留第一个 run 的格式）。"""
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

def find_para(pred):
    """按条件查找段落，返回第一个匹配的 paragraph。"""
    for p in d.paragraphs:
        if pred(p):
            return p
    return None

def find_para_by_text(text):
    return find_para(lambda p: p.text.strip() == text)

def find_para_startswith(prefix):
    return find_para(lambda p: p.text.strip().startswith(prefix))

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
    # keep_with_next：图片与题注保持同页，避免图文分离
    kwn = OxmlElement('w:keepNext'); pPr.append(kwn)
    p.append(pPr)
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

def insert_before(anchor_p, els):
    anchor_el = anchor_p._element
    for e in els:
        anchor_el.addprevious(e)

def add_section_before(anchor_p, title, body_paras, img_path, caption, img_w=9.0):
    els = [el_heading(title, 2)]
    for bp in body_paras:
        els.append(el_body(bp))
    if img_path:
        els.append(el_image(img_path, img_w))
        els.append(el_caption(caption))
    insert_before(anchor_p, els)

def scale_existing_images(max_width_cm, exclude_captions=()):
    """把已有图片缩放到 max_width_cm 宽（按比例缩高），跳过竖版/指定题注。"""
    from docx.oxml.ns import qn as _qn
    scaled = 0
    for i, p in enumerate(d.paragraphs):
        # 找该段落的题注（后面 1-2 段）
        cap = ''
        for j in range(i + 1, min(i + 3, len(d.paragraphs))):
            t = d.paragraphs[j].text.strip()
            if t.startswith('图'):
                cap = t
                break
        if any(k in cap for k in exclude_captions):
            continue
        for r in p.runs:
            ext = r._element.findall('.//' + _qn('wp:extent'))
            for e in ext:
                cx = int(e.get('cx'))
                cy = int(e.get('cy'))
                w_cm = cx / 360000
                if w_cm > max_width_cm:
                    # 等比缩放
                    ratio = max_width_cm / w_cm
                    new_cx = int(cx * ratio)
                    new_cy = int(cy * ratio)
                    e.set('cx', str(new_cx))
                    e.set('cy', str(new_cy))
                    scaled += 1
    return scaled

# ================================================================
# ⓪ 排版：边距 + TOC 收紧 + 行距
# ================================================================
for sec in d.sections:
    sec.bottom_margin = Cm(0.9)
for name in ['toc 1', 'toc 2']:
    try:
        st = d.styles[name]
        st.paragraph_format.space_before = Pt(0)
        st.paragraph_format.space_after = Pt(0)
        st.paragraph_format.line_spacing = 0.86
    except KeyError:
        pass
# 正文 Normal 字号 9 → 8.5pt（均匀压缩，腾出末页）
try:
    d.styles['Normal'].font.size = Pt(8.5)
    print("⓪-2 正文 Normal 字号 9 → 8.5pt")
except Exception as e:
    print("⓪-2 字号调整失败", e)
tight = 0
for p in d.paragraphs:
    if p.style.name == 'Normal':
        pf = p.paragraph_format
        if pf.line_spacing and abs(pf.line_spacing - 1.120833333) < 1e-6:
            pf.line_spacing = 1.0
            tight += 1
print(f"⓪ 排版：边距/TOC/行距({tight}段)")

# ================================================================
# ① 数据替换
# ================================================================
for idx, pairs in {67: [("Git 提交 109 次", "Git 提交 112 次")],
                   97: [("109 次 Git 提交", "112 次 Git 提交")]}.items():
    for old, new in pairs:
        sub_para(d.paragraphs[idx], old, new)
print("① 数字替换完成")

# ================================================================
# ①b~①g 精简（控页数）
# ================================================================
TRIM = {
    "当前的 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）、20 类属性体系与数据驱动的架构，天然支持地域与内容的横向扩展。在保持「地域叙事」特色的同时，可以逐步接入更多省份的博物馆资源，形成以省为单元、以历史时间轴为纵深的中华文物数字图谱。":
    "当前的 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）与数据驱动架构，天然支持横向扩展，可逐步接入更多省份馆藏，形成以省为单元、以历史时间轴为纵深的中华文物数字图谱。",
    "「拍照识别 → 唤醒精灵 → 收进图鉴」的路径已完成验证。下一步可与博物馆合作，在展厅部署专属二维码与 AR 打卡点，实现线上收集与线下参观的打通——观众进入展厅后用手机扫描展签，文物精灵即从展柜中「苏醒」并加入图鉴。这将成为一种新的观展体验。":
    "「拍照识别 → 唤醒精灵 → 收进图鉴」的路径已完成验证。下一步可与博物馆合作，在展厅部署二维码与 AR 打卡点，观众扫码后文物精灵即从展柜中「苏醒」并加入图鉴，打通线上收集与线下参观。",
    "项目已具备 AI 识别、AI 赋彩、AI 茶话会、AI 海报、AI 幻化等多项生成能力，本质上已是一个小型文化创作工具集。未来可进一步开放 UGC 能力——允许用户为文物创作故事、参与精灵形象设计、分享自己的打卡作品，让文物传播从「官方单向输出」转向「用户共同参与」。":
    "项目已具备 AI 识别、赋彩、茶话会、海报、幻化等多项生成能力，本质上已是一个小型文化创作工具集。未来可开放 UGC 能力——允许用户为文物创作故事、参与形象设计、分享打卡作品，让传播从「官方单向输出」转向「用户共同参与」。",
}
for p in d.paragraphs:
    for old, new in TRIM.items():
        if p.text.strip() == old:
            sub_para(p, old, new)

TRIM2 = {
    "「文物精灵」以河北燕赵文物为内容基座，构建了集「打卡收集—答题对战—AI 识别—内容创作」于一体的国风数字图鉴网页。项目在三个方面达到预期目标：": None,
    "▪ 建成了覆盖 23 个站点、104 只精灵、20 类属性、707 道题的完整内容体系；":
    "▪ 内容方面：建成覆盖 23 站、104 只精灵、20 类属性、707 道题的完整内容体系，每只精灵均具备来历、知识库、回忆漫画与自述题库，且数据与逻辑严格分离、可自动校验；",
    "▪ 每只精灵均具备各自的来历、知识库、回忆漫画与自述题库，内容深度足以支撑多轮游玩；": None,
    "▪ 数据与逻辑严格分离，并配备自动校验脚本，后续扩充内容的边际成本接近为零。": None,
    "▪ 落地了 8 项 AI 能力，覆盖视觉识别、文本生成、图像生成、图像处理、智能交互五个方向；":
    "▪ 技术方面：落地 8 项 AI 能力，覆盖视觉识别、文本生成、图像生成、图像处理、智能交互五个方向，每项均做「云端 + 本机」两套实现；并自研本机识别引擎与复原算法，实现三级密钥读取链与自动择优机制，联网与否均可使用；",
    "▪ 每项 AI 功能都做了「云端 + 本机」两套实现，联网与否都能正常使用；": None,
    "▪ 自研本机识别引擎（背景剔除 + 加权色相 + 归一化比对）与本机复原算法（分级饱和度补偿 + 邻域修补 + 双线性超分），在无网络、无密钥条件下依然提供真实算法输出；": None,
    "▪ 实现三级密钥读取链与自动择优机制，同时满足安全合规与演示灵活性的双重约束。": None,
    "▪ 以中国红、鎏金、宣纸为基调，构建五套纯程序绘制的国风动态背景与属性驱动的纹样系统；":
    "▪ 体验方面：以中国红、鎏金、宣纸为基调，构建五套纯程序绘制的国风动态背景与属性驱动的纹样系统，开场画卷、2D 对战舞台、茶话会气泡等环节均做了仪式化设计，并坚持「零配置可运行」；",
    "▪ 开场画卷、扉页牌阵、2D 对战舞台、茶话会气泡等交互环节均做了仪式化设计；": None,
    "▪ 坚持「零配置可运行」——双击 index.html 即可完整运行，评审方无需任何密钥即可评估全部功能。": None,
}
for p in d.paragraphs:
    for old, new in TRIM2.items():
        if p.text.strip() == old:
            if new is None:
                p._element.getparent().remove(p._element)
            else:
                sub_para(p, old, new)

TRIM3 = {
    "从更长的周期看，「文物精灵」具备向三个方向持续演进的潜力：": "「文物精灵」具备向三个方向持续演进的潜力：",
    "结语：文物不应止于玻璃展柜中的静物。「文物精灵」尝试以 AI 与游戏化方式，使沉睡千年的古物「开口说话」，让燕赵大地的文物进入年轻群体的视野——正如项目扉页所写：":
    "结语：文物不应止于玻璃展柜中的静物。「文物精灵」尝试以 AI 与游戏化方式，让燕赵大地的文物走进年轻群体的视野——正如扉页所写：",
    "沉睡千年的古物一朝苏醒，跨越岁月长河，自燕赵大地而来，向你诉说埋藏在器物之中的千年故事。愿随君寻访博物，邂逅文物精灵，共览华夏文脉。":
    "沉睡千年的古物一朝苏醒，跨越岁月长河，自燕赵大地而来，向你诉说埋藏在器物之中的千年故事。愿随君寻访博物，共览华夏文脉。",
    # 三个方向正文精简
    "当前的 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）与数据驱动架构，天然支持横向扩展，可逐步接入更多省份馆藏，形成以省为单元、以历史时间轴为纵深的中华文物数字图谱。":
    "当前 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）与数据驱动架构天然支持横向扩展，可逐步接入更多省份馆藏，形成以省为单元的中华文物数字图谱。",
    "「拍照识别 → 唤醒精灵 → 收进图鉴」的路径已完成验证。下一步可与博物馆合作，在展厅部署二维码与 AR 打卡点，观众扫码后文物精灵即从展柜中「苏醒」并加入图鉴，打通线上收集与线下参观。":
    "「拍照识别 → 唤醒精灵 → 收进图鉴」的路径已完成验证，下一步可与博物馆合作部署二维码与 AR 打卡点，打通线上收集与线下参观。",
    "项目已具备 AI 识别、赋彩、茶话会、海报、幻化等多项生成能力，本质上已是一个小型文化创作工具集。未来可开放 UGC 能力——允许用户为文物创作故事、参与形象设计、分享打卡作品，让传播从「官方单向输出」转向「用户共同参与」。":
    "项目已具备 AI 识别、赋彩、茶话会、海报、幻化等多项生成能力，未来可开放 UGC 能力，让传播从「官方单向输出」转向「用户共同参与」。",
}
for p in d.paragraphs:
    for old, new in TRIM3.items():
        if p.text.strip() == old:
            sub_para(p, old, new)

# ①h 第 8 章进一步精简：删除 8.1 三个子标题，精简 8.3 方向标题
TRIM4 = {
    "8.1.1 内容方面": None,
    "8.1.2 技术方面": None,
    "8.1.3 体验方面": None,
    "方向一：从「河北图鉴」到「中华文物图谱」": "▪ 从「河北图鉴」到「中华文物图谱」：",
    "方向二：从「网页 Demo」到「博物馆现场应用」": "▪ 从「网页 Demo」到「博物馆现场应用」：",
    "方向三：从「科普工具」到「文化创作平台」": "▪ 从「科普工具」到「文化创作平台」：",
}
trim4 = 0
for p in d.paragraphs:
    for old, new in TRIM4.items():
        if p.text.strip() == old:
            if new is None:
                p._element.getparent().remove(p._element)
            else:
                sub_para(p, old, new)
            trim4 += 1
print(f"①h 第 8 章进一步精简：{trim4} 处")

# ①f 表 8-1 精简
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

# ①f2 精简表 7-1、7-2（创新点表）「具体做法」列 + 修正旧数据
t71 = d.tables[15]  # 技术创新点
t72 = d.tables[16]  # 应用创新点
T71_DO = {
    1: "每项 AI 能力均实现两套方案：云端可用时调用大模型，不可用时切换至本机算法，两套共用同一界面，用户无感知。",
    2: "云端识别出文物后，将名称与别名同图鉴精灵匹配，匹配成功即可一键收入图鉴，使识别工具接入收集玩法。",
    3: "仅基于 Canvas 像素数据自行实现：以色相直方图判定材质、以高宽比判定器型、以边缘密度判定纹样；并剔除展柜背景、对浅色器物改用归一化色相比对。",
    4: "将 19 个豆包视觉模型编排为候选清单，按序探测，遇「模型不存在」即切换下一候选，首个成功者记录复用。",
    5: "先计算整幅照片的平均饱和度以判定褪色程度，再分级确定提色强度；配合灰世界白平衡，避免统一提色使未褪色照片过饱和。",
}
T72_DO = {
    1: "将 104 件（组）文物转化为可打卡、可捕捉、可对战、可对话的角色，参与方式由「观看」转为「遇见—了解—收集」。",
    2: "内容按河北地理划分为 22 个打卡站，自沧州至中国国家博物馆；隐藏的第零站以「夏→清」16 个朝代构成时间轴。",
    3: "20 类属性实际参与对战计算：青铜器上场加 2 点生命、金银器骰子 +1、玉器答对两题回血、书画开局排除一个错误选项。",
    4: "茶话会将 3~6 只精灵组织于同一场景，依据年代、出土地与知识库生成对话；用户任主持，联网实时生成、断网由本机台词库编排。",
    5: "五套动态背景全部由 CSS 与 SVG 实时绘制；卡片边框依属性自动切换纹样；开场以画轴展开、宣纸题字、朱印收尾。",
}
for ri, txt in T71_DO.items():
    set_cell_text(t71.rows[ri].cells[2], txt)
for ri, txt in T72_DO.items():
    set_cell_text(t72.rows[ri].cells[2], txt)
print("①f 表 8-1 + 表 7-1/7-2 精简与数据修正完成")

# ①f3 修正表 3-1（系统分层架构）旧数据：70只→104只、13站点→22站、533题→707题
t31 = d.tables[6]  # 表 3-1（表头首列「层次」）
for row in t31.rows:
    for cell in row.cells:
        txt = cell.text
        new = txt.replace('70 只精灵', '104 只精灵').replace('13 站点', '22 站').replace('533 道题', '707 道题')
        if new != txt:
            set_cell_text(cell, new)
print("①f3 表 3-1 旧数据修正")

# 结语空段落清理
paras = d.paragraphs
for i, p in enumerate(paras):
    if p.text.strip().startswith("结语："):
        j = i - 1
        while j >= 0 and not paras[j].text.strip():
            paras[j]._element.getparent().remove(paras[j]._element)
            j -= 1
        k = i + 1
        while k < len(paras) and not paras[k].text.strip():
            paras[k]._element.getparent().remove(paras[k]._element)
            k += 1
        break

d.styles['Heading 1'].paragraph_format.space_before = Pt(14)
d.styles['Heading 2'].paragraph_format.space_before = Pt(8)
print("① 精简与收紧完成")

# ================================================================
# ② 架构图替换/新增（文本定位）
# ================================================================
# ②a 3.1 总体架构：在「架构的核心特征是...」段前插五层架构图（图 3-1）
p_core = find_para_startswith("架构的核心特征是「无服务端」")
assert p_core is not None, "找不到 3.1 结尾段"
insert_before(p_core, [
    el_image(IMG + r"\fig3_1_arch.png", 10.5),
    el_caption("图 3-1　系统总体架构（表现 / 应用逻辑 / AI 能力 / 数据 / 部署五层）"),
])

# ②b 3.2 数据架构：在 ASCII 实体关系图段前插数据架构图（图 3-2）
p_er = find_para_startswith("STATIONS[23]")
assert p_er is not None, "找不到 ASCII 实体关系图"
insert_before(p_er, [
    el_image(IMG + r"\fig3_2_data.png", 10.5),
    el_caption("图 3-2　三层自研结构（站内知识层 / 内容层 / 评测台）"),
])

# ②c 4.3.1：删除 ASCII 小桥数据流，替换为 AI 流水线图（图 4-1）
p_flow = find_para_startswith("浏览器页面")
assert p_flow is not None, "找不到 ASCII 小桥数据流"
p_flow._element.getparent().remove(p_flow._element)
# 题注「图 4-1　本机小桥模式的数据流与容错路径」改为 AI 流水线
p_cap41 = find_para_startswith("图 4-1")
assert p_cap41 is not None
sub_para(p_cap41, "图 4-1　本机小桥模式的数据流与容错路径", "图 4-1　AI 能力流水线（云端 / 本机双路与降级）")
insert_before(p_cap41, [el_image(IMG + r"\fig4_1_ai.png", 10.5)])
print("② 架构图完成")

# ================================================================
# ③ 补图鉴截图（插在 5.3 标题前）
# ================================================================
p_53 = find_para_by_text("5.3 答题对战与捕捉机制")
assert p_53 is not None
insert_before(p_53, [
    el_image(IMG + r"\03_codex.png", 9.0),
    el_caption("图 5-3　文物图鉴页：收集进度与精灵卡片"),
])

# ================================================================
# ④ 新增 5.9~5.13（文本定位第 6 章）
# ================================================================
p_6 = find_para(lambda p: p.style.name == 'Heading 1' and p.text.strip().startswith('6'))
assert p_6 is not None

add_section_before(p_6, "5.9 剧情主线与逐级解锁",
    ["剧情主线为 22 站、117 节点、4 种结局的叙事网络（含隐藏结局「此页无字，有手印一枚」），每站三条道选一只结缘、各配一条手写支线。流程采用「逐级解锁」机制：初始仅有「启程 · 七友相送」可进入，走完一个节点其后继才点亮，未解锁节点呈锁定态（🔒）且不可进入，引导用户「走一步、亮一步」；隐藏结局的门槛是「支线完成数 + 向文物提问次数 ≥ 3」。结构由 VN_STATIONS 自动构链，tools/_check_vn.js 校验 117 节点 / 22 站 / 4 终点。"],
    IMG + r"\13_vnmap.png", "图 5-13　剧情主线流程图与逐级解锁", img_w=9.0)

add_section_before(p_6, "5.10 全国大地图与河北路牌",
    ["全国大地图以省级底图 + 22 枚图钉呈现 22 个打卡站（朱红未点亮 / 玉绿已点亮）。河北境内叠加「路牌」形制标签——牌面 + 镇馆器物图标 + 站名，点牌跳转对应站点；路牌按牌面矩形做 8 方向避让，窄屏自动收起图标并降字号。地图与主线共用同一套站点数据，点亮状态与收集进度实时联动。"],
    IMG + r"\02_map.png", "图 5-14　全国大地图与河北路牌运行截图", img_w=9.0)

add_section_before(p_6, "5.11 成就册独立页",
    ["成就册为独立页面（#/achieve），11 枚成就全部读取站内真实进度，不另存状态。每枚成就配一张合成小像，未收录的成就以灰度呈现；三列布局空出的第 12 格不删，写成「这一格空着，等你回来落笔」，把「未完成」变成叙事的一部分。"],
    IMG + r"\11_achieve.png", "图 5-15　成就册独立页运行截图", img_w=9.0)

add_section_before(p_6, "5.12 内容创作拓展（心仪卡工坊 + 拟人漫画）",
    ["心仪卡工坊把喜欢的文物做成一张全景典藏卡，画面比例、景深、光影、材质与正反面均可自定义，满意后一键保存为图片；拟人漫画则把文物交给 AI 画成「会抱怨、会认路的打工人」，以深色书架陈列古籍书脊（错金铜雉、后母戊鼎、四羊方尊、金缕玉衣、红山玉龙等），点书脊抽出、点封面翻开，一览拟人小故事。两者共同把厚重的历史叙事转化为可玩、可分享的个性化表达。"],
    IMG + r"\10_heart.png", "图 5-16　心仪卡工坊运行截图：典藏卡编辑区与参数面板", img_w=9.0)

# 拟人漫画作为第二张图，紧跟心仪卡（同一个小节）
# 在 p_6 前插入漫画截图（紧跟心仪卡图之后）
p_heart_cap = None
for p in d.paragraphs:
    if p.text.strip().startswith("图 5-16　心仪卡工坊"):
        p_heart_cap = p
        break
if p_heart_cap is not None:
    # 在题注后插入漫画图（需在题注后，所以用 addnext）
    manga_img = el_image(IMG + r"\12_shiyilu.png", 9.0)
    manga_cap = el_caption("图 5-17　文物拟人漫画：书架陈列与拟人条目")
    p_heart_cap._element.addnext(manga_cap)
    p_heart_cap._element.addnext(manga_img)

print("③④ 截图与 5.9~5.13 完成")

# ================================================================
# ⑤ 精确图编号映射（旧题注 → 新题注）
# ================================================================
# 第 5 章：因图鉴截图插在 5-2 之后，原 5-3~5-11 全部 +1
FIG_RENAME = {
    # 图 3-1 实体关系 → 图 3-3（因为新增了五层架构=3-1、数据架构=3-2）
    "图 3-1　数据层实体关系与关键约束": "图 3-3　数据层实体关系与关键约束",
    # 第 5 章顺延（原 5-3 → 5-4，...，5-11 → 5-12）
    "图 5-3　对战数值规则": "图 5-4　对战数值规则",
    "图 5-4　出战精灵选择面板：卡片显示主属性与特性说明": "图 5-5　出战精灵选择面板：卡片显示主属性与特性说明",
    "图 5-5　2D 对战舞台运行截图：血量条、双方立绘与 AI 出题面板": "图 5-6　2D 对战舞台运行截图：血量条、双方立绘与 AI 出题面板",
    "图 5-6　本机复原四步流程": "图 5-7　本机复原四步流程",
    "图 5-7　AI 文物识别运行截图：上传区、修复对比滑块与识别结果": "图 5-8　AI 文物识别运行截图：上传区、修复对比滑块与识别结果",
    "图 5-8　AI 精灵茶话会运行截图：选精灵、开场与对话气泡": "图 5-9　AI 精灵茶话会运行截图：选精灵、开场与对话气泡",
    "图 5-9　AI 文物修复运行截图：拼图修复界面与提示按钮": "图 5-10　AI 文物修复运行截图：拼图修复界面与提示按钮",
    "图 5-10　AI 赋彩运行截图：黑白线稿画布、工具区与缩略图条": "图 5-11　AI 赋彩运行截图：黑白线稿画布、工具区与缩略图条",
    "图 5-11　AI 红舞狮「小答」运行截图：悬浮窗与对话面板": "图 5-12　AI 红舞狮「小答」运行截图：悬浮窗与对话面板",
    # 正文引用句
    "图 5-5 为实际对战画面": "图 5-6 为实际对战画面",
}
renamed = 0
for p in d.paragraphs:
    for old, new in FIG_RENAME.items():
        if old in p.text:
            sub_para(p, old, new)
            renamed += 1
print(f"⑤ 图编号映射：{renamed} 处")

# ================================================================
# ⑥ 统一已有图片尺寸（>11cm 缩到 11cm，竖版用例图除外）
# ================================================================
scaled = scale_existing_images(11.0, exclude_captions=("系统用例图",))
print(f"⑥ 已有大图统一缩放：{scaled} 张 → 11cm")

d.save(DST)
print("已保存", DST, "段落数", len(d.paragraphs))
