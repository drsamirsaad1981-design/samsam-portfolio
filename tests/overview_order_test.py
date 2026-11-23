"""🧭 Overview, top-down: 💼 Net worth (with its split bar) → Total Portfolio + All Time Profit → its parts (BTC · Altcoins ·
Metals) that add up to the total → the moving line → 🥇 metals and 🏦 cash folded → 🕌 zakat last; the zakat jumps to the
very top while it is due. Net worth's portfolio is EXACTLY Total Portfolio. Market cap + Fear & Greed sit in the date line."""
import sys, pathlib, json, datetime, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'metals': NOW.isoformat(), 'fx': NOW.isoformat()}, 'fx': {'EGP': {'rate': 50}}, 'metals': [{'k': 'gold', 'price': 3110.35}]}
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
money = lambda t: float(re.search(r'-?\$([\d,]+\.\d\d)', clean(t)).group(1).replace(',', ''))
HJ = "(off => { const o = {}; new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Riyadh' }).formatToParts(new Date(Date.now() + off * 864e5)).forEach(p => { o[p.type] = parseInt(p.value, 10); }); return o; })"
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script("if (!sessionStorage.ovInit) { sessionStorage.ovInit = 1; localStorage.setItem('cp-fold-metals', '0'); localStorage.setItem('cp-fold-cash', '0'); }")   # this test checks the folding
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__snap/market.json';")
    ctx.route('**/__snap/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    pg.evaluate("Samsam.addCoin({ sym: 'XAU', name: 'Gold', cat: 'metals', cgId: 'pax-gold' }, { qty: 3, price: 2500 })")
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'USD', amount: 20000, label: 'Bank' }])"); pg.wait_for_timeout(1500)
    pg.evaluate("renderAll()"); pg.wait_for_timeout(600)
    order = pg.evaluate("['netWorthCard', 'totalUsd', 'pfParts', 'btcTicker', 'metalsCard', 'cashCard', 'zakatLine'].map(id => document.getElementById(id).getBoundingClientRect().top)")
    check('top-down: Net worth → Total → parts → moving line → metals → cash → zakat', order == sorted(order) and all(t > 0 for t in order[:6]), order)
    tot = money(pg.inner_text('#totalUsd')); pft = money(pg.inner_text('#nwPfTxt')); nw = money(pg.inner_text('#nwUsd'))
    check(f'💼 Net worth\'s portfolio is EXACTLY Total Portfolio (${tot:,.2f}), + $20,000 cash', clean(pg.inner_text('#totalUsd')) in clean(pg.inner_text('#nwPfTxt')) and abs(nw - tot - 20000) < 0.005, [tot, pft, nw])
    bar = pg.evaluate("[...document.querySelectorAll('#nwBar i')].map(i => parseFloat(i.style.width))")
    leg = pg.evaluate("[...document.querySelectorAll('#nwLegend .nw-li')].map(x => [x.dataset.k, parseInt(x.querySelector('b').textContent.replace(/[^0-9]/g, ''))])")
    check('…the bar by part (BTC · Altcoins · Metals · Cash) adds up to 100%, cash its own share', abs(sum(bar) - 100) < 0.01 and abs(bar[-1] - 20000 / (tot + 20000) * 100) < 0.05 and [k for k, _ in leg][-1] == 'cash' and 'metal' in [k for k, _ in leg], [bar, leg])
    check('…the legend\'s rounded % add up to exactly 100', sum(v for _, v in leg) == 100, leg)
    parts = pg.evaluate("(() => { const s = calcStats(); return [s.btcValue, s.altTotal, s.metalTotal, s.stockTotal, s.total]; })()")
    check('the parts add up to Total Portfolio (BTC + Altcoins + Metals + Shares)', abs(sum(parts[:4]) - parts[4]) < 1e-6 and pg.is_visible('#partMetals') and not pg.is_visible('#partStocks') and pg.get_attribute('#pfParts', 'data-n') == '3', parts)
    check('🥇 / 🏦 folded: one line with the value, details hidden', not pg.is_visible('#metalsSub') and not pg.is_visible('#cashSub') and pg.is_visible('#metalsUsd') and pg.is_visible('#cashUsd'))
    pg.click('#metalsCard .fold-t'); pg.wait_for_timeout(300)
    check('…tap → open (gold rows)', pg.is_visible('#metalsSub') and pg.get_attribute('#metalsCard .fold-t', 'aria-expanded') == 'true')
    pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(2000); pg.evaluate("renderAll()"); pg.wait_for_timeout(400)
    check('…kept open after a reload (this device)', pg.is_visible('#metalsSub') and not pg.is_visible('#cashSub'))
    pg.evaluate("tickerMkt = { ...tickerMkt, g: { ...(tickerMkt.g || {}), dom: (tickerMkt.g || {}).dom || { btc: 57, eth: 12 }, mcap: 3.21e12, mcapCh24: 1.8 }, f: { ...(tickerMkt.f || {}), value: 62 } }; renderPulse()")
    pg.evaluate("tickerMkt.g.dom = { btc: 58.7, eth: 11.2 }; tickerMkt.f = { value: 50, label: 'Neutral' }; renderPulse()")
    pl = clean(pg.inner_text('#hmPulse')).replace('\n', ' ')
    check('📈 the market strip: Market cap $3.21T ▲ 1.80% · BTC dominance 58.7% · Fear & Greed 50 Neutral (a gauge)', '$3.21T' in pl and '1.80%' in pl and '58.7%' in pl and 'Neutral' in pl and pg.locator('#hmPulse .mk-g').count() == 1 and pg.locator('#hmPulse .mk-t').count() == 3, pl)
    check('…the baseline left the top card — it is in the footer with its ⓘ and ✎', not pg.is_visible('.head-meta .hm-baseline') and pg.locator('#cpFoot .cpf-bl .cpf-bl-edit').count() == 1)
    zc = pg.evaluate("[document.getElementById('zakatLine').classList.contains('fold-card'), document.getElementById('zakatLine').parentElement.id, !!document.querySelector('#zakatLine .fold-t')]")
    check('🕌 not due → a folded zakat card at the bottom, like metals and cash', zc == [True, 'zakatBottom', True], zc)
    # zakat due → the very top
    a = pg.evaluate(HJ + "(-3)")
    pg.evaluate(f"Samsam.setZakatDay({{ m: {a['month']}, d: {a['day']} }})"); pg.evaluate(f"Samsam.setZakat({{ hy: {a['year']}, value: 90000, nisabUsd: 9000, date: '2026-01-01' }})"); pg.wait_for_timeout(700); pg.evaluate("renderAll()"); pg.wait_for_timeout(400)
    top = pg.evaluate("[document.getElementById('zakatLine').parentElement.id, document.getElementById('zakatLine').getBoundingClientRect().top < document.getElementById('netWorthCard').getBoundingClientRect().top]")
    check('🕌 due → moves to the very top (above Net worth) with ✓ Paid', top == ['zakatTop', True] and pg.is_visible('#zakatLine .zk-paid'), top)
    pg.click('#zakatLine .zk-paid'); pg.wait_for_timeout(900)
    check('…✓ Paid → back to its place at the bottom', pg.evaluate("document.getElementById('zakatLine').parentElement.id") == 'zakatBottom')
    pg.screenshot(path=str(SH / 'overview_order.png'))
    # no cash → no Net worth card; Total Portfolio leads
    pg.evaluate("Samsam.setCash([])"); pg.wait_for_timeout(800); pg.evaluate("renderAll()"); pg.wait_for_timeout(300)
    check('no cash → no Net worth card (Total Portfolio leads)', not pg.is_visible('#netWorthCard') and not pg.is_visible('#cashCard'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
