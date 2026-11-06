"""Your case: a transaction dated before Oct 15 must not make the app ignore the shared files (charts still from
Oct 15, no CoinGecko history requests, no "Building charts" line); and when the shared files are a few hours behind,
the newest hours come from ONE request for all coins (markets + sparkline)."""
import sys, pathlib, json, re, math, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
START, H = 1792022400000, 3600000
def price(cid, t): return (100000.0 if cid == 'bitcoin' else 2.0) * (1 + 0.05 * math.sin(t / 2.5e7))
LAG = 0; IDS = set(); UNKNOWN = set()
direct, markets = [], []
def shared(route):
    url = route.request.url; end = int(time.time() * 1000 // H * H) - LAG * H
    if '/p/' not in url: route.fulfill(status=404, body='nope', headers={'access-control-allow-origin': '*'}); return   # e.g. the market snapshot (m/market.json) — not part of this test
    if '/p/index.json' in url: body = {'coins': {i: [START, end] for i in IDS if i not in UNKNOWN}, 'unknown': sorted(UNKNOWN)}
    else:
        cid = re.search(r'/p/([^/?]+)\.json', url).group(1)
        body = {'id': cid, 't0': START, 'step': H, 'p': [round(price(cid, t), 8) for t in range(START, end + 1, H)]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers={'access-control-allow-origin': '*'})
def chart_route(route):
    direct.append(re.search(r'/coins/([^/]+)/market_chart', route.request.url).group(1)); route.fulfill(status=429, body='busy', headers={'access-control-allow-origin': '*'})
def markets_route(route):
    ids = re.search(r'ids=([^&]+)', route.request.url).group(1).split(','); markets.append(len(ids)); now = int(time.time() * 1000)
    rows = [{'id': i, 'current_price': price(i, now), 'last_updated': time.strftime('%Y-%m-%dT%H:%M:%S.000Z', time.gmtime(now / 1000)),
             'sparkline_in_7d': {'price': [price(i, now - (167 - j) * H) for j in range(168)]}} for i in ids]
    route.fulfill(status=200, content_type='application/json', body=json.dumps(rows), headers={'access-control-allow-origin': '*'})
with sync_playwright() as p:
    br = p.chromium.launch()
    def run(lag):
        global LAG; LAG = lag; direct.clear(); markets.clear()
        ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
        ctx.add_init_script("window.__sharedPrices = 'https://raw.githubusercontent.com/o/r/prices/p/'; window.__histGap = 200; window.__histBackoff = 500;")
        ctx.route('https://raw.githubusercontent.com/**', shared)
        ctx.route(re.compile(r'https://api\.coingecko\.com/api/v3/coins/[^/]+/market_chart.*'), chart_route)
        ctx.route('https://api.coingecko.com/api/v3/coins/markets?*sparkline=true*', markets_route)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
        return ctx, pg, errs
    ctx, pg, errs = run(0)
    IDS.update(pg.evaluate("['bitcoin', ...Samsam.getState().coins.map(c => c.cgId || (SamsamCoins.CG_IDS || {})[c.sym]).filter(Boolean)]"))
    pg.evaluate("Samsam.addTx('SOL', 'buy', 1, 2, 'before oct 15', { date: '2026-10-10T08:00:00.000Z' })"); pg.wait_for_timeout(800)
    ctx.close()
    ctx, pg, errs = run(0)
    notes = set()
    for _ in range(30):
        pg.wait_for_timeout(300)
        notes.add(pg.evaluate("(() => { const n = document.querySelector('[data-hist-note]'); return n && !n.hidden ? n.textContent : ''; })()"))
        if pg.evaluate(f"Samsam.getState().holdingsSnaps.length > 100 && Samsam.getState().holdingsSnaps[0].t === {START}"): break
    check('a transaction before Oct 15: charts still start Oct 15 from the shared files', pg.evaluate("Samsam.getState().holdingsSnaps[0].t") == START)
    check('…no CoinGecko history requests and no "Building charts" line', not direct and notes <= {''}, (direct[:5], notes))
    ctx.close()
    # your PONS case: a coin whose id the shared files list as unknown, and one that has to come from CoinGecko
    UNKNOWN.add('zz-unknown')
    ctx, pg, errs = run(0)
    pg.evaluate("openAddCoin(); acSym.value='ZZU'; acName.value='Unknown Id'; acCgId.value='zz-unknown'; acQty.value='1'; acPrice.value='2'; applyAddCoin()")
    pg.evaluate("openAddCoin(); acSym.value='ZZD'; acName.value='Direct Id'; acCgId.value='zz-direct'; acQty.value='1'; acPrice.value='2'; applyAddCoin()")
    pg.wait_for_timeout(1000); ctx.close(); direct.clear()
    ctx, pg, errs = run(0)
    notes = set(); t0 = time.time()
    for _ in range(30):
        pg.wait_for_timeout(250)
        notes.add(pg.evaluate("(() => { const n = document.querySelector('[data-hist-note]'); return n && !n.hidden ? n.textContent : ''; })()"))
        if pg.evaluate(f"Samsam.getState().holdingsSnaps.length > 100 && Samsam.getState().holdingsSnaps[0].t === {START}"): break
    took = time.time() - t0
    check('a coin listed as unknown is never asked for; charts don\'t wait for the coin fetched directly', 'zz-unknown' not in direct and took < 5 and notes <= {''}, (direct, round(took, 1), notes))
    pg.wait_for_timeout(1500)
    check('the coin that has to come from CoinGecko is still fetched in the background', 'zz-direct' in direct, direct)
    pg.evaluate("Samsam.removeCoin('ZZU'); Samsam.removeCoin('ZZD')"); pg.wait_for_timeout(500); ctx.close()
    ctx, pg, errs = run(4)   # shared files 4 hours behind
    for _ in range(30):
        pg.wait_for_timeout(300)
        if markets and pg.evaluate("Samsam.getState().holdingsSnaps.length > 100 && Date.now() - Samsam.getState().holdingsSnaps.at(-1).t < 2 * 3600e3"): break
    last = pg.evaluate("Date.now() - Samsam.getState().holdingsSnaps.at(-1).t")
    check('shared files 4 h behind: ONE request for all coins fills the newest hours', len(markets) == 1 and markets[0] > 5 and not [d for d in direct if d in IDS and d not in UNKNOWN], (markets, direct[:5]))
    check('…and the charts reach the last hour', last < 2 * H, last / H)
    pg.evaluate("Samsam.getState().transactions.filter(t => t.note === 'before oct 15').forEach(t => Samsam.deleteTx && Samsam.deleteTx(t.id))")
    check('no page errors', not errs, errs)
    br.close()
print(f'shared2_test: {sum(res)}/{len(res)} passed')
