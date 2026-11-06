"""End-to-end sync test: two devices (desktop + mobile) against the fake Firestore server."""
import json, re, sys, time, urllib.request, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))

ROOT = pathlib.Path(__file__).resolve().parent.parent
T = pathlib.Path(__file__).parent
FAKE = T / 'fakefs'
ORIG = T / 'original-index.html'   # the app before the cloud sync (commit 38175d5): e2e.py signs in there first to seed the fake database
SITE = 'http://127.0.0.1:8000'
SRV = 'http://127.0.0.1:8787'
results = []

def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else f'  -> {detail}'), flush=True)

def srv(path):
    return json.load(urllib.request.urlopen(SRV + path))

# Price feed: deterministic prices for every CoinGecko id the app asks for.
def price_route(route):
    url = route.request.url
    ids = re.search(r'ids=([^&]+)', url)
    data = {}
    if ids:
        for i in urllib.request.unquote(ids.group(1)).split(','):
            data[i] = {'usd': 2.0 if i != 'bitcoin' else 100000.0, 'usd_24h_change': 1.5}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(data))

def setup(ctx):
    ctx.add_init_script("window.__cpAutoAnswer = (kind, msg, o) => { (window.__cpLog = window.__cpLog || []).push(msg); return kind === 'prompt' ? (o && o.value != null ? String(o.value) : '') : true; };")
    cfg = "export const FIREBASE_CONFIG={apiKey:'test',authDomain:'x',projectId:'samsam-test',appId:'x'};export const ALLOWED_EMAILS=['owner@example.com'];"
    ctx.route(re.compile(r'.*/firebase-config\.js(\?.*)?$'), lambda r: r.fulfill(status=200, content_type='text/javascript', body=cfg))
    for n in ('app', 'auth', 'firestore'):
        body = (FAKE / f'firebase-{n}.js').read_text()
        def mk(b):
            return lambda r: r.fulfill(status=200, content_type='text/javascript', body=b, headers={'access-control-allow-origin': '*'})
        ctx.route(f'https://www.gstatic.com/firebasejs/13.0.0/firebase-{n}.js', mk(body))
    ctx.route('**/orig/index.html', lambda r: r.fulfill(status=200, content_type='text/html', body=ORIG.read_text()))
    ctx.route('https://api.coingecko.com/api/v3/simple/price**', price_route)
    ctx.route('https://api.coingecko.com/api/v3/coins/**', lambda r: r.fulfill(status=200, content_type='application/json',
              body=json.dumps({'image': {'small': 'https://img.test/logo.png'}, 'market_data': {'current_price': {'usd': 2.0}}})))
    ctx.route('https://api.coingecko.com/api/v3/coins/markets**', lambda r: r.fulfill(status=200, content_type='application/json',
              body=json.dumps([{'id': 'bitcoin', 'current_price': 100000.0, 'price_change_percentage_24h': 2.45, 'high_24h': 101250.0, 'low_24h': 97800.0}])))
    ctx.route(re.compile(r'^https?://(?!127\.0\.0\.1)(?!www\.gstatic\.com/firebasejs)(?!api\.coingecko\.com).*'), lambda r: r.abort())

def state(page):
    return page.evaluate("""() => { const d = Samsam.getState();
      return { pf: d.portfolio.map(c => [c.sym, c.qty, c.basePrice]), tx: d.transactions.length,
               realized: d.realized.total, accum: d.accumPlan.map(a => [a.sym, a.targetQty]),
               removed: d.archivedCoins.map(c => c.sym), perf: d.perfSnaps.length }; }""")

def wait_for(page, js, timeout=8000):
    try: page.wait_for_function(js, timeout=timeout)
    except Exception:
        print('WAIT FAILED:', js[:120], '| setup msg:', page.evaluate("(document.getElementById('samsamSetupMsg')||{}).textContent"), '| pill:', pill(page)); raise

def pill(page):
    return page.eval_on_selector('#samsamSyncPill', 'e => e.dataset.s + " | " + e.textContent')

def close(a, b, tol=1e-9):
    return abs(a - b) <= tol * max(1, abs(a), abs(b))

