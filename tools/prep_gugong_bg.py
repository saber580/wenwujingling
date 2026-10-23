# -*- coding: utf-8 -*-
"""把用户提供的故宫图处理成对战背景 → 背景/故宫.png

做三件事:
  1. 抹掉右下角的水印(用旁边的云彩像素补上,羽化接缝)
  2. 放大 3 倍 + 轻微锐化,浏览器里显示更清楚
  3. 左右镜像补边,让整幅图刚好是舞台的比例(2.14:1)
     → 铺满时不会裁掉屋顶,也不会拉变形,而且左右天然对称

运行: python tools\\prep_gugong_bg.py
"""
import os, glob
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, "背景")
DST = os.path.join(BG, "故宫.jpg")

RATIO = 620 / 290.0     # 舞台宽高比(style.css 里 .stage 的尺寸)
SCALE = 3
TARGET_W = 620          # 舞台最大宽度,用来估算需要的像素


def find_src():
    """找 背景/ 里那张用户刚放进来的原图"""
    keep = ("故宫原图.png", "故宫.png", "故宫.jpg", "故宫_手绘备用.png")
    cands = [p for p in glob.glob(os.path.join(BG, "*"))
             if os.path.isfile(p) and os.path.basename(p) not in keep
             and os.path.splitext(p)[1].lower() in (".png", ".jpg", ".jpeg", ".webp", ".bmp")]
    if not cands:
        raise SystemExit("背景/ 里没找到原图,请把故宫图片放进去再跑一次")
    return max(cands, key=os.path.getmtime)


def clean_watermark(im):
    """右下角水印:把左边一块干净的云彩镜像补过来(带羽化,看不出接缝)"""
    w, h = im.size
    x0, y0 = int(w * 0.855), int(h * 0.855)
    box = (x0, y0, w, h)
    bw, bh = w - x0, h - y0
    src = im.crop((x0 - bw, y0, x0, h))                  # 正左边同样大的一块
    src = src.transpose(Image.FLIP_LEFT_RIGHT)           # 镜像一下,云纹更自然
    mask = Image.new("L", (bw, bh), 255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(2, bw // 8)))
    im.paste(src, (x0, y0), mask)
    return im


def mirror_extend(im):
    """左右镜像补边到舞台比例,中间原图完整保留"""
    w, h = im.size
    need = int(round(h * RATIO))
    if need <= w:
        return im
    strip = (need - w + 1) // 2
    canvas = Image.new("RGB", (need, h))
    canvas.paste(im.crop((0, 0, strip, h)).transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
    canvas.paste(im, (strip, 0))
    canvas.paste(im.crop((w - strip, 0, w, h)).transpose(Image.FLIP_LEFT_RIGHT), (strip + w, 0))
    # 补边压暗一点,视线集中到中间的门楼
    sh = Image.new("L", (need, h), 0)
    sd = ImageDraw.Draw(sh)
    for i in range(int(need * 0.17)):
        sd.line([(i, 0), (i, h)], fill=int(46 * (1 - i / (need * 0.17)) ** 2))
        sd.line([(need - 1 - i, 0), (need - 1 - i, h)], fill=int(46 * (1 - i / (need * 0.17)) ** 2))
    canvas.paste(Image.new("RGB", (need, h), (26, 16, 8)), (0, 0), sh)
    return canvas


def main():
    src = find_src()
    im = Image.open(src).convert("RGB")
    print("原图:", os.path.basename(src), im.size)

    im = clean_watermark(im)
    im = im.resize((im.width * SCALE, im.height * SCALE), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=2.4, percent=62, threshold=3))
    im = mirror_extend(im)

    # 底部再压一点点,让精灵和血条更清楚
    w, h = im.size
    sh = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(sh)
    for i in range(int(h * 0.30)):
        y = h - 1 - i
        sd.line([(0, y), (w, y)], fill=int(30 * (1 - i / (h * 0.30)) ** 2))
    im.paste(Image.new("RGB", (w, h), (30, 18, 8)), (0, 0), sh)

    im.save(DST, "JPEG", quality=92, optimize=True, progressive=True)
    print("已生成:", DST, "| 尺寸", im.size, "| 比例 %.2f" % (im.width / im.height),
          "| %.0f KB" % (os.path.getsize(DST) / 1024))
    print("舞台在 620px 宽时会用到约 %dpx,当前宽度 %dpx" % (TARGET_W * SCALE, im.width))


if __name__ == "__main__":
    main()
