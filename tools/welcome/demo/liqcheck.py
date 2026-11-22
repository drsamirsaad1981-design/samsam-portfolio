import shots as S
from playwright.sync_api import sync_playwright
JS = """(sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent).slice(0, 3).map(e => { const r = e.getBoundingClientRect(); const kids = [...e.querySelectorAll('svg')].map(k => k.getBoundingClientRect()); return { w: Math.round(r.width), sw: e.scrollWidth, cw: e.clientWidth, out: kids.some(k => k.left < r.left - .5 || k.right > r.right + .5) } })"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('ar', 'en'):
        for vw in (390, 360, 320):
            c = S.ctx_for(br, 'phone', lang); pg = c.new_page(); pg.set_viewport_size({'width': vw, 'height': 844}); pg.goto(S.SITE + '/index.html')
            try: pg.click('#samsamSignInBtn', timeout=5000)
            except Exception: pass
            S.ready(pg); pg.wait_for_timeout(5000); pg.goto(S.SITE + '/market.html'); S.ready(pg); pg.wait_for_timeout(5000)
            pg.click('#mkSeg [data-v="crypto"]'); pg.wait_for_timeout(1500); pg.evaluate("toggleLinks('bitcoin')"); pg.wait_for_timeout(600)
            a = pg.evaluate(JS, '.mk-links a, .mk-links .off')
            pg.goto(S.SITE + '/index.html#holdings/SOL'); S.ready(pg); pg.wait_for_timeout(5000)
            b = pg.evaluate(JS, '.quick-links-row .htx-liq')
            print(lang, vw, 'market', a, 'coin', b, flush=True); c.close()
    br.close()
