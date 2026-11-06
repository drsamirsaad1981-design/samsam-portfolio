import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
MAP={'ai':['TAO','NEAR','ICP','RENDER','WLD'],'layer1':['BTC','ETH','SOL','SUI','APT','SEI','AVAX','KAS','HBAR','VET','XDC','FLR','NIGHT','KAVA','CRO','XPL','MON','MOVR','GLMR','GRAM'],
 'layer2':['ARB','OP','STRK','POL','MNT'],'layer0':['DOT','ATOM','KSM','QNT'],'oracle':['LINK','PYTH','AVAIL'],'defi':['ONDO','JUP'],'launchpad':['PONS'],'web3':['ENS'],'meme':['DOGE','VTHO']}
EXP={s:k for k,v in MAP.items() for s in v}
for s in ('BNB','TEST','NOFEED'): EXP[s]='layer1'   # not in the master list: keep their saved (valid) category
LABELS=['AI & DePIN','Layer 1 Blockchains','Layer 2 Blockchains','Layer 0 & Interoperability','Oracles & Middleware','DeFi & RWA','Launchpad','Web3 & Gaming','Meme & Utility Tokens','Other']
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(2500)
        st=pg.evaluate("Samsam.getState().portfolio.map(c=>[c.sym,c.cat])")
        wrong=[(s,c,EXP.get(s,'other')) for s,c in st if c!=EXP.get(s,'other')]
        check(f'{name}: every coin in its new category ({len(st)} coins)', not wrong, wrong[:6])
        if name=='desktop':
            dump=json.load(urllib.request.urlopen('http://127.0.0.1:8787/dump'))
            saved={v['sym']:v.get('cat') for k,v in dump.items() if '/coins/' in k and v and v.get('sym')}
            bad=[(s,c) for s,c in saved.items() if c!=EXP.get(s,'other')]
            check(f'cloud: saved categories updated ({len(saved)} coins)', not bad, bad[:6])
        pg.click('#catPicker .sdd-btn'); pg.wait_for_timeout(250)
        labs=pg.evaluate("[...document.querySelectorAll('.sdd-panel.show .sdd-opt > span:not(.sdd-ico):not(.sdd-sub)')].map(l=>l.innerText.trim())"); pg.keyboard.press('Escape')
        check(f'{name}: category picker uses the 9 categories {labs[1:]}', labs[0]=='All Coins' and all(l in LABELS for l in labs[1:-1]) and labs[-1]=='Manage Categories', labs)
        tot=pg.evaluate("(() => { const p=Samsam.getState().portfolio; const by={}; p.forEach(c=>by[c.cat]=(by[c.cat]||0)+c.qty*c.currentPrice); return [Object.values(by).reduce((a,b)=>a+b,0), p.reduce((a,c)=>a+c.qty*c.currentPrice,0)]; })()")
        check(f'{name}: category totals add up to the portfolio', abs(tot[0]-tot[1])<1e-6, tot)
        pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
        tags=pg.evaluate("""[...document.querySelectorAll('#tableBody tr')].map(r=>[(r.querySelector('.btn-buy-more').getAttribute('onclick').match(/'([^']+)'/)||[])[1], (r.querySelector('.cat-tag')||{}).textContent])""")
        lab=dict(zip(['ai','layer1','layer2','layer0','oracle','defi','launchpad','web3','meme','other'],LABELS))
        bt=[(s,t) for s,t in tags if t!=lab[EXP.get(s,'other')]]
        check(f'{name}: table category tags', tags and not bt, bt[:5])
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
        ct=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card')].map(c=>[c.querySelector('.ast-sym').textContent.replace('↗','').trim(), (c.querySelector('.cat-tag')||{}).textContent])")
        bc=[(s,t) for s,t in ct if t!=lab[EXP.get(s,'other')]]
        check(f'{name}: card category tags', ct and not bc, bc[:5])
        pg.evaluate("setCatFilter('layer0', true)"); pg.wait_for_timeout(300)   # tapping a tag now opens the category editor; the filter lives on the category cards
        shown=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card .ast-sym')].map(e=>e.textContent.replace('↗','').trim())")
        check(f'{name}: category filter shows only that category', shown and all(EXP.get(s)=='layer0' for s in shown), shown)
        if name=='desktop':
            y=pg.evaluate("document.getElementById('summaryGrid').getBoundingClientRect().top+scrollY-8"); pg.evaluate("setCatFilter('')"); pg.wait_for_timeout(300); pg.mouse.move(1,1)
            pg.screenshot(path=str(SH/'tax_main.png'), full_page=True, clip={'x':0,'y':y,'width':1440,'height':620})
        pg.goto(SITE+'/allocation.html'); pg.wait_for_timeout(1000); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(1800)
        sl=pg.evaluate("[...document.querySelectorAll('#hovDonut .donut-slice')].map(s=>[s.dataset.cat, s.getAttribute('fill')])")
        cats=[c for c,_ in sl]; cols=[f for _,f in sl]
        check(f'{name}: allocation donut slices = new categories ({len(sl)})', sl and all(c in lab for c in cats) and len(set(cats))==len(cats), sl)
        check(f'{name}: every slice has its own colour', len(set(cols))==len(cols), cols)
        adj=[(cols[i],cols[(i+1)%len(cols)]) for i in range(len(cols))]
        check(f'{name}: neighbouring slices never share a colour', all(a!=b for a,b in adj))
        pg.click('#hovCatPicker .sdd-btn'); pg.wait_for_timeout(300)   # categories live in the Category card now
        txt=pg.evaluate("document.body.innerText")
        check(f'{name}: allocation legend shows new labels', 'Layer 1 Blockchains' in txt and 'Bitcoin\n' not in txt and 'Infrastructure' not in txt)
        if name=='desktop': pg.screenshot(path=str(SH/'tax_alloc.png'), full_page=False)
        pg.goto(SITE+'/performance.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1800)
        pg.click('#perfCatPicker .sdd-btn'); pg.wait_for_timeout(300)
        txt=pg.evaluate("document.body.innerText")
        check(f'{name}: performance breakdown uses new labels', 'Layer 1 Blockchains' in txt and 'Infrastructure' not in txt)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
