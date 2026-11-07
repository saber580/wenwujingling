# -*- coding: utf-8 -*-
"""手机端滑动流畅度测量

用 CDP 的真实触摸滑动手势滚一遍整页，同时按帧采样，给出：
    帧数 / p50 / p90 / 最长帧 / 掉帧率（>32ms 记一次）/ 卡顿帧（>80ms）

用法（先起本地站点 + 带 9222 调试端口的 Chrome）：
    python tools/check_scroll_fps.py                       # 溯源页
    python tools/check_scroll_fps.py http://123.57.21.18   # 线上
    python tools/check_scroll_fps.py "" #/home             # 指定路由
    python tools/check_scroll_fps.py --css "body{--x:1}"   # 附加一份测试用 CSS
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

W, H = 390, 844
UA = ("Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36")

REC = r"""
window.__f = [];
(function tick(t){
  if (window.__f.length > 1200) return;
  window.__f.push(t);
  requestAnimationFrame(tick);
})(performance.now());
window.__longtask = [];
try {
  new PerformanceObserver(function(l){
    l.getEntries().forEach(function(e){ __longtask.push(Math.round(e.duration)); });
  }).observe({entryTypes: ["longtask"]});
} catch (e) {}
"""


def measure(c, route, label, css=None):
    c.goto("http://127.0.0.1:8080/index.html" + route, wait=1.0)
    c.eval("try{window.flyleafEnter&&window.flyleafEnter()}catch(e){}")
    time.sleep(1.0)
    c.eval("document.body.classList.remove('intro-on');"
           "document.body.classList.remove('flyleaf-on');"
           "var f=document.getElementById('flyleaf');if(f)f.remove();"
           "var i=document.getElementById('intro');if(i)i.remove();")
    time.sleep(0.6)
    if css:
        c.eval("(function(){var s=document.createElement('style');s.id='__test_css';"
               "s.textContent=%s;document.head.appendChild(s);})()" % json.dumps(css))
        time.sleep(0.5)
    c.eval("window.scrollTo(0,0)")
    time.sleep(0.4)
    # 重新起一段采样（长任务也只算滑动这一段）
    c.eval("window.__longtask=[];window.__f=[];(function tick(t){window.__f.push(t);"
           "if(window.__f.length<900)requestAnimationFrame(tick);})(performance.now());")
    sys_swipes = int(c.eval("Math.ceil(document.documentElement.scrollHeight/" + str(H) + ")"))
    for _ in range(max(2, sys_swipes)):
        c.send("Input.synthesizeScrollGesture",
               {"x": W // 2, "y": int(H * 0.62), "xDistance": 0,
                "yDistance": -int(H * 0.72), "speed": 1400,
                "gestureSourceType": "touch", "repeatCount": 1,
                "repeatDelayMs": 120, "interactionMarkerName": "swipe"})
    time.sleep(0.4)
    raw = c.eval("window.__f") or []
    lt = c.eval("window.__longtask") or []
    if len(raw) < 8:
        print("  %-28s 采样不足（%d 帧）" % (label, len(raw)))
        return None
    d = [raw[i + 1] - raw[i] for i in range(len(raw) - 1)]
    d = [x for x in d if 0 < x < 500]
    d.sort()
    n = len(d)
    avg = sum(d) / n
    p50 = d[int(n * 0.5)]
    p90 = d[int(n * 0.9)]
    worst = d[-1]
    over32 = sum(1 for x in d if x > 32) * 100.0 / n
    over80 = sum(1 for x in d if x > 80)
    fps = 1000.0 / avg if avg else 0
    print("  %-28s 帧=%3d 均帧=%5.1fms(%.0ffps) p50=%4.1f p90=%4.1f 最长=%5.1f "
          "超32ms=%4.1f%% 卡顿(>80ms)=%d 长任务=%s"
          % (label, n, avg, fps, p50, p90, worst, over32, over80,
             str(lt[:5]) if lt else "无"))
    return {"avg": avg, "p90": p90, "worst": worst, "over32": over32,
            "over80": over80, "fps": fps}


def main():
    args = [a for a in sys.argv[1:]]
    route = "#/trace"
    css = None
    if "--css" in args:
        i = args.index("--css")
        css = args[i + 1]
        del args[i:i + 2]
    if args:
        route = args[0]

    c = CDP("about:blank")
    c.send("Page.enable")
    c.send("Emulation.setUserAgentOverride",
           {"userAgent": UA, "acceptLanguage": "zh-CN,zh;q=0.9",
            "platform": "Linux armv8l", "mobile": True})
    c.send("Emulation.setDeviceMetricsOverride",
           {"width": W, "height": H, "deviceScaleFactor": 2, "mobile": True})
    c.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    c.send("Page.addScriptToEvaluateOnNewDocument", {"source": REC})
    print("路由 %s%s" % (route, "  [附加测试 CSS]" if css else ""))
    measure(c, route, "当前实现", css)


if __name__ == "__main__":
    main()
