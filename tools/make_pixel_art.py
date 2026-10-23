# -*- coding: utf-8 -*-
"""生成像素风素材：青铜鼎、青铜盒、琉璃球、山河像素底图。
规则：无渐变、无抗锯齿、1px 深色描边、顶左亮边 / 右下沉边的三色调受光。
用法：python tools/make_pixel_art.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OUT = "#14201B"
BR_D = "#24503F"
BR_M = "#3B7A5F"
BR_L = "#66AD8A"
GD_D = "#B98B33"
GD_M = "#E2B95F"
GD_L = "#FFE8A6"
CR = "#FFF9E6"


def hx(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


def rect(g, x0, y0, x1, y1, v=True):
    g[max(0, y0):y1, max(0, x0):x1] = v


def ellipse(g, cx, cy, rx, ry, v=True):
    h, w = g.shape
    yy, xx = np.mgrid[0:h, 0:w]
    g[((xx - cx) / float(rx)) ** 2 + ((yy - cy) / float(ry)) ** 2 <= 1.0] = v


def trapz(g, y0, y1, xl0, xl1, xr0, xr1, v=True):
    h = y1 - y0
    for i in range(h):
        t = i / float(max(1, h - 1))
        xl = int(round(xl0 + (xl1 - xl0) * t))
        xr = int(round(xr0 + (xr1 - xr0) * t))
        g[y0 + i, xl:xr + 1] = v


def dilate(m):
    r = m.copy()
    r[1:, :] |= m[:-1, :]
    r[:-1, :] |= m[1:, :]
    r[:, 1:] |= m[:, :-1]
    r[:, :-1] |= m[:, 1:]
    return r


def rim(mask, depth=1):
    """像素画打光：返回 (亮, 暗, 中) 三张掩膜。
    上/左边界内 1~depth 圈算亮边；下/右边界内 1~depth 圈算暗边；
    两者都沾的角落按亮边算（光源在左上）。"""
    h, w = mask.shape
    light = np.zeros_like(mask)
    dark = np.zeros_like(mask)
    up = np.zeros_like(mask)
    dn = np.zeros_like(mask)
    # 从各方向逐圈"吃掉"边界
    cur = mask.copy()
    for _ in range(depth):
        e = cur & ~_erode(cur)
        up |= e
        dn |= e
        cur = _erode(cur)
    # 判断每个边界像素靠近哪一侧
    yy, xx = np.mgrid[0:h, 0:w]
    edge = mask & ~_erode_n(mask, depth)
    top = np.zeros_like(mask)
    left = np.zeros_like(mask)
    bot = np.zeros_like(mask)
    right = np.zeros_like(mask)
    top[:-1, :] = ~mask[1:, :]
    left[:, :-1] = ~mask[:, 1:]
    bot[1:, :] = ~mask[:-1, :]
    right[:, 1:] = ~mask[:, :-1]
    light = edge & (top | left)
    dark = edge & (bot | right) & ~light
    mid = mask & ~light & ~dark
    return light, dark, mid


def _erode(m):
    r = m.copy()
    r[1:, :] &= m[:-1, :]
    r[:-1, :] &= m[1:, :]
    r[:, 1:] &= m[:, :-1]
    r[:, :-1] &= m[:, 1:]
    r[0, :] = False
    r[-1, :] = False
    r[:, 0] = False
    r[:, -1] = False
    return r


def _erode_n(m, n):
    r = m.copy()
    for _ in range(n):
        r = _erode(r)
    return r


def compose(h, w, shapes):
    """shapes: [(mask, ('bronze'|'gold'))]  返回 RGBA"""
    solid = np.zeros((h, w), bool)
    for m, _ in shapes:
        solid |= m
    img = np.zeros((h, w, 4), np.uint8)
    for m, kind in shapes:
        li, dk, md = rim(m, 1)
        li2, dk2, md2 = rim(m, 3)   # 内圈再压一层，避免"平涂"
        if kind == "gold":
            img[md] = hx(GD_M)
            img[li] = hx(GD_L)
            img[dk] = hx(GD_D)
        else:
            img[md] = hx(BR_M)
            img[li] = hx(BR_L)
            img[dk] = hx(BR_D)
    ring = dilate(solid) & ~solid
    img[ring] = hx(OUT)
    return img


def save_rgba(img, path, k=3):
    pil = Image.fromarray(img, "RGBA")
    if k > 1:
        pil = pil.resize((pil.width * k, pil.height * k), Image.NEAREST)
    full = os.path.join(ROOT, path)
    pil.save(full)
    print(path, pil.size, round(os.path.getsize(full) / 1024, 1), "KB")


# ------------------------------------------------------------------ 鼎
def make_ding():
    W, H = 48, 56
    cx = 23

    legs = np.zeros((H, W), bool)
    # 中足
    trapz(legs, 40, 52, cx - 3, cx - 4, cx + 4, cx + 3)
    rect(legs, cx - 5, 51, cx + 6, 53)
    # 左右足：柱足，粗一点才站得住
    trapz(legs, 36, 51, 11, 9, 18, 16)
    trapz(legs, 36, 51, 30, 32, 37, 39)
    rect(legs, 8, 50, 17, 53)
    rect(legs, 31, 50, 40, 53)

    # 鼎腹：肩宽、底圆
    body = np.zeros((H, W), bool)
    rect(body, 6, 24, 41, 36)
    ellipse(body, cx, 35, 18, 8)
    ellipse(body, cx, 30, 18, 7)
    rect(body, 6, 24, 41, 38)

    ears = np.zeros((H, W), bool)
    rect(ears, 7, 5, 17, 26)
    rect(ears, 30, 5, 40, 26)
    rect(ears, 11, 9, 14, 26, False)
    rect(ears, 33, 9, 36, 26, False)
    ears[4, 7:17] = False
    ears[4, 30:40] = False

    rim_gold = np.zeros((H, W), bool)
    rect(rim_gold, 4, 20, 43, 25)
    rim_gold[20, 4:43] = False
    rim_gold[21, 4:7] = False
    rim_gold[21, 40:43] = False

    img = compose(H, W, [(legs, "bronze"), (body, "bronze"),
                         (ears, "bronze"), (rim_gold, "gold")])

    # 云雷纹：两道弦 + 乳钉
    for x in range(11, 37):
        if img[28, x, 3]:
            img[28, x] = hx(BR_D)
        if img[32, x, 3]:
            img[32, x] = hx(BR_D)
    for x in (14, 19, 24, 29, 34):
        if img[35, x, 3]:
            img[35, x] = hx(BR_L)

    # 口沿两颗高光
    for (x, y) in [(7, 21), (8, 21), (7, 22), (9, 21)]:
        img[y, x] = hx(CR)
    return img


# ------------------------------------------------------------------ 盒
def make_box():
    W, H = 48, 56

    feet = np.zeros((H, W), bool)
    rect(feet, 10, 44, 16, 51)
    rect(feet, 31, 44, 37, 51)
    rect(feet, 9, 49, 17, 52)
    rect(feet, 30, 49, 38, 52)

    body = np.zeros((H, W), bool)
    trapz(body, 29, 45, 8, 10, 39, 37)
    rect(body, 8, 29, 40, 46)

    lid = np.zeros((H, W), bool)
    # 穹顶盖：圆弧收口，比四坡盖更像「盒」
    ellipse(lid, 23.5, 27, 18, 10)
    rect(lid, 6, 22, 41, 28)
    lid[:21, :] = False
    # 盖钮：矮而宽
    rect(lid, 19, 14, 29, 19)
    rect(lid, 18, 13, 30, 15)

    rim_gold = np.zeros((H, W), bool)
    rect(rim_gold, 6, 23, 42, 26)
    rim_gold[23, 6:42] = False

    img = compose(H, W, [(feet, "bronze"), (body, "bronze"),
                         (lid, "bronze"), (rim_gold, "gold")])

    # 中扉棱 + 纹带
    for y in range(30, 46):
        if img[y, 24, 3]:
            img[y, 24] = hx(BR_D)
    for x in range(10, 39):
        if img[34, x, 3]:
            img[34, x] = hx(BR_D)
        if img[37, x, 3]:
            img[37, x] = hx(BR_D)
    for x in (13, 19, 30, 36):
        if img[34, x, 3]:
            img[34, x] = hx(BR_L)
    for (x, y) in [(8, 24), (9, 24), (8, 25)]:
        img[y, x] = hx(CR)
    return img


# ------------------------------------------------------------------ 琉璃球
def make_orb(size=32):
    W = H = size
    img = np.zeros((H, W, 4), np.uint8)
    c = (size - 1) / 2.0
    r = size / 2.0 - 1.2
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt((xx - c) ** 2 + (yy - c) ** 2)
    m = d <= r
    nx = (xx - c) / r
    ny = (yy - c) / r
    lit = -(nx * 0.6 + ny * 0.8)
    edge = m & (d > r - 1.35)

    img[m] = hx("#EFD6A4")
    img[m & (lit > -0.15)] = hx("#FBEFD2")
    img[edge] = hx("#C79E68")
    img[edge & (lit > 0.15)] = hx("#F6E3BC")
    # 外圈描边
    ring = (d > r) & (d <= r + 1.0)
    img[ring] = hx(OUT)

    # 左上高光：斜着两颗
    for (x, y) in [(c - 5, c - 6), (c - 4, c - 6), (c - 5, c - 5),
                   (c - 6, c - 5), (c - 4, c - 5)]:
        x, y = int(x), int(y)
        if m[y, x]:
            img[y, x] = hx("#FFFFFF")
    # 右下反光
    for (x, y) in [(c + 5, c + 4), (c + 5, c + 5), (c + 4, c + 5)]:
        x, y = int(x), int(y)
        if m[y, x]:
            img[y, x] = hx("#FFF3D6")
    return img


def make_landscape():
    src = os.path.join(ROOT, "装饰", "背景-山河祥云.webp")
    im = Image.open(src).convert("RGB")
    w = 176
    h = int(round(im.height * w / im.width))
    small = im.resize((w, h), Image.LANCZOS)
    # 压暗 + 朱红化：像素游戏里的远景不应该是白纸，得沉下去
    arr = np.array(small, np.float32) / 255.0
    # 注意：PIL 的数组是 RGB 序，0=R / 1=G / 2=B
    arr[:, :, 2] *= 0.44          # B 砍掉
    arr[:, :, 1] *= 0.56          # G 砍掉
    arr[:, :, 0] = np.clip(arr[:, :, 0] * 1.04 + 0.05, 0, 1)   # R 提上来
    small = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    small = small.quantize(colors=22, method=Image.MEDIANCUT).convert("RGB")
    full = os.path.join(ROOT, "装饰", "像素-山河.png")
    small.save(full)
    print("装饰/像素-山河.png", small.size, round(os.path.getsize(full) / 1024, 1), "KB")


# ------------------------------------------------------------------ 立绘
IDS = ["wuzhuqian", "qinghuaci", "yuzhui", "jinqi", "yinqi", "xuanzhi", "xiangqi",
       "tielion", "changxin", "longfengfan", "yuzhulong", "lianhuazun",
       "houmuwuding", "jituiping"]


def make_sprites(h=32):
    """立绘压到 32px 高，量化成 12 色、alpha 二值化 —— 真正的像素画。
    输出 1 倍大小，由 CSS 用 image-rendering:pixelated 放大。"""
    src_dir = os.path.join(ROOT, "精灵", "透明")
    dst_dir = os.path.join(ROOT, "精灵", "像素")
    os.makedirs(dst_dir, exist_ok=True)
    n = 0
    for sid in IDS:
        fp = os.path.join(src_dir, sid + ".png")
        if not os.path.exists(fp):
            continue
        im = Image.open(fp).convert("RGBA")
        bb = im.split()[3].getbbox()
        if bb:
            im = im.crop(bb)
        w, hh = im.size
        nw = max(4, int(round(w * h / float(hh))))
        small = im.resize((nw, h), Image.LANCZOS)
        rgb = small.convert("RGB").quantize(colors=12, method=Image.MEDIANCUT).convert("RGB")
        al = small.split()[3].point(lambda v: 255 if v > 108 else 0)
        small = rgb.convert("RGBA")
        small.putalpha(al)
        small.save(os.path.join(dst_dir, sid + ".png"))
        n += 1
    print("精灵/像素/", n, "张")


if __name__ == "__main__":
    save_rgba(make_ding(), "装饰/像素-鼎.png", 2)
    save_rgba(make_box(), "装饰/像素-盒.png", 2)
    save_rgba(make_orb(), "装饰/像素-琉璃球.png", 2)
    make_landscape()
    make_sprites()
