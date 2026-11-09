import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
BANNED = re.compile(r"\bqty →|\bavg →|Avg price|\bQty\b|\bQTY\b|Quantit|Avg Buy Price|AVG BUY PRICE|Avg Cost|(?<!PORTFOLIO )(?<!Portfolio )(?<!%)(?<!% )\bvs BTC\b|(?<!PORTFOLIO )\bVS BTC\b|Perf vs|PERF VS|Cost basis|cost basis|Transfers \(|\bavg buy\b")
def scan(pg, where):
    # the Top & Bottom card's [USD | vs BTC] switch is an approved label (user's own wording)
    t = pg.evaluate("(() => { const s = [...document.querySelectorAll('.mv-seg')]; s.forEach(e => e.style.display = 'none'); const t = document.body.innerText; s.forEach(e => e.style.display = ''); return t; })()")
    hits = sorted(set(m.group(0) for m in BANNED.finditer(t)))
    check(f'{where}: no old labels', not hits, hits)
    return t
with sync_playwright() as p:
    br=p.chromium.launch()
    ctx=br.new_context(viewport={'width':1600,'height':900}); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    hd=pg.evaluate("[...document.querySelectorAll('#portfolioTable thead th')].map(t=>t.innerText.replace(/[▲▼]/g,'').replace(/\\s+/g,' ').trim())")
    check('table headers use approved labels', hd==['Asset','Holdings','Avg. Buy Price','Cost Basis','All Time Profit','Signal','Actions'], hd)
    scan(pg,'main page · table')
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
    lb=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card:nth-of-type(1) .coin-metric label')].map(l=>l.innerText.trim())")
    check('card labels use approved labels', lb==['Holdings','Avg. Buy Price','Cost Basis','Signal'], lb)
    acts=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card:nth-of-type(1) .card-act button')].map(b=>b.innerText.trim())")
    check('card buttons', acts==['+ Buy','− Sell','⋯'], acts)
    vals=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-metric val')].filter(v=>!v.querySelector('.hold') && v.getBoundingClientRect().height>parseFloat(getComputedStyle(v).fontSize)*1.8).length")
    check('card values never wrap', vals==0, vals)
    scan(pg,'main page · cards')
    for t in ('buy','sell','transfer_in','transfer_out'):
        pg.evaluate(f"openAddTx('{t}','SOL')"); pg.wait_for_timeout(200)
        lab=pg.evaluate("document.getElementById('atxQtyLabel').textContent")
        check(f'Add Transaction {t}: amount label ({lab})', lab.startswith('Amount'), lab)
        scan(pg,f'Add Transaction · {t}'); pg.evaluate("closeAddTx()")
    pg.evaluate("openAddCoin()"); pg.wait_for_timeout(300); scan(pg,'Add coin form'); pg.keyboard.press('Escape'); pg.evaluate("document.querySelectorAll('.modal-overlay.active,.modal.active').forEach(m=>m.classList.remove('active'))")
    pg.evaluate("openHistory('SOL')"); pg.wait_for_timeout(400); scan(pg,'History'); pg.keyboard.press('Escape'); pg.evaluate("document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'))")
    pg.goto(SITE+'/index.html#holdings/SOL'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    txt=scan(pg,'Coin transactions screen')
    check('coin screen shows Avg. Buy Price + Cost Basis', 'Avg. Buy Price' in txt and 'Cost Basis' in txt)
    pg.click('#htxTypeDD .sdd-btn'); opts=pg.eval_on_selector_all('.sdd-panel.show .sdd-opt','els=>els.map(e=>e.innerText.trim())'); pg.keyboard.press('Escape')
    check('type filter options', [o for o in opts if o]==['All Types','Buy','Sell','Transfer In','Transfer Out','Reward'], opts)
    pg.goto(SITE+'/index.html#holdings'); pg.wait_for_timeout(1200); scan(pg,'Holdings screen')
    for page in ('accumulation','allocation','performance','recover'):
        pg.goto(f'{SITE}/{page}.html'); pg.wait_for_timeout(1800); scan(pg, page)
    pcts=None
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
