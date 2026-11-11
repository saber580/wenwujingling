# -*- coding: utf-8 -*-
"""最终回归验证：桌面端四页 + 手机端三宽度，检查关键指标"""
import pathlib, time, json
from playwright.sync_api import sync_playwright

CHROME = r'C:/Users/lenovo/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe'
BASE = pathlib.Path(r'C:/Users/lenovo/Desktop/文物精灵/index.html').resolve().as_uri()
SHOTS = pathlib.Path(r'C:/Users/lenovo/Desktop/文物精灵/tools/_audit_shots')
SHOTS.mkdir(exist_ok=True)
INIT = "try{localStorage.setItem('relic_nb_v3','1');localStorage.setItem('relic_guide_done','1');}catch(e){}"

ROUTES = [('', 'g1_home'), ('#/codex', 'g2_codex'), ('#/explore', 'g3_explore'),
          ('#/achieve', 'g4_achieve'), ('#/map', 'g5_map')]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHROME,
                          args=['--allow-file-access-from-files'])
    errs = []

    # ---------- 桌面端 ----------
    ctx = b.new_context(viewport={'width': 1440, 'height': 900})
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('DESKTOP ' + str(e)[:100]))
    print('=== 桌面端 1440x900 ===')
    for route, name in ROUTES:
        pg.goto(BASE + '?skipintro=1' + route, timeout=60000)
        pg.wait_for_load_state('load')
        time.sleep(2.5)
        pg.screenshot(path=str(SHOTS / f'{name}.png'))
        # 横向溢出检查
        ov = pg.evaluate('() => document.documentElement.scrollWidth - window.innerWidth')
        print(f'  {name:12s} 横向溢出={ov}px')
    # 探索页统计数字
    pg.goto(BASE + '?skipintro=1#/explore', timeout=60000)
    time.sleep(2.5)
    facts = pg.evaluate("() => Array.from(document.querySelectorAll('.hero-facts li')).map(li=>li.textContent.trim().replace(/\\s+/g,' '))")
    print('  探索页统计:', facts)
    ctx.close()

    # ---------- 手机端 ----------
    print('\n=== 手机端多宽度 ===')
    for w, h in [(360, 780), (375, 812), (390, 844), (430, 932)]:
        ctx = b.new_context(viewport={'width': w, 'height': h}, is_mobile=True, has_touch=True)
        ctx.add_init_script(INIT)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(f'MOBILE{w} ' + str(e)[:100]))
        pg.goto(BASE + '?skipintro=1', timeout=60000)
        pg.wait_for_load_state('load')
        time.sleep(3)
        r = pg.evaluate('''() => {
          const R = s => { const e = document.querySelector(s); if (!e) return null;
            const b = e.getBoundingClientRect();
            return {t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right)}; };
          const bar = document.querySelector('.mtab.ui-nav');
          const btns = Array.from(document.querySelectorAll('.rh-hero-cta .starbtn')).map(bt => {
            const bb = bt.getBoundingClientRect();
            const s = bt.querySelector('strong');
            const sb = s.getBoundingClientRect();
            return {l: Math.round(bb.left), r: Math.round(bb.right),
                    textR: Math.round(sb.right), clip: s.scrollWidth > Math.round(sb.width) + 1};
          });
          const nums = Array.from(document.querySelectorAll('.rh-nums>div')).map(d => {
            const bb = d.getBoundingClientRect();
            return {t: Math.round(bb.top), l: Math.round(bb.left), r: Math.round(bb.right)};
          });
          return {
            cta: R('.rh-hero-cta'), nums: R('.rh-nums'), plate: R('.rh-plate'),
            barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
            btns, numsRows: new Set(nums.map(n => n.t)).size,
            numsRight: Math.max(...nums.map(n => n.r)),
            overflowX: document.documentElement.scrollWidth - window.innerWidth,
            vw: window.innerWidth
          };
        }''')
        ok_cta = r['cta'] and r['barTop'] and r['cta']['b'] <= r['barTop']
        clip = any(x['clip'] for x in r['btns'])
        print(f"  {w}x{h}: 统计行数={r['numsRows']} 横向溢出={r['overflowX']} "
              f"按钮在底栏上={ok_cta} 按钮文字裁切={clip} "
              f"统计右边界={r['numsRight']}/{r['vw']} CTA底={r['cta']['b'] if r['cta'] else '-'} 底栏顶={r['barTop']}")
        pg.screenshot(path=str(SHOTS / f'g_mobile_{w}.png'))
        # 图鉴页
        pg.goto(BASE + '?skipintro=1#/codex', timeout=60000)
        time.sleep(2.5)
        pg.screenshot(path=str(SHOTS / f'g_codex_mobile_{w}.png'))
        ctx.close()

    print('\nJS 错误:', errs if errs else '无')
    b.close()
