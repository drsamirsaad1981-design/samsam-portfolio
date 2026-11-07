import re,sys,subprocess,tempfile,os
import glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bad = 0
for f in (sys.argv[1:] or sorted(glob.glob(os.path.join(ROOT, '*.html')))):
    s=open(f,encoding='utf-8').read()
    blocks=re.findall(r'<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>',s,re.S)
    for i,(attrs,code) in enumerate(blocks):
        ext='.mjs' if 'module' in attrs else '.js'
        t=tempfile.NamedTemporaryFile('w',suffix=ext,delete=False); t.write(code); t.close()
        r=subprocess.run(['node','--check',t.name],capture_output=True,text=True)
        print(f, i, 'OK' if r.returncode==0 else r.stderr[:800]); os.unlink(t.name); bad += r.returncode != 0
# the page code that lives in its own files (moved out of index.html)
if not sys.argv[1:]:
    for f in sorted(glob.glob(os.path.join(ROOT, 'samsam-*.js'))):
        if f.endswith('samsam-cloud.js') or f.endswith('samsam-core.js'): ext_ok = subprocess.run(['node', '--check', '--input-type=module'], input=open(f).read(), capture_output=True, text=True)
        else: ext_ok = subprocess.run(['node', '--check', f], capture_output=True, text=True)
        print(os.path.basename(f), 'OK' if ext_ok.returncode == 0 else ext_ok.stderr[:800]); bad += ext_ok.returncode != 0
sys.exit(1 if bad else 0)
