# -*- coding: utf-8 -*-
"""技术文档 v1.18 → v1.19

三件事：
  ① 把「Agent 编排 / 安全护栏 / 可验证引证」三块从章节内部提为独立重点小节，
     各加一段定位说明，标题改为能直接对上评分项的写法；
  ② 新增 4.13「端侧推理：浏览器内的度量学习识别」，含实测指标表；
  ③ 修正两处事实错误：工具数 6 → 8（漏了 hybrid_search / verify_citation）、
     精灵数据表 74 → 104。

另外修掉 v1.18 里一处排版问题：「4.14 AI 玩法与叙事终版」被写成了正文样式。
"""
import copy
import docx
from docx.shared import Pt
from docx.enum.text import WD_ALIGN_PARAGRAPH

SRC = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.18.docx"
DST = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.19.docx"

d = docx.Document(SRC)
body = [p for p in d.paragraphs if not p.style.name.lower().startswith("toc")]


# ---------------------------------------------------------------- 工具函数
def find(kw, style=None):
    """按前缀找段落（跳过目录），可限定样式。"""
    for p in body:
        if p.text.strip().startswith(kw) and (style is None or p.style.name == style):
            return p
    raise KeyError(kw)


def set_text(p, text):
    """整段换文，保留首个 run 的格式。"""
    runs = p.runs
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r.text = ""
    else:
        p.add_run(text)


def replace_in(p, old, new):
    if old in p.text:
        set_text(p, p.text.replace(old, new))
        return True
    return False


def insert_after(anchor, text, style="Normal", size=None, indent=True):
    """在 anchor 段落之后插入一段（返回新段落）。"""
    new = copy.deepcopy(anchor._p)
    anchor._p.addnext(new)
    para = docx.text.paragraph.Paragraph(new, anchor._parent)
    para.style = d.styles[style]
    # 清掉原有 run，只留一个
    for r in list(para.runs)[1:]:
        r._r.getparent().remove(r._r)
    if para.runs:
        para.runs[0].text = text
        r = para.runs[0]
        r.text = text
        if size:
            r.font.size = Pt(size)
    else:
        r = para.add_run(text)
        if size:
            r.font.size = Pt(size)
    # 正文首行缩进
    pf = para.paragraph_format
    pf.first_line_indent = Pt(17) if (indent and style == "Normal") else None
    return para


def insert_before(target, text, style="Normal", size=None, indent=True):
    p = target.insert_paragraph_before(text, style=d.styles[style])
    for r in p.runs:
        if size:
            r.font.size = Pt(size)
    if indent and style == "Normal":
        p.paragraph_format.first_line_indent = Pt(17)
    return p


print("=" * 60)
print("① 修正事实错误：工具数 6 → 8，精灵表 74 → 104")
print("=" * 60)

# 4.10.1 正文里的「6 个工具」
p = find("项目把站内可用的查询能力封装为")
before = p.text
set_text(p, "项目把站内可用的查询能力封装为 8 个工具，连同各自的用途说明一并交给模型，"
            "由模型判断：这个问题要不要查、查哪一个、参数给什么、结果够不够、要不要再查一次。"
            "代码不再判断「该走检索还是该走对比」，只负责执行模型要的动作并把结果原样还回去。"
            "工具覆盖关键词检索、双路混合检索、档案调取、两器对比、工艺词条、易混淆辨析、"
            "馆藏浏览与引证核验八类。")
print("  ✓ 工具数描述已修正:", before[:20], "→", p.text[:20])

# 表 4-4：补两行 + 修 74 → 104
tool_tbl = None
for t in d.tables:
    if t.rows and t.rows[0].cells[0].text.strip() == "工具名":
        tool_tbl = t
        break
assert tool_tbl is not None, "找不到工具清单表"

for row in tool_tbl.rows:
    for cell in row.cells:
        if "（74 件）" in cell.text:
            set_text(cell.paragraphs[0], cell.text.replace("（74 件）", "（104 件）"))
            print("  ✓ 工具清单表：74 件 → 104 件")

