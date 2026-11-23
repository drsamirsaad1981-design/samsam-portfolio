"""🎯 Phase 4 — Add to Plan for all four: Coins · bStocks · Metals · Cash & CDs. A share (searched in the bStocks list),
gold in grams, and a savings goal in EGP (counted from your cash & certificates in EGP) each join the plan; their cards
show the right unit (shares · g · EGP), a savings goal has no Buy-at / price alert / DCA and its ➕ Add opens the cash form
in EGP; the class filter finds them; Arabic too."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'stocks': NOW.isoformat(), 'fx': NOW.isoformat()}, 'fx': {'EGP': {'rate': 50}, 'SAR': {'rate': 3.75}},
        'stocks': [{'id': 'tesla-bstocks-tokenized-stock', 'sym': 'TSLAB', 'name': 'Tesla (bStocks Tokenized Stock)', 'img': '', 'price': 400, 'mcap': 5e8}]}
GPO = 31.1034768
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__snap/market.json';")
    ctx.route('**/__snap/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'EGP', amount: 200000, label: 'Bank' }, { id: 'c2', kind: 'cash', cur: 'USD', amount: 3000, label: 'USD acct' }])"); pg.wait_for_timeout(600)
    pg.goto(SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500); pg.evaluate("setView('cards')")
    n0 = pg.evaluate("accumPlan.length")
    pg.click('.cp-add:has-text("Add to Plan")'); pg.wait_for_timeout(300)
    tabs = pg.evaluate("[...document.querySelectorAll('#apTabs [data-tab]')].map(b => b.textContent.trim())")
    check('Add to Plan: four tabs — Coins · bStocks · Metals · Cash & CDs', tabs == ['Coins', 'bStocks', 'Metals', 'Cash & CDs'] and pg.inner_text('#addTitle').strip() == 'Add to Plan', tabs)
    # ── a share
    pg.click('#apTabs [data-tab="stock"]'); pg.wait_for_timeout(200)
    check('bStocks tab: "Search a share" and "Target (shares)"', pg.inner_text('#addSearchLbl') == 'Search a share' and pg.inner_text('#addTargetLbl') == 'Target (shares)')
    pg.fill('#addSearch', 'tesla'); pg.wait_for_selector('#addList .coin-search-item:has-text("TSLAB")', timeout=5000)
    lst = pg.inner_text('#addList')
    check('…finds Tesla in the bStocks list, marked Not Owned', 'TSLAB' in lst and 'Other Shares' in lst or ('TSLAB' in lst and 'Not Owned' in lst), lst)
    pg.click('#addList .coin-search-item:has-text("TSLAB")'); pg.wait_for_timeout(300)
    pg.fill('#addTarget', '20'); pg.click('#addConfirm'); pg.wait_for_timeout(800)
    # ── gold in grams
    pg.click('.cp-add:has-text("Add to Plan")'); pg.wait_for_timeout(200); pg.click('#apTabs [data-tab="metal"]'); pg.wait_for_timeout(200)
    check('Metals tab: Gold / Silver to pick, no search, "Target (grams)"', pg.is_visible('#apMetal') and not pg.is_visible('#addSearch') and pg.inner_text('#addTargetLbl') == 'Target (grams)')
    pg.click('#apMetal [data-m="XAU"]'); pg.fill('#addTarget', '100'); pg.click('#addConfirm'); pg.wait_for_timeout(800)
    # ── a savings goal in EGP
    pg.click('.cp-add:has-text("Add to Plan")'); pg.wait_for_timeout(200); pg.click('#apTabs [data-tab="cash"]'); pg.wait_for_timeout(200)
    pg.click('#apCash [data-cur="EGP"]'); pg.wait_for_timeout(200)
    info = clean(pg.inner_text('#addSelectedInfo'))
    check('Cash tab: pick EGP → "You have 200,000 EGP" (your cash in EGP), "Savings goal"', '200,000' in info and 'EGP' in info and pg.inner_text('#addTargetLbl') == 'Savings goal', info)
    pg.fill('#addTarget', '500000'); pg.click('#addConfirm'); pg.wait_for_timeout(1200)
    plan = pg.evaluate("accumPlan.filter(e => ['TSLAB','XAU','CASH-EGP'].includes(e.sym)).map(e => ({ sym: e.sym, t: e.targetQty, cls: e.cls || null, kind: e.kind || null, cat: e.cat || null }))")
    by = {e['sym']: e for e in plan}
    check('saved: TSLAB 20 (stock) · XAU 100 g in ounces (metal) · CASH-EGP 500,000 (cash)', len(plan) == 3 and by['TSLAB']['t'] == 20 and by['TSLAB']['cls'] == 'stock' and abs(by['XAU']['t'] * GPO - 100) < 1e-6 and by['XAU']['cls'] == 'metal' and by['CASH-EGP']['t'] == 500000 and by['CASH-EGP']['kind'] == 'cash', plan)
    pg.wait_for_function("Samsam.getState().accum ? true : true"); pg.wait_for_timeout(600)
    cloud = pg.evaluate("(Samsam.getState().accumPlan || Samsam.getAccumPlan && Samsam.getAccumPlan() || []).map(e => e.sym)")
    # ── cards in their units
    card = lambda sym: clean(pg.locator('.acc-card', has=pg.locator(f'.ast-sym:text-is("{sym}")')).first.inner_text())
    ts, au, eg = card('TSLAB'), card('XAU'), card('EGP')
    check('TSLAB card: amounts in shares', '20 shares' in ts.replace('\n', ' ') and 'Buy' in ts and 'DCA' in ts, ts)
    check('Gold card: amounts in grams (100 g), its price per gram', '100 g' in au.replace('\n', ' ') and '/g' in au, au)
    check('Savings card: EGP, have 200,000 of 500,000 (40%), $1 = 50 EGP, Cost to Target $6,000', all(w in eg.replace('\n', ' ') for w in ('500,000 EGP', '200,000 EGP', '300,000 EGP', '$1 = 50', '40.0%', '$6,000.00')), eg)
    check('…no Buy at %, no price alert; "Add" instead of "Buy"; DCA (a regular saving); tag Cash & CDs', 'Buy at' not in eg and 'Price Alert' not in eg and 'DCA' in eg and 'Add' in eg and 'Cash & CDs' in eg, eg)
    # target edit in grams
    pg.locator('.acc-card', has=pg.locator('.ast-sym:text-is("XAU")')).first.locator('.card-target-input').first.fill('150')
    pg.locator('.acc-card', has=pg.locator('.ast-sym:text-is("XAU")')).first.locator('.card-target-input').first.blur(); pg.wait_for_timeout(500)
    check('typing 150 on the gold card → 150 g (saved in ounces)', abs(pg.evaluate("accumPlan.find(e => e.sym === 'XAU').targetQty") * GPO - 150) < 1e-6)
    # ➕ Add on the savings card → the cash form, in EGP
    pg.locator('.acc-card', has=pg.locator('.ast-sym:text-is("EGP")')).first.locator('.btn-buy').click(); pg.wait_for_selector('#cpCash', timeout=5000)
    check('➕ Add on the savings goal → the cash & certificates form, already in EGP', pg.input_value('#ccCur') == 'EGP')
    pg.click('#ccX'); pg.wait_for_timeout(200)
    # class filter
    pg.evaluate("setCatFilter('c:cash', true)"); pg.wait_for_timeout(300)
    rows = pg.evaluate("[...document.querySelectorAll('#cardsView .acc-card .ast-sym')].map(x => x.textContent.trim())")
    check('the plan\'s filter: Cash & CDs → the savings goal only', rows == ['EGP'], rows)
    pg.evaluate("setCatFilter('c:stock', true)"); pg.wait_for_timeout(300)
    rows = pg.evaluate("[...document.querySelectorAll('#cardsView .acc-card .ast-sym')].map(x => x.textContent.trim())")
    check('…Stocks → TSLAB', rows == ['TSLAB'], rows)
    pg.evaluate("setCatFilter('', true)"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(SH / 'plan_kinds.png'), full_page=False)
    # Overview plan card counts the savings goal
    tot = pg.evaluate("accumPlan.filter(e => e.targetQty > 0).length")
    # Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500); pg.evaluate("setView('cards')"); pg.wait_for_timeout(500)
    au = clean(pg.locator('.acc-card', has=pg.locator('.ast-sym:text-is("XAU")')).first.inner_text()); ts = clean(pg.locator('.acc-card', has=pg.locator('.ast-sym:text-is("TSLAB")')).first.inner_text())
    check('Arabic: grams = جم, shares = سهم', '150 جم' in au.replace('\n', ' ') and '20 سهم' in ts.replace('\n', ' '), [au[:200], ts[:200]])
    pg.click('.cp-add'); pg.wait_for_timeout(300)
    tabs = pg.evaluate("[...document.querySelectorAll('#apTabs [data-tab]')].map(b => b.textContent.trim())")
    check('Arabic: the four tabs', tabs == ['عملات', 'أسهم', 'معادن', 'نقد وشهادات'], tabs)
    check('…on the Coins tab the gold / currency pickers stay hidden', not pg.is_visible('#apMetal') and not pg.is_visible('#apCash') and pg.is_visible('#addSearch'))
    pg.click('#apTabs [data-tab="cash"]'); pg.wait_for_timeout(200); pg.click('#apCash [data-cur="EGP"]'); pg.wait_for_timeout(300)
    box = pg.inner_text('#apCash') + pg.inner_text('#addSelectedInfo')
    check('Arabic cash tab: جنيه مصري · لديك · يُحسب من نقدك', all(w in box for w in ('جنيه مصري', 'لديك', 'يُحسب من نقدك')), box.replace('\n', ' | '))
    pg.screenshot(path=str(SH / 'plan_kinds_ar.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
