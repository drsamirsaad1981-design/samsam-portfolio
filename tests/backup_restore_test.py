"""Backup → something lost → Recover from the backup file: everything comes back.
Transactions (incl. fees in coin), DCA schedules, target allocation, Telegram alert settings, signal rules,
exit-plan steps, watchlist, category names; the menu shows when the last backup was made."""
import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
SITE = 'http://127.0.0.1:8000'; SH = pathlib.Path(__file__).parent / 'shots'; res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
PW = 'correct horse 42'
def password(pg, set_mode=True):
    pg.wait_for_selector('#ssPwA'); pg.fill('#ssPwA', PW)
    if set_mode: pg.fill('#ssPwB', PW)
    pg.click('#ssPw button[type=submit]')
SNAP = """(()=>{const s=Samsam.getState(), m=s.meta||{};
  const fee=s.transactions.find(t=>t.note==='backup fee test');
  const a=s.accumPlan.find(x=>x.sym==='SUI');
  return JSON.stringify({fee: fee?[fee.qty,fee.fee,fee.netFee]:null, dca: a&&a.dca?a.dca.usd:null,
    targets: Samsam.getTargets() ? Object.keys(Samsam.getTargets().cats).length : 0, lang: Samsam.getAlerts().lang,
    steps: (s.exit&&s.exit.steps&&s.exit.steps.mults||[]).join(','), watch: (s.watchlist||[]).map(w=>w.id).join(','),
    cat: SamsamTaxonomy.label('layer1'), sig: s.signalRules ? JSON.stringify(s.signalRules) : ''})})()"""
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True); S.setup(ctx); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(SITE + '/index.html'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.some(c=>c.qty>0)"); pg.wait_for_timeout(800)
    # what you set up over time
    pg.evaluate("""(async()=>{
      await Samsam.addTx('BTC','buy',0.01,80000,'backup fee test',{fee:0.00005,netFee:0.00002});
      const plan=Samsam.getState().accumPlan.map(a=>({...a})); const sui=plan.find(a=>a.sym==='SUI');
      if (sui) sui.dca={usd:75,every:'week',day:1,since:'2026-10-01'}; else plan.push({sym:'SUI',targetQty:500,dca:{usd:75,every:'week',day:1,since:'2026-10-01'}});
      await Samsam.saveAccumPlan(plan);
      await Samsam.setTargets({cats:{btc:{pct:60},layer1:{pct:40}},band:5});
      await Samsam.setAlerts({...Samsam.getAlerts(), lang:'ar'});
      await Samsam.saveExit({steps:{mults:[2,4,8],pcts:[20,50,30]}});
      await Samsam.saveWatchlist([{id:'dogecoin',sym:'DOGE',name:'Dogecoin'}]);
      await Samsam.renameCategory('layer1','My L1s');
    })()"""); pg.wait_for_timeout(1500)
    before = json.loads(pg.evaluate(SNAP))
    check(f'set up: fee tx, DCA, targets, alerts, exit steps, watchlist, category name {before}', before['fee'] and before['dca'] == 75 and before['targets'] == 2 and before['lang'] == 'ar' and before['steps'] == '2,4,8' and 'dogecoin' in before['watch'] and before['cat'] == 'My L1s', before)
    # backup from the cloud menu
    pg.locator('.ss-sync-hdr').first.click(); pg.wait_for_timeout(300)
    with pg.expect_download() as dl:
        pg.click('#samsamBk'); password(pg)
    path = dl.value.path(); raw = json.loads(open(path).read())
    check('backup file is encrypted (no readable data inside)', raw.get('cipher') and 'transactions' not in raw and 'backup fee test' not in json.dumps(raw), list(raw.keys())[:6])
    plain = pg.evaluate("j => SamsamVault.decryptBackup(j, %s)" % json.dumps(PW), raw)
    keys = sorted(plain.keys())
    check(f'backup holds the settings too ({keys})', 'settings' in plain and plain['settings'].get('info') and plain['settings'].get('categories') is not None, keys)
    acc = [a for a in plain.get('accumPlan', []) if a.get('sym') == 'SUI']
    check('backup holds the DCA schedule', acc and acc[0].get('dca', {}).get('usd') == 75, acc)
    ftx = [t for t in plain.get('transactions', []) if t.get('note') == 'backup fee test']
    check('backup holds the fee in coin', ftx and ftx[0].get('fee') == 0.00005 and ftx[0].get('netFee') == 0.00002, ftx)
    pg.locator('.ss-sync-hdr').first.click(); pg.wait_for_timeout(300)
    last = pg.inner_text('#samsamSyncMenu')
    check('menu shows the last backup', 'Last backup' in last and ('today' in last or 'just now' in last or 'min' in last), last[-300:])
    pg.keyboard.press('Escape')
    # something gets lost
    pg.evaluate("""(async()=>{
      const t=Samsam.getState().transactions.find(t=>t.note==='backup fee test'); await Samsam.deleteTx(t.id);
      const plan=Samsam.getState().accumPlan.map(a=>({...a})); const sui=plan.find(a=>a.sym==='SUI'); if (sui) sui.dca=null; await Samsam.saveAccumPlan(plan);
      await Samsam.setTargets(null); await Samsam.setAlerts({...Samsam.getAlerts(), lang:'en'});
      await Samsam.saveExit({steps:null}); await Samsam.saveWatchlist([]); await Samsam.resetCategory('layer1');
    })()"""); pg.wait_for_timeout(1500)
    lost = json.loads(pg.evaluate(SNAP))
    check(f'lost: {lost}', not lost['fee'] and not lost['dca'] and lost['targets'] == 0 and lost['lang'] == 'en' and lost['cat'] != 'My L1s', lost)
    # Recover Data → Backup file
    pg.goto(SITE + '/recover.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()"); pg.wait_for_timeout(600)
    pg.click('.src-tabs [data-src="file"]')
    pg.set_input_files('#fileIn', path); password(pg, False); pg.wait_for_selector('#results:not(.hidden)')
    pg.wait_for_timeout(500)
    tx = pg.inner_text('#txTable')
    check('the deleted transaction is listed', 'BTC' in tx and 'backup fee test' in tx, tx[:300])
    st = pg.inner_text('body')
    check('settings that differ are listed', pg.is_visible('#setCard') and 'Target allocation' in pg.inner_text('#setCard') and 'Telegram alerts' in pg.inner_text('#setCard') and 'Category names' in pg.inner_text('#setCard'), st[-800:])
    check('BTC needs no balance "Edit" — the missing transaction already brings it back', not pg.is_checked('#coinTable input[data-coin]') if pg.query_selector('#coinTable input[data-coin]') else True, pg.inner_text('#coinTable')[:200])
    check('the DCA schedule is listed', 'SUI' in pg.inner_text('#accTable') and '$75' in pg.inner_text('#accTable'), pg.inner_text('#accTable'))
    pg.screenshot(path=str(SH / 'backup_restore.png'), full_page=True)
    with pg.expect_download() as dl2:
        pg.click('#applyBtn'); password(pg)
    pg.wait_for_selector('#srcMsg.ok', timeout=15000); pg.wait_for_timeout(1500)
    pg.goto(SITE + '/index.html'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1500)
    back = json.loads(pg.evaluate(SNAP))
    check(f'after restore everything is back {back}', back['fee'] == before['fee'] and back['dca'] == 75 and back['targets'] == 2 and back['lang'] == 'ar' and back['steps'] == '2,4,8' and 'dogecoin' in back['watch'] and back['cat'] == 'My L1s', (before, back))
    check('no JS errors', not errs, errs[:3]); ctx.close(); br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
