"""Bottom navigation: Home · Holdings · Performance · Allocation · Accumulation on every main page; the open page is
marked; ≥ 48px touch targets; labels hide (except the open one) on ≤ 360px; Back buttons replaced; inner screens keep Back;
content never hidden under the bar; dock on a computer."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
CUR = "(document.querySelector('#cpBnav [aria-current=page]') || {dataset:{}}).dataset.k"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('small', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
        items = pg.evaluate("[...document.querySelectorAll('#cpBnav a')].map(a => [a.dataset.k, a.getBoundingClientRect().width, a.getBoundingClientRect().height, getComputedStyle(a.querySelector('span')).display])")
        check(f'{name}: 3 items Portfolio · Plan · Market Hub, each ≥ 48 × 40, every label shows', [i[0] for i in items] == ['home', 'accumulation', 'market'] and all(i[1] >= 48 and i[2] >= 40 and i[3] != 'none' for i in items), items)
        check(f'{name}: Portfolio is marked on the main page', pg.evaluate(CUR) == 'home')
        # last thing on the page is above the bar
        pg.evaluate("scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(300)
        gap = pg.evaluate("(() => { const bar = document.getElementById('cpBnav').getBoundingClientRect(); const els = [...document.querySelectorAll('.coin-card, #portfolioTableWrapper, footer, .page-footer')].filter(e => e.offsetParent); const last = els[els.length - 1]; return last ? bar.top - last.getBoundingClientRect().bottom : 99; })()")
        check(f'{name}: the end of the page is never under the bar', gap >= 0, gap)
        pg.evaluate("SamsamUI.ptabGo('holdings')"); pg.wait_for_timeout(600)
        check(f'{name}: Holdings tab opens the Holdings screen (no page load), Portfolio marked; its Back replaced by the app logo', pg.evaluate("location.hash") == '#holdings' and pg.evaluate(CUR) == 'home' and pg.evaluate("getComputedStyle(document.querySelector('.hov-back-btn')).display") == 'none' and pg.evaluate("!!document.querySelector('#holdingsOverlay .cp-brand-logo').offsetParent"))
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(500)
        check(f'{name}: inside a coin, Back is still there; Portfolio stays marked', pg.evaluate("getComputedStyle(document.querySelector('.hov-back-btn')).visibility") == 'visible' and pg.evaluate(CUR) == 'home')
        pg.click('#cpBnav a[data-k=home]'); pg.wait_for_timeout(500)
        check(f'{name}: Portfolio from a coin → the Holdings list', pg.evaluate("location.hash") == '#holdings' and pg.evaluate("document.getElementById('holdingsOverlay').getAttribute('data-view')") is None)
        pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(500)
        check(f'{name}: Overview closes Holdings', pg.evaluate("document.getElementById('holdingsOverlay').style.display") == 'none' and pg.evaluate(CUR) == 'home')
        for k, bar in (('performance', 'home'), ('accumulation', 'accumulation'), ('market', 'market')):
            if k == 'performance': pg.evaluate("SamsamUI.ptabGo('performance')")
            else: pg.click(f'#cpBnav a[data-k={k}]')
            pg.wait_for_timeout(600)
            fr = pg.frame(url=lambda u, k=k: k + '.html' in u)
            check(f'{name}: {k} view — opens in place, marked, its Back replaced by the bar', pg.evaluate("location.hash") == '#' + k and pg.evaluate(CUR) == bar and fr and fr.evaluate("(() => { const b = document.querySelector('a.cp-back[data-back]'), l = document.querySelector('.cp-brand-logo'); return (!b || getComputedStyle(b).display === 'none') && l && l.offsetParent && l.querySelector('img'); })()"))
        pg.evaluate("SamsamUI.ptabGo('holdings')"); pg.wait_for_timeout(800)
        check(f'{name}: Holdings from another view opens the Holdings screen', pg.evaluate("document.getElementById('holdingsOverlay').style.display") == 'flex' and pg.evaluate(CUR) == 'home')
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(600)
        check(f'{name}: opened directly, a page still has its own bar, Portfolio marked', pg.evaluate(CUR) == 'home')
        pg.locator('.cp-ptabs button[data-t=allocation]').click(); pg.wait_for_url('**/index.html#*'); S.wait_ready(pg); pg.wait_for_timeout(800)
        check(f'{name}: Holdings from a standalone page opens the Holdings screen', pg.evaluate("document.getElementById('holdingsOverlay').style.display") == 'flex' and pg.evaluate(CUR) == 'home')
        pg.goto(S.SITE + '/recover.html'); pg.wait_for_timeout(600)
        check(f'{name}: no bar on the Recover tool', pg.query_selector('#cpBnav') is None)
        if name == 'desktop':
            b = pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(500)
            r = pg.evaluate("(() => { const r = document.getElementById('cpBnav').getBoundingClientRect(); return [r.left, r.right, innerWidth, innerHeight - r.bottom]; })()")
            check('desktop: a dock centred at the bottom', abs((r[0] + r[1]) / 2 - r[2] / 2) < 2 and r[1] - r[0] < 900 and r[3] >= 10, r)
        check(f'{name}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'bnav_test: {sum(res)}/{len(res)} passed')
