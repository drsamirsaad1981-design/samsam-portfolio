"""Automatic staking: Reward → Staking → Automatic (APY). You enter the amount staked, the APY and the start date;
the app books a Staking reward ($0 cost) for every full week, adds it to the staked amount (compounding), never twice
(two devices booking at once write the same transaction), and the coin page shows the stake with Change and Stop."""
import sys, pathlib, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
STK = "Samsam.getState().transactions.filter(t=>String(t.id).startsWith('stk_SOL_'))"
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(500)
        q0 = pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty")
        # ── the form ──
        pg.evaluate("openAddTx('reward','SOL')"); pg.wait_for_selector('#atxBackdrop.show')
        pg.click('#atxSrcSeg [data-s="staking"]')
        check(f'{vn} Staking shows Manual | Automatic', pg.is_visible('#atxModeRow') and pg.inner_text('#atxModeSeg').split() [:1] == ['Manual'], pg.inner_text('#atxModeSeg'))
        pg.click('#atxSrcSeg [data-s="mining"]')
        check(f'{vn} Mining has no Manual | Automatic', not pg.is_visible('#atxModeRow'))
        pg.click('#atxSrcSeg [data-s="staking"]'); pg.click('#atxModeSeg [data-m="auto"]'); pg.wait_for_timeout(150)
        check(f'{vn} Automatic: APY field, "Amount staked", no note, button "Start staking"',
              pg.is_visible('#atxApy') and pg.inner_text('#atxQtyLabel') == 'Amount staked' and not pg.is_visible('#atxNote') and pg.inner_text('#atxSave') == 'Start staking',
              (pg.inner_text('#atxQtyLabel'), pg.inner_text('#atxSave')))
        check(f'{vn} the amount starts as what you hold ({q0})', abs(float(pg.input_value('#atxQty') or 0) - q0) < 1e-9, pg.input_value('#atxQty'))
        start = (datetime.datetime.now() - datetime.timedelta(days=21, hours=1)).strftime('%Y-%m-%dT%H:%M')
        pg.fill('#atxQty', '100'); pg.fill('#atxApy', '7'); pg.fill('#atxDate', start); pg.wait_for_timeout(200)
        pv = pg.inner_text('#atxPreview')
        check(f'{vn} preview: a week\'s earnings + "3 weekly rewards" since the start date', 'a week' in pv and '3 weekly rewards' in pv, pv)
        if vn == 'phone': pg.locator('#atxForm').screenshot(path=str(SH / 'auto_stake_form.png'))
        pg.click('#atxSave'); pg.wait_for_function(STK + ".length === 3", timeout=8000); pg.wait_for_timeout(500)
        st = pg.evaluate("Samsam.getStake('SOL')"); tx = pg.evaluate(STK)
        earned = sum(t['qty'] for t in tx)
        check(f'{vn} 3 Staking rewards at $0 (kind reward, src staking)', all(t['type'] == 'transfer_in' and t['price'] == 0 and t.get('kind') == 'reward' and t.get('src') == 'staking' for t in tx), tx)
        check(f'{vn} they add up to 21 days at 7% APY ({earned:.8f})', abs(earned - 100 * (1.07 ** (21 / 365) - 1)) < 1e-8, earned)
        check(f'{vn} the stake grew by them (compounding): {st and st["qty"]}', st and abs(st['qty'] - (100 + earned)) < 1e-9 and st['apy'] == 7, st)
        check(f'{vn} holdings went up by the rewards', abs(pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='SOL').qty") - (q0 + earned)) < 1e-9)
        n = pg.evaluate("Samsam.bookStakes()")
        check(f'{vn} booking again now adds nothing ({n})', n == 0 and len(pg.evaluate(STK)) == 3)
        # two devices booking the same week at once → one transaction
        pg.evaluate("(()=>{const t=Date.now()+8*864e5; return Promise.all([Samsam.bookStakes(t), Samsam.bookStakes(t)]);})()"); pg.wait_for_timeout(600)
        check(f'{vn} two bookings of the same week at once → one reward, not two', len(pg.evaluate(STK)) == 4, len(pg.evaluate(STK)))
        # ── the coin page ──
        pg.keyboard.press('Escape'); pg.evaluate("openCoinTx('SOL')"); pg.wait_for_selector('#htxStake:not([hidden])')
        sk = pg.inner_text('#htxStake')
        check(f'{vn} coin page: "Staking … SOL · 7% APY" with Change and Stop', 'Staking' in sk and '7% APY' in sk and 'Change' in sk and 'Stop' in sk, sk)
        if vn == 'phone': pg.locator('#htxStake').screenshot(path=str(SH / 'auto_stake_strip.png'))
        pg.click('#htxStake .htx-stake-btn:not(.stop)'); pg.wait_for_selector('#atxBackdrop.show')
        check(f'{vn} Change: "Change staking", amount + APY filled, no type buttons',
              pg.inner_text('#atxTitle') == 'Change staking' and pg.input_value('#atxApy') == '7' and not pg.is_visible('.atx-types') and pg.inner_text('#atxSave') == 'Save changes',
              (pg.inner_text('#atxTitle'), pg.input_value('#atxApy')))
        pg.fill('#atxApy', '5'); pg.fill('#atxQty', '150'); pg.click('#atxSave'); pg.wait_for_timeout(800)
        st2 = pg.evaluate("Samsam.getStake('SOL')")
        check(f'{vn} saved: 150 SOL at 5%', st2 and st2['apy'] == 5 and st2['qty'] == 150, st2)
        check(f'{vn} the strip follows (5% APY)', '5% APY' in pg.inner_text('#htxStake'), pg.inner_text('#htxStake'))
        pg.evaluate("openAddTx('reward','SOL')"); pg.click('#atxSrcSeg [data-s="staking"]'); pg.wait_for_timeout(100)
        check(f'{vn} a new Reward for a coin already on automatic starts as Manual', pg.get_attribute('#atxModeSeg [data-m="manual"]', 'aria-checked') == 'true')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
        pg.click('#htxStake .htx-stake-btn.stop'); pg.wait_for_timeout(900)   # the test page answers dialogs with OK (__cpLog)
        check(f'{vn} Stop asks first', 'Stop automatic staking for SOL' in str(pg.evaluate('(window.__cpLog||[]).slice(-1)')))
        check(f'{vn} Stop: no longer on automatic, the strip is gone, rewards stay', pg.evaluate("Samsam.getStake('SOL')") is None and not pg.is_visible('#htxStake') and len(pg.evaluate(STK)) >= 4)
        # clean up (phone and desktop share the test database)
        pg.evaluate("Samsam.deleteTxs(" + STK + ".map(t=>t.id))"); pg.wait_for_timeout(400)
        pg.keyboard.press('Escape')
        check(f'{vn}: no sideways scroll', pg.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
