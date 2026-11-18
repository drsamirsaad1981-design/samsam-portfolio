"""✨ Gold Trend line on the Portfolio vs BTC charts (Performance page and the main page): drawn once gold's
price history arrives (Binance PAXGUSDT, stubbed here), with its own legend value."""
import sys, pathlib, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
now = int(time.time() * 1000)
K = [[t, '0', '0', '0', str(3800 + (t - now) / 864e5 * 5), '0'] for t in range(now - 60 * 864_00_000 // 1000 * 1000, now, 3600_000)]
hits = []
def kl(route): hits.append(route.request.url); route.fulfill(status=200, content_type='application/json', body=json.dumps(K))
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx); errs = []
    ctx.route('**/api/v3/klines**', kl)
    SV = {'prices': [[t, 30 + (t - now) / 864e5 * 0.1] for t in range(now - 60 * 86400000, now, 3600000)]}
    cg = []
    ctx.route('**/coins/kinesis-silver/market_chart**', lambda r: (cg.append(r.request.url), r.fulfill(status=200, content_type='application/json', body=json.dumps(SV))))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    # a gold history saved earlier that only covers the last 2 days (the chart starts weeks ago) → asked again, line drawn
    pg.evaluate(f"localStorage.setItem('samsam_gold_hist', JSON.stringify({{ at: Date.now(), list: [[{now} - 2*864e5, 3900], [{now}, 3950]] }}))")
    pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(3000)
    g = pg.evaluate("[document.getElementById('pccGoldRow').hidden, document.getElementById('pccGold').textContent]")
    check('Performance: Gold Trend legend shown with a value', g[0] is False and '%' in g[1], g)
    check('gold history asked once from Binance PAXGUSDT', len(hits) >= 1 and 'PAXGUSDT' in hits[0], hits)
    sv0 = pg.evaluate("[document.getElementById('pccSilverRow').classList.contains('off'), document.getElementById('pccSilver').textContent]")
    check('Silver Trend off at first (row dimmed, no request)', sv0[0] and not cg, [sv0, cg])
    pg.click('#pccSilverRow'); pg.wait_for_timeout(2000)
    sv1 = pg.evaluate("[document.getElementById('pccSilverRow').classList.contains('off'), document.getElementById('pccSilver').textContent, JSON.parse(localStorage.getItem('samsam_trend_lines'))]")
    check('tap Silver Trend → on, silver prices from CoinGecko (KAG), value shown, remembered', not sv1[0] and '%' in sv1[1] and cg and sv1[2]['silver'] is True, [sv1, cg])
    pg.click('[data-tl="btc"]'); pg.wait_for_timeout(300)
    check('tap BTC Trend → hidden (row dimmed)', pg.evaluate("document.querySelector('#perfChartCard [data-tl=btc]').classList.contains('off')"))
    pg.locator('#perfChartCard').scroll_into_view_if_needed(); pg.screenshot(path=str(SH / 'gold-trend.png'))
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    h = pg.evaluate("[document.getElementById('perfGoldRow').hidden, document.getElementById('perfGoldLabel').textContent]")
    check('main page chart: Gold Trend legend too (kept history, no new request needed)', h[0] is False and '%' in h[1], h)
    hs = pg.evaluate("[document.getElementById('perfSilverLabel').textContent, document.querySelector('.perf-legend [data-tl=btc]').classList.contains('tl-off')]")
    check('main page follows the same choice: silver on, BTC off', '%' in hs[0] and hs[1], hs)
    href0 = pg.url
    pg.click('#perfSilverRow'); pg.wait_for_timeout(400)
    check('tapping a legend row on the main page toggles it and does not open the Performance page', pg.url == href0 and pg.evaluate("document.getElementById('perfSilverRow').classList.contains('tl-off')"), pg.url)
    check('no page errors', not errs, errs)
    br.close()
print(f'gold_trend_ui: {sum(res)}/{len(res)} passed')
