"""Cute Portfolio branding: titles + manifest + icons, splash until data is loaded, in-app dialogs (no browser 'site says' popups)."""
import sys, pathlib, json, re, time, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'; ROOT = pathlib.Path(__file__).resolve().parent.parent
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
m = json.loads((ROOT / 'manifest.json').read_text())
check('manifest name / short_name = Cute Portfolio', m['name'] == m['short_name'] == 'Cute Portfolio', (m['name'], m['short_name']))
check('manifest icons are the new PNGs (192, 512, maskable), no photo', [i['src'].split('?')[0] for i in m['icons']] == ['./icon-192.png', './icon-512.png', './icon-maskable-512.png'] and all((ROOT / i['src'].split('?')[0]).exists() for i in m['icons']))
src = {f: (ROOT / f).read_text() for f in ['index.html', 'accumulation.html', 'performance.html', 'recover.html']}
for f, s in src.items():
    check(f'{f}: title has Cute Portfolio, no old name / photo icon', 'Cute Portfolio' in re.search(r'<title>(.*?)</title>', s).group(1) and 'icon.jpg' not in s and 'سمسم' not in s and 'apple-mobile-web-app-title" content="Cute Portfolio"' in s)
allsrc = '\n'.join(list(src.values()) + [(ROOT / f).read_text() for f in ['samsam-cloud.js', 'samsam-vault.js', 'samsam-ui.js', 'samsam-home.js', 'samsam-analysis.js', 'samsam-shell.js', 'samsam-edits.js']])
native = re.findall(r'(?<![\w.])(alert|confirm|prompt)\(|window\.(alert|confirm|prompt)\(', allsrc)
check('no browser alert/confirm/prompt left anywhere (they show the site address)', not native, native)
check('no "Samsam Portfolio" text left for the user', not re.search(r'Samsam Portfolio|سمسم', allsrc))
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        dialogs = []; pg.on('dialog', lambda d: (dialogs.append(d.message), d.dismiss()))
        pg.goto(S.SITE + '/index.html', wait_until='commit'); pg.wait_for_selector('#cpSplash')
        html = urllib.request.urlopen(S.SITE + '/index.html').read().decode()
        first = pg.evaluate("(() => { const s = document.getElementById('cpSplash'); return { shown: true, text: s.innerText, photo: !!document.querySelector('img[src*=\"icon.jpg\"]') }; })()")
        first['shown'] = html.find('id="cpSplash"') < html.find('class="page-header"') if 'class="page-header"' in html else 'id="cpSplash"' in html[:html.find('<script', html.find('<body'))+10**6]
        check(f'{name}: splash with Cute Portfolio shows first (no photo)', first['shown'] and 'Cute Portfolio' in first['text'] and not first['photo'], first)
        pg.screenshot(path=str(T / f'splash-{name}.png'))
        pg.wait_for_selector('#samsamSignInBtn', timeout=10000)
        g = pg.evaluate("[document.getElementById('cpSplash').classList.contains('hide'), document.getElementById('samsamGate').innerText]")
        check(f'{name}: sign-in screen replaces splash, says Cute Portfolio', g[0] and 'Cute Portfolio' in g[1], g)
        pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(600)
        check(f'{name}: splash gone once data is loaded', pg.evaluate("document.getElementById('cpSplash').style.display === 'none'"))
        pg.reload(wait_until='commit'); pg.wait_for_selector('#cpSplash')
        S.wait_ready(pg); pg.wait_for_function("document.getElementById('cpSplash').classList.contains('hide')", timeout=5000)
        check(f'{name}: signed-in reload: splash until data, then app (no gate flash)', pg.evaluate("document.getElementById('samsamGate').style.display !== 'flex'"))
        # in-app dialog instead of the browser's
        pg.evaluate("window.__cpAutoAnswer = undefined")
        pg.evaluate("window.__r = null; void CPDialog.confirm('Test message', { title: 'Delete transaction?', okText: 'Delete', danger: true }).then(v => window.__r = v)")
        pg.wait_for_selector('#cpDialog'); pg.screenshot(path=str(T / f'dialog-{name}.png'))
        d = pg.evaluate("({ title: cpdT.innerText, msg: cpdM.innerText, ok: document.querySelector('#cpDialog .cpd-ok').innerText, focus: document.activeElement.className })")
        check(f'{name}: in-app confirm shows title/message/buttons (no site address)', d['title'] == 'Delete transaction?' and d['msg'] == 'Test message' and d['ok'] == 'Delete' and 'cpd-no' in d['focus'], d)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
        check(f'{name}: Esc = cancel', pg.evaluate("window.__r") is False and not pg.query_selector('#cpDialog'))
        pg.evaluate("void CPDialog.prompt('x', { title: 'Manual price', value: '1.5' }).then(v => window.__r = v)"); pg.wait_for_selector('#cpDialog input')
        pg.fill('#cpDialog input', '2.75'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
        check(f'{name}: in-app prompt returns typed value', pg.evaluate("window.__r") == '2.75')
        # real flow: deleting a transaction uses the in-app dialog
        pg.evaluate("openHistory && openHistory('SOL')"); pg.wait_for_timeout(300)
        pg.evaluate("void deleteTx(Samsam.getState().transactions.find(t => t.sym === 'SOL').id)"); pg.wait_for_selector('#cpDialog')
        check(f'{name}: delete transaction asks in-app', 'Delete transaction?' in pg.inner_text('#cpDialog'))
        pg.click('#cpDialog .cpd-no')
        check(f'{name}: no browser popups at all', not dialogs, dialogs)
        icons = pg.evaluate("[...document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon], link[rel=manifest]')].map(l => l.getAttribute('href').replace(/\\?v=\\d+$/, ''))")
        check(f'{name}: page icons point to the new logo', icons == ['./favicon-32.png', './favicon-64.png', './apple-touch-icon.png', './manifest.json'], icons)
        check(f'{name}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
