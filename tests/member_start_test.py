"""An invited member's first visit (phase 10): a new, empty portfolio of their own — never Samir's Oct-15 starting
portfolio — a baseline of the day they start, a member's wording on the other pages; Samir's own setup is unchanged."""
import sys, pathlib, json, urllib.request, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
urllib.request.urlopen('http://127.0.0.1:8787/reset').read()   # an empty cloud
TODAY = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')

with sync_playwright() as p:
    br = p.chromium.launch()
    for who in ('member', 'owner'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        S.setup(ctx)
        if who == 'member': ctx.add_init_script("window.__FAKE_EMAIL = 'friend@icloud.com'")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_selector('#samsamSetup', state='visible', timeout=15000)
        txt = pg.inner_text('#samsamSetup')
        if who == 'member':
            check('member: a welcome, not "the cloud is empty / most up-to-date device"', 'Welcome' in txt and 'most up-to-date' not in txt, txt)
            check('member: no "Start from the Oct-15 starting portfolio" (that is Samir\'s)', 'Oct-15' not in txt and not pg.is_visible('#samsamImpBase'), txt)
            check('member: Samsam.isOwner() is false', pg.evaluate("Samsam.isOwner()") is False)
            pg.goto(SITE + '/market.html'); pg.wait_for_selector('#samsamSetup', state='visible', timeout=15000)
            check('member: other pages say "your portfolio is new", not "One-time setup needed"', 'new' in pg.inner_text('#samsamSetup') and 'One-time' not in pg.inner_text('#samsamSetup'), pg.inner_text('#samsamSetup'))
            pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamStartEmpty', state='visible', timeout=15000)
            pg.click('#samsamStartEmpty')
            pg.wait_for_function("Samsam.isReady() && !Samsam.getBaseline().isDefault", timeout=15000)
            b = pg.evaluate("Samsam.getBaseline()")
            check('member: "Start my portfolio" → an empty portfolio, the setup is gone', pg.evaluate("Samsam.getState().portfolio.length") == 0 and not pg.is_visible('#samsamSetup'))
            check('member: the baseline is the day they started, at the BTC price then (not Oct 15)', b['date'] in (TODAY, (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).strftime('%Y-%m-%d')) and b['btcPrice'] > 0, b)
            pg.evaluate("openBaselineEdit && openBaselineEdit()")
            pg.wait_for_timeout(300)
            check('member: Baseline editor has no "Use the original baseline (Oct 15)"', not pg.is_visible('#blReset'))
            urllib.request.urlopen('http://127.0.0.1:8787/reset').read()
        else:
            check('owner: the setup still offers the Oct-15 starting portfolio', 'Oct-15' in txt, txt)
            check('owner: Samsam.isOwner() is true', pg.evaluate("Samsam.isOwner()") is True)
        check(f'{who}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
