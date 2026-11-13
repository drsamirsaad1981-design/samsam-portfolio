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
            check('member: before starting, the baseline shown is today, not Oct 15', pg.evaluate("Samsam.getBaseline().date") == TODAY, pg.evaluate("Samsam.getBaseline()"))
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
            # 🔑 Settings → My Claude key (members only): the key goes to the Worker once, typed in a hidden field
            calls = []
            def key_route(r):
                body = json.loads(r.request.post_data or '{}'); calls.append(body)
                r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                          body=json.dumps({'has': True, 'tail': 'wxyz'} if body.get('action') == 'set' else {'has': False}))
            ctx.route('https://samsam-analysis.dr-samir-saad-1981.workers.dev/key', key_route)
            pg.evaluate("document.getElementById('blModal').classList.remove('show')")
            pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet')
            check('member: Settings has "My Claude key"', 'My Claude key' in pg.inner_text('#cpSet'))
            check('member: no "Telegram alerts" in Settings (they reach Samir only)', 'Telegram alerts' not in pg.inner_text('#cpSet') and 'Link the Telegram bot' in pg.inner_text('#cpSet'))
            pg.evaluate("window.__cpAutoAnswer = null")
            pg.click('#stRow_claudekey')
            pg.wait_for_selector('#cpDialog #cpdI')
            check('member: the key is typed in a hidden (password) field', pg.get_attribute('#cpDialog #cpdI', 'type') == 'password')
            pg.fill('#cpDialog #cpdI', 'sk-ant-test-key-wxyz'); pg.click('#cpDialog .cpd-ok')
            pg.wait_for_function("document.querySelector('#cpDialog') && /Saved/.test(document.querySelector('#cpDialog').textContent)", timeout=8000)
            check('member: status asked, then the key sent once with their sign-in token → "Saved (…wxyz)"', [c.get('action') for c in calls] == ['status', 'set'] and calls[1].get('key') == 'sk-ant-test-key-wxyz' and calls[1].get('idToken'), [c.get('action') for c in calls])
            # AI Analysis → the quick report: off without their own key (the free Claude-app way stays); with a key → on
            state = {'has': False}
            def key_route2(r):
                body = json.loads(r.request.post_data or '{}')
                st = {'has': True, 'tail': 'wxyz', 'reports': {'limit': 10, 'used': 0, 'left': 10}} if state['has'] else {'has': False, 'reports': {'limit': 0, 'used': 0, 'left': 0}}
                r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(st))
            ctx.unroute('https://samsam-analysis.dr-samir-saad-1981.workers.dev/key'); ctx.route('https://samsam-analysis.dr-samir-saad-1981.workers.dev/key', key_route2)
            pg.evaluate("document.getElementById('cpDialog') && document.getElementById('cpDialog').remove()")
            pg.evaluate("openAnalysis()"); pg.wait_for_function("document.querySelector('#analysisBody .ai-quick') && /Claude key/.test(document.querySelector('#analysisBody .ai-opt:last-child').textContent)", timeout=8000)
            check('member: AI Analysis quick report is OFF without their own key ("Needs your own Claude key"), the free way is there', pg.is_disabled('#analysisBody .ai-quick') and pg.is_visible('#aiAppCopy'))
            state['has'] = True
            pg.evaluate("renderAiStart()"); pg.wait_for_function("/10 left today/.test(document.querySelector('#analysisBody .ai-opt:last-child').textContent)", timeout=8000)
            check('member: with their own key → ON, "on your own Claude key (…wxyz) — 10 of 10 left today"', not pg.is_disabled('#analysisBody .ai-quick') and 'wxyz' in pg.inner_text('#analysisBody .ai-opt:last-child'))
            urllib.request.urlopen('http://127.0.0.1:8787/reset').read()
        else:
            check('owner: the setup still offers the Oct-15 starting portfolio', 'Oct-15' in txt, txt)
            check('owner: Samsam.isOwner() is true', pg.evaluate("Samsam.isOwner()") is True)
            pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet')
            check('owner: no "My Claude key" in Settings (your key is the Worker\'s)', 'My Claude key' not in pg.inner_text('#cpSet'))
            pg.evaluate("document.getElementById('cpSet') && document.getElementById('cpSet').remove()")
            pg.evaluate("openAnalysis()"); pg.wait_for_selector('#analysisBody .ai-quick'); pg.wait_for_timeout(500)
            check('owner: the quick report stays on (your key)', not pg.is_disabled('#analysisBody .ai-quick'))
        check(f'{who}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
