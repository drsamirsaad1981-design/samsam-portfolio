# Cute Portfolio — notes for Claude

Samir's app for following his whole wealth (crypto first, plus metals, tokenized shares, cash and certificates), its
Telegram bot, the Signals channel and the public welcome page. 100% non-profit.

## Working rules (the owner's)

- Reply in Egyptian Arabic, in Arabic script (never Franco-Arabic). Code, comments and commit messages stay in English.
- Big changes: discuss first; start only after "نفذ" or "ابدء".
- Run the tests before every push. App release → `python3 stamp-version.py` first.
- No secrets in code; never ask for a token in chat. The GitHub token is the fine-grained "samsam-worker".
- Dialogs: `CPDialog` only — never `alert` / `confirm` / `prompt`.
- Public posts on X need his approval of the exact text.
- Wording: "follow / track your wealth", "net worth" — never "wealth management" (a licensed activity; the app holds no money).

## Decisions in force

- Total portfolio = coins + shares + metals. Cash & certificates count in **Net worth only**.
- Profit, allocation, targets and "vs BTC" are on the portfolio only.
- Signals (Hold / Reinforce / Sell), Altcoin Season and "coins beat BTC" are **crypto only**; a metal or a share has none.
- Metals (XAU, XAG, XPT, XCU) are stored in troy ounces and shown in grams (copper too).
- Zakat: one pool (crypto + metals + cash + shares by a switch) against 85 g of gold, 2.5%; the hijri year is fixed on the
  zakat day; it stays due until ✓ Paid. Always "an estimate, not a fatwa".
- Fear & Greed: CoinMarketCap's value (kept up to 6 h when CMC answers 429; the app accepts it up to 6.5 h old),
  alternative.me only as a fallback.
- The Net worth card shows on Overview and on Allocation only.

## Where things are

| Part | Files |
|---|---|
| App pages (GitHub Pages) | `index.html` (Overview / Performance / Allocation), `accumulation.html` (Plan + Exit), `market.html` (Market Hub), `performance.html`, `altseason.html` |
| Maths, no network (shared by app, bot, alerts) | `samsam-core.js` — asset classes, plan, DCA, cash, zakat, signals |
| Data: the only reader / writer | `samsam-cloud.js` → Firestore `users/<uid>/{coins,txs,accum,snaps,meta}` (settings in `meta/info`) |
| Main page | `samsam-home.js` (+ `samsam-home.css`), `samsam-hchart.js`, `samsam-analysis.js` (AI report), `samsam-cash.js` |
| Shared UI | `samsam-ui.js` (header, footer, bottom bar, AI button, CPDialog), `samsam-lang.js` + `samsam-ar.js` (Arabic), `samsam-hints.js` |
| Market data in the app | `samsam-market.js` (snapshot first, CoinGecko live) |
| Taxonomy | `samsam-taxonomy.js` (classes crypto / stock / metal / cash, categories) |
| Market snapshot (GitHub Actions → branch `prices`) | `tools/update-market.mjs`, `tools/update-prices.mjs`, `tools/update-etf.mjs` → `m/market.json`, `m/etf.json`, `p/*.json` |
| Bot + AI (Cloudflare Worker) | `tools/worker/*.mjs` (bot, ai tools, daily jobs, data), `tools/ai-worker.js`, `tools/alerts-core.mjs` (summary + messages) |
| Built Worker | `tools/dist/samsam-worker.js` — never edit; `cd tools && node build-worker.mjs` |
| Welcome page | sources `tools/welcome/src/*.dc.html`; build `python3 tools/welcome/build_public.py` (+ `build_privacy.py`, `og.py`); output `welcome/` — never edit the output |
| Guide | `guide-app.json` (app), `guide.json` (bot) |

One answer everywhere: a number shown in two places must come from one function (e.g. `wealthNow()` for the Net worth card,
the PDF, the CSV and the AI report; `summarize().wealth` in the bot; `zakatPool` / `zakatYear` for zakat in app and bot).

## Build, test, release

- Branch `drop-holdings`; push with `git push -q origin drop-holdings && git push -q origin drop-holdings:main`.
- Browser tests: `python3 tests/run.py <file>…` (starts the site and a fake Firestore; no argument = `tests/suite.txt`).
  **A new test file must be added to `tests/suite.txt`, or GitHub never runs it.**
- Node tests: `node tests/tg_bot_test.mjs` (also the deploy gate), `alerts_test.mjs`, `core.test.mjs`, `asset_classes_test.mjs`.
- Worker: any change under `tools/worker`, `tools/ai-worker.js`, `tools/alerts-core.mjs` or `samsam-core.js` → rebuild
  `tools/dist/samsam-worker.js` (the bot test fails when it is stale). "Deploy Worker" runs when the built file changes.
- GitHub: "Tests" (4 shards, 10–30 min), "Price history" (twice an hour), "Deploy Worker", Pages.
- Fonts differ by page (Overview: Cairo first; overlays: Inter) and do not load in the test browser — set the font on a
  shared card explicitly, and test `font-family` / `line-height`, not only pixels.
