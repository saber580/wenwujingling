# -*- coding: utf-8 -*-
"""文物精灵 · 中国风装饰素材生成器
   生成标题云纹 / 中国结 / 青铜鼎 / 印章、六种卡片纹样边框(九宫格切片)、
   万字&冰裂底纹、河北地图、以及一张「边框样例」自检图。
   输出到: 装饰\    运行: python tools\gen_home_ornaments.py
"""
import os, math, random, json
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, "装饰")
os.makedirs(DST, exist_ok=True)
S = 4  # 超采样倍数

# ---------------- 颜色 ----------------
RED     = (181, 67, 47, 255)
RED_D   = (142, 50, 32, 255)
RED_L   = (208, 112, 84, 235)
GOLD    = (201, 162, 39, 255)
GOLD_D  = (166, 128, 30, 255)
GOLD_L  = (243, 226, 178, 255)
BRONZE  = (122, 92, 53, 255)
BRONZE_D= (92, 68, 38, 255)
PATINA  = (96, 122, 96, 255)
PATINA_D= (72, 96, 74, 255)
PATINA_L= (188, 206, 178, 255)
BLUE    = (45, 95, 168, 255)
BLUE_D  = (33, 72, 130, 255)
BLUE_L  = (176, 200, 232, 235)
ICE     = (112, 142, 168, 170)
OCHRE   = (163, 88, 47, 255)
INK     = (60, 50, 40, 255)
PAPER_W = (253, 250, 242, 255)
CLEAR   = (0, 0, 0, 0)

# ---------------- 基础工具 ----------------
def new(w, h, bg=CLEAR):
    im = Image.new("RGBA", (w * S, h * S), bg)
    return im, ImageDraw.Draw(im)

def fin(im, w, h, name):
    im = im.resize((w, h), Image.LANCZOS)
    p = os.path.join(DST, name)
    im.save(p, "PNG", optimize=True)
    print("  ok", name, "%dx%d" % (w, h), "%.1fKB" % (os.path.getsize(p) / 1024))

def line(d, pts, color, w=4):
    d.line([(x * S, y * S) for x, y in pts], fill=color, width=max(1, int(w * S)), joint="curve")

def ellipse(d, box, fill=None, outline=None, w=0):
    d.ellipse([c * S for c in box], fill=fill, outline=outline, width=int(w * S))

def rrect(d, box, r, fill=None, outline=None, w=0):
    d.rounded_rectangle([c * S for c in box], radius=r * S, fill=fill, outline=outline, width=int(w * S))

def arc(d, box, a0, a1, color, w=4):
    d.arc([c * S for c in box], a0, a1, fill=color, width=int(w * S))

def poly(d, pts, fill=None, outline=None, w=0):
    d.polygon([(x * S, y * S) for x, y in pts], fill=fill, outline=outline, width=int(w * S))

def spiral(d, cx, cy, r0, r1, turns, start_deg, color, w=4):
    pts, steps = [], max(28, int(52 * turns))
    for i in range(steps + 1):
        t = i / steps * turns * 2 * math.pi
        r = r0 * (r1 / r0) ** (t / (2 * math.pi))
        a = math.radians(start_deg) + t
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    line(d, pts, color, w)

_FONTS = {}
def font(size, bold=False):
    key = (size, bold)
    if key not in _FONTS:
        path = r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"
        try:
            _FONTS[key] = ImageFont.truetype(path, int(size * S))
        except Exception:
            _FONTS[key] = ImageFont.load_default()
    return _FONTS[key]

def text(d, xy, s, f, color, anchor="la"):
    d.text((xy[0] * S, xy[1] * S), s, font=f, fill=color, anchor=anchor)

def paste_rot_text(im, center, s, f, color, angle):
    tw, th = int(f.getlength(s)) + 12 * S, int(f.size) + 12 * S
    tmp = Image.new("RGBA", (tw, th), CLEAR)
    ImageDraw.Draw(tmp).text((tw / 2, th / 2), s, font=f, fill=color, anchor="mm")
    tmp = tmp.rotate(angle, expand=True, resample=Image.BICUBIC)
    im.alpha_composite(tmp, (int(center[0] * S - tmp.width / 2), int(center[1] * S - tmp.height / 2)))

# =================================================
# 九宫格边框框架:画「上中格」和「上左角」两块,其余镜像/旋转拼出
# =================================================
def compose9(name, draw_edge, draw_corner, w=240, cell=80):
    im, d = new(w, w)
    im_e, d_e = new(cell, cell); draw_edge(d_e)
    im_c, d_c = new(cell, cell); draw_corner(d_c)
    e = im_e
    im.alpha_composite(e, (cell * S, 0))                                        # 上
    im.alpha_composite(e.transpose(Image.FLIP_TOP_BOTTOM), (cell * S, 2 * cell * S))   # 下
    im.alpha_composite(e.transpose(Image.ROTATE_90), (0, cell * S))             # 左
    im.alpha_composite(e.transpose(Image.ROTATE_270), (2 * cell * S, cell * S)) # 右
    c = im_c
    im.alpha_composite(c, (0, 0))
    im.alpha_composite(c.transpose(Image.FLIP_LEFT_RIGHT), (2 * cell * S, 0))
    im.alpha_composite(c.transpose(Image.FLIP_TOP_BOTTOM), (0, 2 * cell * S))
    im.alpha_composite(c.transpose(Image.ROTATE_180), (2 * cell * S, 2 * cell * S))
    fin(im, w, w, name)

