"""🔌 Performance → Wallets & Exchanges → Exchanges · live balances: connect a read-only key, see balances vs the app,
a Binance key that can trade is refused, remove — English and Arabic. The Worker (/cex) is mocked here."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S

SITE = 'http://127.0.0.1:8000'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
KEY, SEC = 'K' * 60 + 'ab12', 'Z' * 64

with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp, lang in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True), 'en'), ('desktop-ar', dict(viewport={'width': 1366, 'height': 900}), 'ar')):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        state = {'ex': [], 'bodies': []}
        def cex(route):
            b = json.loads(route.request.post_data or '{}'); state['bodies'].append(b); a = b.get('action')
            if a == 'set':
                if b.get('secret') == 'TRADE' + 'Z' * 59: return route.fulfill(status=400, content_type='application/json', body=json.dumps({'error': 'refused-perms', 'extra': ['enableSpotAndMarginTrading', 'enableWithdrawals']}))
                state['ex'] = [{'ex': 'binance', 'name': 'Binance', 'tail': b['key'][-4:], 'readOnly': True, 'at': '2026-11-17'}]
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'exchanges': state['ex']}))
            if a == 'delete': state['ex'] = []; return route.fulfill(status=200, content_type='application/json', body=json.dumps({'ok': True, 'exchanges': []}))
            if a == 'balances':
                return route.fulfill(status=200, content_type='application/json', body=json.dumps({'exchanges': state['ex'], 'at': 0, 'balances': [
                    {'ex': 'binance', 'name': 'Binance', 'ok': True, 'assets': [{'sym': 'SOL', 'spot': 4, 'funding': 0, 'earn': 6}, {'sym': 'ZZNEW', 'spot': 1000, 'funding': 0, 'earn': 0}, {'sym': 'USDT', 'spot': 0, 'funding': 25, 'earn': 0}]}]}))
            return route.fulfill(status=200, content_type='application/json', body=json.dumps({'exchanges': state['ex']}))
        ctx.route(re.compile(r'.*/cex$'), cex)
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=20000)
        pg.goto(SITE + '/performance.html'); pg.wait_for_function("window.Samsam && Samsam.isReady() && !document.getElementById('wxCard').hidden", timeout=20000)
        check(f'{name}: the card has "Exchanges · live balances"', pg.is_visible('#wxCex') and ('live balances' in pg.inner_text('#wxCex') or 'الأرصدة المباشرة' in pg.inner_text('#wxCex')), pg.inner_text('#wxCard'))
        pg.click('#wxCex'); pg.wait_for_selector('#cpCex #cxKey')
        t = pg.inner_text('#cpCex')
        check(f'{name}: opens with the read-only promise and how to make a Binance key (Enable Reading only)', ('Read-only' in t or 'قراءة فقط' in t) and 'Enable Reading' in t, t[:300])
        if lang == 'ar': check(f'{name}: Arabic, right-to-left', pg.get_attribute('#cpCex', 'dir') == 'rtl' and 'ربط منصة' in t, t[:200])
        pg.fill('#cxKey', KEY); pg.fill('#cxSecret', 'TRADE' + 'Z' * 59); pg.click('#cxAdd'); pg.wait_for_timeout(300)
        e = pg.inner_text('#cxErr')
        check(f'{name}: a key that can trade / withdraw → refused with the reason, nothing connected', ('more than read' in e or 'أكثر من القراءة' in e) and 'Withdrawals' in e and not state['ex'], e)
        pg.fill('#cxSecret', SEC); pg.click('#cxAdd'); pg.wait_for_selector('#cpCex .cx-r', timeout=5000)
        t = pg.inner_text('#cpCex')
        check(f'{name}: read-only key → connected (••••ab12, ✓ read-only), the form is gone for Binance', 'ab12' in t and '✓' in t and pg.locator('#cpCex [data-ex="binance"]').count() == 0, t[:400])
        sent = [b for b in state['bodies'] if b.get('action') == 'set']
        check(f'{name}: the key went to the server once per try, signed in (idToken), and is NOT kept on this device', len(sent) == 2 and all('idToken' in b for b in sent) and KEY not in pg.evaluate("JSON.stringify(localStorage)+JSON.stringify(sessionStorage)") and pg.input_value('#cxKey') == '', len(sent))
        check(f'{name}: balances: SOL 10 (spot 4 + earn 6) next to the app, a coin not in the app flagged, total on exchanges', 'SOL' in t and '10' in t and 'ZZNEW' in t and ('not in the app' in t or 'غير موجودة في التطبيق' in t) and ('On exchanges' in t or 'على المنصات' in t), t[:600])
        pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'cex_{name}_bal.png'))
        pg.click('#cpCex [data-del="binance"]'); pg.wait_for_selector('#cpCex #cxKey', timeout=5000)
        check(f'{name}: Remove → asks, then the exchange is gone (the connect form is back)', any(b.get('action') == 'delete' for b in state['bodies']) and pg.locator('#cpCex [data-del]').count() == 0)
        pg.screenshot(path=str(pathlib.Path(__file__).parent / 'shots' / f'cex_{name}.png'))
        check(f'{name}: no page errors', not errs, errs[:3])
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
