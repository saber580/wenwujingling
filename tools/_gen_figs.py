# -*- coding: utf-8 -*-
"""生成技术文档架构图 SVG（后续用 Chrome 转 2x PNG）"""
import os

OUT = r"C:\Users\lenovo\Desktop\文物精灵网站\_文档素材"

# ============ 图 3-1 系统总体架构（分层） ============
def arch():
    W, H = 1200, 820
    s = []
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Microsoft YaHei, sans-serif">')
    s.append('<rect width="1200" height="820" fill="#ffffff"/>')
    # 标题
    s.append('<text x="600" y="36" font-size="20" font-weight="bold" text-anchor="middle" fill="#2c2c2a">文物精灵 · 系统总体架构</text>')

    # 分层绘制函数
    def layer(y, h, title, color):
        s.append(f'<rect x="60" y="{y}" width="1080" height="{h}" rx="12" fill="{color}" stroke="#888780" stroke-width="1"/>')
        s.append(f'<text x="80" y="{y+28}" font-size="15" font-weight="bold" fill="#2c2c2a">{title}</text>')

    def box(x, y, w, h, title, sub, fill, stroke, tsize=13):
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
        cy = y + h/2
        if sub:
            s.append(f'<text x="{x+w/2}" y="{cy-3}" font-size="{tsize}" font-weight="bold" text-anchor="middle" fill="#2c2c2a">{title}</text>')
            s.append(f'<text x="{x+w/2}" y="{cy+16}" font-size="11" text-anchor="middle" fill="#5f5e5a">{sub}</text>')
        else:
            s.append(f'<text x="{x+w/2}" y="{cy+4}" font-size="{tsize}" font-weight="bold" text-anchor="middle" fill="#2c2c2a">{title}</text>')

    # 表现层
    layer(60, 130, "表现层 · Presentation", "#E6F1FB")
    box(90, 100, 300, 70, "单页应用 SPA", "hash 路由 · 16 视图 · 红版国风", "#ffffff", "#185FA5")
    box(430, 100, 300, 70, "多模态交互", "识宝拍照 · 语音 · 海报 · 赋彩", "#ffffff", "#185FA5")
    box(770, 100, 340, 70, "响应式布局", "桌面 1440 / 手机 390 双端适配", "#ffffff", "#185FA5")

    # 应用逻辑层
    layer(210, 130, "应用逻辑层 · Application（40 个原生 JS 模块）", "#EAF3DE")
    box(90, 250, 250, 70, "游戏化叙事", "主线 117 节点 · 成就册 · 支线", "#ffffff", "#3B6D11")
    box(370, 250, 250, 70, "玩法引擎", "修复拼图 · 赋彩 · 心仪卡", "#ffffff", "#3B6D11")
    box(650, 250, 250, 70, "状态与存档", "localStorage · 进度对账", "#ffffff", "#3B6D11")
    box(930, 250, 180, 70, "引导与反馈", "新手指引 · 提示条", "#ffffff", "#3B6D11")

    # AI 能力层
    layer(360, 150, "AI 能力层 · Intelligence（云端 + 本机双路）", "#FAEEDA")
    box(90, 400, 250, 90, "云端大模型", "对话 · 识宝 · 图像生成", "#ffffff", "#BA7517")
    box(370, 400, 250, 90, "MCP 工具服务", "8 个只读工具 · JSON-RPC", "#ffffff", "#BA7517")
    box(650, 400, 250, 90, "本机算法引擎", "复原 · 赋彩 · 判卷 · 剪影", "#ffffff", "#BA7517")
    box(930, 400, 180, 90, "降级与兜底", "离线事件池 · 候选切换", "#ffffff", "#BA7517")

    # 数据层
    layer(530, 130, "数据层 · Data", "#F1EFE8")
    box(90, 570, 250, 70, "知识库索引", "1431 片段 · 倒排索引", "#ffffff", "#5F5E5A")
    box(370, 570, 250, 70, "精灵档案", "104 只 · 22 馆 · 20 属性", "#ffffff", "#5F5E5A")
    box(650, 570, 250, 70, "题库与内容层", "707 题 · 对比 · 工艺 · 语料", "#ffffff", "#5F5E5A")
    box(930, 570, 180, 70, "生成素材", "立绘 · 底纹 · 背景", "#ffffff", "#5F5E5A")

    # 基础设施层
    layer(680, 110, "部署层 · Deployment（纯静态 + 轻量服务）", "#FCEBEB")
    box(90, 720, 340, 52, "静态站点（Nginx）", "cdn 加速 · 缓存策略", "#ffffff", "#A32D2D")
    box(470, 720, 340, 52, "Python MCP 网关", "Streamable HTTP / SSE", "#ffffff", "#A32D2D")
    box(850, 720, 260, 52, "第三方模型 API", "多候选顺序探测", "#ffffff", "#A32D2D")

    s.append('</svg>')
    return "\n".join(s)

