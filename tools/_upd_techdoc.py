# -*- coding: utf-8 -*-
"""技术文档 v1.14 → v1.15：把规模数字对齐 2026-11-10 的真实仓库，并重写 4.14 节。

只做两件事：
  ① 关键数字一致性替换（精灵数、站数、题量、代码行数、脚本数、提交数）
  ② 4.14 节 9 个段落整段重写 + 表 4-5 换成六维评分对照

不改版式、不动图片、不增删段落，页数应与原稿一致（≤30 页）。
"""
import sys
import docx
from docx.oxml.ns import qn

SRC = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.14.docx"
DST = r"C:\Users\lenovo\Desktop\文物精灵网站\01-技术文档-文物精灵-v1.15.docx"

d = docx.Document(SRC)


def set_text_keep_style(p, text):
    """保留段落与首个 run 的字体格式，整段换成 text。"""
    runs = p.runs
    if not runs:
        p.add_run(text)
        return
    runs[0].text = text
    for r in runs[1:]:
        r.text = ""


def sub(p, old, new):
    """段落内子串替换：先逐 run，失败则整段重建（保留首 run 格式）。"""
    if old not in p.text:
        return False
    for r in p.runs:
        if old in r.text:
            r.text = r.text.replace(old, new)
            return True
    full = p.text.replace(old, new)
    set_text_keep_style(p, full)
    return True


PARA = {i: p for i, p in enumerate(d.paragraphs)}

# ---------- ① 数字一致性 ----------
REPL = {
    67: [("5 个页面、23 个 JavaScript 模块、11 个样式表，合计 32,384 行代码（HTML 5,846 行、CSS 6,573 行、JavaScript 19,965 行）",
          "单页入口、40 个 JavaScript 模块、17 个样式表，合计 48,193 行代码（HTML 1,118 行、CSS 8,425 行、JavaScript 38,650 行）"),
         ("74 只文物精灵、557 道题目、20 类属性、12 家博物馆",
          "104 只文物精灵、707 道题目、20 类属性、22 家博物馆"),
         ("37 个构建与校验脚本，Git 提交 43 次", "91 个构建与校验脚本，Git 提交 109 次")],
    83: [("70 件（组）文物", "104 件（组）文物")],
    90: [("74 只文物精灵：12 个地市站点 51 只、隐藏「华夏」站 16 只、初始赠送 7 只，合计 74 只",
          "104 只文物精灵：河北 11 站 44 只、省外 11 馆 37 只、隐藏「华夏」站 16 只、初始赠送 7 只，合计 104 只")],
    92: [("557 道题：精灵自述题 476 道", "707 道题：精灵自述题 626 道")],
    96: [("32,384 行代码：HTML 5,846 行、CSS 6,573 行、JavaScript 19,965 行，分 5 个页面、23 个 JavaScript 模块、11 个样式表",
          "48,193 行代码：HTML 1,118 行、CSS 8,425 行、JavaScript 38,650 行，分 40 个 JavaScript 模块、17 个样式表")],
    97: [("43 次 Git 提交与 37 个工程脚本", "109 次 Git 提交与 91 个工程脚本")],
    122: [("12 座河北博物馆的介绍", "22 家博物馆（河北 11 家 + 省外 11 家）的介绍")],
    133: [("站内固定的 70 只精灵", "站内固定的 104 只精灵")],
    135: [("533 道题、70 只精灵、20 类属性", "707 道题、104 只精灵、20 类属性")],
    144: [("STATIONS[13]", "STATIONS[23]"), ("SPIRITS[id:70]", "SPIRITS[id:104]"),
          ("POSTER_META[70]", "POSTER_META[104]"), ("MUSEUMS[12]", "MUSEUMS[22]"),
          ("HB-001~070", "HB-001~104")],
    166: [("站内仅设 70 个类别", "站内仅设 104 个类别")],
    168: [("不受 70 类限制", "不受 104 类限制")],
    238: [("74 只精灵、441 条知识条目、476 道考点题", "104 只精灵、591 条知识条目、626 道考点题"),
          ("1,431 个知识片段", "1,484 个知识片段")],
    243: [("站内 74 只精灵", "站内 104 只精灵")],
    392: [("HB-001~070", "HB-001~104")],
    425: [("557 道题 / 74 只精灵", "707 道题 / 104 只精灵")],
    427: [("共有 37 个脚本", "共有 91 个脚本")],
    473: [("13 个站点、70 只精灵、20 类属性、533 道题", "23 个站点、104 只精灵、20 类属性、707 道题")],
    491: [("当前的 13 站结构", "当前的 23 站结构（河北 11 站 + 省外 11 馆 + 隐藏「华夏」站）")],
}

