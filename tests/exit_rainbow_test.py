"""🌈 Plan → Exit Strategy: the Bitcoin rainbow band is the 4th macro indicator — the band that holds (two daily closes,
samsam-core.js → rainbowRead on the snapshot's small part) against the band you choose (6 until you do), with the highest
band each past cycle held under the field. English and Arabic; a missing or old file leaves the row waiting."""
import sys, pathlib, json, datetime
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
import math
F = {'a': -16.1839, 'b': 5.5943, 'lo': -0.746, 'hi': 1.216, 'share': [0.8, 11.8, 33.5, 24.8, 14.5, 9.8, 2.8, 1.7, 0.2], 'to': '2026-11-22'}
W9 = (F['hi'] - F['lo']) / 9
today = datetime.datetime.now(datetime.timezone.utc).date(); GEN = datetime.date(2009, 1, 3)
def close(back, band): d = today - datetime.timedelta(days=back); line = 10 ** (F['a'] + F['b'] * math.log10((d - GEN).days)); return [d.isoformat(), line * 10 ** (F['lo'] + (band - 0.5) * W9)]
def rainbow(bands, held, since='2026-11-05'): return {'v': 1, 'fit': F, 'held': {'band': held, 'since': since}, 'closes': [close(len(bands) - i, b) for i, b in enumerate(bands)], 'peaks': [[2011, 9, '2011-06-08'], [2013, 9, '2013-04-09'], [2017, 8, '2017-12-07'], [2021, 6, '2021-02-19'], [2024, 5, '2024-12-16']]}
def snap(rb): return {'updated': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'global': {'mcap': 3e12, 'vol': 1e11, 'mcapCh24': 1, 'dom': {'btc': 60.0, 'eth': 12, 'usdt': 6.5}},
        'top': [{'id': 'bitcoin', 'sym': 'BTC', 'name': 'Bitcoin', 'price': 60000, 'ch24': 1}, {'id': 'ethereum', 'sym': 'ETH', 'name': 'Ethereum', 'price': 2000, 'ch24': 1}], **({'rainbow': rb} if rb else {})}
