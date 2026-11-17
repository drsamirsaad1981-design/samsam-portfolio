"""العربية: Settings → Display → Language switches the whole app to Arabic (right-to-left) and back.
Phase 1: header, tabs, Overview, Performance, Allocation, Settings, footer. Numbers and prices stay left-to-right (+$1,234.56).
Phase 2: the Plan (Accumulation, DCA, Exit Strategy), Add / Edit transaction, a coin's History — and the ⓘ explanations."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
LEFT = r"""(()=>{const out=new Set(),w=document.createTreeWalker(document.body,4);let n;while(n=w.nextNode()){const p=n.parentElement;if(!p||!p.offsetParent||p.closest('script,style,svg,code,[data-no-tr],.brand-name,.cp-brand-n'))continue;const s=n.nodeValue.trim();if(/[a-z]{3}/.test(s)&&!/[\u0600-\u06FF@]/.test(s))out.add(s)}return [...out]})()"""
OK_EN = {'Staking', 'English', 'Cute', 'Portfolio', 'owner@example.com', 'Claude AI', 'Airdrop'}
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
        check(f'{vn}: English by default (left-to-right, no Arabic)', pg.evaluate("document.documentElement.dir") != 'rtl' and 'Overview' in pg.inner_text('#appHead .cp-ptabs'))
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_timeout(300)
        check(f'{vn}: Settings → Display has Language: English / العربية', pg.locator('[data-seg="lang"]').count() == 2 and pg.locator('[data-seg="lang"][data-v="ar"]').inner_text() == 'العربية')
        with pg.expect_navigation(): pg.click('[data-seg="lang"][data-v="ar"]')
        S.wait_ready(pg); pg.wait_for_timeout(1500)
        check(f'{vn}: the app restarts in Arabic, right-to-left', pg.evaluate("[document.documentElement.dir, document.documentElement.lang]") == ['rtl', 'ar'])
        tabs = pg.inner_text('#appHead .cp-ptabs')
        check(f'{vn}: the tabs: نظرة عامة · الأداء · التوزيع', all(w in tabs for w in ('نظرة عامة', 'الأداء', 'التوزيع')), tabs)
        check(f'{vn}: the totals: إجمالي المحفظة, إجمالي الربح', 'إجمالي المحفظة' in pg.inner_text('body') and 'إجمالي الربح' in pg.inner_text('body'))
        pos = pg.evaluate("(()=>{const r=e=>document.querySelector(e).getBoundingClientRect();return [r('.app-logo').left, r('.header-top .ss-set-hdr').left]})()")
        check(f'{vn}: the logo moves to the right, ⚙️ to the left', pos[0] > pos[1], pos)
        check(f'{vn}: the brand name stays "Cute Portfolio"', pg.inner_text('.brand-name').replace('\n', ' ').strip() == 'Cute Portfolio')
        v = pg.evaluate("[...document.querySelectorAll('#coinsStack *')].map(e=>e.firstChild&&e.firstChild.nodeType===3?e.firstChild.nodeValue:'').find(t=>/^\\u2066[+−-]?\\$/.test(t))")
        check(f'{vn}: a price keeps its sign on the left (+$… kept left-to-right)', bool(v), v)
        left = [s for s in pg.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: Overview — no English words left on screen', not left, left[:12])
        pg.evaluate("SamsamUI.ptabGo('allocation')"); pg.wait_for_timeout(1200)
        left = [s for s in pg.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: Allocation — no English words left', not left, left[:12])
        pg.evaluate("cpShell.go('performance')"); pg.wait_for_timeout(2500)
        fr = [f for f in pg.frames if 'performance.html' in f.url][0]
        check(f'{vn}: Performance is Arabic and right-to-left too', fr.evaluate("[document.documentElement.dir, getComputedStyle(document.body).direction]") == ['rtl', 'rtl'] and 'تفاصيل إجمالي الربح' in fr.inner_text('body'))
        left = [s for s in fr.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: Performance — no English words left', not left, left[:12])
        pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
        # ⓘ explanations in Arabic
        pg.evaluate("CPHint.open('totalPortfolio', null)"); pg.wait_for_timeout(200)
        h = pg.inner_text('.cph')
        check(f'{vn}: an ⓘ opens in Arabic (title, text and formula)', 'إجمالي المحفظة' in h and 'جميع عملاتك' in h and 'السعر الحالي' in h, h[:120])
        pg.evaluate("CPHint.close()")
        # Phase 2 — Add transaction, a coin's History, the Plan
        pg.evaluate("openAddTx('sell','SUI')"); pg.wait_for_timeout(400)
        t = pg.inner_text('#atxBackdrop')
        check(f'{vn}: Add Sell in Arabic', 'الكمية المباعة' in t and 'رسوم البيع' in t, t[:200])
        left = [s for s in pg.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: Add transaction — no English words left', not left, left[:12]); pg.evaluate("closeAddTx()")
        pg.goto(S.SITE + '/index.html#holdings/SUI'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        check(f'{vn}: a coin\'s page: معاملات SUI', 'معاملات SUI' in pg.inner_text('body'))
        left = [s for s in pg.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: coin page — no English words left', not left, left[:12])
        pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(600)
        pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(3000)
        fr = [f for f in pg.frames if 'accumulation.html' in f.url][0]
        b = fr.inner_text('body')
        check(f'{vn}: the Plan in Arabic (التجميع · استراتيجية الخروج · جدول الشراء الدوري)', all(w in b for w in ('التجميع', 'استراتيجية الخروج', 'إجمالي قيمة الأهداف')), b[:200])
        left = [s for s in fr.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: Plan — no English words left', not left, left[:12])
        fr.evaluate("setPlanTab('exit')"); pg.wait_for_timeout(2000)
        b = fr.inner_text('body')
        check(f'{vn}: Exit Strategy in Arabic', 'مؤشرات الخروج الكبرى' in b and 'تقدّم جني الأرباح' in b, b[:200])
        left = [s for s in fr.evaluate(LEFT) if s not in OK_EN]
        check(f'{vn}: Exit Strategy — no English words left', not left, left[:12])
        fr.evaluate("setPlanTab('accum')"); pg.wait_for_timeout(300)
        # Phase 3 — Market Hub, Altcoin Season
        pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(3500)
        fm = [f for f in pg.frames if 'market.html' in f.url][0]
        b = fm.inner_text('body')
        check(f'{vn}: Market Hub in Arabic', all(w in b for w in ('القيمة السوقية الإجمالية', 'الهيمنة السوقية', 'قائمة المتابعة')), b[:200])
        left = [s for s in fm.evaluate(LEFT) if s not in OK_EN and s not in ('SoSoValue', 'CoinGecko', 'CoinMarketCap', 'USDT', 'ETH / BTC')]
        check(f'{vn}: Market Hub — no English words left', not left, left[:12])
        lab = fm.evaluate("[...document.querySelectorAll('.mk-gauge-l span')].map(s=>[s.textContent, Math.round(s.getBoundingClientRect().left)])")
        check(f'{vn}: the Altcoin gauge reads like its colours (بيتكوين on the orange left)', lab and lab[0][0] == 'بيتكوين' and lab[0][1] < lab[1][1], lab)
        pg.evaluate("cpShell.go('altseason')"); pg.wait_for_timeout(3000)
        fa2 = [f for f in pg.frames if 'altseason.html' in f.url][0]
        left = [s for s in fa2.evaluate(LEFT) if s not in OK_EN and s not in ('CoinGecko', 'CoinMarketCap')]
        check(f'{vn}: Altcoin Season — no English words left', 'مؤشر موسم العملات البديلة' in fa2.inner_text('body') and not left, left[:12])
        pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
        pg.evaluate("SamsamSettings.open()"); pg.wait_for_timeout(300)
        st = pg.inner_text('#cpSet')
        check(f'{vn}: Settings in Arabic (الإعدادات · العرض · اللغة)', all(w in st for w in ('الإعدادات', 'العرض', 'اللغة', 'المظهر')), st[:200])
        with pg.expect_navigation(): pg.click('[data-seg="lang"][data-v="en"]')
        S.wait_ready(pg); pg.wait_for_timeout(800)
        check(f'{vn}: back to English, left-to-right', pg.evaluate("document.documentElement.dir") != 'rtl' and 'Overview' in pg.inner_text('#appHead .cp-ptabs'))
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
