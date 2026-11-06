import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
MAIN="""() => Object.fromEntries([...document.querySelectorAll('#tableBody tr')].map(r => { const a=r.cells[0]; const img=a.querySelector('img'); const links=[...a.querySelectorAll('a[href*=coinmarketcap]')].map(x=>x.href);
  const sym=(r.querySelector('.btn-buy-more').getAttribute('onclick').match(/'([^']+)'/)||[])[1]; return [sym, {img: img?img.getAttribute('src'):'fallback', link: links[0]||null, n: links.length}]; }))"""
ACC="""(sel) => Object.fromEntries([...document.querySelectorAll(sel)].map(el => { const img=el.querySelector('img'); const links=[...el.querySelectorAll('a[href*=coinmarketcap]')].map(x=>x.href);
  const sym=el.querySelector('.ast-sym').childNodes[0].textContent.trim(); return [sym, {img: img?img.getAttribute('src'):'fallback', link: links[0]||null, n: links.length}]; }))"""
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1440,'height':900}); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
    pg.evaluate("Samsam.saveAccumPlan(['SOL','ETH','DOT','SUI','NIGHT','PONS','VTHO','AVAIL'].map((s,i)=>({sym:s,name:s,targetQty:100,addedAt:'2026-10-1'+i})))"); pg.wait_for_timeout(700)
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    main=pg.evaluate(MAIN)
    pg.goto(SITE+'/accumulation.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    pg.click('#btnTable'); pg.wait_for_timeout(300)
    tab=pg.evaluate(ACC, '#tableView tbody tr')
    pg.click('#btnCards'); pg.wait_for_timeout(300)
    crd=pg.evaluate(ACC, '#cardsView .coin-card')
    for view,got in (('table',tab),('cards',crd)):
        check(f'{view}: shows all plan coins {sorted(got)}', len(got)==8, got)
        bad={s:(v,main.get(s)) for s,v in got.items() if not main.get(s) or v['img']!=main[s]['img']}
        check(f'{view}: same coin icon as main page', not bad, bad)
        badl={s:(v['link'],main[s]['link']) for s,v in got.items() if main.get(s) and (v['link']!=main[s]['link'] or v['n']<2)}
        check(f'{view}: icon + symbol link to the same CoinMarketCap page', not badl, badl)
    pg.wait_for_timeout(1500)
    broken=pg.evaluate("[...document.querySelectorAll('#cardsView img')].filter(i=>i.complete && i.naturalWidth===0).length")
    check('no broken icon images', broken==0, broken)
    pg.mouse.move(1,1)
    y=pg.evaluate("document.getElementById('cardsView').getBoundingClientRect().top+scrollY-8"); pg.screenshot(path=str(SH/'accum_icons_cards.png'), full_page=True, clip={'x':0,'y':y,'width':1440,'height':260})
    pg.click('#btnTable'); pg.wait_for_timeout(300); pg.locator('#tableView').screenshot(path=str(SH/'accum_icons_table.png'))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
