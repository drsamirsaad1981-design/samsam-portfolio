"""🗑 Settings → Delete my account (members only): what goes is told, the word DELETE must be typed, every document of
the portfolio is deleted, the bot is asked to forget the member, the sign-in goes — and the owner never sees the line."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def mine(): return [k for k in S.srv('/dump') if k.startswith('users/uid_samir/')]
AUTO = """window.__word = ''; window.__cpAutoAnswer = (kind, msg, o) => { (window.__cpLog = window.__cpLog || []).push(kind + ': ' + msg);
  if (kind === 'prompt') return /Type DELETE/.test(msg) ? window.__word : '';
  if (kind === 'confirm' && /encrypted backup/.test(msg)) return false;   // "No backup"
  return true; };"""
with sync_playwright() as p:
    br = p.chromium.launch()
    # the owner: no such line
    ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx); pg = ctx.new_page()
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 0")
    pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stAct_backup')
    check('the owner has no "Delete my account" line', pg.locator('#stRow_delacct').count() == 0)
    check('…and the app refuses it for the owner even if called', 'owner account' in pg.evaluate("Samsam.deleteAccount().then(() => 'done', e => e.message)"))
    check('…nothing was deleted', len(mine()) > 10, len(mine()))
    ctx.close()
    # a member
    ctx = br.new_context(viewport={'width': 390, 'height': 844}); S.setup(ctx)
    ctx.add_init_script("window.__FAKE_EMAIL = 'friend@icloud.com'; window.__copyWait = 600;"); ctx.add_init_script(AUTO)
    calls = []
    def leave(r):
        calls.append(json.loads(r.request.post_data or '{}'))
        r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'member': True}))
    ctx.route('**/leave', leave)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 0")
    pg.wait_for_function("Samsam.autoCopies().length === 1", timeout=15000)
    before = mine()
    check(f'a member with a portfolio and an automatic copy ({len(before)} documents)', len(before) > 10 and any('/snaps/0copy' in k for k in before) and any('/txs/' in k for k in before))
    pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_delacct')
    check('the member sees "Delete my account" under Account & data', 'Delete my account' in pg.inner_text('#stRow_delacct') and 'for good' in pg.inner_text('#stRow_delacct'))
    pg.screenshot(path=str(SH / 'delete_account_row.png'))
    pg.click('#stRow_delacct'); pg.wait_for_timeout(900)
    log = pg.evaluate("window.__cpLog")
    check('it says what goes, offers a backup, and asks for the word DELETE', len(log) >= 3 and 'for good' in log[0] and 'membership' in log[0] and 'new invitation' in log[0] and 'backup' in log[1] and 'Type DELETE' in log[2], log)
    check('without the word nothing is deleted, and the bot is not called', len(mine()) == len(before) and not calls and any('Nothing was deleted' in x for x in log), [len(mine()), calls, log[-1]])
    pg.evaluate("window.__word = 'delete'; window.__cpLog = []")
    if not pg.is_visible('#stRow_delacct'): pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_delacct')
    pg.click('#stRow_delacct'); pg.wait_for_selector('#cpGoneGo', timeout=20000)
    left = mine()
    check('with DELETE typed every document of the portfolio is gone (coins, transactions, plans, chart history, copies, settings)', not left, left[:6])
    check('the bot is asked to forget the member, with the sign-in and the confirmation', len(calls) == 1 and calls[0].get('confirm') == 'DELETE' and str(calls[0].get('idToken', '')).startswith('fake-id-token'), calls)
    check('the sign-in itself is deleted', pg.evaluate("window.__fakeUserDeleted === true && !localStorage.getItem('__fake_user')"))
    txt = pg.inner_text('#cpGone')
    check('a plain last screen: deleted, thank you, Close → the welcome page', 'Your account is deleted' in txt and 'Thank you' in txt and pg.get_attribute('#cpGoneGo', 'href') == 'welcome/en.html', txt)
    pg.screenshot(path=str(SH / 'delete_account_done.png'))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
