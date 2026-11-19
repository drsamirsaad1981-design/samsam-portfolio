"""العربية everywhere: every page, tab and window of the app opened in Arabic — no English words left on screen.
Allowed: tickers (BTC, ETH…), numbers, dates, e-mails and links, and names that stay as they are (Binance, CoinGecko,
Telegram, Claude, bStocks…). Anything else in English fails, with the screen it was found on — so a new screen or a new
sentence without its Arabic is caught here before it reaches the phone."""
import sys, pathlib, re, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
# every visible text (also the part of a mixed line): what's English after the allowed names are taken out
SCAN = r"""(() => {
  const NAMES = /\b(Cute Portfolio Signals|Cute Portfolio|Cute Fastrack|Binance|CoinGecko|CoinMarketCap|CoinCodex|CoinGlass|CMC|Telegram|Claude(?: AI)?|Anthropic|Firebase|Google|Apple|iCloud|Gate(?:\.io)?|OKX|Bybit|Hyperliquid|PAX Gold|Kinesis(?: Silver)?|Tether Gold|bStocks|TradingView|Fragment|Stars|SoSoValue|Yahoo(?: Finance)?|GitHub|Liq\.Map|DePIN|DeFi|RWA|Web3|ETF|Spot|Earn|Funding|Staking|Airdrop|English|Inter|Cairo|iShares|Fidelity|Grayscale|BlackRock|ARK|Bitwise|VanEck|Invesco|Franklin|WisdomTree|Valkyrie|Hashdex|Excel|CSV|PDF|JSON|API|Pro|Plus|Max|Mini App|Altcoin Season Index|Fear & Greed Index|Tangem|Airdrops|Moonbag)\b/g;
  const out = new Set(), w = document.createTreeWalker(document.body, 4); let n;
  while ((n = w.nextNode())) {
    const p = n.parentElement;
    if (!p || !p.getClientRects().length || getComputedStyle(p).visibility === 'hidden') continue;
    if (p.closest('script,style,svg,code,pre,textarea,input,[data-no-tr],.notranslate,.brand-name,.cp-brand-n,.mini-name,.nm,[aria-hidden="true"]')) continue;   // (.nm: a coin's own name)
    const s = n.nodeValue.replace(/\s+/g, ' ').trim(); if (!s) continue;
    const rest = s.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|www\.\S+|\b[\w-]+\.(?:com|io|org|net|app|me)\b\S*/g, ' ').replace(NAMES, ' ');
    // a line with Arabic in it: an English word left (lowercase — names of chains / coins are capitalised and stay);
    // a line with no Arabic at all: any word that isn't a ticker (BTC) or an allowed name
    if (/[\u0600-\u06FF]/.test(s) ? /\b[a-z]{3,}\b/.test(rest) : /\b(?![A-Z0-9]+\b)[A-Za-z][a-z]{2,}/.test(rest)) out.add(s.slice(0, 90));
  }
  return [...out];
})()"""
def scan(where): return where.evaluate(SCAN)
found = {}
def look(name, where, wait=900):
    try: (where.page if hasattr(where, 'page') and not hasattr(where, 'goto') else where).wait_for_timeout(wait)
    except Exception: pass
    try: left = scan(where)
    except Exception as e: left = ['(could not read: ' + str(e)[:60] + ')']
    if left: found[name] = left
    return left
