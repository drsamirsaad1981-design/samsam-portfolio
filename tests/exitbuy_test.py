"""Exit plan: buying more after a coin joined the plan raises its plan amount (steps grow); older buys don't count twice."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_timeout(500)
    if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.Samsam && Samsam.isReady() && window.SamsamExit")
    r = pg.evaluate("""(()=>{const C=SamsamExit.calc;
      const e={sym:'BTC',baseQty:1,startedAt:'2026-10-01T00:00:00Z',moonbag:true,tps:[{price:0,pct:25,lock:false},{price:0,pct:50,lock:false},{price:0,pct:25,lock:false}]};
      const coin={qty:1.5,basePrice:60000,currentPrice:70000};
      const txs=[{sym:'BTC',type:'buy',qty:0.7,createdAt:'2026-09-01T00:00:00Z'},
                 {sym:'BTC',type:'buy',qty:0.5,createdAt:'2026-11-04T06:00:00Z'},
                 {sym:'ETH',type:'buy',qty:9,createdAt:'2026-11-04T06:00:00Z'}];
      const a=C.coin(e,coin,txs), b=C.coin(e,coin,[]);
      const c=C.coin(e,{qty:1.3,basePrice:60000,currentPrice:70000},txs.concat([{sym:'BTC',type:'sell',qty:0.2,createdAt:'2026-11-04T07:00:00Z'}]));
      return {base:a.base,bought:a.bought,tp1:a.steps[0].qty,b0:b.base,cBase:c.base,cSold:c.sold,cFill:c.steps[0].filled}})()""")
    check('a buy after the coin joined the plan adds to the plan amount (1 + 0.5)', abs(r['base'] - 1.5) < 1e-9, r)
    check('buys before the plan started are not counted again', abs(r['bought'] - 0.5) < 1e-9, r)
    check('TP1 grows with it: 25% of (1.5 - 10% moonbag)', abs(r['tp1'] - 1.5 * 0.9 * 0.25) < 1e-9, r)
    check('no new buys → plan amount unchanged', r['b0'] == 1, r)
    check('a sell still fills TP1 and does not shrink the plan amount', abs(r['cBase'] - 1.5) < 1e-9 and abs(r['cFill'] - 0.2) < 1e-9, r)
    check('no JS errors', not errs, errs[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
