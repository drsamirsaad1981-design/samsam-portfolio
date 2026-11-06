"""Every icon is a line SVG (no emoji) on every page; coin Transactions header + Liq.Map / Prediction / CMC use SVG;
a tab opened from the bar starts at the top; re-tapping the open tab scrolls up."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
EMO = r"(document.body.innerText.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}]/gu)||[]).join('')"
UNFILLED = "document.querySelectorAll('[data-ic]:not([data-ic-done])').length + [...document.querySelectorAll('[data-ic]')].filter(e=>!e.querySelector('svg')).length"
shots = pathlib.Path(__file__).parent / 'shots'; shots.mkdir(exist_ok=True)
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); S.setup(ctx)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    if pg.query_selector('#samsamImpBase'): pg.click('#samsamImpBase'); pg.wait_for_timeout(5000)
    pg.wait_for_timeout(5000)
    fr=lambda k: pg.frame(url=lambda u: k+'.html' in u)
    for _ in range(40):
        if all(fr(k) for k in ('performance','accumulation','market')): break
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(2500)
    print('frames:', [bool(fr(k)) for k in ('performance','accumulation','market')], errs[:3])
    docs={'main':pg, **{k:fr(k) for k in ('performance','accumulation','market')}}
    for n,d in docs.items():
        check(f'{n}: no emoji in visible text', d.evaluate(EMO)=='', d.evaluate(EMO))
        check(f'{n}: no stray template text', '${' not in d.evaluate("document.body.innerText"), '')
        check(f'{n}: every data-ic filled with SVG', d.evaluate(UNFILLED)==0, d.evaluate(UNFILLED))
    # cards view too (status dots, buttons)
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(500)
    check('main cards view: no emoji', pg.evaluate(EMO)=='', pg.evaluate(EMO))
    check('main: status dots are CSS dots', pg.evaluate("document.querySelectorAll('.ss-dot').length")>0)
    pg.screenshot(path=str(shots/'main_cards_dark.png'), full_page=False)
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    # ⋯ menu
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(400)
    pg.evaluate("openCoinMenu(document.querySelector('.btn-more') || document.body, 'BTC')"); pg.wait_for_timeout(500)
    if pg.query_selector('.cpm'):
        check('coin menu: icons are SVG', pg.evaluate("[...document.querySelectorAll('.cpm-item .cpm-ic')].every(e=>e.querySelector('svg'))"))
        pg.screenshot(path=str(shots/'menu_dark.png')); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    else: check('coin menu opened', False)
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    # coin Transactions
    pg.evaluate("openHoldingsView(); openCoinTx('BTC')"); pg.wait_for_timeout(1200)
    check('Transactions title icon is SVG (receipt)', pg.evaluate("!!document.querySelector('#hovNavIcon svg') && !document.getElementById('hovNavIcon').textContent.trim()"))
    links = pg.evaluate("['htxLiqLink','htxPredLink','htxCmcLink'].map(i=>{const a=document.getElementById(i);return [a.innerText.trim(), a.querySelectorAll('svg').length]})")
    check('quick links: Liq.Map / Prediction / CMC with SVG icons', [l[0] for l in links]==['Liq.Map','Prediction','CMC'] and all(l[1]==2 for l in links), links)
    check('Transactions: no emoji', pg.evaluate(EMO)=='', pg.evaluate(EMO))
    pg.screenshot(path=str(shots/'tx_dark.png'))
    pg.evaluate("closeHoldingsView()"); pg.wait_for_timeout(600)
    # scroll: leave a page scrolled, come back → top
    pg.evaluate("window.scrollTo(0, 900)"); pg.wait_for_timeout(200)
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(700)
    fr('performance').evaluate("window.scrollTo(0, 700)"); pg.wait_for_timeout(200)
    check('performance scrolled for the test', fr('performance').evaluate("scrollY")>300)
    pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(700)
    check('Overview opens at the top', pg.evaluate("scrollY")==0, pg.evaluate("scrollY"))
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(700)
    check('Performance from the bar opens at the top', fr('performance').evaluate("scrollY")==0, fr('performance').evaluate("scrollY"))
    fr('performance').evaluate("window.scrollTo(0, 600)"); pg.wait_for_timeout(200)
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(1500)
    check('re-tapping the open tab scrolls up', fr('performance').evaluate("scrollY")==0, fr('performance').evaluate("scrollY"))
    pg.screenshot(path=str(shots/'perf_dark.png'))
    pg.click('#cpBnav a[data-k=accumulation]'); pg.wait_for_timeout(900); pg.screenshot(path=str(shots/'plan_dark.png'))
    a=fr('accumulation'); a.evaluate("setView('cards')"); pg.wait_for_timeout(500)
    check('Plan cards: no emoji', a.evaluate(EMO)=='', a.evaluate(EMO))
    pg.screenshot(path=str(shots/'plan_cards_dark.png'))
    # light theme
    pg.evaluate("document.querySelector('[data-theme-toggle]').click()"); pg.wait_for_timeout(800)
    pg.screenshot(path=str(shots/'plan_cards_light.png'))
    pg.click('#cpBnav a[data-k=home]'); pg.wait_for_timeout(700); pg.screenshot(path=str(shots/'main_light.png'))
    pg.evaluate("openHoldingsView(); openCoinTx('BTC')"); pg.wait_for_timeout(1000); pg.screenshot(path=str(shots/'tx_light.png'))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