def apply_frame9(card, frame, border=22, cell=80):
    """把九宫格边框贴到卡片上(模拟 CSS border-image / round);frame 为已降采样的 240 图"""
    W, H = card.size
    f = frame
    sc = border / cell
    tl = f.crop((0, 0, cell, cell)).resize((border, border), Image.LANCZOS)
    tr = f.crop((2 * cell, 0, 3 * cell, cell)).resize((border, border), Image.LANCZOS)
    bl = f.crop((0, 2 * cell, cell, 3 * cell)).resize((border, border), Image.LANCZOS)
    br = f.crop((2 * cell, 2 * cell, 3 * cell, 3 * cell)).resize((border, border), Image.LANCZOS)
    et = f.crop((cell, 0, 2 * cell, cell))
    tw = max(1, int(cell * sc))
    tile = et.resize((tw, border), Image.LANCZOS)
    for x in range(border, W - border, tw):
        card.alpha_composite(tile.crop((0, 0, min(tw, W - border - x), border)), (x, 0))
    bt = tile.transpose(Image.FLIP_TOP_BOTTOM)
    for x in range(border, W - border, tw):
        card.alpha_composite(bt.crop((0, 0, min(tw, W - border - x), border)), (x, H - border))
    lt = tile.transpose(Image.ROTATE_90)
    for y in range(border, H - border, tw):
        card.alpha_composite(lt.crop((0, 0, border, min(tw, H - border - y))), (0, y))
    rt = tile.transpose(Image.ROTATE_270)
    for y in range(border, H - border, tw):
        card.alpha_composite(rt.crop((0, 0, border, min(tw, H - border - y))), (W - border, y))
    card.alpha_composite(tl, (0, 0)); card.alpha_composite(tr, (W - border, 0))
    card.alpha_composite(bl, (0, H - border)); card.alpha_composite(br, (W - border, H - border))

# =================================================
# ① 回纹框
# =================================================
def hui_spiral(d, x0, ytop, ybot, uw, color, w=5):
    pts = [(x0 + 3, ybot), (x0 + 3, ytop), (x0 + uw - 3, ytop), (x0 + uw - 3, ybot),
           (x0 + 11, ybot), (x0 + 11, ytop + 16), (x0 + uw - 11, ytop + 16), (x0 + uw - 11, ybot - 12)]
    line(d, pts, color, w)

def hui_edge(d):
    line(d, [(2, 4.5), (78, 4.5)], RED_D, 4)      # 外线
    line(d, [(2, 75.5), (78, 75.5)], RED_D, 4)    # 内线
    for k in range(2):
        hui_spiral(d, k * 40, 14, 66, 40, RED_D, 5)

def hui_corner(d):
    line(d, [(8, 4.5), (80, 4.5)], RED_D, 4)
    line(d, [(4.5, 8), (4.5, 80)], RED_D, 4)
    line(d, [(8, 75.5), (80, 75.5)], RED_D, 4)
    line(d, [(75.5, 8), (75.5, 80)], RED_D, 4)
    pts = [(16, 64), (16, 16), (64, 16), (64, 64), (30, 64), (30, 30), (50, 30), (50, 50)]
    line(d, pts, RED_D, 7)
    ellipse(d, (10, 10, 24, 24), fill=RED_D)

# =================================================
# ② 缠枝莲框
# =================================================
def vine(d, x0, amp, y=40, color=BLUE, w=3.5):
    pts = [(x0 + i, y + amp * math.sin(2 * math.pi * i / 80)) for i in range(0, 81, 4)]
    line(d, pts, color, w)

def lotus(d, cx, cy, r, outline=BLUE, fill=None):
    for i in range(5):
        a = -math.pi / 2 + i * 2 * math.pi / 5
        px, py = cx + math.cos(a) * r * 0.62, cy + math.sin(a) * r * 0.62
        ellipse(d, (px - r * 0.5, py - r * 0.5, px + r * 0.5, py + r * 0.5), fill=fill, outline=outline, w=3)
    ellipse(d, (cx - r * 0.3, cy - r * 0.3, cx + r * 0.3, cy + r * 0.3), fill=outline)

