# -*- coding: utf-8 -*-
"""AI 文物拟人漫画（侧面书架 + 抽书）守卫。

用户要求演进（2026-11-08 最终形态）：
    「以漫画书那种形式」「先把第八画做成漫画」
    →「能不能做一个侧面的书架，点它能把这个漫画书抽出来」
      「下边那些缺的是一本那些不要有了」
    →「做得不好看，找开源书架项目参考」→ 木质书柜 + 书脊阵列 + 抽出翻盖
    →「改成 AI 绘画化，不要提小红书」→ 去掉作者/版权来源，改 AI 拟人创作定位

所以形态：木质书柜里竖排立着书脊；点书脊，书原位「抽出 + 倾斜」、
展示封面；再点封面进全屏阅读器（一次一页、左右翻、点画放大）。
下边那 11 本「缺的封面格子」整个删掉，只留这一本 + 右侧「待上架」占位书脊。

本测试对本地服务跑（先起 server.py + 9222 调试 Chrome）：
    1. 书架、书脊、抽出态都在；抽出来的封面是第 1 页
    2. 开局所有书都稳稳立在架上(不抽出)；点书脊抽出来，点「塞回」收回去
    3. 点抽出封面 → 全屏阅读器铺满整屏（fixed 没被 transform 祖先吃掉）
    4. 一次只露一页；页 1 是封面；整话 8 页能加载，末页横版，进度满格
    5. 放大层、合上、Esc、桌面 ← → 都能用
    6. 阅读器打开时滚轮不把背后页面带走
    7. 手机 390：不横向溢出、书脊完整、左右滑翻页
    8. 下边没有「缺的封面」格子；AI 拟人创作说明在；导航有入口

用法：
    python tools/check_shiyilu.py [URL]
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
total = [0]


def say(ok, name, detail=""):
    total[0] += 1
    print("  %s %s%s" % ("PASS" if ok else "FAIL", name, ("  " + str(detail)) if detail else ""))
    if not ok:
        fails.append(name)


def open_page(c, w=1440, h=1000, dpr=1, mobile=False):
    c.send("Network.enable")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": mobile})
    c.send("Emulation.setTouchEmulationEnabled",
           {"enabled": mobile, "maxTouchPoints": 5 if mobile else 1})
    c.goto(BASE + "/index.html#/shiyilu", wait=2.6)
    for _ in range(30):
        if c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
                  "var i=document.getElementById('intro');if(i)i.style.display='none';"
                  "document.body.classList.remove('flyleaf-on','intro-on');"
                  "document.body.style.overflow='';return !document.getElementById('flyleaf');})()"):
            break
        time.sleep(0.2)
    for _ in range(40):
        if c.eval("!!document.querySelector('.sa-shelf')"):
            break
        time.sleep(0.2)
    c.eval("document.querySelectorAll('[class*=newbie],[id*=newbie]')"
           ".forEach(function(e){e.style.display='none'});")
    time.sleep(0.3)


def cur(c):
    return c.eval("parseInt((document.getElementById('sa-cur')||{}).textContent,10)||0")


def bar(c):
    return c.eval("parseFloat((document.getElementById('sa-hbar')||{}).style.width)||0")


def open_reader(c):
    return c.eval("(function(){var r=document.getElementById('sa-reader');"
                  "return r&&r.classList.contains('on');})()")


def cur_src(c):
    return c.eval("(function(){var f=document.querySelector('#sa-leaf figure.cur img');"
                  "return f?(f.getAttribute('src')||''):'';})()") or ""


def visible_count(c):
    return c.eval("(function(){var n=0;document.querySelectorAll('#sa-leaf figure')"
                  ".forEach(function(f){if(getComputedStyle(f).display!=='none')n++;});return n;})()")


def swipe(c, x1, x2, y=420):
    """真触摸事件走一遍,不直接调 saGo —— 免得「滑动手势没接上」被测漏"""
    c.send("Input.dispatchTouchEvent",
           {"type": "touchStart", "touchPoints": [{"x": x1, "y": y}]})
    for k in range(1, 6):
        c.send("Input.dispatchTouchEvent",
               {"type": "touchMove",
                "touchPoints": [{"x": x1 + (x2 - x1) * k / 5.0, "y": y}]})
        time.sleep(0.02)
    c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})


def pulled_count(c):
    return c.eval("document.querySelectorAll('#sa-books .sa-slot:not(.sa-empty).out').length")


print("== AI 文物拟人漫画 · 侧面书架 + 抽书 ==  %s" % BASE)
c = CDP("about:blank")
open_page(c)

# ---- 1. 书架 / 书脊 ----
say(c.eval("!!document.querySelector('.sa-shelf')"), "书架渲染出来了")
h2 = c.eval("(document.querySelector('.page-head h2')||{}).textContent||''")
say("文物拟人漫画" in h2, "页面标题带「文物拟人漫画」", h2.strip())
say(c.eval("document.querySelectorAll('#sa-books .sa-slot:not(.sa-empty)').length") == 4,
    "书架上有 4 本真书(书脊)",
    c.eval("document.querySelectorAll('#sa-books .sa-slot:not(.sa-empty)').length"))
say(c.eval("document.querySelectorAll('#sa-books .sa-slot.sa-empty').length") >= 3,
    "书架上有若干「待上架」占位书脊",
    "%d 本占位" % c.eval("document.querySelectorAll('#sa-books .sa-slot.sa-empty').length"))
h3 = c.eval("(document.querySelector('.sa-info.cur h3')||{}).textContent||''")
say("沧州铁狮子" in h3, "当前书信息写着标题", h3.strip())
cov = c.eval("(function(){var i=document.querySelector('#sa-books .sa-book img');"
             "return i?[i.naturalWidth,i.getAttribute('src')]:[0,''];})()") or [0, ""]
say(cov[0] > 0, "抽出封面图加载出来了", "%s 宽 %s" % (cov[1], cov[0]))
say("ep08-1" in cov[1], "封面就是原作第一页", cov[1])

# ---- 2. 抽出 / 塞回 ----
say(pulled_count(c) == 0, "开局所有书都在架上(不抽出)", "%d 本抽出" % pulled_count(c))
c.eval("saPull(0)")
time.sleep(0.5)
say(pulled_count(c) == 1, "点书脊抽出来", "%d 本抽出" % pulled_count(c))
c.eval("saPush()")
time.sleep(0.45)
say(pulled_count(c) == 0, "点「塞回」收回去", "%d 本抽出" % pulled_count(c))
c.eval("saPull(0)")
time.sleep(0.5)
say(pulled_count(c) == 1, "再点书脊又抽出来", "%d 本抽出" % pulled_count(c))

# ---- 3. 点封面进阅读器 ----
say(not open_reader(c), "没翻开时阅读器不显示")
c.eval("saOpen(0)")
time.sleep(0.5)
say(open_reader(c), "点抽出封面打开阅读器")
box = json.loads(c.eval("(function(){var r=document.getElementById('sa-reader')"
                        ".getBoundingClientRect();"
                        "return JSON.stringify([Math.round(r.width),Math.round(r.height),"
                        "document.documentElement.clientWidth,"
                        "document.documentElement.clientHeight]);})()"))
say(box[0] == box[2] and box[1] == box[3], "阅读器铺满整屏（fixed 没被祖先吃掉）",
    "%dx%d / 视口 %dx%d" % tuple(box))

# ---- 4. 一次一页 + 整话 8 页 ----
say(visible_count(c) == 1, "一次只露一页", "%d 页可见" % visible_count(c))
say("ep08-1" in cur_src(c), "开局是封面页", cur_src(c))
say(cur(c) == 1, "页码从 1 开始", cur(c))
say(abs(bar(c) - 12.5) < 2, "进度条开局 12.5%", "%.1f%%" % bar(c))
say(c.eval("document.querySelectorAll('#sa-leaf figure').length") == 8, "书里有 8 页")
widths = []
for i in range(8):
    c.eval("saGoto(%d)" % i)
    time.sleep(0.3)
    for _ in range(40):
        w = c.eval("(function(){var f=document.querySelector('#sa-leaf figure.cur img');"
                   "return f?f.naturalWidth:0;})()") or 0
        if w:
            break
        time.sleep(0.25)
    widths.append(w)
say(all(widths), "8 页全部加载", widths)
w8 = c.eval("(function(){var f=document.querySelectorAll('#sa-leaf figure img')[7];"
            "return [f.naturalWidth,f.naturalHeight];})()")
say(w8[0] > w8[1] > 0, "第 8 页（文物小讲堂）是横版", "%dx%d" % tuple(w8))
say(cur(c) == 8 and bar(c) > 99, "停在第 8 页、进度条满格", "%d 页 · %.0f%%" % (cur(c), bar(c)))
c.eval("saGo(1)")
time.sleep(0.3)
say(cur(c) == 8, "末页再往后翻不会越界", cur(c))

# ---- 5. 放大 / 合上 / Esc / ← → ----
c.eval("saZoom(2)")
time.sleep(0.4)
say(c.eval("document.getElementById('sa-zoom').classList.contains('show')"), "点画能放大")
say("ep08-3" in (c.eval("document.querySelector('#sa-zoom img').src") or ""), "放大的是页内那一页")
say("第 3 / 8 页" in (c.eval("(document.querySelector('#sa-zoom span')||{}).textContent||''") or ""),
    "放大层标了页码")
c.eval("saZoomClose({target:{tagName:'DIV'}})")
time.sleep(0.25)
say(not c.eval("document.getElementById('sa-zoom').classList.contains('show')"), "再点能关掉")

# ---- 6. 滚轮不会带走背后页面 ----
c.eval("saGoto(0)")
before = c.eval("Math.round(window.scrollY)")
for _ in range(3):
    c.send("Input.dispatchMouseEvent",
           {"type": "mouseWheel", "x": 700, "y": 500, "deltaX": 0, "deltaY": 260})
    time.sleep(0.08)
time.sleep(0.3)
after = c.eval("Math.round(window.scrollY)")
say(before == after, "阅读器里滚轮不会把背后页面带走", "%d → %d" % (before, after))

c.eval("saClose()")
time.sleep(0.35)
say(not open_reader(c), "点「合上」能关掉")
c.eval("saOpen(0)")
time.sleep(0.3)
c.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Escape", "code": "Escape",
                                  "windowsVirtualKeyCode": 27})
c.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Escape", "code": "Escape",
                                  "windowsVirtualKeyCode": 27})
time.sleep(0.35)
say(not open_reader(c), "Esc 也能合上")
c.eval("saOpen(0)")
time.sleep(0.3)
c.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "ArrowRight", "code": "ArrowRight",
                                  "windowsVirtualKeyCode": 39})
c.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "ArrowRight", "code": "ArrowRight",
                                  "windowsVirtualKeyCode": 39})
time.sleep(0.35)
say(cur(c) == 2, "桌面按 → 翻页", cur(c))
c.eval("saClose()")

# ---- 6.5 第二本书（妇好鸮尊） ----
c.eval("saPull(1)")
time.sleep(0.5)
say(pulled_count(c) == 1, "点第二本也能抽出来", "%d 本抽出" % pulled_count(c))
h3b = c.eval("(document.querySelector('.sa-info.cur h3')||{}).textContent||''")
say("失业" in h3b or "妇好" in h3b or "鸮尊" in h3b, "第二本信息写着妇好鸮尊标题", h3b.strip())
c.eval("saOpen(1)")
time.sleep(0.5)
say(open_reader(c), "点第二本封面打开阅读器")
say(c.eval("document.querySelectorAll('#sa-leaf figure').length") == 5, "第二本书有 5 页",
    "%d 页" % c.eval("document.querySelectorAll('#sa-leaf figure').length"))
say("ep09" in cur_src(c), "第二本开局是它的封面页", cur_src(c))
c.eval("saGoto(4)")
time.sleep(0.3)
w5 = [0, 0]
for _ in range(40):
    w5 = c.eval("(function(){var f=document.querySelector('#sa-leaf figure.cur img');"
                "return f?[f.naturalWidth,f.naturalHeight]:[0,0];})()")
    if w5[0]:
        break
    time.sleep(0.25)
say(w5[0] > w5[1] > 0, "第二本第 5 页（文物小讲堂）是横版", "%dx%d" % tuple(w5))
c.eval("saClose()")
c.eval("saPush()")
time.sleep(0.4)

# ---- 6.6 第三本书（陶鹰鼎） ----
c.eval("saPull(2)")
time.sleep(0.5)
say(pulled_count(c) == 1, "点第三本也能抽出来", "%d 本抽出" % pulled_count(c))
h3c = c.eval("(document.querySelector('.sa-info.cur h3')||{}).textContent||''")
say("陶鹰鼎" in h3c or "鹰" in h3c, "第三本信息写着陶鹰鼎标题", h3c.strip())
c.eval("saOpen(2)")
time.sleep(0.5)
say(open_reader(c), "点第三本封面打开阅读器")
say(c.eval("document.querySelectorAll('#sa-leaf figure').length") == 9, "第三本书有 9 页",
    "%d 页" % c.eval("document.querySelectorAll('#sa-leaf figure').length"))
say("ep10" in cur_src(c), "第三本开局是它的封面页", cur_src(c))
c.eval("saGoto(6)")
time.sleep(0.3)
w6 = [0, 0]
for _ in range(40):
    w6 = c.eval("(function(){var f=document.querySelector('#sa-leaf figure.cur img');"
                "return f?[f.naturalWidth,f.naturalHeight]:[0,0];})()")
    if w6[0]:
        break
    time.sleep(0.25)
say(w6[0] > w6[1] > 0, "第三本第 7 页（文物小讲堂）是横版", "%dx%d" % tuple(w6))
c.eval("saClose()")
c.eval("saPush()")
time.sleep(0.4)

# ---- 6.7 第四本书（错金铜镇，豆包生成 6 张 Q 版漫画） ----
c.eval("saPull(3)")
time.sleep(0.5)
say(pulled_count(c) == 1, "点第四本也能抽出来", "%d 本抽出" % pulled_count(c))
h4c = c.eval("(document.querySelector('.sa-info.cur h3')||{}).textContent||''")
say("错金铜镇" in h4c, "第四本信息写着错金铜镇标题", h4c.strip())
sp4 = c.eval("(document.querySelector('#sa-books .sa-slot[data-i=\"3\"] .sa-spine')"
             ".style.backgroundImage)||''")
say("spine-04" in sp4, "第四本用独立书脊图 spine-04", sp4)
c.eval("saOpen(3)")
time.sleep(0.5)
say(open_reader(c), "点第四本封面打开阅读器")
say(c.eval("document.querySelectorAll('#sa-leaf figure').length") == 6, "第四本书有 6 页",
    "%d 页" % c.eval("document.querySelectorAll('#sa-leaf figure').length"))
say("ep12" in cur_src(c), "第四本开局是它的封面页", cur_src(c))
c.eval("saGoto(5)")
time.sleep(0.3)
w4 = [0, 0]
for _ in range(40):
    w4 = c.eval("(function(){var f=document.querySelector('#sa-leaf figure.cur img');"
                "return f?[f.naturalWidth,f.naturalHeight]:[0,0];})()")
    if w4[0]:
        break
    time.sleep(0.25)
say(w4[0] > 0 and w4[1] > w4[0], "第四本第 6 页（守护誓言）竖版加载成功", "%dx%d" % tuple(w4))
c.eval("saClose()")
c.eval("saPush()")
time.sleep(0.4)

# ---- 7. 下边没有「缺的封面」格子 ----
say(c.eval("!document.querySelector('.sa-grid') && !document.querySelector('.sa-work')"),
    "下边没有「缺的封面」格子了")

credit = c.eval("(document.querySelector('.sa-credit')||{}).textContent||''")
say("AI" in credit and "拟人" in credit, "页面写了 AI 拟人创作说明")

# ---- 8. 手机 390 ----
open_page(c, 390, 844, 2, True)
say(c.eval("document.documentElement.scrollWidth") <= 391, "手机端不横向溢出",
    "%d / %d" % (c.eval("document.documentElement.scrollWidth"), c.eval("innerWidth")))
say(c.eval("(function(){var r=document.querySelector('#sa-books .sa-slot .sa-spine')"
           ".getBoundingClientRect();return r.width>10&&r.left>=0&&r.right<=innerWidth+1;})()"),
    "书脊完整在屏内")
c.eval("saPull(0)")
time.sleep(0.4)
say(c.eval("(function(){var r=document.querySelector('#sa-books .sa-slot.out .sa-book')"
           ".getBoundingClientRect();return r.width>100&&r.left>=0&&r.right<=innerWidth+1;})()"),
    "抽出的封面完整在屏内")
c.eval("saOpen(0)")
time.sleep(0.6)
mob = json.loads(c.eval("(function(){var im=document.querySelector('#sa-leaf figure.cur img')"
                        ".getBoundingClientRect();"
                        "return JSON.stringify([Math.round(im.left),Math.round(im.right),"
                        "Math.round(im.top),Math.round(im.bottom),innerWidth,innerHeight]);})()"))
say(mob[0] >= -1 and mob[1] <= mob[4] + 1 and mob[3] <= mob[5] + 1,
    "手机上画页不越过屏幕", "x %d~%d / y 到 %d" % (mob[0], mob[1], mob[3]))
say(c.eval("(function(){var r=document.querySelector('.sa-rbot').getBoundingClientRect();"
           "return r.bottom<=innerHeight+1&&r.top<innerHeight;})()"), "底栏翻页条在屏内")
swipe(c, 320, 90)
time.sleep(0.4)
say(cur(c) == 2, "手机上往左滑翻到下一页", cur(c))
swipe(c, 90, 320)
time.sleep(0.4)
say(cur(c) == 1, "往右滑翻回上一页", cur(c))
c.shot("C:/tmp/sa_guard_mobile.png")
c.eval("saClose()")

# ---- 9. 导航入口 ----
c.send("Emulation.setDeviceMetricsOverride",
       {"width": 1440, "height": 1000, "deviceScaleFactor": 1, "mobile": False})
c.goto(BASE + "/index.html#/", wait=2.0)
time.sleep(0.8)
say(c.eval("!!document.querySelector('.nav-drop a[href=\"#/shiyilu\"]')"), "AI 工坊菜单里有入口")

print("\n结果：%d 项通过，%d 项失败" % (total[0] - len(fails), len(fails)))
if fails:
    print("失败项：" + " / ".join(fails))
sys.exit(1 if fails else 0)
