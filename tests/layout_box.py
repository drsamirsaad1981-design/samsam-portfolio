"""Compact layout: computer = contained box (slim scrollbar, sticky headers); phone = normal page scroll, 1 card per row."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
BOX = """(sel) => { const e = document.querySelector(sel), cs = getComputedStyle(e), r = e.getBoundingClientRect();
  return { h: Math.round(r.height), maxH: cs.maxHeight, oy: cs.overflowY, scrolls: e.scrollHeight > e.clientHeight + 1, sideways: e.scrollWidth > e.clientWidth + 1,
           cols: cs.gridTemplateColumns.split(' ').length, vh: innerHeight }; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for w in (1366, 1920):
        ctx = br.new_context(viewport={'width': w, 'height': 900}); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        pg.evaluate("applyView('table')"); pg.wait_for_timeout(400); t = pg.evaluate(BOX, '#portfolioTableWrapper')
        check(f'{w}px table: contained box ≤ screen height, scrolls inside', t['scrolls'] and t['h'] <= t['vh'] and t['oy'] == 'auto', t)
        check(f'{w}px table: fits the width (no sideways scroll)', not t['sideways'], t)
        rowH = pg.evaluate("Math.round(document.querySelector('#tableBody tr').getBoundingClientRect().height)")
        check(f'{w}px table rows compact (≤ 84px, was 149)', rowH <= 84, rowH)
        pg.evaluate("document.getElementById('portfolioTableWrapper').scrollTop = 900"); pg.wait_for_timeout(150)
        off = pg.evaluate("Math.round(document.querySelector('#portfolioTable thead th').getBoundingClientRect().top - document.getElementById('portfolioTableWrapper').getBoundingClientRect().top)")
        check(f'{w}px table header stays on top while scrolling', abs(off) <= 2, off)
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(100)
        anim = pg.evaluate("document.getElementById('coinsStack').classList.contains('view-enter')")
        check(f'{w}px switching view animates in', anim)
        pg.wait_for_timeout(400); c = pg.evaluate(BOX, '#coinsStack')
        check(f'{w}px cards: 3–4 per row in a contained scrolling box', 3 <= c['cols'] <= 4 and c['scrolls'] and c['h'] <= c['vh'], c)
        page_h = pg.evaluate("document.documentElement.scrollHeight")
        check(f'{w}px whole page stays short (< 2.7 screens)', page_h < 900 * 2.7, page_h)
        pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        a = pg.evaluate(BOX, '#tableView')
        check(f'{w}px accumulation table in the same box style', a['maxH'] != 'none' and a['oy'] == 'auto', a)
        pg.evaluate("setView('cards')"); pg.wait_for_timeout(400); a = pg.evaluate(BOX, '#cardsView')
        check(f'{w}px accumulation cards grid 3–4 per row', 3 <= a['cols'] <= 4 and a['maxH'] != 'none', a)
        check(f'{w}px no JS errors', not errs, errs[:2]); ctx.close()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx); pg = ctx.new_page()
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000); pg.evaluate("applyView('cards')"); pg.wait_for_timeout(400)
    c = pg.evaluate(BOX, '#coinsStack')
    check('phone: no inner scroll box (page scrolls), 1 card per row', c['maxH'] == 'none' and not c['scrolls'] and c['cols'] == 1, c)
    ch = pg.evaluate("Math.round(document.querySelector('#coinsStack .coin-card').getBoundingClientRect().height)")
    check('phone: card shorter (≤ 480px, was ~570; labels now carry ⓘ)', ch <= 480, ch)
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1000); pg.evaluate("setView('cards')"); pg.wait_for_timeout(300)
    check('phone accumulation: no inner scroll box', pg.evaluate(BOX, '#cardsView')['maxH'] == 'none')
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
