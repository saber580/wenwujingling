# -*- coding: utf-8 -*-
"""检查首页 AI 奇境区块四张卡片"""
import pathlib, time
from playwright.sync_api import sync_playwright

CHROME = r'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'
BASE = pathlib.Path(r'C:/Users/lenovo/Desktop/文物精灵/index.html').resolve().as_uri()
SHOTS = pathlib.Path(r'C:/Users/lenovo/Desktop/文物精灵/tools/_shots')
SHOTS.mkdir(exist_ok=True)
INIT = "try{localStorage.setItem('relic_nb_v3','1');localStorage.setItem('relic_guide_done','1');}catch(e){}"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME,
                          args=['--allow-file-access-from-files'])
    for w, h, tag in [(1440, 900, 'desktop'), (1024, 800, 'tablet'), (390, 844, 'mobile')]:
        mobile = (tag == 'mobile')
        ctx = b.new_context(viewport={'width': w, 'height': h},
                            is_mobile=mobile, has_touch=mobile)
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        pg.goto(BASE + '?skipintro=1', timeout=60000)
        time.sleep(3.5)
        # 找到 AI 奇境区块并滚动到可见
        pg.evaluate("""() => {
          const s = document.querySelector('.rh-ai');
          if (s) s.scrollIntoView({block:'start'});
        }""")
        time.sleep(0.8)
        info = pg.evaluate("""() => {
          const sec = document.querySelector('.rh-ai');
          if (!sec) return {err:'no .rh-ai'};
          const tools = sec.querySelectorAll('.rh-tool');
          const cols = getComputedStyle(sec.querySelector('.rh-tools')).gridTemplateColumns.split(' ').length;
          const boxes = Array.from(tools).map(t => {
            const b = t.getBoundingClientRect();
            return {t: Math.round(b.top), h: Math.round(b.height), w: Math.round(b.width),
                    title: (t.querySelector('b')||{}).textContent || ''};
          });
          return {count: tools.length, cols, boxes};
        }""")
        print(f"--- {tag} {w}x{h} ---")
        if 'err' in info:
            print('  ', info['err'])
        else:
            print(f"  卡片数={info['count']} 列数={info['cols']}")
            for x in info['boxes']:
                print(f"    {x['title']:14s} w={x['w']:4d} h={x['h']:3d} top={x['t']}")
        sec = pg.query_selector('.rh-ai')
        if sec:
            sec.screenshot(path=str(SHOTS / f'ai_tools_{tag}.png'))
        ctx.close()
    b.close()
