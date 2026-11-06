"""A wrong saved Holdings point (a device that valued coins without live prices) must not show on the chart,
and a device without fresh live prices must not save chart points at all."""
import sys, pathlib, json, time, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def commit(ops):
    req = urllib.request.Request('http://127.0.0.1:8787/commit', data=json.dumps({'ops': ops}).encode(), headers={'content-type': 'application/json'})
    urllib.request.urlopen(req).read()
M5 = 300_000
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    live = pg.evaluate("calcStats().total")
    # recorded points around the live total, then one wrong point +13% ten minutes ago
    now = int(time.time() * 1000); days = {}
    def put(t, v):
        d = time.strftime('%Y-%m-%d', time.gmtime(t / 1000)); days.setdefault(d, {'h': {}})['h'][str(t)] = {'t': t, 'v': round(v, 2)}
    for i in range(6, 0, -1): put((now - i * M5) // M5 * M5 - 7 * M5, live * (1 + 0.001 * i))
    spike_t = (now - 2 * M5) // M5 * M5; put(spike_t, live * 1.13)
    commit([{'op': 'set', 'path': f'users/uid_samir/snaps/{d}', 'data': v, 'merge': True} for d, v in days.items()])
    ok = None
    for _ in range(60):
        st = pg.evaluate("Samsam.getState().holdingsSnaps.map(s=>s.t)")
        if any(abs(t - (now - 3 * M5)) < 30 * M5 for t in st): ok = True; break
        pg.wait_for_timeout(100)
    pg.wait_for_timeout(500)
    snaps = pg.evaluate("Samsam.getState().holdingsSnaps")
    check('seeded points arrived', ok, len(snaps))
    check('the +13% point is left out of the chart data', not any(s['t'] == spike_t for s in snaps), [s for s in snaps if s['t'] == spike_t])
    check('the normal points around it stay', sum(1 for s in snaps if s['t'] > now - 3600_000) >= 5, len(snaps))
    hi = pg.evaluate("Math.max(...Samsam.getState().holdingsSnaps.filter(s=>s.t>Date.now()-864e5).map(s=>s.v))")
    check(f'chart top stays near the live total (max {hi:.0f} vs live {live:.0f})', hi < live * 1.05, (hi, live))
    check('header value = live total', pg.inner_text('#holdingsTotal').replace('$', '').replace(',', '') .startswith(str(int(live))[:3]), pg.inner_text('#holdingsTotal'))

    # a device whose live prices are old (or missing) does not save a chart point
    def bucket_written(t):
        return pg.evaluate(f"""(() => {{ const t={t}; const k=String(Math.floor(t/{M5})*{M5}); return Samsam.getState().holdingsSnaps.some(s=>Math.floor(s.t/{M5})*{M5}==k); }})()""")
    pg.evaluate("(() => { const P = Samsam.getPrices(); for (const k in P) P[k].t = Date.now() - 3600e3; })()")
    t1 = int(time.time() * 1000) + 3 * M5
    pg.evaluate(f"Samsam.recordSnapshot('holdings', {t1}, 12345)"); pg.wait_for_timeout(800)
    check('old prices (1 h): no chart point saved', not bucket_written(t1))
    pg.evaluate("(() => { const P = Samsam.getPrices(); for (const k in P) P[k].t = Date.now(); })()")
    t2 = int(time.time() * 1000) + 6 * M5
    pg.evaluate(f"Samsam.recordSnapshot('holdings', {t2}, {live})"); pg.wait_for_timeout(1200)
    check('fresh prices: the point is saved', bucket_written(t2))
    check('no JS errors', not errs, errs[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
