// tools/worker/ai.mjs — the bot's brain (phase 2): you write in plain words, Claude answers.
//
// Claude never answers numbers from memory: while it thinks it calls the tools below, which read the same live data as
// the rest of the bot (prices, your portfolio, plan, exit plan, the market, price history), and the answer ends with
// where its numbers came from. Read-only: nothing here changes your portfolio.
//
//   · 30 questions a day (Riyadh time; AI_DAILY_LIMIT in the Worker's settings changes it), counted in KV (RATE)
//   · remembers the last 10 messages (6 h) so "and ETH?" follows on; /new starts over
//   · Telegram sometimes sends the same message twice when an answer is slow — each message is answered once
//   · the model: BOT_MODEL in the Worker's settings, else Claude Sonnet 5.5; if that name is refused, MODEL (AI Analysis's)

import { summarize, settings, local, localParts, isStable, etfDay, APP } from '../alerts-core.mjs';
import { loadMarket, loadUser, findCoin, coinsOf, withIds, loadFutures, rawSeries } from './data.mjs';

const H = 3600e3, DAY = 24 * H;
const LIMIT = env => Math.max(1, Math.min(500, parseInt(env.AI_DAILY_LIMIT || '30', 10) || 30));
const MAX_ROUNDS = 8;          // tool rounds per question (the last one answers with what it has)
const HISTORY = 10;            // messages remembered
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const r6 = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);

