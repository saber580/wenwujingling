# -*- coding: utf-8 -*-
"""线上验证：AI 奇境四张卡片"""
import time
from playwright.sync_api import sync_playwright

CHROME = r'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'
URL = "https://123.57.21.18/"
INIT = "try{localStorage.setItem('relic_nb_v3','1');localStorage.setItem('relic_guide_done','1');}catch(e){}"
OUT = r'C:/Users/lenovo/Desktop/文物精灵/tools/_shots'

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME,
                          args=['--ignore-certificate-errors'])
    for w, h, tag in [(1440, 900, 'online_desktop'), (390, 844, 'online_mobile')]:
        mobile = (tag == 'online_mobile')
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile,
                            has_touch=mobile, ignore_https_errors=True)
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:90]))
        pg.goto(URL + '?skipintro=1', timeout=60000)
        time.sleep(4)
        pg.evaluate("() => {const s=document.querySelector('.rh-ai'); if(s) s.scrollIntoView({block:'start'});}")
        time.sleep(1)
        info = pg.evaluate("""() => {
          const sec = document.querySelector('.rh-ai');
          if (!sec) return {err: 'no section'};
          const tools = sec.querySelectorAll('.rh-tool');
          return {
            count: tools.length,
            cols: getComputedStyle(sec.querySelector('.rh-tools')).gridTemplateColumns.split(' ').length,
            titles: Array.from(tools).map(t => ((t.querySelector('b')||{}).textContent || '').trim()),
            descs: Array.from(tools).map(t => ((t.querySelector('small')||{}).textContent || '').trim()),
            widths: Array.from(tools).map(t => Math.round(t.getBoundingClientRect().width))
          };
        }""")
        print(f"--- {tag} {w}x{h} ---")
        print('  ', info)
        print('   JS错误:', errs if errs else '无')
        sec = pg.query_selector('.rh-ai')
        if sec:
            sec.screenshot(path=f'{OUT}/{tag}_aitools.png')
        ctx.close()
    b.close()
