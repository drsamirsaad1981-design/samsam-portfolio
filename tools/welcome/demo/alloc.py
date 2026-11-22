import shots as S
from playwright.sync_api import sync_playwright
from PIL import Image
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('ar', 'en'):
        c = S.ctx_for(br, 'phone', lang); pg = c.new_page(); pg.goto(S.SITE + '/index.html')
        try: pg.click('#samsamSignInBtn', timeout=5000)
        except Exception: pass
        S.ready(pg); pg.wait_for_timeout(8000); pg.goto(S.SITE + '/allocation.html'); pg.wait_for_timeout(7000)
        pg.evaluate("document.querySelectorAll('#cpSplash,.cp-toast,.toast').forEach(e => e.remove())"); pg.add_style_tag(content="#cpAiFab{display:none!important}")
        print(lang, pg.url, pg.evaluate("document.documentElement.scrollHeight"), pg.evaluate("[...document.querySelectorAll('h2,h3,.card-title')].filter(e => e.offsetParent).map(e => e.textContent.trim().slice(0, 30)).slice(0, 12).join(' | ')"))
        pg.screenshot(path=f'out/phone-{lang}-15-alloc.png'); pg.screenshot(path=f'_alloc_full_{lang}.png', full_page=True); c.close()
    br.close()
a = Image.open('_alloc_full_ar.png').convert('RGB'); print(a.size); a.resize((a.size[0] // 3, a.size[1] // 3)).crop((0, 0, 390, 1700)).save('_alloc_s.png')
