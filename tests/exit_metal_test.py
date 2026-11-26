"""🥇 Exit Strategy with a metal: gold is kept in troy ounces and shown in grams here too — the plan amount, the average
buy price, each step's price and what it sells. A step's price is typed per gram and saved per ounce (the alerts and the
bot read ounces). A coin beside it is unchanged."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
GPO = 31.1034768
T = pathlib.Path(__file__).parent / 'shots'; T.mkdir(exist_ok=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_timeout(500)
        if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(600)
        if lang == 'en':
            pg.evaluate("Samsam.addCoin({ sym: 'XAU', name: 'Gold', cat: 'metals', cls: 'metal' }, { qty: 2, price: 3000 })"); pg.wait_for_timeout(900)
            pg.evaluate("Samsam.updatePrices({ XAU: { usd: 4000, ch24: 1 } })"); pg.wait_for_timeout(300)
            coin = pg.evaluate("Samsam.getState().portfolio.filter(c => c.sym !== 'XAU' && c.qty > 0 && c.basePrice > 0)[0]")
            pg.evaluate("""(sym) => { const st = Samsam.getState(), mk = c => ({ sym: c.sym, cgId: c.cgId || '', baseQty: c.qty, startedAt: new Date().toISOString(), moonbag: false, tps: [25, 50, 25].map(p => ({ price: 0, pct: p, lock: false })) });
              return Samsam.saveExit({ tab: 'exit', steps: null, plan: [mk(st.portfolio.find(c => c.sym === 'XAU')), mk(st.portfolio.find(c => c.sym === sym))] }); }""", coin['sym']); pg.wait_for_timeout(900)
        pg.evaluate("try{localStorage.setItem('samsam_exit_view','cards');localStorage.setItem('samsam_plan_tab','exit')}catch(e){}")
        pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(1200)
        if not pg.is_visible('#exitPane'): pg.click('#tabExit'); pg.wait_for_timeout(1200)
        pg.evaluate("Samsam.updatePrices({ XAU: { usd: 4000, ch24: 1 } })"); pg.wait_for_timeout(600)
        clean = "s => (s || '').replace(/[\\u2066-\\u2069\\u200e\\u200f]/g, '').replace(/\\s+/g, ' ').trim()"
        g = pg.evaluate(f"""(() => {{ const C = {clean}, k = document.getElementById('xk-XAU'); if (!k) return null;
          return {{ head: C(k.querySelector('.xk-head').innerText), info: C(k.querySelector('.xk-info').innerText), prices: [...k.querySelectorAll('input[data-f=price]')].map(i => i.value),
            labels: [...k.querySelectorAll('.xt-in label:first-child span')].map(s => C(s.textContent)), subs: [...k.querySelectorAll('.xt-sub')].map(s => C(s.innerText)), text: C(k.innerText) }}; }})()""")
        if lang == 'en':
            check('gold card: plan amount in grams (2 oz = 62.207 g) and the average per gram ($96.45/g)', g and 'Plan amount 62.207 g' in g['info'] and 'Average buy price $96.45/g' in g['info'], g and g['info'])
            check('…its price beside the name is per gram ($128.60/g)', g and '$128.60/g' in g['head'], g and g['head'])
            check('…the three steps read "Price per gram": ×2 ×3 ×5 of the average = 192.904 · 289.357 · 482.261', g and g['labels'] == ['Price per gram'] * 3 and [round(float(x), 2) for x in g['prices']] == [192.9, 289.36, 482.26], g and (g['labels'], g['prices']))
            check('…each step sells grams: 25% = 15.552 g, 50% = 31.103 g', g and g['subs'][0].startswith('Sell 15.552 g') and g['subs'][1].startswith('Sell 31.103 g'), g and g['subs'])
            check('…no ounce amount and no "XAU" unit left on the card', g and ' XAU' not in g['info'] and 'Sell 0.5 XAU' not in g['text'] and 'Sell 1 XAU' not in g['text'], g and g['text'][:300])
            # type a price per gram → saved per ounce, locked
            pg.fill('#xk-XAU input[data-f=price][data-tp="1"]', '250'); pg.dispatch_event('#xk-XAU input[data-f=price][data-tp="1"]', 'change'); pg.wait_for_timeout(1500)
            tp = pg.evaluate("Samsam.getState().exit.plan.find(e => e.sym === 'XAU').tps[1]")
            v = pg.input_value('#xk-XAU input[data-f=price][data-tp="1"]')
            check('typing 250 in TP2 saves 250 × 31.1035 = $7,775.87 an ounce (locked) and still shows 250', abs(tp['price'] - 250 * GPO) < 1e-6 and tp['lock'] is True and float(v) == 250, (tp, v))
            sub = pg.evaluate(f"({clean})(document.querySelectorAll('#xk-XAU .xt-sub')[1].innerText)")
            check('…and that step\'s cash is 31.103 g × $250 = $7,775.87', '$7,775.87' in sub, sub)
            # the coin beside it: untouched
            c = pg.evaluate(f"""((sym) => {{ const C = {clean}, k = document.getElementById('xk-' + sym); return {{ info: C(k.querySelector('.xk-info').innerText), labels: [...k.querySelectorAll('.xt-in label:first-child span')].map(s => C(s.textContent)), sub: C(k.querySelector('.xt-sub').innerText) }}; }})('{coin['sym']}')""")
            check(f'a coin ({coin["sym"]}) is as before: "Price", "Sell … {coin["sym"]}", no /g', c['labels'] == ['Price'] * 3 and (' ' + coin['sym']) in c['sub'] and '/g' not in c['info'], c)
            # table view
            pg.click('[data-act=view][data-v=table]'); pg.wait_for_timeout(700)
            row = pg.evaluate(f"({clean})(document.querySelector('.xv tr[data-sym=XAU]').innerText)")
            check('table: the gold row is in grams too (62.207 g · $96.45/g · now $128.60/g · TP2 $250.00/g)', '62.207 g' in row and '$96.45/g' in row and 'now $128.60/g' in row and '$250.00/g' in row, row)
            pg.click('[data-act=view][data-v=cards]'); pg.wait_for_timeout(500)
        else:
            check('Arabic: the gold card is in grams too (62.207 g, /g) and the step label is translated', g and '62.207 g' in g['info'] and '/g' in g['info'] and g['labels'] == ['سعر الجرام'] * 3 and g['subs'][0].startswith('بيع 15.552 g'), g and (g['info'], g['labels'], g['subs']))
            check('Arabic: the typed 250 a gram is still there', g and float(g['prices'][1]) == 250, g and g['prices'])
        pg.locator('#xk-XAU').screenshot(path=str(T / f'exit-metal-{lang}.png'))
        check(f'{lang}: no page errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
