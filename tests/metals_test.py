"""🥇 Gold / 🥈 Silver as portfolio assets: added in grams and $ per gram, kept in troy ounces (priced like PAXG / KAG),
shown in grams, under Precious Metals, always Hold, not in the altcoins total, with CMC / Prediction / Liq.Map links."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
GPO = 31.1034768
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)

    pg.evaluate("openAddCoin()"); pg.wait_for_timeout(200)
    check('Add Coin has the 🥇 Gold / 🥈 Silver shortcuts', pg.locator('.ac-metals button').count() == 2)
    pg.click('.ac-metals button >> nth=0'); pg.wait_for_timeout(300)
    f = pg.evaluate("[acSym.value, acCgId.value, acCmc.value, acCat.value, acQtyLbl.textContent, acPriceLbl.textContent]")
    check('Gold shortcut: XAU, pax-gold, Precious Metals', f[:4] == ['XAU', 'pax-gold', 'pax-gold', 'metals'], f)
    check('labels ask for grams and price per gram', 'grams' in f[4] and 'per gram' in f[5], f)
    pg.fill('#acQty', '100'); pg.fill('#acPrice', '80')
    pg.screenshot(path=str(SH / 'metals-add.png'))
    pg.evaluate("applyAddCoin()"); pg.wait_for_timeout(900)
    c = pg.evaluate("(() => { const c = Samsam.getState().portfolio.find(x => x.sym === 'XAU'); return c && [c.qty, c.basePrice, c.cat, c.cgId]; })()")
    check('stored in troy ounces: 100 g → 3.215 oz', c and abs(c[0] - 100 / GPO) < 1e-9, c)
    check('Avg. Buy Price stored per ounce: $80/g → $2,488.28/oz', c and abs(c[1] - 80 * GPO) < 1e-6, c)
    check('category metals, priced as pax-gold', c and c[2] == 'metals' and c[3] == 'pax-gold', c)

    # Buy more: 50 g at $90/g
    pg.evaluate("openAddTx('buy','XAU')"); pg.wait_for_timeout(200)
    lab = pg.evaluate("[atxQtyLabel.textContent, atxPriceLabel.textContent]")
    check('Buy form in grams and per gram', 'grams' in lab[0] and 'per gram' in lab[1], lab)
    pg.fill('#atxQty', '50'); pg.fill('#atxPrice', '90'); pg.wait_for_timeout(100)
    pv = pg.inner_text('#atxPreview')
    check('preview: holdings after in grams (150 g), avg per gram', '150 g' in pv and '/g' in pv, pv)
    pg.click('#atxSave'); pg.wait_for_timeout(800)
    c = pg.evaluate("(() => { const c = Samsam.getState().portfolio.find(x => x.sym === 'XAU'); return [c.qty, c.basePrice]; })()")
    check('after buy: 150 g', abs(c[0] * GPO - 150) < 1e-6, c)
    check('after buy: avg $83.33/g', abs(c[1] / GPO - (100 * 80 + 50 * 90) / 150) < 1e-6, c)

    # edit that buy: shown back in grams / $ per gram
    tid = pg.evaluate("Samsam.getState().transactions.filter(t => t.sym === 'XAU' && t.type === 'buy').slice(-1)[0].id")
    pg.evaluate(f"openEditTx('{tid}')"); pg.wait_for_timeout(200)
    ev = pg.evaluate("[+atxQty.value, +atxPrice.value]")
    check('edit shows 50 g at $90/g', abs(ev[0] - 50) < 1e-4 and abs(ev[1] - 90) < 1e-4, ev)
    pg.evaluate("closeAddTx()")

    # how it shows
    pg.wait_for_timeout(500)
    sig = pg.evaluate("getAction('XAU', -50, portfolio.find(c => c.sym === 'XAU'))")
    check('Signal is always Hold (even 50% down)', sig == 'hold', sig)
    hc = pg.evaluate("SamsamCoins.holdCell('XAU', 1000, portfolio.find(c => c.sym === 'XAU').qty)")
    check('holdings shown in grams', '150 g' in hc, hc)
    av = pg.evaluate("avgShown(portfolio.find(c => c.sym === 'XAU'))")
    check('Avg. Buy Price shown per gram', av.endswith('/g') and '83.3' in av, av)
    ql = pg.evaluate("SamsamCoins.quickLinks('XAU')")
    check('links: CoinGlass XAUT map, CoinCodex pax-gold, CMC pax-gold',
          'coin=XAUT' in ql and 'pax-gold' in ql and 'coinmarketcap.com/currencies/pax-gold' in ql and 'Try Liq' not in ql, ql)
    qs = pg.evaluate("SamsamCoins.quickLinks('XAG')")
    check('silver: Liq.Map marked "Try" (CoinGlass may have none)', 'Try Liq.Map' in qs and 'kinesis-silver' in qs, qs)
    check('Precious Metals category exists', pg.evaluate("SamsamTaxonomy.label ? SamsamTaxonomy.label('metals') : JSON.stringify(SamsamTaxonomy)").find('Precious Metals') >= 0)

    # silver shortcut
    pg.evaluate("openAddCoin()"); pg.click('.ac-metals button >> nth=1'); pg.wait_for_timeout(200)
    check('Silver shortcut: XAG, kinesis-silver', pg.evaluate("[acSym.value, acCgId.value]") == ['XAG', 'kinesis-silver'])
    pg.evaluate("closeAddCoin()")

    # Market Hub → Metals: your metals on top
    pg.goto(S.SITE + '/market.html#metals'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    mine = pg.locator('#vMetals .as-mine')
    t = mine.inner_text() if mine.count() else ''
    check('Metals tab: "Your metals" card with 150 g of gold', 'Your metals' in t and '150' in t and 'Gold 24k' in t, t)
    check('…with the gram price vs your average and the add buttons', '/' not in '' and 'your avg' in t and mine.locator('[data-add]').count() == 2, t)
    pg.screenshot(path=str(SH / 'metals-mine.png'), full_page=False)
    pg.click('#vMetals [data-add="XAG"]'); pg.wait_for_timeout(300)
    check('Add silver from the Metals tab opens Add Coin on XAG', pg.evaluate("[addCoinModal.classList.contains('show') || getComputedStyle(addCoinModal).display !== 'none', acSym.value]") == [True, 'XAG'])
    pg.evaluate("closeAddCoin()")
    pg.evaluate("Samsam.removeCoin('XAU')"); pg.wait_for_timeout(900)
    t2 = pg.inner_text('#vMetals .as-mine') if pg.locator('#vMetals .as-mine').count() else ''
    check('no metals held → the card invites you to add gold / silver', 'Add gold' in t2 and 'Add silver' in t2, t2)
    check('no page errors', not errs, errs)
    br.close()
print(f'metals_test: {sum(res)}/{len(res)} passed')
