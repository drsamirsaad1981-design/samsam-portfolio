# Telegram bot — the plan (easiest → hardest)

Private to Samir first (only his chat gets answers); opened to everyone in the last phase.
Runs in the same Cloudflare Worker as AI Analysis (`tools/worker/*` → `node tools/build-worker.mjs` → `tools/dist/samsam-worker.js`).

1. **Answers you** ✅ — webhook `/tg`, `/portfolio /price /market /plan /movers /signals /menu`, buttons that redraw in place, keyboard under the chat, live prices.
2. **The brain** — plain Arabic / English questions; Claude with tools (prices, market, futures / liq, ETF, your portfolio + plan); remembers the conversation; says where each number comes from.
3. **Alerts in words + "what if"** — "tell me if ETH < 3000"; "if BTC hits 150k?", "if I sell half my SOL?".
4. **Record trades in words** — "bought 0.01 BTC at 95k" → summary → [Confirm] [Cancel]; nothing saved without Confirm.
5. **Smart morning + smart evening + radars** — morning: 3 things to do today from the plan; evening: what happened today, what changed, what to watch tonight / tomorrow; liquidation radar near your coins' prices; sector radar; a live pinned message.
6. **Image cards** — coin / portfolio / brief as designed images in the app's colours.
7. **Telegram Mini App** — "📊 Open the report" opens a full page inside Telegram (AI Analysis design), checked by Telegram's signature.
8. **Voice** — Arabic voice notes → text → answer.
9. **Paper trading** — a separate pretend portfolio at real prices, compared with BTC.
10. **Open to everyone** — each person links their own portfolio, daily limits, abuse protection, Arabic + English.
