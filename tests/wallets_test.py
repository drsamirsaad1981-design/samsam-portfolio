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
TOK_EVM = '0x' + 'ab' * 20; TOK_SOL = 'MintTestYyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy1'; SPAM = 'MintSpamZzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz1'; DEAD = '0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000'
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
        check(f'{vn} Reward listed as "Staking +0.5 SOL"', 'Staking' in hl and '+0.5 SOL' in hl, hl[:200])
        exp_rw = f"rewards +{rw0 + 0.5:g}"
        check(f'{vn} coin page: "{exp_rw}"', exp_rw in pg.inner_text('#htxHoldings24'), pg.inner_text('#htxHoldings24'))
        pg.evaluate("closeCoinTx && closeCoinTx()") if pg.evaluate("typeof closeCoinTx==='function'") else None

        # ── Add Coin: "Network & where held" (a token on a network CoinGecko doesn't place it on) ──
        NS = 'NEWP' if vn == 'phone' else 'NEWD'   # one new coin per screen size (the fake database is shared)
        pg.evaluate("(s)=>CPAdd.openCoin({sym:s, name:'Newt Test', cgId:'newt-test'})", NS); pg.wait_for_selector('#addCoinModal.show', timeout=5000)
        pg.wait_for_timeout(400)
        check(f'{vn} Add Coin shows "Network & where held"', pg.is_visible('#acNet') and 'network' in pg.inner_text('#acNetTxt').lower(), pg.inner_text('#acNetTxt'))
        pg.click('#acNet'); pg.wait_for_selector('#cpNet .nt-body')
        pg.select_option('#ntNet', 'evm:robinhood-chain'); pg.fill('#ntCon', 'not-a-contract'); pg.click('#ntAdd'); pg.wait_for_timeout(150)
        check(f'{vn} a bad contract is refused', '0x' in pg.inner_text('#ntErr'), pg.inner_text('#ntErr'))
        pg.fill('#ntCon', '0x9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c'); pg.click('#ntAdd'); pg.wait_for_timeout(150)
        pg.click('#cpNet [data-pl="wallet"]'); pg.click('#cpNet [data-pl="binance"]')
        if vn == 'phone': pg.locator('#cpNet .nt-box').screenshot(path=str(SH / 'coin_network.png'))
        pg.click('#ntSave'); pg.wait_for_timeout(200)
        nt = pg.inner_text('#acNetTxt')
        check(f'{vn} Add Coin: "Robinhood Chain · Your wallet + Binance" ({nt})', 'Robinhood Chain' in nt and 'Binance' in nt and 'Your wallet' in nt, nt)
        pg.fill('#acQty', '100'); pg.fill('#acPrice', '2'); pg.click('#acSave')
        pg.wait_for_function("(s)=>Samsam.getState().coins.some(c=>c.sym===s && c.nets)", arg=NS, timeout=8000)
        nd = pg.evaluate("(s)=>Samsam.getState().coins.find(c=>c.sym===s)", NS)
        check(f'{vn} saved on the coin: network + contract + where held', nd['nets'] == [{'k': 'evm:robinhood-chain', 'c': '0x9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c'}] and nd['at'] == ['wallet', 'binance'], (nd.get('nets'), nd.get('at')))
        pg.evaluate("(s)=>openCoinTx(s)", NS); pg.wait_for_timeout(500)
        check(f'{vn} coin page: "Robinhood Chain · Your wallet + Binance" under the amount', 'Robinhood Chain' in pg.inner_text('#htxNet'), pg.inner_text('#htxNet') if pg.query_selector('#htxNet') else '')
        pg.evaluate("closeCoinTx && closeCoinTx()") if pg.evaluate("typeof closeCoinTx==='function'") else None

        # ── Wallets: mocked blockchain ──
        held = pg.evaluate("Samsam.getState().portfolio.filter(c=>c.qty>0).map(c=>({sym:c.sym,cgId:c.cgId||SamsamCoins.CG_IDS[c.sym]||'',qty:c.qty}))")
        H = {c['sym']: c for c in held}
        natives = {'bitcoin', 'ethereum', 'solana', 'binancecoin', 'polygon-ecosystem-token', 'avalanche-2', 'sui', 'near', 'hedera-hashgraph', 'kaspa', 'dogecoin', 'cosmos', 'sei-network', 'kava', 'aptos', 'crypto-com-chain', 'mantle', 'moonbeam', 'moonriver', 'flare-networks', 'monad', 'sonic-3', 'celo', 'xdai', 'the-open-network'}
        own = pg.evaluate("SamsamWallets._own.source")
        toks = [c for c in held if c['cgId'] and c['cgId'] not in natives and not re.match(own, c['sym']) and not c['sym'].startswith('USD') and c['sym'] not in ('GRAM', 'MNT', 'GLMR', 'QNT')]
        X, Y, Z = toks[0], toks[1], toks[2]   # X: an Ethereum token (the app has more) · Y: a Solana token (the wallet has more) · Z: CoinGecko always busy
        cg_calls = []; jup_q = []
        def cg(route):
            cid = route.request.url.split('/coins/')[1].split('?')[0]; cg_calls.append(cid)
            if cid == 'list':   # the whole list in one answer — without Z (so Z is asked on its own, and CoinGecko is busy)
                return route.fulfill(status=200, content_type='application/json', body=json.dumps(
                    [{'id': c['cgId'], 'symbol': c['sym'].lower(), 'platforms': {'ethereum': TOK_EVM} if c is X else {'mantle': DEAD} if c['sym'] == 'MNT' else {}} for c in held if c['cgId'] and c is not Z]))
            if cid == Z['cgId']: return route.fulfill(status=429, body='busy')
            dp = {'ethereum': {'decimal_place': None, 'contract_address': TOK_EVM}} if cid == X['cgId'] else {}   # Y's Solana mint comes from Jupiter, not CoinGecko
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'id': cid, 'detail_platforms': dp, 'platforms': {}}))
        ctx.route(re.compile(r'https://api\.coingecko\.com/api/v3/coins/(?!markets)[a-z0-9-]+\?.*'), cg)
        live = {}   # the app's amounts at check time
        ctx.route('https://mempool.space/api/address/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
            body=json.dumps({'chain_stats': {'funded_txo_sum': round((live['BTC'] + 0.001) * 1e8) + 5000, 'spent_txo_sum': 5000}, 'mempool_stats': {'funded_txo_sum': 0, 'spent_txo_sum': 0}})))
        def evm(route):
            chain = route.request.url.split('//')[1].split('-')[0]   # ethereum / bsc / arbitrum …
            if 'robinhood' in route.request.url: chain = 'robinhood'
            if chain == 'moonbeam': return route.fulfill(status=503, body='down')   # Moonbeam doesn't answer → GLMR "didn't answer", never "not in the wallet"
            body = json.loads(route.request.post_data); one = not isinstance(body, list); body = [body] if one else body
            out = []
            for c in body:
                v = 0
                if c['method'] == 'eth_getBalance' and 'ETH' in live and chain in ('ethereum', 'arbitrum'): v = int(live['ETH'] / 2 * 1e18)
                if chain == 'mantle' and (c['method'] == 'eth_getBalance' or (c['method'] == 'eth_call' and c['params'][0]['to'] == DEAD)): v = int(round(live.get('MNT', 0) * 1e6)) * 10 ** 12   # the same MNT twice (native + its system token)
                if chain == 'robinhood' and c['method'] == 'eth_call' and c['params'][0]['to'] == '0x9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c9c': v = 6 if c['params'][0]['data'] == '0x313ce567' else int(round((live.get(NS, 0) - 3) * 1e6))
                if c['method'] == 'eth_getBalance' and chain in ('sei', 'kava'): v = int(round(live.get(chain.upper(), 0) * 1e6)) * 10 ** 12   # SEI on Sei EVM, KAVA on Kava EVM
                if c['method'] == 'eth_call' and c['params'][0]['to'] == TOK_EVM:
                    if c['params'][0]['data'] == '0x313ce567': v = 6
                    elif chain == 'ethereum': v = int(round((live[X['sym']] - 10) * 1e6))
                out.append({'jsonrpc': '2.0', 'id': c['id'], 'result': hex(v)})
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out[0] if one else out))
        ctx.route(re.compile(r'https://[a-z-]+-rpc\.publicnode\.com/?$'), evm); ctx.route('https://rpc.mainnet.chain.robinhood.com/**', evm); ctx.route('https://rpc.mainnet.chain.robinhood.com', evm)
        def sol(route):
            b = json.loads(route.request.post_data)
            if b['method'] == 'getBalance': r = {'value': int(round(live.get('SOL', 0) * 1e9))}
            elif not mode['soltok']: return J(route, {'jsonrpc': '2.0', 'id': b['id'], 'error': {'code': 403, 'message': 'not allowed'}})
            else:
                r = {'value': [{'account': {'data': {'parsed': {'info': {'mint': TOK_SOL, 'tokenAmount': {'uiAmountString': str(live[Y['sym']] + 5)}}}}}},
                                {'account': {'data': {'parsed': {'info': {'mint': SPAM, 'tokenAmount': {'uiAmountString': '1000'}}}}}}] if b['params'][1]['programId'].startswith('Tokenkeg') else []}
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'jsonrpc': '2.0', 'id': b['id'], 'result': r}))
        def jup(route):
            q = route.request.url.split('query=')[1]; jup_q.append(q)
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(
                [{'id': TOK_SOL, 'symbol': Y['sym'].lower(), 'isVerified': True}, {'id': SPAM, 'symbol': Y['sym'], 'isVerified': False}]))
        ctx.route('https://lite-api.jup.ag/tokens/v2/**', jup)
        mode = {'jupbal': vn == 'phone', 'soltok': True}   # phone: Jupiter answers SOL + tokens · desktop: Jupiter down → the public Solana server
        def jupbal(route):
            if not mode['jupbal']: return route.fulfill(status=503, body='down')
            route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({
                'SOL': {'amount': '1', 'uiAmount': live.get('SOL', 0), 'slot': 1, 'isFrozen': False},
                TOK_SOL: {'amount': '1', 'uiAmount': live[Y['sym']] + 5, 'slot': 1, 'isFrozen': False},
                SPAM: {'amount': '1', 'uiAmount': 1000, 'slot': 1, 'isFrozen': False}}))
        ctx.route('https://lite-api.jup.ag/ultra/v1/balances/**', jupbal)
        # networks with their own blockchain (made-up addresses; the app's amounts, some staked)
        J = lambda r, o: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(o))
        def sui(route):
            if vn == 'desktop': return route.fulfill(status=503, body='JSON-RPC switched off')   # desktop: Sui's GraphQL answers instead
            b = json.loads(route.request.post_data); q = live.get('SUI', 0)
            J(route, {'jsonrpc': '2.0', 'id': b['id'], 'result': {'totalBalance': str(int(round((q - 10) * 1e9)))} if b['method'] == 'suix_getBalance'
                      else [{'stakes': [{'principal': str(int(9.5e9)), 'estimatedReward': str(int(0.5e9))}]}]})
        ctx.route('https://fullnode.mainnet.sui.io/**', sui); ctx.route('https://fullnode.mainnet.sui.io:443/', sui); ctx.route('https://fullnode.mainnet.sui.io:443', sui)
        ctx.route('https://sui-rpc.publicnode.com/**', sui); ctx.route('https://sui-rpc.publicnode.com', sui)
        def suigql(route):
            q = json.loads(route.request.post_data)['query']
            if 'coinType' in q: return J(route, {'data': {'address': {'balance': {'totalBalance': str(int(round((live.get('SUI', 0) - 10) * 1e9)))}}}})
            if 'stakedSuis' in q: return J(route, {'data': {'address': {'stakedSuis': {'nodes': [{'principal': str(int(10e9))}]}}}})
            J(route, {'errors': [{'message': 'unknown'}]})
        ctx.route('https://graphql.mainnet.sui.io/**', suigql)
        TONA = 'EQ' + 'A' * 46; GRAM_M = '0:' + 'AB' * 32
        def toncenter(route):
            u = route.request.url
            if 'getAddressBalance' in u: return J(route, {'ok': True, 'result': str(int(round(live.get('TON', 0) * 1e9)))})
            J(route, {'jetton_wallets': [{'jetton': GRAM_M, 'balance': str(int(round(live.get('GRAM', 0) * 1e9)))}, {'jetton': '0:' + 'CD' * 32, 'balance': '5000000000000'}],
                      'metadata': {GRAM_M: {'is_indexed': True, 'token_info': [{'symbol': 'GRAM', 'extra': {'decimals': '9'}}]}, '0:' + 'CD' * 32: {'token_info': [{'symbol': 'FREEGIFT'}]}}})
        ctx.route('https://toncenter.com/**', toncenter)
        ctx.route('https://rpc.mainnet.fastnear.com/**', lambda r: J(r, {'jsonrpc': '2.0', 'id': '1', 'result': {'amount': str(int(round(live.get('NEAR', 0) * 1e6))) + '0' * 18, 'locked': '0'}}))
        ctx.route('https://rpc.mainnet.fastnear.com', lambda r: J(r, {'jsonrpc': '2.0', 'id': '1', 'result': {'amount': str(int(round(live.get('NEAR', 0) * 1e6))) + '0' * 18, 'locked': '0'}}))
        ctx.route('https://mainnet-public.mirrornode.hedera.com/**', lambda r: J(r, {'balance': {'balance': int(round(live.get('HBAR', 0) * 1e8))}}))
        ctx.route('https://api.kaspa.org/**', lambda r: J(r, {'balance': int(round((live.get('KAS', 0) + 20) * 1e8))}))
        ctx.route('https://api.blockcypher.com/**', lambda r: J(r, {'final_balance': int(round((live.get('DOGE', 0) - 30) * 1e8))}))
        def cosmos(route):
            u = route.request.url; q = live.get('ATOM', 0)
            if '/bank/' in u: J(route, {'balances': [{'denom': 'uatom', 'amount': str(int(round((q - 2) * 1e6)))}, {'denom': 'ibc/XYZ', 'amount': '999999'}]})
            elif '/delegations/' in u: J(route, {'delegation_responses': [{'balance': {'denom': 'uatom', 'amount': '1500000'}}]})
            else: J(route, {'unbonding_responses': [{'entries': [{'balance': '500000'}]}]})
        ctx.route('https://rest.cosmos.directory/**', cosmos)
        ctx.route('https://solana-rpc.publicnode.com/**', sol); ctx.route('https://solana-rpc.publicnode.com', sol)

        # Settings → Wallets & check
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_selector('#stRow_wallets')
        check(f'{vn} Settings has "Wallets & check"', 'Wallets & check' in pg.inner_text('#stRow_wallets'))
        pg.click('#stRow_wallets'); pg.wait_for_selector('#cpWal #wlAddr')
        check(f'{vn} empty: a short how-to, Check now disabled', 'No wallet yet' in pg.inner_text('#cpWal') and pg.is_disabled('#wlCheck'))
        pg.fill('#wlAddr', SEED); pg.click('#wlAddBtn'); pg.wait_for_timeout(200)
        check(f'{vn} a recovery phrase is refused (and cleared)', 'recovery phrase' in pg.inner_text('#wlErr') and pg.input_value('#wlAddr') == '' and pg.evaluate("Samsam.getWallets().length") == 0, pg.inner_text('#wlErr'))
        pg.fill('#wlAddr', 'hello123'); pg.click('#wlAddBtn'); pg.wait_for_timeout(200)
        check(f'{vn} a bad address is refused', 'Not an address' in pg.inner_text('#wlErr'))
        for a, lab in ((BTC_A, 'Tangem BTC'), (EVM_A, ''), (SOL_A, 'Tangem SOL')):
            pg.fill('#wlAddr', a); pg.fill('#wlLabel', lab); pg.press('#wlAddr', 'Enter'); pg.wait_for_timeout(350)
        ws = pg.evaluate("Samsam.getWallets()")
        check(f'{vn} 3 wallets saved with the right kind', [w['kind'] for w in ws] == ['btc', 'evm', 'sol'] and ws[0]['label'] == 'Tangem BTC', ws)
        pg.fill('#wlAddr', EVM_A.upper().replace('0X', '0x')); pg.click('#wlAddBtn'); pg.wait_for_timeout(200)
        check(f'{vn} the same address twice is refused', 'Already' in pg.inner_text('#wlErr'))
        check(f'{vn} wallets are in the backup', len(pg.evaluate("Samsam.settingsNow().info.wallets || []")) == 3)

        ctx.route('https://api.mainnet.aptoslabs.com/**', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=str(int(round(live.get('APT', 0) * 1e8)))))
        if 'APT' in H:   # a 0x… with 64 digits: Sui or Aptos → asked
            pg.fill('#wlAddr', '0x' + '7' * 64); pg.click('#wlAddBtn'); pg.wait_for_timeout(250)
            pk = pg.inner_text('#wlPick') if pg.query_selector('#wlPick') else ''
            check(f'{vn} a 0x…(64) address → "Sui or Aptos?"', 'Sui and Aptos' in pk and pg.evaluate("Samsam.getWallets().length") == 3, pk)
            pg.click('#wlPick [data-pick="apt"]'); pg.wait_for_timeout(400)
            ws2 = pg.evaluate("Samsam.getWallets()")
            check(f'{vn} saved as Aptos, the tag can switch it (Aptos ⇄)', ws2[-1]['kind'] == 'apt' and 'Aptos ⇄' in pg.inner_text('#cpWal .wl-list'), ws2[-1])
        n0 = pg.evaluate("Samsam.getWallets().length")
        pg.evaluate("SamsamWallets._cfg.tonGap = 0")
        CH = {'GRAM': TONA, 'SUI': '0x' + '5' * 64, 'NEAR': 'samsam.near', 'HBAR': '0.0.4321', 'KAS': 'kaspa:q' + 'p' * 62, 'DOGE': 'DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L', 'ATOM': 'cosmos1' + 'q' * 38}
        CH = {k: v for k, v in CH.items() if k in H}
        pg.evaluate("(a)=>Samsam.setWallets(Samsam.getWallets().concat(a.map((x,i)=>({id:'c'+i,addr:x,label:''}))))", list(CH.values())); pg.wait_for_timeout(500)
        nw = n0 + len(CH)
        kinds = pg.evaluate("Samsam.getWallets().map(w=>w.kind)")
        KM = {'GRAM': 'ton', 'SUI': 'sui', 'NEAR': 'near', 'HBAR': 'hbar', 'KAS': 'kas', 'DOGE': 'doge', 'ATOM': 'atom'}
        check(f'{vn} Sui / NEAR / Hedera / Kaspa / Dogecoin / Cosmos addresses recognised {kinds[3:]}', kinds[n0:] == [KM[k] for k in CH], kinds)
        live.update(pg.evaluate("Object.fromEntries(Samsam.getState().portfolio.filter(c=>c.qty>0).map(c=>[c.sym,c.qty]))"))
        pg.evaluate("SamsamWallets._cfg.gap = 0; SamsamWallets._cfg.retry = 0")
        pg.click('#wlCheck'); pg.wait_for_function("!document.querySelector('#wlCheck').disabled && document.getElementById('wlResults').innerText.length > 10", timeout=15000)
        txt = pg.inner_text('#wlResults')
        more = pg.evaluate("[...document.querySelectorAll('#wlRes-more .wl-r')].map(r=>r.dataset.sym)")
        less = pg.evaluate("[...document.querySelectorAll('#wlRes-less .wl-r')].map(r=>r.dataset.sym)")
        same = pg.evaluate("[...document.querySelectorAll('#wlRes-same .wl-r')].map(r=>r.dataset.sym)")
        check(f'{vn} wallet has more: BTC (+0.001) and {Y["sym"]} (+5, Solana token named by Jupiter; the look-alike token not counted) {more}', set(more) == {'BTC', Y['sym']} | ({'KAS'} & set(CH)) and '+5 ' + Y['sym'] in pg.inner_text(f'#wlRes-more .wl-r[data-sym="{Y["sym"]}"]'), (more, txt[:400]))
        # phone: the mint isn't known yet → Jupiter names it · desktop: the phone's check saved SOL network + mint on the coin → only the unknown look-alike is asked
        check(f'{vn} Jupiter asked once, for the unknown token mints', len(jup_q) == 1 and SPAM in jup_q[0] and ((TOK_SOL in jup_q[0]) == (vn == 'phone')), jup_q)
        busy = pg.inner_text('#wlRes-cant [data-why="busy"]') if pg.query_selector('#wlRes-cant [data-why="busy"]') else ''
        check(f'{vn} CoinGecko busy for {Z["sym"]} → "tap Check now again" (asked 3×)', Z['sym'] in busy and 'Check now again' in busy and cg_calls.count(Z['cgId']) == 3, (busy, cg_calls.count(Z['cgId'])))
        check(f'{vn} app has more: {X["sym"]} (−10, Ethereum token, decimals asked) + DOGE (−30) {less}', set(less) == {X['sym']} | ({'DOGE'} & set(CH)), (less, txt[:400]))
        for k in ('SUI', 'ATOM'):
            if k in CH:
                t2 = pg.inner_text(f'#wlRes-same .wl-r[data-sym="{k}"]') if pg.query_selector(f'#wlRes-same .wl-r[data-sym="{k}"]') else ''
                check(f'{vn} {k}: in the wallet + staked = the app → Match, "incl. 2/10 staked" ({t2!r})', 'Match' in t2 and 'staked' in t2, t2)
        if 'MNT' in H: check(f'{vn} MNT on Mantle counted once (native, not again as its system token) → Match', 'MNT' in same, same)
        for k in ('NEAR', 'HBAR', 'APT', 'SEI', 'KAVA', 'GRAM'):
            if k in CH: check(f'{vn} {k} read → Match', k in same, same)
        exp_same = [s for s in ('SOL', 'ETH') if s in H]
        check(f'{vn} match: {exp_same} (ETH split over Ethereum + Arbitrum) {same}', set(exp_same) <= set(same), same)
        none = (pg.inner_text('#wlRes-none') if pg.query_selector('#wlRes-none') else '') + (pg.inner_text('#wlRes-kept') if pg.query_selector('#wlRes-kept') else '')   # a coin you marked "Binance" earlier sits under "Where you said"
        rf = pg.inner_text('#wlRes-cant [data-why="readfail"]') if pg.query_selector('#wlRes-cant [data-why="readfail"]') else ''
        if 'GLMR' in H: check(f'{vn} Moonbeam down → GLMR "didn\'t answer — check again", not "not in these wallets"', 'GLMR' in rf and 'GLMR' not in none and txt.count('Moonbeam') <= 2, (rf, none))
        if 'QNT' in H: check(f'{vn} QNT is an Ethereum token now (looked up, not "own blockchain")', 'QNT' not in (pg.inner_text('#wlRes-cant [data-why="own"]') if pg.query_selector('#wlRes-cant [data-why="own"]') else ''))
        check(f'{vn} a coin with 0 in the wallets is "Not in these wallets", never "Match"', all(s not in same for s in ('AVAX', 'POL', 'BNB') if s in H) and all(s in none for s in ('AVAX', 'POL') if s in H), (same, none))
        bt = pg.inner_text('#wlRes-more .wl-r[data-sym="BTC"]')
        check(f'{vn} BTC row: +0.001 BTC, from "Tangem BTC", "Add as" Mining / Staking / Airdrop', '+0.001 BTC' in bt and 'Tangem BTC' in bt and 'as' in bt, bt)
        srcs = pg.evaluate("[...document.querySelectorAll('#wlRes-more .wl-r[data-sym=\"BTC\"] [data-rw]')].map(b=>b.dataset.src+':'+b.innerText.trim())")
        if vn == 'phone': pg.locator('#wlRes-more .wl-r[data-sym="BTC"]').screenshot(path=str(SH / 'wallets_btc_row.png'))
        check(f'{vn} BTC (a mined coin) shows Mining first, then Staking, Airdrop', srcs == ['mining:Mining', 'staking:Staking', 'airdrop:Airdrop'], srcs)
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
        check(f'{vn} Add as Mining: +0.001 BTC at $0 cost (kind reward, from mining)', t.get('kind') == 'reward' and t.get('src') == 'mining' and t['price'] == 0 and abs(b1['qty'] * b1['basePrice'] - b0['qty'] * b0['basePrice']) < 1e-4, t)
        same2 = pg.evaluate("[...document.querySelectorAll('#wlRes-same .wl-r')].map(r=>r.dataset.sym)")
        check(f'{vn} BTC now shows Match (no new check needed)', 'BTC' in same2, same2)
        kept = pg.inner_text(f'#wlRes-kept .wl-r[data-sym="{NS}"]') if pg.query_selector(f'#wlRes-kept .wl-r[data-sym="{NS}"]') else ''
        check(f'{vn} {NS} read on Robinhood Chain with your contract: "Wallets 97 + Binance 3 = App 100"', 'Binance' in kept and 'Wallets 97' in kept and '3' in kept and 'App 100' in kept, kept)
        bd = pg.evaluate("Samsam.getState().coins.find(c=>c.sym==='BTC')")
        check(f'{vn} a coin found in the wallet gets its network + "Your wallet" saved (BTC {bd.get("nets")} {bd.get("at")})', bd.get('nets') == [{'k': 'btc', 'c': ''}] and bd.get('at') == ['wallet'], (bd.get('nets'), bd.get('at')))
        none_syms = pg.evaluate("[...document.querySelectorAll('#wlRes-none [data-net]')].map(b=>b.dataset.net)")
        if none_syms:
            z = none_syms[0]; pg.click(f'#wlRes-none [data-net="{z}"]'); pg.wait_for_selector('#cpNet .nt-pl')
            pg.click('#cpNet [data-pl="binance"]'); pg.click('#ntSave'); pg.wait_for_timeout(700)
            moved = pg.inner_text(f'#wlRes-kept .wl-r[data-sym="{z}"]') if pg.query_selector(f'#wlRes-kept .wl-r[data-sym="{z}"]') else ''
            check(f'{vn} tap {z} under "Not in these wallets" → Binance → it moves to "Where you said" ({moved!r})', 'Binance' in moved and not pg.query_selector(f'#wlRes-none [data-net="{z}"]'), moved)
            if vn == 'phone': pg.locator('#wlRes-kept').screenshot(path=str(SH / 'wallets_kept.png'))
        n_cg = len(cg_calls); pg.click('#wlCheck'); pg.wait_for_function("!document.querySelector('#wlCheck').disabled", timeout=15000)
        check(f'{vn} a second check uses the remembered contracts (only the busy coin asked again)', set(cg_calls[n_cg:]) == {Z['cgId']}, cg_calls[n_cg:])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check(f'{vn} closing the window brings Settings back, with the number of wallets"', pg.is_visible('#stRow_wallets') and f'{nw} wallets' in pg.inner_text('#stRow_wallets'), pg.inner_text('#stRow_wallets') if pg.query_selector('#stRow_wallets') else '')
        pg.click('#stRow_wallets'); pg.wait_for_selector('#cpWal [data-del]')
        pg.click('#cpWal [data-del]'); pg.wait_for_timeout(400)
        check(f'{vn} remove a wallet', len(pg.evaluate("Samsam.getWallets()")) == nw - 1)
        pg.click('#cpWal .wl-w:has(.wl-k:text("EVM")) [data-del]'); pg.wait_for_timeout(400)
        mode['jupbal'] = False; mode['soltok'] = False   # Jupiter down and the Solana server refuses tokens → SOL is still read
        pg.click('#wlCheck'); pg.wait_for_function("!document.querySelector('#wlCheck').disabled", timeout=15000)
        ne = pg.inner_text('#wlRes-cant [data-why="noevm"]') if pg.query_selector('#wlRes-cant [data-why="noevm"]') else ''
        warn = pg.inner_text('#wlResults')
        check(f'{vn} Solana tokens refused → SOL still read (Match) + a plain note', 'SOL itself was read' in warn and 'SOL' in pg.evaluate("[...document.querySelectorAll('#wlRes-same .wl-r')].map(r=>r.dataset.sym)"), warn[:300])
        check(f'{vn} no 0x wallet → {X["sym"]} under "add your 0x… address" (no CoinGecko lookups)', X['sym'] in ne and '0x' in ne, ne)
        nw = pg.inner_text('#wlRes-cant [data-why="nowallet"]') if pg.query_selector('#wlRes-cant [data-why="nowallet"]') else ''
        check(f'{vn} no Bitcoin wallet → BTC under "add your Bitcoin address", not the 0x note', 'BTC' in nw and 'BTC' not in ne.split('\n')[0].split(' · '), (nw, ne))
        if vn == 'phone': pg.locator('#wlRes-cant').screenshot(path=str(SH / 'wallets_notchecked.png'))
        check(f'{vn}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
