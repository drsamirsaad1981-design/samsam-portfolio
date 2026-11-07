"""Tap signs everywhere: All Time Profit cards get the round button (small), movers rows get a small ›,
Performance coin links get ↗ (CoinMarketCap), filters/selections get nothing."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
OVER = """(sel) => [...document.querySelectorAll(sel)].filter(c => c.offsetParent).map(c => {
  const lab = c.querySelector('.stat-label, .sum-label, .htx-label, .pnl-bd-stat-label, .stat-value, .sum-value, .htx-value, .pnl-bd-stat-val');
  const go = c.querySelector(':scope > .card-go'); if (!go) return 'missing';
  const b = go.getBoundingClientRect(), r = c.getBoundingClientRect();
  const hit = [...c.querySelectorAll('.stat-label, .sum-label, .htx-label, .pnl-bd-stat-label, .stat-value, .sum-value, .htx-value, .pnl-bd-stat-val')].some(e => {
    const rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect(); return t.width && t.right > b.left + 1 && t.bottom > b.top + 1 && t.top < b.bottom - 1; });
  return { sm: go.classList.contains('sm'), w: Math.round(b.width), inside: b.right <= r.right && b.top >= r.top, hit }; })"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1800)
        pg.mouse.move(1, 1)
        g = pg.evaluate(OVER, '#allTimeCard')
        check(f'{name}: header All Time Profit has the small round button, text clear of it', g and g[0] != 'missing' and g[0]['sm'] and g[0]['w'] in (20, 22, 26) and g[0]['inside'] and not g[0]['hit'], g)
        check(f'{name}: no ⓘ left anywhere', not pg.query_selector('.cp-profit-i'))
        mv = pg.evaluate("[...document.querySelectorAll('#moversCard button.mv-half')].map(b => !!b.querySelector('.mv-go'))")
        check(f'{name}: main movers rows show a small ›', mv and all(mv), mv)
        check(f'{name}: category filter cards have no arrow', not pg.query_selector('#summaryGrid .card-go, #summaryGrid .mv-go'))
        others = pg.evaluate("[...document.querySelectorAll('.header-stats .stat-card')].filter(c => c.id !== 'allTimeCard' && c.querySelector('.card-go')).length")
        check(f'{name}: non-tappable header cards stay plain', others == 0, others)
        pg.locator('.header-stats').screenshot(path=str(SH / f'go2-header-{name}.png'))
        pg.locator('#moversCard').screenshot(path=str(SH / f'go2-movers-{name}.png'))
        sym = pg.evaluate("portfolio.find(c => c.sym !== 'BTC').sym")
        pg.evaluate(f"location.hash = '#holdings/{sym}'"); pg.wait_for_timeout(900)
        g = pg.evaluate(OVER, '.htx-card.cp-profit-tap')
        check(f'{name}: coin page All Time Profit has the small round button', g and g[0] != 'missing' and g[0]['sm'] and not g[0]['hit'], g)
        pg.locator('.htx-cards').screenshot(path=str(SH / f'go2-coin-{name}.png'))
        pg.click('.htx-card.cp-profit-tap .card-go', force=True); pg.wait_for_timeout(300)
        check(f'{name}: tapping the button itself opens the details', pg.is_visible('#cpProfit .cpp'))
        pg.keyboard.press('Escape')
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2500); pg.mouse.move(1, 1)
        g = pg.evaluate(OVER, '#allTimeCard, .pnl-bd-stat.cp-profit-tap')
        check(f'{name}: Performance All Time Profit card has the button (breakdown no longer repeats it)', len(g) == 1 and all(x != 'missing' and not x['hit'] and x['inside'] for x in g), g)
        check(f'{name}: the 📈 decoration gives way to the button', pg.evaluate("getComputedStyle(document.querySelector('#allTimeCard .sum-card-icon')).display") == 'none')
        mv = pg.evaluate("[...document.querySelectorAll('#moversPerf button.mv-half')].map(b => !!b.querySelector('.mv-go'))")
        check(f'{name}: Performance movers rows show a small ›', len(mv) == 2 and all(mv), mv)   # one Top Performers card
        ext = pg.evaluate("[...document.querySelectorAll('#coinList a.ast-sym')].map(a => !!a.querySelector('.ext-go') && a.target === '_blank')")
        check(f'{name}: coin links to CoinMarketCap show ↗', ext and all(ext), ext[:3])
        pg.locator('.summary').screenshot(path=str(SH / f'go2-perf-{name}.png'))
        pg.locator('#coinList').screenshot(path=str(SH / f'go2-perflist-{name}.png')) if name == 'mobile' else None
        pg.goto(S.SITE + '/allocation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        check(f'{name}: allocation legend (selection) has no arrow', not pg.query_selector('.legend-item .card-go, .legend-item .mv-go'))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'cardgo2_test: {sum(res)}/{len(res)} passed')
