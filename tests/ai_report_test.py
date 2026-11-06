"""AI report: the request carries the full market picture (trends, ETF, breadth) + per-coin extras + the report layout;
the report shows as cards — summary + 7 sections with SVG icons and titles in the report's language, labelled bullets,
numbered steps (not headings), Buy / Hold / Reduce badges; English (LTR) and Arabic (RTL); light + dark; phone + computer."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:400]}'), flush=True)
EN = """**Summary**
- **Market:** A cautious, BTC-led market — dominance near 59% and stablecoin cash rising.
- **Portfolio:** Up +12.4% on cost, but 31 of 49 alts trail BTC.
- **Top action:** Add to BTC on dips; trim the weakest alts.

1. 📊 Market Overview
- **BTC trend:** -2.96% over 7 days, -11.54% over 30 days, +16.57% over 90 days.
- **BTC dominance:** 59.2% now vs 58.4% a month ago — rising slowly.
- **ETH/BTC:** 0.0331, flat over 30 days.
- **Liquidity:** USDT dominance up from 5.2% to 6.9% — money waiting on the side.
- **ETF flows:** BTC ETFs -$1.2B over 5 days; ETH ETFs -$310M.
- **Sentiment:** Fear & Greed 28 (Fear), down from 41 a week ago.
- **Altcoin Season:** 53/100; 25 of 100 coins beat BTC over 30 days.
- **Verdict:** Risk-off, Bitcoin season — protect capital and favour BTC.

2. 🥧 Portfolio Overview & Allocation
- **Value & profit:** $48,210, +$5,310 (+12.4%).
- **vs BTC:** 18 of 49 coins beat holding BTC.
  - Biggest gap: MOVR -42% vs BTC.
- **Allocation:** BTC 46.1%, Layer 1 21.3%, DeFi 12.0%.

3. 🏆 Best & Worst Performers
- **Best:** KAVA +67% (90d), OP +23.9%.
- **Worst:** MOVR -42.6% (30d), KSM -31.7%.

4. ⚠️ Risks & Concentration
- **Concentration:** BTC is 46% of the portfolio.
- **Weak coins:** 12 coins are more than 20% below their buy price.

5. 💰 Accumulation Plan Progress
- **Progress:** 7 of 12 targets met, 64% overall.
- **Still needed:** $3,420.

6. 💡 Recommendations
- **BTC — Buy:** The anchor of the portfolio; add on dips below $95,000.
- **ETH — Hold:** Flat against BTC; wait for ETF inflows.
- **MOVR — Reduce:** -42% vs BTC; the app says Sell / Convert to BTC, and I agree.

7. 🎯 Action Plan for the Next 30 Days
1. Week 1: move $500 from MOVR to BTC.
2. Week 2: buy $300 of BTC if it dips under $95,000.
3. Week 3: review the plan targets.
4. Week 4: rerun this report.
<img src=x onerror="window.__xss=1">"""
AR = """**الخلاصة**
- **السوق:** سوق حذر يقوده BTC مع سيطرة قرب 59%.
- **المحفظة:** ربح +12.4% على التكلفة، لكن 31 من 49 عملة أضعف من BTC.
- **أهم خطوة:** زيادة BTC عند الهبوط وتقليل العملات الأضعف.

1. 📊 نظرة عامة على السوق
- **اتجاه BTC:** -2.96% خلال 7 أيام و+16.57% خلال 90 يومًا.
- **سيطرة BTC:** 59.2% الآن مقابل 58.4% قبل شهر — في ارتفاع بطيء.
- **تدفقات ETF:** خروج -$1.2B من صناديق BTC خلال 5 أيام.
- **الحكم:** مرحلة عزوف عن المخاطرة — موسم البيتكوين.

2. 🥧 المحفظة والتوزيع
- **القيمة والربح:** $48,210 بربح +$5,310.

3. 🏆 الأفضل والأسوأ
- **الأفضل:** KAVA +67%.

4. ⚠️ المخاطر
- **التركّز:** BTC يمثل 46% من المحفظة.

5. 💰 خطة التجميع
- **التقدّم:** 7 من 12 هدفًا.

6. 💡 التوصيات
- **BTC — شراء:** أساس المحفظة؛ زِد عند الهبوط.
- **ETH — احتفاظ:** ثابت أمام BTC.
- **MOVR — تقليل:** أضعف من BTC بـ 42%.

