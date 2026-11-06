import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1000)
        sym='ARB' if name=='desktop' else 'OP'
        b=pg.evaluate(f"(()=>{{const c=Samsam.getState().portfolio.find(x=>x.sym==='{sym}'); return [c.qty,c.basePrice]}})()")
        pg.evaluate(f"openAddTx('buy','{sym}')"); pg.wait_for_timeout(200)
        check(f'{name}: Buy form has a Buying fee (USD) field', pg.is_visible('#atxFeeUsd'))
        pg.fill('#atxQty','100'); pg.fill('#atxPrice','2'); pg.fill('#atxFeeUsd','5'); pg.wait_for_timeout(100)
        pv=pg.inner_text('#atxPreview')
        check(f'{name}: preview total includes the fee ({pv.splitlines()[0]})', '$205.00' in pv, pv)
        pg.evaluate("openAddTx('sell','%s')"%sym); pg.wait_for_timeout(100)
        check(f'{name}: Sell shows the Selling fee field', pg.is_visible('#atxFeeUsd') and 'Selling fee' in pg.inner_text('#atxFeeUsdLabel'))
        pg.evaluate(f"openAddTx('buy','{sym}')"); pg.fill('#atxQty','100'); pg.fill('#atxPrice','2'); pg.fill('#atxFeeUsd','5'); pg.click('#atxSave')
        exp=(b[0]*b[1]+100*2+5)/(b[0]+100)
        pg.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(x=>x.sym==='{sym}').basePrice - {exp}) < 1e-9", timeout=8000)
        a=pg.evaluate(f"(()=>{{const c=Samsam.getState().portfolio.find(x=>x.sym==='{sym}'); return [c.qty,c.basePrice]}})()")
        check(f'{name}: average buy price = (old cost + 100×$2 + $5 fee) / amount', abs(a[1]-exp)<1e-9 and abs(a[0]-(b[0]+100))<1e-9, (a,exp))
        pg.goto(f'{SITE}/index.html#holdings/{sym}'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        cost=pg.inner_text('#htxCost'); want=pg.evaluate(f"SamsamFmt.usd((c=>c.qty*c.basePrice)(Samsam.getState().portfolio.find(x=>x.sym==='{sym}')))")
        check(f'{name}: coin screen Cost Basis includes the fee ({cost})', cost==want, (cost,want))
        lst=pg.inner_text('#htxList')
        check(f'{name}: buy row shows the fee', 'fee $5.00' in lst and '$205.00' in lst, lst[:300])
        # the coin page's Cost Basis ⓘ is the shared hint now (same look and behaviour as every other ⓘ)
        tip=pg.locator('#holdingsOverlay .htx-card .cp-hint[data-hint="costBasis"]').first
        if name=='desktop': tip.click()
        else: tip.tap()
        pg.wait_for_timeout(300)
        info=pg.evaluate("(()=>{const p=document.querySelector('.cph'); if(!p) return [false,'',-1,0,0,false]; const r=p.getBoundingClientRect(); const el=document.elementFromPoint(r.left+r.width/2, r.top+20); return [true, p.innerText.replace(/\\s+/g,' '), Math.round(r.top), Math.round(r.bottom), innerHeight, !!(el&&el.closest('.cph'))]})()")
        check(f'{name}: ⓘ shows the Cost Basis explanation', info[0] and 'Avg Buy Price × Amount held' in info[1] and 'fees included' in info[1], info[:2])
        check(f'{name}: popup fully on screen and on top {info[2:]}', info[2]>=0 and info[3]<=info[4] and info[5], info)
        pg.screenshot(path=str(SH/f'fee_tip_{name}.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(f'{name}: Esc closes it', not pg.query_selector('.cph'))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
