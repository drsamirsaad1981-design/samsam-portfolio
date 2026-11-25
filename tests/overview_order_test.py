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
    order = pg.evaluate("['hmPulse', 'btcTicker', 'netWorthCard', 'totalUsd', 'pfParts', 'metalsCard', 'cashCard', 'zakatLine'].map(id => document.getElementById(id).getBoundingClientRect().top)")
    check('top-down: market cards → moving line → Net worth → Total → parts → metals → cash → zakat', order == sorted(order) and all(t > 0 for t in order[1:7]), order)
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
    pg.evaluate("tickerMkt.g.dom = { btc: 58.7, eth: 11.2, usdt: 4.9 }; tickerMkt.g.vol = 9.8e10; tickerMkt.f = { value: 50, label: 'Neutral' }; tickerMkt.alt = { value: 57 }; tickerMkt.eth = { price: 3100, ch24: 1.5 }; renderPulse(); _tickerKey = ''; renderBtcTicker()")
    pl = clean(pg.inner_text('#hmPulse')).replace('\n', ' ')
    hs = pg.evaluate("[...document.querySelectorAll('#hmPulse a.mk-t')].map(a => {const r = a.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]})")
    check('📈 the three cards are the same height and line up', len(hs) == 3 and len({h[0] for h in hs}) == 1 and len({h[1] for h in hs}) == 1, hs)
    tt = pg.evaluate("[...document.querySelectorAll('#hmPulse a.mk-t .mk-k')].map(e => Math.round(e.getBoundingClientRect().top))")
    check('📈 the three titles sit on one line', len(tt) == 3 and max(tt) - min(tt) <= 1, tt)
    fb = pg.evaluate("(()=>{const f=document.getElementById('cpAiFab'), n=document.getElementById('cpBnav'); if(!f||!n) return null; const a=f.getBoundingClientRect(), b=n.getBoundingClientRect(); return [Math.round(a.bottom), Math.round(b.top)]})()")
    check('🤖 the AI button sits low, just above the bottom bar', fb is None or 0 <= fb[1] - fb[0] <= 20, fb)
    check('📈 three cards: Fear & Greed 50 Neutral (gauge) · Altcoin Season 57/100 · Market dominance BTC 58.7% · ETH 11.2% · USDT 4.9%', 'Neutral' in pl and '57' in pl and 'Leaning altcoins' in pl and '58.7%' in pl and '11.2%' in pl and '4.9%' in pl and pg.locator('#hmPulse .mk-g').count() == 1 and pg.locator('#hmPulse a.mk-t[href="./market.html"]').count() == 3, pl)
    tk = clean(pg.inner_text('#btcTickerTrack .btc-ticker-group'))
    check('…the moving line: BTC, market cap, 24h volume, ETH — no Fear & Greed / Altcoin Season / dominance, and no links', 'BTC / USD' in tk and 'Market Cap' in tk and '24h volume' in tk and 'ETH' in tk and 'Fear' not in tk and 'Altcoin Season' not in tk and 'Dominance' not in tk and pg.locator('#btcTicker a').count() == 0, tk)
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
    look = "(id => { const c = document.getElementById(id), s = getComputedStyle(c); return [s.fontFamily, s.lineHeight, Math.round(c.getBoundingClientRect().height)] })"
    ov = pg.evaluate(look + "('netWorthCard')")
    pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(900)
    hv = clean(pg.inner_text('#hovNwCard')) if pg.is_visible('#hovNwCard') else ''
    check('Net worth looks the same on Overview and Allocation (font, line height, size)', pg.evaluate(look + "('hovNwCard')") == ov and 'Inter' in ov[0].split(',')[0], ov)
    check('Allocation: the same Net worth card on top (every part, cash included)', 'Net worth' in hv and 'Cash & certificates' in hv and clean(pg.inner_text('#nwUsd')) in hv, hv)
    pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(500)
    pg.evaluate("openCoinTx('BTC')"); pg.wait_for_timeout(900)
    check('a coin\'s Transactions: no Net worth card there', not pg.is_visible('#hovNwCard') and pg.is_visible('#holdingsOverlay'), pg.evaluate("[holdingsOverlay.dataset.mode, holdingsOverlay.dataset.view]"))
    pg.evaluate("hovBack()"); pg.wait_for_timeout(600)
    # no cash → no Net worth card; Total Portfolio leads
    pg.evaluate("Samsam.setCash([])"); pg.wait_for_timeout(800); pg.evaluate("renderAll()"); pg.wait_for_timeout(300)
    check('no cash → no Net worth card (Total Portfolio leads)', not pg.is_visible('#netWorthCard') and not pg.is_visible('#cashCard'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
