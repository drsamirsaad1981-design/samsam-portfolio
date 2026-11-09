"""Market Hub: Gainers = only rising coins, biggest rise first; Losers = only falling coins, biggest drop first (24h or 7d,
whichever is picked); All = back to rank. Plan page on a wide screen: the DCA and Plan vs target allocation cards keep the
same width as the rest of the page."""
import sys, pathlib, json, re, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
_src = (pathlib.Path(__file__).parent / 'market_test.py').read_text()   # the same made-up CoinGecko data as market_test.py
exec(_src[_src.index('def coin(i):'):_src.index('def tap_links')])
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('desktop', dict(viewport={'width': 1366, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))):
        ctx = br.new_context(**vp); S.setup(ctx); ctx.route('https://api.coingecko.com/api/v3/coins/markets**', markets)
        FIX5 = (pathlib.Path(__file__).parent / 'top500_fixture.json').read_text()
        ctx.route('**/prices/m/top500.json', lambda r: r.fulfill(status=200, content_type='application/json', body=FIX5))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
        pg.goto(S.SITE + '/market.html'); pg.wait_for_function("Samsam.isReady() && typeof rowsNow === 'function' && rowsNow().length > 20", timeout=30000); pg.wait_for_timeout(800)
        for mode, per in (('top', '24h'), ('top', '7d'), ('pf', '24h'), ('pf', '7d')):
            if vn == 'desktop' and per == '7d': continue   # wide screens show both columns; the switch is a phone thing
            pg.evaluate(f"setMode('{mode}')"); pg.wait_for_timeout(1500)
            pg.evaluate(f"setPer('{per}')"); pg.wait_for_timeout(200)
            k = pg.evaluate("chKey()")
            per = mode + ' ' + per
            pg.click('.mk-chip[data-f="lose"]'); pg.wait_for_timeout(300)
            ch = pg.evaluate(f"rowsNow().map(r=>r['{k}'])")
            check(f'{vn} {per}: Losers → only falling, biggest drop first ({len(ch)} coins, {ch[:3]})', ch and all(c < 0 for c in ch) and ch == sorted(ch), ch[:8])
            pg.click('.mk-chip[data-f="gain"]'); pg.wait_for_timeout(300)
            ch = pg.evaluate(f"rowsNow().map(r=>r['{k}'])")
            check(f'{vn} {per}: Gainers → only rising, biggest rise first ({len(ch)} coins, {ch[:3]})', ch and all(c > 0 for c in ch) and ch == sorted(ch, reverse=True), ch[:8])
            pg.click('.mk-chip[data-f="all"]'); pg.wait_for_timeout(300)
            if mode == 'top':
                rk = pg.evaluate("rowsNow().map(r=>r.rank||1e9)")
                check(f'{vn} {per}: All → back to rank order', rk == sorted(rk), rk[:8])
            else:
                vv = pg.evaluate("rowsNow().map(r=>r.val)")
                check(f'{vn} {per}: All → biggest holding first', vv == sorted(vv, reverse=True), vv[:6])
        # switching lists keeps Losers in order (it used to fall back to rank / holding)
        pg.evaluate("setMode('top')"); pg.wait_for_timeout(800); pg.click('.mk-chip[data-f="lose"]'); pg.wait_for_timeout(200)
        pg.evaluate("setMode('pf')"); pg.wait_for_timeout(1500)
        k = pg.evaluate("chKey()"); ch = pg.evaluate(f"rowsNow().map(r=>r['{k}'])")
        check(f'{vn}: Losers, then Portfolio → still biggest drop first {ch[:4]}', ch and all(c < 0 for c in ch) and ch == sorted(ch), ch)
        if vn == 'phone':
            pg.evaluate("setPer('7d')"); pg.wait_for_timeout(300)
            n7 = pg.evaluate("rowsNow().length")
            check(f'{vn}: Portfolio 7d Losers include coins ranked 101–500 (their 7d % comes from the saved list) — {n7} coins', n7 >= 3, n7)
            pg.evaluate("setPer('24h')")
        pg.evaluate("setMode('top')"); pg.click('.mk-chip[data-f="all"]'); pg.wait_for_timeout(300)
        pg.evaluate("setPer('24h')"); pg.click('.mk-chip[data-f="lose"]'); pg.wait_for_timeout(300)
        if vn == 'desktop': pg.screenshot(path=str(SH / 'market_losers.png'))
        pg.click('.mk-chip[data-f="all"]')
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    # Plan page, wide screen
    ctx = br.new_context(viewport={'width': 1910, 'height': 1000}); S.setup(ctx); pg = ctx.new_page()
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
    pg.evaluate("""(async()=>{const plan=Samsam.getState().accumPlan.map(a=>({...a})); if(plan[0]){plan[0].dca={usd:50,every:'week',day:1,since:'2026-10-01'}; await Samsam.saveAccumPlan(plan);}})()"""); pg.wait_for_timeout(800)
    pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    w = pg.evaluate("""['summaryGrid','dcaCard','planAlloc'].map(id=>{const e=document.getElementById(id); if(!e||!e.offsetParent) return null; const r=e.getBoundingClientRect(); return [id, Math.round(r.left), Math.round(r.width)]})""")
    shown = [x for x in w if x]
    check(f'Plan page 1910px: DCA + Plan vs target cards line up with the rest {shown}', len(shown) >= 2 and len({(x[1], x[2]) for x in shown}) == 1 and shown[0][2] <= 1200, shown)
    pg.screenshot(path=str(SH / 'plan_wide.png'))
    ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
