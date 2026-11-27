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
- 🌈 Bitcoin rainbow (27 Nov): one trend line through every daily close since 18 Aug 2010, nine equal bands (log scale); the
  line is in band 4. **A band counts after two daily closes in a row** ("the band that holds"). The line is fitted again
  once a week (closes up to the last Sunday, UTC). Names (his mix, low → high): Rare historic low · Deep discount ·
  Accumulation zone · Around the trend line · Above the trend line · Warming up · Hot · Very hot · Bubble
  (قاع تاريخي نادر · خصم عميق · منطقة تجميع · حول خط الاتجاه · فوق خط الاتجاه · بداية سخونة · سخونة · سخونة عالية · فقاعة) —
  never "buy" / "sell", never "fair value" (the line is a trend, not a valuation). Always "it describes the past, not a
  forecast". The alert goes on every move between bands. On the Exit page its level is the band **you** choose (6 until
  you do). Bitcoin only.
- Exit conditions come in **two groups, counted apart — never one counter** (27 Nov): **Market structure** (BTC dominance,
  USDT dominance, ETH/BTC) and **Bitcoin valuation** (the rainbow band, the Pi Cycle, MVRV) — the second group's readings
  move together. App: "Market Structure: n of 3 · Bitcoin Valuation: n of 3"; bot the same (`exitGroups`).
