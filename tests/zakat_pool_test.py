"""🕌 One zakat pool + ✓ Paid. Crypto + metals (platinum here) + cash + shares against one nisab (85 g of gold); the day's pool
is kept; ten days after the day it is still DUE (past nothing — it stays until paid) with a ✓ Paid button; Paid saves the
amount for that hijri year (in the backup too), the line says "paid ✓" and the next day stays put; ↶ undoes it. Arabic too."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
NOW = datetime.datetime.now(datetime.timezone.utc)
SNAP = {'updated': NOW.isoformat(), 'parts': {'metals': NOW.isoformat(), 'fx': NOW.isoformat()}, 'fx': {'EGP': {'rate': 50}},
        'metals': [{'k': 'gold', 'price': 3110.35, 'ch24': 0}, {'k': 'platinum', 'price': 1000, 'ch24': 0}]}
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
HJ = "(off => { const o = {}; new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Riyadh' }).formatToParts(new Date(Date.now() + off * 864e5)).forEach(p => { o[p.type] = parseInt(p.value, 10); }); return o; })"
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script(f"window.__marketSnap = '{SITE}/__snap/market.json';")
    ctx.route('**/__snap/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SNAP)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    # platinum + cash, so the pool has metals and cash
    pg.evaluate("Samsam.addCoin({ sym: 'XPT', name: 'Platinum', cat: 'metals', cls: 'metal' }, { qty: 2, price: 900 })")
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'USD', amount: 3000, label: 'Bank' }])"); pg.wait_for_timeout(600)
    pg.evaluate("SamsamCoins.feedSnapMetals(true)"); pg.wait_for_function("(Samsam.getPrices().XPT || {}).usd > 0", timeout=8000)
    # ── before the day: an estimate, by part
    f = pg.evaluate(HJ + "(20)"); pg.evaluate(f"Samsam.setZakatDay({{ m: {f['month']}, d: {f['day']} }})"); pg.wait_for_timeout(500); pg.evaluate("renderAll()"); pg.wait_for_timeout(600)
    z = pg.evaluate("(() => { const z = zkNow; return z && { state: z.state, metal: z.pool.metal, cash: z.pool.cash, crypto: z.pool.crypto, value: z.value }; })()")
    line = clean(pg.inner_text('#zakatLine'))
    check('one pool: crypto + metals (2 oz platinum = $2,000) + cash $3,000', z and abs(z['metal'] - 2000) < 0.01 and abs(z['cash'] - 3000) < 0.01 and abs(z['value'] - z['crypto'] - 5000) < 0.05, z)
    check('…20 days before: "in N days" with today\'s estimate, by part (crypto · metals · cash)', z['state'] == 'upcoming' and 'metals $2,000.00' in line and 'cash $3,000.00' in line and 'crypto' in line, line)
    # ── ten days after the day, the day's pool kept → still due, with ✓ Paid
    a = pg.evaluate(HJ + "(-10)")
    pg.evaluate(f"Samsam.setZakatDay({{ m: {a['month']}, d: {a['day']} }})"); pg.evaluate(f"Samsam.setZakat({{ hy: {a['year']}, value: 50000, nisabUsd: 9000, date: '2026-01-01' }})"); pg.wait_for_timeout(700); pg.evaluate("renderAll()"); pg.wait_for_timeout(500)
    line = clean(pg.inner_text('#zakatLine'))
    check('10 days after the day: still DUE — $1,250.00 (2.5% of the day\'s $50,000), a banner with ✓ Paid', 'due' in line and '$1,250.00' in line and '$50,000.00' in line and pg.is_visible('#zakatLine .zk-paid') and 'zk-due' in pg.get_attribute('#zakatLine', 'class'), line)
    pg.evaluate(f"Samsam.setZakatDay({{ m: {a['month']}, d: {a['day']} }})")
    a40 = pg.evaluate(HJ + "(-45)")
    # ── ✓ Paid
    pg.click('#zakatLine .zk-paid'); pg.wait_for_timeout(900)
    paid = pg.evaluate("Samsam.getZakatPaid()")
    line = clean(pg.inner_text('#zakatLine'))
    check('✓ Paid → saved for that hijri year: $1,250 USD, today\'s date', len(paid) == 1 and paid[0]['hy'] == a['year'] and paid[0]['paid'] == 1250 and paid[0]['cur'] == 'USD', paid)
    check('…the line: "paid ✓ $1,250.00", the next day in ~344 days (the year stays on its day)', 'paid ✓' in line and '$1,250.00' in line and 'next' in line and not pg.is_visible('#zakatLine .zk-paid'), line)
    check('…kept in the backup / automatic copy', (pg.evaluate("Samsam.settingsNow().info.zakatPaid") or [{}])[0].get('hy') == a['year'])
    # ↶ undo
    pg.click('#zakatLine .zk-undo'); pg.wait_for_timeout(900)
    check('↶ undo → due again', pg.evaluate("Samsam.getZakatPaid().length") == 0 and pg.is_visible('#zakatLine .zk-paid'))
    # a paid amount in EGP
    pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? '62,500 EGP' : true"); pg.click('#zakatLine .zk-paid'); pg.wait_for_timeout(900)
    paid = pg.evaluate("Samsam.getZakatPaid()")
    check('Paid typed as "62,500 EGP" → kept in EGP', paid and paid[0]['paid'] == 62500 and paid[0]['cur'] == 'EGP' and '62,500 EGP' in clean(pg.inner_text('#zakatLine')), paid)
    pg.evaluate("Samsam.unmarkZakatPaid(%d)" % a['year']); pg.wait_for_timeout(600)
    # ── nobody was there on the day (no visit in its month, no bot): the year stays open for an account that existed then
    pg.evaluate(f"Samsam.setZakatDay({{ m: {a40['month']}, d: {a40['day']} }})"); pg.wait_for_timeout(500)
    late = pg.evaluate("""(() => { const st = Samsam.getState(), now = Date.now(), f = since => { const z = SamsamCoins.zakatCrypto(st, 3110.35, now, null, since === undefined ? { cashUsd: 3000 } : { cashUsd: 3000, since }); return z && { state: z.state, late: !!z.late, fixed: z.fixed, hy: z.yearHy, zakat: z.zakatUsd, today: z.today }; };
      return { old: f(now - 200 * 864e5), fresh: f(now - 5 * 864e5), own: f(), seen: Samsam.core.firstSeen(st.coins) > now - 864e5 }; })()""")
    check('45 days after the day, its pool never kept, the account already there → still DUE at today\'s value (late), for that hijri year', late['old'] and late['old']['state'] == 'due' and late['old']['late'] and not late['old']['fixed'] and late['old']['hy'] == a40['year'] and abs(late['old']['zakat'] - late['old']['today'] * 0.025) < 0.01, late['old'])
    check('…an account that began after that day (5 days ago; this test\'s own, begun today) owes nothing for it', late['fresh']['state'] == 'upcoming' and not late['fresh']['late'] and late['own']['state'] == 'upcoming' and not late['own']['late'] and late['seen'], late)
    pg.evaluate(f"Samsam.setZakatDay({{ m: {a['month']}, d: {a['day']} }})"); pg.wait_for_timeout(500); pg.evaluate("renderAll()"); pg.wait_for_timeout(400)
    # metals cards: no separate gold / silver zakat any more
    check('the Metals card has no zakat line of its own (metals are in the pool)', '🕌' not in pg.inner_text('#metalsCard'))
    pg.screenshot(path=str(SH / 'zakat_due.png'))
    # Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(2000); pg.evaluate("renderAll()"); pg.wait_for_timeout(600)
    line = pg.inner_text('#zakatLine')
    check('Arabic: الزكاة مستحقة · ✓ دفعت', 'مستحقة' in line and 'دفعت' in line, line)
    pg.screenshot(path=str(SH / 'zakat_due_ar.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
