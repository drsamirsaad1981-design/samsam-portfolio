"""Market snapshot (tools/update-market.mjs) with CoinMarketCap's Fear & Greed and Altcoin Season Index — runs tests/market_cmc_test.mjs with Node."""
import subprocess, sys, pathlib
r = subprocess.run(['node', str(pathlib.Path(__file__).parent / 'market_cmc_test.mjs')], capture_output=True, text=True)
print(r.stdout + r.stderr); sys.exit(r.returncode)