# 追加 hybrid_search / verify_citation 两行（复制末行结构）
NEW_ROWS = [
    ("hybrid_search", "BM25 + LSA 双路召回后 RRF 融合，返回带出处的证据片段", "站内 1,484 段索引"),
    ("verify_citation", "核验一条结论能否被档案原文支持，给出可核/不可核", "档案原文 + 引证表"),
]
last_tr = copy.deepcopy(tool_tbl.rows[-1]._tr)
for name, use, src in NEW_ROWS:
    tr = copy.deepcopy(last_tr)
    tool_tbl._tbl.append(tr)
    row = tool_tbl.rows[-1]
    for cell, val in zip(row.cells, (name, use, src)):
        set_text(cell.paragraphs[0], val)
        for r in cell.paragraphs[0].runs:
            r.font.size = Pt(8.5)
print("  ✓ 工具清单表：补入 hybrid_search / verify_citation，共", len(tool_tbl.rows) - 1, "个工具")

# 列宽重排：工具名列 2.55cm 会把 check_misconception 挤成两行
try:
    tool_tbl.autofit = False
    for width, col in zip((4.0, 8.2, 5.6), tool_tbl.columns):
        for cell in col.cells:
            cell.width = docx.shared.Cm(width)
    print("  ✓ 工具清单表：列宽重排 4.0 / 8.2 / 5.6 cm")
except Exception as e:
    print("  列宽跳过:", e)


print("\n" + "=" * 60)
print("② 三大重点小节：改标题 + 加定位段")
print("=" * 60)

# ---- 4.7 可验证引证 ----
h = find("4.7 可验证生成", "Heading 2")
set_text(h, "4.7 可验证引证：从检索证据到生成校验")
lead7 = insert_after(
    h,
    "本节对应评分表「RAG 技术应用」与「AI 安全与可控性」两项。核心主张是一句话："
    "AI 只负责表达，事实由检索结果兜底。为此项目在生成之前先建证据（4.5），"
    "生成之后逐项核验（本节），核验不通过则重写或回退，最终在界面上把「可核几分」画出来（4.9.1）。"
    "三段合起来构成一条闭环的可验证引证链，而不是一次性的提示词约束。",
    size=9)
print("  ✓ 4.7 标题与定位段")

# ---- 4.10 Agent ----
h = find("4.10 工具层与 Agent", "Heading 2")
set_text(h, "4.10 AI Agent 编排：规划、工具调用与自我修正")
lead10 = insert_after(
    h,
    "本节对应评分表「Agent / 工作流设计」一项，权重 8%，是本章的重点之一。"
    "要考察的不是「接了大模型」，而是模型能否自己决定：这个问题要不要查、查哪个、"
    "参数给什么、结果够不够、要不要重来。下文依次说明工具契约（一份 schema 兼容 MCP 与 "
    "Function Calling）、循环的三条硬边界，以及一次真实发生的自我修正。",
    size=9)
print("  ✓ 4.10 标题与定位段")

# ---- 4.12 安全护栏 ----
h = find("4.12 模型输出的多层校验", "Heading 2")
set_text(h, "4.12 AI 安全护栏：多层校验、降级与弃答")
lead12 = insert_after(
    h,
    "本节对应评分表「AI 安全与可控性」一项。项目把「可控」拆成四道闸门，分别管不同的事："
    "输入侧拦不当提问，输出侧五层校验挡无效结果，运行时按可用性三级降级保证不中断，"
    "端侧则以置信度阈值决定「答」还是「不答」（见 4.13.4）。四道闸门的共同原则是"
    "「宁可不说，也不说错」——降级、弃答与回退都是设计内的正常路径，不是故障。",
    size=9)
print("  ✓ 4.12 标题与定位段")


print("\n" + "=" * 60)
print("③ 新增 4.13 端侧推理（含实测表），并重新编号后续小节")
print("=" * 60)

# 先把旧的 4.13 / 4.14 改号（自后向前，避免撞号）
old_changelog = find("4.14　AI 玩法与叙事终版", "Normal")
set_text(old_changelog, "4.15　AI 玩法与叙事终版与省赛复测（2026-11-10）")
old_changelog.style = d.styles["Heading 2"]
print("  ✓ 4.14 复测小节：修正样式为 Heading 2，改号为 4.15")

