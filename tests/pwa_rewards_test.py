"""The app on the phone (PWA) + Rewards & mining.
PWA: the manifest (name, icons that exist, standalone, shortcuts), Settings → "Install the app" (how to, when the browser
has no install button), the service worker: registered, then the app opens with the internet off (pages and files kept).
Rewards & mining: coins you got without buying (Reward = staking, mined BTC, airdrops at $0) — the Performance card,
the window (totals by kind, by coin with "x% of your SOL came free", by month, the period switch, one coin), and the coin
page's "rewards +…" line opens it for that coin."""
import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
ROOT = pathlib.Path(__file__).resolve().parent.parent
m = json.loads((ROOT / 'manifest.json').read_text())
check('manifest: name, standalone, start inside the app', m['name'] == 'Cute Portfolio' and m['display'] == 'standalone' and m['start_url'].startswith('./'))
check('manifest: icons 192 + 512 + maskable, files exist', {i['sizes'] for i in m['icons']} >= {'192x192', '512x512'} and any(i.get('purpose') == 'maskable' for i in m['icons']) and all((ROOT / i['src'].split('?')[0].lstrip('./')).exists() for i in m['icons']))
check(f'manifest: shortcuts {[s["short_name"] for s in m.get("shortcuts", [])]}', [s['short_name'] for s in m.get('shortcuts', [])] == ['Holdings', 'Plan', 'Market', 'Performance'])
sw = (ROOT / 'sw.js').read_text()
check('sw.js: never keeps Firestore / prices / other sites (only pages, the app\'s files and the Firebase library)', "u.origin === 'https://www.gstatic.com' && u.pathname.startsWith('/firebasejs/')" in sw and "!u.pathname.includes('/prices/')" in sw and "if (req.method !== 'GET') return" in sw)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(500)
        # ── Settings → Install the app ──
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_install')
        row = pg.inner_text('#stRow_install')
        check(f'{vn} Settings → "Install the app" ({row.splitlines()[-1] if row else ""})', 'Install the app' in row and ('menu' in row or 'Home Screen' in row or 'home screen' in row), row)
        pg.click('#stRow_install'); pg.wait_for_timeout(300)
        log = pg.evaluate("(window.__cpLog||[]).slice(-1)[0]||''")
        check(f'{vn} no install button in this browser → how to do it ("Install app" / "Add to Home screen")', 'Add to Home' in log or 'Install app' in log, log)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        # ── Rewards & mining ──
        pg.evaluate("""(async()=>{ const d=new Date(Date.now()-3*864e5).toISOString(), old=new Date(Date.now()-90*864e5).toISOString();
          await Samsam.addTx('SOL','transfer_in',0.5,0,'SOL staking',{kind:'reward',date:d});
          await Samsam.addTx('BTC','transfer_in',0.001,0,'Mined BTC sent to your wallet (cost $0)',{date:old});
          await Samsam.addTx('SOL','transfer_in',2,150,'from Binance',{date:d}); })()""")
        pg.wait_for_timeout(800)
        rd = pg.evaluate("SamsamRewards.data('all')")
        sol = [c for c in rd['coins'] if c['sym'] == 'SOL'][0]
        check(f'{vn} free coins: SOL staking + mined BTC, not the paid Transfer In (SOL {sol["qty"]})', {c['sym'] for c in rd['coins']} >= {'SOL', 'BTC'} and rd['tot']['reward'] > 0 and rd['tot']['mining'] > 0 and abs(sol['qty'] * 2 - round(sol['qty'] * 2)) < 1e-9, rd['tot'])
        pg.goto(S.SITE + '/performance.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_selector('#freeCard:not([hidden])', timeout=8000)
        fc = pg.inner_text('#freeCard')
        check(f'{vn} Performance: "Rewards & mining" card with the total ({fc.splitlines()[-2] if len(fc.splitlines()) > 1 else fc})', 'Rewards & mining' in fc and '$' in fc and 'SOL' in fc, fc)
        box = pg.locator('#freeCard').bounding_box(); full = pg.locator('.pnl-breakdown-card').bounding_box()
        check(f'{vn} the card is as wide as the cards around it', box and full and abs(box['width'] - full['width']) < 4, (box, full))
        pg.click('#freeCard'); pg.wait_for_selector('#cpRew .rw-tiles')
        tiles = pg.inner_text('#cpRew .rw-tiles')
        check(f'{vn} window: Staking rewards · Mining · Airdrops tiles', 'Staking' in tiles and 'Mining' in tiles and 'Airdrops' in tiles, tiles)
        sr = pg.inner_text('#rwCoins .rw-row[data-sym="SOL"]')
        check(f'{vn} by coin: SOL "x% of your SOL came free"', '% of your SOL came free' in sr and '+' in sr, sr)
        months = pg.locator('#rwMonths .rw-row').count()
        check(f'{vn} by month: {months} months (staking this month, mining 3 months ago)', months >= 2, months)
        if vn == 'phone': pg.locator('#cpRew .rw-box').screenshot(path=str(SH / 'rewards.png'))
        pg.click('#cpRew [data-r="30"]'); pg.wait_for_timeout(200)
        check(f'{vn} 30 days: the 3-month-old mined BTC drops out', not pg.query_selector('#rwCoins .rw-row[data-sym="BTC"]') and pg.query_selector('#rwCoins .rw-row[data-sym="SOL"]'))
        pg.click('#cpRew [data-r="all"]'); pg.wait_for_timeout(150)
        pg.click('#rwCoins .rw-row[data-sym="SOL"]'); pg.wait_for_timeout(200)
        check(f'{vn} tap SOL → only SOL, "‹ All coins" back', 'SOL you got without buying' in pg.inner_text('#cpRew .rw-big') and pg.is_visible('#cpRew [data-allc]'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(f'{vn} Esc closes it', not pg.query_selector('#cpRew'))
        # the coin page's "rewards +…" line
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(400)
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(500)
        pg.click('#htxHoldings24'); pg.wait_for_selector('#cpRew .rw-big', timeout=4000)
        check(f'{vn} coin page "rewards +…" → the window for SOL', 'SOL you got without buying' in pg.inner_text('#cpRew .rw-big'))
        pg.keyboard.press('Escape')
        check(f'{vn}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    # ── the service worker: registered, then the app opens offline ──
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True); S.setup(ctx)
    ctx.add_init_script("try{localStorage.setItem('samsam_sw_test','1')}catch(e){}")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)", timeout=10000)
    pg.wait_for_function("(async()=>!!(await navigator.serviceWorker.getRegistration()))()", timeout=10000)
    pg.reload(); pg.wait_for_timeout(1500)
    check('service worker controls the page after the first visit', pg.evaluate("!!navigator.serviceWorker.controller"))
    ctx.set_offline(True)
    try:
        pg.reload(wait_until='domcontentloaded', timeout=10000); pg.wait_for_timeout(1000)
        ok = pg.evaluate("document.title") and pg.evaluate("typeof SamsamUI === 'object' && !!document.querySelector('header')")
    except Exception as e: ok = False; print('   offline reload:', str(e)[:160])
    check('internet off → the app still opens (page + its files from the phone)', ok)
    ctx.set_offline(False); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
