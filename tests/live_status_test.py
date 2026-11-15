"""The status line under the name: one failed price load does not flip it to "Saved prices" — what you see is still fresh
(and Binance keeps most coins live); it tries again soon. Only when nothing fresh arrived for 2½ minutes it says
"Saved prices ⓘ"; the next good load (or a fresh Binance price) brings "Live" back."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    check('prices loaded → "Live"', 'Live' in pg.inner_text('#liveIndicator'), pg.inner_text('#liveIndicator'))
    state = {'fail': True, 'n': 0}
    def busy(r):
        state['n'] += 1
        if state['fail']: r.fulfill(status=429, content_type='application/json', body='{}')
        else: r.fallback()
    ctx.route('https://api.coingecko.com/api/v3/simple/price**', busy)
    pg.evaluate("fetchLivePrices()"); pg.wait_for_timeout(600)
    t = pg.inner_text('#liveIndicator')
    check('one failed load right after a good one → still "Live" (not "Saved prices")', 'Live' in t and 'Saved' not in t, t)
    check('…the ticker still says Live too', 'Live' in pg.inner_text('#btcTickerTrack') and 'Saved prices' not in pg.inner_text('#btcTickerTrack'))
    check('…and it will try again soon (not only at the next minute)', pg.evaluate("_priceRetry != null && _priceFails === 1"))
    pg.evaluate("_lastPriceOk = Date.now() - 200000; _lastFastOk = 0; fetchLivePrices()"); pg.wait_for_timeout(600)
    t = pg.inner_text('#liveIndicator')
    check('nothing fresh for over 2½ minutes → "Saved prices ⓘ"', 'Saved prices' in t and pg.query_selector('#liveIndicator .lv-why') is not None, t)
    state['fail'] = False
    pg.evaluate("fetchLivePrices()"); pg.wait_for_timeout(800)
    check('the next good load → "Live" again', 'Live' in pg.inner_text('#liveIndicator'), pg.inner_text('#liveIndicator'))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
