"""✨ Gold Trend line on the Portfolio vs BTC charts (Performance page and the main page): drawn once gold's
price history arrives (Binance PAXGUSDT, stubbed here), with its own legend value."""
import re, sys, pathlib, json, time
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
    w = pg.evaluate("[document.getElementById('pccPortName').textContent, document.getElementById('pccPort').textContent]")
    pg.click('#perfChartCard [data-sc="alt"]'); pg.wait_for_timeout(500)
    al = pg.evaluate("[document.getElementById('pccPortName').textContent, document.getElementById('pccPort').textContent, document.querySelector('#perfChartCard [data-sc=alt]').getAttribute('aria-pressed'), localStorage.getItem('samsam_perf_scope')]")
    check('Altcoins only: blue line renamed "Altcoins profit", its own %, remembered', w[0] == 'All Time Profit' and al[0] == 'Altcoins profit' and al[2] == 'true' and al[3] == 'alt' and '%' in al[1], [w, al])
    pg.locator('#perfChartCard').scroll_into_view_if_needed(); pg.screenshot(path=str(SH / 'gold-trend.png'))
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    h = pg.evaluate("[document.getElementById('perfGoldRow').hidden, document.getElementById('perfGoldLabel').textContent]")
    check('main page chart: Gold Trend legend too (kept history, no new request needed)', h[0] is False and '%' in h[1], h)
    hm = pg.evaluate("[document.querySelector('.perf-scope [data-sc=alt]').classList.contains('active'), document.getElementById('perfPortName').textContent]")
    check('main page: Altcoins only active too, legend says Altcoins profit', hm[0] and 'Altcoins profit' in hm[1], hm)
    # one switch, in both cards: on "Altcoins only" the Holdings card shows the altcoins' own value (no BTC, gold, silver)
    money = "t => +String(t).replace(/[^0-9.]/g, '')"
    hv = pg.evaluate(f"(() => {{ const m = {money}, ex = ['BTC','XAU','XAG'], alt = portfolio.filter(c => !isSoldOut(c) && !ex.includes(c.sym)).reduce((s, c) => s + c.qty * c.currentPrice, 0); return {{ rows: document.querySelectorAll('.perf-scope').length, both: [...document.querySelectorAll('.perf-scope [data-sc=alt]')].every(b => b.classList.contains('active')), inPerf: !!document.querySelector('#perfChartWrap .perf-scope'), shown: m(document.getElementById('holdingsTotal').textContent), alt, total: calcStats().total, chg: document.getElementById('holdingsChange').textContent, leg: document.getElementById('perfPortfolioPct').textContent }} }})()")
    check('main page: the switch is in both cards (Holdings and Portfolio Performance), both on Altcoins only', hv['rows'] == 2 and hv['both'] and hv['inPerf'], hv)
    check(f"main page: Holdings on Altcoins only shows the altcoins' value ({hv['shown']:.2f} = {hv['alt']:.2f}, whole {hv['total']:.2f})", abs(hv['shown'] - hv['alt']) < 0.02 and hv['alt'] < hv['total'] - 1, hv)
    pct = lambda t: (re.search(r'(\d+\.\d+)%', t) or [None, None])[1]
    check('…and its profit % is the Performance card\'s Altcoins profit %', pct(hv['chg']) is not None and pct(hv['chg']) == pct(hv['leg']), [hv['chg'], hv['leg']])
    pg.locator('#mainTrio').screenshot(path=str(SH / 'alt-scope-cards.png'))
    href1 = pg.url
    pg.click('#perfChartWrap .perf-scope [data-sc="all"]'); pg.wait_for_timeout(400)
    back = pg.evaluate(f"(() => {{ const m = {money}; return [m(document.getElementById('holdingsTotal').textContent), calcStats().total] }})()")
    check('main page: Whole portfolio again → Holdings shows the whole value', abs(back[0] - back[1]) < 0.02, back)
    check('main page: back to Whole portfolio without leaving the page', pg.url == href1 and 'All Time Profit' in pg.evaluate("document.getElementById('perfPortName').textContent"))
    hs = pg.evaluate("[document.getElementById('perfSilverLabel').textContent, document.querySelector('.perf-legend [data-tl=btc]').classList.contains('tl-off')]")
    check('main page follows the same choice: silver on, BTC off', '%' in hs[0] and hs[1], hs)
    href0 = pg.url
    pg.click('#perfSilverRow'); pg.wait_for_timeout(400)
    check('tapping a legend row on the main page toggles it and does not open the Performance page', pg.url == href0 and pg.evaluate("document.getElementById('perfSilverRow').classList.contains('tl-off')"), pg.url)
    check('no page errors', not errs, errs)
    br.close()
print(f'gold_trend_ui: {sum(res)}/{len(res)} passed')
