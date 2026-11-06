"""Audit: the five cross-device tests from the "Master Production Directive", run on desktop (1366px) and phone (390px)
open at the same time on the same account — plus tab-switch speed in the app shell."""
import sys, pathlib, time, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; rep = {}
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def wait_until(pg, js, timeout=8.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if pg.evaluate(js): return round((time.time() - t0) * 1000)
        except Exception: pass
        pg.wait_for_timeout(15)
    return None
def coin(pg, sym): return pg.evaluate(f"(()=>{{const c=Samsam.getState().portfolio.find(c=>c.sym==='{sym}');return c?{{qty:c.qty,avg:c.basePrice,cost:c.qty*c.basePrice,price:c.currentPrice}}:null}})()")
with sync_playwright() as p:
    br = p.chromium.launch()
    D = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(D)
    M = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(M)
    d, m = D.new_page(), M.new_page(); errs = []
    for pg in (d, m):
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)

    # ── TEST 1: buy on the phone → desktop updates by itself; totals / avg match 100% ──
    b0 = coin(d, 'BTC'); tot0 = d.inner_text('#totalUsd')
    m.evaluate("Samsam.addTx('BTC', 'buy', 0.05, 80000, 'qa-buy')")
    ms = wait_until(d, f"Math.abs(((Samsam.getState().portfolio.find(c=>c.sym==='BTC')||{{}}).qty||0) - {b0['qty'] + 0.05}) < 1e-12")
    msui = wait_until(d, f"document.getElementById('totalUsd').innerText !== {json.dumps(tot0)}")
    bd, bm = coin(d, 'BTC'), coin(m, 'BTC')
    exp_avg = (b0['qty'] * b0['avg'] + 0.05 * 80000) / (b0['qty'] + 0.05)
    rep['t1_ms'] = ms; rep['t1_ui_ms'] = msui
    check(f'T1 buy on phone shows on desktop without refresh ({ms} ms data, {msui} ms screen)', ms is not None and msui is not None and ms < 1500, (ms, msui))
    check('T1 qty / avg buy price identical on both devices and correct', bd and bm and abs(bd['qty'] - bm['qty']) < 1e-12 and abs(bd['avg'] - bm['avg']) < 1e-9 and abs(bd['avg'] - exp_avg) < 1e-6, (bd, bm, exp_avg))
    wait_until(m, f"document.getElementById('totalUsd').innerText === document.getElementById('totalUsd').innerText", 1)
    m.wait_for_timeout(400)
    check('T1 Total Portfolio text identical on both screens', d.inner_text('#totalUsd') == m.inner_text('#totalUsd'), (d.inner_text('#totalUsd'), m.inner_text('#totalUsd')))

    # ── TEST 2: edit the SOL target on desktop (Plan page) → phone Plan page updates by itself ──
    dp, mp = D.new_page(), M.new_page()
    for pg in (dp, mp):
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    plan = dp.evaluate("Samsam.getState().accumPlan.map(e=>[e.sym,e.targetQty])")
    sol_qty = coin(dp, 'SOL')['qty']
    new_t = 7 if dict(plan).get('SOL') != 7 else 8
    idx = dp.evaluate("Samsam.getState().accumPlan.findIndex(e=>e.sym==='SOL')")
    inp = dp.locator('.card-target-input').nth(idx) if dp.locator('.card-target-input').count() > idx else None
    if inp is not None and inp.is_visible():
        inp.fill(str(new_t)); inp.press('Enter')
    else:
        dp.evaluate(f"commitTarget({idx}, '{new_t}')")
    ms2 = wait_until(mp, f"(Samsam.getState().accumPlan.find(e=>e.sym==='SOL')||{{}}).targetQty === {new_t}")
    pct = round(min(sol_qty / new_t * 100, 100), 1)
    shown = wait_until(mp, f"document.body.innerText.includes('{pct}%') || document.body.innerText.includes('{round(pct)}%')", 4)
    rep['t2_ms'] = ms2
    check(f'T2 target edited on desktop → phone Plan updates by itself ({ms2} ms)', ms2 is not None and ms2 < 1500, ms2)
    check(f'T2 phone shows the new progress ({pct}%)', shown is not None, mp.evaluate("[...document.querySelectorAll('.card-target-input')].map(i=>i.value)"))
    dp.close(); mp.close()

    # ── TEST 3: sell 100% of a coin → zero balance, cost basis 0, no NaN anywhere, both devices ──
    e0 = coin(m, 'ETH')
    m.evaluate(f"Samsam.addTx('ETH', 'sell', {e0['qty']}, 2600, 'qa-sell-all')")
    ms3 = wait_until(d, "((Samsam.getState().portfolio.find(c=>c.sym==='ETH')||{qty:1}).qty) === 0")
    ed = coin(d, 'ETH')
    d.wait_for_timeout(500)
    nan_d = d.evaluate("/NaN|Infinity|undefined/.test(document.body.innerText)"); nan_m = m.evaluate("/NaN|Infinity|undefined/.test(document.body.innerText)")
    rep['t3_eth_after'] = ed
    check(f'T3 sold 100% on phone → desktop qty 0 ({ms3} ms)', ms3 is not None and ed['qty'] == 0, ed)
    check('T3 cost basis 0 (no float dust left)', ed['cost'] == 0, ed)
    check('T3 no NaN / Infinity / undefined on either screen', not nan_d and not nan_m, (nan_d, nan_m))
    rep['t3_avg_kept'] = ed['avg']
    # rebuy after zero → avg is the new price only
    m.evaluate("Samsam.addTx('ETH', 'buy', 0.1, 3000, 'qa-rebuy')"); wait_until(d, "((Samsam.getState().portfolio.find(c=>c.sym==='ETH')||{}).qty) > 0")
    check('T3 buying again after zero starts a fresh average', abs(coin(d, 'ETH')['avg'] - 3000) < 1e-9, coin(d, 'ETH'))

    # ── TEST 4: phone offline → note + transaction locally → back online → desktop gets both, no duplicates ──
    m.evaluate("__fakeGoOffline(); window.dispatchEvent(new Event('offline'))")
    m.evaluate("void Samsam.updateCoin('SOL', { notes: 'qa offline note' })")
    m.evaluate("void Samsam.addTx('SOL', 'buy', 0.5, 150, 'qa-offline-buy')")
    m.wait_for_timeout(300)
    local = m.evaluate("[Samsam.getState().transactions.filter(t=>t.note==='qa-offline-buy').length, (Samsam.getState().portfolio.find(c=>c.sym==='SOL')||{}).notes]")
    check('T4 offline: phone shows the note + buy at once', local[0] == 1 and local[1] == 'qa offline note', local)
    seen_d = d.evaluate("Samsam.getState().transactions.filter(t=>t.note==='qa-offline-buy').length")
    check('T4 offline: nothing reached the desktop yet', seen_d == 0, seen_d)
    m.evaluate("__fakeGoOnline(); window.dispatchEvent(new Event('online'))")
    ms4 = wait_until(d, "Samsam.getState().transactions.filter(t=>t.note==='qa-offline-buy').length === 1 && (Samsam.getState().portfolio.find(c=>c.sym==='SOL')||{}).notes === 'qa offline note'", 12)
    d.wait_for_timeout(1500)
    dup = d.evaluate("Samsam.getState().transactions.filter(t=>t.note==='qa-offline-buy').length")
    rep['t4_ms'] = ms4
    check(f'T4 back online → desktop receives note + buy ({ms4} ms after reconnect)', ms4 is not None, ms4)
    check('T4 no duplicates after the queue flushes', dup == 1, dup)

    # ── TEST 5: reload desktop / close + reopen phone → still signed in, latest state, no $0 flash ──
    expect = d.inner_text('#totalUsd')
    seen = []
    d.reload()
    t0 = time.time()
    while time.time() - t0 < 4:
        try: seen.append(d.evaluate("(()=>{const e=document.getElementById('totalUsd'),s=document.getElementById('cpSplash');const cover=!!(s&&getComputedStyle(s).display!=='none'&&!s.classList.contains('hide')&&+getComputedStyle(s).opacity>0.05);return (e&&e.innerText||'')+(cover?' [under loading screen]':'')})()"))
        except Exception: pass
        d.wait_for_timeout(20)
    gate = d.evaluate("!!document.querySelector('#samsamSignInBtn') && getComputedStyle(document.querySelector('#samsamSignInBtn')).display !== 'none' && document.querySelector('#samsamSignInBtn').offsetParent !== null")
    vals = [v for v in dict.fromkeys(seen) if v]
    rep['t5_values_seen'] = vals
    check('T5 desktop reload: still signed in (no sign-in screen)', not gate)
    check('T5 desktop reload: shows the latest total; no $0 ever visible (a $0 under the loading screen is noted, not seen)', d.inner_text('#totalUsd') == expect and not any(v.strip() in ('$0', '$0.00') for v in vals), vals)
    rep['t5_zero_hidden_by_loading_screen'] = any(v.startswith('$0.00 [under') for v in vals)
    m.close(); m2 = M.new_page(); m2.on('pageerror', lambda e: errs.append(str(e)))
    m2.goto(S.SITE + '/index.html')
    ok = wait_until(m2, "!!(window.Samsam && Samsam.isReady())", 8)
    m2.wait_for_timeout(800)
    check('T5 phone closed + reopened: signed in, same total', ok is not None and m2.inner_text('#totalUsd') == expect, (ok, m2.inner_text('#totalUsd'), expect))

    # ── Directive A: tab switching shows content at once (no "Loading your portfolio…" between tabs) ──
    d.wait_for_timeout(2500)   # shell preloads the tabs
    times = {}
    for k in ('holdings', 'performance', 'allocation', 'accumulation', 'market', 'home'):
        if not d.locator(f"#cpBnav a[data-k={k}]").count(): continue
        times[k] = d.evaluate("""k => new Promise(res => { const t0 = performance.now(); document.querySelector('#cpBnav a[data-k=' + k + ']').click();
          const ok = () => { if (k === 'home') return true;
            if (k === 'holdings') { const v = document.querySelector('.hov-container'); return v && v.getBoundingClientRect().height > 100; }
            const f = [...document.querySelectorAll('#cpViews iframe')].find(f => f.src.includes(k)); if (!f) return false;
            const cs = getComputedStyle(f); if (cs.visibility === 'hidden' || cs.display === 'none') return false;
            const s = f.contentDocument && f.contentDocument.getElementById('cpSplash'); return !s || s.classList.contains('hide') || getComputedStyle(s).display === 'none'; };
          const tick = () => ok() ? res(Math.round(performance.now() - t0)) : performance.now() - t0 > 4000 ? res(null) : requestAnimationFrame(tick); tick(); })""", k)
        d.wait_for_timeout(300)
    rep['tab_ms'] = times
    check(f'tabs switch at once, no loading screen (ms from tap to content: {times})', all(v is not None and v < 300 for v in times.values()), times)
    check('no JS errors', not errs, errs[:3])
    br.close()
json.dump(rep, open(pathlib.Path(__file__).parent / 'qa_directive_report.json', 'w'), indent=1)
print(json.dumps(rep))
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
