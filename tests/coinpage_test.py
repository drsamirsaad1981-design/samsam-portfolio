"""Coin page (Asset Command Center): Liq Map · Prediction · CMC links on one line; cards Holdings (value • 24h / amount) ·
Avg. Buy Price · Cost Basis · All Time Profit; Signal line with ✏️; Asset Strategy & Notes auto-saves (same note as ⋯ / 📝)."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('small', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html#holdings/SOL'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        links = pg.evaluate("[...document.querySelectorAll('.quick-links-row a')].map(a => [a.textContent.replace(/\\s+/g,' ').trim(), a.target, a.href, Math.round(a.getBoundingClientRect().top), a.scrollWidth <= a.clientWidth + 1])")
        check(f'{name}: 3 links on one line (Liq Map · Prediction · CMC), new tab, nothing cut', [l[0] for l in links] == ['Liq.Map', 'Prediction', 'CMC'] and all(l[1] == '_blank' and l[4] for l in links) and len({l[3] for l in links}) == 1 and 'coinmarketcap.com/currencies/solana' in links[2][2], links)
        labels = pg.evaluate("[...document.querySelectorAll('.htx-cards .htx-label')].map(l => l.innerText.trim())")
        check(f'{name}: cards in order Holdings · Avg. Buy Price · Cost Basis · All Time Profit', labels == ['Holdings', 'Avg. Buy Price', 'Cost Basis', 'All Time Profit'], labels)
        c = pg.evaluate("(() => { const c = Samsam.getState().portfolio.find(x => x.sym === 'SOL'); return [c.qty, c.currentPrice, c.change24h]; })()")
        hv, hq = pg.inner_text('#htxHoldings'), pg.inner_text('#htxHoldings24')
        check(f'{name}: Holdings = value • 24h, amount under it', re.search(r'\$[\d,]+\.\d\d\s*• [+−][\d.]+%', hv) and abs(float(re.sub(r'[^\d.]', '', hv.split('•')[0])) - c[0] * c[1]) < 0.01 and hq.endswith(' SOL'), (hv, hq, c))
        sig = pg.inner_text('#htxSignal')
        check(f'{name}: Signal line with the badge, the % vs Avg. Buy Price and ✏️', re.search(r'(Hold|Reinforce|Sell / Convert)', sig) and 'vs your Avg. Buy Price' in sig and pg.locator('#htxSignal .val-edit').count() == 1, sig)
        check(f'{name}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1 && document.getElementById('holdingsOverlay').scrollWidth <= innerWidth + 1"))
        if name == 'phone':
            pg.click('#htxSignal .val-edit'); pg.wait_for_timeout(300)
            check('Signal ✏️ opens Signal Thresholds', pg.is_visible('#sgModal .bl-card')); pg.evaluate("closeSignalEdit()")
            # notes: auto-save, multi-line, up to 1000 characters, same note everywhere
            long = 'Target 250 by Q2.\nAdd below 120.\n' + 'x' * 900
            pg.fill('#htxNote', long); pg.wait_for_timeout(300)
            check('typing shows "Typing…"', pg.inner_text('#htxNoteSt') == 'Typing…')
            pg.wait_for_timeout(2200)
            st_txt = pg.inner_text('#htxNoteSt')
            pg2 = ctx.new_page(); pg2.goto(S.SITE + '/index.html'); S.wait_ready(pg2); pg2.wait_for_timeout(800)   # what the cloud holds (this page waits until you leave the box to redraw)
            saved = pg2.evaluate("Samsam.getState().coins.find(c => c.sym === 'SOL').notes"); pg2.close()
            check('auto-saved after a pause while still typing (lines kept, > 500 characters)', saved == long and st_txt == 'Saved ✓', (len(saved or ''), st_txt))
            pg.evaluate("Samsam.updateCoin('ETH', { notes: 'eth note' })"); pg.wait_for_timeout(500)
            check('typing is never overwritten by a live update', pg.input_value('#htxNote') == long)
            pg.locator('#htxNote').blur(); pg.wait_for_timeout(500)
            pg.evaluate("selectCoinTx('ETH')"); pg.wait_for_timeout(500)
            check('switching coin shows that coin\'s note', pg.input_value('#htxNote') == 'eth note')
            pg.evaluate("selectCoinTx('SOL')"); pg.wait_for_timeout(400)
            pg.evaluate("closeCoinTx(); closeHoldingsView(); applyView('cards')"); pg.wait_for_timeout(500)
            dot = pg.evaluate("(() => { const c = [...document.querySelectorAll('#coinsStack .coin-card')].find(x => x.querySelector('.ast-sym').textContent.startsWith('SOL')); const b = c && c.querySelector('.note-dot'); return b ? b.title : null; })()")
            check('same note on the main page (📝 tooltip)', dot == long, (dot or '')[:40])
            pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? 'from the menu' : true; editNote('SOL')"); pg.wait_for_timeout(900)
            pg.evaluate("openHoldingsView(); openCoinTx('SOL')"); pg.wait_for_timeout(600)
            check('…and a note edited from ⋯ shows in the box', pg.input_value('#htxNote') == 'from the menu')
            pg.fill('#htxNote', ''); pg.locator('#htxNote').blur(); pg.wait_for_timeout(900)
            check('emptying it (leaving the box saves at once) removes the note', (pg.evaluate("Samsam.getState().coins.find(c => c.sym === 'SOL').notes") or '') == '')
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'coinpage_test: {sum(res)}/{len(res)} passed')
