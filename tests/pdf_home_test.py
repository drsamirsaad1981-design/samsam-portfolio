"""Main-page PDF: the first page has the key numbers, the Holdings + Performance charts (drawn, light colours), the
allocation donut with every category (≈100%) and the Accumulation Plan; the table starts on the next page; the screen
is untouched (summary hidden, the cards' charts still drawn). Phone + computer, light + dark."""
import sys, pathlib, subprocess
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {str(d)[:300]}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        for theme in ('dark', 'light'):
            ctx = br.new_context(**vp); S.setup(ctx)
            ctx.add_init_script(f"try{{localStorage.setItem('samsam_theme','{theme}')}}catch(e){{}}")
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(3500)
            pg.evaluate("(()=>{window.__printed=0; window.print=function(){window.__printed++}})()")
            pg.evaluate("exportPdf()"); pg.wait_for_timeout(600)
            st = pg.evaluate("""(()=>{const ink=id=>{const c=document.getElementById(id); if(!c||c.hidden||!c.width) return 0; const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>0) n++; return n};
              const pct=[...document.querySelectorAll('#pdfSummary .ps-li b')].map(b=>parseFloat(b.textContent));
              return {printed:window.__printed, screen:getComputedStyle(document.getElementById('pdfSummary')).display, hold:ink('psHold'), perf:ink('psPerf'), holdW:document.getElementById('psHold').width,
                slices:document.querySelectorAll('#pdfSummary .ps-donut path').length, cats:pct.length, sum:Math.round(pct.reduce((a,b)=>a+b,0)), tiles:[...document.querySelectorAll('#pdfSummary .ps-tile b')].map(b=>b.textContent),
                plan:!!document.querySelector('#pdfSummary .ps-plan'), cardChart:ink('holdingsCanvas')}})()""")
            check(f'{vn}/{theme}: PDF opens Print once; summary hidden on screen {st["printed"]} {st["screen"]}', st['printed'] == 1 and st['screen'] == 'none', st)
            check(f'{vn}/{theme}: both charts drawn for the PDF (hold {st["hold"]}, perf {st["perf"]} px)', st['hold'] > 500 and st['perf'] > 500 and st['holdW'] > 400, st)
            check(f'{vn}/{theme}: donut + every category, ≈100% ({st["cats"]} cats, {st["sum"]}%)', st['slices'] == st['cats'] > 0 and 99 <= st['sum'] <= 101, st)
            check(f'{vn}/{theme}: numbers filled {st["tiles"]}', all(t and t != '—' for t in st['tiles']) and st['tiles'][0].startswith('$'), st['tiles'])
            check(f'{vn}/{theme}: accumulation plan shown', st['plan'])
            check(f'{vn}/{theme}: the card chart on the page is still there', st['cardChart'] > 500, st['cardChart'])
            pg.emulate_media(media='print')
            pv = pg.evaluate("({sum:getComputedStyle(document.getElementById('pdfSummary')).display, table:getComputedStyle(document.getElementById('portfolioTableWrapper')).display, brk:getComputedStyle(document.getElementById('portfolioTableWrapper')).breakBefore})")
            check(f'{vn}/{theme}: in print: summary + table, table on a new page {pv}', pv['sum'] == 'block' and pv['table'] == 'block' and pv['brk'] == 'page', pv)
            out = SH / f'pdfhome_{vn}_{theme}.pdf'; pg.pdf(path=str(out), print_background=True, prefer_css_page_size=True)
            subprocess.run(['pdftoppm', '-png', '-r', '55', '-f', '1', '-l', '2', str(out), str(SH / f'pdfhome_{vn}_{theme}')])
            pg.emulate_media(media='screen')
            check(f'{vn}/{theme}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
