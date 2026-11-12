// tools/worker/daily.mjs — phase 5: the bot speaks first.
//
//   ☀️ Smart morning   (08:45 Riyadh)  3 things to do today, picked from your plan: DCA due, a coin at your buy price, a
//                                      take-profit close, a Reinforce / Sell signal, allocation drift, the exit conditions.
//   🌙 Smart evening   (21:00 Riyadh)  what happened today (since the morning), what changed, what to watch tonight / tomorrow.
//   🧲 Leverage radar  (every 30 min, one coin at a time: BTC + your 3 biggest coins with futures) crowded longs / shorts
//                      (funding), leverage piling up or flushing out (open interest 24h), one-sided accounts — each once / 12 h.
//   🔥 Sector radar    (hourly, at :25) a big sector (≥ $1B) moving ≥ 10% in 24h — once a day each; says if you hold its leaders.
//   📌 Live message    pinned at the top of the chat, redrawn every 15 min: value, today, BTC, Fear & Greed, plan, exit,
//                      next DCA, the alert closest to firing.
// /daily turns each one on / off (and sends the morning / evening now). Everything runs in the Worker's 5-minute cron
// (tools/worker/index.mjs); one bigger job per run, so a run stays inside Cloudflare's 50 outside calls.
// The morning / evening are written by Claude from the facts gathered here (tools/worker/ai.mjs → compose); if Claude
// can't, the bot's own plain version goes out. They do not count in the 30 questions a day.

import { summarize, settings, local, localParts, usd, usd2, pct, esc, dot, isStable, etfDay, APP } from '../alerts-core.mjs';
import { loadMarket, loadUser, coinsOf, withIds, derivatives, loadFutures } from './data.mjs';
import { compose } from './ai.mjs';
import { listAlerts, describe, KINDS, logEvent, todayLog } from './watch.mjs';

const H = 3600e3, DAY = 24 * H;
const DEF = { morning: true, evening: true, radar: true, sectors: true, pin: true, morningAt: '08:45', eveningAt: '21:00' };
const mem = new Map();
async function kvGet(env, k) { try { if (env.RATE) { const v = await env.RATE.get(k); if (v != null) return v; } } catch (_) {} return mem.has(k) ? mem.get(k) : null; }
async function kvPut(env, k, v, ttl) { mem.set(k, v); try { if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {} }
const jget = async (env, k, d) => { try { const v = JSON.parse((await kvGet(env, k)) || 'null'); return v == null ? d : v; } catch (_) { return d; } };
const jput = (env, k, v, ttl) => kvPut(env, k, JSON.stringify(v), ttl);
async function lang(env) { let v = null; try { if (env.RATE) v = await env.RATE.get('tg:lang'); } catch (_) {} return v === 'ar' || v === 'en' ? v : env.BOT_LANG === 'ar' ? 'ar' : 'en'; }
async function tg(env, method, body) {
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { ok: false }; }
}
const send = (env, v, extra = {}) => tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: v.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}), ...extra });
const cb = (text, data) => ({ text, callback_data: data });
const url = (text, u) => ({ text, url: u });
const LIQ = 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=';
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const r6 = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
const mins = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

export async function getCfg(env) { return { ...DEF, ...(await jget(env, 'tg:daily', {})) }; }
export async function setCfg(env, patch) { const c = { ...(await getCfg(env)), ...patch }; await jput(env, 'tg:daily', c); return c; }

const WD = {
  en: { morning: 'Smart morning', evening: 'Smart evening', radar: 'Leverage radar', sectors: 'Sector radar', pin: 'Live pinned message', on: 'on', off: 'off',
    dailyT: '🗓 <b>The bot speaks first</b>', dailyNote: 'Tap to turn on / off.', nowM: '☀️ Morning now', nowE: '🌙 Evening now', back: '⬅️ Menu', plan: '📋 Plan', pf: '💼 Portfolio', mk: '🌍 Market',
    live: 'Live', today: 'today', alerts: n => `${n} alert${n === 1 ? '' : 's'}`, nearest: 'nearest', away: 'away', nextDca: 'Next DCA', exit: 'Exit', planS: 'Plan', fng: 'F&amp;G', updated: 'updated',
    noUser: 'Portfolio not connected.', refresh: '🔄', report: '📊 Full report' },
  ar: { morning: 'الصباح الذكي', evening: 'المساء الذكي', radar: 'رادار الرافعة', sectors: 'رادار القطاعات', pin: 'الرسالة المتثبتة', on: 'شغال', off: 'مقفول',
    dailyT: '🗓 <b>البوت بيبدأ الكلام</b>', dailyNote: 'اضغط عشان تشغّل / تقفل.', nowM: '☀️ الصباح دلوقتي', nowE: '🌙 المساء دلوقتي', back: '⬅️ القائمة', plan: '📋 الخطة', pf: '💼 محفظتي', mk: '🌍 السوق',
    live: 'مباشر', today: 'اليوم', alerts: n => `${n} تنبيه`, nearest: 'الأقرب', away: 'باقي', nextDca: 'الـ DCA الجاي', exit: 'الخروج', planS: 'الخطة', fng: 'الخوف/الطمع', updated: 'اتحدّث',
    noUser: 'المحفظة مش متوصلة.', refresh: '🔄', report: '📊 التقرير الكامل' },
};

