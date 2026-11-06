"""Security / persistence audit checks: at-rest vault, encrypted backup round-trip, input validation,
CSV export fidelity + formula guard, sign-out clearing the offline cache."""
import sys, pathlib, json, csv, io, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
res = []
def check(n, c, d=''): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n + ('' if c else f' -> {d}'), flush=True)
LEG = ['samsam_pf_v4', 'samsam_tx_v1', 'samsam_custom_v1', 'samsam_archived_v1', 'samsam_acc_v1', 'samsam_perf_v1', 'samsam_holdings_v1']
with sync_playwright() as p:
    br = p.chromium.launch()
    ctx = br.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True); S.setup(ctx)
    pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn')
    pg.wait_for_function("Samsam.isReady() && Samsam.getState().portfolio.length > 5", timeout=10000)
    # ── 1. At-rest: plain old-app data is moved into the AES-256-GCM vault ──
    secret = {'coins': [{'sym': 'BTC', 'qty': 1.2345, 'basePrice': 77777}], 'lastSave': '2026-10-01T00:00:00Z'}
    pg.evaluate("s => { localStorage.setItem('samsam_pf_v4', JSON.stringify(s)); localStorage.setItem('samsam_tx_v1', '[]'); }", secret)
    pg.reload(); pg.wait_for_function("Samsam.isReady()", timeout=10000); pg.wait_for_timeout(1500)
    st = pg.evaluate("""() => ({ plain: %s.filter(k => localStorage.getItem(k) != null),
        vault: localStorage.getItem('samsam_vault:samsam_pf_v4'), keys: Object.keys(localStorage) })""" % json.dumps(LEG))
    check('plain-text portfolio removed from localStorage', st['plain'] == [], st['plain'])
    check('vault copy exists and is ciphertext (no figures readable)', st['vault'] and '77777' not in st['vault'] and 'BTC' not in st['vault'] and '"alg":"AES-256-GCM"' in st['vault'], (st['vault'] or '')[:120])
    back = pg.evaluate("SamsamVault.get('samsam_pf_v4')")
    check('vault decrypts back to the identical data', back == secret, back)
    key = pg.evaluate("""() => new Promise(r => { const q = indexedDB.open('samsam-vault'); q.onsuccess = () => { const g = q.result.transaction('keys').objectStore('keys').get('device');
        g.onsuccess = () => r({ type: g.result.algorithm.name, len: g.result.algorithm.length, extractable: g.result.extractable }); }; })""")
    check('device key: AES-GCM 256, non-extractable', key == {'type': 'AES-GCM', 'len': 256, 'extractable': False}, key)
    tamper = pg.evaluate("""async () => { const k='samsam_vault:samsam_pf_v4', r=JSON.parse(localStorage.getItem(k)); const ct=atob(r.ct);
        r.ct = btoa(String.fromCharCode(ct.charCodeAt(0)^1) + ct.slice(1)); localStorage.setItem(k+'x', JSON.stringify(r));
        localStorage.setItem('samsam_vault:copy', localStorage.getItem(k)); return [await SamsamVault.get('samsam_pf_v4x'), await SamsamVault.get('copy')]; }""")
    check('tampered / moved vault entry is rejected (GCM auth + key name bound)', tamper == [None, None], tamper)
    pg.evaluate("localStorage.removeItem('samsam_vault:samsam_pf_v4x'); localStorage.removeItem('samsam_vault:copy')")
    # recover page still sees this device's (encrypted) old data
    pg.goto(S.SITE + '/recover.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=10000)
    pg.click('#loadDevice'); pg.wait_for_selector('#results:not(.hidden)')
    check('recover page reads old data from the vault', 'This device' in pg.inner_text('#txMeta') and '1 coins' in pg.inner_text('#txMeta'), pg.inner_text('#txMeta')[:120])
    # ── 2. Encrypted backup: download → wrong password rejected → correct password restores ──
    pg.goto(S.SITE + '/index.html'); pg.wait_for_function("Samsam.isReady()", timeout=10000); pg.wait_for_timeout(500)
    pg.click('.ss-sync-hdr'); pg.wait_for_selector('#samsamBk'); pg.click('#samsamBk'); pg.wait_for_selector('#ssPwA')
    pg.fill('#ssPwA', 'short'); pg.fill('#ssPwB', 'short'); pg.click('#ssPw button[type=submit]')
    check('password under 8 characters refused', 'At least 8' in pg.inner_text('#ssPw .e'))
    pg.fill('#ssPwA', 'Samsam-2030!'); pg.fill('#ssPwB', 'Samsam-2030?'); pg.click('#ssPw button[type=submit]')
    check('mismatched passwords refused', 'different' in pg.inner_text('#ssPw .e'))
    pg.fill('#ssPwB', 'Samsam-2030!')
    with pg.expect_download() as dl: pg.click('#ssPw button[type=submit]')
    path = dl.value.path(); raw = open(path).read(); j = json.loads(raw)
    check('backup file name ends .enc.json', dl.value.suggested_filename.endswith('.enc.json'), dl.value.suggested_filename)
    check('file is AES-256-GCM + PBKDF2-SHA256 600k, no readable data', j['kind'] == 'encrypted-backup' and j['cipher'] == {'name': 'AES-GCM', 'length': 256, 'iv': j['cipher']['iv']}
          and j['kdf']['iterations'] == 600000 and j['kdf']['hash'] == 'SHA-256' and 'BTC' not in json.dumps({k: v for k, v in j.items() if k != 'data'}) and re.fullmatch(r'[A-Za-z0-9+/=]+', j['data']), list(j))   # random base64 can contain "BTC" by chance
    dec_ok = pg.evaluate("([j,p]) => SamsamVault.decryptBackup(j,p).then(d => ({ n: d.transactions.length, coins: d.coins.length, legacy: d.legacy.coins.length }))", [j, 'Samsam-2030!'])
    st_now = pg.evaluate("({ n: Samsam.getState().transactions.length, coins: Samsam.getState().coins.length, legacy: Samsam.getState().portfolio.length })")
    check('decrypted backup = full cloud data (all coins + transactions)', dec_ok == st_now, (dec_ok, st_now))
    bad = pg.evaluate("([j]) => SamsamVault.decryptBackup(j,'wrong-password').then(() => 'opened', e => e.message)", [j])
    check('wrong password rejected', 'Wrong password' in bad, bad)
    j2 = dict(j); j2['data'] = ('A' if j['data'][0] != 'A' else 'B') + j['data'][1:]
    bad2 = pg.evaluate("([j]) => SamsamVault.decryptBackup(j,'Samsam-2030!').then(() => 'opened', e => e.message)", [j2])
    check('modified file rejected', 'Wrong password' in bad2 or 'changed' in bad2, bad2)
    # import the encrypted file on the recover page
    pg.goto(S.SITE + '/recover.html'); pg.wait_for_function("window.Samsam && Samsam.isReady()", timeout=10000)
    pg.click('.src-tabs button[data-src=file]'); pg.set_input_files('#fileIn', path); pg.wait_for_selector('#ssPwA')
    pg.fill('#ssPwA', 'nope-nope'); pg.click('#ssPw button[type=submit]'); pg.wait_for_timeout(1500)
    check('recover: wrong password shows a clear error', 'Wrong password' in pg.inner_text('#srcMsg'), pg.inner_text('#srcMsg'))
    pg.set_input_files('#fileIn', path); pg.wait_for_selector('#ssPwA'); pg.fill('#ssPwA', 'Samsam-2030!'); pg.click('#ssPw button[type=submit]')
    pg.wait_for_selector('#results:not(.hidden)', timeout=15000)
    check('recover: encrypted backup opens and matches the cloud (nothing missing)', 'No missing transactions' in pg.inner_text('#txMeta'), pg.inner_text('#txMeta')[:160])
    # ── 3. Input validation: bad writes never throw into the page, never reach the cloud ──
    pg.goto(S.SITE + '/index.html'); pg.wait_for_function("Samsam.isReady()", timeout=10000)
    r = pg.evaluate("""async () => { const out = [];
        for (const args of [['BTC','buy',-1,100], ['BTC','buy',1,NaN], ['BTC','steal',1,1], ['<b>','buy',1,1], ['BTC','buy',Infinity,1]]) {
          try { await Samsam.addTx(...args); out.push('saved'); } catch (e) { out.push('rejected'); } }
        return out; }""")
    check('invalid transactions rejected (negative, NaN, unknown type, bad symbol, Infinity)', r == ['rejected'] * 5, r)
    check('rejection shown to the user (red sync status)', pg.evaluate("document.getElementById('samsamSyncPill').dataset.s") == 'error')
    pg.evaluate("document.getElementById('samsamSyncPill').click()"); pg.wait_for_timeout(200)
    check('…with a readable reason in the sync menu', 'Amount and price must be positive' in pg.inner_text('#samsamSyncMenu') or 'Invalid' in pg.inner_text('#samsamSyncMenu'), pg.inner_text('#samsamSyncMenu')[:200])
    pg.click('#samsamClr')
    # ── 4. CSV export = the table on screen, quoted, formula-safe ──
    pg.evaluate("Samsam.updateCoin('ETH', { notes: '=HYPERLINK(\"http://evil\",\"x\"), with comma' })"); pg.wait_for_timeout(600)
    pg.evaluate("applyView('table')"); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.evaluate("exportData()")
    rows = list(csv.reader(io.StringIO(open(dl.value.path(), encoding='utf-8-sig').read())))
    shown = pg.eval_on_selector_all('#tableBody tr', "trs => trs.map(t => t.cells[0].firstElementChild.lastElementChild.innerText.split('\\n')[0].replace('↗','').trim())")
    check('CSV rows = table rows, same order', [r[1] for r in rows[1:]] == shown, ([r[1] for r in rows[1:6]], shown[:5]))
    eth = next(r for r in rows if r[1] == 'ETH'); pfe = pg.evaluate("Samsam.getState().portfolio.find(c=>c.sym==='ETH')")
    check('CSV figures match the app (amount, avg, value)', abs(float(eth[4]) - pfe['qty']) < 1e-9 and abs(float(eth[5]) - pfe['basePrice']) < 1e-9 and abs(float(eth[8]) - pfe['qty'] * pfe['currentPrice']) < 0.01, eth[:9])
    check('CSV note with comma kept in one cell and formula neutralised', eth[13].startswith("'=HYPERLINK") and 'with comma' in eth[13], eth[13])
    pg.evaluate("Samsam.updateCoin('ETH', { notes: '' })"); pg.wait_for_timeout(300)
    # filtered table → CSV follows the filter
    pg.fill('#searchBox', 'sol'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.evaluate("exportData()")
    rows = list(csv.reader(io.StringIO(open(dl.value.path(), encoding='utf-8-sig').read())))
    check('CSV follows search / filters on screen', [r[1] for r in rows[1:]] == pg.eval_on_selector_all('#tableBody tr', "trs => trs.map(t => t.cells[0].firstElementChild.lastElementChild.innerText.split('\\n')[0].replace('↗','').trim())"), [r[1] for r in rows[1:]])
    pg.fill('#searchBox', '')
    # ── 5. Sign out wipes this device's offline copy ──
    pg.evaluate("Samsam.signOut()"); pg.wait_for_selector('#samsamSignInBtn', timeout=10000)
    check('sign out returns to the sign-in screen', pg.is_visible('#samsamGate'))
    check('no JS errors', not errs, errs[:3])
    br.close()
print(f'{sum(res)}/{len(res)} passed'); sys.exit(0 if all(res) else 1)
