"""Add New Coin: CoinGecko search links a new coin (cgId, logo, name, category) so price, icon, CoinGecko link and Liquidation Map all work."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SEARCH = {'coins': [
  {'id': 'ripple', 'name': 'XRP', 'symbol': 'XRP', 'market_cap_rank': 4, 'thumb': 'https://img.test/xrp-thumb.png', 'large': 'https://img.test/xrp.png'},
  {'id': 'xrp-classic', 'name': 'XRP Classic', 'symbol': 'XRPC', 'market_cap_rank': None, 'thumb': 'https://img.test/x.png', 'large': 'https://img.test/x.png'},
  {'id': 'bad', 'name': '<img src=x onerror=window.__x=1>', 'symbol': 'BAD', 'market_cap_rank': 900, 'thumb': 'javascript:alert(1)', 'large': 'javascript:alert(1)'}]}
COIN = {'id': 'ripple', 'image': {'small': 'https://img.test/xrp-small.png'}, 'categories': ['Smart Contract Platform', 'Layer 1 (L1)', 'Payment Solutions'],
        'market_data': {'current_price': {'usd': 2.45}}}
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('https://api.coingecko.com/api/v3/search**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SEARCH), headers={'access-control-allow-origin': '*'}))
        ctx.route('https://api.coingecko.com/api/v3/coins/ripple**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(COIN), headers={'access-control-allow-origin': '*'}))
        ctx.route('https://api.coingecko.com/api/v3/simple/price**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'ripple': {'usd': 2.45, 'usd_24h_change': 1}, 'bitcoin': {'usd': 100000, 'usd_24h_change': 1}}), headers={'access-control-allow-origin': '*'}))
        PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')
        ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        acc = lambda d: d.accept(); pg.on('dialog', acc)
        pg.evaluate("openAddCoin()"); pg.wait_for_timeout(200)
        pg.locator('#acSym').press_sequentially('xrp', delay=60); pg.wait_for_selector('#acSuggest [role=option]')
        opts = pg.eval_on_selector_all('#acSuggest [role=option]', 'els => els.map(e => e.innerText.replace(/\\s+/g," ").trim())')
        check(f'{name}: typing shows CoinGecko matches, exact symbol first', len(opts) == 3 and opts[0].startswith('XRP XRP #4'), opts)
        check(f'{name}: hostile search result is not executed', pg.evaluate("!window.__x && !document.querySelector('#acSuggest img[src^=javascript]')"))
        pg.screenshot(path=str(T / f'addcoin-search-{name}.png'))
        pg.click('#acSuggest [role=option] >> nth=0'); pg.wait_for_timeout(600)
        f = pg.evaluate("({sym: acSym.value, name: acName.value, cg: acCgId.value, cat: acCat.value, linked: acLinked.innerText, open: !acSuggest.hidden})")
        check(f'{name}: picking fills symbol, name, CoinGecko id', f['sym'] == 'XRP' and f['name'] == 'XRP' and f['cg'] == 'ripple' and not f['open'], f)
        check(f'{name}: category suggested from CoinGecko (Layer 1)', f['cat'] == 'layer1', f['cat'])
        check(f'{name}: "Linked to CoinGecko" confirmation with live price (or, once you hold it, "added as a Buy")', ('Linked to CoinGecko' in f['linked'] and '$2.4500' in f['linked']) or ('already in your portfolio' in f['linked'] and 'Buy' in f['linked']), f['linked'])
        pg.screenshot(path=str(T / f'addcoin-linked-{name}.png'))
        pg.fill('#acQty', '100'); pg.fill('#acPrice', '2'); pg.evaluate("applyAddCoin()")
        pg.wait_for_function("Samsam.getState().portfolio.some(c => c.sym === 'XRP')", timeout=5000); pg.wait_for_timeout(1500)
        c = pg.evaluate("Samsam.getState().portfolio.find(c => c.sym === 'XRP')")
        check(f'{name}: saved with cgId + logo', c['cgId'] == 'ripple' and (c.get('logoUrl') or '').startswith('https://img.test/xrp'), (c.get('cgId'), c.get('logoUrl')))
        check(f'{name}: live price picked up (2.45)', abs(c['currentPrice'] - 2.45) < 1e-9, c['currentPrice'])
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
        card = pg.evaluate("""(() => { const card = (document.querySelector('.coins-stack .btn-buy-more[onclick*="XRP"]') || {closest: () => null}).closest('.coin-card'); const a = { href: SamsamCoins.liqMapUrl('XRP') };
            return card ? { img: (card.querySelector('img')||{}).src || '', cg: [...card.querySelectorAll('a')].map(x => x.href).filter(h => h.includes('coinmarketcap.com/currencies/')) , liq: a.href } : null; })()""")
        check(f'{name}: card shows logo, CoinMarketCap link, Liquidation Map', card and card['img'].startswith('https://img.test/xrp') and 'https://coinmarketcap.com/currencies/xrp/' in card['cg'] and card['liq'].endswith('coin=XRP'), card)
        # not linked → warning before adding
        pg.evaluate("openAddCoin()"); pg.fill('#acSym', 'ZZZ'); pg.fill('#acQty', '1'); pg.fill('#acPrice', '1')
        msgs = []; pg.remove_listener('dialog', acc)
        pg.evaluate("window.__cpAutoAnswer = (k, m) => { window.__lastMsg = m; return false; }"); pg.evaluate("applyAddCoin()"); pg.wait_for_timeout(300)
        msgs = [pg.evaluate("window.__lastMsg || ''")]
        check(f'{name}: unlinked coin → warning, can cancel', msgs and 'not linked to CoinGecko' in msgs[0] and pg.evaluate("!Samsam.getState().portfolio.some(c=>c.sym==='ZZZ')"), msgs)
        pg.evaluate("closeAddCoin()")
        check(f'{name}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
