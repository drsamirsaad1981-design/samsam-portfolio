import sys, json
from playwright.sync_api import sync_playwright
sys.path.insert(0,'.'); import e2e_setup as S
ok=True
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('tablet',dict(viewport={'width':820,'height':1000})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)),('small',dict(viewport={'width':360,'height':780},is_mobile=True,has_touch=True))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page()
        pg.goto('http://127.0.0.1:8000/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(400)
        pg.goto('http://127.0.0.1:8000/index.html#holdings/SOL'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
        m=pg.evaluate("""(()=>{const r=e=>e.getBoundingClientRect(); const t=r(document.querySelector('#htxTypeDD .sdd-btn')), a=r(document.getElementById('htxAddBtn')); const cards=[...document.querySelectorAll('.htx-card')].map(r);
          const list=r(document.getElementById('htxList').closest('.hov-card')||document.getElementById('htxList'));
          return {typeL:Math.round(t.left), cardL:Math.round(Math.min(...cards.map(c=>c.left))), listL:Math.round(list.left), addR:Math.round(a.right), cardR:Math.round(Math.max(...cards.map(c=>c.right))), listR:Math.round(list.right)}})()""")
        good=abs(m['typeL']-m['cardL'])<=1 and abs(m['cardL']-m['listL'])<=1 and abs(m['addR']-m['cardR'])<=1 and abs(m['cardR']-m['listR'])<=1
        ok&=good; print(name, 'OK' if good else 'MISALIGNED', m)
        if len(sys.argv)>1 and name in('desktop','mobile'): pg.mouse.move(1,1); pg.screenshot(path=f'shots/tx_align_{name}.png', clip={'x':0,'y':0,'width':vp['viewport']['width'],'height':520})
        ctx.close()
    br.close()
print('PASS' if ok else 'FAIL')
