# -*- coding: utf-8 -*-
"""爱给网 AI 配音 · 音色目录扫描。

列表页每个卡片要"真实鼠标悬停"才会把 speakerId 写进 .js-tts-open 的
data-tts-speaker-id，JS 合成事件改不动它，所以这里用 CDP 的鼠标事件逐个划过。

用法：python tools/aigei_scan.py <列表页URL> [输出json]
"""
import json
import os
import sys
import time
import urllib.request

import websocket

PORT = 9223


def pages():
    return json.loads(urllib.request.urlopen("http://127.0.0.1:%d/json/list" % PORT, timeout=10).read().decode())


class C:
    def __init__(self, url_filter=None, url=None):
        tabs = [t for t in pages() if t.get("type") == "page"]
        want = url_filter or "aigei.com/sound/tts"
        pool = [x for x in tabs if want in (x.get("url") or "")]
        t = (pool or tabs)[0]
        self.ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=120, suppress_origin=True)
        self.n = 0
        self.ws.settimeout(60)

    def rpc(self, m, p=None, tmo=90):
        self.n += 1
        my = self.n
        self.ws.send(json.dumps({"id": my, "method": m, "params": p or {}}))
        self.ws.settimeout(tmo)
        while True:
            r = json.loads(self.ws.recv())
            if r.get("id") == my:
                if r.get("error"):
                    raise RuntimeError(str(r["error"])[:120])
                return r.get("result")

    def js(self, expr, await_promise=False):
        r = self.rpc("Runtime.evaluate", {"expression": expr, "returnByValue": True,
                                          "awaitPromise": await_promise})
        return r.get("result", {}).get("value")

    def goto(self, url, wait=3.0):
        self.rpc("Page.navigate", {"url": url})
        time.sleep(wait)

    def move(self, x, y):
        self.rpc("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})


import urllib.parse  # noqa: E402


def scan(url):
    c = C(url=url)
    c.goto(url, 6)
    c.rpc("Emulation.setDeviceMetricsOverride",
          {"width": 1500, "height": 1100, "deviceScaleFactor": 1, "mobile": False})
    time.sleep(1.5)
    total = c.js("document.querySelectorAll('.unit-container').length")
    print("卡片数:", total)
    out = []
    for i in range(total):
        box = c.js("""(()=>{const cs=[...document.querySelectorAll('.unit-container')];
if(!cs[%d])return 'none';const e=cs[%d];e.scrollIntoView({block:'center'});
const r=e.querySelector('.name').getBoundingClientRect();
return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})})()""" % (i, i))
        if box == "none":
            continue
        p = json.loads(box)
        c.move(p["x"], p["y"])
        time.sleep(0.05)
        c.move(p["x"] + 2, p["y"] + 1)
        time.sleep(0.28)
        info = c.js("""(()=>{const cs=[...document.querySelectorAll('.unit-container')];
const e=cs[%d];if(!e)return 'none';
const el=document.querySelector('.js-tts-open[data-tts-speaker-id]');
return JSON.stringify({name:(e.querySelector('.name')||{}).innerText||'',
 desc:(e.querySelector('.desc')||{}).title||(e.querySelector('.desc')||{}).innerText||'',
 tags:[...e.querySelectorAll('.unittags-container .tags')].map(x=>x.innerText.trim()),
 sid:el?el.dataset.ttsSpeakerId:''})})()""" % i)
        if info == "none":
            continue
        d = json.loads(info)
        d["idx"] = i
        out.append(d)
        print("%2d %-14s sid=%-5s %s | %s" % (i, d["name"][:12], d["sid"], d["desc"][:20], "/".join(d["tags"])))
    return out


if __name__ == "__main__":
    url = sys.argv[1]
    res = scan(url)
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ["TEMP"], "aigei_voices.json")
    old = []
    if os.path.exists(dst):
        try:
            old = json.load(open(dst, encoding="utf-8"))
        except Exception:
            old = []
    seen = {(x["name"], x["sid"]) for x in old}
    merged = old + [x for x in res if (x["name"], x["sid"]) not in seen]
    json.dump(merged, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n累计 %d 个，写入 %s" % (len(merged), dst))
