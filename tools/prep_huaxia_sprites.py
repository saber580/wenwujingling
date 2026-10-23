# -*- coding: utf-8 -*-
"""把 精灵\\朝代\\ 的 16 张原图抠成透明立绘(第零站 · 华夏)。
   输出:精灵\\透明\\<id>.png(对战用)与 精灵\\朝代\\立绘\\<id>.png(展示用),均为 384×384 RGBA。
   工艺:中值去噪(median=7,抹掉底稿线/颗粒) → 自适应灌水(从边缘出发,不断从「已灌区外沿」
        重新起灌,沿渐变一路走) → 可选开运算/底切/暗切 → 半分辨率连通域过滤(保主体、去
        水印残字与浮饰) → 内缩 + 羽化 → 方形化缩放 384。原图保留不动。
   运行: python tools\\prep_huaxia_sprites.py [--only id1,id2]
"""
import os
import sys
import time
import tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "精灵", "朝代")
DST_A = os.path.join(ROOT, "精灵", "透明")
DST_B = os.path.join(SRC, "立绘")
QA_DIR = os.path.join(tempfile.gettempdir(), "opencode")
SIZE = 384
SENT = (255, 0, 255)

FILES = {
    "xiapaishi":      "夏朝铜嵌绿松石兽面纹牌.png",
    "fuxiaozun":      "商朝妇好鸮尊.jpeg",
    "dengxizun":      "西周邓仲牺尊.jpeg",
    "shuangyangzun":  "东周青铜双羊尊.jpeg",
    "bingmayong":     "秦朝兵马俑.jpeg",
    "shuanglongbi":   "汉代透雕双龙白玉璧.jpeg",
    "pianjiangjunyin": "三国“偏将军印章”金印.png",
    "jinhouniaozun":  "西晋晋候鸟尊.png",
    "longfengpei":    "南北朝玉龙凤形佩.png",
    "duoguxinyin":    "隋朝独孤信多面印.png",
    "zoulong":        "唐赤金走龙.png",
    "daoliuhu":       "五代耀州窑青釉刻花提梁倒流壶.png",
    "yunlongpei":     "宋代云龙佩.jpeg",
    "shuangchibei":   "双螭耳玉杯 元代.jpeg",
    "longfenglu":     "明，青花龙凤纹三足炉.jpeg",
    "yanshidi":       "清代碧玉凤鸟形砚滴.jpeg",
}

# 默认 tol=32、keep_frac=0.12、erode=1
# open: 开运算半径(r5 = MinFilter(11)+MaxFilter(11),去飘带/星星等细饰)
# dark_cut: 亮度低于该值的前景像素置透明(去镂空里的黑底,如云龙佩)
# bottom_cut: 自动找底面接触线并切掉下方阴影/倒影(如金印)
CFG = {
    "fuxiaozun":      {"tol": 40, "erode": 2},          # 深色封边 → 自动走内缩种子
    "shuangyangzun":  {"tol": 30},
    "bingmayong":     {"tol": 30},
    "shuanglongbi":   {"tol": 24},
    "pianjiangjunyin": {"tol": 56, "bottom_cut": True}, # 反光地板 → 底切
    "jinhouniaozun":  {"tol": 64},                      # 暗摄影棚底
    "longfengpei":    {"tol": 26},
    "duoguxinyin":    {"tol": 56, "open": 5},           # 飘带/星星灵光 → 开运算
    "daoliuhu":       {"tol": 26},
    "yunlongpei":     {"tol": 64, "dark_cut": 45},      # 暗饰底 → 暗切镂空
    "shuangchibei":   {"tol": 40},
    "longfenglu":     {"tol": 80},                      # 云纹/青烟底
    "yanshidi":       {"tol": 30},
}


