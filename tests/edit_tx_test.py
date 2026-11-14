"""✏️ Change a saved transaction from a coin's History: tap it → the same form, filled in → "Save changes".
The transaction is replaced (same count, new numbers), holdings follow; a Sell whose money went to USDT takes its USDT Buy with it."""
import sys, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
TX = "(sym => Samsam.getState().transactions.filter(t => t.sym === sym))"
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(800)
        sym = 'SUI' if vn == 'phone' else 'NEAR'
        n0 = pg.evaluate(f"{TX}('{sym}').length")
        pg.evaluate(f"openAddTx('buy','{sym}'); atxQty.value='10'; atxPrice.value='2'; atxNote.value='first try'; atxCashOn.checked=false; atxCashOn.dataset.manual='1'; saveAddTx();")
        pg.wait_for_function(f"{TX}('{sym}').length === {n0 + 1}", timeout=8000)
        tid = pg.evaluate(f"{TX}('{sym}').find(t => t.note === 'first try').id")
        pg.goto(f'{S.SITE}/index.html#holdings/{sym}'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
        row = pg.locator(f'.htx-row[data-edit="{tid}"]')
        check(f'{vn}: the new Buy is in History, with ✏️', row.count() == 1 and row.locator('.htx-edit').count() == 1)
        row.locator('.htx-row-main').click(); pg.wait_for_timeout(300)
        check(f'{vn}: tapping it opens "Edit Buy", filled in (10 @ 2, the note), no type tabs',
              pg.inner_text('#atxTitle') == 'Edit Buy' and pg.input_value('#atxQty') == '10' and pg.input_value('#atxPrice') == '2' and pg.input_value('#atxNote') == 'first try' and not pg.is_visible('#atxForm .atx-types') and pg.inner_text('#atxSave') == 'Save changes',
              [pg.inner_text('#atxTitle'), pg.input_value('#atxQty'), pg.input_value('#atxPrice')])
        pg.fill('#atxQty', '12'); pg.fill('#atxNote', 'fixed'); pg.click('#atxSave')
        pg.wait_for_function(f"{TX}('{sym}').some(t => t.note === 'fixed')", timeout=8000)
        after = pg.evaluate(f"{TX}('{sym}')")
        check(f'{vn}: saved — same number of transactions, 12 @ 2, the old one gone', len(after) == n0 + 1 and any(t['note'] == 'fixed' and t['qty'] == 12 and t['price'] == 2 for t in after) and not any(t['id'] == tid for t in after), len(after))
        # a Sell whose money went to USDT: edit it, the USDT Buy follows
        pg.wait_for_timeout(600)
        u0 = pg.evaluate("Samsam.getState().transactions.filter(t => t.sym === 'USDT').length")
        pg.evaluate(f"openAddTx('sell','{sym}'); atxQty.value='5'; atxPrice.value='3'; atxNote.value='sold some'; atxCashOn.checked=true; atxCashSym.value='USDT'; saveAddTx();")
        try: pg.wait_for_function(f"Samsam.getState().transactions.some(t => t.sym === 'USDT' && t.link && Samsam.getState().transactions.find(x => x.id === t.link && x.sym === '{sym}' && x.note === 'sold some'))", timeout=8000)
        except Exception: print('DBG', pg.evaluate("[atxErr.textContent, atxBackdrop.className, atxCashRow.style.display]"))
        sid = pg.evaluate(f"{TX}('{sym}').find(t => t.note === 'sold some').id")
        pg.evaluate(f"openEditTx('{sid}')"); pg.wait_for_timeout(200)
        check(f'{vn}: Edit Sell says the USDT follows', pg.inner_text('#atxTitle') == 'Edit Sell' and 'USDT' in pg.inner_text('#atxHint'), pg.inner_text('#atxHint'))
        pg.fill('#atxQty', '4'); pg.click('#atxSave')
        pg.wait_for_function(f"{TX}('{sym}').some(t => t.note === 'sold some' && t.qty === 4)", timeout=8000); pg.wait_for_timeout(300)
        st = pg.evaluate(f"(()=>{{ const all = Samsam.getState().transactions, s = all.find(t => t.sym === '{sym}' && t.note === 'sold some'); return [all.filter(t => t.link === s.id).map(t => [t.sym, t.qty]), all.filter(t => t.sym === 'USDT').length]; }})()")
        check(f'{vn}: the USDT Buy now says $12 (4 × $3), linked to the new Sell, no extra USDT entry', st[0] == [['USDT', 12]] and st[1] == u0 + 1, st)
        # the USDT Buy itself → opens its Sell
        bid = pg.evaluate(f"(()=>{{ const all = Samsam.getState().transactions, s = all.find(t => t.sym === '{sym}' && t.note === 'sold some'); return all.find(t => t.link === s.id).id; }})()")
        pg.evaluate(f"openEditTx('{bid}')"); pg.wait_for_timeout(200)
        check(f'{vn}: changing the USDT Buy opens the Sell it came from', pg.inner_text('#atxTitle') == 'Edit Sell' and pg.input_value('#atxQty') == '4')
        pg.evaluate("closeAddTx()")
        pg.evaluate(f"openAddTx('buy','{sym}')"); pg.wait_for_timeout(150)
        check(f'{vn}: a new Buy afterwards is a normal "Add" again', pg.inner_text('#atxTitle') == 'Add Transaction' and pg.is_visible('#atxForm .atx-types') and pg.input_value('#atxQty') == '')
        pg.evaluate("closeAddTx()")
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
