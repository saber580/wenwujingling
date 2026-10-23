# -*- coding: utf-8 -*-
"""把 AI打卡海报 文件夹里的两张例图加工成网页素材 → 打卡海报\例图_写实.jpg / 例图_Q版.jpg"""
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "AI打卡海报"
DST = ROOT / "打卡海报"
DST.mkdir(exist_ok=True)

JOBS = [
    ("文物精灵网页设计.png", "例图_写实.jpg"),
    ("Q版海报.jpeg", "例图_Q版.jpg"),
]

for src, name in JOBS:
    p = SRC / src
    im = Image.open(p).convert("RGB")
    if im.width > 1000:                       # 网页展示用,长边收一收
        h = round(im.height * 1000 / im.width)
        im = im.resize((1000, h), Image.LANCZOS)
    out = DST / name
    im.save(out, "JPEG", quality=88, optimize=True, progressive=True)
    print("ok", out.name, im.size, "%.0fKB" % (out.stat().st_size / 1024))
print("done →", DST)
