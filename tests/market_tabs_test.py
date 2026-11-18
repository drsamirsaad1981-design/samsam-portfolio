"""Market Hub: 🪙 Crypto · 📈 bStocks · 🥇 Metals — the three sections, remembered; bStocks summary, US market hours,
best / worst, the list (search, sort); metals with the gram in SAR; English and Arabic."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SNAP = json.loads((pathlib.Path(__file__).parent / 'market_snap_fixture.json').read_text())
SNAP['stocks'] = [{'id': f'st{i}', 'sym': s, 'name': n + ' bStock', 'img': '', 'price': p, 'ch24': c, 'ch7': c * 2, 'mcap': m, 'spark': [1, 2, 3]} for i, (s, n, p, c, m) in enumerate([
    ('NVDAB', 'NVIDIA', 181.2, 2.4, 9e8), ('TSLAB', 'Tesla', 402.5, -3.1, 7e8), ('CRCLB', 'Circle', 88.0, 6.2, 3e8), ('AAPLB', 'Apple', 230.1, 0.4, 5e8), ('SPYB', 'SPDR S&P 500', 670.0, -0.2, 1.2e9)])]
SNAP['metals'] = [{'k': 'gold', 'sym': 'GC=F', 'unit': 'oz', 'price': 2650.0, 'prev': 2630, 'ch24': 0.76, 'ch7': 1.9, 'spark': [2600, 2620, 2650]},
                  {'k': 'silver', 'sym': 'SI=F', 'unit': 'oz', 'price': 31.2, 'ch24': -0.5, 'ch7': 2.2, 'spark': [30, 31, 31.2]},
                  {'k': 'platinum', 'sym': 'PL=F', 'unit': 'oz', 'price': 960.0, 'ch24': 0.1, 'ch7': -1, 'spark': [950, 960]},
                  {'k': 'copper', 'sym': 'HG=F', 'unit': 'lb', 'price': 4.35, 'ch24': 1.2, 'ch7': 0.5, 'spark': [4.2, 4.35]},
                  {'k': 'brent', 'sym': 'BZ=F', 'unit': 'bbl', 'price': 73.4, 'ch24': -1.4, 'ch7': -3, 'spark': [75, 73.4]}]
SNAP['parts'] = {**SNAP.get('parts', {}), 'stocks': SNAP['updated'], 'metals': SNAP['updated']}
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp, lang in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True), 'en'), ('desktop-ar', dict(viewport={'width': 1366, 'height': 900}), 'ar')):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
        ctx.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, body='busy'))
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg)
        pg.evaluate("localStorage.removeItem('samsam_mk_view')")
        pg.goto(S.SITE + '/market.html'); pg.wait_for_selector('#mkSeg [data-v="stocks"]')
        tabs = pg.inner_text('#mkSeg')
        check(f'{vn}: three sections, Crypto first and open: {tabs!r}', ('Crypto' in tabs or 'كريبتو' in tabs) and 'bStocks' in tabs and ('Metals' in tabs or 'المعادن' in tabs) and pg.is_visible('#vCrypto') and not pg.is_visible('#vStocks'), tabs)
        pg.click('#mkSeg [data-v="stocks"]'); pg.wait_for_selector('#vStocks .as-row')
        t = pg.inner_text('#vStocks')
        check(f'{vn}: bStocks → 5 stocks, market cap, up / down, the US market card (open / closed + the next change in Riyadh time)', pg.locator('#vStocks .as-row').count() == 5 and ('stocks' in t or 'سهماً' in t) and ('US stock market' in t or 'السوق الأمريكي' in t) and ('Riyadh' in t or 'الرياض' in t) and not pg.is_visible('#vCrypto'), t[:300])
        check(f'{vn}: best today = Circle (+6.2%), worst = Tesla (−3.1%)', pg.locator('.as-movers > div').first.inner_text().find('CRCLB') >= 0 and pg.locator('.as-movers > div').nth(1).inner_text().find('TSLAB') >= 0)
        first = lambda: pg.locator('#vStocks .as-row').first.inner_text()
        check(f'{vn}: sorted by market cap: SPY first', 'SPYB' in first(), first())
        pg.click('#vStocks [data-sort="ch24"]'); pg.wait_for_timeout(100)
        check(f'{vn}: sort by 24h → Circle first', 'CRCLB' in first(), first())
        pg.fill('#asQ', 'tes'); pg.wait_for_timeout(150)
        check(f'{vn}: search "tes" → only Tesla', pg.locator('#vStocks .as-row').count() == 1 and 'TSLAB' in first(), pg.locator('#vStocks .as-row').count())
        check(f'{vn}: a stock opens on CoinGecko', 'coingecko.com/en/coins/st1' in pg.get_attribute('#vStocks .as-row', 'href'))
        pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'market_stocks_{vn}.png'), full_page=True)
        pg.click('#mkSeg [data-v="metals"]'); pg.wait_for_selector('#vMetals .as-metal')
        t = pg.inner_text('#vMetals'); pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'market_metals_{vn}.png'), full_page=True)
        gram = round(2650 / 31.1034768 * 3.75, 2)
        fl = pg.evaluate("(() => { const v = SamsamAssets._st.view; SamsamAssets.show('stocks'); const k = document.querySelector('.as-us .as-k'); const r = [!!(k && k.querySelector('svg.as-flag')), !!k && !k.textContent.includes('🇺🇸')]; SamsamAssets.show(v); return r; })()")
        check(f'{vn}: US market card shows a drawn flag (not the emoji, which Windows shows as "US")', fl == [True, True], fl)
        check(f'{vn}: metals → gold, silver, platinum, copper (no oil); gold per gram {gram} SAR; the gold/silver ratio', pg.locator('#vMetals .as-metal').count() == 4 and f'{gram:.2f} SAR' in t and ('84.9' in t) and 'Brent' not in t and 'برنت' not in t, t[:400])
        pg.reload(); pg.wait_for_selector('#vMetals .as-metal')
        check(f'{vn}: the section is remembered (Metals again after a reload)', pg.is_visible('#vMetals') and pg.get_attribute('#mkSeg [data-v="metals"]', 'aria-selected') == 'true')
        pg.goto(S.SITE + '/market.html#stocks'); pg.wait_for_selector('#vStocks .as-row')
        check(f'{vn}: market.html#stocks opens bStocks', pg.is_visible('#vStocks'))
        if lang == 'ar': check(f'{vn}: Arabic, right-to-left', pg.get_attribute('#vStocks', 'dir') == 'rtl' and 'السوق الأمريكي' in pg.inner_text('#vStocks'))
        pg.click('#mkSeg [data-v="crypto"]'); pg.wait_for_timeout(300)
        check(f'{vn}: back to Crypto → the page as it was (Market Cap card, the coin list)', pg.is_visible('#cardMcap') and pg.is_visible('#mkRows'))
        pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'market_tabs_{vn}.png'))
        check(f'{vn}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
