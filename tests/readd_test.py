"""Remove a coin → add it again: starts from zero everywhere (no "it still had…" message, old balance not added);
what you held leaves at cost as a Transfer Out "Removed from portfolio"; Realized profit from past sells stays;
coins removed the old way (before this fix) also start from zero; Accumulation, Holdings and the charts follow."""
import sys, pathlib, json, math
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []; SH = pathlib.Path(__file__).parent / 'shots'
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
STATE = "(() => { const st = Samsam.getState(); return { pf: st.portfolio.map(c => [c.sym, +c.qty.toFixed(8)]), realized: +st.realized.total.toFixed(6), log: (window.__cpLog || []).slice() }; })()"
def qty(pg, sym): return dict(pg.evaluate(STATE)['pf']).get(sym)
def txs(pg, sym): return pg.evaluate(f"Samsam.getState().transactions.filter(t => t.sym === '{sym}').map(t => [t.type, +t.qty.toFixed(8), t.note])")
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2); S.setup(ctx); errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1200)

    # 1. your exact case: add, buy more, remove, add again
    pg.evaluate("openAddCoin(); acSym.value='RDA'; acName.value='Readd A'; acCgId.value='readd-a'; acQty.value='10'; acPrice.value='2'; applyAddCoin()"); pg.wait_for_timeout(900)
    pg.evaluate("openAddTx('buy','RDA')"); pg.fill('#atxQty', '5'); pg.fill('#atxPrice', '3'); pg.click('#atxSave'); pg.wait_for_timeout(800)
    pg.evaluate("openAddTx('sell','RDA')"); pg.fill('#atxQty', '3'); pg.fill('#atxPrice', '4'); pg.click('#atxSave'); pg.wait_for_timeout(800)
    r0 = pg.evaluate(STATE)
    if qty(pg, 'RDA') != 12: print('DBG', pg.evaluate("[atxErr.textContent, atxBackdrop.classList.contains('show'), Samsam.isReady(), (window.__cpLog||[]).slice(-3), Samsam.getState().transactions.filter(t=>t.sym==='RDA').map(t=>[t.type,t.date,t.createdAt]), new Date().toISOString(), atxDate.value]"))
    check('set-up: 10 + 5 − 3 = 12 RDA, with a sell', qty(pg, 'RDA') == 12, qty(pg, 'RDA'))
    pg.evaluate("removeCoin('RDA')"); pg.wait_for_timeout(300)
    info = pg.inner_text('#rmInfo')
    check('Remove explains: 12 RDA leave at cost (Transfer Out), sold? use Sell, history and Realized stay, re-adding starts from zero',
          '12 RDA' in info and 'Transfer Out' in info and 'Sell' in info and 'starts from zero' in info, info)
    pg.screenshot(path=str(SH / 'readd-remove-dialog.png'))
    pg.evaluate("confirmRemove()"); pg.wait_for_timeout(900)
    r1 = pg.evaluate(STATE)
    check('removed: gone from the portfolio', qty(pg, 'RDA') is None)
    check('removed: Realized profit from the sell is kept', abs(r1['realized'] - r0['realized']) < 1e-9, (r0['realized'], r1['realized']))
    check('removed: the 12 left as a Transfer Out "Removed from portfolio"', txs(pg, 'RDA')[-1] == ['transfer_out', 12, 'Removed from portfolio'], txs(pg, 'RDA'))
    pg.evaluate("window.__cpLog = []")
    pg.evaluate("openAddCoin(); acSym.value='RDA'; acName.value='Readd A'; acCgId.value='readd-a'; acQty.value='4'; acPrice.value='5'; applyAddCoin()"); pg.wait_for_timeout(900)
    r2 = pg.evaluate(STATE)
    check('added again: 4 RDA — only the new Buy (old 12 not added)', qty(pg, 'RDA') == 4, qty(pg, 'RDA'))
    check('no "it still had…" message', not any('still had' in m for m in r2['log']), r2['log'])
    check('added again: Realized profit unchanged', abs(r2['realized'] - r0['realized']) < 1e-9, (r0['realized'], r2['realized']))
    avg = pg.evaluate("portfolio.find(c => c.sym === 'RDA').basePrice")
    check('added again: Avg. Buy Price is the new price ($5), not mixed with the old buys', abs(avg - 5) < 1e-9, avg)

    # 1b. the minute changes while the form is open: the entry still comes after what you just recorded
    pg.evaluate("openAddTx('buy','RDA')"); pg.wait_for_timeout(200)
    pg.evaluate("(() => { const d = new Date(Date.now() - 120e3), p = n => String(n).padStart(2, '0'); atxDate.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })()")
    pg.fill('#atxQty', '1'); pg.fill('#atxPrice', '5'); pg.click('#atxSave'); pg.wait_for_timeout(700)
    pg.evaluate("openAddTx('sell','RDA')"); pg.wait_for_timeout(200)
    pg.evaluate("(() => { const d = new Date(Date.now() - 120e3), p = n => String(n).padStart(2, '0'); atxDate.value = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; })()")
    pg.fill('#atxQty', '5'); pg.fill('#atxPrice', '5'); pg.click('#atxSave'); pg.wait_for_timeout(700)
    check('form left open past the minute: a Buy then Sell still save in order (no "more than you held")', qty(pg, 'RDA') == 0 and not pg.evaluate("atxBackdrop.classList.contains('show')"), (qty(pg, 'RDA'), pg.inner_text('#atxErr')))
    pg.evaluate("openAddTx('buy','RDA')"); pg.wait_for_timeout(200)
    pg.fill('#atxDate', '2026-10-20T10:00'); pg.fill('#atxQty', '1'); pg.fill('#atxPrice', '5'); pg.click('#atxSave'); pg.wait_for_timeout(700)
    d = pg.evaluate("Samsam.getState().transactions.filter(t => t.sym === 'RDA').map(t => t.date).sort()[0]")
    check('a date you pick yourself is still used', d.startswith('2026-10-20'), d)
    pg.evaluate("openAddTx('buy','RDA')"); pg.fill('#atxQty', '3'); pg.fill('#atxPrice', '5'); pg.click('#atxSave'); pg.wait_for_timeout(700)

    # 2. a coin removed the OLD way (balance left behind) → added again starts from zero too
    pg.evaluate("openAddCoin(); acSym.value='RDB'; acName.value='Readd B'; acCgId.value='readd-b'; acQty.value='7'; acPrice.value='1'; applyAddCoin()"); pg.wait_for_timeout(900)
    pg.evaluate("Samsam.updateCoin('RDB', { removed: true, removedAt: new Date(Date.now() - 3600e3).toISOString() })"); pg.wait_for_timeout(700)
    arch = pg.evaluate("(Samsam.getState().archivedCoins.find(c => c.sym === 'RDB') || {}).qty")
    check('old-style removal left 7 RDB behind (the case you hit)', abs(arch - 7) < 1e-9, arch)
    pg.evaluate("window.__cpLog = []")
    pg.evaluate("openAddCoin(); acSym.value='RDB'; acName.value='Readd B'; acCgId.value='readd-b'; acQty.value='2'; acPrice.value='1.5'; applyAddCoin()"); pg.wait_for_timeout(900)
    t = pg.evaluate("Samsam.getState().transactions.filter(t => t.sym === 'RDB').map(t => [t.type, t.qty, t.note, t.date])")
    check('old-style removed coin added again: 2 RDB, no message', qty(pg, 'RDB') == 2 and not any('still had' in m for m in pg.evaluate(STATE)['log']), (qty(pg, 'RDB'), t))
    check('…its old 7 are closed at the time it was removed (before the new Buy)', t[-2][0] == 'transfer_out' and t[-2][1] == 7 and t[-2][3] < t[-1][3], t)

    # 3. other pages follow
    pg.evaluate("Samsam.saveAccumPlan([...Samsam.getState().accumPlan.filter(e => e.sym !== 'RDA'), { sym: 'RDA', name: 'Readd A', targetQty: 20, addedAt: '2026-10-24T00:00:00Z' }])"); pg.wait_for_timeout(600)
    pg.evaluate("openHoldingsView()"); pg.wait_for_timeout(700)
    hq = pg.locator('#hovAssetList .hov-asset-row[data-sym="RDA"] .hold-qty').inner_text()
    check('Holdings shows 4 RDA', hq.replace('\u00a0', ' ').strip() == '4 RDA', hq)
    pg.evaluate("openCoinTx('RDA')"); pg.wait_for_timeout(700)
    hist = pg.inner_text('#hovTxView')
    check('the coin\'s history shows the removal as a Transfer Out', 'Removed from portfolio' in hist, hist[:300])
    pg.evaluate("hovBack()"); pg.wait_for_timeout(300); pg.evaluate("hovBack()"); pg.wait_for_timeout(300)
    ser = pg.evaluate("(() => { const st = Samsam.getState(), n = Date.now(); const s = Samsam.core.perfChartSeries([{ t: n - 7200e3, v: 1000, b: 100000 }, { t: n, v: 1000, b: 100000 }], st.coins, st.transactions, { baselineBtc: 81162 }); return [...s.port, ...s.btc].map(p => p.v); })()")
    check('charts compute with no gaps or NaN', all(isinstance(v, (int, float)) and math.isfinite(v) for v in ser), ser)
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    r = pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'RDA'))")
    check('Accumulation: Actual 4 (not 16)', r['actualQty'] == 4 and not r['notOwned'], r)
    pg.goto(S.SITE + '/index.html'); S.wait_ready(pg); pg.wait_for_timeout(1000)
    pg.evaluate("Samsam.removeCoin('RDA')"); pg.wait_for_timeout(700)
    pg.goto(S.SITE + '/accumulation.html'); S.wait_ready(pg); pg.wait_for_timeout(1500)
    r = pg.evaluate("calcRow(accumPlan.find(x => x.sym === 'RDA'))")
    check('Accumulation after removing: Actual 0, Not Owned Yet', r['actualQty'] == 0 and r['notOwned'], r)
    # clean up
    pg.evaluate("Samsam.saveAccumPlan(Samsam.getState().accumPlan.filter(e => e.sym !== 'RDA'))"); pg.wait_for_timeout(300)
    pg.evaluate("Samsam.removeCoin('RDB')"); pg.wait_for_timeout(500)
    check('no page errors', not errs, errs)
    br.close()
print(f'readd_test: {sum(res)}/{len(res)} passed')
