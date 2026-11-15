"""The coin settings live where they are used (not in ⚙️ Settings):
Performance → "Wallets & exchanges" card (Wallets & check · Import from exchange) + the Rewards & mining card;
Plan → DCA card (always there) with ➕ Regular buy: any coin, even one not in the plan → it joins the plan WITHOUT a target → its schedule;
a coin already in the plan keeps its target. Overview keeps Signal Thresholds (signals menu), Manage Categories (category menu), the Baseline pencil;
Allocation keeps Target allocation → Edit; the Exit tab keeps its default steps."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1000)
        # Overview: what was already here
        check(f'{vn}: Overview — Signal Thresholds in the signals menu, Manage Categories in the category menu, the Baseline pencil',
              pg.evaluate("typeof openSignalEdit === 'function' && !!document.querySelector('.hm-baseline .val-edit')") and 'Manage Categories' in pg.evaluate("(catPickerDD.button.click(), document.body.innerText)"))
        pg.keyboard.press('Escape')
        # Performance: the card
        pg.evaluate("cpShell.go('performance')"); pg.wait_for_timeout(2500)
        fr = [f for f in pg.frames if 'performance.html' in f.url][0]
        fr.wait_for_selector('#wxCard:not([hidden])', timeout=10000)
        t = fr.inner_text('#wxCard')
        check(f'{vn}: Performance — a "Wallets & exchanges" card: Wallets & check, Import from exchange, Binance / Gate later', 'Wallets & check' in t and 'Import from exchange' in t and 'Binance' in t and 'Gate' in t, t)
        check(f'{vn}: …and the Rewards & mining card next to it', fr.is_visible('#freeCard') and 'Rewards' in fr.inner_text('#freeCard'))
        fr.click('#wxWallets'); fr.wait_for_selector('#cpWal', timeout=5000)
        check(f'{vn}: Wallets & check opens', fr.is_visible('#cpWal'))
        fr.evaluate("SamsamWallets.close()")
        fr.click('#wxImport'); fr.wait_for_selector('#impModal', state='visible', timeout=5000)
        check(f'{vn}: Import from exchange opens', fr.is_visible('#impModal'))
        fr.evaluate("SamsamImport.close()")
        # Plan: ➕ Regular buy
        pg.evaluate("Samsam.saveExit({ tab: 'accum' })"); pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(2500)
        fa = [f for f in pg.frames if 'accumulation.html' in f.url][0]
        fa.evaluate("setPlanTab('accum')"); fa.wait_for_selector('#dcaCard:not([hidden])', timeout=10000)
        check(f'{vn}: Plan — the DCA card is there with ➕ Regular buy', 'Regular buy' in fa.inner_text('#dcaCard .dc-new'))
        sym = fa.evaluate("allAvailableCoins().find(c => !accumPlan.some(e => e.sym === c.sym)).sym")
        n0 = fa.evaluate("accumPlan.length")
        fa.click('#dcaCard .dc-new'); fa.wait_for_selector('#addModal.active')
        check(f'{vn}: it asks for a coin only (no target box), "Next: the schedule"', 'Regular buy' in fa.inner_text('#addTitle') and not fa.is_visible('#addTarget') and fa.inner_text('#addConfirm') == 'Next: the schedule')
        fa.evaluate(f"selectAddCoin('{sym}')"); fa.click('#addConfirm'); fa.wait_for_timeout(400)
        e = fa.evaluate(f"accumPlan.find(e => e.sym === '{sym}')")
        check(f'{vn}: {sym} (not in the plan) joined the plan without a target, and its schedule opened', fa.evaluate("accumPlan.length") == n0 + 1 and e and not e.get('targetQty') and fa.evaluate("document.getElementById('dcaOverlay').style.display") == 'flex' and sym in fa.inner_text('#dcaSub'), e)
        fa.fill('#dcaMonthly', '50'); fa.click('#dcaSave'); fa.wait_for_timeout(500)
        check(f'{vn}: saved → {sym} is in the DCA card', fa.evaluate(f"!!document.querySelector('#dcaCard .dc-row[data-sym=\"{sym}\"]') || (document.querySelector('#dcaCard .pa-tog').click(), !!document.querySelector('#dcaCard .dc-row[data-sym=\"{sym}\"]'))"))
        # a coin already in the plan keeps its target
        have = fa.evaluate("accumPlan.find(e => e.targetQty > 0 && !e.dca)")
        if have:
            fa.click('#dcaCard .dc-new'); fa.wait_for_selector('#addModal.active'); fa.evaluate(f"selectAddCoin('{have['sym']}')"); fa.click('#addConfirm'); fa.wait_for_timeout(300)
            check(f'{vn}: a coin already in the plan keeps its target ({have["sym"]})', fa.evaluate(f"accumPlan.find(e => e.sym === '{have['sym']}').targetQty") == have['targetQty'])
            fa.evaluate("closeDcaModal()")
        fa.evaluate("openAddModal()"); fa.wait_for_timeout(150)
        check(f'{vn}: the normal "Add to Plan" still asks for a target', fa.is_visible('#addTarget') and fa.inner_text('#addConfirm') == 'Add to Plan')
        fa.evaluate("closeAddModal(); setPlanTab('exit')"); fa.wait_for_timeout(600)
        check(f'{vn}: Exit Strategy tab — its default steps button is there', fa.query_selector('#exitPane [data-act="steps"]') is not None)
        fa.evaluate("setPlanTab('accum')")
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
