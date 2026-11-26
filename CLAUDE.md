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
  GitHub runs a Node test only through a small `.py` wrapper listed in `suite.txt` (see `core_unit_test.py`).
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
  per gram (`assetText`).
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

Third round the same day (his "خلص ٢ و٣ و٤" + the donut's colours):
- Donut / categories: **the palette is measured, never picked by eye** (`samsam-taxonomy.js`; `palette_test.py` holds the
  floor). Every colour that can share the donut — 12 categories + Other, the metals, the Crypto class's violet — is at least
  15 apart (OKLab × 100; it was 2.7, with 14 pairs under 15) and each has its own hue family: Bitcoin orange `#f7931a` ·
  Layer 1 blue `#008cf4` · Layer 2 teal `#00a8a8` · Layer 0 bronze `#9c8424` · AI aqua `#24e4c0` · Oracles magenta `#cc48a8` ·
  DeFi green `#009c00` · Launchpad periwinkle `#9ca8fc` · Web3 lime `#90cc00` · Meme red `#e43c18` · **Shares pink `#fc90b4`**
  (never a blue beside Altcoins / Layer 1) · **gold yellow `#ffd60a`** (the old `#eab308` was 7.9 from Bitcoin) · silver
  `#cbd5e1` · platinum `#a8a29e` · copper `#a0522d`. Shares' text uses the token `--c-stock`; cash's value is green like its
  Net worth dot. 15 hues is the limit: a 16th cannot stay 15 away — and it is not colour-blind safe (blue ~ violet,
  lime ~ orange merge); the name on tap is the second channel. A colour the user picked for a category still wins.
- Exit page: a metal is in grams like every page (amounts `SamsamCoins.grams`, prices `/g`); a step's price is typed per
  gram and saved per ounce (`gpo()` in `samsam-exit.js`; `exit_metal_test.py`). The bot shows a metal's take-profit per
  gram too (`perUnit` in `alerts-core.mjs`; the AI's facts carry `unit: 'USD per gram'`).
- Bot `/signals`: coins only (a metal or a share is not listed), the same count as `/portfolio`.
- Altcoin Season "9-month high / low" in Arabic; `manifest.json` description; the welcome page's goal says "following";
  the bot's AI names CoinMarketCap as the Fear & Greed source; the PDF's zakat line ends "an estimate, not a fatwa";
  19 unused functions removed (app and Worker); `core.test.mjs` and `alerts_reads_test.mjs` now run on GitHub
  (`core_unit_test.py`, `alerts_reads_unit_test.py` in `suite.txt`). `tools/welcome/build_public.py` no longer fails without a demo folder.
- Samir confirmed from his phone (two screenshots) that the Net worth card is the same on Overview and Allocation.

Fourth round (26–27 Nov, his "موافق" on the legend and the small items):
- Allocation: under the donut, every slice of the outer ring by name — dot, whole name, share — in the ring's order
  (`renderHovLegend` in `samsam-hchart.js`; `donut_legend_test.py`). Tap a name = tap its slice. A class with one category
  (shares) is named by its class line only.
- Net worth: a part that is there but rounds to nothing reads "<1%" (card and the bot's line, `wealthParts().t`).
- Phone: the end of a list in the overlay (Allocation, Performance, a coin's transactions) scrolls clear of the AI button.
  In mid-page the button still rests over whatever is there (it fades while scrolling and can be dragged).
- Arabic: grams are "جم" beside every number and price ("62.207 جم", "$128.60/جم") — one rule in `samsam-lang.js`
  (`grams`), the pages keep writing "g". The charts' time axis (a canvas) has Arabic months (`samsam-chart.js`).
- Performance charts: the Gold / Silver trend lines wear the theme's tokens (`--c-gold`, `--c-silver`): yellow on dark, deep
  gold on white and in the PDF — 15.7 from the BTC line's orange (it was 8.1).
- AI report: a coin with no price is flagged (`noPrice`) and valued 0 in its own line as in the totals (it was its cost,
  with "−100%").
- Samir saw the "New in the guide" message (five parts) in the bot and the new colours on his phone.

Proposed, waiting for his "نفذ" — the Project doc "alerts-plan":
- (A) Automatic alerts for members: the same `evaluate`, run for each member inside the Worker's round every 15 min, state
  in `users/<uid>/meta/alerts`, six kinds on by default, quiet hours, a daily cap; owner first, then one member, then all.
- (B) A Bitcoin logarithmic-regression (power-law) alert: weekly fit in GitHub → `m/btcreg.json`, five zones by historical
  share of days, alerts on a zone change at the daily close; bot first, then a Market Hub card and an optional 4th Exit
  indicator. The full history (2010 →) needs a source GitHub Actions can reach — not tested yet.

Still open:
1. The two proposals above.
2. `hv_chart_test.py` ("24h range") fails about one run in four and passes on the retry — not looked into yet.
3. The PDF and the CSV are in English when the app is Arabic.
4. The AI button over a card's corner in mid-page (inherent to a floating button; moving it is a design decision).

## Open ideas (not requested yet)

- A 16th category colour cannot stay 15 away from the others: fold small categories or rely on the legend.
