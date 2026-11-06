"""Market Hub · ETF Flows: hidden until GitHub has the data; BTC | ETH switch (remembered), last day, 7 / 30 days and
since launch, 30 bars with a tap card, the biggest fund moves; light + dark, phone + computer."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
FIX = (pathlib.Path(__file__).parent / 'etf_fixture.json').read_text(); E = json.loads(FIX)
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    # no file yet → no card
    ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx); ctx.route('**/prices/m/etf.json', lambda r: r.fulfill(status=404, body='nope'))
    pg = ctx.new_page(); pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(2500)
    check('no ETF data yet → no card', pg.evaluate("document.getElementById('etfCard').hidden")); ctx.close()
    for vn, vp in (('small', dict(viewport={'width': 360, 'height': 740}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx); ctx.route('**/prices/m/etf.json', lambda r: r.fulfill(status=200, content_type='application/json', body=FIX))
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');if(!sessionStorage.getItem('e')){{localStorage.removeItem('samsam_mkt_etf');localStorage.removeItem('samsam_mkt_etfa');sessionStorage.setItem('e','1')}}}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.goto(S.SITE + '/market.html'); pg.wait_for_function("!document.getElementById('etfCard').hidden"); pg.wait_for_timeout(400)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            last = E['btc']['days'][-1]
            c = pg.evaluate("({net: etfNet.textContent, cls: etfNet.className, day: etfDay.textContent, stats: etfStats.innerText, bars: document.querySelectorAll('#etfBars .b').length, funds: [...document.querySelectorAll('#etfFunds div')].map(d=>d.innerText), on: document.querySelector('#etfSeg .on').dataset.a})")
            want = ('+' if last[1] > 0 else '−') + '$'
            check(f'{vn}/{theme}: BTC first — last day, its date, 7 / 30 days, since launch {c}', c['on'] == 'btc' and c['net'].startswith(want) and ('up' in c['cls']) == (last[1] > 0) and 'Last 7 days' in c['stats'] and 'Since launch' in c['stats'] and c['day'], c)
            check(f'{vn}/{theme}: one bar per trading day (up to 30) and the 4 biggest fund moves', c['bars'] == min(30, len(E['btc']['days'])) and len(c['funds']) == 4, c)
            ae = pg.evaluate("({eth: !altEthEtf.hidden && altEthEtf.innerText, btc: !altBtcEtf.hidden && altBtcEtf.innerText, over: [...document.querySelectorAll('#cardAlt .mk-li')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.innerText)})")
            s7 = lambda k: sum(r[1] for r in E[k]['days'][-5:])
            check(f'{vn}/{theme}: Altcoin Season card shows ETH and BTC ETF money over 7 days, nothing cut {ae}', ae['eth'] and ae['btc'] and 'ETH ETFs' in ae['eth'] and pg.evaluate('!altEtfCap.hidden') and ('−$' if s7('eth') < 0 else '+$') in ae['eth'] and ('−$' if s7('btc') < 0 else '+$') in ae['btc'] and not ae['over'], ae)
            b = pg.locator('#etfBars .b').nth(5); b.scroll_into_view_if_needed()
            if vn != 'desktop': b.tap()
            else: b.hover()
            pg.wait_for_timeout(150)
            t = pg.evaluate("({on: !etfTip.hidden, t: etfTip.innerText})")
            check(f'{vn}/{theme}: a bar shows its day and amount {t}', t['on'] and '$' in t['t'], t)
            pg.screenshot(path=str(SH / f'etf_{vn}_{theme}.png'), clip={**{k: v for k, v in pg.locator('#etfCard').bounding_box().items()}, 'x': 0, 'width': vp['viewport']['width']})
            pg.click('#etfSeg button[data-a=eth]'); pg.wait_for_timeout(200)
            e = pg.evaluate("({net: etfNet.textContent, on: document.querySelector('#etfSeg .on').dataset.a})")
            check(f'{vn}/{theme}: ETH switch {e}', e['on'] == 'eth' and e['net'].startswith(('+' if E['eth']['days'][-1][1] > 0 else '−') + '$'), e)
            pg.reload(); pg.wait_for_function("!document.getElementById('etfCard').hidden")
            check(f'{vn}/{theme}: ETH remembered next time', pg.evaluate("document.querySelector('#etfSeg .on').dataset.a") == 'eth')
            check(f'{vn}/{theme}: no sideways scrolling', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
