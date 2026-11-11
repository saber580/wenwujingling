# -*- coding: utf-8 -*-
"""线上全路由巡检：查空白页、JS 报错、横向溢出，并截图"""
import pathlib, time, json
from playwright.sync_api import sync_playwright

CHROME = r'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'
BASE = "https://123.57.21.18/"
SHOTS = pathlib.Path(r'C:/Users/lenovo/Desktop/文物精灵/tools/_shots')
SHOTS.mkdir(exist_ok=True)
INIT = "try{localStorage.setItem('relic_nb_v3','1');localStorage.setItem('relic_guide_done','1');}catch(e){}"

ROUTES = ['#/tea', '#/ident', '#/station', '#/spirit', '#/shiyilu', '#/trace',
          '#/guide', '#/alive', '#/biz', '#/eval', '#/creative', '#/heart',
          '#/museums', '#/mystery', '#/poster', '#/restore', '#/dye', '#/vision']

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME,
                          args=['--ignore-certificate-errors'])
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, ignore_https_errors=True)
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)[:90]))

    for r in ROUTES:
        errs.clear()
        try:
            pg.goto(BASE + '?skipintro=1' + r, timeout=45000, wait_until='load')
            time.sleep(2.2)
            info = pg.evaluate('''() => ({
              textLen: document.body.innerText.replace(/\\s/g,'').length,
              ov: document.documentElement.scrollWidth - window.innerWidth,
              h1: (document.querySelector('h1,h2')||{}).textContent || '',
              page: (document.querySelector('[data-page]')||{}).dataset ? (document.querySelector('[data-page]')||{}).dataset.page : ''
            })''')
            name = r.replace('#/', '')
            pg.screenshot(path=str(SHOTS / f'{name}.png'))
            flag = ''
            if info['textLen'] < 120: flag += ' ←空白?'
            if info['ov'] > 0: flag += f" ←溢出{info['ov']}px"
            if errs: flag += ' ←JS:' + errs[0][:40]
            print(f"{r:14s} 文字{info['textLen']:5d} 溢出{info['ov']:3d} page={info['page']:10s} {info['h1'].strip()[:22]}{flag}")
        except Exception as ex:
            print(f"{r:14s} 异常 {type(ex).__name__} {str(ex)[:50]}")
    b.close()
