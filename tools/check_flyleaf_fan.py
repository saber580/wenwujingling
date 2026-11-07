# -*- coding: utf-8 -*-
"""扉页牌阵 · 首帧守卫（回归测试）

背景（2026-11-07 线上踩过）：
    卡片先 innerHTML 插入、后写 --x/--y/--r，中间读了一次布局，
    浏览器于是先按「没有 --x」把 14 张牌算成两摞，再用 .5s 过渡摊开。
    机器快时一闪而过，机器慢/老显卡/远程桌面会把首帧过渡卡住 ——
    一进站就停在"两摞牌"，看起来像坏了。

本测试记录**每一个动画帧**里 14 张牌的真实横向跨度，要求：
    第一帧就已经接近最终跨度，且任何一帧都不允许接近塌叠。

用法（先起本地站点 + 带调试端口的 Chrome）：
    python tools/check_flyleaf_fan.py
    python tools/check_flyleaf_fan.py http://123.57.21.18 --width 1440 --height 900
"""
import json
import os
import sys
import time
import urllib.request

for _k in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(_k, None)
os.environ["NO_PROXY"] = "*"
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402

RECORDER = r"""
window.__fanFrames = [];
window.__fanT0 = 0;
(function tick(ts) {
  try {
    var cs = document.querySelectorAll('#flyleaf .fl-card');
    if (cs.length) {
      if (!window.__fanT0) window.__fanT0 = ts;
      var x1 = 1e9, x2 = -1e9;
      for (var i = 0; i < cs.length; i++) {
        var r = cs[i].getBoundingClientRect();
        if (r.left < x1) x1 = r.left;
        if (r.right > x2) x2 = r.right;
      }
      window.__fanFrames.push(Math.round(x2 - x1));
    }
  } catch (e) {}
  if (window.__fanFrames.length < 400) requestAnimationFrame(tick);
})();
"""

FAIL = []


def check(name, ok, detail=""):
    print("  %-52s %s%s" % (name, "PASS" if ok else "FAIL",
                            ("  (" + detail + ")") if detail else ""))
    if not ok:
        FAIL.append(name)


def main():
    url = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "http://127.0.0.1:8913"
    width = height = None
    for i, a in enumerate(sys.argv):
        if a == "--width":
            width = int(sys.argv[i + 1])
        if a == "--height":
            height = int(sys.argv[i + 1])
    width = width or 1440
    height = height or 900

    c = CDP()
    c.send("Emulation.setDeviceMetricsOverride", {"width": width, "height": height,
                                                  "deviceScaleFactor": 1, "mobile": False})
    c.send("Network.enable")
    c.send("Network.setCacheDisabled", {"cacheDisabled": True})
    c.send("Page.addScriptToEvaluateOnNewDocument", {"source": RECORDER})
    print("观测目标: %s  (%dx%d)" % (url, width, height))

    c.send("Page.navigate", {"url": "about:blank"})
    time.sleep(0.3)
    c.send("Page.navigate", {"url": url})
    time.sleep(2.6)

    frames = json.loads(c.eval("JSON.stringify(window.__fanFrames||[])"))
    if not frames:
        print("  FAIL: 没有采到任何一帧（扉页没出现？）")
        return 1

    final = max(frames)
    first = frames[0]
    low = min(frames)
    # 塌叠阈值：不到最终跨度的 60% 就算"牌叠在一起"
    collapsed = [f for f in frames if f < final * 0.6]

    print("  帧数 %d，首帧 %dpx，最小 %dpx，最大 %dpx" % (len(frames), first, low, final))
    print("  前 8 帧:", frames[:8])

    check("牌阵最终确实展开（跨度 > 300px）", final > 300, "final=%d" % final)
    check("首帧就已在扇位（≥ 最终跨度 85%）", first >= final * 0.85,
          "first=%d final=%d" % (first, final))
    check("全程没有任何塌叠帧（≥ 最终跨度 60%）", not collapsed,
          "最低 %dpx，塌叠帧 %d 个" % (low, len(collapsed)))

    stage = c.eval("(document.getElementById('flStage')||{}).className||''")
    check("未处于收扇状态", "closed" not in stage, stage)
    n = c.eval("document.querySelectorAll('#flyleaf .fl-card').length")
    check("14 张牌齐全", n == 14, "%s 张" % n)

    print()
    if FAIL:
        print("结果: FAIL —— %s" % "；".join(FAIL))
        return 1
    print("结果: PASS —— 首帧即在扇位，没有塌叠窗口")
    return 0


if __name__ == "__main__":
    sys.exit(main())
