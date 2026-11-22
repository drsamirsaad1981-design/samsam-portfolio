import json, re, html, pathlib
from playwright.sync_api import sync_playwright
import shots as S
R = json.load(open('bot.json'))
LOGO = (S.REPO / 'logo-mark.svg').read_text()
CSS = """
body{margin:0;background:#0b1220;font-family:'Inter','Cairo',system-ui,sans-serif;color:#e6ebf5}
.wrap{width:390px;padding:0 0 14px;box-sizing:border-box}
.top{display:flex;align-items:center;gap:10px;padding:12px 14px;background:#121a2e;border-bottom:1px solid #223050}
.top svg{width:34px;height:34px}.top b{font-size:16px}.top span{display:block;font-size:12px;color:#93a1bd}
.tag{margin-inline-start:auto;font-size:11px;color:#fbbf24;border:1px solid #6b5a1e;border-radius:999px;padding:3px 9px;white-space:nowrap}
.msg{margin:12px 10px 6px;background:#18223a;border:1px solid #26365a;border-radius:16px;padding:11px 13px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;unicode-bidi:plaintext}
.msg code{font-family:'DejaVu Sans Mono',ui-monospace,monospace;font-size:13px;color:#cfd8ea}
.msg i{color:#9fb0cf}.msg a{color:#93c5fd;text-decoration:none}
.kb{margin:0 10px;display:flex;flex-direction:column;gap:5px}.kb div{display:flex;gap:5px}
.kb span{flex:1;text-align:center;background:#223257;border-radius:9px;padding:9px 4px;font-size:13px;font-weight:600;color:#e6ebf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
"""
def page(m, lang):
    t = re.sub(r'[‎‏⁠⁦⁩]', '', m['text'])
    # each line gets its own direction, as in a chat app
    lines = ''.join(f'<div dir="auto">{l if l.strip() else "&nbsp;"}</div>' for l in t.split('\n'))
    kb = ''.join('<div>' + ''.join(f'<span>{html.escape(b)}</span>' for b in row) + '</div>' for row in m['buttons'])
    tag = 'محفظة تجريبية' if lang == 'ar' else 'Demo portfolio'
    return f'<!doctype html><html dir="{"rtl" if lang == "ar" else "ltr"}"><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo"><style>{CSS}.msg{{white-space:normal}}</style></head><body><div class="wrap" id="w"><div class="top">{LOGO}<div><b>Cute Portfolio</b><span>bot</span></div><span class="tag">{tag}</span></div><div class="msg">{lines}</div><div class="kb">{kb}</div></div></body></html>'
with sync_playwright() as p:
    br = p.chromium.launch(); c = br.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2); S.setup(c); pg = c.new_page()
    for lang in ('en', 'ar'):
        for m in R[lang]:
            if m['label'] not in ('portfolio', 'signals', 'market', 'metals', 'plan', 'exit'): continue
            pg.set_content(page(m, lang)); pg.wait_for_timeout(700)
            pg.locator('#w').screenshot(path=str(S.OUT / f'bot-{lang}-{m["label"]}.png'))
    br.close()
print('ok')
