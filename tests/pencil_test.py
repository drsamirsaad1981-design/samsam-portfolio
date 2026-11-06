"""✎ is always visible beside editable values: Current Price on the main page (table + card) and Target / Buy-at % in the
Accumulation table (no more input boxes there)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
VIS = """(sel) => [...document.querySelectorAll(sel)].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  const prev = b.previousSibling, pr = prev ? (() => { const g = document.createRange(); g.selectNode(prev); return g.getBoundingClientRect(); })() : null;
  return { op: +cs.opacity, w: Math.round(r.width), after: pr ? r.left >= pr.right - 1 : null, sameLine: pr ? Math.abs((r.top + r.bottom) / 2 - (pr.top + pr.bottom) / 2) < 6 : null }; })"""
def answer(pg, val):
    pg.evaluate(f"window.__cpAutoAnswer = (kind, msg, o) => kind === 'prompt' ? {val!r} : true")
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500); pg.mouse.move(1, 1)
        for view in ('table', 'cards'):
            pg.evaluate(f"applyView('{view}')"); pg.wait_for_timeout(400)
            sel = '#portfolioTable .price-edit' if view == 'table' else '#coinsStack .price-edit'
            v = pg.evaluate(VIS, sel)
            check(f'{name}/{view}: Current Price ✎ on every coin, visible without tapping', len(v) > 5 and all(x['op'] >= 0.7 and x['w'] >= 18 for x in v), v[:3])
            check(f'{name}/{view}: ✎ sits right after the price, same line', all(x['after'] and x['sameLine'] for x in v), v[:3])
            pg.locator('#portfolioTable tbody tr' if view == 'table' else '#coinsStack .coin-card').first.screenshot(path=str(SH / f'pencil-main-{view}-{name}.png'))
        sym = pg.evaluate("document.querySelector('#coinsStack .price-edit').getAttribute('onclick').match(/'([^']+)'/)[1]")
        answer(pg, '123.45')
        pg.evaluate("document.querySelector('#coinsStack .price-edit').click()"); pg.wait_for_timeout(800)
        got = pg.evaluate(f"(Samsam.getState().coins.find(c => c.sym === '{sym}') || {{}}).lastPrice")
        check(f'{name}: card ✎ opens the manual-price dialog and saves', got == 123.45 or abs((got or 0) - 123.45) < 1e-9, got)
        # ── Accumulation ──
        pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1800)
        pg.evaluate("typeof setView === 'function' ? setView('table') : (document.querySelector('[onclick*=\"table\" i]') || {click(){}}).click()"); pg.wait_for_timeout(500)
        check(f'{name}: accumulation table has no input boxes for Target / Buy at', pg.evaluate("document.querySelectorAll('#tableBody .target-input, tbody .target-input').length") == 0)
        v = pg.evaluate(VIS, 'tbody .val-edit')
        n_rows = pg.evaluate("document.querySelectorAll('tbody tr').length")
        check(f'{name}: ✎ for Target and Buy-at on every row, always visible', n_rows > 0 and len(v) == 2 * n_rows and all(x['op'] >= 0.7 for x in v), (n_rows, len(v), v[:2]))
        check(f'{name}: accumulation ✎ sits right after the value', all(x['after'] and x['sameLine'] for x in v), v[:4])
        idx = pg.evaluate("+document.querySelector('tbody .val-edit').getAttribute('onclick').match(/\\d+/)[0]")
        answer(pg, '777')
        pg.evaluate("document.querySelector('tbody .val-edit').click()"); pg.wait_for_timeout(800)
        tq = pg.evaluate(f"accumPlan[{idx}].targetQty"); shown = pg.evaluate(f"[...document.querySelectorAll('tbody tr')].some(r => r.querySelector('.val-edit[onclick=\"promptTarget({idx})\"]') && /777/.test(r.innerText))")
        check(f'{name}: Target ✎ saves the new amount for that coin', tq == 777 and shown, (tq, shown))
        answer(pg, '-15')
        pg.evaluate(f"promptTargetPct({idx})"); pg.wait_for_timeout(800)
        pc = pg.evaluate(f"accumPlan[{idx}].targetPct"); shown = pg.evaluate(f"[...document.querySelectorAll('tbody tr')].some(r => r.querySelector('.val-edit[onclick=\"promptTargetPct({idx})\"]') && r.innerText.includes('−15%'))")
        check(f'{name}: Buy-at ✎ saves a negative % and shows −15%', pc == -15 and shown, (pc, shown))
        answer(pg, 'abc')
        pg.evaluate(f"promptTarget({idx})"); pg.wait_for_timeout(500)
        check(f'{name}: bad input is refused (target unchanged)', pg.evaluate(f"accumPlan[{idx}].targetQty") == 777)
        pg.evaluate("window.__cpAutoAnswer = (kind, msg, o) => kind === 'prompt' ? (o && o.value != null ? String(o.value) : '') : true")
        pg.locator('table').first.screenshot(path=str(SH / f'pencil-accum-{name}.png'))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'pencil_test: {sum(res)}/{len(res)} passed')
