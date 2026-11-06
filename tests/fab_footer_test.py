"""Desktop: one 1200px content width on every page; one shared footer (sync · baseline / ©) on every page, no Golden
Triangle; a floating AI button on every page — draggable, remembered, opens the AI report over any tab."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
shots = pathlib.Path(__file__).parent / 'shots'
W = """(sel)=>{const e=document.querySelector(sel);const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return Math.round(r.width-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight))}"""
FOOT = "(()=>{const f=document.getElementById('cpFoot');return f?[f.innerText.includes('Baseline'), f.innerText.includes('©'), document.querySelectorAll('.cp-foot').length]:null})()"
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':1440,'height':900}); S.setup(ctx)
    ctx.route('https://samsam-analysis.**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"analysis":"1. Summary\\nAll good."}'))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    if pg.query_selector('#samsamImpBase'): pg.click('#samsamImpBase'); pg.wait_for_timeout(4000)
    for _ in range(40):
        if all(pg.frame(url=lambda u,k=k: k+'.html' in u) for k in ('performance','accumulation','market')): break
        pg.wait_for_timeout(500)
    pg.wait_for_timeout(2500)
    fr=lambda k: pg.frame(url=lambda u: k+'.html' in u)
    w={'home': pg.evaluate(W, 'body')}
    pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(600); w['holdings']=pg.evaluate(W, '.hov-container')
    pg.evaluate("openCoinTx('BTC')"); pg.wait_for_timeout(600); w['coin page']=pg.evaluate(W, '.hov-container')
    pg.evaluate("closeHoldingsView()"); pg.wait_for_timeout(500)
    w['performance']=fr('performance').evaluate("Math.round(document.querySelector('.summary-cards').getBoundingClientRect().width)")
    w['plan']=fr('accumulation').evaluate("Math.round(document.querySelector('.dashboard').getBoundingClientRect().width)")
    check('desktop: every page is 1200px wide', all(abs(v-1200)<=2 for v in w.values()), w)
    for n,d in [('home',pg)]+[(k,fr(k)) for k in ('performance','accumulation','market')]:
        f=d.evaluate(FOOT); check(f'{n}: one shared footer (sync · baseline / ©)', f==[True,True,1], f)
        check(f'{n}: no Golden Triangle line', 'Golden Triangle' not in d.evaluate("document.body.innerText"))
    check('footer shows the sync time', re.search(r'Synced|not synced', pg.inner_text('#cpFoot')), pg.inner_text('#cpFoot'))
    check('toolbar AI buttons removed', pg.evaluate("[...document.querySelectorAll('button')].filter(b=>/openAnalysis/.test(b.getAttribute('onclick')||'')).length")==0)
    check('one AI button (top page only, none inside the tabs)', pg.evaluate("document.querySelectorAll('#cpAiFab').length")==1 and all(fr(k).evaluate("!document.getElementById('cpAiFab')") for k in ('performance','accumulation','market')))
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(700)
    bb=pg.locator('#cpAiFab').bounding_box()
    check('AI button visible on the Performance tab, right side, above the bar', bb and bb['x']>1300 and pg.evaluate("(()=>{const r=document.getElementById('cpAiFab').getBoundingClientRect();const e=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!e.closest('#cpAiFab')})()"), bb)
    check('computer: sits right beside the content (24px past its right edge), away from the scrollbar', abs(bb['x'] - (pg.evaluate("innerWidth") / 2 + 600 + 24)) <= 2 and pg.evaluate("innerWidth") - (bb['x'] + bb['width']) >= 40, bb)
    pg.screenshot(path=str(shots/'fab_alloc_desktop.png'))
    pg.set_viewport_size({'width': 1787, 'height': 900}); pg.wait_for_timeout(400)
    bw = pg.locator('#cpAiFab').bounding_box()
    check('wide screen (1787px): still right beside the content, not out by the edge', bw and abs(bw['x'] - (1787 / 2 + 600 + 24)) <= 2, bw)
    pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(400)
    # drag to the left
    pg.mouse.move(bb['x']+26, bb['y']+26); pg.mouse.down(); pg.mouse.move(600, 300, steps=8); pg.mouse.move(200, 320, steps=8); pg.mouse.up(); pg.wait_for_timeout(500)
    b2=pg.locator('#cpAiFab').bounding_box()
    check('drag → settles on the left side, beside the content', abs(b2['x'] - max(40, pg.evaluate("innerWidth") / 2 - 600 - 24 - 48)) <= 2, b2)
    check('…and the report did NOT open on drag', not pg.evaluate("document.getElementById('analysisModal').classList.contains('active')"))
    check('position remembered', pg.evaluate("JSON.parse(localStorage.getItem('samsam_aifab_pos')).side")=='l')
    pg.click('#cpAiFab'); pg.wait_for_timeout(1500)
    check('tap → AI report opens over the tab', pg.evaluate("(()=>{const m=document.getElementById('analysisModal');if(!m.classList.contains('active'))return false;const e=document.elementFromPoint(innerWidth/2,innerHeight/2);return !!e.closest('#analysisModal')})()"))
    pg.screenshot(path=str(shots/'fab_report_desktop.png'))
    pg.evaluate("closeAnalysis()"); pg.wait_for_timeout(300)
    # phone
    m=br.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); S.setup(m)
    m.route('https://samsam-analysis.**', lambda r: r.fulfill(status=200, content_type='application/json', body='{"analysis":"1. Summary\\nAll good."}'))
    q=m.new_page(); q.on('pageerror', lambda e: errs.append(str(e)))
    q.goto(S.SITE+'/performance.html'); q.click('#samsamSignInBtn') if q.query_selector('#samsamSignInBtn') else None; S.wait_ready(q); q.wait_for_timeout(2000)
    fb=q.locator('#cpAiFab').bounding_box(); bar=q.locator('#cpBnav').bounding_box()
    check('phone (page on its own): AI button above the bottom bar', fb and fb['y']+fb['height']<=bar['y'], (fb, bar))
    q.evaluate("window.scrollTo(0, document.body.scrollHeight)"); q.wait_for_timeout(400)
    fbox=q.locator('#cpFoot').bounding_box()
    check('phone: footer ends above the bottom bar when scrolled to the end', fbox and fbox['y']+fbox['height']<=bar['y']+1, (fbox, bar))
    q.screenshot(path=str(shots/'fab_perf_phone.png'))
    q.locator('#cpAiFab').tap(); q.wait_for_url(re.compile(r'index\.html'), timeout=10000); q.wait_for_timeout(5000)
    check('phone: AI button on a page opened alone → main page opens the report', q.evaluate("document.getElementById('analysisModal').classList.contains('active')") and '#ai' not in q.url, q.url)
    q.screenshot(path=str(shots/'fab_report_phone.png'))
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
