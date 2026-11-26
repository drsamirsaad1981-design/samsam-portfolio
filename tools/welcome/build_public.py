"""Build the public welcome page (welcome/index.html Arabic, welcome/en.html English) from the design files."""
import re, pathlib, shutil, hashlib
HERE = pathlib.Path(__file__).resolve().parent; ROOT = HERE.parent.parent   # tools/welcome → the repo
P = HERE / 'src'; W = (pathlib.Path('/home/claude/demo/web') if pathlib.Path('/home/claude/demo/web').exists() else ROOT / 'welcome' / 'img'); OUT = ROOT / 'welcome'; (OUT / 'img').mkdir(parents=True, exist_ok=True)
import json
MAP = json.load(open(HERE / 'assets.json'))
SITE = 'https://drsamirsaad1981-design.github.io/samsam-portfolio/welcome/'
META = {'ar': ('Cute Portfolio — ثروتك كلها في مكان واحد، بهدوء وانضباط', 'تطبيق وبوت تيليجرام لمتابعة ثروتك كلها: العملات الرقمية والذهب والأسهم والنقد في صافي ثروة واحد، ومقارنة بالبيتكوين والذهب والفضة، مع إشارات انضباط وخطة تجميع وخروج. مجاني، غير ربحي، بالدعوة.', 'index.html'),
        'en': ('Cute Portfolio — your whole wealth in one place, calmly, by your own rules', 'An app and a Telegram bot for following all your wealth: crypto, gold, shares and cash in one net worth, compared with Bitcoin, gold and silver, with discipline signals and an accumulation and exit plan. Free, non-profit, by invitation.', 'en.html')}
for src, l in (('Main.dc.html', 'ar'), ('English.dc.html', 'en')):
    s = (P / src).read_text(encoding='utf8'); ids = set(re.findall(r'/_blob/([0-9a-f]{32})', s))
    for i in ids:
        f = MAP[i]
        if W != OUT / 'img': shutil.copyfile(W / f'{f}.webp', OUT / 'img' / f'{f}.webp')   # (no demo folder: the images are already in place)
        s = s.replace(f'/_blob/{i}', f'img/{f}.webp?v=' + hashlib.md5((W / f'{f}.webp').read_bytes()).hexdigest()[:8])
    body = s[s.index('<x-dc>') + 6:s.index('</x-dc>')]
    hel = re.search(r'<helmet>(.*?)</helmet>', body, re.S); body = body.replace(hel.group(0), '').strip().replace('{{accent}}', '#7c3aed')
    body = body.replace('href="English.dc.html"', 'href="en.html"').replace('href="Main.dc.html"', 'href="./"')
    assert '.dc.html' not in body and '{{' not in body and '/_blob/' not in body
    body = body.replace('<img ', '<img decoding="async" width="585" height="1266" ', 0)
    title, desc, name = META[l]
    head = f'''<!doctype html>
<html lang="{l}" dir="{'rtl' if l == 'ar' else 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#0a0e1a">
<link rel="canonical" href="{SITE}{'' if l == 'ar' else 'en.html'}">
<link rel="alternate" hreflang="ar" href="{SITE}">
<link rel="alternate" hreflang="en" href="{SITE}en.html">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{SITE}{'' if l == 'ar' else 'en.html'}">
<meta property="og:image" content="{SITE}img/og-{l}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="{SITE}img/og-{l}.png">
<link rel="icon" type="image/png" sizes="32x32" href="../favicon-32.png?v=2">
<link rel="apple-touch-icon" href="../apple-touch-icon.png?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{hel.group(1).strip()}
<style>html{{scroll-behavior:smooth}}section[id]{{scroll-margin-top:12px}}@media (prefers-reduced-motion:reduce){{html{{scroll-behavior:auto}}}}</style>
</head>
<body>
'''
    (OUT / name).write_text(head + body + '\n</body>\n</html>\n', encoding='utf8'); print(name, len(head + body))
print(sum(f.stat().st_size for f in (OUT / 'img').iterdir()) // 1024, 'KB images', len(list((OUT / 'img').iterdir())))
