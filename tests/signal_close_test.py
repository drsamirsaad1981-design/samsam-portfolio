"""⏳ Signals are decided on the daily close (p/close.json), not the live price: a wick below −20% for a moment leaves
the Signal as it was and only marks it "pending ⏳" (badge, tooltip, the coin's page) — in English and Arabic; when the
close itself is below −20% the Signal is Sell / Convert. Without a close file the live price decides (as before)."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx)
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        close = {'p': {}}
        ctx.route(re.compile(r'.*/prices/p/close\.json.*'), lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'day': '2099-01-01', 't': 0, **close})))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        avg = pg.evaluate("portfolio.find(c => c.sym === 'SOL').basePrice"); live0 = pg.evaluate("portfolio.find(c => c.sym === 'SOL').currentPrice")
        badge = lambda: pg.evaluate("(() => { const r = [...document.querySelectorAll('#tableBody tr')].find(t => /\\bSOL\\b/.test(t.innerText)); const b = r && r.querySelector('.action-badge'); return b ? { t: b.innerText.trim(), cls: b.className, title: b.getAttribute('title') || '' } : null; })()")
        if lang == 'en':
            check('no close for the coin yet → the live price decides (as before)', pg.evaluate("signalInfo(portfolio.find(c => c.sym === 'SOL')).onClose") is False)
        # the close: right at your average (Hold); the live price dips 25% under it (a wick)
        close['p'] = {'solana': avg}; pg.evaluate("localStorage.removeItem('samsam_close'); SamsamMarket._closeP = null; loadCloses()"); pg.wait_for_timeout(800)
        pg.evaluate(f"Samsam.updatePrices({{ SOL: {{ usd: {avg * 0.75}, ch24: -20 }} }})"); pg.wait_for_timeout(800)
        b = badge(); hold = 'Hold' if lang == 'en' else 'احتفاظ'
        check(f'{lang}: a 25% wick under the average → the Signal stays Hold (decided on the close), marked ⏳', b and hold in b['t'] and '⏳' in b['t'] and 'sig-pend' in b['cls'], b)
        check(f'{lang}: …its tooltip says what the live price says and when it is confirmed', b and (('Sell / Convert' in b['title'] and 'daily close' in b['title']) if lang == 'en' else ('بيع / تحويل' in b['title'] and 'قفلة اليوم' in b['title'])), b and b['title'])
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(1200)
        t = pg.inner_text('#htxSignal')
        check(f"{lang}: the coin's page: the close's % and a pending line", (('Pending' in t and 'daily close' in t) if lang == 'en' else ('قيد التأكيد' in t and 'قفلة اليوم' in t)) and ('+0.0%' in t or '0.0%' in t), t)
        if lang == 'ar': check('ar: no English left in the coin\'s signal line', not re.search(r'\b[a-z]{3,}\b', t.replace('BTC', '')), t)
        pg.evaluate("hovBack()"); pg.wait_for_timeout(300)
        # the close itself is 25% under → Sell / Convert, confirmed (no ⏳ when the live price agrees)
        close['p'] = {'solana': avg * 0.75}; pg.evaluate("localStorage.removeItem('samsam_close'); SamsamMarket._closeP = null; loadCloses()"); pg.wait_for_timeout(1000)
        b = badge(); sell = 'Sell' if lang == 'en' else 'بيع'
        check(f'{lang}: the close 25% under → Sell / Convert, no ⏳', b and sell in b['t'] and '⏳' not in b['t'], b)
        check(f'{lang}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
