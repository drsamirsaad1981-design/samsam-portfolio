"""The AI report's data carries the whole wealth: kinds (crypto / metal in grams / share), Net worth with cash, zakat, and the rules."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
from playwright.sync_api import sync_playwright
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:500]}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1280, 'height': 900}); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(3000)
    pg.evaluate("Samsam.addCoin({ sym: 'XAU', name: 'Gold', cat: 'metals' }, { qty: 2, price: 2000, date: '2025-01-01T00:00:00Z' })"); pg.wait_for_timeout(800)
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'USD', amount: 20000, label: 'Bank' }, { id: 'c2', kind: 'cert', cur: 'USD', amount: 5000, label: 'Cert', rate: 10, start: '2026-01-01', months: 36, pay: 'month' }])"); pg.wait_for_timeout(2500)
    for lang in ('en', 'ar'):
        r = pg.evaluate("l => aiRequestParts(l)", lang); pd, cx = r['portfolioData'], r['accumContext']; nw = pd['stats']['netWorth']
        xau = next(c for c in pd['coins'] if c['sym'] == 'XAU'); app = pg.evaluate("({ nw: document.getElementById('nwUsd').textContent, W: wealthNow() })")
        check(f'{lang}: gold is a metal, in grams, with no Signal', xau['kind'] == 'metal' and abs(xau['grams'] - 62.21) < 0.01 and xau['signal'].startswith('none'), xau)
        check(f'{lang}: crypto keeps its kind and Signal', all(c['kind'] == 'crypto' and not c['signal'].startswith('none') for c in pd['coins'] if c['sym'] != 'XAU'), [(c['sym'], c.get('kind'), c.get('signal')) for c in pd['coins']][:6])
        check(f'{lang}: Net worth = the page (portfolio + cash), parts ≈100%', abs(nw['totalUsd'] - app['W']['total']) < 0.01 and abs(nw['portfolioUsd'] - pd['stats']['total']) < 0.01 and abs(sum(x['pct'] for x in nw['parts']) - 100) < 0.3 and any(x['part'].startswith('Cash') for x in nw['parts']), nw)
        check(f'{lang}: cash and the certificate listed (rate, maturity)', len(nw['cashAndCertificates']) == 2 and nw['cashAndCertificates'][1]['maturity'] == '2029-01-01' and nw['cashAndCertificates'][1]['ratePctYear'] == 10, nw.get('cashAndCertificates'))
        check(f'{lang}: the wealth block and its rules reach the prompt', 'Net worth $' in cx and 'XAU 62.21 g' in cx and 'CRYPTO only' in cx and 'PORTFOLIO only' in cx and 'Cert' in cx, cx[-2500:])
        check(f'{lang}: the layout asks for the Net worth bullet', ('**Net worth:**' if lang == 'en' else '**صافي الثروة:**') in cx)
        check(f'{lang}: "coins beating BTC" counts crypto only', pd['stats']['coinsBeatingBtc'].endswith(f" of {sum(1 for c in pd['coins'] if c['kind'] == 'crypto' and c['sym'] != 'BTC' and c['qty'] > 0)}"), pd['stats']['coinsBeatingBtc'])
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
