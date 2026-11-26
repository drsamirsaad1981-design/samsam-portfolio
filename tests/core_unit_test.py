"""🧮 The shared maths (samsam-core.js: average cost, a sell, a transfer, staking) — runs tests/core.test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'core.test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
