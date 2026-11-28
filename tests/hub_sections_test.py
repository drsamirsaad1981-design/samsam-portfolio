"""Market Hub → Crypto in two headed sections that fold, and the Bitcoin Pi Cycle + Bitcoin MVRV card.
  · Market Pulse: the four cards, ETF Flows, BTC Funding. Bitcoin Valuation: the rainbow, then Pi Cycle + MVRV.
  · A tap on a heading folds its section; the page remembers it on this device; the ⓘ beside the name opens its text
    and does not fold. market.html#rainbow opens the rainbow card even when its section is folded.
  · The Pi / MVRV card: the value, a bar from the lowest to the highest reading since 2012, "Higher than N% of days since
    2012" (the jobs' count — no named zone), this cycle's highest, MVRV's realized cost and its source.
  · ETF fixes: a $0 flow has no colour; in Arabic the day is Arabic and the header keeps one line on a phone.
The fixtures are macro_app_test.py's own (one place for the snapshot's made-up parts)."""
import sys, pathlib, json, datetime, math
HERE = pathlib.Path(__file__).parent
exec((HERE / 'macro_app_test.py').read_text(encoding='utf-8').split('with sync_playwright() as p:')[0].split('res = []')[1])   # RB, mvrv(), dxy(), funding(), snap(), clean
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(HERE)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
PI_H = {'from': '2012-01-01', 'days': 5440, 'under': 21.4, 'lo': [38.2, '2015-08-25'], 'hi': [122.8, '2013-06-10']}
MV_H = {'from': '2012-01-01', 'days': 5440, 'under': 17.6, 'lo': [0.3929, '2015-01-14'], 'hi': [5.8841, '2013-11-18']}
def rb(hist=True):
    r = json.loads(json.dumps(RB)); r['pi']['peaks'] = [[2021, 100.3, '2021-04-17'], [2024, 73.6, '2024-06-01']]
    if hist: r['pi']['hist'] = PI_H
    return r
def mv(hist=True, **k):
    m = mvrv(**k)
    if hist: m['hist'] = MV_H
    return m
def snap2(rbp=None, **parts): s = snap(**parts); s['rainbow'] = rbp if rbp is not None else rb(); return s
ETF = json.loads((HERE / 'etf_fixture.json').read_text())
for k in ('btc', 'eth'):   # the last day's funds: one of them moved nothing
    d = ETF[k]['days'][-1]; ETF[k]['funds'] = {'date': d[0], 'list': [{'t': 'AAA', 'name': 'Fund A', 'net': 5e7}, {'t': 'ZERO', 'name': 'Fund Zero', 'net': 0}, {'t': 'BBB', 'name': 'Fund B', 'net': -2e7}]}
