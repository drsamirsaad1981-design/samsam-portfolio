"""🎨 One meaning, one colour. Profit green and loss red are the same on every page (they were #10b981 / #22c55e and
#ef4444 / #f87171 depending on the page), and the light theme uses deeper tones that read on white (it kept the dark
theme's bright ones). Also: a metal's / a share's value, links and category tags in the light theme; a bStock's logo is
the size of a coin's, its row shows the company's own name."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
WANT = {'dark': {'green': '#22c55e', 'red': '#f87171'}, 'light': {'green': '#15803d', 'red': '#dc2626'}}
RGB = lambda h: 'rgb(%d, %d, %d)' % tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= .03928 else ((v / 255 + .055) / 1.055) ** 2.4
    return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2])
def ratio(a, b):
    la, lb = lum(a), lum(b); return (max(la, lb) + .05) / (min(la, lb) + .05)
num = lambda s: [float(x) for x in re.findall(r'[\d.]+', s)][:3]
def rgb(s):   # "rgb(r, g, b)" or "color(srgb r g b)"
    v = num(s); return [round(x * 255) for x in v] if s.startswith('color(') else v
SNAP_STOCKS = [{'id': 'amd-bstocks', 'sym': 'AMDB', 'name': 'AMD (bStocks Tokenized Stock)', 'img': 'https://img.test/nv.png', 'price': 150, 'ch24': 2, 'ch7': 3, 'mcap': 9e8},
               {'id': 'semicon-bull', 'sym': 'SOXLB', 'name': 'Semicon Bull 3X ETF (bStocks Tokenized ETF)', 'img': 'https://img.test/sx.png', 'price': 33, 'ch24': -4, 'ch7': 1, 'mcap': 5e8},
               {'id': 'old-style', 'sym': 'COINB', 'name': 'Coinbase bStock', 'img': '', 'price': 400, 'ch24': 1, 'ch7': 1, 'mcap': 7e8}]
with sync_playwright() as p:
    br = p.chromium.launch()
    for theme in ('dark', 'light'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
        ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
        snap = json.loads((pathlib.Path(__file__).parent / 'market_snap_fixture.json').read_text()); snap['stocks'] = SNAP_STOCKS; snap['parts'] = {**snap.get('parts', {}), 'stocks': snap['updated']}
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(snap)))
        ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#888"/></svg>'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        if theme == 'dark':
            pg.evaluate("Samsam.addCoin({ sym: 'XAU', name: 'Gold', cat: 'metals', cls: 'metal' }, { qty: 2, price: 3000 })"); pg.wait_for_timeout(900)
        W = WANT[theme]; tok = "(() => { const s = getComputedStyle(document.documentElement); return [s.getPropertyValue('--green').trim(), s.getPropertyValue('--red').trim()]; })()"
        got = {'index': pg.evaluate(tok)}
        for v in ('performance', 'accumulation', 'market', 'altseason'):
            pg.evaluate(f"cpShell.go('{v}')"); pg.wait_for_timeout(2200); fr = [f for f in pg.frames if v + '.html' in f.url][0]; got[v] = fr.evaluate(tok)
            if v == 'market':
                fr.evaluate("SamsamAssets.show('stocks')"); fr.wait_for_selector('#vStocks .as-row', timeout=8000)
                st = fr.evaluate("""(() => { const rows = [...document.querySelectorAll('#vStocks .as-row')], img = document.querySelector('#vStocks .as-row img'), up = document.querySelector('#vStocks .as-row .up, #vStocks .up'), dn = document.querySelector('#vStocks .as-row .dn, #vStocks .dn');
                  return { names: rows.map(r => (r.querySelector('.as-nl small:not(.as-my)') || {}).textContent), img: img ? [Math.round(img.getBoundingClientRect().width), Math.round(img.getBoundingClientRect().height)] : null, ph: (() => { const e = document.querySelector('#vStocks .as-ph'); return e ? Math.round(e.getBoundingClientRect().width) : null; })(),
                    up: up && getComputedStyle(up).color, dn: dn && getComputedStyle(dn).color }; })()""")
                if theme == 'dark':
                    check('bStocks: each row shows the company\'s own name — "AMD", "Semicon Bull 3X ETF", "Coinbase" (never the same "… Tokenized Stock)" on every row)', sorted(x or '' for x in st['names']) == ['AMD', 'Coinbase', 'Semicon Bull 3X ETF'], st['names'])
                    check('bStocks: a share\'s logo is the size of a coin\'s (36 × 36), the empty one too', st['img'] == [36, 36] and st['ph'] == 36, st)
                check(f'{theme} bStocks: up / down use the page\'s one green / red', st['up'] == RGB(W['green']) and st['dn'] == RGB(W['red']), st)
        pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
        check(f'{theme}: one green ({W["green"]}) and one red ({W["red"]}) on every page — Overview, Performance, Plan, Market Hub, Altcoin Season', all(v == [W['green'], W['red']] for v in got.values()), got)
        c = pg.evaluate("""(() => { const g = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).color : null; };
          return { pnl: g('#totalPnlCard'), mv: g('#moversCard .mv-val.up, #moversCard .mv-val.down'), gold: g('#partMetalsUsd'), tag: g('.cat-tag'), link: g('.stat-metals .mt-open'), accum: g('#accumPct') }; })()""")
        check(f'{theme}: All Time Profit, Today\'s Movers and the plan\'s "% complete" are that same green / red', c['pnl'] in (RGB(W['green']), RGB(W['red'])) and c['mv'] in (RGB(W['green']), RGB(W['red'])) and c['accum'] == RGB(W['green']), c)
        if theme == 'light':
            white = [255, 255, 255]
            r = {k: round(ratio(rgb(v), white), 2) for k, v in c.items() if v}
            check('light: profit, the metals\' value, a category tag and a link all read on white (contrast ≥ 4.5 — they were 1.7 to 2.4)', all(x >= 4.5 for x in r.values()), r)
        else:
            check('dark: the metals\' gold and the links keep their bright tones', c['gold'] == 'rgb(255, 214, 10)' and c['link'] == 'rgb(96, 165, 250)', c)
        if theme == 'dark':
            # 🎨 the donut's palette is measured, not eyeballed: every pair of colours that can share it (12 categories + Other, the
            # four metals, the Crypto class) — distance in OKLab × 100. It was 2.7 (Bitcoin ~ Layer 0) with 14 pairs under 15.
            pal = pg.evaluate("""(() => { const T = SamsamTaxonomy, P = {};
              ['btc', 'layer1', 'layer2', 'layer0', 'ai', 'oracle', 'defi', 'launchpad', 'web3', 'meme', 'stocks', 'other', 'm:gold', 'm:silver', 'c:crypto', 'c:stock', 'c:metal', 'm:platinum', 'm:copper'].forEach(k => P[k] = T.color(k));
              const lin = v => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
              const lab = h => { const r = lin(parseInt(h.slice(1, 3), 16)), g = lin(parseInt(h.slice(3, 5), 16)), b = lin(parseInt(h.slice(5, 7), 16));
                const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
                return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]; };
              const dE = (a, b) => { const x = lab(a), y = lab(b); return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
              const main = ['btc', 'layer1', 'layer2', 'layer0', 'ai', 'oracle', 'defi', 'launchpad', 'web3', 'meme', 'stocks', 'other', 'm:gold', 'm:silver', 'c:crypto'], rows = [];
              for (let i = 0; i < main.length; i++) for (let j = i + 1; j < main.length; j++) rows.push([+dE(P[main[i]], P[main[j]]).toFixed(1), main[i], main[j]]);
              rows.sort((a, b) => a[0] - b[0]);
              const rare = ['m:platinum', 'm:copper'].map(k => [k, Math.min(...main.map(o => dE(P[k], P[o])))]);
              const nw = ['#f7931a', '#3b82f6', P['c:metal'], P['c:stock'], '#22c55e']; let nwMin = 1e9; for (let i = 0; i < nw.length; i++) for (let j = i + 1; j < nw.length; j++) nwMin = Math.min(nwMin, dE(nw[i], nw[j]));
              return { P, worst: rows.slice(0, 4), rare, nwMin: +nwMin.toFixed(1) }; })()""")
            check(f'donut palette: the closest two colours are ≥ 15 apart (OKLab × 100) — worst now {pal["worst"][0]}', pal['worst'][0][0] >= 15, pal['worst'])
            check('…a class wears its category\'s colour (Shares = the stocks category, Metals = gold), so the two rings agree', pal['P']['c:stock'] == pal['P']['stocks'] and pal['P']['c:metal'] == pal['P']['m:gold'], pal['P'])
            check('…platinum and copper (rare) still stand ≥ 12 from everything', all(v >= 12 for _, v in pal['rare']), pal['rare'])
            check(f'Net worth card: Bitcoin · Altcoins · Metals · Shares · Cash — the closest two are ≥ 15 apart (it was 7.9: Bitcoin ~ Metals) — {pal["nwMin"]}', pal['nwMin'] >= 15, pal['nwMin'])
            src = (pathlib.Path(__file__).parent.parent / 'samsam-home.js').read_text(encoding='utf8')
            tile = pg.evaluate("getComputedStyle(document.getElementById('partStocksUsd')).color")
            check('…and the card\'s Metals / Shares are the taxonomy\'s own colours (yellow #ffd60a, pink #fc90b4); the Shares tile reads pink too',
                  f"['metal', '{pal['P']['c:metal']}'," in src and f"['stock', '{pal['P']['c:stock']}'," in src and pal['P']['c:stock'] == '#fc90b4' and tile == 'rgb(252, 144, 180)', (pal['P']['c:metal'], pal['P']['c:stock'], tile))
        check(f'{theme}: no page errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
