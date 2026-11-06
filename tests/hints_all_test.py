"""Every ⓘ on every page (and inside cards, tables, the coin page and the cloud menu) opens its explanation on a tap;
no ⓘ points at a missing text; tapping an ⓘ never triggers what's under it (sorting, opening a card, a link)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
EXPECT = {
  'main cards': {'baseline', 'totalPortfolio', 'btcAccum', 'altAccum', 'movers24h', 'holdingsChange', 'perfChart', 'avgBuy', 'costBasis', 'signal'},   # Portfolio vs BTC moved off the main page (Performance)
  'main table': {'avgBuy', 'costBasis', 'signal'},   # Current Price column removed (price + ✏️ under the symbol)
  'holdings': {'holdingsChange'},
  'coin page': {'avgBuy', 'costBasis', 'external'},
  'performance': {'perfChart', 'sincePurchase'},   # Top & Bottom card: its ⓘ follows the USD | vs BTC switch (vsBtc when vs BTC)
  'accumulation cards': {'planTotals', 'overallProgress', 'pendingAmount', 'costToTarget', 'buyAt', 'targetAmount', 'priceAlert'},
  'accumulation table': {'targetAmount', 'pendingAmount', 'buyAt', 'costToTarget', 'coinProgress'},
  'cloud menu': {'recover', 'backup'},
  'baseline editor': {'baseline'},
}
def run(pg, label, scope='body'):
    keys = pg.evaluate(f"[...new Set([...document.querySelectorAll('{scope} .cp-hint[data-hint]')].filter(b => b.offsetParent).map(b => b.dataset.hint))]")
    missing_text = pg.evaluate("(ks) => ks.filter(k => !CPHint.HINTS[k])", keys)
    check(f'{label}: every ⓘ has a text', not missing_text, missing_text)
    check(f'{label}: the expected ⓘ are there', EXPECT[label] <= set(keys), sorted(EXPECT[label] - set(keys)))
    bad = []
    for k in keys:
        url, h = pg.url, pg.evaluate("location.hash")
        el = pg.locator(f'{scope} .cp-hint[data-hint="{k}"]').filter(visible=True).first
        el.scroll_into_view_if_needed(); el.evaluate("b => { const th = b.closest('table') && b.closest('table').querySelector('thead th:first-child'); const w = b.closest('#portfolioTableWrapper, .tbl-wrap, [style*=overflow]') || (th && th.closest('div')); if (th && w && getComputedStyle(th).position === 'sticky') w.scrollLeft += b.getBoundingClientRect().left - th.getBoundingClientRect().right - 40; }")   # clear of the fixed Asset column
        try: el.tap(timeout=4000)
        except Exception as e: bad.append((k, 'tap: ' + str(e)[:50])); continue
        pg.wait_for_timeout(250)
        ok = pg.evaluate("(() => { const c = document.querySelector('.cph'); if (!c) return false; const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(30, r.height / 2)); return !!(e && e.closest('.cph')) && r.top >= 0 && r.bottom <= innerHeight + 1; })()") and pg.url == url and pg.evaluate("location.hash") == h
        title = pg.inner_text('.cph h3') if pg.query_selector('.cph') else ''
        if not ok or not title: bad.append((k, ok, title, pg.url != url))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(120)
        if pg.url != url: pg.goto(url); S.wait_ready(pg); pg.wait_for_timeout(800)
    check(f'{label}: every ⓘ opens on a tap, on top and fully on screen, and nothing else happens', not bad, bad[:6])
with sync_playwright() as p:
    br = p.chromium.launch()
    import os
    if os.environ.get('VP') == 'desktop': ctx = br.new_context(viewport={'width': 1366, 'height': 900}, has_touch=True); S.setup(ctx); errs = []
    else: ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300); run(pg, 'main cards')
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300); run(pg, 'main table', '#portfolioTableWrapper')
    sort_before = pg.evaluate("[sortCol, sortDir]")
    pg.locator('#portfolioTableWrapper th .cp-hint[data-hint="signal"]').tap(); pg.wait_for_timeout(200); pg.keyboard.press('Escape')
    check('tapping an ⓘ in a table header does not sort', pg.evaluate("[sortCol, sortDir]") == sort_before)
    pg.evaluate("applyView('cards')")
    pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(700); run(pg, 'holdings', '#holdingsOverlay')
    pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(700); run(pg, 'coin page', '#holdingsOverlay')
    pg.evaluate("hovBack()"); pg.wait_for_timeout(300); pg.evaluate("hovBack()"); pg.wait_for_timeout(400)
    pg.click('.hdr-btns .ss-sync-hdr'); pg.wait_for_timeout(300); run(pg, 'cloud menu', '#samsamSyncMenu')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
    pg.evaluate("openBaselineEdit()"); pg.wait_for_timeout(300); run(pg, 'baseline editor', '#blModal'); pg.evaluate("closeBaselineEdit()")
    pg.screenshot(path=str(SH / 'hint-cloudmenu.png'))
    for page, label in (('performance.html', 'performance'), ('accumulation.html', 'accumulation cards')):
        pg.goto(S.SITE + '/' + page); S.wait_ready(pg); pg.wait_for_timeout(1800)
        if page == 'accumulation.html': pg.evaluate("setView('cards')"); pg.wait_for_timeout(500)
        run(pg, label)
    pg.evaluate("setView('table')"); pg.wait_for_timeout(500); run(pg, 'accumulation table', 'table')
    pg.locator('table .cp-hint[data-hint="buyAt"]').first.tap(); pg.wait_for_timeout(250)
    pg.screenshot(path=str(SH / 'hint-buyat.png')); pg.keyboard.press('Escape')
    check('no page errors', not errs, errs)
    br.close()
print(f'hints_all_test: {sum(res)}/{len(res)} passed')
