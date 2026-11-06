# Tests

Browser tests for the whole app (Playwright + Chromium), run by GitHub on every change to the site
(**Actions → Tests**) and on demand (**Run workflow**). They use a fake Firebase (`fakefs/`) and fixed
market data, so they never touch the real account or the live APIs.

Run them yourself:

```
pip install playwright && python -m playwright install chromium
python3 tests/run.py                 # everything in suite.txt
python3 tests/run.py market_test.py  # one test
```

- `suite.txt` — the list GitHub runs (a new test goes here).
- `run.py` — starts the local servers, resets the fake database before each test, retries a failure once.
- `e2e_setup.py` — shared setup: fake sign-in, fake Firestore, fixed prices, no outside network.
