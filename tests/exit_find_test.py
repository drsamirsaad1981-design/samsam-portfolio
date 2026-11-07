"""Exit Strategy: tap a row → THAT coin's card on its own (+ back to all coins); search box; sort by tapping a column
(again = reverse, remembered) or with the Sort list (works in Cards too)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
ROWS = "[...document.querySelectorAll('table.xv tbody tr')].map(r=>r.dataset.sym)"
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');localStorage.setItem('samsam_exit_view','table');if(!sessionStorage.getItem('x')){{localStorage.removeItem('samsam_exit_sort');sessionStorage.setItem('x','1')}}}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
            pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)")
            syms = pg.evaluate("""(()=>{const tps=()=>[{price:0,pct:25,lock:false},{price:0,pct:50,lock:false},{price:0,pct:25,lock:false}];
              const pf=Samsam.getState().portfolio.filter(c=>c.qty>0&&c.currentPrice>0&&!/^USD/.test(c.sym)).slice(0,5);
              Samsam.saveExit({tab:'exit', plan: pf.map(c=>({sym:c.sym,cgId:c.cgId||'',baseQty:c.qty,startedAt:new Date().toISOString(),moonbag:true,tps:tps()}))});
              return pf.map(c=>c.sym)})()""")
            pg.reload(); pg.wait_for_selector('table.xv tbody tr'); pg.wait_for_timeout(600)
            tag = f'{vn}/{theme}'
            check(f'{tag}: plan order to start {pg.evaluate(ROWS)}', pg.evaluate(ROWS) == syms, (syms, pg.evaluate(ROWS)))
            # tap the 3rd row → that coin, not the first
            third = syms[2]
            pg.locator('table.xv tbody tr').nth(2).click(); pg.wait_for_timeout(400)
            cards = pg.evaluate("[...document.querySelectorAll('.xk-card')].map(c=>c.dataset.sym)")
            check(f'{tag}: tap {third} → only {third}\'s card {cards}', cards == [third], cards)
            pg.wait_for_timeout(600); top = pg.evaluate("document.querySelector('.xs-focus').getBoundingClientRect().top")
            check(f'{tag}: the page scrolls to that card ({round(top)}px from the top)', 0 <= top < 200, top)
            if theme == 'light': pg.screenshot(path=str(SH / f'exit_focus_{vn}.png'))
            pg.click('[data-act=unfocus]'); pg.wait_for_timeout(300)
            check(f'{tag}: ‹ All coins → back to the table', pg.evaluate(ROWS) == syms and pg.evaluate("localStorage.getItem('samsam_exit_view')") == 'table')
            # sort by a column
            pg.click('table.xv th .xv-th[data-k="profit"]'); pg.wait_for_timeout(300)
            prof = pg.evaluate("[...document.querySelectorAll('table.xv tbody tr')].map(r=>r.dataset.sym)")
            want = pg.evaluate("""(()=>{const st=Samsam.getState(), ex=st.exit; return ex.plan.map(e=>[e.sym, SamsamExit.calc.coin(e, st.portfolio.find(c=>c.sym===e.sym), st.transactions, ex.steps).profit]).sort((a,b)=>b[1]-a[1]).map(x=>x[0])})()""")
            check(f'{tag}: Net profit header → biggest first {prof}', prof == want and pg.get_attribute('table.xv th[aria-sort="descending"] .xv-th', 'data-k') == 'profit', (prof, want))
            pg.click('table.xv th .xv-th[data-k="profit"]'); pg.wait_for_timeout(300)
            check(f'{tag}: tap again → reversed', pg.evaluate(ROWS) == list(reversed(want)) and pg.query_selector('table.xv th[aria-sort="ascending"]') is not None)
            pg.click('table.xv th .xv-th[data-k="asset"]'); pg.wait_for_timeout(300)
            check(f'{tag}: Asset → A–Z', pg.evaluate(ROWS) == sorted(syms), pg.evaluate(ROWS))
            hdr = pg.evaluate("[...document.querySelectorAll('table.xv thead th')].map(t=>t.innerText.trim())")
            check(f'{tag}: header names unchanged', hdr == ['Asset', 'Plan amount', 'Average buy price', 'Take profit 1', 'Take profit 2', 'Take profit 3', 'Cash out', 'Net profit'], hdr)
            pg.reload(); pg.wait_for_selector('table.xv tbody tr'); pg.wait_for_timeout(500)
            check(f'{tag}: the order is remembered', pg.evaluate(ROWS) == sorted(syms) and pg.input_value('#xsSort') == 'asset')
            # search
            q = syms[1][:2]
            pg.click('#xsQ'); pg.keyboard.type(q, delay=60); pg.wait_for_timeout(500)
            got = pg.evaluate(ROWS)
            check(f'{tag}: search "{q}" → {got}', got and all(q in s for s in got) and syms[1] in got, got)
            check(f'{tag}: the search box keeps focus while typing', pg.evaluate("document.activeElement && document.activeElement.id") == 'xsQ')
            pg.fill('#xsQ', 'ZZZQ'); pg.wait_for_timeout(500)
            check(f'{tag}: no match → a short message', 'No coin in your exit plan matches' in pg.inner_text('#exitPane'))
            pg.fill('#xsQ', ''); pg.wait_for_timeout(500)
            # Sort list in Cards view
            pg.click('[data-act=view][data-v=cards]'); pg.wait_for_timeout(300)
            pg.select_option('#xsSort', 'value'); pg.wait_for_timeout(300)
            cv = pg.evaluate("[...document.querySelectorAll('.xk-card')].map(c=>c.dataset.sym)")
            wv = pg.evaluate("""(()=>{const st=Samsam.getState(), ex=st.exit; return ex.plan.map(e=>{const r=SamsamExit.calc.coin(e, st.portfolio.find(c=>c.sym===e.sym), st.transactions, ex.steps); return [e.sym, r.base*r.price]}).sort((a,b)=>b[1]-a[1]).map(x=>x[0])})()""")
            check(f'{tag}: Cards → Sort: Value, biggest first {cv}', cv == wv, (cv, wv))
            if theme == 'light': pg.screenshot(path=str(SH / f'exit_find_{vn}.png'))
            sw = pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            check(f'{tag}: no sideways scroll', sw)
            pg.evaluate("localStorage.setItem('samsam_exit_view','table'); localStorage.removeItem('samsam_exit_sort')")
            check(f'{tag}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
