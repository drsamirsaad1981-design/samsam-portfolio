"""🌈 The Bitcoin rainbow (samsam-core.js → rainbowFit / rainbowRead, tools/update-rainbow.mjs) — runs tests/rainbow_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'rainbow_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
