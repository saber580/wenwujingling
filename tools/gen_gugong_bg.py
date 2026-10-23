# -*- coding: utf-8 -*-
"""画一张「故宫 · 太和殿」对战背景图 → 背景/故宫.png
   · 左右完全对称,符合对战的对称站位
   · 想换成真实照片:直接用自己的图覆盖 背景/故宫.png 即可(尺寸随意,会自动裁切铺满)
   运行: python tools\gen_gugong_bg.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "背景", "故宫_手绘备用.png")

W, H = 1422, 600      # 目标尺寸(约 2.37:1,正好是舞台比例)
S = 3                 # 超采样倍数
CW, CH = W * S, H * S

SKY = [(0.00, "#79afe0"), (0.26, "#a9cdea"), (0.46, "#d5e8f6"),
       (0.60, "#e9f2f8"), (0.74, "#f4eedd"), (1.00, "#eee5d2")]

GOLD_TOP, GOLD_BOT = "#f8db92", "#c08b21"
RIDGE_EDGE = "#7c500f"


# ---------------- 小工具 ----------------
def hexc(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def vgrad(w, h, stops):
    """竖直渐变,stops = [(位置0~1, '#rrggbb'), ...]"""
    img = Image.new("RGB", (1, max(1, h)))
    px = img.load()
    for y in range(img.height):
        t = y / max(1, img.height - 1)
        col = hexc(stops[-1][1])
        for i in range(len(stops) - 1):
            p0, c0 = stops[i]
            p1, c1 = stops[i + 1]
            if p0 <= t <= p1:
                k = (t - p0) / max(1e-6, p1 - p0)
                a, b = hexc(c0), hexc(c1)
                col = tuple(int(a[j] + (b[j] - a[j]) * k) for j in range(3))
                break
        px[0, y] = col
    return img.resize((max(1, w), max(1, h)))


class Draw:
    """按设计坐标(1422x600)作画,内部自动乘超采样倍数"""
    def __init__(self, img):
        self.d = ImageDraw.Draw(img)

    def _p(self, pts):
        return [(x * S, y * S) for x, y in pts]

    def poly(self, pts, fill=None, outline=None, width=1.5):
        self.d.polygon(self._p(pts), fill=fill, outline=outline, width=max(1, int(width * S)))

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1.1):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, outline, width)

    def line(self, pts, fill=None, width=1.1):
        self.d.line(self._p(pts), fill=fill, width=max(1, int(width * S)))


def paste_grad(img, pts, c_top, c_bot):
    """把一层竖直渐变按多边形裁剪贴上去(金瓦的明暗就靠它)"""
    sp = [(x * S, y * S) for x, y in pts]
    x0, x1 = int(min(p[0] for p in sp)), int(max(p[0] for p in sp))
    y0, y1 = int(min(p[1] for p in sp)), int(max(p[1] for p in sp))
    w, h = max(1, x1 - x0), max(1, y1 - y0)
    grad = vgrad(w, h, [(0.0, c_top), (0.45, c_top), (1.0, c_bot)])
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon([(x - x0, y - y0) for x, y in sp], fill=255)
    img.paste(grad, (x0, y0), mask)


def roof_pts(cx, eave_mid, lift, half, ridge_y, ridge_half, p=1.85):
    """庑殿顶轮廓:檐口中间略低、两端翘起;屋面由檐口向上渐陡(中式反宇曲线)"""
    N = 42
    tip_y = eave_mid - lift
    pts = []
    for i in range(N + 1):                                  # 檐口:右 → 左
        x = cx + half - 2 * half * i / N
        t = (x - cx) / half
        pts.append((x, eave_mid - lift * (t * t)))
    for i in range(N + 1):                                  # 左边坡(从翘角到正脊)
        u = i / N
        x = cx - half + (half - ridge_half) * u
        pts.append((x, tip_y - (tip_y - ridge_y) * (u ** p)))
    pts.append((cx + ridge_half, ridge_y))                  # 正脊
    for i in range(N + 1):                                  # 右边坡(从正脊到翘角)
        u = 1 - i / N
        x = cx + ridge_half + (half - ridge_half) * (i / N)
        pts.append((x, tip_y - (tip_y - ridge_y) * (u ** p)))
    return pts


def roof(img, cx, eave_mid, lift, half, ridge_y, ridge_half, gold=(GOLD_TOP, GOLD_BOT)):
    pts = roof_pts(cx, eave_mid, lift, half, ridge_y, ridge_half)
    paste_grad(img, pts, gold[0], gold[1])
    d = Draw(img)
    d.poly(pts, outline=RIDGE_EDGE, width=1.6)

    for i in range(-9, 10):                                 # 瓦垄
        xr = cx + ridge_half * i / 9
        xe = cx + half * i / 9
        t = (xe - cx) / half
        d.line([(xr, ridge_y + 4), (xe, eave_mid - lift * (t * t) - 3)], fill="#d8a437", width=1.0)

    d.rect(cx - ridge_half - 3, ridge_y - 7, cx + ridge_half + 3, ridge_y + 4,
           fill="#ecc257", outline=RIDGE_EDGE, width=1.2)
    for sx in (-1, 1):                                      # 正脊两端的鸱吻
        bx = cx + sx * (ridge_half + 1)
        d.rect(bx - 6, ridge_y - 15, bx + 6, ridge_y + 3, fill="#dcb043", outline=RIDGE_EDGE, width=1.1)
        d.poly([(bx, ridge_y - 15), (bx + sx * 19, ridge_y - 27), (bx + sx * 9, ridge_y - 8)],
               fill="#e6be4e", outline=RIDGE_EDGE, width=1.0)
    return pts


def hall(d, cx, top, bot, half, door_h=None):
    """殿身:红墙 + 金门金窗 + 匾额"""
    d.rect(cx - half, top, cx + half, bot, fill="#ab3329", outline="#5c1712", width=1.5)
    d.rect(cx - half, top, cx + half, top + (bot - top) * 0.22, fill="#8b261f",
           outline="#5c1712", width=1.1)
    n = max(4, int(half / 18))
    for i in range(-n, n + 1):                              # 额枋彩画
        x = cx + half * i / (n + 0.5)
        d.rect(x - 5, top + 5, x + 5, top + (bot - top) * 0.16, fill="#e5c272")
    for i in range(-1, 2):                                  # 立柱
        x = cx + i * half * 0.62
        d.rect(x - 3, top + (bot - top) * 0.20, x + 3, bot, fill="#7a201a")
    dh = door_h or (bot - top) * 0.62
    for i in (-1, 0, 1):                                    # 隔扇门
        x = cx + i * half * 0.56
        w = half * 0.17
        d.rect(x - w, bot - dh, x + w, bot, fill="#6d1c16", outline="#4d120e", width=1.1)
        rows = 3
        for k in range(rows):
            y0 = bot - dh + 8 + k * (dh - 12) / rows
            d.rect(x - w + 4, y0, x + w - 4, y0 + (dh - 12) / rows - 7,
                   fill="#d9ab52", outline="#8a5c13", width=0.7)
    d.rect(cx - 26, top + (bot - top) * 0.30, cx + 26, top + (bot - top) * 0.62,
           fill="#2f4a86", outline="#c9a227", width=1.2)     # 匾额
    d.rect(cx - 19, top + (bot - top) * 0.36, cx + 19, top + (bot - top) * 0.56, fill="#3d5a9c")


def terrace(d, cx, top, bot, half, steps=True):
    """白玉台基 + 栏杆"""
    d.rect(cx - half, top, cx + half, bot, fill="#fbf8f2", outline="#bdb29a", width=1.3)
    d.rect(cx - half, bot - (bot - top) * 0.38, cx + half, bot, fill="#ded5c2")
    d.rect(cx - half, top - 5, cx + half, top + 5, fill="#fdfcf7", outline="#c6bba4", width=1.1)
    x = cx - half + 13
    while x < cx + half - 7:
        d.rect(x, top - 14, x + 8, top + 5, fill="#fdfbf4", outline="#c6bba4", width=0.9)
        x += 23
    if steps:
        d.poly([(cx - 56, bot), (cx + 56, bot), (cx + 82, bot + 20), (cx - 82, bot + 20)],
               fill="#efe8d8", outline="#c6bba4", width=1.2)
        for k in range(1, 3):
            y = bot + k * 6.5
            d.line([(cx - 56 - k * 7, y), (cx + 56 + k * 7, y)], fill="#d6cbb4", width=1.0)


# ---------------- 主流程 ----------------
def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cx = W // 2

    # ① 天空
    img = vgrad(CW, CH, SKY)

    # ② 云
    cl = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    cd = ImageDraw.Draw(cl)
    for (x, y, rx, ry, a) in [(250, 74, 150, 30, 195), (410, 58, 96, 21, 140),
                              (1146, 92, 166, 33, 185), (1332, 66, 108, 22, 135),
                              (700, 46, 118, 22, 115), (962, 70, 138, 26, 150),
                              (566, 104, 128, 24, 105), (866, 110, 124, 23, 100)]:
        cd.ellipse([(x - rx) * S, (y - ry) * S, (x + rx) * S, (y + ry) * S], fill=(255, 255, 255, a))
    cl = cl.filter(ImageFilter.GaussianBlur(9 * S))
    img.paste(Image.alpha_composite(img.convert("RGBA"), cl).convert("RGB"), (0, 0))

    # ③ 远景宫殿群(雾里的一排,左右对称)
    far = img.copy()
    fd = Draw(far)
    for x in range(cx - 9 * 132, cx + 9 * 132 + 1, 132):
        pts = roof_pts(x, 208, 9, 74, 178, 26)
        fd.poly(pts, fill="#c2a56e")
        fd.rect(x - 56, 204, x + 56, 232, fill="#b58a83")
    far = far.filter(ImageFilter.GaussianBlur(1.5 * S))
    box = (0, 150 * S, CW, 250 * S)
    band = Image.blend(img.crop(box), far.crop(box), 0.85)
    band = Image.blend(band, Image.new("RGB", band.size, (223, 236, 247)), 0.42)   # 空气透视
    img.paste(band, box)

    # ④ 两翼配殿(左右镜像)
    for sx in (-1, 1):
        hx = cx + sx * 508
        d = Draw(img)
        hall(d, hx, 214, 254, 112, door_h=30)
        terrace(d, hx, 254, 276, 146, steps=False)
        d.rect(hx - 176, 276, hx + 176, 292, fill="#e8e0ce", outline="#c6bba4", width=1.0)
        roof(img, hx, 216, 10, 138, 168, 56, gold=("#f4d07e", "#bd8a22"))
        # 更外侧的连廊小檐
        hx2 = cx + sx * 660
        d = Draw(img)
        d.rect(hx2 - 60, 234, hx2 + 60, 272, fill="#a5342a", outline="#5c1712", width=1.0)
        roof(img, hx2, 240, 8, 78, 196, 30, gold=("#f2cc74", "#b98620"))

    # ⑤ 太和殿(重檐庑殿顶,画在最上层)
    d = Draw(img)
    d.rect(cx - 150, 100, cx + 150, 142, fill="#ab3329", outline="#5c1712", width=1.3)   # 平座腰身
    for i in range(-5, 6):
        x = cx + 150 * i / 5.5
        d.rect(x - 3, 104, x + 3, 140, fill="#8b261f")
    d.rect(cx - 140, 112, cx + 140, 122, fill="#e5c272")                                 # 腰檐彩画
    hall(d, cx, 192, 256, 198, door_h=46)
    terrace(d, cx, 256, 296, 302)
    roof(img, cx, 202, 15, 246, 140, 152)                                                 # 下檐
    d = Draw(img)
    roof(img, cx, 118, 11, 176, 58, 96)                                                   # 上檐

    # ⑥ 广场地面(精灵就站在这上面)
    top = 296
    img.paste(vgrad(CW, CH - top * S,
                    [(0.0, "#f1ecdf"), (0.22, "#e9e1d0"), (0.60, "#ded5c2"), (1.0, "#c9bea6")]),
              (0, top * S))
    d = Draw(img)
    for k in range(1, 12):                                    # 金砖横缝(近大远小)
        y = top + (H - top) * (k / 12.0) ** 1.5
        d.line([(0, y), (W, y)], fill="#c5baa2", width=0.9)
    for k in range(-6, 7):                                    # 纵向砖缝
        x = cx + k * 118
        d.line([(cx + k * 40, top), (x, H)], fill="#cdc2ab", width=0.8)
    d.poly([(cx - 250, H), (cx + 250, H), (cx + 70, 316), (cx - 70, 316)], fill="#f4efe3")
    d.poly([(cx - 250, H), (cx + 250, H), (cx + 70, 316), (cx - 70, 316)],
           outline="#cfc4ad", width=1.1)
    d.poly([(cx - 104, H), (cx + 104, H), (cx + 30, 320), (cx - 30, 320)], fill="#faf7ee")

    # ⑦ 四角轻压暗,画面聚焦中间
    sh = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sh)
    for i in range(58):
        a = int(30 * (1 - i / 58.0) ** 2)
        sd.rectangle([i * S, i * S, CW - i * S, CH - i * S], outline=(45, 28, 16, a), width=S)
    img.paste(Image.alpha_composite(img.convert("RGBA"), sh).convert("RGB"), (0, 0))

    out = img.resize((W, H), Image.LANCZOS)
    out.save(OUT, "PNG", optimize=True)
    print("已生成:", OUT, "| 尺寸", out.size, "| %.0f KB" % (os.path.getsize(OUT) / 1024))


if __name__ == "__main__":
    main()
