"""The Binance relay (tools/binance-relay) — runs tests/binance_relay_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'binance_relay_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
