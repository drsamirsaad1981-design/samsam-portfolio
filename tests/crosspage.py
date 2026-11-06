"""Every action must reach every page: main header/cards/table, Holdings list, coin Transactions,
Allocation, Performance, Accumulation — open in other tabs and on another device, without reload."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
fmtq = lambda q: f"{q:,.4f}".rstrip('0').rstrip('.')

def login(ctx, url='/index.html'):
    pg = ctx.new_page(); pg.on('dialog', lambda d: d.accept())
    pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    if url != '/index.html': pg.goto(SITE + url); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=10000)
    pg.wait_for_timeout(1200); return pg
def open_page(ctx, url):
    pg = ctx.new_page(); pg.goto(SITE + url); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=10000); pg.wait_for_timeout(1200); return pg

# What each page currently SHOWS for SUI (read from the screen, not from memory)
READ = {
 'main-card':  "(() => { const c=[...document.querySelectorAll('#coinsStack .coin-card')].find(e=>/^SUI/.test(e.querySelector('.ast-sym').textContent)); if (!c) return null; const q=c.querySelector('.card-stats-grid .hold-qty'); return q ? +q.innerText.replace(/,/g,'').split(' ')[0] : null; })()",
 'main-table': "(() => { const r=[...document.querySelectorAll('#tableBody tr')].find(e=>/\\bSUI\\b/.test(e.innerText)); return r ? +r.querySelector('.hold-qty').innerText.replace(/,/g,'').split(' ')[0] : null; })()",
 'holdings':   "(() => { const r=document.querySelector('#hovAssetList .hov-asset-row[data-sym=SUI]'); return r ? r.querySelector('.hold-qty').innerText : null; })()",
 'cointx':     "document.getElementById('htxHoldings') && document.getElementById('htxHoldings').innerText",
 'allocation': "(() => { const r=[...document.querySelectorAll('#holdingsOverlay[data-mode=alloc] #hovAssetList .hold-qty')].find(e=>/SUI/.test(e.innerText)); return r ? r.innerText : null; })()",
 'performance':"(() => { const r=[...document.querySelectorAll('#coinList .hold-qty')].find(e=>/SUI/.test(e.innerText)); return r ? r.innerText : null; })()",
 'accumulation':"(() => { const row=[...document.querySelectorAll('#accTableBody tr')].find(e=>/\\bSUI\\b/.test(e.innerText)); return row ? row.innerText.replace(/\\s+/g,' ') : null; })()",
}
def num_in(text):
    return [float(x.replace(',', '')) for x in re.findall(r'[\d,]+\.?\d*', text or '')]

with sync_playwright() as p:
    br = p.chromium.launch()
    desk = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(desk)
    mob = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(mob)
    main = login(desk); main.evaluate("applyView('table')")
    phone = login(mob); phone.evaluate("applyView('cards')")
    # SUI on the accumulation plan so that page has something to show
    main.evaluate("Samsam.saveAccumPlan([...Samsam.getState().accumPlan, {sym:'SUI', name:'Sui', targetQty: 500, addedAt:'x'}])"); main.wait_for_timeout(500)
    hold = open_page(desk, '/index.html'); hold.evaluate("openHoldingsView()")
    ctx_tx = open_page(mob, '/index.html'); ctx_tx.evaluate("openCoinTx('SUI')")
    alloc = open_page(desk, '/allocation.html')
    alloc.evaluate("(() => { const el=[...document.querySelectorAll('.legend-item')].find(e=>/Layer 1/.test(e.innerText)); el && el.click(); })()")
    perf = open_page(mob, '/performance.html')
    acc = open_page(desk, '/accumulation.html')
    pages = {'main-table': main, 'main-card': phone, 'holdings': hold, 'cointx': ctx_tx, 'allocation': alloc, 'performance': perf, 'accumulation': acc}

    def expect_all(label, qty, price=None):
        st = main.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SUI')")
        price = st['currentPrice']; val = qty * price
        for name, pg in pages.items():
            ok = False; seen = None
            for _ in range(25):
                if name == 'allocation':
                    pg.evaluate("(() => { const el=[...document.querySelectorAll('.legend-item')].find(e=>/Layer 1/.test(e.innerText)); el && !el.classList.contains('active') && el.click(); })()")
                seen = pg.evaluate(READ[name])
                if name in ('main-table', 'main-card'): ok = seen is not None and abs(seen - qty) < 1e-6
                elif name == 'cointx': ok = seen is not None and abs(num_in(seen)[0] - val) < 0.02
                else: ok = seen is not None and any(abs(n - qty) < 1e-3 * max(1, qty) for n in num_in(seen))
                if ok: break
                pg.wait_for_timeout(200)
            check(f'{label}: {name} shows SUI {fmtq(qty)}', ok, seen)

    q0 = main.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SUI').qty")
    expect_all('initial', q0)
    # 1) inline qty edit on desktop table
    main.evaluate("openAddTx('buy','SUI'); atxQty.value='48.5'; atxPrice.value='1'; saveAddTx();"); expect_all('buy (desktop)', 300)
    # 2) buy from phone card button
    phone.evaluate("openAddTx('buy','SUI'); atxQty.value='10'; atxPrice.value='1.5'; saveAddTx();"); expect_all('buy (phone)', 310)
    # 3) sell from coin tx screen
    ctx_tx.evaluate("openAddTx('sell','SUI'); atxQty.value='5'; atxPrice.value='2'; saveAddTx();"); expect_all('sell (coin screen)', 305)
    # 4) transfer in / out from main page
    main.evaluate("openTransferIn('SUI'); atxQty.value='20'; atxPrice.value='1'; atxFee.value='0'; saveAddTx();"); expect_all('transfer in (desktop)', 325)
    phone.evaluate("openTransferOut('SUI'); atxQty.value='25'; atxFee.value='0'; saveAddTx();"); expect_all('transfer out (phone)', 300)
    # 5) delete a transaction from the History popup
    tid = main.evaluate("transactions.filter(t=>t.sym==='SUI'&&t.type==='transfer_out').pop().id")
    main.evaluate(f"deleteTx('{tid}')"); expect_all('delete tx', 325)
    # 6) reset to baseline
    main.evaluate("Samsam.resetToBaseline(BASE_PORTFOLIO)"); base = main.evaluate("BASE_PORTFOLIO.find(c=>c.sym==='SUI').qty"); expect_all('reset', base)
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
