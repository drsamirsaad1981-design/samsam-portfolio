"""Market Hub: Home overview card → Market tab; 2x2 cards (mcap, Fear & Greed, Altcoin Season, Dominance);
Top 100 table with sparklines, sort, filter, search (+ any coin on CoinGecko), Watchlist synced to the cloud,
+ Add → Portfolio / Plan; 6-tab bottom bar; phone + desktop, light + dark; rate-limit fallback."""
import sys, pathlib, json, re, urllib.parse
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
shots = pathlib.Path(__file__).parent / 'shots'

def coin(i):
    if i == 0: return dict(id='bitcoin', symbol='btc', name='Bitcoin', ch30=5.0, price=100000.0)
    special = {1: ('ethereum', 'eth', 'Ethereum'), 2: ('tether', 'usdt', 'Tether'), 3: ('usd-coin', 'usdc', 'USDC'), 4: ('wrapped-bitcoin', 'wbtc', 'Wrapped Bitcoin'), 5: ('staked-ether', 'steth', 'Lido Staked Ether'), 6: ('solana', 'sol', 'Solana')}
    cid, sym, name = special.get(i, (f'coin{i}', f'c{i}', f'Coin {i}'))
    # alts 0..: every 3rd one beats BTC's +5% over 30d
    return dict(id=cid, symbol=sym, name=name, ch30=(12.0 if i % 3 == 0 else -3.0), price=round(2.0 + i * 0.5, 4))
TOP = [coin(i) for i in range(150)]
def mrow(c, rank):
    import math
    sp = [c['price'] * (1 + 0.03 * math.sin(k / 9 + rank)) for k in range(168)]
    ch24 = round(((rank * 7) % 11) - 5 + 0.25, 2)
    return {'id': c['id'], 'symbol': c['symbol'], 'name': c['name'], 'image': 'https://img.test/' + c['id'] + '.png', 'market_cap_rank': rank,
            'current_price': c['price'], 'market_cap': int(3e12 / rank), 'total_volume': 1e9, 'price_change_percentage_24h': ch24,
            'price_change_percentage_24h_in_currency': ch24, 'price_change_percentage_7d_in_currency': round(-ch24 * 2 + 1.5, 2), 'price_change_percentage_30d_in_currency': c['ch30'], 'sparkline_in_7d': {'price': sp},
            'high_24h': c['price'] * 1.02, 'low_24h': c['price'] * .98, 'last_updated': '2026-11-01T18:00:00Z'}
ROWS = [mrow(c, i + 1) for i, c in enumerate(TOP)]
VIS = [r for r in ROWS if r['id'] not in ('tether', 'usd-coin')][:100]   # Top 100 shown: no stablecoins
EXTRA = {'novax': {'id': 'novax', 'symbol': 'nvx', 'name': 'Nova X', 'ch30': 1.0, 'price': 0.12}}
state = {'rate': False, 'calls': 0}
def markets(route):
    url = urllib.parse.unquote(route.request.url); state['calls'] += 1
    if state['rate']: return route.fulfill(status=429, body='{}')
    m = re.search(r'ids=([^&]+)', url)
    if m:
        ids = m.group(1).split(',')
        out = [r for r in ROWS if r['id'] in ids] + [mrow(EXTRA[i], 900) for i in ids if i in EXTRA]
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(out))
    route.fulfill(status=200, content_type='application/json', body=json.dumps(ROWS))
def search(route):
    if state['rate']: return route.fulfill(status=429, body='{}')
    route.fulfill(status=200, content_type='application/json', body=json.dumps({'coins': [
        {'id': 'novax', 'symbol': 'NVX', 'name': 'Nova X', 'market_cap_rank': 120, 'thumb': 'https://img.test/kas.png', 'large': 'https://img.test/kas-l.png'},
        {'id': 'solana', 'symbol': 'SOL', 'name': 'Solana', 'market_cap_rank': 7, 'thumb': 'https://img.test/sol.png'}]}))
# expected Altcoin Season: alts = top-100 minus BTC/stable/wrapped/staked, first 50; beat if i%3==0
alts = [c for i, c in enumerate(TOP) if c['id'] not in ('bitcoin', 'tether', 'usd-coin', 'wrapped-bitcoin', 'staked-ether')][:50]
EXP_ALT = round(sum(1 for c in alts if c['ch30'] > 5) / 50 * 100)

def tap_links(fr, cid):
    x = fr.locator(f'#mkRows .mk-row[data-id={cid}] .mk-x')
    (x if x.is_visible() else fr.locator(f'#mkRows .mk-row[data-id={cid}] .mk-pc')).click()