// ── the numbers both reports start from ──
async function gather(env, now) {
  const user = await loadUser(env).catch(() => null);
  if (!user) return null;
  const m = await loadMarket([], coinsOf(user));
  return { user, m, sum: summarize(withIds(user, m), m, now), cfg: settings(user.meta) };
}
function marketFacts(m, sum) {
  const g = m.global || {}, d = g.dom || {}, e = etfDay(m.etf);
  return { btc_usd: m.btc ? r6(m.btc.price) : null, btc_24h_pct: m.btc ? r2(m.btc.ch24) : null, fear_greed: m.fng ? { value: m.fng.value, label: m.fng.label, yesterday: m.fng.prev, week_ago: m.fng.week } : null,
    btc_dominance_pct: r2(d.btc), usdt_dominance_pct: r2(d.usdt), total_mcap_24h_pct: r2(g.mcapCh24), altcoin_season: m.alt && m.alt.value != null ? m.alt.value : null,
    etf_flows: e ? { day: e.label, btc_usd: Math.round(e.btc), eth_usd: Math.round(e.eth) } : null };
}
const pfFacts = sum => ({ value_usd: r2(sum.value), change_24h_pct: r2(sum.ch24), change_24h_usd: r2(sum.d24), all_time_profit_usd: r2(sum.total), all_time_profit_pct: r2(sum.pctTotal), vs_holding_btc_pct: r2(sum.vsBtc) });