old_eval = find("4.13 效果评估与已知局限", "Heading 2")
set_text(old_eval, "4.14 效果评估与已知局限")
print("  ✓ 4.13 效果评估 → 4.14")

# 表 4-5（省赛对照）→ 表 4-6
cap = find("表 4-5　省赛六维评分对照")
set_text(cap, "表 4-6　省赛六维评分对照与实测证据（自评，2026-11-13）")
for p in body:
    if "表 4-5 为按省赛细则逐项的自评" in p.text:
        replace_in(p, "表 4-5 为按省赛细则逐项的自评", "表 4-6 为按省赛细则逐项的自评")
print("  ✓ 表 4-5 → 表 4-6")

TARGET = old_eval   # 新章节插在它前面

SECTIONS = [
    ("H2", "4.13　端侧推理：浏览器内的度量学习识别"),
    ("P", "云端识别依赖网络与额度。为在断网、未开通或弱网条件下仍能给出可用结论，"
          "项目在浏览器内实现了一条完整的端侧推理路径：不下载任何模型权重、不发起任何请求，"
          "特征提取、度量学习与置信度判定全部在本地完成。它同时对应评分表「鼓励探索端侧智能」一项。"
          "与云端的关系是分工而非替代——端侧负责零延迟给候选与断网兜底，云端负责精确命名与讲来历。"),

    ("H3", "4.13.1 特征：从剪影到 34 维描述"),
    ("P", "剪影提取走双通道。立绘素材本身是透明底，直接取 alpha 通道即得无损剪影；"
          "实拍照片不透明，改用 Sobel 边缘 + Otsu 自适应阈值 + 3×3 邻域去噪提取前景，"
          "并按「前景占少数」的假设自动判定取暗侧还是亮侧。剪影之上提取 34 维特征："
          "Hu 七不变矩（旋转、缩放、平移不变）、形状描述子 5 项（前景占比、高宽比、填充率、圆度、伸长率）、"
          "4×4 网格占空 16 维、6 环径向签名。三者分工明确：Hu 刻画整体形状，网格刻画"
          "「哪一块实心、哪一块镂空」，径向签名刻画轮廓沿半径的分布。实测仅用 Hu 的 12 维特征时 "
          "Top-1 为 59.6%，补足到 34 维后升至 65.4%。"),

    ("H3", "4.13.2 分类头：标准化 → PCA 白化 → 类均值最近邻"),
    ("P", "Hu 各维量级相差数个数量级，直接算余弦会让前几维压倒后几维。项目先做 z-score 标准化，"
          "再用协方差矩阵的幂迭代求前 20 个主成分并白化（逐次收缩 deflation，"
          "主成分符号按最大分量对齐以保证结果可复现），最后在 20 维白化空间里做类均值最近邻。"
          "整个训练在浏览器内现场完成，104 个类、34 维输入，耗时约 0.3 秒；模型与模板合计 31.8 KB，"
          "其中模板经 Int16 量化后 20.7 KB、投影矩阵与类均值 11.0 KB——不到任何预训练权重的零头。"),

    ("H3", "4.13.3 WebGPU 加速与自动降级"),
    ("P", "灰度化与 Sobel 卷积是链路中最重的一步。项目把它写成两个 WGSL compute pass"
          "（8×8 workgroup）：第一遍由 RGBA 算灰度，第二遍读灰度算梯度幅值，"
          "两遍之间由 pass 边界保证同步，避免同一 dispatch 内读写竞争。"
          "可取到 GPU adapter 时走 GPU，取不到或着色器编译失败则整条链路回落到 CPU 实现，"
          "调用方无感知。同步接口 identify() 保持原语义，异步接口 identifyAsync() 供主流程调用；"
          "两条路径的特征与结论一致，差异仅在耗时（大图时 GPU 优势明显）。"),

    ("H3", "4.13.4 置信度标定与弃答"),
    ("P", "104 个类做 softmax，无论温度如何调整，概率都会被摊薄到 1% 量级，弃答阈值形同虚设。"
          "项目改用间隔比 margin =（次近类距离 − 最近类距离）/ 次近类距离：第一名领先越多越接近 1，"
          "前几名咬得紧则趋近 0。实测 104 次跨素材查询中，判断正确时平均置信度 0.886，"
          "错误时仅 0.103；阈值取 0.4 时覆盖 57.7% 的样本而精确率达 100%，取 0.15 时覆盖 70.2%、"
          "精确率 87.7%。界面据此分两态：置信度足够则直接采用，不足则明确标注「交给云端定名」，"
          "不把猜出来的结果当成结论呈现。"),

    ("H3", "4.13.5 评测口径与实测结果"),
    ("P", "本站每件文物只有一张立绘模板。留一交叉验证会把整类从模型中删掉，闭集分类器根本"
          "无法预测它，指标恒为 0，没有意义——这是本项目在第一版基准脚本里踩到的坑，已废弃。"
          "改用跨素材验证：模板由图鉴主立绘构建，查询用同名的战斗立绘（另一套渲染，"
          "构图、姿态与笔触均不同），等价于一次真实的域偏移测试，指标因此可复现、可解释。"),

    ("CAP", "表 4-5　端侧推理实测指标（104 类 · 单样本 · 跨素材）"),
    ("TBL", [
        ("指标", "数值", "说明"),
        ("Top-1 准确率", "65.4%", "68 / 104"),
        ("Top-3 准确率", "70.2%", "73 / 104"),
        ("正确样本平均置信度", "0.886", "间隔比 margin"),
        ("错误样本平均置信度", "0.103", "间隔比 margin"),
        ("置信度 ≥ 0.4 时精确率", "100%", "覆盖 57.7% 样本"),
        ("模板 + 模型体积", "31.8 KB", "模板 Int16 量化"),
        ("模板预热耗时", "1.6–1.8 s", "单张 17.8 ms（素材已缓存）"),
        ("单次识别耗时", "4–27 ms", "WebGPU / CPU"),
    ]),

    ("P", "这组数字的解读须克制：65.4% 是「只凭轮廓、单样本、跨渲染」条件下的上限，"
          "不足以替代云端识别，也不应被描述成「端侧已可独立完成识别」。端侧的价值在于三点："
          "断网可用、零延迟给候选、为云端结论提供一路独立校验。两者不一致时，"
          "界面按各自置信度分别呈现，不强行合并成一个答案。"),
]

