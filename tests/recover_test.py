"""Old-tab scenario: changes saved by the previous app version (localStorage) never reached Firebase.
recover.html must find them and restore them to every device."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    A = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(A)
    B = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True); S.setup(B)
    a = A.new_page(); a.on('dialog', lambda d: d.accept())
    a.goto(SITE + '/index.html'); a.wait_for_selector('#samsamSignInBtn'); a.click('#samsamSignInBtn')
    a.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    cloud = a.evaluate("Object.fromEntries(Samsam.getState().portfolio.map(c=>[c.sym,[c.qty,c.basePrice]]))")
    # Simulate an OLD tab: it saved SUI + ETH changes and a new buy only to this device's localStorage
    a.evaluate("""() => {
      // what the old app would have saved on this device: the same portfolio + history as the cloud…
      const st = Samsam.getState();
      localStorage.setItem('samsam_pf_v4', JSON.stringify({ coins: st.portfolio.map(c => ({ sym: c.sym, qty: c.qty, basePrice: c.basePrice, cat: c.cat, currentPrice: c.currentPrice })), lastSave: new Date().toISOString() }));
      localStorage.setItem('samsam_tx_v1', JSON.stringify(st.transactions.filter(t => t.type === 'buy' || t.type === 'sell')));
      // …then the old tab changed SUI and ETH and recorded an ETH buy that never reached Firebase
      const pf = JSON.parse(localStorage.getItem('samsam_pf_v4'));
      const sui = pf.coins.find(c=>c.sym==='SUI'), eth = pf.coins.find(c=>c.sym==='ETH');
      sui.qty = 300.09; sui.basePrice = 1.0172; eth.qty = 0.5; eth.basePrice = 3100;
      pf.lastSave = new Date().toISOString(); localStorage.setItem('samsam_pf_v4', JSON.stringify(pf));
      const tx = JSON.parse(localStorage.getItem('samsam_tx_v1') || '[]');
      tx.push({ id: '1792999999999_oldtab', sym: 'ETH', type: 'buy', qty: 0.48464, price: 3120, total: 0.48464*3120, date: new Date(Date.now()-3*3600e3).toISOString(), note: '' });
      localStorage.setItem('samsam_tx_v1', JSON.stringify(tx));
    }""")
    b = B.new_page(); b.goto(SITE + '/index.html'); b.wait_for_selector('#samsamSignInBtn'); b.click('#samsamSignInBtn')
    b.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    # Recover page via the sync menu link
    a.click('.ss-sync-hdr >> visible=true'); a.wait_for_timeout(200)   # the pill only shows offline / on errors; the header cloud button opens the same menu
    a.click('#samsamSettings'); a.wait_for_selector('#cpSet')
    check('Settings offers "Recover Data"', a.locator('#stRow_recover').count() == 1); a.keyboard.press('Escape')
    a.goto(SITE + '/recover.html'); a.wait_for_function("window.Samsam && Samsam.isReady()", timeout=10000)
    a.click('#loadDevice'); a.wait_for_selector('#results:not(.hidden)')
    txt = a.inner_text('#txTable'); check('finds the missing ETH buy', 'ETH' in txt and 'BUY' in txt and '0.48464' in txt, txt[:200])
    diff = a.eval_on_selector_all('#coinTable tr.diff td:nth-child(2) strong', 'e => e.map(x=>x.innerText)')
    check('flags SUI and ETH as different (only those)', sorted(diff) == ['ETH', 'SUI'], diff)
    sui_after = a.evaluate("(() => { const r=[...document.querySelectorAll('#coinTable tr')].find(r=>/\\bSUI\\b/.test(r.innerText)); return r.cells[4].innerText; })()")
    check('“After” preview shows 300.09 for SUI', '300.09' in sui_after, sui_after)
    check('unchanged coins hidden by default', a.evaluate("getComputedStyle([...document.querySelectorAll('#coinTable tr')].find(r=>/\\bBTC\\b/.test(r.innerText))).display") == 'none')
    a.screenshot(path=str(T / 'recover-desktop.png'), full_page=True)
    nothing_yet = b.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SUI').qty")
    check('nothing changed before pressing Restore', abs(nothing_yet - cloud['SUI'][0]) < 1e-9)
    a.click('#applyBtn'); a.wait_for_selector('#ssPw #ssPwA'); a.fill('#ssPwA', 'safety-pass-1'); a.fill('#ssPwB', 'safety-pass-1')
    with a.expect_download() as dl: a.click('#ssPw button[type=submit]')
    check('cloud backup downloaded before restoring', dl.value.suggested_filename.startswith('cute-portfolio-backup-'))
    b.wait_for_function("Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SUI').qty - 300.09) < 1e-9", timeout=8000)
    st = b.evaluate("(() => { const p=Samsam.getState().portfolio; const f=s=>p.find(c=>c.sym===s); return {sui:[f('SUI').qty,f('SUI').basePrice], eth:[f('ETH').qty,f('ETH').basePrice], btc:[f('BTC').qty,f('BTC').basePrice], ethTx: Samsam.getState().transactions.some(t=>t.id==='1792999999999_oldtab')}; })()")
    check('other device: SUI = 300.09 @ 1.0172', abs(st['sui'][0]-300.09)<1e-9 and abs(st['sui'][1]-1.0172)<1e-9, st)
    check('other device: ETH = 0.5 @ 3100 and ETH buy in history', abs(st['eth'][0]-0.5)<1e-9 and abs(st['eth'][1]-3100)<1e-9 and st['ethTx'], st)
    check('untouched coins unchanged (BTC)', abs(st['btc'][0]-cloud['BTC'][0])<1e-9 and abs(st['btc'][1]-cloud['BTC'][1])<1e-9, st)
    a.wait_for_timeout(1200)
    check('re-compare shows nothing left to restore', a.eval_on_selector_all('#coinTable tr.diff', 'e => e.length') == 0 and 'No missing' in a.inner_text('#txMeta'))
    # Running it again must not duplicate anything
    before = b.evaluate("Samsam.getState().transactions.length")
    a.click('#loadDevice'); a.wait_for_timeout(500)
    check('second run: Restore disabled (nothing selected)', a.evaluate("document.getElementById('applyBtn').disabled"))
    check('no duplicate transactions', b.evaluate("Samsam.getState().transactions.length") == before)
    # backup-file source
    bk = {'app': 'samsam-portfolio', 'kind': 'device-backup', 'legacy': {'coins': [{'sym': 'SUI', 'qty': 310, 'basePrice': 1.01, 'cat': 'layer1'}], 'transactions': []}}
    pth = T / 'bk.json'; pth.write_text(json.dumps(bk))
    a.click('.src-tabs button[data-src="file"]'); a.set_input_files('#fileIn', str(pth)); a.wait_for_timeout(500)
    check('backup file source compares too (SUI 310)', '310' in a.inner_text('#coinTable'))
    b.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
