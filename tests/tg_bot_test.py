"""Telegram bot (tools/worker → tools/dist/samsam-worker.js) — runs tests/tg_bot_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'tg_bot_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
