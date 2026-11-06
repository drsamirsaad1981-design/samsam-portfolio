import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1600,'height':900}); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    pg.click('#viewToggleBtn [data-view="table"]'); pg.wait_for_timeout(300)
    st=pg.evaluate("[getComputedStyle(document.getElementById('portfolioTableWrapper')).display, document.querySelector('#viewToggleBtn [data-view=table]').classList.contains('btn-toggle-active'), document.querySelector('#viewToggleBtn [data-view=cards]').classList.contains('btn-toggle-active')]")
    check('Table view: Table button lit, Cards not', st[0]!='none' and st[1] and not st[2], st)
    check('no number inputs in table', pg.evaluate("document.querySelectorAll('#tableBody input[type=number]').length")==0)
    prices=pg.evaluate("[...document.querySelectorAll('#tableBody tr')].map(r=>r.cells[0].querySelector('.ast-price').textContent.trim())")
    check('prices are $ text with commas ('+', '.join(prices[:4])+')', all(re.fullmatch(r'\$[\d,]+\.\d{2,8}',x) for x in prices), [x for x in prices if not re.fullmatch(r'\$[\d,]+\.\d{2,8}',x)][:4])
    btc=pg.evaluate("[...document.querySelectorAll('#tableBody tr')].find(r=>/BTC/.test(r.cells[0].innerText)).cells[0].querySelector('.ast-price').textContent.trim()")
    check(f'BTC price formatted ({btc})', btc=='$100,000.00', btc)
    pnl=pg.evaluate("[...document.querySelectorAll('#tableBody tr')].map(r=>[r.cells[4].querySelector('span').className, r.cells[4].innerText.split('\\n')[0].trim()])")
    neg=[t for c,t in pnl if 'negative' in c]; pos=[t for c,t in pnl if 'positive' in c]
    check(f'losses show minus ({neg[:2]})', neg and all(t.startswith('-$') for t in neg), neg[:3])
    check('gains show plus', pos and all(t.startswith('+$') for t in pos), pos[:3])
    b=pg.evaluate("[...document.querySelectorAll('#tableBody tr:first-child .row-act button')].map(x=>{const r=x.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]})")
    check(f'+ Buy / − Sell equal, ⋯ square {b}', len(b)==3 and b[0]==b[1] and b[2][0]==b[2][1]==b[0][1], b)
    al=pg.evaluate("""() => { const hs=[...document.querySelectorAll('#portfolioTable thead th')]; const r=document.querySelector('#tableBody tr');
      return [1,2,3,4,5].map(i=>{const h=hs[i].getBoundingClientRect(), c=r.cells[i]; const t=(c.querySelector('.price-cell')||c.querySelector('span')||c); const sp=document.createRange(); sp.selectNodeContents(t.classList&&t.classList.contains('price-cell')?t.firstChild:t); const b=sp.getBoundingClientRect(); return [hs[i].innerText.replace(/\\n/g,' '), Math.round((h.left+h.right)/2), Math.round((b.left+b.right)/2)];}); }""")
    check('numeric columns centred under their headers', all(abs(a-b)<=3 for _,a,b in al), al)
    avg=pg.evaluate("[...document.querySelectorAll('#tableBody tr')].map(r=>[r.cells[2].innerText.trim(), r.cells[0].querySelector('.ast-price').textContent.trim()])")
    def ok(x):
        v=float(x.replace('$','').replace(',',''))
        d=len(x.split('.')[1]) if '.' in x else 0
        return (v>=10 and d==2) or (0.01<=v<10 and d==4) or (v<0.01)
    check('avg & price follow one decimals rule ('+', '.join(a for a,_ in avg[:6])+')', all(ok(a) and ok(b) for a,b in avg), [x for x in avg if not (ok(x[0]) and ok(x[1]))][:4])
    gap=pg.evaluate("[document.getElementById('summaryGrid').getBoundingClientRect().bottom, document.getElementById('portfolioTableWrapper').getBoundingClientRect().top, document.querySelector('.controls').getBoundingClientRect().bottom, document.getElementById('summaryGrid').getBoundingClientRect().top]")
    check(f'category cards have space above and below {gap}', gap[1]-gap[0]>=12 and gap[3]-gap[2]>=12, gap)
    opts=pg.evaluate("document.querySelector('#signalDD .sdd-label').textContent")
    check('dropdown no longer duplicates "All Coins"', 'All Coins' not in opts, opts)
    pg.mouse.move(1,1); pg.locator('#portfolioTableWrapper').screenshot(path=str(SH/'table_after.png'))
    y=pg.evaluate("document.querySelector('.controls').getBoundingClientRect().top+scrollY-6"); pg.screenshot(path=str(SH/'table_after_top.png'), full_page=True, clip={'x':0,'y':y,'width':1600,'height':560})
    pg.click('#viewToggleBtn [data-view="cards"]'); pg.wait_for_timeout(300)
    st=pg.evaluate("[getComputedStyle(document.getElementById('coinsStack')).display, document.querySelector('#viewToggleBtn [data-view=cards]').classList.contains('btn-toggle-active'), document.querySelector('#viewToggleBtn [data-view=table]').classList.contains('btn-toggle-active')]")
    check('Cards view: Cards button lit, Table not', st[0]!='none' and st[1] and not st[2], st)
    pg.reload(); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(800)
    check('view remembered after reload with matching button', pg.evaluate("document.querySelector('#viewToggleBtn [data-view=cards]').classList.contains('btn-toggle-active')"))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed (rows)')
# header: sorted column marked, click flips it, an ⓘ tap doesn't sort
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx); pg = ctx.new_page()
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000); pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    m = lambda: pg.evaluate("[...document.querySelectorAll('#portfolioTable thead th.sorted')].map(t => [t.dataset.sort, t.querySelector('.th-sort').textContent, t.getAttribute('aria-sort')])")
    check('header: Holdings marked ▼ (highest first) by default', m() == [['currentValue', '▼', 'descending']], m())
    pg.click('#portfolioTable th[data-sort="pnl"]'); pg.wait_for_timeout(200)
    check('header: clicking P&L moves the mark there', m() == [['pnl', '▼', 'descending']], m())
    pg.click('#portfolioTable th[data-sort="pnl"]'); pg.wait_for_timeout(200)
    check('header: clicking again flips it to ▲', m() == [['pnl', '▲', 'ascending']], m())
    g = pg.evaluate("(() => { const ths = [...document.querySelectorAll('#portfolioTable thead th')]; const hs = ths.map(t => Math.round(t.getBoundingClientRect().height)); const bad = [...document.querySelectorAll('#portfolioTable thead .th-in')].filter(i => { const h = i.querySelector('.cp-hint'); if (!h) return false; const a = h.getBoundingClientRect(), l = i.querySelector('.th-l').getBoundingClientRect(); return a.left < l.right - 1 || a.top > l.bottom; }).map(i => i.innerText); const w = document.getElementById('portfolioTableWrapper'); return { same: new Set(hs).size === 1, bad, fits: w.scrollWidth <= w.clientWidth + 1 }; })()")
    check('header: one row height, every ⓘ beside its label, table fits a 1366px screen', g['same'] and not g['bad'] and g['fits'], g)
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
