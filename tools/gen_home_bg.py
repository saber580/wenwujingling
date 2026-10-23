# -*- coding: utf-8 -*-
"""文物精灵 · 主页焕新背景素材生成器
   生成: 宣纸纹.png(可平铺纸纹) / 山水横卷.png(青绿山水长卷) / 红日.png / 祥云带.png
   输出到: 装饰\    运行: python tools\gen_home_bg.py
   风格与 gen_home_ornaments.py 的线描国风一致(描红/描金, 螺旋云)
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "装饰")
os.makedirs(DST, exist_ok=True)
S = 2  # 超采样

RED    = (181, 67, 47, 255)
RED_D  = (142, 50, 32, 255)
RED_L  = (208, 112, 84, 235)
GOLD   = (201, 162, 39, 255)
GOLD_L = (243, 226, 178, 255)
INK    = (60, 50, 40, 255)
CLEAR  = (0, 0, 0, 0)

def save(im, name, outw=None, outh=None):
    if outw:
        im = im.resize((outw, outh), Image.LANCZOS)
    p = os.path.join(DST, name)
    im.save(p, "PNG", optimize=True)
    print("  ok", name, im.size, "%.1fKB" % (os.path.getsize(p) / 1024))

def lerp4(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(4))

# =========================================================
# ① 宣纸纹.png(256×256 可平铺)
# =========================================================
def paper_tile():
    W = 256
    P = 28                      # 外扩,便于模糊后裁切不留边缝
    im = Image.new("RGBA", (W + 2 * P, W + 2 * P), CLEAR)
    rnd = random.Random(20261016)
    # 大块晕染
    mott = Image.new("RGBA", im.size, CLEAR)
    md = ImageDraw.Draw(mott)
    for _ in range(120):
        x, y = rnd.uniform(-P, W + P), rnd.uniform(-P, W + P)
        r = rnd.uniform(18, 60)
        dark = rnd.random() < 0.55
        col = (236, 228, 210, rnd.randint(20, 34)) if dark else (255, 252, 244, rnd.randint(18, 30))
        for dx in (-W, 0, W):
            for dy in (-W, 0, W):
                md.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=col)
    mott = mott.filter(ImageFilter.GaussianBlur(10))
    im.alpha_composite(mott)
    # 细碎纤维点
    fd = ImageDraw.Draw(im)
    for _ in range(2600):
        x, y = rnd.uniform(-P, W + P), rnd.uniform(-P, W + P)
        r = rnd.uniform(0.4, 1.3)
        col = (208, 196, 172, rnd.randint(14, 28)) if rnd.random() < 0.7 else (255, 253, 246, rnd.randint(16, 30))
        for dx in (-W, 0, W):
            for dy in (-W, 0, W):
                fd.ellipse((x + dx - r, y + dy - r, x + dx + r, y + dy + r), fill=col)
    # 短纤维
    for _ in range(90):
        x, y = rnd.uniform(0, W), rnd.uniform(0, W)
        a = rnd.uniform(0, math.pi)
        L = rnd.uniform(5, 13)
        col = (196, 184, 160, rnd.randint(12, 22))
        for dx in (-W, 0, W):
            for dy in (-W, 0, W):
                fd.line([(x + dx, y + dy), (x + dx + L * math.cos(a), y + dy + L * math.sin(a))], fill=col, width=1)
    return im.crop((P, P, P + W, P + W))

# =========================================================
# ② 山水横卷.png(青绿山水, 透明背景)
# =========================================================
def ridge_pts(W, base, amp, seed, iters=8):
    rnd = random.Random(seed)
    pts = [(0.0, base + rnd.uniform(-amp * 0.5, amp * 0.5)),
           (float(W), base + rnd.uniform(-amp * 0.5, amp * 0.5))]
    a = amp
    for _ in range(iters):
        new = []
        for i in range(len(pts) - 1):
            x0, y0 = pts[i]
            x1, y1 = pts[i + 1]
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2 + rnd.uniform(-a, a)
            new += [pts[i], (mx, my)]
        new.append(pts[-1])
        pts = new
        a *= 0.56
    return pts

def paste_ridge(canvas, pts, c_top, c_bot, gold_edge=None, edge_w=3, blur=1.2):
    W, H = canvas.size
    poly = pts + [(W, H), (0, H)]
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(x * S, y * S) for x, y in poly], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(blur * S))
    grad = Image.new("RGBA", (W, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H):
        gd.line([(0, y), (W, y)], fill=lerp4(c_top, c_bot, y / H))
    layer = Image.new("RGBA", (W, H), CLEAR)
    layer.paste(grad, (0, 0), mask)
    canvas.alpha_composite(layer)
    if gold_edge:
        d = ImageDraw.Draw(canvas)
        d.line([(x * S, y * S) for x, y in pts], fill=gold_edge, width=max(1, int(edge_w * S)), joint="curve")

def mist(canvas, y, alpha, seed, n=9, blur=30):
    W, H = canvas.size
    rnd = random.Random(seed)
    m = Image.new("RGBA", (W, H), CLEAR)
    dd = ImageDraw.Draw(m)
    for _ in range(n):
        x = rnd.uniform(0, W)
        w0, h0 = rnd.uniform(220, 520), rnd.uniform(18, 40)
        yy = y + rnd.uniform(-14, 14)
        for dx in (-W, 0, W):
            dd.ellipse((x + dx - w0 / 2, yy - h0 / 2, x + dx + w0 / 2, yy + h0 / 2),
                       fill=(255, 252, 244, alpha))
    m = m.filter(ImageFilter.GaussianBlur(blur * S))
    canvas.alpha_composite(m)

def wave_cloud(d, x0, y0, L, amp, color, w, spiral_r=14, flip=False):
    pts = [(x0 + i, y0 + amp * math.sin(i / 26.0)) for i in range(0, L, 6)]
    d.line([(x * S, y * S) for x, y in pts], fill=color, width=max(1, int(w * S)), joint="curve")
    cx, cy = pts[-1] if not flip else pts[0]
    sgn = -1 if flip else 1
    steps = 40
    sp = []
    for i in range(steps + 1):
        t = i / steps * 1.35 * 2 * math.pi
        r = spiral_r * (3.2 / 14.0 * spiral_r / 3.2) if False else spiral_r * (2.6 / spiral_r) ** (t / (2 * math.pi))
        a = t + (math.pi if flip else 0)
        sp.append((cx + sgn * r * math.cos(a), cy + r * math.sin(a) * 0.9))
    d.line([(x * S, y * S) for x, y in sp], fill=color, width=max(1, int(w * S)), joint="curve")

def make_scroll():
    W, H = 2560, 820
    canvas = Image.new("RGBA", (W * S, H * S), CLEAR)
    # 天空云线(呼应站点流云)
    sky = Image.new("RGBA", (W * S, H * S), CLEAR)
    ds = ImageDraw.Draw(sky)
    wave_cloud(ds, 120, 150, 480, 16, (180, 80, 58, 95), 3.2, 17)
    wave_cloud(ds, 900, 110, 520, 14, (201, 162, 39, 80), 3.0, 15)
    wave_cloud(ds, 1750, 170, 460, 15, (180, 80, 58, 90), 3.0, 16, flip=True)
    canvas.alpha_composite(sky)
    # 飞鸟
    db = ImageDraw.Draw(canvas)
    for (bx, by) in ((1210, 250), (1270, 225), (1320, 262), (1150, 285), (1390, 238)):
        db.arc([(bx - 19) * S, (by - 10) * S, bx * S, (by + 9) * S], 200, 342, fill=(60, 50, 40, 205), width=int(2.3 * S))
        db.arc([bx * S, (by - 10) * S, (bx + 19) * S, (by + 9) * S], 198, 340, fill=(60, 50, 40, 205), width=int(2.3 * S))
    # 远山
    far = ridge_pts(W, 470, 74, 11, 8)
    paste_ridge(canvas, far, (172, 202, 194, 150), (118, 160, 150, 198))
    mist(canvas, 566, 60, 3)
    # 中山
    mid = ridge_pts(W, 560, 92, 27, 8)
    paste_ridge(canvas, mid, (138, 176, 144, 192), (88, 132, 106, 224), gold_edge=(201, 162, 39, 105), edge_w=2.4)
    mist(canvas, 646, 50, 9, n=7)
    # 近山
    near = ridge_pts(W, 655, 108, 45, 8)
    paste_ridge(canvas, near, (102, 138, 108, 225), (58, 92, 74, 245), gold_edge=(201, 162, 39, 150), edge_w=3)
    return canvas

# =========================================================
# ②b 远山带.png(仅山与雾, 供整页固定背景)
# =========================================================
def make_scene_band(name="远山带.png"):
    W, H = 2560, 560
    canvas = Image.new("RGBA", (W * S, H * S), CLEAR)
    far = ridge_pts(W, 238, 58, 71, 8)
    paste_ridge(canvas, far, (172, 202, 194, 150), (118, 160, 150, 198))
    mist(canvas, 322, 58, 33)
    mid = ridge_pts(W, 332, 72, 83, 8)
    paste_ridge(canvas, mid, (138, 176, 144, 192), (88, 132, 106, 224), gold_edge=(201, 162, 39, 100), edge_w=2.4)
    mist(canvas, 420, 48, 41, n=7)
    near = ridge_pts(W, 432, 90, 97, 8)
    paste_ridge(canvas, near, (102, 138, 108, 228), (56, 90, 72, 248), gold_edge=(201, 162, 39, 145), edge_w=3)
    save(canvas, name, W, H)

# =========================================================
# ③ 红日.png
# =========================================================
def make_sun(name="红日.png", size=520):
    W = size * S
    im = Image.new("RGBA", (W, W), CLEAR)
    halo = Image.new("RGBA", (W, W), CLEAR)
    hd = ImageDraw.Draw(halo)
    steps = 34
    for i in range(steps):
        t = i / steps
        r = W * (0.47 - 0.30 * t)
        alpha = int(4 + 32 * (t ** 2.0))
        hd.ellipse((W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r), fill=(240, 202, 128, alpha))
    halo = halo.filter(ImageFilter.GaussianBlur(14 * S))
    im.alpha_composite(halo)
    d = ImageDraw.Draw(im)
    r = W * 0.17
    d.ellipse((W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r), fill=(203, 84, 60, 235))
    d.ellipse((W / 2 - r, W / 2 - r, W / 2 + r, W / 2 + r), outline=(201, 162, 39, 120), width=int(2.5 * S))
    save(im, name, size, size)

# =========================================================
# ④ 祥云带.png(如意祥云链, 用于分段装饰)
# =========================================================
def ruyi_cloud(d, cx, cy, k, flip=False):
    """把 gen_home_ornaments 的「如意祥云」以 (cx,cy) 为中心缩放 k 重绘"""
    def P(x, y):
        x = (135 - x) if flip else (x - 135)
        return ((cx + x * k) * S, (cy + (y - 92) * k) * S)

    def line(pts, c, w):
        d.line([P(x, y) for x, y in pts], fill=c, width=max(1, int(w * k * S)), joint="curve")

    def arc(box, a0, a1, c, w):
        x0, y0, x1, y1 = box
        p0, p1 = P(x0, y0), P(x1, y1)
        bx = sorted((p0[0], p1[0]))
        by = sorted((p0[1], p1[1]))
        if flip:
            a0, a1 = 360 - a1, 360 - a0
        d.arc([bx[0], by[0], bx[1], by[1]], a0, a1, fill=c, width=max(1, int(w * k * S)))

    def sp(cx0, cy0, r0, r1, turns, start, c, w):
        pts, steps = [], 46
        for i in range(steps + 1):
            t = i / steps * turns * 2 * math.pi
            rr = r0 * (r1 / r0) ** (t / (2 * math.pi))
            a = math.radians(start) + t
            pts.append((cx0 + rr * math.cos(a), cy0 + rr * math.sin(a)))
        line(pts, c, w)

    body = [(20, 100), (20, 78), (44, 52), (74, 44), (104, 34), (134, 36), (160, 30),
            (192, 40), (216, 52), (240, 76), (248, 100), (20, 100)]
    d.polygon([P(x, y) for x, y in body], fill=GOLD_L)
    arc((22, 50, 82, 110), 180, 360, RED_D, 4)
    arc((62, 26, 138, 100), 180, 360, RED_D, 4)
    arc((128, 22, 196, 92), 180, 360, RED_D, 4)
    arc((182, 42, 246, 108), 180, 360, RED_D, 4)
    line([(22, 98), (246, 98)], RED_D, 4)
    sp(44, 84, 17, 5, 1.25, 160, RED_D, 4)
    sp(224, 84, 17, 5, 1.25, 20, RED_D, 4)
    arc((52, 66, 108, 100), 195, 355, RED_L, 3)
    arc((118, 56, 176, 96), 200, 350, RED_L, 3)

def make_cloud_band(name="祥云带.png"):
    W, H = 1720, 170
    im = Image.new("RGBA", (W * S, H * S), CLEAR)
    d = ImageDraw.Draw(im)
    # 连接云线
    pts = [(60 + i, 118 + 12 * math.sin(i / 34.0)) for i in range(0, W - 120, 6)]
    d.line([(x * S, y * S) for x, y in pts], fill=(180, 80, 58, 120), width=int(2.6 * S), joint="curve")
    # 末端螺旋
    for cx, cy, st in ((60, 118, 180), (W - 60, 118, 0)):
        sp = [(cx + 15 * (3.4 / 15) ** (i / 40.0) * math.cos(math.radians(st) + i / 40.0 * 2 * math.pi),
               cy + 15 * (3.4 / 15) ** (i / 40.0) * math.sin(math.radians(st) + i / 40.0 * 2 * math.pi) * 0.9)
              for i in range(41)]
        d.line([(x * S, y * S) for x, y in sp], fill=(180, 80, 58, 140), width=int(2.6 * S), joint="curve")
    ruyi_cloud(d, 350, 78, 0.62)
    ruyi_cloud(d, 880, 86, 0.78, flip=True)
    ruyi_cloud(d, 1390, 78, 0.62)
    save(im, name, W, H)

# =========================================================
# 自检拼图:模拟主页背景观感
# =========================================================
def mock():
    tile = paper_tile()
    W, H = 1800, 980
    bg = Image.new("RGBA", (W, H), (249, 244, 233, 255))
    for y in range(0, H, 256):
        for x in range(0, W, 256):
            bg.alpha_composite(tile, (x, y))
    # 红日
    sun = Image.open(os.path.join(DST, "红日.png")).resize((300, 300), Image.LANCZOS)
    bg.alpha_composite(sun, (W - 470, 60))
    # 横卷(贴底)
    scroll = Image.open(os.path.join(DST, "山水横卷.png")).resize((W, int(W * 820 / 2560)), Image.LANCZOS)
    bg.alpha_composite(scroll, (0, H - 150 - scroll.height))
    # 祥云带
    band = Image.open(os.path.join(DST, "祥云带.png")).resize((860, 85), Image.LANCZOS)
    bg.alpha_composite(band, (60, 40))
    p = os.path.join(ROOT, "tools", "_tmp_bg_view.png")
    bg.convert("RGB").save(p)
    print("  自检拼图①(英雄区) ->", p)
    # ② 固定背景观感:纸纹 + 远山带贴底
    bg2 = Image.new("RGBA", (W, 760), (249, 244, 233, 255))
    for y in range(0, 760, 256):
        for x in range(0, W, 256):
            bg2.alpha_composite(tile, (x, y))
    sb = Image.open(os.path.join(DST, "远山带.png")).resize((W, int(W * 560 / 2560)), Image.LANCZOS)
    bg2.alpha_composite(sb, (0, 760 - 40 - sb.height))
    p2 = os.path.join(ROOT, "tools", "_tmp_bg_view2.png")
    bg2.convert("RGB").save(p2)
    print("  自检拼图②(固定背景) ->", p2)

if __name__ == "__main__":
    print("生成主页焕新素材 →", DST)
    save(paper_tile(), "宣纸纹.png")
    save(make_scroll(), "山水横卷.png", 2560, 820)
    make_scene_band()
    make_sun()
    make_cloud_band()
    mock()