def chanzhi_edge(d):
    line(d, [(2, 4.5), (78, 4.5)], BLUE, 3)
    line(d, [(2, 75.5), (78, 75.5)], BLUE, 3)
    vine(d, 0, 12, 58, BLUE, 3.5)
    vine(d, 0, 9, 22, BLUE_L if False else BLUE, 2.6)
    lotus(d, 40, 40, 16)
    for xx in (0, 80):
        ellipse(d, (xx - 4, 40 - 4, xx + 4, 40 + 4), fill=BLUE)
        for i in range(3):
            a = -math.pi / 2 + i * 2 * math.pi / 3
            px, py = xx + math.cos(a) * 11, 40 + math.sin(a) * 11
            ellipse(d, (px - 2.5, py - 2.5, px + 2.5, py + 2.5), fill=BLUE_L)

def chanzhi_corner(d):
    line(d, [(10, 4.5), (80, 4.5)], BLUE, 3)
    line(d, [(4.5, 10), (4.5, 80)], BLUE, 3)
    line(d, [(14, 75.5), (80, 75.5)], BLUE, 3)
    line(d, [(75.5, 14), (75.5, 80)], BLUE, 3)
    spiral(d, 26, 26, 20, 4, 1.5, -90, BLUE, 4)
    lotus(d, 40, 40, 15)
    arc(d, (26, 26, 62, 62), 0, 90, BLUE, 3)

# =================================================
# ③ 忍冬框(魏晋隋唐卷草)
# =================================================
def honeysuckle_leaf(d, cx, cy, sc, color=OCHRE, flip=1):
    for i, (dx, dy) in enumerate(((-7, 0), (0, -2), (7, 0))):
        rr = 7 - abs(i - 1) * 1.5
        ellipse(d, (cx + (dx - rr) * sc, cy + (dy - rr) * sc * flip, cx + (dx + rr) * sc, cy + (dy + rr) * sc * flip),
                outline=color, w=2.6)
    line(d, [(cx - 12 * sc, cy + 6 * sc * flip), (cx, cy + 10 * sc * flip), (cx + 12 * sc, cy + 6 * sc * flip)], color, 2.4)

def rendong_edge(d):
    line(d, [(2, 4.5), (78, 4.5)], OCHRE, 3)
    line(d, [(2, 75.5), (78, 75.5)], OCHRE, 3)
    vine(d, 0, 13, 40, OCHRE, 3)
    honeysuckle_leaf(d, 40, 34, 1.0, OCHRE, 1)
    for xx in (0, 80):
        spiral(d, xx, 40, 14, 3, 1.1, 0 if xx else 180, OCHRE, 3)

def rendong_corner(d):
    line(d, [(12, 4.5), (80, 4.5)], OCHRE, 3)
    line(d, [(4.5, 12), (4.5, 80)], OCHRE, 3)
    line(d, [(16, 75.5), (80, 75.5)], OCHRE, 3)
    line(d, [(75.5, 16), (75.5, 80)], OCHRE, 3)
    spiral(d, 30, 30, 22, 4, 1.6, -90, OCHRE, 4)
    honeysuckle_leaf(d, 44, 44, 1.2, OCHRE, 1)

# =================================================
# ④ 饕餮框(青铜目纹)
# =================================================
def taotie_eye(d, cx, cy, sc=1.0, color=PATINA_D):
    arc(d, (cx - 13 * sc, cy - 8 * sc, cx + 13 * sc, cy + 10 * sc), 195, 345, color, 3.4)
    arc(d, (cx - 13 * sc, cy - 10 * sc, cx + 13 * sc, cy + 8 * sc), 15, 165, color, 3.4)
    ellipse(d, (cx - 4.6 * sc, cy - 4.6 * sc, cx + 4.6 * sc, cy + 4.6 * sc), fill=color)
    line(d, [(cx - 15 * sc, cy - 13 * sc), (cx, cy - 19 * sc), (cx + 15 * sc, cy - 13 * sc)], color, 3.2)
    spiral(d, cx, cy + 15 * sc, 8 * sc, 2.4 * sc, 1.1, 90, color, 2.6)

def taotie_edge(d):
    line(d, [(2, 5), (78, 5)], PATINA_D, 3.4)
    line(d, [(2, 75), (78, 75)], PATINA_D, 3.4)
    for k in range(2):
        taotie_eye(d, 20 + k * 40, 36, 1.0)
        spiral(d, 40 * k, 40, 10, 3, 1.2, 90 if k == 0 else 270, PATINA, 2.6)
    line(d, [(20, 62), (20, 70)], PATINA_D, 2.4)

def taotie_corner(d):
    line(d, [(14, 5), (80, 5)], PATINA_D, 3.4)
    line(d, [(5, 14), (5, 80)], PATINA_D, 3.4)
    line(d, [(18, 75), (80, 75)], PATINA_D, 3.4)
    line(d, [(75, 18), (75, 80)], PATINA_D, 3.4)
    taotie_eye(d, 38, 35, 1.35)
    spiral(d, 26, 62, 13, 3.4, 1.3, 90, PATINA, 3)

