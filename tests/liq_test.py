import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('https://www.coinglass.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='ok'))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        pg.evaluate("applyView('cards')"); pg.add_style_tag(content='#cpAiFab{display:none!important}'); pg.wait_for_timeout(300)
        pg.locator(".coins-stack .btn-more[aria-label$=' ETH']").click(); pg.wait_for_selector('.cpm')
        a = pg.locator(".cpm a.cpm-item:has-text('Liquidation Map')")
        check(f'{name}: ⋯ menu has Liquidation Map for the coin', a.get_attribute('href') == 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ETH' and a.get_attribute('target') == '_blank' and 'noopener' in a.get_attribute('rel'))
        with ctx.expect_page() as np_: a.click()
        check(f'{name}: opens CoinGlass ETH heatmap', np_.value.url == 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=ETH', np_.value.url); np_.value.close()
        check(f'{name}: menu closes after opening the link', pg.query_selector('.cpm') is None)
        check(f'{name}: TON mapping for GRAM', pg.evaluate("SamsamCoins.liqMapUrl('GRAM')").endswith('coin=TON'))
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(300); pg.evaluate("selectCoinTx('SOL')"); pg.wait_for_timeout(500)
        h = pg.evaluate("document.getElementById('htxLiqLink').href")
        check(f'{name}: coin transactions view links to SOL heatmap', h.endswith('coin=SOL'), h)
        pg.screenshot(path=str(T / f'liq-tx-{name}.png'))
        check(f'{name}: no horizontal overflow', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{name}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
