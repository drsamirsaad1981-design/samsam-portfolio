"""🏷 Allocation: the donut's slices by name. Fifteen colours cannot all stay far apart, so under the donut every category
of the outer ring is listed — its colour dot, its whole name and its share, in the ring's own order; tap a name = tap its
slice. A class with a single category (shares) is named by its class line and not repeated. Also: a part of the Net worth
that is there but rounds to nothing reads "<1%", never "0%"."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
MIX = [('BTC', 30), ('ETH', 15), ('TAO', 6), ('ARB', 5), ('DOT', 3), ('LINK', 2)]
clean = "s => (s || '').replace(/[\\u2066-\\u2069\\u200e\\u200f]/g, '').replace(/\\s+/g, ' ').trim()"
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        if lang == 'en':
            pg.evaluate("""async (mix) => { const st = Samsam.getState();
              for (const c of st.portfolio) { try { await Samsam.removeCoin(c.sym); } catch (e) {} }
              for (const [sym, v] of mix) await Samsam.addCoin({ sym, name: sym }, { qty: v * 100, price: 1 });
              await Samsam.addCoin({ sym: 'XAU', name: 'Gold', cat: 'metals', cls: 'metal' }, { qty: 0.5, price: 4000 });
              await Samsam.addCoin({ sym: 'XAG', name: 'Silver', cat: 'metals', cls: 'metal' }, { qty: 24, price: 50 });
              await Samsam.addCoin({ sym: 'NVDAB', name: 'NVIDIA', cat: 'stocks', cls: 'stock', cgId: 'nvidia-bstocks' }, { qty: 0.1, price: 150 });
              await Samsam.setCash([{ id: 'c1', kind: 'cash', cur: 'USD', amount: 5000, label: 'Bank' }]); }""", MIX); pg.wait_for_timeout(1500)
        pg.evaluate("""(mix) => { const m = {}; for (const [sym] of mix) m[sym] = { usd: 1, ch24: 1 }; m.XAU = { usd: 4000, ch24: 1 }; m.XAG = { usd: 50, ch24: 1 }; m.NVDAB = { usd: 150, ch24: 1 }; Samsam.updatePrices(m); }""", MIX); pg.wait_for_timeout(900)
        # Net worth: shares are $15 of about $14,300 → "<1%", and the shares still add up to 100
        nw = pg.evaluate(f"[...document.querySelectorAll('#nwLegend .nw-li')].map(li => [li.dataset.k, ({clean})(li.querySelector('b').textContent)])")
        d = dict(nw)
        tot = sum(int(v.rstrip('%')) for v in d.values() if not v.startswith('<'))
        check(f'{lang}: Net worth — a part that is there but under half a percent reads "<1%" (shares), the others still add up to 100', d.get('stock') == '<1%' and tot == 100 and '0%' not in d.values(), nw)
        pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1800)
        leg = pg.evaluate(f"""(() => {{ const C = {clean};
          return {{ rows: [...document.querySelectorAll('#hovCatLeg .hov-leg-i')].map(b => [b.dataset.cat, C(b.querySelector('span').textContent), C(b.querySelector('b').textContent), getComputedStyle(b.querySelector('i')).backgroundColor, b.querySelector('span').scrollWidth <= b.querySelector('span').clientWidth + 1]),
            ring: [...document.querySelectorAll('#hovDonut .donut-slice:not(.donut-cls)')].map(s => [s.dataset.cat, s.getAttribute('fill')]),
            last: document.getElementById('hovAllocCard').lastElementChild.id, over: document.documentElement.scrollWidth - innerWidth }}; }})()""")
        ring = [k for k, _ in leg['ring']]; want = [k for k in ring if k != 'stocks']
        check(f'{lang}: under the donut — one line per slice of the outer ring, in the ring\'s order; the shares (one category, named by their class line) are not repeated',
              [r[0] for r in leg['rows']] == want and len(want) == 8 and leg['last'] == 'hovCatLeg', ([r[0] for r in leg['rows']], ring))
        hexrgb = lambda h: 'rgb(%d, %d, %d)' % tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)); fill = dict(leg['ring'])
        check(f'{lang}: each line wears its slice\'s colour and shows its share', all(r[3] == hexrgb(fill[r[0]]) and r[2].endswith('%') for r in leg['rows']) and leg['rows'][0][2] == '32.2%', leg['rows'][:3])   # Bitcoin $3,000 of $9,315
        check(f'{lang}: every name is whole — none cut short ("Layer 1…" and "Layer 2…" cut would read the same), the page does not scroll sideways', all(r[4] for r in leg['rows']) and leg['over'] <= 0, ([r[1] for r in leg['rows'] if not r[4]], leg['over']))
        if lang == 'en':
            check('names: Bitcoin, Layer 1 Blockchains, … Gold, Silver', [r[1] for r in leg['rows']][:2] == ['Bitcoin', 'Layer 1 Blockchains'] and [r[1] for r in leg['rows']][-2:] == ['Gold', 'Silver'], [r[1] for r in leg['rows']])
            pg.click('#hovCatLeg .hov-leg-i[data-cat="layer2"]'); pg.wait_for_timeout(500)
            st = pg.evaluate(f"[hovCat, ({clean})(document.getElementById('hovDonutLbl').textContent), document.querySelector('#hovCatLeg [data-cat=layer2]').getAttribute('aria-pressed'), document.querySelector('#hovDonut [data-cat=layer2]').getAttribute('opacity'), document.querySelector('#hovDonut [data-cat=btc]').getAttribute('opacity')]")
            check('tap a name = tap its slice: the donut shows Layer 2 alone, the line is marked', st[0] == 'layer2' and 'Layer 2' in st[1] and st[2] == 'true' and st[3] == '1' and st[4] == '0.3', st)
            pg.click('#hovCatLeg .hov-leg-i[data-cat="layer2"]'); pg.wait_for_timeout(400)
            check('tap it again → everything', pg.evaluate("hovCat") == '' and pg.evaluate("document.querySelector('#hovCatLeg [data-cat=layer2]').getAttribute('aria-pressed')") == 'false')
        else:
            names = [r[1] for r in leg['rows']]
            check('Arabic: the names are Arabic and whole (الأولى / الثانية both readable)', any('الأولى' in n for n in names) and any('الثانية' in n for n in names) and names[0] == 'بيتكوين', names)
        pg.locator('#hovAllocCard').screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'donut-legend-{lang}.png'))
        check(f'{lang}: no page errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