ROWS = "[...document.querySelectorAll('.xm-row')].map(r=>[r.dataset.k, r.className.split(' ')[1], r.querySelector('.xm-cur').textContent, r.querySelector('.xm-sub').innerText.replace(/\\s+/g,' '), (r.querySelector('.xm-more')||{}).textContent||''])"
with sync_playwright() as p:
    br = p.chromium.launch()
    for name, vp in (('phone', dict(viewport={'width': 390, 'height': 800}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        cur = {'s': snap(rainbow([2, 2, 3], 2))}
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.route('**/prices/m/market.json', lambda r: r.fulfill(status=200, content_type='application/json', body=json.dumps(cur['s'])))
        ctx.route('https://api.coingecko.com/api/v3/global**', lambda r: r.fulfill(status=429, body='{}'))
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        def open_exit():
            pg.goto(S.SITE + '/accumulation.html'); pg.wait_for_timeout(500)
            if pg.locator('#samsamSignInBtn').is_visible(): pg.click('#samsamSignInBtn')
            pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=15000); pg.wait_for_timeout(500)
            if not pg.is_visible('#exitPane'): pg.click('#tabExit')
            pg.wait_for_timeout(1200)
            if not pg.evaluate("!!document.querySelector('.xm-card.open')"): pg.click('.xm-card .xs-head'); pg.wait_for_timeout(300)
        open_exit()
        pg.evaluate("Samsam.saveExit({ tab: 'exit', targets: null, plan: [] })"); pg.wait_for_timeout(900); open_exit()
        rows = pg.evaluate(ROWS); rb = rows[3] if len(rows) == 4 else None
        check(f'{name}: four indicators, the last is the Bitcoin Rainbow', len(rows) == 4 and [r[0] for r in rows] == ['btcD', 'usdtD', 'ethBtc', 'rainbow'] and pg.inner_text('.xm-row[data-k=rainbow] .xm-name') == 'Bitcoin Rainbow', rows)
        check(f'{name}: the band that holds (2 — two closes), not the last close\'s (3); its name; the last close said beside it', rb and rb[1] == 'wait' and rb[2] == 'Band 2 of 9' and rb[4] == 'Deep discount · last close in band 3', rb)
        check(f'{name}: against band 6 until you choose', rb and 'Target ≥ band 6' in rb[3] and 'Waiting' in rb[3] and pg.evaluate("Samsam.getState().exit.targets.rainbow") == 6, rb)
        check(f'{name}: "Signals Hit: 0 of 4"', 'Signals Hit: 0 of 4' in pg.inner_text('.xm-sum'), pg.inner_text('.xm-sum'))
        w = pg.evaluate("[...document.querySelectorAll('.xm-row')].map(r=>Math.round(r.getBoundingClientRect().width))"); sw = pg.evaluate("document.documentElement.scrollWidth - innerWidth")
        check(f'{name}: the four rows share the width evenly, nothing sideways', max(w) - min(w) <= 2 and sw <= 0 and pg.evaluate("[...document.querySelectorAll('.xm-row')].every(r=>r.scrollWidth<=r.clientWidth+1)"), (w, sw))
        # choose your band: the field, the note with what each cycle held
        pg.click('[data-act=tg-edit]'); pg.wait_for_timeout(300)
        note = pg.inner_text('#xmRbNote')
        check(f'{name}: the field starts at 6 (1–9, whole bands)', pg.input_value('[data-tg=rainbow]') == '6' and pg.get_attribute('[data-tg=rainbow]', 'min') == '1' and pg.get_attribute('[data-tg=rainbow]', 'max') == '9' and pg.get_attribute('[data-tg=rainbow]', 'step') == '1')
        check(f'{name}: under it, the highest band each cycle held — from the file, 2017 on — and that each stopped lower', 'The highest band each cycle held: 2017: 8 · 2021: 6 · 2024: 5.' in note and 'Each cycle stopped lower than the one before' in note and '2013' not in note, note)
        pg.fill('[data-tg=rainbow]', '3'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1500)
        t = pg.evaluate("Samsam.getState().exit.targets"); rb = pg.evaluate(ROWS)[3]
        check(f'{name}: band 3 saved to the cloud; band 2 is one under it → Close', t['rainbow'] == 3 and not t['isDefault'] and t['btcD'] == 45.9 and rb[1] == 'near' and 'Target ≥ band 3' in rb[3], (t, rb))
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=rainbow]', '2'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1500)
        rb = pg.evaluate(ROWS)[3]
        check(f'{name}: band 2 → Reached, "Signals Hit: 1 of 4"', rb[1] == 'hit' and 'Reached' in rb[3] and 'Signals Hit: 1 of 4' in pg.inner_text('.xm-sum'), (rb, pg.inner_text('.xm-sum')))
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=rainbow]', '40'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1200)
        check(f'{name}: a band outside 1–9 is not kept (back to 6)', pg.evaluate("Samsam.getState().exit.targets.rainbow") == 6)
        pg.click('[data-act=tg-edit]'); pg.fill('[data-tg=rainbow]', '2.6'); pg.click('[data-act=tg-save]'); pg.wait_for_timeout(1200)
        check(f'{name}: a band is a whole number (2.6 → 3)', pg.evaluate("Samsam.getState().exit.targets.rainbow") == 3)
        pg.click('[data-act=tg-edit]'); pg.click('[data-act=tg-reset]'); pg.wait_for_timeout(1200)
        check(f'{name}: Reset → band 6 again', pg.evaluate("Samsam.getState().exit.targets.rainbow") == 6 and pg.evaluate("Samsam.getState().exit.targets.isDefault"))
        # Arabic
        pg.evaluate("localStorage.setItem('cp-lang','ar')"); open_exit()
        ar = pg.evaluate(ROWS)[3]; nm = pg.inner_text('.xm-row[data-k=rainbow] .xm-name')
        check(f'{name}: Arabic — "قوس قزح البيتكوين", "النطاق 2 من 9", "خصم عميق · آخر إغلاق في النطاق 3", "الهدف ≥ النطاق 6"', nm == 'قوس قزح البيتكوين' and 'النطاق 2 من 9' in ar[2] and 'خصم عميق' in ar[4] and 'آخر إغلاق في النطاق 3' in ar[4] and 'الهدف ≥ النطاق 6' in ar[3], (nm, ar))
        pg.click('[data-act=tg-edit]'); pg.wait_for_timeout(400); note = ''.join(c for c in pg.inner_text('#xmRbNote') if not '\u2066' <= c <= '\u2069'); lab = pg.inner_text('.xm-f-rb span')   # (each "2017: 8" pair is held left-to-right: the isolate marks are not text)
        check(f'{name}: Arabic — each year: band pair is its own left-to-right piece (never "8 :2017")', pg.evaluate("[...document.querySelectorAll('#xmRbNote bdi')].map(b=>b.dir+'|'+b.textContent.replace(/[\\u2066-\\u2069]/g,'')).join()") == 'ltr|2017: 8,ltr|2021: 6,ltr|2024: 5')
        check(f'{name}: Arabic — the field and the note', 'نطاق قوس قزح عند أو فوق' in lab and 'أعلى نطاق ثبت فيه السعر في كل دورة' in note and '2017: 8 · 2021: 6 · 2024: 5' in note and 'كل دورة وقفت عند نطاق أقل' in note and not any(c in note for c in ('highest', 'cycle')), (lab, note))
        pg.evaluate("localStorage.setItem('cp-lang','en')")
        # an old file (the job stopped 6 days ago) and no file: the row waits with "—", the count stays of 4
        old = rainbow([2, 2, 2], 2); old['closes'] = [[(today - datetime.timedelta(days=8 - i)).isoformat(), c[1]] for i, c in enumerate(old['closes'])]
        for label, rbf in (('a file 6 days old', old), ('no file', None)):
            cur['s'] = snap(rbf); open_exit(); r4 = pg.evaluate(ROWS)[3]
            check(f'{name}: {label} → the rainbow row shows "—" and waits; still "of 4"', r4[1] == 'none' and r4[2] == '—' and r4[4] == '' and 'of 4' in pg.inner_text('.xm-sum'), r4)
        pg.click('[data-act=tg-edit]'); pg.wait_for_timeout(300)
        check(f'{name}: no file → the note explains the bands instead of the cycles', 'Nine bands around Bitcoin' in pg.inner_text('#xmRbNote'), pg.inner_text('#xmRbNote'))
        check(f'{name}: no page errors', not errs, errs)
        ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
