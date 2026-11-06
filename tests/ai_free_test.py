"""AI report, free with the Claude app: opening the report spends nothing (a start screen with two choices);
Copy for Claude = the same instructions + data the Worker sends, then claude.ai opens; Paste report shows Claude's reply
as the same cards (from the clipboard, or a box to paste into), EN + AR; Copy / PDF work on it; switching language
doesn't call the paid Worker; the quick report still works."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
import ai_report_test_data as D
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
calls = []
def worker(route):
    calls.append(1); b = json.loads(route.request.post_data or '{}')
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'report': D.EN, 'model': 'claude-test', 'remaining': 3}))
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)), ('desktop', dict(viewport={'width': 1366, 'height': 900}, device_scale_factor=2))):
        for theme in ('light', 'dark'):
            calls.clear()
            ctx = br.new_context(**vp); S.setup(ctx); ctx.route('**/samsam-analysis.**/analyze', worker)
            ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=S.SITE)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
            pg.evaluate("(()=>{window.__open=[]; window.open=(u)=>{window.__open.push(u); return null}})()")
            pg.evaluate("openAnalysis()"); pg.wait_for_timeout(2500)
            st = pg.evaluate("({start:!!document.querySelector('#analysisBody .ai-start'), opts:document.querySelectorAll('.ai-opt').length, copyOff:document.getElementById('aiCopyBtn').disabled, icons:document.querySelectorAll('.ai-start svg').length})")
            check(f'{vn}/{theme}: opening the report shows the two choices, nothing spent {st}', st['start'] and st['opts'] == 2 and st['copyOff'] and st['icons'] >= 5 and not calls, (st, len(calls)))
            wide = pg.evaluate("[...document.querySelectorAll('#analysisModal *')].some(e=>e.getBoundingClientRect().right>innerWidth+1)")
            check(f'{vn}/{theme}: start screen fits the screen', not wide)
            pg.locator('#analysisModal .modal').screenshot(path=str(SH / f'aifree_{vn}_{theme}.png'))
            pg.click('#aiAppCopy'); pg.wait_for_timeout(1500)
            clip = pg.evaluate("navigator.clipboard.readText()")
            check(f'{vn}/{theme}: Copy for Claude = instructions + data + layout ({len(clip)} chars)', 'You are a seasoned crypto portfolio analyst' in clip and 'PORTFOLIO DATA (JSON' in clip and '"coins"' in clip and 'MARKET DATA' in clip and 'REPORT LAYOUT' in clip and 'Write the report now' in clip and 5000 < len(clip) < 90000, clip[:200])
            check(f'{vn}/{theme}: …and the Claude app opens', pg.evaluate("window.__open") == ['https://claude.ai/new'], pg.evaluate("window.__open"))
            check(f'{vn}/{theme}: button says Copied', 'Copied' in pg.inner_text('#aiAppCopy'))
            # Claude's reply on the clipboard → Paste report
            pg.evaluate("t => navigator.clipboard.writeText(t)", D.EN)
            pg.click('#aiAppPaste'); pg.wait_for_selector('#analysisBody .analysis-content[lang=en]', timeout=5000)
            r = pg.evaluate("({secs:document.querySelectorAll('.ai-sec').length, meta:document.querySelector('.analysis-meta').innerText, copy:!document.getElementById('aiCopyBtn').disabled, pdf:!document.getElementById('aiPdfBtn').disabled})")
            check(f'{vn}/{theme}: pasted reply shows as the cards, marked Claude app, Copy/PDF on {r}', r['secs'] == 8 and 'Claude app' in r['meta'] and r['copy'] and r['pdf'], r)
            # language switch after a pasted report → start screen, no paid call
            pg.click('#langArBtn'); pg.wait_for_timeout(1500)
            check(f'{vn}/{theme}: switching language after a pasted report → start screen, no Worker call', pg.evaluate("!!document.querySelector('.ai-start')") and not calls, len(calls))
            ar = pg.evaluate("({dir:document.querySelector('.ai-start').dir, b1:document.getElementById('aiAppCopy').innerText.trim(), q:document.querySelector('.ai-quick').innerText.trim()})")
            check(f'{vn}/{theme}: Arabic → the steps in Arabic, right to left {ar}', ar['dir'] == 'rtl' and ar['b1'] == 'نسخ لـ Claude' and ar['q'] == 'إنشاء التقرير', ar)
            pg.locator('#analysisModal .modal').screenshot(path=str(SH / f'aifree_ar_{vn}_{theme}.png'))
            pg.click('#aiAppCopy'); pg.wait_for_timeout(2500)
            clip = pg.evaluate("navigator.clipboard.readText()")
            check(f'{vn}/{theme}: Arabic → the copied instructions are Arabic', clip.startswith('أنت محلل محترف') and 'شكل التقرير' in clip and 'بيانات المحفظة (JSON' in clip and 'بيانات السوق' in clip and clip.rstrip().endswith('اكتب التقرير الآن بالعربية.') and 'REPORT LAYOUT' not in clip and 'You are a seasoned' not in clip, clip[:200])
            check(f'{vn}/{theme}: Arabic → button says تم النسخ', 'تم النسخ' in pg.inner_text('#aiAppCopy'))
            # clipboard with something else → the paste box; Arabic reply typed in → RTL cards
            pg.evaluate("navigator.clipboard.writeText('hello')")
            pg.click('#aiAppPaste'); pg.wait_for_timeout(500)
            check(f'{vn}/{theme}: not a report on the clipboard → a box to paste into', pg.is_visible('#aiPasteTxt'))
            pg.click('.ai-paste-b button'); pg.wait_for_timeout(200)
            check(f'{vn}/{theme}: empty box → a hint, no report', pg.is_visible('#aiPasteErr') and not pg.evaluate("!!document.querySelector('.analysis-content')"))
            pg.fill('#aiPasteTxt', D.AR); pg.click('.ai-paste-b button'); pg.wait_for_selector('#analysisBody .analysis-content[lang=ar]', timeout=5000)
            check(f'{vn}/{theme}: Arabic reply → right-to-left cards', pg.evaluate("document.querySelector('.analysis-content').dir") == 'rtl' and pg.locator('.ai-sec').count() == 8)
            pg.locator('#analysisModal .modal').screenshot(path=str(SH / f'aifree_pasted_{vn}_{theme}.png'))
            # the quick report still works
            pg.evaluate("renderAiStart()"); pg.click('.ai-quick'); pg.wait_for_selector('#analysisBody .analysis-content[lang=ar]', timeout=20000)
            check(f'{vn}/{theme}: Quick report (Create report) still calls the Worker once', len(calls) == 1, len(calls))
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
