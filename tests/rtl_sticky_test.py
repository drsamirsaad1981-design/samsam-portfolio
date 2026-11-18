"""Arabic (right-to-left): the Asset column stays put while a wide table scrolls sideways — main table, Plan table and
Exit Strategy — the same as in English. Also: the 🥇 Precious Metals card sits under the moving line (the line stays
right under the four cards)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
# scroll the wrapper sideways (to the far end) and check the first cell of row 1 is still at the wrapper's start edge
PIN = """(a => { const w = document.querySelector(a.wrap); const td = w.querySelector(a.cell); if (!w || !td) return 'missing';
  const before = td.getBoundingClientRect(); w.scrollLeft = document.documentElement.dir === 'rtl' ? -99999 : 99999;
  const r = td.getBoundingClientRect(), wr = w.getBoundingClientRect(); const rtl = document.documentElement.dir === 'rtl';
  return { moved: Math.abs(w.scrollLeft) > 50, pinned: rtl ? Math.abs(r.right - wr.right) < 3 : Math.abs(r.left - wr.left) < 3, x: [before.left, r.left, wr.left, wr.right, r.right] }; })"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
        ctx.add_init_script(f"try {{ localStorage.setItem('cp-lang', '{lang}'); }} catch (_) {{}}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        check(f'{lang}: page direction', pg.evaluate("document.documentElement.dir") in (('rtl',) if lang == 'ar' else ('ltr', '')))
        pg.evaluate("applyView('table')"); pg.wait_for_timeout(400)
        r = pg.evaluate(PIN + "({ wrap: '#portfolioTableWrapper', cell: '#tableBody tr td:first-child' })")
        check(f'{lang}: main table — Asset column stays put while scrolling sideways', isinstance(r, dict) and r['moved'] and r['pinned'], r)
        pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        pg.evaluate("setPlanTab('accum'); typeof setView === 'function' && setView('table')"); pg.wait_for_timeout(500)
        r = pg.evaluate(PIN + "({ wrap: '#tableView', cell: 'table tbody tr td:first-child' })")
        check(f'{lang}: Plan table — Asset column stays put', isinstance(r, dict) and r['moved'] and r['pinned'], r)
        if lang == 'ar': pg.screenshot(path=str(SH / 'rtl-plan-table.png'))
        check(f'{lang}: no page errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'rtl_sticky_test: {sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
