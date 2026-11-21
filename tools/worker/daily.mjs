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

import { NOT_ADVICE } from './bidi.mjs';
import { usMarket, gramSar } from './usmarket.mjs';
import { bidiBody } from './bidi.mjs';
import { K, chatOf, isOwner, langOf, member, setMember } from './who.mjs';
import { premiumNow } from './stars.mjs';
import { summarize, settings, local, localParts, usd, usd2, pct, esc, dot, isStable, etfDay, APP } from '../alerts-core.mjs';
import { loadMarket, loadUser, coinsOf, withIds, derivatives, loadFutures, setAlertsLang, setZakatSnap } from './data.mjs';
import { zakatWhen, HIJRI_MONTHS } from '../../samsam-core.js';
import { compose } from './ai.mjs';
import { listAlerts, describe, KINDS, logEvent, todayLog } from './watch.mjs';

const H = 3600e3, DAY = 24 * H;
const DEF = { morning: true, evening: true, radar: true, sectors: true, pin: true, morningAt: '08:45', eveningAt: '21:00' };
const mem = new Map();
async function kvGet(env, k) { try { if (env.RATE) { const v = await env.RATE.get(k); if (v != null) return v; } } catch (_) {} return mem.has(k) ? mem.get(k) : null; }
async function kvPut(env, k, v, ttl) { mem.set(k, v); try { if (env.RATE) await env.RATE.put(k, v, ttl ? { expirationTtl: ttl } : undefined); } catch (_) {} }
const jget = async (env, k, d) => { try { const v = JSON.parse((await kvGet(env, k)) || 'null'); return v == null ? d : v; } catch (_) { return d; } };
const jput = (env, k, v, ttl) => kvPut(env, k, JSON.stringify(v), ttl);
const lang = env => langOf(env);
async function tg(env, method, body) {
  body = bidiBody(body);   // Arabic lines read right-to-left (bidi.mjs)
  try { const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return await r.json(); }
  catch (_) { return { ok: false }; }
}
const send = (env, v, extra = {}) => tg(env, 'sendMessage', { chat_id: chatOf(env), text: v.text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, ...(v.buttons ? { reply_markup: { inline_keyboard: v.buttons } } : {}), ...extra });
const cb = (text, data) => ({ text, callback_data: data });
const url = (text, u) => ({ text, url: u });
const LIQ = 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=';
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const r6 = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
const mins = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

export async function getCfg(env) { return { ...DEF, ...(isOwner(env) ? {} : { morning: false, evening: false, pin: false, radar: false, sectors: false }), ...(await jget(env, K(env, 'daily'), {})) }; }   // invited people: the portfolio messages and the radars start off — they come on when a portfolio is linked (/link)
export async function setCfg(env, patch) { const c = { ...(await getCfg(env)), ...patch }; await jput(env, K(env, 'daily'), c); return c; }

const WD = {
  en: { morning: 'Smart morning', evening: 'Smart evening', radar: 'Leverage radar', sectors: 'Sector radar', pin: 'Live pinned message', on: 'on', off: 'off',
    dailyT: '🗓 <b>The bot speaks first</b>', dailyNote: 'Tap to turn on / off.', nowM: '☀️ Morning now', nowE: '🌙 Evening now', back: '⬅️ Menu', plan: '📋 Plan', pf: '💼 Portfolio', mk: '🌍 Market',
    live: 'Live', pfS: 'Portfolio', btcS: 'BTC', today: 'today', alerts: n => `${n} alert${n === 1 ? '' : 's'}`, nearest: 'nearest', away: 'away', nextDca: 'Next DCA', exit: 'Exit', planS: 'Plan', fng: 'F&amp;G', updated: 'updated',
    noUser: 'Portfolio not connected.', refresh: '🔄', report: '📱 Open the app' },
  ar: { morning: 'الصباح الذكي', evening: 'المساء الذكي', radar: 'رادار الرافعة', sectors: 'رادار القطاعات', pin: 'الرسالة المثبتة', on: 'يعمل', off: 'متوقف',
    dailyT: '🗓 <b>رسائل البوت التلقائية</b>', dailyNote: 'اضغط للتشغيل / الإيقاف.', nowM: '☀️ إرسال ملخص الصباح', nowE: '🌙 إرسال ملخص المساء', back: '⬅️ القائمة', plan: '📋 الخطة', pf: '💼 محفظتي', mk: '🌍 السوق',
    live: 'مباشر', pfS: 'المحفظة', btcS: 'البيتكوين', today: 'اليوم', alerts: n => `${n} تنبيه`, nearest: 'الأقرب', away: 'المتبقي', nextDca: 'الشراء الدوري القادم', exit: 'الخروج', planS: 'الخطة', fng: 'الخوف والطمع', updated: 'تم التحديث',
    noUser: 'المحفظة غير متصلة.', refresh: '🔄', report: '📱 افتح التطبيق' },
};

