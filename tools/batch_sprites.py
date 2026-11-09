# -*- coding: utf-8 -*-
import os
from PIL import Image, ImageChops, ImageFilter

RAW = "精灵/_raw"

MAP = [
 ("金瓯永固杯","jinouyonggubei","故宫"),("清明上河图","qingmingshanghetu","故宫"),("青玉大禹治水图","dayuzhishui","故宫"),
 ("镶金兽首玛瑙","shoushoumanao","陕西"),("舞马衔杯纹银","wumaxianbei","陕西"),("杜虎符","duhufu","陕西"),
 ("贾湖骨","jiahugudi","河南"),("云纹铜禁","yunwentongjin","河南"),("莲鹤方壶","lianhefanghu","河南"),
 ("竹林七贤","zhulinqixian","南京"),("错银铜牛灯","tongniudeng","南京"),("喇嘛塔","lama_ta","南京"),
 ("大克鼎","dakeding","上海"),("商鞅方升","shangyangfangsheng","上海"),("缂丝","kesilian","上海"),
 ("勾践剑","goujianjian","湖北"),("曾侯乙编钟","zenghouyibianzhong","湖北"),("鹿角立鹤","lujiaolihe","湖北"),
 ("素纱襌衣","sushadanyi","湖南"),("T型帛","tbo_hua","湖南"),("人面纹方","renmianfangding","湖南"),
 ("青铜大立","dali_ren","三星堆"),("青铜纵目","zongmumianju","三星堆"),("三星堆金","jinzhang","三星堆"),
 ("簪花仕女","zanhuashinv","辽宁"),("鸭形玻璃","yaxingboli","辽宁"),("铜卧羊","liujintongwoyang","辽宁"),
 ("秘色瓷","misecilianhuawan","苏州"),("真珠舍利","zhenzhushielibaochuang","苏州"),("紫藤","wenzhengshan","苏州"),
]

def crop_watermark(im, fill):
    W,H = im.size
    c = Image.new("RGB",(W,H),fill)
    c.paste(im.crop((0,0,int(W*0.945),int(H*0.885))),(0,0))
    return c

