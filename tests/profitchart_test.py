"""Performance (cumulative) charts: blue = All Time Profit % at every point (holdings × price + sells − buys − fees,
÷ Cost Basis), orange = BTC trend since the baseline. A buy never counts as profit; the line ends on the card's numbers.
Same maths on the main page and Performance, with the formulas in the ⓘ."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SETUP = """(() => {
  const now = Date.now(), V = calcStats().total, B = btcPrice, c = portfolio.find(c => c.sym !== 'BTC' && c.currentPrice > 0), price = c.currentPrice;
  return Samsam.addTx(c.sym, 'buy', 5000 / price, price, 'chart test', { date: new Date(now - 2.5 * 3600e3).toISOString() }).then(() => {
    window.__snaps = [{ t: now - 3 * 3600e3, v: V, b: B }, { t: now - 2 * 3600e3, v: V + 5000, b: B }, { t: now - 1 * 3600e3, v: (V + 5000) * 1.10, b: B * 0.97 }];
    return { V, B };
  });
})()"""
def tri(n): return ('▲ ' if n >= 0 else '▼ ') + f'{abs(n):.2f}%'
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        info = pg.evaluate(SETUP); pg.wait_for_timeout(800)
        ser = pg.evaluate("(() => { const st = Samsam.getState(); return Samsam.core.perfChartSeries(window.__snaps, st.coins, st.transactions, { baselineBtc: baselineState.btcPrice }); })()")
        prof = ser['profit']; cost = ser['cost']
        check(f'{name}: a $5,000 buy adds nothing to All Time Profit ($)', abs(prof[1] - prof[0]) < 0.01, prof)
        check(f'{name}: …and adds $5,000 to Cost Basis', abs(cost[1] - cost[0] - 5000) < 0.01, cost)
        check(f'{name}: blue line = All Time Profit ÷ Cost Basis at every point', all(abs(pt['v'] - pr / c * 100) < 1e-6 for pt, pr, c in zip(ser['port'], prof, cost)), ser['port'])
        check(f'{name}: a +10% price move raises profit by 10% of the value', abs(prof[2] - prof[1] - (info['V'] + 5000) * 0.10) < 0.5, prof)
        # BTC benchmark: the same money in BTC — a buy adds nothing to it either; then BTC −3% moves it by −3% of the BTC held
        bp = ser['btcProfit']; v = [x['v'] for x in pg.evaluate("window.__snaps")]
        realized = [prof[i] - v[i] + cost[i] for i in range(3)]; inv = [cost[i] - realized[i] for i in range(3)]
        held = bp[1] + inv[1]   # value of the BTC benchmark at point 2 (in $)
        check(f'{name}: BTC benchmark — the buy adds nothing to its profit', abs(bp[1] - bp[0]) < 1.0, bp)
        check(f'{name}: BTC benchmark — BTC −3% takes 3% off the BTC it holds', abs((bp[2] - bp[1]) - held * -0.03) < 1.0, (bp, held))
        check(f'{name}: orange line = BTC benchmark profit ÷ Cost Basis', all(abs(b['v'] - x / c * 100) < 1e-6 for b, x, c in zip(ser['btc'], bp, cost)), ser['btc'])
        pg.evaluate("perfSnapsState = window.__snaps; holdingsRange = '24h'; drawPerfChart()"); pg.wait_for_timeout(300)
        leg = pg.evaluate("[document.getElementById('perfPortfolioLabel').textContent, document.getElementById('perfPortfolioPct').textContent, document.getElementById('perfBtcLabel').textContent, document.querySelector('#perfChartWrap .perf-legend').innerText, document.getElementById('totalPnlCard').textContent, document.getElementById('totalPnlSub').textContent, btcPrice, baselineState.btcPrice]")
        apct = pg.evaluate("allTimeProfitData().pct")
        check(f'{name}: legend All Time Profit = the card ($ and %)', leg[0].replace('−', '-') == leg[4] and leg[1] == tri(apct), leg[:2] + leg[4:6])
        last_btc = pg.evaluate("(() => { const st = Samsam.getState(); const live = { t: Date.now(), v: calcStats().total, b: btcPrice }; const s = Samsam.core.perfChartSeries(window.__snaps.concat([live]), st.coins, st.transactions, { baselineBtc: baselineState.btcPrice }); return s.btc[s.btc.length - 1].v; })()")
        check(f'{name}: legend BTC trend = the BTC benchmark now', leg[2] == tri(last_btc) and 'BTC Trend' in leg[3] and 'Profit 24h' not in leg[3], (leg, last_btc))
        check(f'{name}: main chart has the ⓘ', pg.query_selector('#perfChartWrap .cp-hint[data-hint="perfChart"]') is not None)
        pg.click('#perfChartWrap .cp-hint'); pg.wait_for_timeout(300)
        h = pg.inner_text('.cph') if pg.query_selector('.cph') else ''
        check(f'{name}: ⓘ shows the formulas (and does not open Performance)', 'Holdings × latest price + selling proceeds − buying costs − fees' in h and 'BTC bought with the same money' in h and 'index.html' in pg.url, (h[:80], pg.url))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.locator('#perfChartWrap').screenshot(path=str(SH / f'profitchart-main-{name}.png'))
        card_pct = pg.evaluate("allTimeProfitData().pct")
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2000)
        pl = pg.evaluate("[document.getElementById('pccPortUsd').textContent, document.getElementById('pccPort').textContent, document.getElementById('pccBtc').textContent, document.querySelector('.pcc-legend').innerText, document.getElementById('totalPnl').textContent, allTimeData.pct]")
        check(f'{name}: Performance legend = its All Time Profit card, with BTC trend', pl[1] == tri(pl[5]) and 'BTC Trend' in pl[3] and 'All Time Profit' in pl[3], pl)
        check(f'{name}: Performance chart has the same ⓘ', pg.query_selector('.cp-hint[data-hint="perfChart"]') is not None)
        pg.locator('#perfChartCard').screenshot(path=str(SH / f'profitchart-perf-{name}.png'))
        check(f'{name}: no page errors', not errs, errs)
        pg.evaluate("Promise.all(Samsam.getState().transactions.filter(t => t.note === 'chart test').map(t => Samsam.deleteTx(t.id)))"); pg.wait_for_timeout(500)
        ctx.close()
    br.close()
print(f'profitchart_test: {sum(res)}/{len(res)} passed')