// 🌐 ONE language everywhere: the bot's language (/lang) and the alerts' language (the app → Alerts → Language, what the
// brief, the digests and the signal alerts are written in) are the same setting. Looked at every 10 minutes:
//   · the alerts' differ from the bot's, and it was the app that changed them (not our own last write) → the bot follows
//   · anything else that differs → the alerts are set to the bot's language
// (the settings we read can be up to 30 minutes old, so "the app changed them" is only believed 45 minutes after the
// bot's own last change — else a /lang would be undone by its own stale copy)
export async function oneLanguage(env, now = Date.now()) {
  const L = await lang(env), had = await kvGet(env, K(env, 'alsync')), hadT = +(await kvGet(env, K(env, 'alsyncT'))) || 0;
  const user = await loadUser(env).catch(() => null), al = user && user.meta && user.meta.alerts;
  const cur = al && (al.lang === 'ar' || al.lang === 'en') ? al.lang : null;
  const mark = async v => { await kvPut(env, K(env, 'alsync'), v); await kvPut(env, K(env, 'alsyncT'), String(now)); };
  if (cur === L) { if (had !== L) await mark(L); return { lang: L, did: null }; }
  if (cur && al.langPicked === true && had === L && now - hadT > 45 * 60e3) {   // picked in the app → the bot speaks it too
    await kvPut(env, K(env, 'lang'), cur); if (!isOwner(env)) await setMember(env, chatOf(env), { lang: cur }).catch(() => {});
    await mark(cur); return { lang: cur, did: 'bot' };
  }
  if (await setAlertsLang(env, L).catch(() => false)) { await mark(L); return { lang: L, did: 'alerts' }; }
  return { lang: L, did: null };
}

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
    todo: tasks, closest_levels: nearest(alerts, m, sum), signals: sum.counts, plan_progress_pct: r2(sum.prog && sum.prog.pct), other_markets: otherFacts(m, now) };
  await jput(env, K(env, 'snap:' + localParts(now).date), { t: now, value: sum.value, btc: m.btc && m.btc.price, fng: m.fng && m.fng.value, dom: m.global && m.global.dom && m.global.dom.btc }, 2 * 86400);   // the evening compares with this
  const body = await compose(env, 'morning', L, facts) || plainMorning(L, facts);
  const head = `☀️ <b>${w.morning}</b> · ${esc(local(now, { weekday: 'short', day: 'numeric', month: 'short' }))}`;
  return send(env, { text: head + '\n\n' + body + '\n\n' + NOT_ADVICE[L === 'ar' ? 'ar' : 'en'], buttons: [[cb(w.plan, 'pl'), cb(w.pf, 'pf'), cb(w.mk, 'mk')]] });
}
export async function evening(env, now = Date.now(), L = null) {
  L = L || await lang(env); const w = WD[L];
  const g = await gather(env, now);
  if (!g) return send(env, { text: w.noUser });
  const { user, m, sum } = g, day = localParts(now).date;
  const snap = await jget(env, K(env, 'snap:' + day), null), alerts = await listAlerts(env), log = await todayLog(env, now);
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
    other_markets: otherFacts(m, now),
  };
  const body = await compose(env, 'evening', L, facts) || plainEvening(L, facts);
  const head = `🌙 <b>${w.evening}</b> · ${esc(local(now, { weekday: 'short', day: 'numeric', month: 'short' }))}`;
  return send(env, { text: head + '\n\n' + body + '\n\n' + NOT_ADVICE[L === 'ar' ? 'ar' : 'en'], buttons: [[cb(w.pf, 'pf'), cb(w.mk, 'mk')]] });
}
// when Claude can't write it: the facts, plainly
const TODO_TXT = {
  en: x => ({ dca_today: `🛒 DCA day: buy ${usd(x.buy_usd)} of ${x.coin}`, dca_missed: `⏰ DCA ${x.coin} ${x.days_late} days late (${usd(x.buy_usd)})`, dca_tomorrow: `🛒 Tomorrow: DCA ${x.coin} ${usd(x.buy_usd)}`,
    at_buy_price: `🎯 ${x.coin} ${usd(x.price_usd)} — at your buy price ${usd(x.your_buy_price_usd)}`, near_buy_price: `🎯 ${x.coin} ${pct(x.pct_above_buy_price, 1)} above your buy price ${usd(x.your_buy_price_usd)}`,
    take_profit_reached: `💰 ${x.coin} reached TP${x.tp} ${usd(x.level_usd)} — sell ${x.sell_pct}%`, take_profit_close: `💰 ${x.coin} ${r2(x.pct_to_go)}% from TP${x.tp} ${usd(x.level_usd)}`,
    exit_conditions: `🚪 Exit: ${x.met_of_3}/3 conditions met`, allocation_over: `⚖️ ${x.group} ${x.now_pct}% vs ${x.target_pct}% — trim ${usd(x.usd_to_fix)}`, allocation_under: `⚖️ ${x.group} ${x.now_pct}% vs ${x.target_pct}% — add ${usd(x.usd_to_fix)}`,
    reinforce_signal: `🟢 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} vs your avg — Reinforce`, sell_signal: `🔴 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} vs your avg — Sell / convert` }[x.what]),
  ar: x => ({ dca_today: `🛒 يوم الشراء الدوري (DCA): اشترِ ${x.coin} بـ ${usd(x.buy_usd)}`, dca_missed: `⏰ DCA ${x.coin} متأخر ${x.days_late} يوم (${usd(x.buy_usd)})`, dca_tomorrow: `🛒 غداً: DCA ${x.coin} ${usd(x.buy_usd)}`,
    at_buy_price: `🎯 ${x.coin} ${usd(x.price_usd)} — وصل إلى سعر الشراء الذي حددته ${usd(x.your_buy_price_usd)}`, near_buy_price: `🎯 ${x.coin} فوق سعر الشراء ${usd(x.your_buy_price_usd)} بـ ${pct(x.pct_above_buy_price, 1)}`,
    take_profit_reached: `💰 ${x.coin} وصل TP${x.tp} ${usd(x.level_usd)} — بيع ${x.sell_pct}%`, take_profit_close: `💰 ${x.coin} باقي ${r2(x.pct_to_go)}% على TP${x.tp} ${usd(x.level_usd)}`,
    exit_conditions: `🚪 الخروج: ${x.met_of_3}/3 مؤشرات تحققت`, allocation_over: `⚖️ ${x.group} ${x.now_pct}% والهدف ${x.target_pct}% — قلّل ${usd(x.usd_to_fix)}`, allocation_under: `⚖️ ${x.group} ${x.now_pct}% والهدف ${x.target_pct}% — زوّد ${usd(x.usd_to_fix)}`,
    reinforce_signal: `🟢 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} عن متوسط شرائك — تعزيز`, sell_signal: `🔴 ${x.coin} ${pct(x.pct_vs_your_avg, 1)} عن متوسط شرائك — بيع / تحويل` }[x.what]),
};
// 🇺🇸 / 🥇 the other markets for the smart morning / evening: the US stock market's state, the biggest bStock moves, gold and
// silver. notable = worth one line today (gold ±1.5%, a bStock ±5%); otherwise the message leaves it out.
function otherFacts(m, now) {
  const met = m.metals || [], f = k => { const x = met.find(y => y.k === k); return x && x.price > 0 ? { price_usd: r2(x.price), change_24h_pct: r2(x.ch24) } : null; };
  const st = (m.stocks || []).filter(r => r.ch24 != null && r.price > 0), u = usMarket(now);
  const best = [...st].sort((a, b) => b.ch24 - a.ch24)[0], worst = [...st].sort((a, b) => a.ch24 - b.ch24)[0];
  const gold = f('gold');
  const notable = !!((gold && Math.abs(gold.change_24h_pct) >= 1.5) || (best && best.ch24 >= 5) || (worst && worst.ch24 <= -5));
  return { notable, us_stock_market: { state: u.state, next_change_riyadh: local(u.next, { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) },
    bstock_best_24h: best ? { ticker: best.sym, pct: r2(best.ch24) } : null, bstock_worst_24h: worst ? { ticker: worst.sym, pct: r2(worst.ch24) } : null,
    gold_per_oz: gold, gold_gram_sar_24k: gold ? r2(gramSar(gold.price_usd)) : null };
}
function otherLine(L, o) {
  if (!o || !o.notable) return null;
  const ar = L === 'ar', parts = [];
  if (o.gold_per_oz) parts.push(`🥇 ${ar ? 'الذهب' : 'Gold'} ${usd(o.gold_per_oz.price_usd)} ${pct(o.gold_per_oz.change_24h_pct, 1)}`);
  if (o.bstock_best_24h && Math.abs(o.bstock_best_24h.pct) >= Math.abs((o.bstock_worst_24h || {}).pct || 0)) parts.push(`🇺🇸 ${esc(o.bstock_best_24h.ticker)} ${pct(o.bstock_best_24h.pct, 1)}`);
  else if (o.bstock_worst_24h) parts.push(`🇺🇸 ${esc(o.bstock_worst_24h.ticker)} ${pct(o.bstock_worst_24h.pct, 1)}`);
  return parts.join(' · ');
}
function plainMorning(L, f) {
  const ar = L === 'ar', p = f.portfolio, mk = f.market;
  const t = f.todo.slice(0, 3).map((x, i) => `${i + 1}. ${esc(TODO_TXT[L](x))}`);
  if (!t.length) t.push(ar ? '1. لا شيء مطلوب اليوم — احتفظ ✅' : '1. Nothing to do today — hold ✅');
  return [`💼 <b>${usd2(p.value_usd)}</b> ${dot(p.change_24h_pct)} ${pct(p.change_24h_pct)}`, '', `🎯 <b>${ar ? 'اليوم' : 'Today'}</b>`, ...t, '',
    `🌍 BTC <b>${usd(mk.btc_usd)}</b> ${pct(mk.btc_24h_pct)}${mk.fear_greed ? ` · F&amp;G <b>${mk.fear_greed.value}</b>` : ''}`, otherLine(L, f.other_markets)].filter(x => x != null).join('\n');
}
function plainEvening(L, f) {
  const ar = L === 'ar', p = f.portfolio, s = f.since_morning, out = [`💼 <b>${usd2(p.value_usd)}</b> ${dot(p.change_24h_pct)} ${pct(p.change_24h_pct)} 24h`];
  if (s) out.push(`${ar ? 'منذ الصباح' : 'Since the morning'}: <b>${s.portfolio_change_usd >= 0 ? '+' : '−'}${usd2(Math.abs(s.portfolio_change_usd))}</b>`);
  if (f.best_coins_24h.length) out.push(`📈 ${f.best_coins_24h.map(c => `${esc(c.coin)} ${pct(c.pct, 1)}`).join(' · ')}`);
  if (f.worst_coins_24h.length) out.push(`📉 ${f.worst_coins_24h.map(c => `${esc(c.coin)} ${pct(c.pct, 1)}`).join(' · ')}`);
  const ol = otherLine(L, f.other_markets); if (ol) out.push(ol);
  if (f.closest_levels.length) out.push('', `👀 <b>${ar ? 'راقب' : 'Watch'}</b>`, ...f.closest_levels.slice(0, 3).map(x => `• ${esc(x.alert || x.level)} — ${x.pct_away}%`));
  return out.join('\n');
}

// ── 🧲 leverage radar: one coin per run (BTC + your 3 biggest with futures), each finding once per 12 h ──
const RADAR_TXT = {
  en: { hot_longs: 'Crowded longs — funding very positive', hot_shorts: 'Crowded shorts — funding negative', oi_up: 'Leverage piling up — open interest jumped', oi_down: 'Leverage flushed out — open interest fell',
    crowd_long: 'Most accounts are long', crowd_short: 'Most accounts are short', fund: 'Funding', yr: 'yr', oi: 'Open interest 24h', longs: 'Long accounts', liq: 'Liquidations (OKX)', longsW: 'longs', shortsW: 'shorts',
    noteL: 'One-sided longs: a dip can cascade (long squeeze). Check the Liq Map.', noteS: 'One-sided shorts: a pump can cascade (short squeeze). Check the Liq Map.', noteN: 'Leverage changed fast — volatility likely. Check the Liq Map.' },
  ar: { hot_longs: 'ازدحام في مراكز الشراء — التمويل موجب جداً', hot_shorts: 'ازدحام في مراكز البيع — التمويل سالب', oi_up: 'الرافعة تزداد — قفزت العقود المفتوحة', oi_down: 'تم مسح الرافعة — انخفضت العقود المفتوحة',
    crowd_long: 'أغلب الحسابات في مراكز شراء', crowd_short: 'أغلب الحسابات في مراكز بيع', fund: 'التمويل', yr: 'سنوي', oi: 'العقود المفتوحة (24س)', longs: 'نسبة الشراء (Long)', liq: 'التصفيات (OKX)', longsW: 'شراء', shortsW: 'بيع',
    noteL: 'مراكز الشراء متكدسة: أي هبوط قد يسبب تصفيات متتالية. راجع خريطة التصفيات.', noteS: 'مراكز البيع متكدسة: أي صعود قد يسبب تصفيات متتالية. راجع خريطة التصفيات.', noteN: 'تغيّرت الرافعة بسرعة — يُتوقع تذبذب. راجع خريطة التصفيات.' },
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
  const i = (+(await kvGet(env, K(env, 'radar:i'))) || 0) % list.length, sym = list[i];
  await kvPut(env, K(env, 'radar:i'), String(i + 1));
  const d = await derivatives(sym).catch(() => null);
  if (!d || !d.summary) return { sym, sent: 0 };
  const s = d.summary, seen = await jget(env, K(env, 'radar:seen'), {});
  for (const k of Object.keys(seen)) if (now - seen[k] > 2 * DAY) delete seen[k];
  const fresh = radarFindings(s).filter(k => !(now - (seen[sym + ':' + k] || 0) < 12 * H));
  if (!fresh.length) { await jput(env, K(env, 'radar:seen'), seen); return { sym, sent: 0 }; }
  // 📡 not a message of its own any more: kept for the next radar digest (12:00 · 16:00 · 20:00) — one focused message
  const q = await jget(env, K(env, 'digest'), {}); q.lev = q.lev || {};
  q.lev[sym] = { t: now, finds: [...new Set([...(q.lev[sym] ? q.lev[sym].finds : []), ...fresh])], fund: s.funding_8h_pct_avg, oi: s.open_interest_change_24h_pct, longs: s.long_accounts_pct, top: s.top_traders_long_pct ?? null, id: idOf[sym] || null };
  await jput(env, K(env, 'digest'), q);
  fresh.forEach(k => { seen[sym + ':' + k] = now; }); await logEvent(env, 'radar', sym + ': ' + fresh.map(k => RADAR_TXT.en[k]).join(', '), now);
  await jput(env, K(env, 'radar:seen'), seen);
  return { sym, queued: fresh.length };
}

// ── 🔥 sector radar: CoinGecko's sectors (m/market.json → sectors, from tools/update-market.mjs) ──
export async function sectorRadar(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null);
  const m = await loadMarket([], user ? coinsOf(user) : []);
  const big = (m.sectors || []).filter(s => s && s.mcap >= 1e9 && s.ch24 != null && Math.abs(s.ch24) >= 10);
  if (!big.length) return { sent: 0 };
  const day = localParts(now).date, seen = await jget(env, K(env, 'sector:seen'), {});
  const fresh = big.filter(s => seen[s.id] !== day).sort((a, b) => Math.abs(b.ch24) - Math.abs(a.ch24)).slice(0, 3);
  if (!fresh.length) return { sent: 0 };
  const mine = new Set(user ? Object.values(m.idOf).filter(Boolean) : []), symOf = id => (Object.entries(m.idOf).find(([, v]) => v === id) || [])[0];
  const q = await jget(env, K(env, 'digest'), {}); q.sec = q.sec || {};
  for (const x of fresh) q.sec[x.id] = { t: now, name: x.name, ch24: x.ch24, mcap: x.mcap, held: (x.top || []).filter(id => mine.has(id)).map(symOf).filter(Boolean) };
  await jput(env, K(env, 'digest'), q);   // 📡 for the next radar digest
  fresh.forEach(x => { seen[x.id] = day; }); for (const k of Object.keys(seen)) if (seen[k] !== day) delete seen[k]; await jput(env, K(env, 'sector:seen'), seen);
  await logEvent(env, 'sector', fresh.map(x => x.name + ' ' + pct(x.ch24, 1)).join(', '), now);
  return { queued: fresh.length };
}