# ============ 图 4-1 AI 能力流水线 ============
def ai_pipeline():
    W, H = 1200, 720
    s = []
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Microsoft YaHei, sans-serif">')
    s.append('<rect width="1200" height="720" fill="#ffffff"/>')
    s.append('<text x="600" y="36" font-size="20" font-weight="bold" text-anchor="middle" fill="#2c2c2a">AI 能力流水线 · 云端 / 本机双路与降级</text>')

    def box(x, y, w, h, title, sub, fill, stroke):
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
        cy = y + h/2
        s.append(f'<text x="{x+w/2}" y="{cy-3}" font-size="13" font-weight="bold" text-anchor="middle" fill="#2c2c2a">{title}</text>')
        s.append(f'<text x="{x+w/2}" y="{cy+16}" font-size="11" text-anchor="middle" fill="#5f5e5a">{sub}</text>')

    def arrow(x1, y1, x2, y2, label=""):
        s.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#5f5e5a" stroke-width="1.5" marker-end="url(#ar)"/>')
        if label:
            s.append(f'<text x="{(x1+x2)/2}" y="{(y1+y2)/2-8}" font-size="11" text-anchor="middle" fill="#5f5e5a">{label}</text>')

    s.append('<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M2 1L8 5L2 9" fill="none" stroke="#5f5e5a" stroke-width="1.5"/></marker></defs>')

    # 入口
    box(470, 70, 260, 60, "用户输入", "拍照 / 提问 / 拖拽 / 涂色", "#E6F1FB", "#185FA5")
    # 路由
    box(470, 170, 260, 60, "意图路由", "按功能分流到对应引擎", "#F1EFE8", "#5F5E5A")
    arrow(600, 130, 600, 170)

    # 云端路
    box(120, 290, 340, 100, "云端大模型", "对话生成 · 识宝 · 图像", "#FAEEDA", "#BA7517")
    box(120, 430, 340, 80, "MCP 工具（8 个只读）", "检索 · 档案 · 对比 · 核验", "#FAEEDA", "#BA7517")
    box(120, 550, 340, 80, "候选模型探测 + 缓存", "19 候选 · 10s 首字 · 28s 收尾", "#FAEEDA", "#BA7517")

    # 本机路
    box(740, 290, 340, 100, "本机算法引擎", "复原 · 赋彩 · 判卷 · 剪影识别", "#EAF3DE", "#3B6D11")
    box(740, 430, 340, 80, "离线兜底", "事件池 · 规则判别 · 断网可答", "#EAF3DE", "#3B6D11")

    # 出口
    box(470, 620, 260, 60, "结构化输出 + 溯源", "[n] 角标 · 覆盖率核验", "#E6F1FB", "#185FA5")

    arrow(600, 230, 290, 290, "云端")
    arrow(600, 230, 910, 290, "本机")
    arrow(290, 390, 290, 430)
    arrow(290, 510, 290, 550)
    arrow(290, 630, 470, 645)
    arrow(910, 390, 910, 430)
    arrow(910, 510, 760, 645)

    s.append('</svg>')
    return "\n".join(s)

# ============ 图 3-2 数据架构 ============
def data_arch():
    W, H = 1200, 700
    s = []
    s.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Microsoft YaHei, sans-serif">')
    s.append('<rect width="1200" height="700" fill="#ffffff"/>')
    s.append('<text x="600" y="36" font-size="20" font-weight="bold" text-anchor="middle" fill="#2c2c2a">数据架构 · 三层自研结构</text>')

    def box(x, y, w, h, title, lines, fill, stroke):
        s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
        s.append(f'<text x="{x+w/2}" y="{y+26}" font-size="14" font-weight="bold" text-anchor="middle" fill="#2c2c2a">{title}</text>')
        yy = y + 48
        for ln in lines:
            s.append(f'<text x="{x+w/2}" y="{yy}" font-size="12" text-anchor="middle" fill="#444441">{ln}</text>')
            yy += 20

    # 三层
    box(60, 80, 340, 300, "① 站内知识层", ["档案切分 1431 片段", "倒排索引 · BM25", "LSA 语义向量 · RRF 融合", "每条命中带 [n] 角标", "可回溯到原文出处"], "#E6F1FB", "#185FA5")
    box(430, 80, 340, 300, "② 内容层", ["8 组文物对比", "30 条工艺词条", "15 组易混辨析", "100 条真实提问语料", "结构化可比对材料"], "#EAF3DE", "#3B6D11")
    box(800, 80, 340, 300, "③ 评测台", ["108 条带标注用例", "覆盖十个环节", "点击即重跑", "单次约 260ms", "可回归验证"], "#FAEEDA", "#BA7517")

    # 底部闭环说明
    s.append('<rect x="60" y="420" width="1080" height="90" rx="10" fill="#F1EFE8" stroke="#888780" stroke-width="1"/>')
    s.append('<text x="600" y="452" font-size="15" font-weight="bold" text-anchor="middle" fill="#2c2c2a">可回溯 · 可校验 · 可回归 的闭环</text>')
    s.append('<text x="600" y="482" font-size="12" text-anchor="middle" fill="#444441">知识层供检索 → 内容层供比对 → 评测台验证生成质量，三层共同兜底「AI 只负责表达，事实由检索结果保证」</text>')

    # 数据源
    box(430, 550, 340, 80, "底层数据源", ["104 只精灵档案 · 707 道题 · 22 馆 · 20 属性"], "#FCEBEB", "#A32D2D")

    s.append('</svg>')
    return "\n".join(s)


# 写出 SVG
files = {
    "fig3_1_arch.svg": arch(),
    "fig3_2_data.svg": data_arch(),
    "fig4_1_ai.svg": ai_pipeline(),
}
for fn, content in files.items():
    p = os.path.join(OUT, fn)
    with open(p, "w", encoding="utf-8") as f:
        f.write(content)
    print("写出", fn, len(content), "字节")
