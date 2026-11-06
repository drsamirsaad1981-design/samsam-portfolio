"""AI report Copy + PDF: buttons off until a report is there; Copy puts the title + the whole report text on the clipboard;
PDF prints only the report (title line, every card, white page) and the page goes back to normal afterwards. EN + AR."""
import sys, pathlib, json, subprocess
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
import ai_report_test_data as D
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
def worker(route):
    b = json.loads(route.request.post_data or '{}')
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'report': D.AR if b.get('language') == 'ar' else D.EN, 'model': 'claude-test', 'remaining': 3}))
with sync_playwright() as p:
    br = p.chromium.launch()
    for theme in ('dark', 'light'):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx); ctx.route('**/samsam-analysis.**/analyze', worker)
        ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=S.SITE)
        ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)
        pg.evaluate("openAnalysis(); renderAnalysisLoading()")
        check(f'{theme}: Copy / PDF off while there is no report', pg.is_disabled('#aiCopyBtn') and pg.is_disabled('#aiPdfBtn'))
        for lang in ('en', 'ar'):
            if lang == 'en': pg.evaluate("runAnalysis()")
            else: pg.click('#langArBtn')
            pg.wait_for_selector(f'#analysisBody .analysis-content[lang={lang}]', timeout=20000); pg.wait_for_timeout(300)
            check(f'{theme}/{lang}: Copy / PDF on once the report is there', not pg.is_disabled('#aiCopyBtn') and not pg.is_disabled('#aiPdfBtn'))
            pg.click('#aiCopyBtn'); pg.wait_for_timeout(300)
            clip = pg.evaluate("navigator.clipboard.readText()")
            src = D.AR if lang == 'ar' else D.EN
            check(f'{theme}/{lang}: Copy = title + date line + the whole report', clip.startswith('تقرير الذكاء الاصطناعي' if lang == 'ar' else 'Cute Portfolio — AI Analysis Report') and src.strip() in clip and 'claude-test' in clip.split('\n')[1], clip[:200])
            check(f'{theme}/{lang}: button says Copied', 'Copied' in pg.inner_text('#aiCopyBtn'))
            # PDF: the print stub records the call; the page is printed while the print look is on
            pg.evaluate("(()=>{window.__printed=0; window.print=function(){window.__printed++}})()")
            pg.click('#aiPdfBtn'); pg.wait_for_timeout(300)
            st = pg.evaluate("({p:window.__printed, cls:document.body.classList.contains('ai-print'), title:document.title, head:!!document.querySelector('#aiPrintRoot .ai-print-head')})")
            check(f'{theme}/{lang}: PDF opens Print with only the report, titled by date {st}', st['p'] == 1 and st['cls'] and st['title'].startswith('AI Report 20') and st['head'], st)
            pg.emulate_media(media='print')
            vis = pg.evaluate("""(()=>{const shown=e=>!!e&&getComputedStyle(e).display!=='none';
              return {root:shown(document.getElementById('aiPrintRoot')), modal:shown(document.getElementById('analysisModal')), table:shown(document.getElementById('portfolioTableWrapper')),
                views:shown(document.getElementById('cpViews')), bnav:shown(document.getElementById('cpBnav')), cards:document.querySelectorAll('#aiPrintRoot .ai-sec').length,
                buttons:!!document.querySelector('#aiPrintRoot button'), bg:getComputedStyle(document.body).backgroundColor}})()""")
            check(f'{theme}/{lang}: print shows the report only — no app, table, tabs, bar or buttons {vis}', vis['root'] and not vis['modal'] and not vis['table'] and not vis['views'] and not vis['bnav'] and vis['cards'] == 8 and not vis['buttons'] and vis['bg'] == 'rgb(255, 255, 255)', vis)
            out = SH / f'aipdf_{theme}_{lang}.pdf'; pg.pdf(path=str(out), format='A4', print_background=True)
            pages = subprocess.run(['pdfinfo', str(out)], capture_output=True, text=True).stdout
            np = int(next((l.split()[-1] for l in pages.splitlines() if l.startswith('Pages')), '0'))
            check(f'{theme}/{lang}: PDF has the report ({np} pages, not dozens of blank ones)', 1 <= np <= 5, pages)
            subprocess.run(['pdftoppm', '-png', '-r', '60', '-f', '1', '-l', '2', str(out), str(SH / f'aipdf_{theme}_{lang}')])
            pg.emulate_media(media='screen')
            pg.mouse.click(5, 5) if False else pg.evaluate("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); pg.wait_for_timeout(1000)
            pg.evaluate("document.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))"); pg.wait_for_timeout(200)
            back = pg.evaluate("({cls:document.body.classList.contains('ai-print'), root:!!document.getElementById('aiPrintRoot'), title:document.title})")
            check(f'{theme}/{lang}: page back to normal after printing {back}', not back['cls'] and not back['root'] and not back['title'].startswith('AI Report'), back)
        check(f'{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
