# -*- coding: utf-8 -*-
"""线上巡检：逐路由检查破图 / 图钉 / 关键元素。"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp import CDP  # noqa: E402

BASE = os.environ.get("AUDIT_BASE", "https://123.57.21.18/")
SHOT_DIR = os.path.dirname(os.path.abspath(__file__))

BREAK_JS = """(function(){
  var bad=[];
  document.images.forEach(function(i){
    if (!i.getAttribute('src')) return;
    if (!i.complete || i.naturalWidth === 0) bad.push(i.getAttribute('src'));
  });
  var bg=[];
  return {bad: bad.slice(0,40), total: document.images.length};
})()"""

ROUTES = [
    ("", "首页"),
    ("#/codex", "图鉴"),
    ("#/tea", "茶话会"),
    ("#/museums", "博物馆"),
    ("#/creative", "文创"),
]


def main():
    c = CDP()
    results = []
    for route, name in ROUTES:
        c.goto(BASE + route, wait=6)
        # 关掉扉页
        c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
               "var i=document.getElementById('intro');if(i)i.remove();"
               "document.body.classList.remove('intro-on','flyleaf-on','book-on');})()")
        time.sleep(1.2)
        info = c.eval("JSON.stringify(" + BREAK_JS + ")")
        print("[%s] %s" % (name, info))
        results.append((name, info))
        safe = name.encode("utf-8").hex()[:8]
        c.shot(os.path.join(SHOT_DIR, "_audit_%s.png" % safe))

    # 首页地图图钉专项
    c.goto(BASE + "", wait=6)
    c.eval("(function(){var f=document.getElementById('flyleaf');if(f)f.remove();"
           "var i=document.getElementById('intro');if(i)i.remove();"
           "document.body.classList.remove('intro-on','flyleaf-on','book-on');})()")
    time.sleep(1.5)
    print("\n=== 首页地图图钉 ===")
    print("map-layer:", c.eval("!!document.querySelector('.map-layer')"))
    print("pin count:", c.eval("document.querySelectorAll('.uiverse-pin').length"))
    print("pin html sample:", c.eval("(document.querySelector('.uiverse-pin')||{outerHTML:'none'}).outerHTML.slice(0,220)"))
    print("pin rect:", c.eval("(function(){var p=document.querySelector('.uiverse-pin');if(!p)return 'none';var r=p.getBoundingClientRect();return r.width+'x'+r.height+' @'+Math.round(r.left)+','+Math.round(r.top);})()"))
    print("after content:", c.eval("(function(){var p=document.querySelector('.uiverse-pin');if(!p)return 'none';return getComputedStyle(p,'::after').content;})()"))
    print("after display/size:", c.eval("(function(){var p=document.querySelector('.uiverse-pin');if(!p)return 'none';var s=getComputedStyle(p,'::after');return s.display+' fs='+s.fontSize+' pos='+s.position;})()"))
    print("label rect:", c.eval("(function(){var l=document.querySelector('.uiverse-pin .pin-sign');if(!l)return 'none';var r=l.getBoundingClientRect();return r.width+'x'+r.height+' txt='+l.textContent;})()"))
    print("map-pin.css loaded:", c.eval("Array.from(document.styleSheets).some(function(s){return (s.href||'').indexOf('map-pin')>=0;})"))
    c.shot(os.path.join(SHOT_DIR, "_audit_home_map.png"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
