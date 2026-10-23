# -*- coding: utf-8 -*-
"""处理「蓝金山水」网站背景原图 → 背景\青绿山水.jpg

原图是视频截图(1012×576),需要三步处理:
  1) 裁掉四周白边与底部播放条(含播放/进度小图标区);
  2) 修补两处视频界面痕迹:
     - 中右部半透明「大播放三角」→ 从右侧同层金色纹理克隆补上;
     - 右下角视频水印 → 从左侧水面纹理克隆补上;
     (克隆前先把来源纹理的明暗/浓淡匹配到修补区四周,再用圆角羽化蒙版贴回,不留矩形边)
  3) 放大到 1920 宽 + 轻锐化,存 JPG。

想换背景:把新图存为 背景\青绿山水原图.png,再运行本脚本即可。
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "背景", "青绿山水原图.png")
DST = os.path.join(ROOT, "背景", "青绿山水.jpg")

# 实测裁剪框:左 20 / 上 17 / 右 985 / 下 555(原图白边 19px、顶 16px;底部播放条小图标从 y556 起)
BOX = (20, 17, 985, 555)
TARGET_W = 1920


def clone_fill(im, box, off, feath=12, radius=26):
    """把 box 区域用 box+off 处的纹理克隆补上:
    先按修补区四周的颜色统计校准来源的明暗/对比(避免色差),
    再用圆角羽化蒙版贴回(避免矩形硬边)。"""
    W, H = im.size
    x0, y0, x1, y1 = box
    x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, W); y1 = min(y1, H)

    # 修补区四周四条参考带的颜色统计
    strips = [
        (x0, y0 - 16, x1, y0 - 3),
        (x0, y1 + 3, x1, y1 + 16),
        (x0 - 16, y0, x0 - 3, y1),
        (x1 + 3, y0, x1 + 16, y1),
    ]
    ms = [0.0, 0.0, 0.0]; ss = [0.0, 0.0, 0.0]; n = 0
    for (xa, ya, xb, yb) in strips:
        xa = max(xa, 0); ya = max(ya, 0); xb = min(xb, W); yb = min(yb, H)
        if xb - xa < 2 or yb - ya < 2:
            continue
        st = ImageStat.Stat(im.crop((xa, ya, xb, yb)))
        for i in range(3):
            ms[i] += st.mean[i]; ss[i] += st.stddev[i]
        n += 1
    if n == 0:
        n = 1
    mt = [v / n for v in ms]; stt = [v / n for v in ss]

    # 来源纹理 + 颜色匹配
    donor = im.crop((x0 + off[0], y0 + off[1], x1 + off[0], y1 + off[1]))
    dstat = ImageStat.Stat(donor)
    chans = []
    for i, ch in enumerate(donor.split()):
        k = 1.0
        if dstat.stddev[i] > 1e-3:
            k = min(max(stt[i] / dstat.stddev[i], 0.85), 1.2)
        a = mt[i] - dstat.mean[i] * k
        lut = [max(0, min(255, round(a + k * v))) for v in range(256)]
        chans.append(ch.point(lut))
    donor = Image.merge("RGB", chans)

    # 圆角羽化蒙版贴回
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(feath))
    im.paste(donor, (x0, y0), m.crop((x0, y0, x1, y1)))
    return im


def main():
    im = Image.open(SRC).convert("RGB")
    print("原图:", im.size)
    im = im.crop(BOX)
    print("裁剪后:", im.size)

    # 大播放三角(780,263)-(845,342):从正下方金色灌木纹理克隆(竖直方向纹理最近、无浮枝)
    im = clone_fill(im, (742, 228, 842, 334), (0, 110), feath=14, radius=30)
    # 右下角视频水印:从左侧水面纹理克隆
    im = clone_fill(im, (925, 506, 965, 538), (-54, 0), feath=10, radius=12)

    w, h = im.size
    im = im.resize((TARGET_W, round(h * TARGET_W / w)), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=62, threshold=3))
    im.save(DST, quality=88, optimize=True, progressive=True)
    print("输出:", DST, im.size, "%.0f KB" % (os.path.getsize(DST) / 1024))


if __name__ == "__main__":
    main()
