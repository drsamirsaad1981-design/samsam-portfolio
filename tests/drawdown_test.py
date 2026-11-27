"""📉 Performance → Portfolio vs BTC: "Max drawdown" under the chart — the deepest fall from a peak in the period shown,
your line beside the same money in BTC (samsam-core.js → maxDrawdown, on the chart's own profit-% lines read as "what a
dollar of cost became"). Checked against a plain Python calculation of the same lines; ranges, Altcoins only, a line
switched off, the hint, Arabic, phone and desktop."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
# the lines the page draws for a range (the same calls as drawPerfFull), as plain numbers
LINES = """r => { const st = Samsam.getState(), bl = Samsam.getBaseline(), all = st.perfSnaps, ms = {'24h':864e5,'7d':6048e5,'30d':2592e6,'90d':7776e6,'all':Infinity}[r];
  const live = { t: Date.now(), v: st.portfolio.reduce((a, c) => a + c.qty * (c.currentPrice || 0), 0), b: st.btcPrice };
  const pts = live.v > 0 && live.b > 0 && live.t > all[all.length - 1].t ? all.concat([live]) : all;
  const full = SamsamCoins.trendSeries(pts, st, { baselineBtc: bl.btcPrice, redraw: () => {} }).full, t0 = r === 'all' ? 0 : (all.filter(x => x.t >= Date.now() - ms)[0] || all[all.length - 1]).t;
  return { port: full.port.filter(p => p.t >= t0).map(p => [p.t, p.v]), btc: full.btc.filter(p => p.t >= t0).map(p => [p.t, p.v]) }; }"""
def dd(line):   # the deepest fall of 1 + v/100 from its running peak, in percent
    peak, best = None, 0.0
    for _, v in line:
        idx = max(1 + v / 100, 1e-9); peak = idx if peak is None or idx > peak else peak; best = max(best, (1 - idx / peak) * 100)
    return best
txt = lambda v: '0%' if v < 0.05 else f'−{v:.1f}%'
READ = "(()=>{const b=document.getElementById('pccDd');return b.hidden?null:{t:b.querySelector('.pcc-dd-t').textContent.trim(), rows:[...b.querySelectorAll('[data-dd]')].map(x=>[x.dataset.dd, x.firstElementChild.textContent, x.querySelector('b').textContent]), note:b.querySelector('small').innerText.replace(/\\s+/g,' ').trim()}})()"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000)
        pg.evaluate("try{localStorage.removeItem('samsam_trend_lines');localStorage.removeItem('samsam_perf_scope')}catch(e){}")
        pg.goto(S.SITE + '/performance.html'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000); pg.wait_for_timeout(1200)
        for r in ('all', '30d', '7d'):
            pg.click(f'#perfChartCard .pcc-tabs button[data-r="{r}"]'); pg.wait_for_timeout(250)
            L = pg.evaluate(LINES, r); got = pg.evaluate(READ); wp, wb = dd(L['port']), dd(L['btc'])
            rows = {x[0]: x for x in (got or {}).get('rows', [])}
            check(f'{name} {r}: "Max drawdown" — your portfolio {txt(wp)} beside BTC Trend {txt(wb)} (a plain calculation of the same lines)', got and got['t'] == 'Max drawdown' and rows.get('port', [0, '', ''])[1:] == ['Your portfolio', txt(wp)] and rows.get('btc', [0, '', ''])[1:] == ['BTC Trend', txt(wb)], (got, wp, wb))
            ok_note = ('Never under its peak in this period' in got['note']) if wp < 0.05 else bool(re.search(r'^Your deepest fall: from \d{1,2} [A-Z][a-z]{2} 20\d\d to \d{1,2} [A-Z][a-z]{2} 20\d\d$', got['note']))
            check(f'{name} {r}: under it, when the deepest fall ran (or that it never fell)', ok_note, got['note'])
        pg.click('#perfChartCard .pcc-tabs button[data-r="all"]'); pg.wait_for_timeout(250)
        check(f'{name}: a drawdown is never above 100% and never a rise', all(re.match(r'^(0%|−\d{1,2}\.\d%|−100\.0%)$', x[2]) for x in pg.evaluate(READ)['rows']), pg.evaluate(READ)['rows'])
        box = pg.evaluate("(()=>{const b=document.getElementById('pccDd').getBoundingClientRect(),c=document.getElementById('perfChartCard').getBoundingClientRect(),l=document.querySelector('.pcc-legend').getBoundingClientRect();return [b.left>=c.left-1&&b.right<=c.right+1, b.top>=l.bottom-1, document.documentElement.scrollWidth-innerWidth]})()")
        check(f'{name}: it sits inside the chart card, under the legend, nothing sideways', box[0] and box[1] and box[2] <= 0, box)
        # the BTC line switched off: its number goes with it; back on: it returns
        pg.click('#perfChartCard [data-tl="btc"]'); pg.wait_for_timeout(250)
        check(f'{name}: BTC Trend switched off → only your portfolio\'s number', [x[0] for x in pg.evaluate(READ)['rows']] == ['port'])
        pg.click('#perfChartCard [data-tl="btc"]'); pg.wait_for_timeout(250)
        check(f'{name}: …and back', [x[0] for x in pg.evaluate(READ)['rows']][:2] == ['port', 'btc'])
        # Altcoins only: the blue line is the altcoins' — so is the number, and its name
        pg.click('#perfChartCard [data-sc="alt"]'); pg.wait_for_timeout(400); a = pg.evaluate(READ)
        check(f'{name}: Altcoins only → the number is the altcoins\' line\'s, named "Altcoins"', a and a['rows'][0][1] == 'Altcoins' and re.match(r'^(0%|−\d{1,3}\.\d%)$', a['rows'][0][2]), a)
        pg.click('#perfChartCard [data-sc="all"]'); pg.wait_for_timeout(300)
        # the hint
        pg.click('#pccDd .cp-hint'); pg.wait_for_timeout(400); h = pg.inner_text('body')
        check(f'{name}: the hint says how it is measured and that it describes the past', 'the largest (peak − later low) ÷ peak' in h and 'is not counted as a rise or a fall' in h and 'it does not say what will' in h)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        # Arabic
        pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); pg.wait_for_function("Samsam.isReady() && Samsam.getState().perfSnaps.length > 100", timeout=10000); pg.wait_for_timeout(1500)
        ar = ''.join(c for c in pg.inner_text('#pccDd') if not '⁦' <= c <= '⁩'); left = re.findall(r'[A-Za-z]{3,}', ar)
        check(f'{name}: Arabic — "أقصى تراجع", "محفظتك", "اتجاه البيتكوين", no English left', 'أقصى تراجع' in ar and 'محفظتك' in ar and 'اتجاه البيتكوين' in ar and not left, (ar, left))
        pg.evaluate("localStorage.setItem('cp-lang','en')")
        check(f'{name}: no page errors', not errs, errs); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
