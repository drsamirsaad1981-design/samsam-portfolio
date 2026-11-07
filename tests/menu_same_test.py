"""The cloud menu (☁️) is the same on every page: Telegram alerts, Import from exchange, Recover Data, last backup, Backup, Sign out."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
WANT = ['Telegram alerts', 'Import from exchange', 'Recover Data', 'Backup', 'Sign out']
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    for f in ['index.html', 'accumulation.html', 'market.html', 'performance.html', 'altseason.html', 'recover.html']:
        pg.goto(S.SITE + '/' + f); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000); pg.wait_for_timeout(1200)
        if pg.locator('.ss-sync-hdr').count(): pg.locator('.ss-sync-hdr').first.click()
        else: pg.evaluate("document.getElementById('samsamSyncPill').click()")
        pg.wait_for_timeout(300)
        items = pg.evaluate("[...document.querySelectorAll('#samsamSyncMenu .samsam-btn')].map(b=>b.innerText.trim())")
        check(f'{f}: menu = {items}', items == WANT and 'Last backup' in pg.inner_text('#samsamSyncMenu'), items)
        pg.click('#samsamImport'); pg.wait_for_timeout(300)
        check(f'{f}: Import opens here', pg.is_visible('#impModal')); pg.evaluate("SamsamImport.close()")
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
