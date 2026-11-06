"""Holdings + Performance charts in the Altcoin Season style: a dot on the latest value, a crosshair and a value card
(mouse or finger); the Home cards keep their tap-to-open. Altcoin Season history chart uses the full width on a phone."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
FIX = (pathlib.Path(__file__).parent / 'alt_fixture.json').read_text()
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx); ctx.route('**/prices/m/alt.json', lambda r: r.fulfill(status=200, content_type='application/json', body=FIX))
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');localStorage.setItem('samsam_as_view',JSON.stringify({{open:'hist'}}))}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            check(f'{vn}/{theme}: Home cards have no value card (they open their page on a tap)', pg.evaluate("!document.querySelector('#holdingsCanvas').parentElement.querySelector('.cpc-tip') && !document.querySelector('#perfChartCanvas').parentElement.querySelector('.cpc-tip')"))
            # Holdings
            pg.evaluate("SamsamUI.ptabGo('holdings')"); pg.wait_for_timeout(1200)
            pg.click('#holdingsOverlay .hov-tab:nth-child(3)'); pg.wait_for_timeout(600)
            c = pg.locator('#hovCanvas'); c.scroll_into_view_if_needed(); bb = c.bounding_box()
            if vn == 'phone': pg.touchscreen.tap(bb['x'] + bb['width'] * .55, bb['y'] + bb['height'] / 2)
            else: pg.mouse.move(bb['x'] + bb['width'] * .55, bb['y'] + bb['height'] / 2)
            pg.wait_for_timeout(250)
            t = pg.evaluate("(()=>{const t=document.querySelector('#holdingsOverlay .cpc-tip'); return t ? {on: getComputedStyle(t).display, txt: t.innerText} : null})()")
            check(f'{vn}/{theme}: Holdings chart — crosshair card with the date and the value {t}', t and t['on'] == 'block' and 'Portfolio $' in t['txt'] and ', 20' in t['txt'], t)
            pg.screenshot(path=str(SH / f'cs_hold_{vn}_{theme}.png'), clip={'x': 0, 'y': max(0, bb['y'] - 150), 'width': vp['viewport']['width'], 'height': bb['height'] + 230})
            pg.evaluate("hovBack()"); pg.wait_for_timeout(400)
            # Performance
            pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(2000)
            fr = pg.frame(url=lambda u: 'performance.html' in u); fr.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            fr.evaluate("document.querySelector('.pcc-tabs button[data-r=\"30d\"]')?.click()"); fr.wait_for_timeout(600)
            c = fr.locator('#perfFullCanvas'); c.scroll_into_view_if_needed(); bb = c.bounding_box()
            if vn == 'phone': pg.touchscreen.tap(bb['x'] + bb['width'] * .5, bb['y'] + bb['height'] / 2)
            else: pg.mouse.move(bb['x'] + bb['width'] * .5, bb['y'] + bb['height'] / 2)
            fr.wait_for_timeout(250)
            t = fr.evaluate("(()=>{const t=document.querySelector('.cpc-tip'); return t ? {on: getComputedStyle(t).display, txt: t.innerText} : null})()")
            check(f'{vn}/{theme}: Performance chart — card with your portfolio and BTC {t}', t and t['on'] == 'block' and 'Your portfolio' in t['txt'] and 'BTC' in t['txt'] and '%' in t['txt'], t)
            pg.screenshot(path=str(SH / f'cs_perf_{vn}_{theme}.png'), clip={'x': 0, 'y': max(0, bb['y'] - 150), 'width': vp['viewport']['width'], 'height': bb['height'] + 230})
            # Altcoin Season on a phone: the line uses the width
            if vn == 'phone':
                pg.click('#cpBnav a[data-k=market]'); pg.wait_for_timeout(1200)
                mk = pg.frame(url=lambda u: 'market.html' in u); mk.click('#cardAlt'); pg.wait_for_timeout(1800)
                af = pg.frame(url=lambda u: 'altseason.html' in u); af.wait_for_selector('#asChart svg')
                w = af.evaluate("(()=>{const s=document.querySelector('#asChart svg'), r=s.getBoundingClientRect(), rects=[...s.querySelectorAll('rect')]; const z=rects[0].getBoundingClientRect(); return {svg: Math.round(r.width), plot: Math.round(z.width)}})()")
                check(f'{vn}/{theme}: Altcoin Season history — the plot fills the card ({w})', w['plot'] >= w['svg'] - 30 and w['plot'] >= 320, w)
                af.locator('#asChart').scroll_into_view_if_needed(); bb = af.locator('#asChart').bounding_box()
                pg.screenshot(path=str(SH / f'cs_alt_{vn}_{theme}.png'), clip={'x': 0, 'y': max(0, bb['y'] - 70), 'width': 390, 'height': bb['height'] + 130})
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
