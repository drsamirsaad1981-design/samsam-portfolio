"""📈 ➕ Add → the bStocks tab (four tabs: Coins · bStocks · Metals · Cash & CDs): search Binance's tokenized US shares from
the market snapshot, amount in shares, price per share; saved as a share (cls 'stock', category US Stocks) — so it counts in
the Portfolio total, not in Altcoins, and its Signal is Hold. Arabic too."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'stocks': NOW.isoformat()}, 'stocks': [
    {'id': 'nvidia-bstocks', 'sym': 'NVDAB', 'name': 'NVIDIA (bStocks Tokenized Stock)', 'img': 'https://x/nv.png', 'price': 180, 'mcap': 9e8},
    {'id': 'tesla-bstocks-tokenized-stock', 'sym': 'TSLAB', 'name': 'Tesla (bStocks Tokenized Stock)', 'img': '', 'price': 400, 'mcap': 5e8},
    {'id': 'spy-bstocks-tokenized-stock', 'sym': 'SPYB', 'name': 'SPDR S&P 500 (bStocks Tokenized ETF)', 'img': '', 'price': 600, 'mcap': 3e8}]}
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
def usd(pg, sel): return float(clean(pg.inner_text(sel)).replace('$', '').replace(',', ''))
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__snap/market.json';")
    ctx.route('**/__snap/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(1000)
    tot0, alt0 = usd(pg, '#totalUsd'), usd(pg, '#altUsd')
    pg.evaluate("openAddCoin()"); pg.wait_for_selector('#acTabs', state='visible')
    tabs = pg.evaluate("[...document.querySelectorAll('#acTabs [data-tab]')].filter(b => !b.hidden).map(b => b.textContent.trim())")
    check('four tabs: Coins · bStocks · Metals · Cash & CDs', tabs == ['Coins', 'bStocks', 'Metals', 'Cash & CDs'], tabs)
    pg.click('#acTabs [data-tab="stock"]'); pg.wait_for_timeout(200)
    vis = pg.evaluate("['acSym','acName','acCgId','acCmc','acCat','acNetRow','acQty','acPrice','acDate'].map(i => document.getElementById(i).offsetParent !== null)")
    check('bStocks tab: a share search, shares and price per share — no CoinGecko / CoinMarketCap / network / category fields', pg.inner_text('#acFindLbl') == 'Share' and 'NVDAB' in pg.get_attribute('#acSym', 'placeholder') and 'shares' in pg.inner_text('#acQtyLbl') and 'per share' in pg.inner_text('#acPriceLbl') and vis == [True, False, False, False, False, False, True, True, True], vis)
    pg.fill('#acSym', 'tes'); pg.wait_for_selector('#acSuggest [role=option]', timeout=5000)
    sug = pg.inner_text('#acSuggest')
    check('search finds the share by name (Tesla → TSLAB), from the snapshot — no crypto in the list', 'TSLAB' in sug and 'Tesla' in sug and 'NVDAB' not in sug and 'Tokenized' not in sug, sug)
    pg.fill('#acSym', 'nvd'); pg.wait_for_selector('#acSuggest [role=option]:has-text("NVDAB")'); pg.click('#acSuggest [role=option]:has-text("NVDAB")'); pg.wait_for_timeout(300)
    link = clean(pg.inner_text('#acLinked'))
    check('picked: NVDAB, its price now, and what a share means here', pg.input_value('#acSym') == 'NVDAB' and 'bStock: NVIDIA' in link and 'now $180' in link and 'no Signal' in link, link)
    pg.fill('#acQty', '5'); pg.fill('#acPrice', '150'); pg.click('#acSave'); pg.wait_for_timeout(300)
    pg.wait_for_function("Samsam.getState().portfolio.some(c => c.sym === 'NVDAB')", timeout=10000); pg.evaluate("renderAll()"); pg.wait_for_timeout(800)
    d = pg.evaluate("(() => { const c = Samsam.getState().coins.find(c => c.sym === 'NVDAB'), p = Samsam.getState().portfolio.find(c => c.sym === 'NVDAB'); return { cls: c.cls, cat: c.cat, cgId: c.cgId, qty: p.qty, avg: p.basePrice, v: p.qty * p.currentPrice, k: Samsam.core.assetClass('NVDAB'), sig: signalInfo(p).action, cat2: SamsamTaxonomy.label(SamsamTaxonomy.categoryOf('NVDAB', c.cat, c.catLocked)) }; })()")
    check('saved as a share: cls stock, category US Stocks (bStocks), 5 at $150', d['cls'] == 'stock' and d['k'] == 'stock' and d['cat'] == 'stocks' and d['cat2'] == 'US Stocks (bStocks)' and d['qty'] == 5 and d['avg'] == 150 and d['cgId'] == 'nvidia-bstocks', d)
    check(f'…in the Portfolio total (+${d["v"]:,.2f}), not in Altcoins; Signal Hold', abs(usd(pg, '#totalUsd') - tot0 - d['v']) < 0.02 and abs(usd(pg, '#altUsd') - alt0) < 0.02 and d['sig'] == 'hold', [usd(pg, '#totalUsd'), tot0, d])
    # + Buy on a share opens the bStocks tab
    pg.evaluate("openAddCoin({ sym: 'NVDAB', cgId: 'nvidia-bstocks', name: 'NVIDIA' })"); pg.wait_for_timeout(300)
    check('opening Add for a share you hold → the bStocks tab', pg.get_attribute('#acTabs [data-tab="stock"]', 'aria-selected') == 'true' and 'shares' in pg.inner_text('#acQtyLbl'), [pg.evaluate("[...document.querySelectorAll('#acTabs [data-tab]')].map(b=>b.dataset.tab+':'+b.getAttribute('aria-selected'))"), pg.inner_text('#acQtyLbl'), pg.evaluate("Samsam.core.assetClass({sym:'NVDAB',cgId:'nvidia-bstocks'})")])
    pg.evaluate("closeAddCoin()")
    # Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(1500)
    pg.evaluate("openAddCoin()"); pg.wait_for_selector('#acTabs', state='visible'); pg.click('#acTabs [data-tab="stock"]'); pg.wait_for_timeout(400)
    tabs = pg.evaluate("[...document.querySelectorAll('#acTabs [data-tab]')].map(b => b.textContent.trim())")
    check('Arabic: four tabs and the share form', tabs == ['عملات', 'أسهم', 'معادن', 'نقد وشهادات'] and pg.inner_text('#acFindLbl') == 'السهم' and 'أسهم' in pg.inner_text('#acQtyLbl') and 'السهم' in pg.inner_text('#acPriceLbl'), [tabs, pg.inner_text('#acFindLbl'), pg.inner_text('#acQtyLbl')])
    pg.fill('#acSym', 'tes'); pg.wait_for_selector('#acSuggest [role=option]'); pg.click('#acSuggest [role=option] >> nth=0'); pg.wait_for_timeout(400)
    check('Arabic: the share note', 'سهم أمريكي مرمّز' in pg.inner_text('#acLinked'), pg.inner_text('#acLinked'))
    pg.screenshot(path=str(SH / 'add_stocks_ar.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
