"""PDF + CSV carry the whole wealth: Net worth by part (cash included), metals in grams, zakat and the market's three numbers."""
import sys, pathlib, csv, io
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
from playwright.sync_api import sync_playwright
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:500]}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(3000)
    pg.evaluate("Samsam.addCoin({ sym: 'XAU', name: 'Gold', cat: 'metals' }, { qty: 1, price: 2000, date: '2025-01-01T00:00:00Z' })"); pg.wait_for_timeout(800)
    pg.evaluate("Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'USD', amount: 20000, label: 'Bank' }, { id: 'c2', kind: 'cert', cur: 'USD', amount: 5000, label: 'Cert', rate: 10, start: '2026-01-01', months: 36, pay: 'month' }])"); pg.wait_for_timeout(2500)
    app = pg.evaluate("({ nw: document.getElementById('nwUsd').textContent, tot: document.getElementById('totalUsd').textContent, W: wealthNow() })")
    # ── PDF ──
    pg.evaluate("(()=>{window.__printed=0; window.print=function(){window.__printed++}})()"); pg.evaluate("exportPdf()"); pg.wait_for_timeout(700)
    st = pg.evaluate("""(()=>{const q=s=>document.querySelector('#pdfSummary '+s); const T=e=>e?e.innerText.replace(/\\s+/g,' ').trim():'';
      return {nwt:T(q('.ps-nwt')), rows:[...document.querySelectorAll('#pdfSummary .ps-nwi')].map(T), pct:[...document.querySelectorAll('#pdfSummary .ps-nwi strong')].map(e=>parseFloat(e.textContent)),
        note:T(q('.ps-note')), facts:T(q('.ps-facts')), hold:T(document.querySelectorAll('#pdfSummary .ps-tile')[3]), donut:[...document.querySelectorAll('#pdfSummary .ps-li b')].map(b=>parseFloat(b.textContent)).reduce((a,b)=>a+b,0)}})()""")
    check('PDF: Net worth = the card on the page', st['nwt'] == app['nw'], (st['nwt'], app['nw']))
    check('PDF: every part with its share, cash included, ≈100%', any('Cash & certificates' in r for r in st['rows']) and any('Metals' in r for r in st['rows']) and any('Bitcoin' in r for r in st['rows']) and abs(sum(st['pct']) - 100) < 0.5, st['rows'])
    check('PDF: says profit / allocation are on the portfolio only', app['tot'] in st['note'] and 'portfolio only' in st['note'], st['note'])
    check('PDF: holdings by kind (coins · metals)', 'coins' in st['hold'] and '1 metal' in st['hold'] and '1 metals' not in st['hold'], st['hold'])
    check('PDF: the zakat line, when there is one, says it is an estimate, not a fatwa', 'Zakat' not in st['facts'] or 'an estimate, not a fatwa' in st['facts'], st['facts'])
    check('PDF: market line (Fear & Greed, dominance)', 'Fear & Greed' in st['facts'] and 'Dominance BTC' in st['facts'], st['facts'])
    check('PDF: the allocation donut still adds up on its own', 99 <= st['donut'] <= 101, st['donut'])
    # ── CSV ──
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.evaluate("exportData()")
    rows = list(csv.reader(io.StringIO(open(dl.value.path(), encoding='utf-8-sig').read())))
    i = rows.index([]); table, extra = rows[:i], rows[i + 1:]
    xau = next(r for r in table if r[1] == 'XAU')
    check('CSV: gold is a Metal, in grams (31.1035 g for 1 oz)', xau[14] == 'Metal' and xau[15] == 'g' and abs(float(xau[16]) - 31.1035) < 0.01 and abs(float(xau[4]) - 1) < 1e-9 and xau[12] == '' and next(r for r in table if r[1] == 'BTC')[12] == 'Hold', xau)
    cash = [r for r in extra if len(r) > 3 and r[2] in ('Cash', 'Certificate')]
    check('CSV: cash and the certificate listed with their dollar value', len(cash) == 2 and cash[0][1] == 'Bank' and float(cash[0][6]) == 20000 and cash[1][2] == 'Certificate' and float(cash[1][6]) >= 5000 and cash[1][8] == '2029-01-01', cash)
    nw = next(r for r in extra if len(r) > 1 and r[1] == 'Net worth'); pf = next(r for r in extra if len(r) > 1 and r[1].startswith('Total portfolio'))
    parts = [r for r in extra if len(r) > 3 and r[0] == '' and r[3] not in ('', '100.00')]
    check('CSV: Net worth = portfolio + cash = the app', abs(float(nw[2]) - app['W']['total']) < 0.01 and abs(float(pf[2]) - app['W']['portfolio']) < 0.01 and abs(float(nw[2]) - float(pf[2]) - app['W']['cash']) < 0.02, (nw, pf))
    check('CSV: the parts add up to the Net worth, shares to 100%', abs(sum(float(r[2]) for r in parts) - float(nw[2])) < 0.05 and abs(sum(float(r[3]) for r in parts) - 100) < 0.1, parts)
    check('no JS errors', not errs, errs[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
