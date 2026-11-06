import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)),('small',dict(viewport={'width':360,'height':780},is_mobile=True,has_touch=True))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(800)
        pg.goto(SITE+'/index.html#holdings/SOL'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        g=pg.evaluate("""(()=>{const r=e=>e.getBoundingClientRect(); const a=r(document.getElementById('htxAddBtn')), t=r(document.querySelector('#htxTypeDD .sdd-btn')), c=r(document.querySelector('#htxCoinDD .sdd-btn')), f=r(document.querySelector('.htx-filters'));
          return {sameRow: Math.abs(a.top-t.top)<4 && Math.abs(a.top-c.top)<4, rightAligned: Math.round(f.right-a.right), order: t.right<=c.left && c.right<=a.left, text: document.getElementById('htxAddBtn').innerText.trim(), fab: !!document.querySelector('.htx-fab'), backs: [...document.querySelectorAll('#holdingsOverlay button, #holdingsOverlay a')].filter(b=>b.offsetParent && /back/i.test(b.innerText)).map(b=>b.innerText.trim())}})()""")
        check(f'{name}: "+ Add Transaction" on the filter row, right-aligned {g}', g['sameRow'] and g['order'] and g['rightAligned']<=20 and g['text'] in ('Add Transaction','Add') and not g['fab'], g)
        if name!='desktop': check(f'{name}: label ({g["text"]})', g['text']=='Add' and pg.evaluate("document.getElementById('htxAddBtn').title").startswith('Add a Buy'))
        check(f'{name}: only one Back control {g["backs"]}', len(g['backs'])==1, g['backs'])
        pg.click('#htxAddBtn'); pg.wait_for_timeout(300)
        check(f'{name}: button opens the Add Transaction form for SOL', pg.evaluate("document.getElementById('atxBackdrop').classList.contains('show') && atxSym==='SOL'"))
        pg.evaluate("closeAddTx()"); pg.wait_for_timeout(200)
        pg.click('#htxCoinDD .sdd-btn'); pg.wait_for_timeout(300)
        o=pg.evaluate("(()=>{const p=document.querySelector('.sdd-panel.show'); return {subs: p.querySelectorAll('.sdd-sub').length, first: [...p.querySelectorAll('.sdd-opt')].slice(0,3).map(x=>x.innerText.trim()), ph: (p.querySelector('.sdd-search input')||{}).placeholder, icons: p.querySelectorAll('.sdd-opt .sdd-ico img, .sdd-opt .sdd-ico div').length}})()")
        check(f'{name}: coin list = icon + symbol only {o["first"]}', o['subs']==0 and all(' ' not in x for x in o['first']) and o['icons']>0, o)
        check(f'{name}: search hint "Search coin..." ({o["ph"]})', o['ph']=='Search coin...', o['ph'])
        pg.fill('.sdd-panel.show .sdd-search input','ne'); pg.wait_for_timeout(150)
        f=pg.evaluate("[...document.querySelectorAll('.sdd-panel.show .sdd-opt')].map(x=>x.innerText.trim())")
        check(f'{name}: search by symbol works {f}', f and all('NE' in x for x in f), f)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        pg.mouse.move(1,1); pg.screenshot(path=str(SH/f'txview_{name}.png'), clip={'x':0,'y':0,'width':vp['viewport']['width'],'height':360})
        pg.click('.hov-back-btn'); pg.wait_for_timeout(300)
        check(f'{name}: Back → Holdings list', pg.evaluate("location.hash")=='#holdings' and pg.evaluate("document.getElementById('holdingsOverlay').dataset.view||''")=='')
        check(f'{name}: no horizontal overflow', pg.evaluate("document.getElementById('holdingsOverlay').scrollWidth <= innerWidth"))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
