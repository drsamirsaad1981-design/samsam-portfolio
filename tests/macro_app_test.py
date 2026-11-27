"""MVRV, the dollar index, BTC funding in the app — the snapshot's three parts (tools/update-macro.mjs), read through
samsam-core.js (mvrvRead / dxyNow / fundingNow), so the app says what the bot says.
  · Market Hub: the BTC Funding card (one rate from several venues, and the big venues that are NOT in it, by name); the
    MVRV row in the rainbow card (with its source); the dollar index beside the metals.
  · Plan → Exit: MVRV is the third reading of Bitcoin Valuation, against your level (3.0 until you choose).
  · Plan: the market's average cost under Bitcoin's Buy At.
English and Arabic, phone and desktop; a part that has grown old is not shown."""
import sys, pathlib, json, datetime, math
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
now = lambda: datetime.datetime.now(datetime.timezone.utc)
today = now().date(); GEN = datetime.date(2009, 1, 3)
F = {'a': -16.1839, 'b': 5.5943, 'lo': -0.746, 'hi': 1.216, 'share': [0.8, 11.8, 33.5, 24.8, 14.5, 9.8, 2.8, 1.7, 0.2], 'to': '2026-11-22'}
def close(back, band): d = today - datetime.timedelta(days=back); line = 10 ** (F['a'] + F['b'] * math.log10((d - GEN).days)); return [d.isoformat(), line * 10 ** (F['lo'] + (band - 0.5) * (F['hi'] - F['lo']) / 9)]
RB = {'v': 1, 'fit': F, 'held': {'band': 2, 'since': '2026-11-05'}, 'closes': [close(3 - i, 2) for i in range(3)], 'peaks': [[2017, 8, '2017-12-07'], [2021, 6, '2021-02-19'], [2024, 5, '2024-12-16']],
      'w200': {'ma': 48000, 'day': '2026-11-22', 'under': {'days': 310, 'pct': 6.8, 'last': '2023-03-12'}}, 'pi': {'day': close(1, 2)[0], 'ratio': 61.37, 'd111': 70500, 'd350x2': 114880, 'peaks': [[2021, 101.9, '2021-04-12']], 'crosses': ['2021-04-12']}}
def mvrv(back=1, v=1.139): return {'v': 1, 'day': (today - datetime.timedelta(days=back)).isoformat(), 'now': v, 'price': 60415, 'realized': 53033, 'wk': 1.16, 'mo': 1.49,
    'peaks': [[2011, 7.74, '2011-06-04'], [2013, 5.88, '2013-11-18'], [2017, 4.72, '2017-12-07'], [2021, 3.96, '2021-02-21'], [2024, 2.74, '2024-11-21']], 'lows': [[2022, 0.75, '2022-11-09']], 'over35': '2021-03-19', 'under1': '2023-01-12', 'src': 'Coin Metrics'}
def dxy(): return {'v': 1, 'price': 103.872, 'prev': 103.675, 'ch24': 0.19, 'ch7': -0.03, 'lo52': 96.22, 'hi52': 104.32, 'spark': [102.9, 103.1, 103.4, 103.2, 103.6, 103.87], 'at': (now() - datetime.timedelta(minutes=20)).isoformat(), 'src': 'Yahoo Finance (DX-Y.NYB)'}
VEN = [['Hyperliquid', 0.01, 2.32e9], ['Bitget', 0.0018, 2.31e9], ['OKX', 0.0003, 1.96e9], ['Gate', 0.0069, 1.95e9], ['Deribit', 0.0003, 0.8021e9]]
def funding(extra=None, hours=0.3, rate=0.0044):
    v = ([extra] if extra else []) + VEN
    return {'v': 1, 'rate': rate, 'm7': 0.0016, 'oi': sum(x[2] for x in v), 'n': len(v), 'venues': [{'k': k, 'rate': r, 'oi': o, 'm7': 0.002} for k, r, o in v], 'missing': ['Bybit'] if extra else ['Binance', 'Bybit'], 'at': (now() - datetime.timedelta(hours=hours)).isoformat()}
