"""📖📊 Firebase reads and feature counts in the Worker (tools/worker/usage.mjs) — runs tests/usage_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'usage_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
