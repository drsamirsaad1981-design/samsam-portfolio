"""Exit Strategy table: headers in sentence case (first letter capital only), no abbreviations, Asset (not Coin)."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
WANT = ['Asset', 'Plan amount', 'Average buy price', 'Take profit 1', 'Take profit 2', 'Take profit 3', 'Cash out', 'Net profit']
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('dark', 'light'):
            ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_timeout(500)
            if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
            pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)")
            pg.evaluate("""(()=>{const tps=()=>[{price:0,pct:25,lock:false},{price:0,pct:50,lock:false},{price:0,pct:25,lock:false}];
              const pf=Samsam.getState().portfolio.filter(c=>c.qty>0).slice(0,3);
              return Samsam.saveExit({tab:'exit', plan: pf.map(c=>({sym:c.sym,cgId:c.cgId||'',baseQty:c.qty,startedAt:new Date().toISOString(),moonbag:true,tps:tps()}))})})()""")
            pg.evaluate("try{localStorage.setItem('samsam_exit_view','table')}catch(e){}")
            pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady() && document.querySelector('table.xv')"); pg.wait_for_timeout(800)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.wait_for_timeout(200)
            th = pg.evaluate("[...document.querySelectorAll('table.xv thead th')].map(t=>t.innerText.trim())")
            tt = pg.evaluate("getComputedStyle(document.querySelector('table.xv th')).textTransform")
            check(f'{vn}/{theme}: headers {th}', th == WANT, th)
            check(f'{vn}/{theme}: shown as written (no all caps)', tt == 'none', tt)
            ok = all(h[0].isupper() and h[1:] == h[1:].lower().replace('', '') or h[1:].lower() == h[1:] for h in th)
            check(f'{vn}/{theme}: only the first letter is a capital', all(h[1:] == h[1:].lower() for h in th), th)
            check(f'{vn}/{theme}: no abbreviations (Avg, TP, Qty…)', not any(re.search(r'\b(Avg|TP\d?|Qty|Amt|Coin)\b', h) for h in th), th)
            foot = pg.inner_text('table.xv tfoot td')
            check(f'{vn}/{theme}: total row says assets ({foot})', 'asset' in foot and 'coin' not in foot.lower(), foot)
            g = pg.locator('.xv-wrap'); g.scroll_into_view_if_needed(); bb = g.bounding_box()
            pg.screenshot(path=str(SH / f'xvhead_{vn}_{theme}.png'), clip={'x': bb['x'], 'y': bb['y'], 'width': min(bb['width'], vp['viewport']['width'] - bb['x']), 'height': min(bb['height'], 330)})
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3])
            pg.evaluate("Samsam.saveExit({tab:'accumulation', plan: []})"); pg.wait_for_timeout(400); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
