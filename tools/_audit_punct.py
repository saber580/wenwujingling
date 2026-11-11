# -*- coding: utf-8 -*-
"""统计各页面副标题的半角标点数量"""
import pathlib, time
from playwright.sync_api import sync_playwright

CHROME = r'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'
BASE = pathlib.Path(r'C:/Users/lenovo/Desktop/文物精灵/index.html').resolve().as_uri()
INIT = "try{localStorage.setItem('relic_nb_v3','1');localStorage.setItem('relic_guide_done','1');}catch(e){}"

ROUTES = ['#/tea', '#/ident', '#/shiyilu', '#/trace', '#/guide', '#/alive', '#/biz',
          '#/eval', '#/creative', '#/heart', '#/museums', '#/mystery', '#/poster',
          '#/restore', '#/dye', '#/vision', '#/codex', '#/achieve']

JS_GET = """() => {
  const e = document.querySelector('.page-head p');
  if (!e) return '';
  return e.innerText.replace(/\\s+/g, ' ');
}"""

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME,
                          args=['--allow-file-access-from-files'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    for r in ROUTES:
        pg.goto(BASE + '?skipintro=1' + r, timeout=45000)
        time.sleep(1.8)
        t = pg.evaluate(JS_GET)
        if not t:
            continue
        half = t.count(',') + t.count(':') + t.count(';')
        print(f"{r:12s} 半角={half:2d} | {t[:66]}")
    b.close()
