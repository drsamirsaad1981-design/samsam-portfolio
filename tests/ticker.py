import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
        pg.wait_for_timeout(2500)
        info = pg.evaluate("""() => {
          const cards = [...document.querySelectorAll('.header-stats .stat-card')].filter(c => c.offsetParent);
          const rects = cards.map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
          const tk = document.getElementById('btcTicker'), tr = document.getElementById('btcTickerTrack');
          const cs = getComputedStyle(tk);
          return { labels: cards.map(c => c.querySelector('.stat-label').innerText.trim()), rects,
            pnl: document.getElementById('totalPnlCard').innerText, pnlSub: document.getElementById('totalPnlSub').innerText,
            tickerText: tr.innerText, anim: getComputedStyle(tr).animationName, radius: cs.borderRadius, bg: cs.backgroundColor,
            tickerBelowCards: tk.getBoundingClientRect().top > Math.max(...cards.map(c => c.getBoundingClientRect().bottom)) - 1,
            pulse: !!tr.querySelector('.ss-live.ss-pulse[data-state=ok]'),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            oldCards: !!document.getElementById('btcPriceDisplay') || /Altcoins USD/i.test(document.body.innerText) };
        }""")
        check(f'{name}: card order', info['labels'] == ['Total Portfolio', 'All Time Profit', 'BTC Accumulated', 'Altcoins Accumulated'], info['labels'])
        if name == 'mobile':
            r = info['rects']; check('mobile: 2x2 grid', r[0][1] == r[1][1] and r[2][1] == r[3][1] and r[2][1] > r[0][1] and r[0][0] == r[2][0], r)
        else:
            r = info['rects']; check('desktop: one row of 4', len({y for _, y in r}) == 1, r)
        check(f'{name}: BTC price card + old label removed', not info['oldCards'])
        check(f'{name}: P&L format +$X (+X.XX%)', info['pnl'][0] in '+-' and info['pnl'][1] == '$' and info['pnlSub'].startswith('(') and '%)' in info['pnlSub'], (info['pnl'], info['pnlSub']))
        check(f'{name}: ticker shows live, price, 24h change — no High / Low', all(k in info['tickerText'] for k in ('Live', 'BTC / USD', '$100,000', '+2.45%')) and 'High' not in info['tickerText'] and 'Low ' not in info['tickerText'], info['tickerText'][:200])
        check(f'{name}: ticker animates (or holds still when it fits), under cards, 8px radius, soft background', (info['anim'] == 'btcTickerScroll' or pg.evaluate("document.getElementById('btcTicker').classList.contains('static')")) and info['tickerBelowCards'] and info['radius'] == '8px' and info['bg'] == 'rgba(255, 255, 255, 0.03)', (info['anim'], info['radius'], info['bg']))
        check(f'{name}: pulsing green Live dot', info['pulse'])
        check(f'{name}: no horizontal overflow', not info['overflow'])
        # P&L matches the Performance page's Total P&L
        main_pnl = pg.evaluate("document.getElementById('totalPnlCard').innerText")
        pf = ctx.new_page(); pf.goto(SITE + '/performance.html'); pf.wait_for_timeout(2500)
        perf = pf.evaluate("document.getElementById('totalPnl').innerText")
        norm = lambda t: round(float(t.replace('$', '').replace(',', '').replace('+', '')))
        check(f'{name}: Total P&L equals Performance page ({main_pnl} vs {perf})', abs(norm(main_pnl) - norm(perf)) <= 1)
        pf.close()
        pg.evaluate("window.scrollTo(0,0)")
        pg.screenshot(path=str(T / f'cards-{name}-dark.png'), clip={'x': 0, 'y': 0, 'width': vp['viewport']['width'], 'height': 620 if name == 'mobile' else 360})
        pg.click('header [data-theme-toggle]'); pg.wait_for_timeout(300)
        pg.screenshot(path=str(T / f'cards-{name}-light.png'), clip={'x': 0, 'y': 0, 'width': vp['viewport']['width'], 'height': 620 if name == 'mobile' else 360})
        pg.click('header [data-theme-toggle]')
        check(f'{name}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
