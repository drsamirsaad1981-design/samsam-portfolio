"""Stablecoin Supply on the Market Hub (samsam-stables.js) — the snapshot's `stables` part (tools/update-macro.mjs, from
DefiLlama), read through samsam-core.js → stablesNow.
  · In Market Pulse, under ETF Flows and above BTC Funding; hidden with no part or with one that has grown old.
  · Closed: the total, 30 small daily bars (green above the line when coins were issued, red under it when redeemed, a
    flat day neutral), the net change of 7 and 30 days. Open: the total and its day, a day / 7 / 30 days / a year, the
    same days larger (one picture at a time), the biggest coins FROM THE DATA with share and month — a coin that was not
    listed a month ago reads "new".
  · The ⓘ: counted in coins, not the same as USDT dominance, and "What was measured" with its limits in the same lines.
  · Arabic: every number, percent, date and coin symbol is its own left-to-right piece; the bars still run oldest →
    newest from the left.
  · The Pi Cycle + MVRV card's bar: 8 px, rounded, a white dot with a dark ring, one smooth blend (no segments), and the
    Pi Cycle's two averages in dollars.
The fixtures are macro_app_test.py's own (one place for the snapshot's made-up parts)."""
import sys, pathlib, json, datetime, math
HERE = pathlib.Path(__file__).parent
exec((HERE / 'macro_app_test.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0].split('res = []')[1])   # RB, mvrv(), dxy(), funding(), snap(), clean, PROFIT_LOSS
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(HERE)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
# 30 daily changes, oldest first (millions of coins): 22 down, 7 up, one flat
CH = [-900, -1610, -400, 250, -700, -558, -1200, 0, -300, 120, -820, -640, -510, -990, 310, -450, -760, -1300, -220, 90, -600, -480, -350, 150, -410, 60, -280, 200, -120, -500]
TOTAL = 281_790_000_000
def stables(back=0, top=True):
    tot = [TOTAL]
    for c in reversed(CH): tot.append(tot[-1] - c * 10**6)
    tot.reverse()
    T = [['USDT', 'Tether', 173.51e9, 180.83e9], ['USDC', 'USD Coin', 69.38e9, 71.39e9], ['USDe', 'Ethena USDe', 4.91e9, 4.53e9], ['USDX', 'A coin listed overnight', 4.2e9, None], ['DAI', 'Dai', 3.72e9, 4.746e9],
         ['USDS', 'Sky Dollar', 3.12e9, 3.12e9], ['RLUSD', 'Ripple USD', 2.82e9, 2.602e9], ['USD1', 'World Liberty USD', 2.1e9, 2.0e9]]
    return {'v': 1, 'day': (today - datetime.timedelta(days=back)).isoformat(), 'total': TOTAL, 'tot': tot, 'y1': 301_180_000_000,
            'top': [{'sym': s, 'name': n, 'circ': round(c), 'm30': round(m) if m else None, 'price': 1.0} for s, n, c, m in T] if top else [], 'n': 357 if top else None, 'src': 'DefiLlama', 'at': now().isoformat()}
D7, D30 = sum(CH[-7:]) * 10**6, sum(CH) * 10**6
def usd(v): a = abs(v); return ('+' if v > 0 else '−' if v < 0 else '') + ('$%.2fB' % (a / 1e9) if a >= 1e9 else '$%.0fM' % (a / 1e6) if a >= 1e8 else '$%.1fM' % (a / 1e6))
ORDER = "[...document.querySelectorAll('#secPulseBody > section')].filter(c=>!c.hidden).map(c=>c.id||c.className.split(' ')[0])"
BARS = "(id)=>{const w=document.getElementById(id);if(!w)return null;const R=w.getBoundingClientRect(),z=w.querySelector('.z').getBoundingClientRect();return {h:Math.round(R.height),dir:getComputedStyle(w).direction,zero:z.top-R.top,bars:[...w.querySelectorAll('.b')].map(b=>{const i=b.querySelector('i'),r=i.getBoundingClientRect();return [b.dataset.d,b.dataset.s,getComputedStyle(i).backgroundColor,+(r.top-R.top).toFixed(1),+(r.bottom-R.top).toFixed(1),+r.left.toFixed(1)]})}}"
TOK = "(()=>{const s=getComputedStyle(document.documentElement),p=document.createElement('i');document.body.appendChild(p);const c=v=>{p.style.color=v;return getComputedStyle(p).color};const o={green:c(s.getPropertyValue('--green')),red:c(s.getPropertyValue('--red'))};p.remove();return o})()"
LOOSE = "(sel)=>{const c=document.querySelector(sel);if(!c)return null;const w=document.createTreeWalker(c,NodeFilter.SHOW_TEXT),out=[];for(let n=w.nextNode();n;n=w.nextNode())if(!n.parentElement.closest('bdi')&&/[\\dA-Za-z$%]/.test(n.textContent))out.push(n.textContent.trim().slice(0,40));return out}"
TXT = "(id)=>{const e=document.getElementById(id);return e?e.innerText.replace(/[\\u2066-\\u2069\\u200e\\u200f]/g,'').replace(/\\s+/g,' ').trim():null}"
def bars_ok(b, tok, n=30):
    if not b or len(b['bars']) != n or b['dir'] != 'ltr': return False
    want = ['in' if c > 0 else 'out' if c < 0 else 'flat' for c in CH[-n:]]
    days = [(today - datetime.timedelta(days=n - 1 - i)).isoformat() for i in range(n)]
    xs = [x[5] for x in b['bars']]
    return ([x[1] for x in b['bars']] == want and [x[0] for x in b['bars']] == days and xs == sorted(xs)
            and all((x[2] == tok['green'] and x[4] <= b['zero'] + 1) if x[1] == 'in' else (x[2] == tok['red'] and x[3] >= b['zero'] - 1) if x[1] == 'out' else x[2] not in (tok['green'], tok['red']) for x in b['bars'])
            and 0 < b['zero'] < b['h'])
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 360, 'height': 800}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        rbp = json.loads(json.dumps(RB)); rbp['pi']['hist'] = {'from': '2012-01-01', 'days': 5440, 'under': 21.4, 'lo': [38.2, '2015-08-25'], 'hi': [122.8, '2013-06-10']}
        def snp(**k): s = snap(**k); s['rainbow'] = rbp; return s
        def mvh(): m = mvrv(); m['hist'] = {'from': '2012-01-01', 'days': 5440, 'under': 17.6, 'lo': [0.3929, '2015-01-14'], 'hi': [5.8841, '2013-11-18']}; return m
        cur = {'s': snp(mvrv=mvh(), dxy=dxy(), funding=funding(), stables=stables())}
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(cur['s'])))
        ctx.route('**/prices/m/rainbow.json', lambda r: r.fulfill(status=404, body='{}'))
        ctx.route('**/prices/m/etf.json', lambda r: r.fulfill(status=200, content_type='application/json', body=(HERE / 'etf_fixture.json').read_text()))
        ctx.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        def ready():
            if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
            pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000)
        def hub():
            pg.goto('about:blank'); pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(600); ready(); pg.wait_for_function("!document.getElementById('fundCard').hidden", timeout=15000); pg.wait_for_timeout(900)
        pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(600); ready()
        pg.evaluate("try{Object.keys(localStorage).filter(k=>/^samsam_mkt_/.test(k)).forEach(k=>localStorage.removeItem(k))}catch(e){}"); hub()
        tok = pg.evaluate(TOK)
        # ── where it is, closed ──
        o = pg.evaluate(ORDER)
        check(f'{name}: Market Pulse — the four cards, ETF Flows, Stablecoin Supply, BTC Funding', o == ['mk-grid', 'etfCard', 'stableCard', 'fundCard'], o)
        core = pg.evaluate("(()=>{const s=Samsam.core.stablesNow(%s,Date.now());return s&&{total:s.total,d1:s.d1,d7:s.d7,d30:s.d30,d365:s.d365,p30:s.p30,n:s.bars.length,top:s.top.map(x=>[x.sym,+x.share.toFixed(1),x.isNew?null:+x.m30.toFixed(2)])}})()" % json.dumps(stables()))
        check(f'{name}: the core reads the part — the total, a day / 7 / 30 days / a year in coins, 30 daily changes, the coins in the data\'s order with a "new" one', core and core['total'] == TOTAL and core['d1'] == CH[-1] * 10**6 and core['d7'] == D7 and core['d30'] == D30 and core['d365'] == TOTAL - 301_180_000_000
              and core['n'] == 30 and [x[0] for x in core['top']] == ['USDT', 'USDC', 'USDe', 'USDX', 'DAI', 'USDS', 'RLUSD', 'USD1'] and core['top'][3][2] is None and core['top'][0][1] == 61.6 and core['top'][4][2] == -21.62 and core['top'][5][2] == 0, core)
        hd = clean(pg.inner_text('#sbTog')).replace('\n', ' ')
        check(f'{name}: closed — "Stablecoin Supply" with the total, its body shut', 'Stablecoin Supply' in hd and '$281.79B' in hd and not pg.is_visible('#sbBody') and pg.get_attribute('#sbTog', 'aria-expanded') == 'false', hd)
        b = pg.evaluate(BARS, 'sbMini')
        check(f'{name}: closed — 30 small bars 28 px high, oldest → newest from the left; issued days green above the line, redeemed days red under it, the flat day neither', bars_ok(b, tok) and b['h'] == 28, b)
        f7, f30 = pg.evaluate(TXT, 'sbF7'), pg.evaluate(TXT, 'sbF30')
        cl = pg.evaluate("['sbF7','sbF30'].map(i=>{const e=document.querySelector('#'+i+' b');return [e.className,getComputedStyle(e).color]})")
        check(f'{name}: closed — "Last 7 days {usd(D7)}" and "Last 30 days {usd(D30)}", each in the colour of its sign', f7 == 'Last 7 days' + usd(D7) and f30 == 'Last 30 days' + usd(D30) and cl[0] == ['down', tok['red']] and cl[1] == ['down', tok['red']], [f7, f30, cl])
        kh = pg.evaluate("(()=>{const k=document.querySelector('#stableCard .mk-k'),r=k.getBoundingClientRect(),c=document.getElementById('stableCard').getBoundingClientRect();return {h:r.height,lh:parseFloat(getComputedStyle(k).fontSize)*1.2,card:Math.round(c.height),sw:document.documentElement.scrollWidth-innerWidth}})()")
        check(f'{name}: closed — the title keeps one line, nothing sideways', kh['h'] <= kh['lh'] * 1.7 and kh['sw'] <= 0, kh)
        # ── the ⓘ does not open the card ──
        pg.click('#sbTog .cp-hint'); pg.wait_for_timeout(400)
        h = pg.evaluate("(()=>{const c=document.querySelector('.cph');return c?c.innerText.replace(/\\s+/g,' '):null})()")
        check(f'{name}: ⓘ — what it is, counted in coins, not USDT dominance; the card stays shut', h and 'Stablecoin Supply' in h and 'counted in coins, not at market price' in h and 'stays under $0.90 for two days is no longer counted as a dollar' in h and 'off every day shown' in h and 'no price for stays in' in h and 'USDT dominance' in h and 'usually demand for cash inside crypto' in h and 'new money' not in h and not pg.is_visible('#sbBody'), h)
        check(f'{name}: ⓘ — "What was measured" carries its limits in the same lines: 95 months, a weak link (0.26, 0.22), −0.7% against +2.0%, only 24 months, most in 2022–2023; a reading, not a forecast; the source',
              h and 'What was measured' in h and '95 months that do not overlap' in h and 'is weak' in h and '0.26' in h and '0.22' in h and '−0.7%' in h and '+2.0% usually' in h and 'only 24 months, most of them in 2022–2023' in h and 'not a forecast of price' in h and 'Source: DefiLlama' in h, h)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        # ── open ──
        pg.click('#sbTog .mk-etf-chev'); pg.wait_for_function("!document.getElementById('sbBody').hidden", timeout=5000); pg.wait_for_timeout(300)
        one = pg.evaluate("[document.querySelectorAll('#stableCard .sb-bars').length, !!document.getElementById('sbMini'), document.getElementById('sbFold').hidden, localStorage.getItem('samsam_mkt_stable_open')]")
        check(f'{name}: open — one picture of the days (the small bars give way), and the page remembers', one == [1, False, True, '1'], one)
        dd = today; MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        top = pg.evaluate(TXT, 'sbDay'), pg.evaluate(TXT, 'sbV'), pg.evaluate("[...document.querySelectorAll('#sbStats > div')].map(d=>[d.innerText.replace(/[\\u2066-\\u2069]/g,'').replace(/\\s+/g,' ').trim(), d.querySelector('b').className])")
        p7, p30, p365 = D7 / (TOTAL - D7) * 100, D30 / (TOTAL - D30) * 100, (TOTAL / 301_180_000_000 - 1) * 100
        pc = lambda v: ('+' if round(v, 2) > 0 else '−' if round(v, 2) < 0 else '') + '%.2f%%' % abs(v)
        want = [[f'1 day {usd(CH[-1] * 10**6)}', 'down'], [f'7 days {usd(D7)} {pc(p7)}', 'down'], [f'30 days {usd(D30)} {pc(p30)}', 'down'], [f'1 year {usd(TOTAL - 301_180_000_000)} {pc(p365)}', 'down']]
        check(f'{name}: open — "In circulation · {dd.day} {MO[dd.month - 1]} {dd.year}" $281.79B; a day, 7 days, 30 days and a year, each with its percent', top[0] == f'In circulation · {dd.day} {MO[dd.month - 1]} {dd.year}' and top[1] == '$281.79B' and top[2] == want, [top, want])
        b = pg.evaluate(BARS, 'sbBars')
        check(f'{name}: open — the same 30 days larger, the same colours', bars_ok(b, tok) and b['h'] == 72, b)
        tb = pg.evaluate("(()=>{const c=[...document.querySelectorAll('#sbTbl > *')].map(e=>[e.innerText.replace(/[\\u2066-\\u2069]/g,'').trim(),e.className,getComputedStyle(e).color]);const rows=[];for(let i=4;i<c.length;i+=4)rows.push(c.slice(i,i+4));return {head:c.slice(0,4).map(x=>x[0]),rows:rows}})()")
        rows = [[x[0] for x in r] for r in tb['rows']]
        check(f'{name}: open — the six biggest coins in the data\'s own order: supply, share, the month; a coin that was not listed a month ago reads "new", a coin that did not move has no sign and no colour',
              tb['head'] == ['Coin', 'Supply', 'Share', '30 days'] and rows == [['USDT', '$173.51B', '61.6%', '−4.05%'], ['USDC', '$69.38B', '24.6%', '−2.82%'], ['USDe', '$4.91B', '1.7%', '+8.39%'], ['USDX', '$4.20B', '1.5%', 'new'], ['DAI', '$3.72B', '1.3%', '−21.62%'], ['USDS', '$3.12B', '1.1%', '0.00%']]
              and tb['rows'][0][3][2] == tok['red'] and tb['rows'][2][3][2] == tok['green'] and tb['rows'][3][3][2] not in (tok['red'], tok['green']) and tb['rows'][5][3][2] not in (tok['red'], tok['green']), tb)
        nt = pg.evaluate(TXT, 'sbNote')
        check(f'{name}: open — the note: "Dollar-pegged stablecoins" counted in coins (no count of coins), a coin that stays under $0.90 is not counted, a move between coins is not a change in the total, a reading not a forecast, the source', nt.startswith('Dollar-pegged stablecoins, counted in coins — not at market price') and '357' not in nt and 'A coin that stays under $0.90 is no longer counted' in nt and 'changes the list, not the total' in nt and 'not a forecast of price' in nt and 'Source: DefiLlama' in nt and 'Not financial advice' in nt, nt)
        sw = pg.evaluate("document.documentElement.scrollWidth-innerWidth")
        check(f'{name}: open — nothing sideways', sw <= 0, sw)
        # ── a breakdown that did not come; an old part; no part ──
        cur['s'] = snp(funding=funding(), stables=stables(top=False)); hub()
        check(f'{name}: no breakdown — the card still shows the total and the days, with no empty table', pg.is_visible('#sbV') and pg.evaluate("!document.getElementById('sbTbl')") and pg.evaluate(TXT, 'sbNote').startswith('Dollar-pegged stablecoins, counted in coins'))
        for label, part in (('a part 6 days old', stables(back=6)), ('no part', None)):
            cur['s'] = snp(funding=funding(), stables=part); hub()
            check(f'{name}: {label} → no card; Market Pulse is the four cards, ETF Flows and BTC Funding', not pg.is_visible('#stableCard') and pg.evaluate(ORDER) == ['mk-grid', 'etfCard', 'fundCard'], pg.evaluate(ORDER))
        cur['s'] = snp(funding=funding(), stables=stables(back=3)); hub()
        check(f'{name}: a part 3 days old still shows (a weekend with no run)', pg.is_visible('#stableCard'))
        # ── the Pi Cycle + MVRV card: the filled bar and the two averages ──
        cur['s'] = snp(mvrv=mvh(), dxy=dxy(), funding=funding(), stables=stables()); pg.evaluate("localStorage.setItem('samsam_mkt_stable_open','0')"); hub()
        bv = pg.evaluate("['bvPi','bvMv'].map(id=>{const c=document.getElementById(id),t=c.querySelector('.bv-track'),d=c.querySelector('.bv-dot'),s=getComputedStyle(t),q=getComputedStyle(d),R=t.getBoundingClientRect(),r=d.getBoundingClientRect();return {h:R.height,rad:s.borderTopLeftRadius,bg:s.backgroundImage,kids:t.querySelectorAll('.bv-rail > *').length,dw:r.width,dbg:q.backgroundColor,db:q.borderTopColor,dbw:q.borderTopWidth,in:r.left>=R.left-.5&&r.right<=R.right+.5,mid:Math.abs((r.top+r.bottom)/2-(R.top+R.bottom)/2),pos:((r.left+r.right)/2-R.left-7)/(R.width-14)*100}})")
        fd = pg.evaluate("(()=>{const d=document.querySelector('#fundCard .fd-dot');if(!d)return null;const q=getComputedStyle(d);return [d.getBoundingClientRect().width,q.backgroundColor,q.borderTopColor,q.borderTopWidth]})()")
        ok = all(x['h'] == 8 and x['rad'] == '4px' and x['bg'].startswith('linear-gradient') and x['kids'] == 1 and x['in'] and x['mid'] <= .6 for x in bv)
        check(f'{name}: Pi Cycle + MVRV — the bar is 8 px with rounded ends, one smooth blend with nothing inside it but the dot (no segments, no edges)', ok, bv)
        cols = pg.evaluate("(()=>{const p=document.createElement('i');document.body.appendChild(p);const o=%s.map(v=>{p.style.color=v;return getComputedStyle(p).color});p.remove();return o})()" % json.dumps(PROFIT_LOSS))
        check(f'{name}: …the blend is the funding bar\'s five colours, cold → warm — never the profit green or the loss red', all(pg.evaluate("SamsamFunding.COL.map(c=>{const p=document.createElement('i');p.style.color=c;document.body.appendChild(p);const v=getComputedStyle(p).color;p.remove();return v})") == [c for c in __import__('re').findall(r'rgb\([^)]+\)', x['bg'])] for x in bv)
              and not any(c in x['bg'] for c in cols for x in bv), [bv[0]['bg'], cols])
        check(f'{name}: …the dot is BTC Funding\'s own: 14 px, white, a dark ring — wholly on the bar, where today\'s reading stands', fd and all([x['dw'], x['dbg'], x['db'], x['dbw']] == fd for x in bv) and fd[0] == 14 and fd[1] == 'rgb(255, 255, 255)'
              and abs(bv[0]['pos'] - (61.37 - 38.2) / (122.8 - 38.2) * 100) < 1 and abs(bv[1]['pos'] - (1.139 - 0.3929) / (5.8841 - 0.3929) * 100) < 1, [bv, fd])
        av = pg.evaluate("[...document.querySelectorAll('#bvPi .bv-n')].map(e=>e.innerText.replace(/[\\u2066-\\u2069]/g,'').trim())")
        i = av.index('100% is the cross') if '100% is the cross' in av else -9
        check(f'{name}: Pi Cycle — under "100% is the cross": "111-day average: $70,500" and "2× 350-day average: $114,880" (the Exit page\'s own two numbers)', i >= 0 and av[i + 1:i + 3] == ['111-day average: $70,500', '2× 350-day average: $114,880']
              and pg.evaluate("(()=>{const m=Samsam.core.btcMarks(%s,Date.now()).pi;return [m.d111,m.d350x2]})()" % json.dumps(rbp)) == [70500, 114880], av)
        # ── Arabic ──
        pg.evaluate("localStorage.setItem('cp-lang','ar')"); hub()
        hd = clean(pg.inner_text('#sbTog')).replace('\n', ' ')
        f7, f30 = pg.evaluate(TXT, 'sbF7'), pg.evaluate(TXT, 'sbF30'); b = pg.evaluate(BARS, 'sbMini')
        check(f'{name}: Arabic closed — "معروض العملات المستقرة" $281.79B, "آخر 7 أيام" and "آخر 30 يوماً" with their amounts; the bars still run oldest → newest from the left', 'معروض العملات المستقرة' in hd and '$281.79B' in hd and f7 == 'آخر 7 أيام' + usd(D7) and f30 == 'آخر 30 يوماً' + usd(D30) and bars_ok(b, tok), [hd, f7, f30])
        kh = pg.evaluate("(()=>{const k=document.querySelector('#stableCard .mk-k'),r=k.getBoundingClientRect();return {h:r.height,lh:parseFloat(getComputedStyle(k).fontSize)*1.2,sw:document.documentElement.scrollWidth-innerWidth}})()")
        check(f'{name}: Arabic closed — the title keeps one line, nothing sideways', kh['h'] <= kh['lh'] * 1.7 and kh['sw'] <= 0, kh)
        pg.click('#sbTog .mk-etf-chev'); pg.wait_for_function("!document.getElementById('sbBody').hidden", timeout=5000); pg.wait_for_timeout(300)
        MA = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
        tb = pg.evaluate("[...document.querySelectorAll('#sbTbl > *')].map(e=>e.innerText.replace(/[\\u2066-\\u2069]/g,'').trim())")
        st = pg.evaluate("[...document.querySelectorAll('#sbStats > div')].map(d=>d.innerText.replace(/[\\u2066-\\u2069]/g,'').replace(/\\s+/g,' ').trim())")
        nt = pg.evaluate(TXT, 'sbNote')
        check(f'{name}: Arabic open — "في التداول · {dd.day} {MA[dd.month - 1]} {dd.year}", يوم واحد / 7 أيام / 30 يوماً / سنة, the table\'s heads and "جديدة", the note with "DefiLlama"', pg.evaluate(TXT, 'sbDay') == f'في التداول · {dd.day} {MA[dd.month - 1]} {dd.year}'
              and [x.split(' ' + ('−' if '−' in x else '+'))[0] for x in st] == ['يوم واحد', '7 أيام', '30 يوماً', 'سنة'] and tb[:4] == ['العملة', 'المعروض', 'الحصة', '30 يوماً'] and tb[4:8] == ['USDT', '$173.51B', '61.6%', '−4.05%'] and tb[19] == 'جديدة'
              and nt.startswith('العملات المستقرة المربوطة بالدولار، محسوبة بعدد العملات لا بسعر السوق') and '357' not in nt and 'والعملة التي تبقى تحت $0.90 لا تُحسب' in nt and 'يبقى' not in nt and 'قراءة للسيولة، وليست توقعاً للسعر' in nt and 'المصدر: DefiLlama' in nt, [st, tb[:8], nt])
        dx = pg.evaluate("(()=>{const b=[...document.querySelectorAll('#sbDay bdi')].map(e=>[e.textContent,e.getBoundingClientRect().left]);return {b:b,span:document.getElementById('sbSpan').innerText.replace(/[\\u2066-\\u2069]/g,'').trim()}})()")
        d0 = today - datetime.timedelta(days=29)
        check(f'{name}: Arabic — the date reads from the right (the day right of the year), and the days\' span is said in words: "من {d0.day} {MA[d0.month - 1]} إلى {dd.day} {MA[dd.month - 1]}" — no arrow in an Arabic line',
              [x[0] for x in dx['b']] == [str(dd.day), str(dd.year)] and dx['b'][0][1] > dx['b'][1][1] and dx['span'] == f'من {d0.day} {MA[d0.month - 1]} إلى {dd.day} {MA[dd.month - 1]}', dx)
        loose = pg.evaluate(LOOSE, '#stableCard')
        ltr = pg.evaluate("[...document.querySelectorAll('#stableCard bdi')].every(b=>b.dir==='ltr') && [...document.querySelectorAll('#sbTbl b bdi')].map(b=>b.textContent).slice(0,3).join()==='USDT,−4.05%,USDC'")
        check(f'{name}: Arabic — every number, percent, date, amount and coin symbol in the card is its own left-to-right piece (nothing Latin or numeric loose in an Arabic line)', loose == [] and ltr, loose)
        sw = pg.evaluate("document.documentElement.scrollWidth-innerWidth"); check(f'{name}: Arabic open — nothing sideways', sw <= 0, sw)
        pg.click('#sbTog .cp-hint'); pg.wait_for_timeout(400)
        h = pg.evaluate("(()=>{const c=document.querySelector('.cph');return c?c.innerText.replace(/[\\u2066-\\u2069]/g,'').replace(/\\s+/g,' '):null})()"); hl = pg.evaluate(LOOSE, '.cph')
        check(f'{name}: Arabic ⓘ — "ما قيس" with its limits (95 شهراً, ضعيفة, 0.26, 0.22, −0.7%, +2.0%, 24 شهراً فقط, 2022–2023), "هيمنة USDT", the source — every number and Latin name a left-to-right piece, no "و" stuck to a number',
              h and 'معروض العملات المستقرة' in h and 'ما قيس' in h and '95 شهراً غير متداخلة' in h and 'ضعيفة' in h and '0.26' in h and '0.22' in h and '−0.7%' in h and '+2.0% في المعتاد' in h and '24 شهراً فقط' in h and '2022–2023' in h and 'هيمنة USDT' in h
              and 'يُحسب بعدد العملات لا بسعر السوق' in h and 'والعملة التي تبقى تحت $0.90 يومين متتاليين لا تُحسب دولاراً' in h and 'وليست توقعاً للسعر' in h and 'المصدر: DefiLlama' in h and hl == [] and not __import__('re').search(r'و\d', h), [h, hl])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        av = pg.evaluate("[...document.querySelectorAll('#bvPi .bv-n')].map(e=>e.innerText.replace(/[\\u2066-\\u2069]/g,'').trim())")
        i = av.index('100% هو التقاطع') if '100% هو التقاطع' in av else -9
        check(f'{name}: Arabic Pi Cycle — "متوسط 111 يوماً: $70,500" and "ضعف متوسط 350 يوماً: $114,880", their numbers left-to-right pieces', i >= 0 and av[i + 1:i + 3] == ['متوسط 111 يوماً: $70,500', 'ضعف متوسط 350 يوماً: $114,880'] and pg.evaluate(LOOSE, '#bvPi .bv-avg') == [], av)
        pg.evaluate("localStorage.setItem('cp-lang','en'); localStorage.setItem('samsam_mkt_stable_open','0')")
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
