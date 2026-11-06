import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
sent = {}
with sync_playwright() as p:
    br = p.chromium.launch(); ctx = br.new_context(viewport={'width': 1440, 'height': 900}); S.setup(ctx)
    def worker(r):
        sent['body'] = json.loads(r.request.post_data); r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'report': '## Market Overview\nok'}))
    ctx.route('**/samsam-analysis.**/analyze', worker)
    pg = ctx.new_page(); pg.goto(S.SITE + '/index.html'); pg.click('#samsamSignInBtn'); S.wait_ready(pg); pg.wait_for_timeout(2500)
    pg.evaluate("runAnalysis()"); pg.wait_for_timeout(5000)
    ac = sent.get('body', {}).get('accumContext', '')
    print(ac[-1600:])
    ok = 'MARKET DATA' in ac and 'Fear & Greed: 62/100 (Greed)' in ac and 'Total market cap $3.21T' in ac and 'REPORT LAYOUT' in ac
    print('PASS' if ok else 'FAIL', 'market context sent with the AI request'); br.close(); sys.exit(0 if ok else 1)
