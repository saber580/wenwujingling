# -*- coding: utf-8 -*-
"""生成矢量山水背景(纯程序绘制,不依赖照片)→ 背景\水墨山.svg / 背景\青绿山.svg
   用途:一·青绿山水(青绿山.svg)/ 二·水墨烟雨(水墨山.svg)/
        三·鎏金宫阙(水墨山.svg 加金滤镜)/ 四·天青青花(水墨山.svg 加青滤镜)
   改山形:调 RIDGES 的 base_y / 振幅 / 频率相位;改配色:调 FILES 里各层的填充色,改完跑一遍本脚本。"""
import math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1600, 620           # 画布;山脊集中在下半部,上部留天空(宽屏裁切只裁到留白)
N = 150                    # 每条山脊采样点数

# 山脊参数(两张图共用同一山形):(基准线 y, [(频率, 振幅, 相位), ...])
RIDGES = [
    (238, [(1.0, 44, 0.7), (2.4, 24, 2.4), (5.3, 11, 4.6)]),
    (338, [(0.8, 56, 1.9), (2.1, 28, 4.1), (4.4, 13, 0.9)]),
    (468, [(0.6, 70, 3.1), (1.7, 36, 5.4), (3.5, 15, 1.6)]),
    (582, [(0.5, 56, 4.7), (1.3, 32, 1.3), (3.1, 13, 3.6)]),
]
# 输出文件:(文件名, 标题, 雁群颜色, [(填充色, 不透明度, 山脊金描线色或 None) × 4 层(由远及近)])
FILES = [
    ("水墨山.svg", "水墨山 · 程序绘制矢量背景", "#4c585f", [
        ("#b9c3c8", 0.55, None),
        ("#95a3aa", 0.66, None),
        ("#5e6c75", 0.80, None),
        ("#3c4851", 0.92, None),
    ]),
    ("青绿山.svg", "青绿山 · 程序绘制矢量背景", "#3f6b5f", [
        ("#aec9c3", 0.52, None),
        ("#7fb3a0", 0.66, None),
        ("#4f8f84", 0.82, None),
        ("#2f6b62", 0.92, "#e2bd72"),
    ]),
]
# 雁群:(x, y, 缩放, 旋转角)
BIRDS = [(1048, 252, 1.15, 0), (1192, 222, 0.88, -7)]


def ridge_pts(base_y, comps):
    pts = []
    for i in range(N + 1):
        x = W * i / N
        hgt = 0.0
        for freq, amp, ph in comps:
            hgt += amp * (0.55 + 0.45 * math.sin(2 * math.pi * freq * i / N + ph))
        pts.append((x, base_y - hgt))
    return pts


def smooth_d(pts):
    """Catmull-Rom → 三次贝塞尔(开口山脊线)"""
    d = "M%.1f %.1f" % pts[0]
    m = len(pts)
    for i in range(m - 1):
        p0 = pts[i - 1] if i > 0 else pts[i]
        p1, p2 = pts[i], pts[i + 1]
        p3 = pts[i + 2] if i + 2 < m else pts[i + 1]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6.0, p1[1] + (p2[1] - p0[1]) / 6.0)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6.0, p2[1] - (p3[1] - p1[1]) / 6.0)
        d += "C%.1f %.1f %.1f %.1f %.1f %.1f" % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    return d


def build(name, title, bird_color, layers):
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H)]
    parts.append("<title>%s</title>" % title)
    for (base_y, comps), (fill, op, edge) in zip(RIDGES, layers):
        ridge = smooth_d(ridge_pts(base_y, comps))
        parts.append('<path d="%sL%.1f %.1fL0 %.1fZ" fill="%s" fill-opacity="%s"/>' % (ridge, W, H, H, fill, op))
        if edge:
            parts.append('<path d="%s" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" stroke-opacity="0.3"/>' % (ridge, edge))
    bird = "M0 0q7 -9 14 0q7 -9 14 0"
    for x, y, sc, rot in BIRDS:
        parts.append('<g transform="translate(%s %s) scale(%s) rotate(%s)" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round" opacity="0.62"><path d="%s"/></g>' % (x, y, sc, rot, bird_color, bird))
    parts.append("</svg>")
    out = os.path.join(ROOT, "背景", name)
    with open(out, "w", encoding="utf-8", newline="") as f:
        f.write("".join(parts))
    print("ok %s %.1f KB" % (out, os.path.getsize(out) / 1024))


for _name, _title, _bc, _layers in FILES:
    build(_name, _title, _bc, _layers)
