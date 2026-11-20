"""📱 The bot's Mini App opens the FULL app inside Telegram: Telegram's signed data (in the address, #tgWebAppData=…) is
kept, taken out of the address, sent to the Worker (/tg/login) — its token signs the account in, no Google page.
Not linked → a Telegram message instead of the Google / e-mail sign-in (neither works inside Telegram)."""
import sys, pathlib, json, urllib.request, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
urllib.request.urlopen('http://127.0.0.1:8787/reset').read()
INIT = 'query_id=AAE&user=%7B%22id%22%3A555%7D&auth_date=1763640000&hash=abc123'
HASH = '#tgWebAppData=' + urllib.parse.quote(INIT, safe='') + '&tgWebAppVersion=8.0&tgWebAppPlatform=android'
LOGIN = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/tg/login'

with sync_playwright() as p:
    br = p.chromium.launch()
    for case in ('owner', 'not-linked'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        S.setup(ctx); sent = []
        def login(r):   # (one argument: Playwright passes the request too when a handler takes two)
            if r.request.method == 'OPTIONS': return r.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
            sent.append(json.loads(r.request.post_data or '{}'))
            body, st = ({'token': 'fake-custom:owner@example.com'}, 200) if case == 'owner' else ({'error': 'not-linked'}, 403)
            r.fulfill(status=st, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(body))
        ctx.route(LOGIN, login)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html' + HASH)
        if case == 'owner':
            pg.wait_for_selector('#samsamSetup', state='visible', timeout=20000)   # (an empty cloud: the first-time setup — so, signed in)
            check('📱 opened from the bot → signed in by Telegram (the first-time setup shows), no Google button pressed', not pg.is_visible('#samsamSignInBtn') and pg.evaluate("JSON.parse(localStorage.getItem('__fake_user')).email") == 'owner@example.com')
            check('…the Worker got Telegram\'s data exactly as signed (initData)', len(sent) == 1 and sent[0].get('initData') == INIT, sent)
            check('…Telegram\'s data taken out of the address bar', 'tgWebAppData' not in pg.url, pg.url)
            check('…the page knows it is in Telegram (html.in-tg)', pg.evaluate("document.documentElement.classList.contains('in-tg')"))
            pg.goto(SITE + '/accumulation.html'); pg.wait_for_timeout(2500)
            check('…another page of the app: still signed in (no gate), no second sign-in call', len(sent) == 1 and not pg.is_visible('#samsamSignInBtn'), sent)
        else:
            pg.wait_for_selector('#samsamGate', state='visible', timeout=20000)
            t = pg.inner_text('#samsamGate')
            check('📱 not linked → "link your portfolio to the bot" in the app (no Google / e-mail sign-in inside Telegram)', 'not linked' in t and 'Link your portfolio to the Telegram bot' in t and not pg.is_visible('#samsamSignInBtn') and not pg.is_visible('#samsamEmail'), t)
        check(f'…no page errors ({case})', not errs, errs)
        ctx.close()
    br.close()
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
