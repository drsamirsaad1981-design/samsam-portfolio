"""A transparent coin logo must show the page/dialog background through it — no dark disc — in every place
a coin logo appears inside dialogs and lists, in dark and light theme."""
import sys, pathlib, json, base64, struct, zlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; T = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def png(w, h, px):   # RGBA rows
    raw = b''.join(b'\x00' + bytes(sum(([*px(x, y)] for x in range(w)), [])) for y in range(h))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')
# logo: transparent everywhere except a small blue ring → the centre must show the background
LOGO = png(64, 64, lambda x, y: (37, 99, 235, 255) if 26 <= ((x-32)**2 + (y-32)**2) ** .5 <= 30 else (0, 0, 0, 0))
SEARCH = {'coins': [{'id': 'aerodrome-finance', 'name': 'Aerodrome Finance', 'symbol': 'AERO', 'market_cap_rank': 90, 'thumb': 'https://img.test/aero.png', 'large': 'https://img.test/aero.png'}]}
CENTRE = """sel => { const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for theme in ('dark', 'light'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=1); S.setup(ctx)
        ctx.add_init_script(f"try {{ localStorage.setItem('samsam_theme', '{theme}') }} catch (e) {{}}")
        ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/png', body=LOGO))
        ctx.route('https://api.coingecko.com/api/v3/search**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(SEARCH), headers={'access-control-allow-origin': '*'}))
        pg = ctx.new_page(); pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        if not pg.evaluate("portfolio.some(c => c.sym === 'AERO')"):
            pg.evaluate("Samsam.addCoin({ sym: 'AERO', name: 'Aerodrome Finance', cat: 'defi', cgId: 'aerodrome-finance', logoUrl: 'https://img.test/aero.png' }, { qty: 10, price: 0.9 })"); pg.wait_for_timeout(1200)
        def sample(label, sel, bg_sel):
            pg.wait_for_timeout(500)
            c = pg.evaluate(CENTRE, sel)
            if not c: check(f'{theme}: {label} logo found', False, sel); return
            shot = pg.screenshot(clip={'x': c['x'] - 2, 'y': c['y'] - 2, 'width': 4, 'height': 4})
            pg.evaluate("sel => { const e = [...document.querySelectorAll(sel)].find(e => e.offsetParent); e.dataset.hideTest = e.style.visibility; e.style.visibility = 'hidden'; }", sel)
            shot_bg = pg.screenshot(clip={'x': c['x'] - 2, 'y': c['y'] - 2, 'width': 4, 'height': 4})
            pg.evaluate("sel => { const e = [...document.querySelectorAll(sel)].find(e => e.dataset.hideTest !== undefined); e.style.visibility = e.dataset.hideTest; delete e.dataset.hideTest; }", sel)
            check(f'{theme}: {label}: centre of a transparent logo = background behind it (no dark spot)', shot == shot_bg)
        pg.evaluate("openAddTx('buy', 'AERO')"); sample('Add Transaction dialog', '#atxCoin img', '#atxCoin'); pg.screenshot(path=str(T / f'aero-atx-{theme}.png')); pg.evaluate("closeAddTx()")
        pg.evaluate("openAddCoin()"); pg.locator('#acSym').press_sequentially('aero', delay=40); pg.wait_for_selector('#acSuggest img')
        sample('Add Coin search list', '#acSuggest img', '#acSuggest'); pg.evaluate("closeAddCoin()")
        pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(300); pg.evaluate("selectCoinTx('AERO')"); pg.wait_for_timeout(500)
        sample('coin transactions list', '.htx-row-icon img', '.htx-row-icon')
        pg.click('#htxCoinDD .sdd-btn'); pg.wait_for_timeout(300); sample('coin selector', '#htxCoinDD .sdd-btn .sdd-ico img', '#htxCoinDD')
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
