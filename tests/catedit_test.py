"""Change category from a coin card / table row; custom category via Other; syncs to other devices and pages."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def cat(pg, sym): return pg.evaluate(f"(Samsam.getState().portfolio.find(c => c.sym === '{sym}') || {{}}).cat")
with sync_playwright() as p:
    br = p.chromium.launch()
    M = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(M)
    D = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(D)
    m, d = M.new_page(), D.new_page(); errs = []
    for pg in (m, d):
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
    m.evaluate("applyView('cards')"); m.wait_for_timeout(300)
    n = m.evaluate("[document.querySelectorAll('.coins-stack .cat-edit').length, portfolio.length]")
    check('mobile: every card has a category edit button', n[0] == n[1], n)
    btn = m.locator('.coins-stack .coin-card .cat-edit[aria-label$=" BTC"]')
    bb = btn.bounding_box(); check('mobile: edit button is a 28px touch target next to the tag', bb and round(bb['width']) == 28, bb)
    btn.scroll_into_view_if_needed(); btn.click(); m.wait_for_timeout(300)
    st = m.evaluate("({open: catEditModal.classList.contains('show'), title: ceTitle.innerText, val: ceCat.value, custom: !ceCustomBox.hidden, reset: !ceReset.hidden})")
    check('tap ✏️ opens Category — BTC with its current category, no custom box', st == {'open': True, 'title': 'Category — BTC', 'val': 'layer1', 'custom': False, 'reset': False}, st)
    # built-in change on a listed coin sticks (not reset by the default list)
    m.select_option('#ceCat', 'defi', force=True); m.click('#catEditModal .btn-primary'); m.wait_for_timeout(900)
    check('BTC moved to DeFi & RWA (overrides default list)', cat(m, 'BTC') == 'defi' and not m.evaluate("catEditModal.classList.contains('show')"), cat(m, 'BTC'))
    m.reload(); S.wait_ready(m); m.wait_for_timeout(1500)
    check('…still DeFi after refresh (not reset to Layer 1)', cat(m, 'BTC') == 'defi', cat(m, 'BTC'))
    check('…and on the desktop live', d.evaluate("(Samsam.getState().portfolio.find(c=>c.sym==='BTC')||{}).cat") == 'defi')
    # Other → custom name
    m.evaluate("applyView('cards')"); m.wait_for_timeout(300)
    m.locator('.coins-stack .cat-edit[aria-label$=" SOL"]').click(); m.wait_for_timeout(200)
    m.select_option('#ceCat', 'other', force=True); m.wait_for_timeout(150)
    check('choosing Other shows "Enter Custom Category..." box', m.evaluate("!ceCustomBox.hidden && ceCustom.placeholder === 'Enter Custom Category...' && document.activeElement === ceCustom"))
    m.screenshot(path=str(T / 'catedit-custom-mobile.png'))
    m.fill('#ceCustom', 'My Long Holds'); m.press('#ceCustom', 'Enter'); m.wait_for_timeout(900)
    k = cat(m, 'SOL')
    check('SOL saved in custom category', k and k.startswith('x-') and m.evaluate(f"SamsamTaxonomy.label('{k}')") == 'My Long Holds', k)
    tag = m.evaluate("document.querySelector('.coins-stack .cat-edit[aria-label$=\" SOL\"]').parentElement.querySelector('.cat-tag').innerText")
    check('SOL card tag shows "My Long Holds"', tag == 'My Long Holds', tag)
    opts = m.evaluate("catPickerDD && [...document.querySelectorAll('#catPickerDD')].length && (catPickerDD.setOptions, true)")
    m.click('#catPickerDD .sdd-btn'); m.wait_for_timeout(250)
    names = m.eval_on_selector_all('.sdd-panel.show .sdd-opt', 'e => e.map(x => x.innerText.split("\\n")[0])')
    check('custom category added to the main filter', 'My Long Holds' in names, names)
    m.click('.sdd-panel.show .sdd-opt:has-text("My Long Holds")'); m.wait_for_timeout(300)
    shown = m.evaluate("[...document.querySelectorAll('.coins-stack .coin-card')].filter(c => c.offsetParent).length")
    check('filtering by it shows only that coin', shown == 1, shown)
    m.evaluate("setCatFilter('', true)")
    # same name typed again (other case) → same category, no duplicate filter
    m.locator('.coins-stack .cat-edit[aria-label$=" ETH"]').click(); m.wait_for_timeout(200)
    check('your category is offered in the list', m.evaluate(f"[...ceCat.options].some(o => o.value === '{k}')"))
    m.select_option('#ceCat', 'other', force=True); m.fill('#ceCustom', 'my long holds'); m.click('#catEditModal .btn-primary'); m.wait_for_timeout(900)
    check('same name (any case) → same category, not a duplicate', cat(m, 'ETH') == k, cat(m, 'ETH'))
    # reset to default
    m.locator('.coins-stack .cat-edit[aria-label$=" BTC"]').click(); m.wait_for_timeout(200)
    check('locked coin offers "Use default (Layer 1 Blockchains)"', 'Layer 1 Blockchains' in m.inner_text('#ceReset') and m.is_visible('#ceReset'))
    m.click('#ceReset'); m.wait_for_timeout(900)
    check('reset returns BTC to Layer 1', cat(m, 'BTC') == 'layer1', cat(m, 'BTC'))
    # Escape / outside tap close
    m.locator('.coins-stack .cat-edit[aria-label$=" BTC"]').click(); m.wait_for_timeout(150); m.mouse.click(10, 10); m.wait_for_timeout(150)
    check('tap outside closes without saving', not m.evaluate("catEditModal.classList.contains('show')") and cat(m, 'BTC') == 'layer1')
    # desktop: table row edit + other pages see custom category
    d.wait_for_timeout(800); d.evaluate("applyView('table')"); d.wait_for_timeout(300)
    check('desktop table: edit button on every row', d.evaluate("document.querySelectorAll('#tableBody .cat-edit').length === document.querySelectorAll('#tableBody tr').length"))
    d.locator('#tableBody .cat-edit[aria-label$=" DOT"]').click(); d.wait_for_timeout(200); d.keyboard.press('Escape'); d.wait_for_timeout(150)
    check('desktop: Esc closes the dialog', not d.evaluate("catEditModal.classList.contains('show')"))
    tag_d = d.evaluate("document.querySelector('#tableBody .cat-edit[aria-label$=\" SOL\"]').parentElement.innerText.trim()")
    check('desktop table shows the custom category live', tag_d == 'My Long Holds', tag_d)
    d.screenshot(path=str(T / 'catedit-table-desktop.png'))
    for page in ['allocation.html', 'accumulation.html']:
        d.goto(S.SITE + '/' + page); S.wait_ready(d); d.wait_for_timeout(1500)
        if page == 'allocation.html': d.wait_for_timeout(1200); d.click('#hovCatPicker .sdd-btn'); d.wait_for_timeout(300)   # Allocation lives in Holdings; categories in its Category card
        check(f'{page}: knows "My Long Holds"', d.evaluate(f"SamsamTaxonomy.label('{k}')") == 'My Long Holds' and ('My Long Holds' in d.inner_text('body') or page == 'accumulation.html'), page)
    # add coin with custom category
    d.goto(S.SITE + '/index.html'); S.wait_ready(d); d.wait_for_timeout(800); d.on('dialog', lambda x: x.accept())
    d.evaluate("openAddCoin()"); d.select_option('#acCat', 'other')
    check('Add coin: Other shows the custom name box', d.is_visible('#acCatCustom'))
    d.evaluate("acSym.value='NEWC'; acQty.value='1'; acPrice.value='1'; acCatCustom.value='Moonshots'; applyAddCoin()"); d.wait_for_timeout(1200)
    nk = cat(d, 'NEWC')
    check('Add coin saves the new custom category', nk and nk.startswith('x-') and d.evaluate(f"SamsamTaxonomy.label('{nk}')") == 'Moonshots', nk)
    check('no horizontal overflow (mobile)', m.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    check('no JS errors', not errs, errs[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