miss = []
for idx, pairs in REPL.items():
    for old, new in pairs:
        if not sub(PARA[idx], old, new):
            miss.append((idx, old[:36]))
if miss:
    print("!! 未命中：")
    for m in miss:
        print("   P%d  %s" % m)
else:
    print("① 数字替换全部命中")

# ---------- ② 4.14 重写 ----------
T = {
 313: "4.14　AI 玩法与叙事终版与省赛复测（2026-11-10）",
 314: ("本节记录 11-09 至 11-10 两天的收口工作与复测结果。此前系统的 AI 能力集中在外围工具（识别、茶话会、赋彩），"
       "主线仍是一条「到站 → 报年代 → 文物说你来了」的线性流程，AI 与叙事是两张皮。本轮把 AI 放进主线，把叙事做成可收集的结构，"
       "并补齐地图与成就两处长期缺口。所有数字取自 2026-11-10 的本地仓库与线上站点，可按本节末尾命令复现；"
       "表 4-5 为按省赛细则逐项的自评，不是评委给分。"),
 315: "表 4-5　省赛六维评分对照与实测证据（自评，2026-11-10）",
 316: ("叙事层：22 站全部按「先露伤口、再给知识」重写——台词由 517 行增至 800 行、21,865 字增至 23,039 字，"
       "112 节点扩至 117 节点，四个结局（三站内心境 + 隐藏结局「此页无字，有手印一枚」）。隐藏结局的门槛不是通关次数，"
       "而是「支线完成数 + 向文物提问次数 ≥ 3」——玩家必须先愿意多问一句、多走一段，才看得见那个不写名字的结局。"
       "每站另有一条手写支线，主角是该站「没被三条道选中」的那件文物，与「被忽视的文物」母题同构。"
       "结构仍由 VN_STATIONS 自动构链，tools/_check_vn.js 校验 117 节点 / 22 站 / 4 终点，tools/_walk_vn.js 随机走 300 遍全部走通。"),
 317: ("AI 玩法层：主线内新增三处模型调用，且都做了「云端 SDK → 直连密钥 → 本机规则」的三级降级。"
       "其一「问它一句」：捕捉节点可自由提问，模型以当前文物口吻作答，只允许引用该器物的档案字段，答不上来时由本机关键词表兜底；"
       "其二「旅途手记」：终章按玩家真实路径、家乡与结局生成一封私信，把「你这一路」收束成一句能被记住的话；"
       "其三「节点间随机事件」：节点走完后按 50% 概率插入该节点专属事件，云端可用时现场写、断网用本机事件池。"
       "三处调用的共同约束是「AI 只负责表达，事实与走向由本地状态决定」，断网时叙事不会断裂，只会换一种声音说话。"
       "确定层的延迟与稳定性另见 docs/输出稳定性与延迟量化报表.md：1484 段索引构建 4.75 ms、双路 RRF 检索 0.016 ms、同题 20 轮 top1 零漂移。"),
 318: "复现（启动 PORT=8901 NO_BROWSER=1 python server.py 后）：",
 319: "python tools/check_mcp.py 8901　→ 35/35　　node tools/check_agent.js　→ 28/28",
 320: "node tools/_check_vn.js　→ 117 节点 / 22 站 / 4 终点　　node tools/_walk_vn.js　→ 300/300",
 321: ("在线验证无需命令行：/docs/AI深度自检.html?auto=1 自动跑完四张卡（MCP 握手 6/6、工具层 7/7、RAG 双路召回与出处、安全过滤）；"
       "#/achieve 为成就册（11 枚成就全部读真实进度，三列空出的第 12 格压暗留白）；首页为全国地图（22 枚图钉按省级边界投影，"
       "标签按牌面矩形避让，窄屏自动收图标）。线上复测：首页与全部静态资源 200，/mcp 8 工具、/api/rag 双路融合、/api/tts 与 /api/llm 正常，真浏览器 JS 异常 0。"),
}
for i, txt in T.items():
    set_text_keep_style(PARA[i], txt)
