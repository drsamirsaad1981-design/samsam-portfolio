import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(200)
        tb=pg.evaluate("document.querySelector('.controls').innerText.replace(/\\s+/g,' ')")
        need=['Table','Cards','CSV','PDF']
        check(f'{name}: toolbar has no Accumulation Plan / Allocation buttons', 'Accumulation Plan' not in tb and 'Allocation' not in tb and all(x in tb for x in need), tb)
        if True:
            L=pg.evaluate("""() => { const vis=b=>b.offsetParent!==null; const r=e=>e.getBoundingClientRect(); const T=t=>[...document.querySelectorAll('.btn, .cp-vseg>button')].filter(b=>vis(b)&&b.textContent.includes(t)).map(r)[0];
              return {csv:T('CSV'), pdf:T('PDF'), table:T('Table'), cards:T('Cards'), search:r(document.getElementById('searchBox')), sig:r(document.querySelector('#signalDD .sdd-btn')), add:[...document.querySelectorAll('.tb-add')].filter(vis).map(r)[0], ai:[...document.querySelectorAll('.tb-ai')].filter(vis).map(r)[0], n:[...document.querySelectorAll('.btn, .cp-add')].filter(b=>vis(b)&&/Add New Coin|AI Analysis/.test(b.textContent.trim())||/AI Analysis|Add New Coin/.test(b.getAttribute('aria-label')||'')).length}; }""")
            row1=abs(L['csv']['top']-L['table']['top'])<6 and L['csv']['right']<=L['pdf']['left'] and L['pdf']['right']<L['table']['left'] and L['table']['right']<=L['cards']['left']
            check(f'{name} row 1: CSV · PDF on the left, Table · Cards on the right', row1, {k:L[k]['left'] for k in ('csv','pdf','table','cards')})
            row2=abs(L['search']['top']-L['sig']['top'])<6 and abs(L['sig']['top']-L['add']['top'])<6 and L['search']['right']<L['sig']['left'] and L['sig']['right']<=L['add']['left'] and L['ai'] is None
            check(f'{name} row 2: Search left; All signals, Add New Coin on the right (AI = floating button)', row2, {k:(L[k] and (round(L[k]['left']),round(L[k]['top']))) for k in ('search','sig','add','ai')})
            check(f'{name}: Add shown once, AI is the floating button', L['n']==1 and pg.evaluate("document.querySelectorAll('#cpAiFab').length")==1, L['n'])
        check(f'{name}: Accumulation & Allocation still reachable from their cards', pg.evaluate("!!document.querySelector('a#accumProgressBar[href*=accumulation]') && !!document.querySelector('a#allocMiniCard[href*=allocation]')"))
        g=pg.evaluate("""() => { const r=e=>e.getBoundingClientRect(); const cat=r(document.getElementById('catPicker')), bar=r(document.querySelector('.search-signal-bar')), s=r(document.getElementById('searchBox')), d=r(document.querySelector('#signalDD .sdd-btn')), list=r(document.getElementById('coinsStack'));
          return {catBottom:cat.bottom, barTop:bar.top, barBottom:bar.bottom, listTop:list.top, s:[s.left,s.top,s.width], d:[d.left,d.top,d.width], vw:innerWidth}; }""")
        check(f'{name}: search + signals sit between CATEGORY card and coin list', g['catBottom']<=g['barTop'] and g['barBottom']<=g['listTop'], g)
        if name=='mobile':
            h=pg.evaluate("Math.round(document.querySelector('#coinsStack .coin-card').getBoundingClientRect().top - document.querySelector('.controls').getBoundingClientRect().top)")
            check(f'mobile: controls take ≤ 170px above the first coin card ({h}px, was 382px)', h<=170, h)
            ic=pg.evaluate("[...document.querySelectorAll('.search-signal-bar .tb-desktop-only')].map(b=>[b.innerText.trim(), Math.round(b.getBoundingClientRect().width), b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)])")
            check(f'mobile: AI / Add icon buttons are 44×44 touch targets {ic}', [x[0] for x in ic]==[''] and pg.evaluate("document.querySelectorAll('.search-signal-bar .tb-desktop-only svg').length")>=1 and ic[0][2]=='Add New Coin' and all(x[1]>=44 and x[3]>=44 for x in ic) and all(x[2] for x in ic), ic)
            gp=pg.evaluate("Math.round(document.querySelector('#coinsStack .coin-card').getBoundingClientRect().top - document.querySelector('.search-signal-bar').getBoundingClientRect().bottom)")
            check(f'mobile: 8px between search row and first coin card ({gp}px)', gp<=8, gp)
        if name=='desktop':
            check('desktop: search left (wide), signals right on the same line', abs(g['s'][1]-g['d'][1])<4 and g['s'][0]<g['d'][0] and g['s'][2]>g['d'][2]*2, g)
        pg.fill('#searchBox','sol'); pg.wait_for_timeout(250)
        sy=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card .ast-sym')].map(e=>e.textContent.replace('↗','').trim())")
        check(f'{name}: search filters coins {sy}', sy==['SOL'], sy); pg.fill('#searchBox',''); pg.wait_for_timeout(200)
        pg.click('#signalDD .sdd-btn'); pg.wait_for_timeout(300)
        if name=='mobile': check('mobile: signals open as bottom sheet', pg.evaluate("document.querySelector('.sdd-panel.show').classList.contains('sheet')"))
        pg.locator('.sdd-panel.show .sdd-opt:has-text("Top Losers")').click(); pg.wait_for_timeout(250)
        st=pg.evaluate("[document.getElementById('filterAction').value, document.querySelector('#signalDD .sdd-label').textContent, document.querySelectorAll('#coinsStack .coin-card').length]")
        check(f'{name}: signal filter applies {st}', st[0]=='losers' and st[1]=='Top Losers' and st[2]>0, st)
        pg.click('#signalDD .sdd-btn'); pg.wait_for_timeout(250); pg.locator('.sdd-panel.show .sdd-opt:has-text("All signals")').click(); pg.wait_for_timeout(200)
        pg.click('#viewToggleBtn [data-view=table]'); pg.wait_for_timeout(200)
        check(f'{name}: Table/Cards switch works', pg.evaluate("getComputedStyle(document.getElementById('portfolioTableWrapper')).display!=='none' && document.querySelector('#viewToggleBtn [data-view=table]').classList.contains('btn-toggle-active')"))
        pg.click('#viewToggleBtn [data-view=cards]'); pg.wait_for_timeout(200)
        pg.mouse.move(1,1); y=pg.evaluate("document.querySelector('.controls').getBoundingClientRect().top+scrollY-8")
        pg.screenshot(path=str(SH/f'toolbar_{name}.png'), full_page=True, clip={'x':0,'y':y,'width':vp['viewport']['width'],'height':380 if name=='desktop' else 520})
        # Synced badge never covers the last card's numbers (scrolled to the very bottom)
        pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(300)
        ov=pg.evaluate("""() => { const pill=document.getElementById('samsamSyncPill').getBoundingClientRect(); const cards=[...document.querySelectorAll('#coinsStack .coin-card')]; const last=cards[cards.length-1];
          const vals=[...last.querySelectorAll('.coin-metric val, .card-act button')].map(e=>e.getBoundingClientRect()); const hit=vals.filter(b=>b.bottom>pill.top && b.top<pill.bottom && b.right>pill.left && b.left<pill.right).length;
          return {hit, pillBottomGap: Math.round(innerHeight-pill.bottom), lastBottom: Math.round(last.getBoundingClientRect().bottom), pillTop: Math.round(pill.top)}; }""")
        hidden=pg.evaluate("getComputedStyle(document.getElementById('samsamSyncPill')).display==='none'")
        check(f'{name}: Synced badge clear of the last card (hidden when synced: {hidden}) {ov}', hidden or (ov['hit']==0 and ov['lastBottom']<=ov['pillTop']), ov)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
