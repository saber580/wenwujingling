# -*- coding: utf-8 -*-
"""拾遗录 · 文物拟人漫画（竖版漫画书阅读器）守卫。

用户要求（2026-11-08）：
    「把它这几页咱们以漫画书那种形式都给放到咱们这个新开的这个栏目里面，
      你把它都给我下全了别只下一页儿」
    素材来自小红书作者「拾遗录」，第 8 话画的是沧州铁狮子（站内 tielion），
    整话共 8 页：封面 + 6 页正篇 + 1 页「文物小讲堂」（横版）。

本测试对本地服务跑（先起 server.py + 9222 调试 Chrome）：
    1. 页面能进，标题与第 8 话标题都在
    2. 整话 8 页全部真的加载（naturalWidth > 0），最后一页是横版
    3. 页码条开局是「第 1 / 8 页」，进度条 12.5%
    4. 「下一页」走到 2、再走回 1，不跳号；直接跳末页也能到 8
    5. 竖排：页与页是上下叠的（第 2 页顶边在第 1 页底边之下），宽度不超出书页
    6. 点第 3 页放大 → 放大层里是第 3 页 → 再点关闭
    7. 版权说明与作者署名在页面上（不是只写在注释里）
    8. 手机 390：不横向溢出、书页不超视口、页码条在屏内、作品墙多列
    9. 导航里能从 AI 工坊菜单点到这一页

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
    c.goto(BASE + "/index.html#/shiyilu", wait=2.4)
    for _ in range(30):
        if c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
                  "var i=document.getElementById('intro');if(i)i.style.display='none';"
                  "document.body.classList.remove('flyleaf-on','intro-on');"
                  "document.body.style.overflow='';return !document.getElementById('flyleaf');})()"):
            break
        time.sleep(0.2)
    for _ in range(40):
        if c.eval("!!document.querySelector('.sa-book')"):
            break
        time.sleep(0.2)
    c.eval("document.querySelectorAll('[class*=newbie],[id*=newbie]')"
           ".forEach(function(e){e.style.display='none'});")
    c.eval("(function(){var f=document.querySelector('.sa-feature');"
           "if(f)f.scrollIntoView({block:'start'});window.scrollBy(0,-70);})()")
    time.sleep(0.6)


def cur(c):
    return c.eval("parseInt((document.getElementById('sa-cur')||{}).textContent,10)||0")


def bar(c):
    return c.eval("parseFloat((document.getElementById('sa-hbar')||{}).style.width)||0")


print("== 拾遗录漫画书 ==  %s" % BASE)
c = CDP("about:blank")
open_page(c)

# ---- 1. 页面本体 ----
say(c.eval("!!document.querySelector('.sa-feature')"), "漫画页渲染出来了")
h2 = c.eval("(document.querySelector('.page-head h2')||{}).textContent||''")
say("拾遗录" in h2, "页面标题带「拾遗录」", h2.strip())
h3 = c.eval("(document.querySelector('.sa-fhead h3')||{}).textContent||''")
say("沧州铁狮子" in h3, "第 8 话标题是沧州铁狮子", h3.strip())

# ---- 2. 整话 8 页都下载到了、都真的加载 ----
epw = json.loads(c.eval(
    "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.sa-page img'),"
    "function(i){return i.naturalWidth}))"))
say(len(epw) == 8 and all(v > 0 for v in epw), "整话 8 页全部加载", epw)
w8 = c.eval("(document.querySelectorAll('.sa-page img')[7]||{}).naturalWidth||0")
h8 = c.eval("(document.querySelectorAll('.sa-page img')[7]||{}).naturalHeight||0")
say(w8 > h8 > 0, "第 8 页（文物小讲堂）是横版", "%dx%d" % (w8, h8))
works = json.loads(c.eval(
    "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.sa-work img'),"
    "function(i){return i.naturalWidth}))"))
# 作品墙在整话 8 页之后,懒加载还没轮到它 —— 这一段先不滚过去,
# 免得打乱「开局停在第一页」的判断;放到翻页测完再量(见 5b)。

# ---- 3~4. 页码条与翻页 ----
say(c.eval("document.querySelectorAll('.sa-page').length") == 8, "书里有 8 个页框")
say(cur(c) == 1, "开局停在第 1 页", cur(c))
say(abs(bar(c) - 12.5) < 2, "进度条开局 12.5%", "%.1f%%" % bar(c))
c.eval("saGo(1)")
time.sleep(1.0)
say(cur(c) == 2, "点「下一页」走到第 2 页", cur(c))
# 页码跳了不算数,画面得真的滚过去 —— 第 2 页顶边应落在视口上沿附近
top2 = c.eval("Math.round(document.querySelectorAll('.sa-page')[1].getBoundingClientRect().top)")
say(-20 <= top2 <= 220, "翻页真的把第 2 页送到眼前", "页顶 y=%d" % top2)
c.eval("saGo(-1)")
time.sleep(1.0)
say(cur(c) == 1, "点「上一页」回到第 1 页", cur(c))
c.eval("saGoto(7)")
time.sleep(1.2)
say(cur(c) == 8, "能直接翻到末页", cur(c))
say(bar(c) > 99, "末页进度条满格", "%.0f%%" % bar(c))

# ---- 5. 竖排布局 ----
m = json.loads(c.eval("""(function(){
  var p=document.querySelectorAll('.sa-page'),a=p[0].getBoundingClientRect(),
      b=p[1].getBoundingClientRect(),bk=document.getElementById('sa-book').getBoundingClientRect();
  return JSON.stringify({top1:a.top,top2:b.top,bot1:a.bottom,w1:a.width,wb:bk.width});
})()"""))
say(m["top2"] >= m["bot1"] - 1, "页与页是上下排的（像书，不是并排）",
    "第2页顶 %d / 第1页底 %d" % (m["top2"], m["bot1"]))
say(m["w1"] <= m["wb"] + 1 and m["w1"] > 300, "书页宽度不撑破书壳",
    "%d / %d" % (m["w1"], m["wb"]))

# ---- 5b. 作品墙（在整话之后，滚过去等懒加载） ----
c.eval("(function(){var g=document.querySelector('.sa-grid');"
       "if(g)g.scrollIntoView({block:'center'});})()")
for _ in range(30):
    works = json.loads(c.eval(
        "JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.sa-work img'),"
        "function(i){return i.naturalWidth}))"))
    if all(works):
        break
    time.sleep(0.3)
say(len(works) == 12 and all(v > 0 for v in works), "作品墙 12 张封面全部加载",
    "%d 张,最小宽 %s" % (len(works), min(works) if works else 0))

# ---- 6. 放大层 ----
c.eval("saZoom(2)")
time.sleep(0.4)
say(c.eval("document.getElementById('sa-zoom').classList.contains('show')"), "点画能放大")
say(c.eval("document.querySelector('#sa-zoom img').src").find("ep08-3") >= 0,
    "放大的是被点的那一页")
say("第 3 / 8 页" in (c.eval("(document.querySelector('#sa-zoom span')||{}).textContent||''")),
    "放大层标了页码")
c.eval("saZoomClose({target:{tagName:'DIV'}})")
time.sleep(0.3)
say(not c.eval("document.getElementById('sa-zoom').classList.contains('show')"), "再点能关掉")

# ---- 7. 署名与版权 ----
credit = c.eval("(document.querySelector('.sa-credit')||{}).textContent||''")
say("拾遗录" in credit and "版权" in credit, "页面上写了署名与版权说明")
say(c.eval("!!document.querySelector('.sa-credit a[href*=xiaohongshu]')"), "留了作者原作链接")

# ---- 8. 手机 ----
open_page(c, 390, 844, 2, True)
say(c.eval("document.documentElement.scrollWidth") <= 391, "手机端不横向溢出",
    "%d / %d" % (c.eval("document.documentElement.scrollWidth"), c.eval("innerWidth")))
bad = json.loads(c.eval("""(function(){
  var out=[];
  document.querySelectorAll('.sa-page,.sa-book').forEach(function(e){
    var r=e.getBoundingClientRect();
    if(r.right>innerWidth+1||r.left<-1) out.push(Math.round(r.width));
  });
  return JSON.stringify(out);
})()"""))
say(not bad, "手机上书页不越过视口", bad or "都在")
say(c.eval("(function(){var r=document.getElementById('sa-hud').getBoundingClientRect();"
           "return r.width>100&&r.left>=0&&r.right<=innerWidth+1;})()"),
    "手机上页码条完整可见")
say(c.eval("document.getElementById('sa-hud').classList.contains('on')"), "读到书里页码条会浮出来")
# 手机端滚动容器可能是 main 而不是 window,这条专门验「画面真的动了」
c.eval("saGoto(4)")
time.sleep(1.3)
top5 = c.eval("Math.round(document.querySelectorAll('.sa-page')[4].getBoundingClientRect().top)")
say(cur(c) == 5 and -20 <= top5 <= 260, "手机翻页也真的滚到了第 5 页",
    "页码 %d / 页顶 y=%d" % (cur(c), top5))
cols = c.eval("(function(){var g=document.querySelector('.sa-grid');"
              "return getComputedStyle(g).gridTemplateColumns.split(' ').length})()")
say(cols >= 2, "作品墙在手机上是多列", "%d 列" % cols)
c.shot("C:/tmp/sa_guard_mobile.png")

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
