# -*- coding: utf-8 -*-
"""把 精灵\\国博\\ 里豆包生成的 Q 版原图整理成 384×384 的精灵立绘 <id>.png
   (从四边灌水找背景 → 主体包围盒 → 方形化 → 缩放到与现役立绘同尺寸;原图保留不动)
   运行: python tools\\prep_guobo_sprites.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "精灵", "国博")
SIZE = 384
SENTINEL = (255, 0, 255)

# 原图 → 精灵 id(对应「国博十大镇馆之宝」海报 01/02/04/06/07/08/09)
MAP = {
    "文物精灵网页设计 (2).jpeg": "houmuwuding",   # 后母戊鼎
    "文物精灵网页设计 (3).jpeg": "siyangfangzun", # 四羊方尊
    "文物精灵网页设计 (4).jpeg": "xizun",         # 错金银云纹青铜犀尊
    "文物精灵网页设计 (2).png":  "xiangdou",      # 鎏金镶斗
    "文物精灵网页设计.png":      "baohuadeng",    # 彩绘陶百花灯
    "文物精灵网页设计 (1).png":  "shuochangyong", # 击鼓说唱俑
    "文物精灵网页设计 (5).jpeg": "sancailuotuo",  # 唐三彩骆驼载乐俑
}


def main():
    for name, sid in MAP.items():
        im = Image.open(os.path.join(SRC, name)).convert("RGB")
        w, h = im.size
        # 1) 从四边灌水,把背景标成哨兵色
        work = im.copy()
        seeds = ([(x, 1) for x in range(0, w, 6)] + [(x, h - 2) for x in range(0, w, 6)] +
                 [(1, y) for y in range(0, h, 6)] + [(w - 2, y) for y in range(0, h, 6)])
        for s in seeds:
            if work.getpixel(s) != SENTINEL:
                ImageDraw.floodfill(work, s, SENTINEL, thresh=40)
        a = np.asarray(work)
        fg = ~((a[:, :, 0] == 255) & (a[:, :, 1] == 0) & (a[:, :, 2] == 255))
        # 2) 形态学开运算:去掉水印文字等细碎笔画,再看主体包围盒
        m = Image.fromarray((fg * 255).astype("uint8"), "L")
        m = m.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
        ys, xs = np.where(np.asarray(m) > 0)
        x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
        # 3) 方形化(留约 8% 边距)+ 缩放到 384
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        side = max(x1 - x0, y1 - y0) * 1.16
        nx0, ny0 = int(cx - side / 2), int(cy - side / 2)
        nx1, ny1 = int(cx + side / 2), int(cy + side / 2)
        px0, py0, px1, py1 = max(0, nx0), max(0, ny0), min(w, nx1), min(h, ny1)
        canvas = Image.new("RGB", (nx1 - nx0, ny1 - ny0), im.getpixel((3, 3)))
        canvas.paste(im.crop((px0, py0, px1, py1)), (px0 - nx0, py0 - ny0))
        out = canvas.resize((SIZE, SIZE), Image.LANCZOS)
        dst = os.path.join(SRC, sid + ".png")
        out.save(dst, "PNG", optimize=True)
        cover = (x1 - x0) * (y1 - y0) / float(w * h)
        print("  %-24s -> %-15s bbox=%4d,%4d~%4d,%4d 覆盖%.0f%%  %d KB"
              % (name, sid + ".png", x0, y0, x1, y1, cover * 100, os.path.getsize(dst) // 1024))


if __name__ == "__main__":
    main()
