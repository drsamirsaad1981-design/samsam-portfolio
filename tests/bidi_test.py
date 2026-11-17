"""Arabic right-to-left in Telegram (tools/worker/bidi.mjs) — runs tests/bidi_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'bidi_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
