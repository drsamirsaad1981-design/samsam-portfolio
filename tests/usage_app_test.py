"""📖📊 The app counts its own Firebase reads (estimate, per Pacific day) and which screens / actions are used, and sends
the counts to the Worker (/use) at most every 3 hours. The owner's dashboard shows all of today's reads (app + bot round +
rest of the bot) against the 50,000 free allowance, and what gets used over 7 days."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
W = 'https://samsam-analysis.dr-samir-saad-1981.workers.dev'
OV = {'max': 20, 'price': 350, 'maxChoices': [20, 50, 100],
      'stats': {'members': 0, 'paused': 0, 'premium': 0, 'premiumStars': 0, 'supporters': 0, 'starsMonth': 0, 'starsAll': 0, 'starsMonthPremium': 0, 'starsMonthSupport': 0, 'idle': 0, 'readsToday': 20000},
      'idleDays': 14, 'readsOwner': 20000, 'members': [], 'payments': [], 'removed': [],
      'fsReads': {'day': '2026-11-18', 'round': 20000, 'worker': 1000, 'app': 10000, 'total': 31000, 'limit': 50000, 'pct': 62},
      'use': {'today': [{'name': 'cmd:portfolio', 'n': 4}, {'name': 'app:page:market', 'n': 2}],
              'week': [{'name': 'cmd:portfolio', 'n': 30}, {'name': 'text', 'n': 12}, {'name': 'app:page:market', 'n': 9}, {'name': 'voice', 'n': 1}]}}
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    S.setup(ctx); uses = []
    def use_route(r):
        uses.append(json.loads(r.request.post_data or '{}'))
        r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":true}')
    ctx.route(W + '/use', use_route)
    ctx.route(W + '/admin', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(OV)))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=15000)
    pg.wait_for_timeout(1500)
    n = pg.evaluate("Samsam.readsToday()")
    check('the app counts its Firebase reads (first load: every coin / transaction / plan row)', n >= 10, n)
    pg.wait_for_timeout(8000)
    check('sent to the Worker once, ~8 s after sign-in', len(uses) == 1, len(uses))
    if uses:
        b = uses[0]; reads = b.get('reads') or {}
        check('the report: sign-in token, this device, reads per day, screens used — counts only', b.get('idToken') and len(b.get('dev', '')) == 8 and max(reads.values() or [0]) >= 10 and (b.get('feats') or {}).get('page:index', 0) >= 1, b)
        check('nothing about the portfolio is in it (no coin, amount or name)', set(b.keys()) <= {'idToken', 'dev', 'reads', 'feats'} and 'BTC' not in json.dumps(b))
    left = pg.evaluate("JSON.parse(localStorage.getItem('cp-feats') || '{}')")
    check('sent screen counts leave the device', not left.get('page:index'), left)
    pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(9500)
    check('opened again within 3 hours → not sent again', len(uses) == 1, len(uses))
    pg.evaluate("Samsam.sendUse(true)"); pg.wait_for_timeout(800)
    check('…the counts keep adding up meanwhile (this screen opened again)', len(uses) == 2 and (uses[-1].get('feats') or {}).get('page:index', 0) >= 1, uses[-1:] )
    # the owner's dashboard
    pg.evaluate("document.getElementById('samsamSetup') && (document.getElementById('samsamSetup').style.display='none')")
    pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet'); pg.click('#stRow_admin'); pg.wait_for_selector('#cpAdm .ad-card', timeout=10000)
    t = pg.inner_text('#cpAdm')
    check('dashboard: all of today\'s Firebase reads, % of the allowance, and where they came from', '📖 Firebase reads today' in t and '31,000 · 62%' in t and 'of 50,000' in t and '📱 app 10,000' in t and '🤖 round 20,000' in t and '⚙️ bot 1,000' in t, t[:600])
    check('dashboard: 60%+ → the card is marked', pg.locator('#cpAdm .ad-card.ad-warm').count() == 1)
    pg.click('#cpAdm details[data-chat="__use"] summary'); pg.wait_for_timeout(200)
    u = pg.inner_text('#cpAdm details[data-chat="__use"]')
    check('dashboard: 📊 what gets used (7 days, today) in plain names', 'Last 7 days (4)' in u and '🤖 /portfolio' in u and 'today 4' in u and '💬 Questions / tickers typed' in u and '📱 screen market' in u and '🎙️ Voice notes' in u, u)
    pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / 'usage_admin.png'))
    # 📖 counted once per listener, not once per frame / page: the app's frames share one connection, and a page opened
    # again within 30 minutes is not billed again (33,000 "reads" were shown on a day Firebase counted 7,300)
    pg.goto(SITE + '/index.html'); pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=15000); pg.wait_for_timeout(1500)
    a = pg.evaluate("Samsam.readsToday()")
    pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=15000); pg.wait_for_timeout(1500)
    b = pg.evaluate("Samsam.readsToday()")
    check(f'opened again within 30 minutes → the same documents are not counted again ({a} → {b})', b - a <= 3, [a, b])
    pg.evaluate("localStorage.removeItem('cp-fs-l')")
    pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=15000); pg.wait_for_timeout(1500)
    c = pg.evaluate("Samsam.readsToday()")
    check(f'after 30 minutes away → a new query, every document counted ({b} → {c})', c - b >= 10, [b, c])
    check('no page errors', not errs, errs[:3])
    ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
