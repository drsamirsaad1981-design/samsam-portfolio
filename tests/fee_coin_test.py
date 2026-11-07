"""Buy form: the buying fee can be in the coin itself, plus a network fee to your own wallet (e.g. Binance → Tangem).
Fewer coins arrive, the cost stays what you paid, so the average buy price carries every fee."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
POS = "(s=>{const c=Samsam.getState().portfolio.find(x=>x.sym===s); return c?[c.qty,c.basePrice]:[0,0]})"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('desktop', dict(viewport={'width': 1440, 'height': 900})), ('mobile', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2))):
        for theme in ('dark', 'light'):
            ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
            pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(800)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            tag = f'{name}/{theme}'
            sym = {'desktop/dark': 'ARB', 'desktop/light': 'OP', 'mobile/dark': 'SUI', 'mobile/light': 'NEAR'}[tag]
            b = pg.evaluate(f"{POS}('{sym}')")
            pg.evaluate(f"try{{localStorage.removeItem('samsam_buyfee_unit')}}catch(e){{}}; openAddTx('buy','{sym}')"); pg.wait_for_timeout(200)
            check(f'{tag}: Buy shows the fee unit switch (USD | {sym}) and the network fee field',
                  pg.is_visible('#atxFeeUnitSeg') and pg.inner_text('#atxFeeUnitCoin') == sym and pg.is_visible('#atxNetFee'))
            check(f'{tag}: fee starts in USD', pg.get_attribute('#atxFeeUnitSeg [data-u="usd"]', 'aria-checked') == 'true' and 'USD' in pg.inner_text('#atxFeeUsdLabel'))
            pg.click('#atxFeeUnitCoin'); pg.wait_for_timeout(100)
            check(f'{tag}: switching to {sym} relabels the fee', sym in pg.inner_text('#atxFeeUsdLabel') and 'taken from the amount bought' in pg.inner_text('#atxFeeUsdLabel'))
            pg.fill('#atxQty', '100'); pg.fill('#atxPrice', '2'); pg.fill('#atxFeeUsd', '0.1'); pg.fill('#atxNetFee', '1.5'); pg.wait_for_timeout(150)
            pv = pg.inner_text('#atxPreview')
            check(f'{tag}: preview — total cost stays $200, 98.4 arrive', '$200.00' in pv and 'Arrives in your wallet: 98.4' in pv, pv)
            if theme == 'light': pg.screenshot(path=str(SH / f'fee_coin_{name}.png'))
            pg.fill('#atxNetFee', '100'); pg.wait_for_timeout(100)
            pg.click('#atxSave'); pg.wait_for_timeout(200)
            check(f'{tag}: fees ≥ amount are refused', pg.is_visible('#atxForm') and 'smaller than the amount bought' in pg.inner_text('#atxErr'), pg.inner_text('#atxErr'))
            pg.fill('#atxNetFee', '1.5'); pg.click('#atxSave')
            exp_q = b[0] + 98.4; exp_a = (b[0] * b[1] + 200) / exp_q
            pg.wait_for_function(f"Math.abs({POS}('{sym}')[0] - {exp_q}) < 1e-7", timeout=8000)
            a = pg.evaluate(f"{POS}('{sym}')")
            check(f'{tag}: holdings +98.4, average = (old cost + $200) / new amount', abs(a[0] - exp_q) < 1e-7 and abs(a[1] - exp_a) < 1e-9, (a, exp_q, exp_a))
            tx = pg.evaluate(f"(()=>{{const t=Samsam.getState().transactions.filter(x=>x.sym==='{sym}'&&x.type==='buy').sort((a,b)=>(a.createdAt<b.createdAt?1:-1))[0]; return [t.qty,t.fee,t.netFee||0,t.feeUsd||0]}})()")
            check(f'{tag}: saved qty 100, fee 1.6 {sym} (network 1.5), no USD fee', abs(tx[0] - 100) < 1e-9 and abs(tx[1] - 1.6) < 1e-9 and abs(tx[2] - 1.5) < 1e-9 and tx[3] == 0, tx)
            pg.evaluate(f"openAddTx('buy','{sym}')"); pg.wait_for_timeout(150)
            check(f'{tag}: the {sym} choice is remembered', pg.get_attribute('#atxFeeUnitSeg [data-u="coin"]', 'aria-checked') == 'true')
            pg.evaluate(f"openAddTx('sell','{sym}')"); pg.wait_for_timeout(150)
            check(f'{tag}: Sell keeps the USD fee only (no unit switch, no network fee)', not pg.is_visible('#atxFeeUnitSeg') and not pg.is_visible('#atxNetFee') and 'Selling fee' in pg.inner_text('#atxFeeUsdLabel'))
            pg.evaluate("closeAddTx()")
            pg.goto(f'{SITE}/index.html#holdings/{sym}'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
            lst = pg.inner_text('#htxList')
            check(f'{tag}: coin history shows 98.4 arrived and the fee in {sym}', '98.4' in lst and ('fee 1.6 ' + sym) in lst, lst[:300])
            check(f'{tag}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
