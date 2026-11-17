"""🔌 Live exchange balances (tools/worker/cex.mjs) — runs tests/cex_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'cex_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
