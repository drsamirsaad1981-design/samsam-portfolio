"""Performance list: sort bar = P&L (tap again flips ↓/↑, $ / % switch) + Value; rows = Asset (logo, symbol, price • 24h)
| Holdings / Value (value, amount) | All Time Profit ($, %)."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def num(t): t = t.replace('−', '-').replace(',', ''); m = re.findall(r'-?\$?-?[\d.]+', t)[0]; return float(m.replace('$', ''))
ROWS = """[...document.querySelectorAll('#coinList .coin-row')].map(r => ({ sym: r.querySelector('.ast-sym').childNodes[0].textContent.trim(),
  line: r.querySelector('.ast-line').textContent.trim(), val: r.querySelector('.hold-val').textContent, qty: r.querySelector('.hold-qty').textContent,
  usd: r.querySelector('.pnl-usd').textContent, pct: r.querySelector('.pnl-pct').textContent, cols: getComputedStyle(r).gridTemplateColumns.split(' ').length }))"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('small', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(1800)
        tabs = pg.evaluate("[...document.querySelectorAll('.sort-tabs-inner button')].map(b => b.textContent.trim())")
        check(f'{name}: sort bar = P&L ($ %) + Value only', tabs == ['↓ All Time Profit', '$', '%', '↓ Value'], tabs)
        rows = pg.evaluate(ROWS)
        check(f'{name}: 3 columns + the › ⌄ arrows', all(r['cols'] == 4 for r in rows))
        st = pg.evaluate("Object.fromEntries(Samsam.getState().portfolio.map(c => [c.sym, { qty: c.qty, price: c.currentPrice }]))")
        r0 = next(r for r in rows if r['sym'] in st)
        check(f'{name}: Asset line = price • 24h %', re.match(r'^\$[\d,.]+\s*•\s*[+−-][\d.]+%$', r0['line']), r0['line'])
        check(f'{name}: Holdings / Value = value, then amount', abs(num(r0['val']) - st[r0['sym']]['qty'] * st[r0['sym']]['price']) < 0.01 and r0['qty'].endswith(r0['sym']), r0)
        usd = [num(r['usd']) for r in rows]
        check(f'{name}: P&L ↓ = biggest profit first', usd == sorted(usd, reverse=True), usd[:5])
        pg.click('#tab-pnl'); pg.wait_for_timeout(250); usd = [num(pg.evaluate(ROWS)[i]['usd']) for i in range(len(rows))]
        check(f'{name}: tap P&L again → ↑ smallest first', usd == sorted(usd) and pg.inner_text('#tab-pnl').startswith('↑'), (usd[:5], pg.inner_text('#tab-pnl')))
        pg.click('#unit-pct'); pg.wait_for_timeout(250); pct = [num(r['pct']) for r in pg.evaluate(ROWS)]
        check(f'{name}: % keeps the direction and sorts by %', pct == sorted(pct) and pg.get_attribute('#unit-pct', 'aria-pressed') == 'true', pct[:5])
        pg.click('#tab-pnl'); pg.wait_for_timeout(250); pct = [num(r['pct']) for r in pg.evaluate(ROWS)]
        check(f'{name}: …tap P&L → ↓ by %', pct == sorted(pct, reverse=True), pct[:5])
        pg.click('#tab-value'); pg.wait_for_timeout(250); vals = [num(r['val']) for r in pg.evaluate(ROWS)]
        check(f'{name}: Value ↓ = biggest first; P&L switched off', vals == sorted(vals, reverse=True) and 'active' not in pg.get_attribute('#grp-pnl', 'class'), vals[:5])
        pg.click('#tab-value'); pg.wait_for_timeout(250); vals = [num(r['val']) for r in pg.evaluate(ROWS)]
        check(f'{name}: tap Value again → ↑', vals == sorted(vals), vals[:5])
        pg.click('#col-pnl'); pg.wait_for_timeout(250)
        check(f'{name}: the All Time Profit header sorts by P&L too', 'active' in pg.get_attribute('#grp-pnl', 'class'))
        lay = pg.evaluate("""[...document.querySelectorAll('#coinList .coin-row')].map(r => { const rb = r.getBoundingClientRect(); const kids = [...r.children].filter(c => !c.classList.contains('c-links')); return kids.some(c => { const b = c.getBoundingClientRect(); return b.right > rb.right + 1 || b.left < rb.left - 1; }) || kids.some((c, i, a) => i && c.getBoundingClientRect().left < a[i-1].getBoundingClientRect().right - 1); })""")
        check(f'{name}: nothing overlaps or sticks out', not any(lay))
        check(f'{name}: no horizontal scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'perfsort_test: {sum(res)}/{len(res)} passed')
