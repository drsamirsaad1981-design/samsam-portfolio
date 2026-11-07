"""All Time Profit: one name, one definition (Realized + Unrealized) on the main page, the coin page and Performance;
tapping it opens the details sheet whose numbers and formulas match samsam-core.js."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def money(t): t = t.replace('−', '-').replace(',', '').replace('$', ''); return float(re.search(r'-?[\d.]+', t.replace('+', '')).group(0)) * (-1 if t.strip().startswith('-') else 1)
FORMULAS = ['Realized Profit + Unrealized Profit',
            '(Sell Price − Avg Buy Price) × Amount Sold − Selling Fee',
            '(Current Price − Avg Buy Price) × Amount Held',
            'Avg Buy Price × Amount Held',
            '(Amount Held × Avg Buy Price + Buy Price × Amount Bought + Buying Fee) ÷ (Amount Held + Amount Bought)',
            'All Time Profit ÷ (Cost Basis + Cost of Coins Sold) × 100']   # % on everything invested (sold coins too)
def sheet_nums(pg):
    return pg.evaluate("['cppTotal','cppRealized','cppUnrealized','cppCost','cppPct'].map(i => document.getElementById(i).innerText)")

with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        sym = pg.evaluate("portfolio.filter(c => c.sym !== 'BTC' && c.qty > 2).sort((a, b) => b.qty * b.currentPrice - a.qty * a.currentPrice)[0].sym")
        if name == 'mobile':
            # a sell with a selling fee: realized must be (price − avg) × qty − fee
            before = pg.evaluate(f"(() => {{ const c = portfolio.find(c => c.sym === '{sym}'); return {{ avg: c.basePrice, qty: c.qty }}; }})()")
            pg.evaluate(f"void Samsam.addTx('{sym}', 'sell', 1, 3, 'fee test', {{ feeUsd: 0.25 }})"); pg.wait_for_timeout(800)
            tx = pg.evaluate(f"(() => {{ const t = transactions.filter(t => t.sym === '{sym}' && t.note === 'fee test').pop(); return {{ fee: t.feeUsd, r: realizedState.perTx[t.id].realized }}; }})()")
            check('sell keeps its USD selling fee', tx['fee'] == 0.25, tx)
            check('Realized = (Sell − Avg) × Sold − Selling Fee', abs(tx['r'] - ((3 - before['avg']) * 1 - 0.25)) < 1e-9, (tx, before))
            check('selling fee is counted in sellFees', pg.evaluate("realizedState.sellFees") >= 0.25 - 1e-12, pg.evaluate("realizedState.sellFees"))
        # ── header card ──
        lbl = pg.inner_text('#allTimeCard .stat-label').strip()
        check(f'{name}: header card is called All Time Profit', lbl.upper().replace('-', ' ').startswith('ALL TIME PROFIT'), lbl)
        d = pg.evaluate("allTimeProfitData()")
        exp = pg.evaluate("""(() => { const v = calcStats().total, c = portfolio.reduce((s, x) => s + x.qty * x.basePrice, 0);
            return { total: realizedState.total + (v - c), cost: c }; })()""")
        check(f'{name}: All Time Profit = Realized + Unrealized', abs(d['total'] - exp['total']) < 1e-6 and abs(d['realized'] + d['unrealized'] - d['total']) < 1e-9, (d, exp))
        card = pg.inner_text('#totalPnlCard')
        check(f'{name}: header card shows that number', abs(money(card) - d['total']) < 0.006, (card, d['total']))
        pg.click('#allTimeCard'); pg.wait_for_timeout(300)
        check(f'{name}: tapping the card opens the details', pg.is_visible('#cpProfit .cpp'))
        n = sheet_nums(pg)
        check(f'{name}: sheet total = card', n[0] == card, (n[0], card))
        check(f'{name}: sheet realized + unrealized = total', abs(money(n[1]) + money(n[2]) - money(n[0])) <= 0.011, n)
        check(f'{name}: sheet cost basis and % match', abs(money(n[3]) - d['cost']) < 0.006 and n[4].endswith('%') and abs(float(re.sub(r'[^\d.]', '', n[4])) - abs(d['pct'])) < 0.006, (n, d))
        check(f'{name}: mobile = bottom sheet, desktop = centered panel', pg.evaluate("document.getElementById('cpProfit').classList.contains('sheet')") == (name == 'mobile'))
        pg.click('#cpProfit summary'); pg.wait_for_timeout(200)
        how = pg.inner_text('#cpProfit .cpp-how')
        check(f'{name}: "How is it calculated?" lists the exact formulas', all(f in how for f in FORMULAS), [f for f in FORMULAS if f not in how])
        pg.screenshot(path=str(SH / f'profit-main-{name}.png'))
        fit = pg.evaluate("(() => { const c = document.querySelector('#cpProfit .cpp'); return c.scrollWidth <= c.clientWidth + 1 && c.getBoundingClientRect().right <= innerWidth + 1; })()")
        check(f'{name}: sheet fits the screen', fit)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(f'{name}: Esc closes it', not pg.query_selector('#cpProfit'))
        pg.focus('#allTimeCard'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
        check(f'{name}: keyboard (Enter) opens it too', pg.is_visible('#cpProfit .cpp'))
        pg.click('#cpProfit .cpp-x'); pg.wait_for_timeout(200)
        check(f'{name}: × closes it', not pg.query_selector('#cpProfit'))
        leg = pg.inner_text('#perfPortfolioLabel')
        check(f'{name}: chart legend "All-time Profit" uses the same number', leg == card or abs(money(leg) - d['total']) < 0.006, (leg, card))
        # ── coin page ──
        pg.evaluate(f"location.hash = '#holdings/{sym}'"); pg.wait_for_timeout(900)
        cd = pg.evaluate(f"""(() => {{ const c = portfolio.find(c => c.sym === '{sym}'), st = Samsam.getState(), doc = st.coins.find(x => x.sym === '{sym}');
            const r = Samsam.core.replay(doc.opening, transactions.filter(t => t.sym === '{sym}'));
            return {{ total: r.realized + c.qty * (c.currentPrice - c.basePrice), realized: r.realized, fees: r.sellFees }}; }})()""")
        ct = pg.inner_text('#htxProfit')
        check(f'{name}: coin card = this coin\'s realized + unrealized', abs(money(ct) - cd['total']) < 0.006, (ct, cd))
        pg.click('#htxProfit'); pg.wait_for_timeout(300)
        n2 = sheet_nums(pg); scope = pg.inner_text('#cppT')
        check(f'{name}: coin sheet opens with the coin name and matching numbers', sym in scope and n2[0] == ct and abs(money(n2[1]) - cd['realized']) < 0.006, (scope, n2, ct, cd))
        if name == 'mobile':
            check('coin sheet mentions the selling fees', 'selling fees' in pg.inner_text('#cpProfit .cpp-rows'), pg.inner_text('#cpProfit .cpp-rows'))
        pg.screenshot(path=str(SH / f'profit-coin-{name}.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        # selling fee field in the add-transaction form
        pg.evaluate(f"openAddTx('sell', '{sym}')"); pg.wait_for_timeout(300)
        check(f'{name}: Sell form has a Selling fee (USD) field', pg.is_visible('#atxFeeUsd') and 'Selling fee' in pg.inner_text('#atxFeeUsdLabel'), pg.inner_text('#atxFeeUsdLabel'))
        pg.fill('#atxQty', '1'); pg.fill('#atxPrice', '3'); pg.fill('#atxFeeUsd', '0.5'); pg.wait_for_timeout(200)
        check(f'{name}: preview shows proceeds after the fee', '− fee $0.50' in pg.inner_text('#atxPreview'), pg.inner_text('#atxPreview'))
        pg.evaluate("closeAddTx()")
        pg.evaluate(f"openAddTx('buy', '{sym}')"); pg.wait_for_timeout(200)
        check(f'{name}: Buy form still says Buying fee', 'Buying fee' in pg.inner_text('#atxFeeUsdLabel'))
        pg.evaluate("closeAddTx()")
        main_total = d['total']
        body = pg.inner_text('body')
        check(f'{name}: no "Total P&L" label left on the main page', 'Total P&L' not in body and 'TOTAL P&L' not in body.upper().replace('ALL-TIME', ''))
        # ── Performance ──
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2500)
        lab = pg.inner_text('#allTimeCard .sum-label').strip(); pv = pg.inner_text('#totalPnl'); bd = pg.inner_text('#perfCatVal b')
        pd = pg.evaluate("allTimeData")
        check(f'{name}: Performance card is called All Time Profit', lab.upper().replace('-', ' ').startswith('ALL TIME PROFIT'), lab)
        check(f'{name}: Performance All Time Profit includes realized (= main page)', abs(pd['total'] - main_total) < 0.01 and abs(money(pv) - pd['total']) < 0.006, (pv, pd, main_total))
        check(f'{name}: breakdown All Time Profit = same number', abs(money(bd) - pd['total']) < 0.006 and abs(money(pg.inner_text('#bdUnrealized')) - pd['unrealized']) < 0.006, (bd, pd))
        pt = pg.inner_text('body')
        check(f'{name}: no "P&L" total labels left on Performance', 'Total P&L' not in pt and 'All-Time P&L' not in pt and 'All-time P&L' not in pt)
        pg.click('#allTimeCard'); pg.wait_for_timeout(300)
        n3 = sheet_nums(pg)
        check(f'{name}: Performance card opens the same details', pg.is_visible('#cpProfit .cpp') and abs(money(n3[0]) - pd['total']) < 0.006 and abs(money(n3[1]) + money(n3[2]) - money(n3[0])) <= 0.011, n3)
        pg.screenshot(path=str(SH / f'profit-perf-{name}.png'))
        pg.keyboard.press('Escape')
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'profit_test: {sum(res)}/{len(res)} passed')