def flood_bg(med, tol, step=4):
    """仅自边缘灌水;若边缘被「封边」(几乎灌不动,个别生成图带深色边框),再补几圈内缩种子。"""
    w, h = med.size
    work = med.copy()

    def filled_of():
        a = np.asarray(work)
        return (a[:, :, 0] == 255) & (a[:, :, 1] == 0) & (a[:, :, 2] == 255)

    def run(pts):
        for s in pts:
            if work.getpixel(s) != SENT:
                ImageDraw.floodfill(work, s, SENT, thresh=tol)

    edge = ([(x, 0) for x in range(0, w, step)] + [(x, h - 1) for x in range(0, w, step)] +
            [(0, y) for y in range(0, h, step)] + [(w - 1, y) for y in range(0, h, step)])
    run(edge)
    pct = filled_of().mean()
    if pct < 0.08:
        inset = []
        for k in (12, 24, 36, 52, 72):
            inset += ([(x, k) for x in range(k, w - k, step)] + [(x, h - 1 - k) for x in range(k, w - k, step)] +
                      [(k, y) for y in range(k, h - k, step)] + [(w - 1 - k, y) for y in range(k, h - k, step)])
        run(inset)
        print("    封边(%.1f%%)→内缩种子重灌" % (pct * 100), end="")
    return filled_of()


def keep_largest(fg, keep_frac=0.12, factor=2):
    """半分辨率连通域过滤:只留面积 ≥ 最大域 keep_frac 的连通域。"""
    h, w = fg.shape
    sw, sh = (w + factor - 1) // factor, (h + factor - 1) // factor
    small = np.asarray(Image.fromarray(fg.astype(np.uint8) * 255).resize((sw, sh), Image.BOX)) > 20
    parent = {}

    def find(a):
        r = a
        while parent[r] != r:
            r = parent[r]
        while parent[a] != r:
            parent[a], a = r, parent[a]
        return r

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    label = 0
    runs_all = []
    prev = []
    for y in range(sh):
        row = small[y]
        d = np.diff(np.concatenate(([0], row.astype(np.int8), [0])))
        starts = np.flatnonzero(d == 1)
        ends = np.flatnonzero(d == -1)
        runs = []
        for s, e in zip(starts, ends):
            parent[label] = label
            runs.append((int(s), int(e), label))
            label += 1
        i = j = 0
        while i < len(prev) and j < len(runs):
            ps, pe, pl = prev[i]
            cs, ce, cl = runs[j]
            if pe <= cs:
                i += 1
            elif ce <= ps:
                j += 1
            else:
                union(pl, cl)
                if pe < ce:
                    i += 1
                else:
                    j += 1
        runs_all.append(runs)
        prev = runs
    area = {}
    for runs in runs_all:
        for s, e, l in runs:
            r = find(l)
            area[r] = area.get(r, 0) + (e - s)
    if not area:
        return fg
    best = max(area.values())
    keep = {r for r, a in area.items() if a >= best * keep_frac}
    out = np.zeros((sh, sw), dtype=bool)
    for y, runs in enumerate(runs_all):
        for s, e, l in runs:
            if find(l) in keep:
                out[y, s:e] = True
    up = np.asarray(Image.fromarray(out.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)) > 0
    print("    连通域 %d 保留 %d(最大 %dpx)" % (len(area), len(keep), best), end="")
    return fg & up


def apply_bottom_cut(fg, arr):
    """在主体包围盒下半部找行间颜色落差最大的行(底面接触线),切掉其下阴影/倒影。"""
    ys, xs = np.where(fg)
    if len(ys) == 0:
        return fg
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    ymid = y0 + (y1 - y0) // 2
    seg = arr[y0:y1 + 1, x0:x1 + 1].astype(np.int16)
    rows = np.abs(np.diff(seg, axis=0)).sum(axis=2).mean(axis=1)
    rel = rows[ymid - y0:]
    cut = ymid + int(np.argmax(rel)) + 1
    out = fg.copy()
    out[cut:, :] = False
    print("    底切@y=%d" % cut, end="")
    return out


