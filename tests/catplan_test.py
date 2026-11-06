"""Accumulation: change a coin's category from its card or table row (same shared dialog as the main page).
A coin you hold → saved on the coin (main page follows); one you don't hold → saved with the plan (survives a reload,
custom names too) and Add Coin starts from it on the first Buy."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
        pg.evaluate("Samsam.saveAccumPlan([...Samsam.getState().accumPlan.filter(e => e.sym !== 'ZZTEST'), { sym: 'ZZTEST', name: 'Zz Test', targetQty: 5, addedAt: '2026-10-24T00:00:00Z' }])"); pg.wait_for_timeout(600)
        pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        pg.evaluate("setView('cards')"); pg.wait_for_timeout(300)
        # owned coin
        card = pg.locator('#cardsView .coin-card', has_text='SOL').first
        check(f'{name}: card has the category tag with ✎', card.locator('.category-badge-editable .cat-edit').count() == 1)
        card.locator('.cat-edit').click(); pg.wait_for_timeout(300)
        st = pg.evaluate("({ open: catEditModal.classList.contains('show'), title: ceTitle.innerText })")
        check(f'{name}: ✎ opens Change category for that coin', st['open'] and st['title'] == 'Category — SOL', st)
        if name == 'phone': pg.screenshot(path=str(SH / 'catplan-dialog.png'))
        pg.select_option('#ceCat', 'web3', force=True); pg.click('#ceSave'); pg.wait_for_timeout(900)
        check(f'{name}: saved on the coin (portfolio) and the card shows it', pg.evaluate("getPortfolioCoin('SOL').cat") == 'web3' and 'Web3' in pg.locator('#cardsView .coin-card', has_text='SOL').first.locator('.cat-tag').inner_text(), pg.evaluate("getPortfolioCoin('SOL').cat"))
        # not owned: custom category
        pg.locator('#cardsView .coin-card', has_text='ZZTEST').first.locator('.cat-tag').click(); pg.wait_for_timeout(300)
        check(f'{name}: tag of a coin you don\'t own opens the dialog too ("saved with your plan")', 'saved with your plan' in pg.inner_text('#ceCoin'), pg.inner_text('#ceCoin'))
        pg.select_option('#ceCat', 'other', force=True); pg.fill('#ceCustom', 'Moon Bets'); pg.click('#ceSave'); pg.wait_for_timeout(900)
        e = pg.evaluate("accumPlan.find(x => x.sym === 'ZZTEST')")
        check(f'{name}: not owned → saved in the plan with its name', e.get('cat', '').startswith('x-') and e.get('catLabel') == 'Moon Bets', e)
        pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500); pg.evaluate("setView('table')"); pg.wait_for_timeout(300)
        row = pg.locator('#accTableBody tr', has_text='ZZTEST').first
        check(f'{name}: after a reload the table row shows "Moon Bets" with ✎', 'Moon Bets' in row.locator('.cat-tag').inner_text() and row.locator('.cat-edit').count() == 1, row.inner_text()[:120])
        row.locator('.row-buy').click(); pg.wait_for_timeout(400)
        f = pg.evaluate("({ cat: acCat.value, label: acCat.options[acCat.selectedIndex].text })")
        check(f'{name}: ➕ Buy starts Add Coin from that category (one of your categories)', f['cat'] == e['cat'] and f['label'] == 'Moon Bets', f)
        pg.fill('#acQty', '2'); pg.fill('#acPrice', '3'); pg.click('#acSave'); pg.wait_for_timeout(1200)
        c = pg.evaluate("(Samsam.getState().coins.find(c => c.sym === 'ZZTEST') || {})")
        check(f'{name}: the new coin keeps the category and its name', c.get('cat') == e['cat'] and c.get('catLabel') == 'Moon Bets', {k: c.get(k) for k in ('cat', 'catLabel')})
        pg.evaluate("Samsam.removeCoin('ZZTEST')"); pg.wait_for_timeout(400)
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        check(f'{name}: main page shows SOL in Web3 (same coin data)', pg.evaluate("portfolio.find(c => c.sym === 'SOL').cat") == 'web3')
        pg.evaluate("openCatEdit('SOL')"); pg.wait_for_timeout(300)
        pg.select_option('#ceCat', e['cat'], force=True); pg.click('#ceSave'); pg.wait_for_timeout(800)
        check(f'{name}: main page: picking one of your own categories from the list saves (no "type a name")', pg.evaluate("portfolio.find(c => c.sym === 'SOL').cat") == e['cat'] and not pg.evaluate("catEditModal.classList.contains('show')"), pg.inner_text('#ceError'))
        pg.evaluate("Samsam.setCategory('SOL', null)"); pg.wait_for_timeout(500)
        pg.evaluate("Samsam.saveAccumPlan(Samsam.getState().accumPlan.filter(e => e.sym !== 'ZZTEST'))"); pg.wait_for_timeout(500)
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'catplan_test: {sum(res)}/{len(res)} passed')
