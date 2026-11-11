"""One round 'open' button in the same corner of Holdings, Performance, Allocation and Accumulation; no cloud icon."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
CARDS = ['#holdingsCard', '#perfChartWrap', '#allocMiniCard', '#accumProgressBar']
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('dark', 'light'):
            ctx = br.new_context(**vp, color_scheme=theme); S.setup(ctx); errs = []
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme', '{theme}')"); pg.mouse.move(1, 1) if name == 'desktop' else None; pg.wait_for_timeout(300)
            geo = pg.evaluate("""(sels) => sels.map(s => { const c = document.querySelector(s), g = c.querySelectorAll('.card-go'), b = g[0] && g[0].getBoundingClientRect(), r = c.getBoundingClientRect();
                return { n: g.length, w: b && Math.round(b.width), top: b && Math.round(b.top - r.top), right: b && Math.round(r.right - b.right), bg: g[0] && getComputedStyle(g[0]).backgroundColor }; })""", CARDS)
            tag = f'{name}/{theme}'
            check(f'{tag}: every card has exactly one round button', all(g['n'] == 1 and g['w'] == 32 for g in geo), geo)
            check(f'{tag}: same corner in all four cards', len({(g['top'], g['right']) for g in geo}) == 1, geo)
            check(f'{tag}: no cloud icon, no old arrows', not pg.query_selector('#perfSyncIndicator') and not pg.query_selector('.main-trio .alloc-mini-arrow, #accumProgressBar .alloc-mini-arrow'))
            over = pg.evaluate("""(sels) => sels.filter(s => { const c = document.querySelector(s), t = (() => { const r = document.createRange(); r.selectNodeContents(c.querySelector('.holdings-title, .alloc-mini-title')); return r.getBoundingClientRect(); })(), b = c.querySelector('.card-go').getBoundingClientRect();
                return t.right > b.left && t.bottom > b.top && t.top < b.bottom; })""", CARDS)
            check(f'{tag}: titles never run under the button', not over, over)
            if theme == 'dark':
                pg.hover('#perfChartWrap'); pg.wait_for_timeout(300)
                filled = pg.evaluate("getComputedStyle(document.querySelector('#perfChartWrap .card-go')).backgroundColor") == 'rgb(124, 58, 237)'
                check(f'{tag}: hover fills the button with a mouse, never sticks on touch', filled == (name == 'desktop'), filled)
            pg.locator('.main-trio').screenshot(path=str(SH / f'cardgo-{name}-{theme}.png'))
            if name == 'desktop' and theme == 'dark':
                pg.focus('#holdingsCard'); pg.keyboard.press('Enter'); pg.wait_for_timeout(600)
                check('keyboard Enter on the Holdings card opens Performance', pg.evaluate("location.hash") == '#performance', pg.evaluate("location.hash"))
                pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
                pg.click('#perfChartWrap .card-go', force=True); pg.wait_for_timeout(800)
                check('tapping the round button opens Performance', 'performance.html' in pg.url or pg.url.endswith('#performance'), pg.url)   # Performance opens as a Portfolio tab since the bar redesign
            check(f'{tag}: no page errors', not errs, errs)
            ctx.close()
    br.close()
print(f'cardgo_test: {sum(res)}/{len(res)} passed')