// ── 📌 the live message, pinned ──
export async function pinView(env, now = Date.now()) {
  const L = await lang(env), w = WD[L], g = await gather(env, now);
  if (!g) return null;
  const { m, sum } = g, alerts = await listAlerts(env), near = nearest(alerts, m, sum).filter(x => x.alert)[0];
  const dca = (sum.dca || []).filter(x => x.s.next).sort((a, b) => a.s.next.localeCompare(b.s.next))[0];
  const met = (sum.macro || []).filter(x => x.met).length;
  const me = isOwner(env) ? null : await member(env), star = me && premiumNow(me) ? ' ⭐' : '', heart = me && me.supporter ? ' 💛' : '';   // a member's badges
  const L1 = [`📌 <b>${w.live}</b>${star}${heart} · ${w.updated} ${local(now, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`,
    `💼 ${w.pfS}: <b>${usd2(sum.value)}</b> ${dot(sum.ch24)} (${pct(sum.ch24)} ${w.today})`,   // 💼 المحفظة: $33,143.94 (−3.95% اليوم)
    m.btc ? `🪙 ${w.btcS}: <b>${usd(m.btc.price)}</b> ${dot(m.btc.ch24)} (${pct(m.btc.ch24)})${m.fng ? ` · ${w.fng}: <b>${m.fng.value}</b>` : ''}` : null,
    `📋 ${w.planS}: <b>${sum.prog ? sum.prog.pct.toFixed(1) : '0'}%</b> · 🚪 ${w.exit}: <b>${met}/3</b>`,
    dca ? `🛒 ${w.nextDca}: <b>${esc(dca.sym)}</b> · ${esc(new Date(dca.s.next + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}` : null,
    alerts.length ? `🔔 ${w.alerts(alerts.length)}${near ? ` · ${w.nearest}: ${esc(near.alert)} (${near.pct_away}% ${w.away})` : ''}` : null].filter(Boolean);
  return { text: L1.join('\n'), buttons: [[cb(w.pf, 'pf'), cb(w.mk, 'mk'), cb(w.refresh, 'pin:r')], [{ text: w.report, web_app: { url: APP + 'index.html' } }]] };   // 📱 the full app inside Telegram
}
// fresh = /pin (or switching it on): always a NEW message, pinned — the old one may have been deleted in Telegram
// ("delete for me" keeps the bot's copy, so editing it "works" but nobody sees it); the old one is removed
export async function pinUpdate(env, now = Date.now(), force = false, fresh = false) {
  const v = await pinView(env, now);
  if (!v) return { ok: false };
  const st = await jget(env, K(env, 'pin'), {});
  const body = v.text.split('\n').slice(1).join('\n');   // the first line is the time: only redraw when a number changed (or hourly)
  if (!force && st.id && st.body === body && now - (st.t || 0) < H) return { ok: true, same: true };
  if (st.id && !fresh) {
    const r = await tg(env, 'editMessageText', { chat_id: chatOf(env), message_id: st.id, text: v.text, parse_mode: 'HTML', reply_markup: { inline_keyboard: v.buttons } });
    // asked for (/pin, 🔄, a new language): pin it again too — it may have been unpinned in Telegram itself
    if ((r.ok || /not modified/i.test(r.description || '')) && force) await tg(env, 'pinChatMessage', { chat_id: chatOf(env), message_id: st.id, disable_notification: true }).catch(() => {});
    if (r.ok || /not modified/i.test(r.description || '')) { await jput(env, K(env, 'pin'), { id: st.id, body, t: now }); return { ok: true, id: st.id }; }
  }
  const r = await send(env, v, { disable_notification: true });
  const id = r && r.ok && r.result && r.result.message_id;
  if (!id) return { ok: false };
  await tg(env, 'pinChatMessage', { chat_id: chatOf(env), message_id: id, disable_notification: true });
  if (st.id) { await tg(env, 'unpinChatMessage', { chat_id: chatOf(env), message_id: st.id }).catch(() => {}); if (fresh) await tg(env, 'deleteMessage', { chat_id: chatOf(env), message_id: st.id }).catch(() => {}); }
  await jput(env, K(env, 'pin'), { id, body, t: now });
  return { ok: true, id, new: true };
}
export async function unpin(env) {
  const st = await jget(env, K(env, 'pin'), {});
  if (st.id) await tg(env, 'unpinChatMessage', { chat_id: chatOf(env), message_id: st.id });
  await jput(env, K(env, 'pin'), {});
}

