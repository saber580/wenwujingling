# -*- coding: utf-8 -*-
"""重建单只精灵的透明版 + 圆窗版。
原因:精灵/透明/xiangqi.png 来自一张被裁过的旧立绘,手臂只剩半个拳头;
     精灵/xiangqi.png 才是完整版(双手叉腰),用它重抠。
用法: python tools\\fix_sprite.py xiangqi [thresh]
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from cut_sprites import flood_cut, clean, keep_near_main, SENTINEL  # noqa

SID = sys.argv[1] if len(sys.argv) > 1 else "xiangqi"
THRESH = int(sys.argv[2]) if len(sys.argv) > 2 else 60

src = os.path.join(ROOT, "精灵", SID + ".png")
im = Image.open(src).convert("RGB")
w, h = im.size
marked = flood_cut(im, thresh=THRESH)

alpha = np.zeros((h, w), bool)
mp = marked.load()
for y in range(h):
    for x in range(w):
        if mp[x, y] != SENTINEL:
            alpha[y, x] = True
alpha, _ = clean(alpha, w, h)
alpha, kept, gone = keep_near_main(alpha, w, h, d=6)

am = Image.fromarray((alpha * 255).astype("uint8"), "L").filter(ImageFilter.GaussianBlur(0.6))
out = im.convert("RGBA")
out.putalpha(am)
dst = os.path.join(ROOT, "精灵", "透明", SID + ".png")
out.save(dst, "PNG", optimize=True)
print("透明版 %s  %dx%d  保留 %.1f%%  %0.f KB" % (SID, w, h, alpha.mean() * 100, os.path.getsize(dst) / 1024))

# ---- 圆窗版:384 画布,alpha bbox 缩到 70% 宽 x 73% 高,底部基线 86% ----
W = H = 384
bb = out.split()[-1].getbbox()
sprite = out.crop(bb)
sw, sh = sprite.size
tw, th = W * 0.70, H * 0.73
scale = min(tw / sw, th / sh)
nw, nh = max(1, round(sw * scale)), max(1, round(sh * scale))
sprite = sprite.resize((nw, nh), Image.LANCZOS)
canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
canvas.alpha_composite(sprite, ((W - nw) // 2, round(H * 0.86) - nh))
dst2 = os.path.join(ROOT, "精灵", "圆窗", SID + ".webp")
canvas.save(dst2, "WEBP", quality=88, method=4)
print("圆窗版 %s  源 bbox %s  贴到 %dx%d  %0.f KB" % (SID, bb, nw, nh, os.path.getsize(dst2) / 1024))

# 预览:白底 + 米底各一张,方便肉眼验收
prev = Image.new("RGBA", (W, H), (250, 246, 238, 255))
prev.alpha_composite(canvas)
prev.convert("RGB").save(os.path.join(ROOT, "_check_%s.png" % SID))
