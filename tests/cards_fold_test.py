"""Cards that open on a tap: Allocation → Target allocation, and Exit Strategy → Macro Exit Indicators + Cash-out Progress.
Closed by default (title + one line); tap the title (or that line) to open, again to close; remembered on this device;
Edit (targets) still works from a closed card."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
CLEAR = "try{if(!sessionStorage.getItem('f')){localStorage.setItem('samsam_tg_open','0');localStorage.setItem('samsam_exit_cards','{}');sessionStorage.setItem('f','1')}}catch(e){}"   # = a first visit (closed)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); ctx.add_init_script(CLEAR)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(600)
        pg.evaluate("Samsam.setTargets({cats:{btc:{pct:40},layer1:{pct:30},other:{pct:30}},band:5})"); pg.wait_for_timeout(600)
        # ── Allocation → Target allocation ──
        pg.evaluate("openHoldingsView(); setHovMode && setHovMode('alloc')"); pg.wait_for_selector('#hovTgtCard .tg-h'); pg.wait_for_timeout(300)
        st = pg.evaluate("({body: document.getElementById('tgBody').hidden, exp: document.querySelector('#hovTgtCard .tg-h').getAttribute('aria-expanded'), sub: document.querySelector('#hovTgtCard .tg-sub').innerText, h: Math.round(document.getElementById('hovTgtCard').getBoundingClientRect().height)})")
        check(f'{vn} Target allocation: closed by default — title + "x of y on target" {st}', st['body'] and st['exp'] == 'false' and 'on target' in st['sub'] and st['h'] < 160, st)
        if vn == 'phone': pg.locator('#hovTgtCard').screenshot(path=str(SH / 'fold_target_closed.png'))
        pg.click('#hovTgtCard .tg-h b'); pg.wait_for_timeout(250)
        check(f'{vn} Target allocation: tap → open (rows + rebalance)', not pg.evaluate("document.getElementById('tgBody').hidden") and pg.locator('#hovTgtCard .tg-row').count() >= 3 and pg.is_visible('#hovTgtCard .tg-rb'))
        pg.click('#hovTgtCard .tg-sub'); pg.wait_for_timeout(250)
        check(f'{vn} Target allocation: tap the line → closed again', pg.evaluate("document.getElementById('tgBody').hidden"))
        pg.click('#hovTgtCard .tg-edit'); pg.wait_for_timeout(300)
        check(f'{vn} Target allocation: Edit works from the closed card (card stays closed)', pg.is_visible('#tgModal') and pg.evaluate("document.getElementById('tgBody').hidden"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.click('#hovTgtCard .tg-h b'); pg.wait_for_timeout(200)
        pg.reload(); S.wait_ready(pg); pg.evaluate("openHoldingsView(); setHovMode && setHovMode('alloc')"); pg.wait_for_selector('#hovTgtCard .tg-h'); pg.wait_for_timeout(300)
        check(f'{vn} Target allocation: stays open next time', not pg.evaluate("document.getElementById('tgBody').hidden"))
        # ── Exit Strategy: Macro + Cash-out ──
        pg.evaluate("Samsam.saveExit({tab:'exit'})"); pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_selector('.xm-card'); pg.wait_for_timeout(500)
        cl = pg.evaluate("({m: document.querySelectorAll('.xm-card .xm-row').length, c: !!document.querySelector('.xc-card .xc-leg'), sum: document.querySelector('.xm-card .xm-sum').innerText, pct: document.querySelector('.xc-card .xc-pct').innerText, bar: !!document.querySelector('.xc-card .xc-bar'), edit: !!document.querySelector('.xm-card [data-act=tg-edit]')})")
        check(f'{vn} Exit: both cards closed — "Signals Hit", "% in stablecoins" + bar only {cl}', cl['m'] == 0 and not cl['c'] and 'Signals Hit' in cl['sum'] and 'stablecoins' in cl['pct'] and cl['bar'] and not cl['edit'], cl)
        if vn == 'phone': pg.screenshot(path=str(SH / 'fold_exit_closed.png'))
        pg.click('.xm-card .xs-title'); pg.wait_for_timeout(250)
        check(f'{vn} Exit: Macro opens (3 indicators + Edit targets)', pg.locator('.xm-card .xm-row').count() == 3 and pg.is_visible('.xm-card [data-act=tg-edit]') and not pg.query_selector('.xc-card .xc-leg'))
        pg.click('.xm-card [data-act=tg-edit]'); pg.wait_for_timeout(250)
        check(f'{vn} Exit: Edit targets opens the editor, card stays open', pg.is_visible('.xm-edit') and pg.locator('.xm-card .xm-row').count() == 3)
        pg.click('.xm-card [data-act=tg-edit]'); pg.wait_for_timeout(200)
        pg.click('.xc-card .xs-title'); pg.wait_for_timeout(250)
        check(f'{vn} Exit: Cash-out opens (stablecoins / market, realized, steps)', pg.is_visible('.xc-card .xc-leg') and pg.is_visible('.xc-card .xc-foot'))
        pg.reload(); pg.wait_for_selector('.xm-card'); pg.wait_for_timeout(500)
        check(f'{vn} Exit: both remembered open', pg.locator('.xm-card .xm-row').count() == 3 and pg.is_visible('.xc-card .xc-leg'))
        pg.click('.xm-card .xs-title'); pg.click('.xc-card .xs-title'); pg.wait_for_timeout(250)
        check(f'{vn} Exit: tap again → both closed', pg.locator('.xm-card .xm-row').count() == 0 and not pg.query_selector('.xc-card .xc-leg'))
        check(f'{vn}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
