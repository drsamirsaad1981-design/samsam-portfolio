"""Exit Strategy v2: Table | Cards, steps that follow the average buy price (×2 ×3 ×5, editable defaults in the cloud),
a typed price is locked (unlock → follows again), % auto-balance to 100, SVG icons only (no emoji),
and Sell → "Add the money to USDT" (one linked Buy, deleted together)."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SNAP = {'updated': '2026-11-03T08:00:00Z', 'global': {'mcap': 3e12, 'vol': 1e11, 'mcapCh24': 1, 'dom': {'btc': 48.0, 'eth': 12, 'usdt': 3.5}},
        'top': [{'id': 'bitcoin', 'sym': 'BTC', 'name': 'Bitcoin', 'price': 100000, 'ch24': 1}, {'id': 'ethereum', 'sym': 'ETH', 'name': 'Ethereum', 'price': 4000, 'ch24': 1}]}
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿⭐✅]')
RES = "(()=>{const s=Samsam.getState(),e=s.exit.plan[0];return SamsamExit.calc.coin(e,s.portfolio.find(c=>c.sym===e.sym),[],s.exit.steps).steps.map(x=>x.price)})()"
def near(a, b): return b and abs(a - b) / abs(b) < 1e-4
def ready(pg):
    pg.wait_for_timeout(500)
    if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(700)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('desktop', dict(viewport={'width': 1366, 'height': 900})), ('phone', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True))):
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
        ctx.route('https://api.coingecko.com/api/v3/global**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/accumulation.html'); ready(pg)
        pg.evaluate("Samsam.saveExit({ tab: 'exit', targets: null, plan: [], steps: null })"); pg.evaluate("try{localStorage.removeItem('samsam_exit_view');localStorage.removeItem('samsam_sell_to')}catch(e){}")
        pg.reload(); ready(pg); pg.wait_for_timeout(800)
        tabs = pg.evaluate("[...document.querySelectorAll('.xs-tabs button')].map(b=>[b.textContent.trim(), !!b.querySelector('svg')])")
        check(f'{name}: Accumulation / Exit Strategy tabs use SVG icons, no emoji {tabs}', tabs == [['Accumulation', True], ['Exit Strategy', True]], tabs)
        v = pg.evaluate("document.querySelector('[data-act=view].btn-toggle-active').dataset.v")
        check(f'{name}: opens on {"Table" if name == "desktop" else "Cards"} the first time', v == ('table' if name == 'desktop' else 'cards'), v)
        pg.click('[data-act=pick]'); pg.wait_for_timeout(300)
        sym = pg.get_attribute('.xp-item >> nth=0', 'data-sym')
        coin = pg.evaluate(f"Samsam.getState().portfolio.find(c=>c.sym==='{sym}')"); avg = coin['basePrice']
        pg.click('.xp-item >> nth=0'); pg.wait_for_timeout(1500)
        # table
        pg.click('[data-act=view][data-v=table]'); pg.wait_for_timeout(300)
        t = pg.evaluate("(()=>{const r=document.querySelector('table.xv tbody tr');return {rows:document.querySelectorAll('table.xv tbody tr').length,tps:r.querySelectorAll('.xv-tp').length,svg:r.querySelectorAll('.xv-tp svg').length,foot:document.querySelector('table.xv tfoot').textContent,head:[...document.querySelectorAll('table.xv th')].map(x=>x.textContent)}})()")
        check(f'{name}: table — one row, TP1/TP2/TP3 cells with status icons, totals row', t['rows'] == 1 and t['tps'] == 3 and t['svg'] >= 3 and 'Total' in t['foot'] and t['head'][3:6] == ['Take profit 1', 'Take profit 2', 'Take profit 3'], t)
        check(f'{name}: Table remembered on this device', pg.evaluate("localStorage.getItem('samsam_exit_view')") == 'table')
        check(f'{name}: the table scrolls inside its box, the page does not', not pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        pg.click('table.xv tbody tr'); pg.wait_for_timeout(500)
        check(f'{name}: tap a row → that coin\'s card (editing), Table still the saved choice', pg.is_visible(f'.xk-card[data-sym="{sym}"]') and pg.evaluate("localStorage.getItem('samsam_exit_view')") == 'table')
        # % auto-balance
        inp = pg.locator('input[data-tp="0"][data-f=pct]'); inp.fill('40'); inp.press('Enter'); pg.wait_for_timeout(1400)
        pc = pg.evaluate("Samsam.getState().exit.plan[0].tps.map(t=>t.pct)")
        check(f'{name}: TP1 25→40 % → the other two share the rest: {pc}', pc == [40, 40, 20], pc)
        # typed price → locked
        pr = round(avg * 7, 6)
        inp = pg.locator('input[data-tp="1"][data-f=price]'); inp.fill(str(pr)); inp.press('Enter'); pg.wait_for_timeout(1400)
        lk = pg.evaluate("Samsam.getState().exit.plan[0].tps.map(t=>t.lock)")
        check(f'{name}: a price you type is fixed (lock on TP2 only) {lk}', lk == [False, True, False] and pg.locator('.xt >> nth=1').locator('.xt-lock svg').count() == 1 and pg.locator('.xt >> nth=0').locator('.xt-auto').count() == 1, lk)
        # default steps → linked prices move, the locked one stays
        pg.click('[data-act=steps]'); pg.wait_for_timeout(300)
        m = pg.locator('[data-st=m][data-k="0"]'); m.fill('4'); m.press('Enter'); pg.wait_for_timeout(300)
        pp = pg.locator('[data-st=p][data-k="2"]'); pp.fill('35'); pp.press('Enter'); pg.wait_for_timeout(300)
        dp = pg.evaluate("[...document.querySelectorAll('[data-st=p]')].map(x=>+x.value)")
        check(f'{name}: default steps — % balance there too {dp}', abs(sum(dp) - 100) < 0.01 and dp[2] == 35, dp)
        pg.click('[data-act=steps-save]'); pg.wait_for_timeout(1500)
        cfg = pg.evaluate("Samsam.getState().exit.steps")
        rp = pg.evaluate(RES)
        check(f'{name}: default steps saved to the cloud (×4 ×3 ×5)', cfg['mults'] == [4, 3, 5] and not cfg['isDefault'], cfg)
        check(f'{name}: TP1 follows ×4 now, TP2 keeps the price you typed {rp}', near(rp[0], avg * 4) and near(rp[1], pr) and near(rp[2], avg * 5), (rp, avg))
        check(f'{name}: toolbar button shows ×4 ×3 ×5 (phone: icon, the steps in its label)', ('×4 ×3 ×5' in pg.inner_text('[data-act=steps]')) if name == 'desktop' else ('×4 ×3 ×5' in pg.get_attribute('[data-act=steps]', 'aria-label') and pg.inner_text('[data-act=steps]').strip() == ''), pg.inner_text('[data-act=steps]'))
        # unlock
        pg.click('.xt >> nth=1 >> .xt-lock'); pg.wait_for_timeout(1400)
        rp = pg.evaluate(RES)
        check(f'{name}: tap the lock → TP2 follows ×3 the average again', near(rp[1], avg * 3) and pg.evaluate("Samsam.getState().exit.plan[0].tps[1].lock") is False, rp)
        # buy more at a higher price → average moves → linked prices move with it
        pg.evaluate(f"Samsam.addTx('{sym}', 'buy', {coin['qty']}, {avg * 3})"); pg.wait_for_timeout(1800)
        avg2 = pg.evaluate(f"Samsam.getState().portfolio.find(c=>c.sym==='{sym}').basePrice"); rp = pg.evaluate(RES)
        check(f'{name}: buy more → new average {avg2:.6g} → TP1/TP2/TP3 move with it', avg2 > avg * 1.5 and near(rp[0], avg2 * 4) and near(rp[1], avg2 * 3), (avg2, rp))
        tx = pg.evaluate(f"Samsam.getState().transactions.filter(t=>t.sym==='{sym}'&&t.type==='buy').slice(-1)[0].id"); pg.evaluate(f"Samsam.deleteTx('{tx}')"); pg.wait_for_timeout(1200)
        # Auto
        pg.click('[data-act=quick]'); pg.wait_for_timeout(1400)
        e = pg.evaluate("Samsam.getState().exit.plan[0]")
        check(f'{name}: Auto → your default % and all three follow the average', [x['pct'] for x in e['tps']] == cfg['pcts'] and all(x['lock'] is False for x in e['tps']), (e['tps'], cfg['pcts']))
        check(f'{name}: Auto disabled when already automatic', pg.is_disabled('[data-act=quick]'))
        pg.click('[data-act=steps]'); pg.click('[data-act=steps-reset]'); pg.click('[data-act=steps-save]'); pg.wait_for_timeout(1400)
        check(f'{name}: back to ×2 ×3 ×5 · 25/50/25', pg.evaluate("Samsam.getState().exit.steps.isDefault") and near(pg.evaluate(RES)[0], avg * 2))
        txt = pg.inner_text('#exitPane') + ''.join(pg.evaluate("[...document.querySelectorAll('#exitPane [title]')].map(x=>x.title)"))
        check(f'{name}: no emoji anywhere on Exit Strategy (cards + table)', not EMOJI.search(txt) and (pg.click('[data-act=view][data-v=table]') or True) and not EMOJI.search(pg.inner_text('#exitPane')), EMOJI.findall(txt))
        pg.evaluate("Samsam.saveExit({ tab: 'accum', plan: [] })"); pg.wait_for_timeout(800)
        # ── Sell → USDT ──
        pg.goto(S.SITE + '/index.html'); ready(pg)
        st = pg.evaluate("Samsam.getState().portfolio.map(c=>[c.sym,c.qty,c.currentPrice])")
        ss = next(x for x in st if x[1] > 0 and x[0] not in ('USDT', 'USDC'))[0]
        q0 = pg.evaluate("(Samsam.getState().portfolio.find(c=>c.sym==='USDT')||{qty:0}).qty")
        pg.evaluate(f"openAddTx('sell','{ss}')"); pg.wait_for_timeout(400)
        check(f'{name}: Sell form shows "Add the money to USDT", ticked', pg.is_visible('#atxCashRow') and pg.is_checked('#atxCashOn') and pg.input_value('#atxCashSym') in ('USDT', 'USDC'), pg.input_value('#atxCashSym'))
        cs = pg.input_value('#atxCashSym')
        qty = round(next(x for x in st if x[0] == ss)[1] * 0.1, 6)
        px = round(1000 / qty, 6)
        pg.fill('#atxQty', str(qty)); pg.fill('#atxPrice', str(px)); pg.fill('#atxFeeUsd', '0.5'); pg.wait_for_timeout(200)
        check(f'{name}: preview says how much goes to {cs}', ('Adds ' in pg.inner_text('#atxPreview')) and cs in pg.inner_text('#atxPreview'), pg.inner_text('#atxPreview'))
        pg.click('#atxSave'); pg.wait_for_timeout(2000)
        txs = pg.evaluate("Samsam.getState().transactions")
        sell = [t for t in txs if t['sym'] == ss and t['type'] == 'sell'][-1]
        buy = [t for t in txs if t.get('link') == sell['id']]
        check(f'{name}: one Sell + one linked {cs} Buy at $1 for the money after the fee', len(buy) == 1 and buy[0]['sym'] == cs and buy[0]['price'] == 1 and abs(buy[0]['qty'] - (qty * px - 0.5)) < 1e-6, buy)
        q1 = pg.evaluate(f"(Samsam.getState().portfolio.find(c=>c.sym==='{cs}')||{{qty:0}}).qty")
        check(f'{name}: {cs} in the portfolio went up by that amount', abs(q1 - (q0 if cs == 'USDT' else 0) - (qty * px - 0.5)) < 1e-6 or cs != 'USDT', (q0, q1))
        # deleting the sell removes the Buy too
        pg.evaluate(f"deleteTx('{sell['id']}')"); pg.wait_for_timeout(1800)
        ids = pg.evaluate("Samsam.getState().transactions.map(t=>t.id)")
        check(f'{name}: delete the Sell → its {cs} Buy goes too', sell['id'] not in ids and buy[0]['id'] not in ids)
        # untick → only the sell, choice remembered
        pg.evaluate(f"openAddTx('sell','{ss}')"); pg.wait_for_timeout(300)
        pg.uncheck('#atxCashOn'); pg.fill('#atxQty', str(qty)); pg.fill('#atxPrice', '3'); pg.click('#atxSave'); pg.wait_for_timeout(1800)
        txs = pg.evaluate("Samsam.getState().transactions"); sell = [t for t in txs if t['sym'] == ss and t['type'] == 'sell'][-1]
        check(f'{name}: untick → only the Sell is saved', not [t for t in txs if t.get('link') == sell['id']])
        pg.evaluate(f"openAddTx('sell','{ss}')"); pg.wait_for_timeout(300)
        check(f'{name}: the untick is remembered next time', not pg.is_checked('#atxCashOn'))
        pg.check('#atxCashOn'); pg.evaluate("closeAddTx()"); pg.evaluate(f"Samsam.deleteTx('{sell['id']}')"); pg.wait_for_timeout(800)
        pg.evaluate(f"openAddTx('buy','{ss}')"); pg.wait_for_timeout(200)
        check(f'{name}: Buy form has no "Add the money to" row', not pg.is_visible('#atxCashRow')); pg.evaluate("closeAddTx()")
        check(f'{name}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