// ── /daily ──
export async function viewDaily(env) {
  const L = await lang(env), w = WD[L], c = await getCfg(env);
  const row = k => cb(`${c[k] ? '✅' : '⬜'} ${w[k]}`, 'dy:' + k);
  const at = { morning: c.morningAt, evening: c.eveningAt, radar: L === 'ar' ? 'في ملخص 12:00 · 16:00 · 20:00' : 'in the 12:00 · 16:00 · 20:00 digest', sectors: L === 'ar' ? 'في نفس الملخص' : 'in the same digest', pin: L === 'ar' ? 'كل 15 دقيقة' : 'every 15 min' };
  const lines = [w.dailyT, '', ...['morning', 'evening', 'radar', 'sectors', 'pin'].map(k => `${c[k] ? '✅' : '⬜'} ${w[k]} · <i>${at[k]}</i>`), '', `<i>${w.dailyNote}</i>`];
  return { text: lines.join('\n'), buttons: [[row('morning'), row('evening')], [row('radar'), row('sectors')], [row('pin')], [cb(w.nowM, 'dy:now:m'), cb(w.nowE, 'dy:now:e')], [cb(w.back, 'menu')]] };
}

// ── 📡 the radar digest (12:00 · 16:00 · 20:00): everything the leverage radar and the sector radar found since the last
// one, plus 🐋 what the big winning traders hold — ONE message. Nothing found and no whale flip → no message. ──
export const DIGEST_AT = ['12:00', '16:00', '20:00'];
const big$ = v => v >= 1e9 ? '$' + (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(0) + 'M' : '$' + Math.round(v / 1e3) + 'K';
// 🐋 one line per coin: "BTC: 14 long · 6 short — $310M vs $120M" (+ 🔄 when they changed side in the last 24 h)
export function whaleLines(wh, syms, ar, now = Date.now()) {
  if (!wh || !wh.coins || !(now - Date.parse(wh.t) < 12 * H)) return [];
  const side = { long: ar ? 'شراء' : 'long', short: ar ? 'بيع' : 'short', mixed: ar ? 'منقسمون' : 'split' };
  return syms.filter(x => wh.coins[x] && wh.coins[x].long + wh.coins[x].short >= 3).map(x => {
    const c = wh.coins[x], flip = c.was && c.flipT && now - Date.parse(c.flipT) < 24 * H;
    return ar ? `• <b>${esc(x)}</b>: ${c.long} شراء · ${c.short} بيع — ${big$(c.longUsd)} مقابل ${big$(c.shortUsd)}${flip ? ` · 🔄 انقلبوا من ${side[c.was]} إلى ${side[c.side]}` : ''}`
      : `• <b>${esc(x)}</b>: ${c.long} long · ${c.short} short — ${big$(c.longUsd)} vs ${big$(c.shortUsd)}${flip ? ` · 🔄 flipped ${side[c.was]} → ${side[c.side]}` : ''}`;
  });
}
export async function radarDigest(env, now = Date.now(), slot = '') {
  const q = await jget(env, K(env, 'digest'), {}), lev = Object.entries(q.lev || {}), sec = Object.entries(q.sec || {});
  const user = await loadUser(env).catch(() => null), m = await loadMarket([], user ? coinsOf(user) : []).catch(() => null);
  const L = await lang(env), ar = L === 'ar', w = RADAR_TXT[L];
  let held = []; if (user && m) { try { held = summarize(withIds(user, m), m, now).coins.filter(c => !isStable(c.sym)).sort((a, b) => b.value - a.value).map(c => c.sym); } catch (_) {} }
  const wh = m && m.whales, flips = wh && wh.coins ? Object.keys(wh.coins).filter(x => (['BTC', 'ETH', 'SOL'].includes(x) || held.includes(x)) && wh.coins[x].flipT && Date.parse(wh.coins[x].flipT) > (q.last || 0)) : [];
  if (!lev.length && !sec.length && !flips.length) { await jput(env, K(env, 'digest'), { last: q.last || 0 }); return { sent: 0 }; }
  const lines = [`📡 <b>${ar ? 'ملخص الرادارات' : 'Radar digest'}</b>${slot ? ' · ' + slot : ''}`];
  if (lev.length) {
    lines.push('', `🧲 <b>${ar ? 'الرافعة' : 'Leverage'}</b>`);
    for (const [sym, x] of lev) {
      lines.push(`• <b>${esc(sym)}</b>: ${x.finds.map(k => w[k]).join(' · ')}`);
      const d = [x.fund != null ? `${w.fund} ${x.fund > 0 ? '+' : x.fund < 0 ? '−' : ''}${Math.abs(x.fund)}% / 8h` : null, x.oi != null ? `${w.oi} ${pct(x.oi, 1)}` : null, x.longs != null ? `${w.longs} ${r2(x.longs)}%` : null].filter(Boolean);
      if (d.length) lines.push(`   ${d.join(' · ')}`);
    }
  }
  if (sec.length) {
    lines.push('', `🔥 <b>${ar ? 'القطاعات' : 'Sectors'}</b>`);
    for (const [, x] of sec.sort((a, b) => Math.abs(b[1].ch24) - Math.abs(a[1].ch24)).slice(0, 6))
      lines.push(`${x.ch24 > 0 ? '🚀' : '🔻'} <b>${esc(x.name)}</b> ${pct(x.ch24, 1)} · ${usd(x.mcap)}${x.held && x.held.length ? ` · ${ar ? 'تملك' : 'you hold'}: <b>${esc(x.held.join(', '))}</b>` : ''}`);
  }
  const wl = whaleLines(wh, [...new Set(['BTC', 'ETH', 'SOL', ...lev.map(([s2]) => s2), ...flips])].slice(0, 6), ar, now);
  if (wl.length) lines.push('', `🐋 <b>${ar ? 'الحيتان' : 'Whales'}</b> <i>(${ar ? `أكبر ${wh.n} متداول رابح على Hyperliquid` : `the ${wh.n} biggest winning traders on Hyperliquid`})</i>`, ...wl);
  lines.push('', `<i>${ar ? 'الرافعة المتكدسة تعني تقلباً أعلى — والحيتان يتحوّطون ويخسرون أيضاً.' : 'Crowded leverage means more volatility — and whales hedge, and lose too.'}</i>`, NOT_ADVICE[ar ? 'ar' : 'en']);
  const first = lev[0], btns = [[cb(WD[L].mk, 'mk'), cb(WD[L].pf, 'pf'), ...(first ? [url('🔥 Liq Map', LIQ + encodeURIComponent(first[0]))] : [])]];
  const r = await send(env, { text: lines.join('\n'), buttons: btns });
  if (r && r.ok) await jput(env, K(env, 'digest'), { last: now });
  return { sent: r && r.ok ? 1 : 0 };
}

// ── 🕌 zakat: your zakat day (a hijri day you chose in the app; 1 Ramadan when not set) — a reminder a week before, and
// on the day itself the amounts: all the crypto together against the value of 85 g of gold, gold (85 g), silver (595 g).
// The day's crypto value is kept in your settings, so the app shows the same amount all month. Once each, per hijri year. ──
const GPO = 31.1034768;
export function zakatFacts(user, m, now) {
  const w = zakatWhen(now, user && user.meta && user.meta.zakatDay); if (!w || !user || !m) return null;
  const sum = summarize(withIds(user, m), m, now), by = Object.fromEntries(sum.coins.map(c => [c.sym, c]));
  const goldOz = (by.XAU && by.XAU.price) || ((m.metals || []).find(x => x.k === 'gold') || {}).price || 0;
  const crypto = sum.coins.filter(c => c.sym !== 'XAU' && c.sym !== 'XAG').reduce((a, c) => a + c.value, 0);
  const nisabUsd = goldOz > 0 ? 85 / GPO * goldOz : 0, metal = (sym, nis) => { const c = by[sym]; if (!c || !(c.qty > 0)) return null; const g = c.qty * GPO; return { g, meets: g >= nis - 1e-6, zakatG: g * 0.025, zakatUsd: c.value * 0.025 }; };
  return { w, crypto, nisabUsd, cryptoMeets: nisabUsd > 0 && crypto >= nisabUsd, cryptoZakat: crypto * 0.025, gold: metal('XAU', 85), silver: metal('XAG', 595) };
}
export async function zakatAlert(env, now = Date.now()) {
  const user = await loadUser(env).catch(() => null); if (!user) return { sent: 0 };
  const w0 = zakatWhen(now, user.meta && user.meta.zakatDay); if (!w0) return { sent: 0 };
  const kind = w0.since === 0 ? 'day' : w0.daysLeft === 7 ? 'week' : null; if (!kind) return { sent: 0 };
  const key = (kind === 'day' ? w0.hy : w0.nextHy) + ':' + kind, had = await jget(env, K(env, 'zakat:sent'), {});
  if (had[key]) return { sent: 0 };
  const m = await loadMarket([], coinsOf(user)).catch(() => null), f = m && zakatFacts(user, m, now); if (!f) return { sent: 0 };
  const L = await lang(env), ar = L === 'ar', day = `${f.w.d} ${HIJRI_MONTHS[ar ? 'ar' : 'en'][f.w.m - 1]}`, g = v => (+v.toFixed(2)).toLocaleString('en-US');
  const any = f.cryptoMeets || (f.gold && f.gold.meets) || (f.silver && f.silver.meets);
  if (kind === 'week' && !any) { had[key] = 1; await jput(env, K(env, 'zakat:sent'), had); return { sent: 0 }; }   // nothing reaches the nisab: no reminder
  const lines = [kind === 'day' ? `🕌 <b>${ar ? 'اليوم يوم زكاتك' : 'Today is your zakat day'}</b> · ${day} ${f.w.hy}` : `🕌 <b>${ar ? 'زكاتك بعد 7 أيام' : 'Your zakat day is in 7 days'}</b> · ${day} ${f.w.nextHy}`, ''];
  const est = kind === 'week' ? (ar ? ' (تقدير بقيمة اليوم)' : ' (an estimate at today\'s value)') : '';
  if (f.nisabUsd > 0) lines.push(f.cryptoMeets
    ? (ar ? `• الكريبتو: <b>${usd2(f.cryptoZakat)}</b> — 2.5% من ${usd2(f.crypto)}${est}` : `• Crypto: <b>${usd2(f.cryptoZakat)}</b> — 2.5% of ${usd2(f.crypto)}${est}`)
    : (ar ? `• الكريبتو: أقل من النصاب (${usd2(f.nisabUsd)} = 85 جم ذهب) — لا زكاة` : `• Crypto: below the nisab (${usd2(f.nisabUsd)} = 85 g of gold) — none`));
  for (const [x, name, nis] of [[f.gold, ar ? 'الذهب' : 'Gold', 85], [f.silver, ar ? 'الفضة' : 'Silver', 595]]) {
    if (!x) continue;
    lines.push(x.meets ? (ar ? `• ${name}: <b>${g(x.zakatG)} جم</b> ≈ ${usd2(x.zakatUsd)} — 2.5% من ${g(x.g)} جم` : `• ${name}: <b>${g(x.zakatG)} g</b> ≈ ${usd2(x.zakatUsd)} — 2.5% of ${g(x.g)} g`)
      : (ar ? `• ${name}: ${g(x.g)} جم — أقل من النصاب (${nis} جم)` : `• ${name}: ${g(x.g)} g — below the nisab (${nis} g)`));
  }
  lines.push('', `<i>${ar ? 'تقدير حسابي وليس فتوى — راجع أهل العلم. قد يبدأ الشهر قبل التقويم أو بعده بيوم. يوم الزكاة يُغيَّر من علامة ✎ في التطبيق.' : 'An estimate, not a ruling — check with a scholar. The month may start a day earlier or later than the calendar. Change the day with the ✎ in the app.'}</i>`);
  if (kind === 'day' && f.nisabUsd > 0) await setZakatSnap(env, { hy: f.w.hy, value: Math.round(f.crypto * 100) / 100, nisabUsd: Math.round(f.nisabUsd * 100) / 100, date: f.w.lastDate, at: new Date(now).toISOString() });
  const r = await send(env, { text: lines.join('\n'), buttons: [[{ text: WD[L].report, web_app: { url: APP + 'index.html' } }]] });
  if (r && r.ok) { had[key] = 1; for (const k of Object.keys(had)) if (+k.split(':')[0] < f.w.hy - 1) delete had[k]; await jput(env, K(env, 'zakat:sent'), had); }
  return { sent: r && r.ok ? 1 : 0, kind };
}

// ── the cron (every 5 min, after the alerts): one bigger job per run ──
export async function runDaily(env, now = Date.now()) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatOf(env)) return { job: null };
  const c = await getCfg(env), lp = localParts(now), sent = await jget(env, K(env, 'daily:sent'), {}), min = new Date(now).getUTCMinutes();
  const due = (on, at, k) => { const late = mins(lp.hm) - mins(at); return on && late >= 0 && late < 180 && sent[k] !== lp.date; };   // up to 3 h late (a missed run catches up), once a day
  const done = async k => { sent[k] = lp.date; await jput(env, K(env, 'daily:sent'), sent); };
  if (due(c.morning, c.morningAt, 'morning')) { await done('morning'); await morning(env, now); return { job: 'morning' }; }   // marked first: never twice
  if (due(c.evening, c.eveningAt, 'evening')) { await done('evening'); await evening(env, now); return { job: 'evening' }; }
  if (min % 10 === 0) await oneLanguage(env, now).catch(() => {});
  if (lp.hm >= '09:30' && lp.hm < '12:00' && min % 30 === 0 && sent.zk !== lp.date) {   // 🕌 zakat: looked at once a day (the message itself: once a year each)
    await done('zk'); const z = await zakatAlert(env, now).catch(e => { console.log(JSON.stringify({ zakat: 'error', message: String(e && e.message).slice(0, 200) })); return { sent: 0 }; }); if (z.sent) return { job: 'zakat', ...z };
  }
  if ((c.radar || c.sectors) && min % 15 === 5) {   // 📡 the radar digest: once per slot (up to 2 h late), at :05 / :20 / :35 / :50 — a minute no other job uses
    const slot = DIGEST_AT.find(at => { const late = mins(lp.hm) - mins(at); return late >= 0 && late < 120 && sent['dg' + at] !== lp.date; });
    if (slot) { await done('dg' + slot); return { job: 'digest', ...(await radarDigest(env, now, slot)) }; }
  }
  if (c.pin && min % 15 === 0) { await pinUpdate(env, now); return { job: 'pin' }; }
  if (c.radar && min % 30 === 10) return { job: 'radar', ...(await radar(env, now)) };
  if (c.sectors && min % 60 === 25) return { job: 'sectors', ...(await sectorRadar(env, now)) };
  return { job: null };
}