def compose(im, fg, erode=1):
    alpha = Image.fromarray(np.where(fg, 255, 0).astype(np.uint8))
    if erode > 0:
        alpha = alpha.filter(ImageFilter.MinFilter(2 * erode + 1))
    alpha = alpha.filter(ImageFilter.GaussianBlur(1.2))
    ys, xs = np.where(fg)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    side = int(round(max(x1 - x0, y1 - y0) * 1.10)) or 1
    w, h = im.size
    nx0, ny0 = int(round(cx - side / 2.0)), int(round(cy - side / 2.0))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    px0, py0 = max(0, nx0), max(0, ny0)
    px1, py1 = min(w, nx0 + side), min(h, ny0 + side)
    piece = im.crop((px0, py0, px1, py1)).convert("RGBA")
    piece.putalpha(alpha.crop((px0, py0, px1, py1)))
    canvas.paste(piece, (px0 - nx0, py0 - ny0))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def make_bg(kind, w, h):
    if kind == "check":
        yy, xx = np.mgrid[0:h, 0:w]
        c = ((yy // 24 + xx // 24) % 2).astype(np.uint8)
        chk = np.repeat(np.where(c[..., None] == 0, 237, 208).astype(np.uint8), 3, axis=2)
        return Image.fromarray(chk)
    return Image.new("RGB", (w, h), (247, 241, 229))


def montage(items, path, kind):
    T, cols, pad = 320, 4, 14
    rows = (len(items) + cols - 1) // cols
    W = cols * T + pad * (cols + 1)
    H = rows * T + pad * (rows + 1)
    sheet = make_bg(kind, W, H)
    d = ImageDraw.Draw(sheet)
    for i, (sid, img) in enumerate(items):
        x = pad + (i % cols) * (T + pad)
        y = pad + (i // cols) * (T + pad)
        tile = make_bg(kind, T, T)
        t = img.copy()
        t.thumbnail((T - 6, T - 6), Image.LANCZOS)
        tile.paste(t, ((T - t.size[0]) // 2, (T - t.size[1]) // 2), t)
        sheet.paste(tile, (x, y))
        d.rectangle([x, y, x + T - 1, y + T - 1], outline=(205, 188, 158))
        d.text((x + 5, y + 4), sid, fill=(150, 60, 30))
    sheet.save(path)


def main():
    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    os.makedirs(DST_B, exist_ok=True)
    os.makedirs(QA_DIR, exist_ok=True)
    items = []
    for sid, name in FILES.items():
        if only and sid not in only:
            continue
        path = os.path.join(SRC, name)
        assert os.path.exists(path), "缺图: " + path
        t0 = time.time()
        cfg = CFG.get(sid, {})
        im = Image.open(path).convert("RGB")
        arr = np.asarray(im)
        med = im.filter(ImageFilter.MedianFilter(7))
        bg = flood_bg(med, cfg.get("tol", 32))
        fg = ~bg
        if cfg.get("open"):
            r = cfg["open"]
            m = Image.fromarray(fg.astype(np.uint8) * 255)
            fg = np.asarray(m.filter(ImageFilter.MinFilter(2 * r + 1)).filter(ImageFilter.MaxFilter(2 * r + 1))) > 128
        fg = keep_largest(fg, cfg.get("keep_frac", 0.12))
        if cfg.get("dark_cut"):
            lum = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
            fg = fg & (lum >= cfg["dark_cut"])
        if cfg.get("bottom_cut"):
            fg = apply_bottom_cut(fg, arr)
        out = compose(im, fg, cfg.get("erode", 1))
        out.save(os.path.join(DST_A, sid + ".png"), optimize=True)
        out.save(os.path.join(DST_B, sid + ".png"), optimize=True)
        print("%-15s tol=%-3d 前景=%4.1f%%  %4.1fs  %s" % (sid, cfg.get("tol", 32), fg.mean() * 100, time.time() - t0, name))
        items.append((sid, out))
    if items:
        montage(items, os.path.join(QA_DIR, "hx_qa_paper.png"), "paper")
        montage(items, os.path.join(QA_DIR, "hx_qa_check.png"), "check")
        print("QA 拼图:", os.path.join(QA_DIR, "hx_qa_paper.png"))


if __name__ == "__main__":
    main()
