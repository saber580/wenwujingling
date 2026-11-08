# -*- coding: utf-8 -*-
"""顶部导航下拉 · 互斥守卫（回归测试）

背景（2026-11-07 用户报障，附截图）：
    点开「精灵」后把指针移到「探索」，两栏同时挂着 —— 上一个靠 .open 常显，
    新的靠 :hover 展开，互不相识。

本测试用 CDP 真实鼠标事件复现这条路径，断言任一时刻只有一栏可见。
要求：本机 8080 站点 + 9222 调试 Chrome 已在运行。

用法：
    python tools/check_nav_dd.py                      # 测本地
    python tools/check_nav_dd.py http://123.57.21.18  # 测线上
"""
import os
import sys
import time

for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)
os.environ["NO_PROXY"] = "*"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
W, H = 1440, 900
fails = []


def say(ok, name, detail=""):
    print("  %s %s%s" % ("PASS" if ok else "FAIL", name, ("  " + detail) if detail else ""))
    if not ok:
        fails.append(name)


c = CDP("about:blank")
c.send("Network.enable")
# 本地 server.py 会给 index.html 带缓存头，不清缓存会测到旧版
c.send("Network.setCacheDisabled", {"cacheDisabled": True})
c.send("Emulation.setDeviceMetricsOverride",
       {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": False})
c.send("Emulation.setTouchEmulationEnabled", {"enabled": False})
c.send("Emulation.setEmulatedMedia",
       {"features": [{"name": "prefers-reduced-motion", "value": "no-preference"}]})
c.goto(BASE + "/index.html", wait=1.6)

# 越过扉页与开场画卷。注意 flyleafEnter() 撤场 0.56s 后会再播一次开场画卷，
# 一次性清理会被它重新盖住，所以要轮询到干净为止。
for _ in range(20):
    clean = c.eval(
        "(function(){var fl=document.getElementById('flyleaf');if(fl)fl.remove();"
        "var it=document.getElementById('intro');if(it)it.style.display='none';"
        "document.body.classList.remove('flyleaf-on','intro-on');"
        "document.body.style.overflow='';"
        "return !document.querySelector('.flyleaf')&&!document.body.classList.contains('intro-on')"
        "&&!document.body.classList.contains('flyleaf-on');})()")
    if clean:
        break
    time.sleep(0.2)
time.sleep(0.3)

# 线上首屏脚本多：导航 DOM 与 app.js 都要等，固定 sleep 会在
# 「导航已在、toggleDD 还没定义」的空档里点空 —— 一律按条件等。
for _ in range(80):
    ready = c.eval("document.readyState==='complete'"
                   "&&document.querySelectorAll('.topnav .nav-dd').length===4"
                   "&&typeof toggleDD==='function'"
                   "&&typeof closeOtherDD==='function'")
    if ready:
        break
    time.sleep(0.4)
n = c.eval("document.querySelectorAll('.topnav .nav-dd').length")
if n != 4:
    print("导航栏目数量异常：", n, "（readyState=%s）" % c.eval("document.readyState"))
    sys.exit(2)
print("  导航就绪：4 栏，脚本已加载")


def btn(nav):
    return c.eval(
        "(function(){var e=document.querySelector('.topnav [data-nav=\"%s\"] .nav-btn');"
        "if(!e)return null;var r=e.getBoundingClientRect();"
        "return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()" % nav)


def state():
    return c.eval(
        "(function(){var out={open:[],shown:[]};"
        "Array.prototype.forEach.call(document.querySelectorAll('.topnav .nav-dd'),function(d){"
        "var k=d.getAttribute('data-nav');"
        "if(d.classList.contains('open'))out.open.push(k);"
        "var p=d.querySelector('.nav-drop');"
        "if(p&&getComputedStyle(p).display!=='none'&&p.getBoundingClientRect().height>8)out.shown.push(k);"
        "});return out;})()")


def move(nav, dx=0, dy=0):
    p = btn(nav)
    c.send("Input.dispatchMouseEvent",
           {"type": "mouseMoved", "x": p["x"] + dx, "y": p["y"] + dy, "button": "none"})
    time.sleep(0.25)
    return p


def click(x, y):
    c.send("Input.dispatchMouseEvent",
           {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    c.send("Input.dispatchMouseEvent",
           {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
    time.sleep(0.3)


print("== 顶部导航下拉互斥 ==")
print("  URL:", BASE)

hit = c.eval(
    "(function(){var e=document.querySelector('.topnav [data-nav=\"codex\"] .nav-btn');"
    "var r=e.getBoundingClientRect();var el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);"
    "return el?el.tagName+'.'+(el.className||''):'null';})()")
if "nav-btn" not in hit:
    print("  导航按钮被遮挡（命中 %s），清掉浮层再测" % hit)
    c.eval(
        "(function(){var s=document.getElementById('__ddtest');"
        "if(!s){s=document.createElement('style');s.id='__ddtest';document.head.appendChild(s);}"
        "s.textContent='.craft-toast,#flyleaf,#intro{display:none!important}';"
        "Array.prototype.forEach.call(document.querySelectorAll('.craft-toast'),function(e){e.remove();});"
        "document.body.classList.remove('intro-on','flyleaf-on');"
        "document.body.style.overflow='';return 1;})()")
    time.sleep(0.4)
    hit = c.eval(
        "(function(){var e=document.querySelector('.topnav [data-nav=\"codex\"] .nav-btn');"
        "var r=e.getBoundingClientRect();var el=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);"
        "return el?el.tagName+'.'+(el.className||''):'null';})()")
    print("  清理后命中：", hit)
    if "nav-btn" not in hit:
        print("  导航仍不可点，测试中止")
        sys.exit(2)

# 1. 悬停「精灵」
p = move("codex")
st = state()
say(st["shown"] == ["codex"], "悬停精灵 → 只亮精灵", str(st))

# 2. 点击「精灵」（用户报障的第一步）
click(p["x"], p["y"])
st = state()
say(st["shown"] == ["codex"] and st["open"] == ["codex"], "点击精灵 → 只亮精灵", str(st))

# 3. 移到「探索」—— 报障现场：旧版这里会两栏并存
move("more")
st = state()
say(st["shown"] == ["more"], "移到探索 → 精灵自动收起（核心）", str(st))
say(st["open"] == [], "精灵的 .open 已让位", str(st))

# 4. 点击「探索」
p = move("more")
click(p["x"], p["y"])
st = state()
say(st["shown"] == ["more"] and st["open"] == ["more"], "点击探索 → 只亮探索", str(st))

# 5. 移回「精灵」，再移「AI 工坊」
move("codex")
st = state()
say(st["shown"] == ["codex"], "从探索移回精灵 → 只亮精灵", str(st))
move("poster")
st = state()
say(st["shown"] == ["poster"], "移到 AI 工坊 → 只亮 AI 工坊", str(st))

# 6. 点开 AI 工坊后原地再点一次 → 收起（hover 不许把它顶回来）
p = move("poster")
click(p["x"], p["y"])
st = state()
say(st["shown"] == ["poster"], "点击 AI 工坊 → 展开", str(st))
click(p["x"], p["y"])
st = state()
say(st["shown"] == [], "原地再点一次 → 收起（hover 不再顶开）", str(st))

# 7. 指针离开后重新悬停，仍然正常展开
c.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": 720, "y": 520, "button": "none"})
time.sleep(0.3)
st = state()
say(st["shown"] == [], "指针移开页面 → 全部收起", str(st))
move("poster")
st = state()
say(st["shown"] == ["poster"], "重新悬停 → 恢复展开", str(st))

# 8. 点空白处关闭
c.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": 720, "y": 560, "button": "none"})
time.sleep(0.2)
click(720, 560)
st = state()
say(st["shown"] == [] and st["open"] == [], "点空白 → 全部收起", str(st))

c.shot(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "_debug", "nav_dd.png"))
print("\n== 结果：%s（%d 项失败）==" % ("全通过" if not fails else "有失败", len(fails)))
if fails:
    print("失败项：" + ", ".join(fails))
sys.exit(1 if fails else 0)
