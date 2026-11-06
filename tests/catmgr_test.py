"""Manage Categories: rename (built-in + your own), colour, new, delete, reset — saved once, every page and a second
device follow live; Change Category shows a dark list (not the phone's white picker)."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
    # a second device on another page
    ctx2 = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx2); d2 = ctx2.new_page(); d2.on('pageerror', lambda e: errs.append(str(e)))
    d2.goto(S.SITE + '/index.html'); d2.click('#samsamSignInBtn'); S.wait_ready(d2); d2.goto(S.SITE + '/allocation.html'); d2.wait_for_timeout(1000); S.wait_ready(d2); d2.wait_for_timeout(800)
    # Change Category: dark list + Manage link
    pg.evaluate("applyView('cards')"); pg.wait_for_timeout(300)
    pg.evaluate("openCatEdit('SOL')"); pg.wait_for_timeout(400)
    lst = pg.evaluate("(() => { const l = document.getElementById('ceList'); return { n: l.querySelectorAll('.ce-opt').length, on: (l.querySelector('[aria-checked=true] .ce-name') || {}).textContent, bg: getComputedStyle(document.querySelector('#catEditModal .atx-modal')).backgroundColor, sel: getComputedStyle(document.getElementById('ceCat')).display }; })()")
    check('Change Category: dark list with every category (current ticked), no system picker', lst['n'] >= 10 and lst['on'] == 'Layer 1 Blockchains' and lst['sel'] == 'none' and lst['bg'] != 'rgb(255, 255, 255)', lst)
    pg.screenshot(path=str(SH / 'catmgr-change.png'))
    pg.click('.ce-manage'); pg.wait_for_timeout(400)
    check('“Manage Categories” opens from Change Category', pg.is_visible('#catMgrModal .atx-modal') and pg.locator('#cmList .cm-row').count() >= 9)
    # rename a built-in
    pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? 'L1 Chains' : true")
    pg.click('#cmList .cm-row[data-k="layer1"] .cm-ren'); pg.wait_for_timeout(900)
    check('rename built-in: the list shows the new name + where it came from', 'L1 Chains' in pg.inner_text('#cmList .cm-row[data-k="layer1"]') and 'was “Layer 1 Blockchains”' in pg.inner_text('#cmList .cm-row[data-k="layer1"]'))
    # colour
    pg.click('#cmList .cm-row[data-k="layer1"] .cm-dot'); pg.wait_for_timeout(200)
    pg.click('#cmList .cm-row[data-k="layer1"] .cm-pal button[aria-label="Colour #14b8a6"]'); pg.wait_for_timeout(900)
    check('colour: picked from the palette', pg.evaluate("SamsamTaxonomy.color('layer1')") == '#14b8a6')
    # new category, then move a coin into it
    pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? 'Moon Bags' : true")
    pg.click('#catMgrModal .atx-save'); pg.wait_for_timeout(900)
    key = pg.evaluate("(SamsamTaxonomy.customs().find(c => c.label === 'Moon Bags') || {}).key")
    check('new category exists before any coin is in it', bool(key), key)
    pg.screenshot(path=str(SH / 'catmgr.png'))
    pg.evaluate("closeCatManager()"); pg.wait_for_timeout(300)
    check('back in Change Category, the new category is in the list', 'Moon Bags' in pg.inner_text('#ceList'))
    pg.locator('#ceList .ce-opt', has_text='Moon Bags').click(); pg.evaluate("saveCatEdit()"); pg.wait_for_timeout(1000)
    check('SOL moved into it', pg.evaluate("Samsam.getState().portfolio.find(c => c.sym === 'SOL').cat") == key)
    # rename your own category
    pg.evaluate("openCatManager()"); pg.wait_for_timeout(300)
    pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? 'Moonshots' : true")
    pg.click(f'#cmList .cm-row[data-k="{key}"] .cm-ren'); pg.wait_for_timeout(1000)
    pg.evaluate("closeCatManager(); closeCatEdit()"); pg.wait_for_timeout(500)
    tags = pg.evaluate("[...document.querySelectorAll('#coinsStack .cat-tag')].map(t => t.textContent.trim())")
    check('main page: tags follow both renames at once', 'Moonshots' in tags and 'L1 Chains' in tags and 'Moon Bags' not in tags and 'Layer 1 Blockchains' not in tags, sorted(set(tags)))
    # second device (Allocation, open the whole time) follows live
    d2.wait_for_timeout(1500); d2.click('#hovCatPicker .sdd-btn'); d2.wait_for_timeout(300)
    opts = d2.inner_text('.sdd-panel.show')
    check('another device (Allocation, already open) follows live: new names in its category list', 'Moonshots' in opts and 'L1 Chains' in opts, opts[:200])
    check('…and the new colour in its donut', '#14b8a6' in d2.evaluate("[...document.querySelectorAll('#hovDonut .donut-slice')].map(s => s.getAttribute('fill')).join(',')"))
    d2.keyboard.press('Escape')
    # other pages after reload
    for page, sel in (('performance.html', '#perfCatPicker .sdd-btn'), ('accumulation.html', None)):
        q = ctx.new_page(); q.goto(S.SITE + '/' + page); S.wait_ready(q); q.wait_for_timeout(1200)
        if sel: q.click(sel); q.wait_for_timeout(300)
        txt = q.evaluate("document.body.innerText")
        check(f'{page}: shows the new names', 'L1 Chains' in txt and 'Layer 1 Blockchains' not in txt, re.findall(r'Layer 1 Blockchains|L1 Chains', txt)[:3]); q.close()
    # duplicate names refused
    pg.evaluate("openCatManager()"); pg.wait_for_timeout(300)
    pg.evaluate("window.__cpAutoAnswer = (k, m, o) => k === 'prompt' ? 'moonshots' : true")
    pg.click('#catMgrModal .atx-save'); pg.wait_for_timeout(600)
    check('a name that already exists is refused', 'already a category' in pg.inner_text('#cmError'), pg.inner_text('#cmError'))
    # reset the built-in
    pg.click('#cmList .cm-row[data-k="layer1"] .cm-reset'); pg.wait_for_timeout(900)
    check('reset: built-in back to its name and colour', pg.evaluate("[SamsamTaxonomy.label('layer1'), SamsamTaxonomy.color('layer1')]") == ['Layer 1 Blockchains', '#3b82f6'])
    # delete your own → SOL back to its default
    pg.click(f'#cmList .cm-row[data-k="{key}"] .cm-del'); pg.wait_for_timeout(1200)
    st = pg.evaluate(f"[Samsam.getState().portfolio.find(c => c.sym === 'SOL').cat, SamsamTaxonomy.customs().some(c => c.key === '{key}')]")
    check('delete: category gone, SOL back to its default (Layer 1)', st == ['layer1', False], st)
    d2.wait_for_timeout(1500)
    check('second device: the deleted category is gone there too', d2.evaluate(f"!SamsamTaxonomy.customs().some(c => c.key === '{key}') && SamsamTaxonomy.label('layer1') === 'Layer 1 Blockchains'"))
    # main page Category card has the Manage entry
    pg.evaluate("closeCatManager()"); pg.wait_for_timeout(200)
    pg.click('#catPicker .sdd-btn'); pg.wait_for_timeout(300)
    pg.locator('.sdd-panel.show .sdd-opt', has_text='Manage Categories').click(); pg.wait_for_timeout(400)
    check('main page Category card → Manage Categories (the filter stays as it was)', pg.is_visible('#catMgrModal .atx-modal') and pg.evaluate("activeCatFilter") == '')
    pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(800)
    check('after a reload everything is as saved', pg.evaluate("SamsamTaxonomy.label('layer1')") == 'Layer 1 Blockchains')
    check('no page errors', not errs, errs)
    br.close()
print(f'catmgr_test: {sum(res)}/{len(res)} passed')
