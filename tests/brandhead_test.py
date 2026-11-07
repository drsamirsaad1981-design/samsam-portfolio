"""New main header (Cute Portfolio, Live under the name, date · Baseline ⓘ ✎), editable Baseline (cloud setting used
by every page, BTC price looked up, preview before saving), shared hint panel, and the compact bar on scroll."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
HIST = {'01-10-2026': 60000.0, '15-10-2026': 81162.0}
def hist_route(route):
    m = re.search(r'date=(\d\d-\d\d-\d{4})', route.request.url)
    p = HIST.get(m.group(1)) if m else None
    if p is None: route.fulfill(status=429, body='rate limited')
    else: route.fulfill(status=200, content_type='application/json', body=json.dumps({'market_data': {'current_price': {'usd': p}}}), headers={'access-control-allow-origin': '*'})
PERF = "portfolio.filter(c => c.sym !== 'BTC').slice(0, 3).map(c => +getPerf(c).toFixed(4))"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone-360', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('https://api.coingecko.com/api/v3/coins/bitcoin/history**', hist_route)
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        txt = pg.inner_text('header.app-head')
        check(f'{name}: header says Cute Portfolio; Golden Triangle / tagline / 🎯 gone', 'Cute Portfolio' in txt and 'Golden Triangle'.upper() not in txt.upper() and 'Mining' not in txt and '🎯' not in txt, txt[:120])
        g = pg.evaluate("""(() => { const c = document.querySelector('.brand-cute'), cs = getComputedStyle(c), n = document.querySelector('.brand-name').getBoundingClientRect(),
            l = document.getElementById('liveIndicator').getBoundingClientRect(), b = document.querySelector('.hdr-btns').getBoundingClientRect(), m = document.querySelector('.head-meta');
            return { grad: cs.backgroundImage.includes('gradient') && (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)'), liveUnder: l.top >= n.bottom - 2 && Math.abs(l.left - n.left) < 2,
              btnsRight: Math.round(document.querySelector('header.app-head').getBoundingClientRect().right - b.right) < 30 && b.top < n.bottom, nameOneLine: n.height < 40, metaOneLineOrWrap: m.scrollWidth <= m.clientWidth + 1,
              btns: document.querySelectorAll('.hdr-btns .ss-theme-btn').length, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; })()""")
        check(f'{name}: "Cute" in the logo gradient, name on one line', g['grad'] and g['nameOneLine'], g)
        check(f'{name}: Live sits under the name; settings + cloud + theme top-right', g['liveUnder'] and g['btnsRight'] and g['btns'] == 3, g)
        check(f'{name}: date · Baseline line fits, no sideways scroll', g['metaOneLineOrWrap'] and not g['overflow'], g)
        check(f'{name}: baseline shown with ⓘ and ✎', pg.inner_text('#baselineLabel') == 'Oct 15, 2026' and pg.is_visible('.hm-baseline .cp-hint') and pg.is_visible('.hm-baseline .val-edit svg'))
        pg.locator('header.app-head').screenshot(path=str(SH / f'brandhead-{name}.png'))
        # hint
        pg.click('.hm-baseline .cp-hint'); pg.wait_for_timeout(300)
        h = pg.inner_text('.cph') if pg.query_selector('.cph') else ''
        check(f'{name}: ⓘ explains the baseline and its BTC price', 'BTC reference price' in h and '$81,162.00' in h and "don't change" in h and 'Portfolio vs BTC' in h, h[:200])
        check(f'{name}: hint is a bottom sheet on phones, popover on desktop', pg.evaluate("document.querySelector('.cph').classList.contains('sheet')") == name.startswith('phone'))
        pg.screenshot(path=str(SH / f'hint-baseline-{name}.png'))
        before = pg.evaluate(PERF)
        pg.click(".cph-acts button:has-text('Change date')"); pg.wait_for_timeout(300)
        check(f'{name}: "Change date" in the hint opens the baseline editor', pg.is_visible('#blModal .bl-card') and not pg.query_selector('.cph'))
        check(f'{name}: editor starts on the current baseline, Save off until something changes', pg.input_value('#blDate') == '2026-10-15' and pg.input_value('#blPrice') == '81162' and pg.is_disabled('#blSave'))
        pg.fill('#blDate', '2026-10-01'); pg.dispatch_event('#blDate', 'change'); pg.wait_for_timeout(700)
        prev = pg.inner_text('#blPrev')
        check(f'{name}: BTC price for the new date is looked up automatically', pg.input_value('#blPrice') == '60000' and 'CoinGecko' in pg.inner_text('#blSrc'), (pg.input_value('#blPrice'), pg.inner_text('#blSrc')))
        check(f'{name}: preview shows old → new reference price and the shift', '$81,162.00' in prev and '$60,000.00' in prev and 'pts' in prev and 'stay the same' in prev and not pg.is_disabled('#blSave'), prev)
        pg.screenshot(path=str(SH / f'baseline-edit-{name}.png'))
        if name.startswith('phone'):
            pg.fill('#blDate', '2026-09-03'); pg.dispatch_event('#blDate', 'change'); pg.wait_for_timeout(700)
            check('lookup failure → asks you to type the price', 'type the price' in pg.inner_text('#blSrc') and pg.input_value('#blPrice') == '' and pg.is_disabled('#blSave'), pg.inner_text('#blSrc'))
            pg.fill('#blPrice', '58,500'); pg.wait_for_timeout(200)
            check('typed price is accepted', not pg.is_disabled('#blSave') and '$58,500.00' in pg.inner_text('#blPrev'))
            pg.fill('#blDate', '2026-10-01'); pg.dispatch_event('#blDate', 'change'); pg.wait_for_timeout(700)
        pg.click('#blSave'); pg.wait_for_timeout(1200)
        bl = pg.evaluate("Samsam.getBaseline()")
        check(f'{name}: saved to the cloud setting', bl['date'] == '2026-10-01' and bl['btcPrice'] == 60000 and not bl['isDefault'], bl)
        after = pg.evaluate(PERF); btc = pg.evaluate("btcPrice")
        exp = [round(b + (btc / 81162 - btc / 60000) * 100, 4) for b in before]
        check(f'{name}: Portfolio vs BTC uses the new reference price', all(abs(a - e) < 1e-3 for a, e in zip(after, exp)), (before, after, exp))
        check(f'{name}: header + footer show the new date', pg.inner_text('#baselineLabel') == 'Oct 1, 2026' and pg.inner_text('#footerBaseline') == 'Oct 1, 2026')
        pg.goto(S.SITE + '/performance.html'); S.wait_ready(pg); pg.wait_for_timeout(2000)
        pg.click('#mvBtc'); pg.wait_for_timeout(300)   # one Top & Bottom card: USD | vs BTC
        badge = 'Same money in BTC' if pg.get_attribute('#mvBtc', 'aria-pressed') == 'true' else ''
        btcl = pg.evaluate("[...document.querySelectorAll('#moversOne .btc-compare-subtext')].map(e => e.innerText)")
        bt = pg.evaluate("(portfolio.find(c => c.sym === 'BTC') || {}).currentPrice")
        check(f'{name}: Performance VS Bitcoin = same money in BTC (with the new baseline for opening coins)', badge == 'Same money in BTC' and all('BTC Benchmark: ' + f'{(bt / 60000 - 1) * 100:+.1f}'.replace('-', '−') + '%' in t for t in btcl), (badge, btcl, bt))
        check(f'{name}: VS Bitcoin heading has the same ⓘ', pg.query_selector('#moversOne .mv-head .cp-hint') is not None)
        pg.click('#moversOne .mv-head .cp-hint'); pg.wait_for_timeout(300)
        check(f'{name}: VS Bitcoin ⓘ explains the comparison (no change button on inner pages)', 'Portfolio vs BTC' in pg.inner_text('.cph h3') and 'same money in Bitcoin' in pg.inner_text('.cph') and not pg.query_selector('.cph-acts'))
        pg.keyboard.press('Escape')
        # back to the original
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        pg.click('.hm-baseline .val-edit'); pg.wait_for_timeout(200)
        check(f'{name}: "Use the original baseline" is offered once changed', pg.is_visible('#blReset'))
        pg.click('#blReset'); pg.wait_for_timeout(500); pg.click('#blSave'); pg.wait_for_timeout(900)
        check(f'{name}: back to Oct 15 / $81,162', pg.evaluate("[Samsam.getBaseline().date, Samsam.getBaseline().btcPrice]") == ['2026-10-15', 81162] and pg.inner_text('#baselineLabel') == 'Oct 15, 2026')
        check(f'{name}: future date refused', pg.evaluate("Samsam.setBaseline({ date: '2099-01-01', btcPrice: 1 }).then(() => 'saved', e => e.message)").startswith('The baseline date cannot'))
        # compact bar
        check(f'{name}: compact bar hidden at the top', not pg.evaluate("document.getElementById('miniBar').classList.contains('show')"))
        pg.evaluate("scrollTo(0, 900)"); pg.wait_for_timeout(500)
        mb = pg.evaluate("(() => { const b = document.getElementById('miniBar'), r = b.getBoundingClientRect(); return [b.classList.contains('show'), Math.round(r.top), document.getElementById('miniTotal').textContent, document.getElementById('totalUsd').textContent, document.getElementById('miniPnl').textContent, b.querySelector('.mini-name').innerText]; })()")
        check(f'{name}: scrolling down shows the compact bar with logo, name, total and All Time Profit', mb[0] and mb[1] == 0 and mb[2] == mb[3] and '%' in mb[4] and mb[5] == 'Cute Portfolio', mb)
        pg.screenshot(path=str(SH / f'minibar-{name}.png'), clip={'x': 0, 'y': 0, 'width': vp['viewport']['width'], 'height': 70})
        pg.click('#miniBar button'); pg.wait_for_timeout(1500)
        check(f'{name}: tapping the bar goes back to the top and hides it', pg.evaluate("scrollY") < 5 and not pg.evaluate("document.getElementById('miniBar').classList.contains('show')"))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'brandhead_test: {sum(res)}/{len(res)} passed')
