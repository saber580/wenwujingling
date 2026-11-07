# -*- coding: utf-8 -*-
"""真语音通话守卫：本地 HTTPS 能不能开麦 + 通话链路是否真的通。

背景（2026-11-07）：
    用户反馈"接通后文物不说话、不问候，像人机"。
    根因不是模型，而是**没有说话的入口**：接听后只能打字。
    加"点一下说话"要过一道坎 —— 浏览器的麦克风与语音识别只在安全上下文开放：
        http://127.0.0.1     算安全（本机调试没问题，所以容易误判"没事"）
        http://172.20.10.2   不算安全（手机/局域网访问就是这种，麦克风直接禁用）
    所以必须有一条 https 通道。

测试三分：
    A. 对照：http 局域网地址下 isSecureContext=false，点麦克风要给明确提示，不能静默
    B. 主线：https 局域网地址 + 手机 390×844 —— 接听后进通话态、麦克风键就位、
       注入一个假识别器跑通「识别 → 上屏 → 问答 → 朗读」全链路
       （真识别服务在 Google/微软，国内常连不上，不能拿它当断言条件）
    C. 收尾：关抽屉/挂断要把通话态和监听都撤掉

前置：
    python tools/mk_tls.py          # 生成证书
    python server.py                # 同时监听 8080 + 8443
    Chrome --remote-debugging-port=9222

用法：
    python tools/check_voice_https.py
"""
import os
import socket
import sys
import time

for k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(k, None)
os.environ["NO_PROXY"] = "*"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402

HTTP_PORT = 8080
TLS_PORT = 8443
fails = []


def say(ok, name, detail=""):
    print("  %s %s%s" % ("PASS" if ok else "FAIL", name, ("  " + str(detail)) if detail else ""))
    if not ok:
        fails.append(name)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("223.5.5.5", 80))
        return s.getsockname()[0]
    finally:
        s.close()


IP = lan_ip()
print("== 真语音通话 ==")
print("  局域网地址: %s" % IP)

# ---------- 0. 服务在不在 ----------
for port in (HTTP_PORT, TLS_PORT):
    ok = socket.socket().connect_ex(("127.0.0.1", port)) == 0
    say(ok, "端口 %d 在监听" % port)
if fails:
    print("\n  先把 server.py 起起来再说（https 端口要 8443）")
    sys.exit(2)

SKIP_INTRO = ("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
              "var i=document.getElementById('intro');if(i)i.style.display='none';"
              "document.body.classList.remove('flyleaf-on','intro-on');"
              "document.body.style.overflow='';"
              "return !document.getElementById('flyleaf')&&!document.body.classList.contains('intro-on');})()")

# 假识别器：把浏览器的语音服务整段绕开，只验我们自己那截代码
FAKE_SR = """
(function(){
  window.__srStarts = 0;
  function Fake(){
    var self=this;
    this.lang=''; this.interimResults=false; this.continuous=false; this.maxAlternatives=1;
    this.start=function(){
      window.__srStarts++;
      setTimeout(function(){ self.onstart&&self.onstart(); },30);
      setTimeout(function(){
        self.onresult&&self.onresult({resultIndex:0,
          results:[{isFinal:false,0:{transcript:'你是哪位'}}]});
      },300);
      setTimeout(function(){
        self.onresult&&self.onresult({resultIndex:0,
          results:[{isFinal:true,0:{transcript:'你是哪位，说说你自己'}}]});
      },1100);
      setTimeout(function(){ self.onend&&self.onend(); },1200);
    };
    this.stop=function(){ self.onend&&self.onend(); };
  }
  window.SpeechRecognition=Fake;
  window.webkitSpeechRecognition=Fake;
  return 'ok';
})()
"""


def open_alive(c, url, w=390, h=844, dpr=3):
    c.send("Network.enable")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    try:
        c.send("Security.setIgnoreCertificateErrors", {"ignore": True})
    except Exception:
        pass
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": w, "height": h, "deviceScaleFactor": dpr, "mobile": True})
    c.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    c.goto(url, wait=2.0)
    for _ in range(30):
        if c.eval(SKIP_INTRO):
            break
        time.sleep(0.2)
    for _ in range(70):
        if c.eval("!!document.getElementById('awPsGo')&&document.readyState==='complete'"):
            break
        time.sleep(0.3)


def tap(c, sel):
    p = c.eval("(function(){var e=document.querySelector('%s');if(!e)return null;"
               "var r=e.getBoundingClientRect();"
               "return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()" % sel)
    if not p:
        return False
    c.send("Input.dispatchTouchEvent", {"type": "touchStart",
                                       "touchPoints": [{"x": p["x"], "y": p["y"], "id": 1}]})
    c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    time.sleep(0.55)
    return True


def state(c):
    return c.eval(
        "(function(){var h=document.getElementById('awCall');if(!h)return null;"
        "var b=document.querySelector('.aw-chat');"
        "var bar=document.getElementById('awCallBar');"
        "var sysAll=[];document.querySelectorAll('.aw-log .aw-m.sys').forEach(function(n){sysAll.push(n.textContent);});"
        "return {secure:window.isSecureContext,"
        "sr:!!(window.SpeechRecognition||window.webkitSpeechRecognition),"
        "talking:h.classList.contains('talking'),listening:h.classList.contains('listening'),"
        "go:(document.getElementById('awPsGo')||{}).textContent,"
        "hint:(document.getElementById('awCallHint')||{}).textContent,"
        "heard:(document.getElementById('awPsHeard')||{}).textContent,"
        "bar:!!bar&&getComputedStyle(bar).display!=='none',"
        "micTxt:(document.getElementById('awMicTxt')||{}).textContent,"
        "drawer:!!b&&b.classList.contains('show'),"
        "dl:!!b&&b.classList.contains('listening'),"
        "mine:document.querySelectorAll('.aw-log .aw-m.me').length,"
        "theirs:document.querySelectorAll('.aw-log .aw-m.them').length,"
        "sys:sysAll.join(' | ')};})()")


