"""Bottom bar Portfolio · Plan · Market Hub; Portfolio = four tabs (Overview · Holdings · Performance · Allocation) at the
top of each of them; Portfolio opens the tab used last; tapping it again goes back to the top; standalone pages work too."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
CUR = "document.querySelector('#cpBnav a[aria-current=page]')?.dataset.k"
def sel(pg, fr=None):
    f = fr or pg
    return f.evaluate("(()=>{const ov=document.getElementById('holdingsOverlay'); const on=ov && ov.style.display==='flex'; return [...document.querySelectorAll('.cp-ptabs')].filter(n=>n.offsetParent && (!on || ov.contains(n))).map(n=>n.querySelector('[aria-selected=true]').dataset.t)})()")
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('small', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            if vn == 'small' and theme == 'dark': continue
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');if(!sessionStorage.getItem('pt')){{localStorage.removeItem('samsam_pf_tab');localStorage.removeItem('samsam_hov_mode');sessionStorage.setItem('pt','1')}}}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            bar = pg.evaluate("[...document.querySelectorAll('#cpBnav a')].map(a=>[a.dataset.k, a.innerText.trim(), !!a.querySelector('.nav-logo')])")
            check(f'{vn}/{theme}: bar = Portfolio (app logo) · Plan · Market Hub {bar}', [b[:2] for b in bar] == [['home', 'Portfolio'], ['accumulation', 'Plan'], ['market', 'Market Hub']] and bar[0][2], bar)
            check(f'{vn}/{theme}: Overview tab marked on the main page, Portfolio marked in the bar', sel(pg) == ['overview'] and pg.evaluate(CUR) == 'home', (sel(pg), pg.evaluate(CUR)))
            fit = pg.evaluate("[...document.querySelectorAll('.cp-ptabs button')].filter(b=>b.offsetParent).every(b=>b.scrollWidth<=b.clientWidth+1)")
            check(f'{vn}/{theme}: all four tab names fit', fit)
            pg.screenshot(path=str(SH / f'pt_{vn}_{theme}_overview.png'))
            # Holdings
            pg.locator('.cp-ptabs button[data-t=holdings]').first.click(); pg.wait_for_timeout(900)
            h = pg.evaluate("({hash: location.hash, mode: holdingsOverlay.getAttribute('data-mode'), title: hovNavTitle.textContent, chart: getComputedStyle(document.querySelector('.hov-value-card')).display})")
            check(f'{vn}/{theme}: Holdings tab → the Holdings screen with its chart {h}', h['hash'] == '#holdings' and h['mode'] == 'assets' and h['title'] == 'Holdings' and h['chart'] != 'none' and sel(pg) == ['holdings'] and pg.evaluate(CUR) == 'home', (h, sel(pg)))
            pg.screenshot(path=str(SH / f'pt_{vn}_{theme}_holdings.png'))
            # Allocation
            pg.locator('#hovPtabs button[data-t=allocation]').click(); pg.wait_for_timeout(600)
            a = pg.evaluate("({mode: holdingsOverlay.getAttribute('data-mode'), title: hovNavTitle.textContent, donut: getComputedStyle(hovAllocCard).display})")
            check(f'{vn}/{theme}: Allocation tab → donut + shares {a}', a['mode'] == 'alloc' and a['title'] == 'Allocation' and a['donut'] == 'flex' and sel(pg) == ['allocation'], (a, sel(pg)))
            pg.screenshot(path=str(SH / f'pt_{vn}_{theme}_allocation.png'))
            # Performance
            pg.locator('#hovPtabs button[data-t=performance]').click(); pg.wait_for_timeout(1500)
            fr = pg.frame(url=lambda u: 'performance.html' in u)
            check(f'{vn}/{theme}: Performance tab → the Performance view, its tab marked, Portfolio still marked', pg.evaluate("location.hash") == '#performance' and fr and sel(pg, fr) == ['performance'] and pg.evaluate(CUR) == 'home' and pg.evaluate("holdingsOverlay.style.display") == 'none', (pg.evaluate("location.hash"), fr and sel(pg, fr)))
            pg.screenshot(path=str(SH / f'pt_{vn}_{theme}_performance.png'))
            # Plan, then Portfolio → the last tab (Performance)
            pg.click('#cpBnav a[data-k=accumulation]'); pg.wait_for_timeout(800)
            check(f'{vn}/{theme}: Plan opens, Plan marked', pg.evaluate("location.hash") == '#accumulation' and pg.evaluate(CUR) == 'accumulation')
            pg.click('#cpBnav a[data-k=home]'); pg.wait_for_timeout(1000)
            check(f'{vn}/{theme}: Portfolio opens the tab used last (Performance)', pg.evaluate("location.hash") == '#performance' and pg.evaluate(CUR) == 'home')
            fr = pg.frame(url=lambda u: 'performance.html' in u)
            fr.locator('.cp-ptabs button[data-t=overview]').click(); pg.wait_for_timeout(800)
            check(f'{vn}/{theme}: Overview from Performance → the main page', pg.evaluate("location.hash") in ('', '#') and sel(pg) == ['overview'] and not pg.evaluate("document.getElementById('cpViews').classList.contains('on')"))
            pg.click('#cpBnav a[data-k=market]'); pg.wait_for_timeout(800)
            pg.click('#cpBnav a[data-k=home]'); pg.wait_for_timeout(800)
            check(f'{vn}/{theme}: Portfolio after Market → Overview (used last)', sel(pg) == ['overview'] and pg.evaluate(CUR) == 'home')
            # Holdings → coin → tabs hidden; Back → Holdings with tabs
            pg.locator('.cp-ptabs button[data-t=holdings]').first.click(); pg.wait_for_timeout(800)
            pg.locator('#hovAssetList .htx-open').first.click(); pg.wait_for_timeout(600)
            check(f'{vn}/{theme}: a coin page hides the tabs', not pg.is_visible('#hovPtabs'))
            pg.click('#cpBnav a[data-k=home]'); pg.wait_for_timeout(700)
            check(f'{vn}/{theme}: Portfolio from a coin page → back to that tab (Holdings)', pg.evaluate("location.hash") == '#holdings' and pg.is_visible('#hovPtabs') and sel(pg) == ['holdings'])
            # Home cards still open their tabs
            pg.locator('#hovPtabs button[data-t=overview]').click(); pg.wait_for_timeout(700)
            pg.click('#allocMiniCard'); pg.wait_for_timeout(900)
            check(f'{vn}/{theme}: Home Allocation card → the Allocation tab', sel(pg) == ['allocation'])
            check(f'{vn}/{theme}: no sideways scrolling', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    # standalone Performance page (not inside the app)
    ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    pg.goto(S.SITE + '/performance.html'); pg.wait_for_timeout(2000)
    check('standalone Performance: tabs + Portfolio marked', sel(pg) == ['performance'] and pg.evaluate(CUR) == 'home', (sel(pg), pg.evaluate(CUR)))
    pg.locator('.cp-ptabs button[data-t=allocation]').click(); pg.wait_for_timeout(2500)
    check('standalone: Allocation tab → main app on Allocation', pg.url.endswith('#holdings') and pg.evaluate("holdingsOverlay.getAttribute('data-mode')") == 'alloc', pg.url)
    check('standalone: no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