// what could be done today, most useful first (the morning picks 3)
export function todo(sum, now) {
  const out = [], add = (prio, o) => out.push({ prio, ...o });
  const tomorrow = localParts(now + DAY).date;
  for (const x of sum.dca || []) {
    if (x.s.state === 'today') add(100, { what: 'dca_today', coin: x.sym, buy_usd: r2(x.s.usd) });
    else if (x.s.state === 'missed') add(90, { what: 'dca_missed', coin: x.sym, buy_usd: r2(x.s.usd), days_late: x.s.late });
    else if (x.s.next === tomorrow) add(20, { what: 'dca_tomorrow', coin: x.sym, buy_usd: r2(x.s.usd) });
  }
  for (const x of sum.buyAt || []) {
    const away = (x.price / x.at - 1) * 100;
    if (away <= 3) add(away <= 0 ? 95 : 85, { what: away <= 0 ? 'at_buy_price' : 'near_buy_price', coin: x.sym, price_usd: r6(x.price), your_buy_price_usd: r6(x.at), pct_above_buy_price: r2(away), still_to_buy: x.left != null ? r6(x.left) : null });
  }
  for (const t of sum.tps || []) {
    const to = (t.level / t.price - 1) * 100;
    if (to <= 0) add(92, { what: 'take_profit_reached', coin: t.sym, tp: t.n, level_usd: r6(t.level), price_usd: r6(t.price), sell_pct: t.pct });
    else if (to <= 7) add(80, { what: 'take_profit_close', coin: t.sym, tp: t.n, level_usd: r6(t.level), price_usd: r6(t.price), pct_to_go: r2(to), sell_pct: t.pct });
  }
  const met = (sum.macro || []).filter(x => x.met).length;
  if (met >= 2) add(75, { what: 'exit_conditions', met_of_3: met });
  if (sum.alloc) for (const g of sum.alloc.groups.filter(g => g.state !== 'ok').sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift)).slice(0, 1))
    add(50, { what: g.drift > 0 ? 'allocation_over' : 'allocation_under', group: sum.alloc.names[g.key] || g.key, now_pct: r2(g.now), target_pct: r2(g.target), usd_to_fix: Math.round(Math.abs(g.full)) });
  const rows = sum.coins.filter(c => !isStable(c.sym) && c.value >= 5);
  rows.filter(c => sum.signal[c.sym] === 'reinforce').sort((a, b) => a.chg - b.chg).slice(0, 2).forEach(c => add(40, { what: 'reinforce_signal', coin: c.sym, pct_vs_your_avg: r2(c.chg), price_usd: r6(c.price), your_avg_usd: r6(c.avg) }));
  rows.filter(c => sum.signal[c.sym] === 'sell').sort((a, b) => b.chg - a.chg).slice(0, 2).forEach(c => add(45, { what: 'sell_signal', coin: c.sym, pct_vs_your_avg: r2(c.chg), price_usd: r6(c.price) }));
  return out.sort((a, b) => b.prio - a.prio).slice(0, 8).map(({ prio, ...o }) => o);
}
// the alerts and levels closest to their trigger (price kinds, priced from the market snapshot / live rows)
function nearest(alerts, m, sum) {
  const rows = [...m.top, ...m.top500], priceOf = (sym, cg) => { const r = (cg && rows.find(x => x.id === cg)) || rows.find(x => String(x.sym || '').toUpperCase() === sym); return r && r.price > 0 ? r.price : null; };
  const out = [];
  for (const a of alerts) {
    if (KINDS[a.kind].what !== 'price') continue;
    const p = priceOf(a.sym, a.cg); if (!p) continue;
    out.push({ alert: describe(a), price_usd: r6(p), pct_away: r2(Math.abs(p / a.value - 1) * 100) });
  }
  for (const t of sum.tps || []) if (t.level > t.price) out.push({ level: `${t.sym} TP${t.n} ${usd(t.level)}`, price_usd: r6(t.price), pct_away: r2((t.level / t.price - 1) * 100) });
  for (const x of sum.buyAt || []) if (x.price > x.at) out.push({ level: `${x.sym} buy price ${usd(x.at)}`, price_usd: r6(x.price), pct_away: r2((x.price / x.at - 1) * 100) });
  return out.sort((a, b) => a.pct_away - b.pct_away).slice(0, 4);
}

