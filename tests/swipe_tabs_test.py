"""Phones: a quick swipe left / right moves between Overview · Performance · Allocation (no wrap at the ends); it does
nothing on a chart, in a wide table, or while a window is open — and nothing on the Plan page (no Portfolio tabs there)."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
SWIPE = """(a => { const el = a.sel ? document.querySelector(a.sel) : document.elementFromPoint(a.x, a.y); const r = a.sel ? el.getBoundingClientRect() : null;
  const x0 = a.sel ? r.left + r.width / 2 + (a.dx < 0 ? 40 : -40) : a.x, y = a.sel ? r.top + Math.min(r.height / 2, 40) : a.y;
  const T = (x, yy) => new Touch({ identifier: 1, target: el, clientX: x, clientY: yy });
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [T(x0, y)], changedTouches: [T(x0, y)] }));
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [T(x0 + a.dx, y + (a.dy || 0))] })); })"""
def where(pg): return pg.evaluate("(() => { const o = document.getElementById('holdingsOverlay'); if (o && getComputedStyle(o).display !== 'none' && o.getClientRects().length) return 'allocation'; return cpShell.cur === 'home' ? 'overview' : cpShell.cur; })()")
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    pg.evaluate(SWIPE + "({ x: 195, y: 420, dx: 120 })"); pg.wait_for_timeout(600)
    check('Overview, swipe right → stays (it is the first tab)', where(pg) == 'overview', where(pg))
    pg.evaluate(SWIPE + "({ x: 195, y: 420, dx: -30 })"); pg.wait_for_timeout(300)
    check('a short move is not a swipe', where(pg) == 'overview')
    pg.evaluate(SWIPE + "({ x: 195, y: 420, dx: -120, dy: 110 })"); pg.wait_for_timeout(300)
    check('a diagonal scroll is not a swipe', where(pg) == 'overview')
    pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet')
    pg.evaluate(SWIPE + "({ x: 195, y: 420, dx: -120 })"); pg.wait_for_timeout(300)
    check('no swipe while a window (Settings) is open', where(pg) == 'overview'); pg.evaluate("SamsamSettings.close()"); pg.wait_for_timeout(300)
    pg.evaluate(SWIPE + "({ sel: '.header-stats', dx: -120 })"); pg.wait_for_timeout(2500)
    check('Overview, swipe left → Performance', where(pg) == 'performance', where(pg))
    fr = [f for f in pg.frames if 'performance.html' in f.url][0]
    fr.evaluate(SWIPE + "({ sel: '#perfChartCard', dx: -120 })"); pg.wait_for_timeout(500)
    check('a swipe on the chart does not change the tab (the chart is scrubbed with a finger)', where(pg) == 'performance', where(pg))
    fr.evaluate(SWIPE + "({ sel: '#tvCard', dx: -120 })"); pg.wait_for_timeout(1500)
    check('Performance, swipe left → Allocation', where(pg) == 'allocation', where(pg))
    pg.evaluate(SWIPE + "({ sel: '#holdingsOverlay .hov-ptabs', dx: -120 })"); pg.wait_for_timeout(500)
    check('Allocation, swipe left → stays (the last tab)', where(pg) == 'allocation', where(pg))
    pg.evaluate(SWIPE + "({ sel: '#holdingsOverlay .hov-ptabs', dx: 120 })"); pg.wait_for_timeout(1500)
    check('Allocation, swipe right → Performance', where(pg) == 'performance', where(pg))
    fr.evaluate(SWIPE + "({ sel: '#tvCard', dx: 120 })"); pg.wait_for_timeout(1200)
    check('Performance, swipe right → Overview', where(pg) == 'overview', where(pg))
    pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(2500)
    fa = [f for f in pg.frames if 'accumulation.html' in f.url][0]
    fa.evaluate(SWIPE + "({ sel: '.dashboard', dx: -120 })"); pg.wait_for_timeout(600)
    check('Plan page: a swipe does nothing', pg.evaluate("cpShell.cur") == 'accumulation')
    check('no JS errors', not errs, errs[:3]); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
