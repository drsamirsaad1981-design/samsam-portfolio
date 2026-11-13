"""🎟 An invite opened in the APP (…/?invite=CODE from the owner's dashboard): the person signs in with any e-mail and is in
at once (the Worker's /join adds their e-mail to the access list) — no Telegram, no second approval. Without the link,
the "not allowed yet" screen takes the code by hand."""
import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
JOIN = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev/join'
GOOD = 'ABCD2345'
# the page lifts its "not invited" state once /join said yes (as the database rules would)
UNDENY = "(() => { const f = window.fetch; window.fetch = async (u, o) => { const r = await f(u, o); if (String(u).endsWith('/join') && r.ok) window.__FAKE_DENY = false; return r; }; })()"

with sync_playwright() as p:
    br = p.chromium.launch()
    for case in ('link', 'by-hand'):
        urllib.request.urlopen('http://127.0.0.1:8787/reset').read()
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        S.setup(ctx)
        ctx.add_init_script("window.__FAKE_EMAIL = 'new.friend@x.com'; window.__FAKE_DENY = true;"); ctx.add_init_script(UNDENY)
        calls = []
        def route(r):
            body = json.loads(r.request.post_data or '{}'); calls.append(body)
            ok = body.get('code') == GOOD
            r.fulfill(status=200 if ok else 400, content_type='application/json', headers={'access-control-allow-origin': '*'},
                      body=json.dumps({'ok': True} if ok else {'error': 'That invite code is not valid (or was already used).'}))
        ctx.route(JOIN, route)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        if case == 'link':
            pg.goto(SITE + '/index.html?invite=' + GOOD.lower()); pg.wait_for_selector('#samsamSignInBtn')
            check('link: the ?invite= code is kept on this device and taken off the address', pg.evaluate("localStorage.getItem('cp-invite')") == GOOD and 'invite=' not in pg.url, pg.url)
            check('link: the sign-in screen says "You\'re invited — sign in to join"', "invited" in pg.inner_text('#samsamGate'))
            pg.click('#samsamSignInBtn')
            pg.wait_for_selector('#samsamStartEmpty', state='visible', timeout=15000)
            check('link: after sign-in → /join with the code + their sign-in token → straight in (the new member\'s welcome)', len(calls) == 1 and calls[0].get('code') == GOOD and calls[0].get('idToken'), calls)
            check('link: the code is not kept any more', pg.evaluate("localStorage.getItem('cp-invite')") is None)
        else:
            pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
            pg.wait_for_selector('#samsamInvite', timeout=15000)
            check('by hand: not invited yet → "isn\'t allowed in yet" + an invite-code box (no /join tried without a code)', "allowed in yet" in pg.inner_text('#samsamGate') and calls == [])
            pg.fill('#samsamInvite', 'WRONG123'); pg.click('#samsamJoinBtn'); pg.wait_for_function("/not valid/.test(document.getElementById('samsamGateErr').textContent)", timeout=8000)
            check('by hand: a wrong code → "not valid", still outside', pg.is_visible('#samsamInvite'))
            pg.fill('#samsamInvite', GOOD.lower()); pg.click('#samsamJoinBtn')
            pg.wait_for_selector('#samsamStartEmpty', state='visible', timeout=15000)
            check('by hand: the right code → in (the welcome to start a portfolio)', calls[-1].get('code') == GOOD)
        check(f'{case}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
