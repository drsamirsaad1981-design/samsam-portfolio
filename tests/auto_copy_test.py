"""The automatic weekly copy: saved by itself inside the account, the last 4 kept, never loaded with the chart history,
shown in Settings, and Recover Data → Automatic copies brings back what was lost."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
PW = 'correct horse 42'
def copies(): return {k: v for k, v in S.srv('/dump').items() if '/snaps/0copy' in k}
def info(): return next(v for k, v in S.srv('/dump').items() if k.endswith('/meta/info'))
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True); S.setup(ctx)
    ctx.add_init_script("window.__copyWait = 4000;")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    check('before the first visit there is no copy', not copies() and not info().get('copies'))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)")
    pg.evaluate("Samsam.addTx('BTC','buy',0.01,80000,'auto copy test')"); pg.wait_for_timeout(600)
    pg.wait_for_function("Samsam.autoCopies().length === 1", timeout=20000)
    for _ in range(40):   # the copy's parts reach the database a moment after its line in meta: wait for both
        c = copies(); m = info().get('copies') or []
        if c and m: break
        pg.wait_for_timeout(250)
    check(f'a copy is saved by itself ({len(c)} part, {len(json.dumps(c))} bytes)', len(c) == 1 and len(m) == 1 and m[0]['coins'] > 0 and m[0]['txs'] > 0, [list(c), m])
    check('it is compressed, and nothing readable sits in the index', m[0].get('gz') is True and 'auto copy test' not in json.dumps(c) and 'd' not in m[0], m)
    st = pg.evaluate("(() => { const s = Samsam.getState(); return [JSON.stringify(s.perfSnaps||[]).includes('copy'), JSON.stringify(s.holdingsSnaps||[]).includes('0copy')] })()")
    check('the chart history never loads the copies', st == [False, False], st)
    pg.reload(); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(6500)
    check('the next visit in the same week saves nothing more', len(copies()) == 1 and len(info()['copies']) == 1, list(copies()))
    pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stAct_backup')
    row = pg.locator('#stAct_backup').locator('xpath=..').inner_text()
    check('Settings → Backup shows the automatic copy', 'Automatic copy: Today' in row and 'Last backup' in row, row)
    pg.screenshot(path=str(SH / 'auto_copy_settings.png'))
    pg.locator('#cpSet .cp-hint[data-hint="backup"]').click(); pg.wait_for_timeout(300)
    check('the ⓘ explains it', 'Automatic copy' in pg.inner_text('body') and 'last 4' in pg.inner_text('body'))
    pg.keyboard.press('Escape'); pg.evaluate("SamsamSettings.close()"); pg.wait_for_timeout(300)
    # something is lost
    pg.evaluate("""(async()=>{ const t=Samsam.getState().transactions.find(t=>t.note==='auto copy test'); await Samsam.deleteTx(t.id);
      await Samsam.saveWatchlist([{id:'dogecoin',sym:'DOGE',name:'Dogecoin'}]); })()"""); pg.wait_for_timeout(1200)
    check('lost: the transaction is gone', pg.evaluate("!Samsam.getState().transactions.some(t=>t.note==='auto copy test')"))
    pg.goto(SITE + '/recover.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(800)
    check('Recover Data opens on Automatic copies', pg.get_attribute('.src-tabs [data-src="auto"]', 'aria-pressed') == 'true' and pg.is_visible('#autoList [data-copy]'), pg.inner_text('.card'))
    txt = pg.inner_text('#autoList')
    check('the copy is listed with its date and what it holds', 'coins' in txt and 'transactions' in txt and 'Compare' in txt, txt)
    pg.click('#autoList [data-copy]'); pg.wait_for_selector('#results:not(.hidden)'); pg.wait_for_timeout(500)
    check('the lost transaction is listed', 'auto copy test' in pg.inner_text('#txTable'), pg.inner_text('#txTable')[:300])
    pg.screenshot(path=str(SH / 'auto_copy_recover.png'), full_page=True)
    with pg.expect_download():
        pg.click('#applyBtn'); pg.wait_for_selector('#ssPwA'); pg.fill('#ssPwA', PW); pg.fill('#ssPwB', PW); pg.click('#ssPw button[type=submit]')
    pg.wait_for_selector('#srcMsg.ok', timeout=15000); pg.wait_for_timeout(1200)
    check('after restore it is back', pg.evaluate("Samsam.getState().transactions.some(t=>t.note==='auto copy test')"))
    # the last 4 are kept
    for i in range(4):
        pg.evaluate("Samsam.autoCopyNow()"); pg.wait_for_timeout(350)
    m = info()['copies']; c = copies()
    check('only the last 4 are kept (the oldest is replaced)', len(m) == 4 and len(c) == 4 and sorted(x['s'] for x in m) == [0, 1, 2, 3] and m == sorted(m, key=lambda x: x['at'], reverse=True), m)
    got = pg.evaluate("Samsam.readAutoCopy(Samsam.autoCopies()[0].s).then(o => [o.kind, o.legacy.coins.length > 0, o.legacy.transactions.some(t => t.note === 'auto copy test'), !!o.settings.info])")
    check('a copy reads back whole', got == ['auto-copy', True, True, True], got)
    # Arabic
    pg.goto(SITE + '/index.html'); pg.wait_for_function("Samsam.isReady()"); pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('[data-seg="lang"][data-v="ar"]')
    with pg.expect_navigation(): pg.click('[data-seg="lang"][data-v="ar"]')
    pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stAct_backup'); pg.wait_for_timeout(500)
    row = pg.locator('#stAct_backup').locator('xpath=..').inner_text()
    check('Arabic: Settings shows it', 'النسخة التلقائية: اليوم' in row, row)
    pg.screenshot(path=str(SH / 'auto_copy_settings_ar.png'))
    pg.goto(SITE + '/recover.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(1200)
    txt = pg.inner_text('.card')
    check('Arabic: Recover Data lists the copies', 'النسخ التلقائية' in txt and '47 عملة، 15 معاملة' in txt.replace('\u2066','').replace('\u2069','') and 'مقارنة' in txt and 'coins' not in txt, txt)
    pg.screenshot(path=str(SH / 'auto_copy_recover_ar.png'))
    # an empty portfolio is never copied
    pg.evaluate("localStorage.removeItem('samsam.copyLock')")
    S.srv('/reset'); pg.goto(SITE + '/index.html'); pg.wait_for_timeout(7000)
    check('an empty portfolio is never copied', not copies(), list(copies()))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
