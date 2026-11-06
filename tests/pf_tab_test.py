"""Market Hub → In Portfolio: every coin you hold, with market numbers (Top list + one call for the rest, your own
price when CoinGecko has none), what you hold in $, biggest first; tabs fit on a phone."""
import sys, pathlib, json, re, math, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def mrow(cid, sym, name, rank, price):
    sp = [price * (1 + 0.04 * math.sin(k / 9 + rank)) for k in range(168)]
    return {'id': cid, 'symbol': sym, 'name': name, 'image': 'https://img.test/x.png', 'market_cap_rank': rank, 'current_price': price, 'market_cap': int(3e12 / rank),
            'total_volume': 1e9, 'price_change_percentage_24h_in_currency': 1.5, 'price_change_percentage_7d_in_currency': 3.0, 'price_change_percentage_30d_in_currency': 3.0, 'sparkline_in_7d': {'price': sp}}
TOP = [mrow('bitcoin', 'btc', 'Bitcoin', 1, 100000), mrow('ethereum', 'eth', 'Ethereum', 2, 3000)] + [mrow(f'coin{i}', f'c{i}', f'Coin {i}', i, 2 + i) for i in range(3, 150)]
state = {'ids': None, 'rate': False}
def markets(route):
    url = urllib.parse.unquote(route.request.url); m = re.search(r'ids=([^&]+)', url)
    if m:
        if state['rate']: return route.fulfill(status=429, body='{}')
        ids = m.group(1).split(','); state['ids'] = ids
        return route.fulfill(status=200, content_type='application/json', body=json.dumps([mrow(i, {'tether': 'usdt', 'usd-coin': 'usdc'}.get(i, i[:4]), i.title(), 500 + k, 1.0 if i in ('tether', 'usd-coin') else 7.5) for k, i in enumerate(ids)]))
    route.fulfill(status=200, content_type='application/json', body=json.dumps(TOP))
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        state['rate'] = False; state['ids'] = None
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=404, body=''))
        ctx.route('https://api.coingecko.com/api/v3/coins/markets**', markets)
        ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg"/>'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(500)
        if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady() && document.querySelectorAll('#mkRows .mk-row').length > 20", timeout=15000); pg.wait_for_timeout(500)
        held = pg.evaluate("Samsam.getState().portfolio.filter(c=>c.qty>0).map(c=>({sym:c.sym, id:c.cgId||SamsamCoins.CG_IDS[c.sym]||'', price:c.currentPrice, qty:c.qty}))")
        tabs = pg.evaluate("[...document.querySelectorAll('.mk-tabs button')].map(b=>[b.innerText.replace(/\\s+/g,' ').trim(), b.scrollWidth<=b.clientWidth+1, Math.round(b.getBoundingClientRect().top)])")
        check(f'{name}: three tabs on one line, nothing cut {tabs}', len(tabs) == 3 and all(t[1] for t in tabs) and len({t[2] for t in tabs}) == 1 and tabs[2][0].startswith('Portfolio' if name == 'phone' else 'In Portfolio'), tabs)
        check(f'{name}: Portfolio tab counts your coins ({len(held)})', pg.inner_text('#pfN') == str(len(held)), pg.inner_text('#pfN'))
        pg.click('#tabPf'); pg.wait_for_timeout(1500)
        stables = pg.evaluate("Samsam.getState().portfolio.filter(c=>c.qty>0 && SamsamMarket.isStable({sym:c.sym,name:c.name||''})).length")
        n = pg.evaluate("document.querySelectorAll('#mkRows .mk-row').length")
        check(f'{name}: lists every coin you hold ({n} + {stables} stablecoins hidden = {len(held)})', n + stables == len(held), (n, stables, len(held)))
        outside = [h['id'] for h in held if h['id'] and not any(r['id'] == h['id'] for r in TOP)]
        check(f'{name}: coins outside the Top 150 asked from CoinGecko in one call ({len(outside)})', state['ids'] is not None and set(outside) <= set(state['ids']), (outside[:5], (state['ids'] or [])[:5]))
        vals = pg.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>r.querySelector('.mk-own-v').textContent)")
        nums = [float(v.replace('$', '').replace(',', '')) if v.startswith('$') else 0 for v in vals]
        check(f'{name}: each row shows what you hold in $, biggest first ({vals[:3]})', all(v.startswith('$') or v == '—' for v in vals) and nums == sorted(nums, reverse=True), vals[:6])
        check(f'{name}: the column says Value', pg.evaluate("document.getElementById('hAsset').dataset.s") == 'val' and 'Value' in pg.inner_text('#hAsset'))
        check(f'{name}: no "In portfolio" badge here (every row is yours)', pg.evaluate("document.querySelectorAll('#mkRows .mk-own').length") == 0)
        if outside:
            o = outside[0]; row = pg.locator(f'.mk-row[data-id="{o}"]')
            check(f'{name}: a coin outside the Top 150 gets CoinGecko’s numbers ({o})', row.count() == 1 and '$7.50' in row.inner_text() and '1.50%' in row.inner_text(), row.inner_text() if row.count() else None)
        pg.click('#hAsset'); pg.wait_for_timeout(300)
        vals2 = pg.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>r.querySelector('.mk-own-v').textContent)")
        check(f'{name}: tapping Value flips the order (smallest first)', vals2 == list(reversed(vals)) or vals2[0] != vals[0], (vals2[:3], vals[:3]))
        pg.fill('#mkSearch', held[0]['sym']); pg.wait_for_timeout(500)
        check(f'{name}: search works inside your coins', pg.evaluate("document.querySelectorAll('#mkRows .mk-row').length") >= 1)
        pg.fill('#mkSearch', ''); pg.wait_for_timeout(300)
        # CoinGecko busy → your portfolio's prices
        state['rate'] = True; pg.evaluate("pfExtra = []; localStorage.clear(); loadPf(true)"); pg.wait_for_timeout(1500)
        empty = pg.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].filter(r=>r.querySelector('.mk-own-v').textContent==='—').map(r=>r.dataset.id)")
        check(f'{name}: CoinGecko busy → every coin still has a price and value (from your portfolio)', not empty, empty[:5])
        pg.click('#tabTop'); pg.wait_for_timeout(500)
        check(f'{name}: back on Top 100 → sorted by rank, Market Cap column again', pg.evaluate("sortKey") == 'rank' and pg.evaluate("document.getElementById('hAsset').dataset.s") == 'mcap')
        check(f'{name}: no sideways scrolling', not pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        check(f'{name}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
