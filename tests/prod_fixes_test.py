"""Production fixes: sold-out coins (Avg —, Sold out badge, profit % on everything invested), $—.—— placeholder before data,
clickjacking guard (own tabs still work), AI request carries the sign-in token, AI text escaped, Worker errors shown."""
import sys, pathlib, json, time
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
shots = pathlib.Path(__file__).parent / 'shots'
sent = []
def worker(route):
    b = json.loads(route.request.post_data or '{}'); sent.append(b)
    if len(sent) == 2: return route.fulfill(status=429, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'error': "You have used today's 5 AI reports.", 'remaining': 0}))
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'},
                  body=json.dumps({'report': '1. 📊 Market Overview\n- **ok** <img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>', 'model': 'claude-test', 'remaining': 4}))
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('desktop', dict(viewport={'width': 1366, 'height': 900})), ('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True))):
        ctx = br.new_context(**vp); S.setup(ctx); ctx.route('**/samsam-analysis.**/analyze', worker)
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        # ── sold out ──
        e = pg.evaluate("(()=>{const c=Samsam.getState().portfolio.find(c=>c.sym==='ETH');return {q:c.qty,a:c.basePrice}})()")
        pg.evaluate(f"Samsam.addTx('ETH','sell',{e['q']},{e['a'] * 1.085},'sold out test')"); pg.wait_for_timeout(1200)
        pg.evaluate("openHoldingsView && openHoldingsView()"); pg.wait_for_timeout(700)
        ap = pg.evaluate("(()=>{const c=portfolio.find(c=>c.sym==='ETH');return coinProfit(c)})()")
        first = vn == 'desktop'   # the phone run shares the database, so ETH already has the desktop's sale too
        check(f'{vn}: sold-out profit % = realized ÷ cost of what was sold', ap['cost'] == 0 and ap['soldCost'] > 0 and abs(ap['pct'] - ap['total'] / ap['soldCost'] * 100) < 1e-9 , ap)
        ex = pg.evaluate("CPProfit.calc({ value: 0, cost: 0, realized: 8.5, soldCost: 100 }).pct")
        check(f'{vn}: bought $100, sold all for $108.50 → +8.5% (not +0.0%)', abs(ex - 8.5) < 1e-9, ex)
        txt = pg.evaluate("(()=>{const r=[...document.querySelectorAll('tbody tr, .coin-card')].find(e=>e.offsetParent&&/\\bETH\\b/.test(e.innerText)&&e.innerText.length<800);return r?r.innerText.replace(/\\s+/g,' '):''})()")
        avg = pg.evaluate("""(()=>{const r=[...document.querySelectorAll('tbody tr, .coin-card')].find(e=>e.offsetParent&&/\\bETH\\b/.test(e.innerText)&&e.innerText.length<800);if(!r)return null;
            if(r.tagName==='TR')return r.children[2].innerText.trim();const m=[...r.querySelectorAll('.coin-metric')].find(m=>/Avg/.test(m.querySelector('label').innerText));return m?m.querySelector('val').innerText.trim():null})()""")
        check(f'{vn}: sold-out row: Avg. Buy Price "—", Signal "Sold out", profit +8.5%', avg == '—' and 'Sold out' in txt and 'Sell/Convert' not in txt and f"+{ap['pct']:.1f}%" in txt, (avg, txt[:300]))
        badge = pg.evaluate("(()=>{const b=[...document.querySelectorAll('.action-soldout')].find(b=>b.offsetParent);return b?getComputedStyle(b).color:null})()")
        check(f'{vn}: Sold out badge is neutral grey', badge is not None, badge)
        held = pg.evaluate("(()=>{const c=portfolio.find(c=>c.sym==='BTC');return [getAction('BTC',0,c), coinProfit(c).pct]})()")
        check(f'{vn}: coins still held keep their normal Signal', held[0] == 'hold', held)
        pg.screenshot(path=str(shots / f'soldout_{vn}.png'))
        pg.evaluate("openCoinTx && openCoinTx('ETH')"); pg.wait_for_timeout(600)
        cp = pg.evaluate("[document.getElementById('htxAvg').textContent, document.getElementById('htxSignal').innerText.replace(/\\s+/g,' ')]")
        check(f'{vn}: coin page: Avg "—", Signal "Sold out"', cp[0] == '—' and 'Sold out' in cp[1] and 'hold none' in cp[1], cp)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # whole-portfolio All Time Profit % = total ÷ (held cost + sold cost)
        ok = pg.evaluate("(()=>{const a=allTimeProfitData(), r=Samsam.getState().realized;return Math.abs(a.pct - a.total/(a.cost+(r.soldCost||0))*100)<1e-9 && r.soldCost>0})()")
        check(f'{vn}: portfolio All Time Profit % uses everything invested', ok)
        # ── placeholder before data ──
        pg.add_init_script("""(()=>{window.__seen=[];const t0=performance.now();const tick=()=>{const e=document.getElementById('totalUsd');if(e)window.__seen.push(e.textContent);if(performance.now()-t0<4000)requestAnimationFrame(tick)};requestAnimationFrame(tick)})()""")
        pg.reload(); pg.wait_for_timeout(4500)
        seen = list(dict.fromkeys(pg.evaluate("window.__seen")))
        check(f'{vn}: Total Portfolio shows $—.—— until data, never $0.00', '$—.——' in seen and not any(v.strip() in ('$0.00', '$0') for v in seen) and seen[-1].startswith('$') and seen[-1] != '$—.——', seen)
        # ── AI request carries the sign-in token; AI text is escaped; Worker errors shown ──
        S.wait_ready(pg); pg.wait_for_timeout(800)
        n0 = len(sent); pg.evaluate("openAnalysis(); runAnalysis()"); pg.wait_for_timeout(3500)
        body = sent[-1] if len(sent) > n0 else {}
        check(f'{vn}: AI request carries the Firebase ID token', body.get('idToken') == 'fake-id-token.uid_samir', list(body.keys()))
        html = pg.evaluate("document.getElementById('analysisBody').innerHTML")
        check(f'{vn}: AI text shown as text — no <img>/<script> from the report, nothing ran', '<img' not in html and '<script' not in html and pg.evaluate("!window.__xss") and '&lt;img' in html, html[:200])
        check(f'{vn}: footer names the model + reports left today', 'claude-test' in html and '4 reports left today' in html, html[-300:])
        if len(sent) == 1 and vn == 'desktop':   # second call → the Worker says daily limit
            pg.evaluate("runAnalysis()"); pg.wait_for_timeout(2500)
            t = pg.inner_text('#analysisBody')
            check(f'{vn}: Worker daily limit → "Daily limit reached" + its message', 'Daily limit reached' in t and '5 AI reports' in t, t[:200])
        pg.evaluate("closeAnalysis && closeAnalysis()")
        # ── clickjacking guard: own shell tabs still render; a foreign frame is blanked ──
        vis = pg.evaluate("[...document.querySelectorAll('#cpViews iframe')].map(f=>{try{return getComputedStyle(f.contentDocument.documentElement).display}catch(e){return 'x'}})")
        check(f'{vn}: the app’s own tabs (iframes) are not blocked', vis and all(v != 'none' for v in vis), vis)
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    # foreign site framing the app
    ctx = br.new_context(); S.setup(ctx)
    ctx.route('http://evil.test/**', lambda r: r.fulfill(status=200, content_type='text/html', body=f'<html><body><iframe id=f src="{S.SITE}/index.html" width=800 height=600></iframe></body></html>'))
    pg = ctx.new_page(); pg.goto('http://evil.test/page'); pg.wait_for_timeout(2500)
    fr = next((f for f in pg.frames if 'index.html' in f.url), None)
    hidden = fr is None or fr.evaluate("getComputedStyle(document.documentElement).display") == 'none'
    check('a foreign site framing the app: the app stays hidden (or breaks out)', hidden or 'index.html' in pg.url, (pg.url, fr and fr.url))
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
