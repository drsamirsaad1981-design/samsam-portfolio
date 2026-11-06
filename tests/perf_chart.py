import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
EXP = """r => { const all = Samsam.getState().perfSnaps; const ms = {'24h':864e5,'7d':6048e5,'all':Infinity}[r];
  const s = all.filter(x => r==='all' || x.t >= Date.now()-ms); const st = Samsam.getState(), bl = Samsam.getBaseline();
  /* cumulative: legend = All Time Profit % (the card) and BTC trend since the baseline, whatever the range */
  const live = { t: Date.now(), v: st.portfolio.reduce((a, c) => a + c.qty * (c.currentPrice || 0), 0), b: st.btcPrice };
  const ser = Samsam.core.perfChartSeries(all.concat([live]), st.coins, st.transactions, { baselineBtc: bl.btcPrice });
  return [s.length, allTimeData.pct, ser.btc[ser.btc.length - 1].v]; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000)
        pg.goto(SITE + '/performance.html'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000); pg.wait_for_timeout(900)
        g = pg.evaluate("""() => { const card = document.getElementById('perfChartCard').getBoundingClientRect(); const c = document.getElementById('perfFullCanvas').getBoundingClientRect();
          const grid = document.querySelector('.summary-cards').getBoundingClientRect();
          return { cardW: card.width, gridW: grid.width, cW: c.width, cH: c.height, cR: c.right, cardR: card.right, docW: document.documentElement.scrollWidth, vw: innerWidth }; }""")
        check(f'{name}: chart card spans full grid width', abs(g['cardW'] - g['gridW']) < 2, g)
        check(f'{name}: canvas fills card without overflow', g['cW'] > g['cardW'] - 50 and g['cR'] <= g['cardR'] + 1, g)
        check(f'{name}: no horizontal page scroll', g['docW'] <= g['vw'], g)
        check(f'{name}: responsive height', (g['cH'] >= 300) if name == 'desktop' else (200 <= g['cH'] <= 240), g['cH'])
        for r in ('all', '7d', '24h'):
            pg.click(f'.pcc-tabs button[data-r="{r}"]'); pg.wait_for_timeout(150)
            n, ev, eb = pg.evaluate(EXP, r)
            got = pg.evaluate("[document.getElementById('pccPort').textContent, document.getElementById('pccBtc').textContent, document.querySelector('.pcc-tabs button[aria-pressed=\"true\"]').dataset.r]")
            want = [('▲ ' if ev >= 0 else '▼ ') + f'{abs(ev):.2f}%', ('▲ ' if eb >= 0 else '▼ ') + f'{abs(eb):.2f}%', r]
            check(f'{name}: {r} legend matches same % maths as main card ({n} pts)', got == want, (got, want))
            if r == 'all': pg.screenshot(path=str(SH / f'perf_full_{name}.png'), full_page=False, clip=None) if False else pg.locator('#perfChartCard').screenshot(path=str(SH / f'perf_full_{name}.png'))
        pg.evaluate("SamsamUI.toggleTheme()"); pg.wait_for_timeout(300)   # inner pages have no theme button now (it lives on the main page)
        pg.locator('#perfChartCard').screenshot(path=str(SH / f'perf_full_{name}_theme2.png'))
        # Same snapshots as the main page card
        idx = ctx.new_page(); idx.goto(SITE + '/index.html'); idx.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000)
        same = idx.evaluate("JSON.stringify(Samsam.getState().perfSnaps.slice(-3))") == pg.evaluate("JSON.stringify(Samsam.getState().perfSnaps.slice(-3))")
        check(f'{name}: theme switched to light', pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'light')
        check(f'{name}: identical data source to main page', same)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
