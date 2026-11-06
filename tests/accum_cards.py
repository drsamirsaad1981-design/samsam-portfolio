import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
STY="""() => { const c=document.querySelector('.coin-card'), m=c.querySelector('.coin-metric'), l=m.querySelector('label'), v=m.querySelector('val'), b=c.querySelector('.card-act button'), g=c.parentElement;
  const cs=e=>getComputedStyle(e);
  return {bg:cs(c).backgroundColor, pad:cs(c).padding, rad:cs(c).borderRadius, gap:cs(c).gap, mbg:cs(m).backgroundColor, mpad:cs(m).padding, lcol:cs(l).color, lsize:cs(l).fontSize, vsize:cs(v).fontSize, vweight:cs(v).fontWeight,
          bh:Math.round(b.getBoundingClientRect().height), brad:cs(b).borderRadius, gridGap:cs(g).gap, cols:cs(g).gridTemplateColumns.split(' ').length, bodyCols:cs(c.querySelector('.coin-card-body')).gridTemplateColumns.split(' ').length,
          w:Math.round(c.getBoundingClientRect().width)}; }"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
        if name=='desktop': pg.evaluate("Samsam.saveAccumPlan([{sym:'SOL',name:'Solana',targetQty:10,addedAt:'2026-10-18',targetPct:-10},{sym:'ETH',name:'Ethereum',targetQty:1,addedAt:'2026-10-18',alertPrice:2.5},{sym:'DOT',name:'Polkadot',targetQty:500,addedAt:'2026-10-19'},{sym:'SUI',name:'Sui',targetQty:1000,addedAt:'2026-10-19'}])"); pg.wait_for_timeout(600)
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
        main=pg.evaluate(STY)
        pg.goto(SITE+'/accumulation.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        pg.click('#btnCards'); pg.wait_for_timeout(400)
        acc=pg.evaluate(STY)
        diff={k:(main[k],acc[k]) for k in main if main[k]!=acc[k] and k not in ('w',)}
        check(f'{name}: accumulation cards match main-page card styling', not diff, diff)
        check(f'{name}: same cards per row ({main["cols"]}) and similar width ({main["w"]} vs {acc["w"]})', main['cols']==acc['cols'] and abs(main['w']-acc['w'])<=20, (main,acc))
        txt=pg.evaluate("document.querySelector('.coin-card').innerText")
        check(f'{name}: card shows all fields', all(k in txt.upper() for k in ['TARGET AMOUNT','ACTUAL AMOUNT','PENDING AMOUNT','CURRENT PRICE','COST TO TARGET','BUY AT','PRICE ALERT','DCA','REMOVE']), txt[:300])
        # inputs still work: change target on first card
        sym=pg.evaluate("document.querySelector('#cardsView .coin-card .ast-sym').childNodes[0].textContent.trim()")
        inp=pg.locator('.coin-card').first.locator('.acc-set-row').first.locator('input'); inp.fill('777'); inp.press('Enter'); pg.wait_for_timeout(1800)
        saved=pg.evaluate(f"(Samsam.getState().accumPlan.find(e=>e.sym==='{sym}')||{{}}).targetQty")
        check(f'{name}: editing Target Amount on a card saves it ({sym} → {saved})', float(saved or 0)==777, saved)
        pg.mouse.move(1,1)
        y=pg.evaluate("document.getElementById('cardsView').getBoundingClientRect().top+scrollY-8")
        pg.screenshot(path=str(SH/f'accum_cards_{name}.png'), full_page=True, clip={'x':0,'y':y,'width':vp['viewport']['width'],'height':760 if name=='desktop' else 1100})
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
