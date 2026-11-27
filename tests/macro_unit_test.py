"""MVRV, the dollar index, BTC funding (samsam-core.js → mvrvRead / dxyNow / fundingNow / fundingRead, tools/update-macro.mjs) — runs tests/macro_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'macro_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
