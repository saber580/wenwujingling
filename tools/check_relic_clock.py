# -*- coding: utf-8 -*-
"""AI 精灵茶话会 · 十二灵时辰盘守卫。

用户要求（2026-11-08）：
    「AI茶话会这里添加一个这个大表（uiverse 的拟物挂钟），
      然后这里面的 12 个刻度咱们换成小精灵的缩影。」

本测试对本地服务跑（先起 server.py + 9222 调试 Chrome）：
    1. 表盘存在，桌面直径 ≥ 400px
    2. 刻度恰好 12 个，12 张立绘全部真的加载出来（naturalWidth > 0）
    3. 12 个刻度严格按 30° 均匀排成一周，且都落在盘内（不越边）
    4. 三根指针按真实时间指向（时 / 分 / 秒，角度对得上）
    5. 秒针扫到哪一格，只有那一格亮（.lit 恰好 1 个）
    6. 时间文字 hh:mm 与系统时间一致
    7. 点刻度上的精灵 → 请它上桌（TEA.picks 收录 + 金色勾选），再点取消
    8. 点还没唤醒的精灵 → 不入选，只弹提示
    9. 离开茶话会页 → 表针定时器自己停（不留后台 Interval）
   10. 手机 390 宽：盘径 280~360、12 刻度都在视口内、不横向溢出

用法：
    python tools/check_relic_clock.py [URL]
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


def open_tea(c, w=1440, h=1000, dpr=1, mobile=False):
    c.send("Network.enable")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": mobile})
    c.send("Emulation.setTouchEmulationEnabled",
           {"enabled": mobile, "maxTouchPoints": 5 if mobile else 1})
    c.goto(BASE + "/index.html#/tea", wait=2.2)
    for _ in range(30):
        clean = c.eval(
            "(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
            "var i=document.getElementById('intro');if(i)i.style.display='none';"
            "document.body.classList.remove('flyleaf-on','intro-on');"
            "document.body.style.overflow='';return !document.getElementById('flyleaf');})()")
        if clean:
            break
        time.sleep(0.2)
    for _ in range(40):
        if c.eval("!!document.getElementById('rc-face')"):
            break
        time.sleep(0.2)
    c.eval("document.querySelectorAll('[class*=newbie],[id*=newbie]')"
           ".forEach(function(e){e.style.display='none'});")
    c.eval("(function(){var f=document.getElementById('rc-face');"
           "if(f)f.scrollIntoView({block:'center'});})()")
    time.sleep(0.5)


def rect_of(c, sel):
    return json.loads(c.eval(
        "(function(){var e=document.querySelector(%s);if(!e)return 'null';"
        "var r=e.getBoundingClientRect();"
        "return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height,"
        "cx:r.left+r.width/2,cy:r.top+r.height/2});})()" % json.dumps(sel)))


def tap(c, x, y, mobile):
    if mobile:
        c.send("Input.dispatchTouchEvent", {"type": "touchStart",
                                           "touchPoints": [{"x": x, "y": y, "id": 1}]})
        time.sleep(0.06)
        c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        c.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})
        c.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y,
                                            "button": "left", "clickCount": 1})
        time.sleep(0.06)
        c.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y,
                                            "button": "left", "clickCount": 1})
    time.sleep(0.45)


print("== 十二灵时辰盘 ==  %s" % BASE)
c = CDP("about:blank")
open_tea(c)

# ---- 1. 盘面 ----
say(c.eval("!!document.getElementById('rc-face')"), "表盘存在")
face = rect_of(c, "#rc-face")
say(face["w"] >= 400 and abs(face["w"] - face["h"]) < 1.5,
    "桌面盘径 ≥ 400 且是正圆", "%dx%d" % (face["w"], face["h"]))

# ---- 2. 12 个刻度 + 图真的加载了 ----
n = c.eval("document.querySelectorAll('.rc-tick').length")
say(n == 12, "刻度恰好 12 个", n)
imgs = c.eval("Array.prototype.map.call(document.querySelectorAll('.rc-tick img'),"
              "function(i){return i.naturalWidth}).join(',')")
loaded = [int(x) for x in imgs.split(",")] if imgs else []
say(len(loaded) == 12 and all(v > 0 for v in loaded),
    "12 张精灵立绘全部加载", "%d 张,最小宽 %d" % (len(loaded), min(loaded) if loaded else 0))

# ---- 3. 均匀排一周、都在盘内 ----
geo = json.loads(c.eval("""(function(){
  var f=document.getElementById('rc-face').getBoundingClientRect();
  var cx=f.left+f.width/2, cy=f.top+f.height/2, R=f.width/2;
  var out=[];
  document.querySelectorAll('.rc-tick').forEach(function(e){
    var r=e.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
    var a=Math.atan2(y-cy, x-cx)*180/Math.PI;           // -180..180,0 = 3 点方向
    var deg=(a+450)%360;                                 // 转成「12 点起、顺时针」
    out.push({id:e.getAttribute('data-id'), deg:Math.round(deg*10)/10,
              dist:Math.round(Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy))*10)/10,
              out: Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy)) + Math.max(r.width,r.height)/2 > R - 1});
  });
  return JSON.stringify({R:Math.round(R), ticks:out});
})()"""))
degs = sorted(t["deg"] for t in geo["ticks"])
gaps = [round(b - a, 1) for a, b in zip(degs, degs[1:])]
uniform = all(abs(g - 30) <= 1.2 for g in gaps)
say(uniform, "12 个刻度按 30° 均匀排开", "相邻间隔 %s" % gaps[:5])
say(not any(t["out"] for t in geo["ticks"]), "刻度全部落在盘内,没越边",
    "盘半径 %d" % geo["R"])

# ---- 4. 指针按真实时间 ----
hands = json.loads(c.eval("""(function(){
  function deg(id){var e=document.getElementById(id);if(!e)return null;
    var m=/rotate\\(([-0-9.]+)deg\\)/.exec(e.style.transform||'');
    return m?parseFloat(m[1]):null;}
  var d=new Date();
  return JSON.stringify({hh:deg('rc-hh'),mm:deg('rc-mm'),ss:deg('rc-ss'),
    h:d.getHours(),m:d.getMinutes(),s:d.getSeconds()});
})()"""))
exp_s = hands["s"] * 6
exp_m = (hands["m"] + hands["s"] / 60.0) * 6
exp_h = (hands["h"] % 12 + hands["m"] / 60.0 + hands["s"] / 3600.0) * 30


def near(got, exp, tol):
    if got is None:
        return False
    d = abs((got - exp + 180) % 360 - 180)
    return d <= tol


say(near(hands["ss"], exp_s, 7), "秒针指向当前秒", "%.1f° vs %.1f°" % (hands["ss"] or -1, exp_s))
say(near(hands["mm"], exp_m, 3), "分针指向当前分", "%.1f° vs %.1f°" % (hands["mm"] or -1, exp_m))
say(near(hands["hh"], exp_h, 2), "时针指向当前时", "%.1f° vs %.1f°" % (hands["hh"] or -1, exp_h))

# ---- 5. 秒针扫格：有且只有一格亮 ----
lit = c.eval("document.querySelectorAll('.rc-tick.lit').length")
say(lit == 1, "秒针扫过的那一格亮起(只亮一格)", lit)

# ---- 6. 时间文字 ----
txt = c.eval("document.getElementById('rc-time').textContent")
ok_t = (c.eval("(function(){var d=new Date();"
               "return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);})()") == txt)
say(ok_t, "盘下时间与系统一致", txt)

# ---- 7. 点刻度请精灵上桌 ----
c.eval("captured=['tielion','qinghuaci','wuzhuqian']; TEA.picks=[]; render();")
time.sleep(0.8)
c.eval("(function(){var f=document.getElementById('rc-face');"
       "if(f)f.scrollIntoView({block:'center'});})()")
time.sleep(0.4)
r = rect_of(c, ".rc-tick[data-id='tielion']")
tap(c, r["cx"], r["cy"], False)
picks = c.eval("JSON.stringify(TEA.picks)")
on = c.eval("document.querySelector(\".rc-tick[data-id='tielion']\").classList.contains('on')")
say('tielion' in picks and on, "点刻度把精灵请上桌(并打勾)", picks)
pick_cnt = c.eval("document.querySelectorAll('.rc-tick.on').length")
say(pick_cnt == 1, "钟面上的勾选和选择同步(只勾一只)", pick_cnt)

# 和下面的选人网格是否真联动
in_grid = c.eval("(function(){var g=document.querySelector(\"#tea-grid .tea-pick.on\");"
                 "return !!g;})()")
say(in_grid, "下方选人网格同步高亮")

tap(c, r["cx"], r["cy"], False)
say(c.eval("TEA.picks.length") == 0, "再点一次取消上桌")

# ---- 8. 未唤醒的精灵 ----
r2 = rect_of(c, ".rc-tick[data-id='jinqi']")
tap(c, r2["cx"], r2["cy"], False)
say(c.eval("TEA.picks.length") == 0, "点还没唤醒的精灵不会被塞进名单")
toast = c.eval("(function(){var t=document.getElementById('rs-toast');"
               "return t?t.textContent:'';})()")
say("醒" in toast or "图鉴" in toast, "并给出提示语", toast[:24])

# ---- 9. 离开页面后定时器要停 ----
c.goto(BASE + "/index.html#/codex", wait=1.2)
time.sleep(0.6)
timer = c.eval("(function(){return typeof rcTimer!=='undefined'?rcTimer:-1;})()")
say(timer == 0, "离开茶话会后表针定时器已停", timer)

# ---- 10. 手机 390 ----
open_tea(c, 390, 844, 2, True)
mf = rect_of(c, "#rc-face")
say(280 <= mf["w"] <= 360, "手机盘径 280~360", "%.0f" % mf["w"])
say(c.eval("document.documentElement.scrollWidth") <= 391, "手机端不横向溢出",
    "%d / %d" % (c.eval("document.documentElement.scrollWidth"), c.eval("innerWidth")))
inside = json.loads(c.eval("""(function(){
  var bad=[];
  document.querySelectorAll('.rc-tick').forEach(function(e){
    var r=e.getBoundingClientRect();
    if(r.left< -1 || r.right>innerWidth+1) bad.push(e.getAttribute('data-id'));
  });
  return JSON.stringify(bad);
})()"""))
say(not inside, "手机上 12 个刻度都在屏内", inside or "全部在")
c.shot("C:/tmp/rc_guard_mobile.png")

print("\n结果：%d 项通过，%d 项失败" % (24 - len(fails), len(fails)))
if fails:
    print("失败项：" + " / ".join(fails))
sys.exit(1 if fails else 0)
