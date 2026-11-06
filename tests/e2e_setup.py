import json, re, sys, time, urllib.request, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
T = pathlib.Path(__file__).parent
FAKE = T / 'fakefs'
ORIG = T / 'original-index.html'   # the app before the cloud sync (commit 38175d5): e2e.py signs in there first to seed the fake database
SITE = 'http://127.0.0.1:8000'          # CSP meta stripped (testserver.py)
SITE_CSP = 'http://127.0.0.1:8001'      # untouched files, CSP active
SRV = 'http://127.0.0.1:8787'

def _unused(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {detail}'), flush=True)

def srv(path):
    return json.load(urllib.request.urlopen(SRV + path))

# Price feed: deterministic prices for every CoinGecko id the app asks for.
def price_route(route):
    url = route.request.url
    ids = re.search(r'ids=([^&]+)', url)
    data = {}
    if ids:
        for i in urllib.request.unquote(ids.group(1)).split(','):
            data[i] = {'usd': 2.0 if i != 'bitcoin' else 100000.0, 'usd_24h_change': 1.5}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(data))

def _strip_csp(route):
    # Playwright's wait_for_function polls with eval, which the site's CSP forbids. Functional tests
    # strip the CSP <meta>; console_sweep.py / xss_probe.py keep it (setup(ctx, keep_csp=True)) to test it.
    r = route.fetch(); body = r.text()
    body = re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]*>', '', body)
    route.fulfill(response=r, body=body)

def setup(ctx, keep_csp=False):
    ctx.add_init_script("window.__cpAutoAnswer = (kind, msg, o) => { (window.__cpLog = window.__cpLog || []).push(msg); return kind === 'prompt' ? (o && o.value != null ? String(o.value) : '') : true; };")   # in-app dialogs (CPDialog) answer OK in tests
    cfg = "export const FIREBASE_CONFIG={apiKey:'test',authDomain:'x',projectId:'samsam-test',appId:'x'};export const ALLOWED_EMAILS=['owner@example.com'];"
    ctx.route(re.compile(r'.*/firebase-config\.js(\?.*)?$'), lambda r: r.fulfill(status=200, content_type='text/javascript', body=cfg))
    for n in ('app', 'auth', 'firestore'):
        body = (FAKE / f'firebase-{n}.js').read_text()
        def mk(b):
            return lambda r: r.fulfill(status=200, content_type='text/javascript', body=b, headers={'access-control-allow-origin': '*'})
        ctx.route(f'https://www.gstatic.com/firebasejs/13.0.0/firebase-{n}.js', mk(body))
    ctx.route('**/orig/index.html', lambda r: r.fulfill(status=200, content_type='text/html', body=ORIG.read_text()))
    ctx.route('https://api.coingecko.com/api/v3/simple/price**', price_route)
    ctx.route('https://api.coingecko.com/api/v3/coins/**', lambda r: r.fulfill(status=200, content_type='application/json',
              body=json.dumps({'image': {'small': 'https://img.test/logo.png'}, 'market_data': {'current_price': {'usd': 2.0}}})))
    ctx.route('https://api.coingecko.com/api/v3/coins/markets**', lambda r: r.fulfill(status=200, content_type='application/json',
              body=json.dumps([{'id': 'bitcoin', 'current_price': 100000.0, 'price_change_percentage_24h': 2.45, 'high_24h': 101250.0, 'low_24h': 97800.0}])))
    ctx.route(re.compile(r'^https?://(?!127\.0\.0\.\d)(?!www\.gstatic\.com/firebasejs)(?!api\.coingecko\.com).*'), lambda r: r.abort())
    # Market Hub feeds (deterministic): global stats + Fear & Greed
    ctx.route('https://api.coingecko.com/api/v3/global', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(
        {'data': {'total_market_cap': {'usd': 3.21e12}, 'total_volume': {'usd': 1.12e11}, 'market_cap_change_percentage_24h_usd': 1.84,
                  'market_cap_percentage': {'btc': 57.3, 'eth': 12.1, 'usdt': 4.6}, 'active_cryptocurrencies': 17000}})))
    ctx.route('https://api.alternative.me/fng/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
              body=json.dumps({'data': [{'value': '62', 'value_classification': 'Greed'}, {'value': '55', 'value_classification': 'Neutral'}]})))


def wait_ready(pg, timeout=10.0):
    end = time.time() + timeout
    while time.time() < end:
        if pg.evaluate("!!(window.Samsam && Samsam.isReady())"): return True
        pg.wait_for_timeout(100)
    raise TimeoutError('Samsam not ready')
