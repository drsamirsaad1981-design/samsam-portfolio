"""ⓘ on the cards that had none: Market Hub (market cap, Fear & Greed, Altcoin Season, dominance, ETF flows), Performance
(profit breakdown, Rewards & mining, Wallets & exchanges), Allocation (Target allocation), Plan (DCA schedule, Plan vs target
allocation), Exit Strategy (macro indicators, cash-out, steps), Overview (the Accumulation Plan card). Each opens the same panel
with its title — and tapping it does nothing else (no page change, the card doesn't open / fold)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def tap(fr, pg, key, title, label):
    el = fr.locator(f'.cp-hint[data-hint="{key}"]').filter(visible=True).first
    if el.count() == 0: check(f'{label}: ⓘ {key} is there', False, 'missing'); return
    url = pg.url
    el.evaluate("b => { b.scrollIntoView({ block: 'center' }); b.click(); }"); pg.wait_for_timeout(300)
    t = fr.evaluate("document.querySelector('.cph h3')?.textContent || ''")
    check(f'{label}: ⓘ {key} opens "{title}" and nothing else happens', title in t and pg.url == url, (t, pg.url))
    fr.evaluate("CPHint.close()"); pg.wait_for_timeout(150)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        cur = pg.evaluate("cpShell.cur")
        tap(pg, pg, 'overallProgress', 'Overall Progress', f'{vn} Overview (Accumulation Plan card)')
        check(f'{vn}: …the card did not open the Plan page', pg.evaluate("cpShell.cur") == cur)
        pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1200)
        tap(pg, pg, 'targets', 'Target allocation', f'{vn} Allocation')
        pg.evaluate("cpShell.go('performance')"); pg.wait_for_timeout(2500)
        fr = [f for f in pg.frames if 'performance.html' in f.url][0]
        for k, t in (('profitBreakdown', 'All Time Profit Breakdown'), ('rewards', 'Rewards & mining'), ('walletsCheck', 'Wallets & exchanges')): tap(fr, pg, k, t, f'{vn} Performance')
        check(f'{vn}: …the Rewards window did not open behind its ⓘ', fr.query_selector('#cpRew') is None)
        pg.evaluate("Samsam.saveExit({ tab: 'accum' })"); pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(2500)
        fa = [f for f in pg.frames if 'accumulation.html' in f.url][0]; fa.evaluate("setPlanTab('accum')"); pg.wait_for_timeout(500)
        was = fa.evaluate("document.getElementById('planAlloc').classList.contains('open')")
        for k, t in (('dca', 'DCA schedule'), ('planAlloc', 'Plan vs target allocation')): tap(fa, pg, k, t, f'{vn} Plan')
        check(f'{vn}: …the Plan vs target card did not fold / unfold', fa.evaluate("document.getElementById('planAlloc').classList.contains('open')") == was)
        fa.evaluate("setPlanTab('exit')"); pg.wait_for_timeout(800)
        for k, t in (('macroExit', 'Macro Exit Indicators'), ('cashOut', 'Cash-out Progress'), ('exitSteps', 'Exit plan steps')): tap(fa, pg, k, t, f'{vn} Exit Strategy')
        fa.evaluate("setPlanTab('accum')")
        pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(2500)
        fm = [f for f in pg.frames if 'market.html' in f.url][0]
        for k, t in (('mcap', 'Total Market Cap'), ('fng', 'Fear & Greed'), ('altSeason', 'Altcoin Season'), ('dominance', 'Market Dominance'), ('etf', 'ETF Flows')): tap(fm, pg, k, t, f'{vn} Market Hub')
        check(f'{vn}: …the Altcoin Season card did not open its page, the ETF card stayed as it was', pg.evaluate("cpShell.cur") == 'market' and fm.get_attribute('#etfTog', 'aria-expanded') == 'false')
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