// ── ☀️ / 🌙 ──
export async function morning(env, now = Date.now(), L = null) {
  L = L || await lang(env); const w = WD[L];
  const g = await gather(env, now);
  if (!g) return send(env, { text: w.noUser });
  const { m, sum } = g, tasks = todo(sum, now), alerts = await listAlerts(env);
  const facts = { time_riyadh: local(now, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), portfolio: pfFacts(sum), market: marketFacts(m, sum),
    todo: tasks, closest_levels: nearest(alerts, m, sum), signals: sum.counts, plan_progress_pct: r2(sum.prog && sum.prog.pct) };
  await jput(env, 'tg:snap:' + localParts(now).date, { t: now, value: sum.value, btc: m.btc && m.btc.price, fng: m.fng && m.fng.value, dom: m.global && m.global.dom && m.global.dom.btc }, 2 * 86400);   // the evening compares with this
  const body = await compose(env, 'morning', L, facts) || plainMorning(L, facts);
  const head = `☀️ <b>${w.morning}</b> · ${esc(local(now, { weekday: 'short', day: 'numeric', month: 'short' }))}`;
  return send(env, { text: head + '\n\n' + body, buttons: [[cb(w.plan, 'pl'), cb(w.pf, 'pf'), cb(w.mk, 'mk')]] });
}
export async function evening(env, now = Date.now(), L = null) {
  L = L || await lang(env); const w = WD[L];
  const g = await gather(env, now);
  if (!g) return send(env, { text: w.noUser });
  const { user, m, sum } = g, day = localParts(now).date;
  const snap = await jget(env, 'tg:snap:' + day, null), alerts = await listAlerts(env), log = await todayLog(env, now);
  const movers = sum.coins.filter(c => !isStable(c.sym) && c.value >= 5 && c.ch24 != null).sort((a, b) => b.ch24 - a.ch24);
  const trades = (user.txs || []).filter(t => t && t.date && localParts(Date.parse(t.date)).date === day && t.kind !== 'pay' && ['buy', 'sell'].includes(t.type))
    .slice(0, 6).map(t => ({ type: t.type, coin: t.sym, amount: r6(t.qty), price_usd: r6(t.price) }));
  const d = await derivatives('BTC').catch(() => null);
  const sectors = (m.sectors || []).filter(s => s.mcap >= 1e9 && s.ch24 != null);
  const facts = {
    time_riyadh: local(now, { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), portfolio: pfFacts(sum),
    since_morning: snap ? { portfolio_change_usd: r2(sum.value - snap.value), portfolio_change_pct: snap.value > 0 ? r2((sum.value / snap.value - 1) * 100) : null,
      btc_morning_usd: r6(snap.btc), btc_change_pct: snap.btc > 0 && m.btc ? r2((m.btc.price / snap.btc - 1) * 100) : null, fear_greed_morning: snap.fng, btc_dominance_morning: r2(snap.dom) } : null,
    best_coins_24h: movers.slice(0, 3).map(c => ({ coin: c.sym, pct: r2(c.ch24) })), worst_coins_24h: movers.slice(-3).reverse().filter(c => c.ch24 < 0).map(c => ({ coin: c.sym, pct: r2(c.ch24) })),
    market: marketFacts(m, sum), btc_futures: d && d.summary ? { funding_8h_pct: d.summary.funding_8h_pct_avg, funding_reading: d.summary.funding_reading, open_interest_24h_pct: d.summary.open_interest_change_24h_pct, long_accounts_pct: d.summary.long_accounts_pct } : null,
    sectors_24h: sectors.length ? { best: sectors.filter(s => s.ch24 > 0).sort((a, b) => b.ch24 - a.ch24).slice(0, 3).map(s => ({ name: s.name, pct: r2(s.ch24) })), worst: sectors.filter(s => s.ch24 < 0).sort((a, b) => a.ch24 - b.ch24).slice(0, 3).map(s => ({ name: s.name, pct: r2(s.ch24) })) } : null,
    trades_today: trades, events_today: log.map(e => ({ time: local(e.t, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }), type: e.type, what: e.text })),
    closest_levels: nearest(alerts, m, sum), tomorrow: todo(sum, now).filter(x => /dca_tomorrow|near_buy|take_profit_close/.test(x.what)),
  };
  const body = await compose(env, 'evening', L, facts) || plainEvening(L, facts);
  const head = `🌙 <b>${w.evening}</b> · ${esc(local(now, { weekday: 'short', day: 'numeric', month: 'short' }))}`;
  return send(env, { text: head + '\n\n' + body, buttons: [[cb(w.pf, 'pf'), cb(w.mk, 'mk')]] });
}
// when Claude can't write it: the facts, plainly
const TODO_TXT = {
  en: x => ({ dca_today: `🛒 DCA day: buy ${usd(x.buy_usd)} of ${x.coin}`, dca_missed: `⏰ DCA ${x.coin} ${x.days_late} days late (${usd(x.buy_usd)})`, dca_tomorrow: `🛒 Tomorrow: DCA ${x.coin} ${usd(x.buy_usd)}`,
    at_buy_price: `🎯 ${x.coin} ${usd(x.price_usd)} — at your buy price ${usd(x.your_buy_price_usd)}`, near_buy_price: `🎯 ${x.coin} ${pct(x.pct_above_buy_price, 1)} above your buy price ${usd(x.your_buy_price_usd)}`,
    take_profit_reached: `💰 ${x.coin} reached TP${x.tp} ${usd(x.level_usd)} — sell ${x.sell_pct}%`, take_profit_close: `💰 ${x.coin} ${r2(x.pct_to_go)}% from TP${x.tp} ${usd(x.level_usd)}`,
    exit_conditions: `🚪 Exit: ${x.met_of_3}/3 conditions met`, allocation_over: `⚖️ ${x.group} ${x.now_pct}% vs ${x.target_pct}% — trim ${usd(x.usd_to_fix)}`, allocation_under: `⚖️ ${x.group} ${x.now_pct}% vs ${x.target_pct}% — add ${usd(x.usd_to_fix)}`,
    reinforce_signal: `🟢 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} vs your avg — Reinforce`, sell_signal: `🔴 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} vs your avg — Sell / convert` }[x.what]),
  ar: x => ({ dca_today: `🛒 يوم الـ DCA: اشتري ${x.coin} بـ ${usd(x.buy_usd)}`, dca_missed: `⏰ DCA ${x.coin} متأخر ${x.days_late} يوم (${usd(x.buy_usd)})`, dca_tomorrow: `🛒 بكرة: DCA ${x.coin} ${usd(x.buy_usd)}`,
    at_buy_price: `🎯 ${x.coin} ${usd(x.price_usd)} — وصل سعر الشراء بتاعك ${usd(x.your_buy_price_usd)}`, near_buy_price: `🎯 ${x.coin} فوق سعر الشراء ${usd(x.your_buy_price_usd)} بـ ${pct(x.pct_above_buy_price, 1)}`,
    take_profit_reached: `💰 ${x.coin} وصل TP${x.tp} ${usd(x.level_usd)} — بيع ${x.sell_pct}%`, take_profit_close: `💰 ${x.coin} باقي ${r2(x.pct_to_go)}% على TP${x.tp} ${usd(x.level_usd)}`,
    exit_conditions: `🚪 الخروج: ${x.met_of_3}/3 شروط اتحققت`, allocation_over: `⚖️ ${x.group} ${x.now_pct}% والهدف ${x.target_pct}% — قلّل ${usd(x.usd_to_fix)}`, allocation_under: `⚖️ ${x.group} ${x.now_pct}% والهدف ${x.target_pct}% — زوّد ${usd(x.usd_to_fix)}`,
    reinforce_signal: `🟢 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} من متوسطك — تعزيز`, sell_signal: `🔴 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} من متوسطك — بيع / تحويل` }[x.what]),
};
function plainMorning(L, f) {
  const ar = L === 'ar', p = f.portfolio, mk = f.market;
  const t = f.todo.slice(0, 3).map((x, i) => `${i + 1}. ${esc(TODO_TXT[L](x))}`);
  if (!t.length) t.push(ar ? '1. مفيش حاجة مطلوبة النهارده — احتفظ ✅' : '1. Nothing to do today — hold ✅');
  return [`💼 <b>${usd2(p.value_usd)}</b> ${dot(p.change_24h_pct)} ${pct(p.change_24h_pct)}`, '', `🎯 <b>${ar ? 'النهارده' : 'Today'}</b>`, ...t, '',
    `🌍 BTC <b>${usd(mk.btc_usd)}</b> ${pct(mk.btc_24h_pct)}${mk.fear_greed ? ` · F&amp;G <b>${mk.fear_greed.value}</b>` : ''}`].join('\n');
}
function plainEvening(L, f) {
  const ar = L === 'ar', p = f.portfolio, s = f.since_morning, out = [`💼 <b>${usd2(p.value_usd)}</b> ${dot(p.change_24h_pct)} ${pct(p.change_24h_pct)} 24h`];
  if (s) out.push(`${ar ? 'من الصبح' : 'Since the morning'}: <b>${s.portfolio_change_usd >= 0 ? '+' : '−'}${usd2(Math.abs(s.portfolio_change_usd))}</b>`);
  if (f.best_coins_24h.length) out.push(`📈 ${f.best_coins_24h.map(c => `${esc(c.coin)} ${pct(c.pct, 1)}`).join(' · ')}`);
  if (f.worst_coins_24h.length) out.push(`📉 ${f.worst_coins_24h.map(c => `${esc(c.coin)} ${pct(c.pct, 1)}`).join(' · ')}`);
  if (f.closest_levels.length) out.push('', `👀 <b>${ar ? 'راقب' : 'Watch'}</b>`, ...f.closest_levels.slice(0, 3).map(x => `• ${esc(x.alert || x.level)} — ${x.pct_away}%`));
  return out.join('\n');
}

