"""Bottom bar: Home tab shows the app logo (SVG, its colours) — phone + computer, light + dark; on Home and on another page."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            for where in ('home', 'plan'):
                if where == 'plan': pg.click('#cpBnav a[data-k=accumulation]'); pg.wait_for_timeout(1200)
                info = pg.evaluate("""(()=>{const a=[...document.querySelectorAll('.cp-bnav a')].find(x=>/Portfolio/.test(x.textContent)); const s=a&&a.querySelector('svg'); const r=s&&s.getBoundingClientRect();
                  return {logo: !!(s&&s.classList.contains('nav-logo')), paths: s?s.querySelectorAll('path').length:0, w: r&&Math.round(r.width), h: r&&Math.round(r.height), current: a&&a.getAttribute('aria-current'), emoji: /[\\u{1F300}-\\u{1FAFF}]/u.test(a.textContent)}})()""")
                check(f'{vn}/{theme}/{where}: Home tab shows the app logo (4 shapes, {info["w"]}px)', info['logo'] and info['paths'] == 4 and info['w'] >= 18 and not info['emoji'], info)
                bar = pg.locator('.cp-bnav').bounding_box()
                pg.screenshot(path=str(SH / f'navlogo_{vn}_{theme}_{where}.png'), clip={'x': bar['x'] - 8 if vn == 'desktop' else 0, 'y': bar['y'] - 8, 'width': bar['width'] + 16 if vn == 'desktop' else bar['width'], 'height': bar['height'] + 16 if vn == 'desktop' else bar['height']})
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
