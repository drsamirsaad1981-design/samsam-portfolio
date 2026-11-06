"""Cross-checks that every number agrees with every other one:
BTC vs BTC is 0 everywhere; the BTC trend line equals the All Time Profit line for a BTC-only history; Portfolio vs BTC
on the main page = VS Bitcoin on Performance; the baseline only moves coins held on that date; the Holdings change splits
price gain from money added; All Time Profit card = details sheet = chart legend."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    # 1. BTC vs BTC
    v = pg.evaluate("getPerf(portfolio.find(c => c.sym === 'BTC'))")
    check('main page: BTC Portfolio vs BTC = 0', abs(v) < 1e-9, v)
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
    card = pg.evaluate("(() => { const c = [...document.querySelectorAll('#coinsStack .coin-card')].find(c => /^BTC/.test(c.querySelector('.ast-sym').textContent)); return c && [...c.querySelectorAll('.coin-metric')].map(m => m.innerText.replace(/\\s+/g, ' ')).find(t => /VS BTC/i.test(t)); })()")
    check('cards no longer show Portfolio vs BTC (it lives on the Performance page)', card is None, card)
    # 2. BTC-only history: both chart lines identical
    r = pg.evaluate("""(() => { const C = Samsam.core, coins = [{ sym: 'BTC', opening: { qty: 0.01304, avg: 80980.29 } }];
        const txs = [{ id: 'b', sym: 'BTC', type: 'buy', qty: 0.0250739, price: 81617.56, feeUsd: 1.25, date: new Date(Date.now() - 5 * 3600e3).toISOString() },
                     { id: 's', sym: 'BTC', type: 'sell', qty: 0.005, price: 83000, feeUsd: 0.5, date: new Date(Date.now() - 2 * 3600e3).toISOString() }];
        const n = Date.now(), sn = [0, 1, 2, 3, 4, 5, 6].map(h => { const t = n - (6 - h) * 3600e3, b = 81000 + h * 300; const q = h < 1 ? 0.01304 : h < 4 ? 0.0381139 : 0.0331139; return { t, v: q * b, b }; });
        const s = C.perfChartSeries(sn, coins, txs, { baselineBtc: 81162 }); return s.port.map((p, i) => Math.abs(p.v - s.btc[i].v)); })()""")
    check('BTC-only history: BTC trend line = All Time Profit line (fees and sells included)', max(r) < 1e-6, r)
    # 3. main Portfolio vs BTC = Performance VS Bitcoin numbers
    main = pg.evaluate("Object.fromEntries(portfolio.filter(c => c.sym !== 'BTC').map(c => [c.sym, +getPerf(c).toFixed(1)]))")
    # 4. baseline only moves coins held on that date
    moved = pg.evaluate("""(() => { const st = Samsam.getState(), prices = {}; portfolio.forEach(c => prices[c.sym] = c.sym === 'BTC' ? btcPrice : c.currentPrice);
        const o = { prices, btcNow: btcPrice, btcAt: Samsam.core.btcPriceLookup(perfSnapsState) };
        const a = Samsam.core.vsBtcByCoin(st.coins, st.transactions, { ...o, baselineBtc: 81162 }), b = Samsam.core.vsBtcByCoin(st.coins, st.transactions, { ...o, baselineBtc: 70000 });
        const held = Object.fromEntries(st.coins.map(c => [c.sym, (c.opening && c.opening.qty) > 0]));
        return Object.keys(a).filter(k => a[k] && b[k]).map(k => [k, held[k], Math.abs(a[k].pct - b[k].pct) > 1e-9]); })()""")
    wrong = [m for m in moved if m[0] != 'BTC' and m[1] != m[2]]
    check('changing the baseline moves exactly the coins held on that date (and never BTC)', not wrong and not any(m[2] for m in moved if m[0] == 'BTC'), wrong[:5])
    # 5. holdings change = price gain + money added
    hc = pg.evaluate("""(() => { const n = Date.now(), V = calcStats().total; const sn = [{ t: n - 3600e3, v: V - 500 }, { t: n, v: V }];
        return holdingsChangeText(sn); })()""")
    import re as _re
    nums = [float(x.replace(',', '')) * (-1 if sg == '−' else 1) for sg, x in _re.findall(r'([+−])\$([\d,]+\.\d\d)', hc['title'])]
    check('Holdings change: value change = from prices + added (shown separately)', len(nums) == 3 and abs(nums[0] - (nums[1] + nums[2])) <= 0.011 and abs(nums[0] - 500) < 0.01, hc)
    # 6. All Time Profit: card = sheet = legend
    pg.click('#allTimeCard'); pg.wait_for_timeout(300)
    sheet = pg.inner_text('#cppTotal'); pg.keyboard.press('Escape')
    leg = pg.inner_text('#perfPortfolioLabel'); cardv = pg.inner_text('#totalPnlCard')
    check('All Time Profit card = details sheet = chart legend', sheet.replace('−', '-') == cardv == leg.replace('−', '-'), (cardv, sheet, leg))
    pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    pg.click('#mvBtc'); pg.wait_for_timeout(300)
    perf = pg.evaluate("""(() => { const out = {}; document.querySelectorAll('#moversOne .mv-half').forEach(h => { const s = h.querySelector('.mv-sym'), v = h.querySelector('.mv-val'); if (s && v) out[s.textContent] = v.innerText; }); return out; })()""")
    ok = all(abs(main[k] - float(v.split('%')[0].replace('−', '-').replace('+', '').replace('▲', '').replace('▼', '').strip())) <= 0.11 for k, v in perf.items())
    check('Performance VS Bitcoin best/worst = main page Portfolio vs BTC', perf and ok, (perf, {k: main.get(k) for k in perf}))
    check('no page errors', not errs, errs)
    br.close()
print(f'consistency_test: {sum(res)}/{len(res)} passed')
