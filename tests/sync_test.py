"""Cross-device real-time sync: desktop (1366px) + phone (390px) open at the same time on the same account.
Measures how fast a change shows on the other device, tests simultaneous edits (conflicts) and offline queueing."""
import sys, pathlib, time, json, statistics
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; report = {}
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def wait_until(pg, js, timeout=8.0):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pg.evaluate(js): return (time.time() - t0) * 1000
        pg.wait_for_timeout(15)
    return None
def qty(pg, sym): return pg.evaluate(f"(Samsam.getState().portfolio.find(c => c.sym === '{sym}') || {{qty: 0}}).qty")
def ntx(pg): return pg.evaluate("Samsam.getState().transactions.length")
with sync_playwright() as p:
    br = p.chromium.launch()
    D = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(D)
    M = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(M)
    d, m = D.new_page(), M.new_page(); errs = []
    for pg in (d, m):
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    # 1. latency both ways (10 round trips each)
    for label, src, dst in (('phone → desktop', m, d), ('desktop → phone', d, m)):
        times = []
        for i in range(10):
            note = f'sync-{label[:3]}-{i}-{time.time()}'
            src.evaluate(f"Samsam.addTx('ETH', 'buy', 0.001, 2000, '{note}')")
            ms = wait_until(dst, f"Samsam.getState().transactions.some(t => t.note === '{note}')")
            times.append(ms if ms is not None else 99999)
        ok = all(t < 3000 for t in times)
        report[label] = {'median_ms': round(statistics.median(times)), 'max_ms': round(max(times))}
        check(f'{label}: 10/10 changes arrive live, no refresh (median {report[label]["median_ms"]} ms, max {report[label]["max_ms"]} ms)', ok, times)
    # screen (not just state) updates on the other device
    before = d.inner_text('#totalUsd'); m.evaluate("Samsam.addTx('BTC', 'buy', 0.01, 100000, 'screen check')")
    ms = wait_until(d, f"document.getElementById('totalUsd').innerText !== {json.dumps(before)}")
    check(f'desktop header total re-renders by itself ({round(ms or -1)} ms)', ms is not None)
    # 2. conflicts: same field edited on both devices at the same instant → last write wins, both converge
    d.evaluate("window.__go = () => Samsam.updateCoin('SOL', { notes: 'from desktop' })"); m.evaluate("window.__go = () => Samsam.updateCoin('SOL', { notes: 'from phone' })")
    d.evaluate("__go()"); m.evaluate("__go()")
    note_js = "Samsam.getState().coins.find(c => c.sym === 'SOL').notes"
    for _ in range(300):   # wait until both devices agree (up to 6 s) instead of a fixed pause
        if d.evaluate(note_js) == m.evaluate(note_js): break
        d.wait_for_timeout(20)
    nd = d.evaluate("Samsam.getState().coins.find(c => c.sym === 'SOL').notes"); nm = m.evaluate("Samsam.getState().coins.find(c => c.sym === 'SOL').notes")
    check(f'same note edited on both at once: both devices converge to one value (last write wins → "{nd}")', nd == nm and nd in ('from desktop', 'from phone'), (nd, nm))
    # different fields of the same coin at once → both kept (field-level merge)
    d.evaluate("Samsam.updateCoin('SOL', { notes: 'note A' })"); m.evaluate("Samsam.updateCoin('SOL', { lastPrice: 123.45 })")
    both = "(c => c.notes === 'note A' && c.lastPrice === 123.45)(Samsam.getState().coins.find(c => c.sym === 'SOL'))"
    for _ in range(300):
        if d.evaluate(both) and m.evaluate(both): break
        d.wait_for_timeout(20)
    cd = d.evaluate("(c => [c.notes, c.lastPrice])(Samsam.getState().coins.find(c => c.sym === 'SOL'))"); cm = m.evaluate("(c => [c.notes, c.lastPrice])(Samsam.getState().coins.find(c => c.sym === 'SOL'))")
    check('different fields edited at once: both edits kept on both devices', cd == cm == ['note A', 123.45], (cd, cm))
    # buys on the same coin at the same instant → both kept (append-only ledger, unique ids)
    q0, n0 = qty(d, 'SUI'), ntx(d)
    d.evaluate("Samsam.addTx('SUI', 'buy', 1, 3, 'race desktop')"); m.evaluate("Samsam.addTx('SUI', 'buy', 2, 3, 'race phone')")
    for _ in range(300):
        if ntx(d) == ntx(m) == n0 + 2: break
        d.wait_for_timeout(20)
    check('simultaneous buys of the same coin: both kept, no lost update', abs(qty(d, 'SUI') - (q0 + 3)) < 1e-9 and abs(qty(m, 'SUI') - (q0 + 3)) < 1e-9 and ntx(d) == ntx(m) == n0 + 2, (qty(d, 'SUI'), qty(m, 'SUI'), q0))
    # 3. offline phone: edits queue on the device, show immediately, upload on reconnect
    m.evaluate("__fakeGoOffline(); window.dispatchEvent(new Event('offline'))")
    q0 = qty(m, 'DOT'); n0 = ntx(d)
    for i in range(3): m.evaluate(f"void Samsam.addTx('DOT', 'buy', 1, 4, 'offline {i}')")
    m.wait_for_timeout(300)
    check('offline: phone shows its 3 new buys at once', abs(qty(m, 'DOT') - (q0 + 3)) < 1e-9, (qty(m, 'DOT'), q0))
    pill = m.evaluate("document.getElementById('samsamSyncPill').innerText")
    check(f'offline: phone status says changes are waiting ("{pill.strip()}")', 'waiting' in pill or 'Offline' in pill, pill)
    d.evaluate("Samsam.addTx('DOT', 'sell', 0.5, 5, 'desktop while phone offline')"); d.wait_for_timeout(600)
    check('offline: desktop does not see them yet', ntx(d) == n0 + 1)
    t0 = time.time(); m.evaluate("__fakeGoOnline(); window.dispatchEvent(new Event('online'))")
    ms = wait_until(d, f"Samsam.getState().transactions.length === {n0 + 4}")
    m.wait_for_timeout(800)
    check(f'reconnect: all 3 queued changes upload and reach desktop ({round(ms or -1)} ms), desktop change reaches phone', ms is not None and ntx(m) == n0 + 4 and abs(qty(d, 'DOT') - qty(m, 'DOT')) < 1e-9, (ntx(d), ntx(m), n0))
    sp = wait_until(m, "document.getElementById('samsamSyncPill').dataset.s === 'synced'")
    check('status returns to Synced after reconnect', sp is not None)
    # 4. refresh / closed browser: state persists
    m.reload(); S.wait_ready(m); m.wait_for_timeout(800)
    check('phone refresh: identical portfolio to desktop', m.evaluate("JSON.stringify(Samsam.getState().portfolio.map(c=>[c.sym,+c.qty.toFixed(10)]))") == d.evaluate("JSON.stringify(Samsam.getState().portfolio.map(c=>[c.sym,+c.qty.toFixed(10)]))"))
    check('no JS errors on either device', not errs, errs[:3])
    br.close()
pathlib.Path(__file__).with_name('sync_report.json').write_text(json.dumps(report, indent=1))
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