- Never slice code up to "the next `}`" when replacing a function: check with `git diff` that only the intended lines changed.

## Where we stopped (26 Nov 2026) — read this first in a new chat

Done and live, in this order:
1. Home: three market cards (Fear & Greed gauge, Altcoin Season, dominance) → Market Hub; the moving line above Net worth
   (no duplicates, no links); the AI button starts low, above the bottom bar.
2. Net worth card on Overview and Allocation (one font / line height in both; not on a coin's Transactions).
3. Welcome page rewritten around "your whole wealth in one place" (AR + EN, share images, new overview screenshots).
4. PDF, CSV and the app's AI report carry the whole wealth (Net worth by part, metals in grams, zakat, market numbers).
5. Bot: Net worth line in /portfolio, the morning brief and the weekly report; AI tools `get_portfolio → net_worth` and
   `get_zakat`; signal counts are coins only.
6. A Claude Project "Cute Portfolio" holds the working rules; the program's map is a Whiteboard (link in the Project).

**The full review was done on 26 Nov 2026 (Fable 5.2).** The report is in the Claude Project ("Full review — 26 Nov 2026").
Checked and fine: Total Portfolio, profit, Net worth by part and zakat are the same to the cent in the app and the bot
(coins + metals + a share + cash in three currencies); no page scrolls sideways at 390 / 320 px in either language.
Fixed then: charts after a reload were not redrawn when the saved prices arrived after the shared files (`samsam-history.js`;
`hist_test.py` now checks it).

Fixed after the review (26 Nov, his "نفذ"):
- Bot `/portfolio`: the month's DCA total adds dollars (`usdMo`); the morning's facts give a saving in its own currency.
- Metals: no zakat line of their own anywhere (`SamsamCoins.zakat` is gone; one pool); the price beside a metal's name is
  per gram (`assetText`; `perOz: true` keeps the ounce on the Exit page, which is still in ounces for a metal).
- Zakat: a day that passed with nobody there to keep its pool stays open (`zakatYear` → `late`, today's value until kept),
  only for an account that already existed that day (`firstSeen` = its first `coin.addedAt`, never a transaction's date).
- `portfolio.html` is a redirect to `index.html` (out of `sw.js`).
- App guide: Overview (three market cards + the moving line), Signals (Smart check, daily close).
- Members and alerts (his decision: fix the words now, the Worker later): the Price Alert hint and the app guide no longer
  promise a member a message at the moment — they say "Hit" on the row, the bot's morning message, or an alert in words.

Second round the same day (his "عدل البوت … توحيد الألوان … bStocks"):
- Colours: **one meaning, one colour** — the tokens live in `samsam-ui.js` → `darkTheme()` (screen only; print keeps its
  paper palette): `--green / --red / --blue / --btc / --c-amber / --c-gold / --c-sky / --c-violet / --c-orange / --c-link /
  --c-mute`. Dark: green `#22c55e`, red `#f87171`. Light: green `#15803d`, red `#dc2626`, and the same `--bg / --fg / --fg2`
  on every page. Never write a profit / loss / link colour as a literal: use the token (`palette_test.py` checks it).
  A bar's fill may stay bright; the words beside it use the token.
- bStocks (Market Hub): a row shows the company's own name (`stockName` strips "(bStocks Tokenized Stock)"), the logo is
  36 px like a coin's, Arabic rows keep Latin names left-to-right.
- Bot: every message is in the chat's language — the fired alert-in-words, `/alerts`, the trade summary and its
  Confirm / Cancel (they followed the question's language), the pinned message, dates (`localL`, Latin digits), Arabic
  counts (`arCount`: ساعة / ساعتين / 3 ساعات), "مركز السوق", "خريطة التصفيات", "د. سمير سعد" inside Arabic text.
  Stocks view: "best" lists risers only, "worst" fallers only.
- Bot guide (`guide.json`, approved): "Daily messages and radars" now says an alert in words comes at the moment; a buy
  price, a take-profit and a due regular buy are in the morning message.

Still open:
1. Automatic alerts for members from the Worker (buy-price, DCA day, take-profit, signal change, weekly report): a phase
   of its own, to plan with Samir first. Today `evaluate` runs only in `tools/alerts.mjs` on GitHub, for the owner.
2. (done — the bot guide's line was corrected in the second round.)
3. The Exit page shows a metal in troy ounces (amounts, average, levels).
4. Smaller: bot `/signals` counts metals and shares under Hold; `core.test.mjs` and `alerts_reads_test.mjs` never run on
   GitHub; "9-month high / low" untranslated; `manifest.json` description; the welcome page's goal says "managing";
   the bot's AI names alternative.me as a source; the PDF's zakat line has no "estimate" note; 14 unused functions.
5. `hv_chart_test.py` ("24h range") fails about one run in four locally and passes on the retry — not looked into yet.

Samir has not yet confirmed on his phone that the Net worth card looks the same on Overview and Allocation.

## Open ideas (not requested yet)

- The AI button can still sit over the last card's link at the bottom of a page.
