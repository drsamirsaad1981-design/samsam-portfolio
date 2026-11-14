"""Light mode: every window that opens over a page is light too (no dark box on a light page).
On each page: the All Time Profit window, a CPDialog, Settings, the Guide — the window's box must be light, its text dark."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
LUM = """(sel => { const el = document.querySelector(sel); if (!el) return null;
  const rgb = s => (s.match(/[\\d.]+/g) || []).map(Number);
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
  let n = el, bg = null; while (n && n.nodeType === 1) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] > .5)) { bg = c; break; } n = n.parentElement; }
  const fg = rgb(getComputedStyle(el.querySelector('b,h3,h4,p') || el).color);
  return { bg: bg && lum(bg), fg: lum(fg) }; })"""
def light_box(fr, sel, name):
    r = fr.evaluate(LUM + f"('{sel}')")
    check(f'{name}: light box, dark text', r and r['bg'] is not None and r['bg'] > 0.6 and r['fg'] < 0.3, r)
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1280, 'height': 900}); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
    pg.evaluate("localStorage.setItem('samsam_theme','light'); SamsamUI.setTheme ? SamsamUI.setTheme('light') : document.documentElement.setAttribute('data-theme','light')")
    for page in ('index.html', 'performance.html', 'accumulation.html', 'market.html', 'altseason.html'):
        pg.goto(S.SITE + '/' + page); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000); pg.wait_for_timeout(1200)
        pg.evaluate("document.documentElement.setAttribute('data-theme','light')")
        pg.evaluate("void CPProfit.open({ value: 1000, cost: 1200, realized: 50, sellCount: 2 }, { scope: 'Whole Portfolio' })"); pg.wait_for_timeout(250)
        light_box(pg, '#cpProfit .cpp', f'{page} All Time Profit')
        light_box(pg, '#cpProfit .cpp-row', f'{page} All Time Profit rows')
        pg.evaluate("CPProfit.close()")
        pg.evaluate("window.__keepAuto = window.__cpAutoAnswer; window.__cpAutoAnswer = null; void CPDialog.alert('Hello', { title: 'Test' }); 0"); pg.wait_for_timeout(250)
        light_box(pg, '#cpDialog .cpd', f'{page} dialog')
        pg.keyboard.press('Escape'); pg.evaluate("window.__cpAutoAnswer = window.__keepAuto"); pg.wait_for_timeout(200)
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet'); pg.wait_for_timeout(200)
        light_box(pg, '#cpSet .st-box', f'{page} Settings')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
    pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#cpSet'); pg.click('#stRow_guide'); pg.wait_for_selector('#cpGuide'); pg.wait_for_timeout(300)
    light_box(pg, '#cpGuide .gd-box', 'Guide')
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
