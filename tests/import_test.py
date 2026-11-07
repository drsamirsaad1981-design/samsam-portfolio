"""Import from an exchange file (CSV): Binance trade + withdraw history (made-up data in Binance's layout).
Fills grouped per order, fee in the coin and the network fee to your wallet come off the coins, BNB fee → dollars,
mining BTC sells skipped, USDT to another exchange skipped, a non-dollar pair skipped, your own entry recognised,
new coins added, importing again adds nothing, an unknown layout asks for its columns once."""
import sys, pathlib, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
D = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')   # the file's times are UTC+3 (as its name says)
def TRADES(o, nc): return f"""Order No,Time,Pair,Side,Price,Executed,Amount,Fee,AOR Conversion Pair,AOR Conversion Rate
{o}01,{D} 12:06:11,BTCUSDT,BUY,80000,0.01BTC,800USDT,0.00001BTC,,
{o}01,{D} 12:06:11,BTCUSDT,BUY,80000,0.02BTC,1600USDT,0.00002BTC,,
{o}02,{D} 12:10:00,BTCUSDT,SELL,80000,0.0002BTC,16USDT,0.016USDT,,
{o}03,{D} 12:11:00,{nc}USDT,BUY,0.002,50000{nc},100USDT,50{nc},,
{o}04,{D} 12:12:00,SOLUSDT,BUY,100,1SOL,100USDT,0.001SOL,,
{o}05,{D} 12:13:00,ETHBTC,BUY,0.03,0.1ETH,0.003BTC,0.0001ETH,,
{o}06,{D} 12:14:00,SUIUSDT,BUY,1,10SUI,10USDT,0.0000165BNB,,
"""
def WITHDRAW(o, nc): return f"""Time,Coin,Network,Amount,Fee,Address,TXID,Status
{D} 12:38:53,BTC,BTC,0.02995,0.00002,bc1qmadeupwallet0000000000000000000000,t{o}1,Completed
{D} 12:40:00,USDT,BSC,500,0.01,0xMadeUpExchange000000000000000000000001,t{o}2,Completed
{D} 12:41:00,SOL,SOL,0.998,0.001,MadeUpSolWallet11111111111111111111111,t{o}3,Completed
{D} 12:42:00,{nc},ETH,49600,350,0xMadeUpEvmWallet00000000000000000000002,t{o}4,Completed
"""
OTHER = f"""Trade Date;Market;Direction;Deal Price;Filled Qty;Deal Total;Commission
{D} 12:20:00;NEAR_USDT;buy;2.5;4;10;0.004
"""
FN_T = 'Binance-Spot-Trade-History-202611071304UTC3-part1-of1.csv'; FN_W = 'Binance-Withdraw-History-202611071246UTC3-part1-of1.csv'
def files(pg, lst): pg.set_input_files('#impFile', [{'name': n, 'mimeType': 'text/csv', 'buffer': t.encode()} for n, t in lst]); pg.wait_for_timeout(500)
POS = "(s=>{const c=Samsam.getState().portfolio.find(x=>x.sym===s); return c?[c.qty,c.basePrice]:[0,0]})"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('desktop', dict(viewport={'width': 1366, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2))):
        theme = 'dark' if name == 'desktop' else 'light'
        o, nc = ('90', 'GALA') if name == 'desktop' else ('80', 'AMP')
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
        pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(800)
        pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}'); try{{localStorage.removeItem('samsam_imp_addr');localStorage.removeItem('samsam_imp_mining');localStorage.removeItem('samsam_imp_maps')}}catch(e){{}}")
        btc0, sol0, gala0, sui0 = [pg.evaluate(f"{POS}('{s}')") for s in ('BTC', 'SOL', nc, 'SUI')]
        # your own entry of the SOL buy (as it arrived) → recognised, not added twice
        pg.evaluate(f"Samsam.addTx('SOL','buy',0.998,100,'my own entry',{{date:new Date('{D}T12:12:30+03:00').toISOString()}})")
        pg.wait_for_function(f"Math.abs({POS}('SOL')[0] - {sol0[0] + 0.998}) < 1e-9")
        # the cloud menu has the button
        pg.locator('.ss-set-hdr').first.click(); pg.wait_for_selector('#cpSet')
        check(f'{name}: Settings → Import from exchange', pg.is_visible('#stRow_import'))
        pg.click('#stRow_import'); pg.wait_for_selector('#impModal', state='visible')
        files(pg, [(FN_T, TRADES(o, nc)), (FN_W, WITHDRAW(o, nc))])
        fl = pg.inner_text('#impFiles')
        check(f'{name}: both files recognised as Binance', 'Binance · Trades' in fl and 'Binance · Withdrawals' in fl, fl)
        addr = pg.inner_text('#impBody')
        check(f'{name}: USDT address defaults to Exchange / other, coin addresses to My wallet',
              pg.get_attribute('[data-addr="0xMadeUpExchange000000000000000000000001"][data-k="out"]', 'aria-checked') == 'true' and
              pg.get_attribute('[data-addr="bc1qmadeupwallet0000000000000000000000"][data-k="mine"]', 'aria-checked') == 'true')
        items = pg.evaluate("(()=>{const r={}; document.querySelectorAll('.imp-sum button').forEach(b=>r[b.dataset.view]=b.innerText); return r})()")
        check(f'{name}: tabs show To add · 3, Already there · 1, Skipped (mining, USDT, ETH/BTC) {items}', '· 3' in items.get('new', '') and '· 1' in items.get('dupe', '') and '· 3' in items.get('skip', ''), items)
        lst = pg.inner_text('.imp-list')
        check(f'{name}: BTC order = one line, 2 fills, arrives 0.02995 (trade + network fee)', '0.03 BTC' in lst and '2 fills' in lst and 'arrives 0.02995 BTC' in lst, lst[:500])
        check(f'{name}: BNB fee counted in dollars (no price in the test → noted)', 'BNB' in lst, lst)
        check(f'{name}: new coin {nc} listed', nc in pg.inner_text('.imp-new'), pg.inner_text('#impBody')[-200:])
        check(f'{name}: Add button counts 3', pg.inner_text('#impSave') == 'Add 3 transactions', pg.inner_text('#impSave'))
        pg.click('[data-view="skip"]'); pg.wait_for_timeout(150); sk = pg.inner_text('.imp-list')
        check(f'{name}: skipped — mining BTC, USDT to the exchange, ETH paid in BTC', 'Mining BTC' in sk and 'another exchange' in sk and 'Paid in BTC' in sk, sk)
        pg.click('[data-view="dupe"]'); pg.wait_for_timeout(150)
        check(f'{name}: SOL recognised as your own entry', 'Already in your portfolio' in pg.inner_text('.imp-list') and 'SOL' in pg.inner_text('.imp-list'))
        # mining off → the BTC sell becomes a normal sell to add
        pg.uncheck('#impMining'); pg.wait_for_timeout(200)
        check(f'{name}: mining off → 4 to add (the BTC sell too)', pg.inner_text('#impSave') == 'Add 4 transactions', pg.inner_text('#impSave'))
        pg.check('#impMining'); pg.wait_for_timeout(200)
        # untick SUI
        pg.click('[data-view="new"]'); pg.wait_for_timeout(100)
        pg.locator('.imp-row', has_text='SUI').locator('input').click(); pg.wait_for_timeout(200)
        check(f'{name}: unticking a line → Add 2', pg.inner_text('#impSave') == 'Add 2 transactions', pg.inner_text('#impSave'))
        pg.screenshot(path=str(SH / f'import_{name}.png'), full_page=False)
        sw = pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
        check(f'{name}: no sideways scroll', sw)
        pg.click('#impSave'); pg.wait_for_function("!document.getElementById('impBd').classList.contains('show')", timeout=10000)
        pg.wait_for_function(f"Math.abs({POS}('BTC')[0] - {btc0[0] + 0.02995}) < 1e-9", timeout=10000)
        btc1, gala1, sui1 = [pg.evaluate(f"{POS}('{s}')") for s in ('BTC', nc, 'SUI')]
        bt = pg.evaluate("(()=>{const t=Samsam.getState().transactions.find(x=>x.id==='imp_binance_o'+'%s01_b'" % o + "); return t?[t.qty,t.price,t.fee||0,t.feeUsd||0,t.netFee||0,t.note]:null})()")
        check(f'{name}: BTC +0.02995 (what reached the wallet)', abs(btc1[0] - btc0[0] - 0.02995) < 1e-9, (btc0, btc1))
        check(f'{name}: saved as one Buy 0.03 @ $80,000, fee 0.00005 BTC (network 0.00002), cost stays $2,400', bt and abs(bt[0] - 0.03) < 1e-12 and abs(bt[1] - 80000) < 1e-6 and abs(bt[2] - 0.00005) < 1e-12 and bt[3] == 0 and abs(bt[4] - 0.00002) < 1e-12 and f'order {o}01' in bt[5], bt)
        check(f'{name}: {nc} added — 50000 − 50 trade fee − 350 network fee = 49600', abs(gala1[0] - gala0[0] - 49600) < 1e-6 and gala1[1] > 0, gala1)
        check(f'{name}: SUI (unticked) not added', abs(sui1[0] - sui0[0]) < 1e-12, (sui0, sui1))
        sol1 = pg.evaluate(f"{POS}('SOL')")
        check(f'{name}: SOL not doubled', abs(sol1[0] - sol0[0] - 0.998) < 1e-9, (sol0, sol1))
        # again → nothing new
        pg.evaluate("SamsamImport.open()"); files(pg, [(FN_T, TRADES(o, nc)), (FN_W, WITHDRAW(o, nc))])
        t2 = pg.evaluate("(()=>{const r={}; document.querySelectorAll('.imp-sum button').forEach(b=>r[b.dataset.view]=b.innerText); return r})()")
        check(f'{name}: importing again → To add shows only SUI (left out last time) {t2}', '· 1' in t2.get('new', ''), t2)
        # an unknown layout asks once
        files(pg, [('Mystery-Exchange-trades.csv', OTHER)])
        check(f'{name}: unknown layout → "which column is which" box', pg.is_visible('.imp-map'), pg.inner_text('#impFiles'))
        guessed = pg.evaluate("[...document.querySelectorAll('.imp-map select')].map(s=>s.dataset.f+'='+s.value).join(',')")
        check(f'{name}: the other columns are guessed from their names ({guessed})', 'pair=1' in guessed and 'side=2' in guessed and 'qty=4' in guessed and 'time=' in guessed and 'time=0' not in guessed, guessed)
        pg.select_option('.imp-map select[data-f="time"]', '0'); pg.wait_for_timeout(300)
        check(f'{name}: after choosing, its NEAR buy appears', not pg.is_visible('.imp-map') and 'NEAR' in pg.inner_text('.imp-list'), pg.inner_text('#impBody')[:300])
        pg.evaluate("SamsamImport.close(); SamsamImport.open()"); files(pg, [('Mystery-Exchange-trades.csv', OTHER)])
        check(f'{name}: the layout is remembered next time', not pg.is_visible('.imp-map') and 'NEAR' in pg.inner_text('.imp-list'))
        pg.evaluate("SamsamImport.close()")
        # the Add Transaction form links here
        pg.evaluate("openAddTx('buy','BTC')"); pg.wait_for_timeout(150)
        check(f'{name}: Add Transaction has the import link', pg.is_visible('#atxImp'))
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
