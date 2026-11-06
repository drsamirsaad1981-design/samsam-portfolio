"""Market Hub links from the list GitHub checks (prices/m/links.json): CoinMarketCap page by ticker + name / market cap,
CoinCodex page by CoinGecko id, "No futures" instead of an empty Liq.Map; euro / pegged coins hidden like stablecoins;
a watched coin CoinGecko doesn't answer for still shows your portfolio's price. Coin page uses the same rules."""
import sys, pathlib, json, re, math, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)

def mrow(cid, sym, name, rank, price, flat=False):
    sp = [price * (1 + (0.002 if flat else 0.04) * math.sin(k / 9 + rank)) for k in range(168)]
    return {'id': cid, 'symbol': sym, 'name': name, 'image': 'https://img.test/x.png', 'market_cap_rank': rank, 'current_price': price,
            'market_cap': int(3e12 / rank), 'total_volume': 1e9, 'price_change_percentage_24h_in_currency': 1.0,
            'price_change_percentage_7d_in_currency': 2.0, 'price_change_percentage_30d_in_currency': 3.0, 'sparkline_in_7d': {'price': sp}}
ROWS = [mrow('bitcoin', 'btc', 'Bitcoin', 1, 100000), mrow('ethereum', 'eth', 'Ethereum', 2, 3000), mrow('tether', 'usdt', 'Tether', 3, 1, True),
        mrow('pump-fun', 'pump', 'Pump.fun', 4, 0.004), mrow('aster-2', 'aster', 'Aster', 5, 0.69), mrow('eursafo', 'eursafo', 'EURSAFO', 6, 1.14, True),
        mrow('quiet-peg', 'qpg', 'Quiet Peg', 7, 1.0, True)] + [mrow(f'coin{i}', f'c{i}', f'Coin {i}', i, 2 + i) for i in range(8, 120)]
LINKS = {'updated': '2026-11-02T18:00:00Z',
         'cmc': {'PUMP': [['pump-fun', 'Pump.fun', 1.8e9], ['pump-other', 'Pump Other', 1e5]], 'ASTER': [['aster-dex', 'Aster', 1.7e9]], 'BTC': [['bitcoin', 'Bitcoin', 1.5e12]]},
         'cc': {'pump-fun': 'pump-fun-cc', 'aster-2': 'aster-cc'}, 'fut': ['BTC', 'ETH', 'PUMP', 'SOL']}
state = {'ids429': False}
def markets(route):
    url = urllib.parse.unquote(route.request.url)
    m = re.search(r'ids=([^&]+)', url)
    if m:
        if state['ids429']: return route.fulfill(status=429, body='{}')
        ids = m.group(1).split(','); return route.fulfill(status=200, content_type='application/json', body=json.dumps([r for r in ROWS if r['id'] in ids]))
    route.fulfill(status=200, content_type='application/json', body=json.dumps(ROWS))

