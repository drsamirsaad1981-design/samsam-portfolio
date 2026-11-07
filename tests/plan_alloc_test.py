"""Plan vs target allocation (Plan page): without targets a note + link; with targets each category today → after the
plan vs its target, how many are on target before and after, and every plan coin's chip (↓ Priority / ↑ Over target /
✓ On target) — follows a change of the targets at once. Phone + computer, light + dark."""
import sys, pathlib, json, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');if(!sessionStorage.getItem('pa'))localStorage.removeItem('samsam_pa_open')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(600)
            pg.evaluate("Samsam.setTargets(null)"); pg.wait_for_timeout(500)
            pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            check(f'{vn}/{theme}: no targets → a note with a link to set them', pg.is_visible('#planAlloc') and 'Set a target allocation' in pg.inner_text('#planAlloc') and pg.get_attribute('#planAlloc .pa-open', 'href').endswith('#allocation'))
            check(f'{vn}/{theme}: no chips without targets', not pg.query_selector('.pa-chip'))
            # targets: Bitcoin 40, Layer 1 30, Meme 10, Oracle 20
            pg.evaluate("Samsam.setTargets({cats:{btc:{pct:40},layer1:{pct:30},meme:{pct:10},oracle:{pct:20}},band:5})"); pg.wait_for_timeout(1500)
            a = pg.evaluate("(()=>{const a=planAllocation(); return {toBuy:a.toBuy, now:a.now.groups.map(g=>[g.key,+g.now.toFixed(2)]), after:a.after.groups.map(g=>[g.key,+g.now.toFixed(2),g.state])}})()")
            check(f'{vn}/{theme}: closed at first — title + summary only (page stays short)', not pg.is_visible('#paRows') and pg.is_visible('#planAlloc .pa-sub') and pg.get_attribute('#planAlloc .pa-tog', 'aria-expanded') == 'false')
            h0 = pg.evaluate("document.getElementById('planAlloc').offsetHeight")
            pg.click('#planAlloc .pa-tog b'); pg.wait_for_timeout(300)
            check(f'{vn}/{theme}: tap → the categories open', pg.is_visible('#paRows') and pg.get_attribute('#planAlloc .pa-tog', 'aria-expanded') == 'true' and pg.evaluate("document.getElementById('planAlloc').offsetHeight") > h0 + 100)
            rows = pg.evaluate("[...document.querySelectorAll('#planAlloc .pa-row')].map(r=>r.dataset.g)")
            check(f'{vn}/{theme}: a row per category (today → after the plan) {rows[:4]}', len(rows) >= 4 and {'btc', 'layer1', 'meme', 'oracle'} <= set(rows), rows)
            sub = pg.inner_text('#planAlloc .pa-sub')
            check(f'{vn}/{theme}: says what finishing the plan does ({sub[:80]}…)', ('If you finish this plan' in sub and 'categories on target' in sub) or 'plan is complete' in sub, sub)
            # after the plan = today + what's left to buy, in each coin's category
            chk = pg.evaluate("""(()=>{const a=planAllocation(); const add={}; accumPlan.forEach(e=>{const r=calcRow(e); if(r.costToTarget>0){const g=paGroup(e); add[g]=(add[g]||0)+r.costToTarget}});
              return a.after.groups.every(g=>Math.abs(g.value - ((a.now.groups.find(x=>x.key===g.key)||{value:0}).value + (add[g.key]||0))) < 0.01)})()""")
            check(f'{vn}/{theme}: "after" = today + the plan\'s cost to target, by category', chk)
            chips = pg.evaluate("[...document.querySelectorAll('.pa-chip')].filter(e=>e.offsetParent).map(e=>[e.className.replace('pa-chip ',''), e.textContent, e.title])")
            st = pg.evaluate("Object.entries(paState).map(([k,v])=>[k,v.state])")
            check(f'{vn}/{theme}: every plan coin has its category chip ({len(chips)})', len(chips) > 0 and all(c[0] in ('under', 'over', 'ok') for c in chips) and all(('Priority' in c[1]) == (c[0] == 'under') for c in chips), chips[:3])
            check(f'{vn}/{theme}: chip says why (category, points, what to do)', all('target allocation' in c[2] for c in chips), chips[:2])
            pg.locator('#planAlloc').screenshot(path=str(SH / f'planalloc_{vn}_{theme}.png'))
            wide = pg.evaluate("[...document.querySelectorAll('#planAlloc *')].some(e=>e.getBoundingClientRect().right>innerWidth+1)")
            check(f'{vn}/{theme}: fits the screen', not wide)
            pg.evaluate("sessionStorage.setItem('pa','1')"); pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500)
            check(f'{vn}/{theme}: stays open after a reload (remembered)', pg.is_visible('#paRows'))
            pg.click('#planAlloc .pa-tog b'); pg.wait_for_timeout(300)
            check(f'{vn}/{theme}: tap again → closed', not pg.is_visible('#paRows'))
            pg.evaluate("sessionStorage.removeItem('pa')")
            # change the targets → the chips follow
            pg.evaluate("Samsam.setTargets({cats:{btc:{pct:5},layer1:{pct:5},meme:{pct:80},oracle:{pct:10}},band:5})"); pg.wait_for_timeout(1500)
            st2 = pg.evaluate("Object.entries(paState).map(([k,v])=>[k,v.state])")
            check(f'{vn}/{theme}: new targets → the states follow ({dict(st2).get("meme")})', st2 != st and dict(st2).get('btc') in ('over', 'ok'), (st, st2))
            # "Allocation ›" inside the app (the Plan tab of index.html) → Portfolio → Allocation, not Home
            pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(800)
            pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(2500)
            fr = next(f for f in pg.frames if 'accumulation.html' in f.url)
            fr.click('#planAlloc .pa-open'); pg.wait_for_timeout(1500)
            st3 = pg.evaluate("({hash:location.hash, mode:document.getElementById('holdingsOverlay').getAttribute('data-mode'), shown:getComputedStyle(document.getElementById('holdingsOverlay')).display, tgt:!!document.getElementById('hovTgtCard').offsetParent})")
            check(f'{vn}/{theme}: "Allocation ›" in the app opens Portfolio → Allocation {st3}', st3['hash'].startswith('#holdings') and st3['mode'] == 'alloc' and st3['shown'] != 'none' and st3['tgt'], st3)
            pg.evaluate("Samsam.setTargets(null)"); pg.wait_for_timeout(800)
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