ORDER = "[...document.querySelectorAll('#vCrypto .mk-part')].map(s=>[s.id,s.querySelector('.mk-part-t').textContent.trim(),s.querySelector('.cp-hint').dataset.hint,s.querySelector('.mk-part-tog').getAttribute('aria-expanded'),[...s.querySelectorAll('.mk-part-b > section')].filter(c=>!c.hidden).map(c=>c.id||c.className.split(' ')[0])])"
CELL = "(id)=>{const c=document.getElementById(id);if(!c)return null;const t=c.querySelector('.bv-track'),d=c.querySelector('.bv-dot'),r=e=>{const q=e.getBoundingClientRect();return [q.left,q.right,q.top,q.bottom]};return {t:c.innerText.replace(/[\\u2066-\\u2069\\u200e\\u200f]/g,'').replace(/\\s+/g,' ').trim(),hint:c.querySelector('.cp-hint').dataset.hint,left:d?d.style.left:null,track:t?r(t):null,dot:d?r(d):null,ends:[...c.querySelectorAll('.bv-ends span')].map(e=>e.textContent),bar:!!t,label:(c.querySelector('.bv-bar')||{getAttribute(){return null}}).getAttribute('aria-label'),box:r(c),hintBox:r(c.querySelector('.cp-hint')),nameBox:r(c.querySelector('.bv-kt'))}}"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 360, 'height': 800}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        cur = {'s': snap2(mvrv=mv(), dxy=dxy(), funding=funding())}
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(cur['s'])))
        ctx.route('**/prices/m/rainbow.json', lambda r: r.fulfill(status=404, body='{}'))
        ctx.route('**/prices/m/etf.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(ETF)))
        ctx.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        def ready():
            if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
            pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000)
        def hub(hash=''):
            pg.goto('about:blank'); pg.goto(S.SITE + '/market.html' + hash); pg.wait_for_timeout(600); ready(); pg.wait_for_function("!document.getElementById('valCard').hidden || !document.getElementById('rbCard').hidden", timeout=15000); pg.wait_for_timeout(900)
        pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(600); ready()
        pg.evaluate("try{Object.keys(localStorage).filter(k=>/^samsam_mkt_/.test(k)).forEach(k=>localStorage.removeItem(k))}catch(e){}"); hub()
        # ── the two sections ──
        o = pg.evaluate(ORDER)
        check(f'{name}: two headed sections — Market Pulse (the four cards, ETF Flows, BTC Funding) then Bitcoin Valuation (the rainbow, Pi Cycle + MVRV), both open, each with its ⓘ', o == [['secPulse', 'Market Pulse', 'marketPulse', 'true', ['mk-grid', 'etfCard', 'fundCard']], ['secVal', 'Bitcoin Valuation', 'hubValuation', 'true', ['rbCard', 'valCard']]], o)
        ys = pg.evaluate("['secPulseTog','cardMcap','etfCard','fundCard','secValTog','rbCard','valCard','mkStable'].map(i=>{const e=document.getElementById(i)||document.querySelector('.mk-grid');return Math.round(e.getBoundingClientRect().top+scrollY)})")
        check(f'{name}: …in that order down the page, the coin list after them; nothing sideways', all(ys[i] < ys[i + 1] for i in range(len(ys) - 1)) and pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, ys)
        hd = pg.evaluate("(()=>{const t=document.getElementById('secValTog'),r=e=>{const q=e.getBoundingClientRect();return [Math.round(q.left),Math.round(q.right)]};const c=getComputedStyle(t);return {tag:t.parentElement.tagName,tog:r(t),name:r(t.querySelector('.mk-part-t')),hint:r(t.querySelector('.cp-hint')),chev:r(t.querySelector('.mk-part-chev')),tt:c.textTransform,fw:c.fontWeight}})()")
        check(f'{name}: a heading is a real heading (h2) whose button spans the line: name, ⓘ beside it, the chevron at the far end; no capitals by CSS', hd['tag'] == 'H2' and hd['name'][0] <= hd['tog'][0] + 1 and hd['name'][1] <= hd['hint'][0] and hd['chev'][1] >= hd['tog'][1] - 1 and hd['chev'][0] - hd['hint'][1] > 40 and hd['tt'] == 'none' and int(hd['fw']) >= 700, hd)
        # the ⓘ opens its text and does not fold the section
        for sec, title, words in (('secPulse', 'Market Pulse', ('Size and flows', 'Mood and leverage', 'Who leads', 'not whether the price is low or high over the long run', 'Bitcoin Valuation')), ('secVal', 'Bitcoin Valuation', ('Where Bitcoin\'s own price stands against its history', 'Bitcoin Rainbow', 'how fast the price has risen', 'Bitcoin\'s realized market cost (source: Coin Metrics)', '200-week average', 'a count, not a zone we named', 'A reading of the past, not a forecast', 'Plan → Exit'))):
            pg.click(f'#{sec}Tog .cp-hint'); pg.wait_for_timeout(400); t = pg.inner_text('.cph') if pg.query_selector('.cph') else ''
            check(f'{name}: {title} ⓘ — opens its text ({words[0]} …) and the section stays open', t.startswith(title) and all(w in t for w in words) and not any(w in t.lower() for w in ('cheap', 'expensive', ' buy ', ' sell ')) and pg.get_attribute(f'#{sec}Tog', 'aria-expanded') == 'true' and pg.is_visible(f'#{sec}Body'), t[:400])
            pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        # one shared list of the three readings: the Exit page's ⓘ says the same lines
        same = pg.evaluate("(()=>{const li=k=>{const d=document.createElement('div');d.innerHTML=CPHint.HINTS[k].body();return [...d.querySelectorAll('li')].map(x=>x.textContent)};return [li('hubValuation'),li('exitValuation')]})()")
        check(f'{name}: …Bitcoin Valuation says its three readings in the same words here and on the Exit page', same[0] == same[1] and len(same[0]) == 3 and 'Pi Cycle' in same[0][1] and 'Coin Metrics' in same[0][2], same)
        # fold a section by its heading: remembered after a reload; the other one stays
        pg.click('#secPulseTog .mk-part-chev'); pg.wait_for_timeout(250)
        f1 = pg.evaluate("[document.getElementById('secPulseBody').hidden, secPulseTog.getAttribute('aria-expanded'), localStorage.getItem('samsam_mkt_sec_pulse'), !document.getElementById('secValBody').hidden, Math.round(document.getElementById('secPulse').getBoundingClientRect().height)]")
        hub(); f2 = pg.evaluate("[document.getElementById('secPulseBody').hidden, secPulseTog.getAttribute('aria-expanded'), !document.getElementById('secValBody').hidden]")
        check(f'{name}: a tap on "Market Pulse" folds it to its heading alone ({f1[4]} px), Bitcoin Valuation stays; remembered after a reload', f1[:4] == [True, 'false', '0', True] and f1[4] < 70 and f2 == [True, 'false', True] and pg.is_visible('#rbCard') and not pg.is_visible('#etfCard'), [f1, f2])
        pg.click('#secPulseTog .mk-part-chev'); pg.wait_for_timeout(250)
        check(f'{name}: …a second tap opens it again, its cards back', pg.is_visible('#etfCard') and pg.is_visible('#fundCard') and pg.evaluate("localStorage.getItem('samsam_mkt_sec_pulse')") == '1')
        # the bot's button (market.html#rainbow) opens the rainbow card even inside a folded section
        pg.click('#secValTog .mk-part-chev'); pg.wait_for_timeout(250); gone = not pg.is_visible('#rbCard'); hub('#rainbow'); pg.wait_for_timeout(900)
        check(f'{name}: market.html#rainbow (the alert\'s button): the folded section opens and the rainbow card with it', gone and pg.is_visible('#rbCard') and pg.is_visible('#rbBody') and pg.get_attribute('#secValTog', 'aria-expanded') == 'true')
        pg.evaluate("localStorage.setItem('samsam_mkt_rb_open','0'); localStorage.removeItem('samsam_mkt_sec_val')"); hub()
        # ── the Pi Cycle + MVRV card ──
        pi, mm = pg.evaluate(CELL, 'bvPi'), pg.evaluate(CELL, 'bvMv')
        core = pg.evaluate("(()=>{const c=Samsam.core,m=c.btcMarks(%s,Date.now()),v=c.mvrvRead(%s,Date.now());return {pi:c.histPos(m.pi.ratio,m.pi.hist),mv:c.histPos(v.v,v.hist),ratio:m.pi.ratio,under:[m.pi.hist.under,v.hist.under]}})()" % (json.dumps(cur['s']['rainbow']), json.dumps(cur['s']['mvrv'])))
        check(f'{name}: Pi Cycle cell — "Bitcoin Pi Cycle", 61.4%, a bar 38.2% … 122.8%, "Higher than 21% of days since 2012", "This cycle’s highest: 73.6%", "100% is the cross"', pi and pi['t'].startswith('Bitcoin Pi Cycle') and '61.4%' in pi['t'] and pi['ends'] == ['38.2%', '122.8%'] and 'Higher than 21% of days since 2012' in pi['t'] and 'This cycle’s highest: 73.6%' in pi['t'] and '100% is the cross' in pi['t'] and pi['hint'] == 'pi', pi)
        check(f'{name}: MVRV cell — "Bitcoin MVRV", 1.14, a bar 0.39 … 5.88, "Higher than 18% of days since 2012", "This cycle’s highest: 2.74", the realized cost, "Source: Coin Metrics"', mm and mm['t'].startswith('Bitcoin MVRV') and '1.14' in mm['t'] and mm['ends'] == ['0.39', '5.88'] and 'Higher than 18% of days since 2012' in mm['t'] and 'This cycle’s highest: 2.74' in mm['t'] and 'Bitcoin’s realized market cost: $53,033' in mm['t'] and mm['t'].endswith('Source: Coin Metrics') and mm['hint'] == 'mvrv', mm)
        check(f'{name}: …each dot is where the core puts the value between the lowest and the highest ({core["pi"]:.1f}%, {core["mv"]:.1f}%), inside its bar', pi['left'] == f"{core['pi']:.1f}%" and mm['left'] == f"{core['mv']:.1f}%" and abs(core['pi'] - (61.37 - 38.2) / (122.8 - 38.2) * 100) < 0.05 and all(c['track'][0] - 7 <= c['dot'][0] and c['dot'][1] <= c['track'][1] + 7 for c in (pi, mm)), [pi['left'], mm['left'], core])
        check(f'{name}: …no word of ours for the level: no "low", "high zone", "cheap", "expensive", "buy" or "sell" on the card', not any(w in (pi['t'] + ' ' + mm['t']).lower() for w in (' low ', 'zone', 'cheap', 'expensive', ' buy', ' sell', 'undervalued', 'overvalued')), pi['t'] + mm['t'])
        check(f'{name}: …two cells side by side, each ⓘ on the line of its name\'s last word', abs(pi['box'][2] - mm['box'][2]) < 2 and pi['box'][1] <= mm['box'][0] + 1 and all(c['hintBox'][3] <= c['nameBox'][3] + 2 and c['hintBox'][2] >= c['nameBox'][2] - 2 for c in (pi, mm)), [pi['box'], mm['box']])
        pg.click('#bvPi .cp-hint'); pg.wait_for_timeout(400); t = pg.inner_text('.cph') if pg.query_selector('.cph') else ''
        check(f'{name}: the Pi Cycle ⓘ — two averages (111 days, twice 350), 100% is the cross, when it crossed, "it does not look at what coins cost", "A reference, not a signal"', all(w in t for w in ('Bitcoin Pi Cycle', '111-day average', 'twice its 350-day average', '100%', '2013, 2017 and 2021', 'not in the cycle of 2024', 'since 2012', 'does not look at what coins cost', 'A reference, not a signal')), t[:300])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        # parts made before the jobs wrote the history: the value and the cycle's highest, no bar and no "higher than" line
        cur['s'] = snap2(rbp=rb(hist=False), mvrv=mv(hist=False), dxy=dxy(), funding=funding()); hub()
        pi, mm = pg.evaluate(CELL, 'bvPi'), pg.evaluate(CELL, 'bvMv')
        check(f'{name}: parts without the history → the value and this cycle\'s highest, no bar and no "Higher than" line (never a guess)', pi and mm and not pi['bar'] and not mm['bar'] and 'Higher than' not in pi['t'] + mm['t'] and '61.4%' in pi['t'] and 'This cycle’s highest: 2.74' in mm['t'])
        # MVRV too old → its cell goes, the Pi Cycle stays; no rainbow part at all → the whole section goes
        cur['s'] = snap2(mvrv=mv(back=6), dxy=dxy(), funding=funding()); hub()
        check(f'{name}: MVRV over 4 days old → one cell (the Pi Cycle), still a card', pg.is_visible('#bvPi') and pg.locator('#bvMv').count() == 0)
        s0 = snap(dxy=dxy(), funding=funding()); s0.pop('rainbow', None); cur['s'] = s0
        pg.goto('about:blank'); pg.goto(S.SITE + '/market.html'); pg.wait_for_timeout(600); ready(); pg.wait_for_timeout(2500)
        check(f'{name}: no rainbow part and no MVRV → no Bitcoin Valuation heading over nothing (Market Pulse stays)', not pg.is_visible('#secVal') and pg.is_visible('#secPulse') and pg.is_visible('#fundCard'))
        # ── ETF fixes ──
        cur['s'] = snap2(mvrv=mv(), dxy=dxy(), funding=funding()); pg.evaluate("localStorage.setItem('samsam_mkt_etf_open','1')"); hub()
        z = pg.evaluate("(()=>{const f=[...document.querySelectorAll('#etfFunds div')].map(d=>[d.querySelector('span').textContent,d.querySelector('b').textContent,d.querySelector('b').className,getComputedStyle(d.querySelector('b')).color]);const fg=getComputedStyle(document.querySelector('#etfFunds span')).color;return {f:f,fg:fg}})()")
        zero = [x for x in z['f'] if x[0] == 'ZERO']; up = [x for x in z['f'] if x[0] == 'AAA']; dn_ = [x for x in z['f'] if x[0] == 'BBB']
        check(f'{name}: ETF — a fund that moved $0 has no sign and no colour (the text\'s own colour); in and out keep green and red', zero and zero[0][1] == '$0' and zero[0][2] == '' and zero[0][3] == z['fg'] and up[0][2] == 'up' and dn_[0][2] == 'down' and len({zero[0][3], up[0][3], dn_[0][3]}) == 3, z)
        # ── Arabic ──
        pg.evaluate("localStorage.setItem('cp-lang','ar'); localStorage.setItem('samsam_mkt_etf_open','0')"); hub()
        o = pg.evaluate(ORDER)
        check(f'{name}: Arabic — "نبض السوق" and "تقييم البيتكوين", the same cards under each', [x[1] for x in o] == ['نبض السوق', 'تقييم البيتكوين'] and [x[4] for x in o] == [['mk-grid', 'etfCard', 'fundCard'], ['rbCard', 'valCard']], o)
        hd = pg.evaluate("(()=>{const t=document.getElementById('secPulseTog'),r=e=>{const q=e.getBoundingClientRect();return [Math.round(q.left),Math.round(q.right)]};return {tog:r(t),name:r(t.querySelector('.mk-part-t')),hint:r(t.querySelector('.cp-hint')),chev:r(t.querySelector('.mk-part-chev'))}})()")
        check(f'{name}: Arabic — the heading reads from the right: name, ⓘ beside it, the chevron at the far left end', hd['name'][1] >= hd['tog'][1] - 1 and hd['hint'][1] <= hd['name'][0] and hd['chev'][0] <= hd['tog'][0] + 1 and hd['hint'][0] - hd['chev'][1] > 40, hd)
        pi, mm = pg.evaluate(CELL, 'bvPi'), pg.evaluate(CELL, 'bvMv')
        check(f'{name}: Arabic cells — "مؤشر Pi Cycle للبيتكوين" 61.4% "أعلى من 21% من الأيام منذ 2012" "أعلى قراءة بالدورة: 73.6%"; "مؤشر MVRV للبيتكوين" 1.14 "أعلى من 18% من الأيام منذ 2012", the cost, "المصدر: Coin Metrics"', pi['t'].startswith('مؤشر Pi Cycle للبيتكوين') and '61.4%' in pi['t'] and 'أعلى من 21% من الأيام منذ 2012' in pi['t'] and 'أعلى قراءة بالدورة: 73.6%' in pi['t'] and '100% هو التقاطع' in pi['t'] and mm['t'].startswith('مؤشر MVRV للبيتكوين') and 'أعلى من 18% من الأيام منذ 2012' in mm['t'] and 'متوسط تكلفة البيتكوين المحققة للسوق: $53,033' in mm['t'] and mm['t'].endswith('المصدر: Coin Metrics'), [pi['t'], mm['t']])
        loose = pg.evaluate("(()=>{const c=document.getElementById('valCard'),w=document.createTreeWalker(c,NodeFilter.SHOW_TEXT),out=[];for(let n=w.nextNode();n;n=w.nextNode())if(!n.parentElement.closest('bdi,.bv-ends,.bv-kt,.bv-k')&&/[\\dA-Za-z]/.test(n.textContent))out.push(n.textContent.trim().slice(0,30));return {loose:out,ltr:[...c.querySelectorAll('bdi')].every(b=>b.dir==='ltr'),bar:getComputedStyle(c.querySelector('.bv-bar')).direction,ends:[...c.querySelectorAll('#bvPi .bv-ends span')].map(e=>Math.round(e.getBoundingClientRect().left))}})()")
        check(f'{name}: Arabic — every number, percent, price and "Coin Metrics" in the card is its own left-to-right piece; the bar still runs lowest → highest from the left', not loose['loose'] and loose['ltr'] and loose['bar'] == 'ltr' and loose['ends'][0] < loose['ends'][1], loose)
        for key, title, words in (('secPulse', 'نبض السوق', ('الحجم والتدفقات', 'المزاج والرافعة', 'من يقود', 'لا هل السعر منخفض أو مرتفع على المدى الطويل')), ('secVal', 'تقييم البيتكوين', ('أين يقف سعر البيتكوين نفسه قياساً بتاريخه', 'سرعة صعود السعر', 'متوسط تكلفة البيتكوين المحققة للسوق', 'قراءة للماضي وليست توقعاً'))):
            pg.click(f'#{key}Tog .cp-hint'); pg.wait_for_timeout(400)
            h = pg.evaluate("(()=>{const c=document.querySelector('.cph');if(!c)return null;const w=document.createTreeWalker(c,NodeFilter.SHOW_TEXT),loose=[];for(let n=w.nextNode();n;n=w.nextNode())if(!n.parentElement.closest('bdi')&&/\\d/.test(n.textContent))loose.push(n.textContent.trim().slice(0,30));return {t:c.innerText.replace(/\\s+/g,' '),loose:loose}})()")
            check(f'{name}: Arabic {title} ⓘ — its text, with no number loose in the Arabic line', h and title in h['t'] and all(w in h['t'] for w in words) and not h['loose'], h)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        # ETF in Arabic: closed, the title keeps one line; open, the day is Arabic
        e = pg.evaluate("(()=>{const k=document.querySelector('#etfCard .mk-k'),r=k.getBoundingClientRect(),lh=parseFloat(getComputedStyle(k).lineHeight)||parseFloat(getComputedStyle(k).fontSize)*1.4;return {h:Math.round(r.height),lh:Math.round(lh),small:getComputedStyle(k.querySelector('small')).display,sw:document.documentElement.scrollWidth-innerWidth}})()")
        check(f'{name}: Arabic ETF header — the title keeps one line' + (' ("US spot" left to the ⓘ on a phone)' if name == 'phone' else ''), e['h'] <= e['lh'] * 1.6 and e['sw'] <= 0 and (e['small'] == 'none') == (name == 'phone'), e)
        pg.click('#etfTog .mk-etf-chev'); pg.wait_for_function("!document.getElementById('etfBody').hidden", timeout=5000); pg.wait_for_timeout(300)
        last = ETF['btc']['days'][-1][0]; dd = datetime.date.fromisoformat(last); WD = ['الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد']; MO = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
        day = clean(pg.inner_text('#etfDay')); e2 = pg.evaluate("(()=>{const k=document.querySelector('#etfCard .mk-k').getBoundingClientRect(),h=document.querySelector('#etfCard .mk-etf-h');return {kh:Math.round(k.height),sw:document.documentElement.scrollWidth-innerWidth,seg:getComputedStyle(document.getElementById('etfSeg')).display}})()")
        check(f'{name}: Arabic ETF open — the day reads "{WD[dd.weekday()]} {dd.day} {MO[dd.month - 1]}", the title still one line with the BTC / ETH switch showing, nothing sideways', day == f'{WD[dd.weekday()]} {dd.day} {MO[dd.month - 1]}' and e2['kh'] <= e['lh'] * 1.6 and e2['sw'] <= 0 and e2['seg'] != 'none', [day, e2])
        pg.evaluate("localStorage.setItem('cp-lang','en'); localStorage.setItem('samsam_mkt_etf_open','0')")
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
