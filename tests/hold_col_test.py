"""Holdings list: the Holdings column is tidy (value + amount on one line each, never cut), every row has the same ›
level with the two lines, and the HOLDINGS heading lines up with the numbers."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
JS = """() => { const rows = [...document.querySelectorAll('#hovAssetList .hov-asset-row')];
  const bad = [], cut = [], go = [], mid = [], right = [];
  for (const r of rows) {
    const v = r.querySelector('.hold-val'), q = r.querySelector('.hold-qty'), g = r.querySelector('.hov-go'), t = r.querySelector('.hov-hold-txt');
    const lh = e => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3;
    const sym = r.dataset.sym;
    if (v.getBoundingClientRect().height > lh(v) * 1.5 || q.getBoundingClientRect().height > lh(q) * 1.5) bad.push(sym);
    if (q.scrollWidth > q.clientWidth + 1 || v.scrollWidth > v.clientWidth + 1) cut.push(sym + ' ' + q.textContent);
    if (!g || g.querySelector('svg') == null) go.push(sym);
    else {   // the two arrows: the pair is level with value + amount, › beside the value, ⌄ beside the amount
      const pair = r.querySelector('.hov-arrows').getBoundingClientRect(), b = t.getBoundingClientRect(), mo = r.querySelector('.hov-more');
      const c = e => { const x = e.getBoundingClientRect(); return (x.top + x.bottom) / 2; };
      if (Math.abs((pair.top + pair.bottom) / 2 - (b.top + b.bottom) / 2) > 3 || !mo || Math.abs(c(g) - c(v)) > 6 || Math.abs(c(mo) - c(q)) > 6) mid.push(sym);
    }
    right.push(Math.round(t.getBoundingClientRect().right));
    const pr = Math.max(r.querySelector('.ast-price').getBoundingClientRect().right, r.querySelector('.ast-chg').getBoundingClientRect().right);
    const hl = Math.min(v.getBoundingClientRect().left, q.getBoundingClientRect().left);
    const nm = r.querySelector('.ast-top').getBoundingClientRect().right;
    if (pr > hl - 4 || nm > hl - 4) bad.push('overlap ' + sym);
    if (r.querySelector('.ast-line').getBoundingClientRect().top < r.querySelector('.ast-top').getBoundingClientRect().bottom - 1) bad.push('price not under the name ' + sym);
  }
  const h = document.querySelector('.hov-list-header .hov-sort[data-sort="holdings"]');
  const rg = document.createRange(); rg.selectNodeContents(h); const hr = rg.getBoundingClientRect().right;
  return { n: rows.length, bad, cut, go, mid, rightSpread: Math.max(...right) - Math.min(...right), headVsNums: Math.round(hr - Math.max(...right)),
    page: document.documentElement.scrollWidth <= innerWidth + 1, qty: rows.slice(0, 4).map(r => r.querySelector('.hold-qty').textContent) }; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone-360', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('phone-390', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        # awkward amounts like the screenshot: tiny ETH/BNB, big AVAIL
        if name == 'phone-360':
            pg.evaluate("void Samsam.addCoin({ sym: 'TINYQ', name: 'Tiny Quantity Coin', cat: 'other', catLocked: true }, { qty: 0.009564, price: 2491.25 })")
            pg.evaluate("void Samsam.addCoin({ sym: 'BIGQ', name: 'Big Quantity Coin', cat: 'other', catLocked: true }, { qty: 84648.66, price: 0.00252 })")
            pg.wait_for_timeout(800)
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(900)
        r = pg.evaluate(JS)
        check(f'{name}: value and amount stay on one line each', r['n'] > 5 and not r['bad'], r['bad'][:6])
        check(f'{name}: amounts are never cut off', not r['cut'], r['cut'][:6])
        check(f'{name}: every row has the › (and ⌄) icon', not r['go'], r['go'][:6])
        check(f'{name}: › beside the value, ⌄ beside the amount', not r['mid'], r['mid'][:6])
        check(f'{name}: numbers share one right edge, HOLDINGS heading lines up with them', r['rightSpread'] <= 1 and abs(r['headVsNums']) <= 3, (r['rightSpread'], r['headVsNums']))
        check(f'{name}: no sideways scroll', r['page'])
        if name == 'phone-360':
            q = pg.evaluate("Object.fromEntries([...document.querySelectorAll('#hovAssetList .hov-asset-row')].map(r => [r.dataset.sym, [r.querySelector('.hold-qty').textContent, r.querySelector('.hold-qty').title]]).filter(x => /^(TINYQ|BIGQ)$/.test(x[0])))")
            check('amounts written in full, symbol after (same Holdings column as every page): 0.009564 TINYQ / 84,648.66 BIGQ', q == {'TINYQ': ['0.009564 TINYQ', '0.009564 TINYQ'], 'BIGQ': ['84,648.66 BIGQ', '84,648.66 BIGQ']}, q)
        if name != 'desktop':
            pg.locator('#hovAssetList').screenshot(path=str(SH / f'holdcol-{name}.png'))
        else:
            pg.hover('#hovAssetList .hov-asset-holding >> nth=0'); pg.wait_for_timeout(250)
            check('desktop: hover turns the › purple', pg.evaluate("getComputedStyle(document.querySelector('#hovAssetList .hov-go')).color") == 'rgb(167, 139, 250)')
            pg.locator('#hovAssetList').screenshot(path=str(SH / f'holdcol-{name}.png'))
        pg.locator('#hovAssetList .hov-go').nth(2).click(); pg.wait_for_timeout(600)
        check(f'{name}: tapping › opens that coin\'s transactions', pg.evaluate("location.hash").startswith('#holdings/'), pg.evaluate("location.hash"))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'hold_col_test: {sum(res)}/{len(res)} passed')
