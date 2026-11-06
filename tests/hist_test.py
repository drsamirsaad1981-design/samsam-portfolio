"""Charts rebuilt from the ledger × real hourly prices (like CoinMarketCap):
starts on Oct 15 (not when the app was first opened), one point per hour with no gaps, value = Σ amount held × that
hour's price, the BTC benchmark uses the real BTC price of each hour, a bad recorded point no longer shows,
a Buy shows up at its own hour, prices are cached on the device (no second download), and every chart uses it."""
import sys, pathlib, json, re, math, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
START = 1792022400000   # 2026-10-15T00:00:00Z
calls = []; refused = []
def chart_route(route):
    m = re.search(r'/coins/([^/]+)/market_chart\?.*days=(\d+)', route.request.url)
    cid, days = m.group(1), int(m.group(2))
    if cid == 'bitcoin' and len(refused) < 2:   # CoinGecko busy: twice "429" (once without CORS → network error)
        refused.append(cid)
        if len(refused) == 1: route.fulfill(status=429, body='busy', headers={'access-control-allow-origin': '*'})
        else: route.abort()
        return
    calls.append((cid, days))
    now = int(time.time() * 1000); t0 = now - days * 864e5
    base = 100000.0 if cid == 'bitcoin' else 2.0
    pts, t = [], int(t0 // 3600e3 * 3600e3)
    while t <= now:
        pts.append([t, base * (1 + 0.05 * math.sin(t / 2.5e7))]); t += 3600e3
    pts.append([now, base])   # the latest point = today's live price used elsewhere in the tests
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'prices': pts}), headers={'access-control-allow-origin': '*'})
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    ctx.route(re.compile(r'https://api\.coingecko\.com/api/v3/coins/[^/]+/market_chart.*'), chart_route)
    ctx.add_init_script("window.__histGap = 300; window.__histBackoff = 1500")
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    # a bad recorded point (the kind that made the −15% drop) — must not show once history is in
    pg.evaluate("Samsam.recordSnapshot('perf', Date.now() - 3 * 3600e3, 5, 100000)")
    notes = set()
    for _ in range(120):
        pg.wait_for_timeout(500)
        notes.add(pg.evaluate("(() => { const n = document.querySelector('[data-hist-note]'); return n && !n.hidden ? n.textContent : ''; })()"))
        if pg.evaluate("(() => { const h = Samsam.getState().holdingsSnaps; return h.length > 100 && h[0].t <= " + str(START + 3600e3) + "; })()"): break
    st = pg.evaluate("(() => { const s = Samsam.getState(); return { h: s.holdingsSnaps.map(x => [x.t, x.v]), p: s.perfSnaps.map(x => [x.t, x.v, x.b]) }; })()")
    h, pf = st['h'], st['p']
    ids = sorted({c for c, d in calls})
    check('while it builds, the charts say so (with progress)', any(re.search(r'Building charts from real prices… \d+ / \d+ coins', n) for n in notes), sorted(notes)[:5])
    check('CoinGecko busy (429 / refused) → waits and tries again, BTC still arrives', len(refused) == 2 and 'bitcoin' in ids and any('busy' in n for n in notes), (refused, sorted(notes)[:6]))
    check('when done the progress line goes away', pg.evaluate("[...document.querySelectorAll('[data-hist-note]')].every(n => n.hidden)"))
    check('every coin\'s price history is fetched once (plus BTC)', 'bitcoin' in ids and len(calls) == len(ids), calls[:30])
    check('chart history starts on Oct 15 00:00 UTC (not when the app was opened)', h and h[0][0] == START, h[:2])
    gaps = [b[0] - a[0] for a, b in zip(h, h[1:]) if b[0] - a[0] > 3600e3 + 1]
    check('one point every hour, no gaps', len(h) > 200 and not gaps, gaps[:5])
    # value check at 3 hours against an independent sum
    chk = pg.evaluate("""(() => { const st = Samsam.getState(), H = Samsam.getState().holdingsSnaps, out = [];
      const price = (sym, t) => { const base = sym === 'BTC' ? 100000 : 2; return base * (1 + 0.05 * Math.sin(t / 2.5e7)); };
      for (const i of [5, Math.floor(H.length / 2), H.length - 3]) { const t = H[i].t; let v = 0;
        for (const c of st.coins) { if (c.removed && c.removedAt && t >= Date.parse(c.removedAt)) continue;
          const own = st.transactions.filter(x => x.sym === c.sym && Date.parse(x.date) <= t);
          const q = Samsam.core.replay(c.opening, own).qty; const id = c.cgId || (SamsamCoins.CG_IDS || {})[c.sym]; if (!q) continue;
          const live = (st.portfolio.find(p => p.sym === c.sym) || {}).currentPrice;
          v += q * (id || c.sym === 'BTC' ? price(c.sym, t) : (live || c.lastPrice || 0)); }
        out.push([t, H[i].v, v]); }
      return out; })()""")
    check('value at each hour = Σ amount held × that hour\'s price', all(abs(a - b) <= 1e-6 * max(1, b) for _, a, b in chk), chk)
    check('BTC benchmark uses that hour\'s real BTC price', all(abs(b - 100000 * (1 + 0.05 * math.sin(t / 2.5e7))) < 1e-6 for t, v, b in pf[:-1] if t <= h[-1][0]), pf[:3])
    check('the bad recorded point is gone (history replaces it)', all(v > 100 for t, v, b in pf), [x for x in pf if x[1] <= 100][:3])
    # a Buy two days ago appears at its own hour
    pg.evaluate("Samsam.addTx('SOL', 'buy', 100, 2, 'hist test', { date: new Date(Date.now() - 2 * 864e5 - 1800e3).toISOString() })"); pg.wait_for_timeout(1200)
    h2 = pg.evaluate("Samsam.getState().holdingsSnaps.map(x => [x.t, x.v])")
    tb = int(time.time() * 1000 - 2 * 864e5 - 1800e3)
    old = dict(h); new = dict(h2)
    tb_prev = max(t for t in new if t < tb); tb_next = min(t for t in new if t >= tb)
    sol = 2 * (1 + 0.05 * math.sin(tb_next / 2.5e7))
    check('a back-dated Buy changes the chart from its own hour on (not before)', abs(new[tb_prev] - old[tb_prev]) < 1e-6 and abs((new[tb_next] - old[tb_next]) - 100 * sol) < 1e-6, (new[tb_prev] - old[tb_prev], new[tb_next] - old[tb_next], 100 * sol))
    n_calls = len(calls)
    pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(2500)
    check('after a reload the prices come from the device cache (no new downloads)', len(calls) == n_calls and pg.evaluate("Samsam.getState().holdingsSnaps[0].t") == START, (n_calls, len(calls)))
    # charts
    pg.evaluate("document.querySelector('#holdingsTabs [data-range=\"all\"], .hold-tabs [data-r=\"all\"]') && 0"); pg.wait_for_timeout(200)
    pg.evaluate("scrollTo(0, 500)"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(SH / 'hist-main.png'))
    pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    first = pg.evaluate("perfSnaps.length ? perfSnaps[0].t : 0")
    check('Performance page uses the same history (starts Oct 15)', first == START, first)
    pg.screenshot(path=str(SH / 'hist-perf.png'), full_page=False)
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
    pg.evaluate("Samsam.getState().transactions.filter(t => t.note === 'hist test').forEach(t => Samsam.deleteTx ? Samsam.deleteTx(t.id) : 0)"); pg.wait_for_timeout(500)
    check('no page errors', not errs, errs)
    br.close()
print(f'hist_test: {sum(res)}/{len(res)} passed')
