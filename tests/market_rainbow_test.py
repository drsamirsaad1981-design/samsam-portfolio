"""🌈 Market Hub → the Bitcoin Rainbow card (samsam-rainbow.js): closed it shows the band that holds, its name and the strip
of nine with the last close's place; open it shows the numbers, the chart since 2010 (log scale, nine bands), a table of
every band and what each cycle held. Same reading as the bot and the Exit page (samsam-core.js → rainbowRead). English
and Arabic, phone and desktop; hidden when GitHub's file is missing or old. The prices here are made up
(tests/rainbow_fixture.mjs) — only their shape is Bitcoin's."""
import sys, pathlib, json, subprocess, datetime, re, math
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
T = pathlib.Path(__file__).parent
FX = json.loads(subprocess.run(['node', str(T / 'rainbow_fixture.mjs')], capture_output=True, text=True).stdout)
def snap(rb):
    s = json.loads((T / 'market_snap_fixture.json').read_text()); s['updated'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if rb: s['rainbow'] = rb
    return s
def oklab(h):
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; f = lambda v: v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4; r, g, b = f(r), f(g), f(b)
    l, m, s = (.4122214708 * r + .5363325363 * g + .0514459929 * b) ** (1 / 3), (.2119034982 * r + .6806995451 * g + .1073969566 * b) ** (1 / 3), (.0883024619 * r + .2817188376 * g + .6299787005 * b) ** (1 / 3)
    return (.2104542553 * l + .7936177850 * m - .0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .8086757660 * s)
dE = lambda a, b: 100 * math.dist(oklab(a), oklab(b))
READ = "(()=>{const C=Samsam.core,r=C.rainbowRead(%s,Date.now());return r&&{band:r.band,name:C.rainbowName(r.band),ar:C.rainbowName(r.band,true),close:r.close,line:r.line,vs:r.vs,lo:r.lo,hi:r.hi,pending:r.pending,edges:r.edges,share:r.share,since:r.since,pos:(Math.log10(r.close/r.line)-r.fit.lo)/(r.fit.hi-r.fit.lo)*100}})()" % json.dumps(FX['small'])
usd = lambda v: '$' + f'{round(v):,}' if v >= 100 else '$' + f'{v:.2f}'
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('small phone', dict(viewport={'width': 320, 'height': 700}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        cur = {'s': snap(FX['small']), 'full': 0}
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(cur['s'])))
        def full(r): cur['full'] += 1; r.fulfill(status=200, content_type='application/json', body=json.dumps(FX['full']))
        ctx.route('**/prices/m/rainbow.json', full)
        ctx.route('https://api.coingecko.com/**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        def go(hash=''):
            pg.goto('about:blank'); pg.goto(S.SITE + '/market.html' + hash); pg.wait_for_timeout(600)
            if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
            pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(1800)
        go(); pg.evaluate("try{localStorage.removeItem('samsam_mkt_rb_open')}catch(e){}"); go()
        want = pg.evaluate(READ)
        check(f'{name}: the card is there, closed, and the chart file is not asked for yet', pg.is_visible('#rbCard') and not pg.is_visible('#rbBody') and pg.get_attribute('#rbTog', 'aria-expanded') == 'false' and cur['full'] == 0, cur['full'])
        check(f'{name}: the summary is the band that holds and its name (the shared reading)', pg.inner_text('#rbSum') == f"Band {want['band']} of 9 · {want['name']}", (pg.inner_text('#rbSum'), want['band'], want['name']))
        segs = pg.evaluate("[...document.querySelectorAll('#rbStrip .rb-seg')].map(s=>[s.textContent, s.classList.contains('on'), getComputedStyle(s).backgroundColor, Math.round(s.getBoundingClientRect().width)])")
        check(f'{name}: nine bands in order 1…9, equal widths, only the held one marked', [s[0] for s in segs] == [str(i) for i in range(1, 10)] and [i + 1 for i, s in enumerate(segs) if s[1]] == [want['band']] and max(s[3] for s in segs) - min(s[3] for s in segs) <= 1, segs)
        pin = pg.evaluate("(()=>{const p=document.querySelector('.rb-pin').getBoundingClientRect(),b=document.querySelector('.rb-bar').getBoundingClientRect();return (p.left+p.width/2-b.left)/b.width*100})()")
        check(f'{name}: the pin stands where the last close is between the lowest and the highest edge ({pin:.1f}% vs {want["pos"]:.1f}%)', abs(pin - want['pos']) < 1.2 and (want['band'] - 1) / 9 * 100 - 12 <= pin <= want['band'] / 9 * 100 + 12, (pin, want['pos']))
        under = pg.inner_text('.rb-under')
        check(f'{name}: under the strip: how far from the trend line, and the close with its day', f"{round(abs(want['vs']))}% {'under' if want['vs'] < 0 else 'over'} the trend line" in under and ('Close ' + usd(want['close']) in under or 'Last close in band' in under), under)
        cols = pg.evaluate("SamsamRainbow.COLORS"); worst = min(dE(a, b) for i, a in enumerate(cols) for b in cols[i + 1:])
        check(f'{name}: the nine colours are measured — every pair at least 15 apart (closest {worst:.1f})', len(cols) == 9 and worst >= 15, worst)
        # open
        pg.click('#rbTog'); pg.wait_for_timeout(1500)
        check(f'{name}: a tap opens it, remembers it, and asks for the chart file once', pg.is_visible('#rbBody') and pg.get_attribute('#rbTog', 'aria-expanded') == 'true' and pg.evaluate("localStorage.getItem('samsam_mkt_rb_open')") == '1' and cur['full'] == 1, cur['full'])
        stats = pg.evaluate("[...document.querySelectorAll('.rb-stat')].map(s=>s.innerText.replace(/\\s+/g,' '))")
        check(f'{name}: four numbers — the close, the trend line, this band\'s edges, since when', len(stats) == 4 and usd(want['close']) in stats[0] and usd(want['line']) in stats[1] and usd(want['lo']) in stats[2] and usd(want['hi']) in stats[2] and 'of days since 2010' in stats[2] and str(int(want['since'][8:])) + ' ' in stats[3] and want['since'][:4] in stats[3], stats)
        rows = pg.evaluate("[...document.querySelectorAll('#rbTable tbody tr')].map(r=>[+r.dataset.b, r.classList.contains('on'), r.cells[1].innerText.trim(), r.cells[2].innerText.trim(), r.cells[3].innerText.trim()])")
        names = pg.evaluate("Samsam.core.RAINBOW_NAMES.en")
        check(f'{name}: the table: nine bands, the highest first, each with its name; the held one marked "now"', [r[0] for r in rows] == list(range(9, 0, -1)) and all(r[2].startswith(names[r[0] - 1]) for r in rows) and [r[0] for r in rows if r[1]] == [want['band']] and 'now' in [r for r in rows if r[1]][0][2], rows)
        check(f'{name}: each band\'s range is its two edges today, each share its part of the days', all(r[3] == f"{usd(want['edges'][r[0] - 1])} – {usd(want['edges'][r[0]])}" and r[4] == f"{want['share'][r[0] - 1]:.1f}%" for r in rows), rows[:3])
        ch = pg.evaluate("(()=>{const b=document.getElementById('rbChart'),s=b.querySelector('svg');if(!s)return null;const vb=s.viewBox.baseVal;return {vb:vb.width,box:Math.round(b.clientWidth),bands:s.querySelectorAll('path[fill^=\"#\"]').length,line:s.querySelectorAll('path[fill=none]').length,fills:[...s.querySelectorAll('path[fill^=\"#\"]')].map(p=>p.getAttribute('fill')),font:parseFloat(getComputedStyle(s.querySelector('text:not(.rb-bn)')).fontSize)*(s.getBoundingClientRect().width/vb.width),cross:getComputedStyle(document.getElementById('rbCross')).display}})()")
        check(f'{name}: the chart: nine bands in the strip\'s colours, the price line, drawn at the box\'s own width (labels {ch and ch["font"]:.1f}px)', ch and ch['bands'] == 9 and ch['fills'] == cols and ch['line'] == 2 and abs(ch['vb'] - ch['box']) <= 1 and ch['font'] >= 10.5 and ch['cross'] == 'none', ch)
        facts = pg.inner_text('#rbFacts')
        check(f'{name}: what each cycle held, the last moves, the day of the last weekly fit', 'The highest band each cycle held:' in facts and all(f"{x[0]}: {x[1]}" in facts for x in FX['full']['peaks']) and 'Last moves:' in facts and '→' in facts and 'The line was last fitted on' in facts, facts)
        note = pg.inner_text('#rbBody .mk-etf-note')
        check(f'{name}: the note: how it is built, and that it is not a forecast — no word telling you to buy or sell', 'It describes the past — it is not a forecast.' in note and not re.search(r'\b(buy|sell)\b', pg.inner_text('#rbCard'), re.I), note)
        sw = pg.evaluate("[document.documentElement.scrollWidth - innerWidth, ...[...document.querySelectorAll('#rbCard, #rbTable, .rb-stats, .rb-stat')].map(e=>e.scrollWidth-e.clientWidth)]")
        check(f'{name}: nothing runs off the side', max(sw) <= 1, sw)
        # hover / touch: the nearest weekly close
        pg.locator('#rbChart').scroll_into_view_if_needed(); box = pg.locator('#rbChart svg').bounding_box(); X, Y = box['x'] + box['width'] * 0.55, box['y'] + box['height'] * 0.5
        (pg.touchscreen.tap(X, Y) if vp.get('has_touch') else pg.mouse.move(X, Y)); pg.wait_for_timeout(300)
        tip = pg.inner_text('#rbTip') if pg.is_visible('#rbTip') else ''
        check(f'{name}: pointing at the chart shows that week\'s close, its day and its band', re.search(r'^\$[\d,.]+ \d{1,2} [A-Z][a-z]{2} 20\d\d\s+Band [1-9] · \w', tip) and pg.evaluate("getComputedStyle(document.getElementById('rbCross')).display") != 'none', tip)
        tb = pg.evaluate("(()=>{const t=document.getElementById('rbTip').getBoundingClientRect(),b=document.getElementById('rbChart').getBoundingClientRect();return [t.left-b.left,b.right-t.right]})()")
        check(f'{name}: the tooltip stays inside the chart', tb[0] >= -1 and tb[1] >= -1, tb)
        if name == 'desktop':
            pg.mouse.move(5, 5); pg.wait_for_timeout(200); check(f'{name}: …and goes when the pointer leaves', not pg.is_visible('#rbTip'))
        # the bot's button: market.html#rainbow opens the card and brings it into view
        pg.evaluate("localStorage.setItem('samsam_mkt_rb_open','0')"); go('#rainbow'); pg.wait_for_timeout(600)
        top = pg.evaluate("document.getElementById('rbCard').getBoundingClientRect().top")
        check(f'{name}: market.html#rainbow opens the card and scrolls to it, clear of the header', pg.is_visible('#rbBody') and 40 <= top < vp['viewport']['height'] * 0.6, top)
        # Arabic
        pg.evaluate("localStorage.setItem('cp-lang','ar'); localStorage.setItem('samsam_mkt_rb_open','1')"); go(); pg.wait_for_timeout(600)
        txt = ''.join(c for c in pg.inner_text('#rbCard') if not '⁦' <= c <= '⁩')
        check(f'{name}: Arabic — "قوس قزح البيتكوين", "النطاق {want["band"]} من 9 · {want["ar"]}"', 'قوس قزح البيتكوين' in txt and f"النطاق {want['band']} من 9 · {want['ar']}" in txt, txt[:200])
        left = [w for w in re.findall(r'[A-Za-z]{3,}', txt) if w not in ('blockchain', 'com', 'Binance')]
        check(f'{name}: Arabic — no English left in the card', not left, left[:12])
        check(f'{name}: Arabic — the strip and the chart still run left to right (1 on the left)', pg.evaluate("(()=>{const s=[...document.querySelectorAll('#rbStrip .rb-seg')];return s[0].getBoundingClientRect().left<s[8].getBoundingClientRect().left && getComputedStyle(document.getElementById('rbChart')).direction==='ltr'})()"))
        check(f'{name}: Arabic — nothing runs off the side', pg.evaluate("document.documentElement.scrollWidth - innerWidth") <= 1)
        pg.evaluate("localStorage.setItem('cp-lang','en')")
        # GitHub has no file, or its last close is over 4 days old: no card
        old = json.loads(json.dumps(FX['small'])); d0 = datetime.datetime.now(datetime.timezone.utc).date()
        old['closes'] = [[(d0 - datetime.timedelta(days=20 - i)).isoformat(), c[1]] for i, c in enumerate(old['closes'])]
        for label, rb in (('no file', None), ('a file whose last close is 6 days old', old)):
            cur['s'] = snap(rb); go(); check(f'{name}: {label} → the card is not shown', not pg.is_visible('#rbCard') and pg.is_visible('.mk-list'))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
