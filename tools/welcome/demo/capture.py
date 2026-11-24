import sys, shots as S
from playwright.sync_api import sync_playwright
ONLY = sys.argv[1:]  # e.g. phone-ar
def go(pg, url, wait=4500, first=False):
    pg.goto(S.SITE + '/' + url)
    if first:
        try: pg.click('#samsamSignInBtn', timeout=5000)
        except Exception: pass
    S.ready(pg); pg.wait_for_timeout(wait)
    pg.evaluate("document.querySelectorAll('#cpSplash,.cp-toast,.toast,#cpAiFab').forEach(e => e.remove())")
def shot(pg, name, sel=None, top=None):
    if sel:
        pg.evaluate("(s) => { const e = document.querySelector(s); if (e) { const y = e.getBoundingClientRect().top + scrollY - %d; scrollTo(0, Math.max(0, y)); } }" % (top if top is not None else 12), sel); pg.wait_for_timeout(900)
    pg.screenshot(path=str(S.OUT / f'{name}.png'))
with sync_playwright() as p:
    br = p.chromium.launch()
    for dev in ('phone', 'laptop'):
        for lang in ('ar', 'en'):
            tag = f'{dev}-{lang}'
            if ONLY and tag not in ONLY: continue
            c = S.ctx_for(br, dev, lang); pg = c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:120]))
            off = 70 if dev == 'phone' else 20
            go(pg, 'index.html', 8000, True); shot(pg, f'{tag}-01-overview')
            shot(pg, f'{tag}-02-cards', '#mainTrio', off)
            pg.evaluate("(() => { const t = document.getElementById('portfolioTableWrapper'); return t && t.offsetParent ? 0 : 1 })()")
            shot(pg, f'{tag}-03-signals', '#coinsStack' if dev == 'phone' else '#portfolioTableWrapper', off + 40)
            shot(pg, f'{tag}-10-metals-card', '#metalsCard', off)
            go(pg, 'performance.html', 6000); shot(pg, f'{tag}-04-performance')
            go(pg, 'accumulation.html', 4500); pg.evaluate("typeof setPlanTab==='function' && setPlanTab('accum')"); pg.wait_for_timeout(700); shot(pg, f'{tag}-05-plan')
            pg.evaluate("typeof setPlanTab==='function' && setPlanTab('exit')"); pg.wait_for_timeout(1500); shot(pg, f'{tag}-06-exit')
            go(pg, 'market.html', 6000); pg.click('#mkSeg [data-v="crypto"]'); pg.wait_for_timeout(1500); shot(pg, f'{tag}-07-market')
            pg.click('#mkSeg [data-v="stocks"]'); pg.wait_for_timeout(2500); shot(pg, f'{tag}-08-stocks')
            pg.click('#mkSeg [data-v="metals"]'); pg.wait_for_timeout(2500); shot(pg, f'{tag}-09-market-metals')
            go(pg, 'altseason.html', 5000); shot(pg, f'{tag}-11-altseason')
            go(pg, 'index.html#holdings/SOL', 6000); shot(pg, f'{tag}-12-coin')
            print(tag, 'done', errs[:2], flush=True); c.close()
    br.close()