# =================================================
# ⑤ 如意框
# =================================================
def ruyi_head(d, cx, cy, r, outline=GOLD_D, w=3.6, deg=0):
    a = math.radians(deg)
    ca, sa = math.cos(a), math.sin(a)
    def T(x, y):
        return (cx + x * ca - y * sa, cy + x * sa + y * ca)
    ellipse(d, (cx - r, cy - r, cx + r, cy + r), outline=outline, w=w)
    p1, p2, p3 = T(-r * 0.55, r * 0.3), T(0, r * 1.35), T(r * 0.55, r * 0.3)
    line(d, [p1, p2, p3], outline, w)
    line(d, [T(0, -r), T(0, -r * 0.2)], outline, w * 0.71)

def ruyi_edge(d):
    line(d, [(2, 5), (78, 5)], GOLD_D, 3)
    line(d, [(2, 75), (78, 75)], GOLD_D, 3)
    vine(d, 0, 10, 40, GOLD_D, 3)
    ruyi_head(d, 20, 40, 13)
    ruyi_head(d, 60, 40, 13)
    for xx in (0, 80):
        ellipse(d, (xx - 3, 37, xx + 3, 43), fill=GOLD_D)

def ruyi_corner(d):
    line(d, [(10, 5), (80, 5)], GOLD_D, 3)
    line(d, [(5, 10), (5, 80)], GOLD_D, 3)
    line(d, [(14, 75), (80, 75)], GOLD_D, 3)
    line(d, [(75, 14), (75, 80)], GOLD_D, 3)
    ruyi_head(d, 36, 36, 17, deg=180)
    ruyi_head(d, 62, 62, 12, deg=0)

# =================================================
# ⑥ 冰裂框(青瓷开片)
# =================================================
def ice_cracks(d, x0, y0, w, h, n, seed, color=ICE, lw=2.0, vert=False):
    rnd = random.Random(seed)
    for i in range(n):
        if vert:
            x = x0 + rnd.random() * w
            pts = [(x, y0)]
            y = y0
            while y < y0 + h:
                y += rnd.uniform(14, 30)
                x += rnd.uniform(-11, 11)
                pts.append((min(max(x, x0 + 2), x0 + w - 2), min(y, y0 + h)))
        else:
            y = y0 + rnd.random() * h
            pts = [(x0, y)]
            x = x0
            while x < x0 + w:
                x += rnd.uniform(16, 34)
                y += rnd.uniform(-10, 10)
                pts.append((min(x, x0 + w), min(max(y, y0 + 2), y0 + h - 2)))
        line(d, pts, color, lw)

def binglie_edge(d):
    line(d, [(2, 4), (78, 4)], ICE, 2.6)
    line(d, [(2, 76), (78, 76)], ICE, 2.6)
    ice_cracks(d, 0, 8, 80, 64, 5, 11)

def binglie_corner(d):
    line(d, [(10, 4), (80, 4)], ICE, 2.6)
    line(d, [(4, 10), (4, 80)], ICE, 2.6)
    line(d, [(12, 76), (80, 76)], ICE, 2.6)
    line(d, [(76, 12), (76, 80)], ICE, 2.6)
    ice_cracks(d, 8, 8, 64, 30, 4, 23)
    ice_cracks(d, 8, 8, 64, 30, 3, 29, vert=True)

# =================================================
# ⑦ 夔龙角 ⑧ 底纹 ⑨ 云纹 ⑩ 鼎 ⑪ 中国结 ⑫ 印章
# =================================================
def kuilong():
    im, d = new(160, 160)
    # 身躯大涡卷
    spiral(d, 82, 92, 48, 13, 1.55, -80, PATINA, 9)
    # 龙头(涡卷外端,朝上)
    poly(d, [(64, 46), (60, 30), (66, 20), (80, 16), (90, 24), (88, 38), (76, 48)],
         fill=PATINA_L, outline=PATINA, w=4)
    line(d, [(62, 40), (74, 44)], PATINA, 3)          # 嘴缝
    ellipse(d, (70, 27, 79, 36), fill=PATINA_D)       # 眼
    line(d, [(84, 19), (93, 8)], PATINA, 4)           # 角
    line(d, [(90, 26), (98, 20)], PATINA, 3)          # 耳
    # 尾(涡卷内端,两点分叉)
    line(d, [(95, 100), (112, 106)], PATINA, 5)
    line(d, [(107, 102), (116, 96)], PATINA, 3.5)
    # 足纹
    line(d, [(60, 104), (54, 122)], PATINA, 4.5)
    line(d, [(96, 112), (102, 128)], PATINA, 4.5)
    fin(im, 160, 160, "夔龙角.png")

