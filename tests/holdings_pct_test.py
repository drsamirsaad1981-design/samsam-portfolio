"""Holdings chart line: "All" shows exactly the All Time Profit card ($ and %); a shorter range divides the price change by
the money at work in it (value at the start + money added), so a big top-up never looks like a huge % loss."""
import sys, pathlib, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
def num(t):
    m = re.search(r'([+−-])\$([\d,]+\.\d\d)\s+\(([+−-])([\d.]+)%\)', t); return (float(m.group(2).replace(',', '')) * (-1 if m.group(1) in '−-' else 1), float(m.group(4)) * (-1 if m.group(3) in '−-' else 1)) if m else None
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        at = pg.evaluate("(()=>{const a=allTimeProfitData(); return [a.total, a.pct]})()")
        pg.evaluate("setHoldingsRange('all')"); pg.wait_for_timeout(300)
        hc = pg.evaluate("(()=>{const n=Date.now(), V=calcStats().total; return holdingsChangeText([{t:n-30*864e5, v:V*0.4},{t:n, v:V}]).text})()")
        got = num(hc)
        check(f'{vn}: All = the All Time Profit card ({hc} vs {at[0]:.2f} / {at[1]:.2f}%)', got and abs(got[0] - at[0]) < 0.011 and abs(got[1] - at[1]) < 0.006, (hc, at))
        # a range where $X was added: the % uses start value + added, never the start value alone
        pg.evaluate("setHoldingsRange('30d')"); pg.wait_for_timeout(300)
        r = pg.evaluate("""(async()=>{
          const before=Date.now()-2*864e5; await Samsam.addTx('BTC','buy',0.05,80000,'pct test',{date:new Date(before).toISOString()});
          await new Promise(r=>setTimeout(r,800));
          const n=Date.now(), V=calcStats().total, st=Samsam.getState(), s=Samsam.core.profitSeries(st.coins, st.transactions, [n-7*864e5, n]);
          const a={t:n-7*864e5, v:V-4000-500}, z={t:n, v:V};   // $4000 bought in the range, prices moved the rest
          const h=holdingsChangeText([a,z]); const added=(s.cost[1]-s.realized[1])-(s.cost[0]-s.realized[0]);
          const gain=(z.v-s.cost[1]+s.realized[1])-(a.v-s.cost[0]+s.realized[0]);
          return {text:h.text, added, gain, start:a.v}})()""")
        g = num(r['text']); want = r['gain'] / (r['start'] + max(0, r['added'])) * 100
        check(f'{vn}: 30d with ${r["added"]:.0f} added → % of (start + added) = {want:.2f}% ({r["text"]})', g and abs(g[1] - round(want, 2)) < 0.006 and 'added' in r['text'], (r, want))
        pg.evaluate("setHoldingsRange('all')")
        check(f'{vn}: no JS errors', not errs, errs[:3]); ctx.close()
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
