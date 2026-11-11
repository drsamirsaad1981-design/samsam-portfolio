import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
SYMS="[...document.querySelectorAll('#hovAssetList .hov-asset-row')].map(e=>e.dataset.sym)"
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(600)
        t=pg.evaluate("document.querySelector('#hovCatPicker .sdd-btn').innerText.replace(/\\s+/g,' ')")
        n_all=len(pg.evaluate(SYMS)); total=pg.evaluate("SamsamFmt.usd(Samsam.getState().portfolio.reduce((a,c)=>a+c.qty*c.currentPrice,0))")
        check(f'{name}: category card on Allocation ({t})', 'All Coins' in t and total in t and n_all==pg.evaluate("Samsam.getState().portfolio.length"), (t,n_all))
        pg.click('#hovCatPicker .sdd-btn'); pg.wait_for_timeout(300)
        names=pg.evaluate("[...document.querySelectorAll('.sdd-panel.show .sdd-opt > span:not(.sdd-ico):not(.sdd-sub)')].map(l=>l.innerText.trim())")
        check(f'{name}: same 10 categories as main page', names[:11]==['All Coins','Bitcoin','Layer 1 Blockchains','Layer 2 Blockchains','AI & DePIN','Layer 0 & Interoperability','Oracles & Middleware','DeFi & RWA','Meme & Utility Tokens','Launchpad','Web3 & Gaming'], names)
        vis=pg.evaluate("(()=>{const p=document.querySelector('.sdd-panel.show'); const r=p.getBoundingClientRect(); const el=document.elementFromPoint(r.left+r.width/2, r.top+40); return [p.classList.contains('sheet'), p.contains(el)]})()")
        check(f'{name}: list shows above the Allocation screen {vis}', vis[1] and (vis[0] if name=='mobile' else not vis[0]), vis)
        pg.screenshot(path=str(SH/f'hov_cat_{name}_open.png'))
        pg.locator('.sdd-panel.show .sdd-opt:has-text("Layer 0 & Interoperability")').click(); pg.wait_for_timeout(150)
        syms=pg.evaluate(SYMS); anim=pg.evaluate("document.querySelectorAll('#hovAssetList .hov-asset-row.slide-up').length")
        check(f'{name}: list filtered to Layer 0 {syms}', sorted(syms)==['ATOM','DOT','KSM','QNT'], syms)
        check(f'{name}: rows slide up', anim==len(syms))
        v=pg.evaluate("[document.getElementById('hovCatVal').textContent, SamsamFmt.usd(Samsam.getState().portfolio.filter(c=>c.cat==='layer0').reduce((a,c)=>a+c.qty*c.currentPrice,0))]")
        check(f'{name}: card value = category total + its share (Allocation) {v}', v[0].startswith(v[1] + ' · ') and v[0].endswith('%'), v)
        pg.click('.hov-sort[data-sort=asset]'); pg.wait_for_timeout(150); a=pg.evaluate(SYMS)
        check(f'{name}: sorting still works inside the category {a}', a in (sorted(a), sorted(a,reverse=True)) and len(a)==4, a)
        pg.click('.hov-sort[data-sort=holdings]'); pg.wait_for_timeout(100)
        pg.mouse.move(1,1); pg.wait_for_timeout(400); pg.screenshot(path=str(SH/f'hov_cat_{name}.png'))
        pg.click('#hovCatPicker .sdd-btn'); pg.wait_for_timeout(250); pg.locator('.sdd-panel.show .sdd-opt:has-text("All Coins")').click(); pg.wait_for_timeout(150)
        check(f'{name}: back to All Coins', len(pg.evaluate(SYMS))==n_all)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