// ── 🧲 leverage radar: one coin per run (BTC + your 3 biggest with futures), each finding once per 12 h ──
const RADAR_TXT = {
  en: { hot_longs: 'Crowded longs — funding very positive', hot_shorts: 'Crowded shorts — funding negative', oi_up: 'Leverage piling up — open interest jumped', oi_down: 'Leverage flushed out — open interest fell',
    crowd_long: 'Most accounts are long', crowd_short: 'Most accounts are short', fund: 'Funding', yr: 'yr', oi: 'Open interest 24h', longs: 'Long accounts', liq: 'Liquidations (OKX)', longsW: 'longs', shortsW: 'shorts',
    noteL: 'One-sided longs: a dip can cascade (long squeeze). Check the Liq Map.', noteS: 'One-sided shorts: a pump can cascade (short squeeze). Check the Liq Map.', noteN: 'Leverage changed fast — volatility likely. Check the Liq Map.' },
  ar: { hot_longs: 'لونجات زحمة — التمويل موجب جداً', hot_shorts: 'شورتات زحمة — التمويل سالب', oi_up: 'الرافعة بتزيد — الـ OI قفز', oi_down: 'الرافعة اتمسحت — الـ OI نزل',
    crowd_long: 'أغلب الحسابات لونج', crowd_short: 'أغلب الحسابات شورت', fund: 'التمويل', yr: 'سنوي', oi: 'الـ OI في 24س', longs: 'حسابات اللونج', liq: 'التصفيات (OKX)', longsW: 'لونج', shortsW: 'شورت',
    noteL: 'اللونجات متكدسة: أي نزول ممكن يعمل تصفيات متتالية. شوف الـ Liq Map.', noteS: 'الشورتات متكدسة: أي صعود ممكن يعمل تصفيات متتالية. شوف الـ Liq Map.', noteN: 'الرافعة اتغيرت بسرعة — متوقع تذبذب. شوف الـ Liq Map.' },
};
export function radarFindings(s) {
  const f = [];
  if (s.funding_annualized_pct != null) { if (s.funding_annualized_pct >= 40) f.push('hot_longs'); else if (s.funding_annualized_pct <= -15) f.push('hot_shorts'); }
  if (s.open_interest_change_24h_pct != null) { if (s.open_interest_change_24h_pct >= 15) f.push('oi_up'); else if (s.open_interest_change_24h_pct <= -15) f.push('oi_down'); }
  if (s.long_accounts_pct != null) { if (s.long_accounts_pct >= 75) f.push('crowd_long'); else if (s.long_accounts_pct <= 35) f.push('crowd_short'); }
  return f;
}
export async function radar(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null), fut = await loadFutures().catch(() => null);
  let list = ['BTC'], idOf = { BTC: 'bitcoin' };
  if (user) {
    const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, now); idOf = { ...m.idOf, BTC: 'bitcoin' };
    list = [...new Set(['BTC', ...sum.coins.filter(c => !isStable(c.sym) && (!fut || fut.has(c.sym))).sort((a, b) => b.value - a.value).slice(0, 3).map(c => c.sym)])];
  }
  const i = (+(await kvGet(env, 'tg:radar:i')) || 0) % list.length, sym = list[i];
  await kvPut(env, 'tg:radar:i', String(i + 1));
  const d = await derivatives(sym).catch(() => null);
  if (!d || !d.summary) return { sym, sent: 0 };
  const s = d.summary, seen = await jget(env, 'tg:radar:seen', {});
  for (const k of Object.keys(seen)) if (now - seen[k] > 2 * DAY) delete seen[k];
  const fresh = radarFindings(s).filter(k => !(now - (seen[sym + ':' + k] || 0) < 12 * H));
  if (!fresh.length) { await jput(env, 'tg:radar:seen', seen); return { sym, sent: 0 }; }
  const L = await lang(env), w = RADAR_TXT[L], ww = WD[L];
  const lines = [`🧲 <b>${ww.radar} · ${esc(sym)}</b>`, ...fresh.map(k => `⚠️ <b>${w[k]}</b>`), ''];
  if (s.funding_8h_pct_avg != null) lines.push(`• ${w.fund}: <b>${s.funding_8h_pct_avg > 0 ? '+' : ''}${s.funding_8h_pct_avg}%</b> / 8h (≈ ${s.funding_annualized_pct > 0 ? '+' : ''}${s.funding_annualized_pct}% ${w.yr})`);
  if (s.open_interest_change_24h_pct != null) lines.push(`• ${w.oi}: <b>${pct(s.open_interest_change_24h_pct, 1)}</b>${s.open_interest_usd_total ? ' (' + usd(s.open_interest_usd_total) + ')' : ''}`);
  if (s.long_accounts_pct != null) lines.push(`• ${w.longs}: <b>${r2(s.long_accounts_pct)}%</b>`);
  if (s.liquidations_24h) lines.push(`• ${w.liq}: ${w.longsW} ${usd(s.liquidations_24h.longs_usd)} · ${w.shortsW} ${usd(s.liquidations_24h.shorts_usd)}`);
  const longSide = fresh.some(k => /hot_longs|crowd_long/.test(k)), shortSide = fresh.some(k => /hot_shorts|crowd_short/.test(k));
  lines.push('', `<i>${longSide && !shortSide ? w.noteL : shortSide && !longSide ? w.noteS : w.noteN}</i>`);
  const r = await send(env, { text: lines.join('\n'), buttons: [[url('🔥 Liq Map', LIQ + encodeURIComponent(sym)), cb('🪙 ' + sym, 'c:' + String(idOf[sym] || 'x-' + sym.toLowerCase()).slice(0, 58))]] });
  if (r && r.ok) { fresh.forEach(k => { seen[sym + ':' + k] = now; }); await logEvent(env, 'radar', sym + ': ' + fresh.map(k => RADAR_TXT.en[k]).join(', '), now); }
  await jput(env, 'tg:radar:seen', seen);
  return { sym, sent: r && r.ok ? 1 : 0 };
}

