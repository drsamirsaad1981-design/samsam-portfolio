"""Plant hostile strings in every user-editable field (notes, tx note, coin name/sym/cgId/logo, accumulation entry)
and load every page/view on mobile + desktop. PASS = no injected script ran and no injected element exists."""
import sys, json, pathlib, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
P = lambda tag: f'"\'><img src=x onerror="window.__xss=(window.__xss||[]).concat(\'{tag}\')" data-xss="{tag}">'
U = 'users/uid_samir/'
ops = [
  {'op': 'set', 'path': U + 'coins/BTC', 'merge': True, 'data': {'notes': P('btc-notes')}},
  {'op': 'set', 'path': U + 'coins/EVIL', 'data': {'sym': 'EV"IL', 'name': P('coin-name'), 'cat': P('cat'), 'cgId': 'x" onmouseover="window.__xss=1', 'logoUrl': 'javascript:alert(1)',
      'notes': P('evil-notes'), 'isCustom': True, 'order': 99, 'opening': {'qty': 1, 'avg': 1}, 'removed': False, 'lastPrice': 1, 'addedAt': '2026-10-19T00:00:00Z'}},
  {'op': 'set', 'path': U + 'txs/tx_xss', 'data': {'sym': 'BTC', 'type': 'buy', 'qty': 0.0001, 'price': 1, 'total': 0.0001, 'date': '2026-10-19T00:00:00Z', 'createdAt': '2026-10-19T00:00:00Z', 'note': P('tx-note')}},
  {'op': 'set', 'path': U + 'accum/EVIL', 'data': {'sym': 'EV"IL', 'name': P('acc-evil'), 'targetQty': 5, 'order': 50, 'cgId': 'a" onmouseover="window.__xss=2', 'logoUrl': 'javascript:1'}},
  {'op': 'set', 'path': U + 'accum/BTC', 'merge': True, 'data': {'name': P('acc-name'), 'note': P('acc-note'), 'notes': P('acc-notes')}},
]
req = urllib.request.Request(S.SRV + '/commit', data=json.dumps({'ops': ops}).encode(), headers={'content-type': 'application/json'})
urllib.request.urlopen(req).read()
found = []
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx, keep_csp=True)
        for page in ['index.html', 'accumulation.html', 'performance.html', 'allocation.html', 'recover.html']:
            pg = ctx.new_page(); pg.on('dialog', lambda d: (found.append('dialog ' + d.message), d.dismiss()))
            pg.goto(f'{S.SITE_CSP}/{page}'); pg.wait_for_timeout(500)
            if pg.is_visible('#samsamSignInBtn'): pg.click('#samsamSignInBtn')
            S.wait_ready(pg); pg.wait_for_timeout(1500)
            views = {'index.html': ["applyView('table')", "applyView('cards')", "openHoldingsView()", "selectCoinTx && selectCoinTx('BTC')", "openHistory && openHistory('BTC')", "exportCsv && 0"],
                     'accumulation.html': ["typeof setView==='function'&&setView('table')", "typeof setView==='function'&&setView('cards')"]}.get(page, [])
            for js in views:
                try: pg.evaluate(js); pg.wait_for_timeout(500)
                except Exception: pass
            try: pg.hover('a[href*="coingecko"]', timeout=500)
            except Exception: pass
            r = pg.evaluate("[window.__xss||null, [...document.querySelectorAll('[data-xss]')].map(e=>e.dataset.xss), document.querySelectorAll('[onmouseover*=__xss]').length]")
            print(f'{name:7} {page:18} ran={r[0]} injected={r[1]} attr={r[2]}')
            if r[0] or r[1] or r[2]: found.append((name, page, r))
            pg.close()
        ctx.close()
    br.close()
print('XSS FINDINGS:', len(found)); sys.exit(1 if found else 0)
