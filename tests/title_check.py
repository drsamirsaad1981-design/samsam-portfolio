"""Every heading, card title, label and table header is Title Case; nothing shown in capitals by CSS."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
JS = r"""() => { const out = [], up = [];
  const SEL = 'h1,h2,h3,h4,h5,h6,th,label,.label,.lbl,.rlbl,.stat-label,.sum-label,.form-label,.cp-kicker,.mv-head,.pnl-bd-title,.pnl-bd-stat-label,.total-bar-label,.hov-page-label,.hov-list-header,.cth-asset,.cth-holding,.cth-alloc,.holdings-title,.alloc-mini-title,.bl-field>span,.prog-header>span:first-child,.cph h3,.cp-title,.cp-head h1';
  document.querySelectorAll(SEL).forEach(e => { if (!e.getClientRects().length) return;
    const own = [...e.childNodes].filter(n => n.nodeType === 3 || (n.nodeType === 1 && /^(SPAN|B|STRONG|EM|I)$/.test(n.tagName) && !n.matches('.cp-hint,.mv-badge,.form-sub,[class*=badge],[class*=val],[id]'))).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (/[A-Za-z]{2}/.test(own)) out.push(own); });
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const e = n.parentElement; if (e && e.getClientRects().length && /[A-Za-z]{2}/.test(n.textContent) && getComputedStyle(e).textTransform === 'uppercase') up.push(n.textContent.trim()); }
  return { out, up }; }"""
MINOR = {'a','an','the','and','or','of','to','in','on','at','by','for','vs','per','from','with','as','nor','but','via'}
def bad(t):
    t = re.sub(r'\(.*?\)', ' ', t)
    words = re.findall(r"[A-Za-z][A-Za-z'.\-]*", t)
    for i, w in enumerate(words):
        if w[0].isupper(): continue
        if i > 0 and w.lower() in MINOR: continue
        return True
    return False
found, ups = {}, set()
def grab(pg, key):
    pg.wait_for_timeout(400); r = pg.evaluate(JS); ups.update(r['up'])
    for t in r['out']:
        if bad(t): found.setdefault(t, key)
def hints(pg, key):
    for k in pg.evaluate("Object.keys(CPHint.HINTS)"):
        t = pg.evaluate(f"(() => {{ const h = CPHint.HINTS['{k}']; return typeof h.title === 'function' ? h.title() : h.title; }})()")
        if t and bad(t): found.setdefault(t, 'hint ' + k)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vpn, vp in (('desk', dict(viewport={'width': 1366, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        hints(pg, vpn)
        pg.evaluate("applyView('cards')"); grab(pg, vpn+':main cards')
        pg.evaluate("applyView('table')"); grab(pg, vpn+':main table'); pg.evaluate("applyView('cards')")
        for js, k in (("openHoldingsView()", 'holdings'), ("openCoinTx('SOL')", 'coin page')):
            pg.evaluate(js); pg.wait_for_timeout(700); grab(pg, vpn+':'+k)
        pg.evaluate("hovBack()"); pg.wait_for_timeout(300); pg.evaluate("hovBack()"); pg.wait_for_timeout(300)
        for js, k, close in (("openBaselineEdit()", 'baseline', "closeBaselineEdit()"), ("openAddCoin()", 'add coin', None), ("document.getElementById('allTimeCard').click()", 'profit sheet', None)):
            pg.evaluate(js); grab(pg, vpn+':'+k)
            if close: pg.evaluate(close)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        for page in ('performance', 'allocation', 'accumulation', 'recover'):
            pg.goto(S.SITE + f'/{page}.html'); S.wait_ready(pg) if page != 'recover' else None; pg.wait_for_timeout(1800); grab(pg, vpn+':'+page)
            if page == 'accumulation':
                pg.evaluate("setView(currentView === 'table' ? 'cards' : 'table')"); grab(pg, vpn+':accumulation 2')
        check(f'{vpn}: no page errors', not errs, errs)
        ctx.close()
    br.close()
check('nothing is shown in capitals by CSS', not ups, sorted(ups))
check('every heading / card title / label / table header is Title Case', not found, json.dumps(found, ensure_ascii=False, indent=0))
print(f'title_check: {sum(res)}/{len(res)} passed')
