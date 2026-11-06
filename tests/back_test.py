"""One Back button on every page: same size, look and place; returns to the page you came from, or the main page."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
GEO = """() => { const b = [...document.querySelectorAll('.cp-back')].find(x => x.offsetParent); if (!b) return null;
  const r = b.getBoundingClientRect(), cs = getComputedStyle(b), ic = b.querySelector('.cp-back-ic'), t = b.querySelector('.cp-back-t');
  const th = b.parentElement.querySelector('.ss-theme-btn');   /* the theme button in the same bar */
  return { h: Math.round(r.height), rad: cs.borderRadius, fs: cs.fontSize, fw: cs.fontWeight, ic: ic && Math.round(ic.getBoundingClientRect().width), text: t && t.textContent,
    left: Math.round(r.left), themeH: th && Math.round(th.getBoundingClientRect().height), sameRow: th ? Math.abs((r.top + r.bottom) / 2 - (th.getBoundingClientRect().top + th.getBoundingClientRect().bottom) / 2) < 3 : null,
    old: document.querySelectorAll('.back-btn').length }; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('dark', 'light'):
            ctx = br.new_context(**vp); S.setup(ctx); errs = []
            ctx.add_init_script(f"try {{ localStorage.setItem('theme', '{theme}') }} catch (_) {{}}")
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme', '{theme}')")
            seen = {}
            # holdings overlay + coin page
            pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(700); pg.evaluate(f"document.documentElement.setAttribute('data-theme', '{theme}')")
            seen['holdings'] = pg.evaluate(GEO)
            pg.locator('.hov-navbar').screenshot(path=str(SH / f'back-holdings-{name}-{theme}.png'))
            pg.evaluate("openCoinTx(portfolio[0].sym)"); pg.wait_for_timeout(600)
            seen['coin'] = pg.evaluate(GEO)
            pg.click('.cp-back.hov-back-btn'); pg.wait_for_timeout(400)
            ok1 = pg.evaluate("location.hash") == '#holdings'
            pg.dispatch_event('.cp-back.hov-back-btn', 'click')   # hidden: the bottom bar's Home does this now; pg.wait_for_timeout(400)
            ok2 = pg.evaluate("!document.getElementById('holdingsOverlay') || getComputedStyle(document.getElementById('holdingsOverlay')).display === 'none'")
            if theme == 'dark': check(f'{name}: coin page Back → Holdings → main page', ok1 and ok2, (ok1, ok2))
            for page, sel in (('performance.html', '#perfChartWrap'), ('allocation.html', '#allocMiniCard'), ('accumulation.html', '#accumProgressBar')):
                # inside the app shell a card opens its view in place (no page load); the phone's Back returns home
                pg.click(sel); pg.wait_for_timeout(500)
                inview = (pg.evaluate("location.hash") == '#holdings' and pg.get_attribute('#holdingsOverlay', 'data-mode') == 'alloc') if page == 'allocation.html' else (pg.evaluate("location.hash") == '#' + page[:-5] and pg.evaluate("document.getElementById('cpViews').classList.contains('on')"))   # Allocation lives in Holdings
                pg.go_back(); pg.wait_for_timeout(400)
                home = pg.evaluate("location.hash") in ('', '#') and not pg.evaluate("document.getElementById('cpViews').classList.contains('on')")
                if theme == 'dark': check(f'{name}: {page} card opens in place; Back returns to the main page', inview and home, (inview, home))
                pg.goto(S.SITE + '/' + page); S.wait_ready(pg); pg.wait_for_timeout(700)   # the standalone page keeps the shared Back
                pg.evaluate(f"document.documentElement.setAttribute('data-theme', '{theme}')")
                seen[page] = pg.evaluate(GEO)
                pg.screenshot(path=str(SH / f'back-{page[:-5]}-{name}-{theme}.png'), clip={'x': 0, 'y': 0, 'width': vp['viewport']['width'], 'height': 90})
                pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(500)
            pg.goto(S.SITE + '/recover.html'); pg.wait_for_timeout(800)
            seen['recover'] = pg.evaluate(GEO)
            if theme == 'dark':
                pg.goto(S.SITE + '/performance.html'); pg.wait_for_timeout(800)   # opened directly (no previous page)
                pg.dispatch_event('a.cp-back', 'click'); pg.wait_for_url('**/index.html*'); pg.wait_for_timeout(300)
                check(f'{name}: opened directly → Back goes to the main page', pg.url.split('/')[-1].startswith('index.html'), pg.url)
            # pages with the bottom bar show the app logo there instead of Back; inner screens (coin, Recover) keep Back
            brand = {k: v for k, v in seen.items() if k in ('holdings', 'performance.html', 'allocation.html', 'accumulation.html')}
            check(f'{name}/{theme}: pages with the bottom bar show no Back (the app logo instead)', all(v is None for v in brand.values()), brand)
            seen = {k: v for k, v in seen.items() if k not in brand}
            vals = {k: (v['h'], v['rad'], v['fs'], v['fw'], v['ic'], v['text']) if v else None for k, v in seen.items()}
            check(f'{name}/{theme}: every page has the same Back button', all(vals.values()) and len(set(vals.values())) == 1, vals)
            check(f'{name}/{theme}: 36px tall; theme / cloud buttons only on the main page', all(v and v['h'] == 36 and v['themeH'] is None for v in seen.values()), {k: (v['h'], v['themeH']) for k, v in seen.items() if v})
            check(f'{name}/{theme}: no old back buttons left', all(v and v['old'] == 0 for v in seen.values()))
            check(f'{name}/{theme}: no page errors', not errs, errs)
            ctx.close()
    br.close()
print(f'back_test: {sum(res)}/{len(res)} passed')