// ── GitHub runs the market snapshot "twice an hour" but often an hour+ late. When the snapshot is over 25 min old, the
// Worker (whose cron is on time) asks GitHub to run it now (workflow_dispatch) — at most once every 20 min.
// Needs the Worker secret GH_DISPATCH_TOKEN: a fine-grained GitHub token for this repo only, "Actions: Read and write".
const REPO = 'drsamirsaad1981-design/samsam-portfolio';
export async function kickPrices(env, now = Date.now()) {
  if (!env.GH_DISPATCH_TOKEN) return { kick: 'no token' };
  const m = await loadMarket([], []).catch(() => null), t = m && m.parts && Date.parse(m.parts.top);
  if (!t || now - t < 25 * 60e3) return { kick: 'fresh' };
  const last = +(await kvGet(env, 'tg:kick')) || 0;
  if (now - last < 20 * 60e3) return { kick: 'waiting' };
  await kvPut(env, 'tg:kick', String(now), 3600);
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/prices.yml/dispatches`, { method: 'POST',
    headers: { authorization: 'Bearer ' + env.GH_DISPATCH_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'samsam-worker', 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main' }) }).catch(() => null);
  const ok = !!(r && r.status === 204);
  if (!ok) console.log(JSON.stringify({ kick: 'refused', status: r && r.status }));
  return { kick: ok ? 'sent' : 'refused', age_min: Math.round((now - t) / 60e3) };
}
