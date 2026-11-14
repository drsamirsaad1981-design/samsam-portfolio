"""➕ Add on the Performance tab (next to the coin search): opens the same Add window as Overview; on a page opened on its own it goes to the main page and opens there."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
        pg.evaluate("cpShell.go('performance')"); pg.wait_for_timeout(2500)
        fr = [f for f in pg.frames if 'performance.html' in f.url][0]
        b = fr.locator('#perfAdd')
        check(f'{vn}: ➕ Add next to the coin search on Performance', b.is_visible() and abs(b.bounding_box()['y'] - fr.locator('#perfQ').bounding_box()['y']) < 6)
        b.click(); pg.wait_for_timeout(500)
        check(f'{vn}: it opens the Add window over the app', pg.evaluate("(()=>{const m=document.querySelector('#acForm'); return !!m && getComputedStyle(m).display!=='none' && m.getClientRects().length>0})()"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.goto(S.SITE + '/performance.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1000)
        pg.click('#perfAdd'); pg.wait_for_url('**/index.html*'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        check(f'{vn}: Performance opened on its own → the main page, Add window open', pg.evaluate("(()=>{const m=document.querySelector('#acForm'); return !!m && m.getClientRects().length>0})()") and '#add' not in pg.url, pg.url)
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
