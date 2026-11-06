"""Plan → 🚪 Exit Strategy: macro levels (BTC.D / USDT.D / ETH-BTC) vs your editable targets, cash-out bar, per-coin
TP1-3 with 10% moonbag, quick fill 2x/3x/5x, Target hit, ✓ Done from sells recorded after the coin joined the plan,
tab remembered (device + cloud)."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SNAP = {'updated': '2026-11-03T08:00:00Z', 'global': {'mcap': 3e12, 'vol': 1e11, 'mcapCh24': 1, 'dom': {'btc': 48.0, 'eth': 12, 'usdt': 3.5}},
        'top': [{'id': 'bitcoin', 'sym': 'BTC', 'name': 'Bitcoin', 'price': 100000, 'ch24': 1}, {'id': 'ethereum', 'sym': 'ETH', 'name': 'Ethereum', 'price': 4000, 'ch24': 1}]}
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
        ctx.route('https://api.coingecko.com/api/v3/global**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_timeout(500)
        if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(600)
        # clean start
        pg.evaluate("Samsam.saveExit({ tab: 'accum', targets: null, plan: [] })"); pg.wait_for_timeout(600)
        pg.evaluate("try{localStorage.removeItem('samsam_plan_tab');localStorage.setItem('samsam_exit_view','cards')}catch(e){}"); pg.evaluate("Samsam.saveExit({ steps: null })")
        check(f'{name}: Plan opens on Accumulation with the switch on top', pg.is_visible('#tabAccum') and pg.get_attribute('#tabAccum', 'aria-selected') == 'true' and pg.is_visible('#accPane') and not pg.is_visible('#exitPane'))
        pg.click('#tabExit'); pg.wait_for_timeout(1500)
        check(f'{name}: Exit Strategy tab shows its page (title + macro card + cash bar)', pg.is_visible('#exitPane') and not pg.is_visible('#accPane') and pg.inner_text('#pageSubtitle') == 'Exit Strategy' and pg.is_visible('.xm-card') and pg.is_visible('.xc-card'))
        # macro: BTC.D 48 vs 45.9 → within 10% (near); USDT.D 3.5 ≤ 3.73 → hit; ETH/BTC 0.04 vs 0.085 → wait
        st = pg.evaluate("[...document.querySelectorAll('.xm-row')].map(r=>[r.dataset.k, r.className.split(' ')[1], r.querySelector('.xm-cur').textContent])")
        check(f'{name}: macro colours — BTC.D close (amber), USDT.D in range (green), ETH/BTC waiting (grey) {st}', st == [['btcD', 'near', '48.00%'], ['usdtD', 'hit', '3.50%'], ['ethBtc', 'wait', '0.04']], st)
        check(f'{name}: summary "Signals Hit: 1 of 3"', 'Signals Hit: 1 of 3' in pg.inner_text('.xm-sum'), pg.inner_text('.xm-sum'))
        # edit targets → saved in the cloud, colours follow
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=btcD]', '50'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1500)
        t = pg.evaluate("Samsam.getState().exit.targets")
        check(f'{name}: edited BTC.D target saved to the cloud (50) and now reached', t['btcD'] == 50 and not t['isDefault'] and 'Signals Hit: 2 of 3' in pg.inner_text('.xm-sum'), (t, pg.inner_text('.xm-sum')))
        pg.click('[data-act=tg-edit]'); pg.click('[data-act=tg-reset]'); pg.wait_for_timeout(1200)
        check(f'{name}: Reset → back to 45.90 / 3.73–1.914 / 0.085', pg.evaluate("Samsam.getState().exit.targets.btcD") == 45.9 and pg.evaluate("Samsam.getState().exit.targets.isDefault"))
        # add a coin
        pg.click('[data-act=pick]'); pg.wait_for_timeout(300)
        sym = pg.get_attribute('.xp-item >> nth=0', 'data-sym')
        coin = pg.evaluate(f"Samsam.getState().portfolio.find(c=>c.sym==='{sym}')")
        pg.click('.xp-item >> nth=0'); pg.wait_for_timeout(1500)
        e = pg.evaluate("Samsam.getState().exit.plan[0]")
        check(f'{name}: Add to Exit Plan → {sym} saved with today\'s amount, moonbag on, 25/50/25', e and e['sym'] == sym and abs(e['baseQty'] - coin['qty']) < 1e-9 and e['moonbag'] and [x['pct'] for x in e['tps']] == [25, 50, 25], e)
        avg = coin['basePrice']
        rp = pg.evaluate("(()=>{const s=Samsam.getState(),e=s.exit.plan[0];return SamsamExit.calc.coin(e,s.portfolio.find(c=>c.sym===e.sym),[],s.exit.steps).steps.map(x=>x.price)})()")
        check(f'{name}: prices follow 2× / 3× / 5× the average buy price (not fixed)', all(abs(x - avg * m) / (avg * m) < 1e-4 for x, m in zip(rp, (2, 3, 5))) and all(t['lock'] is False for t in e['tps']), (rp, e['tps'], avg))
        # amounts: 90% sellable → TP1 = 22.5% of base
        q1 = pg.evaluate("SamsamExit.calc.coin(Samsam.getState().exit.plan[0], Samsam.getState().portfolio.find(c=>c.sym===Samsam.getState().exit.plan[0].sym), []).steps.map(s=>s.qty)")
        check(f'{name}: moonbag 10% kept → TP1/2/3 sell 22.5% / 45% / 22.5% of the plan amount', all(abs(a - coin['qty'] * f) < 1e-6 * max(1, coin['qty']) for a, f in zip(q1, (0.225, 0.45, 0.225))), q1)
        pg.click('.xk-moon input'); pg.wait_for_timeout(1200)
        check(f'{name}: moonbag off → whole amount is sold (25 / 50 / 25 %)', pg.evaluate("Samsam.getState().exit.plan[0].moonbag") is False and 'Moonbag kept' not in pg.inner_text('.xk-card'))
        pg.click('.xk-moon input'); pg.wait_for_timeout(1200)
        # set TP1 below the price → Target hit; TP2 far above → waiting
        price = coin['currentPrice']
        inp = pg.locator('input[data-tp="0"][data-f=price]'); inp.fill(str(round(price * 0.5, 8))); inp.press('Enter'); pg.wait_for_timeout(1400)
        inp = pg.locator('input[data-tp="1"][data-f=price]'); inp.fill(str(round(price * 4, 8))); inp.press('Enter'); pg.wait_for_timeout(1400)
        b = pg.evaluate("[...document.querySelectorAll('.xt')].map(x=>[x.className, x.querySelector('.xs-badge').textContent])")
        check(f'{name}: TP1 under the price → "Target hit — sell …", TP2 above → "% to go" {b[:2]}', 'hit' in b[0][0] and 'Target hit — sell' in b[0][1] and 'wait' in b[1][0] and '% to go' in b[1][1], b)
        # quick fill again
        pg.click('[data-act=quick]'); pg.wait_for_timeout(1400)
        tp = pg.evaluate("(()=>{const s=Samsam.getState(),e=s.exit.plan[0];return SamsamExit.calc.coin(e,s.portfolio.find(c=>c.sym===e.sym),[],s.exit.steps).steps.map(x=>x.price)})()")
        lk = pg.evaluate("Samsam.getState().exit.plan[0].tps.map(t=>t.lock)")
        check(f'{name}: Auto → the three prices follow 2× / 3× / 5× again', all(abs(a - avg * m) / (avg * m) < 1e-4 for a, m in zip(tp, (2, 3, 5))) and lk == [False, False, False], (tp, lk))
        # a sell recorded now covers TP1 (22.5%) and part of TP2
        sell = coin['qty'] * 0.30
        pg.evaluate(f"Samsam.addTx('{sym}', 'sell', {sell}, {price})"); pg.wait_for_timeout(2000)
        b = pg.evaluate("[...document.querySelectorAll('.xt')].map(x=>x.querySelector('.xs-badge').textContent)")
        check(f'{name}: a sell recorded in Holdings → TP1 ✓ Done, TP2 partly sold {b}', b[0] == 'Done' and ('% sold' in b[1] or b[1].endswith(' more')), b)
        check(f'{name}: card totals — Projected cash-out and Net profit shown', 'Projected cash-out' in pg.inner_text('.xk-card') and 'Net profit' in pg.inner_text('.xk-card'))
        check(f'{name}: cash bar counts the steps done (1 of 3)', 'Exit steps done' in pg.inner_text('.xc-card') and '1 of 3' in pg.inner_text('.xc-card'), pg.inner_text('.xc-card'))
        check(f'{name}: no sideways scrolling', not pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        # tab remembered
        check(f'{name}: tab saved in the cloud', pg.evaluate("Samsam.getState().exit.tab") == 'exit')
        pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(1500)
        check(f'{name}: reopening the page → still on Exit Strategy', pg.is_visible('#exitPane') and pg.get_attribute('#tabExit', 'aria-selected') == 'true')
        # remove (undo the sell first so other tests see the same portfolio)
        tx = pg.evaluate(f"Samsam.getState().transactions.filter(t=>t.sym==='{sym}' && t.type==='sell').slice(-1)[0].id"); pg.evaluate(f"Samsam.deleteTx('{tx}')")
        pg.click('[data-act=remove]'); pg.wait_for_timeout(400)
        ok = pg.locator('.cpd-ok, [data-cpd=ok], .cp-dialog button.danger, .cp-dialog .ok')
        if ok.count(): ok.first.click()
        else: pg.keyboard.press('Enter')
        pg.wait_for_timeout(1300)
        check(f'{name}: remove → coin leaves the exit plan', pg.evaluate("Samsam.getState().exit.plan.length") == 0, pg.evaluate("Samsam.getState().exit.plan.map(e=>e.sym)"))
        pg.evaluate("Samsam.saveExit({ tab: 'accum' })"); pg.click('#tabAccum'); pg.wait_for_timeout(500)
        check(f'{name}: back to Accumulation shows the plan again', pg.is_visible('#accPane') and pg.inner_text('#pageSubtitle') == 'Accumulation Plan')
        check(f'{name}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
