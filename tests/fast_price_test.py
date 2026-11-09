"""Live prices: every 15 s the coins you hold that trade against USDT get Binance's price (CoinGecko lags a minute or more).
A Binance price far (>25%) from the CoinGecko one is ignored (same ticker, other coin); stablecoins are never asked;
the 24h % keeps CoinGecko's price of 24 h ago; the next CoinGecko refresh doesn't put an older price back."""
import sys, pathlib, json, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
asked = []
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True); S.setup(ctx)
    base = {}
    def binance(route):
        u = urllib.parse.unquote(route.request.url)
        if 'symbols=' in u:
            syms = json.loads(u.split('symbols=', 1)[1].split('&')[0]); asked.append(syms)
            out = [{'symbol': s, 'price': str(base.get(s[:-4], 1) * (1.02 if s != 'SOLUSDT' else 3.0))} for s in syms]   # SOL: 3× → ignored
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
        route.fulfill(status=200, content_type='application/json', body=json.dumps([{'symbol': s + 'USDT', 'price': '1'} for s in ('BTC', 'SOL', 'ETH', 'LINK', 'USDT', 'USDC')] + [{'symbol': 'ETHBTC', 'price': '0.03'}]))
    ctx.route('https://data-api.binance.vision/**', binance)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(500)
    b0 = pg.evaluate("Object.fromEntries(portfolio.filter(c=>c.qty>0).map(c=>[c.sym,[c.currentPrice,c.change24h]]))")
    for k, v in b0.items(): base[k] = v[0]
    pg.wait_for_function("(()=>{const c=portfolio.find(x=>x.sym==='BTC'); return c && Math.abs(c.currentPrice/%f-1.02)<1e-6})()" % b0['BTC'][0], timeout=25000)
    b1 = pg.evaluate("Object.fromEntries(portfolio.filter(c=>c.qty>0).map(c=>[c.sym,[c.currentPrice,c.change24h]]))")
    check(f'BTC now Binance\'s price (+2%) within ~15 s', abs(b1['BTC'][0] / b0['BTC'][0] - 1.02) < 1e-6, (b0['BTC'], b1['BTC']))
    ago = b0['BTC'][0] / (1 + b0['BTC'][1] / 100)
    check('BTC 24h % recomputed from the price 24 h ago', abs(b1['BTC'][1] - ((b1['BTC'][0] / ago - 1) * 100)) < 1e-6, (b0['BTC'], b1['BTC']))
    if 'SOL' in b0: check('SOL: Binance price 3× away → ignored', abs(b1['SOL'][0] - b0['SOL'][0]) < 1e-9, (b0['SOL'], b1['SOL']))
    flat = [s for q in asked for s in q]
    check(f'only USDT pairs that exist were asked, no stablecoins ({sorted(set(flat))})', flat and all(s.endswith('USDT') for s in flat) and 'USDTUSDT' not in flat and 'USDCUSDT' not in flat and all(s[:-4] in ('BTC', 'SOL', 'ETH', 'LINK') for s in flat), sorted(set(flat)))
    pg.evaluate("fetchLivePrices()"); pg.wait_for_timeout(2500)
    b2 = pg.evaluate("portfolio.find(c=>c.sym==='BTC').currentPrice")
    check('a CoinGecko refresh right after keeps the fresher Binance price', abs(b2 / b0['BTC'][0] - 1.02) < 1e-6, (b0['BTC'][0], b2))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
