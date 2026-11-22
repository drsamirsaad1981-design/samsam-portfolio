import shots as S
from playwright.sync_api import sync_playwright
from PIL import Image
ims = []
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('ar', 'en'):
        c = br.new_context(**S.VP['phone']); S.setup(c)
        c.add_init_script(f"try{{localStorage.setItem('samsam_theme','light');localStorage.setItem('cp-lang','{lang}')}}catch(e){{}}")
        pg = c.new_page(); pg.goto(S.SITE + '/index.html')
        try: pg.click('#samsamSignInBtn', timeout=5000)
        except Exception: pass
        S.ready(pg); pg.wait_for_timeout(9000)
        pg.evaluate("document.querySelectorAll('#cpSplash,.cp-toast,.toast').forEach(e => e.remove())"); pg.add_style_tag(content="#cpAiFab{display:none!important}")
        print(lang, pg.evaluate("document.documentElement.getAttribute('data-theme')"))
        pg.screenshot(path=f'out/phone-{lang}-16-light.png'); c.close()
        im = Image.open(f'out/phone-{lang}-16-light.png').convert('RGB'); im.resize((585, 1266), Image.LANCZOS).save(f'web/phone-{lang}-16-light.webp', quality=86); ims.append(im.resize((390, 844)))
    br.close()
s = Image.new('RGB', (780, 844)); s.paste(ims[0], (0, 0)); s.paste(ims[1], (390, 0)); s.save('_light.png')
