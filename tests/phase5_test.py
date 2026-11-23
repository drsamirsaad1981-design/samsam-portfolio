"""🛒 Phase 5 — regular buys for all four + platinum and copper.
• ➕ Add → Metals: Gold · Silver · Platinum · Copper; platinum is priced from the world price (market snapshot), held in
  grams, in the Portfolio total, under Metals → Platinum in Allocation.
• Plan → DCA: "Regular buy" picks from the four tabs; a savings goal's regular saving is in its currency (EGP), its DCA
  window speaks of savings, the DCA card shows "Savings EGP · 5,000 EGP" and a "✓ Saved" button that marks the day done.
• A metal's DCA counts grams each buy. Arabic too."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'metals': NOW.isoformat(), 'fx': NOW.isoformat()}, 'fx': {'EGP': {'rate': 50}, 'SAR': {'rate': 3.75}},
        'metals': [{'k': 'gold', 'sym': 'GC=F', 'unit': 'oz', 'price': 3000, 'ch24': 0.5}, {'k': 'platinum', 'sym': 'PL=F', 'unit': 'oz', 'price': 1244.14, 'ch24': 1.2}, {'k': 'copper', 'sym': 'HG=F', 'unit': 'lb', 'price': 4.5, 'ch24': -0.8}]}
GPO = 31.1034768
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
def usd(pg, sel): return float(clean(pg.inner_text(sel)).replace('$', '').replace(',', ''))
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__snap/market.json';")
    ctx.route('**/__snap/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    tot0 = usd(pg, '#totalUsd')
    # ── platinum from the Add window
    pg.evaluate("openAddCoin()"); pg.wait_for_selector('#acTabs', state='visible'); pg.click('#acTabs [data-tab="metal"]'); pg.wait_for_timeout(300)
    btns = pg.evaluate("[...document.querySelectorAll('#acMetalPick [data-m]')].map(b => b.dataset.m)")
    check('➕ Add → Metals: Gold · Silver · Platinum · Copper', btns == ['XAU', 'XAG', 'XPT', 'XCU'], btns)
    pg.click('#acMetalPick [data-m="XPT"]'); pg.wait_for_timeout(800)
    note = clean(pg.inner_text('#acLinked'))
    check('platinum: the world price, per gram ($1,244.14/oz = $40.00/g)', 'Platinum' in note and '$40.00/g' in note, note)
    pg.fill('#acQty', '10'); pg.fill('#acPrice', '38'); pg.click('#acSave'); pg.wait_for_timeout(500)
    pg.wait_for_function("Samsam.getState().coins.some(c => c.sym === 'XPT')", timeout=8000)
    pg.evaluate("SamsamCoins.feedSnapMetals(true)"); pg.wait_for_function("(Samsam.getPrices().XPT || {}).usd > 0", timeout=8000); pg.evaluate("renderAll()"); pg.wait_for_timeout(800)
    x = pg.evaluate("(() => { const c = Samsam.getState().portfolio.find(c => c.sym === 'XPT'); return { qty: c.qty, price: c.currentPrice, k: Samsam.core.assetClass('XPT'), m: SamsamTaxonomy.metalOf('XPT'), sig: signalInfo(c).action }; })()")
    check('saved as metal: 10 g (in ounces), priced $1,244.14/oz, Signal Hold, under Platinum', abs(x['qty'] * GPO - 10) < 1e-6 and abs(x['price'] - 1244.14) < 0.01 and x['k'] == 'metal' and x['m'] == 'platinum' and x['sig'] == 'hold', x)
    mt = clean(pg.inner_text('#metalsCard'))
    check('Overview Metals card: ⚪ Platinum 10 g', 'Platinum' in mt and '10 g' in mt, mt)
    check('…in the Portfolio total (+$400.00)', abs(usd(pg, '#totalUsd') - tot0 - 400) < 0.05, [usd(pg, '#totalUsd'), tot0])
    cu = pg.evaluate("(() => { SamsamCoins.feedSnapMetals; return 4.5 * 31.1034768 / 453.59237; })()")
    # ── Plan: a regular saving in EGP
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'EGP', amount: 100000, label: 'Bank' }])"); pg.wait_for_timeout(500)
    pg.goto(SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500); pg.evaluate("setView('cards')")
    pg.evaluate("openDcaPick()"); pg.wait_for_timeout(300)
    check('Regular buy: the four tabs, "pick what to buy or save"', pg.is_visible('#apTabs') and 'buy or save' in pg.inner_text('#addTitle'))
    pg.click('#apTabs [data-tab="cash"]'); pg.click('#apCash [data-cur="EGP"]'); pg.wait_for_timeout(200)
    pg.click('#addConfirm'); pg.wait_for_selector('#dcaOverlay', state='visible')
    check('…its DCA window: "Regular saving", "Amount each time (EGP)", "Total saved"', 'Regular saving' in pg.inner_text('#dcaTitle') and pg.inner_text('#dcaAmtLbl') == 'Amount each time (EGP)' and pg.inner_text('#dcaTotLbl') == 'Total saved', [pg.inner_text('#dcaTitle'), pg.inner_text('#dcaAmtLbl')])
    wd = pg.evaluate("new Date().getDay()")
    pg.evaluate(f"setDcaEvery('week', {wd})"); pg.fill('#dcaMonthly', '5000'); pg.wait_for_timeout(300)
    r = clean(pg.inner_text('#dcaResult'))
    check('…the calculator: $100.00 each time, 21,500 EGP a month, total saved in EGP', '$100.00' in r and '21,667 EGP' in r and 'EGP (52 times)' in r, r.replace('\n', ' | '))
    pg.click('#dcaSave'); pg.wait_for_timeout(800)
    e = pg.evaluate("accumPlan.find(e => e.sym === 'CASH-EGP')")
    check('saved: CASH-EGP with a weekly 5,000 (EGP) schedule, no target', e and e['dca']['usd'] == 5000 and e['dca']['every'] == 'week' and not e.get('targetQty'), e)
    pg.evaluate("localStorage.setItem('samsam_dca_open','1'); renderAll()"); pg.wait_for_timeout(400)
    card = clean(pg.inner_text('#dcaCard'))
    check('DCA card: "Savings EGP", 5,000 EGP every …, "✓ Saved" to tap (today)', 'Savings EGP' in card and '5,000 EGP every' in card and '✓ Saved' in card and 'Today' in card, card.replace('\n', ' | '))
    pg.click('#dcaCard .dc-buy:has-text("Saved")'); pg.wait_for_timeout(800)
    card = clean(pg.inner_text('#dcaCard')); e = pg.evaluate("accumPlan.find(e => e.sym === 'CASH-EGP')")
    check('✓ Saved → the day is marked (dca.paid), the chip says ✓ Saved', e['dca'].get('paid') and '✓ Saved' in card and 'Today' not in card, [e['dca'], card.replace('\n', ' | ')])
    check('…saved in the cloud too', pg.evaluate("(Samsam.getState().accumPlan.find(e => e.sym === 'CASH-EGP') || {}).dca") and pg.evaluate("((Samsam.getState().accumPlan.find(e => e.sym === 'CASH-EGP') || {}).dca || {}).paid || []") != [])
    # ── gold's DCA in grams
    pg.evaluate("openAddModal(false, 'metal')"); pg.click('#apMetal [data-m="XAU"]'); pg.fill('#addTarget', '50'); pg.click('#addConfirm'); pg.wait_for_timeout(600)
    i = pg.evaluate("accumPlan.findIndex(e => e.sym === 'XAU')"); pg.evaluate(f"openDcaModal({i})"); pg.wait_for_timeout(300)
    pg.fill('#dcaMonthly', '200'); pg.wait_for_timeout(300)
    check('a metal\'s DCA: "Grams each buy", in g', pg.inner_text('#dcaEachLbl') == 'Grams each buy' and ' g' in pg.inner_text('#dcaPerMonth'), pg.inner_text('#dcaPerMonth'))
    pg.evaluate("closeDcaModal()")
    # Plan's Metals tab has the four
    pg.evaluate("openAddModal(false, 'metal')"); pg.wait_for_timeout(200)
    check('Plan → Metals: Gold · Silver · Platinum · Copper', pg.evaluate("[...document.querySelectorAll('#apMetal [data-m]')].map(b => b.dataset.m)") == ['XAU', 'XAG', 'XPT', 'XCU'])
    pg.evaluate("closeAddModal()")
    pg.screenshot(path=str(SH / 'phase5.png'))
    # Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500); pg.evaluate("localStorage.setItem('samsam_dca_open','1'); renderAll()"); pg.wait_for_timeout(500)
    card = pg.inner_text('#dcaCard')
    check('Arabic DCA card: ادخار EGP · ✓ تم الادخار', 'ادخار EGP' in card and 'تم الادخار' in card, card.replace('\n', ' | '))
    pg.evaluate("openAddModal(false, 'metal')"); pg.wait_for_timeout(300)
    mt = pg.inner_text('#apMetal')
    check('Arabic metals: بلاتين · نحاس', 'بلاتين' in mt and 'نحاس' in mt, mt)
    pg.screenshot(path=str(SH / 'phase5_ar.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
