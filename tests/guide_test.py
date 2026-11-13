"""📘 Settings → Guide: the same guide as the bot's /guide (guide.json), English / العربية, every part closed until tapped."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
G = json.loads((pathlib.Path(__file__).resolve().parent.parent / 'guide.json').read_text())

with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000)
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_guide')
        check(f'{name}: Settings → About → "Guide"', pg.is_visible('#stRow_guide'))
        pg.click('#stRow_guide'); pg.wait_for_selector('#cpGuide details', timeout=10000)
        n = pg.locator('#cpGuide details').count()
        check(f'{name}: every part of the guide, all closed', n == len(G['sections']) and pg.locator('#cpGuide details[open]').count() == 0, n)
        pg.click('#cpGuide details[data-k="alerts"] summary'); pg.wait_for_timeout(150)
        check(f'{name}: tap a part → it opens (the bot\'s text: /alerts)', '/alerts' in pg.inner_text('#cpGuide details[data-k="alerts"]'))
        pg.click('#cpGuide [data-l="ar"]'); pg.wait_for_timeout(150)
        check(f'{name}: العربية → Arabic, right-to-left', pg.get_attribute('#cpGuideBody', 'dir') == 'rtl' and G['sections'][0]['t']['ar'] in pg.inner_text('#cpGuide'))
        pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'guide_{name}.png'))
        check(f'{name}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
