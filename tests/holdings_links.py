import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
        pg.wait_for_timeout(1500); pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(600)
        info = pg.evaluate("""() => {
          const rows = [...document.querySelectorAll('#hovAssetList .hov-asset-row')];
          const links = rows.map(r => r.querySelector('a.ast-sym'));
          const withId = rows.filter((r, i) => links[i]);
          const bad = withId.filter(r => { const a = r.querySelector('a.ast-sym');
            return !/^https:\\/\\/coinmarketcap\\.com\\/currencies\\/[a-z0-9-]+\\/$/.test(a.href) || a.target !== '_blank' || !/noopener/.test(a.rel); });
          const btc = rows.find(r => r.dataset.sym === 'BTC');
          const cols = rows.slice(0, 3).map(r => getComputedStyle(r).gridTemplateColumns);
          return { rows: rows.length, linked: withId.length, bad: bad.length,
            btcHref: btc && btc.querySelector('a.ast-sym').href, btcName: btc && btc.querySelector('.ast-sym').title,
            iconLinked: rows.filter(r => r.querySelector('.hov-coin-icon a[href*="coinmarketcap"]')).length,
            unlinked: rows.filter((r, i) => !links[i]).map(r => r.dataset.sym),
            cols, overflow: document.getElementById('holdingsOverlay').scrollWidth > document.getElementById('holdingsOverlay').clientWidth + 1 };
        }""")
        check(f'{name}: coin name is a CoinMarketCap links in new tab', info['linked'] >= info['rows'] - 2 and info['bad'] == 0, info)
        check(f'{name}: BTC → coinmarketcap.com/currencies/bitcoin, name "Bitcoin"', info['btcHref'] == 'https://coinmarketcap.com/currencies/bitcoin/' and info['btcName'].startswith('Bitcoin (BTC)'), info)   # symbol shown; full name on hover
        check(f'{name}: logos linked too', info['iconLinked'] == info['linked'], info)
        check(f'{name}: layout unchanged (no overflow)', not info['overflow'] and len({c.split(' ')[0] for c in info['cols']}) == 1, info)
        if name == 'desktop':
            sel = '#hovAssetList .hov-asset-row:first-child a.ast-sym'
            before = pg.eval_on_selector(sel, 'e => getComputedStyle(e).color')
            pg.hover(sel); pg.wait_for_timeout(250)
            after = pg.eval_on_selector(sel, 'e => [getComputedStyle(e).color, getComputedStyle(e).textDecorationColor]')
            check('desktop: hover turns the coin name blue + underline', after[0] == 'rgb(96, 165, 250)' and after[0] != before and after[1] == 'rgb(96, 165, 250)', (before, after))
            pg.screenshot(path=str(T / 'holdings-hover-desktop.png'), clip={'x': 0, 'y': 300, 'width': 1366, 'height': 360})
        ctx.route('https://coinmarketcap.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='<title>CMC</title>ok'))
        with ctx.expect_page() as newp:
            pg.click('#hovAssetList .hov-asset-row:first-child a.ast-sym')
        check(f'{name}: click opens CoinMarketCap in a new tab', newp.value.url.startswith('https://coinmarketcap.com/currencies/'), newp.value.url)
        newp.value.wait_for_load_state(); newp.value.close()
        check(f'{name}: overlay still open after click', pg.evaluate("document.getElementById('holdingsOverlay').style.display") == 'flex')
        if name == 'mobile': pg.screenshot(path=str(T / 'holdings-mobile.png'))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
