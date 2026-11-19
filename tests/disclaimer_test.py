"""⚠️ Signals are reminders of your own rules — not financial advice: the line is under the coin list, under a coin's
signal and in Signal settings (English and Arabic); the bot's 🎯 Signals and the morning / evening messages end with it."""
import sys, pathlib, subprocess, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
EN, AR = 'not financial advice', 'وليست نصيحة مالية'
with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'ar'):
        ctx = br.new_context(viewport={'width': 1366, 'height': 900}); S.setup(ctx)
        if lang == 'ar': ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(1500)
        w = EN if lang == 'en' else AR
        vis = lambda sel: pg.evaluate(f"(() => {{ const e = [...document.querySelectorAll('{sel}')].find(x => x.getClientRects().length); return e ? e.innerText : ''; }})()")
        check(f'{lang}: under the coin list', w in vis('#portfolioTableWrapper + .sig-note'), vis('#portfolioTableWrapper + .sig-note'))
        pg.evaluate("openSignalEdit()"); pg.wait_for_timeout(500)
        check(f'{lang}: in Signal settings', w in vis('#sgModal .sig-note'), vis('#sgModal .sig-note'))
        pg.evaluate("closeSignalEdit()"); pg.wait_for_timeout(300)
        pg.evaluate("openCoinTx('SOL')"); pg.wait_for_timeout(1500)
        check(f"{lang}: under a coin's signal", w in vis('#htxSigNote'), vis('#htxSigNote'))
        check(f'{lang}: no JS errors', not errs, errs[:3])
        ctx.close()
    br.close()
# the bot: 🎯 Signals view ends with the line, in both languages
js = """import('%s').then(m => { const sum = { coins: [{ sym: 'SOL', chg: -8, avg: 150 }], signal: { SOL: 'reinforce' } };
  const t = o => ({ sigT: 'Signals', reinforce: 'Reinforce', sell: 'Sell', hold: 'Hold', vsAvg: 'avg', refresh: 'r', pf: 'p', back: 'b', ...o });
  console.log(JSON.stringify({ en: m.viewSignals(t({ otherCode: 'ar' }), sum).text, ar: m.viewSignals(t({ otherCode: 'en' }), sum).text })); })""" % (pathlib.Path(__file__).resolve().parent.parent / 'tools/worker/bot.mjs').as_posix()
r = subprocess.run(['node', '--input-type=module', '-e', js], capture_output=True, text=True)
try: v = json.loads(r.stdout.strip().splitlines()[-1])
except Exception: v = {}
check('bot: 🎯 Signals ends with "Not financial advice" (en / ar)', 'Not financial advice' in v.get('en', '') and 'ليست نصيحة مالية' in v.get('ar', ''), (r.stdout[-300:], r.stderr[-300:]))
src = (pathlib.Path(__file__).resolve().parent.parent / 'tools/worker/daily.mjs').read_text()
check('bot: the morning and evening messages end with it', src.count("NOT_ADVICE[L === 'ar' ? 'ar' : 'en']") == 2)
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
