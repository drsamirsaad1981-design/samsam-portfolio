"""Pop-up windows (backup password, Telegram alerts, cloud menu, Add Transaction, Import) have a solid
background in both themes — the page behind never shows through (the dark theme's card colour is see-through glass)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
BG = """sel => { const e = document.querySelector(sel); if (!e) return 'missing'; const c = getComputedStyle(e).backgroundColor;
  const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return c; const v = m[1].split(',').map(Number); return v.length > 3 ? v[3] : 1; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for theme in ('dark', 'light'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx)
        ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        def solid(name, sel):
            a = pg.evaluate(BG, sel); check(f'{theme}: {name} is solid (alpha {a})', a == 1, a)
        pg.evaluate("void SamsamVault.askPassword({mode:'set'})"); pg.wait_for_selector('#ssPw form')
        solid('backup password box', '#ssPw form')
        if theme == 'dark': pg.screenshot(path=str(SH / 'window_pw_dark.png'))
        pg.click('#ssPw button[type=button]')
        pg.locator('.ss-sync-hdr').first.click(); pg.wait_for_timeout(300); solid('cloud menu', '#samsamSyncMenu')
        pg.click('#samsamAlerts'); pg.wait_for_selector('#cpAlerts .al-box'); solid('Telegram alerts', '#cpAlerts .al-box')
        if theme == 'dark': pg.screenshot(path=str(SH / 'window_alerts_dark.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.evaluate("openAddTx('buy','BTC')"); pg.wait_for_timeout(200); solid('Add Transaction', '.atx-modal'); pg.evaluate("closeAddTx()")
        pg.evaluate("SamsamImport.open()"); pg.wait_for_timeout(200); solid('Import', '#impModal'); pg.evaluate("SamsamImport.close()")
        check(f'{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
