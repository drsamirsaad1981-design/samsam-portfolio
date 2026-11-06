import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE='http://127.0.0.1:8000'; SH=pathlib.Path(__file__).parent/'shots'; res=[]
def check(n,c,d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ')+n+('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br=p.chromium.launch()
    for name,vp in (('desktop',dict(viewport={'width':1440,'height':900})),('mobile',dict(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2))):
        ctx=br.new_context(**vp); S.setup(ctx); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(SITE+'/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        pg.evaluate("applyView('cards')")
        check(f'{name}: only one category card (no grid of 10)', pg.evaluate("document.querySelectorAll('#summaryGrid .summary-card').length")==0 and pg.evaluate("document.querySelectorAll('#catPicker').length")==1)
        t=pg.evaluate("document.querySelector('#catPicker .sdd-btn').innerText.replace(/\\s+/g,' ')")
        tot=pg.evaluate("SamsamFmt.usd(Samsam.getState().portfolio.reduce((a,c)=>a+c.qty*c.currentPrice,0))")
        check(f'{name}: card shows All Coins + total ({t})', 'All Coins' in t and tot in t, t)
        y=pg.evaluate("document.getElementById('catPicker').getBoundingClientRect().top+scrollY-10"); pg.evaluate(f"scrollTo(0,{y}-80)")
        pg.screenshot(path=str(SH/f'catpicker_{name}_closed.png'), full_page=True, clip={'x':0,'y':y,'width':vp['viewport']['width'],'height':420})
        pg.click('#catPicker .sdd-btn'); pg.wait_for_timeout(350)
        panel=pg.evaluate("(()=>{const p=document.querySelector('.sdd-panel.show'); const b=document.querySelector('#catPicker .sdd-btn').getBoundingClientRect(); const r=p.getBoundingClientRect(); return {sheet:p.classList.contains('sheet'), n:p.querySelectorAll('.sdd-opt').length, opts:[...p.querySelectorAll('.sdd-opt')].map(o=>o.innerText.replace(/\\s+/g,' ').trim()).slice(0,4), below: r.top>=b.bottom-1, sameW: Math.abs(r.width-b.width)<2}})()")
        if name=='mobile': check('mobile: opens as bottom sheet', panel['sheet'], panel)
        else: check('desktop: opens as dropdown right under the card, same width', not panel['sheet'] and panel['below'] and panel['sameW'], panel)
        check(f'{name}: lists All Coins + categories with values ({panel["n"]})', panel['n']>=10 and all('$' in o for o in panel['opts']), panel['opts'])
        pg.screenshot(path=str(SH/f'catpicker_{name}_open.png'))
        names=pg.evaluate("[...document.querySelectorAll('.sdd-panel.show .sdd-opt > span:not(.sdd-ico):not(.sdd-sub)')].map(l=>l.innerText.trim())")
        want=['All Coins','Layer 1 Blockchains','Layer 2 Blockchains','AI & DePIN','Layer 0 & Interoperability','Oracles & Middleware','DeFi & RWA','Meme & Utility Tokens','Launchpad','Web3 & Gaming']
        check(f'{name}: all 9 categories listed in order', names[:10]==want, names)
        fit=pg.evaluate("(()=>{const p=document.querySelector('.sdd-panel.show'), l=p.querySelector('.sdd-list'), r=p.getBoundingClientRect(); return [r.top>=0, r.bottom<=innerHeight+1, l.scrollHeight<=l.clientHeight+1 || getComputedStyle(l).overflowY==='auto']})()")
        check(f'{name}: list fits on screen (scrolls if needed) {fit}', all(fit), fit)
        pg.locator('.sdd-panel.show .sdd-opt:has-text("Layer 0 & Interoperability")').click(); pg.wait_for_timeout(120)
        st=pg.evaluate("[activeCatFilter, !!document.querySelector('.sdd-panel.show'), document.querySelector('#catPicker .sdd-label').textContent, document.getElementById('catPickerVal').textContent, [...document.querySelectorAll('#coinsStack .coin-card .ast-sym')].map(e=>e.textContent.replace('↗','').trim()), document.querySelectorAll('#coinsStack .coin-card.slide-up').length]")
        exp=pg.evaluate("SamsamFmt.usd(Samsam.getState().portfolio.filter(c=>c.cat==='layer0').reduce((a,c)=>a+c.qty*c.currentPrice,0))")
        check(f'{name}: pick closes the list, card updates ({st[2]} {st[3]})', st[0]=='layer0' and not st[1] and st[2]=='Layer 0 & Interoperability' and st[3]==exp, st[:4])
        check(f'{name}: coins filtered {st[4]}', st[4] and set(st[4])<= {'DOT','ATOM','KSM','QNT'}, st[4])
        check(f'{name}: coins slide up + fade in', st[5]==len(st[4]) and st[5]>0, st[5])
        pg.wait_for_timeout(600); pg.screenshot(path=str(SH/f'catpicker_{name}_picked.png'), full_page=True, clip={'x':0,'y':y,'width':vp['viewport']['width'],'height':700})
        if name=='desktop':
            pg.set_viewport_size({'width':1440,'height':620}); pg.evaluate("document.getElementById('catPicker').scrollIntoView({block:'end'})"); pg.wait_for_timeout(200)
            pg.click('#catPicker .sdd-btn'); pg.wait_for_timeout(300)
            f2=pg.evaluate("(()=>{const p=document.querySelector('.sdd-panel.show'), l=p.querySelector('.sdd-list'), r=p.getBoundingClientRect(); return {top:Math.round(r.top), bottom:Math.round(r.bottom), vh:innerHeight, scrolls:l.scrollHeight>l.clientHeight, maxH:l.style.maxHeight}})()")
            check(f'desktop short window: dropdown stays on screen and scrolls {f2}', f2['top']>=0 and f2['bottom']<=f2['vh'] and f2['scrolls'], f2)
            pg.keyboard.press('Escape'); pg.set_viewport_size({'width':1440,'height':900}); pg.wait_for_timeout(200)
        pr=pg.evaluate("[...document.querySelectorAll('#coinsStack .coin-card .ast-price')].map(e=>e.textContent.trim())")   # price now under the symbol
        import re as _re
        bad=[x for x in pr if not (_re.fullmatch(r'\$[\d,]+\.\d{2}',x) and float(x[1:].replace(',',''))>=10 or _re.fullmatch(r'\$\d\.\d{4}',x) or x.startswith('$0.00'))]
        check(f'{name}: live price under the symbol uses shared format ({pr[:3]})', pr and not bad, bad[:5])
        pg.evaluate("applyView('table')"); pg.click('#catPicker .sdd-btn'); pg.wait_for_timeout(300)
        pg.locator('.sdd-panel.show .sdd-opt:has-text("All Coins")').click(); pg.wait_for_timeout(100)
        rows=pg.evaluate("[document.querySelectorAll('#tableBody tr').length, document.querySelectorAll('#tableBody tr.slide-up').length, Samsam.getState().portfolio.length]")
        check(f'{name}: back to All Coins in table, rows animate {rows}', rows[0]==rows[2] and rows[1]==rows[0], rows)
        pg.evaluate("applyView('cards')"); pg.wait_for_timeout(200)
        pg.locator('#coinsStack .cat-tag').first.click(); pg.wait_for_timeout(200)
        st=pg.evaluate("[document.getElementById('catEditModal').classList.contains('show'), activeCatFilter]")
        check(f'{name}: tapping a coin\'s category tag opens Change category (not a filter) {st}', st==[True, ''], st)
        pg.evaluate("closeCatEdit()")
        check(f'{name}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
