"""Best / worst performer: main page = 24h (follows the category filter), Performance = since purchase ($ · %) and vs BTC.
Coins worth < $1 or < 0.1% of the portfolio are ignored."""
import sys, pathlib, json, re, zlib, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def ch(i): return ((zlib.crc32(i.encode()) % 4000) / 100.0) - 20   # deterministic −20…+20 % per coin
def price_route(route):
    ids = re.search(r'ids=([^&]+)', route.request.url); data = {}
    if ids:
        for i in urllib.request.unquote(ids.group(1)).split(','):
            data[i] = {'usd': 100000.0 if i == 'bitcoin' else (0.5 if i == 'vethor-token' else 2.0), 'usd_24h_change': 95.0 if i == 'tinycoin-x' else ch(i)}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(data))
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); ctx.route('https://api.coingecko.com/api/v3/simple/price**', price_route); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        if name == 'mobile':   # a tiny holding with a huge move must not win
            pg.evaluate("Samsam.addCoin({ sym: 'TINYX', name: 'Tiny', cgId: 'tinycoin-x', cat: 'meme', catLocked: true }, { qty: 0.1, price: 2 })"); pg.wait_for_timeout(500)
            pg.evaluate("fetchLivePrices()"); pg.wait_for_timeout(1500)
        exp = pg.evaluate("""(() => { const tot = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0), min = Math.max(1, tot * 0.001);
            const ok = portfolio.filter(c => typeof c.change24h === 'number' && c.qty * c.currentPrice >= min).sort((a, b) => b.change24h - a.change24h);
            return { best: ok[0].sym, worst: ok[ok.length - 1].sym, bp: ok[0].change24h, wp: ok[ok.length - 1].change24h, tinyIn: portfolio.some(c => c.sym === 'TINYX') }; })()""")
        got = pg.evaluate("[...document.querySelectorAll('#moversCard .mv-half')].map(h => [h.querySelector('.mv-sym') && h.querySelector('.mv-sym').innerText, h.querySelector('.mv-val') && h.querySelector('.mv-val').innerText, h.querySelector('.mv-label').innerText])")
        check(f'{name}: main card shows 24h best + worst', got[0][0] == exp['best'] and got[1][0] == exp['worst'], (got, exp))
        check(f'{name}: values signed with %, card labelled 24h', got[0][1].startswith(('+', '−')) and '24h' in pg.inner_text('#moversCard .mv-head') and got[0][1].replace('−', '-').startswith(('%+.2f' % exp['bp'])[:3]), (got[0][1], exp['bp']))
        if name == 'mobile': check('mobile: a $0.20 coin up 95% is ignored', exp['tinyIn'] and got[0][0] != 'TINYX', got)
        col = pg.evaluate("[getComputedStyle(document.querySelector('#moversCard .mv-val.up, #moversCard .mv-val.down')).color]")
        check(f'{name}: green/red by direction', col[0] in ('rgb(52, 211, 153)', 'rgb(248, 113, 113)'), col)
        pg.locator('#moversCard').screenshot(path=str(T / f'movers-main-{name}.png'))
        fit = pg.evaluate("(() => { const c = document.querySelector('#moversCard .mv-card'); return c.scrollWidth <= c.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1; })()")
        check(f'{name}: fits without overflow', fit)
        # follows the category filter
        pg.evaluate("setCatFilter('layer2', true)"); pg.wait_for_timeout(300)
        exp2 = pg.evaluate("""(() => { const tot = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0), min = Math.max(1, tot * 0.001);
            const ok = portfolio.filter(c => c.cat === 'layer2' && typeof c.change24h === 'number' && c.qty * c.currentPrice >= min).sort((a, b) => b.change24h - a.change24h);
            return [ok[0] && ok[0].sym, ok.length > 1 ? ok[ok.length - 1].sym : null]; })()""")
        got2 = pg.evaluate("[...document.querySelectorAll('#moversCard .mv-half')].map(h => [(h.querySelector('.mv-sym') || {}).innerText || null, h.querySelector('.mv-label').innerText])")
        check(f'{name}: category filter (Layer 2) → best/worst inside it', [g[0] for g in got2] == exp2 and 'Layer 2' in pg.inner_text('#moversCard .mv-head'), (got2, exp2))
        pg.evaluate("setCatFilter('', true)"); pg.wait_for_timeout(200)
        pg.click('#moversCard .mv-half >> nth=0'); pg.wait_for_timeout(600)
        check(f'{name}: tapping the coin opens its transactions', pg.evaluate("location.hash") == '#holdings/' + exp['best'], pg.evaluate("location.hash"))
        pg.evaluate("history.back()"); pg.wait_for_timeout(300); pg.evaluate("history.back()"); pg.wait_for_timeout(300)
        # performance page
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
        e = pg.evaluate("""(() => { const tot = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0), min = Math.max(1, tot * 0.001);
            const rows = portfolio.filter(c => c.qty * c.basePrice > 0 && c.qty * c.currentPrice >= min).map(c => ({ sym: c.sym, pct: (c.currentPrice / c.basePrice - 1) * 100, pnl: c.qty * (c.currentPrice - c.basePrice) }));
            rows.sort((a, b) => b.pct - a.pct);
            const btc = portfolio.find(c => c.sym === 'BTC').currentPrice, bp = (btc / 81162 - 1) * 100;
            const vs = rows.filter(r => r.sym !== 'BTC').map(r => ({ sym: r.sym, s: r.pct - bp })).sort((a, b) => b.s - a.s);
            return { best: rows[0].sym, worst: rows[rows.length - 1].sym, bpnl: rows[0].pnl, vb: vs[0].sym, vw: vs[vs.length - 1].sym }; })()""")
        G = "[...document.querySelectorAll('#moversOne .mv-half')].map(h => [(h.querySelector('.mv-sym') || {}).innerText, (h.querySelector('.mv-val') || {}).innerText, (h.querySelector('.mv-sub') || {}).innerText || ''])"
        pg.click('#mvUsd'); pg.wait_for_timeout(250); g = pg.evaluate(G)
        eu = pg.evaluate("(() => { const tot = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0), min = Math.max(1, tot * 0.001); const r = portfolio.filter(c => c.qty * c.basePrice > 0 && c.qty * c.currentPrice >= min).map(c => [c.sym, c.qty * (c.currentPrice - c.basePrice) + ((calcRealizedPnl().bySym[c.sym] || {}).realized || 0)]).sort((a, b) => b[1] - a[1]); return [r[0][0], r[r.length - 1][0]]; })()")
        check(f'{name}: Top & Bottom · USD = best / worst by All Time Profit $', [g[0][0], g[1][0]] == eu, (g[:2], eu))
        check(f'{name}: shown as "+$X • +Y%"', re.match(r'^[+−]\$[\d,]+\.\d\d\s*• [+−][\d.]+%$', g[0][1]), g[0][1])
        pg.click('#mvBtc'); pg.wait_for_timeout(250); g = g + pg.evaluate(G)
        hb = pg.evaluate("[...document.querySelectorAll('#moversOne .mv-head, #moversOne .btc-compare-subtext')].map(e => e.innerText.replace(/\\s+/g, ' ').trim())")
        check(f'{name}: one card "Top Performers" with USD | vs BTC; vs BTC shows "Coin: … | BTC Benchmark: …"', hb[0].startswith('Top Performers') and pg.locator('#moversPerf .mv-card').count() == 1 and re.match(r'^Coin: [+−][\d.]+%( \|)? BTC Benchmark: [+−][\d.]+%$', hb[1]), hb)
        vsx = pg.evaluate("(() => { const st = Samsam.getState(), prices = {}; portfolio.forEach(c => prices[c.sym] = c.currentPrice); const btc = portfolio.find(c => c.sym === 'BTC').currentPrice; const tot = portfolio.reduce((s, c) => s + c.qty * c.currentPrice, 0), min = Math.max(1, tot * 0.001); const v = Samsam.core.vsBtcByCoin(st.coins, st.transactions, { prices, btcNow: btc, btcAt: Samsam.core.btcPriceLookup(st.perfSnaps), baselineBtc: Samsam.getBaseline().btcPrice }); const r = portfolio.filter(c => c.sym !== 'BTC' && v[c.sym] && c.qty * c.currentPrice >= min).map(c => [c.sym, v[c.sym].pct]).sort((a, b) => b[1] - a[1]); return [r[0][0], r[r.length - 1][0]]; })()")
        check(f'{name}: vs BTC best / worst = same-money-in-BTC ranking (BTC itself excluded)', [g[2][0], g[3][0]] == vsx and 'BTC' not in (g[2][0], g[3][0]) and 'vs BTC' in g[2][1], (g[2:], vsx))
        pg.locator('#moversPerf').screenshot(path=str(T / f'movers-perf-{name}.png'))
        check(f'{name}: performance page no overflow (cards too)', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll('#moversPerf .mv-half')].every(h => h.scrollWidth <= h.clientWidth + 1)"))
        best_btc = g[2][0]; pg.click('#moversOne .mv-half >> nth=0'); pg.wait_for_url('**/index.html#holdings/*', timeout=8000)
        check(f'{name}: tapping opens that coin on the main page', pg.url.endswith('#holdings/' + best_btc), pg.url)
        check(f'{name}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
