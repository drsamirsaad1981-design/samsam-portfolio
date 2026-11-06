import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1366,'height':900})),('desktop-wide',dict(viewport={'width':1920,'height':1000})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        t=pg.evaluate("""(()=>{const bar=document.getElementById('btcTicker'); const g=[...bar.querySelectorAll('.btc-ticker-group')].filter(x=>getComputedStyle(x).display!=='none');
          const br=bar.getBoundingClientRect(); const items=[...bar.querySelectorAll('.bt-item')].filter(e=>{const r=e.getBoundingClientRect(); return r.right>br.left && r.left<br.right && getComputedStyle(e.closest('.btc-ticker-group')).display!=='none'});
          const lows=items.filter(e=>/^BTC \/ USD/.test(e.textContent.trim())).length; const cut=items.filter(e=>{const r=e.getBoundingClientRect(); return r.left<br.left-1 || r.right>br.right+1}).length;
          return {static: bar.classList.contains('static'), visibleCopies: g.length, lowsVisible: lows, cutVisible: cut, text: items.map(e=>e.textContent.trim()).join(' | ')}})()""")
        if t['static']:
            check(f'{name}: ticker fits → shown once, still, nothing cut {t}', t['visibleCopies']==1 and t['lowsVisible']==1 and t['cutVisible']==0, t)
        else:
            dup=0
            for i in range(8):
                pg.wait_for_timeout(600)
                dup=max(dup, pg.evaluate("""(()=>{const bar=document.getElementById('btcTicker'), br=bar.getBoundingClientRect(); return [...bar.querySelectorAll('.bt-item')].filter(e=>{const r=e.getBoundingClientRect(); return /^BTC \/ USD/.test(e.textContent.trim()) && r.right>br.left && r.left<br.right}).length})()"""))
            check(f'{name}: ticker scrolls and never shows the same value twice at once (max {dup})', dup<=1, (t, dup))
        s=pg.evaluate("[...document.querySelectorAll('.stat-sub')].map(e=>getComputedStyle(e)).map(c=>[c.color,c.opacity])")
        check(f'{name}: card subtext bright & fully opaque {s[0]}', all(o=='1' for _,o in s) and all(c in ('rgb(163, 177, 198)','rgb(16, 185, 129)','rgb(239, 68, 68)') for c,_ in s), s)
        b=pg.evaluate("""(()=>{const r=e=>e.getBoundingClientRect(); const btns=[...document.querySelectorAll('#appHead .ss-theme-btn')].map(r); const date=r(document.getElementById('currentDate')), live=r(document.getElementById('liveIndicator')), hdr=r(document.querySelector('#appHead'));
          const brand=r(document.querySelector('.brand')); const stackMid=(brand.top+brand.bottom)/2,   /* buttons line up with the logo + name row */ btnMid=(btns[0].top+btns[0].bottom)/2; return {n:btns.length, sameRow: Math.abs(btns[0].top-btns[1].top)<1, mid: Math.round(btnMid-stackMid), gapRight: Math.round(hdr.right-btns[1].right), gapTop: Math.round(btns[0].top-hdr.top), overlap: btns.some(b=>b.left<date.right && b.right>date.left && b.top<live.bottom && b.bottom>date.top)}})()""")
        if name.startswith('desktop'):
            check(f'{name}: cloud + theme buttons centred with the logo / name row {b}', b['n']==2 and b['sameRow'] and abs(b['mid'])<=3 and not b['overlap'] and b['gapRight']>=16, b)
        else:
            check(f'mobile: buttons in the top-right corner, clear of everything {b}', b['n']==2 and b['sameRow'] and not b['overlap'] and b['gapRight']>=14 and b['gapTop']>=14, b)
        pg.screenshot(path=str(SH/f'hdr_{name}.png'), clip={'x':0,'y':0,'width':vp['viewport']['width'],'height':360 if name!='mobile' else 700})
        pg.locator('#appHead [data-theme-toggle]').click(); pg.wait_for_timeout(200)
        check(f'{name}: theme button still works', pg.evaluate("document.documentElement.getAttribute('data-theme')")=='light')
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
