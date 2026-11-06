# -*- coding: utf-8 -*-
"""极简 CDP 驱动：连本机 Chrome 的调试端口，做导航 / 取文本 / 点按 / 截图。

只依赖 websocket-client。用法：
  python tools/cdp.py goto URL [--wait 3]
  python tools/cdp.py eval "document.title"
  python tools/cdp.py shot out.png
"""
import json
import sys
import time

import websocket
import urllib.request

PORT = 9222
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36")


def http(path, method="GET"):
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (PORT, path), method=method)
    return json.loads(urllib.request.urlopen(req, timeout=15).read().decode())


def tab(url=None):
    tabs = http("/json/list")
    pages = [t for t in tabs if t.get("type") == "page"]
    if url:
        return http("/json/new?" + urllib.parse.quote(url, safe=""), method="PUT")
    return pages[0]


class CDP:
    def __init__(self, url=None):
        t = tab(url) if url else tab()
        self.ws = websocket.create_connection(t["webSocketDebuggerUrl"], timeout=40,
                                             suppress_origin=True)
        self.id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send("Emulation.setUserAgentOverride",
                  {"userAgent": UA, "acceptLanguage": "zh-CN,zh;q=0.9"})

    def send(self, method, params=None):
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.id:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result")

    def goto(self, url, wait=3.0):
        self.send("Page.navigate", {"url": url})
        time.sleep(wait)
        return self.eval("location.href")

    def eval(self, expr):
        r = self.send("Runtime.evaluate",
                      {"expression": expr, "returnByValue": True, "awaitPromise": True})
        return r.get("result", {}).get("value")

    def shot(self, path):
        r = self.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        import base64
        with open(path, "wb") as f:
            f.write(base64.b64decode(r["data"]))
        return path


if __name__ == "__main__":
    cmd = sys.argv[1]
    c = CDP()
    if cmd == "goto":
        wait = 3.0
        if "--wait" in sys.argv:
            wait = float(sys.argv[sys.argv.index("--wait") + 1])
        print(c.goto(sys.argv[2], wait))
    elif cmd == "eval":
        print(c.eval(sys.argv[2]))
    elif cmd == "shot":
        print(c.shot(sys.argv[2]))