def wanzi_tile():
    im, d = new(72, 72)
    c = (150, 124, 78, 72)

    def wan(cx, cy, s=15):
        h = s / 2
        line(d, [(cx, cy - h), (cx, cy + h)], c, 2.4)
        line(d, [(cx - h, cy), (cx + h, cy)], c, 2.4)
        line(d, [(cx, cy - h), (cx - h * 0.66, cy - h)], c, 2.4)
        line(d, [(cx, cy + h), (cx + h * 0.66, cy + h)], c, 2.4)
        line(d, [(cx - h, cy), (cx - h, cy + h * 0.66)], c, 2.4)
        line(d, [(cx + h, cy), (cx + h, cy - h * 0.66)], c, 2.4)

    for cx, cy in ((18, 18), (54, 54)):
        for dx in (-72, 0, 72):
            for dy in (-72, 0, 72):
                wan(cx + dx, cy + dy)
    for cx, cy in ((18, 54), (54, 18)):
        for dx in (-72, 0, 72):
            for dy in (-72, 0, 72):
                ellipse(d, (cx + dx - 1.6, cy + dy - 1.6, cx + dx + 1.6, cy + dy + 1.6), fill=c)
    fin(im, 72, 72, "万字底纹.png")

def binglie_tile():
    W = 320
    im, d = new(W, W)
    rnd = random.Random(7)
    cracks = []
    for _ in range(10):
        pts = [(rnd.uniform(0, W), rnd.uniform(0, W))]
        a = rnd.uniform(0, 2 * math.pi)
        for _ in range(rnd.randint(2, 4)):
            L = rnd.uniform(50, 110)
            a += rnd.uniform(-0.9, 0.9)
            pts.append((pts[-1][0] + L * math.cos(a), pts[-1][1] + L * math.sin(a)))
        cracks.append(pts)
    for _ in range(8):
        x, y = rnd.uniform(0, W), rnd.uniform(0, W)
        a = rnd.uniform(0, 2 * math.pi)
        L = rnd.uniform(24, 48)
        cracks.append([(x, y), (x + L * math.cos(a), y + L * math.sin(a))])
    for pts in cracks:
        for dx in (-W, 0, W):
            for dy in (-W, 0, W):
                line(d, [(x + dx, y + dy) for x, y in pts], ICE, 1.9)
    fin(im, W, W, "冰裂底纹.png")

def yun_ruyi():
    im, d = new(270, 150)
    # 云身:三个圆包 + 平底
    poly(d, [(20, 100), (20, 78), (44, 52), (74, 44), (104, 34), (134, 36), (160, 30),
             (192, 40), (216, 52), (240, 76), (248, 100), (20, 100)],
         fill=GOLD_L)
    arc(d, (22, 50, 82, 110), 180, 360, RED_D, 4)
    arc(d, (62, 26, 138, 100), 180, 360, RED_D, 4)
    arc(d, (128, 22, 196, 92), 180, 360, RED_D, 4)
    arc(d, (182, 42, 246, 108), 180, 360, RED_D, 4)
    line(d, [(22, 98), (246, 98)], RED_D, 4)
    spiral(d, 44, 84, 17, 5, 1.25, 160, RED_D, 4)
    spiral(d, 224, 84, 17, 5, 1.25, 20, RED_D, 4)
    arc(d, (52, 66, 108, 100), 195, 355, RED_L, 3)
    arc(d, (118, 56, 176, 96), 200, 350, RED_L, 3)
    fin(im, 270, 150, "如意祥云.png")

def yun_liu():
    im, d = new(390, 130)
    for (y, w_, alpha) in ((70, 5, 215), (96, 4, 160), (46, 3.4, 140)):
        col = (RED_D[0], RED_D[1], RED_D[2], alpha)
        pts = [(x, y + 8 * math.sin(x / 30)) for x in range(20, 298, 4)]
        line(d, pts, col, w_)
        spiral(d, 318, y + 6, 15, 3.2, 1.35, 150, col, w_)
    fin(im, 390, 130, "流云.png")

def yun_sihe():
    im, d = new(220, 220)
    ellipse(d, (96, 96, 124, 124), fill=GOLD, outline=RED_D, w=3)
    for deg in (0, 90, 180, 270):
        a = math.radians(deg - 90)
        cx, cy = 110 + math.cos(a) * 46, 110 + math.sin(a) * 46
        ruyi_head(d, cx, cy, 22, outline=RED_D, w=4, deg=deg)
    for deg in (45, 135, 225, 315):
        a = math.radians(deg)
        cx, cy = 110 + math.cos(a) * 40, 110 + math.sin(a) * 40
        arc(d, (cx - 12, cy - 12, cx + 12, cy + 12), deg - 90, deg + 90, RED_L, 3)
    fin(im, 220, 220, "四合云.png")

def yunlei_strip():
    W, H = 560, 44
    im, d = new(W, H)
    def lei(x0):
        pts = [(x0 + 6, 36), (x0 + 6, 8), (x0 + 30, 8), (x0 + 30, 36), (x0 + 16, 36), (x0 + 16, 22), (x0 + 23, 22), (x0 + 23, 29)]
        line(d, pts, RED_D, 2.6)
    def yun(x0):
        spiral(d, x0 + 27, 22, 12, 3.2, 1.15, -90, RED_D, 2.6)
        line(d, [(x0 + 38, 22), (x0 + 45, 22)], RED_D, 2.6)
    for i in range(10):
        (lei if i % 2 == 0 else yun)(i * 56)
    fin(im, W, H, "云雷纹条.png")

