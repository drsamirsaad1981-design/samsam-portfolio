import sys, shots as S
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        c = S.ctx_for(br, 'phone', lang); pg = c.new_page(); pg.goto(S.SITE + '/index.html')
        try: pg.click('#samsamSignInBtn', timeout=5000)
        except Exception: pass
        S.ready(pg); pg.wait_for_timeout(8000); pg.goto(S.SITE + '/market.html'); S.ready(pg); pg.wait_for_timeout(6000)
        pg.evaluate("document.querySelectorAll('#cpSplash,.cp-toast,.toast').forEach(e => e.remove())")
        print(pg.evaluate("[...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).position === 'fixed' && e.offsetWidth && e.offsetWidth < 90).map(e => e.tagName + '#' + e.id + '.' + e.className).join(' | ')"))
        pg.add_style_tag(content="#cpAiFab,.cp-ai-fab,[id*=Fab],[class*=fab]{display:none!important}")
        pg.click('#mkSeg [data-v="crypto"]'); pg.wait_for_timeout(2500)
        y = pg.evaluate("(() => { const e = document.getElementById('mkSeg'); const y = e.getBoundingClientRect().bottom + scrollY - 60; scrollTo(0, y); return y })()"); pg.wait_for_timeout(900)
        pg.screenshot(path=f'/home/claude/demo/out/phone-{lang}-13-hub.png')
        pg.evaluate("toggleLinks('bitcoin')"); pg.wait_for_timeout(900)
        pg.evaluate("(() => { const e = document.getElementById('mkSearch'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 80) })()"); pg.wait_for_timeout(900)
        pg.screenshot(path=f'/home/claude/demo/out/phone-{lang}-14-links.png')
        c.close()
    br.close()
