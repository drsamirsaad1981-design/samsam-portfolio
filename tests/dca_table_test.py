"""Plan page: the DCA calculator is reachable from Table view too (same as Cards), phone + desktop."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
shots = pathlib.Path(__file__).parent / 'shots'
with sync_playwright() as p:
    br=p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width':1440,'height':900}))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE+'/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        pg.evaluate("Samsam.saveAccumPlan(['SOL','ETH','DOT'].map((s,i)=>({sym:s,name:s,targetQty:100,addedAt:'2026-10-1'+i})))"); pg.wait_for_timeout(800)
        pg.goto(S.SITE+'/accumulation.html'); pg.wait_for_function("Samsam.isReady() && document.querySelector('#btnTable')"); pg.wait_for_timeout(1500)
        pg.click('#btnTable'); pg.wait_for_timeout(400)
        rows=pg.evaluate("[...document.querySelectorAll('#tableView tbody tr')].map(tr=>!!tr.querySelector('button.row-dca svg') && /DCA/.test(tr.querySelector('.row-dca').textContent))")
        check(f'{vn}: every table row has a DCA button with the calculator icon', len(rows)==3 and all(rows), rows)
        row=pg.locator('#tableView tbody tr').nth(1); sym=row.evaluate("tr=>tr.querySelector('.row-dca').title.split(' ').pop()"); btn=row.locator('.row-dca'); btn.scroll_into_view_if_needed(); btn.click(); pg.wait_for_timeout(500)
        check(f'{vn}: tapping it opens the DCA calculator for that coin', pg.evaluate("getComputedStyle(document.getElementById('dcaOverlay')).display")=='flex' and sym in pg.inner_text('#dcaSub') and sym in pg.evaluate("document.querySelector('#tableView tbody tr:nth-child(2)').innerText"), pg.inner_text('#dcaSub'))
        pg.fill('#dcaMonthly','100'); pg.fill('#dcaMonths','6'); pg.wait_for_timeout(300)
        check(f'{vn}: calculator works from table view', pg.evaluate("getComputedStyle(document.getElementById('dcaResult')).display")!='none')
        pg.screenshot(path=str(shots/f'dca_table_{vn}.png'))
        pg.evaluate("closeDcaModal()"); pg.wait_for_timeout(300)
        b=pg.locator('#tableView tbody tr').first.locator('.row-dca').bounding_box(); d=pg.locator('#tableView tbody tr').first.locator('.row-buy').bounding_box()
        check(f'{vn}: DCA sits beside Buy, same height', abs(b['height']-d['height'])<=1 and abs(b['y']-d['y'])<=1, (b,d))
        pg.locator('#tableView').screenshot(path=str(shots/f'dca_table_rows_{vn}.png'))
        check(f'{vn}: no JS errors', not errs, errs[:2]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
