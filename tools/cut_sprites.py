# -*- coding: utf-8 -*-
"""把精灵立绘的浅色背景抠掉,生成透明版 → 精灵/透明/<id>.png
   (对战舞台上精灵要“站”在故宫背景里,不能带着一块方形底色)
   原图不动,随时可以重新生成。
   运行: python tools\\cut_sprites.py
"""
import os
from collections import deque
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "精灵")
DST = os.path.join(SRC, "透明")
SENTINEL = (255, 0, 255)

# 个别图碎块判定收紧(默认 6):离主体更远的碎块直接清掉
D_PARAM = {"shimiaozhen": 2}
# 个别图定点擦除与主体「焊连」的背景景物 (x0, y0, x1, y1)(左闭右开)
ERASE_RECTS = {"shimiaozhen": [(0, 240, 53, 340), (346, 238, 384, 300), (0, 342, 52, 372)]}


def flood_cut(rgb, thresh=60):
    """从四边往里灌,把连通的浅色背景标记出来。
    thresh 越大,灌得越狠:60 能连立绘背后淡淡的『城楼线描 / 云纹』一起清掉,
    同时不会咬到立绘主体(80 就会咬到白玉、汉白玉这类浅色文物了)。"""
    work = rgb.copy()
    w, h = work.size
    seeds = ([(x, 1) for x in range(0, w, 6)] + [(x, h - 2) for x in range(0, w, 6)] +
             [(1, y) for y in range(0, h, 6)] + [(w - 2, y) for y in range(0, h, 6)])
    for s in seeds:
        if work.getpixel(s) != SENTINEL:
            ImageDraw.floodfill(work, s, SENTINEL, thresh=thresh)
    return work


def components(flat, w, h):
    """把 bool 平铺数组切成连通块,返回 (标签数组, [(大小, 单元格列表), ...])"""
    lab = np.zeros(flat.size, np.int32)
    order = np.flatnonzero(flat)
    cur = 0
    out = []
    for s in order:
        if lab[s] or not flat[s]:
            continue
        cur += 1
        lab[s] = cur
        q = deque([s])
        cells = []
        while q:
            i = q.popleft()
            cells.append(i)
            y, x = divmod(i, w)
            if y > 0 and flat[i - w] and not lab[i - w]:
                lab[i - w] = cur; q.append(i - w)
            if y < h - 1 and flat[i + w] and not lab[i + w]:
                lab[i + w] = cur; q.append(i + w)
            if x > 0 and flat[i - 1] and not lab[i - 1]:
                lab[i - 1] = cur; q.append(i - 1)
            if x < w - 1 and flat[i + 1] and not lab[i + 1]:
                lab[i + 1] = cur; q.append(i + 1)
        out.append((len(cells), cells))
    return lab, out


def is_thin(cells, w, h):
    """这个块是不是处处都不超过 2px 粗(水印文字、杂线都是这样)"""
    s = set(cells)
    for c in cells:
        y, x = divmod(c, w)
        if (y > 0 and c - w in s) and (y < h - 1 and c + w in s) and \
           (x > 0 and c - 1 in s) and (x < w - 1 and c + 1 in s):
            return False
    return True


def keep_near_main(alpha, w, h, d=6):
    """只保留主体和紧贴主体的碎块。
    新一批立绘背后画了水墨山、云纹、宫殿线描等『背景装饰』,
    它们颜色和纸底不同、灌不进来,靠这一步清掉。"""
    flat = alpha.ravel()
    lab, comps = components(flat, w, h)
    if not comps:
        return alpha, 0, 0
    comps.sort(key=lambda t: -t[0])
    core = np.zeros(w * h, bool)
    core[comps[0][1]] = True
    g = core.reshape(h, w).copy()
    for _ in range(d):
        n = g.copy()
        n[1:, :] |= g[:-1, :]; n[:-1, :] |= g[1:, :]
        n[:, 1:] |= g[:, :-1]; n[:, :-1] |= g[:, 1:]
        g = n
    g = g.ravel()
    keep = np.zeros(w * h, bool)
    dropped = 0
    for i, (size, cells) in enumerate(comps):
        if i == 0 or any(g[c] for c in cells):
            keep[cells] = True
        else:
            dropped += 1
    return keep.reshape(h, w), len(comps) - dropped, dropped


