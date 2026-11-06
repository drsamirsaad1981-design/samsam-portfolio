"""Edge cases on every page, mobile + desktop: huge numbers, tiny numbers, then an empty portfolio (all coins removed).
Checks: no JS errors, no NaN / Infinity / undefined / scientific notation on screen, no sideways page overflow."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
PAGES = ['index.html', 'accumulation.html', 'performance.html', 'allocation.html']
BAD = re.compile(r'\bNaN\b|Infinity|undefined|\bnull\b|\d\.?\d*e[+-]\d')
def sweep(br, label, extra_js=()):
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        for page in PAGES:
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e, errs=errs: errs.append(str(e)))
            pg.goto(f'{S.SITE}/{page}'); pg.wait_for_timeout(400)
            if pg.is_visible('#samsamSignInBtn'): pg.click('#samsamSignInBtn')
            S.wait_ready(pg); pg.wait_for_timeout(1800)
            views = [None] + (["applyView('table')", "applyView('cards')", "openHoldingsView()"] if page == 'index.html' else [])
            for v in views:
                if v: pg.evaluate(v); pg.wait_for_timeout(400)
                txt = pg.evaluate("document.body.innerText")
                bad = sorted(set(m.group(0) for m in BAD.finditer(txt)))
                ow = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
                where = f'{label} {name} {page}{" " + v if v else ""}'
                check(f'{where}: no NaN/Infinity/undefined/1e+ text', not bad, bad[:5])
                if not (page == 'index.html' and v == "applyView('table')" and name == 'mobile'):   # mobile table scrolls inside its own box
                    check(f'{where}: no sideways page overflow', ow <= 1, ow)
            check(f'{label} {name} {page}: no JS errors', not errs, errs[:2]); pg.close()
        ctx.close()
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(); S.setup(ctx); pg = ctx.new_page()
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    pg.evaluate("Samsam.addCoin({ sym: 'HUGE', name: 'Huge Coin With A Very Long Name Indeed', cat: 'other' }, { qty: 999999999999, price: 1250000 })")
    pg.evaluate("Samsam.addCoin({ sym: 'TINY', name: 'Tiny', cat: 'other' }, { qty: 0.00000001, price: 0.00000001 })"); pg.wait_for_timeout(800)
    pg.evaluate("Samsam.saveAccumPlan([...Samsam.getState().accumPlan, { sym: 'HUGE', name: 'Huge', targetQty: 9999999999999 }])"); pg.wait_for_timeout(600)
    sweep(br, 'HUGE/TINY')
    pg.evaluate("Promise.all(Samsam.getState().portfolio.map(c => Samsam.removeCoin(c.sym)))"); pg.evaluate("Samsam.saveAccumPlan([])"); pg.wait_for_timeout(1500)
    check('portfolio is empty', pg.evaluate("Samsam.getState().portfolio.length") == 0)
    ctx.close()
    sweep(br, 'EMPTY')
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