def bg_color(im, patch=60):
    """取左上/右上/左下一角区域的中位背景色"""
    W,H = im.size
    sm = im.crop((0,0,patch,patch)).resize((24,24))
    vals = sorted(sm.getdata())
    n = len(vals)
    return tuple(vals[n//2][i] for i in range(3))

def bg_mask(im, dist=15):
    """与背景色差异 <= dist 的像素视为背景"""
    br,bg_,bb = bg_color(im)
    r,g,b = im.split()
    def chan(ch, base):
        solid = Image.new("L", im.size, base)
        return ImageChops.difference(ch, solid)
    dr = chan(r,br); dg = chan(g,bg_); db = chan(b,bb)
    lut = [255 if v<=dist else 0 for v in range(256)]
    return ImageChops.darker(ImageChops.darker(dr.point(lut), dg.point(lut)), db.point(lut))

def connected_bg(mask, small=220):
    """低分辨率上从边界出发的连通填充，返回全尺寸「连通背景」掩膜"""
    W,H = mask.size
    sm = mask.resize((small,small), Image.BILINEAR)
    lut = [255 if v>=128 else 0 for v in range(256)]
    sm = sm.point(lut)
    px = sm.load()
    seen = bytearray(small*small)
    q = [0]*(small*small)
    head = 0; tail = 0
    for x in range(small):
        for y in (0, small-1):
            i = y*small+x
            if not seen[i] and px[x,y]:
                seen[i]=1; q[tail]=i; tail+=1
    for y in range(small):
        for x in (0, small-1):
            i = y*small+x
            if not seen[i] and px[x,y]:
                seen[i]=1; q[tail]=i; tail+=1
    while head < tail:
        i = q[head]; head += 1
        x, y = i % small, i // small
        for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if 0 <= nx < small and 0 <= ny < small:
                j = ny*small+nx
                if not seen[j] and px[nx,ny]:
                    seen[j]=1; q[tail]=j; tail+=1
    buf = bytearray(small*small)
    for i in range(small*small):
        if seen[i]: buf[i] = 255
    out = Image.frombytes("L",(small,small),bytes(buf))
    return out.resize((W,H), Image.NEAREST)

def drop_specks(alpha, small=256, min_ratio=0.006):
    """去掉孤立小碎块（背景星点等），保留主体与较大部件"""
    W,H = alpha.size
    sm = alpha.resize((small,small), Image.BILINEAR).point([255 if v>=128 else 0 for v in range(256)])
    px = sm.load()
    label = [-1]*(small*small)
    areas = []
    for sy in range(small):
        for sx in range(small):
            i0 = sy*small+sx
            if label[i0] != -1 or not px[sx,sy]: continue
            cid = len(areas)
            label[i0] = cid
            q = [i0]; head = 0; cnt = 0
            while head < len(q):
                i = q[head]; head += 1; cnt += 1
                x, y = i % small, i // small
                for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                    if 0 <= nx < small and 0 <= ny < small:
                        j = ny*small+nx
                        if label[j] == -1 and px[nx,ny]:
                            label[j] = cid; q.append(j)
            areas.append(cnt)
    keep = set(i for i,a in enumerate(areas) if a >= small*small*min_ratio)
    buf = bytearray(small*small)
    for i in range(small*small):
        if label[i] != -1 and label[i] in keep: buf[i] = 255
    m = Image.frombytes("L",(small,small),bytes(buf)).resize((W,H), Image.BILINEAR)
    return ImageChops.darker(alpha, m)

def trim(im, pad=0.035):
    bbox = im.getbbox()
    if not bbox: return im
    x0,y0,x1,y1 = bbox
    side = max(x1-x0, y1-y0)
    cx, cy = (x0+x1)//2, (y0+y1)//2
    half = int(side*(1+pad*2)/2)
    canvas = Image.new("RGBA",(half*2,half*2),(0,0,0,0))
    canvas.paste(im,(half-cx, half-cy), im)
    return canvas

def process(src, sid, station):
    im = Image.open(src)
    bg = Image.new("RGBA", im.size, (255,255,255,255))
    bg.paste(im.convert("RGBA"), (0,0), im.convert("RGBA"))
    im = bg.convert("RGB")
    fill = bg_color(im)
    im = crop_watermark(im, fill)
    best = None
    for dist in (15, 22, 30, 38):
        conn = connected_bg(bg_mask(im, dist), 220)
        alpha = ImageChops.invert(conn)
        W,H = im.size; px = alpha.load()
        ring = []; step = max(1, W//120)
        for x in range(0, W, step):
            ring += [px[x,0], px[x,H-1]]
        for y in range(0, H, step):
            ring += [px[0,y], px[W-1,y]]
        bad = sum(1 for v in ring if v > 40) / len(ring)
        best = alpha
        if bad < 0.02:
            break
    # 侵蚀 1px 去掉灰边光晕
    alpha = alpha.filter(ImageFilter.MedianFilter(5))
    alpha = alpha.filter(ImageFilter.ModeFilter(3))
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    alpha = drop_specks(alpha)
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.5))
    out = im.convert("RGBA"); out.putalpha(alpha)
    out = trim(out)
    out = out.resize((384,384), Image.LANCZOS)
    for p in ["精灵/透明/%s.webp"%sid, "精灵/%s/%s.webp"%(station,sid)]:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        out.save(p, "WEBP", quality=92, method=6)

def find_raw(key):
    cands = [os.path.join(RAW,f) for f in os.listdir(RAW)
             if f.endswith(".png") and not f.startswith("_") and key in f]
    if not cands: return None
    return max(cands, key=os.path.getmtime)

ok=0; fail=[]
for key,sid,st in MAP:
    src = find_raw(key)
    if not src: fail.append((key,"无原图")); continue
    try:
        process(src,sid,st); ok+=1
    except Exception as e:
        fail.append((key,str(e)))
print("成功", ok, "/", len(MAP))
for f in fail: print(" 失败:", f)
