import sys, pathlib, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)),('desktop',dict(viewport={'width':1440,'height':900}))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(5000)
        fr=lambda k: pg.frame(url=lambda u: k+'.html' in u)
        check(f'{name}: 3 views preloaded (Allocation lives in Holdings now)', all(fr(k) for k in ('performance','accumulation','market')) and not fr('allocation'))
        pg.evaluate('window.__mark=1')
        t=time.time(); pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_function("document.querySelector('#cpViews').classList.contains('on')"); dt=time.time()-t
        check(f'{name}: tab switch instant ({dt*1000:.0f}ms), hash', dt<1 and pg.evaluate('location.hash')=='#performance')
        a=fr('performance')
        info=a.evaluate("[SamsamUI.inShell, getComputedStyle(document.querySelector('a.cp-back[data-back]')||document.body).display, !!document.querySelector('#cpBnav'), !!(document.querySelector('.cp-brand-logo')||{}).offsetParent]")
        check(f'{name}: frame in shell, no back (app logo instead), no nested nav', info[0] and info[1]=='none' and not info[2] and info[3], info)
        check(f'{name}: nav highlights Performance', pg.evaluate("document.querySelector('#cpBnav a[aria-current=page]').dataset.k")=='home')   # Performance is a Portfolio tab
        a.wait_for_timeout(1500); a.click('#perfCatPicker .sdd-btn'); a.wait_for_selector('.sdd-panel.show .sdd-opt'); a.locator('.sdd-panel.show .sdd-opt').nth(2).click(); a.wait_for_timeout(400)
        lab=a.evaluate("document.querySelector('#perfCatPicker .sdd-btn').innerText.trim()")
        a.evaluate("SamsamUI.openCoin('BTC')"); pg.wait_for_timeout(800)
        check(f'{name}: coin from frame opens tx overlay', pg.evaluate("location.hash").startswith('#holdings/') and pg.evaluate("document.querySelector('#cpBnav a[aria-current=page]').dataset.k")=='home', pg.evaluate('location.hash'))
        pg.go_back(); pg.wait_for_timeout(600)
        check(f'{name}: back returns to performance with filter kept', pg.evaluate('location.hash')=='#performance' and a.evaluate("document.querySelector('#perfCatPicker .sdd-btn').innerText.trim()")==lab, [pg.evaluate('location.hash'),lab])
        pg.evaluate("cpShell.go('allocation')"); pg.wait_for_timeout(600)
        check(f'{name}: Allocation → Holdings on its Allocation switch', pg.evaluate('location.hash')=='#holdings' and pg.get_attribute('#holdingsOverlay','data-mode')=='alloc' and pg.evaluate("document.querySelector('#cpBnav a[aria-current=page]').dataset.k")=='home')
        pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(400)
        check(f'{name}: home hides views', not pg.evaluate("document.querySelector('#cpViews').classList.contains('on')"))
        pg.click('#perfChartWrap'); pg.wait_for_timeout(500)
        check(f'{name}: main card routes to performance in shell', pg.evaluate('location.hash')=='#performance' and pg.evaluate("location.pathname").endswith('index.html'))
        check(f'{name}: no full page loads', pg.evaluate('window.__mark')==1)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