with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    ctx.route('**/prices/m/links.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(LINKS)))
    ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=404, body=''))
    ctx.route('https://api.coingecko.com/api/v3/coins/markets**', markets)
    ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg"/>'))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(500)
    if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.SamsamCoins && SamsamCoins.links() && document.querySelectorAll('.mk-row').length > 20", timeout=15000)
    pg.wait_for_timeout(800)
    syms = pg.eval_on_selector_all('.mk-row b', "e => e.map(x => x.childNodes[0].textContent.trim())")
    check('EURSAFO (euro peg) hidden from the Top 100', 'EURSAFO' not in syms, syms[:10])
    check('a coin that never moves (Quiet Peg) hidden too', 'QPG' not in syms, syms[:10])
    check('real coins still listed (PUMP, ASTER, C8)', all(s in syms for s in ('PUMP', 'ASTER', 'C8')), syms[:10])
    href = lambda cid: pg.get_attribute(f'.mk-row[data-id="{cid}"] a.mk-asset', 'href')
    check('PUMP opens CoinMarketCap’s own page (pump-fun)', href('pump-fun') == 'https://coinmarketcap.com/currencies/pump-fun/', href('pump-fun'))
    check('ASTER opens CoinMarketCap’s real page name (aster-dex, not a guess)', href('aster-2') == 'https://coinmarketcap.com/currencies/aster-dex/', href('aster-2'))
    check('a coin CoinMarketCap doesn’t list opens on CoinGecko by its id', href('coin8') == 'https://www.coingecko.com/en/coins/coin8', href('coin8'))
    pg.click('.mk-row[data-id="pump-fun"] .mk-pc'); pg.wait_for_timeout(300)
    lk = pg.eval_on_selector('#mkl-pump-fun', "e => [...e.querySelectorAll('a,span.off')].map(a => [a.className, a.getAttribute('href') || ''])")
    check('PUMP Liq.Map → CoinGlass (has futures)', any(c == 'l-liq' and 'coinglass.com' in h and 'coin=PUMP' in h for c, h in lk), lk)
    check('PUMP Prediction → CoinCodex page from the checked list', any(c == 'l-pred' and h.endswith('/crypto/pump-fun-cc/price-prediction/') for c, h in lk), lk)
    pg.click('.mk-row[data-id="aster-2"] .mk-pc'); pg.wait_for_timeout(300)
    lk = pg.eval_on_selector('#mkl-aster-2', "e => [...e.querySelectorAll('a,span.off')].map(a => [a.className, a.getAttribute('href') || '', a.textContent.trim()])")
    check('ASTER (no futures) shows "No futures", not a dead Liq.Map link', any(c == 'l-liq off' and not h and 'No futures' in t for c, h, t in lk), lk)
    check('ASTER Prediction → its CoinCodex page (no Google search)', any(c == 'l-pred' and h.endswith('/crypto/aster-cc/price-prediction/') for c, h, _ in lk), lk)
    check('no Google links in the open row', not any('google.com' in h for _, h, _ in lk), lk)

    # watched coin CoinGecko won't answer for → the price your portfolio already has
    held = pg.evaluate("Samsam.getState().portfolio.filter(c => c.cgId && c.currentPrice > 0 && c.qty > 0).map(c => ({ id: c.cgId, sym: c.sym, name: c.name || c.sym, price: c.currentPrice }))")
    h = next((x for x in held if x['id'] not in {r['id'] for r in ROWS}), None)
    check('test portfolio has a coin outside the market list', h is not None, held[:3])
    if h:
        state['ids429'] = True
        pg.evaluate(f"Samsam.saveWatchlist([{{ id: {json.dumps(h['id'])}, sym: {json.dumps(h['sym'])}, name: {json.dumps(h['name'])}, img: '' }}])")
        pg.click("#tabWatch"); pg.wait_for_timeout(1500)
        row = pg.locator(f'.mk-row[data-id="{h["id"]}"]')
        txt = row.inner_text() if row.count() else ''
        check(f'watched {h["sym"]} shows a price although CoinGecko refused ({txt.split(chr(10))[:4]})', row.count() == 1 and '$' in txt and '—\n—' not in txt, txt)
    check('no JS errors', not errs, errs[:3])

    # coin page in the main app: same rules
    pg2 = ctx.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e)))
    pg2.goto(S.SITE + '/index.html'); S.wait_ready(pg2); pg2.wait_for_timeout(800)
    sym = pg2.evaluate("(Samsam.getState().portfolio.find(c => c.qty > 0 && !['BTC','ETH','PUMP','SOL'].includes(c.sym)) || {}).sym")
    pg2.evaluate(f"openCoinTx && openCoinTx('{sym}')") if pg2.evaluate("typeof openCoinTx === 'function'") else pg2.goto(S.SITE + f'/index.html#holdings/{sym}')
    pg2.wait_for_timeout(1200)
    st = pg2.evaluate("(() => { const a = document.getElementById('htxLiqLink'); return a ? [a.className, a.getAttribute('href'), a.textContent.trim()] : null; })()")
    check(f'coin page: {sym} without futures shows "No futures" (no dead link)', st and 'off' in st[0] and not st[1] and 'No futures' in st[2], st)
    check('no JS errors (coin page)', not errs, errs[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
