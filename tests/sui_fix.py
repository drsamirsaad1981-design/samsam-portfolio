import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    A = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(A)
    B = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(B)
    a = A.new_page(); a.on('dialog', lambda d: d.accept())
    a.goto(SITE + '/index.html'); a.wait_for_selector('#samsamSignInBtn'); a.click('#samsamSignInBtn')
    a.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    # Recreate the real SUI state: wrong opening 201.91, buy 48.59 on Oct 17, three manual edits
    a.evaluate("""async () => {
      await Samsam.updateCoin('SUI', { opening: { qty: 201.91, avg: 1.03 } });
      for (const t of Samsam.getState().transactions.filter(t => t.sym === 'SUI')) await Samsam.deleteTx(t.id);
      await Samsam.addTx('SUI', 'buy', 48.59, 0.9867, '', { date: '2026-10-17T17:05:00.000Z' });
      await Samsam.adjust('SUI', { setQty: 251 }, 'Quantity edited');
      await Samsam.adjust('SUI', { setQty: 251.5 }, 'Quantity edited');
      await Samsam.adjust('SUI', { setAvg: 1.0251 }, 'Avg buy price edited');
    }""")
    a.wait_for_timeout(600)
    b = B.new_page(); b.goto(SITE + '/index.html'); b.wait_for_selector('#samsamSignInBtn'); b.click('#samsamSignInBtn')
    b.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    check('starting state = 251.5 @ 1.0251 (as on your phone)', abs(b.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SUI').qty") - 251.5) < 1e-9)
    a.evaluate("openCoinTx('SUI')"); a.wait_for_timeout(500)
    # 1) delete the three Edit rows with the 🗑 on the coin screen
    for _ in range(3):
        a.locator('#htxList .htx-row:has(.htx-dot-adjust) .htx-act').first.click(); a.wait_for_timeout(400)
    check('three Edit rows deleted from the coin screen', a.locator('#htxList .htx-dot-adjust').count() == 0)
    # 2) edit opening position
    a.locator('#htxList .htx-row .htx-act[title="Edit opening position"]').click(); a.wait_for_selector('#eopBackdrop.show')
    a.fill('#eopQty', '251.50'); a.fill('#eopAvg', '1.0251'); a.fill('#eopDate', '2026-10-15')
    pv = a.inner_text('#eopPreview')
    check('preview: 300.09 SUI · avg $1.0189 · cost $305.76', '300.09 SUI' in pv and '$1.0189' in pv and '$305.76' in pv, pv)
    a.screenshot(path=str(T / 'eop-mobile.png'))
    a.click('#eopBackdrop .atx-save')
    b.wait_for_function("Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SUI').qty - 300.09) < 1e-9", timeout=8000)
    c = b.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SUI')")
    exp_avg = (251.5 * 1.0251 + 48.59 * 0.9867) / 300.09
    check(f'other device: SUI 300.09 @ {exp_avg:.6f}, cost {300.09*exp_avg:.2f}', abs(c['basePrice'] - exp_avg) < 1e-12 and abs(c['qty'] * c['basePrice'] - 305.756403) < 1e-6, c)
    a.wait_for_timeout(500)
    cards = a.evaluate("[htxAvg.innerText, htxCost.innerText, document.getElementById('htxList').innerText]")
    check('coin screen cards: Avg $1.0189, Cost $305.76', cards[0] == '$1.0189' and cards[1] == '$305.76', cards[:2])
    check('history matches CoinMarketCap: Oct 15 +251.5, Oct 17 +48.59', 'Oct 15, 2026' in cards[2] and '+251.5 SUI' in cards[2] and '+48.59 SUI' in cards[2] and 'Edit' not in cards[2], cards[2])
    a.screenshot(path=str(T / 'sui-fixed-mobile.png'))
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
