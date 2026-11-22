import json, time, urllib.request, shots as S
from playwright.sync_api import sync_playwright
from PIL import Image
COINS = [["AERO","aerodrome-finance","Aerodrome Finance"],["AMP","amp-token","Amp"],["APT","APT","Aptos"],["ARB","ARB","Arbitrum"],["ATOM","ATOM","Cosmos"],["AVAIL","AVAIL","Avail"],["AVAX","AVAX","Avalanche"],["BNB","BNB","BNB Chain"],["BTC","BTC","Bitcoin"],["CRO","CRO","Cronos"],["CYBER","cyberconnect","CYBER"],["DOGE","DOGE","Dogecoin"],["DOT","DOT","Polkadot"],["ENS","ENS","ENS Domains"],["ETH","ethereum","Ethereum"],["FIL","filecoin","Filecoin"],["FLR","FLR","Flare"],["GALA","gala","GALA"],["GLMR","GLMR","Moonbeam"],["GRAM","GRAM","Telegram TON"],["HBAR","HBAR","Hedera"],["ICP","ICP","Internet Computer"],["JUP","JUP","Jupiter DEX"],["KAS","KAS","Kaspa"],["KAVA","KAVA","Kava"],["KSM","KSM","Kusama"],["LINK","LINK","Chainlink"],["MNT","MNT","Mantle"],["MON","MON","Monad"],["MOVR","MOVR","Moonriver"],["NEAR","NEAR","NEAR Protocol"],["NIGHT","NIGHT","Midnight"],["ONDO","ONDO","Ondo Finance"],["ONE","harmony","Harmony"],["OP","OP","Optimism"],["POL","POL","Polygon"],["PONS","PONS","Pons"],["PYTH","PYTH","Pyth Network"],["QNT","QNT","Quant"],["RENDER","RENDER","Render"],["RSR","reserve-rights-token","Reserve Rights"],["SEI","SEI","Sei Network"],["SKR","seeker","Seeker"],["SOL","SOL","Solana"],["STRK","STRK","Starknet"],["SUI","SUI","SUI"],["TAO","TAO","Bittensor"],["USDT","tether","Tether"],["VET","VET","VeChain"],["VTHO","VTHO","VeThor"],["VVV","venice-token","Venice Token"],["WLD","WLD","Worldcoin"],["XAG","kinesis-silver","Silver (999)"],["XAU","pax-gold","Gold (24k)"],["XDC","XDC","XDC Network"],["XPL","XPL","Plasma"],["XRP","ripple","XRP"]]
WATCH = [["kinesis-silver","KAG","Kinesis Silver"],["tether-gold","XAUT","Tether Gold"],["pax-gold","PAXG","PAX Gold"],["harmony","ONE","Harmony"],["reserve-rights-token","RSR","Reserve Rights"],["midnight-3","NIGHT","Midnight"],["virtual-protocol","VIRTUAL","Virtuals Protocol"],["ethereum","ETH","Ethereum"]]
bysym = {}
for r in S.rows:
    if r.get('sym') and r.get('id'): bysym.setdefault(r['sym'].upper(), r['id'])
with sync_playwright() as p:
    br = p.chromium.launch(); urllib.request.urlopen(S.SRV + '/reset').read()
    c = S.ctx_for(br, 'laptop', 'en'); pg = c.new_page(); pg.goto(S.SITE + '/index.html'); pg.wait_for_selector('#samsamSignInBtn'); pg.click('#samsamSignInBtn'); S.ready(pg); pg.wait_for_timeout(1000)
    date = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() - 86400))
    for sym, cid, name in COINS:
        cg = cid if cid != sym else bysym.get(sym, '')
        pg.evaluate("([c, o]) => Samsam.addCoin({ ...c, cat: (window.SamsamTaxonomy && SamsamTaxonomy.defaultOf(c.sym)) || 'other' }, o)", [{'sym': sym, 'name': name, **({'cgId': cg} if cg else {})}, {'qty': 1, 'price': 1, 'date': date}]); pg.wait_for_timeout(80)
    pg.evaluate("w => Samsam.saveWatchlist(w)", [{'id': i, 'sym': s, 'name': n} for i, s, n in WATCH]); pg.wait_for_timeout(1500); c.close()
    c = S.ctx_for(br, 'phone', 'ar'); pg = c.new_page(); pg.goto(S.SITE + '/index.html')
    try: pg.click('#samsamSignInBtn', timeout=5000)
    except Exception: pass
    S.ready(pg); pg.wait_for_timeout(7000); pg.goto(S.SITE + '/market.html'); S.ready(pg); pg.wait_for_timeout(6000)
    pg.evaluate("document.querySelectorAll('#cpSplash,.cp-toast,.toast').forEach(e => e.remove())"); pg.add_style_tag(content="#cpAiFab{display:none!important}")
    pg.click('#mkSeg [data-v="crypto"]'); pg.wait_for_timeout(2500)
    pg.evaluate("(() => { const e = document.getElementById('mkSearch'); scrollTo(0, e.getBoundingClientRect().top + scrollY - 190) })()"); pg.wait_for_timeout(900)
    pg.screenshot(path='out/phone-ar-07b-top100.png'); c.close(); br.close()
im = Image.open('out/phone-ar-07b-top100.png').convert('RGB'); im.resize((585, 1266), Image.LANCZOS).save('web/phone-ar-07b-top100.webp', quality=86); im.resize((390, 844)).save('_new100.png')
