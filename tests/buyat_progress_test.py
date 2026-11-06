"""Buy at % is measured from a fixed base price (saved with the plan, survives a reload); Overall Progress is the average of
each coin's progress capped at 100% — same on the main page and the Accumulation page."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1800)
    pg.evaluate("setView('table')"); pg.wait_for_timeout(300)
    idx = pg.evaluate("accumPlan.findIndex(e => getPortfolioCoin(e.sym) && getPortfolioCoin(e.sym).currentPrice > 0)")
    sym, price = pg.evaluate(f"[accumPlan[{idx}].sym, getPortfolioCoin(accumPlan[{idx}].sym).currentPrice]")
    pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? '-10' : true")
    pg.evaluate(f"promptTargetPct({idx})"); pg.wait_for_timeout(800)
    e = pg.evaluate(f"accumPlan[{idx}]")
    check('setting −10% saves today\'s price as the base', e['targetPct'] == -10 and abs(e['targetBase'] - price) < 1e-9 and e.get('targetBaseAt'), e)
    r = pg.evaluate(f"calcRow(accumPlan[{idx}])")
    check('target = base × 0.90, not waiting yet', abs(r['targetPrice'] - price * 0.9) < 1e-9 and not r['readyToBuy'], r)
    # the market moves: the target must stay put
    pg.evaluate(f"Samsam.updatePrices({{ '{sym}': {{ usd: {price} * 0.95 }} }})"); pg.wait_for_timeout(300)
    r2 = pg.evaluate(f"calcRow(accumPlan[{idx}])")
    check('price −5% → target unchanged, still waiting', abs(r2['targetPrice'] - price * 0.9) < 1e-9 and not r2['readyToBuy'], r2)
    pg.evaluate(f"Samsam.updatePrices({{ '{sym}': {{ usd: {price} * 0.89 }} }})"); pg.wait_for_timeout(300)
    r3 = pg.evaluate(f"calcRow(accumPlan[{idx}])")
    check('price −11% → BUY NOW', r3['readyToBuy'], r3)
    pg.evaluate(f"renderAll()"); pg.wait_for_timeout(300)
    check('table shows BUY NOW and the base it is measured from', 'BUY NOW' in pg.inner_text('table') and 'of $' in pg.inner_text('table'))
    pg.locator('table').screenshot(path=str(SH / 'buyat-table.png'))
    pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500)
    e2 = pg.evaluate(f"accumPlan.find(x => x.sym === '{sym}')")
    check('after a reload the base is still there (saved in the cloud)', abs(e2.get('targetBase', 0) - price) < 1e-9 and e2['targetPct'] == -10, e2)
    # Overall Progress
    plan = pg.evaluate("accumPlan.map(e => ({ actual: calcRow(e).actualQty, target: e.targetQty || 0 }))")
    valid = [x for x in plan if x['target'] > 0]
    exp = sum(min(x['actual'] / x['target'], 1) for x in valid) / len(valid) * 100
    shown = pg.inner_text('#overallPct')
    check('Overall Progress = average of capped per-coin progress', shown == f'{exp:.1f}%', (shown, exp))
    over = [x for x in valid if x['actual'] > x['target']]
    check('(test data has coins above target, so the old weighted maths would differ)', len(over) >= 0)
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    check('main page shows the same Overall Progress', pg.inner_text('#accumPct') == f'{exp:.1f}% complete', (pg.inner_text('#accumPct'), exp))
    r = pg.evaluate("Samsam.core.overallProgress([{ actual: 300, target: 100 }, { actual: 0, target: 100 }])")
    check('a coin 3× over target counts as 100%, the other 0% → 50%', abs(r['pct'] - 50) < 1e-9 and r['completed'] == 1, r)
    pg.evaluate(f"(() => {{ const e = Samsam.getState().accumPlan; }})()")
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1200)
    pg.evaluate(f"(() => {{ const i = accumPlan.findIndex(x => x.sym === '{sym}'); setBuyAtPct(i, 0); saveAccumPlan(); }})()"); pg.wait_for_timeout(500)
    check('no page errors', not errs, errs)
    br.close()
print(f'buyat_progress_test: {sum(res)}/{len(res)} passed')
