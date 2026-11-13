"""The owner's admin dashboard in the app (Settings → Admin dashboard): only Samir's account has the line; it shows the
numbers, members (search, open on a tap, actions), a new invite code with its link, and the Stars log. A member never sees it."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
URL = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/admin'
NOW = 1794600000000
OV = {'max': 20, 'price': 350,
      'stats': {'members': 2, 'paused': 0, 'premium': 1, 'premiumStars': 1, 'supporters': 1, 'starsMonth': 400, 'starsAll': 400, 'starsMonthPremium': 350, 'starsMonthSupport': 50},
      'members': [{'chat': '111', 'name': 'Ali Friend', 'user': 'ali', 'joined': NOW, 'email': 'ali@x.com', 'pending': '', 'linked': True, 'paused': False, 'premium': True, 'premUntil': NOW + 30 * 864e5,
                   'premSrc': 'stars', 'supporter': True, 'starsPaid': 50, 'ai': 20, 'reports': 3, 'usedQ': 4, 'usedR': 1, 'ownKey': None, 'lang': 'en'},
                  {'chat': '222', 'name': 'Mona', 'user': '', 'joined': NOW, 'email': '', 'pending': 'mona@x.com', 'linked': False, 'paused': False, 'premium': False, 'premUntil': None,
                   'premSrc': None, 'supporter': False, 'starsPaid': 0, 'ai': 5, 'reports': 0, 'usedQ': 0, 'usedR': 0, 'ownKey': None, 'lang': 'ar'}],
      'payments': [{'t': NOW, 'chat': '111', 'name': 'Ali Friend', 'kind': 'sup', 'stars': 50, 'renew': False}, {'t': NOW, 'chat': '111', 'name': 'Ali Friend', 'kind': 'prem', 'stars': 350, 'renew': False}]}

with sync_playwright() as p:
    br = p.chromium.launch()
    for who in ('owner', 'member'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        S.setup(ctx)
        if who == 'member': ctx.add_init_script("window.__FAKE_EMAIL = 'friend@icloud.com'")
        calls = []
        def route(r):
            body = json.loads(r.request.post_data or '{}'); calls.append(body)
            if body.get('action') == 'invite': out = {'code': 'K7M2PQ9R', 'link': 'https://t.me/samsam_portfolio_bot?start=K7M2PQ9R', 'appLink': 'https://drsamirsaad1981-design.github.io/samsam-portfolio/?invite=K7M2PQ9R', 'days': 7}
            elif body.get('action') == 'member':
                ov = json.loads(json.dumps(OV)); m = [x for x in ov['members'] if x['chat'] == body['chat']][0]
                if body['op'] == 'ai+': m['ai'] += 1
                if body['op'] == 'approve': m['email'] = m['pending']; m['pending'] = ''
                out = {'ok': True, 'overview': ov}
            elif body.get('action') == 'setMax': out = {**OV, 'max': body['max'], 'maxChoices': [20, 50, 100]}
            else: out = {**OV, 'maxChoices': [20, 50, 100]}
            r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out))
        ctx.route(URL, route)
        ctx.route('https://samsam-analysis.dr-samir-saad-1981.workers.dev/key', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"has":false}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000)
        pg.evaluate("document.getElementById('samsamSetup') && (document.getElementById('samsamSetup').style.display='none')")
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet')
        if who == 'member':
            check('member: no "Admin dashboard" in Settings', 'Admin dashboard' not in pg.inner_text('#cpSet'))
            pg.evaluate("window.SamsamAdmin ? SamsamAdmin.open() : 0"); pg.wait_for_timeout(300)
            check('member: even called directly, the dashboard does not open', not pg.is_visible('#cpAdm'))
        else:
            check('owner: Settings → "Admin dashboard"', pg.is_visible('#stRow_admin'))
            pg.click('#stRow_admin'); pg.wait_for_selector('#cpAdm .ad-card', timeout=10000)
            t = pg.inner_text('#cpAdm')
            check('owner: the numbers — members 2/20, premium 1 (Stars 1), supporters 1, Stars this month 400 (premium 350 · support 50), price 350 ⭐', all(w in t for w in ('2/20', 'Stars 1 · gift 0', '400', 'premium 350 · support 50', '350 ⭐')), t[:300])
            check('owner: members listed with badges (⭐💛📱🔗 / ⏳📱 waiting) and today\'s use, closed until tapped', 'Ali Friend' in t and 'today 🧠 4/20 · 📊 1/3' in t and pg.locator('#cpAdm details[data-chat="111"][open]').count() == 0)
            pg.fill('#cpAdmQ', 'mona'); pg.wait_for_timeout(200)
            check('owner: search by name / e-mail filters the list', pg.locator('#cpAdm details[data-chat="111"]').count() == 0 and pg.locator('#cpAdm details[data-chat="222"]').count() == 1)
            pg.click('#cpAdm details[data-chat="222"] summary'); pg.wait_for_timeout(200)
            check('owner: tap a member → their card opens: the app request waiting (✅ Allow / ❌ No), limits, gifts, pause, remove', 'Asks to open the app with mona@x.com' in pg.inner_text('#cpAdm details[data-chat="222"]') and pg.locator('#cpAdm details[data-chat="222"] [data-op="approve"]').count() == 1)
            pg.click('#cpAdm details[data-chat="222"] [data-op="approve"]'); pg.wait_for_function("!/Asks to open the app/.test(document.getElementById('cpAdm').textContent)", timeout=8000)
            check('owner: ✅ Allow → sent to the Worker; the list redraws (the card stays open)', calls[-1] == {**calls[-1], 'action': 'member', 'chat': '222', 'op': 'approve'} and pg.locator('#cpAdm details[data-chat="222"][open]').count() == 1)
            pg.fill('#cpAdmQ', ''); pg.wait_for_timeout(200)
            pg.click('#cpAdm [data-inv]'); pg.wait_for_selector('#cpAdm .ad-inv')
            check('owner: ➕ New invite code → the code + TWO links: 📱 the app (?invite=) and 🤖 the bot, one use, 7 days', 'K7M2PQ9R' in pg.inner_text('#cpAdm .ad-inv') and '?invite=K7M2PQ9R' in pg.inner_text('#cpAdm .ad-inv') and 't.me/samsam_portfolio_bot?start=K7M2PQ9R' in pg.inner_text('#cpAdm .ad-inv') and pg.locator('#cpAdm [data-copy="app"]').count() == 1)
            pg.click('#cpAdm [data-max="50"]'); pg.wait_for_function("/1\\/50|2\\/50/.test(document.getElementById('cpAdm').textContent)", timeout=8000)
            check('owner: max members → 50 (20 / 50 / 100)', calls[-1].get('action') == 'setMax' and calls[-1].get('max') == 50)
            pg.evaluate("window.__cpAutoAnswer = () => false")
            pg.click('#cpAdm details[data-chat="111"] summary'); pg.click('#cpAdm details[data-chat="111"] [data-op="remove"]'); pg.wait_for_timeout(400)
            check('owner: 🗑 Remove asks first (cancel → nothing sent)', calls[-1].get('op') != 'remove')
            pg.click('#cpAdm details[data-chat="__pay"] summary'); pg.wait_for_timeout(200)
            check('owner: the Stars log (premium / support, Stars) opens on a tap', '💛 support · 50 ⭐' in pg.inner_text('#cpAdm details[data-chat="__pay"]').replace('\n', ' ') or ('support' in pg.inner_text('#cpAdm details[data-chat="__pay"]') and '350' in pg.inner_text('#cpAdm details[data-chat="__pay"]')))
            check('owner: every call carries the sign-in token', all(c.get('idToken') for c in calls))
            pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / 'admin_dash.png'), full_page=False)
        check(f'{who}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
