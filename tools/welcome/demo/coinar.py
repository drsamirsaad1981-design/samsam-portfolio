import shots as S
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch(); c = S.ctx_for(br, 'phone', 'ar'); pg = c.new_page(); pg.goto(S.SITE + '/index.html')
    try: pg.click('#samsamSignInBtn', timeout=5000)
    except Exception: pass
    S.ready(pg); pg.wait_for_timeout(8000); pg.goto(S.SITE + '/index.html#holdings/SOL'); S.ready(pg); pg.wait_for_timeout(6000)
    pg.evaluate("document.querySelectorAll('#cpSplash,.cp-toast,.toast').forEach(e => e.remove())")
    pg.screenshot(path='/home/claude/demo/out/phone-ar-12-coin.png'); c.close(); br.close()
