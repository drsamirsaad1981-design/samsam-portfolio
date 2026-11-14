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
            check('member: no "Telegram alerts" in Settings (they reach Samir only); a Telegram section: link the bot, join the channel, join the group', 'Telegram alerts' not in pg.inner_text('#cpSet') and all(w in pg.inner_text('#cpSet') for w in ('Link your portfolio to the Telegram bot', 'Join Cute Portfolio Signals', 'Join Cute Portfolio Community')))
            check('member: an AI section: "AI Analysis & questions" + "My Claude key"', pg.is_visible('#stRow_aiinfo') and pg.is_visible('#stRow_claudekey'))
            pg.evaluate("window.__cpAutoAnswer = null")
            pg.click('#stRow_claudekey')
            pg.wait_for_selector('#cpDialog #cpdI')
            check('member: the key is typed in a hidden (password) field', pg.get_attribute('#cpDialog #cpdI', 'type') == 'password')
            pg.fill('#cpDialog #cpdI', 'sk-ant-test-key-wxyz'); pg.click('#cpDialog .cpd-ok')
            pg.wait_for_function("document.querySelector('#cpDialog') && /Saved/.test(document.querySelector('#cpDialog').textContent)", timeout=8000)
            check('member: status asked, then the key sent once with their sign-in token → "Saved (…wxyz)", then Settings re-reads the status (🔑 shows)', [c.get('action') for c in calls][-3:] == ['status', 'set', 'status'] and [c.get('action') for c in calls].count('set') == 1 and [c for c in calls if c.get('action') == 'set'][0].get('key') == 'sk-ant-test-key-wxyz' and [c for c in calls if c.get('action') == 'set'][0].get('idToken'), [c.get('action') for c in calls])
            # 💛 Support Cute Portfolio & Channel: one card — free & non-profit, ⭐ premium (also a supporter), 💛 one-time, the channel / group;
            # each button opens Telegram's own payment for this member (the Worker makes the link)
            def sup_route(r):
                body = json.loads(r.request.post_data or '{}'); calls.append(body)
                out = {'link': 'https://t.me/$pay-' + body.get('kind', '') + str(body.get('n', ''))} if body.get('action') == 'invoice' else \
                      {'has': False, 'premium': False, 'supporter': False, 'starsPaid': 0, 'botLinked': True, 'price': 350, 'amounts': [50, 100, 250, 500],
                       'community': {'channel': 'https://t.me/+chan', 'group': 'https://t.me/+grp'}, 'reports': {'limit': 0, 'used': 0, 'left': 0}}
                r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out))
            ctx.unroute('https://samsam-analysis.dr-samir-saad-1981.workers.dev/key'); ctx.route('https://samsam-analysis.dr-samir-saad-1981.workers.dev/key', sup_route)
            pg.evaluate("document.getElementById('cpDialog') && document.getElementById('cpDialog').remove(); window.__opened = []; window.open = (u) => { const w = { location: { set href(v) { window.__opened.push(v); } }, close() {} }; if (u) window.__opened.push(u); return w; }; 0")
            pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_support')
            check('member: Settings → one "Support Cute Portfolio & Channel 💛" line (no separate Premium line)', pg.is_visible('#stRow_support') and pg.locator('#stRow_premium').count() == 0)
            pg.click('#stRow_support'); pg.wait_for_selector('#cpSup [data-pay="prem"]', timeout=8000)
            t = pg.inner_text('#cpSup')
            check('member: the card says free & non-profit + optional; ⭐ premium (voice, 20 questions, 3 reports, Supporter badge, 350 ⭐ a month); 💛 50 / 100 / 250 / 500; the channel & group',
                  all(w in t for w in ('completely free and non-profit', 'optional', 'Voice notes', '20 AI questions', 'Supporter badge', '350 ⭐ a month', 'Join the channel', 'Join the group')) and pg.locator('#cpSup [data-pay="sup"]').count() == 4, t[:300])
            pg.click('#cpSup [data-pay="prem"]'); pg.wait_for_function("window.__opened.length >= 1", timeout=8000)
            check('member: ⭐ Become premium → straight to Telegram\'s payment (a link made for this member)', pg.evaluate("window.__opened[0]") == 'https://t.me/$pay-prem0' and calls[-1].get('action') == 'invoice' and calls[-1].get('kind') == 'prem', pg.evaluate("window.__opened"))
            pg.click('#cpSup [data-pay="sup"][data-n="100"]'); pg.wait_for_function("window.__opened.length >= 2", timeout=8000)
            check('member: 💛 100 ⭐ → a one-time payment link', pg.evaluate("window.__opened[1]") == 'https://t.me/$pay-sup100')
            pg.evaluate("document.getElementById('cpSup').remove()")
            pg.wait_for_selector('#cpfSup:not([hidden])', timeout=8000)
            check('member: a quiet line at the bottom of the page: "💛 Free & non-profit · Support the project"', 'Support the project' in pg.inner_text('#cpfSup'))
            pg.click('#cpfSup [data-sup]'); pg.wait_for_selector('#cpSup', timeout=8000)
            check('member: …tapping it opens the Support card', pg.is_visible('#cpSup')); pg.evaluate("document.getElementById('cpSup').remove()")
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
            check('member: …and a "Get Premium in the bot" button (350 Stars a month) → the bot\'s premium page', pg.is_visible('#analysisBody .ai-prem') and pg.get_attribute('#analysisBody .ai-prem', 'href').endswith('?start=premium') and '350' in pg.inner_text('#analysisBody .ai-opt:last-child'))
            state['has'] = True
            pg.evaluate("renderAiStart()"); pg.wait_for_function("/10 left today/.test(document.querySelector('#analysisBody .ai-opt:last-child').textContent)", timeout=8000)
            check('member: with their own key → ON, "on your own Claude key (…wxyz) — 10 of 10 left today"', not pg.is_disabled('#analysisBody .ai-quick') and 'wxyz' in pg.inner_text('#analysisBody .ai-opt:last-child'))
            urllib.request.urlopen('http://127.0.0.1:8787/reset').read()
        else:
            check('owner: the setup still offers the Oct-15 starting portfolio', 'Oct-15' in txt, txt)
            check('owner: Samsam.isOwner() is true', pg.evaluate("Samsam.isOwner()") is True)
            pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet')
            check('owner: no "My Claude key" in Settings (your key is the Worker\'s)', 'My Claude key' not in pg.inner_text('#cpSet'))
            check('owner: no Support row (members only), no support line at the bottom', not pg.is_visible('#stRow_support') and pg.locator('#cpfSup[hidden]').count() == 1)
            pg.evaluate("document.getElementById('cpSet') && document.getElementById('cpSet').remove()")
            pg.evaluate("openAnalysis()"); pg.wait_for_selector('#analysisBody .ai-quick'); pg.wait_for_timeout(500)
            check('owner: the quick report stays on (your key)', not pg.is_disabled('#analysisBody .ai-quick'))
        check(f'{who}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
