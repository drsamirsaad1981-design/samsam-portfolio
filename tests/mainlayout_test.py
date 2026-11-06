"""Main page: table = 7 columns (Asset · Holdings · Avg. Buy Price · Cost Basis · P&L · Signal · Actions), no #, vs BTC, Notes;
cards = asset + badge | P&L, 2×2 grid (Holdings · Avg. Buy Price · Cost Basis · Signal), Buy · Sell · ⋯; Notes in the ⋯ menu with a 📝 marker."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900})), ('laptop', dict(viewport={'width': 1024, 'height': 768}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
        hd = pg.evaluate("[...document.querySelectorAll('#portfolioTable thead th')].map(t => t.innerText.split('\\n')[0].trim())")
        check(f'{name}: table = 7 columns in order', hd == ['Asset', 'Holdings', 'Avg. Buy Price', 'Cost Basis', 'All Time Profit', 'Signal', 'Actions'], hd)
        cells = pg.evaluate("[...document.querySelectorAll('#tableBody tr')].every(r => r.cells.length === 7)")
        check(f'{name}: every row has 7 cells; no notes inputs / vs BTC badges', cells and pg.locator('.note-input').count() == 0 and pg.locator('#portfolioTable .perf-badge').count() == 0)
        if name != 'phone':
            w = pg.evaluate("(() => { const w = document.getElementById('portfolioTableWrapper'); return [w.scrollWidth, w.clientWidth, getComputedStyle(w).overflowY, getComputedStyle(document.querySelector('#portfolioTable thead th')).position]; })()")
            check(f'{name}: no sideways scroll; own scroll box with sticky header', w[0] <= w[1] + 1 and w[2] == 'auto' and w[3] == 'sticky', w)
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
        card = pg.evaluate("""(() => { const c = document.querySelector('#coinsStack .coin-card'); return { pnl: !!c.querySelector('.coin-card-header .card-pnl .card-pnl-usd'), cat: !!c.querySelector('.coin-card-header .ast .cat-tag'),
          labels: [...c.querySelectorAll('.card-stats-grid .coin-metric > label')].map(l => l.innerText.trim()), btns: [...c.querySelectorAll('.card-actions-footer button')].map(b => b.innerText.trim()),
          gone: !c.querySelector('.note-input, .coin-card-footer, .perf-badge, .card-cat-row'), cols: getComputedStyle(c.querySelector('.card-stats-grid')).gridTemplateColumns.split(' ').length }; })()""")
        check(f'{name}: card = asset + badge | P&L, 2×2 Holdings · Avg. Buy Price · Cost Basis · Signal, Buy · Sell · ⋯', card['pnl'] and card['cat'] and card['labels'] == ['Holdings', 'Avg. Buy Price', 'Cost Basis', 'Signal'] and card['btns'] == ['+ Buy', '− Sell', '⋯'] and card['gone'] and card['cols'] == 2, card)
        pnl_ok = pg.evaluate("""(() => { const c = [...document.querySelectorAll('#coinsStack .coin-card')].find(x => x.querySelector('.ast-sym').textContent.startsWith('SOL')); const p = Samsam.getState().portfolio.find(x => x.sym === 'SOL');
          const rz = (Samsam.getState().realized.bySym || {}).SOL || {}; const v = p.qty * (p.currentPrice - p.basePrice) + (rz.realized || 0); return [c.querySelector('.card-pnl-usd').textContent, v]; })()""")
        check(f'{name}: card All Time Profit = sells + Holdings − Cost Basis', abs(float(re.sub(r'[^\d.\-]', '', pnl_ok[0].replace('−', '-'))) - pnl_ok[1]) < 0.01, pnl_ok)
        check(f'{name}: no sideways page scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        if name == 'phone':
            # Note: ⋯ → Add Note → 📝 appears next to the symbol (table + cards) → tap → edit → empty removes it
            pg.evaluate("window.__cpAutoAnswer = (kind, msg, o) => kind === 'prompt' ? 'Stake on Phantom' : true")
            pg.locator('#coinsStack .coin-card', has=pg.locator('.ast-sym:text-matches("^SOL")')).locator('.btn-more').click(); pg.wait_for_timeout(300)
            items = pg.evaluate("[...document.querySelectorAll('.cpm [role=menuitem], .cpm button, .cpm a')].map(e => e.innerText.trim()).filter(Boolean)")
            check('⋯ menu: In · Out · History · Add Note · Liquidation Map · Price Prediction · Remove', any('Add Note' in x for x in items) and any('History' in x for x in items) and any('Remove' in x for x in items), items)
            pg.locator('.cpm', has_text='Add Note').get_by_text('Add Note').click(); pg.wait_for_timeout(900)
            note = pg.evaluate("Samsam.getState().coins.find(c => c.sym === 'SOL').notes")
            dot = pg.evaluate("[...document.querySelectorAll('.note-dot')].map(b => b.title)")
            check('note saved and 📝 shows next to SOL (with the note as its tooltip)', note == 'Stake on Phantom' and 'Stake on Phantom' in dot, (note, dot))   # other coins may have notes too
            pg.evaluate("window.__cpAutoAnswer = (kind, msg, o) => kind === 'prompt' ? '' : true")
            sol = pg.locator('#coinsStack .coin-card', has=pg.locator('.ast-sym:text-matches("^SOL")'))
            sol.locator('.note-dot').click(); pg.wait_for_timeout(900)
            check('tapping 📝 edits it; empty removes the note and the 📝', pg.evaluate("Samsam.getState().coins.find(c => c.sym === 'SOL').notes || ''") == '' and sol.locator('.note-dot').count() == 0)
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'mainlayout_test: {sum(res)}/{len(res)} passed')
