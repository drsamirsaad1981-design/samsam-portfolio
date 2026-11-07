"""Telegram alerts settings (cloud menu → Telegram alerts): opens on every page, light + dark, phone + computer;
language, switches and thresholds are saved to meta/info.alerts (what tools/alerts.mjs reads); Cancel / Escape keep them."""
import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
def meta(): d = json.load(urllib.request.urlopen(S.SRV + '/dump')); return next((v for k, v in d.items() if k.endswith('/meta/info')), {})
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
            pg.evaluate("Samsam.setAlerts(null)"); pg.wait_for_timeout(800)   # each run starts from the defaults (the fake database is shared)
            pg.locator('.ss-set-hdr').first.click(); pg.wait_for_selector('#cpSet')
            check(f'{vn}/{theme}: Settings has Telegram alerts', pg.is_visible('#stRow_alerts'))
            pg.click('#stRow_alerts'); pg.wait_for_timeout(300)
            st = pg.evaluate("""(()=>{const b=document.querySelector('#cpAlerts .al-box').getBoundingClientRect();
              return {open:!!document.getElementById('cpAlerts'), sw:document.querySelectorAll('#cpAlerts input[type=checkbox]').length, on:[...document.querySelectorAll('#cpAlerts input[type=checkbox]')].every(i=>i.checked),
                en:document.querySelector('#cpAlerts [data-lang=en]').getAttribute('aria-pressed'), fits:b.left>=0&&b.right<=innerWidth+1, svg:document.querySelectorAll('#cpAlerts svg').length,
                focus:document.activeElement&&document.activeElement.dataset.lang, move:document.querySelector('#cpAlerts select[data-k=movePct]').value}})()""")
            check(f'{vn}/{theme}: sheet opens with 13 switches (all on), English, ±5%, fits the screen {st}', st['open'] and st['sw'] == 13 and st['on'] and st['en'] == 'true' and st['fits'] and st['svg'] >= 2 and st['move'] == '5' and st['focus'] == 'en', st)
            pg.locator('#cpAlerts .al-box').screenshot(path=str(SH / f'alertsui_{vn}_{theme}.png'))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: Escape closes it', not pg.evaluate("!!document.getElementById('cpAlerts')"))
            pg.evaluate("Samsam.openAlerts()"); pg.wait_for_timeout(200)
            pg.click('#cpAlerts [data-lang=ar]'); pg.select_option('#cpAlerts select[data-k=movePct]', '8'); pg.select_option('#cpAlerts select[data-k=briefTime]', '07:30')
            pg.locator('#cpAlerts input[data-k=weekly]').click(); pg.locator('#cpAlerts input[data-k=etf]').click()
            pg.click('#cpAlerts [data-act=save]'); pg.wait_for_timeout(1800)
            a = meta().get('alerts', {})
            check(f'{vn}/{theme}: saved to the account {dict((k, a.get(k)) for k in ("lang","movePct","briefTime","weekly","etf","brief"))}', a.get('lang') == 'ar' and a.get('movePct') == 8 and a.get('briefTime') == '07:30' and a.get('weekly') is False and a.get('etf') is False and a.get('brief') is True, a)
            check(f'{vn}/{theme}: sheet closes after saving', not pg.evaluate("!!document.getElementById('cpAlerts')"))
            pg.evaluate("Samsam.openAlerts()"); pg.wait_for_timeout(200)
            again = pg.evaluate("({ar:document.querySelector('#cpAlerts [data-lang=ar]').getAttribute('aria-pressed'), weekly:document.querySelector('#cpAlerts input[data-k=weekly]').checked, move:document.querySelector('#cpAlerts select[data-k=movePct]').value})")
            check(f'{vn}/{theme}: reopening shows what was saved {again}', again == {'ar': 'true', 'weekly': False, 'move': '8'}, again)
            pg.click('#cpAlerts [data-lang=en]'); pg.click('#cpAlerts [data-act=cancel]'); pg.wait_for_timeout(600)
            check(f'{vn}/{theme}: Cancel keeps the saved settings', meta().get('alerts', {}).get('lang') == 'ar')
            pg.goto(S.SITE + '/market.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
            pg.evaluate("Samsam.openAlerts()"); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: opens on Market Hub too', pg.evaluate("!!document.getElementById('cpAlerts')"))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
