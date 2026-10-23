# -*- coding: utf-8 -*-
"""错银铜双翼神兽设计图 -> 透明底圆形徽章
   - 自动识别金色外环,圆环外整体透明(右下角「豆包AI生成」水印在圆外,随之去除;
     圆外若还有金色云气飘带则保留)
   - 输出 384x384 RGBA(与其它装饰素材一致)
   用法: python tools\\prep_shenshou_mark.py [输出路径,默认 装饰\\印章.png]
"""
import os
import sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "背景", "错银铜双翼神兽国风神武精灵设计.jpeg")
SIDE = 384          # 输出边长
PAD = 12            # 圆环外留白(按原图 1536 计)


def find_ring(a):
    """金色外环 -> 圆心与半径(按 72 个角度取最远金色点做圆拟合)"""
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    gold = (r > 110) & (g > 80) & (b < 150) & (r - b > 40)
    ys, xs = np.where(gold)
    cx, cy = xs.mean(), ys.mean()
    rad = 0.0
    for _ in range(3):
        ang = np.arctan2(ys - cy, xs - cx)
        dist = np.hypot(xs - cx, ys - cy)
        bins = ((ang + np.pi) / (2 * np.pi) * 72).astype(int) % 72
        bx, by = [], []
        for k in range(72):
            m = bins == k
            if not m.any():
                continue
            j = np.argmax(dist[m])
            bx.append(xs[m][j]); by.append(ys[m][j])
        bx = np.asarray(bx, float); by = np.asarray(by, float)
        A = np.c_[2 * bx, 2 * by, np.ones(len(bx))]
        sol, *_ = np.linalg.lstsq(A, bx ** 2 + by ** 2, rcond=None)
        cx, cy = sol[0], sol[1]
        rad = float(np.sqrt(sol[2] + cx * cx + cy * cy))
    return cx, cy, rad, gold


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "装饰", "印章.png")
    im = Image.open(SRC).convert("RGB")
    a = np.asarray(im).astype(float)
    h, w = a.shape[:2]
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b

    cx, cy, rad, gold = find_ring(a)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot(xx - cx, yy - cy)
    print("圆环: 圆心(%.0f,%.0f) 半径 %.1f" % (cx, cy, rad))
    out_gold = int((gold & (d > rad + 3)).sum())
    print("圆环外的金色像素(云气飘带):", out_gold)

    # 圆内保留;圆环边缘 10px 羽化;圆外只保留金色云气(右下角水印区域不满足,自然清除)
    wisp = (lum > 78) & (r - b > 16) & (d > rad)
    wisp_img = Image.fromarray((wisp * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))
    wisp_f = np.asarray(wisp_img).astype(float) / 255.0
    alpha = np.zeros((h, w), float)
    alpha[d <= rad - 1] = 1.0
    band = (d > rad - 1) & (d < rad + 9)
    alpha[band] = np.clip((rad + 9 - d[band]) / 10.0, 0.0, 1.0)
    outer = d >= rad + 9
    alpha[outer] = wisp_f[outer]

    # 方形裁切(圆心居中)
    x0 = max(0, int(cx - rad - PAD)); y0 = max(0, int(cy - rad - PAD))
    x1 = min(w, int(cx + rad + PAD)); y1 = min(h, int(cy + rad + PAD))
    side = min(x1 - x0, y1 - y0)

    # 预乘 -> 缩放 -> 反预乘(避免透明边发灰)
    rgb_pm = np.clip(a * alpha[..., None], 0, 255).astype(np.uint8)
    c_img = Image.fromarray(rgb_pm).crop((x0, y0, x0 + side, y0 + side)).resize((SIDE, SIDE), Image.LANCZOS)
    a_img = Image.fromarray((alpha * 255).astype(np.uint8)).crop((x0, y0, x0 + side, y0 + side)).resize((SIDE, SIDE), Image.LANCZOS)
    cf = np.asarray(c_img).astype(float)
    af = np.asarray(a_img).astype(float) / 255.0
    rgb_out = np.where(af[..., None] > 1e-4, cf / np.maximum(af[..., None], 1e-4), 0)
    rgba = np.dstack([np.clip(rgb_out, 0, 255), np.asarray(a_img)]).astype(np.uint8)
    out_im = Image.fromarray(rgba, "RGBA")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    out_im.save(out, "PNG", optimize=True)
    print("完成 -> %s  %d KB" % (out, os.path.getsize(out) // 1024))


if __name__ == "__main__":
    main()
