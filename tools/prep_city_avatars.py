# -*- coding: utf-8 -*-
"""把 背景\城市头像\ 里的城市头像章整理成 装饰\城市头像\<站点id>.png
   (统一为 PNG、站点 id 命名;原图保留不动;缺的站点不生成,页面回退显示编号徽章)
   衡水新图带大白边,自动裁到圆章 + 留边(与其余 10 张构图一致)。
   运行: python tools\prep_city_avatars.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "背景", "城市头像")
DST = os.path.join(ROOT, "装饰", "城市头像")

# 站点 id → 背景\城市头像\ 里的原图(经逐张目检核对城市名)
MAP = {
    "cangzhou":     "e0b9a8c9a3204652a55b610a811b5d50.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 沧州铁狮
    "baoding":      "9c742882ca224ccbab8a5acb56e62e7e.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 保定
    "zhangjiakou":  "49f93f6f049a4d3ab8ed0065664258c9.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 张家口
    "shijiazhuang": "52c317e5f21f427fa0cb4414c69b0266.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 石家庄
    "xingtai":      "ae87dce6faa0cc83abc2121622748320.jpg",                                    # 邢台
    "chengde":      "990dcd52602744b8aaeb33edd71465de.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 承德
    "tangshan":     "28cd2a29f3784966b2db00cdb6f06f4c.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 唐山
    "qinhuangdao":  "fda702eaf5ab496cbf8fc3abea91ea46.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 秦皇岛
    "langfang":     "32bccb04f91d50fad9a67ae744dcac35.jpg",                                    # 廊坊
    "handan":       "004d46ceb3944080a14bcbfcedac0614.jpeg~tplv-a9rns2rl98-cthumb_lwm3.png",  # 邯郸
    "hengshui":     "画卷形式开篇的网站.jpeg",                                                   # 衡水(原图文件名如此)
    "guobo":        "画卷形式开篇的网站 (1).jpeg",                                               # 中国国家博物馆(原图文件名如此)
}
# 需要自动裁白边的原图(其余 10 张本身已经裁好)
CROP_TIGHT = {"hengshui", "guobo"}


def tight_square(im, margin=1.10):
    """按内容(圆章)紧贴裁出正方画幅:去掉白边与右下角水印后再留边"""
    a = np.asarray(im.convert("RGB")).astype(int)
    h, w = a.shape[:2]
    bg = a[int(h * 0.04), int(w * 0.04)].copy()           # 取左上角空白处的底色
    a[int(h * 0.90):, int(w * 0.70):] = bg                # 抹掉右下角「豆包AI生成」水印
    im = Image.fromarray(a.astype("uint8"))
    diff = np.abs(a - 255).sum(axis=2)
    mask = diff > 60
    mask[int(h * 0.90):, int(w * 0.70):] = False
    ys, xs = np.where(mask)
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    side = max(x1 - x0, y1 - y0) * margin
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
    return im.crop(box)


def main():
    os.makedirs(DST, exist_ok=True)
    for sid, name in MAP.items():
        p = os.path.join(SRC, name)
        im = Image.open(p).convert("RGB")
        if sid in CROP_TIGHT:
            before = im.size
            im = tight_square(im).resize((384, 384), Image.LANCZOS)
            print("  %-13s 裁边缩放 %s -> %s" % (sid + ".png", before, im.size))
        dst = os.path.join(DST, sid + ".png")
        im.save(dst, "PNG", optimize=True)
        print("  %-13s <- %-42s %d KB" % (sid + ".png", name[:40], os.path.getsize(dst) // 1024))
    print("完成 → %s" % DST)
    missing = [s for s in ("cangzhou", "baoding", "zhangjiakou", "shijiazhuang", "xingtai",
                           "chengde", "tangshan", "qinhuangdao", "langfang", "handan",
                           "hengshui", "guobo") if s not in MAP]
    if missing:
        print("尚无头像(页面回退编号徽章):", "、".join(missing))


if __name__ == "__main__":
    main()
