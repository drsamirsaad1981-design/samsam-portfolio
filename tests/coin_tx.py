import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)

def pick(pg, host, value_text):
    pg.click(f'#{host} .sdd-btn'); pg.wait_for_timeout(150)
    pg.click(f'.sdd-panel.show .sdd-opt:has(span:text-is("{value_text}"))'); pg.wait_for_timeout(200)
num = lambda t: float(re.sub(r'[^0-9.\-]', '', t.replace('−', '-')) or 0)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('https://coinmarketcap.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body='ok'))
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
        pg.wait_for_timeout(1200); pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(500)
        # name still → CoinGecko; quantity → coin view
        row = '#hovAssetList .hov-asset-row[data-sym="BTC"]'
        with ctx.expect_page() as np_: pg.click(row + " a.ast-sym")
        check(f'{name}: name/symbol opens CoinMarketCap in new tab', np_.value.url == 'https://coinmarketcap.com/currencies/bitcoin/'); np_.value.close()
        pg.click(row + " .hov-asset-holding")
        pg.wait_for_function("document.getElementById('holdingsOverlay').dataset.view === 'tx'", timeout=3000)
        check(f'{name}: quantity opens BTC transactions (#holdings/BTC)', pg.evaluate("location.hash") == '#holdings/BTC')
        d = pg.evaluate("""() => { const c = Samsam.getState().portfolio.find(c => c.sym === 'BTC');
          const g = id => document.getElementById(id).innerText;
          return { qty: c.qty, avg: c.basePrice, price: c.currentPrice, holdings: g('htxHoldings'), h24: g('htxHoldings24'), profit: g('htxProfit'),
            pct: g('htxProfitPct'), avgTxt: g('htxAvg'), cost: g('htxCost'), coin: document.querySelector('#htxCoinDD .sdd-label').innerText,
            list: g('htxList'), tabs: (document.querySelector('.htx-tabs')||{innerText:''}).innerText,
            listHidden: getComputedStyle(document.getElementById('hovAssetList')).display === 'none',
            overflow: document.getElementById('holdingsOverlay').scrollWidth > document.getElementById('holdingsOverlay').clientWidth + 1 }; }""")
        check(f'{name}: no duplicate Back (tab row removed)', 'Back to Holdings' not in d['tabs'], d['tabs'])
        check(f'{name}: Holdings card = value • 24h change, the amount under it', abs(num(d['holdings'].split('•')[0]) - d['qty'] * d['price']) < 0.01 and '•' in d['holdings'] and d['h24'].endswith(' BTC'), (d['holdings'], d['h24']))
        check(f'{name}: Avg Buy Price + Cost Basis correct', abs(num(d['avgTxt']) - d['avg']) < 0.01 and abs(num(d['cost']) - d['qty'] * d['avg']) < 0.01, (d['avgTxt'], d['cost']))
        exp_profit = d['qty'] * d['price'] - d['qty'] * d['avg']
        check(f'{name}: All Time Profit shown as +$X and %', d['profit'][0] in '+-' and '%' in d['pct'], (d['profit'], d['pct']))
        check(f'{name}: opening Buy dated Oct 15, 2026 listed (+0.01304 BTC)', 'Oct 15, 2026' in d['list'] and '+0.01304 BTC' in d['list'], d['list'][:300])
        check(f'{name}: buy and sell transactions listed', 'Sell' in d['list'] and d['list'].count('Buy') >= 2, d['list'][:400])
        check(f'{name}: list view hidden, no overflow', d['listHidden'] and not d['overflow'])
        pg.screenshot(path=str(T / f'cointx-{name}.png'), full_page=False)
        pg.click('#htxCoinDD .sdd-btn'); pg.wait_for_timeout(300); pg.screenshot(path=str(T / f'dd-coin-{name}.png'))
        pg.keyboard.press('Escape') if name == 'desktop' else pg.click('.sdd-panel.show .sdd-close'); pg.wait_for_timeout(200)
        pg.click('#htxTypeDD .sdd-btn'); pg.wait_for_timeout(300); pg.screenshot(path=str(T / f'dd-type-{name}.png'))
        pg.keyboard.press('Escape') if name == 'desktop' else pg.click('.sdd-panel.show .sdd-close'); pg.wait_for_timeout(200)
        # filters
        pick(pg, 'htxTypeDD', 'Sell'); t = pg.inner_text('#htxList')
        check(f'{name}: type filter Sell shows only sells', 'Sell' in t and 'Buy' not in t, t[:200])
        pick(pg, 'htxTypeDD', 'Buy'); t = pg.inner_text('#htxList')
        check(f'{name}: type filter Buy shows only buys', 'Buy' in t and 'Sell' not in t, t[:200])
        pick(pg, 'htxTypeDD', 'Transfer In'); t = pg.inner_text('#htxList')
        check(f'{name}: Transfer In filter shows empty message', 'No Transfer In transactions' in t, t)
        pick(pg, 'htxTypeDD', 'All Types')
        # coin switcher
        # ── custom dropdown: theme, size, search, keyboard ──
        pg.click('#htxCoinDD .sdd-btn'); pg.wait_for_timeout(250)
        dd = pg.evaluate("""() => { const p = document.querySelector('.sdd-panel.show'); const l = p.querySelector('.sdd-list');
          const r = p.getBoundingClientRect();
          return { bg: getComputedStyle(p).backgroundColor, color: getComputedStyle(p).color, sheet: p.classList.contains('sheet'),
            listMax: getComputedStyle(l).maxHeight, scrolls: l.scrollHeight > l.clientHeight, h: Math.round(r.height), bottom: Math.round(innerHeight - r.bottom),
            search: !!p.querySelector('.sdd-search input'), focused: document.activeElement === p.querySelector('.sdd-search input'),
            native: document.querySelectorAll('#hovTxView select').length,
            backdrop: !!document.querySelector('.sdd-backdrop.show') }; }""")
        check(f'{name}: dropdown is the dark card colour (#161339) with light text', dd['bg'] == 'rgb(22, 19, 57)' and dd['color'] == 'rgb(241, 245, 249)', dd)
        check(f'{name}: no native <select> left in Transactions', dd['native'] == 0, dd)
        check(f'{name}: coin list has search box and scrolls', dd['search'] and dd['scrolls'], dd)
        if name == 'mobile':
            check('mobile: opens as dark bottom sheet with backdrop', dd['sheet'] and dd['backdrop'] and dd['bottom'] <= 1, dd)
        else:
            check('desktop: popover capped at 280px list height', not dd['sheet'] and dd['listMax'] == '280px' and dd['h'] <= 360 and dd['focused'], dd)
        pg.fill('.sdd-panel.show .sdd-search input', 'eth')
        found = pg.eval_on_selector_all('.sdd-panel.show .sdd-opt', 'els => els.map(e => e.innerText.split("\\n")[0])')
        check(f'{name}: search "eth" puts ETH first', found and found[0] == 'ETH' and len(found) < 5, found)
        if name == 'desktop':
            pg.keyboard.press('Enter')   # first match chosen by keyboard
        else:
            pg.click('.sdd-panel.show .sdd-opt:has(span:text-is("ETH"))')
        pg.wait_for_timeout(250)
        check(f'{name}: dropdown closes after picking', pg.evaluate("!document.querySelector('.sdd-panel.show')"))
        e = pg.evaluate("[location.hash, document.getElementById('hovNavTitle').innerText, document.getElementById('htxList').innerText]")
        check(f'{name}: coin selector switches to ETH', e[0] == '#holdings/ETH' and 'ETH' in e[1] and 'ETH' in e[2], e)
        # Escape / outside tap closes without changing
        pg.click('#htxTypeDD .sdd-btn'); pg.wait_for_timeout(150)
        if name == 'desktop': pg.keyboard.press('Escape')
        else: pg.mouse.click(195, 120)
        pg.wait_for_timeout(200)
        check(f'{name}: Esc / outside tap closes type menu', pg.evaluate("!document.querySelector('.sdd-panel.show')"))
        if name == 'desktop':
            pg.click('#htxTypeDD .sdd-btn'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('ArrowDown'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
            check('desktop: keyboard ↓↓ Enter picks "Sell"', pg.inner_text('#htxTypeDD .sdd-label') == 'Sell')
            pick(pg, 'htxTypeDD', 'All Types')
        # live update from another device while viewing
        pg.evaluate("Samsam.addTx('ETH','buy',0.25,2000,'from phone')"); pg.wait_for_timeout(800)
        check(f'{name}: new transaction appears live in coin view', 'from phone' in pg.inner_text('#htxList'))
        # refresh restores the coin view
        pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady() && document.getElementById('holdingsOverlay').dataset.view === 'tx'", timeout=10000)
        pg.wait_for_timeout(800)
        check(f'{name}: refresh keeps ETH transactions open', pg.evaluate("location.hash") == '#holdings/ETH' and '+0.25 ETH' in pg.inner_text('#htxList'))
        # back to holdings
        pg.click('.hov-back-btn'); pg.wait_for_timeout(300)
        check(f'{name}: header Back returns to the Holdings list', pg.evaluate("[location.hash, document.getElementById('holdingsOverlay').dataset.view || '', getComputedStyle(document.getElementById('hovAssetList')).display]") == ['#holdings', '', 'block'])
        # browser back from coin view
        pg.click(row + " .hov-asset-holding"); pg.wait_for_timeout(300); pg.go_back(); pg.wait_for_timeout(300)
        check(f'{name}: browser Back from coin view → list', pg.evaluate("location.hash") == '#holdings' and pg.evaluate("document.getElementById('holdingsOverlay').dataset.view || ''") == '')
        pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(300)   # the list's Back is now the Overview tab
        check(f'{name}: Overview tab closes Holdings', pg.evaluate("document.getElementById('holdingsOverlay').style.display") == 'none')
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
