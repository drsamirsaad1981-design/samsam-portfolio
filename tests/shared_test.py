"""Charts from the shared hourly price files (prices branch, written by the hourly GitHub job):
instant — no CoinGecko history requests, no "Building charts…" line — start on Oct 15, value = Σ amount × that hour's
price; a coin the shared files don't have yet is fetched from CoinGecko directly; the "Beating / Behind BTC" line is gone from both."""
import sys, pathlib, json, re, math, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
START, H = 1792022400000, 3600000
def price(cid, t): return (100000.0 if cid == 'bitcoin' else 2.0) * (1 + 0.05 * math.sin(t / 2.5e7))
src = (pathlib.Path(__file__).resolve().parent.parent / 'samsam-coins.js').read_text()
IDS = set(re.findall(r'"[^"]+"\s*:\s*"([a-z0-9-]+)"', re.search(r'var CG_IDS = \{([\s\S]*?)\};', src).group(1))) | {'bitcoin', 'test-coin', 'readd-a', 'readd-b'}
fetched, direct = [], []
def shared(route):
    url = route.request.url; fetched.append(url)
    if '/p/' not in url: route.fulfill(status=404, body='nope', headers={'access-control-allow-origin': '*'}); return   # e.g. the market snapshot (m/market.json) — not part of this test
    now_h = int(time.time() * 1000 // H * H)
    if '/p/index.json' in url:
        body = {'updated': '', 'step': H, 'coins': {i: [START, now_h] for i in IDS}}
    else:
        cid = re.search(r'/p/([^/?]+)\.json', url).group(1)
        if cid not in IDS: route.fulfill(status=404, body='nope'); return
        body = {'id': cid, 't0': START, 'step': H, 'p': [round(price(cid, t), 8) for t in range(START, now_h + 1, H)]}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(body), headers={'access-control-allow-origin': '*'})
def chart_route(route):
    m = re.search(r'/coins/([^/]+)/market_chart\?.*days=(\d+)', route.request.url); cid, days = m.group(1), int(m.group(2)); direct.append(cid)
    now = int(time.time() * 1000); pts = [[t, price(cid, t)] for t in range(int((now - days * 864e5) // H * H), now, H)]
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'prices': pts}), headers={'access-control-allow-origin': '*'})
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    ctx.add_init_script("window.__sharedPrices = 'https://raw.githubusercontent.com/drsamirsaad1981-design/samsam-portfolio/prices/p/'; window.__histGap = 200; window.__histBackoff = 500")
    ctx.route('https://raw.githubusercontent.com/**', shared)
    ctx.route(re.compile(r'https://api\.coingecko\.com/api/v3/coins/[^/]+/market_chart.*'), chart_route)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    t0 = time.time()
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    notes = set(); ok = False
    for _ in range(40):
        pg.wait_for_timeout(250)
        notes.add(pg.evaluate("(() => { const n = document.querySelector('[data-hist-note]'); return n && !n.hidden ? n.textContent : ''; })()"))
        if pg.evaluate(f"Samsam.getState().holdingsSnaps.length > 100 && Samsam.getState().holdingsSnaps[0].t === {START}"): ok = True; break
    took = time.time() - t0
    check(f'history from the shared files in a few seconds ({took:.1f}s)', ok and took < 12, took)
    check('no CoinGecko history requests for coins in the shared files, no "Building charts" line', not [d for d in direct if d in IDS] and (notes <= {''} or direct), (direct[:8], notes))
    check('read the index and one file per coin', any('index.json' in u for u in fetched) and sum('index.json' not in u for u in fetched) >= 10, len(fetched))
    chk = pg.evaluate("""(() => { const st = Samsam.getState(), H = st.holdingsSnaps, out = [];
      const price = (id, t) => (id === 'bitcoin' ? 100000 : 2) * (1 + 0.05 * Math.sin(t / 2.5e7));
      const hourly = H.map((x, i) => i).filter(i => H[i].t % 3600e3 === 0);
      for (const i of [hourly[3], hourly[Math.floor(hourly.length / 2)], hourly[hourly.length - 2]]) { const t = H[i].t; let v = 0;
        for (const c of st.coins) { if (c.removed && c.removedAt && t >= Date.parse(c.removedAt)) continue;
          const q = Samsam.core.replay(c.opening, st.transactions.filter(x => x.sym === c.sym && Date.parse(x.date) <= t)).qty; if (!q) continue;
          const id = c.sym === 'BTC' ? 'bitcoin' : (c.cgId || (SamsamCoins.CG_IDS || {})[c.sym]);
          const live = (st.portfolio.find(p => p.sym === c.sym) || {}).currentPrice;
          v += q * (id ? price(id, Math.floor(t / 3600e3) * 3600e3) : (live || c.lastPrice || 0)); }
        out.push([t, H[i].v, v]); }
      return out; })()""")
    check('value at each hour = Σ amount × that hour\'s shared price', all(abs(a - b) <= 1e-6 * max(1, b) for _, a, b in chk), chk)
    # a coin the shared files don't have → fetched directly
    pg.evaluate("openAddCoin(); acSym.value='SHX'; acName.value='Shared Missing'; acCgId.value='shared-missing'; acQty.value='3'; acPrice.value='2'; applyAddCoin()")
    for _ in range(40):
        pg.wait_for_timeout(250)
        if 'shared-missing' in direct and pg.evaluate("Samsam.getState().holdingsSnaps[0].t") == START: break
    check('a coin missing from the shared files is fetched from CoinGecko directly (and nothing that the shared files have)', 'shared-missing' in direct and not [d for d in direct if d in IDS], direct)
    pg.wait_for_timeout(800)
    check('…and the charts keep starting on Oct 15', pg.evaluate("Samsam.getState().holdingsSnaps[0].t") == START)
    pg.evaluate("Samsam.removeCoin('SHX')"); pg.wait_for_timeout(600)
    check('main card: no "Beating / Behind BTC" line (removed)', not pg.query_selector('#perfVsLabel') and 'BTC by' not in pg.inner_text('#perfChartWrap'))
    pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    check('…nor on the Performance page chart', not pg.query_selector('#pccVs') and 'BTC by' not in pg.inner_text('body'))
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    b = pg.locator('#perfChartCanvas').bounding_box(); pg.evaluate(f"scrollTo(0, {b['y']} - 160)"); pg.wait_for_timeout(400)
    pg.screenshot(path=str(SH / 'shared-main.png'))
    check('no page errors', not errs, errs)
    br.close()
print(f'shared_test: {sum(res)}/{len(res)} passed')
