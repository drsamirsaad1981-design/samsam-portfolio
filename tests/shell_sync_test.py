"""One price feed: inside the app only the main page asks CoinGecko for prices; the other tabs take them at once
(same Total Value everywhere); Plan's ✓ Ready is hidden while idle; card titles use the bar's line icons."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); S.setup(ctx)
    price={'v':2.0}; calls=[]
    def route(r):
        ids=re.search(r'ids=([^&]+)', r.request.url); fr=r.request.frame.url if r.request.frame else ''
        calls.append(fr.split('/')[-1].split('?')[0])
        data={i:{'usd': (100000.0 if i=='bitcoin' else price['v']), 'usd_24h_change':1.5} for i in __import__('urllib.parse').parse.unquote(ids.group(1)).split(',')} if ids else {}
        r.fulfill(status=200, content_type='application/json', body=json.dumps(data))
    ctx.route('https://api.coingecko.com/api/v3/simple/price**', route)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(6500)
    fr=lambda k: pg.frame(url=lambda u: k+'.html' in u)
    check('all views loaded', all(fr(k) for k in ('performance','accumulation','market')))
    calls.clear(); price['v']=3.0
    pg.evaluate("fetchLivePrices()"); pg.wait_for_timeout(1500)
    tot=lambda w: w.evaluate("Samsam.getState().portfolio.reduce((a,c)=>a+c.qty*c.currentPrice,0)")
    vals={'main':tot(pg), **{k:tot(fr(k)) for k in ('performance','accumulation','market')}}
    check('new prices reach every tab at once (same total)', len({round(v,6) for v in vals.values()})==1, vals)
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(800)
    tv=fr('performance').inner_text('#totalValue')
    main_tv=pg.inner_text('#totalUsd')
    check(f'Performance header total = main total ({tv} / {main_tv})', tv.replace(',','')[:6]==main_tv.replace(',','')[:6], (tv, main_tv))
    check('Performance shows Live · Updated', 'Live · Updated' in fr('performance').inner_text('#syncBar'))
    pg.wait_for_timeout(3000)
    check('only the main page asked CoinGecko', calls and set(calls)=={'index.html'}, calls)
    a=fr('accumulation')
    check("Plan: ✓ Ready hidden while idle", a.evaluate("getComputedStyle(document.getElementById('saveStatus')).visibility")=='hidden')
    ics=pg.evaluate("[...document.querySelectorAll('.card-ic svg')].length")
    check('main cards: 4 line icons (market card moved into the ticker), no emoji', ics==4 and not re.search('[💰📈📊]', pg.evaluate("[...document.querySelectorAll('.holdings-title,.alloc-mini-title')].map(e=>e.textContent).join('|')")), ics)
    check('plan card title is "Accumulation Plan"', 'Accumulation Plan' == pg.evaluate("document.querySelector('[data-nav-ic=accumulation].card-ic').parentElement.textContent.trim()"))
    check('no "BTC by … pts" anywhere', all('BTC by' not in f.inner_text('body') for f in [pg.main_frame, fr('performance')]))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
