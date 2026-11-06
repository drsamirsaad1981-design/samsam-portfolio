import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
# a money amount without exactly 2 decimals: $ followed by digits/commas not followed by .dd
BAD = r"""() => { const t = document.body.innerText; const out = []; const re = /\\$\\s?(\\d[\\d,]*)(\\.\\d+)?(?![\\d.]*[KMB])/g; let m;
  while ((m = re.exec(t))) { const intp = m[1].replace(/,/g,''); const dec = m[2] || '';
    const big = +intp >= 1;  // >= $1: must be 2 decimals with commas
    const commasOk = !/\\d{4}/.test(m[1]);
    const unitPrice = +intp < 10 && dec.length === 5;  // $0.01–$10 unit prices use 4 decimals
    if (big && !unitPrice && (dec.length !== 3 || !commasOk)) out.push(t.substr(Math.max(0,m.index-25), 50).replace(/\\s+/g,' ')); }
  return out; }"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)),('desktop',dict(viewport={'width':1366,'height':900}))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().holdingsSnaps.length > 100", timeout=10000); pg.wait_for_timeout(1500)
        a,b=pg.evaluate("[document.getElementById('totalUsd').textContent, document.getElementById('holdingsTotal').textContent]")
        check(f'{name}: TOTAL PORTFOLIO == HOLDINGS ({a})', a==b and re.fullmatch(r'\$[\d,]+\.\d\d',a), (a,b))
        for r in ('7d','all'):
            pg.click(f'.holdings-tab[data-range="{r}"]'); pg.wait_for_timeout(200)
            check(f'{name}: {r} tab does not open Holdings screen', not pg.evaluate("document.getElementById('holdingsOverlay').classList.contains('open') || location.hash.startsWith('#holdings')"))
            check(f'{name}: Holdings {r} still equals total', pg.evaluate("document.getElementById('holdingsTotal').textContent")==a)
        pg.evaluate("Samsam.updatePrices && 0")
        bad=pg.evaluate(BAD); check(f'{name}: index — every $ amount has 2 decimals', not bad, bad[:5])
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(600)
        h=pg.evaluate("document.getElementById('hovTotal').textContent"); check(f'{name}: Holdings screen total == {a}', h==a, h)
        bad=pg.evaluate(BAD); check(f'{name}: holdings screen — 2 decimals', not bad, bad[:5]); pg.evaluate("closeHoldingsView()")
        for page in ('performance','accumulation'):
            pg.goto(f'{SITE}/{page}.html'); pg.wait_for_function("Samsam.isReady()", timeout=10000); pg.wait_for_timeout(1500)
            bad=pg.evaluate(BAD); check(f'{name}: {page} — every $ amount has 2 decimals', not bad, bad[:5])
        pg.goto(f'{SITE}/allocation.html'); pg.wait_for_timeout(2500)
        av=pg.evaluate("document.getElementById('hovDonutVal').textContent"); check(f'{name}: allocation (Holdings) total == {a}', av==a, av)
        bad=pg.evaluate(BAD); check(f'{name}: allocation (Holdings) — every $ amount has 2 decimals', not bad, bad[:5])
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