for kind, payload in SECTIONS:
    if kind == "H2":
        insert_before(TARGET, payload, style="Heading 2")
    elif kind == "H3":
        insert_before(TARGET, payload, style="Heading 3")
    elif kind == "CAP":
        p = insert_before(TARGET, payload, style="Normal", size=9, indent=False)
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Pt(0)
    elif kind == "P":
        insert_before(TARGET, payload, style="Normal", size=9)
    elif kind == "TBL":
        tbl = d.add_table(rows=len(payload), cols=3)
        tbl.style = d.styles["Table Grid"]
        for i, row in enumerate(payload):
            for j, val in enumerate(row):
                cell = tbl.cell(i, j)
                set_text(cell.paragraphs[0], val)
                for r in cell.paragraphs[0].runs:
                    r.font.size = Pt(8.5)
        TARGET._p.addprevious(tbl._tbl)

print("  ✓ 新增 4.13 端侧推理：5 小节 + 表 4-5（8 行）")


print("\n" + "=" * 60)
print("④ 压缩复测小节，控制总页数")
print("=" * 60)

# 把复测小节里 4 段流水账压成 2 段
def compress():
    ps = [p for p in d.paragraphs if not p.style.name.lower().startswith("toc")]
    p_narr = next((p for p in ps if p.text.startswith("叙事层：22 站全部按")), None)
    p_ai = next((p for p in ps if p.text.startswith("AI 玩法层：主线内新增三处模型调用")), None)
    p_rep = next((p for p in ps if p.text.startswith("复现（启动 PORT=8901")), None)
    p_on = next((p for p in ps if p.text.startswith("在线验证无需命令行")), None)
    if p_narr:
        set_text(p_narr, "叙事层：22 站按「先露伤口、再给知识」重写，台词 800 行、117 节点、四个结局"
                         "（三站内心境 + 隐藏结局「此页无字，有手印一枚」）。隐藏结局的门槛不是通关次数，"
                         "而是「支线完成数 + 向文物提问次数 ≥ 3」；每站另有一条手写支线，主角是该站"
                         "「没被三条道选中」的那件文物，与「被忽视的文物」母题同构。结构由 VN_STATIONS 自动构链，"
                         "tools/_check_vn.js 校验 117 节点 / 22 站 / 4 终点。")
    if p_ai:
        set_text(p_ai, "AI 玩法层：主线内新增「问它一句」「旅途手记」「节点间随机事件」三处模型调用，"
                       "均按「云端 SDK → 直连密钥 → 本机规则」三级降级，共同约束是"
                       "「AI 只负责表达，事实与走向由本地状态决定」，断网时叙事不断裂。"
                       "确定层的延迟另见 docs/输出稳定性与延迟量化报表.md："
                       "1,484 段索引构建 4.75 ms、双路 RRF 检索 0.016 ms、同题 20 轮 Top-1 零漂移。")
    # 删掉两条命令流水账
    for p in (p_rep, p_on):
        if p:
            p._p.getparent().remove(p._p)
    if p_ai:
        merged = insert_after(p_ai,
            "复现与在线验证：python tools/check_mcp.py 8901 → 35/35，node tools/check_agent.js → 28/28，"
            "node tools/_check_vn.js → 117 节点 / 22 站 / 4 终点，node tools/_walk_vn.js → 300/300；"
            "线上 /docs/AI深度自检.html?auto=1 可一键跑完 MCP、工具层、RAG 与安全过滤四张卡。", size=9)
    print("  ✓ 复测小节：4 段 → 3 段，删除命令流水账")