// ── 🔥 sector radar: CoinGecko's sectors (m/market.json → sectors, from tools/update-market.mjs) ──
export async function sectorRadar(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null);
  const m = await loadMarket([], user ? coinsOf(user) : []);
  const big = (m.sectors || []).filter(s => s && s.mcap >= 1e9 && s.ch24 != null && Math.abs(s.ch24) >= 10);
  if (!big.length) return { sent: 0 };
  const day = localParts(now).date, seen = await jget(env, 'tg:sector:seen', {});
  const fresh = big.filter(s => seen[s.id] !== day).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 3);
  if (!fresh.length) return { sent: 0 };
  const mine = new Set(user ? Object.values(m.idOf).filter(Boolean) : []), symOf = id => (Object.entries(m.idOf).find(([, v]) => v === id) || [])[0];
  const L = await lang(env), ar = L === 'ar', w = WD[L];
  const lines = [`🔥 <b>${w.sectors}</b>`, ''];
  for (const s of fresh) {
    const held = (s.top || []).filter(id => mine.has(id)).map(symOf).filter(Boolean);
    lines.push(`${s.ch24 > 0 ? '🚀' : '🔻'} <b>${esc(s.name)}</b> ${pct(s.ch24, 1)} · ${usd(s.mcap)}${held.length ? `\n   ${ar ? 'معاك من قادته' : 'you hold its leaders'}: <b>${esc(held.join(', '))}</b>` : ''}`);
  }
  const r = await send(env, { text: lines.join('\n'), buttons: [[cb(w.mk, 'mk'), cb(w.pf, 'pf')]] });
  if (r && r.ok) { fresh.forEach(s => { seen[s.id] = day; }); for (const k of Object.keys(seen)) if (seen[k] !== day) delete seen[k]; await jput(env, 'tg:sector:seen', seen); await logEvent(env, 'sector', fresh.map(s => s.name + ' ' + pct(s.ch24, 1)).join(', '), now); }
  return { sent: r && r.ok ? 1 : 0 };
}

