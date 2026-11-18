"""✨ Gold Trend maths (samsam-core.js perfChartSeries) — runs tests/gold_trend_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'gold_trend_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
