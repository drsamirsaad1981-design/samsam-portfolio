"""🔔 The GitHub alerts job: the first run reads the portfolio in full, the next ones only ask "anything new?" — runs tests/alerts_reads_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'alerts_reads_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
