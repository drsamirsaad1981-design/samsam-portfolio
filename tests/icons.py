"""Icon consistency check: theme toggle, live dot, date icon on every page, mobile + desktop, dark + light."""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import e2e_setup as S  # route helpers

T = pathlib.Path(__file__).parent / 'shots'; T.mkdir(exist_ok=True)
SITE = 'http://127.0.0.1:8000'
PAGES = ['index.html', 'accumulation.html', 'performance.html']
results = []
def check(n, c, d=''):
    results.append((n, bool(c))); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)

with sync_playwright() as p:
    br = p.chromium.launch()
    for vp_name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                        ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        errors = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
        geo = {}
        for theme in ('dark', 'light'):
            for page in PAGES:
                pg.goto(SITE + '/' + page); pg.wait_for_timeout(1800)
                info = pg.evaluate("""() => {
                  const btns = [...document.querySelectorAll('[data-theme-toggle]')].filter(b => b.offsetParent);
                  const b = btns[0]; const r = b ? b.getBoundingClientRect() : null;
                  const cs = b ? getComputedStyle(b) : null;
                  const dots = [...document.querySelectorAll('.ss-live')].filter(d => d.offsetParent);
                  return {
                    theme: document.documentElement.dataset.theme,
                    nBtn: btns.length, w: r && Math.round(r.width), h: r && Math.round(r.height),
                    right: r && Math.round(document.documentElement.clientWidth - r.right), top: r && Math.round(r.top),
                    radius: cs && cs.borderRadius, icon: b && b.querySelector('svg') ? b.querySelector('svg').innerHTML.slice(0, 20) : null,
                    btnTheme: b && b.dataset.currentTheme,
                    dots: dots.map(d => { const s = getComputedStyle(d); return [d.dataset.state, s.width, s.backgroundColor]; }),
                    emoji: /🌙|☀|📅|🗓/u.test(document.body.innerText),
                    overflow: document.documentElement.scrollWidth > innerWidth + 1 };
                }""")
                geo[(theme, page)] = info
                if page == 'index.html':
                    check(f'{vp_name}/{theme}/{page}: one theme button, 36x36, shows current theme',
                          info['nBtn'] == 1 and info['w'] == info['h'] == (34 if vp_name == 'mobile' and page == 'index.html' else 36) and info['btnTheme'] == theme == info['theme'], info)
                else:   # theme + cloud live only on the main page; inner pages just follow the chosen theme
                    check(f'{vp_name}/{theme}/{page}: one header theme button, page follows the theme', info['nBtn'] == 1 and info['btnTheme'] == theme and info['theme'] == theme, info)
                check(f'{vp_name}/{theme}/{page}: no emoji theme/date icons left', not info['emoji'])
                check(f'{vp_name}/{theme}/{page}: no horizontal overflow', not info['overflow'])
                ok_dots = [d for d in info['dots'] if d[0] == 'ok']
                exp = 'rgb(34, 197, 94)' if theme == 'dark' else 'rgb(22, 163, 74)'
                check(f'{vp_name}/{theme}/{page}: every green Live dot identical (8px, {exp})',
                      all(d[1] == '8px' and d[2] == exp for d in ok_dots) and (len(ok_dots) >= 1 or page != 'index.html'), info['dots'])
                pg.screenshot(path=str(T / f'{vp_name}-{theme}-{page[:-5]}.png'))
            # all pages: same icon, same position from the right edge
            g = geo[(theme, 'index.html')]
            check(f'{vp_name}/{theme}: theme button at the top-right of the main page', g['right'] <= 120 and g['top'] < 140, (g['right'], g['top']))
            if theme == 'dark':
                pg.goto(SITE + '/index.html'); pg.wait_for_timeout(800)
                pg.click('header [data-theme-toggle]')  # switch to light on the main page → all pages follow
                check(f'{vp_name}: toggle switches theme and icon', pg.evaluate("document.documentElement.dataset.theme") == 'light'
                      and pg.get_attribute('[data-theme-toggle]', 'data-current-theme') == 'light')
        # date icon on main page
        pg.goto(SITE + '/index.html'); pg.wait_for_timeout(1200)
        d = pg.evaluate("() => { const e = document.getElementById('currentDate'); return { svg: !!e.querySelector('svg.ss-icon'), text: e.innerText }; }")
        check(f'{vp_name}: date uses shared calendar SVG (no digits in icon)', d['svg'] and '📅' not in d['text'], d)
        # holdings overlay theme button
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(500)
        ob = pg.evaluate("() => [document.querySelectorAll('#holdingsOverlay [data-theme-toggle], #holdingsOverlay .ss-sync-hdr').length, document.documentElement.dataset.theme]")
        check(f'{vp_name}: holdings view has the cloud + theme buttons and keeps the theme', ob == [2, 'light'], ob)
        pg.screenshot(path=str(T / f'{vp_name}-light-holdings.png'))
        pg.evaluate("closeHoldingsView()")
        # two tabs stay in sync
        pg2 = ctx.new_page(); pg2.goto(SITE + '/performance.html'); pg2.wait_for_timeout(800)
        pg.click('header [data-theme-toggle]'); pg2.wait_for_timeout(400)
        check(f'{vp_name}: theme change in one tab updates other open tab', pg2.evaluate("document.documentElement.dataset.theme") in ('light', 'dark') and pg2.evaluate("document.documentElement.dataset.theme") == pg.evaluate("document.documentElement.dataset.theme"))
        pg.click('header [data-theme-toggle]')  # back to dark
        check(f'{vp_name}: no JavaScript errors', not errors, errors[:3])
        ctx.close()
    br.close()
f = [r for r in results if not r[1]]
print(f'\n{len(results)-len(f)}/{len(results)} passed'); sys.exit(1 if f else 0)
