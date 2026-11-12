# Telegram bot — the plan (easiest → hardest)

Private to Samir first (only his chat gets answers); opened to everyone in the last phase.
Runs in the same Cloudflare Worker as AI Analysis (`tools/worker/*` → `node tools/build-worker.mjs` → `tools/dist/samsam-worker.js`).

1. **Answers you** ✅ — webhook `/tg`, `/portfolio /price /market /plan /movers /signals /menu`, buttons that redraw in place, keyboard under the chat, live prices.
2. **The brain** ✅ — plain Arabic / English questions → Claude with 6 live-data tools (coin, portfolio, market + bStocks, plan, exit, price history); remembers the last 10 messages (/new forgets); 30 questions a day; says where its numbers came from (`tools/worker/ai.mjs`).
3. **Alerts in words + "what if"** ✅ — "tell me if ETH < 3000" (price, 24h change, funding, portfolio value; checked every 5 min by the Worker cron, each fires once; /alerts lists them with 🗑); "if BTC hits 150k?", "if I sell half my SOL?" (`tools/worker/watch.mjs`, what_if in ai.mjs).
4. **Record trades in words** ✅ — "bought 0.01 BTC at 95k" → the bot's own summary (amount, average, realized profit, the stablecoin side) → [✅ Confirm] [❌ Cancel]; only Confirm writes to Firestore (one all-or-nothing write, the app's transaction format); 15 min to confirm (`tools/worker/trade.mjs`).
5. **Smart morning + smart evening + radars** ✅ — ☀️ 08:45 Riyadh: 3 things to do today (DCA, buy price, take-profit, signals, allocation, exit); 🌙 21:00: what happened since the morning, what changed, what to watch; 🧲 leverage radar (funding / open interest / long-short, BTC + your 3 biggest, once per 12 h); 🔥 sector radar (CoinGecko sectors ≥ $1B moving ≥ 10%); 📌 a live pinned message (every 15 min); /daily switches each one (`tools/worker/daily.mjs`).
6. **Image cards** — coin / portfolio / brief as designed images in the app's colours.
7. **Telegram Mini App** — "📊 Open the report" opens a full page inside Telegram (AI Analysis design), checked by Telegram's signature.
8. **Voice** ✅ (brought forward) — Arabic / English voice notes → text (Workers AI Whisper, `tools/worker/voice.mjs`) → shown as "🎙️ I heard: …" → answered as if typed.
9. **Paper trading** — a separate pretend portfolio at real prices, compared with BTC.
10. **Open to everyone** — each person links their own portfolio, daily limits, abuse protection, Arabic + English.
