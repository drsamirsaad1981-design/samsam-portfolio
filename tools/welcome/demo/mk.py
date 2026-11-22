import sys, shots as S
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        c = S.ctx_for(br, 'phone', lang); pg = c.new_page(); pg.goto(S.SITE + '/market.html')
        try: pg.click('#samsamSignInBtn', timeout=4000)
        except Exception: pass
        S.ready(pg); pg.wait_for_timeout(3500)
        print(lang, pg.evaluate("""(() => { const b = document.getElementById('tabWatch'); const out = [...b.childNodes].map(n => n.nodeType === 3 ? 'TEXT:' + JSON.stringify(n.nodeValue) : n.outerHTML.slice(0, 70) + ' | ml=' + getComputedStyle(n).marginLeft + ' mr=' + getComputedStyle(n).marginRight + ' disp=' + getComputedStyle(n).display); const sv = b.querySelector('svg'); return [getComputedStyle(b).direction, getComputedStyle(b).gap, ...out, 'svg ml=' + getComputedStyle(sv).marginLeft + ' mr=' + getComputedStyle(sv).marginRight + ' cls=' + sv.getAttribute('class')] })()"""))
        pg.locator('.mk-tabs').first.screenshot(path=f'/home/claude/demo/_tabs_{lang}.png'); c.close()
    br.close()
