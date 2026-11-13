"""Settings (⚙️ in every page header) and the small cloud menu (☁️).
⚙️ is on every page and opens the same screen; inside the app it opens on the main page. Each line shows its value and opens
the window you know (Telegram alerts, Signal thresholds, Target allocation, Baseline, Categories, Import, Recover); Exit plan
and DCA go to the Plan page; Display choices are kept and used. A page opened on its own sends you to the main page's editor.
☁️ now holds the sync status, last backup, Backup and Settings."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def opn(pg):
    if not pg.query_selector('#cpSet'): pg.locator('.ss-set-hdr').first.click()
    pg.wait_for_selector('#cpSet'); pg.wait_for_timeout(150)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
        # every page has ⚙️ and the same small ☁️ menu
        for f in ['index.html', 'accumulation.html', 'market.html', 'performance.html', 'altseason.html', 'recover.html']:
            pg.goto(S.SITE + '/' + f); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000); pg.wait_for_timeout(1000)
            g = pg.locator('.ss-set-hdr')
            if g.count():
                check(f'{vn} {f}: ⚙️ in the header', g.first.is_visible())
                gb, cb = g.first.bounding_box(), pg.locator('.ss-sync-hdr').first.bounding_box()
                check(f'{vn} {f}: ⚙️ sits just left of ☁️, same height', gb['x'] < cb['x'] and abs(gb['y'] - cb['y']) < 3 and abs(gb['height'] - cb['height']) < 1, (gb, cb))
                pg.locator('.ss-sync-hdr').first.click()
            else:
                pg.evaluate("document.getElementById('samsamSyncPill').click()")
            pg.wait_for_timeout(300)
            items = pg.evaluate("[...document.querySelectorAll('#samsamSyncMenu .samsam-btn')].map(b=>b.innerText.trim())")
            check(f'{vn} {f}: ☁️ menu = Backup, Settings {items}', items == ['Backup', 'Settings'] and 'Last backup' in pg.inner_text('#samsamSyncMenu'), items)
            pg.click('#samsamSettings'); pg.wait_for_selector('#cpSet')
            rows = pg.evaluate("[...document.querySelectorAll('#cpSet .st-row b, #cpSet .st-seg-row > b')].map(b=>b.innerText.trim())")
            want = ['Account', 'Backup', 'Recover Data', 'Import from exchange', 'Wallets & check', 'Rewards & mining', 'Telegram alerts', 'Link the Telegram bot', 'Admin dashboard', 'Signal thresholds', 'Target allocation', 'Categories', 'Baseline', 'Exit plan', 'DCA (regular buys)', 'Theme', 'Charts open on', 'Lists shown as', 'Buying fee in', 'Install the app', 'Version']
            check(f'{vn} {f}: Settings lists every setting', rows == want, rows)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
            check(f'{vn} {f}: Esc closes it', not pg.query_selector('#cpSet'))
        # values
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
        opn(pg); t = pg.inner_text('#cpSet')
        check(f'{vn}: values shown (email, last backup, alerts, signals, baseline, exit steps, version)', 'owner@example.com' in t and 'Last backup:' in t and ' on' in pg.inner_text('#stRow_alerts') and 'Reinforce' in pg.inner_text('#stRow_signal') and '2026' in pg.inner_text('#stRow_baseline') and '×' in pg.inner_text('#stRow_exit') and '2026' in t.split('Version')[-1], t[:400])
        pg.screenshot(path=str(SH / f'settings_{vn}.png'))
        pg.evaluate("document.querySelector('#cpSet .st-box').scrollTop = 99999"); pg.wait_for_timeout(200)
        hb, bb = pg.locator('#cpSet .st-h').bounding_box(), pg.locator('#cpSet .st-box').bounding_box()
        check(f'{vn}: the Settings title + × stay at the top while scrolling', abs(hb['y'] - bb['y']) < 2 and pg.is_visible('#cpSet .st-x'), (hb, bb))
        if vn == 'phone': pg.screenshot(path=str(SH / f'settings_{vn}_scrolled.png'))
        check(f'{vn}: ⓘ on Backup and Recover Data', pg.query_selector('#cpSet [data-hint="backup"]') is not None and pg.query_selector('#stRow_recover [data-hint="recover"]') is not None)
        pg.click('#stRow_recover [data-hint="recover"]'); pg.wait_for_timeout(300)
        check(f'{vn}: the ⓘ explains without leaving Settings', pg.query_selector('.cph') is not None and pg.query_selector('#cpSet') is not None and 'recover' not in pg.url)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        check(f'{vn}: Esc closes the explanation first', pg.query_selector('.cph') is None and pg.query_selector('#cpSet') is not None)
        # each line opens its window
        for row, sel in (('alerts', '#cpAlerts'), ('signal', '#sgReinforce'), ('targets', '#tgModal'), ('baseline', '#blDate'), ('cats', '#catMgrModal'), ('import', '#impModal')):
            if not pg.query_selector('#cpSet'): opn(pg)
            pg.click(f'#stRow_{row}'); pg.wait_for_timeout(400)
            check(f'{vn}: {row} → its window opens (Settings closes)', pg.is_visible(sel) and not pg.query_selector('#cpSet'), row)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
            pg.evaluate("for (const id of ['cpAlerts']) document.getElementById(id)?.remove(); try{closeSignalEdit()}catch(e){} try{closeTargets()}catch(e){} try{closeBaselineEdit()}catch(e){} try{closeCatManager()}catch(e){} try{SamsamImport.close()}catch(e){}")
            pg.wait_for_timeout(700)
            check(f'{vn}: {row} closed → back to Settings', pg.query_selector('#cpSet') is not None)
        # Exit plan / DCA → the Plan page (opened in the app's frame)
        opn(pg); pg.click('#stRow_exit'); pg.wait_for_timeout(1500)
        check(f'{vn}: Exit plan → Plan page, Exit Strategy tab', pg.evaluate("(()=>{const f=[...document.querySelectorAll('#cpViews iframe')].find(x=>x.classList.contains('on')); return !!f && /accumulation/.test(f.src) && Samsam.getState().exit.tab==='exit'})()"))
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(600)
        opn(pg); pg.click('#stRow_dca'); pg.wait_for_timeout(1500)
        check(f'{vn}: DCA → Plan page, Accumulation tab', pg.evaluate("(()=>{const f=[...document.querySelectorAll('#cpViews iframe')].find(x=>x.classList.contains('on')); return !!f && /accumulation/.test(f.src) && Samsam.getState().exit.tab!=='exit'})()"))
        # ⚙️ inside the Plan frame opens Settings on the main page (whole screen)
        fr = [f for f in pg.frames if 'accumulation.html' in f.url][0]
        g = fr.locator('.ss-set-hdr >> visible=true')
        if g.count(): g.first.dispatch_event('click')
        else: fr.evaluate("SamsamSettings.open()")
        pg.wait_for_timeout(400)
        check(f'{vn}: ⚙️ inside the app opens Settings on the main page', pg.query_selector('#cpSet') is not None and fr.query_selector('#cpSet') is None)
        pg.keyboard.press('Escape')
        # Display choices are kept and used
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(600)
        opn(pg)
        pg.click('#cpSet [data-seg="range"][data-v="30d"]'); pg.click('#cpSet [data-seg="fee"][data-v="coin"]'); pg.click('#cpSet [data-seg="view"][data-v="table"]')
        th0 = pg.evaluate("SamsamUI.currentTheme()"); other = 'light' if th0 == 'dark' else 'dark'
        pg.click(f'#cpSet [data-seg="theme"][data-v="{other}"]'); pg.wait_for_timeout(200)
        check(f'{vn}: theme switches from Settings', pg.evaluate("SamsamUI.currentTheme()") == other)
        pg.keyboard.press('Escape'); pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(800)
        check(f'{vn}: charts now open on 30d', pg.evaluate("document.querySelector('.holdings-tab.active').dataset.range") == '30d')
        check(f'{vn}: coins shown as Table (phones too)', pg.is_visible('#portfolioTableWrapper') and pg.evaluate("localStorage.getItem('samsam_exit_view')") == 'table')
        pg.evaluate("openAddTx('buy','BTC')"); pg.wait_for_timeout(200)
        check(f'{vn}: buying fee starts in the coin', pg.get_attribute('#atxFeeUnitSeg [data-u="coin"]', 'aria-checked') == 'true')
        pg.evaluate("closeAddTx(); localStorage.removeItem('samsam_chart_range'); localStorage.setItem('samsam_view_pref','cards'); localStorage.removeItem('samsam_view_phone'); localStorage.removeItem('samsam_exit_view'); localStorage.removeItem('samsam_buyfee_unit')")
        # a page opened on its own → the main page's editor
        pg.goto(S.SITE + '/market.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(800)
        opn(pg); pg.click('#stRow_signal'); pg.wait_for_url('**/index.html*'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        check(f'{vn}: Market page on its own → Signal thresholds opens on the main page', pg.is_visible('#sgReinforce') and '#set=' not in pg.url, pg.url)
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
