"""Every page with the bottom bar: cloud + light/dark in the header (work from any page); Plan's header icon follows
Accumulation ↔ Exit Strategy; Holdings: Add inside the Portfolio Value card (top right); AI button the plain logo."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.add_init_script("try{localStorage.setItem('samsam_theme','light')}catch(e){}")
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        check(f'{name}: home — no Holdings Add', not pg.is_visible('#hovAddBtn'))
        # Allocation (the screen Holdings used to share)
        pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1200)
        h = pg.evaluate("""(() => { const hd = document.querySelector('#holdingsOverlay .cp-head');
          return [hd.querySelectorAll('[data-theme-toggle]').length, hd.querySelectorAll('.ss-sync-hdr').length, !!hd.querySelector('.cp-add')]; })()""")
        check(f'{name}: Allocation header — cloud + light/dark, no Add in the bar {h}', h == [1, 1, False], h)
        # (the Holdings screen and its Portfolio Value card with ➕ Add were dropped — the main page keeps its Add)
        c = pg.evaluate("(() => { const c = getComputedStyle(document.getElementById('cpAiFab')); return [c.backgroundColor === 'rgba(0, 0, 0, 0)' && c.backdropFilter === 'none', !!document.querySelector('#cpAiFab svg')]; })()")
        check(f'{name}: no floating Add any more; AI button the plain logo', not pg.evaluate("!!document.querySelector('.cp-addfab')") and all(c), c)
        pg.evaluate("openCoinTx(portfolio[0].sym)"); pg.wait_for_timeout(700)
        pg.evaluate("hovBack()"); pg.wait_for_timeout(300); pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(700)
        check(f'{name}: back home — Holdings Add not shown', not pg.is_visible('#hovAddBtn'))
        # pages in the app: buttons + theme from there
        for k in ('performance', 'accumulation', 'market'):
            pg.evaluate(f"cpShell.go('{k}')"); pg.wait_for_timeout(1800)
            fr = pg.frame(url=lambda u, k=k: k + '.html' in u)
            b = fr.evaluate("[document.querySelectorAll('.cp-head [data-theme-toggle]').length, document.querySelectorAll('.cp-head .ss-sync-hdr').length, !!(document.querySelector('.cp-head [data-theme-toggle]')||{}).offsetParent]")
            check(f'{name}: {k} — cloud + light/dark in the header {b}', b == [1, 1, True], b)
        t0 = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        fr.click('.cp-head [data-theme-toggle]'); pg.wait_for_timeout(600)
        t1 = pg.evaluate("document.documentElement.getAttribute('data-theme')"); tf = fr.evaluate("document.documentElement.getAttribute('data-theme')")
        check(f'{name}: light/dark from Market Hub switches the whole app ({t0} → {t1})', t0 != t1 and t1 == tf, (t0, t1, tf))
        fr.click('.cp-head .ss-sync-hdr'); pg.wait_for_timeout(300)
        check(f'{name}: cloud button opens the sync menu', fr.evaluate("getComputedStyle(document.getElementById('samsamSyncMenu')).display") == 'block')
        # Plan header icon follows the switch
        pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(1200)
        fa = pg.frame(url=lambda u: 'accumulation.html' in u)
        ic = lambda: fa.evaluate("document.querySelector('.cp-head-title .cp-head-ic').innerHTML")
        fa.click('#tabAccum'); pg.wait_for_timeout(300); i1 = ic(); t1 = fa.inner_text('#pageSubtitle')
        fa.click('#tabExit'); pg.wait_for_timeout(500); i2 = ic(); t2 = fa.inner_text('#pageSubtitle')
        check(f'{name}: Plan header — Accumulation Plan with its icon, Exit Strategy with the exit icon (SVG)', t1 == 'Accumulation Plan' and t2 == 'Exit Strategy' and '<svg' in i1 and '<svg' in i2 and i1 != i2 and 'M16.5 8' in i2, (t1, t2))
        fa.click('#tabAccum'); pg.wait_for_timeout(300)
        check(f'{name}: back to Accumulation → its icon again', ic() == i1)
        check(f'{name}: no sideways scroll', not pg.evaluate("document.documentElement.scrollWidth > innerWidth"))
        check(f'{name}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
