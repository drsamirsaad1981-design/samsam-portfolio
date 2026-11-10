"""Buy → "Pay from" a stablecoin you hold (the mirror of Sell → "Add the money to"): on by default, the cost (amount × price +
fee) leaves USDT at $1 in the same write, linked to the Buy (kind:'pay'); not enough USDT → refused with a clear note;
untick → a plain Buy, and the choice is remembered; deleting the Buy puts the USDT back; the payment shows as "Paid"."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
Q = "(s)=>{const c=Samsam.getState().portfolio.find(x=>x.sym===s); return c?c.qty:0}"
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); ctx.add_init_script("try{if(!sessionStorage.getItem('pf')){localStorage.setItem('samsam_buy_from','{\"on\":true}');sessionStorage.setItem('pf','1')}}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(500)
        if pg.evaluate(Q, 'USDT') < 500:
            pg.evaluate("Samsam.getState().coins.some(c=>c.sym==='USDT'&&!c.removed) ? Samsam.addTx('USDT','buy',1000,1,'test cash') : Samsam.addCoin({sym:'USDT',name:'Tether',cgId:'tether',cat:'other'},{qty:1000,price:1})")
            pg.wait_for_function(f"({Q})('USDT') >= 500", timeout=8000)
        u0, s0 = pg.evaluate(Q, 'USDT'), pg.evaluate(Q, 'SOL')
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(400)
        pg.click('#htxAddBtn'); pg.wait_for_selector('#atxBackdrop.show'); pg.click('.atx-types button[data-t="buy"]'); pg.wait_for_timeout(150)
        row = pg.evaluate("({show: getComputedStyle(document.getElementById('atxCashRow')).display!=='none', lbl: document.getElementById('atxCashLbl').textContent, on: document.getElementById('atxCashOn').checked, opts: [...document.querySelectorAll('#atxCashSym option')].map(o=>o.value)})")
        check(f'{vn} Buy: "Pay from" shown, on, your stablecoins only {row}', row['show'] and row['lbl'] == 'Pay from' and row['on'] and 'USDT' in row['opts'] and all(not o.startswith('USDC') or pg.evaluate(Q, 'USDC') > 0 for o in row['opts']), row)
        pg.select_option('#atxCashSym', 'USDT')
        pg.fill('#atxQty', '2'); pg.fill('#atxPrice', '10'); pg.fill('#atxFeeUsd', '1'); pg.wait_for_timeout(150)
        pv = pg.inner_text('#atxPreview')
        check(f'{vn} preview: "Pays $21.00 from USDT · … left"', 'Pays $21.00 from USDT' in pv and 'left' in pv, pv)
        if vn == 'phone': pg.locator('#atxForm').screenshot(path=str(SH / 'pay_from.png'))
        pg.fill('#atxQty', '1000000'); pg.wait_for_timeout(150)
        check(f'{vn} not enough USDT → a clear note', 'Not enough USDT' in pg.inner_text('#atxErr'), pg.inner_text('#atxErr'))
        pg.click('#atxSave'); pg.wait_for_timeout(300)
        check(f'{vn} … and it isn\'t saved', pg.is_visible('#atxForm') and abs(pg.evaluate(Q, 'SOL') - s0) < 1e-9)
        pg.fill('#atxQty', '2'); pg.wait_for_timeout(100); pg.click('#atxSave')
        pg.wait_for_function(f"Math.abs(({Q})('USDT') - {u0 - 21}) < 1e-6 && Math.abs(({Q})('SOL') - {s0 + 2}) < 1e-9", timeout=8000)
        t = pg.evaluate("(()=>{const tx=Samsam.getState().transactions; const p=tx.filter(t=>t.sym==='USDT'&&t.kind==='pay').slice(-1)[0]; return {p, b: tx.find(t=>t.id===p.link)}})()")
        check(f'{vn} saved: Buy 2 SOL + USDT −21 at $1 (kind pay, linked to the Buy)', t['p']['type'] == 'sell' and t['p']['price'] == 1 and abs(t['p']['qty'] - 21) < 1e-9 and t['b'] and t['b']['sym'] == 'SOL' and t['b']['type'] == 'buy', t)
        pg.evaluate("openCoinTx('USDT')"); pg.wait_for_timeout(500)
        hl = pg.inner_text('#htxList')
        check(f'{vn} USDT history: "Paid · Paid for buying 2 SOL", no profit/loss', 'Paid' in hl and 'Paid for buying 2 SOL' in hl, hl[:200])
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(300)
        pg.click('#htxAddBtn'); pg.wait_for_selector('#atxBackdrop.show'); pg.click('.atx-types button[data-t="buy"]'); pg.wait_for_timeout(100)
        pg.uncheck('#atxCashOn'); pg.fill('#atxQty', '1'); pg.fill('#atxPrice', '10'); pg.wait_for_timeout(100)
        check(f'{vn} unticked → no payment line', 'Pays' not in pg.inner_text('#atxPreview'))
        u1 = pg.evaluate(Q, 'USDT'); pg.click('#atxSave')
        pg.wait_for_function(f"Math.abs(({Q})('SOL') - {s0 + 3}) < 1e-9", timeout=8000); pg.wait_for_timeout(300)
        check(f'{vn} plain Buy: USDT untouched', abs(pg.evaluate(Q, 'USDT') - u1) < 1e-9)
        pg.click('#htxAddBtn'); pg.wait_for_selector('#atxBackdrop.show'); pg.click('.atx-types button[data-t="buy"]'); pg.wait_for_timeout(100)
        check(f'{vn} the unticked choice is remembered', not pg.is_checked('#atxCashOn'))
        pg.click('.atx-types button[data-t="sell"]'); pg.wait_for_timeout(100)
        check(f'{vn} Sell still says "Add the money to"', pg.inner_text('#atxCashLbl') == 'Add the money to')
        pg.click('#atxForm .atx-x')
        # deleting the paid Buy puts the USDT back
        bid = t['b']['id']; u2 = pg.evaluate(Q, 'USDT')
        pg.evaluate(f"deleteTx('{bid}')")
        pg.wait_for_function(f"Math.abs(({Q})('USDT') - {u2 + 21}) < 1e-6", timeout=8000)
        log = pg.evaluate("(window.__cpLog||[]).slice(-1)[0] || ''")
        check(f'{vn} delete the Buy → its payment goes too, USDT back (+21)', 'paid with comes back' in log and not pg.evaluate(f"Samsam.getState().transactions.some(t=>t.link==='{bid}')"), log[-160:])
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
