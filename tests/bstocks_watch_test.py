"""📈⭐ Market Hub → bStocks: All · ⭐ Watchlist · My shares, like the Crypto page. A star on each share adds it to the
same Watchlist (in your settings); the Crypto page's Watchlist keeps showing coins only. My shares lists what you hold
(amount + value) with a total and profit. Arabic too."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'stocks': NOW.isoformat()}, 'stocks': [
    {'id': 'nvidia-bstocks', 'sym': 'NVDAB', 'name': 'NVIDIA (bStocks Tokenized Stock)', 'img': '', 'price': 180, 'ch24': 2, 'mcap': 9e8},
    {'id': 'tesla-bstocks-tokenized-stock', 'sym': 'TSLAB', 'name': 'Tesla (bStocks Tokenized Stock)', 'img': '', 'price': 400, 'ch24': -1, 'mcap': 5e8},
    {'id': 'bn:ANTB', 'sym': 'ANTB', 'name': 'Anthropic bStock', 'img': '', 'price': 50, 'ch24': 1, 'mcap': 1e8}]}
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__snap/market.json';"); ctx.add_init_script("if (!sessionStorage.bsInit) { sessionStorage.bsInit = 1; localStorage.setItem('samsam_mk_view', 'stocks'); localStorage.removeItem('samsam_bs_tab'); }")
    ctx.route('**/__snap/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(600)
    pg.evaluate("Samsam.addCoin({ sym: 'NVDAB', name: 'NVIDIA', cgId: 'nvidia-bstocks', cat: 'stocks', cls: 'stock' }, { qty: 10, price: 150 })"); pg.wait_for_timeout(800)
    pg.goto(SITE + '/market.html#stocks'); S.wait_ready(pg); pg.wait_for_selector('.as-tabs', timeout=10000); pg.wait_for_timeout(600)
    tabs = [clean(t) for t in pg.evaluate("[...document.querySelectorAll('.as-tabs [data-tab]')].map(b => b.innerText.replace(/\\s+/g, ' ').trim())")]
    check('bStocks: All 3 · ⭐ Watchlist 0 · My shares 1', tabs == ['All 3', '⭐ Watchlist 0', 'My shares 1'], tabs)
    check('…each share has a star', pg.locator('.as-row .as-star').count() == 3)
    pg.click('.as-row .as-star[data-star="tesla-bstocks-tokenized-stock"]'); pg.wait_for_timeout(700)
    pg.click('.as-row .as-star[data-star="bn.antb"]'); pg.wait_for_timeout(700)
    wl = pg.evaluate("Samsam.getWatchlist().map(w => w.id)")
    check('⭐ Tesla and Anthropic → the Watchlist (bn:ANTB kept as bn.antb), names without the bStocks suffix', sorted(wl) == ['bn.antb', 'tesla-bstocks-tokenized-stock'] and pg.evaluate("Samsam.getWatchlist().find(w => w.sym === 'TSLAB').name") == 'Tesla', wl)
    pg.click('.as-tabs [data-tab="watch"]'); pg.wait_for_timeout(300)
    rows = pg.evaluate("[...document.querySelectorAll('.as-row b')].map(b => b.textContent)")
    check('Watchlist tab → the two starred shares', sorted(rows) == ['ANTB', 'TSLAB'], rows)
    pg.click('.as-tabs [data-tab="mine"]'); pg.wait_for_timeout(300)
    rows = pg.evaluate("[...document.querySelectorAll('.as-row b')].map(b => b.textContent)"); sm = clean(pg.inner_text('.as-mysum'))
    my = clean(pg.inner_text('.as-row .as-my'))
    check('My shares → NVDAB: 10 shares · its value; a total and profit line', rows == ['NVDAB'] and '10 shares' in my and 'Your shares' in sm and 'Profit' in sm, [rows, my, sm])
    pg.reload(); S.wait_ready(pg); pg.wait_for_selector('.as-tabs'); pg.wait_for_timeout(500)
    check('…the tab is remembered', pg.get_attribute('.as-tabs [data-tab="mine"]', 'aria-selected') == 'true')
    pg.click('.as-tabs [data-tab="watch"]'); pg.click('.as-row .as-star[data-star="bn.antb"]'); pg.wait_for_timeout(700)
    check('⭐ again → removed', pg.evaluate("Samsam.getWatchlist().map(w => w.id)") == ['tesla-bstocks-tokenized-stock'])
    pg.screenshot(path=str(SH / 'bstocks_watch.png'))
    # the Crypto page's Watchlist shows coins only
    pg.evaluate("SamsamAssets.show('crypto', true)"); pg.wait_for_timeout(800)
    n = pg.evaluate("document.getElementById('watchN') ? document.getElementById('watchN').textContent : null")
    check('Crypto page: its Watchlist count leaves the shares out', n in ('0', None) or n == str(pg.evaluate("Samsam.getWatchlist().filter(w => !/bstock|^bn\\./.test(w.id)).length")), n)
    # Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar'); localStorage.setItem('samsam_mk_view','stocks')"); pg.reload(); S.wait_ready(pg); pg.wait_for_selector('.as-tabs'); pg.wait_for_timeout(800)
    t = pg.inner_text('.as-tabs')
    check('Arabic: الكل · المتابعة · أسهمي', 'الكل' in t and 'المتابعة' in t and 'أسهمي' in t, t)
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
