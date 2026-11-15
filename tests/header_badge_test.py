"""One header on every page (the main page has no card around its top line, like the other pages), and for a member who
supports: ⭐ / 💛 on the logo on every page (tap → Support) and a small 💛 pill at the bottom of the page.
The main page's status line stays short ("Saved prices ⓘ", not a cut-off sentence)."""
import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
urllib.request.urlopen('http://127.0.0.1:8787/reset').read()
with sync_playwright() as p:
    br = p.chromium.launch()
    # owner: same header geometry on Overview and Performance
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
    a = pg.evaluate("(()=>{const h=document.querySelector('.header-top'),n=document.querySelector('.brand-name'),l=document.querySelector('.app-logo'),c=getComputedStyle(document.querySelector('header.app-head'));return {top:h.getBoundingClientRect().top+scrollY,left:h.getBoundingClientRect().left,w:h.getBoundingClientRect().width,fs:getComputedStyle(n).fontSize,logo:l.getBoundingClientRect().width,border:c.borderTopWidth,bg:c.backgroundColor}})()")
    check('Overview: no card around the header, a full-width top bar', a['border'] == '0px' and a['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') and abs(a['left']) < 1 and abs(a['w'] - 390) < 2, a)
    pg.evaluate("cpShell.go('performance')"); pg.wait_for_timeout(2500)
    fr = [f for f in pg.frames if 'performance.html' in f.url][0]
    b = fr.evaluate("(()=>{const n=document.querySelector('.cp-brand-n'),l=document.querySelector('.cp-brand-logo img');return {fs:getComputedStyle(n).fontSize,logo:l.getBoundingClientRect().width}})()")
    check('Performance: the same name size and logo size as Overview', b['fs'] == a['fs'] and abs(b['logo'] - a['logo']) < 1, (a, b))
    geo = "(q => { const top = document.querySelector(q[3]).getBoundingClientRect().top, r = e => { const x = document.querySelector(e).getBoundingClientRect(); return [Math.round(x.left), Math.round(x.top - top), Math.round(x.width), Math.round(x.height)]; }; return [r(q[0]), r(q[1]), r(q[2]), getComputedStyle(document.querySelector(q[1])).fontFamily.split(',')[0]]; })"
    gp = fr.evaluate(geo + "(['.cp-brand-logo img', '.cp-brand-n', '.cp-head .ss-set-hdr', '.cp-head'])")
    pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(600); pg.evaluate("scrollTo(0,0)")
    go = pg.evaluate(geo + "(['.app-logo', '.brand-name', '.header-top .ss-set-hdr', '.header-top'])")
    check('Overview and Performance: logo, name and ⚙️ at the very same place, same letters (no jump between tabs)', go == gp, (go, gp))
    pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
    pg.evaluate("setLiveStatus('error')"); pg.wait_for_timeout(100)
    t = pg.inner_text('#liveIndicator')
    check('a failed price load says "Saved prices ⓘ" (short), ⓘ explains', 'Saved prices' in t and 'Fetch failed' not in t and pg.query_selector('#liveIndicator .lv-why') is not None, t)
    check('owner: no ⭐/💛 badge, no support pill', pg.query_selector('.cp-badge') is None and not pg.is_visible('#cpfSup'))
    check('no JS errors (owner)', not errs, errs[:3]); ctx.close()
    # a member who supports
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    ctx.add_init_script("window.__FAKE_EMAIL = 'friend@icloud.com'; try{localStorage.setItem('cp-support-st', JSON.stringify({premium:true,supporter:true,t:Date.now()}))}catch(e){}")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_selector('#samsamStartEmpty', state='visible', timeout=15000); pg.click('#samsamStartEmpty')
    pg.wait_for_function("Samsam.isReady()", timeout=15000); pg.wait_for_timeout(1500)
    check('member: ⭐💛 on the logo on Overview', pg.inner_text('.brand > .cp-badge') == '⭐💛' if pg.query_selector('.brand > .cp-badge') else False)
    pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1200)
    check('member: ⭐💛 on the logo on Allocation too', pg.evaluate("document.querySelector('#holdingsOverlay .cp-brand-logo .cp-badge')?.textContent") == '⭐💛')
    pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
    pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(2500)
    fr = [f for f in pg.frames if 'market.html' in f.url][0]
    check('member: ⭐💛 on the logo on Market Hub too', fr.evaluate("document.querySelector('.cp-brand-logo .cp-badge')?.textContent") == '⭐💛')
    pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
    sp = pg.inner_text('#cpfSup')
    check('member: a small 💛 thank-you pill, above the sync line', 'Thank you' in sp and pg.evaluate("document.getElementById('cpfSup').getBoundingClientRect().top < document.querySelector('.cpf-sync').getBoundingClientRect().top"), sp)
    check('no JS errors (member)', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
