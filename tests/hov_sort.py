import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
ROWS="""() => [...document.querySelectorAll('#hovAssetList .hov-asset-row')].map(r => { const sym=r.dataset.sym; const c=Samsam.getState().portfolio.find(x=>x.sym===sym); return [sym, c.currentPrice, c.qty*c.currentPrice]; })"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
        pg.evaluate("localStorage.removeItem('samsam_hov_sort')"); pg.reload(); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(800)
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(600)
        r=pg.evaluate(ROWS); v=[x[2] for x in r]
        check(f'{name}: default = Holdings high→low', v==sorted(v,reverse=True) and '▼' in pg.inner_text('.hov-sort[data-sort=holdings]'))
        pg.click('.hov-sort[data-sort=holdings]'); pg.wait_for_timeout(150); v=[x[2] for x in pg.evaluate(ROWS)]
        check(f'{name}: tap Holdings again = low→high ▲', v==sorted(v) and '▲' in pg.inner_text('.hov-sort[data-sort=holdings]'))
        pg.click('.hov-sort[data-sort=asset]'); pg.wait_for_timeout(150); a=[x[0] for x in pg.evaluate(ROWS)]
        check(f'{name}: Asset A→Z ({a[:4]})', a==sorted(a), a[:6])
        pg.click('.hov-sort[data-sort=asset]'); pg.wait_for_timeout(150); a=[x[0] for x in pg.evaluate(ROWS)]
        check(f'{name}: Asset Z→A', a==sorted(a,reverse=True), a[:6])
        check(f'{name}: header is just "Asset" (no separate Price sort)', pg.locator('.hov-sort[data-sort=price]').count() == 0 and pg.inner_text('.hov-h-asset').strip().startswith('Asset') and 'Price' not in pg.inner_text('.hov-h-asset'))
        act=pg.evaluate("[...document.querySelectorAll('.hov-sort')].map(b=>[b.dataset.sort,b.getAttribute('aria-sort')])")
        check(f'{name}: only the active column shows an arrow {act}', [x for x in act if x[1]!='none']==[['asset','descending']], act)
        al=pg.evaluate("""() => { const h=document.querySelector('.hov-h-asset').getBoundingClientRect(); const ic=document.querySelector('#hovAssetList .hov-coin-icon').getBoundingClientRect(); const phb=document.querySelector('.hov-sort[data-sort=holdings]'); const ph={right: phb.getBoundingClientRect().right - parseFloat(getComputedStyle(phb).paddingRight)};   /* heading text (the › column sits in its padding) */ const v=document.querySelector('#hovAssetList .hold-val').getBoundingClientRect(); return [Math.round(h.left-ic.left), Math.round(ph.right-v.right)]; }""")
        check(f'{name}: headers still aligned with columns {al}', abs(al[0])<=2 and abs(al[1])<=4, al)
        pg.evaluate("closeHoldingsView()"); pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(400)
        check(f'{name}: chosen sort remembered', pg.evaluate("hovSort.key")=='asset')
        pg.mouse.move(1,1); pg.locator('.hov-list-card').screenshot(path=str(SH/f'hov_sort_{name}.png'))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
