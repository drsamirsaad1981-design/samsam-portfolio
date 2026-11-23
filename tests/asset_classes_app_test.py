"""🧭 Asset classes in the app: a bStock is held (no Signal), stays out of "Altcoins Accumulated", and the zakat pool counts
coins + shares (switchable, by the ✎ zakat dialog) + cash & certificates; the Portfolio total includes the share."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'fx': NOW.isoformat()}, 'fx': {'EGP': {'rate': 50}, 'SAR': {'rate': 3.75}}, 'metals': [{'k': 'gold', 'price': 3000}]}
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
def usd(pg, sel): return float(clean(pg.inner_text(sel)).replace('$', '').replace(',', ''))
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1280, 'height': 900}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__fx/market.json';")
    ctx.route('**/__fx/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    ctx.add_init_script("window.__cpAutoAnswer = (kind, msg, o) => { (window.__cpLog = window.__cpLog || []).push(msg); if (kind === 'prompt' && o && o.selects) return window.__zkAns || null; return kind === 'prompt' ? '' : true; };")
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(1200)
    tot0, alt0 = usd(pg, '#totalUsd'), usd(pg, '#altUsd')
    # a share: NVIDIA bStock, 10 at $150 (the test price feed makes every coin $2 now)
    pg.evaluate("Samsam.addCoin({ sym: 'NVDAB', name: 'NVIDIA bStock', cgId: 'nvidia-bstock', cat: 'other' }, { qty: 10, price: 150 })")
    pg.wait_for_function("Samsam.getState().portfolio.some(c => c.sym === 'NVDAB' && c.currentPrice > 0)", timeout=15000); pg.evaluate("renderAll()"); pg.wait_for_timeout(800)
    nv = pg.evaluate("(() => { const c = Samsam.getState().portfolio.find(c => c.sym === 'NVDAB'); return { v: c.qty * c.currentPrice, cls: Samsam.core.assetClass(c), sig: Samsam.core.hasSignal('NVDAB') }; })()")
    check('the bStock is known as a share (by its CoinGecko id), with no Signal', nv['cls'] == 'stock' and nv['sig'] is False, nv)
    check(f'Portfolio total includes the share (+${nv["v"]:,.2f}); Altcoins Accumulated does not', abs(usd(pg, '#totalUsd') - tot0 - nv['v']) < 0.02 and abs(usd(pg, '#altUsd') - alt0) < 0.02, [usd(pg, '#totalUsd'), tot0, usd(pg, '#altUsd'), alt0])
    sig = pg.evaluate("(() => { const c = Samsam.getState().portfolio.find(c => c.sym === 'NVDAB'); return [signalInfo(c).action, Samsam.signalOf(-60, 'NVDAB')]; })()")
    check('…its Signal is Hold even 98% below its buy price (the app and the cloud agree)', sig == ['hold', 'hold'], sig)
    # zakat: coins + share + cash
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'EGP', amount: 250000, label: 'Bank' }])"); pg.wait_for_timeout(800); pg.evaluate("renderAll()"); pg.wait_for_timeout(600)
    z = pg.evaluate("(() => { const st = Samsam.getState(); return SamsamCoins.zakatCrypto(st, 3000, Date.now(), null, { cashUsd: 5000, stocks: Samsam.getZakatStocks() }); })()")
    coins = pg.evaluate("Samsam.getState().portfolio.filter(c => !SamsamCoins.isMetal(c.sym) && c.sym !== 'NVDAB').reduce((a, c) => a + c.qty * c.currentPrice, 0)")
    check('zakat pool = coins + the share + cash (shares counted by default)', abs(z['value'] - (coins + nv['v'] + 5000)) < 0.02 and z['pool']['stocksCounted'] is True, [z['value'], coins, nv['v']])
    pg.wait_for_timeout(600); pg.evaluate("renderAll()"); pg.wait_for_timeout(400)
    zl = clean(pg.inner_text('#zakatLine'))
    check('the 🕌 line shows what is in the pool: crypto · shares · cash', 'crypto $' in zl and 'shares $' in zl and 'cash $' in zl, zl)
    # the ✎ dialog: shares off
    pg.evaluate("window.__zkAns = ['1', '9', 'off']"); pg.click('#zakatLine .zk-edit'); pg.wait_for_function("Samsam.getZakatStocks() === false", timeout=8000); pg.evaluate("renderAll()"); pg.wait_for_timeout(500)
    log = pg.evaluate("window.__cpLog.filter(m => /Shares \\(bStocks\\)/.test(m))")
    zl = clean(pg.inner_text('#zakatLine'))
    check('✎ zakat dialog: a Shares (bStocks) choice — off → the line is "crypto + cash"', len(log) == 1 and 'cash $' in zl and 'shares' not in zl, [log, zl])
    check('…saved with your settings (backup / automatic copy)', pg.evaluate("Samsam.settingsNow().info.zakatStocks") is False)
    pg.evaluate("window.__zkAns = ['1', '9', 'on']"); pg.click('#zakatLine .zk-edit'); pg.wait_for_function("Samsam.getZakatStocks() === true", timeout=8000)
    check('…and on again', pg.evaluate("Samsam.getZakatStocks()") is True)
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
