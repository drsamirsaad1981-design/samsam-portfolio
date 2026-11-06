"""Theme + cloud buttons only on the main page (their setting still applies everywhere); every inner page shares one
header bar: full width, sticky. Pages with the bottom bar: the main page's look (logo + Cute Portfolio, the page name
under it), folding to one slim line when scrolled. Inner screens (a coin, Recover): Back left, title centred."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
GEO = """() => { const h = [...document.querySelectorAll('.cp-head')].find(x => x.offsetParent); if (!h) return null;
  const r = h.getBoundingClientRect(), t = h.querySelector('.cp-head-title'), tr = t.getBoundingClientRect(), b = h.querySelector('.cp-back').getBoundingClientRect();
  const tt = h.querySelector('.cp-head-title .t');
  return { left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), pos: getComputedStyle(h).position,
    center: Math.round((tr.left + tr.right) / 2 - innerWidth / 2), oneLine: tr.height < 30, cut: tt.scrollWidth > tt.clientWidth + 1,
    overlap: b.right > tr.left + 1, title: t.innerText.trim(), font: getComputedStyle(t).fontSize + ' ' + getComputedStyle(t).fontWeight,
    big: h.classList.contains('cp-big'), logo: !!(h.querySelector('.cp-brand-logo') || {}).offsetParent,
    name: ((h.querySelector('.cp-brand-n') || {}).textContent || '').replace(/\s+/g, ' ').trim(), nameB: h.querySelector('.cp-brand-n') ? Math.round(h.querySelector('.cp-brand-n').getBoundingClientRect().bottom) : null,
    tTop: Math.round(tr.top), tLeft: Math.round(tr.left),
    theme: [...document.querySelectorAll('.ss-theme-btn')].filter(x => x.offsetParent).length, vw: innerWidth,
    blur: getComputedStyle(h).backdropFilter || getComputedStyle(h).webkitBackdropFilter }; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone-360', dict(viewport={'width': 360, 'height': 780}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('phone-390', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        main = pg.evaluate("[document.querySelectorAll('.header-top [data-theme-toggle]').length, document.querySelectorAll('.header-top .ss-sync-hdr').length]")
        check(f'{name}: main page keeps one theme button and one cloud button', main == [1, 1], main)
        # switch theme on the main page → inner pages follow
        before = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        pg.click('.hdr-btns [data-theme-toggle]'); pg.wait_for_timeout(200)
        after = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        check(f'{name}: theme button on the main page switches the theme', before != after, (before, after))
        seen = {}
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(700)
        seen['holdings'] = pg.evaluate(GEO); pg.locator('#holdingsOverlay .cp-head').screenshot(path=str(SH / f'head-holdings-{name}.png'))
        pg.evaluate("openCoinTx(portfolio[0].sym)"); pg.wait_for_timeout(600)
        seen['coin'] = pg.evaluate(GEO)
        pg.evaluate("hovBack()"); pg.wait_for_timeout(300); pg.evaluate("hovBack()"); pg.wait_for_timeout(400)
        for page in ('performance.html', 'allocation.html', 'accumulation.html', 'recover.html'):
            pg.goto(S.SITE + '/' + page); S.wait_ready(pg) if page != 'recover.html' else None; pg.wait_for_timeout(900)
            g = pg.evaluate(GEO); seen[page] = g
            check(f'{name}: {page} follows the theme chosen on the main page', pg.evaluate("document.documentElement.getAttribute('data-theme')") == after)
            if page == 'recover.html':
                check(f'{name}: {page} has no theme / cloud buttons', g and g['theme'] == 0 and pg.evaluate("document.querySelectorAll('.ss-sync-hdr, [data-theme-toggle]').length") == 0, g and g['theme'])
            else:
                tb = pg.evaluate("[document.querySelectorAll('.cp-head [data-theme-toggle]').length, document.querySelectorAll('.cp-head .ss-sync-hdr').length]")
                check(f'{name}: {page} header has the cloud + light/dark buttons like the main page {tb}', tb == [1, 1], tb)
            pg.screenshot(path=str(SH / f'head-{page[:-5]}-{name}.png'), clip={'x': 0, 'y': 0, 'width': vp['viewport']['width'], 'height': 80})
            pg.evaluate("scrollTo(0, 600)"); pg.wait_for_timeout(250)
            st = pg.evaluate("(() => { const h = document.querySelector('.cp-head'); return [Math.round(h.getBoundingClientRect().top), h.classList.contains('scrolled')]; })()")
            if g and g['big'] and pg.evaluate("document.documentElement.scrollHeight > innerHeight + 200"):
                c = pg.evaluate("(() => { const h = document.querySelector('.cp-head'); return [h.classList.contains('compact'), Math.round(h.getBoundingClientRect().height), getComputedStyle(h.querySelector('.cp-brand-n')).opacity]; })()")
                check(f'{name}: {page} scrolled → header folds into one slim line {c}', c[0] and c[1] < g['h'] - 10 and float(c[2]) < 0.1, (c, g['h']))
                pg.evaluate("scrollTo(0, 0)"); pg.wait_for_timeout(350)
                check(f'{name}: {page} back at the top → full header again', not pg.evaluate("document.querySelector('.cp-head').classList.contains('compact')"))
            scrollable = pg.evaluate("document.documentElement.scrollHeight > innerHeight + 10")
            check(f'{name}: {page} header stays on top while scrolling (with shadow)', st == [0, True] or (not scrollable and st[0] == 0), (st, scrollable))
        for k, g in seen.items():
            check(f'{name}: {k} header full width, sticky, frosted', g and g['left'] == 0 and g['w'] == g['vw'] and g['pos'] == 'sticky' and 'blur' in (g['blur'] or ''), g)
            if k in ('coin', 'recover.html'):
                check(f'{name}: {k} Back + title centred on one line, not under Back, not cut', g and not g['logo'] and abs(g['center']) <= 16 and g['oneLine'] and not g['overlap'] and not g['cut'], g and (g['logo'], g['center'], g['oneLine'], g['overlap'], g['cut'], g['title']))
            else:
                check(f'{name}: {k} like the main page — logo + "Cute Portfolio", the page name under it, not cut', g and g['big'] and g['logo'] and g['name'] == 'Cute Portfolio' and g['tTop'] >= g['nameB'] - 2 and g['oneLine'] and not g['cut'], g and (g['big'], g['logo'], g['name'], g['tTop'], g['nameB'], g['cut'], g['title']))
        hs = {k: (g['h'], g['font']) for k, g in seen.items() if g and g['big'] and k != 'coin'}
        check(f'{name}: same height and title style on every page with the bar', len(set(hs.values())) == 1, hs)
        check(f'{name}: no sideways scroll on any page', all(g and g['vw'] == vp['viewport']['width'] for g in seen.values()), {k: g and g['vw'] for k, g in seen.items()})
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'head_test: {sum(res)}/{len(res)} passed')