with sync_playwright() as p:
    br = p.chromium.launch()
    for vn, vp in (('phone', dict(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)), ('desktop', dict(viewport={'width': 1366, 'height': 900}))):
        ctx = br.new_context(**vp); S.setup(ctx)
        ctx.add_init_script("try{localStorage.setItem('cp-lang','ar')}catch(e){}")
        pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(2500)
        pg.evaluate("document.getElementById('samsamSetup') && (document.getElementById('samsamSetup').style.display='none')")
        F = lambda k: next((f for f in pg.frames if k + '.html' in f.url), None)
        look(f'{vn} · Overview', pg)
        pg.evaluate("try{applyView('cards')}catch(e){}"); look(f'{vn} · Overview (cards)', pg, 600); pg.evaluate("try{applyView('table')}catch(e){}")
        pg.evaluate("SamsamUI.ptabGo('allocation')"); look(f'{vn} · Allocation', pg, 1200)
        pg.evaluate("try{openCoinTx('BTC')}catch(e){}"); look(f'{vn} · Coin transactions (BTC)', pg, 1200)
        pg.evaluate("try{openCoinTx('SOL')}catch(e){}"); look(f'{vn} · Coin transactions (SOL)', pg, 1200)
        pg.evaluate("try{hovBack()}catch(e){}; try{hovBack()}catch(e){}"); pg.wait_for_timeout(400)
        pg.evaluate("SamsamUI.ptabGo('overview')"); pg.wait_for_timeout(500)
        # windows on the main page
        for nm, js, close in (('Add Coin', "openAddCoin()", "closeAddCoin && closeAddCoin()"), ('Add Buy', "openAddTx('buy','BTC')", "closeAddTx && closeAddTx()"),
                              ('Add Sell', "openAddTx('sell','BTC')", "closeAddTx && closeAddTx()"), ('AI Analysis', "openAnalysis()", "closeAnalysis && closeAnalysis()")):
            pg.evaluate(f"try{{{js}}}catch(e){{}}"); look(f'{vn} · {nm}', pg, 1000)
            pg.evaluate(f"try{{{close}}}catch(e){{}}"); pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # Settings and every window it opens
        pg.evaluate("SamsamSettings.open()"); look(f'{vn} · Settings', pg, 600)
        for a in ('guide', 'admin', 'aiinfo', 'support', 'alerts', 'tglink', 'claudekey', 'import', 'rewards', 'wallets', 'backup', 'signal', 'targets', 'baseline', 'cats', 'exit', 'dca'):
            pg.evaluate("try{SamsamSettings.close()}catch(e){}"); pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
            pg.evaluate(f"try{{SamsamSettings.run('{a}')}}catch(e){{}}"); pg.wait_for_timeout(1500)
            look(f'{vn} · Settings → {a}', pg, 300)
            for fk in ('performance', 'accumulation', 'market'):
                f = F(fk)
                if f and pg.evaluate(f"(() => {{ const e = document.querySelector('iframe[data-view={fk}]'); return !!e && e.classList.contains('on'); }})()"): look(f'{vn} · Settings → {a} ({fk})', f, 200)
            pg.keyboard.press('Escape'); pg.evaluate("try{cpShell.go('home')}catch(e){}"); pg.wait_for_timeout(300)
        pg.evaluate("try{SamsamSettings.close()}catch(e){}")
        # the other tabs (pages in frames)
        pg.evaluate("cpShell.go('performance')"); pg.wait_for_timeout(2500); look(f'{vn} · Performance', F('performance'), 300)
        pg.evaluate("cpShell.go('accumulation')"); pg.wait_for_timeout(2500); fa = F('accumulation'); look(f'{vn} · Plan', fa, 300)
        for t in ('exit', 'dca'):
            fa.evaluate(f"try{{(window.setPlanTab||window.setTab||function(){{}})('{t}')}}catch(e){{}}"); look(f'{vn} · Plan · {t}', fa, 900)
        pg.evaluate("cpShell.go('market')"); pg.wait_for_timeout(3500); fm = F('market'); look(f'{vn} · Market Hub', fm, 300)
        for m in ('watch', 'pf'):
            fm.evaluate(f"try{{setMode('{m}')}}catch(e){{}}"); look(f'{vn} · Market Hub · {m}', fm, 1200)
        fm.evaluate("try{setMode('top')}catch(e){}")
        for v in ('stocks', 'metals'):
            fm.evaluate(f"try{{SamsamAssets.show('{v}')}}catch(e){{}}"); look(f'{vn} · Market Hub · {v}', fm, 1500)
        fm.evaluate("try{SamsamAssets.show('crypto')}catch(e){}")
        pg.evaluate("cpShell.go('altseason')"); pg.wait_for_timeout(3000); look(f'{vn} · Altcoin Season', F('altseason'), 300)
        pg.evaluate("cpShell.go('home')"); pg.wait_for_timeout(500)
        check(f'{vn}: no JS errors while opening everything', not errs, errs[:3])
        ctx.close()
    br.close()
for k, v in found.items(): print('  ·', k, '→', json.dumps(v[:10], ensure_ascii=False))
check('every screen and window: no English words left in Arabic', not found, f'{len(found)} screens (listed above)')
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
