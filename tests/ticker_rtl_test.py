"""The moving BTC line never runs empty — English and Arabic (right-to-left), on the phone.
Arabic bug (Nov 2026): the track sat at the right edge and slid left, so its copy was on the
wrong side; for about half of each loop the bar showed nothing."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
# fraction of the bar's width covered by ticker items, at a point of the loop (0..1)
COVER = """(f) => {
  const bar = document.getElementById('btcTicker'), tr = document.getElementById('btcTickerTrack');
  const an = tr.getAnimations()[0]; if (!an) return -1;
  an.pause(); an.currentTime = an.effect.getComputedTiming().duration * f;
  const b = bar.getBoundingClientRect(), xs = [];
  tr.querySelectorAll('.bt-item').forEach(i => { const r = i.getBoundingClientRect();
    const l = Math.max(r.left, b.left), rt = Math.min(r.right, b.right); if (rt > l) xs.push([l, rt]); });
  xs.sort((a, c) => a[0] - c[0]); let cov = 0, end = -1e9;
  xs.forEach(([l, r]) => { if (r > end) { cov += r - Math.max(l, end); end = r; } });
  return cov / b.width;
}"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        S.setup(ctx)
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        errs = []; pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
        pg.wait_for_timeout(2500)
        static = pg.evaluate("document.getElementById('btcTicker').classList.contains('static')")
        if static:
            # make it long enough to scroll, like the real phone with market numbers
            pg.evaluate("""() => { const t = document.getElementById('btcTickerTrack');
              t.querySelectorAll('.btc-ticker-group').forEach(g => g.innerHTML += g.innerHTML); fitBtcTicker(); }""")
        check(f'{lang}: ticker scrolls on the phone', not pg.evaluate("document.getElementById('btcTicker').classList.contains('static')"))
        covs = [round(pg.evaluate(COVER, i / 20), 2) for i in range(20)]
        check(f'{lang}: never empty during the loop (min cover ≥ 40%)', min(covs) >= 0.4, covs)
        check(f'{lang}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
