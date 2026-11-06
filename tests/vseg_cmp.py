"""Table · Cards switch: Exit Plan must match Home and Accumulation (size, look, labels, icons) — phone + computer."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
JS = """(sel)=>{const g=[...document.querySelectorAll(sel)].find(e=>e.offsetParent); if(!g) return null; const r=g.getBoundingClientRect(), cs=getComputedStyle(g);
  const b=[...g.querySelectorAll('button')].map(x=>{const c=getComputedStyle(x), br=x.getBoundingClientRect(); const s=x.querySelector('svg'); const sr=s&&s.getBoundingClientRect();
    return {text:x.innerText.trim(), w:Math.round(br.width), h:Math.round(br.height), pad:c.padding, fs:c.fontSize, fw:c.fontWeight, gap:c.gap, rad:c.borderRadius, icon:sr?Math.round(sr.width):0, active:x.classList.contains('btn-toggle-active'), bg:c.backgroundColor}});
  return {w:Math.round(r.width), h:Math.round(r.height), rad:cs.borderRadius, pad:cs.padding, bg:cs.backgroundColor, border:cs.borderTopColor, btns:b, right:Math.round(innerWidth-r.right)}}"""
def strip(x): return {k: v for k, v in x.items() if k not in ('right',)} if x else x
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        home = pg.evaluate(JS, '#viewToggleBtn')
        pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(1200)
        acc = pg.evaluate(JS, '.toolbar .cp-vseg')
        g = pg.locator('.toolbar .cp-vseg').first; g.scroll_into_view_if_needed(); bb = g.bounding_box()
        pg.screenshot(path=str(SH / f'vseg_{vn}_acc.png'), clip={'x': max(0, bb['x'] - 260), 'y': bb['y'] - 12, 'width': min(bb['width'] + 280, vp['viewport']['width'] - max(0, bb['x'] - 260)), 'height': bb['height'] + 24})
        pg.evaluate("Samsam.saveExit({ tab: 'exit' })"); pg.reload(); pg.wait_for_function("window.Samsam && Samsam.isReady() && document.querySelector('.xs-view')"); pg.wait_for_timeout(1200)
        ex = pg.evaluate(JS, '.xs-view')
        g = pg.locator('.xs-view').first; g.scroll_into_view_if_needed(); bb = g.bounding_box()
        pg.screenshot(path=str(SH / f'vseg_{vn}_exit.png'), clip={'x': max(0, bb['x'] - 260), 'y': bb['y'] - 12, 'width': min(bb['width'] + 280, vp['viewport']['width'] - max(0, bb['x'] - 260)), 'height': bb['height'] + 24})
        print(vn, 'HOME', json.dumps(home)); print(vn, 'ACC ', json.dumps(acc)); print(vn, 'EXIT', json.dumps(ex))
        def look(x): return [x['h'], x['rad'], x['pad'], x['bg'], x['border'], [[b['text'], b['h'], b['pad'], b['fs'], b['fw'], b['rad'], b['icon']] for b in x['btns']]]
        check(f'{vn}: Exit switch looks like Accumulation\'s', look(ex) == look(acc), (look(ex), look(acc)))
        check(f'{vn}: Exit switch the same width as Accumulation\'s', abs(ex['w'] - acc['w']) <= 2, (ex['w'], acc['w']))
        check(f'{vn}: Exit switch at the far right like Accumulation', abs(ex['right'] - acc['right']) <= 2, (ex['right'], acc['right']))
        bar = pg.evaluate("(()=>{const b=document.querySelector('.xs-bar'), r=b.getBoundingClientRect(); return {fits: b.scrollWidth<=b.clientWidth+1, kids:[...b.children].filter(e=>e.offsetParent).map(e=>{const q=e.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.left), Math.round(q.right)]}), w: Math.round(r.width)}})()")
        check(f'{vn}: Exit toolbar on one line, nothing cut {bar}', bar['fits'] and max(k[0] for k in bar['kids']) - min(k[0] for k in bar['kids']) <= 16 and all(k[2] <= vp['viewport']['width'] for k in bar['kids']), bar)
        check(f'{vn}: no JS errors', not errs, errs[:3]); pg.evaluate("Samsam.saveExit({ tab: 'accumulation' })"); pg.wait_for_timeout(400); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
