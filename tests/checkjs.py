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
sys.exit(1 if bad else 0)
