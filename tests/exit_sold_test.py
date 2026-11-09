"""Exit Strategy with a coin sold out (like RSR): its Cash out = the money really received, Net profit = the real profit,
3 of 3 done, Average buy price = the one it was sold at (not —); every sort puts it where it belongs (Cash out / Net profit
by its real numbers, Value = 0 left so last, Closest to TP = done so last, Asset A–Z by name)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
ROWS = "[...document.querySelectorAll('table.xv tbody tr')].map(r=>r.dataset.sym)"
NUM = "(s=>{const r=document.querySelector('table.xv tbody tr[data-sym=\"'+s+'\"]'); const t=[...r.querySelectorAll('td')]; return [t[t.length-2].innerText.trim(), t[t.length-1].innerText.trim(), t[0].innerText.trim(), t[2].innerText.trim()]})"
def money(t): import re; m = re.search(r'([+−-]?)\$([\d,]+\.\d\d)', t); return (-1 if m.group(1) and m.group(1) in '−-' else 1) * float(m.group(2).replace(',', '')) if m else None
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); ctx.add_init_script("try{localStorage.setItem('samsam_exit_view','table');localStorage.removeItem('samsam_exit_sort')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
        pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)")
        info = pg.evaluate("""(async()=>{const tps=()=>[{price:0,pct:25,lock:false},{price:0,pct:50,lock:false},{price:0,pct:25,lock:false}];
          const pf=Samsam.getState().portfolio.filter(c=>c.qty>0&&c.currentPrice>0&&!/^USD/.test(c.sym)).slice(0,5);
          await Samsam.saveExit({tab:'exit', plan: pf.map(c=>({sym:c.sym,cgId:c.cgId||'',baseQty:c.qty,startedAt:new Date(Date.now()-864e5).toISOString(),moonbag:false,tps:tps()}))});
          const s=pf[3], px=s.currentPrice*1.1; await Samsam.addTx(s.sym,'sell',s.qty,px,'sold all',{feeUsd:1});
          return {sym:s.sym, qty:s.qty, avg:s.basePrice, got:s.qty*px-1, profit:(px-s.basePrice)*s.qty-1, syms:pf.map(c=>c.sym)}})()""")
        pg.reload(); pg.wait_for_selector('table.xv tbody tr'); pg.wait_for_timeout(800)
        sym = info['sym']; n = pg.evaluate(NUM, sym)
        check(f'{vn}: {sym} sold out still listed, 3 of 3 done', sym in pg.evaluate(ROWS) and '3 of 3 done' in n[2], n)
        check(f'{vn}: Cash out = money received {info["got"]:.2f} ({n[0]})', abs(money(n[0]) - info['got']) < 0.011, (n, info))
        check(f'{vn}: Net profit = the real profit {info["profit"]:.2f} ({n[1]})', abs(money(n[1]) - info['profit']) < 0.011, (n, info))
        check(f'{vn}: Average buy price shown (the one it was sold at), not —', '—' not in n[3].split('\n')[0] and money(n[3]) is not None, n)
        def sort(k):
            pg.evaluate(f"(()=>{{const s=document.getElementById('xsSort'); s.value='{k}'; s.dispatchEvent(new Event('change',{{bubbles:true}}))}})()"); pg.wait_for_timeout(250)
            return pg.evaluate(ROWS)
        cash = {s: money(pg.evaluate(NUM, s)[0]) for s in info['syms']}; prof = {s: money(pg.evaluate(NUM, s)[1]) for s in info['syms']}
        check(f'{vn}: Sort Cash out → biggest first, {sym} at its place', sort('cash') == sorted(info['syms'], key=lambda s: -cash[s]), (sort('cash'), cash))
        check(f'{vn}: Sort Net profit → biggest first', sort('profit') == sorted(info['syms'], key=lambda s: -prof[s]), (sort('profit'), prof))
        check(f'{vn}: Sort Value → {sym} (nothing left) last', sort('value')[-1] == sym, sort('value'))
        check(f'{vn}: Sort Closest to TP1 → {sym} (done) last', sort('tp1')[-1] == sym, sort('tp1'))
        check(f'{vn}: Sort Asset A–Z', sort('asset') == sorted(info['syms']), sort('asset'))
        check(f'{vn}: Plan order', sort('') == info['syms'], sort(''))
        pg.click('table.xv th .xv-th[data-k="cash"]'); pg.wait_for_timeout(200)
        check(f'{vn}: the Cash out header sorts the same way', pg.evaluate(ROWS) == sorted(info['syms'], key=lambda s: -cash[s]))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
