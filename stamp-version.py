#!/usr/bin/env python3
"""Stamp a release version onto every local script URL so browsers always load the
matching set of files after an update (GitHub Pages lets browsers cache files ~10 min).

Run before each commit:  python3 stamp-version.py
Rewrites  src="samsam-x.js"  /  src="samsam-x.js?v=OLD"  →  src="samsam-x.js?v=NEW",
href="samsam-x.css" the same way, and the module imports inside samsam-cloud.js.
"""
import re, time, pathlib
root = pathlib.Path(__file__).parent
v = time.strftime('%Y%m%d%H%M')
pat_src = re.compile(r'(src="(?:\./)?(?:samsam-[a-z]+|firebase-config)\.js)(?:\?v=[0-9a-z]+)?(")')
pat_css = re.compile(r'(href="(?:\./)?samsam-[a-z]+\.css)(?:\?v=[0-9a-z]+)?(")')
pat_imp = re.compile(r"(from '\./(?:samsam-[a-z]+|firebase-config)\.js)(?:\?v=[0-9a-z]+)?(')")
for name in ['index.html', 'accumulation.html', 'performance.html', 'recover.html', 'market.html', 'altseason.html', 'samsam-cloud.js']:
    p = root / name; s = p.read_text(encoding='utf-8')
    s2 = pat_src.sub(lambda m: f'{m.group(1)}?v={v}{m.group(2)}', s)
    s2 = pat_css.sub(lambda m: f'{m.group(1)}?v={v}{m.group(2)}', s2)
    s2 = pat_imp.sub(lambda m: f'{m.group(1)}?v={v}{m.group(2)}', s2)
    if s2 != s: p.write_text(s2, encoding='utf-8'); print('stamped', name, v)
# the service worker's cache name: a new release clears the old offline copies
sw = root / 'sw.js'
if sw.exists():
    s = sw.read_text(encoding='utf-8'); s2 = re.sub(r"const VERSION = 'cp-[0-9a-z]+';", f"const VERSION = 'cp-{v}';", s)
    if s2 != s: sw.write_text(s2, encoding='utf-8'); print('stamped sw.js', v)
