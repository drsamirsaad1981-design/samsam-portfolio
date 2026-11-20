# 🔬 Signal-rule lab

Experiments on the app's signal rule, kept apart from the app. **Nothing here changes the live rule**
(`samsam-core.js` → `signalFor`).

## Run it again

GitHub → Actions → **Backtest** → Run workflow. It fetches a year of daily prices (CoinGecko), runs the app's own
backtest (`tools/backtest.mjs`) and then this lab on the same prices. Both reports are in the run's summary, and
`series.json`, `lab.md`, `lab.json` can be downloaded from the run.

By hand, with a `series.json` from a run:

    node tools/lab/backtest-lab.mjs series.json lab.md

## What it compares

$10,000 split over the altcoins on day 1 + $100 a week, 0.2% fee on every buy and sell, signals followed once a week.

| Key | Rule |
|---|---|
| Smart (today) | the live rule |
| A / A30 | Sell needs proof of weakness vs BTC (30 + 90 days / 30 days only) |
| B | no Sell while BTC itself is down 10 / 15 / 20 % in 30 days |
| D / D30 | A + B together |
| E | Reinforce only when the coin's last 7 days are firm (≥ 0 % / ≥ −5 %) |
| C | threshold grid: Reinforce −5 / −10 / −15, Sell −20 / −30 / −40 |

Columns: worth at the end, vs BTC, vs today's rule, worst drop, trades (Reinforce buys + Sells), sells that helped,
fees, the luck test (the rule's sells against random sells in the same weeks; ~50% = luck), and the same comparison
from six entry dates.

## Results so far

- [`results-2026-11.md`](results-2026-11.md) — Feb → Nov 2026, 40 altcoins. **No rule beat today's.** Every rule that
  delays selling (A, B, D) ended lower: altcoins lost to BTC over the whole period, so selling early paid.
  E (≥ −5 %) cut the trades from 185 to 118 for about 1% less — it became the app's optional **Calm mode**
  (off by default), not the default.

## When to run it again

The 2026 data is one long weak stretch for altcoins. Run it again once there is a full altcoin up-cycle in the
last 12 months: A and D may look different there. Change the live rule only on a clear win that also makes sense —
with this many rules tried, one of them will always come first by chance.

> ⚠️ Not financial advice. Tests of rules on past prices, for information only.
