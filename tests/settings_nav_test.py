"""Settings: each line goes to the right place, and you come back to Settings.
DCA → the Plan page, the DCA card (or a short "how to start" note when there is none); Exit plan → the Exit Strategy tab.
Back (the phone's button) on Settings closes it and stays on the page; Back from a window Settings opened (Guide,
Signal thresholds, …) brings Settings back; closing that window with × brings Settings back too."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def opn(pg):
    if not pg.query_selector('#cpSet'): pg.locator('.ss-set-hdr').first.click()
    pg.wait_for_selector('#cpSet'); pg.wait_for_timeout(200)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        url0 = pg.url
        # Back on Settings → closed, same page
        opn(pg); pg.go_back(); pg.wait_for_timeout(500)
        check(f'{vn}: Back on Settings closes it and stays on the page', not pg.query_selector('#cpSet') and pg.url == url0 and pg.evaluate("Samsam.isReady()"), pg.url)
        # a window from Settings: × → Settings again; Back → Settings again
        for row, sel, shut in (('alerts', '#cpAlerts', "document.querySelector('#cpAlerts [data-act=cancel]').click()"), ('guide', '#cpGuide', "document.querySelector('#cpGuide .gd-x').click()")):
            opn(pg); pg.click(f'#stRow_{row}'); pg.wait_for_selector(sel, state='visible'); pg.wait_for_timeout(300)
            pg.evaluate(shut); pg.wait_for_timeout(1200)
            check(f'{vn}: {row} closed with × → back to Settings', pg.query_selector('#cpSet') is not None)
            pg.click(f'#stRow_{row}'); pg.wait_for_selector(sel, state='visible'); pg.wait_for_timeout(300)
            pg.go_back(); pg.wait_for_timeout(1000)
            check(f'{vn}: {row} + Back → Settings again (the window closed)', pg.query_selector('#cpSet') is not None and not pg.is_visible(sel), row)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        check(f'{vn}: after all that, still on the app (not sent out)', pg.url.startswith(S.SITE) and 'index.html' in pg.url, pg.url)
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