def same_pf(a, b):
    if len(a) != len(b): return False
    da = {s: (q, p) for s, q, p in a}; db = {s: (q, p) for s, q, p in b}
    return da.keys() == db.keys() and all(close(da[k][0], db[k][0]) and close(da[k][1], db[k][1]) for k in da)

urllib.request.urlopen(SRV + '/reset').read()

with sync_playwright() as p:
    br = p.chromium.launch()
    desk = br.new_context(viewport={'width': 1366, 'height': 900})
    mob = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=3)
    for c in (desk, mob): setup(c)
    errors = []
    A = desk.new_page(); B = mob.new_page()
    for name, pg in (('desktop', A), ('mobile', B)):
        pg.on('pageerror', lambda e, n=name: errors.append(f'{n}: {e}'))
        pg.on('dialog', lambda d: d.accept())

    # ── 1. Build an authentic legacy dataset with the ORIGINAL app on the desktop ──
    A.goto(SITE + '/orig/index.html'); A.wait_for_timeout(1500)
    A.evaluate("""() => {
      openBuyMore('BTC'); bmQty.value='0.001'; bmPrice.value='100000'; applyBuyMore();
      openSell('BTC'); smQty.value='0.002'; smPrice.value='110000'; applySell();
      openSell('SOL'); smQty.value='1'; smPrice.value='150'; applySell();          // sell of a baseline coin with no buys
      updateQty('DOGE', 3000);                                                       // manual inline edit
      openBuyMore('DOGE'); bmQty.value='100'; bmPrice.value='0.2'; applyBuyMore();
      openAddCoin(); acSym.value='TEST'; acQty.value='10'; acPrice.value='5'; acCgId.value='test-coin'; applyAddCoin();
      removeCoin('VET'); confirmRemove();
      localStorage.setItem('samsam_acc_v1', JSON.stringify([{sym:'BTC',name:'Bitcoin',targetQty:0.05,addedAt:'2026-10-16'}]));
    }""")
    A.wait_for_timeout(500)
    legacy = A.evaluate("() => JSON.parse(localStorage.getItem('samsam_pf_v4'))")
    legacy_pf = [[c['sym'], c['qty'], c['basePrice']] for c in legacy['coins']]
    legacy_tx = len(A.evaluate("() => JSON.parse(localStorage.getItem('samsam_tx_v1'))"))
    check('legacy data created', len(legacy_pf) > 40 and legacy_tx == 5, (len(legacy_pf), legacy_tx))

    # ── 2. New app on desktop: sign-in gate, then one-time import ──
    A.goto(SITE + '/index.html')
    A.wait_for_selector('#samsamSignInBtn', timeout=8000)
    check('sign-in gate shown before login', A.is_visible('#samsamGate'))
    A.click('#samsamSignInBtn')
    A.wait_for_selector('#samsamImpLocal', timeout=8000)
    check('setup panel offers this device\'s data', 'transactions' in A.inner_text('#samsamSetup'))
    A.click('#samsamImpLocal'); A.wait_for_selector('#ssPw #ssPwA')
    A.fill('#ssPwA', 'correct horse 1'); A.fill('#ssPwB', 'correct horse 1')
    with A.expect_download() as dl:
        A.click('#ssPw button[type=submit]')
    enc = json.loads(open(dl.value.path()).read())
    check('automatic backup downloaded before import (encrypted)', dl.value.suggested_filename.startswith('cute-portfolio-device-backup') and enc.get('kind') == 'encrypted-backup' and 'BTC' not in json.dumps(enc), list(enc)[:6])
    wait_for(A, "document.getElementById('samsamSetupMsg') && /Done/.test(document.getElementById('samsamSetupMsg').textContent)")
    wait_for(A, "window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 40")
    sa = state(A)
    check('import: every coin qty/avg identical to old app', same_pf(sa['pf'], legacy_pf),
          [x for x in sa['pf'] if x not in legacy_pf][:3])
    check('import: removed coin stays removed', 'VET' in sa['removed'] and 'VET' not in [x[0] for x in sa['pf']])
    check('import: accumulation target imported', sa['accum'] == [['BTC', 0.05]], sa['accum'])
    dump = srv('/dump')
    check('cloud holds coins, txs, accum, meta', any('/coins/BTC' in k for k in dump) and any('/txs/' in k for k in dump)
          and any('/accum/BTC' in k for k in dump) and any(k.endswith('/meta/info') and v.get('state') == 'done' for k, v in dump.items()))

    # ── 3. Fresh mobile device loads the same cloud portfolio ──
    B.goto(SITE + '/index.html'); B.wait_for_selector('#samsamSignInBtn'); B.click('#samsamSignInBtn')
    wait_for(B, "window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 40")
    sb = state(B)
    check('mobile shows identical holdings to desktop', same_pf(sa['pf'], sb['pf']))
    check('mobile shows identical realized P&L', close(sa['realized'], sb['realized']), (sa['realized'], sb['realized']))
    check('no setup panel on second device', not B.is_visible('#samsamSetup'))
    tot = lambda pg: pg.inner_text('#totalUsd')
    B.wait_for_timeout(800)
    check('header total identical on both devices', tot(A) == tot(B), (tot(A), tot(B)))

    def coin(pg, sym):
        return pg.evaluate(f"() => Samsam.getState().portfolio.find(c => c.sym === '{sym}')")

    # ── 4. Mobile → cloud → desktop, live (no reload) ──
    before = coin(A, 'ETH')['qty']
    B.evaluate("() => { openAddTx('buy','ETH'); atxQty.value='0.5'; atxPrice.value='3000'; saveAddTx(); }")
    wait_for(A, f"Samsam.getState().portfolio.find(c=>c.sym==='ETH').qty > {before} + 0.49")
    check('buy on mobile appears on desktop without refresh', True)
    # ── 5. Desktop → cloud → mobile ──
    A.evaluate("() => { openAddTx('sell','ETH'); atxQty.value='0.01'; atxPrice.value='3500'; saveAddTx(); }")
    wait_for(B, f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='ETH').qty - ({before} + 0.49)) < 1e-9")
    check('sell on desktop appears on mobile', True)
    check('realized P&L matches on both after sell', close(state(A)['realized'], state(B)['realized']))
    # inline edits
    ro = A.evaluate("() => { const b=document.querySelector('#tableBody .btn-buy-more[onclick*=\\'ATOM\\']'); const r=b&&b.closest('tr'); return [r ? r.querySelectorAll('input[onchange*=updateQty],input[onchange*=updateBasePrice]').length + r.querySelectorAll('td.ro-num').length*0 : -1, r ? r.querySelectorAll('td.ro-num').length : 0, typeof updateQty]; }")
    check('qty / avg are read-only in table (no inputs, no edit function)', ro[0] == 0 and ro[1] >= 2 and ro[2] == 'undefined', ro)
    roc = B.evaluate("() => { const b=document.querySelector('#coinsStack .btn-buy-more[onclick*=\\'ATOM\\']'); const c=b&&b.closest('.coin-card'); return c ? c.querySelectorAll('input[type=number]').length : -1; }")
    check('qty / avg are read-only on mobile cards', roc == 0, roc)
    B.evaluate("() => updateNote('ATOM', 'staking')")
    wait_for(A, "Samsam.getState().portfolio.find(c=>c.sym==='ATOM').notes === 'staking'")
    check('note edit syncs', True)

    # ── 6. Delete a transaction → correct recalculation on both ──
    eth_open = A.evaluate("() => Samsam.getState().coins.find(c=>c.sym==='ETH').opening")
    buy_id = A.evaluate("() => Samsam.getState().transactions.find(t=>t.sym==='ETH'&&t.type==='buy').id")
    B.evaluate(f"() => deleteTx('{buy_id}')")
    wait_for(A, f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='ETH').qty - ({eth_open['qty']} - 0.01)) < 1e-9")
    e = coin(A, 'ETH')
    check('delete buy: back to opening position minus sell (opening kept)', close(e['qty'], eth_open['qty'] - 0.01) and close(e['basePrice'], eth_open['avg']), e)

    # ── 7. Remove coin / re-add coin ──
    B.evaluate("() => { removeCoin('KAVA'); confirmRemove(); }")
    wait_for(A, "!Samsam.getState().portfolio.find(c=>c.sym==='KAVA')")
    kava_prev = A.evaluate("Samsam.getState().archivedCoins.find(c=>c.sym==='KAVA') ? Samsam.getState().archivedCoins.find(c=>c.sym==='KAVA').qty : 0")
    A.evaluate("() => { openAddCoin(); acSym.value='KAVA'; acQty.value='50'; acPrice.value='0.1'; applyAddCoin(); }")
    wait_for(B, f"(c => c && Math.abs(c.qty - ({kava_prev}+50)) < 1e-9)(Samsam.getState().portfolio.find(c=>c.sym==='KAVA'))")
    kt = B.evaluate("Samsam.getState().transactions.filter(t=>t.sym==='KAVA').map(t=>t.type)")
    check('re-added coin recorded as a normal Buy (no Edit), synced', kt[-1] == 'buy' and 'adjust' not in kt, kt)

    # ── 8. Simultaneous offline edits on both devices, then reconnect ──
    sol0 = coin(A, 'SOL')['qty']
    A.evaluate("() => __fakeGoOffline()"); B.evaluate("() => __fakeGoOffline()")
    A.evaluate("() => { openAddTx('buy','SOL'); atxQty.value='1'; atxPrice.value='100'; saveAddTx(); }")
    B.evaluate("() => { openAddTx('buy','SOL'); atxQty.value='2'; atxPrice.value='200'; saveAddTx(); }")
    A.wait_for_timeout(300)
    check('offline: change shows immediately on that device', close(coin(A, 'SOL')['qty'], sol0 + 1))
    check('offline: status pill says changes are waiting', 'waiting' in pill(A) or 'Offline' in pill(A), pill(A))
    A.evaluate("() => __fakeGoOnline()"); B.evaluate("() => __fakeGoOnline()")
    js = f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty - ({sol0}+3)) < 1e-9"
    wait_for(A, js); wait_for(B, js)
    check('simultaneous offline buys on both devices: both kept, no lost update', True)
    A.wait_for_timeout(500)
    check('both devices converge to identical portfolio', same_pf(state(A)['pf'], state(B)['pf']))
    wait_for(A, "document.getElementById('samsamSyncPill').dataset.s==='synced'")
    check('status pill returns to Synced', True)

    # ── 9. Accumulation page saves targets without touching portfolio data ──
    n_coins_before = len([k for k in srv('/dump') if '/coins/' in k])
    C = desk.new_page(); C.on('pageerror', lambda e: errors.append(f'accum: {e}'))
    C.goto(SITE + '/accumulation.html')
    wait_for(C, "window.Samsam && Samsam.isReady() && accumPlan.length === 1")
    C.evaluate("() => { commitTarget(0, '0.08'); saveAccumPlan(true); }")
    wait_for(B, "Samsam.getState().accumPlan[0] && Samsam.getState().accumPlan[0].targetQty === 0.08")
    d2 = srv('/dump')
    check('accumulation edit syncs to mobile', True)
    check('accumulation save leaves cloud portfolio intact (old bug #1)', len([k for k in d2 if '/coins/' in k]) == n_coins_before
          and any('/txs/' in k for k in d2))
    # concurrent target edits on different coins merge
    B.goto(SITE + '/accumulation.html'); wait_for(B, "window.Samsam && Samsam.isReady() && accumPlan.length === 1")
    C.evaluate("() => { accumPlan.push({sym:'ETH',name:'Ethereum',targetQty:1,addedAt:'x'}); saveAccumPlan(true); }")
    B.evaluate("() => { accumPlan.push({sym:'SOL',name:'Solana',targetQty:5,addedAt:'x'}); saveAccumPlan(true); }")
    C.wait_for_timeout(1500)
    accs = sorted(k.split('/')[-1] for k in srv('/dump') if '/accum/' in k)
    check('targets added on two devices at once are both kept', accs == ['BTC', 'ETH', 'SOL'], accs)

    # ── 10. Allocation + performance pages show the same cloud data; no corruption ──
    pf_before = state(A)['pf']
    D = mob.new_page(); D.on('pageerror', lambda e: errors.append(f'alloc: {e}'))
    D.goto(SITE + '/allocation.html'); D.wait_for_timeout(2500)   # old link → Holdings on its Allocation switch
    alloc_count = str(D.locator('#hovAssetList .hov-asset-row').count())
    check('allocation (inside Holdings) shows cloud coin count', alloc_count == str(len(pf_before)) and D.get_attribute('#holdingsOverlay', 'data-mode') == 'alloc', (alloc_count, len(pf_before)))
    B.goto(SITE + '/index.html'); wait_for(B, "window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 40")
    check('main page intact after visiting allocation (old bug #2)', same_pf(state(B)['pf'], pf_before))
    E = desk.new_page(); E.on('pageerror', lambda e: errors.append(f'perf: {e}'))
    E.goto(SITE + '/performance.html'); E.wait_for_timeout(1500)
    rp = E.evaluate("() => calcRealizedPnl().total")
    check('performance page realized P&L = main page', close(rp, state(A)['realized']), (rp, state(A)['realized']))

    # ── 11. Persistence: reload and fresh browser session ──
    A.reload(); wait_for(A, "window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 40")
    check('data identical after refresh', same_pf(state(A)['pf'], pf_before))
    mob2 = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True); setup(mob2)
    F = mob2.new_page(); F.goto(SITE + '/index.html'); F.wait_for_selector('#samsamSignInBtn'); F.click('#samsamSignInBtn')
    wait_for(F, "window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 40")
    check('brand-new browser (restarted device) loads latest cloud data', same_pf(state(F)['pf'], pf_before))
    F.evaluate("() => Samsam.signOut()"); F.wait_for_selector('#samsamSignInBtn')
    F.click('#samsamSignInBtn'); wait_for(F, "Samsam.isReady() && Samsam.getState().portfolio.length > 40")
    check('log out and back in keeps data', same_pf(state(F)['pf'], pf_before))

    # ── 11b. Same figures on both devices, incl. manually priced coin without a live feed ──
    A.evaluate("() => { openAddCoin(); acSym.value='NOFEED'; acQty.value='4'; acPrice.value='5'; applyAddCoin(); }")
    wait_for(F, "(c => c && c.currentPrice === 5)(Samsam.getState().portfolio.find(c=>c.sym==='NOFEED'))")
    A.evaluate("() => updatePrice('NOFEED', 7)")
    wait_for(F, "Samsam.getState().portfolio.find(c=>c.sym==='NOFEED').currentPrice === 7")
    check('manual price syncs to other device', True)
    A.wait_for_timeout(1500); F.wait_for_timeout(500)
    pa = A.evaluate("() => Object.fromEntries(Samsam.getState().portfolio.map(c=>[c.sym,[c.qty,c.currentPrice]]))")
    pf_ = F.evaluate("() => Object.fromEntries(Samsam.getState().portfolio.map(c=>[c.sym,[c.qty,c.currentPrice]]))")
    check('header totals identical on desktop and new mobile', A.inner_text('#totalUsd') == F.inner_text('#totalUsd'),
          (A.inner_text('#totalUsd'), F.inner_text('#totalUsd')))
    pf_before = state(A)['pf']

    # ── 12. Failed save is reported, not swallowed ──
    urllib.request.urlopen(SRV + '/fail?n=1').read()
    A.evaluate("() => { openAddTx('buy','DOT'); atxQty.value='1'; atxPrice.value='1'; saveAddTx(); }")
    wait_for(A, "document.getElementById('samsamSyncPill').dataset.s==='error'")
    check('failed cloud save shows a visible error', True)

    # ── 13. Charts: snapshots stored in cloud and shared ──
    A.evaluate("() => { snapshotDue = true; takeSnapshotsIfDue(); }")
    wait_for(B, "Samsam.getState().perfSnaps.length >= 1")
    check('performance snapshot shared across devices', True)

    # ── 14. Mobile layout sanity ──
    B.goto(SITE + '/index.html'); wait_for(B, "Samsam.isReady() && Samsam.getState().portfolio.length > 40"); B.wait_for_timeout(500)
    sw = B.evaluate("() => document.documentElement.scrollWidth")
    check('mobile: no horizontal page overflow', sw <= 392, sw)
    pb = B.eval_on_selector('#samsamSyncPill', 'e => { const r = e.getBoundingClientRect(); return [r.right, r.bottom]; }')
    check('mobile: sync pill on screen', pb[0] <= 390 and pb[1] <= 844, pb)
    B.screenshot(path=str(T / 'mobile.png')); A.screenshot(path=str(T / 'desktop.png'))

    check('no JavaScript errors on any page', not errors, errors[:5])
    br.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