def qingtong_ding():
    im, d = new(160, 175)
    ellipse(d, (30, 152, 130, 168), fill=(40, 30, 20, 44))
    # 立耳(两个拱形)
    for ex in (58, 102):
        arc(d, (ex - 11, 14, ex + 11, 42), 180, 360, BRONZE, 6)
        line(d, [(ex - 11, 27), (ex - 11, 40)], BRONZE, 6)
        line(d, [(ex + 11, 27), (ex + 11, 40)], BRONZE, 6)
    # 口沿(浅口 + 深口线)
    rrect(d, (32, 36, 128, 54), 8, fill=BRONZE, outline=BRONZE_D, w=3)
    rrect(d, (38, 50, 122, 58), 4, fill=BRONZE_D)
    # 身(上收下放)
    poly(d, [(40, 56), (120, 56), (112, 124), (100, 134), (60, 134), (48, 124)],
         fill=PATINA_L, outline=BRONZE, w=5)
    # 雷纹带(两行平行线间排小方螺旋)
    line(d, [(44, 78), (116, 78)], BRONZE, 2.2)
    line(d, [(46, 108), (114, 108)], BRONZE, 2.2)
    for bx in (50, 68, 86, 104):
        pts = [(bx, 101), (bx, 85), (bx + 11, 85), (bx + 11, 101), (bx + 3.6, 101), (bx + 3.6, 92), (bx + 7.4, 92), (bx + 7.4, 97)]
        line(d, pts, BRONZE_D, 2.2)
    # 三足:两前 + 中后(略短)
    poly(d, [(50, 134), (64, 134), (60, 162), (49, 162)], fill=BRONZE)
    poly(d, [(96, 134), (110, 134), (111, 162), (100, 162)], fill=BRONZE)
    poly(d, [(74, 134), (86, 134), (86, 156), (74, 156)], fill=BRONZE)
    ellipse(d, (47, 158, 62, 166), fill=BRONZE_D)
    ellipse(d, (98, 158, 113, 166), fill=BRONZE_D)
    ellipse(d, (72, 152, 88, 160), fill=BRONZE_D)
    # 锈斑
    for (x, y, r) in ((66, 64, 6), (100, 66, 5), (52, 102, 5), (110, 100, 6), (80, 120, 4)):
        ellipse(d, (x - r, y - r, x + r, y + r), fill=(88, 110, 88, 120))
    fin(im, 160, 175, "青铜鼎.png")

def zhongguojie():
    im, d = new(170, 252)
    CX, CY = 85, 118
    # 顶部挂绳
    arc(d, (CX - 13, 6, CX + 13, 30), 160, 380, RED, 6)
    line(d, [(CX, 28), (CX, 78)], RED, 6)
    # 主体:轴方环 + 斜方环 相叠成盘长
    rrect(d, (CX - 30, CY - 30, CX + 30, CY + 30), 15, outline=RED, w=10)
    poly(d, [(CX, CY - 44), (CX + 44, CY), (CX, CY + 44), (CX - 44, CY)], outline=RED_D, w=9)
    # 四角耳环(斜向小方环)
    for deg in (45, 135, 225, 315):
        a = math.radians(deg)
        ex, ey = CX + math.cos(a) * 48, CY + math.sin(a) * 48
        poly(d, [(ex + 12 * math.cos(a + math.radians(45 + k * 90)), ey + 12 * math.sin(a + math.radians(45 + k * 90))) for k in range(4)],
             outline=RED, w=8)
    # 中心结
    ellipse(d, (CX - 10, CY - 10, CX + 10, CY + 10), fill=RED)
    # 底部流苏
    ellipse(d, (CX - 13, CY + 50, CX + 13, CY + 74), fill=RED_D)
    rrect(d, (CX - 16, CY + 68, CX + 16, CY + 86), 8, fill=RED)
    for k in range(7):
        x0 = CX + (k - 3) * 8
        line(d, [(CX, CY + 82), (x0, CY + 120)], RED, 4)
        ellipse(d, (x0 - 3.4, CY + 116, x0 + 3.4, CY + 123), fill=GOLD_D)
    fin(im, 170, 252, "中国结.png")

def yinzhang():
    im, d = new(136, 136)
    rrect(d, (4, 4, 132, 132), 20, fill=RED)
    rrect(d, (13, 13, 123, 123), 13, outline=(255, 246, 236, 235), w=3)
    f = font(38, True)
    for ch, (cx, cy) in zip("文物精灵", ((43, 43), (93, 43), (43, 93), (93, 93))):
        text(d, (cx, cy), ch, f, (255, 248, 240), "mm")
    fin(im, 136, 136, "印章.png")

