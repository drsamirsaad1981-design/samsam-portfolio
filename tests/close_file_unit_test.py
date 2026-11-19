"""⏳ p/close.json (every coin's daily close) from tools/update-prices.mjs — runs tests/close_file_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'close_file_test.mjs')], capture_output=True, text=True, timeout=300)
print(r.stdout + r.stderr); sys.exit(r.returncode)
