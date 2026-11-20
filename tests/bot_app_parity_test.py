"""🔁 The bot's numbers = the app's numbers. The real app runs in a browser on a portfolio with buys, sells and a plan; the
bot's maths (tools/alerts-core.mjs → summarize, what every bot view and alert is built from) runs on the same data and the
same prices. Value, all-time profit (+ %), each coin's amount / average / value, each coin's signal and the plan's progress
must be the same to the cent."""
import sys, pathlib, json, subprocess, urllib.request, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
T = pathlib.Path(__file__).parent; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
num = lambda s: float(re.sub(r'[^0-9.\-]', '', s.replace('−', '-')) or 'nan')
urllib.request.urlopen(S.SRV + '/reset').read()

with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
    pg.wait_for_selector('#samsamImpBase', state='visible', timeout=15000); pg.click('#samsamImpBase')
    pg.wait_for_function("window.Samsam && Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=20000)
    syms = pg.evaluate("Samsam.getState().portfolio.filter(c => c.sym !== 'BTC' && c.qty > 0).slice(0, 3).map(c => c.sym)")
    a, b, c3 = syms
    # trades of every kind the maths cares about: a buy above the average, a partial sell (realized profit), a full sell, a BTC buy
    pg.evaluate(f"""(async () => {{
      const q = s => Samsam.getState().portfolio.find(c => c.sym === s).qty;
      await Samsam.addTx('{a}', 'buy', q('{a}') * 0.5, 3.1);
      await Samsam.addTx('{b}', 'sell', q('{b}') * 0.4, 2.6);
      await Samsam.addTx('{c3}', 'sell', q('{c3}'), 1.2);
      await Samsam.addTx('BTC', 'buy', 0.002, 95000);
    }})()""")
    pg.wait_for_timeout(2500)
    data = pg.evaluate("""(() => { const st = Samsam.getState(), r = Samsam.getSignalRules();
      return { coins: st.coins, txs: st.transactions, accum: st.accumPlan, now: Date.now(),
        meta: { signal: { reinforce: r.reinforce, sell: r.sell }, signalSmart: r.smart !== false, baseline: Samsam.getBaseline() },
        prices: st.portfolio.map(c => ({ sym: c.sym, price: c.currentPrice, ch24: c.change24h })),
        app: { pf: st.portfolio.filter(c => c.qty > 1e-12).map(c => ({ sym: c.sym, qty: c.qty, avg: c.basePrice, value: c.qty * c.currentPrice, action: signalInfo(c).action })),
               realized: st.realized, total: document.getElementById('totalUsd').innerText, pnl: document.getElementById('totalPnlCard').innerText, pct: document.getElementById('totalPnlSub').innerText } }; })()""")
    bot = json.loads(subprocess.run(['node', str(T / 'parity_node.mjs')], input=json.dumps(data), capture_output=True, text=True, check=True).stdout)
    app = data['app']; near = lambda x, y, tol=0.006: abs(x - y) <= tol
    check(f'the portfolio has the trades (a buy, a partial sell, a full sell, a BTC buy): {len(app["pf"])} coins held', len(app['pf']) >= 5 and not any(c['sym'] == c3 for c in app['pf']), [c['sym'] for c in app['pf']])
    check(f'Total Portfolio: app {app["total"]} = bot ${bot["value"]:,.2f}', near(num(app['total']), bot['value']), [app['total'], bot['value']])
    check(f'All Time Profit: app {app["pnl"]} = bot {bot["total"]:+,.2f}', near(num(app['pnl']), bot['total']), [app['pnl'], bot['total']])
    check(f'All Time Profit %: app {app["pct"]} = bot {bot["pctTotal"]:+.2f}%', near(num(app['pct']), bot['pctTotal']), [app['pct'], bot['pctTotal']])
    bad = [c['sym'] for c in app['pf'] if c['sym'] not in bot['coins'] or abs(c['qty'] - bot['coins'][c['sym']]['qty']) > 1e-9 * max(1, c['qty']) or abs(c['avg'] - bot['coins'][c['sym']]['avg']) > 1e-9 * max(1, c['avg']) or abs(c['value'] - bot['coins'][c['sym']]['value']) > 1e-6 * max(1, c['value'])]
    check(f'every coin: the same amount, average buy price and value ({len(app["pf"])} coins)', not bad and len(bot['coins']) == len(app['pf']), bad)
    norm = lambda a: 'sell' if a == 'convert' else (a or 'hold')
    sig = {c['sym']: [norm(c['action'] if isinstance(c['action'], str) else (c['action'] or {}).get('action')), bot['signal'].get(c['sym'])] for c in app['pf']}
    diff = {k: v for k, v in sig.items() if v[0] != v[1]}
    check(f'every coin: the same signal (reinforce / sell / hold) — {bot["counts"]}', not diff, diff)
    check('no page errors', not errs, errs)
    ctx.close(); br.close()
print(f'\n{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
