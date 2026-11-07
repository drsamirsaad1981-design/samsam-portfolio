"""DCA schedule (Plan page): the DCA window saves a regular buy (amount, weekly / every 2 weeks / monthly, the day) to the
plan coin in the account; the DCA schedule card shows it — Today + Buy when it's due, ✓ Bought once a buy is recorded,
$/month, kept n of m; editing keeps it, Remove deletes it; the card opens / closes. Phone + computer, light + dark."""
import sys, pathlib, json, urllib.request, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
def accum(): d = json.load(urllib.request.urlopen(S.SRV + '/dump')); return {v['sym']: v for k, v in d.items() if '/accum/' in k}
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');localStorage.removeItem('samsam_dca_open')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(500)
            pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            pg.evaluate("(()=>{accumPlan.forEach(e=>{e.dca=null}); saveAccumPlan(true); renderAll()})()"); pg.wait_for_timeout(1200)
            check(f'{vn}/{theme}: no schedules → no DCA card', not pg.is_visible('#dcaCard'))
            # pick a plan coin you hold and don't own fully
            idx = pg.evaluate("accumPlan.findIndex(e=>{const r=calcRow(e); return r.actualQty>0 && r.pendingQty>0 && r.currentPrice>0 && e.sym!=='BTC'})")
            recent = pg.evaluate(f"""(()=>{{const tx=Samsam.getState().transactions||[], d=todayLocal(), lo=new Date(Date.parse(d+'T00:00:00Z')-2*864e5).toISOString().slice(0,10);
              return tx.some(t=>t.type==='buy'&&t.sym===accumPlan[{idx}].sym&&String(t.date).slice(0,10)>=lo)}})()""")   # bought in the last 2 days already (the test database is shared by the runs)
            sym = pg.evaluate(f"accumPlan[{idx}].sym")
            pg.evaluate(f"openDcaModal({idx})"); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: DCA window: Save off until an amount', pg.is_disabled('#dcaSave') and pg.get_attribute('#dcaEvery button[data-v=month]', 'aria-pressed') == 'true')
            pg.fill('#dcaMonthly', '100'); pg.click('#dcaEvery button[data-v=week]'); pg.wait_for_timeout(100)
            wd = pg.evaluate("new Date().getDay()")
            pg.select_option('#dcaDay', str(wd)); pg.wait_for_timeout(150)
            r = pg.evaluate("({month:document.getElementById('dcaMonthUsd').textContent, each:document.getElementById('dcaPerMonth').textContent, first:document.getElementById('dcaFirst').textContent, days:document.querySelectorAll('#dcaDay option').length, target:document.getElementById('dcaMonthsToTarget').textContent})")
            check(f'{vn}/{theme}: weekly $100 → $433.33 a month, first buy today, days of the week {r}', r['month'] == '$433.33' and r['days'] == 7 and r['first'] == pg.evaluate("shortDate(todayLocal())") and ('buy' in r['target'] or 'reached' in r['target']), r)
            pg.locator('#dcaOverlay .dca-modal').screenshot(path=str(SH / f'dcamodal_{vn}_{theme}.png'))
            pg.click('#dcaSave'); pg.wait_for_timeout(1500)
            a = accum().get(sym, {}).get('dca')
            check(f'{vn}/{theme}: saved on the plan coin in the account {a}', a and a['usd'] == 100 and a['every'] == 'week' and a['day'] == wd, a)
            card = pg.inner_text('#dcaCard') if pg.is_visible('#dcaCard') else ''
            if recent: check(f'{vn}/{theme}: DCA card: already bought in the window → ✓ Bought, $433.33/mo', 'DCA schedule' in card and '$433.33/mo' in card and '✓ Bought' in card and not pg.is_visible('#dcaCard .dc-buy'), card[:200])
            else: check(f'{vn}/{theme}: DCA card: Today + Buy, $433.33/mo', 'DCA schedule' in card and '$433.33/mo' in card and 'Today' in card and pg.is_visible('#dcaCard .dc-buy'), card[:200])
            pg.locator('#dcaCard').screenshot(path=str(SH / f'dcacard_{vn}_{theme}.png'))
            # a buy recorded today → ✓ Bought, no Buy button
            pg.evaluate(f"(()=>{{const r=calcRow(accumPlan[{idx}]); return Samsam.addTx('{sym}','buy',r.pendingQty/20,r.currentPrice,'dca test')}})()"); pg.wait_for_timeout(1800)
            card = pg.inner_text('#dcaCard')
            check(f'{vn}/{theme}: after the buy → ✓ Bought, Next date, no Buy button', '✓ Bought' in card and 'Next' in card and not pg.is_visible('#dcaCard .dc-buy'), card[:200])
            # edit: monthly on the 15th — the window opens with what's saved
            pg.click('#dcaCard .dc-main'); pg.wait_for_timeout(200)
            st = pg.evaluate("({v:document.getElementById('dcaMonthly').value, wk:document.querySelector('#dcaEvery [aria-pressed=true]').dataset.v, rm:!document.getElementById('dcaRemove').hidden, save:document.getElementById('dcaSave').textContent})")
            check(f'{vn}/{theme}: tapping the row opens it with the saved schedule {st}', st == {'v': '100', 'wk': 'week', 'rm': True, 'save': 'Save changes'}, st)
            pg.click('#dcaEvery button[data-v=month]'); pg.select_option('#dcaDay', '15'); pg.wait_for_timeout(100)
            check(f'{vn}/{theme}: monthly → 28 days to choose from', pg.evaluate("document.querySelectorAll('#dcaDay option').length") == 28)
            pg.click('#dcaSave'); pg.wait_for_timeout(1500)
            a = accum().get(sym, {}).get('dca')
            check(f'{vn}/{theme}: changed to monthly on the 15th', a and a['every'] == 'month' and a['day'] == 15, a)
            check(f'{vn}/{theme}: the card says "on the 15th of each month"', 'on the 15th of each month' in pg.inner_text('#dcaCard'))
            # open / close
            pg.click('#dcaCard .pa-tog b'); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: tap the title → closed (summary stays)', not pg.is_visible('#dcaRows') and pg.is_visible('#dcaCard .pa-sub'))
            pg.click('#dcaCard .pa-tog b'); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: tap again → open', pg.is_visible('#dcaRows'))
            wide = pg.evaluate("[...document.querySelectorAll('#dcaCard *, #dcaOverlay .dca-modal *')].some(e=>e.offsetParent&&e.getBoundingClientRect().right>innerWidth+1)")
            check(f'{vn}/{theme}: fits the screen', not wide)
            # remove
            pg.click('#dcaCard .dc-main'); pg.wait_for_timeout(200); pg.click('#dcaRemove'); pg.wait_for_timeout(1500)
            check(f'{vn}/{theme}: Remove schedule → gone from the account and the card', not accum().get(sym, {}).get('dca') and not pg.is_visible('#dcaCard'))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
