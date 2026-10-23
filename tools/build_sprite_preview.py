# -*- coding: utf-8 -*-
"""把某一站点的透明立绘拼成一张预览长图 → _预览_新立绘.png
   运行: python tools\build_sprite_preview.py [站点id]   默认 xingtai(第五站 · 邢台)
   数据全部来自 js/data.js,以后每站加完精灵直接换个 id 再跑即可。
"""
import os, sys, quickjs
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SID = sys.argv[1] if len(sys.argv) > 1 else "xingtai"

ctx = quickjs.Context()
ctx.eval(open(os.path.join(ROOT, "js", "data.js"), encoding="utf-8").read())
import json
station = json.loads(ctx.eval(
    "JSON.stringify((()=>{const s=STATIONS.find(s=>s.id==='%s'); if(!s) throw new Error('no station');"
    "return {name:s.name, subtitle:s.subtitle, place:s.place, ids:s.spiritIds};})())" % SID))

def spirit_of(sid):
    name = ctx.eval("SPIRITS['%s'].name" % sid)
    relic = ctx.eval("SPIRITS['%s'].relicName" % sid)
    era = ctx.eval("SPIRITS['%s'].era" % sid)
    return name, relic, era

ids = list(station["ids"])
items = [dict(id=i, name=spirit_of(i)[0], relic=spirit_of(i)[1], era=spirit_of(i)[2]) for i in ids]

# ---------- 画面参数 ----------
COLS = 3
CELL_W, CELL_H = 400, 448
PAD_X, PAD_TOP, PAD_BOT = 24, 138, 30
ROWS = (len(items) + COLS - 1) // COLS
W = COLS * CELL_W + PAD_X * 2
H = PAD_TOP + ROWS * CELL_H + PAD_BOT

BG = (246, 241, 231)          # 宣纸色
CARD = (255, 253, 248)
LINE = (222, 210, 188)
INK = (58, 43, 34)
RED = (165, 61, 43)
GRAY = (138, 127, 109)

im = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(im)

def font(size, bold=False):
    for p, idx in ((r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc", 0),
                   (r"C:\Windows\Fonts\msyh.ttc", 0),
                   (r"C:\Windows\Fonts\simhei.ttf", 0)):
        try:
            return ImageFont.truetype(p, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()

f_title = font(34, True)
f_sub = font(19)
f_name = font(21, True)
f_era = font(15)
f_foot = font(14)

# ---------- 抬头 ----------
d.rectangle([0, 0, W, 8], fill=RED)
d.text((PAD_X, 34), "文物精灵 · %s 新立绘" % station["name"].replace("第五站 · ", ""), font=f_title, fill=INK)
d.text((PAD_X, 84), "%s —— %s" % (station["subtitle"], " / ".join(it["name"] for it in items[:3])),
       font=f_sub, fill=GRAY)
d.text((PAD_X, 110), "以下是抠图后的透明立绘(容差 60,保留原图),对战舞台里精灵就是套用这些图站的。",
       font=f_foot, fill=GRAY)
d.line([PAD_X, 132, W - PAD_X, 132], fill=LINE, width=2)

# ---------- 卡片 ----------
def fit(im0, box):
    w, h = im0.size
    s = min(box[0] / w, box[1] / h)
    return im0.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)

for i, it in enumerate(items):
    r, c = divmod(i, COLS)
    x0 = PAD_X + c * CELL_W
    y0 = PAD_TOP + r * CELL_H
    card = [x0 + 10, y0 + 8, x0 + CELL_W - 10, y0 + CELL_H - 14]
    d.rounded_rectangle(card, radius=18, fill=CARD, outline=LINE, width=2)
    # 立绘
    p = os.path.join(ROOT, "精灵", "透明", it["id"] + ".png")
    sp = Image.open(p).convert("RGBA")
    sp = fit(sp, (card[2] - card[0] - 44, 320))
    cx = (card[0] + card[2]) // 2 - sp.size[0] // 2
    cy = card[1] + 18 + (320 - sp.size[1]) // 2
    im.paste(sp, (cx, cy), sp)
    # 名字 & 年代
    name_w = d.textlength(it["name"], font=f_name)
    if name_w <= card[2] - card[0] - 20:
        d.text(((card[0] + card[2]) / 2 - name_w / 2, card[3] - 78), it["name"], font=f_name, fill=INK)
    else:
        d.text(((card[0] + card[2]) / 2 - d.textlength(it["name"], font=f_era) / 2, card[3] - 78),
               it["name"], font=f_era, fill=INK)
    t = it["relic"]
    d.text(((card[0] + card[2]) / 2 - d.textlength(t, font=f_era) / 2, card[3] - 44), t, font=f_era, fill=GRAY)

d.text((PAD_X, H - 24), "文物精灵 · 打文物精灵 Demo · 立绘由 AI 生成后经 tools\\cut_sprites.py 抠图",
       font=f_foot, fill=GRAY)

out = os.path.join(ROOT, "_预览_新立绘.png")
im.save(out, "PNG")
print("已生成:", out, "(%dx%d)" % (W, H))
