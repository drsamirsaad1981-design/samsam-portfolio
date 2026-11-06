"""All Time Profit (no hyphen) everywhere, no "P&L" left; a coin with a sell shows the SAME All Time Profit on the main
table, main card, Performance list and its coin page (realized + unrealized)."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
num=lambda t: float(re.sub(r'[^\d.\-]','', t.replace('−','-').split('\n')[0]))
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); S.setup(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    if pg.query_selector('#samsamImpBase'): pg.click('#samsamImpBase'); pg.wait_for_timeout(4000)
    st=pg.evaluate("(()=>{const s=Samsam.getState();return Object.entries(s.realized.bySym||{}).filter(([k,v])=>v.sellCount>0 && s.portfolio.some(c=>c.sym===k&&c.qty>0)).map(([k])=>k)})()")
    sym = st[0] if st else None
    if not sym:   # make one: sell a bit of a coin through the app
        sym = pg.evaluate("Samsam.getState().portfolio.filter(c=>c.qty>0 && c.sym!=='BTC')[0].sym")
        pg.evaluate(f"(async()=>{{const c=Samsam.getState().portfolio.find(x=>x.sym==='{sym}'); await Samsam.addTx({{sym:'{sym}', type:'sell', qty:c.qty/4, price:c.currentPrice*1.3||1, date:new Date().toISOString()}})}})()")
        pg.wait_for_timeout(2500)
    exp = pg.evaluate(f"coinProfit(Samsam.getState().portfolio.find(c=>c.sym==='{sym}'))")
    check(f'{sym} has a sell (realized ≠ 0)', abs(exp['realized'])>0, exp)
    vals={}
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(400)
    vals['main table']=num(pg.evaluate(f"[...document.querySelectorAll('#tableBody tr, tbody tr')].find(r=>r.innerText.includes('{sym}')).querySelector('.pnl-positive,.pnl-negative').innerText"))
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(400)
    vals['main card']=num(pg.evaluate(f"[...document.querySelectorAll('#coinsStack .coin-card')].find(x=>x.querySelector('.ast-sym').textContent.startsWith('{sym}')).querySelector('.card-pnl-usd').textContent"))
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(1500)
    f=pg.frame(url=lambda u:'performance.html' in u)
    vals['performance']=f.evaluate(f"(()=>{{const s=Samsam.getState();const c=s.portfolio.find(x=>x.sym==='{sym}');const r=(s.realized.bySym||{{}})['{sym}']||{{}};return CPProfit.calc({{value:c.qty*c.currentPrice,cost:c.qty*c.basePrice,realized:r.realized}}).total}})()")
    pg.evaluate(f"openHoldingsView(); openCoinTx('{sym}')"); pg.wait_for_timeout(1200)
    vals['coin page']=num(pg.inner_text('#htxProfit'))
    check('same All Time Profit on table, card, Performance, coin page', max(vals.values())-min(vals.values()) < 0.02 and abs(vals['main card']-exp['total'])<0.02, (vals, exp['total']))
    for name, d in [('main', pg), ('performance', f)]:
        t=d.evaluate("document.body.innerText")
        check(f'{name}: no "All-Time" / "P&L" in the text', 'All-Time' not in t and 'P&L' not in t, re.findall(r'.{20}(?:All-Time|P&L).{20}', t)[:3])
    check('main table header says All Time Profit', 'All Time Profit' in pg.evaluate("document.querySelector('th[data-sort=pnl]').innerText"))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
