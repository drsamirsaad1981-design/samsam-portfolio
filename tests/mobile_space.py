import sys, pathlib, json
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import e2e_setup as S
with sync_playwright() as p:
    br=p.chromium.launch(); ctx=br.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2); S.setup(ctx); pg=ctx.new_page()
    pg.goto('http://127.0.0.1:8000/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); pg.wait_for_function("Samsam.isReady()"); pg.wait_for_timeout(1200); pg.evaluate("applyView('cards')")
    print(json.dumps(pg.evaluate("""() => { const r=e=>e.getBoundingClientRect(); const top=r(document.querySelector('.controls')).top, first=r(document.querySelector('#coinsStack .coin-card'));
      return {controlsToFirstCard: Math.round(first.top-top), toolbarH: Math.round(r(document.querySelector('.controls')).height), catH: Math.round(r(document.getElementById('catPicker')).height), barH: Math.round(r(document.querySelector('.search-signal-bar')).height)}; }""")))
    if len(sys.argv)>1:
        pg.evaluate("document.querySelector('.controls').scrollIntoView()"); pg.wait_for_timeout(200); pg.mouse.move(1,1); pg.screenshot(path=str(pathlib.Path(__file__).parent/'shots'/f'mobile_space_{sys.argv[1]}.png'))
    br.close()
