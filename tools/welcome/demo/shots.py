"""Demo screenshots of Cute Portfolio: the real app (local copy) with a made-up portfolio on today's real market data.
Run with the test servers up (tests/testserver.py on :8000, tests/fakefs/server.mjs on :8787)."""
import json, re, sys, time, pathlib, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright
REPO = pathlib.Path('/home/claude/samsam-portfolio'); FAKE = REPO / 'tests' / 'fakefs'
D = pathlib.Path('/tmp/demo'); PR = D / 'prices'; LOGOS = D / 'logos'; OUT = pathlib.Path('/home/claude/demo/out'); OUT.mkdir(exist_ok=True)
FONTS = D / 'npm/node_modules/@fontsource/cairo/files'
SITE, SRV = 'http://127.0.0.1:8000', 'http://127.0.0.1:8787'
market = json.loads((PR / 'm/market.json').read_text()); top500 = json.loads((PR / 'm/top500.json').read_text())
rows = market['top'] + top500.get('top', [])
PRICE = {}; IMG = {}
for r in rows:
    if r.get('id') and r['id'] not in PRICE: PRICE[r['id']] = (r.get('price'), r.get('ch24') or 0)
    m = re.search(r'/coins/images/(\d+)/', r.get('img') or '')
    if m and r.get('sym'): IMG.setdefault(m.group(1), r['sym'].lower())
SER = {}
def series(cid):
    if cid not in SER:
        f = PR / 'p' / f'{cid}.json'; SER[cid] = json.loads(f.read_text()) if f.exists() else None
    return SER[cid]
def price_at(cid, days):
    s = series(cid); p = s['p']; return p[max(0, len(p) - 1 - int(days * 24))]
for f in (PR / 'p').glob('*.json'):
    if f.stem in ('index', 'close'): continue
    s = series(f.stem)
    if f.stem not in PRICE and s and s.get('p'): PRICE[f.stem] = (s['p'][-1], (s['p'][-1] / s['p'][max(0, len(s['p']) - 25)] - 1) * 100)
CORS = {'access-control-allow-origin': '*'}
def setup(ctx):
    ctx.add_init_script("if (window.__bnWs === undefined) window.__bnWs = 'ws://127.0.0.1:9/?streams=';")
    ctx.add_init_script("try{if(localStorage.getItem('samsam_buy_from')===null)localStorage.setItem('samsam_buy_from','{\"on\":false}')}catch(e){}")
    cfg = "export const FIREBASE_CONFIG={apiKey:'test',authDomain:'x',projectId:'samsam-test',appId:'x'};export const ALLOWED_EMAILS=['owner@example.com'];"
    def other(r):
        u = r.request.url
        if '/firebase-config.js' in u: return r.fulfill(status=200, content_type='text/javascript', body=cfg)
        m = re.match(r'https://www\.gstatic\.com/firebasejs/[\d.]+/firebase-(app|auth|firestore)\.js', u)
        if m: return r.fulfill(status=200, content_type='text/javascript', body=(FAKE / f'firebase-{m.group(1)}.js').read_text(), headers=CORS)
        m = re.match(r'https://raw\.githubusercontent\.com/[^/]+/[^/]+/prices/(.+?)(\?.*)?$', u)
        if m:
            f = PR / m.group(1)
            return r.fulfill(status=200, content_type='application/json', body=f.read_text(), headers=CORS) if f.exists() else r.fulfill(status=404, body='{}', headers=CORS)
        if u.startswith('https://api.coingecko.com/api/v3/simple/price'):
            ids = urllib.parse.unquote(re.search(r'ids=([^&]+)', u).group(1)).split(',')
            return r.fulfill(status=200, content_type='application/json', headers=CORS, body=json.dumps({i: {'usd': PRICE[i][0], 'usd_24h_change': PRICE[i][1]} for i in ids if i in PRICE and PRICE[i][0]}))
        if u.startswith('https://fonts.googleapis.com/'):
            css = ''.join(f"@font-face{{font-family:'Cairo';font-style:normal;font-weight:{w};src:url(https://fonts.gstatic.com/demo/cairo-{sub}-{w}-normal.woff2) format('woff2');unicode-range:{rng}}}" for w in (400, 600, 700, 800, 900) for sub, rng in (('arabic', 'U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFC'), ('latin', 'U+0000-00FF,U+2000-206F,U+20AC,U+2212')))
            return r.fulfill(status=200, content_type='text/css', body=css, headers=CORS)
        m = re.match(r'https://fonts\.gstatic\.com/demo/(.+)$', u)
        if m and (FONTS / m.group(1)).exists(): return r.fulfill(status=200, content_type='font/woff2', body=(FONTS / m.group(1)).read_bytes(), headers=CORS)
        m = re.search(r'coingecko\.com/coins/images/(\d+)/', u)
        if m and m.group(1) in IMG and (LOGOS / f'{IMG[m.group(1)]}.png').exists(): return r.fulfill(status=200, content_type='image/png', body=(LOGOS / f'{IMG[m.group(1)]}.png').read_bytes(), headers=CORS)
        if re.match(r'https?://127\.0\.0\.1', u): return r.continue_()
        return r.abort()
    ctx.route('**/*', other)

