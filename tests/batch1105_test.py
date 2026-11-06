"""1) fixed Asset column without a divider line (Home, Accumulation, Exit)  2) Accumulation · Exit Strategy tabs centred on a
computer (left on a phone, full width)  3) Holdings Add in the Portfolio Value card — screenshots of each."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
LINE = "(sel)=>{const c=document.querySelector(sel); const s=getComputedStyle(c); return [/-1px 0px 0px 0px inset|(^|, )\\S+ -?1px 0px 0px/.test(s.boxShadow) && !/ 0px -1px 0px 0px inset/.test(s.boxShadow) ? s.boxShadow : 'none', s.borderRightWidth]}"
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx); ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.evaluate("applyView('table')"); pg.wait_for_timeout(400)
            l = pg.evaluate(LINE, '#portfolioTable tbody td:first-child'); h = pg.evaluate(LINE, '#portfolioTable thead th:first-child')
            check(f'{vn}/{theme}: Home — Asset column without the divider line {l} {h}', l[0] == 'none' and h[0] == 'none', (l, h))
            # Holdings: Add in the card
            pg.evaluate("SamsamUI.ptabGo('holdings')"); pg.wait_for_timeout(1300)
            card = pg.locator('.hov-value-card'); bb = card.bounding_box()
            pg.screenshot(path=str(SH / f'b1105_hold_{vn}_{theme}.png'), clip={'x': bb['x'] - 4, 'y': max(0, bb['y'] - 4), 'width': min(bb['width'] + 8, vp['viewport']['width'] - bb['x'] + 4), 'height': 170})
            check(f'{vn}/{theme}: Holdings Add visible in the card', pg.is_visible('.hov-value-card #hovAddBtn'))
            pg.evaluate("hovBack && hovBack()"); pg.wait_for_timeout(300)
            # Accumulation
            pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(1000)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.evaluate("setView('table')"); pg.wait_for_timeout(300)
            l = pg.evaluate(LINE, '#tableView table tbody td:first-child'); h = pg.evaluate(LINE, '#tableView table thead th:first-child')
            check(f'{vn}/{theme}: Accumulation — Asset column without the divider line', l[0] == 'none' and h[0] == 'none', (l, h))
            t = pg.evaluate("""(()=>{const r=document.querySelector('.xs-tabs').getBoundingClientRect(), c=document.querySelector('.toolbar').getBoundingClientRect(); return {l:Math.round(r.left-c.left), r:Math.round(c.right-r.right), w:Math.round(r.width)}})()""")
            if vn == 'desktop': check(f'{vn}/{theme}: Accumulation · Exit Strategy tabs centred over the page {t}', abs(t['l'] - t['r']) <= 2 and t['l'] > 100, t)
            else: check(f'{vn}/{theme}: phone — tabs as before (full width) {t}', t['l'] <= 2 and t['r'] <= 2, t)
            tb = pg.locator('.xs-tabs').bounding_box()
            pg.screenshot(path=str(SH / f'b1105_tabs_{vn}_{theme}.png'), clip={'x': 0, 'y': max(0, tb['y'] - 10), 'width': vp['viewport']['width'], 'height': tb['height'] + 20})
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
