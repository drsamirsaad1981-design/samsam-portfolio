"""Reward (staking) + Wallets & check.
Reward: a 5th type in Add Transaction — coins in at $0 cost (holdings up, cost basis the same, average down), saved as a
Transfer In marked kind:'reward', listed as "Reward" with the coin's rewards total.
Wallets: Settings → Wallets & check — add public addresses (a recovery phrase or a bad address is refused), read the balances
from the blockchain (Bitcoin, Solana + its tokens, EVM chains + tokens; all mocked here, made-up addresses), compare with
the app: wallet more → "Add as Reward" in one tap (then it matches); app more; same; not in these wallets; can't be checked.
Token contracts come from CoinGecko once (remembered). Wallets are in the backup."""
import sys, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
BTC_A = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'          # made-up / test-vector addresses
EVM_A = '0x1234567890abcdef1234567890abcdef12345678'
SOL_A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
TOK_EVM = '0x' + 'ab' * 20; TOK_SOL = 'MintTestYyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy1'; SPAM = 'MintSpamZzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz1'
SEED = 'abandon ability able about above absent absorb abstract absurd abuse access accident'

with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(600)
        pg.evaluate("Samsam.setWallets([])"); pg.wait_for_timeout(300)   # the fake database is shared by both screen sizes
        rw0 = pg.evaluate("Samsam.getState().transactions.filter(t=>t.sym==='SOL'&&t.kind==='reward').reduce((s,t)=>s+t.qty,0)")

        # ── Reward via the form ──
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(400)
        s0 = pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SOL')")
        pg.click('#htxAddBtn'); pg.wait_for_selector('#atxBackdrop.show')
        pg.click('.atx-types button[data-t="reward"]')
        vis = pg.evaluate("['atxPriceRow','atxFeeRow','atxFeeUsdRow'].map(id => getComputedStyle(document.getElementById(id)).display !== 'none')")
        check(f'{vn} Reward: no price / fee fields (it costs $0)', vis == [False, False, False], vis)
        pg.fill('#atxQty', '0.5'); pg.wait_for_timeout(150)
        pv = pg.inner_text('#atxPreview')
        check(f'{vn} Reward preview: "+0.5 SOL at $0 cost"', '+0.5 SOL' in pv and '$0 cost' in pv, pv)
        if vn == 'phone': pg.locator('#atxForm').screenshot(path=str(SH / 'reward_form.png'))
        pg.click('#atxSave')
        pg.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty - {s0['qty'] + 0.5}) < 1e-9", timeout=8000)
        s1 = pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SOL')")
        check(f'{vn} Reward: holdings +0.5, cost basis the same, average lower', abs(s1['qty'] * s1['basePrice'] - s0['qty'] * s0['basePrice']) < 1e-6 and s1['basePrice'] < s0['basePrice'], (s0['basePrice'], s1['basePrice']))
        tx = pg.evaluate("Samsam.getState().transactions.filter(t=>t.sym==='SOL').slice(-1)[0]")
        check(f'{vn} Reward saved as transfer_in, kind reward, price 0', tx['type'] == 'transfer_in' and tx.get('kind') == 'reward' and tx['price'] == 0, tx)
        pg.wait_for_timeout(300)
        hl = pg.inner_text('#htxList')
        check(f'{vn} Reward listed as "Reward +0.5 SOL"', 'Reward' in hl and '+0.5 SOL' in hl, hl[:200])
        exp_rw = f"rewards +{rw0 + 0.5:g}"
        check(f'{vn} coin page: "{exp_rw}"', exp_rw in pg.inner_text('#htxHoldings24'), pg.inner_text('#htxHoldings24'))
        pg.evaluate("closeCoinTx && closeCoinTx()") if pg.evaluate("typeof closeCoinTx==='function'") else None

        # ── Wallets: mocked blockchain ──
        held = pg.evaluate("Samsam.getState().portfolio.filter(c=>c.qty>0).map(c=>({sym:c.sym,cgId:c.cgId||SamsamCoins.CG_IDS[c.sym]||'',qty:c.qty}))")
        H = {c['sym']: c for c in held}
        natives = {'bitcoin', 'ethereum', 'solana', 'binancecoin', 'polygon-ecosystem-token', 'avalanche-2'}
        own = pg.evaluate("SamsamWallets._own.source")
        toks = [c for c in held if c['cgId'] and c['cgId'] not in natives and not re.match(own, c['sym']) and not c['sym'].startswith('USD')]
        X, Y, Z = toks[0], toks[1], toks[2]   # X: an Ethereum token (the app has more) · Y: a Solana token (the wallet has more) · Z: CoinGecko always busy
        cg_calls = []; jup_q = []
        def cg(route):
            cid = route.request.url.split('/coins/')[1].split('?')[0]; cg_calls.append(cid)
            if cid == Z['cgId']: return route.fulfill(status=429, body='busy')
            dp = {'ethereum': {'decimal_place': None, 'contract_address': TOK_EVM}} if cid == X['cgId'] else {}   # Y's Solana mint comes from Jupiter, not CoinGecko
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': cid, 'detail_platforms': dp, 'platforms': {}}))
        ctx.route(re.compile(r'https://api\.coingecko\.com/api/v3/coins/(?!markets)[a-z0-9-]+\?.*'), cg)
        live = {}   # the app's amounts at check time
        ctx.route('https://mempool.space/api/address/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
            body=json.dumps({'chain_stats': {'funded_txo_sum': round((live['BTC'] + 0.001) * 1e8) + 5000, 'spent_txo_sum': 5000}, 'mempool_stats': {'funded_txo_sum': 0, 'spent_txo_sum': 0}})))
        def evm(route):
            chain = route.request.url.split('//')[1].split('-')[0]   # ethereum / bsc / arbitrum …
            body = json.loads(route.request.post_data); one = not isinstance(body, list); body = [body] if one else body
            out = []
            for c in body:
                v = 0
                if c['method'] == 'eth_getBalance' and 'ETH' in live and chain in ('ethereum', 'arbitrum'): v = int(live['ETH'] / 2 * 1e18)
                if c['method'] == 'eth_call' and c['params'][0]['to'] == TOK_EVM:
                    if c['params'][0]['data'] == '0x313ce567': v = 6
                    elif chain == 'ethereum': v = int(round((live[X['sym']] - 10) * 1e6))
                out.append({'jsonrpc': '2.0', 'id': c['id'], 'result': hex(v)})
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out[0] if one else out))
        ctx.route(re.compile(r'https://[a-z-]+-rpc\.publicnode\.com/?$'), evm)
        def sol(route):
            b = json.loads(route.request.post_data)
            if b['method'] == 'getBalance': r = {'value': int(round(live.get('SOL', 0) * 1e9))}
            else:
                r = {'value': [{'account': {'data': {'parsed': {'info': {'mint': TOK_SOL, 'tokenAmount': {'uiAmountString': str(live[Y['sym']] + 5)}}}}}},
                                {'account': {'data': {'parsed': {'info': {'mint': SPAM, 'tokenAmount': {'uiAmountString': '1000'}}}}}}] if b['params'][1]['programId'].startswith('Tokenkeg') else []}
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'jsonrpc': '2.0', 'id': b['id'], 'result': r}))
        def jup(route):
            q = route.request.url.split('query=')[1]; jup_q.append(q)
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(
                [{'id': TOK_SOL, 'symbol': Y['sym'].lower(), 'isVerified': True}, {'id': SPAM, 'symbol': Y['sym'], 'isVerified': False}]))
        ctx.route('https://lite-api.jup.ag/tokens/v2/**', jup)
        ctx.route('https://solana-rpc.publicnode.com/**', sol); ctx.route('https://solana-rpc.publicnode.com', sol)

        # Settings → Wallets & check
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_wallets')
        check(f'{vn} Settings has "Wallets & check"', 'Wallets & check' in pg.inner_text('#stRow_wallets'))
        pg.click('#stRow_wallets'); pg.wait_for_selector('#cpWal #wlAddr')
        check(f'{vn} empty: a short how-to, Check now disabled', 'No wallet yet' in pg.inner_text('#cpWal') and pg.is_disabled('#wlCheck'))
        pg.fill('#wlAddr', SEED); pg.click('#wlAddBtn'); pg.wait_for_timeout(200)
        check(f'{vn} a recovery phrase is refused (and cleared)', 'recovery phrase' in pg.inner_text('#wlErr') and pg.input_value('#wlAddr') == '' and pg.evaluate("Samsam.getWallets().length") == 0, pg.inner_text('#wlErr'))
        pg.fill('#wlAddr', 'hello123'); pg.click('#wlAddBtn'); pg.wait_for_timeout(200)
        check(f'{vn} a bad address is refused', 'Not a Bitcoin' in pg.inner_text('#wlErr'))
        for a, lab in ((BTC_A, 'Tangem BTC'), (EVM_A, ''), (SOL_A, 'Tangem SOL')):
            pg.fill('#wlAddr', a); pg.fill('#wlLabel', lab); pg.press('#wlAddr', 'Enter'); pg.wait_for_timeout(350)
        ws = pg.evaluate("Samsam.getWallets()")
        check(f'{vn} 3 wallets saved with the right kind', [w['kind'] for w in ws] == ['btc', 'evm', 'sol'] and ws[0]['label'] == 'Tangem BTC', ws)
        pg.fill('#wlAddr', EVM_A.upper().replace('0X', '0x')); pg.click('#wlAddBtn'); pg.wait_for_timeout(200)
        check(f'{vn} the same address twice is refused', 'Already' in pg.inner_text('#wlErr'))
        check(f'{vn} wallets are in the backup', len(pg.evaluate("Samsam.settingsNow().info.wallets || []")) == 3)

        live.update(pg.evaluate("Object.fromEntries(Samsam.getState().portfolio.filter(c=>c.qty>0).map(c=>[c.sym,c.qty]))"))
        pg.evaluate("SamsamWallets._cfg.gap = 0; SamsamWallets._cfg.retry = 0")
        pg.click('#wlCheck'); pg.wait_for_function("!document.querySelector('#wlCheck').disabled && document.getElementById('wlResults').innerText.length > 10", timeout=15000)
        txt = pg.inner_text('#wlResults')
        more = pg.evaluate("[...document.querySelectorAll('#wlRes-more .wl-r')].map(r=>r.dataset.sym)")
        less = pg.evaluate("[...document.querySelectorAll('#wlRes-less .wl-r')].map(r=>r.dataset.sym)")
        same = pg.evaluate("[...document.querySelectorAll('#wlRes-same .wl-r')].map(r=>r.dataset.sym)")
        check(f'{vn} wallet has more: BTC (+0.001) and {Y["sym"]} (+5, Solana token named by Jupiter; the look-alike token not counted) {more}', set(more) == {'BTC', Y['sym']} and '+5 ' + Y['sym'] in pg.inner_text(f'#wlRes-more .wl-r[data-sym="{Y["sym"]}"]'), (more, txt[:400]))
        check(f'{vn} Jupiter asked once, for the wallet\'s token mints', len(jup_q) == 1 and TOK_SOL in jup_q[0] and SPAM in jup_q[0], jup_q)
        busy = pg.inner_text('#wlRes-cant [data-why="busy"]') if pg.query_selector('#wlRes-cant [data-why="busy"]') else ''
        check(f'{vn} CoinGecko busy for {Z["sym"]} → "tap Check now again" (asked 3×)', Z['sym'] in busy and 'Check now again' in busy and cg_calls.count(Z['cgId']) == 3, (busy, cg_calls.count(Z['cgId'])))
        check(f'{vn} app has more: {X["sym"]} (−10, Ethereum token, decimals asked) {less}', less == [X['sym']], (less, txt[:400]))
        exp_same = [s for s in ('SOL', 'ETH') if s in H]
        check(f'{vn} match: {exp_same} (ETH split over Ethereum + Arbitrum) {same}', set(exp_same) <= set(same), same)
        none = pg.inner_text('#wlRes-none') if pg.query_selector('#wlRes-none') else ''
        check(f'{vn} a coin with 0 in the wallets is "Not in these wallets", never "Match"', all(s not in same for s in ('AVAX', 'POL', 'BNB') if s in H) and all(s in none for s in ('AVAX', 'POL') if s in H), (same, none))
        bt = pg.inner_text('#wlRes-more .wl-r[data-sym="BTC"]')
        check(f'{vn} BTC row: +0.001 BTC, from "Tangem BTC", Reward button', '+0.001 BTC' in bt and 'Tangem BTC' in bt and 'as Reward' in bt, bt)
        if 'ETH' in H:
            et = pg.inner_text('#wlRes-same .wl-r[data-sym="ETH"] .wl-nums')
            check(f'{vn} ETH found on "Ethereum, Arbitrum" ({et})', et.endswith('· Ethereum, Arbitrum'), et)
        ownt = pg.inner_text('#wlRes-cant [data-why="own"]') if pg.query_selector('#wlRes-cant [data-why="own"]') else ''
        check(f'{vn} coins on their own blockchain → "Their own blockchain"', 'DOT' not in H or ('DOT' in ownt and 'own blockchain' in ownt), ownt)
        check(f'{vn} token contracts asked once ({len(set(cg_calls))} coins), natives not asked', cg_calls and not ({'bitcoin', 'ethereum', 'solana'} & set(cg_calls)), cg_calls)
        if vn == 'phone': pg.screenshot(path=str(SH / 'wallets_check.png'))
        else: pg.locator('#cpWal .wl-box').screenshot(path=str(SH / 'wallets_check_desktop.png'))

        b0 = pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='BTC')")
        pg.click('#wlRes-more .wl-r[data-sym="BTC"] [data-rw]')
        pg.wait_for_function(f"Math.abs(Samsam.getState().portfolio.find(c=>c.sym==='BTC').qty - {b0['qty'] + 0.001}) < 1e-9", timeout=8000); pg.wait_for_timeout(500)
        b1 = pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='BTC')")
        t = pg.evaluate("Samsam.getState().transactions.filter(t=>t.sym==='BTC').slice(-1)[0]")
        check(f'{vn} Add as Reward: +0.001 BTC at $0 cost (kind reward)', t.get('kind') == 'reward' and t['price'] == 0 and abs(b1['qty'] * b1['basePrice'] - b0['qty'] * b0['basePrice']) < 1e-4, t)
        same2 = pg.evaluate("[...document.querySelectorAll('#wlRes-same .wl-r')].map(r=>r.dataset.sym)")
        check(f'{vn} BTC now shows Match (no new check needed)', 'BTC' in same2, same2)
        n_cg = len(cg_calls); pg.click('#wlCheck'); pg.wait_for_function("!document.querySelector('#wlCheck').disabled", timeout=15000)
        check(f'{vn} a second check uses the remembered contracts (only the busy coin asked again)', set(cg_calls[n_cg:]) == {Z['cgId']}, cg_calls[n_cg:])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check(f'{vn} closing the window brings Settings back, with "3 wallets"', pg.is_visible('#stRow_wallets') and '3 wallets' in pg.inner_text('#stRow_wallets'), pg.inner_text('#stRow_wallets') if pg.query_selector('#stRow_wallets') else '')
        pg.click('#stRow_wallets'); pg.wait_for_selector('#cpWal [data-del]')
        pg.click('#cpWal [data-del]'); pg.wait_for_timeout(400)
        check(f'{vn} remove a wallet', len(pg.evaluate("Samsam.getWallets()")) == 2)
        pg.click('#cpWal .wl-w:has(.wl-k:text("EVM")) [data-del]'); pg.wait_for_timeout(400)
        pg.click('#wlCheck'); pg.wait_for_function("!document.querySelector('#wlCheck').disabled", timeout=15000)
        ne = pg.inner_text('#wlRes-cant [data-why="noevm"]') if pg.query_selector('#wlRes-cant [data-why="noevm"]') else ''
        check(f'{vn} no 0x wallet → {X["sym"]} under "add your 0x… address" (no CoinGecko lookups)', X['sym'] in ne and '0x' in ne, ne)
        nw = pg.inner_text('#wlRes-cant [data-why="nowallet"]') if pg.query_selector('#wlRes-cant [data-why="nowallet"]') else ''
        check(f'{vn} no Bitcoin wallet → BTC under "add your Bitcoin address", not the 0x note', 'BTC' in nw and 'BTC' not in ne.split('\n')[0].split(' · '), (nw, ne))
        if vn == 'phone': pg.locator('#wlRes-cant').screenshot(path=str(SH / 'wallets_notchecked.png'))
        check(f'{vn}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
