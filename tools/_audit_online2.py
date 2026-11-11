# -*- coding: utf-8 -*-
"""线上站点端到端验证（https 自签证书需忽略）"""
import time, json
from playwright.sync_api import sync_playwright

CHROME = r'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'
URL = "https://123.57.21.18/"
INIT = "try{localStorage.setItem('relic_nb_v3','1');localStorage.setItem('relic_guide_done','1');}catch(e){}"

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME,
                          args=['--ignore-certificate-errors'])
    errs = []

    # 桌面端
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, ignore_https_errors=True)
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('DESK ' + str(e)[:100]))
    pg.goto(URL, timeout=60000, wait_until='load')
    time.sleep(4)
    print('标题:', pg.title())
    nums = pg.evaluate("() => Array.from(document.querySelectorAll('.rh-nums>div')).map(d=>d.innerText.replace(/\\n/g,'/'))")
    print('首页统计:', nums)

    pg.goto(URL + '?skipintro=1#/explore', timeout=60000)
    time.sleep(3)
    facts = pg.evaluate("() => Array.from(document.querySelectorAll('.hero-facts li')).map(li=>li.textContent.trim())")
    print('探索页统计:', facts)
    sub = pg.evaluate("() => {const e=document.querySelector('.sec-sub'); return e?e.textContent.trim().slice(0,60):'NONE';}")
    print('探索页副标题:', sub)

    pg.goto(URL + '?skipintro=1#/codex', timeout=60000)
    time.sleep(3)
    head = pg.evaluate("() => {const e=document.querySelector('.page-head p'); return e?e.textContent.trim():'NONE';}")
    print('图鉴页头:', head)

    # 全站文案残留检查
    for route in ['', '?skipintro=1#/explore', '?skipintro=1#/codex']:
        pg.goto(URL + route, timeout=60000)
        time.sleep(2)
        body = pg.evaluate("() => document.body.innerText")
        for bad in ['106 只', '十三站', '所有节点都能点', '74 只']:
            if bad in body:
                print(f'  ! {route or "/"} 残留「{bad}」')
    ctx.close()

    # 手机端
    for w, h in [(390, 844), (360, 780)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=True,
                            has_touch=True, ignore_https_errors=True)
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(f'MOB{w} ' + str(e)[:100]))
        pg.goto(URL + '?skipintro=1', timeout=60000)
        time.sleep(4)
        r = pg.evaluate('''() => {
          const R=s=>{const e=document.querySelector(s); if(!e)return null;
            const b=e.getBoundingClientRect(); return {t:Math.round(b.top),b:Math.round(b.bottom)};};
          const bar=document.querySelector('.mtab.ui-nav');
          const btns=Array.from(document.querySelectorAll('.rh-hero-cta .starbtn')).map(x=>{
            const s=x.querySelector('strong'); return s.scrollWidth>Math.round(s.getBoundingClientRect().width)+1;});
          return {cta:R('.rh-hero-cta'), barTop:bar?Math.round(bar.getBoundingClientRect().top):null,
                  clip:btns.some(Boolean), ov:document.documentElement.scrollWidth-window.innerWidth};
        }''')
        ok = r['cta'] and r['barTop'] and r['cta']['b'] <= r['barTop']
        print(f"{w}x{h}: 按钮在底栏上={ok} 文字裁切={r['clip']} 横向溢出={r['ov']} CTA底={r['cta']['b']} 底栏顶={r['barTop']}")
        ctx.close()

    print('\nJS 错误:', errs if errs else '无')
    b.close()