print("② 4.14 九段重写完成")

# ---------- 表 4-5 ----------
body = d.element.body
target = None
seen_title = False
for ch in body.iterchildren():
    if ch.tag == qn("w:p"):
        t = "".join(n.text or "" for n in ch.iter(qn("w:t")))
        if t.startswith("表 4-5"):
            seen_title = True
    elif ch.tag == qn("w:tbl") and seen_title:
        target = ch
        break

rows_data = [
    ("评分项（满分）", "自评", "实现位置", "2026-11-10 实测证据"),
    ("MCP / 工具集成（4）", "4.0", "mcp/、js/mcp-client.js", "35/35；线上 tools/list 8 工具、tools/call 真执行、SSE 首帧正常"),
    ("大模型集成质量（8）", "8.0", "prompts/registry.json、js/cloud-ai.js", "输出稳定性与延迟报表：索引 4.75 ms、双路 RRF 0.016 ms、同题 20 轮 top1 零漂移"),
    ("Agent / 工作流（8）", "7.8", "js/agent.js、js/aw-vn.js", "28/28；主线三处 AI 玩法（问它一句 / 旅途手记 / 随机事件）均三级降级，断网可用"),
    ("RAG 技术应用（6）", "5.5", "mcp/hybrid_rag.py、js/kb-rag.js", "1484 段档案，BM25 + LSA 128 维 → RRF(k=60)；消融 hit@3 1.000→0.909"),
    ("多模态能力（5）", "4.5", "js/voice.js、tts_service.py", "识宝 → 语音讲解 → 赋彩海报闭环；292 段 TTS + 卷积混响 DSP"),
    ("AI 安全与可控（4）", "3.5", "js/safety.js、prompts/registry.json", "输入拦注入与越权、PII 脱敏；关过滤后拦截 2/2→0/2，悬空引用 0→14"),
    ("合计", "88.3", "六维加权", "AI 33.3 + 创新 22.5 + 前端 7.5 + 实用 9.0 + 体验 8.5 + 商业 7.5；11-06 基线 86.0（自评，非评委给分）"),
]


def set_cell(cell, text):
    """整格换文字：保留首段首 run 的格式，删掉多余段落与 run。"""
    ps = cell.paragraphs
    for extra in ps[1:]:
        extra._element.getparent().remove(extra._element)
    p = cell.paragraphs[0]
    runs = p.runs
    if runs:
        runs[0].text = text
        for r in runs[1:]:
            r._element.getparent().remove(r._element)
    else:
        p.add_run(text)


if target is None:
    print("!! 未找到表 4-5")
else:
    from docx.table import Table
    tb = Table(target, d)
    print("   表 4-5 原行数", len(tb.rows), "列数", len(tb.columns))
    for row, data in zip(tb.rows, rows_data):
        for c, val in zip(row.cells, data):
            set_cell(c, val)
    print("③ 表 4-5 已更新为六维对照")

d.save(DST)
print("已保存", DST)
