"""Adding coins is linked across every page:
plan a coin you don't own (CoinGecko search) → live price, Not Owned Yet → ➕ Buy adds it to the portfolio (shared
Add Coin form, prefilled) → it shows on the main page, Holdings and Allocation, the plan updates by itself;
➕ Buy on a coin you hold opens Add Transaction; Holdings has ➕ Add (a coin you hold becomes a Buy);
a coin removed from the portfolio keeps a real price in the plan; Overall Progress is the same on both pages."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SEARCH = {'coins': [{'id': 'hyperliquid', 'symbol': 'HYPE', 'name': 'Hyperliquid', 'market_cap_rank': 12, 'large': 'https://img.test/hype.png'},
                    {'id': 'solana', 'symbol': 'SOL', 'name': 'Solana', 'market_cap_rank': 5, 'large': 'https://img.test/sol.png'}]}
COIN = {'image': {'small': 'https://img.test/hype.png'}, 'categories': ['Layer 1 (L1)', 'Decentralized Finance (DeFi)'],
        'market_data': {'current_price': {'usd': 40.0}, 'price_change_percentage_24h': 3.0}}
PNG = bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082')
def prices(route):
    ids = re.search(r'ids=([^&]+)', route.request.url); data = {}
    for i in (ids and __import__('urllib.parse').parse.unquote(ids.group(1)).split(',') or []):
        data[i] = {'usd': 40.0 if i == 'hyperliquid' else (100000.0 if i == 'bitcoin' else 2.0), 'usd_24h_change': 1.5}
    route.fulfill(status=200, content_type='application/json', body=json.dumps(data), headers={'access-control-allow-origin': '*'})
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    ctx.route('https://api.coingecko.com/api/v3/search**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SEARCH), headers={'access-control-allow-origin': '*'}))
    ctx.route('https://api.coingecko.com/api/v3/coins/hyperliquid**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(COIN), headers={'access-control-allow-origin': '*'}))
    ctx.route('https://api.coingecko.com/api/v3/simple/price**', prices)
    ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/png', body=PNG))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
    check('HYPE is not in the portfolio to start with', not pg.evaluate("portfolio.some(c => c.sym === 'HYPE')"))

    # 1. Plan a coin you don't own
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    pg.evaluate("setView('cards')")
    pg.click('text=Add Coin to Plan'); pg.wait_for_timeout(200)
    pg.fill('#addSearch', 'hyp'); pg.wait_for_timeout(900)
    lst = pg.inner_text('#addList')
    check('Add Coin to Plan finds coins you don\'t own (CoinGecko), marked Not Owned', 'HYPE' in lst and 'Other Coins' in lst and 'Not Owned' in lst, lst)
    pg.fill('#addSearch', 'sol'); pg.wait_for_timeout(900)
    lst2 = pg.inner_text('#addList')
    check('a coin you hold shows once, under your coins (not again from CoinGecko)', lst2.count('SOL') == 1 and lst2.index('SOL') < lst2.index('Other Coins') if 'Other Coins' in lst2 else lst2.count('SOL') == 1, lst2)
    pg.fill('#addSearch', 'hyp'); pg.wait_for_timeout(900)
    pg.locator('#addList .coin-search-item', has_text='HYPE').click(); pg.wait_for_timeout(600)
    info = pg.inner_text('#addSelectedInfo')
    check('picked coin: live price and "not in your portfolio yet"', '$40.00' in info and 'Not in your portfolio yet' in info, info)
    pg.fill('#addTarget', '100'); pg.click("#addModal button:has-text('Add to Plan')"); pg.wait_for_timeout(1200)
    e = pg.evaluate("accumPlan.find(x => x.sym === 'HYPE')")
    check('saved in the plan with its CoinGecko link, logo and category', e and e.get('cgId') == 'hyperliquid' and e.get('logoUrl') and e.get('cat') == 'defi' and e['targetQty'] == 100, e)
    r = pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'HYPE'))")
    check('not owned: Actual 0, live price $40, Cost to Target = 100 × $40', r['notOwned'] and r['actualQty'] == 0 and r['currentPrice'] == 40 and abs(r['costToTarget'] - 4000) < 1e-9, r)
    card = pg.locator('#cardsView .coin-card', has_text='HYPE').first
    ct = card.inner_text()
    check('card says Not Owned Yet and has + Buy (icon)', 'Not Owned Yet' in ct and 'Buy' in ct and '$4,000.00' in ct, ct[:300])
    card.screenshot(path=str(SH / 'linkage-notowned-card.png'))
    pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500)
    r = pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'HYPE'))")
    check('after a reload the plan coin still has its price (fetched by the page)', r['currentPrice'] == 40, r)

    # 2. ➕ Buy on a coin you don't own → Add Coin, prefilled → portfolio
    pg.evaluate("setView('cards')")
    pg.locator('#cardsView .coin-card', has_text='HYPE').first.locator('.btn-buy').click(); pg.wait_for_timeout(500)
    f = pg.evaluate("({ open: document.getElementById('addCoinModal').classList.contains('show'), sym: acSym.value, name: acName.value, cg: acCgId.value, cat: acCat.value, linked: acLinked.innerText, focus: document.activeElement && document.activeElement.id })")
    check('➕ Buy (not owned) opens Add Coin ready: symbol, name, CoinGecko link, category — cursor on Amount', f['open'] and f['sym'] == 'HYPE' and f['name'] == 'Hyperliquid' and f['cg'] == 'hyperliquid' and f['cat'] == 'defi' and 'Linked to CoinGecko' in f['linked'] and f['focus'] == 'acQty', f)
    pg.screenshot(path=str(SH / 'linkage-buy-addcoin.png'))
    pg.fill('#acQty', '10'); pg.fill('#acPrice', '35'); pg.click('#acSave'); pg.wait_for_timeout(1500)
    r = pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'HYPE'))")
    check('the plan updates by itself: Actual 10, progress 10%, Not Owned Yet gone', not r['notOwned'] and r['actualQty'] == 10 and abs(r['progress'] - 10) < 1e-9, r)
    check('card no longer says Not Owned Yet', 'Not Owned Yet' not in pg.locator('#cardsView .coin-card', has_text='HYPE').first.inner_text())
    # 3. ➕ Buy on a coin you hold → Add Transaction (Buy)
    pg.locator('#cardsView .coin-card', has_text='HYPE').first.locator('.btn-buy').click(); pg.wait_for_timeout(500)
    t = pg.evaluate("({ open: document.getElementById('atxBackdrop').classList.contains('show'), sym: atxSym, buy: document.querySelector('.atx-types [data-t=buy]').getAttribute('aria-checked'), price: atxPrice.value })")
    check('➕ Buy (owned) opens Add Transaction on Buy for that coin, at today\'s price', t['open'] and t['sym'] == 'HYPE' and t['buy'] == 'true' and t['price'] == '40', t)
    pg.fill('#atxQty', '5'); pg.click('#atxSave'); pg.wait_for_timeout(1200)
    check('the Buy lands in the plan: Actual 15', pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'HYPE')).actualQty") == 15)
    acc_pct = pg.inner_text('#overallPct')
    pg.evaluate("setView('table')"); pg.wait_for_timeout(300)
    check('table row has ➕ Buy too', pg.locator('#accTableBody tr', has_text='HYPE').locator('.row-buy').count() == 1)

    # 4. main page, Holdings, Allocation see it
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    c = pg.evaluate("(() => { const c = portfolio.find(c => c.sym === 'HYPE'); return c && { qty: c.qty, cat: c.cat, cg: c.cgId, price: c.currentPrice, logo: c.logoUrl }; })()")
    check('main page: HYPE in the portfolio, 15 coins, right category and link', c and abs(c['qty'] - 15) < 1e-9 and c['cat'] == 'defi' and c['cg'] == 'hyperliquid', c)
    check('main page Overall Progress = Accumulation page', pg.inner_text('#accumPct').startswith(acc_pct), (pg.inner_text('#accumPct'), acc_pct))
    pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(800)
    check('Allocation list shows HYPE', pg.locator('#hovAssetList .hov-asset-row[data-sym="HYPE"]').count() == 1)
    pg.evaluate("openAddCoin()"); pg.wait_for_timeout(300)   # (the Holdings screen's ➕ Add went with it — the main page has one)
    check('➕ Add opens the shared Add Coin form', pg.evaluate("document.getElementById('addCoinModal').classList.contains('show')"))
    pg.fill('#acSym', 'HYPE'); pg.wait_for_timeout(900)
    sug = pg.inner_text('#acSuggest')
    check('search marks a coin you already hold (In Portfolio)', 'In Portfolio' in sug, sug)
    pg.locator('#acSuggest [role=option]', has_text='HYPE').click(); pg.wait_for_timeout(500)
    check('picking a coin you hold says it will be added as a Buy', 'added' in pg.inner_text('#acLinked').lower() or 'buy' in pg.inner_text('#acLinked').lower(), pg.inner_text('#acLinked'))
    pg.fill('#acQty', '5'); pg.fill('#acPrice', '30'); pg.click('#acSave'); pg.wait_for_timeout(1200)
    check('…and saving records a Buy (20 HYPE), not a second coin', pg.evaluate("portfolio.filter(c => c.sym === 'HYPE').length") == 1 and abs(pg.evaluate("portfolio.find(c => c.sym === 'HYPE').qty") - 20) < 1e-9)
    pg.evaluate("openCoinTx('HYPE')"); pg.wait_for_timeout(700)
    check('a coin\'s Transactions screen has its own Add Transaction', pg.is_visible('#htxAddBtn'))
    pg.evaluate("hovBack()"); pg.wait_for_timeout(300); pg.evaluate("hovBack()"); pg.wait_for_timeout(300)
    pg.goto(S.SITE + '/allocation.html'); S.wait_ready(pg); pg.wait_for_timeout(1800)
    check('Allocation counts HYPE in its category', pg.evaluate("portfolio.some(c => c.sym === 'HYPE' && (c.cat || '') === 'defi')"))

    # 5. remove it from the portfolio: the plan keeps a real price, Not Owned Yet again
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    pg.evaluate("Samsam.removeCoin('HYPE')"); pg.wait_for_timeout(900)
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(2000)
    r = pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'HYPE'))")
    check('removed from the portfolio but still planned: Not Owned Yet, real price (not $0)', r['notOwned'] and r['actualQty'] == 0 and r['currentPrice'] == 40 and abs(r['costToTarget'] - 4000) < 1e-9, r)
    # clean up
    pg.evaluate("(() => { const i = accumPlan.findIndex(x => x.sym === 'HYPE'); accumPlan.splice(i, 1); saveAccumPlan(true); })()"); pg.wait_for_timeout(800)
    check('no page errors', not errs, errs)
    br.close()
print(f'linkage_test: {sum(res)}/{len(res)} passed')
