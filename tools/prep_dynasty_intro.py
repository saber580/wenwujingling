# -*- coding: utf-8 -*-
"""开场画卷 · 朝代时间轴缩略图:精灵\朝代\ 原图 → 精灵\朝代\缩略\ 256px JPG
原图很大(2~6MB),开场画卷只用小圆章尺寸,统一压成缩略图,页面加载才轻快。"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "精灵", "朝代")
DST = os.path.join(SRC, "缩略")
os.makedirs(DST, exist_ok=True)

n = 0
for fn in sorted(os.listdir(SRC)):
    p = os.path.join(SRC, fn)
    if not os.path.isfile(p):
        continue
    if os.path.splitext(fn)[1].lower() not in (".png", ".jpg", ".jpeg"):
        continue
    im = Image.open(p).convert("RGB")
    im.thumbnail((256, 256), Image.LANCZOS)
    out = os.path.join(DST, os.path.splitext(fn)[0] + ".jpg")
    im.save(out, "JPEG", quality=82)
    n += 1
    print(u"✓ %s → %s %s" % (fn, os.path.basename(out), im.size))
print(u"共 %d 张 → %s" % (n, DST))
