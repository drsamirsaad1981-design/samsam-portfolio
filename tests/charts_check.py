import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().holdingsSnaps.length > 100", timeout=10000); pg.wait_for_timeout(1200)
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(600)
        a = pg.evaluate("""() => { const h = document.querySelector('.hov-h-asset').getBoundingClientRect(); const ic = document.querySelector('#hovAssetList .hov-coin-icon').getBoundingClientRect();
          return [Math.round(h.left), Math.round(ic.left), getComputedStyle(document.querySelector('.hov-h-asset')).textAlign]; }""")
        check(f'{name}: ASSET left-aligned over coin icons', abs(a[0] - a[1]) <= 2 and a[2] == 'left', a)
        cw = pg.evaluate("(() => { const c = document.getElementById('hovCanvas'); return [c.getBoundingClientRect().right <= c.parentElement.getBoundingClientRect().right + 1, c.width > 0]; })()")
        check(f'{name}: Holdings chart fits inside its card', all(cw), cw)
        # Synced badge never covers the last row (scrolled to bottom) on every screen
        pg.evaluate("document.getElementById('holdingsOverlay').scrollTop = 1e6"); pg.wait_for_timeout(300)
        ov = pg.evaluate("""() => { const rows = document.querySelectorAll('#hovAssetList .hov-asset-row'); const last = rows[rows.length-1].getBoundingClientRect(); const pill = document.getElementById('samsamSyncPill').getBoundingClientRect();
          return [Math.round(last.bottom), Math.round(pill.top)]; }""")
        hidden = pg.evaluate("getComputedStyle(document.getElementById('samsamSyncPill')).display === 'none'")
        check(f'{name}: Holdings last row above Synced badge (or badge hidden when synced)', hidden or ov[0] <= ov[1], ov)
        pg.evaluate("closeHoldingsView()")
        for page in ('index', 'allocation', 'performance', 'accumulation'):
            pg.goto(f'{SITE}/{page}.html'); pg.wait_for_timeout(1600)
            pg.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)"); pg.wait_for_timeout(300)
            r = pg.evaluate("""() => { const pill = document.getElementById('samsamSyncPill').getBoundingClientRect();
              const els = [...document.body.querySelectorAll('*')].filter(e => e.offsetParent && !e.closest('#samsamSyncPill,#samsamSyncMenu,#samsamGate,.sdd-panel,.sdd-backdrop,.atx-backdrop') && e.children.length === 0 && (e.innerText||'').trim());
              const clipped = e => { const b = e.getBoundingClientRect(); for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowY; if (o === 'auto' || o === 'scroll' || o === 'hidden') { const r = a.getBoundingClientRect(); if (b.top >= r.bottom || b.bottom <= r.top) return true; } } return false; };
              const hit = els.filter(e => { const b = e.getBoundingClientRect(); return !clipped(e) && b.bottom > pill.top + 2 && b.top < pill.bottom && b.right > pill.left && b.left < pill.right; });
              return hit.map(e => e.innerText.trim().slice(0, 30)).slice(0, 3); }""")
            check(f'{name}: {page} bottom content clear of Synced badge', not r, r)
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
