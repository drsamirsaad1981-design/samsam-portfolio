"""Coin actions: + Buy and − Sell on every card / row; Transfer In/Out, History, Liq Map, Prediction, Remove in the ⋯ menu."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent / 'shots'; SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def form(pg):
    return pg.evaluate("[document.getElementById('atxBackdrop').classList.contains('show'), document.querySelector('.atx-types [aria-checked=true]').dataset.t, document.querySelector('#atxCoin span').innerText]")
def menu_pick(pg, sel, sym, label):
    pg.locator(f"{sel} .btn-more[aria-label$=' {sym}']").first.click(); pg.wait_for_selector('.cpm')
    pg.click(f".cpm .cpm-item:has-text('{label}')"); pg.wait_for_timeout(200)
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp, sel in (('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2), '#coinsStack .coin-card'),
                          ('desktop', dict(viewport={'width': 1366, 'height': 900}), '#tableBody tr')):
        ctx = br.new_context(**vp); S.setup(ctx); errs = []
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000); pg.wait_for_timeout(800)
        pg.evaluate("applyView('%s')" % ('table' if name == 'desktop' else 'cards')); pg.wait_for_timeout(300)
        n = pg.locator(sel).count()
        cnt = [pg.locator(sel + ' ' + b).count() for b in ('.btn-buy-more', '.btn-sell', '.btn-more')]
        check(f'{name}: every coin ({n}) has + Buy, − Sell and ⋯', n > 5 and cnt == [n, n, n], (n, cnt))
        one = pg.evaluate(f"(() => {{ const r = document.querySelector('{sel} .btn-more').parentElement.getBoundingClientRect(); return [...document.querySelector('{sel} .btn-more').parentElement.children].every(b => Math.abs(b.getBoundingClientRect().top - r.top) < 2); }})()")
        check(f'{name}: the three buttons sit on one line', one)
        sym = pg.evaluate(f"document.querySelector('{sel} .btn-buy-more').getAttribute('onclick').match(/'(\\w+)'/)[1]")
        for btn, t in (('.btn-buy-more', 'buy'), ('.btn-sell', 'sell')):
            pg.locator(sel).first.locator(btn).click(); pg.wait_for_timeout(200)
            check(f'{name}: {btn} opens the form on {t} for {sym}', form(pg) == [True, t, sym], form(pg)); pg.click('#atxForm .atx-x'); pg.wait_for_timeout(150)
        pg.locator(f"{sel} .btn-more[aria-label$=' {sym}']").first.click(); pg.wait_for_selector('.cpm')
        try: pg.wait_for_function("document.activeElement && document.activeElement.classList.contains('cpm-item')", timeout=3000)   # focus moves in a moment (slow CI machines)
        except Exception: pass
        m = pg.evaluate("({ sheet: document.querySelector('.cpm').classList.contains('sheet'), items: [...document.querySelectorAll('.cpm .cpm-item')].map(i => i.innerText.replace(/\\s+/g,' ').replace('↗','').trim()), focus: document.activeElement.classList.contains('cpm-item'), exp: document.querySelector('" + sel + " .btn-more[aria-expanded=true]') != null, hrefs: [...document.querySelectorAll('.cpm a.cpm-item')].map(a => [a.href, a.target, a.rel]) })")
        check(f'{name}: ⋯ menu lists In, Out, Reward, Network, History, Note, Liq Map, Prediction, Remove', m['items'] == ['Transfer In', 'Transfer Out', 'Reward (staking / mining)', 'Network & where held', 'History', 'Add Note', 'Liquidation Map', 'Price Prediction', 'Remove'], m['items'])
        check(f'{name}: menu is a ' + ('bottom sheet' if name == 'mobile' else 'popover') + ', first item focused, button expanded', m['sheet'] == (name == 'mobile') and m['focus'] and m['exp'], m)
        check(f'{name}: Liq Map / Prediction open CoinGlass / CoinCodex in a new tab', 'coinglass.com' in m['hrefs'][0][0] and 'coincodex' in m['hrefs'][1][0] and all(h[1] == '_blank' and 'noopener' in h[2] for h in m['hrefs']), m['hrefs'])
        pg.screenshot(path=str(T / f'more-menu-{name}.png'))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
        check(f'{name}: Esc closes the menu', pg.query_selector('.cpm') is None)
        for label, t in (('Transfer In', 'transfer_in'), ('Transfer Out', 'transfer_out')):
            menu_pick(pg, sel, sym, label)
            check(f'{name}: ⋯ → {label} opens the form on {t}', form(pg) == [True, t, sym], form(pg)); pg.click('#atxForm .atx-x'); pg.wait_for_timeout(150)
        q0 = pg.evaluate(f"Samsam.getState().portfolio.find(c=>c.sym==='{sym}').qty")
        menu_pick(pg, sel, sym, 'Transfer In'); pg.fill('#atxQty', '3'); pg.fill('#atxPrice', '1'); pg.click('#atxSave')
        pg.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='{sym}').qty - {q0 + 3}) < 1e-9", timeout=5000)
        check(f'{name}: Transfer In from the menu updates holdings', True)
        menu_pick(pg, sel, sym, 'Transfer Out'); pg.fill('#atxQty', '3'); pg.click('#atxSave')
        pg.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='{sym}').qty - {q0}) < 1e-9", timeout=5000)
        check(f'{name}: Transfer Out from the menu updates holdings', True)
        menu_pick(pg, sel, sym, 'History')
        check(f'{name}: ⋯ → History opens the history', pg.evaluate("document.getElementById('historyModal').classList.contains('active')"))
        pg.evaluate("closeHistory()")
        pg.locator(f"{sel} .btn-more").first.click(); pg.wait_for_selector('.cpm'); pg.mouse.click(5, 5); pg.wait_for_timeout(150)
        check(f'{name}: tap outside closes the menu', pg.query_selector('.cpm') is None)
        check(f'{name}: no horizontal page overflow', not pg.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
