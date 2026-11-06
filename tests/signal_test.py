"""Signal thresholds: editable (Reinforce % / Sell %), saved once in the cloud → every coin, filter, hint, CSV and a second
device follow; invalid numbers refused; defaults −5 / −20 restored."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
EXP = """(r) => Object.fromEntries(portfolio.map(c => { const p = c.basePrice > 0 ? (c.currentPrice / c.basePrice - 1) * 100 : 0;
  return [c.sym, c.sym === 'BTC' ? 'hold' : p < r[1] ? 'convert' : p <= r[0] ? 'reinforce' : 'hold']; }))"""
SHOWN = "Object.fromEntries(portfolio.map(c => [c.sym, getAction(c.sym, 0, c)]))"
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
    ctx2 = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx2); d2 = ctx2.new_page(); d2.on('pageerror', lambda e: errs.append(str(e)))
    d2.goto(S.SITE + '/index.html'); d2.click('#samsamSignInBtn'); S.wait_ready(d2); d2.wait_for_timeout(800)
    # make some coins sit between the default and new thresholds
    pg.evaluate("Samsam.updatePrices && 0")
    check('defaults −5 / −20', pg.evaluate("[Samsam.getSignalRules().reinforce, Samsam.getSignalRules().sell]") == [-5, -20] and pg.evaluate(SHOWN) == pg.evaluate(EXP, [-5, -20]))
    # open from the Signal filter list
    pg.click('#signalDD .sdd-btn'); pg.wait_for_timeout(300)
    pg.locator('.sdd-panel.show .sdd-opt', has_text='Signal Thresholds').click(); pg.wait_for_timeout(300)
    check('Signal filter → Signal Thresholds opens the editor (filter unchanged)', pg.is_visible('#sgModal .bl-card') and pg.evaluate("document.getElementById('filterAction').value") == '')
    check('fields show how far below (− printed in front), number pad only', pg.input_value('#sgReinforce') == '5' and pg.input_value('#sgSell') == '20' and pg.get_attribute('#sgSell', 'inputmode') == 'decimal' and pg.inner_text('#sgModal .sg-num b') == '−')
    pg.fill('#sgReinforce', '7,5'); pg.fill('#sgSell', '30'); pg.wait_for_timeout(150)
    check('typing 30 means −30% (no minus key needed); a comma works as the decimal point', pg.evaluate("sgRead()") == {'reinforce': -7.5, 'sell': -30, 'ok': True}, pg.evaluate("sgRead()"))
    pg.fill('#sgReinforce', '2'); pg.fill('#sgSell', '-60'); pg.wait_for_timeout(200)
    prev = pg.inner_text('#sgPrev')
    exp = pg.evaluate(EXP, [-2, -60]); cnt = {k: list(exp.values()).count(k) for k in ('hold', 'reinforce', 'convert')}
    check('live preview counts the coins in each Signal', f"Hold: above −2% — {cnt['hold']}" in prev and f"below −60% — {cnt['convert']}" in prev, (prev, cnt))
    pg.screenshot(path=str(SH / 'signal-edit.png'))
    # invalid
    pg.fill('#sgSell', '-1'); pg.wait_for_timeout(150)
    check('Sell must be lower than Reinforce: Save disabled + message', pg.is_disabled('#sgSave') and 'further below' in pg.inner_text('#sgPrev'))
    pg.fill('#sgSell', '-60'); pg.click('#sgSave'); pg.wait_for_timeout(1200)
    check('saved; editor closes', not pg.is_visible('#sgModal .bl-card') and pg.evaluate("[Samsam.getSignalRules().reinforce, Samsam.getSignalRules().sell]") == [-2, -60])
    check('every coin follows the new thresholds', pg.evaluate(SHOWN) == exp)
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
    shown_badges = pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card')].map(c => [c.querySelector('.ast-sym').textContent.replace('↗','').replace('📝','').trim(), c.querySelector('.action-badge').className.match(/action-(hold|reinforce|convert)/)[1]])")
    check('cards show them', all(exp[s] == a for s, a in shown_badges), [x for x in shown_badges if exp[x[0]] != x[1]][:4])
    # Signal filter uses them
    pg.evaluate("document.getElementById('filterAction').value = 'reinforce'; renderTableAndStack()"); pg.wait_for_timeout(300)
    n_re = pg.locator('#coinsStack .coin-card').count()
    check('Reinforce filter uses the new thresholds', n_re == cnt['reinforce'], (n_re, cnt))
    pg.evaluate("document.getElementById('filterAction').value = ''; renderTableAndStack()")
    # hint shows the numbers
    pg.locator('#coinsStack .coin-card .cp-hint[data-hint="signal"]').first.click(); pg.wait_for_timeout(300)
    h = pg.inner_text('.cph')
    check('ⓘ explains the current thresholds (+ button to change them)', 'above −2%' in h and 'below −60%' in h and 'Your own thresholds' in h and 'Change the thresholds' in h, h[:200])
    pg.get_by_text('Change the thresholds').click(); pg.wait_for_timeout(300)
    check('…which opens the editor', pg.is_visible('#sgModal .bl-card') and not pg.query_selector('.cph')); pg.evaluate("closeSignalEdit()")
    # second device follows live
    d2.wait_for_timeout(1500)
    check('another device follows live (table badges)', d2.evaluate(SHOWN) == d2.evaluate(EXP, [-2, -60]))
    d2.evaluate("applyView('table')"); d2.wait_for_timeout(300)
    d2.click('#portfolioTable th .sg-edit'); d2.wait_for_timeout(300)
    check('table header ✏️ next to Signal opens the editor there (no sorting)', d2.is_visible('#sgModal .bl-card') and d2.input_value('#sgReinforce') == '2')
    d2.click('#sgReset'); d2.click('#sgSave'); d2.wait_for_timeout(1200)
    pg.wait_for_timeout(1500)
    check('defaults restored (on both devices)', pg.evaluate("Samsam.getSignalRules().isDefault") and pg.evaluate(SHOWN) == pg.evaluate(EXP, [-5, -20]))
    pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(600)
    check('after a reload: still the defaults', pg.evaluate("[Samsam.getSignalRules().reinforce, Samsam.getSignalRules().sell]") == [-5, -20])
    check('no page errors', not errs, errs)
    br.close()
print(f'signal_test: {sum(res)}/{len(res)} passed')
