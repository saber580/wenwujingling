# -*- coding: utf-8 -*-
"""线上实测：上传一张铁狮子照片，看第一步 AI 识别有没有把它认回图鉴。"""
import base64
import io
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

EXE = r"C:\Users\lenovo\AppData\Local\ms-playwright\chromium-1248\chrome-win64\chrome.exe"
IMG = sys.argv[1] if len(sys.argv) > 1 else \
    r"_debug\真实手机摄影照片_中国河北沧州铁狮子_镇海吼__户外实拍_深_2026-11-16T15-32-15.png"


def data_url(path, px=760):
    im = Image.open(path).convert("RGB")
    im.thumbnail((px, px))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()


if __name__ == "__main__":
    durl = data_url(IMG)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=EXE, args=["--ignore-certificate-errors"])
        ctx = b.new_context(ignore_https_errors=True, viewport={"width": 1440, "height": 1000})
        ctx.add_init_script('try{localStorage.setItem("wwjl_newbie_done","1");localStorage.setItem("wwjl_nb_done","1");}catch(e){}')
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        pg.goto("https://123.57.21.18/", wait_until="networkidle", timeout=90000)
        time.sleep(2.5)
        pg.evaluate("""()=>{ document.body.classList.remove('intro-on','flyleaf-on','rh-anim');
          document.querySelectorAll('#intro,.flyleaf,.intro-scroll,.vs-intro').forEach(e=>e.remove());
          document.body.style.overflow=''; }""")
        time.sleep(0.8)
        t0 = time.time()
        pg.evaluate("""async (d)=>{ await photoFlow(d,''); }""", durl)
        # 等 AI 认完（最长 18 秒）
        got = None
        for i in range(36):
            time.sleep(0.6)
            got = pg.evaluate("""()=>{
              const o=document.getElementById('overlay');
              const h=o?o.querySelector('h3'):null;
              const txt=o?o.innerText.slice(0,600):'';
              return {head:h?h.textContent.trim():'', hasDupe:/已经在图鉴里/.test(txt),
                      txt:txt, no:(txt.match(/HB-\d+/)||[''])[0]};
            }""")
            if got["hasDupe"] or "幻化完成" in got["head"]:
                break
        print("耗时 %.1fs" % (time.time() - t0))
        print("标题:", got["head"])
        print("命中图鉴:", got["hasDupe"])
        print("编号:", got["no"])
        print("正文:", got["txt"][:400].replace("\n", " | "))
        print("页面错误:", errs[:3])
        # 关掉新手引导挡层再截图
        pg.evaluate("""()=>{ document.querySelectorAll('[class*=nb-]').forEach(e=>{
          if(e.className && /mask|card|panel|guide/.test(e.className)) e.remove(); }); }""")
        time.sleep(0.4)
        el = pg.query_selector("#overlay .sheet") or pg.query_selector("#overlay")
        if el:
            el.screenshot(path="_live_ident_1116.png")
            print("截图: _live_ident_1116.png")
        b.close()