// ── 📌 the live message, pinned ──
export async function pinView(env, now = Date.now()) {
  const L = await lang(env), w = WD[L], g = await gather(env, now);
  if (!g) return null;
  const { m, sum } = g, alerts = await listAlerts(env), near = nearest(alerts, m, sum).filter(x => x.alert)[0];
  const dca = (sum.dca || []).filter(x => x.s.next).sort((a, b) => a.s.next.localeCompare(b.s.next))[0];
  const met = (sum.macro || []).filter(x => x.met).length;
  const L1 = [`📌 <b>${w.live}</b> · ${w.updated} ${local(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`,
    `💼 <b>${usd2(sum.value)}</b>  ${dot(sum.ch24)} ${pct(sum.ch24)} ${w.today}`,
    m.btc ? `🪙 BTC <b>${usd(m.btc.price)}</b>  ${dot(m.btc.ch24)} ${pct(m.btc.ch24)}${m.fng ? ` · ${w.fng} <b>${m.fng.value}</b>` : ''}` : null,
    `📋 ${w.planS} <b>${sum.prog ? sum.prog.pct.toFixed(1) : '0'}%</b> · 🚪 ${w.exit} <b>${met}/3</b>`,
    dca ? `🛒 ${w.nextDca}: <b>${esc(dca.sym)}</b> · ${esc(new Date(dca.s.next + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : null,
    alerts.length ? `🔔 ${w.alerts(alerts.length)}${near ? ` · ${w.nearest}: ${esc(near.alert)} (${near.pct_away}% ${w.away})` : ''}` : null].filter(Boolean);
  const origin = await kvGet(env, 'tg:origin');   // 📊 the Mini App, when the bot knows its own address
  return { text: L1.join('\n'), buttons: [[cb(w.pf, 'pf'), cb(w.mk, 'mk'), cb(w.refresh, 'pin:r')], ...(origin ? [[{ text: w.report, web_app: { url: origin + '/tg/app' } }]] : [])] };
}
export async function pinUpdate(env, now = Date.now(), force = false) {
  const v = await pinView(env, now);
  if (!v) return { ok: false };
  const st = await jget(env, 'tg:pin', {});
  const body = v.text.split('\n').slice(1).join('\n');   // the first line is the time: only redraw when a number changed (or hourly)
  if (!force && st.id && st.body === body && now - (st.t || 0) < H) return { ok: true, same: true };
  if (st.id) {
    const r = await tg(env, 'editMessageText', { chat_id: env.TELEGRAM_CHAT_ID, message_id: st.id, text: v.text, parse_mode: 'HTML', reply_markup: { inline_keyboard: v.buttons } });
    if (r.ok || /not modified/i.test(r.description || '')) { await jput(env, 'tg:pin', { id: st.id, body, t: now }); return { ok: true, id: st.id }; }
  }
  const r = await send(env, v, { disable_notification: true });
  const id = r && r.ok && r.result && r.result.message_id;
  if (!id) return { ok: false };
  await tg(env, 'pinChatMessage', { chat_id: env.TELEGRAM_CHAT_ID, message_id: id, disable_notification: true });
  if (st.id) tg(env, 'unpinChatMessage', { chat_id: env.TELEGRAM_CHAT_ID, message_id: st.id }).catch(() => {});
  await jput(env, 'tg:pin', { id, body, t: now });
  return { ok: true, id, new: true };
}
export async function unpin(env) {
  const st = await jget(env, 'tg:pin', {});
  if (st.id) await tg(env, 'unpinChatMessage', { chat_id: env.TELEGRAM_CHAT_ID, message_id: st.id });
  await jput(env, 'tg:pin', {});
}

// ── /daily ──
export async function viewDaily(env) {
  const L = await lang(env), w = WD[L], c = await getCfg(env);
  const row = k => cb(`${c[k] ? '✅' : '⬜'} ${w[k]}`, 'dy:' + k);
  const at = { morning: c.morningAt, evening: c.eveningAt, radar: L === 'ar' ? 'كل 30 دقيقة' : 'every 30 min', sectors: L === 'ar' ? 'كل ساعة' : 'hourly', pin: L === 'ar' ? 'كل 15 دقيقة' : 'every 15 min' };
  const lines = [w.dailyT, '', ...['morning', 'evening', 'radar', 'sectors', 'pin'].map(k => `${c[k] ? '✅' : '⬜'} ${w[k]} · <i>${at[k]}</i>`), '', `<i>${w.dailyNote}</i>`];
  return { text: lines.join('\n'), buttons: [[row('morning'), row('evening')], [row('radar'), row('sectors')], [row('pin')], [cb(w.nowM, 'dy:now:m'), cb(w.nowE, 'dy:now:e')], [cb(w.back, 'menu')]] };
}

// ── the cron (every 5 min, after the alerts): one bigger job per run ──
export async function runDaily(env, now = Date.now()) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { job: null };
  const c = await getCfg(env), lp = localParts(now), sent = await jget(env, 'tg:daily:sent', {}), min = new Date(now).getUTCMinutes();
  const due = (on, at, k) => { const late = mins(lp.hm) - mins(at); return on && late >= 0 && late < 180 && sent[k] !== lp.date; };   // up to 3 h late (a missed run catches up), once a day
  const done = async k => { sent[k] = lp.date; await jput(env, 'tg:daily:sent', sent); };
  if (due(c.morning, c.morningAt, 'morning')) { await done('morning'); await morning(env, now); return { job: 'morning' }; }   // marked first: never twice
  if (due(c.evening, c.eveningAt, 'evening')) { await done('evening'); await evening(env, now); return { job: 'evening' }; }
  if (c.pin && min % 15 === 0) { await pinUpdate(env, now); return { job: 'pin' }; }
  if (c.radar && min % 30 === 10) return { job: 'radar', ...(await radar(env, now)) };
  if (c.sectors && min % 60 === 25) return { job: 'sectors', ...(await sectorRadar(env, now)) };
  return { job: null };
}
