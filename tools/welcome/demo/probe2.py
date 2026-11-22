import shots as S, re
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch(); c = S.ctx_for(br, 'laptop', 'en'); pg = c.new_page(); bad = set()
    pg.on('requestfailed', lambda r: bad.add(r.url.split('?')[0]) if r.resource_type == 'image' else None)
    pg.goto(S.SITE + '/index.html')
    try: pg.click('#samsamSignInBtn', timeout=4000)
    except Exception: pass
    S.ready(pg); pg.wait_for_timeout(6000)
    pg.evaluate("window.cpShell && cpShell.go('market')"); pg.wait_for_timeout(7000)
    print(len(bad)); [print(u) for u in sorted(bad)[:40]]
    print(pg.evaluate("portfolio.map(c => c.sym + ' ' + (c.logoUrl||c.img||'')).join('\\n')"))
    br.close()
