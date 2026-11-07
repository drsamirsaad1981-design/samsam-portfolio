"""Target allocation (Holdings → Allocation): set targets (Bitcoin on its own + categories, adding up to 100), see each
group's drift with the band, and the rebalance plan — new money only (adds up to the amount, nothing sold) or a full
rebalance (buys = trims) with the coins to use. Saved to the account; phone + computer, light + dark."""
import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
def meta(): d = json.load(urllib.request.urlopen(S.SRV + '/dump')); return next((v for k, v in d.items() if k.endswith('/meta/info')), {})
money = lambda t: float(t.replace('$', '').replace(',', '').replace('+', '').replace('−', '').replace('-', '') or 0)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');localStorage.setItem('samsam_hov_mode','alloc');localStorage.removeItem('samsam_rb_mode');localStorage.removeItem('samsam_rb_cash')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
            pg.evaluate("Samsam.setTargets(null)"); pg.wait_for_timeout(500)
            pg.evaluate("location.hash='#holdings'"); pg.wait_for_timeout(1200)
            check(f'{vn}/{theme}: Allocation shows "Set my targets"', pg.is_visible('#hovTgtCard') and 'Set my targets' in pg.inner_text('#hovTgtCard'))
            pg.click('#hovTgtCard .tg-go'); pg.wait_for_timeout(300)
            first = pg.evaluate("[...document.querySelectorAll('#tgModal .tge-row')].map(r=>r.dataset.g)")
            check(f'{vn}/{theme}: editor lists Bitcoin first, then your groups {first[:4]}', first and first[0] == 'btc' and len(first) >= 3, first)
            check(f'{vn}/{theme}: empty → Save off, says 100% left', pg.is_disabled('#tgModal [data-act=save]') and '100% left' in pg.inner_text('#tgSum'), pg.inner_text('#tgSum'))
            pg.click('#tgModal [data-act=current]'); pg.wait_for_timeout(150)
            check(f'{vn}/{theme}: "Use my current split" → exactly 100%', 'Total 100%' in pg.inner_text('#tgSum') and not pg.is_disabled('#tgModal [data-act=save]'), pg.inner_text('#tgSum'))
            pg.locator('#tgModal .bl-card').screenshot(path=str(SH / f'tgedit_{vn}_{theme}.png'))
            pg.click('#tgModal [data-act=save]'); pg.wait_for_timeout(1500)
            t = meta().get('targets') or {}
            check(f'{vn}/{theme}: saved to the account (adds up to 100, labels kept)', t and abs(sum(v['pct'] for v in t['list']) - 100) < 0.06 and next(v for v in t['list'] if v['g'] == 'btc')['label'] == 'Bitcoin' and t['band'] == 5, t)
            sub = pg.inner_text('#hovTgtCard .tg-sub')
            n = pg.evaluate("document.querySelectorAll('#hovTgtCard .tg-row').length")
            check(f'{vn}/{theme}: today\'s split = all on target ({sub.split(" groups")[0]})', sub.startswith(f'{n} of {n}'), sub)
            # real targets: Bitcoin 50, Layer 1 30, DeFi 20 — your other groups go to 0
            pg.evaluate("Samsam.setTargets({cats:{btc:{pct:50,label:'Bitcoin'},layer1:{pct:30,label:'Layer 1'},defi:{pct:20,label:'DeFi'}},band:5})"); pg.wait_for_timeout(1200)
            pg.evaluate("renderHoldingsAssetList()"); pg.wait_for_timeout(300)
            plan = pg.evaluate("Samsam.core.allocationPlan(tgGroups(), Samsam.getTargets().cats, {band:5, cash:500})")
            rows = pg.evaluate("[...document.querySelectorAll('#hovTgtCard .tg-row')].map(r=>({g:r.dataset.g, d:r.querySelector('.tg-d').className.replace('tg-d ','')}))")
            check(f'{vn}/{theme}: a row per group with its state {rows[:3]}', len(rows) == len([g for g in plan['groups'] if g['target'] > 0 or g['now'] >= 0.05]) and all(r['d'] in ('ok', 'warn', 'off') for r in rows), rows)
            adds = [money(e) for e in pg.evaluate("[...document.querySelectorAll('#hovTgtCard .tg-amt')].map(e=>e.textContent)")]
            check(f'{vn}/{theme}: New money $500 → buys only, adding up to $500 ({sum(adds):.0f})', adds and abs(sum(adds) - 500) <= len(adds) and not pg.query_selector('#hovTgtCard .tg-amt.sell'), adds)
            pg.fill('#tgCash', '2000'); pg.dispatch_event('#tgCash', 'change'); pg.wait_for_timeout(400)
            adds = [money(e) for e in pg.evaluate("[...document.querySelectorAll('#hovTgtCard .tg-amt')].map(e=>e.textContent)")]
            check(f'{vn}/{theme}: $2,000 → adds up to $2,000 ({sum(adds):.0f})', abs(sum(adds) - 2000) <= len(adds), adds)
            hint = pg.inner_text('#hovTgtCard .tg-acts')
            check(f'{vn}/{theme}: says which coins to use (or that the group has none yet)', 'BTC' in hint or 'no coin in this group' in hint, hint[:200])
            pg.screenshot(path=str(SH / f'tgcash_{vn}_{theme}.png'), full_page=False)
            pg.locator('#hovTgtCard').screenshot(path=str(SH / f'tgcard_{vn}_{theme}.png'))
            pg.click('#hovTgtCard .tg-seg button[data-m=full]'); pg.wait_for_timeout(300)
            buys = [money(e) for e in pg.evaluate("[...document.querySelectorAll('#hovTgtCard .tg-amt.buy')].map(e=>e.textContent)")]
            sells = [money(e) for e in pg.evaluate("[...document.querySelectorAll('#hovTgtCard .tg-amt.sell')].map(e=>e.textContent)")]
            inband = sum(abs(g['full']) for g in plan['groups'] if g['state'] == 'ok')
            check(f'{vn}/{theme}: Full rebalance → buys ≈ trims (${sum(buys):,.0f} / ${sum(sells):,.0f})', buys and sells and abs(sum(buys) - sum(sells)) <= inband + len(buys) + len(sells), (buys, sells))
            check(f'{vn}/{theme}: trims name Sell / Convert coins first', 'Trim' in pg.inner_text('#hovTgtCard .tg-acts'))
            pg.locator('#hovTgtCard').screenshot(path=str(SH / f'tgfull_{vn}_{theme}.png'))
            wide = pg.evaluate("[...document.querySelectorAll('#hovTgtCard *')].some(e=>e.getBoundingClientRect().right>innerWidth+1)")
            check(f'{vn}/{theme}: fits the screen', not wide)
            # editor: a total that isn't 100 can't be saved; Remove → back to the empty card
            pg.click('#hovTgtCard .tg-edit'); pg.wait_for_timeout(300)
            pg.locator('#tgModal .tge-row[data-g=btc] input').fill('70'); pg.wait_for_timeout(100)
            check(f'{vn}/{theme}: 120% → "too much", Save off', 'too much' in pg.inner_text('#tgSum') and pg.is_disabled('#tgModal [data-act=save]'), pg.inner_text('#tgSum'))
            pg.click('#tgModal [data-act=remove]'); pg.wait_for_timeout(1500)
            check(f'{vn}/{theme}: Remove my targets → empty card again, nothing saved', meta().get('targets') is None and 'Set my targets' in pg.inner_text('#hovTgtCard'))
            pg.evaluate("setHovMode('assets')"); pg.wait_for_timeout(300)
            check(f'{vn}/{theme}: Assets mode hides it', not pg.is_visible('#hovTgtCard'))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