7. 🎯 خطة العمل للـ 30 يومًا القادمة
- **الأسبوع 1:** نقل $500 من MOVR إلى BTC.
- **الأسبوع 2:** شراء BTC بـ $300 تحت $95,000."""
sent = []
def worker(route):
    b = json.loads(route.request.post_data or '{}'); sent.append(b)
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'report': AR if b.get('language') == 'ar' else EN, 'model': 'claude-test', 'remaining': 3}))
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            ctx = br.new_context(**vp); S.setup(ctx); ctx.route('**/samsam-analysis.**/analyze', worker)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            pg.evaluate(f"document.documentElement.setAttribute('data-theme','{theme}')")
            for lang in ('en', 'ar'):
                n0 = len(sent)
                if lang == "en": pg.evaluate("openAnalysis(); runAnalysis()")
                else: pg.click('#langArBtn')
                pg.wait_for_selector('#analysisBody .analysis-content[lang=%s]' % lang, timeout=20000); pg.wait_for_timeout(500)
                body = sent[-1] if len(sent) > n0 else {}
                ac = body.get('accumContext', ''); coins = (body.get('portfolioData') or {}).get('coins', []); st = (body.get('portfolioData') or {}).get('stats', {})
                if vn == 'phone' and theme == 'light':
                    check(f'{lang}: request asks for the report layout (summary, 7 sections, labelled bullets)', ('شكل التقرير' if lang == 'ar' else 'REPORT LAYOUT') in ac and ('**الخلاصة**' if lang == 'ar' else '**Summary**') in ac and ('شراء' if lang == 'ar' else 'Buy / Hold / Reduce') in ac and body.get('language') == lang, ac[-600:])
                    check(f'{lang}: market data has Fear & Greed + dominance', 'Fear & Greed' in ac and 'Dominance now' in ac, ac[:900])
                    c = next((x for x in coins if x['sym'] != 'BTC'), {})
                    check(f'{lang}: every coin carries weight, vs BTC, Signal, category; stats by category {dict((k, c.get(k)) for k in ("sym","weightPct","vsBtcPct","signal","catLabel","ch24"))}', all(k in c for k in ('weightPct', 'vsBtcPct', 'signal', 'catLabel', 'ch24', 'ch7')) and st.get('byCategory') and 'coinsBeatingBtc' in st and 'signalRules' in st, st.keys())
                    if lang == 'en': print('   context:', ac[ac.index('MARKET DATA'):ac.index('REPORT LAYOUT')][:1500] if 'MARKET DATA' in ac else 'none')
                r = pg.evaluate("""(()=>{const c=document.querySelector('#analysisBody .analysis-content');
                  return {dir:c.dir, secs:[...c.querySelectorAll('.ai-sec')].map(s=>s.dataset.sec||(s.classList.contains('ai-sum')?'sum':'x')),
                   titles:[...c.querySelectorAll('.ai-sec h3')].map(h=>h.innerText.trim()), svgs:c.querySelectorAll('.ai-sec h3 svg').length,
                   emoji:/[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]/u.test(c.innerText), steps:c.querySelectorAll('ol > li').length,
                   recs:[...c.querySelectorAll('.ai-rec')].map(l=>l.querySelector('.ai-sym').innerText+':'+l.querySelector('.ai-badge').className.replace('ai-badge ','')),
                   verdict:!!c.querySelector('.ai-verdict'), keys:c.querySelectorAll('.ai-k').length, sub:c.querySelectorAll('li.sub').length,
                   wide:[...c.querySelectorAll('*')].some(e=>e.getBoundingClientRect().right>innerWidth+1), html:c.innerHTML}})()""")
                want = ['sum'] + [str(i) for i in range(1, 8)]
                check(f'{vn}/{theme}/{lang}: summary + 7 section cards in order {r["secs"]}', r['secs'] == want, r['secs'])
                t1 = 'نظرة على السوق' if lang == 'ar' else 'Market Overview'
                check(f'{vn}/{theme}/{lang}: titles in the report language with an SVG icon each, no emoji {r["titles"][:3]}', r['svgs'] == 8 and not r['emoji'] and r['titles'][1] == '1. ' + t1, r['titles'])
                check(f'{vn}/{theme}/{lang}: dir {r["dir"]}', r['dir'] == ('rtl' if lang == 'ar' else 'ltr'))
                check(f'{vn}/{theme}/{lang}: Buy / Hold / Reduce badges {r["recs"]}', r['recs'] == ['BTC:ai-buy', 'ETH:ai-hold', 'MOVR:ai-reduce'], r['recs'])
                check(f'{vn}/{theme}/{lang}: verdict highlighted, labelled bullets ({r["keys"]})', r['verdict'] and r['keys'] >= 8)
                if lang == 'en':
                    check(f'{vn}/{theme}: numbered steps stay steps (4), not headings; sub-bullet shown', r['steps'] == 4 and r['sub'] == 1, (r['steps'], r['sub']))
                    check(f'{vn}/{theme}: AI text escaped, nothing ran', '<img' not in r['html'] and '&lt;img' in r['html'] and not pg.evaluate("window.__xss"))
                check(f'{vn}/{theme}/{lang}: nothing wider than the screen', not r['wide'])
                pg.locator('#analysisModal .modal').screenshot(path=str(SH / f'aireport_{vn}_{theme}_{lang}.png'))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
