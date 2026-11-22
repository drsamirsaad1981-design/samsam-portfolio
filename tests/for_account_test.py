"""The bot's app link is for one e-mail (…/?for=<8 hex of its SHA-256>). Opened in a browser signed in as someone else,
the app says so and offers to switch; for the same account it says nothing; the tag never stays in the address."""
import sys, pathlib, hashlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
tag = lambda e: hashlib.sha256(e.encode()).hexdigest()[:8]
LOG = "(window.__cpLog || []).filter(m => /signed in here/.test(m))"
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()")
    # the same account
    pg.goto(SITE + '/index.html?for=' + tag('owner@example.com')); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(2500)
    check('the link for THIS account → nothing is said', pg.evaluate(LOG) == [] and pg.evaluate("Samsam.isReady()"), pg.evaluate(LOG))
    check('…and the tag is gone from the address', 'for=' not in pg.url, pg.url)
    # another account, "Stay here"
    pg.evaluate("window.__cpAutoAnswer = (k, m) => { (window.__cpLog = window.__cpLog || []).push(m); return false; }")
    ctx.add_init_script("window.__stay = true;")
    ctx.add_init_script("if (window.__stay) { const old = window.__cpAutoAnswer; window.__cpAutoAnswer = (k, m, o) => /signed in here/.test(m) ? ((window.__cpLog = window.__cpLog || []).push(m), sessionStorage.getItem('t-switch') === '1') : old(k, m, o); }")
    pg.goto(SITE + '/index.html?for=' + tag('cutelearing@gmail.com')); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(2500)
    log = pg.evaluate(LOG)
    check('the link for ANOTHER e-mail → told once who is signed in here, and that the link was for another e-mail', len(log) == 1 and 'owner@example.com' in log[0] and 'another e-mail' in log[0] and 'cutelearing' not in log[0], log)
    check('…"Stay here" → still signed in, the address clean', pg.evaluate("Samsam.isReady()") and 'for=' not in pg.url)
    pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(2500)
    check('…and not asked again on the next page', pg.evaluate(LOG) == [])
    # another account, "Switch account"
    pg.evaluate("sessionStorage.setItem('t-switch', '1')")
    pg.goto(SITE + '/index.html?for=' + tag('cutelearing@gmail.com')); pg.wait_for_selector('#samsamSignInBtn', state='visible', timeout=15000)
    check('…"Switch account" → signed out, the sign-in screen is shown', pg.is_visible('#samsamSignInBtn') and pg.evaluate("!localStorage.getItem('__fake_user')"))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
