# -*- coding: utf-8 -*-
"""溯源页 · 手机端入带放映守卫（回归测试）

背景（2026-11-07 用户报障）：
    手机端把卡带拖进电视后，①有的片子不出画面；②一律不自动「放到最大」。

本测试用 CDP 手机仿真（390×844 / DPR3 / 触摸）逐张入带，记录：
    - 按下启动键后 video 是否真的在走时间、有没有解码错误
    - 大屏类是否挂上、屏幕是否真的铺满视口（rect 必须是 (0,0)~视口大小）
    - 退出（退带）后 body 上的锁滚动有没有撤掉
    - 全屏请求的结局（原生全屏被拒时应由 CSS 大屏兜底）

用法（先起本地站点 + 带 9222 调试端口的 Chrome）：
    python tools/check_trace_mobile.py
    python tools/check_trace_mobile.py http://123.57.21.18
"""
import json
import os
import sys
import time

for _k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(_k, None)
os.environ["NO_PROXY"] = "*"

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402

ANDROID_UA = ("Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")

W, H = 390, 844

# 探针：全屏结局 / video 事件 / 页面报错
PROBE = r"""
window.__probe = {fs: [], events: [], errs: []};
(function () {
  var orig = Element.prototype.requestFullscreen;
  if (orig) {
    Element.prototype.requestFullscreen = function () {
      var self = this, tag = String(self.id || self.className || self.tagName);
      __probe.fs.push("call:" + tag);
      var p = orig.apply(self, arguments);
      if (p && p.then) {
        p.then(function () { __probe.fs.push("ok:" + tag); },
               function (e) { __probe.fs.push("reject:" + tag + ":" +
                 String((e && e.name) || e) + ":" + String((e && e.message) || "").slice(0, 70)); });
      }
      return p;
    };
  }
  window.addEventListener("error", function (e) {
    __probe.errs.push(String((e && e.message) || e).slice(0, 160));
  }, true);
})();

window.__hookVideo = function () {
  var v = document.getElementById("traceVideo");
  if (!v || v.__hooked) return !!v;
  v.__hooked = 1;
  ["loadstart", "loadedmetadata", "canplay", "playing", "waiting", "stalled",
   "error", "emptied", "abort"].forEach(function (k) {
    v.addEventListener(k, function () {
      __probe.events.push(k + "|" + String(v.currentSrc || "").split("/").pop() +
        "|rs=" + v.readyState + "|ns=" + v.networkState);
    });
  });
  return true;
};
"""


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
    c = CDP("about:blank")

    c.send("Page.enable")
    c.send("Emulation.setUserAgentOverride",
           {"userAgent": ANDROID_UA, "acceptLanguage": "zh-CN,zh;q=0.9",
            "platform": "Linux armv8l", "mobile": True})
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": W, "height": H, "deviceScaleFactor": 3, "mobile": True})
    c.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    c.send("Page.addScriptToEvaluateOnNewDocument", {"source": PROBE})
    c.goto(base + "/index.html#/trace", wait=1.2)

    # 越过扉页与开场画卷：这两层不撤，正文尺寸为 0，量不到卡片
    c.eval("try{window.flyleafEnter&&window.flyleafEnter()}catch(e){}")
    time.sleep(1.0)
    c.eval("(function(){"
           "document.body.classList.remove('intro-on');"
           "document.body.classList.remove('flyleaf-on');"
           "var f=document.getElementById('flyleaf');if(f)f.remove();"
           "var i=document.getElementById('intro');if(i)i.remove();})()")

    for _ in range(120):
        n = c.eval("document.querySelectorAll('#traceDeck .deck-card').length")
        r = c.eval("(function(){var d=document.getElementById('traceDeck');"
                   "return d?Math.round(d.getBoundingClientRect().width):0;})()")
        if n == 8 and r and r > 100:
            break
        time.sleep(0.25)
    print("牌阵 %s 张，盒宽 %spx，探针 %s"
          % (c.eval("document.querySelectorAll('#traceDeck .deck-card').length"),
             c.eval("(function(){var d=document.getElementById('traceDeck');"
                    "return d?Math.round(d.getBoundingClientRect().width):0;})()"),
             c.eval("typeof window.__probe")))
    print("video 钩子：", c.eval("window.__hookVideo()"))

    rows = []
    for i in range(8):
        c.eval("window.__probe.events=[];window.__probe.fs=[];window.__probe.errs=[];")

        def rect(js_sel_expr):
            return c.eval("(function(){var e=%s;if(!e)return null;"
                          "var r=e.getBoundingClientRect();"
                          "return {x:r.left+r.width/2,y:r.top+r.height/2,"
                          "top:r.top,bottom:r.bottom,w:r.width,h:r.height};})()" % js_sel_expr)

        # 滚到这张卡露出在顶栏之下（y≈100），电视屏自然落在下方；
        # 手机端布局里牌阵 4 排 + 电视是竖着排的，只有这个位置两边都够得着
        for _ in range(5):
            card = rect('document.querySelector(".deck-card[data-i=\'%d\']")' % i)
            dy = card["y"] - 100
            if abs(dy) <= 12:
                break
            c.eval("window.scrollBy(0,%.0f)" % dy)
            time.sleep(0.25)

        card = rect('document.querySelector(".deck-card[data-i=\'%d\']")' % i)
        scr = rect("document.querySelector('.trace-tv .screen')")
        if not card or not scr:
            print("  [%d] 找不到卡片或屏幕" % i)
            continue
        # 投到屏幕上沿附近：屏幕常被底部标签栏压住下半截，但拖动是盒子捕获指针、
        # 按矩形判定的，只要触点还在视口里就算投中
        aim_y = max(scr["top"] + 12, 70)
        aim_y = min(aim_y, H - 24)
        print("  [%d] 卡片 (%.0f,%.0f) 屏幕 top=%.0f %dx%d 投放点 (%.0f,%.0f)"
              % (i, card["x"], card["y"], scr["top"], scr["w"], scr["h"],
                 scr["x"], aim_y))

        sy = max(60, min(card["y"], H - 60))
        c.send("Input.dispatchTouchEvent",
               {"type": "touchStart",
                "touchPoints": [{"x": card["x"], "y": sy, "id": 1}]})
        steps = 14
        for k in range(1, steps + 1):
            xx = card["x"] + (scr["x"] - card["x"]) * k / steps
            yy = sy + (aim_y - sy) * k / steps
            c.send("Input.dispatchTouchEvent",
                   {"type": "touchMove", "touchPoints": [{"x": xx, "y": yy, "id": 1}]})
            time.sleep(0.02)
        c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        time.sleep(1.4)   # 入带后页面会把屏幕滚到视野中间，等它停稳

        gate = c.eval(
            "(function(){var g=document.getElementById('traceGate');if(!g)return null;"
            "var r=g.getBoundingClientRect();"
            "return {vis:!g.hidden&&r.width>0,x:r.left+r.width/2,y:r.top+r.height/2};})()")
        if not gate or not gate["vis"]:
            rows.append({"i": i, "why": "入带后没有启动键"})
            continue

        c.send("Input.dispatchTouchEvent",
               {"type": "touchStart",
                "touchPoints": [{"x": gate["x"], "y": gate["y"], "id": 2}]})
        c.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        time.sleep(2.5)

        st = c.eval(
            "(function(){var v=document.getElementById('traceVideo');"
            "var scr=document.querySelector('.trace-tv .screen');"
            "var r=scr.getBoundingClientRect(), vr=v.getBoundingClientRect();"
            "return {src:String(v.currentSrc||'').split('/').pop(), hidden:v.hidden,"
            " rs:v.readyState, ns:v.networkState, paused:v.paused, t:v.currentTime,"
            " err:v.error?v.error.code:0,"
            " fsEl:!!(document.fullscreenElement||document.webkitFullscreenElement),"
            " big:scr.classList.contains('trace-big'),"
            " bodyBig:document.body.classList.contains('trace-big-on'),"
            " rx:Math.round(r.left), ry:Math.round(r.top),"
            " vw0:innerWidth, vh0:innerHeight,"
            " rw:Math.round(r.width), rh:Math.round(r.height),"
            " vw:Math.round(vr.width), vh:Math.round(vr.height),"
            " probe:window.__probe};})()")
        rows.append({"i": i, "st": st})

        c.eval("(function(){var b=document.getElementById('traceEject');if(b)b.click();})()")
        time.sleep(0.7)
        after = c.eval("document.body.classList.contains('trace-big-on')")
        if after:
            print("       ! 退带后大屏未撤（body.trace-big-on 还在）")
            rows[-1]["exitFail"] = True

    print("\n== 逐张入带结果 ==")
    fails = []
    for r in rows:
        if "st" not in r or not r["st"]:
            print("  [%d] FAIL  %s" % (r["i"], r.get("why")))
            fails.append(r["i"])
            continue
        st = r["st"]
        fills = (st["rx"] <= 2 and st["ry"] <= 2 and
                 abs(st["rw"] - st["vw0"]) <= 2 and abs(st["rh"] - st["vh0"]) <= 2)
        ok = st["t"] > 0.15 and st["big"] and st["bodyBig"] and fills
        print("  [%d] %s  src=%-14s t=%.2f err=%d 大屏=%s/%s 铺满=%s 屏=%dx%d@(%d,%d) 视口=%dx%d"
              % (r["i"], "PASS" if ok else "FAIL", st["src"], st["t"], st["err"],
                 st["big"], st["bodyBig"], fills, st["rw"], st["rh"], st["rx"], st["ry"],
                 st["vw0"], st["vh0"]))
        if r.get("exitFail"):
            ok = False
            fails.append(r["i"])
            continue
        if not ok:
            fails.append(r["i"])
            print("       事件: %s" % " ; ".join(st["probe"]["events"][-8:]))
            print("       全屏: %s" % " ; ".join(st["probe"]["fs"]))
            if st["probe"]["errs"]:
                print("       报错: %s" % st["probe"]["errs"][:3])

    print("\n小结：%d/%d 张能播出画面" % (len(rows) - len(fails), len(rows)))
    if fails:
        print("失败：", fails)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