def clean(alpha, w, h):
    """1) 清抗锯齿噪点  2) 清“处处都细”的块(水印文字/杂线)
       3) 清掉底部水印带里除主体外的一切  4) 背景外扩 1px 吃掉浅描边"""
    flat = alpha.ravel()
    lab, comps = components(flat, w, h)
    comps.sort(key=lambda t: -t[0])
    main = set(comps[0][1]) if comps else set()          # 最大的连通块 = 精灵主体
    dropped = 0
    for size, cells in comps:
        y0 = min(c // w for c in cells)
        bad = (size < 14) or is_thin(cells, w, h) or (y0 >= h * 0.90 and cells is not comps[0][1])
        if bad:
            for c in cells:
                flat[c] = False
            dropped += 1
    bg = ~flat.reshape(h, w)
    d = bg.copy()
    d[1:, :] |= bg[:-1, :]
    d[:-1, :] |= bg[1:, :]
    d[:, 1:] |= bg[:, :-1]
    d[:, :-1] |= bg[:, 1:]
    return ~d, len(comps) - dropped


def registered_ids():
    """从 js/data.js 里读出已经登记的精灵 id(只处理真正用到的立绘)"""
    txt = open(os.path.join(ROOT, "js", "data.js"), encoding="utf-8").read()
    return txt


def find_sprites():
    """扫描 精灵\\ 以及 精灵\\<站点>\\ ,返回 [(源文件路径, 精灵id)];跳过 透明\\"""
    out = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        if os.path.basename(dirpath) == "透明":
            dirnames[:] = []
            continue
        for f in filenames:
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".bmp")):
                out.append((os.path.join(dirpath, f), os.path.splitext(f)[0]))
    out.sort(key=lambda t: t[1])
    return out


def main():
    os.makedirs(DST, exist_ok=True)
    data_js = registered_ids()
    skipped = []
    done = 0
    for src, sid in find_sprites():
        if ('"%s"' % sid) not in data_js:
            skipped.append(sid)          # 备料,还没在 data.js 里登记,先不处理
            continue
        rel = os.path.relpath(src, ROOT)
        im = Image.open(src).convert("RGB")
        w, h = im.size
        marked = flood_cut(im)

        # 生成 alpha:哨兵色 → 透明,再清噪点 / 去水印 / 吃掉浅描边
        alpha = np.zeros((h, w), bool)
        mp = marked.load()
        for y in range(h):
            for x in range(w):
                if mp[x, y] != SENTINEL:
                    alpha[y, x] = True
        alpha, big = clean(alpha, w, h)
        alpha, kept, gone = keep_near_main(alpha, w, h, d=D_PARAM.get(sid, 6))
        for (x0, y0, x1, y1) in ERASE_RECTS.get(sid, []):
            alpha[y0:y1, x0:x1] = False      # 定点擦除焊连的背景景物(如邯郸瓷枕背后的水墨山)

        am = Image.fromarray((alpha * 255).astype("uint8"), "L").filter(ImageFilter.GaussianBlur(0.6))
        out = im.convert("RGBA")
        out.putalpha(am)
        dst = os.path.join(DST, sid + ".png")
        out.save(dst, "PNG", optimize=True)
        done += 1
        print("  %-22s 保留 %d 块(清掉背景装饰 %d 块), 保留像素 %.1f%%  %.0f KB"
              % (rel, kept, gone, alpha.mean() * 100, os.path.getsize(dst) / 1024))
    if skipped:
        print("  跳过(还没登记进 data.js 的备料):", ", ".join(skipped))
    print("完成 %d 张 → %s" % (done, DST))


if __name__ == "__main__":
    main()
