"""Every coin name that opens CoinMarketCap shows the same small ↗, on every page, in cards and in tables."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
# CoinMarketCap links that carry text (the name/symbol) — icon-only links don't need the mark
AUDIT = """() => { const a = [...document.querySelectorAll('a[href*="coinmarketcap.com"]')].filter(x => x.offsetParent && (x.innerText || "").trim() && !x.querySelector("img, div"));   // skip round logo links
  const miss = a.filter(x => !x.querySelector('.ext-go')).map(x => x.innerText.trim().split('\\n')[0]);
  const st = a.slice(0, 1).map(x => { const g = x.querySelector('.ext-go'); return g ? [getComputedStyle(g).display, g.textContent] : null; });
  return { n: a.length, miss: miss.slice(0, 5), st }; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1800)
        for view in ('cards', 'table'):
            pg.evaluate(f"applyView('{view}')"); pg.wait_for_timeout(500)
            r = pg.evaluate(AUDIT)
            check(f'{name}: main page {view} — every coin name has ↗', r['n'] > 5 and not r['miss'] and r['st'][0][0] == 'inline-block', r)   # the mark is an SVG arrow now (no text)
            pg.locator('#coinsStack' if view == 'cards' else '#portfolioTableWrapper').screenshot(path=str(SH / f'ext-main-{view}-{name}.png')) if name == 'mobile' else None
        pg.evaluate("applyView('cards')")
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(900)
        r = pg.evaluate(AUDIT)
        check(f'{name}: holdings overview list has ↗', r['n'] > 5 and not r['miss'], r)
        for page in ('performance.html', 'allocation.html', 'accumulation.html'):
            pg.goto(S.SITE + '/' + page); S.wait_ready(pg); pg.wait_for_timeout(2200)
            if page == 'allocation.html':
                pg.evaluate("document.querySelector('.legend-item') && document.querySelector('.legend-item').click()"); pg.wait_for_timeout(500)
            r = pg.evaluate(AUDIT)
            check(f'{name}: {page} — every coin name has ↗', r['n'] > 0 and not r['miss'], r)
            if name == 'mobile': pg.screenshot(path=str(SH / f'ext-{page[:-5]}-{name}.png'))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'ext_test: {sum(res)}/{len(res)} passed')