# =================================================
# ⑬ 河北地图
# =================================================
def hebei_map():
    W, H, M = 760, 1000, 20
    MS = 2  # 地图内部绘制倍率(输出时降采样)
    LON0, LAT1 = 113.35, 42.75
    K = W / (6.7 * 0.773)
    CW, CH = W + 2 * M, H + 2 * M
    im = Image.new("RGBA", (CW * MS, CH * MS), (251, 245, 232, 255))
    d = ImageDraw.Draw(im)

    def D2(lon, lat):
        """经纬 → 输出图显示坐标(未乘倍率)"""
        return ((lon - LON0) * 0.773 * K + M, (LAT1 - lat) * K + M)

    def P(lon, lat):
        x, y = D2(lon, lat)
        return (x * MS, y * MS)

    def mfont(sz, bold=False):
        p = r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"
        try:
            return ImageFont.truetype(p, int(sz * MS))
        except Exception:
            return ImageFont.load_default()

    def rot_text(center_disp, s, f, color, angle):
        tw = int(f.getlength(s)) + 18 * MS
        th = int(f.size) + 18 * MS
        tmp = Image.new("RGBA", (tw, th), CLEAR)
        ImageDraw.Draw(tmp).text((tw / 2, th / 2), s, font=f, fill=color, anchor="mm")
        tmp = tmp.rotate(angle, expand=True, resample=Image.BICUBIC)
        cx, cy = center_disp[0] * MS, center_disp[1] * MS
        im.alpha_composite(tmp, (int(cx - tmp.width / 2), int(cy - tmp.height / 2)))

    def line2(pts, color, w=3, dash=None):
        pp = [P(*p) for p in pts]
        if not dash:
            d.line(pp, fill=color, width=max(1, int(w * MS)), joint="curve")
            return
        on, off = dash
        cycle = [True] * int(on * MS) + [False] * int(off * MS)
        idx = 0
        for i in range(len(pp) - 1):
            x0, y0 = pp[i]
            x1, y1 = pp[i + 1]
            L = max(1, int(math.hypot(x1 - x0, y1 - y0)))
            for st in range(L):
                if cycle[idx % len(cycle)]:
                    t0, t1 = st / L, (st + 1) / L
                    d.line([(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0),
                            (x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1)],
                           fill=color, width=max(1, int(w * MS)))
                idx += 1

    def poly2(pts, fill=None, outline=None, w=3):
        d.polygon([P(*p) for p in pts], fill=fill, outline=outline, width=max(1, int(w * MS)))

    HB = [(114.05,41.55),(114.20,41.95),(114.55,42.20),(114.85,42.42),(115.20,42.60),
          (115.50,42.55),(115.75,42.35),(116.05,42.28),(116.35,42.05),(116.65,42.02),
          (116.95,42.10),(117.25,42.28),(117.60,42.38),(117.95,42.32),(118.25,42.18),
          (118.60,42.25),(118.95,42.05),(119.25,41.62),(119.55,41.20),(119.85,40.95),
          (119.70,40.55),(119.75,40.15),(119.60,39.98),(119.25,39.88),(119.05,39.60),
          (118.80,39.40),(118.50,39.18),(118.20,39.05),(117.95,38.98),
          (117.88,38.68),(117.84,38.42),(117.86,38.16),(117.62,37.98),(117.30,37.86),
          (116.98,37.82),(116.68,37.74),(116.35,37.55),(116.15,37.30),
          (116.00,37.05),(115.85,36.85),(115.60,36.60),(115.35,36.50),
          (115.15,36.30),(114.95,36.08),(114.75,36.03),(114.45,36.32),(114.10,36.35),
          (113.75,36.50),(113.60,36.75),(113.62,37.05),(113.72,37.35),(113.60,37.75),
          (113.55,38.10),(113.50,38.45),(113.65,38.85),(113.85,39.05),(114.10,39.30),
          (114.30,39.60),(114.35,39.90),(114.18,40.20),(114.05,40.50),(114.00,40.85),
          (113.95,41.15),(114.05,41.55)]
    # 渤海(贴着海岸线)
    COAST = [(119.75,40.15),(119.60,39.98),(119.25,39.88),(119.05,39.60),(118.80,39.40),
             (118.50,39.18),(118.20,39.05),(117.95,38.98),(117.88,38.68),(117.84,38.42),
             (117.86,38.16),(117.62,37.98)]
    SEA = [(119.86,40.50)] + COAST + [(118.55,37.28),(119.45,36.95),(120.05,36.85),(120.05,40.70)]
    poly2(SEA, fill=(213,230,240,255))
    # 波浪
    for (wx, wy) in ((118.62,38.88),(119.42,39.02),(118.42,38.38),(119.62,38.42),(119.05,37.92)):
        x, y = P(wx, wy)
        d.arc([x - 26 * MS, y - 10 * MS, x, y + 10 * MS], 200, 340, fill=(150,180,205,255), width=3 * MS)
        d.arc([x + 2 * MS, y - 10 * MS, x + 28 * MS, y + 10 * MS], 200, 340, fill=(150,180,205,255), width=3 * MS)
    rot_text(D2(119.08, 38.72), "渤 海", mfont(22), (112,148,188,255), -32)
    # 河北主体
    poly2(HB, fill=PAPER_W, outline=RED_D, w=3)
    # 北京 / 天津(挖空 + 虚线)
    BJ = [(115.42,40.60),(115.75,40.68),(116.15,40.65),(116.50,40.60),(116.75,40.42),
          (116.95,40.10),(117.35,40.03),(117.20,39.75),(116.80,39.60),(116.55,39.50),
          (116.32,39.45),(116.15,39.60),(115.90,39.55),(115.70,39.65),(115.55,39.75),
          (115.42,40.10),(115.45,40.40)]
    TJ = [(116.72,40.25),(117.05,40.22),(117.45,40.10),(117.80,39.85),(117.95,39.55),
          (118.05,39.25),(117.75,38.90),(117.55,38.68),(117.25,38.72),(116.95,38.90),
          (116.82,39.15),(116.70,39.45),(116.42,39.85),(116.50,40.05),(116.72,40.25)]
    for reg in (BJ, TJ):
        poly2(reg, fill=(243,236,220,255))
        line2(reg + [reg[0]], (130,118,104,255), 2, dash=(8, 6))
    rot_text(D2(116.15, 40.10), "北京", mfont(13), (108,98,88,255), 0)
    rot_text(D2(117.35, 39.25), "天津", mfont(13), (108,98,88,255), 0)
    # 长城
    WALL = [(114.45,40.75),(115.10,40.85),(115.70,40.95),(116.30,40.98),(116.90,40.95),
            (117.50,40.75),(118.20,40.70),(118.75,40.55),(119.30,40.35),(119.72,40.02)]
    line2(WALL, (168,138,96,255), 3, dash=(9, 7))
    rot_text(D2(117.30, 40.30), "长城", mfont(14), (150,122,84,255), 8)
    # 太行山
    rot_text(D2(113.80, 38.55), "太行山", mfont(15), (150,122,84,255), 90)
    fin(im, CW, CH, "河北地图.png")

    marks = {}
    for sid, (lon, lat) in {"cangzhou": (116.84, 38.30), "baoding": (115.46, 38.87),
                            "zhangjiakou": (114.88, 40.77), "shijiazhuang": (114.51, 38.03),
                            "xingtai": (114.51, 37.07),
                            "chengde": (117.96, 40.97), "qinhuangdao": (119.60, 39.94),
                            "tangshan": (118.18, 39.63), "handan": (114.54, 36.63),
                            "hengshui": (115.67, 37.74)}.items():
        x, y = D2(lon, lat)
        marks[sid] = {"x": round(x / CW * 100, 1), "y": round(y / CH * 100, 1)}
    print("  MAP_MARKS =", json.dumps(marks, ensure_ascii=False))

