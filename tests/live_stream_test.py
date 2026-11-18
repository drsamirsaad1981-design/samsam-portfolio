"""⚡ Binance's live line (WebSocket) on Overview: one connection for BTC + the coins you hold that Binance trades; prices
shown every 2 s; the moving BTC line changes its numbers in place (keeps moving); the 15-second asking stops while the
line is alive and comes back when it drops; the line closes while the page is hidden. Market data downloads only what
is needed: Binance's whole pair list once a day per device, then only the tickers on screen."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
WS = 'wss://data-stream.binance.vision/stream?streams='
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    ctx.add_init_script(f"window.__bnWs = '{WS}';")
    full, some = [], []
    def bn(r):
        u = r.request.url
        if 'ticker/price' in u and 'symbols=' not in u:
            full.append(u); body = [{'symbol': s + 'USDT', 'price': '1'} for s in ('BTC', 'ETH', 'SOL', 'DOGE', 'ADA', 'LINK', 'DOT')] + [{'symbol': 'ETHBTC', 'price': '0.03'}]
        elif 'ticker/price' in u:
            some.append(u); want = json.loads(re.search(r'symbols=([^&]+)', u).group(1).replace('%22', '"').replace('%5B', '[').replace('%5D', ']').replace('%2C', ','))
            body = [{'symbol': s, 'price': '1'} for s in want]
        else: body = {'symbol': 'BTCUSDT', 'lastPrice': '100000', 'priceChangePercent': '2.45', 'highPrice': '101000', 'lowPrice': '99000'}
        r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
    ctx.route('https://data-api.binance.vision/**', bn)
    socks = []
    def on_ws(ws):
        socks.append({'url': ws.url, 'ws': ws})
    ctx.route_web_socket(re.compile(r'^wss://data-stream\.binance\.vision/.*'), on_ws)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=15000)
    pg.wait_for_timeout(5000)
    check('one live line opened', len(socks) == 1, [s['url'] for s in socks])
    if socks:
        u = socks[0]['url']; streams = u.split('streams=')[1].split('/')
        check('it follows BTC and the held coins Binance trades, nothing else (no stablecoins, no unknown pairs)', 'btcusdt@miniTicker' in streams and all(re.match(r'^[a-z0-9]+usdt@miniTicker$', s) for s in streams) and not any(s.startswith('usdt') or s.startswith('usdc') for s in streams) and len(streams) <= 7, streams)
    check("Binance's whole pair list: downloaded once, then kept on the device", len(full) == 1 and pg.evaluate("!!JSON.parse(localStorage.getItem('samsam_bn_pairs')||'null')"), len(full))
    btc0 = pg.evaluate("portfolio.find(c => c.sym === 'BTC').currentPrice")
    first = pg.evaluate("document.querySelector('#btcTickerTrack .btc-ticker-group')")
    pg.evaluate("document.querySelector('#btcTickerTrack .btc-ticker-group').dataset.probe = '1'")
    new = round(btc0 * 1.004, 2); o = round(new / 1.031, 2)
    socks[0]['ws'].send(json.dumps({'stream': 'btcusdt@miniTicker', 'data': {'e': '24hrMiniTicker', 's': 'BTCUSDT', 'c': str(new), 'o': str(o), 'h': str(new + 50), 'l': str(o - 50)}}))
    pg.wait_for_timeout(2600)
    btc1 = pg.evaluate("portfolio.find(c => c.sym === 'BTC').currentPrice")
    check('a price from the line reaches the portfolio within ~2 s', abs(btc1 - new) < 0.01, (btc0, new, btc1))
    t = pg.inner_text('#btcTickerTrack')
    check("the moving line shows it, with Binance's 24 h change (+3.10%)", f"${round(new):,}" in t and '+3.10%' in t, t[:160])
    check('…changed in place: the moving line was not rebuilt (keeps moving)', pg.evaluate("document.querySelector('#btcTickerTrack .btc-ticker-group').dataset.probe === '1'"))
    n0 = len(some); pg.evaluate("fastPrices()"); pg.wait_for_timeout(600)
    check('while the line is alive, the 15-second asking makes no call', len(some) == n0, (n0, len(some)))
    socks[0]['ws'].send(json.dumps({'stream': 'btcusdt@miniTicker', 'data': {'e': '24hrMiniTicker', 's': 'BTCUSDT', 'c': str(btc0 * 1.6), 'o': str(o)}}))
    pg.wait_for_timeout(2600)
    check('a price 25%+ away from the known one is ignored (a different coin with the same ticker)', abs(pg.evaluate("portfolio.find(c => c.sym === 'BTC').currentPrice") - new) < 0.01)
    # the page goes to the background → the line closes; back → it opens again
    pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(500)
    check('page hidden → the line is closed (nothing downloaded in the background)', pg.evaluate("!liveLine.alive()"))
    pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))"); pg.wait_for_timeout(800)
    check('page shown again → a new line', len(socks) == 2, len(socks))
    # the line goes quiet → the 15-second asking takes over by itself
    pg.evaluate("liveLine.stop(); SamsamMarket._bnPx = {}"); n1 = len(some); pg.evaluate("fastPrices()"); pg.wait_for_timeout(800)
    check('no live line → the 15-second asking is back (only the tickers held, not the whole list)', len(some) == n1 + 1 and len(full) == 1, (n1, len(some), len(full)))
    # reload: the pair list comes from the device, not downloaded again
    pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(5000)
    check('page opened again → the whole pair list is NOT downloaded again (kept a day)', len(full) == 1, len(full))
    # Market Hub: only the tickers in its lists
    pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(3500)
    fm = [f for f in pg.frames if 'market.html' in f.url][0]
    fm.wait_for_function("!busy", timeout=15000)
    fm.evaluate("topRows.forEach((r, i) => { if (!r.sym) r.sym = ['BTC','ETH','SOL','DOGE','ADA'][i] || 'ZZZ' + i; })")
    n2 = len(some); fm.evaluate("bnTick = 0; SamsamMarket._bnPx = {}; binanceMinute()"); pg.wait_for_timeout(1200)
    asked = some[n2:]
    check('Market Hub top-up: only the tickers Binance trades, in small requests — never the whole list', asked and len(full) == 1 and all('symbols=' in u for u in asked), (len(asked), len(full)))
    check('no JS errors', not errs, errs[:3])
    ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