try:
    compress()
except Exception as e:
    print("  压缩跳过:", e)


print("\n" + "=" * 60)
print("⑤ 控页：合并重复论述、微缩插图（目标物理页 ≤ 30）")
print("=" * 60)


def paras():
    return [p for p in d.paragraphs if not p.style.name.lower().startswith("toc")]


def drop(p):
    if p is not None:
        p._p.getparent().remove(p._p)
        return True
    return False


# ---- 4.11 备选方案：6 条 → 4 条（同属「端侧自训练」与「服务端依赖」的两两合并）----
def compress_411():
    ps = paras()
    i0 = next(i for i, p in enumerate(ps) if p.text.strip().startswith("4.11 备选方案"))
    seg = []
    for p in ps[i0 + 1:]:
        if p.text.strip().startswith("4.12 "):
            break
        if p.text.strip().startswith("▪"):
            seg.append(p)
    if len(seg) < 6:
        print("  4.11 段落数不符，跳过"); return
    set_text(seg[0], "▪ 自训练文物分类器 / 浏览器端部署开源视觉模型：前者需覆盖 10 类材质、10 类用途与数十个朝代，"
                     "标注与训练成本超出项目周期，且每新增一件文物即需重训；后者量化后体积仍在数百 MB 量级，"
                     "首屏加载与移动端内存均不可接受。两条路线一并放弃，改以云端通用视觉模型承担开放域识别"
                     "（见 4.2.1），端侧只保留 31.8 KB 的剪影度量学习模型作兜底（见 4.13）。")
    set_text(seg[1], "▪ 以文生图替代图生图：文生图无法保持原器物的形制、纹饰与色彩关系，生成结果与原物脱节，"
                     "「赋彩」将失去参照意义。故采用图生图，以原照片为条件（见 4.2.4）。")
    set_text(seg[2], "▪ 引入 OpenCV / Pillow 等图像处理库：复原流程仅需灰度化、对比度拉伸与色阶映射等有限算子，"
                     "自实现即可完成；引入第三方库反而增加体积与依赖（见 4.2.5）。")
    set_text(seg[3], "▪ 常驻服务端代理 / 仅绑定单一模型：前者与「零配置、可离线复现」的交付要求冲突，"
                     "故仅保留可选的本机小桥脚本；后者一旦账号未开通该模型即整体不可用，可用性风险过高，"
                     "故设计候选模型顺序探测、缓存复用与本机降级三级机制（见 4.3.1、4.4.1）。")
    drop(seg[4]); drop(seg[5])
    print("  ✓ 4.11 备选方案：6 条 → 4 条")


compress_411()


