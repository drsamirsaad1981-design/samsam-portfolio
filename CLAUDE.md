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
  alternative.me only as a fallback. Its daily rows are kept in the snapshot (`fng.hist`), so "Yesterday" / "Last week"
  survive a failed history call.
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
  wherever the ratio shows** ("Source: Coin Metrics" — its free data is CC BY-NC 4.0). The average cost it implies has **one name
  everywhere** — "Bitcoin's realized market cost" (متوسط تكلفة البيتكوين المحققة للسوق): rainbow card, Exit row, Plan line,
  the bot's alert — and is "a reference, not a floor".
- BTC funding (27 Nov): **one rate from several venues weighted by open interest, and the big venues that are NOT in it are
  named beside it** (from the snapshot's `missing`, never typed in: "without Binance and Bybit" when the Doha relay is
  silent; nothing when all are in — since 27 Nov 20:10 UTC it is 7 venues, Binance and Bybit through the relay). **One wording everywhere** (`fundingRead`): hot ≥ +0.03% per 8 h · up > +0.01% · rest 0…+0.01% · neg < 0 · deep ≤
  −0.01% — edges from the last year's payments, not 2021's. A mood reading, never an exit condition.
  **The card's bar is the same five states** (28 Nov; shown closed AND open — under the header when closed, under the
  state's line when open, never two on the page): five equal segments low → high, edges printed under it, a white
  dot always inside the segment its word names (`FUNDING_ORDER` / `FUNDING_EDGES` / `fundingPos` in the core — the edges
  live in ONE place). Its colours run cold → warm and are **never the profit green or the loss red** ("calm" is not
  "good", "crowded longs" is not "sell"). What a crowded side can do is said **only in the ⓘ and only as a condition**
  ("if the price falls, forced closing can speed the fall") — never a forecast, never a direction. The ⓘ also has a
  **"What was measured"** line from the lab's section E, and it must keep its limits in the same sentence ("most of
  these readings are from 2020–2021 … only a few episodes: 21 … 27") — his words: without them the numbers read as a rule.
- **Pegged, not a coin**: one ticker list in three places (`samsam-market.js` → `isStable`, `samsam-coins.js`,
  `tools/alerts-core.mjs` → `STABLE_RX`; `market_cmc_test.mjs` holds them equal). **FIGR_HELOC is in it** (28 Nov, his
  call): Figure's tokenized home-equity loans, valued near $1, on no exchange — it sat at rank 9 as a "coin". Hidden
  with them but **never named as one**: the "Stablecoins hidden (…)" line leaves it out of its examples (`PEG_ONLY`).
- **The three folded cards of the Market Hub each carry a small picture** (28 Nov): ETF Flows — 14 small bars (the last
  14 trading days of the chosen BTC / ETH, green above the line / red under it: a flow is a signed amount, so the profit
  and loss tokens are right here) with "Last 7 days …" and "14 trading days" under them; the rainbow — its strip; BTC
  funding — its bar. Each gives way to the full view when its card opens (one picture of a thing at a time).
- **Market Hub → Crypto has two headed sections that fold** (28 Nov): **Market Pulse** (نبض السوق: the four cards, ETF
  Flows, Stablecoin Supply, BTC Funding — the market's size, flows, mood and leverage NOW) and **Bitcoin Valuation** (تقييم البيتكوين: the
  rainbow with the 200-week average, then Bitcoin Pi Cycle + Bitcoin MVRV). The first is NOT called "Market Structure":
  on the Exit page that name means exactly three conditions (BTC dominance, USDT dominance, ETH / BTC) — one name, one
  meaning. "Bitcoin Valuation" is the same three readings in both places and says them in the same words (`VAL_LIST` in
  the hints); personal levels stay on the Exit page.