PORT = [  # sym, id, name, [(days ago, qty)]
    ('BTC', 'bitcoin', 'Bitcoin', [(30, 0.12), (5, 0.05), (2, 0.04)]),
    ('ETH', 'ethereum', 'Ethereum', [(15, 1.5), (2, 1.2)]),
    ('SOL', 'solana', 'Solana', [(30, 14), (5, 22)]),
    ('LINK', 'chainlink', 'Chainlink', [(15, 110), (3, 60)]),
    ('DOT', 'polkadot', 'Polkadot', [(30, 900)]),
    ('AVAX', 'avalanche-2', 'Avalanche', [(5, 110)]),
    ('NEAR', 'near', 'NEAR Protocol', [(15, 220)]),
    ('SUI', 'sui', 'Sui', [(5, 1600)]),
    ('RENDER', 'render-token', 'Render', [(2, 420)]),
    ('DOGE', 'dogecoin', 'Dogecoin', [(5, 9000)]),
    ('ATOM', 'cosmos', 'Cosmos Hub', [(2, 380)]),
    ('XAU', 'pax-gold', 'Gold (24k)', [(30, 0.6), (4, 0.4)]),
    ('XAG', 'kinesis-silver', 'Silver (999)', [(15, 25)]),
]
def seed(pg):
    now = time.time()
    for sym, cid, name, buys in PORT:
        for i, (d, q) in enumerate(buys):
            date = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(now - d * 86400)); px = price_at(cid, d)
            if i == 0: pg.evaluate("([c, o]) => Samsam.addCoin({ ...c, cat: SamsamTaxonomy.defaultOf(c.sym) || 'other' }, o)", [{'sym': sym, 'name': name, 'cgId': cid}, {'qty': q, 'price': px, 'date': date}])
            else: pg.evaluate("([s, q, p, d]) => Samsam.addTx(s, 'buy', q, p, '', { date: d })", [sym, q, px, date])
            pg.wait_for_timeout(120)
    # the plan: targets for a few coins; exit levels; baseline 30 days back
    held = {s: sum(q for _, q in b) for s, _, _, b in PORT}
    since = time.strftime('%Y-%m-%d', time.gmtime(now - 20 * 86400))
    plan = [{'sym': 'BTC', 'targetQty': 0.5, 'dca': {'usd': 300, 'every': 'month', 'day': 1, 'since': since}}, {'sym': 'ETH', 'targetQty': 5}, {'sym': 'SOL', 'targetQty': 60, 'dca': {'usd': 50, 'every': 'week', 'day': 1, 'since': since}}, {'sym': 'LINK', 'targetQty': 170}, {'sym': 'SUI', 'targetQty': 4000}, {'sym': 'XAU', 'targetQty': 2}]
    pg.evaluate("p => Samsam.saveAccumPlan(p)", plan); pg.wait_for_timeout(300)
    ex = [{'sym': sy, 'tps': [{'price': round(price_at(cid, 0) * m, 2), 'pct': pc, 'lock': True} for m, pc in ((1.6, 25), (2.2, 50), (3.5, 25))]} for sy, cid in (('SOL', 'solana'), ('ETH', 'ethereum'), ('LINK', 'chainlink'), ('SUI', 'sui'))]
    pg.evaluate("p => Samsam.saveExit({ plan: p })", ex); pg.wait_for_timeout(300)
    base = time.strftime('%Y-%m-%d', time.gmtime(now - 30 * 86400))
    pg.evaluate("([d, p]) => Samsam.setBaseline({ date: d, btcPrice: p, source: 'demo' })", [base, price_at('bitcoin', 30)]); pg.wait_for_timeout(400)

def ready(pg, t=20):
    end = time.time() + t
    while time.time() < end:
        if pg.evaluate("!!(window.Samsam && Samsam.isReady())"): return
        pg.wait_for_timeout(150)
    raise TimeoutError('not ready')

VP = {'phone': dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=3), 'laptop': dict(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)}
def ctx_for(br, dev, lang):
    c = br.new_context(**VP[dev]); setup(c)
    c.add_init_script(f"try{{localStorage.setItem('samsam_theme','dark');localStorage.setItem('cp-lang','{lang}')}}catch(e){{}}")
    return c
if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'probe'
    with sync_playwright() as p:
        br = p.chromium.launch()
        if what == 'seed':
            urllib.request.urlopen(SRV + '/reset').read()
            c = ctx_for(br, 'laptop', 'en'); pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); ready(pg); pg.wait_for_timeout(1000)
            seed(pg); pg.wait_for_timeout(1500); pg.reload(); ready(pg); pg.wait_for_timeout(9000)
            print('coins', pg.evaluate("portfolio.length"), 'total', pg.evaluate("calcStats().total"), 'errs', errs[:3])
            print(pg.evaluate("portfolio.map(c => c.sym + ' ' + getAction(c.sym, 0, c) + ' ' + getCoinPct(c).toFixed(1)).join(' | ')"))
            pg.screenshot(path=str(OUT / '_probe_laptop.png')); c.close()
            c = ctx_for(br, 'phone', 'ar'); pg = c.new_page(); pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn', timeout=8000) if not pg.evaluate("!!(window.Samsam&&Samsam.isReady&&Samsam.isReady())") else None
            try: pg.click('#samsamSignInBtn', timeout=3000)
            except Exception: pass
            ready(pg); pg.wait_for_timeout(9000); print('lang', pg.evaluate("window.CPLang && CPLang.lang")); pg.screenshot(path=str(OUT / '_probe_phone_ar.png')); c.close()
        br.close()