# ---- 4.15 复测：3 段 → 1 段 ----
def compress_415():
    ps = paras()
    p1 = next((p for p in ps if p.text.startswith("叙事层：22 站按")), None)
    p2 = next((p for p in ps if p.text.startswith("AI 玩法层：")), None)
    p3 = next((p for p in ps if p.text.startswith("复现与在线验证：")), None)
    if not p1:
        print("  4.15 段落不符，跳过"); return
    set_text(p1, "叙事层：22 站按「先露伤口、再给知识」重写，台词 800 行、117 节点、四个结局（三站内心境 + "
                 "隐藏结局「此页无字，有手印一枚」）；隐藏结局的门槛是「支线完成数 + 向文物提问次数 ≥ 3」，"
                 "每站另有一条手写支线，主角是该站「没被三条道选中」的那件文物。AI 玩法层：主线内新增"
                 "「问它一句」「旅途手记」「节点间随机事件」三处模型调用，均按「云端 SDK → 直连密钥 → 本机规则」"
                 "三级降级，共同约束是「AI 只负责表达，事实与走向由本地状态决定」。复现："
                 "python tools/check_mcp.py 8901 → 35/35、node tools/check_agent.js → 28/28、"
                 "node tools/_check_vn.js → 117 节点 / 22 站 / 4 终点；线上 /docs/AI深度自检.html?auto=1 "
                 "可一键跑完 MCP、工具层、RAG 与安全过滤四张卡。确定层延迟见 "
                 "docs/输出稳定性与延迟量化报表.md：1,484 段索引构建 4.75 ms、双路 RRF 检索 0.016 ms、"
                 "同题 20 轮 Top-1 零漂移。")
    drop(p2); drop(p3)
    print("  ✓ 4.15 复测：3 段合并为 1 段")


compress_415()


# ---- 4.4.5 解析兼容：4 条 → 2 条 ----
def compress_445():
    ps = paras()
    seg = [p for p in ps if p.text.strip().startswith("▪ 内容字段兼容")
           or p.text.strip().startswith("▪ 数组格式兼容")
           or p.text.strip().startswith("▪ JSON 提取")
           or p.text.strip().startswith("▪ 空值兜底")]
    if len(seg) < 4:
        print("  4.4.5 段落不符，跳过"); return
    set_text(seg[0], "▪ 字段与结构兼容：同时读取 message.content 与 message.reasoning_content；"
                     "当 content 为数组时（部分模型返回分段结构），拼接各段的 text 字段。")
    set_text(seg[1], "▪ JSON 提取与兜底：用正则 /\\{[\\s\\S]*\\}/ 从含解释文字或代码块的返回中提取 JSON 主体；"
                     "解析失败时抛出带上下文片段的错误（截取前 80~100 字符），便于定位问题。")
    drop(seg[2]); drop(seg[3])
    print("  ✓ 4.4.5 解析兼容：4 条 → 2 条")


compress_445()


# ---- 插图：过高的图按高度封顶（竖构图会独占整页），其余微缩 6% ----
def shrink_figures(ratio=0.94, max_h_cm=9.8):
    n_cap = n_small = 0
    for shp in d.inline_shapes:
        try:
            h, w = shp.height.cm, shp.width.cm
            if h > max_h_cm + 0.6:                       # 竖长大图：按高度封顶
                k = max_h_cm / h
                shp.width = docx.shared.Cm(w * k)
                shp.height = docx.shared.Cm(max_h_cm)
                n_cap += 1
            elif w > 8.6:                                # 其余横图：轻微缩
                shp.width = docx.shared.Cm(w * ratio)
                shp.height = docx.shared.Cm(h * ratio)
                n_small += 1
        except Exception:
            pass
    print(f"  ✓ 插图：高度封顶 {n_cap} 张、微缩 {n_small} 张")


shrink_figures()


# ---- 段距压缩：正文段后 2pt → 1pt，回收零散留白 ----
def tighten_spacing():
    n = 0
    for name in ("Normal",):
        try:
            st = d.styles[name]
            pf = st.paragraph_format
            if pf.space_after and pf.space_after.pt > 1:
                pf.space_after = Pt(1)
                n += 1
        except Exception:
            pass
    print(f"  ✓ 段距压缩：{n} 个样式")


tighten_spacing()

d.save(DST)
print("\n已保存:", DST)
