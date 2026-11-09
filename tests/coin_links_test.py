"""Holdings and Performance lists: every coin has two arrows — › opens its transactions, ⌄ shows Liq.Map / Prediction / CMC
(the same links as the coin page; a coin without futures / CoinCodex page gets a plain note), and it stays open across price
refreshes. A search box filters by symbol or name."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
LINKS = "(id=>[...document.querySelectorAll('#'+id+' .ql')].map(a=>[a.textContent.trim(), a.getAttribute('href')||'', a.target||'']))"
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('dark', 'light'):
            tag = f'{vn}/{theme}'
            ctx = br.new_context(**vp); S.setup(ctx); ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
            # ── Holdings ──
            pg.evaluate("openHoldingsView()"); pg.wait_for_selector('#hovAssetList .hov-asset-row'); pg.wait_for_timeout(300)
            n = pg.locator('#hovAssetList .hov-asset-row').count()
            check(f'{tag} Holdings: every coin has › and ⌄ ({n})', n > 5 and pg.locator('#hovAssetList .hov-go').count() == n and pg.locator('#hovAssetList .hov-more').count() == n)
            pg.click('#hovAssetList .hov-asset-row[data-sym="BTC"] .hov-more'); pg.wait_for_timeout(200)
            L = pg.evaluate(LINKS, 'hovLinks-BTC')
            check(f'{tag} Holdings: ⌄ BTC → Liq.Map, Prediction, CMC (new tab) {[x[0] for x in L]}', [x[0] for x in L] == ['Liq.Map', 'Prediction', 'CMC'] and 'coinglass.com' in L[0][1] and 'coincodex.com' in L[1][1] and 'coinmarketcap.com' in L[2][1] and all(x[2] == '_blank' for x in L), L)
            check(f'{tag} Holdings: the arrow turns, aria-expanded', pg.get_attribute('#hovAssetList .hov-asset-row[data-sym="BTC"] .hov-more', 'aria-expanded') == 'true')
            if theme == 'dark': pg.screenshot(path=str(SH / f'coin_links_holdings_{vn}.png'))
            pg.evaluate("Samsam.updatePrices({BTC:{usd:Samsam.getState().btcPrice*1.001,ch24:1}})"); pg.wait_for_timeout(600)
            check(f'{tag} Holdings: stays open after a price refresh', pg.is_visible('#hovLinks-BTC'))
            pg.click('#hovAssetList .hov-asset-row[data-sym="BTC"] .hov-more'); pg.wait_for_timeout(150)
            check(f'{tag} Holdings: ⌄ again closes it', not pg.is_visible('#hovLinks-BTC'))
            pg.fill('#hovQ', 'sol'); pg.wait_for_timeout(250)
            syms = pg.evaluate("[...document.querySelectorAll('#hovAssetList .hov-asset-row')].map(r=>r.dataset.sym)")
            check(f'{tag} Holdings: search "sol" → {syms}', syms and all('SOL' in s or 'SOL' in pg.evaluate(f"(COIN_NAMES['{s}']||'').toUpperCase()") for s in syms), syms)
            pg.fill('#hovQ', 'zzqq'); pg.wait_for_timeout(250)
            check(f'{tag} Holdings: no match → a short note', 'No coin matches' in pg.inner_text('#hovAssetList'))
            pg.fill('#hovQ', ''); pg.wait_for_timeout(250)
            pg.click('#hovAssetList .hov-asset-row[data-sym="BTC"] .hov-go'); pg.wait_for_timeout(500)
            check(f'{tag} Holdings: › opens BTC transactions', pg.evaluate("typeof coinTxSym!=='undefined' && coinTxSym") == 'BTC' and pg.is_visible('#htxList'))
            pg.evaluate("closeHoldingsView()")
            # ── Performance (the page on its own) ──
            pg.goto(S.SITE + '/performance.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_selector('#coinList .coin-row'); pg.wait_for_timeout(600)
            n = pg.locator('#coinList .coin-row').count()
            check(f'{tag} Performance: every coin has › and ⌄ ({n})', n > 5 and pg.locator('#coinList .c-go').count() == n and pg.locator('#coinList .c-more').count() == n)
            sym = pg.evaluate("document.querySelector('#coinList .c-more').getAttribute('aria-controls').replace('perfLinks-','')")
            pg.locator('#coinList .c-more').first.click(); pg.wait_for_timeout(200)
            L = pg.evaluate(LINKS, f'perfLinks-{sym}')
            check(f'{tag} Performance: ⌄ {sym} → 3 links {[x[0] for x in L]}', len(L) == 3 and L[0][0] in ('Liq.Map', 'No futures') and L[1][0] in ('Prediction', 'No prediction') and L[2][0] in ('CMC', 'CoinGecko'), L)
            box = pg.locator(f'#perfLinks-{sym}').bounding_box(); row = pg.locator('#coinList .coin-row').first.bounding_box()
            check(f'{tag} Performance: the links sit inside the coin row, full width', box and row and box['y'] >= row['y'] and box['y'] + box['height'] <= row['y'] + row['height'] + 1 and box['width'] > row['width'] * 0.8, (box, row))
            if theme == 'dark': pg.screenshot(path=str(SH / f'coin_links_perf_{vn}.png'))
            pg.fill('#perfQ', 'btc'); pg.wait_for_timeout(250)
            ps = pg.evaluate("[...document.querySelectorAll('#coinList .c-more')].map(b=>b.getAttribute('aria-controls').replace('perfLinks-',''))")
            check(f'{tag} Performance: search "btc" → {ps}', 'BTC' in ps and len(ps) < n, ps)
            hdr = pg.evaluate("[...document.querySelectorAll('.col-header-inner > span')].length")
            check(f'{tag} Performance: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
            pg.click('#coinList .coin-row .c-go'); pg.wait_for_timeout(1500)
            check(f'{tag} Performance: › opens the coin\'s transactions', 'holdings/BTC' in pg.url or pg.evaluate("typeof coinTxSym!=='undefined' && coinTxSym") == 'BTC', pg.url)
            check(f'{tag}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
