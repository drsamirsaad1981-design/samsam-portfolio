"""DCA window solid (#171533 in dark) over a blurred dark backdrop; glass AI button that hides under any open window,
including windows opened inside a tab frame. Phone + desktop, dark + light."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
shots = pathlib.Path(__file__).parent / 'shots'
FAB = "(()=>{const b=document.getElementById('cpAiFab');const cs=getComputedStyle(b);return {under:b.classList.contains('under'),op:+cs.opacity,bg:cs.backgroundColor,blur:cs.backdropFilter||cs.webkitBackdropFilter,pe:cs.pointerEvents,filter:cs.filter,border:cs.borderTopWidth}})()"
with sync_playwright() as p:
    br=p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width':1440,'height':900}))):
        for theme in ('light', 'dark'):
            ctx=br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            if pg.query_selector('#samsamImpBase'): pg.click('#samsamImpBase'); pg.wait_for_timeout(4000)
            for _ in range(40):
                if pg.frame(url=lambda u: 'accumulation.html' in u): break
                pg.wait_for_timeout(500)
            pg.evaluate("Samsam.saveAccumPlan(['SOL','ETH'].map((s,i)=>({sym:s,name:s,targetQty:100,addedAt:'2026-10-1'+i})))"); pg.wait_for_timeout(1200)
            n=f'{vn}/{theme}'
            check(f'{n}: theme applied', pg.evaluate("document.documentElement.dataset.theme")==theme, pg.evaluate("document.documentElement.dataset.theme"))
            f=pg.evaluate(FAB)
            check(f'{n}: AI button is just the floating icon (no circle behind, soft glow)', f['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') and f['border'] == '0px' and 'drop-shadow' in (f['filter'] or '') and f['blur'] in (None, '', 'none') and not f['under'] and f['op']==1, f)
            pg.click('#cpBnav a[data-k=accumulation]'); pg.wait_for_timeout(1200)
            fr=pg.frame(url=lambda u: 'accumulation.html' in u); fr.wait_for_function("typeof openDcaModal==='function' && window.Samsam && Samsam.isReady() && (Samsam.getState().accumPlan||[]).length>0", timeout=20000); fr.wait_for_timeout(800)
            fr.evaluate("openDcaModal(0)"); pg.wait_for_timeout(700)
            m=fr.evaluate("(()=>{const o=document.getElementById('dcaOverlay'),m=o.querySelector('.dca-modal');const co=getComputedStyle(o),cm=getComputedStyle(m);return {obg:co.backgroundColor,oblur:co.backdropFilter||co.webkitBackdropFilter,oz:+co.zIndex,mbg:cm.backgroundColor,mop:+cm.opacity}})()")
            check(f'{n}: DCA window fully solid', m['mbg'] == ('rgb(23, 21, 51)' if theme=='dark' else 'rgb(255, 255, 255)') and m['mop']==1, m)
            check(f'{n}: dimmed + blurred backdrop over the whole page', 'blur(8px)' in (m['oblur'] or '') and m['obg'] in ('rgba(0, 0, 0, 0.75)','rgba(15, 23, 42, 0.55)') and m['oz']>=10050, m)
            f=pg.evaluate(FAB)
            check(f'{n}: AI button steps away under the open DCA window', f['under'] and f['op']<0.05 and f['pe']=='none', f)
            # nothing from the page bleeds into the inputs: the point under the input is the input
            hit=fr.evaluate("(()=>{const i=document.getElementById('dcaMonthly');const r=i.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===i})()")
            check(f'{n}: inputs on top, nothing overlaps them', hit)
            pg.screenshot(path=str(shots/f'dca_{vn}_{theme}.png'))
            fr.evaluate("closeDcaModal()"); pg.wait_for_timeout(600)
            f=pg.evaluate(FAB); check(f'{n}: AI button comes back after closing', not f['under'] and f['op']==1, f)
            # add-coin window on the same tab is dimmed the same way and also hides the button
            if fr.evaluate("typeof openAddModal==='function'"):
                fr.evaluate("openAddModal()"); pg.wait_for_timeout(600)
                check(f'{n}: add window also hides the AI button', pg.evaluate(FAB)['under'])
                fr.evaluate("document.querySelector('.overlay.active') && document.querySelector('.overlay.active').classList.remove('active')"); pg.wait_for_timeout(500)
            # main page window (AI report) also covers it
            pg.click('#cpBnav a[data-k=home]'); pg.wait_for_timeout(600); pg.evaluate("openAnalysis()"); pg.wait_for_timeout(600)
            check(f'{n}: AI report window hides the button too', pg.evaluate(FAB)['under'])
            pg.screenshot(path=str(shots/f'fabglass_{vn}_{theme}.png')) if False else None
            check(f'{n}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
