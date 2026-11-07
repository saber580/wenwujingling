# -*- coding: utf-8 -*-
"""拾遗录 · 文物拟人画廊守卫。

用户要求（2026-11-08）：
    「我觉得他画的很好你可以将他用在咱们的网站上……先线下部署一下我看看」
    素材来自小红书作者「拾遗录」，第 8 话画的是沧州铁狮子（站内 tielion）。

本测试对本地服务跑（先起 server.py + 9222 调试 Chrome）：
    1. 页面能进，标题与第 8 话标题都在
    2. 精读区 3 张图 + 作品墙 12 张封面全部真的加载出来（naturalWidth > 0）
    3. 圆点数量 = 3，初始停在第一张
    4. 点「下一张」→ 移到第二张、圆点跟着走，再点回不去（不跳号）
    5. 点画 → 放大层出现，再点 → 关闭
    6. 版权说明与作者署名在页面上（不是只写在注释里）
    7. 手机 390：不横向溢出、卡片宽度不超视口、作品墙是两列以上
    8. 导航里能从 AI 工坊菜单点到这一页

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


def say(ok, name, detail=""):
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
    c.goto(BASE + "/index.html#/shiyilu", wait=2.4)
    for _ in range(30):
        if c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
                  "var i=document.getElementById('intro');if(i)i.style.display='none';"
                  "document.body.classList.remove('flyleaf-on','intro-on');"
                  "document.body.style.overflow='';return !document.getElementById('flyleaf');})()"):
            break
        time.sleep(0.2)
    for _ in range(40):
        if c.eval("!!document.querySelector('.sa-feature')"):
            break
        time.sleep(0.2)
    c.eval("document.querySelectorAll('[class*=newbie],[id*=newbie]')"
           ".forEach(function(e){e.style.display='none'});")
    c.eval("(function(){var f=document.querySelector('.sa-feature');"
           "if(f)f.scrollIntoView({block:'start'});window.scrollBy(0,-70);})()")
    time.sleep(0.5)


def dots_on(c):
    return c.eval("Array.prototype.map.call(document.querySelectorAll('.sa-dots i'),"
                  "function(e,i){return e.classList.contains('on')?i:-1})"
                  ".filter(function(x){return x>=0}).join(',')")


print("== 拾遗录画廊 ==  %s" % BASE)
c = CDP("about:blank")
open_page(c)

# ---- 1. 页面本体 ----
say(c.eval("!!document.querySelector('.sa-feature')"), "画廊页面渲染出来了")
h2 = c.eval("(document.querySelector('.page-head h2')||{}).textContent||''")
say("拾遗录" in h2, "页面标题带「拾遗录」", h2.strip())
h3 = c.eval("(document.querySelector('.sa-fhead h3')||{}).textContent||''")
say("沧州铁狮子" in h3, "第 8 话标题是沧州铁狮子", h3.strip())

# ---- 2. 图片真的加载 ----
ep = c.eval("JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.sa-slide img'),"
            "function(i){return i.naturalWidth}))")
epw = json.loads(ep)
say(len(epw) == 3 and all(v > 0 for v in epw), "精读 3 张图全部加载", epw)
works = json.loads(c.eval(
    "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.sa-work img'),"
    "function(i){return i.naturalWidth}))"))
say(len(works) == 12 and all(v > 0 for v in works), "作品墙 12 张封面全部加载",
    "%d 张,最小宽 %s" % (len(works), min(works) if works else 0))

# ---- 3~4. 翻页 ----
say(c.eval("document.querySelectorAll('.sa-dots i').length") == 3, "圆点 3 个")
say(dots_on(c) == "0", "初始停在第一张", dots_on(c))
c.eval("saGo(1)")
time.sleep(0.9)
say(dots_on(c) == "1", "点「下一张」走到第二张", dots_on(c))
c.eval("saGo(-1)")
time.sleep(0.9)
say(dots_on(c) == "0", "点「上一张」回到第一张", dots_on(c))

# 横向滚动区确实能滚（不是三张全摊开）
overflow = c.eval("(function(){var t=document.getElementById('sa-track');"
                  "return t.scrollWidth - t.clientWidth;})()")
say(overflow > 80, "展示区可横向滚动(总有下一张露在外面)", "%d px" % overflow)

# ---- 5. 放大层 ----
c.eval("saZoom(1)")
time.sleep(0.4)
say(c.eval("document.getElementById('sa-zoom').classList.contains('show')"), "点画能放大")
say(c.eval("document.querySelector('#sa-zoom img').src").find("ep08-2") >= 0,
    "放大的是被点的那一张")
c.eval("saZoomClose({target:{tagName:'DIV'}})")
time.sleep(0.3)
say(not c.eval("document.getElementById('sa-zoom').classList.contains('show')"), "再点能关掉")

# ---- 6. 署名与版权 ----
credit = c.eval("(document.querySelector('.sa-credit')||{}).textContent||''")
say("拾遗录" in credit and "版权" in credit, "页面上写了署名与版权说明")
say(c.eval("!!document.querySelector('.sa-credit a[href*=xiaohongshu]')"), "留了作者原作链接")

# ---- 7. 手机 ----
open_page(c, 390, 844, 2, True)
say(c.eval("document.documentElement.scrollWidth") <= 391, "手机端不横向溢出",
    "%d / %d" % (c.eval("document.documentElement.scrollWidth"), c.eval("innerWidth")))
bad = json.loads(c.eval("""(function(){
  var out=[];
  document.querySelectorAll('.sa-slide').forEach(function(e){
    var r=e.getBoundingClientRect();
    if(r.width>innerWidth-20) out.push(Math.round(r.width));
  });
  return JSON.stringify(out);
})()"""))
say(not bad, "手机上卡片不超出视口宽", bad or "都在")
cols = c.eval("(function(){var g=document.querySelector('.sa-grid');"
              "return getComputedStyle(g).gridTemplateColumns.split(' ').length})()")
say(cols >= 2, "作品墙在手机上是多列", "%d 列" % cols)
c.shot("C:/tmp/sa_guard_mobile.png")

# ---- 8. 导航入口 ----
c.send("Emulation.setDeviceMetricsOverride",
       {"width": 1440, "height": 1000, "deviceScaleFactor": 1, "mobile": False})
c.goto(BASE + "/index.html#/", wait=2.0)
time.sleep(0.8)
say(c.eval("!!document.querySelector('.nav-drop a[href=\"#/shiyilu\"]')"), "AI 工坊菜单里有入口")

print("\n结果：%d 项通过，%d 项失败" % (19 - len(fails), len(fails)))
if fails:
    print("失败项：" + " / ".join(fails))
sys.exit(1 if fails else 0)
