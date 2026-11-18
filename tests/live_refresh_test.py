"""How fresh the numbers are. Market Hub: between CoinGecko's refreshes the coins Binance trades are topped up every
minute while the tab is on screen (the list follows the live market). Overview: the BTC ticker comes from Binance (no
CoinGecko call), and the Plan page asks CoinGecko for plan-only coins only while it is the tab on screen."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx)
    cg = []; state = {'btc': 1}   # (a pair priced 0 is a halted one — left out of the pair list)
    ctx.on('request', lambda r: cg.append(r.url) if 'api.coingecko.com' in r.url else None)
    def bn_all(r): r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps([{'symbol': 'BTCUSDT', 'price': str(state['btc'])}, {'symbol': 'ETHUSDT', 'price': '1'}]))
    def bn_24(r): r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'symbol': 'BTCUSDT', 'lastPrice': '101234.5', 'priceChangePercent': '1.25', 'highPrice': '102000', 'lowPrice': '99000'}))
    ctx.route('https://data-api.binance.vision/api/v3/ticker/price**', bn_all)
    ctx.route('https://data-api.binance.vision/api/v3/ticker/24hr**', bn_24)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    check('Overview: the BTC ticker (price, 24h high / low) comes from Binance — no CoinGecko "markets?ids=bitcoin" call', pg.evaluate("btcTicker.price") == 101234.5 and pg.evaluate("btcTicker.high24") == 102000 and not any('coins/markets?vs_currency=usd&ids=bitcoin' in u and 'sparkline' not in u for u in cg), [u[-60:] for u in cg][:6])
    check('Overview: CoinGecko prices every 2 minutes (Binance keeps most coins live in between)', pg.evaluate("PRICE_POLL_MS") == 120000)
    pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(3000)
    fm = [f for f in pg.frames if 'market.html' in f.url][0]
    p0 = fm.evaluate("topRows.find(r => r.id === 'bitcoin').price")
    state['btc'] = round(p0 * 1.01, 2)
    fm.wait_for_function("!busy", timeout=15000)
    fm.evaluate("topRows.find(r => r.id === 'bitcoin').sym = 'BTC'")   # (the test's market rows carry no ticker)
    fm.evaluate("bnTick = 0; SamsamMarket._bnPx = {}; binanceMinute()"); pg.wait_for_timeout(1200)
    p1 = fm.evaluate("topRows.find(r => r.id === 'bitcoin').price")
    check('Market Hub: Binance\'s newer BTC price reaches the list between CoinGecko refreshes', abs(p1 - state['btc']) < 0.01 and p1 != p0, (p0, p1))
    check('…and the status line says Live, just now', 'Live' in fm.inner_text('#mkMsg') and 'just now' in fm.inner_text('#mkMsg'), fm.inner_text('#mkMsg'))
    pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(600)
    fm.evaluate("bnTick = 0; SamsamMarket._bnPx = {}"); state['btc'] = round(p0 * 1.02, 2)
    fm.evaluate("binanceMinute()"); pg.wait_for_timeout(800)
    check('Market Hub off screen: no top-up (nothing is downloaded for a tab you are not looking at)', fm.evaluate("topRows.find(r => r.id === 'bitcoin').price") == p1)
    # Plan: plan-only prices only while the Plan tab is on screen
    pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(2500)
    fa = [f for f in pg.frames if 'accumulation.html' in f.url][0]
    pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
    check('Plan off screen: it does not ask CoinGecko', fa.evaluate("planOnScreen()") is False)
    pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(500)
    check('Plan on screen: it does', fa.evaluate("planOnScreen()") is True)
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