def dial_and_answer(c):
    tap(c, "#awPsGo")            # 开始 → 来电
    time.sleep(0.4)
    tap(c, "#awPsGo")            # 接听
    time.sleep(1.4)


# ================= A. 对照：http 局域网地址 =================
print("\n-- A. http（局域网 IP，手机真实场景） --")
c = CDP("about:blank")
open_alive(c, "http://%s:%d/index.html#/alive" % (IP, HTTP_PORT))
a = state(c)
say(a and a["secure"] is False, "http+IP 不是安全上下文", a and a["secure"])
dial_and_answer(c)
a = state(c)
say(a and a["talking"], "接听后进入通话态")
say(a and "说话" in (a["go"] or ""), "键变成「说话」", a and a["go"])
say(a and ("http" in (a["hint"] or "") or "https" in (a["hint"] or "")),
    "提示里说清 http 开不了麦", a and (a["hint"] or "")[:40])
say(a and a["bar"], "抽屉里出现通话条（手机屏被盖住时够得着）")
tap(c, "#awMic")                  # 点麦克风：应当给提示，不能静默
a = state(c)
say(a and not a["listening"] and not a["dl"], "http 下不会假装在听",
    "%s/%s" % (a and a["listening"], a and a["dl"]))
say(a and ("https" in (a["sys"] or "") or "http" in (a["heard"] or "")),
    "点麦克风有明确提示", (a and (a["sys"] or ""))[:44])
c.ws.close()

# ================= B. 主线：https + 手机 =================
print("\n-- B. https（8443）+ 390×844 --")
c = CDP("about:blank")
open_alive(c, "https://%s:%d/index.html#/alive" % (IP, TLS_PORT))
b = state(c)
say(b and b["secure"] is True, "https 是安全上下文", b and b["secure"])
say(b and b["sr"] is True, "浏览器暴露了语音识别 API")
tap(c, "#awPsGo")
tap(c, "#awPsGo")
time.sleep(1.4)
b = state(c)
say(b and b["talking"], "接听后进入通话态", b and b["talking"])
say(b and "说话" in (b["go"] or ""), "键变成「说话」", b and b["go"])
say(b and "说话" in (b["hint"] or ""), "提示引导说话", b and (b["hint"] or "")[:30])
say(b and b["bar"], "抽屉里出现通话条")

say(c.eval(FAKE_SR) == "ok", "注入假识别器（绕开 Google 服务）")
before_m, before_t = b["mine"], b["theirs"]
tap(c, "#awMic")                  # 点麦克风（抽屉里那颗，手机端够得着）
time.sleep(0.35)
mid = state(c)
say(mid and mid["listening"], "点一下进入监听态", mid and mid["listening"])
say(mid and mid["dl"], "抽屉的通话条同步成监听态")
say(mid and "听" in (mid["micTxt"] or ""), "键显示正在听", mid and mid["micTxt"])
say(mid and "●" in (mid["go"] or ""), "手机屏上的键同步", mid and mid["go"])

# 识别 → 上屏 → 问答 → 朗读
got = False
for _ in range(60):
    time.sleep(0.4)
    now = state(c)
    if now["mine"] > before_m:
        got = True
        break
say(got, "识别结果自动上屏（不用手点发送）")
say(now["listening"] is False, "说完自动退出监听态")
say(now["heard"] and "说" in now["heard"], "屏上留了一行「你说…」", now and (now["heard"] or "")[:20])

answered = False
for _ in range(80):
    time.sleep(0.4)
    if state(c)["theirs"] > before_t:
        answered = True
        break
say(answered, "接着走了问答链，它回了话")
say(not state(c)["listening"], "回复期间不残留监听态")

# 手机端版式
ov = c.eval("(function(){var h=document.querySelector('.aw-hero').getBoundingClientRect();"
            "var p=document.querySelector('.aw-phone').getBoundingClientRect();"
            "return {phoneR:Math.round(p.right),heroR:Math.round(h.right),"
            "docW:document.documentElement.scrollWidth,win:innerWidth};})()")
say(ov["phoneR"] <= ov["heroR"] + 1, "手机端机身不出框", ov)
say(ov["docW"] <= ov["win"] + 1, "手机端无横向溢出", "%s / %s" % (ov["docW"], ov["win"]))

# ================= C. 收尾 =================
print("\n-- C. 关抽屉 / 挂断 --")
tap(c, "#awX")
time.sleep(0.4)
cc = state(c)
say(not cc["drawer"], "点 ✕ 关掉抽屉")
say(not cc["talking"] and not cc["listening"], "关抽屉同时退出通话态", 
    "%s/%s" % (cc["talking"], cc["listening"]))
say("开始" in (cc["go"] or ""), "键复原成「开始」", cc["go"])

dial_and_answer(c)
tap(c, "#awEnd")
time.sleep(0.4)
cc = state(c)
say(not cc["talking"] and not cc["drawer"], "挂断退出通话态并收起抽屉",
    "%s/%s" % (cc["talking"], cc["drawer"]))
say(not cc["bar"], "挂断后通话条收起")
say("开始" in (cc["go"] or ""), "挂断后键恢复「开始」", cc["go"])

c.ws.close()

print("\n== 结果：%s（%d 项失败）==" % ("全通过" if not fails else "有失败", len(fails)))
if fails:
    print("失败项：" + ", ".join(fails))
sys.exit(1 if fails else 0)
