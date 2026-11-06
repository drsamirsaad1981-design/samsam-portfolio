"""Every coin link (name, symbol, logo) on every page opens CoinMarketCap; new coins get theirs automatically."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
CMC = 'https://coinmarketcap.com/currencies/'
JS = """() => { const a = [...document.querySelectorAll('a[href]')].map(x => x.href);
  return { cmc: a.filter(h => h.startsWith('https://coinmarketcap.com/currencies/')).length, cg: a.filter(h => h.includes('coingecko.com/en/coins/')), bad: a.filter(h => h.startsWith('https://coinmarketcap.com/currencies/') && !/^https:\\/\\/coinmarketcap\\.com\\/currencies\\/[a-z0-9-]+\\/$/.test(h)) }; }"""
SEARCH = {'coins': [{'id': 'hyperliquid', 'name': 'Hyperliquid', 'symbol': 'HYPE', 'market_cap_rank': 12, 'thumb': 'https://img.test/h.png', 'large': 'https://img.test/h.png'}]}
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('https://api.coingecko.com/api/v3/search**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SEARCH), headers={'access-control-allow-origin': '*'}))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        urls = pg.evaluate("Object.fromEntries(portfolio.filter(c => !['TEST','NOFEED'].includes(c.sym)).map(c => [c.sym, SamsamCoins.cgUrl(c.sym, c.cgId)]))")
        check(f'{name}: every current coin has a verified CoinMarketCap page', all(u == CMC + pg.evaluate(f"SamsamCoins.CMC_SLUGS['{s}'] || (Samsam.getState().coins.find(c => c.sym === '{s}') || {{}}).cmcSlug") + '/' for s, u in urls.items()), [s for s, u in urls.items() if not u.startswith(CMC)])
        for v in ("applyView('cards')", "applyView('table')", "openHoldingsView()"):
            pg.evaluate(v); pg.wait_for_timeout(400); r = pg.evaluate(JS)
            check(f'{name} main {v}: coin links → CoinMarketCap, none to CoinGecko', r['cmc'] > 10 and not r['cg'] and not r['bad'], r)
        pg.evaluate("history.back()"); pg.wait_for_timeout(300)
        for page in ('accumulation.html', 'performance.html', 'allocation.html'):
            pg.goto(S.SITE + '/' + page); S.wait_ready(pg); pg.wait_for_timeout(1500); r = pg.evaluate(JS)
            check(f'{name} {page}: coin links → CoinMarketCap, none to CoinGecko', r['cmc'] > 0 and not r['cg'] and not r['bad'], r)
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
        if name == 'desktop':
            pg.evaluate("openAddCoin()"); pg.locator('#acSym').press_sequentially('hype', delay=50); pg.wait_for_selector('#acSuggest [role=option]')
            pg.click('#acSuggest [role=option] >> nth=0'); pg.wait_for_timeout(400)
            f = pg.evaluate("({cmc: acCmc.value, check: document.getElementById('acCmcCheck').href, shown: !document.getElementById('acCmcCheck').hidden})")
            check('new coin: CoinMarketCap page filled automatically + Check link', f == {'cmc': 'hyperliquid', 'check': CMC + 'hyperliquid/', 'shown': True}, f)
            pg.evaluate("acQty.value='1'; acPrice.value='30'; applyAddCoin()"); pg.wait_for_timeout(1500)
            c = pg.evaluate("Samsam.getState().coins.find(c => c.sym === 'HYPE') || {}")
            check('new coin: saved with its CoinMarketCap page', c.get('cmcSlug') == 'hyperliquid', c.get('cmcSlug'))
            pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
            hrefs = pg.evaluate("[...document.querySelectorAll('.coins-stack a[href*=\"/currencies/hyperliquid/\"]')].length")
            check('new coin card: logo + name open its CoinMarketCap page', hrefs >= 2, hrefs)
            pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(1200)
            check('new coin: other pages use the saved page too', pg.evaluate("SamsamCoins.cgUrl('HYPE')") == CMC + 'hyperliquid/')
        check(f'{name}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
