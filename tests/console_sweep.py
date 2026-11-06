"""Every page × mobile/desktop: collect console errors/warnings and uncaught exceptions."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
PAGES = ['index.html', 'accumulation.html', 'performance.html', 'recover.html']
bad = []
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx, keep_csp=True)
        for page in PAGES:
            pg = ctx.new_page(); msgs = []
            pg.on('console', lambda m, msgs=msgs: msgs.append(f'{m.type}: {m.text[:200]}') if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text else None)
            pg.on('requestfailed', lambda r, msgs=msgs: msgs.append('REQFAIL ' + re.sub(r'\?.*','',r.url)[:90]) if not re.match(r'https?://(127\.0\.0\.1|.*coingecko|assets\.coingecko|coin-images|fonts\.|img\.test)', r.url) else None)
            pg.on('pageerror', lambda e, msgs=msgs: msgs.append(f'EXC: {e}'))
            pg.goto(f'{S.SITE_CSP}/{page}'); pg.wait_for_timeout(600)
            if pg.is_visible('#samsamSignInBtn'): pg.click('#samsamSignInBtn')
            try: S.wait_ready(pg)
            except Exception as e: msgs.append('not ready')
            pg.wait_for_timeout(2500)
            if page == 'index.html':
                for js in ("applyView('table')", "applyView('cards')", "openHoldingsView()", "location.hash='#holdings/BTC'", "history.back()"):
                    try: pg.evaluate(js); pg.wait_for_timeout(500)
                    except Exception as e: msgs.append(f'eval {js}: {e}')
            print(f'{name:7} {page:20} {len(msgs)} issues'); [print('   ', m) for m in msgs]
            bad += msgs; pg.close()
        ctx.close()
    br.close()
sys.exit(1 if bad else 0)
