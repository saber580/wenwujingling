# -*- coding: utf-8 -*-
"""活态苏醒 · 文物来电手机（#/alive 首屏）守卫。

用户设想（2026-11-07）：
    手机屏幕上方那块空白地要「随时换一位精灵」，按「开始」随机一位打过来，
    接听之后这只精灵就开口跟你聊 —— 等于把图鉴的入口做成一次来电。

本测试对本地 8080 跑（先起 server.py + 9222 调试 Chrome）：
    1. 手机存在、屏幕尺寸正常、精灵图真的加载出来（不是空白）
    2. 静置 7 秒内精灵至少换过 2 位（自动轮换）
    3. 点「开始」→ 进入来电态（.ringing / 键变「接听」/ 出现「挂断」）
    4. 来电期间精灵不再乱换（等的就是这一位）
    5. 点「接听」→ 聊天抽屉打开，标题与来电者是同一只，且有「已接通」系统消息
    6. 点「挂断」→ 回到待机，键变回「开始」
    7. 手机端（390 宽）手机不出画、不横向溢出

用法：
    python tools/check_call_phone.py [URL]
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
fails = []


def say(ok, name, detail=""):
    print("  %s %s%s" % ("PASS" if ok else "FAIL", name, ("  " + str(detail)) if detail else ""))
    if not ok:
        fails.append(name)


def open_page(c, w=1440, h=900, dpr=1, mobile=False):
    c.send("Network.enable")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": mobile})
    c.send("Emulation.setTouchEmulationEnabled",
           {"enabled": mobile, "maxTouchPoints": 5 if mobile else 1})
    c.send("Emulation.setEmulatedMedia",
           {"features": [{"name": "prefers-reduced-motion", "value": "no-preference"}]})
    c.goto(BASE + "/index.html#/alive", wait=1.8)
    # 越过扉页与开场画卷（flyleafEnter 会在 0.56s 后再放一次，所以轮询到干净）
    for _ in range(25):
        clean = c.eval(
            "(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
            "var i=document.getElementById('intro');if(i)i.style.display='none';"
            "document.body.classList.remove('flyleaf-on','intro-on');"
            "document.body.style.overflow='';"
            "return !document.getElementById('flyleaf')&&!document.body.classList.contains('intro-on');})()")
        if clean:
            break
        time.sleep(0.2)
    # 按条件等：手机与卡片都在，脚本就位
    for _ in range(60):
        if c.eval("!!document.getElementById('awPsGo')&&document.querySelectorAll('.aw-card').length>0"
                  "&&document.readyState==='complete'"):
            break
        time.sleep(0.3)


def click(c, sel, mobile=False):
    p = c.eval("(function(){var e=document.querySelector('%s');if(!e)return null;"
               "var r=e.getBoundingClientRect();"
               "return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()" % sel)
    if not p:
        return False
    if mobile:
        c.send("Input.dispatchTouchEvent", {"type": "touchStart",
                                           "touchPoints": [{"x": p["x"], "y": p["y"], "id": 1}]})
        c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        c.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": p["x"], "y": p["y"], "button": "none"})
        c.send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": p["x"], "y": p["y"],
                                            "button": "left", "clickCount": 1})
        c.send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": p["x"], "y": p["y"],
                                            "button": "left", "clickCount": 1})
    time.sleep(0.5)
    return True


def call_state(c):
    return c.eval(
        "(function(){var h=document.getElementById('awCall'),i=document.getElementById('awPsImg');"
        "if(!h||!i)return null;var r=i.getBoundingClientRect();var ph=document.querySelector('.aw-phone').getBoundingClientRect();"
        "return {ring:h.classList.contains('ringing'),go:document.getElementById('awPsGo').textContent.trim(),"
        "name:document.getElementById('awPsName').textContent.trim(),sub:document.getElementById('awPsSub').textContent.trim(),"
        "src:(i.currentSrc||'').split('/').pop(),imgW:Math.round(r.width),"
        "hang:!!document.querySelector('.aw-ps-hang')&&getComputedStyle(document.querySelector('.aw-ps-hang')).display!=='none',"
        "phoneW:Math.round(ph.width),phoneRight:Math.round(ph.right)};})()")


print("== 文物来电手机 ==")
print("  URL:", BASE)

c = CDP("about:blank")
open_page(c)

st = call_state(c)
if not st:
    print("  手机组件没挂上，测试中止")
    sys.exit(2)

say(120 <= st["phoneW"] <= 220, "机身尺寸正常", "%dpx" % st["phoneW"])
say(st["imgW"] > 40, "精灵图有实际尺寸", "%dpx" % st["imgW"])
say(bool(st["src"]) and st["src"] != "", "精灵图已加载", st["src"])
say("开始" in st["go"], "待机键是「开始」", st["go"])
say(not st["ring"], "待机不带来电态", st["ring"])

# 自动轮换：7 秒内至少换过 2 位
seen = {st["name"]}
t0 = time.time()
while time.time() - t0 < 7.2 and len(seen) < 3:
    time.sleep(0.4)
    seen.add(c.eval("document.getElementById('awPsName').textContent.trim()"))
say(len(seen) >= 3, "静置时精灵自动轮换", "7s 内出现 %d 位：%s" % (len(seen), " / ".join(list(seen)[:4])))

# 点开始 → 来电
click(c, "#awPsGo")
st = call_state(c)
say(st["ring"], "点「开始」进入来电态", st["ring"])
say("接听" in st["go"], "键变成「接听」", st["go"])
say("呼叫" in st["sub"] or "来电" in st["sub"], "副标题提示来电", st["sub"])
say(st["hang"], "出现「挂断」", st["hang"])
caller = st["name"]

# 来电期间不乱换人
time.sleep(4.0)
st2 = call_state(c)
say(st2["name"] == caller, "来电期间精灵保持不动", "%s → %s" % (caller, st2["name"]))

# 接听 → 抽屉
click(c, "#awPsGo")
time.sleep(2.2)
drawer = c.eval("(function(){var b=document.querySelector('.aw-chat');"
                "return {cls:b?b.className:'none',name:document.getElementById('awName').textContent.trim(),"
                "first:(document.querySelector('.aw-log .aw-m')||{textContent:''}).textContent.trim(),"
                "bt:document.getElementById('awPsGo').textContent.trim()};})()")
say("show" in drawer["cls"], "接听后聊天抽屉打开", drawer["cls"])
say(drawer["name"] == caller, "抽屉里就是刚才来电那一只", "%s vs %s" % (drawer["name"], caller))
say("已接通" in drawer["first"], "有「已接通」系统消息", drawer["first"][:24])
say("说话" in drawer["bt"], "接听后键变成「说话」（可开口）", drawer["bt"])
say("call" in drawer["cls"], "接通态：抽屉挂上通话条", drawer["cls"])

# 挂断流程
click(c, "#awPsHang")
st = call_state(c)
say(not st["ring"] and "开始" in st["go"], "点「挂断」回到待机", "%s / %s" % (st["ring"], st["go"]))

# 手机端
c2 = CDP("about:blank")
open_page(c2, 390, 844, 3, True)
m = call_state(c2)
say(m is not None and m["phoneW"] < 200, "手机端机身收窄", m and m["phoneW"])
ov = c2.eval("(function(){var h=document.querySelector('.aw-hero').getBoundingClientRect();"
             "var p=document.querySelector('.aw-phone').getBoundingClientRect();"
             "return {heroR:Math.round(h.right),phoneR:Math.round(p.right),"
             "docW:document.documentElement.scrollWidth,win:innerWidth};})()")
say(ov["phoneR"] <= ov["heroR"] + 1, "手机端机身不出框", ov)
say(ov["docW"] <= ov["win"] + 1, "手机端无横向溢出", "%s / %s" % (ov["docW"], ov["win"]))

print("\n== 结果：%s（%d 项失败）==" % ("全通过" if not fails else "有失败", len(fails)))
if fails:
    print("失败项：" + ", ".join(fails))
sys.exit(1 if fails else 0)
