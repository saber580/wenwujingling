# -*- coding: utf-8 -*-
"""AI 赋彩 · 真彩画板守卫（色板 / 笔头 / 橡皮 / 参考原图）。

用户要求（2026-11-08）：
    AI 工坊里的「AI 赋彩」要能真的自己填色 —— 有色彩板、能调笔头粗细、有橡皮擦，
    旁边再摆一张缩小版的原图对照着画。

本测试对本地服务跑（先起 server.py + 9222 调试 Chrome）：
    1. 色板：12 个传统色 + 1 个自定义取色器，全部可见
    2. 点色块 → 当前色变化、选中标记只有一个
    3. 轻点画布 → 只填一片（占比 < 15%），不是整幅糊过去；像素真的变色
    4. 按住拖 → 涂出一笔所选颜色
    5. 切橡皮 → 同一位置擦回线稿（颜色没了，线稿还在）
    6. 参考原图：桌面在侧栏、手机在画布右上角；点开放大能开能关
    7. 一键赋彩 → 100%
    8. 换一幅 → 进度归零、画布重铺
    9. 手机 390 宽：不横向溢出，色板与工具都落在首屏内

用法：
    python tools/check_dye_board.py [URL]
"""
import json
import os
import sys
import time

for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)
os.environ["NO_PROXY"] = "*"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
fails = []


def say(ok, name, detail=""):
    print("  %s %s%s" % ("PASS" if ok else "FAIL", name, ("  " + str(detail)) if detail else ""))
    if not ok:
        fails.append(name)


def open_dye(c, w=1440, h=1000, dpr=1, mobile=False):
    c.send("Network.enable")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": mobile})
    c.send("Emulation.setTouchEmulationEnabled",
           {"enabled": mobile, "maxTouchPoints": 5 if mobile else 1})
    c.goto(BASE + "/index.html#/dye", wait=2.2)
    # 越过扉页与开场画卷
    for _ in range(30):
        clean = c.eval(
            "(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
            "var i=document.getElementById('intro');if(i)i.style.display='none';"
            "document.body.classList.remove('flyleaf-on','intro-on');"
            "document.body.style.overflow='';return !document.getElementById('flyleaf');})()")
        if clean:
            break
        time.sleep(0.2)
    # 等画纸铺好（label 里不再出现「正在铺」）
    for _ in range(50):
        if c.eval("(function(){var l=document.getElementById('dye-label');"
                  "return !!l&&!/正在铺/.test(l.textContent)&&!!DYE.ready;})()"):
            break
        time.sleep(0.25)
    # 挡视线的新手气泡收起来
    c.eval("document.querySelectorAll('[class*=newbie],[id*=newbie]')"
           ".forEach(function(e){e.style.display='none'});")
    # 滚到画板：不滚的话画布有一半在视口外，点按坐标会落在屏幕外面
    c.eval("(function(){var s=document.getElementById('dye-stage');"
           "if(s)s.scrollIntoView({block:'start'});window.scrollBy(0,-60);})()")
    time.sleep(0.4)


def cv_rect(c):
    return json.loads(c.eval(
        "(function(){var r=document.getElementById('dye-cv').getBoundingClientRect();"
        "return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()"))


def px(c, nx, ny):
    return c.eval(
        "(function(){var e=document.getElementById('dye-cv');var d=e.getContext('2d')"
        ".getImageData(Math.round(%f*e.width),Math.round(%f*e.height),1,1).data;"
        "return d[0]+','+d[1]+','+d[2];})()" % (nx, ny))


def tap(c, r, nx, ny):
    x = r["l"] + nx * r["w"]
    y = r["t"] + ny * r["h"]
    c.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})
    c.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y,
                                        "button": "left", "clickCount": 1})
    time.sleep(0.06)
    c.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y,
                                        "button": "left", "clickCount": 1})
    time.sleep(0.55)


def drag(c, r, p0, p1, steps=14):
    x0, y0 = r["l"] + p0[0] * r["w"], r["t"] + p0[1] * r["h"]
    x1, y1 = r["l"] + p1[0] * r["w"], r["t"] + p1[1] * r["h"]
    c.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x0, "y": y0, "button": "none"})
    c.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x0, "y": y0,
                                        "button": "left", "clickCount": 1})
    for i in range(1, steps + 1):
        t = i / steps
        c.send("Input.dispatchMouseEvent",
               {"type": "mouseMoved", "x": x0 + (x1 - x0) * t, "y": y0 + (y1 - y0) * t, "button": "left"})
        time.sleep(0.02)
    c.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x1, "y": y1,
                                        "button": "left", "clickCount": 1})
    time.sleep(0.5)


def pct(c):
    return c.eval("parseFloat(document.getElementById('dye-pct').textContent)||0")


print("== AI 赋彩 · 真彩画板 ==")
print("  URL:", BASE)

c = CDP("about:blank")
open_dye(c)

# ---- 1. 色板齐全 ----
n_sw = c.eval("document.querySelectorAll('.dye-sw').length")
say(n_sw >= 10, "色板有十种以上颜色", "%d 个" % n_sw)
say(c.eval("!!document.getElementById('dye-color')"), "有自定义取色器")
say(c.eval("(function(){var e=document.querySelector('.dye-sw');var r=e.getBoundingClientRect();"
           "return r.width>=28&&r.height>=28;})()"), "色块够大好点按")

