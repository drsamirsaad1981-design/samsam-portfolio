import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'
tag = sys.argv[1] if len(sys.argv) > 1 else 'before'
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)),
                     ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page()
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000); pg.wait_for_timeout(800)
        for page in ('allocation', 'performance'):
            pg.goto(f'{SITE}/{page}.html'); pg.wait_for_timeout(1800); pg.screenshot(path=str(T / f'cmp-{name}-{page}.png'))
        pg.goto(SITE + '/index.html#holdings'); pg.wait_for_timeout(2200); pg.screenshot(path=str(T / f'cmp-{name}-holdings-{tag}.png'))
        pg.evaluate("openCoinTx('BTC')"); pg.wait_for_timeout(600); pg.screenshot(path=str(T / f'cmp-{name}-cointx-{tag}.png'))
        ctx.close()
    br.close()
