"""Home + Accumulation tables: the Asset column (header + cells) stays put while the table scrolls sideways; opaque enough
that numbers sliding under it don't show through; light + dark; phone (scrolls) + computer."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
JS = """([sel, dx])=>{const t=document.querySelector(sel); let w=t.parentElement; while(w && getComputedStyle(w).overflowX==='visible') w=w.parentElement;
  const td=t.querySelector('tbody tr td'), th=t.querySelector('thead th'), td2=t.querySelector('tbody tr td:nth-child(2)');
  const before=[td.getBoundingClientRect().left, th.getBoundingClientRect().left, td2.getBoundingClientRect().left];
  w.scrollLeft=dx; const after=[td.getBoundingClientRect().left, th.getBoundingClientRect().left, td2.getBoundingClientRect().left];
  const bg=getComputedStyle(td).backgroundColor, a=(bg.match(/[\\d.]+/g)||[]).map(Number);
  return {scrolls: w.scrollWidth>w.clientWidth+2, moved: Math.round(w.scrollLeft), tdStay: Math.abs(after[0]-before[0])<1, thStay: Math.abs(after[1]-before[1])<1,
    otherMoved: Math.round(before[2]-after[2]), opaque: a.length<4 ? 1 : a[3], thTop: getComputedStyle(th).zIndex, tdZ: getComputedStyle(td).zIndex,
    text: td.innerText.trim().split('\\n')[0], headSame: [...t.querySelectorAll('thead th')].every(c=>getComputedStyle(c).backgroundColor===getComputedStyle(th).backgroundColor), same: [...t.querySelectorAll('tbody tr')].slice(0,6).every(r=>[...r.cells].every(c=>getComputedStyle(c).backgroundColor===getComputedStyle(r.cells[0]).backgroundColor))}}"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.evaluate("applyView('table')"); pg.wait_for_timeout(500)
            for page, sel, prep in (('home', '#portfolioTable', None), ('accumulation', '#tableView table', "setView('table')")):
                if prep:
                    pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(1200)
                    pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')"); pg.evaluate(prep); pg.wait_for_timeout(500)
                pg.locator(sel).scroll_into_view_if_needed()
                r = pg.evaluate(JS, [sel, 260])
                if vn == 'phone':
                    check(f'{vn}/{theme}/{page}: table scrolls sideways, Asset cell + header stay, other columns slide under ({r["text"]})', r['scrolls'] and r['moved'] > 100 and r['tdStay'] and r['thStay'] and r['otherMoved'] > 100, r)
                    check(f'{vn}/{theme}/{page}: Asset column covers what slides under it', r['opaque'] >= 0.99, r)
                    check(f'{vn}/{theme}/{page}: Asset column the same colour as the rest of the row', r['same'], r)
                    check(f'{vn}/{theme}/{page}: Asset title the same colour as the other titles', r['headSame'], r)
                    w = pg.locator(sel); bb = w.bounding_box()
                    pg.screenshot(path=str(SH / f'sticky_{page}_{theme}.png'), clip={'x': 0, 'y': max(0, bb['y'] - 4), 'width': 390, 'height': min(420, bb['height'] + 8)})
                    pg.evaluate(JS, [sel, 0])
                else:
                    check(f'{vn}/{theme}/{page}: full table fits, Asset column in place ({r["text"]})', r['tdStay'] and r['thStay'], r)
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