- **A reading's level is said as a count, never as a zone we named** (28 Nov): the Pi Cycle and MVRV cells show the value,
  a bar from the lowest to the highest reading since 2012, "Higher than N% of days since 2012" (written by the jobs:
  `pi.hist`, `mvrv.hist`) and this cycle's highest — no "low / high", no "cheap / expensive". MVRV is said once on the
  page: in its cell, not in the rainbow card any more. **The bar is one smooth blend** (28 Nov, his ask): 8 px, rounded,
  BTC Funding's white dot with a dark ring, the funding bar's five colours run together cold → warm — **no segments, no
  edges, no named level** (segments would be zones). The Pi Cycle cell carries its two averages in dollars (`d111`,
  `d350x2` — the Exit row's own numbers).
- **Stablecoin Supply** (28 Nov, his "نفذ" after the lab's section F): the dollar-pegged supply from DefiLlama, **counted
  in COINS, never at market price** (a de-peg is a fall in price, not money leaving); green / red bars are right here (a
  signed amount, like ETF Flows). The biggest coins come **from the data, never typed in**; a coin with no value a month
  ago reads "new", not a percent. Words: supply up = "usually demand for cash inside crypto" — never "new money
  entered"; "a reading of liquidity, not a forecast of price"; it is NOT USDT dominance (an amount against a share). The
  ⓘ's **"What was measured"** line keeps its limits in the same lines (95 months, 0.26 / 0.22, −0.7% against +2.0%, only
  24 months, most in 2022–2023). "Source: DefiLlama" wherever it shows. One reader: `stablesNow()`.
  **A coin that is no longer a dollar is left out** (28 Nov, his rule): its price is under $0.90 (`PEG_MIN`) on **two
  days running** (the first day seen it still counts — one bad price in one run must take nothing out); its supply NOW
  comes off the total and off every day kept, so leaving it out is not itself a fall. **A coin with NO price stays in**
  (a gap in the data, not a fall — **his decision, 28 Nov**: the live coins and the new ones matter more than the 1.13%
  of level; the dead ones' supply is frozen and does not touch the changes). The note names no count of coins:
  "Dollar-pegged stablecoins" (العملات المستقرة المربوطة بالدولار); Arabic says «والعملة التي تبقى تحت $0.90» (his wording).
  **Bot**: two lines at the end of `/market` (`macroLines`: the total with "· DefiLlama", then the net change of 7 and 30
  days — an Arabic line opens with an Arabic word: "آخر 7 أيام …"), not in the brief or the weekly report; the AI's
  `get_market` carries `stablecoin_supply` with the note's limits.
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
| MVRV · 💵 dollar index · ⚖️ BTC funding | the job `tools/update-macro.mjs` → `m/macro.json` (+ `m/mvrv.json`, MVRV's whole history) — its three parts are copied into `m/market.json` (`mvrv`, `dxy`, `funding`) by `update-market.mjs`; readers and the funding wording in `samsam-core.js` (`mvrvRead`, `dxyNow`, `fundingNow`, `fundingRead` / `FUNDING_WORDS`); Exit row `samsam-exit.js`; Market Hub: `samsam-funding.js` (card), the Bitcoin Pi Cycle + Bitcoin MVRV card `samsam-btcval.js` (`#valCard`; `histOf` / `histPos` in the core), the dollar card in `samsam-assets.js` (Metals tab); Plan line `costNote` in `accumulation.html`; bot `macroLines` (`alerts-core.mjs`, in /market), `macroFacts` (`ai.mjs`); the lab `tools/lab/macro.mjs` |
| Stablecoin Supply | the job's fourth part `stablesPart` / `stablesFrom` in `tools/update-macro.mjs` (`/stablecoincharts/all` for the total and its days, `/stablecoins` for the breakdown; the last breakdown or the last part stays when DefiLlama is silent) → `m/macro.json` → `stables` in `m/market.json`; reader `stablesNow` in `samsam-core.js` (drops a part over 4 days old); card `samsam-stables.js` (`#stableCard`, under ETF Flows); hint `stables`; bot `macroLines` (`alerts-core.mjs`), AI `macroFacts` → `stablecoin_supply` (`ai.mjs`), the Worker's market object (`data.mjs` → `stables`); tests `stables_test.py`, `macro_test.mjs`, `market_cmc_test.mjs`, `alerts_test.mjs`, `tg_bot_test.mjs` |
| Taxonomy | `samsam-taxonomy.js` (classes crypto / stock / metal / cash, categories) |
| Market snapshot (GitHub Actions → branch `prices`) | `tools/update-market.mjs`, `tools/update-prices.mjs`, `tools/update-etf.mjs` → `m/market.json`, `m/etf.json`, `p/*.json` |
| Bot + AI (Cloudflare Worker) | `tools/worker/*.mjs` (bot, ai tools, daily jobs, data), `tools/ai-worker.js`, `tools/alerts-core.mjs` (summary + messages) |
| Built Worker | `tools/dist/samsam-worker.js` — never edit; `cd tools && node build-worker.mjs` |
| Welcome page | sources `tools/welcome/src/*.dc.html`; build `python3 tools/welcome/build_public.py` (+ `build_privacy.py`, `og.py`); output `welcome/` — never edit the output |
| Guide | `guide-app.json` (app), `guide.json` (bot) |

One answer everywhere: a number shown in two places must come from one function (e.g. `wealthNow()` for the Net worth card,
the PDF, the CSV and the AI report; `summarize().wealth` in the bot; `zakatPool` / `zakatYear` for zakat in app and bot;
`rainbowRead()` for the rainbow band in the bot's line, the alert, the Exit page and the Market Hub card; `mvrvRead()`,
`dxyNow()`, `fundingNow()` + `fundingRead()` for MVRV, the dollar index and BTC funding in the app, the bot and the radar;
`stablesNow()` for the stablecoin supply in the card, the bot's lines and the AI's facts).

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

## Where we stopped (28 Nov 2026) — read this first in a new chat

**The story of every round (1–17, 26–28 Nov) moved to `HISTORY.md`** — read it only when you need the reason behind a
decision, the numbers of a lab run, or how something was built. What binds is above (rules, decisions, the file map).

Live now:
- Home, Net worth (Overview + Allocation), the welcome page, PDF / CSV / AI report over the whole wealth; the full review
  of 26 Nov and its fixes; one colour per meaning; the donut's measured palette; the Exit page in two groups.
- Market Hub → Crypto in two folding sections: **Market Pulse** (four cards, ETF Flows, Stablecoin Supply, BTC Funding)
  and **Bitcoin Valuation** (the rainbow with the 200-week average, then Bitcoin Pi Cycle + Bitcoin MVRV). Metals tab:
  the dollar index.
- Bot: `/market` carries the rainbow, the dollar index, BTC funding and the stablecoin supply; `/exit` in two groups; the
  AI's `get_market` carries all of them with their limits. **The bot's guide is complete** (16 parts; "Market
  indicators" added 28 Nov, his approved text).
- The Doha relay is deployed (Binance + Bybit funding; members' Binance balances).

Next, in his order:
1. **unslop on the Market Hub — a trial** (his "موافق"): run the skill on that one page, list what it finds, change
   nothing before he has seen the list. The app's identity and the measured colour rules stay as they are.
2. The security fixes he picks from the review.
3. The members' automatic alerts ("alerts-plan"), when he says "نفذ".

## Lessons that still bind (from the rounds — the details are in `HISTORY.md`)

- **Tests and the clock**: a test that adds minutes to `Date.now()`, or gives a fixture the real time and then runs a
  fixed hour, fails by the hour of the day — try it at the edge of its day (`SHIFT_H=10 node --require <a file that moves
  Date> tests/x.mjs`; a child process does not carry the moved clock).
- **Tests and clicks**: click a part that cannot be something else (the chevron, never the button's centre — in Arabic
  the ⓘ sits there) and wait for the state, not for a time.
- **GitHub's "Tests" start only on `*.html`, root `*.js`, `tests/**`**: a push of `guide.json`, the built Worker or
  `CLAUDE.md` alone runs no tests (Deploy Worker's gate is `tg_bot_test.mjs`). Say so in the report.
- **`guide.json`** posts "New in the guide" to the channel at the Worker's next round (parts whose text changed: ✏️ / 🆕);
  members hear it in the bot at most once a day. His approval of the exact text first, always.
- **Arabic in the app**: every number, percent, amount, date number and Latin name is a left-to-right piece (`n()` in the
  hints, `L()` in the cards); never a whole Arabic date in one piece; a move or a span is said in words ("من … إلى …"),
  never with an arrow; no "و" stuck to a number. **In the bot**: an Arabic line opens with an Arabic word (never a digit,
  a ticker or "$"); every line ≤ 40 characters.
- **Colours are measured, never picked by eye** (OKLab × 100: ≥ 15 between any two that can meet, ≥ 15 from the profit
  green and the loss red). Green / red only for a signed amount (ETF flows, stablecoin changes).
- **A "what was measured" line keeps its limits in the same lines**; a reading's level is a count, never a named zone.
- **Code**: a MutationObserver that writes `hidden` writes only on a change; a logical margin on an `<svg>` follows the
  svg's own direction; a `// comment` inside a one-line `try { … } catch` swallows the `catch`; the class `.mk-sec` is
  taken (sections are `.mk-part`); a part written by older job code has fewer fields — readers must live with that.
- **Headings** are Title Case, never capitals by CSS (`title_check.py`); the bot's lines stay sentence case.
- **Labs** (`tools/lab/macro.mjs`, sections A–G) run on GitHub when the file is pushed; read the result from the job's
  log. They write nothing. Ask the source before building on it.
- **Cloud Shell** (the relay): the repo is `~/cp` (branch `main`); `cd ~/cp && git pull`, then in `tools/binance-relay`:
  `firebase deploy --only functions --project samsam-portfolio`. The terminal takes the browser tool's `key` action.
- **This workspace reaches GitHub only** (`gh`): no DefiLlama, no relay, no Telegram — verify those through a GitHub run
  or his phone's screenshot.

Proposed, waiting for his "نفذ" — the Project doc "alerts-plan":
- (A) Automatic alerts for members: the same `evaluate`, run for each member inside the Worker's round every 15 min, state
  in `users/<uid>/meta/alerts`, six kinds on by default, quiet hours, a daily cap; owner first, then one member, then all.
  (The rainbow alert reaches members with this phase; today they see the line in `/market` and the weekly report.)

Still open:
1. The members' alerts above.
2. **The security review's fixes** (28 Nov, by reading — the Project doc "security-review-2026-11-28"): findings were
   listed, nothing was changed; each fix waits for his word. Three things only he can see in the consoles are in that doc.
3. `hv_chart_test.py` ("24h range") fails about one run in four and passes on the retry — not looked into yet.
   `asset_classes_app_test.py` needed its retry in both GitHub runs of 27 Nov (8/9 on the first try, at 46/48 of its
   shard; 9/9 three times in a row here) — same list. `edit_tx_test.py` needed its retry once on 28 Nov (19/20 on the
   first try, on a shard that ran 45 minutes instead of 32) — same list. `fab_footer_test.py` failed a shard on 28 Nov
   ("Samsam not ready": the sign-in never came, on the try and on the retry); 23/23 here and on the shard's re-run.
4. The PDF and the CSV are in English when the app is Arabic.
5. The AI button over a card's corner in mid-page (inherent to a floating button; moving it is a design decision).

## Queued by Samir (27 Nov) — after the next important tasks, not before

**A full formatting review, Arabic and English, phone and desktop.** Numbers and letters (prices, percents, dates, units,
Latin runs inside Arabic lines, digits), general layout, alignment, contrast, and anything else that shows.
- **First a flow chart of the review itself** (a Whiteboard), agreed with him before any checking starts, so nothing is
  forgotten: every page → every tab → every card / sheet / overlay → every hint and both guides (`guide-app.json`,
  `guide.json`), each crossed with language (AR / EN) × screen (phone / desktop) × theme (dark / light). The bot's
  messages are a branch of their own.
- Then the review, part by part along that chart; findings listed before fixing (a big change: his "نفذ" first).
- Remind him to switch to the strongest model before it starts (the Project's rule for a full review).
- Known items to put on the chart from the start: "Still open" 4 above (PDF / CSV in English); the ≥ / ≤ sign inside
  Arabic lines (eighth round's note).

## Open ideas (not requested yet)

- A 16th category colour cannot stay 15 away from the others: fold small categories or rely on the legend.