// ── small KV helpers (memory fallback when there is no KV, e.g. tests) ──
const mem = new Map();
async function kvGet(env, k) { try { if (env.RATE) return await env.RATE.get(k); } catch (_) {} return mem.has(k) ? mem.get(k) : null; }
async function kvPut(env, k, v, ttl) { mem.set(k, v); try { if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {} }
async function kvDel(env, k) { mem.delete(k); try { if (env.RATE) await env.RATE.delete(k); } catch (_) {} }

// each Telegram update once (a slow answer makes Telegram send it again)
export async function firstTime(env, updateId) {
  if (updateId == null) return true;
  const k = 'tg:u:' + updateId;
  if (await kvGet(env, k)) return false;
  await kvPut(env, k, '1', 3600);
  return true;
}
const today = () => localParts(Date.now()).date;
export async function usage(env) { const n = +(await kvGet(env, 'tg:ai:' + today())) || 0; return { used: n, limit: LIMIT(env), left: Math.max(0, LIMIT(env) - n) }; }
async function countOne(env) { const u = await usage(env); await kvPut(env, 'tg:ai:' + today(), String(u.used + 1), 2 * 86400); return u.left - 1; }
export async function forget(env) { await kvDel(env, 'tg:hist'); }
async function history(env) { try { const h = JSON.parse((await kvGet(env, 'tg:hist')) || '[]'); return Array.isArray(h) ? h : []; } catch (_) { return []; } }
async function remember(env, q, a) { const h = (await history(env)).concat([{ role: 'user', content: q }, { role: 'assistant', content: a }]).slice(-HISTORY); await kvPut(env, 'tg:hist', JSON.stringify(h), 6 * 3600); }

// ── the tools Claude can call ──
export const TOOLS = [
  { name: 'get_coin', description: 'Live data for one coin (any coin, by ticker or name): price, 24h / 7d / 30d change, market-cap rank, market cap, 24h volume, 7-day high / low, whether it has perpetual futures (a CoinGlass liquidation map), and — if the user holds it — amount, value, average buy price, profit %, the app\'s signal and its result vs holding BTC. Call once per coin; call it for every coin you mention with a number.',
    input_schema: { type: 'object', properties: { coin: { type: 'string', description: 'Ticker or name, e.g. "BTC", "sol", "pendle", "Render"' } }, required: ['coin'] } },
  { name: 'get_portfolio', description: "The user's whole portfolio now: total value, 24h / 7d change, all-time profit, result vs holding BTC, and EVERY coin with value, share %, 24h / 7d change, profit vs average buy price, signal, vs_btc_pct (its result minus the same dollars in BTC since bought) and vs_btc_30d_pts / vs_btc_90d_pts (strength vs BTC over 30 / 90 days); signal counts; allocation vs targets. One call answers questions about all coins — no need to call get_coin for each.",
    input_schema: { type: 'object', properties: {} } },
  { name: 'get_market', description: 'The crypto market now: BTC price, BTC / USDT dominance, Fear & Greed (and its week-ago value), Altcoin Season index, total market cap, latest spot-ETF flows, the best / worst 24h coins of the Top N (stablecoins left out), and the best / worst 24h Binance bStocks (tokenized US stocks).',
    input_schema: { type: 'object', properties: { top: { type: 'integer', enum: [100, 200, 300, 500], description: 'Rank range for best / worst (default 100)' } } } },
  { name: 'get_plan', description: "The user's accumulation plan: per-coin target vs held (progress %), overall progress, regular buys (DCA: amount, schedule, next date, late or not), buy-price alerts (alert price vs current price).",
    input_schema: { type: 'object', properties: {} } },
  { name: 'get_exit', description: "The user's exit plan: the 3 market exit conditions (BTC dominance, USDT dominance, ETH/BTC — now vs target, met or not) and every take-profit level (coin, level, multiple of average, % still to go, % to sell there).",
    input_schema: { type: 'object', properties: {} } },
  { name: 'get_history', description: 'Hourly price history of a coin for the last N days (1–29): start, end, % change, high and low with their dates, and the daily closes. Only for coins GitHub keeps a price file for (the user\'s coins and the big ones); otherwise it says so.',
    input_schema: { type: 'object', properties: { coin: { type: 'string' }, days: { type: 'integer', minimum: 1, maximum: 29 } }, required: ['coin'] } },
];

// one context per question: the market and your portfolio are read once and shared by every tool call
function context(env) {
  let user, base, sum, used = new Set(), coins = new Set();
  const ctx = {
    used, coins,
    async user() { if (user === undefined) user = await loadUser(env).catch(() => null); return user; },
    async market(extra = []) {
      const u = await ctx.user();
      const m = await loadMarket(extra.map(c => c.id).filter(Boolean), [...coinsOf(u), ...extra]);
      if (!extra.length) base = m;
      return m;
    },
    async sum() { if (sum) return sum; const u = await ctx.user(); if (!u) return null; const m = base || await ctx.market(); sum = { s: summarize(withIds(u, m), m, Date.now()), m }; return sum; },
  };
  return ctx;
}
const srcOf = (m, id) => typeof m.live[id] === 'string' ? m.live[id] + ' (live)' : m.live[id] ? 'CoinGecko (live)' : 'market snapshot' + (m.parts && m.parts.top ? ' of ' + local(Date.parse(m.parts.top), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) + ' Riyadh' : '');

export async function runTool(ctx, name, input) {
  const now = Date.now();
  if (name === 'get_coin') {
    const q = String((input && input.coin) || '').trim().slice(0, 40);
    if (!q) return { error: 'no coin given' };
    const u = await ctx.user(), m0 = await ctx.market();
    const c = await findCoin(q, m0, u);
    if (!c) return { error: `no coin found for "${q}"` };
    const m = await ctx.market([{ sym: c.sym, id: c.id }]);
    const id = c.id || m.idOf[c.sym];
    if (!id) return { error: `no price found for "${q}" (not on CoinGecko or the big exchanges)` };
    const row = [...m.top, ...m.top500].find(r => r.id === id) || {};
    const sym = (c.sym || row.sym || '').toUpperCase();
    ctx.used.add(srcOf(m, id)); ctx.coins.add(id + '|' + sym);
    const fut = await loadFutures().catch(() => null);
    const sp = (row.spark || []).filter(x => x > 0);
    const out = { coin: row.name || c.name || sym, ticker: sym, price_usd: r6(row.price), change_24h_pct: r2(row.ch24), change_7d_pct: r2(row.ch7), change_30d_pct: r2(row.ch30),
      rank: row.rank || c.rank || null, market_cap_usd: row.mcap ? Math.round(row.mcap) : null, volume_24h_usd: row.vol ? Math.round(row.vol) : null,
      high_7d: sp.length ? r6(Math.max(...sp)) : null, low_7d: sp.length ? r6(Math.min(...sp)) : null,
      perpetual_futures: fut ? fut.has(sym) : null, liquidation_map: `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=${encodeURIComponent(sym)}`, price_source: srcOf(m, id), stablecoin: isStable(sym) };
    if (!(row.price > 0)) { const s = m.series[id]; if (s) out.price_usd = r6(s.last); }
    if (u) {
      const sum = summarize(withIds(u, m), m, now), h = sum.coins.find(x => x.sym === sym);
      ctx.used.add('your portfolio (Firebase)');
      out.you_hold = h ? { amount: r6(h.qty), value_usd: r2(h.value), share_of_portfolio_pct: sum.value > 0 ? r2(h.value / sum.value * 100) : null, average_buy_usd: r6(h.avg), profit_vs_average_pct: r2(h.chg), signal: sum.signal[sym] || 'hold', signal_reason: h.why || null } : 'not held';
      if (!out.price_usd && h) out.price_usd = r6(h.price);
    }
    return out;
  }
  if (name === 'get_portfolio') {
    const x = await ctx.sum(); if (!x) return { error: 'portfolio not connected' };
    const { s } = x; ctx.used.add('your portfolio (Firebase)'); ctx.used.add(srcOf(x.m, 'bitcoin'));
    return { total_value_usd: r2(s.value), change_24h_pct: r2(s.ch24), change_24h_usd: r2(s.d24), change_7d_pct: r2(s.ch7), change_7d_usd: r2(s.d7),
      all_time_profit_usd: r2(s.total), all_time_profit_pct: r2(s.pctTotal), invested_usd: r2(s.invested), vs_holding_btc_pct: r2(s.vsBtc), alts_beating_btc: `${s.beat} of ${s.alts}`,
      signals: s.counts, coins: [...s.coins].sort((a, b) => b.value - a.value).map(c => ({ ticker: c.sym, value_usd: r2(c.value), share_pct: s.value > 0 ? r2(c.value / s.value * 100) : null, change_24h_pct: r2(c.ch24), change_7d_pct: r2(c.ch7), profit_vs_average_pct: r2(c.chg), signal: s.signal[c.sym], vs_btc_pct: c.vs ? r2(c.vs.pct) : null, vs_btc_30d_pts: c.rs ? r2(c.rs.d30) : null, vs_btc_90d_pts: c.rs ? r2(c.rs.d90) : null, stablecoin: isStable(c.sym) || undefined })),
      allocation: s.alloc ? s.alloc.groups.map(g => ({ group: s.alloc.names[g.key] || g.key, now_pct: r2(g.now), target_pct: r2(g.target), state: g.state })) : null };
  }
  if (name === 'get_market') {
    const m = await ctx.market(), n = [100, 200, 300, 500].includes(+(input && input.top)) ? +input.top : 100;
    ctx.used.add(srcOf(m, 'bitcoin')); ctx.used.add('market snapshot (CoinGecko, alternative.me, ETF flows)');
    const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
    const seen = new Set(), list = [...m.top, ...m.top500].filter(r => r.rank && r.rank <= n && r.ch24 != null && r.sym && !isStable(r.sym) && !seen.has(r.id) && seen.add(r.id));
    const pick = (a, dir) => [...a].sort((x, y) => dir * (y.ch24 - x.ch24)).slice(0, 5).map(r => ({ ticker: String(r.sym).toUpperCase(), rank: r.rank, price_usd: r6(r.price), change_24h_pct: r2(r.ch24) }));
    const st = (m.stocks || []).filter(r => r.ch24 != null);
    return { btc_price_usd: m.btc ? r6(m.btc.price) : null, btc_change_24h_pct: m.btc ? r2(m.btc.ch24) : null, total_market_cap_usd: g.mcap ? Math.round(g.mcap) : null, market_cap_change_24h_pct: r2(g.mcapCh24),
      btc_dominance_pct: r2(d.btc), eth_dominance_pct: r2(d.eth), usdt_dominance_pct: r2(d.usdt), fear_greed: m.fng ? { value: m.fng.value, label: m.fng.label, yesterday: m.fng.prev, week_ago: m.fng.week } : null,
      altcoin_season: m.alt ? { value: m.alt.value, label: m.alt.label } : null, etf_flows_latest_day: e ? { date: e.date, btc_usd: e.btc, eth_usd: e.eth } : null,
      [`top${n}_best_24h`]: pick(list, 1), [`top${n}_worst_24h`]: pick(list, -1), bstocks_best_24h: pick(st, 1).map(({ rank, ...x }) => x), bstocks_worst_24h: pick(st, -1).map(({ rank, ...x }) => x) };
  }
  if (name === 'get_plan') {
    const x = await ctx.sum(); if (!x) return { error: 'portfolio not connected' };
    const { s } = x; ctx.used.add('your plan (Firebase)');
    return { overall_progress_pct: r2(s.prog.pct), targets_met: `${s.prog.completed} of ${s.prog.counted}`,
      coins: s.plan.map(p => ({ ticker: p.sym, held: r6(p.actual), target: r6(p.target), progress_pct: p.target > 0 ? r2(p.actual / p.target * 100) : null })),
      regular_buys: (s.dca || []).map(dc => ({ ticker: dc.sym, per_month_usd: r2(dc.s.perMonth), next: dc.s.next || null, state: dc.s.state })),
      buy_price_alerts: (s.buyAt || []).map(b => ({ ticker: b.sym, alert_price_usd: r6(b.at), price_now_usd: r6(b.price), pct_above_alert: r2((b.price / b.at - 1) * 100), still_to_buy: r6(b.left) })) };
  }
  if (name === 'get_exit') {
    const x = await ctx.sum(); if (!x) return { error: 'portfolio not connected' };
    const { s } = x; ctx.used.add('your exit plan (Firebase)'); ctx.used.add('market snapshot');
    return { conditions: s.macro.map(c => ({ name: { btcD: 'BTC dominance', usdtD: 'USDT dominance', ethBtc: 'ETH/BTC' }[c.k], now: c.now, target: `${c.op} ${c.lvl}`, met: c.met })),
      take_profits: (s.tps || []).map(t => ({ ticker: t.sym, tp: t.n, level_usd: r6(t.level), price_now_usd: r6(t.price), pct_to_go: r2((t.level / t.price - 1) * 100), multiple_of_average: t.mult || null, sell_pct: t.pct || null })).sort((a, b) => a.pct_to_go - b.pct_to_go) };
  }
  if (name === 'get_history') {
    const q = String((input && input.coin) || '').trim(), days = Math.max(1, Math.min(29, parseInt((input && input.days) || 7, 10) || 7));
    const u = await ctx.user(), m = await ctx.market(), c = await findCoin(q, m, u);
    const id = c && (c.id || m.idOf[c.sym]);
    const f = id && await rawSeries(id);
    if (!f || !Array.isArray(f.p)) return { error: `no price history kept for "${q}" — use get_coin for its 7d / 30d change` };
    const from = now - days * DAY, pts = f.p.map((p, i) => [f.t0 + i * f.step, p]).filter(([t, p]) => t >= from && p > 0);
    if (pts.length < 2) return { error: 'not enough history' };
    ctx.used.add('hourly price history (GitHub prices branch)');
    let hi = pts[0], lo = pts[0]; for (const x of pts) { if (x[1] > hi[1]) hi = x; if (x[1] < lo[1]) lo = x; }
    const day = t => local(t, { day: 'numeric', month: 'short' }), closes = {};
    for (const [t, p] of pts) closes[localParts(t).date] = r6(p);
    return { coin: c.sym, days, start_usd: r6(pts[0][1]), end_usd: r6(pts[pts.length - 1][1]), change_pct: r2((pts[pts.length - 1][1] / pts[0][1] - 1) * 100),
      high: { usd: r6(hi[1]), on: day(hi[0]) }, low: { usd: r6(lo[1]), on: day(lo[0]) }, daily_closes: closes };
  }
  return { error: 'unknown tool' };
}

// ── Claude ──
function system(now, lang, qLang) {
  return [
    'You are the Cute Portfolio assistant inside Telegram — a sharp, honest crypto analyst for one private user, Samir, who runs a long-term Bitcoin-first strategy (accumulation plan, DCA, an exit plan) in the Cute Portfolio app.',
    `Now: ${local(now, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} (Riyadh).`,
    'RULES',
    '- Every number you state (price, %, value, rank, flow…) must come from a tool result in this conversation. Never use prices or market data from memory — call the tools first (several in one turn if needed). If a tool has no data, say so.',
    '- General knowledge (what a project does, how something works, history) is fine without tools; say when it may be out of date.',
    '- About the future: give scenarios, levels and probabilities with reasons — never promises. Not financial advice, but do give a clear, practical view when asked "should I…" (based on his plan and signals).',
    '- Be concise: a phone screen. Short lines (aim ≤ 40 characters), short paragraphs, "• " bullets, at most ~12 lines unless asked for detail. No tables.',
    '- Formatting: plain text with **bold** for key numbers / verdicts and `code` for tickers in lists. No headings with #, no links unless asked (buttons under the answer open coins).',
    `- Language: the user's latest message is in ${qLang === 'ar' ? 'Arabic — answer in Egyptian Arabic' : 'English — answer in English'} (whatever language earlier messages were in). Numbers and tickers in Latin characters.`,
    '- Prefer one call that covers many coins (get_portfolio) over many get_coin calls; call independent tools together in one turn.',
    '- Do not write a sources line — the bot adds one.',
  ].join('\n');
}
async function claude(env, model, body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, ...body }) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, j };
}