# ---- 2. 选色 ----
c.eval("dyeInk('#4e8c6a')")
time.sleep(0.2)
say(c.eval("DYE.ink") == "#4e8c6a", "点色块换当前色", c.eval("DYE.ink"))
say(c.eval("document.querySelectorAll('.dye-sw.cur').length") == 1, "选中标记只有一个")
c.eval("dyeBrushSize(52)")
time.sleep(0.15)
say(c.eval("DYE.brush") == 52 and c.eval("document.querySelectorAll('#dye-brushset .cur').length") == 1,
    "笔头粗细能换", "%dpx" % c.eval("DYE.brush"))

# ---- 3. 轻点只填一片 ----
r = cv_rect(c)
c.eval("dyeInk('#3b6ea5')")
time.sleep(0.15)
before = px(c, 0.5, 0.55)
tap(c, r, 0.5, 0.55)
after = px(c, 0.5, 0.55)
p1 = pct(c)
say(before != after, "轻点处真的上色了", "%s → %s" % (before, after))
say(0 < p1 < 15, "轻点只填一片、没有糊满整幅", "%.0f%%" % p1)

# ---- 4. 按住拖涂一笔 ----
c.eval("dyeInk('#c0392b')")
c.eval("dyeBrushSize(30)")
time.sleep(0.15)
old = px(c, 0.5, 0.42)
drag(c, r, (0.40, 0.42), (0.60, 0.42))
new = px(c, 0.5, 0.42)
say(old != new, "按住拖能涂出一笔", "%s → %s" % (old, new))
say(pct(c) > p1, "涂完进度往前走", "%.0f%%" % pct(c))

# ---- 5. 橡皮擦回去 ----
c.eval("dyeTool('eraser')")
time.sleep(0.15)
drag(c, r, (0.40, 0.42), (0.60, 0.42))
say(px(c, 0.5, 0.42) == old, "橡皮擦回线稿", px(c, 0.5, 0.42))
say(c.eval("DYE.tool") == "eraser", "工具切到橡皮")
c.eval("dyeTool('brush')")
c.eval("dyeInk('#c9a227')")
time.sleep(0.15)
say(c.eval("DYE.tool") == "brush", "挑颜色会自动切回画笔")

# ---- 6. 参考原图 ----
say(c.eval("(function(){var e=document.getElementById('dye-ref-s');"
           "return !!e&&e.width>40&&e.height>40;})()"), "桌面侧栏有参考原图",
    c.eval("document.getElementById('dye-ref-s').width+'x'+document.getElementById('dye-ref-s').height"))
say(c.eval("getComputedStyle(document.querySelector('.dye-ref-float')).display") == "none",
    "桌面不显示手机浮窗")
c.eval("dyeRefZoom(true)")
time.sleep(0.3)
say(c.eval("document.getElementById('dye-zoom').classList.contains('show')"), "点原图能放大")
c.eval("dyeRefZoom(false)")
time.sleep(0.2)
say(not c.eval("document.getElementById('dye-zoom').classList.contains('show')"), "放大层能关掉")

# ---- 7. 一键赋彩 ----
c.eval("dyeAuto()")
ok100 = False
for _ in range(80):
    if c.eval("DYE.cnt >= DYE.total"):
        ok100 = True
        break
    time.sleep(0.3)
say(ok100, "一键赋彩能填到 100%", "%.0f%%" % pct(c))

# ---- 8. 换一幅 ----
c.eval("dyeStep(1)")
for _ in range(50):
    if c.eval("(function(){var l=document.getElementById('dye-label');"
              "return !!l&&!/正在铺/.test(l.textContent)&&!!DYE.ready;})()"):
        break
    time.sleep(0.25)
say(pct(c) == 0, "换一幅后进度归零", "%.0f%%" % pct(c))
say(c.eval("DYE.idx") == 1, "确实换到下一幅", "第 %d 幅" % (c.eval("DYE.idx") + 1))

# ---- 9. 手机端 ----
open_dye(c, 390, 844, 2, True)
time.sleep(0.5)
say(c.eval("document.documentElement.scrollWidth <= innerWidth + 1"), "手机不横向溢出",
    "%d / %d" % (c.eval("document.documentElement.scrollWidth"), c.eval("innerWidth")))
say(c.eval("getComputedStyle(document.querySelector('.dye-ref-float')).display") != "none",
    "手机上参考原图浮在画布上")
say(c.eval("getComputedStyle(document.querySelector('.dye-ref-side')).display") == "none",
    "手机上不重复显示侧栏原图")
say(c.eval("(function(){var b=document.getElementById('dye-brushset').getBoundingClientRect();"
           "return b.bottom<=innerHeight+2&&b.width>0;})()"), "色板与笔头在首屏内")
say(c.eval("(function(){var e=document.getElementById('dye-cv');var r=e.getBoundingClientRect();"
           "return r.width>=240;})()"), "手机画布不至于小到没法画",
    "%dpx 宽" % c.eval("(function(){return Math.round(document.getElementById('dye-cv').getBoundingClientRect().width);})()"))

print()
if fails:
    print("❌ %d 项未通过：%s" % (len(fails), "、".join(fails)))
    sys.exit(1)
print("✅ 全部通过")