# =================================================
# ⑭ 边框样例自检图
# =================================================
def frame_samples():
    names = [("回纹框.png", "回纹 · 卡牌首选"), ("缠枝莲框.png", "缠枝莲 · 陶瓷"),
             ("忍冬框.png", "忍冬 · 隋唐"), ("饕餮框.png", "饕餮 · 青铜"),
             ("如意框.png", "如意 · 配饰"), ("冰裂框.png", "冰裂 · 青瓷")]
    CW, CH, B = 244, 312, 22
    pad, top = 26, 84
    im = Image.new("RGBA", (3 * CW + 4 * pad, top + 2 * CH + 3 * pad + 30), (246, 241, 231, 255))
    d = ImageDraw.Draw(im)
    try:
        f_t = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 17)
        f_s = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 13)
    except Exception:
        f_t = f_s = ImageFont.load_default()
    d.text((pad, 24), "文物精灵 · 卡片纹样边框样例(模拟真实卡片尺寸 / 边框 22px)", font=f_t, fill=INK)
    for i, (fn, label) in enumerate(names):
        r, c = divmod(i, 3)
        x = pad + c * (CW + pad)
        y = top + r * (CH + pad)
        card = Image.new("RGBA", (CW, CH), (255, 253, 248, 255))
        fr = Image.open(os.path.join(DST, fn)).convert("RGBA")
        apply_frame9(card, fr, border=B)
        im.alpha_composite(card, (x, y))
        d.text((x + CW / 2, y + CH + 8), label, font=f_s, fill=(120, 105, 88, 255), anchor="ma")
    im.save(os.path.join(DST, "_样例框.png"))
    print("  ok _样例框.png")

# =================================================
print("生成装饰素材 →", DST)
compose9("回纹框.png", hui_edge, hui_corner)
compose9("缠枝莲框.png", chanzhi_edge, chanzhi_corner)
compose9("忍冬框.png", rendong_edge, rendong_corner)
compose9("饕餮框.png", taotie_edge, taotie_corner)
compose9("如意框.png", ruyi_edge, ruyi_corner)
compose9("冰裂框.png", binglie_edge, binglie_corner)
kuilong()
wanzi_tile()
binglie_tile()
yun_ruyi()
yun_liu()
yun_sihe()
yunlei_strip()
qingtong_ding()
zhongguojie()
yinzhang()
hebei_map()
frame_samples()
print("全部完成 ✓")