// Claude's text → Telegram HTML (only <b> <i> <code>; everything else escaped)
export function toHtml(text) {
  let s = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/^#{1,6}\s*(.+)$/gm, '<b>$1</b>');
  s = s.replace(/\*\*([^*\n][^*]*?)\*\*/g, '<b>$1</b>').replace(/__([^_\n]+?)__/g, '<b>$1</b>');
  s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?:;]|$)/gm, '$1<i>$2</i>');
  s = s.replace(/^\s*[-*]\s+/gm, '• ');
  return s.trim();
}

// the whole question → answer. Returns { text (Telegram HTML), coins: [[id, SYM]], left } or { error }
export async function ask(env, question, lang = 'en') {
  if (!env.ANTHROPIC_API_KEY) return { error: 'nokey' };
  const u = await usage(env);
  if (u.left <= 0) return { error: 'limit', limit: u.limit };
  const now = Date.now(), ctx = context(env);
  const messages = [...(await history(env)), { role: 'user', content: String(question).slice(0, 2000) }];
  let model = env.BOT_MODEL || 'claude-sonnet-5-5', fellBack = false, text = '';
  const qLang = /[\u0600-\u06FF]/.test(String(question)) ? 'ar' : 'en';   // answer in the language of THIS message
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    // the tools stay declared every round (earlier tool turns need them); the last round may not call any more
    const body = { max_tokens: 2000, system: system(now, lang, qLang), tools: TOOLS, ...(round === MAX_ROUNDS ? { tool_choice: { type: 'none' } } : {}), messages };
    let r = await claude(env, model, body);
    if (!r.ok && !fellBack && (r.status === 404 || (r.status === 400 && /model/i.test(JSON.stringify(r.j.error || {}))))) { fellBack = true; model = env.MODEL || 'claude-opus-4-5'; r = await claude(env, model, body); }   // that model name refused → AI Analysis's
    if (!r.ok) { console.log(JSON.stringify({ ai: 'claude-error', round, status: r.status, type: r.j.error && r.j.error.type, message: String((r.j.error && r.j.error.message) || '').slice(0, 300) })); return { error: r.status === 429 || r.status === 529 ? 'busy' : 'claude', detail: r.status }; }
    const content = r.j.content || [];
    const calls = content.filter(b => b.type === 'tool_use');
    if (!calls.length || r.j.stop_reason !== 'tool_use') { text = content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(); break; }
    messages.push({ role: 'assistant', content });
    const results = await Promise.all(calls.map(async c => {
      let out; try { out = await runTool(ctx, c.name, c.input || {}); } catch (e) { console.log(JSON.stringify({ ai: 'tool-error', tool: c.name, message: String(e && e.message).slice(0, 200) })); out = { error: 'tool failed' }; }
      return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out).slice(0, 12000) };
    }));
    messages.push({ role: 'user', content: results });
  }
  if (!text) { console.log(JSON.stringify({ ai: 'empty-answer', rounds: MAX_ROUNDS })); return { error: 'empty' }; }
  console.log(JSON.stringify({ ai: 'ok', model, tools: [...ctx.used].length, ms: Date.now() - now }));
  const left = await countOne(env);
  await remember(env, String(question).slice(0, 2000), text.slice(0, 3000));
  const coins = [...ctx.coins].map(x => x.split('|')).slice(0, 3);
  return { text: toHtml(text), sources: [...ctx.used], coins, left, limit: u.limit, model };
}
