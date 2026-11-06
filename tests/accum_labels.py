import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1440,'height':900}); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()")
    pg.evaluate("Samsam.saveAccumPlan([{sym:'SOL',name:'Solana',targetQty:10,addedAt:'x'},{sym:'ETH',name:'Ethereum',targetQty:1,addedAt:'y',targetPct:-10}])"); pg.wait_for_timeout(600)
    pg.goto(SITE+'/accumulation.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    pg.click('#btnTable'); pg.wait_for_timeout(300)
    th=pg.evaluate("[...document.querySelectorAll('#tableView thead th')].map(t=>t.innerText.replace(/[🎯💰]/gu,'').trim()).filter(Boolean)")
    pg.click('#btnCards'); pg.wait_for_timeout(300)
    cl=pg.evaluate("[...document.querySelector('#cardsView .coin-card').querySelectorAll('.coin-metric > label, .acc-set-row > label')].slice(0,9).map(e=>e.innerText.replace(/[🎯💰🔔:]/gu,'').replace(/\\s*[\\d.]+%$/,'').trim())")
    ct=pg.evaluate("document.querySelector('#cardsView .coin-card').innerText")
    print('table:', th); print('cards:', cl)
    for lbl in ['Target Amount','Pending Amount','Buy At','Cost to Target','Progress']:   # Current Price: under the symbol now
        check(f'"{lbl}" in table and cards (same Title Case)', lbl in th and (lbl in cl or lbl in ct), (th, cl))
    pg.locator('.acc-card').first.screenshot(path=str(SH/'accum_card.png'))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
