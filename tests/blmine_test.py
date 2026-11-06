"""Baseline editor offers your own BTC buy price on the chosen day and saves it as a hand-entered price."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx)
    ctx.route('https://api.coingecko.com/api/v3/coins/bitcoin/history**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps({'market_data': {'current_price': {'usd': 81162.0}}}), headers={'access-control-allow-origin': '*'}))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    exp = pg.evaluate("(() => { const d = Samsam.getState().coins.find(c => c.sym === 'BTC'); return d.opening.avg; })()")
    pg.click('.hm-baseline .val-edit'); pg.wait_for_timeout(400)
    t = pg.inner_text('#blMine') if pg.is_visible('#blMine') else ''
    check('editor offers my own BTC price for Oct 15 (opening position)', f'${exp:,.2f}' in t, (t, exp))
    pg.click('#blMine'); pg.wait_for_timeout(200)
    check('tapping it fills the price, marked as my own', abs(float(pg.input_value('#blPrice')) - exp) < 0.005 and 'Your own BTC' in pg.inner_text('#blSrc') and pg.get_attribute('#blMine', 'aria-pressed') == 'true', (pg.input_value('#blPrice'), pg.inner_text('#blSrc')))
    pg.screenshot(path=str(SH / 'blmine.png'))
    pg.click('#blSave'); pg.wait_for_timeout(900)
    b = pg.evaluate("Samsam.getBaseline()")
    check('saved: Oct 15 at my price, source = manual', b['date'] == '2026-10-15' and abs(b['btcPrice'] - exp) < 0.005 and b['source'] == 'manual', b)
    v = pg.evaluate("getPerf(portfolio.find(c => c.sym === 'BTC'))")
    check('BTC still 0 vs BTC', abs(v) < 1e-9, v)
    pg.click('.hm-baseline .cp-hint'); pg.wait_for_timeout(300)
    check('baseline ⓘ explains daily price vs the price you paid', 'price you actually paid' in pg.inner_text('.cph') and 'entered by hand' in pg.inner_text('.cph'))
    pg.keyboard.press('Escape')
    pg.evaluate("Samsam.setBaseline({ date: '2026-10-15', btcPrice: 81162, source: 'coingecko' })"); pg.wait_for_timeout(500)
    check('no page errors', not errs, errs)
    br.close()
print(f'blmine_test: {sum(res)}/{len(res)} passed')
