# -*- coding: utf-8 -*-
"""把 ImageGen 生成的方形立绘处理成 384x384 透明底 webp：
   1) 抹掉右下角水印/角标  2) 白底转透明  3) 裁边居中  4) 输出两份
用法: python tools/mk_sprite.py <src.png> <id> <站点中文名>
"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter
from collections import deque

def crop_watermark(im):
    """水印在右下角，直接裁掉底边一条与右边一条，再补白回方形。
       角色居中且不触边，裁边不会伤到主体。"""
    W, H = im.size
    right = int(W * 0.945)
    bottom = int(H * 0.885)
    im2 = im.crop((0, 0, right, bottom))
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
    canvas.paste(im2, (0, 0))
    return canvas

def white_to_alpha(im, tol=244):
    im = im.convert("RGBA")
    W, H = im.size
    px = im.load()
    # 背景色取样：四角平均
    samples = [px[2,2][:3], px[W-3,2][:3], px[2,H-3][:3], px[W-3,H-3][:3]]
    br = sum(s[0] for s in samples)//4; bg = sum(s[1] for s in samples)//4; bb = sum(s[2] for s in samples)//4
    seen = bytearray(W*H)
    q = deque()
    for x in range(W):
        q.append((x,0)); q.append((x,H-1))
    for y in range(H):
        q.append((0,y)); q.append((W-1,y))
    while q:
        x,y = q.popleft()
        i = y*W+x
        if seen[i]: continue
        seen[i] = 1
        r,g,b,a = px[x,y]
        if r >= tol and g >= tol and b >= tol:
            px[x,y] = (255,255,255,0)
            for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
                nx,ny = x+dx, y+dy
                if 0 <= nx < W and 0 <= ny < H:
                    j = ny*W+nx
                    if not seen[j]:
                        q.append((nx,ny))
    return im

def trim(im, pad_ratio=0.04):
    bbox = im.getbbox()
    if not bbox: return im
    x0,y0,x1,y1 = bbox
    w,h = x1-x0, y1-y0
    side = max(w,h)
    cx, cy = (x0+x1)//2, (y0+y1)//2
    half = int(side*(1+pad_ratio*2)/2)
    left, top = cx-half, cy-half
    canvas = Image.new("RGBA", (half*2, half*2), (0,0,0,0))
    canvas.paste(im, (-left, -top), im)
    return canvas

def main():
    src, sid, station = sys.argv[1], sys.argv[2], sys.argv[3]
    im = Image.open(src)
    if im.mode != "RGBA": im = im.convert("RGBA")
    # 合成到白底（透明选项可能给的是白底或带 alpha）
    bg = Image.new("RGBA", im.size, (255,255,255,255))
    bg.paste(im, (0,0), im)
    im = bg.convert("RGB")
    im = crop_watermark(im)
    im = white_to_alpha(im.convert("RGBA"), tol=242)
    im = trim(im)
    im = im.resize((384,384), Image.LANCZOS)
    # 轻微羽化边缘
    a = im.split()[3].filter(ImageFilter.SMOOTH)
    im.putalpha(a)
    for out in ["精灵/透明/%s.webp" % sid, "精灵/%s/%s.webp" % (station, sid)]:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        im.save(out, "WEBP", quality=92, method=6)
        print("✓", out)

if __name__ == "__main__":
    main()
