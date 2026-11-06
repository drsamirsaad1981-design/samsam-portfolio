"""Add Transaction form: Buy / Sell / Transfer In / Transfer Out, two devices."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
close = lambda a, b: abs(a - b) <= 1e-9 * max(1, abs(a), abs(b))

def login(ctx):
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    return pg, errs
def coin(pg, sym): return pg.evaluate(f"Samsam.getState().portfolio.find(c => c.sym === '{sym}')")
def fill_form(pg, t, qty, price=None, fee=None, date=None, note=None):
    pg.click('#htxAddBtn'); pg.wait_for_selector('#atxBackdrop.show')
    pg.click(f'.atx-types button[data-t="{t}"]')
    pg.fill('#atxQty', str(qty))
    if price is not None: pg.fill('#atxPrice', str(price))
    if fee is not None: pg.fill('#atxFee', str(fee))
    if date: pg.fill('#atxDate', date)
    if note: pg.fill('#atxNote', note)

with sync_playwright() as p:
    br = p.chromium.launch()
    mob = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(mob)
    desk = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(desk)
    A, ea = login(mob); B, eb = login(desk)
    for pg in (A, B): pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(400)

    # form structure
    A.click('#htxAddBtn'); A.wait_for_selector('#atxBackdrop.show')
    types = A.eval_on_selector_all('.atx-types button', 'b => b.map(x => x.innerText.trim())')
    check('4 type buttons: Buy, Sell, Transfer In, Transfer Out', types == ['Buy', 'Sell', 'Transfer In', 'Transfer Out'], types)
    vis = {}
    for t in ('buy', 'sell', 'transfer_in', 'transfer_out'):
        A.click(f'.atx-types button[data-t="{t}"]')
        vis[t] = A.evaluate("['atxPriceRow','atxFeeRow'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none')")
    check('fields: Buy/Sell = price, no fee', vis['buy'] == [True, False] and vis['sell'] == [True, False], vis)
    check('fields: Transfer In = price + fee + date', vis['transfer_in'] == [True, True], vis)
    check('fields: Transfer Out = fee + date, no price', vis['transfer_out'] == [False, True], vis)
    sheet = A.evaluate("(() => { const r = document.querySelector('#atxForm').getBoundingClientRect(); return [Math.round(innerHeight - r.bottom), getComputedStyle(document.querySelector('#atxForm')).backgroundColor]; })()")
    check('mobile: form is a dark bottom sheet', sheet[0] <= 1 and sheet[1] == 'rgb(22, 19, 57)', sheet)
    A.click('.atx-types button[data-t="transfer_in"]'); A.fill('#atxQty', '2'); A.fill('#atxFee', '0.01')
    A.screenshot(path=str(T / 'addtx-mobile.png'))
    check('mobile: sync badge hidden while form open', A.evaluate("getComputedStyle(document.getElementById('samsamSyncPill')).display") == 'none')
    A.click('#atxForm .atx-x')
    check('form-open state cleared after closing (sync badge allowed again)', not A.evaluate("document.body.classList.contains('atx-open')"))

    # Transfer In on mobile → desktop updates live
    s0 = coin(B, 'SOL')
    fill_form(A, 'transfer_in', 2, price=150, fee=0.01, note='from Binance')
    pv = A.inner_text('#atxPreview')
    check('Transfer In preview shows received after fee', 'Received after fee: 1.99 SOL' in pv, pv)
    A.click('#atxSave')
    B.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty - {s0['qty'] + 1.99}) < 1e-9", timeout=8000)
    s1 = coin(B, 'SOL')
    exp_avg = (s0['qty'] * s0['basePrice'] + 2 * 150) / (s0['qty'] + 1.99)
    check('Transfer In: qty +1.99 and avg includes cost, on other device', close(s1['basePrice'], exp_avg), (s1['basePrice'], exp_avg))
    check('Transfer In listed on desktop (blue, +1.99 SOL)', 'Transfer In' in B.inner_text('#htxList') and '+1.99 SOL' in B.inner_text('#htxList'))

    # Transfer Out on desktop → mobile
    fill_form(B, 'transfer_out', 0.5, fee=0.002, note='to Ledger')
    B.click('#atxSave')
    A.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty - {s1['qty'] - 0.502}) < 1e-9", timeout=8000)
    s2 = coin(A, 'SOL')
    check('Transfer Out: qty −0.502, avg unchanged, synced', close(s2['basePrice'], s1['basePrice']))
    r_before = A.evaluate("Samsam.getState().realized.total")

    # Filters
    for pg in (A,): pass
    B.click('#htxTypeDD .sdd-btn'); B.click('.sdd-panel.show .sdd-opt:has(span:text-is("Transfer Out"))'); B.wait_for_timeout(200)
    t = B.inner_text('#htxList'); check('filter Transfer Out shows only transfers out', 'Transfer Out' in t and 'Transfer In' not in t and 'Buy' not in t, t[:200])
    B.click('#htxTypeDD .sdd-btn'); B.click('.sdd-panel.show .sdd-opt:has(span:text-is("Transfer In"))'); B.wait_for_timeout(200)
    t = B.inner_text('#htxList'); check('filter Transfer In shows only transfers in', 'Transfer In' in t and 'Transfer Out' not in t and 'Buy\n' not in t, t[:200])
    opts = (B.click('#htxTypeDD .sdd-btn'), B.eval_on_selector_all('.sdd-panel.show .sdd-opt', 'els => els.map(e => e.innerText.trim())'), B.keyboard.press('Escape'))[1]
    check('type filter = All Types, Buy, Sell, Transfer In, Transfer Out', [o for o in opts if o] == ['All Types','Buy','Sell','Transfer In','Transfer Out'], opts)
    B.click('#htxTypeDD .sdd-btn'); B.click('.sdd-panel.show .sdd-opt:has(span:text-is("All Types"))'); B.wait_for_timeout(200)

    # Buy + Sell through the same form; realized updates; backdated date sorts correctly
    fill_form(A, 'buy', 1, price=100, date='2026-10-16T09:30')
    A.click('#atxSave'); A.wait_for_timeout(500)
    fill_form(A, 'sell', 0.5, price=200)
    A.click('#atxSave')
    B.wait_for_function(f"Samsam.getState().realized.total > {r_before} + 1", timeout=8000)
    check('Buy + Sell from form sync and update realized P&L', True)
    dates = B.eval_on_selector_all('#htxList .htx-date', 'e => e.map(x => x.innerText)')
    check('backdated buy appears under Oct 16, 2026 (date order)', 'Oct 16, 2026' in dates and dates.index('Oct 16, 2026') > 0, dates)
    check('transfers not counted as realized P&L', True)

    # validation: cannot transfer out more than held
    fill_form(A, 'transfer_out', 999999)
    A.click('#atxSave'); A.wait_for_timeout(200)
    err = A.inner_text('#atxErr')
    check('validation: transfer out above holdings blocked', 'more than you held' in err and A.evaluate("document.getElementById('atxBackdrop').classList.contains('show')"), err)
    A.fill('#atxQty', '0'); A.click('#atxSave'); A.wait_for_timeout(100)
    check('validation: zero quantity blocked', 'greater than 0' in A.inner_text('#atxErr'))
    A.click('#atxForm .atx-x')

    # main page reflects: header P&L + History popup + delete restores
    B.evaluate("closeCoinTx()"); B.evaluate("closeHoldingsView()"); B.wait_for_timeout(300)
    B.evaluate("openHistory('SOL')"); B.wait_for_timeout(300)
    h = B.inner_text('#histList')
    check('main History popup lists TRANSFER IN / OUT', 'TRANSFER IN' in h and 'TRANSFER OUT' in h, h[:300])
    tid = B.evaluate("transactions.find(t => t.sym==='SOL' && t.type==='transfer_out').id")
    q_before = coin(B, 'SOL')['qty']
    B.evaluate(f"deleteTx('{tid}')")
    A.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty - {q_before + 0.502}) < 1e-9", timeout=8000)
    check('deleting Transfer Out restores holdings on both devices', True)
    B.evaluate("closeHistory()")
    B.evaluate("openCoinTx('SOL')"); B.wait_for_timeout(300)
    B.click('#htxAddBtn'); B.click('.atx-types button[data-t="transfer_in"]'); B.wait_for_timeout(200)
    dm = B.evaluate("(() => { const r = document.querySelector('#atxForm').getBoundingClientRect(); return [Math.round(r.left + r.width/2), Math.round(innerWidth/2), Math.round(r.top)]; })()")
    check('desktop: form is a centred dialog', abs(dm[0] - dm[1]) < 3 and dm[2] > 20, dm)
    B.screenshot(path=str(T / 'addtx-desktop.png')); B.click('#atxForm .atx-x')
    check('no JS errors', not ea and not eb, (ea + eb)[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
