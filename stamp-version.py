#!/usr/bin/env python3
"""Stamp a release version onto every local script URL so browsers always load the
matching set of files after an update (GitHub Pages lets browsers cache files ~10 min).

Run before each commit:  python3 stamp-version.py
Rewrites  src="samsam-x.js"  /  src="samsam-x.js?v=OLD"  →  src="samsam-x.js?v=NEW"
and the module imports inside samsam-cloud.js the same way.
"""
import re, time, pathlib
root = pathlib.Path(__file__).parent
v = time.strftime('%Y%m%d%H%M')
pat_src = re.compile(r'(src="(?:\./)?(?:samsam-[a-z]+|firebase-config)\.js)(?:\?v=[0-9a-z]+)?(")')
pat_imp = re.compile(r"(from '\./(?:samsam-[a-z]+|firebase-config)\.js)(?:\?v=[0-9a-z]+)?(')")
for name in ['index.html', 'accumulation.html', 'allocation.html', 'performance.html', 'recover.html', 'samsam-cloud.js']:
    p = root / name; s = p.read_text(encoding='utf-8')
    s2 = pat_src.sub(lambda m: f'{m.group(1)}?v={v}{m.group(2)}', s)
    s2 = pat_imp.sub(lambda m: f'{m.group(1)}?v={v}{m.group(2)}', s2)
    if s2 != s: p.write_text(s2, encoding='utf-8'); print('stamped', name, v)