- MVRV (27 Nov): Coin Metrics' daily ratio (market value ÷ realized value), one day behind. The level is the user's (1–10,
  **3.0 until chosen**); **its alert is off until the user turns it on** (like the Pi Cycle's). **The source is named
  wherever the ratio shows** ("Source: Coin Metrics" — its free data is CC BY-NC 4.0). The average cost it implies is "a
  reference, not a floor".
- BTC funding (27 Nov): **one rate from several venues weighted by open interest, and the big venues that are NOT in it are
  named beside it** ("without Binance and Bybit" on the card and in the bot — from the snapshot's `missing`, never typed
  in). **One wording everywhere** (`fundingRead`): hot ≥ +0.03% per 8 h · up > +0.01% · rest 0…+0.01% · neg < 0 · deep ≤
  −0.01% — edges from the last year's payments, not 2021's. A mood reading, never an exit condition.
- The dollar index (27 Nov, his ranges): the card is the number and its **level in words** — under 90 Weak dollar · 90–100
  Below the base of 100 · 100–105 Moderate strength · 105–110 High strength · over 110 **Rare strength** (a level, never a
  cause: not "tightening") — `dxyRead` / `DXY_WORDS`. What it does to other assets is said **only in the ⓘ and only as
  what was measured** (gold moved against it in 68% of weeks over 10 years; Bitcoin in 53% — close to chance), never as a
  rule and never on the card or in the bot's line.
- The Exit card's two counts are **filters** (a tap shows that group alone, a second tap both); each group has its own
  headed line (name · ⓘ · count). Market Structure = "signs that usually show late in a cycle — not a verdict that the
  top is in"; Bitcoin Valuation = "whether Bitcoin's own price has reached a high zone against its history".
- A change that rounds to 0.00 has no sign and no colour (never a red "−0.00%") — `pct` in `alerts-core.mjs` and in
  `samsam-assets.js`.
- Pi Cycle: the 111-day average as a percent of twice the 350-day one (100 = the cross). Shown as a distance with each
  cycle's highest; the level is the user's (50–150, 100 until chosen); **its alert is off until the user turns it on**.
- 200-week average: the mean of the last 200 Sunday closes — "a reference, not a floor" (daily closes have been under it).
- Max drawdown is measured on the profit-% line read as an index (1 + profit% ÷ 100), so money added or taken out is not a
  rise or a fall; it is the period the chart shows.
- These top indicators did not fire at the October 2025 top (no Pi cross, MVRV under its old line): show the distance and
  what each cycle reached, let the user choose the level — never a fixed "top" alarm.

## Where things are

| Part | Files |
|---|---|
| App pages (GitHub Pages) | `index.html` (Overview / Performance / Allocation), `accumulation.html` (Plan + Exit), `market.html` (Market Hub), `performance.html`, `altseason.html` |
| Maths, no network (shared by app, bot, alerts) | `samsam-core.js` — asset classes, plan, DCA, cash, zakat, signals |
| Data: the only reader / writer | `samsam-cloud.js` → Firestore `users/<uid>/{coins,txs,accum,snaps,meta}` (settings in `meta/info`) |
| Main page | `samsam-home.js` (+ `samsam-home.css`), `samsam-hchart.js`, `samsam-analysis.js` (AI report), `samsam-cash.js` |
| Shared UI | `samsam-ui.js` (header, footer, bottom bar, AI button, CPDialog), `samsam-lang.js` + `samsam-ar.js` (Arabic), `samsam-hints.js` |
| Market data in the app | `samsam-market.js` (snapshot first, CoinGecko live) |
| 🌈 Bitcoin rainbow | maths + names `samsam-core.js` (`rainbowFit`, `rainbowRead`, `RAINBOW_NAMES`); the daily job `tools/update-rainbow.mjs` → `m/btcday.json` (every close since 2010) + `m/rainbow.json` (its small part is copied into `m/market.json` by `update-market.mjs` — the Worker has no outside call to spare); Market Hub card `samsam-rainbow.js`; the bot's lines and the alert `tools/alerts-core.mjs` (`rainbowLines`, `evaluate` 4b); the labs `tools/lab/rainbow.mjs` and `tools/lab/macro.mjs` (trials only: they run on GitHub, write nothing, and report in the run's summary). The same job and file carry 📏 the 200-week average and the Pi Cycle (`w200`, `pi`; `btcW200`, `btcPi`, one reader `btcMarks`); 📉 `maxDrawdown` is in the core too (Performance page) |
| MVRV · 💵 dollar index · ⚖️ BTC funding | the job `tools/update-macro.mjs` → `m/macro.json` (+ `m/mvrv.json`, MVRV's whole history) — its three parts are copied into `m/market.json` (`mvrv`, `dxy`, `funding`) by `update-market.mjs`; readers and the funding wording in `samsam-core.js` (`mvrvRead`, `dxyNow`, `fundingNow`, `fundingRead` / `FUNDING_WORDS`); Exit row `samsam-exit.js`; Market Hub: `samsam-funding.js` (card), the MVRV row in `samsam-rainbow.js`, the dollar card in `samsam-assets.js` (Metals tab); Plan line `costNote` in `accumulation.html`; bot `macroLines` (`alerts-core.mjs`, in /market), `macroFacts` (`ai.mjs`); the lab `tools/lab/macro.mjs` |
| Taxonomy | `samsam-taxonomy.js` (classes crypto / stock / metal / cash, categories) |
| Market snapshot (GitHub Actions → branch `prices`) | `tools/update-market.mjs`, `tools/update-prices.mjs`, `tools/update-etf.mjs` → `m/market.json`, `m/etf.json`, `p/*.json` |
| Bot + AI (Cloudflare Worker) | `tools/worker/*.mjs` (bot, ai tools, daily jobs, data), `tools/ai-worker.js`, `tools/alerts-core.mjs` (summary + messages) |
| Built Worker | `tools/dist/samsam-worker.js` — never edit; `cd tools && node build-worker.mjs` |
| Welcome page | sources `tools/welcome/src/*.dc.html`; build `python3 tools/welcome/build_public.py` (+ `build_privacy.py`, `og.py`); output `welcome/` — never edit the output |
| Guide | `guide-app.json` (app), `guide.json` (bot) |

One answer everywhere: a number shown in two places must come from one function (e.g. `wealthNow()` for the Net worth card,
the PDF, the CSV and the AI report; `summarize().wealth` in the bot; `zakatPool` / `zakatYear` for zakat in app and bot;
`rainbowRead()` for the rainbow band in the bot's line, the alert, the Exit page and the Market Hub card; `mvrvRead()`,
`dxyNow()`, `fundingNow()` + `fundingRead()` for MVRV, the dollar index and BTC funding in the app, the bot and the radar).

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

## Where we stopped (27 Nov 2026) — read this first in a new chat

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

Fifth round (27 Nov, his "ابدأ" with three decisions) — 🌈 the Bitcoin rainbow, live:
- The maths moved from the lab into `samsam-core.js`; `tools/update-rainbow.mjs` runs before the market snapshot in
  "Price history": the first run takes the old days from blockchain.com once and **refuses to write unless they give the
  published line** (b 5.5943, a −16.1839, 5,930 days to 11 Nov 2026); after that only the missing Binance closes are asked
  for (Bitstamp when Binance is silent). A file whose last close is over 4 days old is ignored everywhere.
- Bot: two short lines in `/market` and in the weekly report (not the morning brief); the AI's `get_market` carries
  `bitcoin_rainbow`. Alert `rb-<band>` for the owner (GitHub's `evaluate`; switch `rainbow` in the alerts sheet, 15
  switches now): sent at once, after 07:00; when the move reaches his exit band the same message says so.
- Exit conditions are **four** everywhere (app "Signals Hit: n of 4", bot "n of 4", `sum.macro[3]`): the rainbow band at
  or over `exitTargets.rainbow` (1–9, default `RAINBOW_EXIT` = 6). Under the field: the highest band each cycle held
  (`peaks`, halving to halving — from the file, never typed in).
- Market Hub: the card under ETF Flows (closed: the band, its name, the strip of nine with the close's place; open: four
  numbers, the log chart since 2010 with hover, the table of bands, the cycles, the last moves). `market.html#rainbow`
  opens it (the alert's button). Nine band colours measured like the donut's (every pair ≥ 15, closest 15.6); a band is
  never told by colour alone (its number is on the strip, in the tooltip, in the table).
- The first real file (GitHub, 26 Nov 23:55 UTC): the self-check passed (5,930 days, b 5.5943, a −16.1839); the week's
  line b 5.5912, a −16.1738; close 25 Nov $60,458, the line $143,851, 58% under, **band 2 since 13 Nov** ($42,683–$70,481).
  The highest band that held in each cycle: 2011: 9 · 2013: 9 · 2017: 8 · 2021: 6 · 2024: 5 (14 Dec 2024; the price top
  of Oct 2025 itself closed in band 4). **8 moves in the last year**, five of them in six weeks (Jul–Aug 2026) while the
  price sat on the 2 / 3 edge — if that is too many alerts: three closes, or a margin from the edge (his call).
- Arabic finish (27 Nov, from his phone's screenshot): a move is said in words — "من 3 إلى 2" (the arrow "3 → 2" kept
  left-to-right inside a right-to-left line reads backwards from the right; English keeps the arrow); a price / percent
  inside an Arabic sentence goes through `n()` in `samsam-ar.js` ("$60,577", "58%" — a rule that returns plain text gets
  no isolation, `iso()` skips anything with Arabic in it); on a phone the band and its name have their own line in the
  card's header; a scroll that starts on the chart leaves no crosshair (`pointercancel`); the Top 200 · 300 · 500 note
  ("Coins 101–500: Binance prices from … · coins 1–100 are live") is Arabic.
- `guide.json` (the bot's guide) was NOT touched — it posts to the channel; a rainbow section needs his approval first.
- His first list of names had "Fair value" on band 5; the line runs through band 4, so the names follow the line
  (he agreed: "توجيهك أدق").

Sixth round (27 Nov, his "نفذ" for group 1 of six new indicators — the ones that need no new source):
- 📏 200-week average: a row + the dashed line in the rainbow card (how many daily closes were under it, the last one), one
  quiet line under Bitcoin's Buy At on the Plan (`w200Note`), the AI's facts.
- Pi Cycle: a row in the Exit page's new **Bitcoin valuation** group (its two averages under it; the field's note has each
  cycle's highest and the last cross — from the file), `exitTargets.pi`, alert switch `pi` (off; again only after a fall
  of 2 points under the level). The alerts sheet has 16 switches, 15 on.
- The Exit card: two count chips and two headed groups (it was one "Signals Hit: n of 4"); the state "Close" is now
  "Near" (Arabic read it as the Close button: "إغلاق" → "قريب"). Bot: `/exit` in two groups, `/portfolio` "Exit 0/3 · 0/2",
  the pinned message the same (it said "/3" with four conditions — fixed), the brief's line, the AI's `group`.
- 📉 Max drawdown under the Portfolio vs BTC chart (performance.html → `#pccDd`): yours beside BTC Trend (and gold / silver
  when their lines are on), with the dates of your deepest fall; `drawdown_test.py` checks it against a plain calculation.
- The real numbers (27 Nov): 200-week average $68,176 — the close ($60,577) is 11% **under** it since 14 Nov; 388 of 4,548
  daily closes since 2014 were under it (8.5%). Pi Cycle 51.2% ($76,186 vs $148,891); each cycle's highest: 2013 122.8% ·
  Jan 2018 105.8% · Apr 2021 100.3% · this cycle 73.6% (1 Jun 2024); crosses 7 Apr 2013, 7 Dec 2013, 16 Dec 2017,
  12 Apr 2021 — none in this cycle. (A cycle's highest is labelled by the year it happened: the 2017 cycle reads "2018".)
- `m/rainbow.json` has a make-up number (`gen`): a higher one rewrites the file from the kept days, with no request.
- Headings are Title Case and never capitals by CSS (`title_check.py` — it failed on GitHub for "Max drawdown" and was not
  in the local subset): "Market Structure", "Bitcoin Valuation", "Max Drawdown". The bot's own lines stay sentence case.
- A lesson: a `// comment` appended inside a one-line `try { … } catch` swallowed the `catch` (update-market.mjs) —
  `market_cmc_test.mjs` caught it before the push. Put the comment after the whole statement, and run every Node test.

Seventh round (27 Nov, his "نفذ" with four decisions, after the lab trial `tools/lab/macro.mjs`) — group 2, live:
- **The lab's findings** (the numbers are in the Project doc "indicators-plan"): Coin Metrics gives MVRV free (every day
  since 2010, one day behind; realized cap alone is NOT free, so the ratio is theirs); each cycle's highest 7.74 · 5.88 ·
  4.72 · 3.96 · **2.74** (21 Nov 2024; 2.29 at the price top of Oct 2025); 3.5 last seen 19 Mar 2021. Yahoo `DX-Y.NYB`
  answers (`DX=F` does not exist, stooq refuses GitHub); the index rebuilt from its six currencies is within 0.07%. From
  GitHub (a US address) Binance (451) and Bybit (403) refuse; OKX, Bitget, Gate, Hyperliquid, Deribit answer. **In the
  last 365 days BTC, ETH and SOL funding was never once over the resting +0.01%** (Binance's public archive); at or under
  −0.01%: BTC 0.5% of payments, ETH 2.8%, SOL 11.3%. The week of the Oct 2025 top was an ordinary one.
- `tools/update-macro.mjs` (a step in "Price history", before the snapshot): MVRV asked for the missing days only and kept
  in `m/mvrv.json`; **after two days of Coin Metrics' silence blockchain.com stands in for the DAY's value** (marked
  `via`, never written into the history); the dollar index falls back to ICE's formula over Yahoo's six pairs; funding
  needs 3 venues or the last answer stays. Readers drop an old part: MVRV 4 days, the dollar 5 days, funding 6 hours.
- MVRV: the third row of Bitcoin Valuation on the Exit page (`exitTargets.mvrv`, default `MVRV_EXIT` = 3; "Near" within
  10%; each cycle's highest and the source under the field), a row in the rainbow card, one quiet line under Bitcoin's
  Buy At on the Plan ("Market's average cost $… · the price is n% above it · Source: Coin Metrics"), alert switch `mvrv`
  (off; again only after a fall of 0.1 under the level). The alerts sheet has 17 switches, 15 on.
- BTC Funding card under the rainbow card (`samsam-funding.js`, folded: rate · state · "without …"; open: 7-day mean, a year
  at this rate, every venue's rate and open interest, the note). Dollar index card at the end of the Metals tab.
- Bot: `/market` has a dollar line and two funding lines (`macroLines` — NOT in the brief or the weekly report); `/exit`
  shows MVRV with "MVRV · source: Coin Metrics"; `/portfolio` "Exit 0/3 · 0/3"; the AI's `get_market` carries
  `bitcoin_mvrv`, `us_dollar_index`, `btc_funding`; the evening's BTC funding fact is the market's own line.
- **The bot's funding words changed** (his decision 4): `funding_reading` for every coin comes from `fundingWord`, and the
  leverage radar's "crowded longs / shorts" follow the same states — at or over +0.03% (it was 40% a year = +0.0365%) and
  at or under −0.01% (it was −15% a year = −0.0137%). SOL was at or under −0.01% in 11% of last year's payments: its
  "crowded shorts" finding will show more often than before (each finding still once per 12 h, in the digest).
- The per-coin leverage post (17:30, the channel) and the AI's `get_derivatives` still read each coin LIVE from OKX /
  Binance / Hyperliquid — a different measurement from the market's funding line (5 venues, weighted); both say what
  they are made of.
- **Binance through the Doha relay — NOT done yet** (his decision: after this round settles): the job already asks
  `binanceRelay?pub=btcFunding` and expects `{ venues: [{ k: 'Binance' | 'Bybit', rate (% per 8 h), oi (USD), m7 }] }`;
  today the relay answers 405 (POST only), so both stay out. When the relay gains that public read path (he deploys it
  from Cloud Shell: `firebase deploy --only functions --project samsam-portfolio`), Binance joins the mix and the card,
  the bot and the AI say "without Bybit" by themselves — no app or Worker change.
- `guide.json` (the bot's guide) was NOT touched.

Eighth round (27 Nov, his "نفذ" after his phone's screenshots of group 2):
- Exit card: the two count chips are buttons that filter (`grpOnly` in `samsam-exit.js`, this visit only; on the folded
  card a chip opens it on its own group); headed group lines `.xm-gh` (`.xm-gt` name, ⓘ `exitStructure` /
  `exitValuation`, `.xm-gc` count) — tests read the name from `.xm-gt`.
- Dollar card: the level line `#asDxyLvl`; the ⓘ lists the five ranges with how often a quarter closed in each since 1985
  (38% · 36% · 13% · 5% · 8%; under 100 in 74%) and the measured relation. The lab's section D (`tools/lab/macro.mjs`)
  holds the numbers: quarter-end closes since 1985 from Yahoo (`range=max` gives quarters, not months); gold vs the dollar
  weekly −0.44 (10 y), opposite in 68% of weeks, fell in 79% of the weeks the dollar rose 1%+; Bitcoin −0.09, opposite in
  53%. The AI's `us_dollar_index` carries the level and those measured lines. The bot's /market line is unchanged (40
  characters).
- "−0.00%" fixed (seen on his phone: "5 days −0.00%" in red).
- For the queued formatting review: in Arabic the rainbow row's "الهدف ≥ النطاق 6" shows its sign mirrored (the sign sits
  between Arabic words) while "≥ 100%" beside a number is kept left-to-right — one rule is needed for both.

Proposed, waiting for his "نفذ" — the Project doc "alerts-plan":
- (A) Automatic alerts for members: the same `evaluate`, run for each member inside the Worker's round every 15 min, state
  in `users/<uid>/meta/alerts`, six kinds on by default, quiet hours, a daily cap; owner first, then one member, then all.
  (The rainbow alert reaches members with this phase; today they see the line in `/market` and the weekly report.)

Still open:
1. The members' alerts above; the relay's public funding path for Binance (send him the change and the deploy command once
   group 2 has settled); a section in the bot's guide for the rainbow, MVRV, the dollar index and funding (his approval:
   it posts to the channel).
2. `hv_chart_test.py` ("24h range") fails about one run in four and passes on the retry — not looked into yet.
   `asset_classes_app_test.py` needed its retry in both GitHub runs of 27 Nov (8/9 on the first try, at 46/48 of its
   shard; 9/9 three times in a row here) — same list.
3. The PDF and the CSV are in English when the app is Arabic.
4. The AI button over a card's corner in mid-page (inherent to a floating button; moving it is a design decision).

## Queued by Samir (27 Nov) — after the next important tasks, not before

**A full formatting review, Arabic and English, phone and desktop.** Numbers and letters (prices, percents, dates, units,
Latin runs inside Arabic lines, digits), general layout, alignment, contrast, and anything else that shows.
- **First a flow chart of the review itself** (a Whiteboard), agreed with him before any checking starts, so nothing is
  forgotten: every page → every tab → every card / sheet / overlay → every hint and both guides (`guide-app.json`,
  `guide.json`), each crossed with language (AR / EN) × screen (phone / desktop) × theme (dark / light). The bot's
  messages are a branch of their own.
- Then the review, part by part along that chart; findings listed before fixing (a big change: his "نفذ" first).
- Remind him to switch to the strongest model before it starts (the Project's rule for a full review).
- Known items to put on the chart from the start: "Still open" 3 above (PDF / CSV in English); the ≥ / ≤ sign inside
  Arabic lines (eighth round's note).

## Open ideas (not requested yet)

- A 16th category colour cannot stay 15 away from the others: fold small categories or rely on the legend.
