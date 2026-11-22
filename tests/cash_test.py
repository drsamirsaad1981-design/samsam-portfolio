"""🏦 Cash & certificates (USD / EGP / SAR) and the 💼 Net worth line: added by hand from ➕ Add → 🏦 or the card, valued in
US dollars at the official rate from the snapshot, never mixed into the portfolio's own totals, kept in backups."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'fx': NOW.isoformat()}, 'fx': {'EGP': {'rate': 50, 'ch24': 0.1}, 'SAR': {'rate': 3.75, 'ch24': 3.2}}}
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
def usd(pg, sel): return float(clean(pg.inner_text(sel)).replace('$', '').replace(',', ''))
def add(pg, kind, cur, amount, label='', rate=None, months=None, pay=None, start=None):
    pg.wait_for_selector('#cpCash'); pg.click(f'#cpCash [data-kind="{kind}"]'); pg.select_option('#ccCur', cur); pg.fill('#ccAmt', str(amount)); pg.fill('#ccLabel', label)
    if kind == 'cert':
        pg.fill('#ccRate', str(rate)); pg.fill('#ccMonths', str(months)); pg.select_option('#ccPay', pay); pg.fill('#ccStart', start)
    pg.click('#ccSave'); pg.wait_for_selector('#cpCash', state='detached'); pg.wait_for_timeout(500)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__fx/market.json';")
    state = {'ok': True}
    ctx.route('**/__fx/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)) if state['ok'] else r.fulfill(status=404, body='{}'))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(1500)
    total0 = usd(pg, '#totalUsd'); pnl0 = pg.inner_text('#totalPnlCard')
    check('with nothing entered there is no card and no Net worth line', not pg.is_visible('#cashCard') and not pg.is_visible('#netWorthLine'))
    # ➕ Add → 🏦
    pg.evaluate("openAddCoin()"); pg.wait_for_selector('#addCoinModal [data-cash-add]', state='visible')
    pg.click('#addCoinModal [data-cash-add]'); pg.wait_for_selector('#cpCash')
    check('➕ Add → 🏦 Cash or a certificate opens the form (the coin form closes)', pg.is_visible('#cpCash #ccAmt') and not pg.is_visible('#acSym'))
    pg.click('#ccSave'); check('no amount → asked for it, nothing saved', 'amount' in pg.inner_text('#ccErr').lower() and pg.evaluate("Samsam.getCash().length") == 0, pg.inner_text('#ccErr'))
    add(pg, 'cash', 'EGP', '100,000', 'CIB savings')
    card = clean(pg.inner_text('#cashCard'))
    check('a balance of 100,000 EGP → the card: its name, the amount, ≈ $2,000 at $1 = 50 EGP (the official rate, shown)', pg.is_visible('#cashCard') and 'CIB savings' in card and '100,000 EGP' in card and '≈ $2,000.00' in card and '$1 = 50 EGP' in card and usd(pg, '#cashUsd') == 2000, card)
    nw = clean(pg.inner_text('#netWorthLine'))
    check('💼 Net worth = portfolio + cash, on its own line', 'Net worth' in nw and f'{total0 + 2000:,.2f}' in nw and f'{total0:,.2f}' in nw and '$2,000.00' in nw, [nw, total0])
    check('…and the portfolio\'s own total and profit are unchanged', usd(pg, '#totalUsd') == total0 and pg.inner_text('#totalPnlCard') == pnl0, [usd(pg, '#totalUsd'), total0])
    # a certificate, paid monthly, started 31 days ago
    start = (NOW - datetime.timedelta(days=45)).strftime('%Y-%m-%d')
    pg.click('#cashCard [data-cash-add]'); pg.wait_for_selector('#cpCash'); pg.click('#cpCash [data-kind="cert"]'); pg.fill('#ccAmt', '365000'); pg.fill('#ccRate', '150'); pg.click('#ccSave')
    check('a return over 100% is refused', '100' in pg.inner_text('#ccErr'), pg.inner_text('#ccErr'))
    pg.click('#ccNo'); pg.click('#cashCard [data-cash-add]')
    add(pg, 'cert', 'EGP', 365000, 'NBE certificate', rate=20, months=36, pay='month', start=start)
    card = clean(pg.inner_text('#cashCard'))
    check('a certificate: 20% a year, +6,083 EGP monthly, its maturity date and the days left', 'NBE certificate' in card and 'certificate' in card and '20% a year' in card and '+6,083 EGP monthly' in card and 'matures' in card and ' days)' in card, card)
    it = pg.evaluate("Samsam.core.cashTotals(Samsam.getCash(), {EGP:50,SAR:3.75}).items.find(x => x.kind === 'cert')")
    check('…paid monthly → the certificate stays worth what was put in (the payments go to your account)', it['accrued'] == 0 and it['value'] == 365000 and it['usd'] == 7300 and it['daysLeft'] > 1000, it)
    end = pg.evaluate(f"Samsam.core.cashFacts({{kind:'cert',cur:'EGP',amount:365000,rate:20,start:'{start}',months:12,pay:'end'}}, {{EGP:50}})")
    check('…paid at maturity → the return so far is part of its value (45 days at 20% = 9,000 EGP)', abs(end['accrued'] - 9000) < 201 and abs(end['usd'] - (365000 + end['accrued']) / 50) < 0.01 and end['income'] is None, end)
    pg.click('#cashCard [data-cash-add]'); add(pg, 'cash', 'SAR', 7500, 'Al Rajhi'); pg.click('#cashCard [data-cash-add]'); add(pg, 'cash', 'USD', 500, '')
    card = clean(pg.inner_text('#cashCard'))
    check('riyals at the official rate ($1 = 3.75 SAR → 7,500 SAR ≈ $2,000), dollars as they are', 'Al Rajhi' in card and '7,500 SAR' in card and '$1 = 3.75 SAR' in card and '$500.00' in card and '%)' not in card.split('Al Rajhi')[1].split('\n')[0], repr(card))
    tot = usd(pg, '#cashUsd'); exp = 2000 + 7300 + 2000 + 500
    check(f'the card total adds them all in dollars (${tot:,.2f})', abs(tot - exp) < 0.02, [tot, exp])
    pg.screenshot(path=str(SH / 'cash_card.png'), full_page=False); pg.locator('#cashCard').screenshot(path=str(SH / 'cash_card_only.png'))
    # edit and delete
    pg.click('#cashCard .ch-row >> nth=0'); pg.wait_for_selector('#cpCash #ccDel')
    check('tapping a row opens it for editing, filled in', pg.input_value('#ccAmt') == '100000' and pg.input_value('#ccLabel') == 'CIB savings' and pg.input_value('#ccCur') == 'EGP')
    pg.fill('#ccAmt', '150000'); pg.click('#ccSave'); pg.wait_for_selector('#cpCash', state='detached'); pg.wait_for_timeout(500)
    check('…saved: 150,000 EGP ≈ $3,000', '150,000 EGP' in clean(pg.inner_text('#cashCard')) and '≈ $3,000.00' in clean(pg.inner_text('#cashCard')))
    pg.click('#cashCard .ch-row >> nth=3'); pg.wait_for_selector('#ccDel'); pg.click('#ccDel'); pg.wait_for_selector('#cpCash', state='detached'); pg.wait_for_timeout(500)
    check('Delete removes that entry only', pg.evaluate("Samsam.getCash().length") == 3 and '$500.00' not in clean(pg.inner_text('#cashCard')), pg.evaluate("Samsam.getCash().map(x=>x.label)"))
    check('it is in the backup and the automatic copy (settings → cash)', pg.evaluate("Samsam.settingsNow().info.cash.length") == 3)
    # the rates cannot be read, on a device that never had them
    state['ok'] = False; pg.evaluate("localStorage.removeItem('cp-fx')"); pg.reload(); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(2500)
    card = clean(pg.inner_text('#cashCard'))
    check('no rate yet → it says so, and those amounts are not put in the total as a guess', 'rate not loaded yet' in card and 'not in the total' in card and clean(pg.inner_text('#cashUsd')) == '$—', card)
    state['ok'] = True
    # Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(2500)
    card = clean(pg.inner_text('#cashCard')); nw = clean(pg.inner_text('#netWorthLine'))
    check('Arabic: the card, the certificate line and Net worth', 'نقد وشهادات' in card and 'السعر الرسمي' in card and 'شهادة' in card and 'سنوياً' in card and 'تستحق' in card and 'صافي الثروة' in nw and 'matures' not in card and 'Official' not in card, [card, nw])
    pg.click('#cashCard [data-cash-add]'); pg.wait_for_selector('#cpCash')
    form = pg.inner_text('#cpCash')
    check('Arabic: the form', 'رصيد' in form and 'شهادة' in form and 'العملة' in form and 'المبلغ' in form and 'حفظ' in form and 'Save' not in form, form)
    pg.screenshot(path=str(SH / 'cash_form_ar.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
