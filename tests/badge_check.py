import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
OVER="""() => { const p=document.getElementById('samsamSyncPill').getBoundingClientRect();
  const els=[...document.querySelectorAll('#coinsStack .coin-card val, #coinsStack .coin-card .coin-card-header > div:last-child > div, #tableBody td, .coin-card .card-act button')].filter(e=>e.offsetParent);
  const hits=els.filter(e=>{const r=e.getBoundingClientRect(); if(r.bottom<0||r.top>innerHeight) return false; const range=document.createRange(); range.selectNodeContents(e); const t=range.getBoundingClientRect(); return t.width>0 && t.right>p.left && t.left<p.right && t.bottom>p.top && t.top<p.bottom;});
  return hits.map(e=>e.innerText.trim().slice(0,20)); }"""
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(500)
        pos=pg.evaluate("(()=>{const pl=document.getElementById('samsamSyncPill'); pl.style.setProperty('display','flex','important'); const r=pl.getBoundingClientRect(); setTimeout(()=>pl.style.removeProperty('display'),0); return [Math.round(innerWidth-r.right), Math.round(innerHeight-r.bottom), getComputedStyle(document.getElementById('samsamSyncPill')).position]})()")
        check(f'{name}: badge fixed 16px from the bottom-right corner {pos}', pos[0]>=16 and pos[1]>=16 and pos[0]<=20 and pos[1]<=20 and pos[2]=='fixed', pos)
        pg.wait_for_timeout(3200)
        w=pg.evaluate("(()=>{const p=document.getElementById('samsamSyncPill'); const h=[...document.querySelectorAll('.ss-sync-hdr')].filter(b=>b.offsetParent)[0]; const t=document.querySelector('.hdr-btns [data-theme-toggle]'); const hr=h.getBoundingClientRect(), tr=t.getBoundingClientRect(); return [p.classList.contains('mini'), getComputedStyle(p).display, h.getAttribute('aria-label'), h.querySelector('.ss-live').dataset.state, Math.round(tr.left-hr.right), Math.round(hr.top-tr.top)]})()")
        check(f'{name}: once synced the floating badge steps aside', w[0] and w[1]=='none', w)
        check(f'{name}: status shown in the header next to the theme button {w[2:]}', 'Synced' in w[2] and w[3]=='ok' and 0<=w[4]<=12 and abs(w[5])<=2, w)
        for view in ('cards','table'):
            pg.evaluate(f"applyView('{view}')"); pg.wait_for_timeout(200)
            H=pg.evaluate("document.documentElement.scrollHeight"); hits=set()
            for y in range(0, H, 250):
                pg.evaluate(f"scrollTo(0,{y})"); pg.wait_for_timeout(40); hits|=set(pg.evaluate(OVER))
            check(f'{name} {view}: badge never covers coin numbers while scrolling ({len(hits)} hits)', not hits, sorted(hits)[:6])
        pg.evaluate("applyView('cards')")
        pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(100)
        [b for b in pg.query_selector_all('.ss-sync-hdr') if b.is_visible()][0].click(); pg.wait_for_timeout(200)
        mm=pg.evaluate("(()=>{const m=document.getElementById('samsamSyncMenu'), r=m.getBoundingClientRect(); return [getComputedStyle(m).display, m.innerText.includes('Settings'), Math.round(r.top), r.right<=innerWidth]})()")
        check(f'{name}: header cloud button opens the sync menu under it (with Settings) {mm}', mm[0]=='block' and mm[1] and mm[2]<200 and mm[3], mm)
        pg.mouse.click(5,5); pg.wait_for_timeout(100)
        for page in ('accumulation','allocation','performance'):
            pg.goto(f'{SITE}/{page}.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(3300)
            m=pg.evaluate("(()=>{const p=document.getElementById('samsamSyncPill'); const h=document.querySelector('.ss-sync-hdr'); return [getComputedStyle(p).display, !!h]})()")
            check(f'{page} ({name}): synced → no floating badge; cloud button in the page header {m}', m==['none', True], m)
        # While saving / offline the floating badge comes back
        pg.goto(SITE+'/index.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(3300)
        ctx.set_offline(True); pg.evaluate("window.dispatchEvent(new Event('offline'))"); pg.wait_for_timeout(400)
        off=pg.evaluate("[getComputedStyle(document.getElementById('samsamSyncPill')).display, document.getElementById('samsamSyncText').textContent]")
        check(f'{name}: offline → floating badge shows again {off}', off[0]!='none' and 'Offline' in off[1], off)
        ctx.set_offline(False); pg.evaluate("window.dispatchEvent(new Event('online'))"); pg.wait_for_timeout(3300)
        if name=='mobile':
            pg.goto(SITE+'/index.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(3300); pg.evaluate("applyView('cards'); scrollTo(0, 1600)"); pg.wait_for_timeout(300); pg.screenshot(path=str(SH/'badge_mobile.png'))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
