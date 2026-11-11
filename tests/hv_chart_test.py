"""Performance: tapping Total Value opens the Portfolio Value chart (the old Holdings screen's chart) under the two cards —
24h · 7d · 30d · 90d · All, a value card on touch / hover, the change line; tapping again closes it, and it is remembered.
The main page's Holdings card opens Performance with that chart open."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('dark', 'light'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');if(!sessionStorage.getItem('hv')){{localStorage.removeItem('samsam_pf_hv');sessionStorage.setItem('hv','1')}}}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
            # main page Holdings card → Performance with the chart open
            pg.click('#holdingsCard'); pg.wait_for_timeout(1800)
            fr = pg.frame(url=lambda u: 'performance.html' in u)
            check(f'{vn}/{theme}: Holdings card → Performance', pg.evaluate("location.hash") == '#performance' and fr is not None, pg.evaluate("location.hash"))
            fr.wait_for_function("Samsam.isReady()"); fr.wait_for_timeout(600)
            check(f'{vn}/{theme}: …with the Portfolio Value chart open', fr.is_visible('#hvCard') and fr.get_attribute('#tvCard', 'aria-expanded') == 'true')
            v = fr.evaluate("[document.getElementById('hvVal').textContent, document.getElementById('totalValue').textContent, document.getElementById('hvCanvas').width > 0, getComputedStyle(document.getElementById('hvCanvas')).display]")
            check(f'{vn}/{theme}: chart value = Total Value, chart drawn {v[:2]}', v[0] == v[1] and v[0] != '$—' and v[2] and v[3] != 'none', v)
            chg = fr.inner_text('#hvChg')
            check(f'{vn}/{theme}: change line ({chg})', '%' in chg and '$' in chg, chg)
            # place: right under Total Value / All Time Profit, full width
            pos = fr.evaluate("(()=>{const a=document.getElementById('tvCard').getBoundingClientRect(), b=document.getElementById('allTimeCard').getBoundingClientRect(), c=document.getElementById('hvCard').getBoundingClientRect(); return [Math.round(c.top-Math.max(a.bottom,b.bottom)), Math.round(c.left-a.left), Math.round(b.right-c.right)]})()")
            check(f'{vn}/{theme}: sits right under the two cards, full width {pos}', 0 <= pos[0] <= 24 and abs(pos[1]) <= 1 and abs(pos[2]) <= 1, pos)
            # ranges
            for r in ('7d', '30d', 'all', '24h'):
                fr.click(f'#hvCard .pcc-tabs button[data-hr="{r}"]'); fr.wait_for_timeout(250)
                ok = fr.evaluate(f"document.querySelector('#hvCard .pcc-tabs button[data-hr=\"{r}\"]').getAttribute('aria-pressed') === 'true' && getComputedStyle(document.getElementById('hvCanvas')).display !== 'none' && (!!document.getElementById('hvCanvas').dataset.xLabels || hvSnaps.filter(s=>s.t>Date.now()-PERF_RANGE_MS['{r}']).length < 2)")   # (the test data has one snapshot in the last day: a flat 2-point line, no axis labels)
                check(f'{vn}/{theme}: {r} range', ok, fr.evaluate("[document.getElementById('hvCanvas').dataset.xLabels, hvSnaps.length, hvSnaps.filter(s=>s.t>Date.now()-864e5).length, document.getElementById('hvEmpty').hidden]"))
            check(f'{vn}/{theme}: its tabs leave Portfolio vs BTC alone', fr.evaluate("document.querySelector('#perfChartCard .pcc-tabs button[data-r=\"all\"]').getAttribute('aria-pressed')") == 'true')
            # value card on touch / hover
            c = fr.locator('#hvCanvas'); c.scroll_into_view_if_needed(); bb = c.bounding_box()
            if vn == 'phone': pg.touchscreen.tap(bb['x'] + bb['width'] * .5, bb['y'] + bb['height'] / 2)
            else: pg.mouse.move(bb['x'] + bb['width'] * .5, bb['y'] + bb['height'] / 2)
            fr.wait_for_timeout(300)
            t = fr.evaluate("(()=>{const t=document.querySelector('#hvCard .cpc-tip'); return t ? {on: getComputedStyle(t).display, txt: t.innerText} : null})()")
            check(f'{vn}/{theme}: touch / hover → the time and the value {t}', t and t['on'] == 'block' and 'Portfolio $' in t['txt'], t)
            pg.screenshot(path=str(SH / f'hv_{vn}_{theme}.png'))
            # tap Total Value → closes; remembered
            fr.locator('#tvCard').scroll_into_view_if_needed(); fr.click('#tvCard'); fr.wait_for_timeout(300)
            check(f'{vn}/{theme}: tapping Total Value again closes it', not fr.is_visible('#hvCard') and fr.get_attribute('#tvCard', 'aria-expanded') == 'false')
            fr.evaluate("location.reload()"); fr.wait_for_timeout(1500); fr = pg.frame(url=lambda u: 'performance.html' in u); fr.wait_for_function("window.Samsam && Samsam.isReady()")
            check(f'{vn}/{theme}: stays closed after a reload', not fr.is_visible('#hvCard'))
            fr.click('#tvCard'); fr.wait_for_timeout(500)
            check(f'{vn}/{theme}: tapping Total Value opens it', fr.is_visible('#hvCard') and fr.evaluate("document.getElementById('hvCanvas').width > 0"))
            fr.click('#tvCard .sum-label'); fr.wait_for_timeout(300)
            check(f'{vn}/{theme}: no sideways scroll', fr.evaluate("document.documentElement.scrollWidth <= innerWidth + 1") and pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    # Performance opened on its own: the card works there too
    ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    pg.goto(S.SITE + '/performance.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(800)
    was = pg.is_visible('#hvCard'); pg.keyboard.press('Tab'); pg.focus('#tvCard'); pg.keyboard.press('Enter'); pg.wait_for_timeout(400)
    check('standalone: Enter on Total Value toggles the chart', pg.is_visible('#hvCard') != was)
    check('standalone: no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
