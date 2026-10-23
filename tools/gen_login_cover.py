# -*- coding: utf-8 -*-
"""生成登录页左侧合照 -> 装饰/登录合照.webp

源图:背景/jimeng-2026-10-20-4184-...png (2560x1440, 16:9, 即梦 AI 生成)
流程:
  1. 去掉水印(左上「AI生成」徽标 / 右下「即梦AI」logo),OpenCV inpaint
  2. 缩到 1200 宽
  3. 上下补背景,做成 1200x960(5:4) —— 登录卡左图区约 1.05:1,cover 只裁掉两侧不到 9%,角色不会被切,
     cover 时裁掉的是补出来的留白,不会切到两侧的角色
用法: python tools\\gen_login_cover.py
"""
import os, cv2, numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "背景",
                   "jimeng-2026-10-20-4184-@图片1、@图片2、@图片3 是角色和风格参考。横版16_9国风Q版文物精灵大合....png")
DST = os.path.join(ROOT, "装饰", "登录合照.webp")

img = cv2.imdecode(np.fromfile(SRC, dtype=np.uint8), cv2.IMREAD_COLOR)   # 中文路径 cv2.imread 会失败
h, w = img.shape[:2]
print("源图 %d x %d" % (w, h))

# ---------- 1. 水印 mask:只在两个角落 ROI 里找「近白 + 低饱和」像素,避免误伤角色高光 ----------
b, g, r = cv2.split(img.astype(np.int16))
minc = np.minimum(np.minimum(b, g), r)
maxc = np.maximum(np.maximum(b, g), r)
whiteish = ((minc > 228) & ((maxc - minc) < 16)).astype(np.uint8)

mask = np.zeros((h, w), np.uint8)
mask[18:152, 18:302] = 255                                     # 左上「AI生成」:整块纯背景,直接矩形修补最干净
mask[1252:1412, 2010:2545] = whiteish[1252:1412, 2010:2545]    # 右下「即梦AI」:要避开旁边精灵的金色脚,只按白色拾取
print("水印像素 %d" % int(mask.sum()))

mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)), iterations=2)
clean = cv2.inpaint(img, mask, 7, cv2.INPAINT_TELEA)

# ---------- 2. 缩到 1200 宽 ----------
TW = 1200
TH = round(h * TW / w)                                  # 675
small = cv2.resize(clean, (TW, TH), interpolation=cv2.INTER_AREA)

# ---------- 3. 上下补背景到 1200x1080 ----------
CH = 960
canvas = np.zeros((CH, TW, 3), np.uint8)
top = (CH - TH) // 2                                    # 202
canvas[top:top + TH] = small
cmask = np.ones((CH, TW), np.uint8) * 255               # 空白处交给 inpaint 顺边缘延展
cmask[top:top + TH] = 0
bgr = cv2.inpaint(canvas, cmask, 12, cv2.INPAINT_TELEA)

out = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
out.save(DST, "WEBP", quality=88, method=4)
print("输出 %s %s %d KB" % (DST, out.size, os.path.getsize(DST) / 1024))

out.save(os.path.join(ROOT, "_check_login_cover.png"))
