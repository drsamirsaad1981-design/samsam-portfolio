"""🧭 Phase 3 — classes above categories: Crypto · Stocks · Metals. With a share and a gold token held, the category
pickers (Performance list, Allocation) show each class with its categories under it, a class filters the list to it, the
Allocation donut has two rings (classes inside, categories outside) and one line per class, and the Overview's mini card
shows the classes. Arabic too. (One class only → the old flat list: covered by the other tests.)"""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
clean = lambda t: t.replace('⁦', '').replace('⁩', '')
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(1000)
    pg.evaluate("Samsam.addCoin({ sym: 'NVDAB', name: 'NVIDIA', cgId: 'nvidia-bstocks', cat: 'stocks', cls: 'stock' }, { qty: 10, price: 1 })")
    pg.evaluate("Samsam.addCoin({ sym: 'PAXG', name: 'PAX Gold', cgId: 'pax-gold', cat: 'metals' }, { qty: 5, price: 1 })")
    pg.evaluate("Samsam.addCoin({ sym: 'KAG', name: 'Kinesis Silver', cgId: 'kinesis-silver', cat: 'metals' }, { qty: 3, price: 1 })")
    pg.wait_for_function("['NVDAB','PAXG','KAG'].every(s => Samsam.getState().portfolio.some(c => c.sym === s && c.currentPrice > 0))", timeout=15000)
    pg.evaluate("renderAll()"); pg.wait_for_timeout(800)
    T = pg.evaluate("""(() => { const T = SamsamTaxonomy, pf = Samsam.getState().portfolio, rows = pf.map(c => ({ sym: c.sym, cat: c.cat, v: c.qty * c.currentPrice }));
      const t = T.tree(rows); return { cls: t.classes.map(c => [c.key, +c.v.toFixed(2), c.cats.map(k => k.key)]), all: t.all,
        nv: pf.find(c => c.sym === 'NVDAB'), px: pf.find(c => c.sym === 'PAXG'), g: [T.groupOf('NVDAB','stocks'), T.groupOf('PAXG','metals'), T.groupOf('ETH','layer1')] }; })()""")
    nvV, pxV = T['nv']['qty'] * T['nv']['currentPrice'], T['px']['qty'] * T['px']['currentPrice']
    keys = [c[0] for c in T['cls']]
    check('the tree: Crypto · Stocks · Metals, the share under Stocks and the gold token under Metals', keys == ['crypto', 'stock', 'metal'] and T['g'] == ['stock', 'metal', 'crypto'] and T['cls'][1][2] == ['stocks'] and T['cls'][2][2] == ['m:gold', 'm:silver'] and 'metals' not in T['cls'][0][2], T)
    check('…Metals split by metal: the gold token under Gold, the silver token under Silver', pg.evaluate("[SamsamTaxonomy.metalOf('PAXG'), SamsamTaxonomy.metalOf('KAG'), SamsamTaxonomy.metalOf('XAU'), SamsamTaxonomy.metalOf('XAG'), SamsamTaxonomy.label('m:gold'), SamsamTaxonomy.label('m:silver')]") == ['gold', 'silver', 'gold', 'silver', 'Gold', 'Silver'])
    check('…the classes add up to the whole', abs(sum(c[1] for c in T['cls']) - T['all']) < 0.05)
    # ── Performance list: the picker
    pg.evaluate("SamsamUI.ptabGo('performance')"); pg.wait_for_timeout(800)
    opts = pg.evaluate("catPickerDD.options || null") or pg.evaluate("(() => { catPickerDD.open(); const o = [...document.querySelectorAll('.sdd-panel.show .sdd-opt')].map(li => [li.textContent.trim(), li.className]); catPickerDD.close(); return o; })()")
    heads = [o[0] for o in opts if 'sdd-head' in o[1]]; ins = [o[0] for o in opts if 'sdd-in' in o[1]]
    check('Performance picker: All, then each class (a line above it) with its categories indented', opts[0][0].startswith('All') and [h.split('$')[0] for h in heads] == ['Crypto', 'Stocks', 'Metals'] and any(i.startswith('US Stocks (bStocks)') for i in ins) and any(i.startswith('Gold') for i in ins) and any(i.startswith('Silver') for i in ins) and not any(i.startswith('Precious Metals') for i in ins) and any(i.startswith('Layer 1') for i in ins), opts)
    pg.evaluate("setCatFilter('c:stock', true)"); pg.wait_for_timeout(400)
    rows = pg.evaluate("getFilteredSorted().map(c => c.sym)")
    check('Stocks → the list shows only the share', rows == ['NVDAB'], rows)
    pg.evaluate("setCatFilter('c:metal', true)"); pg.wait_for_timeout(300)
    rows = pg.evaluate("getFilteredSorted().map(c => c.sym)")
    check('Metals → the gold token (and any gold / silver you hold)', 'PAXG' in rows and 'KAG' in rows and 'NVDAB' not in rows and all(r in ('PAXG', 'XAU', 'XAG', 'XAUT', 'KAG') for r in rows), rows)
    pg.evaluate("setCatFilter('m:silver', true)"); pg.wait_for_timeout(300)
    rows = pg.evaluate("getFilteredSorted().map(c => c.sym)")
    check('Silver → the silver token (and any silver grams), no gold', 'KAG' in rows and 'PAXG' not in rows and all(r in ('KAG', 'XAG') for r in rows), rows)
    pg.evaluate("setCatFilter('c:crypto', true)"); pg.wait_for_timeout(300)
    rows = pg.evaluate("getFilteredSorted().map(c => c.sym)")
    check('Crypto → everything else (BTC in, the share and the gold token out)', 'BTC' in rows and 'NVDAB' not in rows and 'PAXG' not in rows, rows)
    pg.evaluate("setCatFilter('', true)")
    # ── Allocation: two rings + one line per class
    pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1200)
    d = pg.evaluate("""(() => ({ cls: [...document.querySelectorAll('#hovDonut .donut-cls')].map(p => p.dataset.cat), cats: document.querySelectorAll('#hovDonut .donut-slice:not(.donut-cls)').length,
      lines: [...document.querySelectorAll('#hovClsBar .hov-cls')].map(b => b.innerText.replace(/\\s+/g, ' ').trim()), two: document.getElementById('hovAllocCard').classList.contains('two-rings') }))()""")
    pct = [float(clean(l).split(' ')[-1].rstrip('%')) for l in d['lines']]
    check('Allocation: two rings — the classes inside, the categories outside', d['two'] and sorted(d['cls']) == ['c:crypto', 'c:metal', 'c:stock'] and d['cats'] >= 3, d)
    check('…one line per class, its value and share (adding to 100%)', [l.split(' ')[0] for l in d['lines']] == ['Crypto', 'Stocks', 'Metals'] and abs(sum(pct) - 100) < 0.3, d['lines'])
    pg.click('#hovClsBar [data-cls="c:stock"]'); pg.wait_for_timeout(500)
    lst = pg.evaluate("[...document.querySelectorAll('#hovAssetList .hov-asset-row')].map(r => r.dataset.sym || r.innerText.split('\\n')[0])")
    ctr = [pg.inner_text('#hovDonutVal'), pg.inner_text('#hovDonutLbl')]
    check('tap Stocks → the list is the share alone; the middle shows Stocks and its share', len(lst) == 1 and 'NVDAB' in lst[0] and ctr[1] == 'Stocks' and abs(float(ctr[0].rstrip('%')) - nvV / T['all'] * 100) < 0.1, [lst, ctr])
    check('…and the Allocation picker says Stocks too', 'Stocks' in pg.inner_text('#hovCatHost'), pg.inner_text('#hovCatHost'))
    pg.click('#hovClsBar [data-cls="c:stock"]'); pg.wait_for_timeout(300)
    ring = pg.evaluate("[...document.querySelectorAll('#hovDonut .donut-slice:not(.donut-cls)')].map(p => p.dataset.cat)")
    check('the outer ring shows Gold and Silver (not one Precious Metals slice)', 'm:gold' in ring and 'm:silver' in ring and 'metals' not in ring, ring)
    pg.evaluate("setHovCat('m:gold')"); pg.wait_for_timeout(400)
    check('pick Gold → the middle says Gold and its share', pg.inner_text('#hovDonutLbl') == 'Gold' and pg.inner_text('#hovDonutVal').endswith('%'), [pg.inner_text('#hovDonutLbl'), pg.inner_text('#hovDonutVal')])
    pg.evaluate("setHovCat('')"); pg.wait_for_timeout(200)
    check('tap it again → back to all', pg.inner_text('#hovDonutLbl') == 'Total')
    pg.screenshot(path=str(SH / 'alloc_classes.png'))
    # ── Overview's mini card: the classes
    pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(600)
    mini = pg.inner_text('#allocMiniCats')
    check("Overview's mini allocation card: Crypto · Stocks · Metals", all(w in mini for w in ('Crypto', 'Stocks', 'Metals')) and 'Layer 1' not in mini, mini)
    # ── Arabic
    pg.evaluate("localStorage.setItem('cp-lang','ar')"); pg.reload(); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c => c.sym === 'NVDAB')"); pg.wait_for_timeout(1500)
    pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1500)
    ar = pg.inner_text('#hovClsBar')
    check('Arabic: كريبتو · أسهم · معادن', all(w in ar for w in ('كريبتو', 'أسهم', 'معادن')), ar)
    pg.screenshot(path=str(SH / 'alloc_classes_ar.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
