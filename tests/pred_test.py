"""Price Prediction (CoinCodex) button on cards, table and coin view; works for coins added later."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
CC = 'https://coincodex.com/crypto/'
def cc_api(route):
    u = route.request.url
    if 'select_bysymbol=XRP' in u or 'select_byslug=ripple' in u:
        body = {'data': [{'symbol': 'XRP', 'display_symbol': 'XRP', 'slug': 'ripple', 'name': 'XRP', 'market_cap_usd': 1e11}]}
    elif 'select_bysymbol=STRK' in u:   # ticker reused by another coin → must not be picked without a name match
        body = {'data': [{'symbol': 'STRK', 'display_symbol': 'STRK', 'slug': 'strike', 'name': 'Strike', 'market_cap_usd': 3e5}]}
    else: body = {'data': []}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers={'access-control-allow-origin': '*'})
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('https://coincodex.com/api/**', cc_api)
        ctx.route('https://coincodex.com/crypto/**', lambda r: r.fulfill(status=200, content_type='text/html', body='ok'))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
        urls = pg.evaluate("Object.fromEntries(portfolio.map(c => [c.sym, SamsamCoins.predictionUrl(c.sym, c)]))")
        urls = {k: v for k, v in urls.items() if k not in ('TEST', 'NOFEED')}   # test-only coins
        direct = [s for s, u in urls.items() if u.startswith(CC)]
        check(f'{name}: all current coins open their CoinCodex page directly ({len(direct)}/{len(urls)})', len(direct) == len(urls), [s for s in urls if s not in direct])
        check(f'{name}: tricky names mapped (BNB, TAO, WLD, STRK, FLR, GRAM)', all(urls.get(k, CC + v).endswith(f'/{v}/price-prediction/') for k, v in
              {'BNB': 'binance-coin', 'TAO': 'bittensor', 'WLD': 'worldcoin-org', 'STRK': 'starknet', 'FLR': 'spark-token', 'GRAM': 'toncoin'}.items()), {k: urls.get(k) for k in ['BNB','TAO','WLD','STRK','FLR','GRAM']})
        pg.locator(".coins-stack .btn-more[aria-label$=' SOL']").click(); pg.wait_for_selector('.cpm')
        with ctx.expect_page() as np_: pg.click(".cpm a.cpm-item:has-text('Price Prediction')")
        check(f'{name}: ⋯ → Price Prediction opens CoinCodex SOL in new tab', np_.value.url == CC + 'solana/price-prediction/', np_.value.url); np_.value.close()
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(300); pg.evaluate("selectCoinTx('ETH')"); pg.wait_for_timeout(500)
        check(f'{name}: coin view links ETH prediction', pg.evaluate("document.getElementById('htxPredLink').href") == CC + 'ethereum/price-prediction/')
        pg.screenshot(path=str(T / f'pred-tx-{name}.png'))
        pg.evaluate("history.back()"); pg.wait_for_timeout(300); pg.evaluate("document.querySelector('.hov-back-btn') && document.querySelector('.hov-back-btn').click()"); pg.wait_for_timeout(300)
        check(f'{name}: no horizontal overflow', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{name}: no JS errors', not errs, errs[:2]); ctx.close()
    # ── a coin added later ──
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx); ctx.route('https://coincodex.com/api/**', cc_api)
    pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    pg.evaluate("SamsamCoins.CC_SLUGS.XRP = undefined; delete SamsamCoins.CC_SLUGS.XRP")   # pretend XRP is unknown
    known = pg.evaluate("'XRP' in SamsamCoins.CC_SLUGS")
    pg.evaluate("openAddCoin(); acSym.value='XRP'; acName.value='XRP'; acCgId.value='ripple'; acQty.value='10'; acPrice.value='2'; applyAddCoin()")
    pg.wait_for_function("(Samsam.getState().coins.find(c => c.sym === 'XRP') || {}).ccSlug === 'ripple'", timeout=8000)
    check('new coin: CoinCodex page found and saved on the coin (ccSlug)', True)
    check('new coin: card opens its CoinCodex prediction directly', pg.evaluate("SamsamCoins.predictionUrl('XRP', portfolio.find(c => c.sym === 'XRP'))") == CC + 'ripple/price-prediction/')
    # reused ticker with a different coin on CoinCodex → falls back to search, never the wrong coin
    pg.evaluate("delete SamsamCoins.CC_SLUGS.STRK")
    s = pg.evaluate("SamsamCoins.findCcSlug('STRK', { cgId: 'starknet', name: 'Starknet' })")
    check('reused ticker on CoinCodex is not linked to the wrong coin', s is None, s)
    u = pg.evaluate("SamsamCoins.predictionUrl('ZZZ', { name: 'Zed Coin' })")
    check('unknown coin → search that finds its CoinCodex page', u.startswith('https://www.google.com/search?q=') and 'coincodex.com' in u and 'Zed' in u, u)
    check('a stored page name with bad characters is ignored', pg.evaluate("SamsamCoins.ccSlug('ABC', { ccSlug: 'x\" onclick=1' })") is None)
    ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
