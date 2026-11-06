"""AI button fades out while the page scrolls and comes back when it stops (every main page)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 700}, is_mobile=True, has_touch=True); S.setup(ctx)
    for page in ('performance.html', 'accumulation.html', 'market.html'):
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/' + page); pg.wait_for_timeout(500)
        if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
        pg.wait_for_selector('#cpAiFab', timeout=15000); pg.wait_for_timeout(1500)
        op = lambda: pg.evaluate("+getComputedStyle(document.getElementById('cpAiFab')).opacity")
        check(f'{page}: AI button visible at rest', op() > 0.9, op())
        pg.mouse.wheel(0, 300); pg.wait_for_timeout(220)
        check(f'{page}: fades out while scrolling', pg.evaluate("document.getElementById('cpAiFab').classList.contains('scrolling')") and op() < 0.3, op())
        pg.wait_for_timeout(900)
        check(f'{page}: back when the page stops', op() > 0.9 and not pg.evaluate("document.getElementById('cpAiFab').classList.contains('scrolling')"), op())
        check(f'{page}: no JS errors', not errs, errs[:2]); pg.close()
    # inside the app (tabs are frames under the shell's AI button)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.wait_for_timeout(500)
    if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
    S.wait_ready(pg); pg.wait_for_timeout(1000)
    for k in ('performance', 'accumulation', 'market'):
        (pg.evaluate("SamsamUI.ptabGo('performance')") if k == 'performance' else pg.click(f'#cpBnav a[data-k={k}]')); pg.wait_for_timeout(2500)
        fr = pg.frame(url=lambda u, k=k: k + '.html' in u)
        fr.evaluate("scrollBy(0, 250)"); pg.wait_for_timeout(150)
        on = pg.evaluate("document.getElementById('cpAiFab').classList.contains('scrolling')")
        pg.wait_for_timeout(900)
        off = not pg.evaluate("document.getElementById('cpAiFab').classList.contains('scrolling')")
        check(f'in the app, {k}: AI button fades while the tab scrolls and comes back', on and off, (on, off))
    check('in the app: no JS errors', not errs, errs[:2])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