METALS = [{'k': k, 'sym': s, 'unit': 'oz', 'price': p, 'prev': p * 0.99, 'ch24': 1.0, 'ch7': 2.0, 'spark': [p * 0.97, p * 0.98, p]} for k, s, p in (('gold', 'GC=F', 2650.0), ('silver', 'SI=F', 31.0))]
def snap(**parts): return {'updated': now().isoformat(), 'global': {'mcap': 3e12, 'vol': 1e11, 'mcapCh24': 1, 'dom': {'btc': 60.0, 'eth': 12, 'usdt': 6.5}}, 'parts': {'metals': now().isoformat()}, 'metals': METALS,
    'top': [{'id': 'bitcoin', 'sym': 'BTC', 'name': 'Bitcoin', 'price': 60415, 'ch24': 1}, {'id': 'ethereum', 'sym': 'ETH', 'name': 'Ethereum', 'price': 2000, 'ch24': 1}], 'rainbow': RB, **{k: v for k, v in parts.items() if v is not None}}
clean = lambda t: ''.join(c for c in t if not '⁦' <= c <= '⁩').replace('‎', '').replace('‏', '')
ROWS = "[...document.querySelectorAll('.xm-row')].map(r=>[r.dataset.k, r.className.split(' ')[1], r.querySelector('.xm-cur').textContent, r.querySelector('.xm-sub').innerText.replace(/\\s+/g,' '), (r.querySelector('.xm-more')||{}).textContent||''])"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        cur = {'s': snap(mvrv=mvrv(), dxy=dxy(), funding=funding())}
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(cur['s'])))
        ctx.route('**/prices/m/rainbow.json', lambda r: r.fulfill(status=404, body='{}'))
        ctx.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        def ready():
            if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
            pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000)
        def hub(hash=''):
            pg.goto('about:blank'); pg.goto(S.SITE + '/market.html' + hash); pg.wait_for_timeout(600); ready(); pg.wait_for_timeout(1800)
        # ── Market Hub: ⚖️ BTC Funding ──
        hub(); pg.evaluate("try{['samsam_mkt_fund_open','samsam_mkt_rb_open','samsam_mk_view'].forEach(k=>localStorage.removeItem(k))}catch(e){}"); hub()
        core = pg.evaluate("(()=>{const f=Samsam.core.fundingNow(%s,Date.now());return f&&{rate:f.rate,yr:f.yr,k:f.k,n:f.n,missing:f.missing,word:Samsam.core.fundingWord(f.rate,false),short:Samsam.core.fundingWord(f.rate,false,true)}})()" % json.dumps(cur['s']['funding']))
        sm = clean(pg.inner_text('#fdSum'))
        check(f'{name}: the BTC Funding card is there, closed — the rate, its state, and the venues that are not in it', pg.is_visible('#fundCard') and not pg.is_visible('#fdBody') and pg.get_attribute('#fdTog', 'aria-expanded') == 'false' and sm == '+0.0044% · calm · without Binance and Bybit', sm)
        check(f'{name}: …the same reading as the core gives the bot (state "rest", 5 venues, a year at this rate +4.8%)', core and core['k'] == 'rest' and core['n'] == 5 and core['missing'] == ['Binance', 'Bybit'] and core['short'] in sm and abs(core['yr'] - 4.818) < 0.01, core)
        pg.click('#fdTog'); pg.wait_for_timeout(300)
        top = [clean(pg.inner_text(x)) for x in ('#fdV', '#fdW', '#fdM7', '#fdYr', '#fdOi')]
        check(f'{name}: open — +0.0044% per 8 hours, "Calm — at or under the resting rate", the 7-day mean, a year at this rate, the open interest', pg.is_visible('#fdBody') and '+0.0044%' in top[0] and 'per 8 hours' in top[0] and top[1] == core['word'] == 'Calm — at or under the resting rate' and top[2] == '+0.0016%' and top[3] == '+4.8%' and top[4] == '$9.34B' and pg.evaluate("localStorage.getItem('samsam_mkt_fund_open')") == '1', top)
        tbl = [clean(x) for x in pg.evaluate("[...document.querySelectorAll('#fdTbl > :not(.h)')].map(x=>x.textContent)")]
        check(f'{name}: …every venue with its own rate and open interest', tbl == ['Hyperliquid', '+0.0100%', '$2.32B', 'Bitget', '+0.0018%', '$2.31B', 'OKX', '+0.0003%', '$1.96B', 'Gate', '+0.0069%', '$1.95B', 'Deribit', '+0.0003%', '$802M'], tbl)
        note = clean(pg.inner_text('#fdNote'))
        check(f'{name}: …and in plain words: one rate from 5 venues weighted by open interest — without Binance and Bybit; a mood, not a signal', 'One rate from 5 venues, weighted by open interest — without Binance and Bybit' in note and 'not as a signal' in note and 'Not financial advice' in note and not any(w in note.lower() for w in (' buy', ' sell')), note)
        sw = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(f'{name}: …nothing sideways; the card has its hint', sw <= 0 and pg.evaluate("!!document.querySelector('#fundCard .cp-hint[data-hint=funding]') && !!(window.CPHints ? true : true)"), sw)
        # when the relay hands Binance over, the note changes by itself
        cur['s'] = snap(mvrv=mvrv(), dxy=dxy(), funding=funding(extra=['Binance', 0.005, 9e9], rate=0.0047)); hub()
        note = clean(pg.inner_text('#fdNote')); rows = pg.evaluate("document.querySelectorAll('#fdTbl > b').length")
        check(f'{name}: Binance in the snapshot → 6 venues, Binance first, and only Bybit is named as missing', rows == 6 and pg.evaluate("document.querySelector('#fdTbl > b').textContent").replace('⁦', '').replace('⁩', '') == 'Binance' and 'One rate from 6 venues' in note and 'without Bybit' in note and 'Binance and' not in note and clean(pg.inner_text('#fdSum')).endswith('without Bybit'), note)
        # crowded shorts keep their sign and their word
        cur['s'] = snap(funding=funding(rate=-0.0123)); hub()
        check(f'{name}: a negative rate keeps its sign: "−0.0123%" · "Crowded shorts — shorts paying a lot"', '−0.0123%' in clean(pg.inner_text('#fdV')) and clean(pg.inner_text('#fdW')) == 'Crowded shorts — shorts paying a lot' and clean(pg.inner_text('#fdYr')) == '−13.5%', clean(pg.inner_text('#fdV')))
        for label, part in (('a part 7 hours old', funding(hours=7)), ('no part', None)):
            cur['s'] = snap(funding=part); hub()
            check(f'{name}: {label} → the card is not shown (never a stale rate)', not pg.is_visible('#fundCard'))
        # ── Market Hub: MVRV in the rainbow card ──
        cur['s'] = snap(mvrv=mvrv(), dxy=dxy(), funding=funding()); pg.evaluate("localStorage.setItem('samsam_mkt_rb_open','1')"); hub()
        mv = clean(pg.inner_text('#rbMvrv')).replace('\n', ' ')
        check(f'{name}: the rainbow card has an MVRV row — the ratio, the market\'s average cost, the close against it', 'MVRV 1.14' in mv and 'Market’s average cost $53,033' in mv and 'The close is 14% above it' in mv, mv)
        check(f'{name}: …each cycle\'s highest (2013 on), "a reference, not a floor", and the source by name', 'Each cycle’s highest: 2013: 5.88 · 2017: 4.72 · 2021: 3.96 · 2024: 2.74' in mv and 'a reference, not a floor' in mv and 'Source: Coin Metrics' in mv and '2011' not in mv, mv)
        cur['s'] = snap(mvrv=mvrv(back=6)); hub()
        check(f'{name}: a ratio whose day ended over 4 days ago → no MVRV row (the rainbow card stays)', pg.is_visible('#rbCard') and pg.locator('#rbMvrv').count() == 0)
        # ── Market Hub → Metals: 💵 the dollar index ──
        cur['s'] = snap(mvrv=mvrv(), dxy=dxy(), funding=funding()); hub('#metals'); pg.wait_for_timeout(500)
        dx = clean(pg.inner_text('#asDxy')).replace('\n', ' ') if pg.locator('#asDxy').count() else ''
        check(f'{name}: Metals — the US Dollar Index card: 103.87, today +0.19%, 5 days −0.03%', 'US Dollar Index (DXY)' in dx and '103.87' in dx and 'Today +0.19%' in dx and '5 days −0.03%' in dx, dx)
        lvl = clean(pg.inner_text('#asDxyLvl')) if pg.locator('#asDxyLvl').count() else ''
        check(f'{name}: …under the number, its level in words — "Moderate strength" (100 – 105), the same word the core gives the bot\'s AI', lvl == 'Moderate strength 100 – 105' and pg.evaluate("Samsam.core.dxyWord(103.872) === 'Moderate strength' && Samsam.core.dxyNow(%s, Date.now()).k === 'mid'" % json.dumps(cur['s']['dxy'])), lvl)
        pos = pg.evaluate("(()=>{const i=document.querySelector('#asDxy .as-rng i');return i?parseFloat(i.style.left):null})()"); want = (103.872 - 96.22) / (104.32 - 96.22) * 100
        check(f'{name}: …its place in the 52-week range (96.22 → 104.32): the marker at {want:.1f}%, low on the left in both languages', pos is not None and abs(pos - want) < 0.2 and '96.22' in dx and '104.32' in dx and '52-week range' in dx and pg.evaluate("getComputedStyle(document.querySelector('#asDxy .as-rng')).direction") == 'ltr', (pos, dx))
        src = clean(pg.inner_text('#vMetals .as-src'))
        check(f'{name}: …its source is named under the cards; no sentence about what the dollar does to anything', 'Dollar index: Yahoo Finance (DX-Y.NYB), delayed.' in src and not any(w in dx.lower() for w in ('crypto', 'bitcoin', 'inverse', 'pressure')) and pg.evaluate("!!document.querySelector('#asDxy .cp-hint[data-hint=dxy]')"), src)
        pg.click('#asDxy .cp-hint'); pg.wait_for_timeout(400); dh = pg.inner_text('.cph') if pg.query_selector('.cph') else ''; pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        check(f'{name}: …its ⓘ: the five levels with how often each held, 100 as the base (under it in 74% of quarters), and what was MEASURED — gold 68% of weeks, Bitcoin 53%', all(w in dh for w in ('Weak dollar', 'Below the base of 100', 'Moderate strength', 'High strength', 'Rare strength', 'under 100 in 74%', '68% of weeks', '53% of weeks', 'close to chance', 'not a rule')) and 'tighten' not in dh.lower(), dh[:400])
        check(f'{name}: …the metals are still there beside it, nothing sideways', pg.locator('#vMetals .as-metal').count() == 3 and pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0, pg.locator('#vMetals .as-metal').count())
        # the five levels, at their edges; and a change that rounds to 0.00 has no sign and no colour (it showed a red "−0.00%")
        lv = pg.evaluate("[60, 89.99, 90, 99.99, 100, 104.99, 105, 109.99, 110, 150].map(v => Samsam.core.dxyWord(v)).join('|')")
        check(f'{name}: the levels: under 90 weak · 90–100 below the base · 100–105 moderate · 105–110 high · 110 and over rare', lv == 'Weak dollar|Weak dollar|Below the base of 100|Below the base of 100|Moderate strength|Moderate strength|High strength|High strength|Rare strength|Rare strength', lv)
        for price, word, rng in ((112.4, 'Rare strength', 'over 110'), (88.0, 'Weak dollar', 'under 90')):
            d2 = dxy(); d2.update(price=price, ch7=-0.003, ch24=0.004, hi52=max(d2['hi52'], price), lo52=min(d2['lo52'], price)); cur['s'] = snap(dxy=d2); hub('#metals'); pg.wait_for_timeout(400)
            z = pg.evaluate("[...document.querySelectorAll('#asDxy .as-chs .as-pc')].map(e=>[e.textContent.replace(/[\\u2066-\\u2069]/g,''), e.className, getComputedStyle(e).color === getComputedStyle(document.querySelector('#asDxy .as-chs')).color])")
            check(f'{name}: {price} → "{word}" ({rng}); a change of −0.003% reads "0.00%" — no sign, no red, no green', clean(pg.inner_text('#asDxyLvl')) == f'{word} {rng}' and z == [['0.00%', 'as-pc', True], ['0.00%', 'as-pc', True]], (clean(pg.inner_text('#asDxyLvl')), z))
        cur['s'] = snap(); hub('#metals'); pg.wait_for_timeout(400)
        check(f'{name}: no dollar part → no card, the metals alone', pg.locator('#asDxy').count() == 0 and pg.locator('#vMetals .as-metal').count() == 2)
        # Arabic
        cur['s'] = snap(mvrv=mvrv(), dxy=dxy(), funding=funding()); pg.evaluate("localStorage.setItem('cp-lang','ar'); localStorage.setItem('samsam_mkt_fund_open','1'); localStorage.setItem('samsam_mkt_rb_open','1')"); hub()
        an = clean(pg.inner_text('#fdNote')); asum = clean(pg.inner_text('#fdSum')); ak = clean(pg.inner_text('#fundCard .mk-k')).strip()
        check(f'{name}: Arabic — "تمويل البيتكوين", "هادئ", "بدون Binance و Bybit", the note in Arabic with the venues named', ak == 'تمويل البيتكوين' and asum == '+0.0044% · هادئ · بدون Binance و Bybit' and clean(pg.inner_text('#fdW')) == 'هادئ — عند المعدل الأساسي أو أقل' and 'معدل واحد من 5 منصات، موزون بالعقود المفتوحة — بدون Binance و Bybit' in an and 'ليست نصيحة مالية' in an and 'venues' not in an, (ak, asum, an))
        check(f'{name}: Arabic — the numbers keep their shape (each a left-to-right piece)', pg.evaluate("[...document.querySelectorAll('#fdV bdi, #fdM7 bdi, #fdYr bdi, #fdOi bdi, #fdTbl bdi')].every(b=>b.dir==='ltr') && document.querySelectorAll('#fdTbl bdi').length===15"))
        amv = clean(pg.inner_text('#rbMvrv')).replace('\n', ' ')
        check(f'{name}: Arabic — the MVRV row: "مؤشر MVRV", "متوسط تكلفة السوق $53,033", "الإغلاق فوقه بـ 14%", "المصدر: Coin Metrics"', 'مؤشر MVRV' in amv and 'متوسط تكلفة السوق $53,033' in amv and 'الإغلاق فوقه بـ 14%' in amv and 'المصدر: Coin Metrics' in amv and 'أعلى قراءة في كل دورة' in amv and 'مرجع، وليس قاعاً' in amv and not any(w in amv for w in ('average', 'Source', 'close')), amv)
        hub('#metals'); pg.wait_for_timeout(500); adx = clean(pg.inner_text('#asDxy')).replace('\n', ' ')
        check(f'{name}: Arabic — "مؤشر الدولار الأمريكي (DXY)", "اليوم", "5 أيام", "نطاق 52 أسبوعاً"; the range still runs low → high from the left', 'مؤشر الدولار الأمريكي (DXY)' in adx and 'اليوم +0.19%' in adx and '5 أيام −0.03%' in adx and 'نطاق 52 أسبوعاً' in adx and 'قوة معتدلة 100 – 105' in adx and pg.evaluate("(()=>{const s=[...document.querySelectorAll('#asDxy .as-rngl span')];return s[0].getBoundingClientRect().left < s[2].getBoundingClientRect().left && s[0].textContent==='96.22'})()") and 'مؤشر الدولار: Yahoo Finance (DX-Y.NYB)، بتأخير.' in clean(pg.inner_text('#vMetals .as-src')), adx)
        pg.evaluate("localStorage.setItem('cp-lang','en'); localStorage.removeItem('samsam_mk_view')")
        # ── Plan → Exit: MVRV, the third reading of Bitcoin Valuation ──
        def open_exit():
            pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_timeout(500); ready(); pg.wait_for_timeout(500)
            if not pg.is_visible('#exitPane'): pg.click('#tabExit')
            pg.wait_for_timeout(1200)
            if not pg.evaluate("!!document.querySelector('.xm-card.open')"): pg.click('.xm-card .xs-head'); pg.wait_for_timeout(300)
        open_exit(); pg.evaluate("Samsam.saveExit({ tab: 'exit', targets: null, plan: [] })"); pg.wait_for_timeout(900); open_exit()
        rows = pg.evaluate(ROWS); mr = rows[5] if len(rows) == 6 else None
        grp = pg.evaluate("[...document.querySelectorAll('.xm-card .xm-gh')].map(h=>[h.querySelector('.xm-gt').textContent, [...h.nextElementSibling.querySelectorAll('.xm-row')].map(r=>r.dataset.k).join()])")
        check(f'{name}: Exit — six indicators in two groups: Market Structure (3) · Bitcoin Valuation (rainbow, Pi Cycle, MVRV)', grp == [['Market Structure', 'btcD,usdtD,ethBtc'], ['Bitcoin Valuation', 'rainbow,pi,mvrv']], grp)
        check(f'{name}: Exit — MVRV 1.14 against 3.00 until you choose; under it the market\'s average cost and the source', mr and mr[1] == 'wait' and mr[2] == '1.14' and 'Target ≥ 3.00' in mr[3] and mr[4] == 'Market’s average cost $53,033 · Source: Coin Metrics' and pg.evaluate("Samsam.getState().exit.targets.mvrv") == 3 and pg.inner_text('.xm-row[data-k=mvrv] .xm-name') == 'MVRV', mr)
        sums = pg.inner_text('.xm-sums')
        check(f'{name}: Exit — two counts: "Market Structure: 0 of 3" · "Bitcoin Valuation: 0 of 3"', 'Market Structure: 0 of 3' in sums and 'Bitcoin Valuation: 0 of 3' in sums and 'of 6' not in sums, sums)
        hd = pg.evaluate("[...document.querySelectorAll('.xm-card .xm-gh')].map(h=>[h.querySelector('.xm-gt').textContent, h.querySelector('.xm-gc').textContent, h.querySelector('.cp-hint').dataset.hint, parseFloat(getComputedStyle(h).fontSize) > parseFloat(getComputedStyle(document.querySelector('.xm-sum-i')).fontSize), getComputedStyle(h).borderBottomStyle])")
        check(f'{name}: Exit — each group has its own headed line: the name (larger than the chips), its own ⓘ, its count, a rule under it', hd == [['Market Structure', '0 of 3', 'exitStructure', True, 'solid'], ['Bitcoin Valuation', '0 of 3', 'exitValuation', True, 'solid']], hd)
        shown = "[...document.querySelectorAll('.xm-card .xm-gh .xm-gt')].map(h=>h.textContent).join() + '|' + document.querySelectorAll('.xm-card .xm-row').length + '|' + [...document.querySelectorAll('.xm-sum-i')].map(b=>b.getAttribute('aria-pressed')).join()"
        pg.click('.xm-sum-i[data-g=v]'); pg.wait_for_timeout(250); f1 = pg.evaluate(shown)
        pg.click('.xm-sum-i[data-g=s]'); pg.wait_for_timeout(250); f2 = pg.evaluate(shown)
        pg.click('.xm-sum-i[data-g=s]'); pg.wait_for_timeout(250); f3 = pg.evaluate(shown)
        check(f'{name}: Exit — the two counts are filters: a tap shows that group alone, the other chip shows the other, a second tap brings both back', f1 == 'Bitcoin Valuation|3|false,true' and f2 == 'Market Structure|3|true,false' and f3 == 'Market Structure,Bitcoin Valuation|6|false,false' and pg.evaluate("[...document.querySelectorAll('.xm-sum-i')].every(b=>b.tagName==='BUTTON')"), (f1, f2, f3))
        pg.click('.xm-card .xs-title'); pg.wait_for_timeout(250); closed = pg.evaluate("document.querySelectorAll('.xm-card .xm-row').length"); pg.click('.xm-sum-i[data-g=v]'); pg.wait_for_timeout(250); f4 = pg.evaluate(shown)
        check(f'{name}: Exit — on the folded card a chip opens it on its own group; the counts on the chips never change with the filter', closed == 0 and f4 == 'Bitcoin Valuation|3|false,true' and 'Market Structure: 0 of 3' in pg.inner_text('.xm-sums') and 'Bitcoin Valuation: 0 of 3' in pg.inner_text('.xm-sums'), (closed, f4))
        pg.click('.xm-gh[data-g=v] .cp-hint'); pg.wait_for_timeout(400); ht = (pg.inner_text('.cph') if pg.query_selector('.cph') else '') + '|' + (pg.inner_text('.cph h3') if pg.query_selector('.cph') else '')
        check(f'{name}: Exit — the group\'s ⓘ opens its own explanation (and is not a filter tap)', 'Whether Bitcoin\'s own price has reached a high zone against its history' in ht.replace('’', "'") and ht.endswith('|Bitcoin Valuation') and 'Coin Metrics' in ht and pg.evaluate(shown) == 'Bitcoin Valuation|3|false,true', ht[-300:])
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        pg.click('.xm-sum-i[data-g=s]'); pg.wait_for_timeout(250); pg.click('.xm-gh[data-g=s] .cp-hint'); pg.wait_for_timeout(400); hs = pg.inner_text('.cph') if pg.query_selector('.cph') else ''; pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        check(f'{name}: Exit — Market Structure\'s ⓘ: where the money is moving; signs of a late cycle, not a verdict that the top is in', 'Where the money is moving' in hs and 'late in a cycle' in hs and 'not a verdict that the top is in' in hs, hs[:300])
        pg.click('.xm-sum-i[data-g=s]'); pg.wait_for_timeout(250)   # both groups again
        check(f'{name}: Exit — both groups are back', pg.evaluate(shown) == 'Market Structure,Bitcoin Valuation|6|false,false', pg.evaluate(shown))
        w = pg.evaluate("[...document.querySelectorAll('.xm-rows[data-g=v] .xm-row')].map(r=>Math.round(r.getBoundingClientRect().width))")
        check(f'{name}: Exit — the three valuation rows share the width, nothing sideways', len(w) == 3 and max(w) - min(w) <= 2 and pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 0 and pg.evaluate("[...document.querySelectorAll('.xm-row')].every(r=>r.scrollWidth<=r.clientWidth+1)"), w)
        pg.click('[data-act=tg-edit]'); pg.wait_for_timeout(300); mn = clean(pg.inner_text('#xmMvNote'))
        check(f'{name}: Exit — the field starts at 3 (1–10, steps of 0.1); the note says what it measures, each cycle\'s highest, and the source', pg.input_value('[data-tg=mvrv]') == '3' and pg.get_attribute('[data-tg=mvrv]', 'min') == '1' and pg.get_attribute('[data-tg=mvrv]', 'max') == '10' and pg.get_attribute('[data-tg=mvrv]', 'step') == '0.1' and 'market value ÷ its realized value' in mn and 'Each cycle’s highest: 2013: 5.88 · 2017: 4.72 · 2021: 3.96 · 2024: 2.74.' in mn and 'Source: Coin Metrics' in mn and '2011' not in mn, mn)
        pg.fill('[data-tg=mvrv]', '1.2'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1500); mr = pg.evaluate(ROWS)[5]
        check(f'{name}: Exit — level 1.2 saved to the cloud; 1.14 is within 10% of it → Near', pg.evaluate("Samsam.getState().exit.targets.mvrv") == 1.2 and mr[1] == 'near' and 'Target ≥ 1.20' in mr[3] and 'Near' in mr[3], mr)
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=mvrv]', '1.1'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1500); mr = pg.evaluate(ROWS)[5]
        check(f'{name}: Exit — level 1.1 → Reached, counted in Bitcoin Valuation only (1 of 3; market structure 0 of 3)', mr[1] == 'hit' and 'Reached' in mr[3] and 'Bitcoin Valuation: 1 of 3' in pg.inner_text('.xm-sums') and 'Market Structure: 0 of 3' in pg.inner_text('.xm-sums'), (mr, pg.inner_text('.xm-sums')))
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=mvrv]', '40'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1200)
        check(f'{name}: Exit — a level outside 1–10 is not kept (back to 3)', pg.evaluate("Samsam.getState().exit.targets.mvrv") == 3)
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=mvrv]', '2.456'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1200)
        check(f'{name}: Exit — two decimals are kept (2.456 → 2.46); the other targets are untouched', pg.evaluate("Samsam.getState().exit.targets.mvrv") == 2.46 and pg.evaluate("Samsam.getState().exit.targets.rainbow") == 6 and pg.evaluate("Samsam.getState().exit.targets.pi") == 100)
        pg.click('[data-act=tg-edit]'); pg.click('[data-act=tg-reset]'); pg.wait_for_timeout(1200)
        check(f'{name}: Exit — Reset → 3 again', pg.evaluate("Samsam.getState().exit.targets.mvrv") == 3 and pg.evaluate("Samsam.getState().exit.targets.isDefault"))
        # Plan: the market's average cost under Bitcoin's Buy At (BTC only)
        pg.click('#tabAccum'); pg.wait_for_timeout(700)
        nt = pg.evaluate("[costNote({sym:'BTC'}, {currentPrice: 60415}), costNote({sym:'BTC'}, {currentPrice: 42426.4}, true), costNote({sym:'ETH'}, {currentPrice: 60000}), costNote({sym:'BTC'}, {currentPrice: 0}), costNote({sym:'BTC'}, {currentPrice: 53100})]")
        check(f'{name}: Plan — under Bitcoin\'s Buy At: "Market’s average cost $53,033 · the price is 14% above it · Source: Coin Metrics" (and "under it", "on it"); no other coin has it', 'Market’s average cost $53,033 · the price is 14% above it · Source: Coin Metrics' in nt[0] and 'acc-set-note' in nt[0] and 'the price is 20% under it' in nt[1] and 'acc-set-note' not in nt[1] and nt[2] == '' and nt[3] == '' and 'the price is on it' in nt[4], nt)
        pg.click('#tabExit'); pg.wait_for_timeout(700)
        # Arabic
        pg.evaluate("localStorage.setItem('cp-lang','ar')"); open_exit()
        ar = [clean(x) if isinstance(x, str) else x for x in pg.evaluate(ROWS)[5]]; anm = clean(pg.inner_text('.xm-row[data-k=mvrv] .xm-name')); asum = clean(pg.inner_text('.xm-sums'))
        check(f'{name}: Arabic Exit — "مؤشر MVRV", "متوسط تكلفة السوق $53,033 · المصدر: Coin Metrics", "تقييم البيتكوين: 0 من 3"', anm == 'مؤشر MVRV' and ar[2] == '1.14' and ar[4] == 'متوسط تكلفة السوق $53,033 · المصدر: Coin Metrics' and 'تقييم البيتكوين: 0 من 3' in asum, (anm, ar, asum))
        ahd = [[clean(x) for x in r] for r in pg.evaluate("[...document.querySelectorAll('.xm-card .xm-gh')].map(h=>[h.querySelector('.xm-gt').textContent, h.querySelector('.xm-gc').textContent])")]
        pg.click('.xm-gh[data-g=s] .cp-hint'); pg.wait_for_timeout(400); ahs = pg.inner_text('.cph') if pg.query_selector('.cph') else ''; pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        pg.click('.xm-gh[data-g=v] .cp-hint'); pg.wait_for_timeout(400); ahv = pg.inner_text('.cph') if pg.query_selector('.cph') else ''; pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        check(f'{name}: Arabic Exit — the headed lines "هيكل السوق" / "تقييم البيتكوين" with "0 من 3", and each ⓘ in Arabic', ahd == [['هيكل السوق', '0 من 3'], ['تقييم البيتكوين', '0 من 3']] and 'يقيس دوران السيولة' in ahs and 'ليست حكماً بأن القمة حدثت' in ahs and 'منطقة مرتفعة قياساً بتاريخه' in ahv and 'Coin Metrics' in ahv, (ahd, ahs[:120], ahv[:120]))
        pg.click('.xm-sum-i[data-g=v]'); pg.wait_for_timeout(250); af = clean(pg.evaluate("[...document.querySelectorAll('.xm-card .xm-gh .xm-gt')].map(h=>h.textContent).join()")); pg.click('.xm-sum-i[data-g=v]'); pg.wait_for_timeout(250)
        check(f'{name}: Arabic Exit — the filter works the same', af == 'تقييم البيتكوين' and pg.evaluate("document.querySelectorAll('.xm-card .xm-row').length") == 6, af)
        pg.click('[data-act=tg-edit]'); pg.wait_for_timeout(400); amn = clean(pg.inner_text('#xmMvNote')); alab = clean(pg.inner_text('.xm-f-rb:has([data-tg=mvrv]) span'))
        check(f'{name}: Arabic Exit — the field and its note, each year: value pair left-to-right', 'مؤشر MVRV عند أو فوق (1–10)' in alab and 'القيمة السوقية للبيتكوين ÷ قيمته المحققة' in amn and 'أعلى قراءة في كل دورة' in amn and '2013: 5.88 · 2017: 4.72 · 2021: 3.96 · 2024: 2.74' in amn and 'المصدر: Coin Metrics' in amn and pg.evaluate("[...document.querySelectorAll('#xmMvNote bdi')].every(b=>b.dir==='ltr')") and not any(w in amn for w in ('highest', 'Source', 'market value')), (alab, amn))
        pg.evaluate("localStorage.setItem('cp-lang','en')")
        # a ratio that has grown old, and no part: the row waits with "—", the group still counts 3
        for label, part in (('a ratio 6 days old', mvrv(back=6)), ('no part', None)):
            cur['s'] = snap(mvrv=part); open_exit(); r6 = pg.evaluate(ROWS)[5]
            check(f'{name}: Exit — {label} → the MVRV row shows "—" and waits; the group still counts 3', r6[1] == 'none' and r6[2] == '—' and r6[4] == '' and 'Bitcoin Valuation: 0 of 3' in pg.inner_text('.xm-sums'), r6)
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
