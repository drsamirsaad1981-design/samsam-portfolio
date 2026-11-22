"""📘 Settings → Guide: the same guide as the bot's /guide (guide.json), English / العربية, every part closed until tapped."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
G = json.loads((pathlib.Path(__file__).resolve().parent.parent / 'guide.json').read_text())
A = json.loads((pathlib.Path(__file__).resolve().parent.parent / 'guide-app.json').read_text())

with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000)
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_guide')
        check(f'{name}: Settings → About → "Guide"', pg.is_visible('#stRow_guide'))
        with ctx.expect_page() as np: pg.click('#stRow_privacy')
        pv = np.value; pv.wait_for_load_state()
        check(f'{name}: Settings → About → "Privacy & terms" opens the page beside the app, Settings stays', pv.url.endswith('/welcome/privacy-en.html') and 'Privacy' in pv.title() and pg.is_visible('#stRow_guide'), [pv.url, pv.title()])
        pv.close()
        pg.click('#stRow_guide'); pg.wait_for_selector('#cpGuide details', timeout=10000)
        n = pg.locator('#cpGuide details').count()
        check(f'{name}: opens on 📱 The app — every part of the app guide, grouped, all closed', n == len(A['sections']) and pg.locator('#cpGuide details[open]').count() == 0 and pg.locator('#cpGuide .gd-grp').count() == len(A['groups']) and pg.get_attribute('#cpGuide [data-w="app"]', 'aria-pressed') == 'true', n)
        pg.click('#cpGuide details[data-k="signals"] summary'); pg.wait_for_timeout(150)
        tx = pg.inner_text('#cpGuide details[data-k="signals"]')
        check(f'{name}: an app part: summary, numbered steps, a 💡 tip', pg.locator('#cpGuide details[data-k="signals"] ol li').count() == len(A['sections'][4]['en']) and 'Reinforce' in tx and 'Tip' in tx, tx[:200])
        pg.click('#cpGuide [data-w="bot"]'); pg.wait_for_selector('#cpGuide details[data-k="alerts"]', timeout=10000)
        n = pg.locator('#cpGuide details').count()
        check(f'{name}: 🤖 The bot → every part of the bot guide, all closed', n == len(G['sections']) and pg.locator('#cpGuide details[open]').count() == 0, n)
        pg.click('#cpGuide details[data-k="alerts"] summary'); pg.wait_for_timeout(150)
        check(f'{name}: tap a part → it opens (the bot\'s text: /alerts)', '/alerts' in pg.inner_text('#cpGuide details[data-k="alerts"]'))
        pg.click('#cpGuide [data-l="ar"]'); pg.wait_for_timeout(150)
        check(f'{name}: العربية → Arabic, right-to-left', pg.get_attribute('#cpGuideBody', 'dir') == 'rtl' and G['sections'][0]['t']['ar'] in pg.inner_text('#cpGuide') and 'البوت' in pg.inner_text('#cpGuide .gd-tabs'))
        pg.click('#cpGuide [data-w="app"]'); pg.wait_for_timeout(200)
        check(f'{name}: back to 📱 التطبيق, in Arabic', A['sections'][0]['t']['ar'] in pg.inner_text('#cpGuide') and 'محفظتك' in pg.inner_text('#cpGuide'))
        pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'guide_{name}.png'))
        check(f'{name}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
ok_html = lambda l: l.count('<b>') == l.count('</b>') and l.count('<i>') == l.count('</i>')
check('guide-app.json: every part has a title, summary, 2–5 steps in both languages, a tip, a known group', all(x['k'] and x['t']['ar'] and x['s']['ar'] and x['tip']['ar'] and 2 <= len(x['en']) <= 5 and len(x['en']) == len(x['ar']) and any(g['k'] == x['g'] for g in A['groups']) and all(ok_html(l) for l in x['en'] + x['ar']) for x in A['sections']))
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
