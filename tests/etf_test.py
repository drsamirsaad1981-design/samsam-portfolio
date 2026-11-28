"""Market Hub · ETF Flows: hidden until GitHub has the data; BTC | ETH switch (remembered), last day, 7 / 30 days and
since launch, 30 bars with a tap card, the biggest fund moves; light + dark, phone + computer."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
FIX = (pathlib.Path(__file__).parent / 'etf_fixture.json').read_text(); E = json.loads(FIX)
# the closed card's small bars: each bar's day, side, colour, height, whether it stands above the zero line, its x; the line under them
MINI = r"(()=>{const z=document.querySelector('#etfMini .z'),zt=z?z.getBoundingClientRect().top:0,pr=c=>{const p=document.createElement('i');p.style.color='var('+c+')';document.body.append(p);const v=getComputedStyle(p).color;p.remove();return v};return {shown:!etfFold.hidden&&etfFold.getClientRects().length>0,dir:getComputedStyle(etfMini).direction,mh:Math.round(etfMini.getBoundingClientRect().height),label:etfMini.getAttribute('aria-label'),l7:etfMl7.innerText.replace(/[\u2066-\u2069\u200e\u200f]/g,'').replace(/\s+/g,' ').trim(),ln:etfMlN.innerText.replace(/[\u2066-\u2069\u200e\u200f]/g,'').trim(),green:pr('--green'),red:pr('--red'),sum:etfSum.innerText,h:Math.round(etfCard.getBoundingClientRect().height),bars:[...document.querySelectorAll('#etfMini .b')].map(b=>{const i=b.firstElementChild,r=i.getBoundingClientRect();return [b.dataset.d,b.dataset.s,getComputedStyle(i).backgroundColor,Math.round(r.height*10)/10,r.bottom<=zt+.6,Math.round(b.getBoundingClientRect().left)]})}})()"
def mini_ok(m, days):
    # 14 bars, oldest on the left; money in = green above the line, money out = red under it; the biggest day is the tallest bar
    d = days[-14:]; b = m['bars']
    if not m['shown'] or len(b) != len(d): return False
    big = max(range(len(d)), key=lambda i: abs(d[i][1]))
    return ([x[0] for x in b] == [r[0] for r in d] and all(b[i][5] < b[i + 1][5] for i in range(len(b) - 1)) and m['dir'] == 'ltr' and m['mh'] == 28
            and all((x[1], x[2], x[4]) == (('in', m['green'], True) if r[1] > 0 else ('out', m['red'], False)) for x, r in zip(b, d) if r[1])
            and b[big][3] == max(x[3] for x in b) and m['green'] != m['red'])
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
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');if(!sessionStorage.getItem('e')){{localStorage.removeItem('samsam_mkt_etf');localStorage.removeItem('samsam_mkt_etfa');localStorage.removeItem('samsam_mkt_etf_open');sessionStorage.setItem('e','1')}}}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.goto(S.SITE + '/market.html'); pg.wait_for_function("!document.getElementById('etfCard').hidden"); pg.wait_for_timeout(400)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            last = E['btc']['days'][-1]
            cl = pg.evaluate("({body: document.getElementById('etfBody').hidden, exp: etfTog.getAttribute('aria-expanded'), sum: etfSum.innerText, seg: getComputedStyle(etfSeg).display, h: Math.round(etfCard.getBoundingClientRect().height)})")
            check(f'{vn}/{theme}: closed by default — title + BTC last day, no BTC / ETH switch {cl}', cl['body'] and cl['exp'] == 'false' and cl['sum'].startswith('BTC ') and cl['seg'] == 'none', cl)
            m = pg.evaluate(MINI); w7 = sum(r[1] for r in E['btc']['days'][-5:]); sign = lambda v: ('+' if v > 0 else '−') + '$'
            check(f'{vn}/{theme}: closed — 14 small bars of BTC\'s last trading days: in = green above the line, out = red under it, oldest on the left, the biggest day the tallest', mini_ok(m, E['btc']['days']), m)
            check(f'{vn}/{theme}: …under them "Last 7 days" with the same sum as the open card and "14 trading days" on the other side; the card is no longer one thin line ({m["h"]} px)', m['l7'].startswith('Last 7 days') and sign(w7) in m['l7'] and m['ln'] == '14 trading days' and 90 <= m['h'] <= 135 and m['label'].startswith('BTC ETF daily net flows, last 14 trading days'), [m['l7'], m['ln'], m['h'], m['label']])
            pg.click('#etfTog'); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: tap the title → opens, and the small bars give way to the chart (one at a time)', not pg.evaluate("document.getElementById('etfBody').hidden") and pg.get_attribute('#etfTog', 'aria-expanded') == 'true' and pg.is_visible('#etfSeg') and not pg.is_visible('#etfFold') and pg.is_visible('#etfBars'))
            st7 = pg.evaluate("etfStats.querySelector('b').textContent")
            check(f'{vn}/{theme}: …the open card\'s "Last 7 days" is the number the closed line showed', st7 and st7 in m['l7'], [st7, m['l7']])
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
            check(f'{vn}/{theme}: stays open next time', not pg.evaluate("document.getElementById('etfBody').hidden"))
            check(f'{vn}/{theme}: ETH remembered next time', pg.evaluate("document.querySelector('#etfSeg .on').dataset.a") == 'eth')
            pg.click('#etfTog'); pg.wait_for_timeout(250); m = pg.evaluate(MINI); we = sum(r[1] for r in E['eth']['days'][-5:])
            check(f'{vn}/{theme}: closed with ETH chosen — the header, the bars and the 7-day sum are ETH\'s', m['sum'].startswith('ETH ') and mini_ok(m, E['eth']['days']) and sign(we) in m['l7'] and m['label'].startswith('ETH ETF'), m)
            if theme == 'dark':
                pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); pg.wait_for_function("!document.getElementById('etfCard').hidden"); pg.wait_for_timeout(900); m = pg.evaluate(MINI)
                check(f'{vn}/{theme}: Arabic — the bars still run oldest → newest from the left; "آخر 7 أيام" and "14 يوم تداول" under them', mini_ok(m, E['eth']['days']) and m['l7'].startswith('آخر 7 أيام') and sign(we) in m['l7'] and m['ln'] == '14 يوم تداول', [m['l7'], m['ln'], m['dir']])
                # (the chevron, not the button's centre: in Arabic the title wraps and with another font the centre can be the ⓘ, which opens its hint instead — that failed on GitHub and passed here)
                pg.click('#etfTog .mk-etf-chev'); pg.wait_for_function("!document.getElementById('etfBody').hidden", timeout=5000); pg.wait_for_timeout(250); xs = pg.evaluate("[...document.querySelectorAll('#etfBars .b')].map(b=>b.getBoundingClientRect().left)")
                check(f'{vn}/{theme}: Arabic — the chart inside runs the same way (oldest on the left)', len(xs) > 5 and all(xs[i] < xs[i + 1] for i in range(len(xs) - 1)), xs[:4])
                pg.evaluate("localStorage.setItem('cp-lang','en')")
            check(f'{vn}/{theme}: no sideways scrolling', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