with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1440, 'height': 900}))):
        for theme in (('light', 'dark') if vn == 'phone' else ('dark',)):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            ctx.route('https://api.coingecko.com/api/v3/coins/markets**', markets)
            ctx.route('https://api.coingecko.com/api/v3/search**', search)
            ctx.route('https://coincodex.com/api/**', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(
                [{'slug': 'coin-7-cc', 'symbol': 'C7', 'display_symbol': 'C7', 'name': 'Coin 7', 'market_cap_usd': 5}] if 'C7' in r.request.url or 'coin7' in r.request.url else [])))
            ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><circle cx="18" cy="18" r="18" fill="#888"/></svg>'))
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            n = f'{vn}/{theme}'
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            if pg.query_selector('#samsamImpBase'): pg.click('#samsamImpBase'); pg.wait_for_timeout(3000)
            pg.evaluate("Samsam.saveWatchlist([]); Samsam.saveAccumPlan(Samsam.getState().accumPlan.filter(e=>e.sym!=='NVX'))"); pg.wait_for_timeout(600)
            # ── Home: no market card any more — the market rides in the BTC ticker ──
            pg.wait_for_function("document.querySelectorAll('#btcTickerTrack .btc-ticker-group:first-child a.bt-mkt').length >= 4", timeout=8000)
            tk = pg.evaluate("[...document.querySelectorAll('#btcTickerTrack .btc-ticker-group:first-child a.bt-mkt')].map(a=>a.innerText.replace(/\\s+/g,' ').trim())")
            check(f'{n}: market card gone from Home', not pg.evaluate("document.getElementById('marketCard')"))
            check(f'{n}: ticker carries Market Cap / Fear & Greed / BTC Dominance / Explore (full names)', any('Market Cap $3.21T' in t and '+1.84%' in t for t in tk) and any('Fear & Greed 62' in t and 'Greed' in t for t in tk) and any('BTC Dominance 57.3%' in t for t in tk) and not any('High' in t for t in tk) and tk[-1] == 'Explore ↗', tk)
            mv = pg.locator('#moversCard').bounding_box(); head = pg.locator('#appHead').bounding_box()
            check(f'{n}: Today\'s movers now follow the header directly', mv and head and 0 <= mv['y'] - (head['y'] + head['height']) <= 24, (mv, head))
            tb = pg.evaluate("(()=>{const b=document.getElementById('btcTicker');return [b.classList.contains('static'), b.scrollHeight<=b.clientHeight+1]})()")
            check(f'{n}: ticker one line (still if it fits, otherwise scrolling)', tb[1], tb)
            pg.screenshot(path=str(shots / f'mkt_home_{vn}_{theme}.png'))
            # bottom bar: 6 tabs, labels readable
            bar = pg.evaluate("[...document.querySelectorAll('#cpBnav a')].map(a=>[a.dataset.k, a.querySelector('span').scrollWidth <= a.querySelector('span').clientWidth + 1])")
            check(f'{n}: bottom bar Portfolio · Plan · Market Hub', [b[0] for b in bar] == ['home', 'accumulation', 'market'], bar)
            check(f'{n}: every tab label fits (no "…")', all(b[1] for b in bar), bar)
            # ── open via the card ──
            pg.evaluate("(()=>{const b=document.getElementById('btcTicker');b.classList.add('static');})()")
            pg.locator('#btcTickerTrack .btc-ticker-group:first-child a.bt-mkt').last.click(); pg.wait_for_timeout(800)
            check(f'{n}: tapping the market part of the ticker opens the Market tab inside the app', pg.evaluate("cpShell.cur") == 'market' and pg.evaluate("location.hash") == '#market' and pg.evaluate("document.querySelector('#cpBnav a[data-k=market]').getAttribute('aria-current')") == 'page')
            fr = pg.frame(url=lambda u: 'market.html' in u)
            fr.wait_for_function("document.querySelectorAll('#mkRows .mk-row').length >= 100", timeout=10000)
            cards = fr.evaluate("""({mcap: mcapV.textContent, ch: mcapCh.textContent, chc: mcapCh.className, vol: volV.textContent, btc: liBtc.innerText, eth: liEth.innerText,
                fng: fngV.textContent, fl: fngL.textContent, kx: +fngKnob.getAttribute('cx'), ky: +fngKnob.getAttribute('cy'), prev: fngPrev.textContent, week: fngWeek.textContent,
                alt: altV.textContent, al: altL.textContent, an: altN.innerText, ab: altB.innerText, note: altNote.innerText,
                dom: [...document.querySelectorAll('#domLeg div')].map(d => [d.querySelector('span').textContent, d.querySelector('b').textContent]),
                ring: [...domBar.querySelectorAll('circle')].slice(1).map(c => c.getAttribute('stroke-dasharray').split(' ')[0])})""")
            check(f'{n}: Total Market Cap card: value, 24h pill, volume, BTC + ETH price lines', cards['mcap'] == '$3.21T' and '1.84%' in cards['ch'] and 'up' in cards['chc'] and cards['vol'] == '$112.00B' and '$100,000' in cards['btc'] and 'ETH' in cards['eth'] and '%' in cards['eth'], cards)
            import math as _m; th = _m.pi * (1 - 62 / 100)
            check(f'{n}: Fear & Greed half-circle gauge (62 Greed, knob at 62, yesterday 55)', cards['fng'] == '62' and cards['fl'] == 'Greed' and abs(cards['kx'] - (60 + 52 * _m.cos(th))) < .2 and abs(cards['ky'] - (60 - 52 * _m.sin(th))) < .2 and cards['prev'] == '55' and cards['week'], cards)
            check(f'{n}: Altcoin Season (30d fallback while 90d warms up) = {EXP_ALT}', cards['alt'].startswith(str(EXP_ALT)) and cards['al'] and 'Beating BTC' in cards['an'] and ' of ' in cards['an'] and 'BTC (30 days)' in cards['ab'] and 'last 30 days' in cards['note'], cards)
            check(f'{n}: Dominance donut BTC | ETH | USDT | the next 3 coins | Others, adding up to 100%', [d[1] for d in cards['dom'][:3]] == ['57.30%', '12.10%', '4.60%'] and [d[0] for d in cards['dom'][:3]] == ['BTC', 'ETH', 'USDT'] and 5 <= len(cards['dom']) <= 7 and cards['dom'][-1][0] == 'Others' and all(d[0] not in ('BTC', 'ETH', 'USDT', 'USDC', 'WBTC', 'STETH') for d in cards['dom'][3:-1]) and abs(sum(float(d[1][:-1]) for d in cards['dom']) - 100) < 0.05 and len(cards['ring']) == len(cards['dom']) and [round(float(x)) for x in cards['ring'][:3]] == [57, 12, 4], cards)
            eq = fr.evaluate("[...document.querySelectorAll('.mk-card')].map(c=>Math.round(c.getBoundingClientRect().height))")
            check(f'{n}: the four cards line up (same height per row)', eq[0] == eq[1] and eq[2] == eq[3], eq)
            inside = fr.evaluate("[...document.querySelectorAll('.mk-card')].every(c=>{const r=c.getBoundingClientRect();return [...c.querySelectorAll('*')].every(e=>{const b=e.getBoundingClientRect();return !b.width||(b.left>=r.left-1&&b.right<=r.right+1)})})")
            check(f'{n}: nothing spills out of the cards', inside)
            check(f'{n}: stablecoins / wrapped / staked not counted', fr.evaluate("['tether','usd-coin','wrapped-bitcoin','staked-ether','bitcoin'].every(id=>SamsamMarket.isExcluded(topRows.find(r=>r.id===id))) && !SamsamMarket.isExcluded(topRows.find(r=>r.id==='solana')) && !SamsamMarket.isExcluded(topRows.find(r=>r.id==='ethereum'))"))
            # ── table ──
            rows = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].slice(0,3).map(r=>({id:r.dataset.id, logo: (r.querySelector('.mk-asset img')||{}).width, spark: !!r.querySelector('.mk-sp svg path'), txt: r.innerText}))")
            check(f'{n}: Top 100 in rank order with 36px logo + sparkline (no stablecoins)', [r['id'] for r in rows] == ['bitcoin', 'ethereum', 'wrapped-bitcoin'] and all(r['logo'] == (34 if vn == 'phone' else 36) and r['spark'] for r in rows), rows)
            st = fr.evaluate("[document.querySelectorAll('#mkRows .mk-row').length, !!document.querySelector('#mkRows .mk-row[data-id=tether]'), !!document.querySelector('#mkRows .mk-row[data-id=usd-coin]'), document.querySelector('#mkRows .mk-row[data-id=wrapped-bitcoin] .mk-r2, #mkRows .mk-row[data-id=wrapped-bitcoin] .mk-rank').innerText, mkStable.innerText]")
            check(f'{n}: stablecoins hidden, still 100 coins, world ranks kept (#5 after #2), a note says so', st[0] == 100 and not st[1] and not st[2] and st[3].replace('#', '') == '5' and 'Stablecoins hidden' in st[4] and 'USDT' in st[4] and 'Show' in st[4], st)
            fr.click('#mkStable button'); pg.wait_for_timeout(200)
            s2 = fr.evaluate("[!!document.querySelector('#mkRows .mk-row[data-id=tether]'), document.querySelectorAll('#mkRows .mk-row').length, mkStable.innerText, localStorage.getItem('samsam_mkt_stable')]")
            check(f'{n}: "Show" brings them back (remembered), "Hide" hides again', s2[0] and s2[1] == 100 and 'Hide' in s2[2] and s2[3] == '1', s2)
            fr.click('#mkStable button'); pg.wait_for_timeout(200)
            check(f'{n}: BTC row shows price, market cap and "In portfolio"', '$100,000' in rows[0]['txt'] and '$3.00T' in rows[0]['txt'] and fr.evaluate("!!document.querySelector('#mkRows .mk-row[data-id=bitcoin] .mk-own[title=\"In your portfolio\"]')"), rows[0]['txt'])
            # ── coin links: CoinMarketCap like every other page ──
            hrefs = fr.evaluate("['bitcoin','solana','coin7'].map(id=>document.querySelector('#mkRows .mk-row[data-id='+id+'] .mk-asset').href)")
            check(f'{n}: logo/name open CoinMarketCap', hrefs == ['https://coinmarketcap.com/currencies/bitcoin/', 'https://coinmarketcap.com/currencies/solana/', 'https://coinmarketcap.com/currencies/coin-7/'], hrefs)
            # ── ⌄ under + : Liq.Map / Prediction / CMC (like Transactions) ──
            tap_links(fr, 'bitcoin'); pg.wait_for_timeout(300)
            lk = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-links a')].map(a=>[a.innerText.trim(), a.href, a.target])")
            check(f'{n}: arrow opens Liq.Map / Prediction / CMC for that coin', [l[0] for l in lk] == ['Liq.Map', 'Prediction', 'CMC'] and lk[0][1] == 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=BTC' and lk[1][1] == 'https://coincodex.com/crypto/bitcoin/price-prediction/' and lk[2][1] == 'https://coinmarketcap.com/currencies/bitcoin/' and all(l[2] == '_blank' for l in lk), lk)
            if vn == 'desktop':
                al = fr.evaluate("(()=>{const r=document.querySelector('#mkRows .mk-row[data-id=bitcoin]'),L=[...document.querySelectorAll('#mkRows .mk-links a')].map(a=>a.getBoundingClientRect()),as=r.querySelector('.mk-asset').getBoundingClientRect(),sp=r.querySelector('.mk-sp').getBoundingClientRect(),ad=r.querySelector('.mk-add').getBoundingClientRect(),x=r.querySelector('.mk-x').getBoundingClientRect(),act=r.querySelector('.mk-act').getBoundingClientRect();return {l:Math.round(L[0].left-as.left), r:Math.round(L[2].right-sp.right), w:L.map(b=>Math.round(b.width)), cen:Math.round(((ad.left+x.right)/2)-(act.left+act.width/2))}})()")
                check(f'{n}: links line up with the columns (coin → 7d), equal widths; buttons centred in their column', abs(al['l']) <= 1 and abs(al['r']) <= 1 and max(al['w']) - min(al['w']) <= 1 and abs(al['cen']) <= 1, al)
            check(f'{n}: links sit right under the BTC row, arrow turned', fr.evaluate("document.querySelector('#mkRows .mk-row[data-id=bitcoin]').nextElementSibling.classList.contains('mk-links') && document.querySelector('#mkRows .mk-row[data-id=bitcoin] '+(innerWidth<760?'.mk-pc':'.mk-x')).getAttribute('aria-expanded')==='true'"))
            lb = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-links a')].map(a=>{const b=a.getBoundingClientRect();return [Math.round(b.top), b.right<=innerWidth+1, a.scrollWidth<=a.clientWidth+1]})")
            check(f'{n}: three links on one line, fit the screen', len(set(x[0] for x in lb)) == 1 and all(x[1] and x[2] for x in lb), lb)
            fr.evaluate("document.querySelector('#mkRows .mk-row[data-id=bitcoin]').scrollIntoView({block:'center'})"); pg.wait_for_timeout(250)
            pg.screenshot(path=str(shots / f'mkt_links_{vn}_{theme}.png'))
            tap_links(fr, 'coin7'); pg.wait_for_timeout(900)
            pr = fr.evaluate("document.querySelector('#mkRows .mk-links .l-pred').href")
            check(f'{n}: Prediction for a coin you don\'t hold → its CoinCodex page (looked up), not Google', pr == 'https://coincodex.com/crypto/coin-7-cc/price-prediction/', pr)
            tap_links(fr, 'coin7'); pg.wait_for_timeout(200)
            tap_links(fr, 'ethereum'); pg.wait_for_timeout(250)
            check(f'{n}: one row open at a time', fr.evaluate("document.querySelectorAll('#mkRows .mk-links').length") == 1 and fr.evaluate("document.querySelector('#mkRows .mk-row[data-id=ethereum]').nextElementSibling.classList.contains('mk-links')"))
            tap_links(fr, 'ethereum'); pg.wait_for_timeout(200)
            check(f'{n}: tap again closes it', fr.evaluate("document.querySelectorAll('#mkRows .mk-links').length") == 0)
            fr.evaluate("scrollTo(0,0)")
            # ── layout: # header, clean labels, whole market cap, round ⌄ centred under + ──
            hd = fr.evaluate("[...document.querySelectorAll('.mk-head > *')].filter(e=>getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden').sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left).map(e=>e.innerText.trim()).filter(Boolean)")
            if vn == 'phone':
                check(f'{n}: header reads # · Market Cap · Price / 24h % (no 7d column)', hd == ['#', 'Market Cap', 'Price / 24h %'], hd)
                d1 = fr.evaluate("(()=>{const c=topRows.find(r=>r.id==='ethereum');return [SamsamMarket.day(c).length, c.spark24[c.spark24.length-1]===c.spark[c.spark.length-1], document.querySelector('#mkRows .mk-row[data-id=ethereum] .mk-pc2').title]})()")
                check(f'{n}: phone chart = last 24 hours (hourly), same period as the %', d1[0] == 25 and d1[1] and d1[2] == 'Last 24 hours', d1)
                fr.evaluate("setSort('ch24')"); fr.locator('.mk-head .c-hash').click(); pg.wait_for_timeout(150)
                r1 = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].slice(0,3).map(r=>r.dataset.id)"); a1 = fr.evaluate("document.querySelector('.mk-head .c-hash').getAttribute('aria-sort')")
                fr.locator('.mk-head .c-hash').click(); pg.wait_for_timeout(150)
                r2 = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>topRows.find(x=>x.id===r.dataset.id).rank)")
                fr.locator('.mk-head .c-hash').click(); pg.wait_for_timeout(150)
                # 24h ⇄ 7d for the whole list
                fr.click('.mk-per button[data-p="7d"]'); pg.wait_for_timeout(200)
                eth = next(r for r in ROWS if r['id'] == 'ethereum')
                pv = fr.evaluate("(()=>{const r=document.querySelector('#mkRows .mk-row[data-id=ethereum] .mk-pc2');return [r.title, r.querySelector('span').innerText, r.querySelectorAll('svg path')[1].getAttribute('d').split('L').length, perL.textContent, localStorage.getItem('samsam_mkt_per')]})()")
                check(f'{n}: switch to 7d → chart + % show 7 days for the whole list (remembered)', pv[0] == 'Last 7 days' and pv[1] == f"{eth['price_change_percentage_7d_in_currency']:+.2f}%" and pv[2] > 30 and pv[3] == '7d %' and pv[4] == '7d', pv)
                fr.evaluate("setFilter('gain')"); g7 = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>topRows.find(x=>x.id===r.dataset.id).ch7)"); fr.evaluate("setFilter('all')")
                check(f'{n}: Gainers follow the chosen period (7d)', g7 and all(v > 0 for v in g7), len(g7))
                tap_links(fr, 'ethereum'); pg.wait_for_timeout(200)
                ls = fr.inner_text('#mkRows .mk-lsum'); tap_links(fr, 'ethereum')
                check(f'{n}: open row shows both: 24h … · 7d …', '24h' in ls and '7d' in ls and '%' in ls, ls)
                fr.click('.mk-per button[data-p="24h"]'); pg.wait_for_timeout(150)
                check(f'{n}: back to 24h', fr.evaluate("document.querySelector('#mkRows .mk-row[data-id=ethereum] .mk-pc2').title") == 'Last 24 hours')
                tl = fr.evaluate("(()=>{const t=document.querySelector('.mk-tools').getBoundingClientRect();return [...document.querySelectorAll('.mk-tools > *')].every(e=>{const b=e.getBoundingClientRect();return b.right<=t.right+1})})()")
                check(f'{n}: filter row fits (All · Gainers · Losers · 24h|7d · Add Custom Coin)', tl)
                check(f'{n}: tapping # sorts by rank (again = reverse)', r1 == ['bitcoin', 'ethereum', 'wrapped-bitcoin'] and a1 == 'ascending' and r2[:2] == [102, 101], (r1, a1, r2[:3]))
                sp = fr.evaluate("(()=>{const r=document.querySelector('#mkRows .mk-row[data-id=ethereum]'),s=r.querySelector('.mk-pc2 svg'),p=r.querySelector('.mk-pc2 span'),b=r.querySelector('.mk-pc b');if(!s)return null;const a=s.getBoundingClientRect(),c=p.getBoundingClientRect(),d=b.getBoundingClientRect();return {w:Math.round(a.width),h:Math.round(a.height),left:a.right<=c.left,under:a.top>=d.bottom-1,col:getComputedStyle(r.querySelector('.mk-sp')).display}})()")
                check(f'{n}: 7d chart sits with the price, left of the 24h %', sp and sp['w'] == 46 and sp['h'] == 20 and sp['left'] and sp['under'] and sp['col'] == 'none', sp)
                mc = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].slice(0,12).map(r=>{const s=r.querySelector('.mk-names small .mc'),nm=r.querySelector('.mk-names small .nm');const nv=getComputedStyle(nm).display!=='none';return [s.innerText, s.scrollWidth<=s.clientWidth+1, getComputedStyle(s).fontSize, nv?nm.innerText:'', !nv||nm.scrollWidth<=nm.clientWidth+1]})")
                check(f'{n}: market cap shown whole (11px, no "…")', all(m[1] and m[2] == '11px' and m[0].startswith('$') for m in mc), mc[:4])
                check(f'{n}: coin name under the market cap, only when whole', sum(1 for m in mc if m[3]) >= 8 and all(m[4] for m in mc) and mc[1][3] == 'Ethereum', [m[3] for m in mc])
                hx = fr.evaluate("(()=>{const r=document.querySelector('#mkRows .mk-row[data-id=ethereum]'),a=r.querySelector('.mk-add').getBoundingClientRect(),l=document.querySelector('.mk-list').getBoundingClientRect(),as=r.querySelector('.mk-asset').getBoundingClientRect();return {x:getComputedStyle(r.querySelector('.mk-x')).display, caret:!!r.querySelector('.mk-pc .mk-caret svg'), edge:[Math.round(l.left),Math.round(innerWidth-l.right)], asset:Math.round(as.width), addR:Math.round(innerWidth-a.right)}})()")
                check(f'{n}: phone list edge to edge (6px), one + per row, ⌄ by the %, coin column ≥ 140px', hx['x'] == 'none' and hx['caret'] and hx['edge'] == [6, 6] and hx['asset'] >= 140 and hx['addR'] <= 14, hx)
                pd = fr.evaluate("getComputedStyle(document.querySelector('#mkRows .mk-row')).paddingTop")
                check(f'{n}: rows have 11px breathing room', pd == '11px', pd)
            else:
                check(f'{n}: computer header: # · Asset (Price) · 24h % · 7d % · 7d', hd == ['#', 'Asset', 'Price', '24h %', '7d %', '7d'], hd)
                lay = fr.evaluate("""(()=>{const r=document.querySelector('#mkRows .mk-row[data-id=ethereum]'),q=s=>r.querySelector(s).getBoundingClientRect(),h=s=>document.querySelector('.mk-head '+s).getBoundingClientRect();
                  const a=q('.mk-asset'),ap=q('.mk-ap'),c4=q('.mk-ch'),c7=q('.mk-ch7'),sp=q('.mk-sp'),act=q('.mk-act');
                  return {apIn: ap.left>=a.left && ap.right<=a.right+1, apRight: Math.round(a.right-ap.right), ap: r.querySelector('.mk-ap').innerText, c24: r.querySelector('.mk-ch').innerText, c7: r.querySelector('.mk-ch7').innerText,
                    order: c4.left<c7.left && c7.right<sp.left && sp.right<act.left, hdr: [Math.round(h('.c-ch').right-c4.right), Math.round(h('.c-ch7').right-c7.right), Math.round(h('.c-price').right-ap.right)],
                    w: [Math.round(a.width), Math.round(c4.width), Math.round(c7.width), Math.round(sp.width)]}})()""")
                eth = next(r for r in ROWS if r['id'] == 'ethereum')
                check(f'{n}: price sits inside the Asset column (right side), headers line up', lay['apIn'] and lay['apRight'] <= 1 and lay['ap'] == '$2.5000' and all(abs(x) <= 1 for x in lay['hdr']), lay)
                check(f'{n}: 24h % and 7d % columns, then the 7d chart', lay['order'] and lay['c24'] == f"{eth['price_change_percentage_24h']:+.2f}%" and lay['c7'] == f"{eth['price_change_percentage_7d_in_currency']:+.2f}%" and abs(lay['w'][1] - lay['w'][2]) <= 1, lay)
                fr.evaluate("setSort('ch7')"); s7 = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].slice(0,5).map(r=>topRows.find(x=>x.id===r.dataset.id).ch7)")
                check(f'{n}: sort by 7d %', s7 == sorted(s7, reverse=True), s7); fr.evaluate("setSort('rank'); setSort('rank'); setSort('rank')")
            ov = fr.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")
            check(f'{n}: no horizontal scroll', ov)
            fr.evaluate("document.querySelector('.mk-list').scrollIntoView()"); pg.wait_for_timeout(300)
            pg.screenshot(path=str(shots / f'mkt_list_{vn}_{theme}.png'))
            fr.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(200)
            pg.screenshot(path=str(shots / f'mkt_top_{vn}_{theme}.png'))
            # sort + filter
            fr.evaluate("setSort('ch24')"); top3 = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].slice(0,3).map(r=>topRows.find(x=>x.id===r.dataset.id).ch24)")
            check(f'{n}: sort by 24h (biggest gain first)', top3 == sorted(top3, reverse=True) and top3[0] == max(r['price_change_percentage_24h'] for r in VIS), top3)
            fr.evaluate("setSort('rank'); setSort('rank'); setSort('rank')")
            fr.evaluate("setFilter('gain')"); g = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>topRows.find(x=>x.id===r.dataset.id).ch24)")
            check(f'{n}: Gainers filter', g and all(v > 0 for v in g) and len(g) == sum(1 for r in VIS if r['price_change_percentage_24h'] > 0), len(g))
            fr.evaluate("setFilter('lose')"); l = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>topRows.find(x=>x.id===r.dataset.id).ch24)")
            check(f'{n}: Losers filter', l and all(v < 0 for v in l), len(l))
            fr.evaluate("setFilter('all')")
            # ── search: list + any coin on CoinGecko ──
            fr.fill('#mkSearch', 'nova'); pg.wait_for_timeout(1400)
            more = fr.evaluate("[...document.querySelectorAll('#mkMore .mk-row')].map(r=>r.dataset.id)")
            check(f'{n}: search finds coins outside the Top 100 on CoinGecko', more == ['novax'], more)
            fr.locator('#mkMore .mk-row[data-id=novax] .mk-star').click(); pg.wait_for_timeout(900)
            check(f'{n}: star → Nova X in the Watchlist (saved to the cloud)', fr.evaluate("Samsam.getWatchlist().map(w=>w.id)") == ['novax'] and fr.inner_text('#watchN') == '1', fr.evaluate("Samsam.getWatchlist()"))
            fr.fill('#mkSearch', 'Solana'); pg.wait_for_timeout(900)
            check(f'{n}: search filters the list (Solana)', fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>r.dataset.id)") == ['solana'] and fr.evaluate("document.querySelectorAll('#mkMore .mk-row').length") == 0)
            fr.locator('#mkRows .mk-row[data-id=solana] .mk-star').click(); pg.wait_for_timeout(800)
            fr.fill('#mkSearch', ''); fr.evaluate("onSearch()")
            fr.click('#tabWatch'); pg.wait_for_timeout(900)
            wl = fr.evaluate("[...document.querySelectorAll('#mkRows .mk-row')].map(r=>[r.dataset.id, r.innerText.includes('$')])")
            check(f'{n}: Watchlist tab shows the followed coins with live prices', sorted(w[0] for w in wl) == ['novax', 'solana'] and all(w[1] for w in wl), wl)
            check(f'{n}: Watchlist shared with the main page (same cloud)', sorted(w['id'] for w in pg.evaluate("Samsam.getWatchlist()")) == ['novax', 'solana'])
            pg.screenshot(path=str(shots / f'mkt_watch_{vn}_{theme}.png'))
            # ── + Add → Plan ──
            fr.locator('#mkRows .mk-row[data-id=novax] .mk-add').click(); pg.wait_for_timeout(300)
            items = fr.evaluate("[...document.querySelectorAll('.cpm .cpm-item')].map(b=>b.textContent.trim())")
            check(f'{n}: + Add menu: Portfolio / Plan / Watchlist only (no CMC link)', items == ['Add to Portfolio', 'Add to Plan', 'Remove from Watchlist'] and not fr.evaluate("document.querySelector('.cpm a')"), items)
            pg.screenshot(path=str(shots / f'mkt_menu_{vn}_{theme}.png'))
            fr.locator(".cpm .cpm-item:has-text('Add to Plan')").click(); pg.wait_for_timeout(900)
            plan = pg.evaluate("Samsam.getState().accumPlan.map(e=>[e.sym,e.cgId])")
            check(f'{n}: Add to Plan → NVX in the Accumulation Plan', ['NVX', 'novax'] in plan, plan)
            check(f'{n}: toast confirms with "Set target"', 'added to your Plan' in fr.inner_text('#mkToast') and 'Set target' in fr.inner_text('#mkToast'))
            check(f'{n}: row now says "In plan"', fr.evaluate("!!document.querySelector('#mkRows .mk-row[data-id=novax] .mk-own.plan')"))
            # ── + Add → Portfolio opens the add-coin window prefilled ──
            fr.locator('#mkRows .mk-row[data-id=novax] .mk-add').click(); pg.wait_for_timeout(300)
            fr.locator(".cpm .cpm-item:has-text('Add to Portfolio')").click(); pg.wait_for_timeout(700)
            check(f'{n}: Add to Portfolio opens Add Coin, linked to Nova X', fr.evaluate("getComputedStyle(document.getElementById('addCoinModal')).display") != 'none' and fr.input_value('#acSym') == 'NVX' and fr.input_value('#acCgId') == 'novax')
            check(f'{n}: AI button steps away while the window is open', pg.evaluate("document.getElementById('cpAiFab').classList.contains('under')"))
            fr.evaluate("closeAddCoin()"); pg.wait_for_timeout(300)
            # held coin → Buy more
            fr.click('#tabTop'); pg.wait_for_timeout(300)
            fr.locator('#mkRows .mk-row[data-id=bitcoin] .mk-add').click(); pg.wait_for_timeout(300)
            check(f'{n}: coin you own → "Buy more BTC"', 'Buy more BTC' in fr.evaluate("document.querySelector('.cpm').innerText"))
            fr.evaluate("CPMenu.close()")
            # ── reload: watchlist persisted ──
            pg.reload(); S.wait_ready(pg); pg.wait_for_timeout(1500)
            check(f'{n}: Watchlist survives a reload', sorted(w['id'] for w in pg.evaluate("Samsam.getWatchlist()")) == ['novax', 'solana'])
            # ── rate limit: last numbers stay, a calm note shows ──
            pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(600)
            fr = pg.frame(url=lambda u: 'market.html' in u); fr.wait_for_function("document.querySelectorAll('#mkRows .mk-row').length >= 100", timeout=10000)
            state['rate'] = True; fr.evaluate("refreshAll(true)"); pg.wait_for_timeout(1200)
            msg = fr.inner_text('#mkMsg'); cl = fr.evaluate("mkMsg.className")
            check(f'{n}: CoinGecko limit → keeps the last numbers, calm short "Saved · …" with an amber dot (no error)', fr.evaluate("document.querySelectorAll('#mkRows .mk-row').length") >= 100 and msg.startswith('Saved · ') and fr.evaluate("mkMsg.querySelector('.ss-live').dataset.state") == 'loading' and 'warn' not in cl and 'error' not in msg.lower(), (msg, cl))
            c0 = state['calls']; fr.evaluate("refreshAll(true)"); pg.wait_for_timeout(800)
            check(f'{n}: then waits before asking CoinGecko again (cool-down)', state['calls'] == c0, (c0, state['calls']))
            fr.fill('#mkSearch', 'skr'); pg.wait_for_timeout(1200)
            sm = fr.inner_text('#mkMore')
            check(f'{n}: busy search says so (not "no coin")', 'busy' in sm and 'try again' in sm, sm)
            fr.fill('#mkSearch', ''); fr.evaluate("onSearch()")
            state['rate'] = False
            check(f'{n}: no JS errors', not errs, errs[:3]); ctx.close()
    # ── GitHub snapshot: first open, CoinGecko refusing everything ──
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx)
    snap = {'updated': '2026-11-01T17:40:00Z', 'parts': {}, 'global': {'mcap': 2.6e12, 'vol': 9.237e10, 'mcapCh24': -3.57, 'dom': {'btc': 60.0, 'eth': 10.6, 'usdt': 6.9}, 'coins': 17000},
            'fng': {'value': 34, 'label': 'Fear', 'prev': 30, 'week': 41}, 'alt': {'value': 63, 'label': 'Leaning Altcoins', 'beat': 54, 'n': 86, 'btc90': -12.4, 'period': '90d', 'ready': True, 'have': 86}, 'top': [dict(id=r['id'], sym=r['symbol'].upper(), name=r['name'], img=r['image'], rank=r['market_cap_rank'], price=r['current_price'], mcap=r['market_cap'], vol=1e9, ch24=r['price_change_percentage_24h'], ch30=r['price_change_percentage_30d_in_currency'], spark=[1, 2, 3]) for r in ROWS]}
    import datetime; snap['updated'] = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=12)).strftime('%Y-%m-%dT%H:%M:%SZ')
    seen = []
    ctx.route('**/prices/m/market.json', lambda r: (seen.append(1), r.fulfill(status=200, content_type='application/json', body=json.dumps(snap))))
    ctx.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, body='{}'))
    ctx.route('https://api.alternative.me/**', lambda r: r.abort())
    ctx.route('https://img.test/**', lambda r: r.fulfill(status=200, content_type='image/svg+xml', body='<svg xmlns="http://www.w3.org/2000/svg"/>'))
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/market.html'); pg.wait_for_function("document.querySelectorAll('#mkRows .mk-row').length >= 100", timeout=10000); pg.wait_for_timeout(800)
    v = pg.evaluate("[mcapV.textContent, fngV.textContent, document.querySelector('#domLeg b').textContent, mkMsg.innerText, mkMsg.className]")
    check('snapshot: first open with CoinGecko busy → numbers from GitHub', seen and v[0] == '$2.60T' and v[1].startswith('34') and v[2] == '60.00%', v)
    check('snapshot: says when (Saved · 12 min ago), no error, no Refresh button', '12 min ago' in v[3] and not pg.query_selector('#mkRefresh') and 'warn' not in v[4], v[3:])
    al = pg.evaluate("[altV.textContent, altL.textContent, altN.innerText, altB.innerText, fngWeek.textContent, altNote.innerText, document.querySelector('.mk-src').innerText]")
    check('Altcoin Season = the CMC way from GitHub (top 100 · 90d)', al[0].startswith('63') and al[1] == 'Leaning Altcoins' and '54 of 86' in al[2] and 'BTC (90 days)' in al[3] and '-12.40%' in al[3] and al[4] == '41' and al[5] == 'Share of the top 100 coins that beat BTC over the last 90 days. Altcoin Season starts at 75.' and 'top 100 coins' in al[6] and '90 days' in al[6] and '30 days' not in al[6], al)
    pg.screenshot(path=str(shots / 'mkt_snapshot_phone.png'))
    pg.goto(S.SITE + '/index.html'); pg.wait_for_timeout(2500)
    tk2 = pg.evaluate("[...document.querySelectorAll('#btcTickerTrack a.bt-mkt')].map(a=>a.innerText).join(' | ')")
    check('snapshot: Home ticker fills from it too (incl. Altseason 63)', '$2.60T' in tk2 and 'Altcoin Season' in tk2 and '63/100' in tk2, tk2)
    check('snapshot: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
