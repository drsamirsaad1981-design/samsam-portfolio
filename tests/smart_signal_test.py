"""Smart signal in the app: coins behind BTC over 30 and 90 days don't get Reinforce (Hold + a mark + the reason),
coins ahead of BTC don't get Sell / Convert; the coin page says why; Signal Thresholds has the Smart switch with a preview,
and switching it off (saved to the account) brings the classic signals back. Phone + computer, light + dark."""
import sys, pathlib, json, re, urllib.request
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
def meta(): d = json.load(urllib.request.urlopen(S.SRV + '/dump')); return next((v for k, v in d.items() if k.endswith('/meta/info')), {})
src = (S.ROOT / 'samsam-coins.js').read_text(); ids = sorted(set(re.findall(r'"[^"]+"\s*:\s*"([a-z0-9-]+)"', re.search(r'var CG_IDS = \{([\s\S]*?)\};', src).group(1))))
WEAK = json.dumps({'updated': '2026-11-07T00:00:00Z', 'btc': [0, 0, 0], 'coins': [{'id': i, 'sym': '', 'p': [0, -30, -40]} for i in ids], 'mine': {}})
COUNT = """(()=>{const n={reinforce:0,convert:0,hold:0,soldout:0}; portfolio.forEach(c=>{n[getAction(c.sym,0,c)]++}); return n})()"""
CLASSIC = """(()=>{const n={reinforce:0,convert:0,hold:0}; portfolio.forEach(c=>{if(isSoldOut(c))return; n[signalInfo(c,{...signalRules(),smart:false}).action]++}); return n})()"""
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.route('**/prices/m/alt.json', lambda r: r.fulfill(status=200, content_type='application/json', body=WEAK, headers={'access-control-allow-origin': '*'}))
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}');localStorage.removeItem('samsam_mkt_altpage')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
            # thresholds from the test coins themselves, so every band has coins (Hold / Reinforce / Sell / Convert)
            pg.evaluate("""(async()=>{const v=portfolio.filter(c=>!isSoldOut(c)&&c.sym!=='BTC').map(getCoinPct).sort((a,b)=>a-b);
              const q=f=>v[Math.floor(v.length*f)]; let r=Math.min(99,Math.max(-98,q(0.7)+0.01)), x=Math.max(-99.8,Math.min(r-0.5,q(0.3)-0.01));
              await Samsam.setSignalRules({reinforce:Math.round(r*100)/100, sell:Math.round(x*100)/100}); await Samsam.setSignalSmart(true)})()"""); pg.wait_for_timeout(2500)
            cl = pg.evaluate(CLASSIC); now = pg.evaluate(COUNT)
            nod = pg.evaluate("portfolio.filter(c=>!isSoldOut(c)&&!rsFor(c)&&signalInfo(c,{...signalRules(),smart:false}).action==='reinforce').length")   # no 30 / 90-day data → classic stays
            check(f'{vn}/{theme}: strength loaded for the coins ({pg.evaluate("Object.keys(rsMap).length")})', pg.evaluate("Object.keys(rsMap).length") > 20)
            check(f'{vn}/{theme}: every coin behind BTC → no Reinforce, except coins without data ({nod}) (classic {cl}, smart {now})', cl['reinforce'] > nod and now['reinforce'] == nod and now['convert'] == cl['convert'] and now['hold'] == cl['hold'] + cl['reinforce'] - nod, (cl, now, nod))
            marks = pg.evaluate("[...document.querySelectorAll('.action-badge.sig-smart')].filter(e=>e.offsetParent).map(e=>e.title)")
            check(f'{vn}/{theme}: those badges show Hold with the Smart mark + reason ({len(marks)})', len(marks) > 0 and all('behind BTC' in t for t in marks), marks[:2])
            pg.screenshot(path=str(SH / f'smartsig_{vn}_{theme}.png'))
            sym = pg.evaluate("portfolio.find(c=>!isSoldOut(c)&&signalInfo(c).why==='weak').sym")
            pg.evaluate(f"openCoinTx('{sym}')"); pg.wait_for_timeout(700)
            why = pg.inner_text('#htxSignal')
            check(f'{vn}/{theme}: coin page ({sym}) says Hold and why', 'Hold' in why and 'vs BTC −30 pts (30d), −40 pts (90d)' in why and 'Smart: not adding' in why, why)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            # strong: a coin that is beating BTC keeps Hold instead of Sell / Convert
            pg.evaluate("(()=>{portfolio.forEach(c=>{const id=c.cgId||SamsamCoins.CG_IDS[c.sym]; if(id) rsMap[id]={d30:10,d90:12,c30:10,c90:12}}); renderAll()})()")
            st = pg.evaluate(COUNT)
            check(f'{vn}/{theme}: coins ahead of BTC → no Sell / Convert ({cl} → {st})', cl['convert'] > 0 and st['convert'] == pg.evaluate("portfolio.filter(c=>!isSoldOut(c)&&!rsFor(c)&&signalInfo(c,{...signalRules(),smart:false}).action==='convert').length"), st)
            pg.evaluate("Samsam.setSignalRules(null)"); pg.wait_for_timeout(600)   # the sheet works with thresholds below your average (the defaults)
            pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(2500)
            cl = pg.evaluate(CLASSIC)
            # Signal Thresholds: the Smart switch + preview; off → classic, saved
            pg.evaluate("openSignalEdit()"); pg.wait_for_timeout(300)
            check(f'{vn}/{theme}: Signal Thresholds has Smart on', pg.is_checked('#sgSmart') and 'Smart keeps' in pg.inner_text('#sgPrev'), pg.inner_text('#sgPrev'))
            pg.locator('.sg-smart').first.screenshot(path=str(SH / f'smartsheet_{vn}_{theme}.png'))
            pg.uncheck('#sgSmart'); pg.wait_for_timeout(150)
            check(f'{vn}/{theme}: switching it off → the preview shows the classic counts', 'Smart keeps' not in pg.inner_text('#sgPrev') and f"— {cl['reinforce']} coins" in pg.inner_text('#sgPrev').replace('\n', ' '), pg.inner_text('#sgPrev'))
            pg.click('#sgSave'); pg.wait_for_timeout(1800)
            check(f'{vn}/{theme}: saved (signalSmart false) and the table is classic again', meta().get('signalSmart') is False and pg.evaluate(COUNT)['reinforce'] == cl['reinforce'] and not pg.evaluate("[...document.querySelectorAll('.action-badge.sig-smart')].some(e=>e.offsetParent)"), (meta().get('signalSmart'), pg.evaluate(COUNT)))
            # 🌙 Calm mode: off at first; on → a Reinforce on a coin down 5%+ in 7 days waits on Hold, with the reason
            pg.evaluate("(()=>{portfolio.forEach(c=>{const id=c.cgId||SamsamCoins.CG_IDS[c.sym]; if(id) rsMap[id]={d30:0,d90:0,c30:0,c90:0,c7:-12}}); renderAll()})()")
            pg.evaluate("Samsam.setSignalRules({reinforce:0, sell:-50})"); pg.wait_for_timeout(800)   # so that some coins are on Reinforce
            cl = pg.evaluate(CLASSIC)
            nod = pg.evaluate("portfolio.filter(c=>!isSoldOut(c)&&!rsFor(c)&&signalInfo(c,{...signalRules(),smart:false}).action==='reinforce').length")
            pg.evaluate("openSignalEdit()"); pg.wait_for_timeout(300)
            check(f'{vn}/{theme}: there are coins on Reinforce to try it on ({cl}, {nod} without 7-day data)', cl['reinforce'] > nod and cl['convert'] > 0, cl)
            check(f'{vn}/{theme}: Calm mode is off at first and the falling coins keep Reinforce', not pg.is_checked('#sgCalm') and 'Calm mode keeps' not in pg.inner_text('#sgPrev') and pg.evaluate(COUNT)['reinforce'] == cl['reinforce'], pg.inner_text('#sgPrev'))
            pg.check('#sgCalm'); pg.wait_for_timeout(150)
            check(f'{vn}/{theme}: Calm on → the preview says how many coins wait', f"Calm mode keeps {cl['reinforce'] - nod} coin" in pg.inner_text('#sgPrev').replace('\n', ' ') and f"— {nod} coins" in pg.inner_text('#sgPrev').replace('\n', ' '), pg.inner_text('#sgPrev'))
            pg.locator('.sg-smart').nth(1).screenshot(path=str(SH / f'calmsheet_{vn}_{theme}.png'))
            pg.click('#sgSave'); pg.wait_for_timeout(1800)
            tips = pg.evaluate("[...document.querySelectorAll('.action-badge.sig-smart')].filter(e=>e.offsetParent).map(e=>e.title)")
            now = pg.evaluate(COUNT)
            check(f'{vn}/{theme}: saved (signalCalm true): Reinforce waits, Sell / Convert unchanged ({cl} → {now})', meta().get('signalCalm') is True and now['reinforce'] == nod and now['convert'] == cl['convert'] and len(tips) > 0 and all('Calm mode: Hold instead of Reinforce' in t for t in tips), tips[:2])
            pg.evaluate("Samsam.setSignalCalm(false)"); pg.wait_for_timeout(800)
            check(f'{vn}/{theme}: Calm off again → Reinforce is back', meta().get('signalCalm') is False and pg.evaluate(COUNT)['reinforce'] == cl['reinforce'])
            pg.evaluate("(async()=>{await Samsam.setSignalSmart(true); await Samsam.setSignalRules(null)})()"); pg.wait_for_timeout(800)
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
