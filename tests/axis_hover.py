import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
HOURS=re.compile(r'^\d\d:\d\d$'); DATES=re.compile(r'^\d{1,2} [A-Z][a-z]{2}( \d\d)?$|^[A-Z][a-z]{2} \d\d$')
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1366,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000); pg.wait_for_timeout(1500)
        if name=='desktop':
            pg.mouse.move(2,2); pg.wait_for_timeout(300)
            base=pg.evaluate("getComputedStyle(document.getElementById('holdingsCard')).borderTopColor")
            pg.hover('#holdingsCard .holdings-title'); pg.wait_for_timeout(400)
            hc=pg.evaluate("getComputedStyle(document.getElementById('holdingsCard')).borderTopColor")
            pg.hover('#allocMiniCard .alloc-mini-title'); pg.wait_for_timeout(400)
            ac=pg.evaluate("getComputedStyle(document.getElementById('allocMiniCard')).borderTopColor")
            check('desktop: Holdings hover shows the same orange outline as other cards', hc==ac and hc!=base, (base,hc,ac))
        for card in ('#holdingsCard','#perfChartWrap'):
            for r in ('24h','7d','30d','all'):
                url0=pg.url
                pg.locator(f'{card} .holdings-tab[data-range="{r}"]').click(); pg.wait_for_timeout(250)
                opened=pg.evaluate("getComputedStyle(document.getElementById('holdingsOverlay')).display==='flex'")
                check(f'{name}: {card} {r} tab changes filter only (no navigation)', pg.url==url0 and not opened, (pg.url,opened))
                act=pg.evaluate("[...document.querySelectorAll('.holdings-tab.active')].map(b=>b.dataset.range)")
                check(f'{name}: both cards show {r} active', act==[r,r], act)
                hl,pl=pg.evaluate("[document.getElementById('holdingsCanvas').dataset.xLabels, document.getElementById('perfChartCanvas').dataset.xLabels]")
                rx=HOURS if r=='24h' else DATES
                ok=all(rx.match(x) for x in hl.split('|')+pl.split('|')) and hl and pl
                check(f'{name}: {r} X-axis same style on both ({hl} / {pl})', ok, (hl,pl))
                if card=='#perfChartWrap' and r in('24h','7d') and name=='desktop':
                    pg.locator('#mainTrio').screenshot(path=str(SH/f'axis_{r}.png'))
        pg.locator('#holdingsCard .holdings-tab[data-range="24h"]').click()
        # (the Holdings screen and its own chart were dropped — the Overview card above is that chart)
        pg.goto(SITE+'/performance.html'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length>100"); pg.wait_for_timeout(800)
        for r,lab in (('24h',HOURS),('7d',DATES),('all',DATES)):
            pg.click(f'.pcc-tabs button[data-r="{r}"]'); pg.wait_for_timeout(200)
            xl=pg.evaluate("document.getElementById('perfFullCanvas').dataset.xLabels")
            check(f'{name}: Performance page {r} axis ({xl})', xl and all(lab.match(x) for x in xl.split('|')), xl)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
