// tools/worker/watch.mjs — alerts you set in words (phase 3), checked every 5 minutes by the Worker's cron.
//
//   "tell me if SOL drops below 82" · "if BTC goes above 100k" · "if ETH moves more than 8% in a day" ·
//   "if SOL funding turns negative" · "if my portfolio goes under 25k"
// Claude turns the words into an alert (tools set_alert / list_alerts / delete_alert); /alerts lists them with 🗑 buttons.
// Each alert fires once — after it held on two checks in a row (not a wick) — then it is gone; a round's alerts come in one message. One that is already true when you set it waits until it isn't, then fires
// the next time it becomes true (so "below 82" set at 81 fires after a bounce and a new drop — never at once).
// Prices: the exchanges first (live, by ticker), then CoinGecko / the market snapshot. Stored in KV (RATE): tg:alerts.

import { bidiBody } from './bidi.mjs';
import { K, chatOf } from './who.mjs';
import { loadMarket, loadUser, coinsOf, withIds, exchangePrice, derivatives, findCoin, resetBudget } from './data.mjs';
import { summarize, usd, pct, esc, local, localParts } from '../alerts-core.mjs';

const KEY = env => K(env, 'alerts'), MAX = 30;
export const KINDS = {
  price_below: { what: 'price', op: '≤' }, price_above: { what: 'price', op: '≥' },
  change_24h_below: { what: 'change_24h', op: '≤' }, change_24h_above: { what: 'change_24h', op: '≥' },
  funding_below: { what: 'funding', op: '≤' }, funding_above: { what: 'funding', op: '≥' },
  portfolio_below: { what: 'portfolio', op: '≤' }, portfolio_above: { what: 'portfolio', op: '≥' },
};
const mem = new Map();
async function kvGet(env, k) { try { if (env.RATE) return await env.RATE.get(k); } catch (_) {} return mem.has(k) ? mem.get(k) : null; }
async function kvPut(env, k, v) { mem.set(k, v); try { if (env.RATE) await env.RATE.put(k, v); } catch (_) {} }
let lock = Promise.resolve();   // changes to the list one at a time (Claude may set several alerts at once)
const locked = fn => { const run = lock.then(fn, fn); lock = run.catch(() => {}); return run; };
export async function listAlerts(env) { try { const a = JSON.parse((await kvGet(env, KEY(env))) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
async function saveAlerts(env, list) { await kvPut(env, KEY(env), JSON.stringify(list.slice(0, MAX))); }
// today's events (alerts that fired, radar hits, trades saved) — the smart evening tells what happened. KV tg:log:<Riyadh day>
export async function logEvent(env, type, text, now = Date.now()) {
  const k = K(env, 'log:' + localParts(now).date);
  let a = []; try { a = JSON.parse((await kvGet(env, k)) || '[]'); } catch (_) {}
  a.push({ t: now, type, text: String(text).replace(/<[^>]+>/g, '').slice(0, 200) });
  const v = JSON.stringify(a.slice(-30)); mem.set(k, v);
  try { if (env.RATE) await env.RATE.put(k, v, { expirationTtl: 3 * 86400 }); } catch (_) {}
}
export async function todayLog(env, now = Date.now()) { try { return JSON.parse((await kvGet(env, K(env, 'log:' + localParts(now).date))) || '[]'); } catch (_) { return []; } }
const met = (kind, now, v) => now != null && (KINDS[kind].op === '≤' ? now <= v : now >= v);

// what an alert watches, right now
export async function currentValue(env, a, cache = {}) {
  const k = KINDS[a.kind];
  if (k.what === 'portfolio') {
    if (cache.pf === undefined) {
      const user = await loadUser(env).catch(() => null);
      if (!user) cache.pf = null;
      else { const m = await loadMarket([], coinsOf(user)); cache.pf = summarize(withIds(user, m), m, Date.now()).value; }
    }
    return cache.pf;
  }
  if (k.what === 'funding') {
    const d = await derivatives(a.sym).catch(() => null);
    return d && d.summary ? d.summary.funding_8h_pct_avg : null;
  }
  const key = 'p:' + a.sym;
  if (a.metal || a.stock) {   // 🥇 a metal / 📈 a bStock: from the market snapshot (GitHub, every ~30 min) — never by ticker on an exchange
    if (!(key in cache)) {
      const m = await loadMarket([], []);
      const r = a.metal ? (m.metals || []).find(x => x.k === a.metal) : (m.stocks || []).find(x => x.id === a.cg || x.sym === a.sym);
      cache[key] = r && r.price > 0 ? { price: r.price, ch24: r.ch24, src: 'snapshot' } : null;
    }
    const y = cache[key]; return !y ? null : k.what === 'price' ? y.price : y.ch24;
  }
  if (!(key in cache)) {
    let x = await exchangePrice(a.sym).catch(() => null);   // live from the exchanges
    if (!x) {   // else CoinGecko / the snapshot
      const m = await loadMarket(a.cg ? [a.cg] : [], [{ sym: a.sym, id: a.cg || null }]);
      const id = a.cg || m.idOf[a.sym], r = id && [...m.top, ...m.top500].find(z => z.id === id);
      x = r && r.price > 0 ? { price: r.price, ch24: r.ch24, src: m.live[id] ? 'CoinGecko' : 'snapshot' } : null;
    }
    cache[key] = x;
  }
  const x = cache[key];
  return !x ? null : k.what === 'price' ? x.price : x.ch24;
}

// a new alert from Claude's tool call: { coin?, kind, value, note? } → { ok, alert, now, already_met } or { error }
export async function addAlert(env, input, user) {
  const kind = String(input.kind || '');
  if (!KINDS[kind]) return { error: 'kind must be one of ' + Object.keys(KINDS).join(', ') };
  const value = +input.value;
  if (!isFinite(value)) return { error: 'value must be a number' };
  const a = { id: Math.random().toString(36).slice(2, 8), kind, value, note: String(input.note || '').slice(0, 80), created: Date.now() };
  if (KINDS[kind].what !== 'portfolio') {
    const q = String(input.coin || '').trim();
    if (!q) return { error: 'coin is needed for this kind' };
    if (KINDS[kind].what === 'funding' && (metalOf(q))) return { error: 'funding is for crypto futures only' };
    const mk = metalOf(q);
    if (mk) { a.metal = mk; a.sym = mk.toUpperCase(); }
    const m = await loadMarket([], user ? coinsOf(user) : []);
    const st = !mk && stockOf(q, m.stocks || []);
    if (st && KINDS[kind].what !== 'funding') { a.stock = true; a.sym = st.sym; a.cg = st.id; a.name = String(st.name || '').replace(/\s*bStock$/i, ''); }
    const c = mk || a.stock ? { sym: a.sym, id: a.cg || null } : await findCoin(q, m, user);
    if (!c) return { error: `no coin found for "${q}"` };
    a.sym = c.sym; a.cg = c.id || null;
  }
  const now = await currentValue(env, a);
  if (now == null) return { error: `no live ${KINDS[kind].what} found for ${a.sym || 'the portfolio'} — alert not set` };
  a.armed = !met(kind, now, value);   // already true → waits until it isn't, then fires on the next crossing
  return locked(async () => {
    const list = await listAlerts(env);
    const same = list.find(b => b.kind === a.kind && b.value === a.value && (b.sym || null) === (a.sym || null));
    if (same) return { ok: true, alert: describe(same), id: same.id, now, already_set: true, note: 'This exact alert already exists — nothing added. Tell the user it was already set.' };   // no duplicates
    if (list.length >= MAX) return { error: `you already have ${MAX} alerts — delete some first` };
    list.push(a); await saveAlerts(env, list);
    return { ok: true, alert: describe(a), id: a.id, now, already_met: !a.armed };
  });
}
export function deleteAlert(env, id) {
  return locked(async () => {
    const list = await listAlerts(env), next = list.filter(a => a.id !== id);
    if (next.length === list.length) return false;
    await saveAlerts(env, next); return true;
  });
}
export function describe(a) {
  const k = KINDS[a.kind], v = k.what === 'price' ? usd(a.value) + (a.metal ? '/' + (METAL_UNIT[a.metal] || 'oz') : '') : k.what === 'portfolio' ? usd(a.value) : k.what === 'funding' ? a.value + '% / 8h' : pct(a.value, 1);
  const who = a.metal ? (METAL_NAME[a.metal] || a.sym) : a.stock ? `${a.sym}${a.name ? ' (' + a.name + ')' : ''}` : a.sym;
  const what = k.what === 'price' ? `${who} price` : k.what === 'change_24h' ? `${who} 24h change` : k.what === 'funding' ? `${a.sym} funding` : 'Portfolio value';
  return `${what} ${k.op} ${v}`;
}
// 🥇 the metals an alert can watch (words in English and Arabic), and 📈 a bStock by its ticker or company name
const METAL_WORDS = { gold: /^(gold|xau|ذهب|الذهب)$/i, silver: /^(silver|xag|فضة|الفضة)$/i, platinum: /^(platinum|xpt|بلاتين|البلاتين)$/i, copper: /^(copper|نحاس|النحاس)$/i };   // (no oil alerts any more)
const METAL_NAME = { gold: 'Gold', silver: 'Silver', platinum: 'Platinum', copper: 'Copper', brent: 'Brent oil' }, METAL_UNIT = { gold: 'oz', silver: 'oz', platinum: 'oz', copper: 'lb', brent: 'barrel' };
export const metalOf = q => Object.keys(METAL_WORDS).find(k => METAL_WORDS[k].test(String(q).trim())) || null;
export function stockOf(q, stocks) {
  const Q = String(q).trim().toUpperCase(), lq = String(q).trim().toLowerCase(); if (!Q) return null;
  return stocks.find(s => s.sym === Q) || stocks.find(s => s.sym === Q + 'B') || (lq.length >= 3 ? stocks.find(s => String(s.name || '').toLowerCase().replace(/\s*bstock$/, '') === lq) || stocks.find(s => String(s.name || '').toLowerCase().startsWith(lq)) : null) || null;
}
const groupOf = a => KINDS[a.kind].what === 'portfolio' ? 'pf' : a.metal ? 'metal' : a.stock ? 'stock' : 'coin';

// ── the cron: every 5 minutes ──
async function tg(env, method, body) {
  body = bidiBody(body);   // Arabic lines read right-to-left (bidi.mjs)
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
// ⏳ an alert fires only when its condition is still true on the NEXT check too (the cron runs every 5 minutes): a price
// that dips for a few seconds — the wick of a candle — and comes back is never an alert. All the alerts confirmed in one
// round come in ONE message (fewer messages; each alert still says what it was).
export const CONFIRM_MS = 4 * 60e3;   // two checks in a row (5 min apart; a little less, for the cron's own jitter)
export async function runWatch(env, now = Date.now()) {
  const list = await listAlerts(env);
  if (!list.length || !env.TELEGRAM_BOT_TOKEN || !chatOf(env)) return { checked: 0, fired: 0 };
  resetBudget();
  const cache = {}, keep = [], fired = [];
  let waiting = 0;
  for (const a of list) {
    let now1 = null; try { now1 = await currentValue(env, a, cache); } catch (_) {}
    if (now1 == null) { keep.push(a); continue; }
    const on = met(a.kind, now1, a.value);
    if (!a.armed) { keep.push(on ? a : { ...a, armed: true }); continue; }   // was already true: arm once it isn't
    if (!on) { const { since, ...rest } = a; keep.push(since ? rest : a); continue; }   // back the other side (a wick): starts over
    if (!a.since) { keep.push({ ...a, since: now }); waiting++; continue; }          // true for the first time: wait for the next check
    if (now - a.since < CONFIRM_MS) { keep.push(a); waiting++; continue; }
    fired.push({ a, now: now1 });
  }
  if (fired.length) {
    const block = ({ a, now: v }) => {
      const k = KINDS[a.kind], up = k.op === '≥';
      const nowTxt = k.what === 'price' || k.what === 'portfolio' ? usd(v) : k.what === 'funding' ? v + '% / 8h' : pct(v, 1);
      const head = k.what === 'portfolio' ? `💼 <b>Portfolio ${up ? 'above' : 'below'} ${usd(a.value)}</b>` : `${up ? '🚀' : '🔻'} <b>${esc(a.metal ? METAL_NAME[a.metal] : a.sym)} ${k.what === 'price' ? (up ? 'above' : 'below') + ' ' + usd(a.value) : k.what === 'change_24h' ? '24h ' + (up ? '≥' : '≤') + ' ' + pct(a.value, 1) : 'funding ' + (up ? '≥' : '≤') + ' ' + a.value + '%'}</b>`;
      return { nowTxt, text: `${head}\nNow: <b>${nowTxt}</b>${a.note ? '\n<i>' + esc(a.note) + '</i>' : ''}\n<i>Your alert from ${local(a.created, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} — held on two checks (not a wick), done, removed.</i>` };
    };
    const blocks = fired.map(block);
    const text = fired.length === 1 ? '🔔 ' + blocks[0].text : `🔔 <b>${fired.length} alerts</b>\n\n` + blocks.map(b => b.text).join('\n\n');
    const btn = a => a.metal ? { text: '🥇 Metals', callback_data: 'mkm' } : a.stock ? { text: '📈 bStocks', callback_data: 'mks' } : a.sym ? { text: '🪙 ' + a.sym, callback_data: 'c:' + (a.cg || 'x-' + a.sym.toLowerCase()).slice(0, 58) } : { text: '💼 Portfolio', callback_data: 'pf' };
    const seenB = new Set(), row = [];
    fired.forEach(({ a }) => { const b = btn(a); if (!seenB.has(b.callback_data) && row.length < 3) { seenB.add(b.callback_data); row.push(b); } });
    const one = fired.length === 1 && fired[0].a.sym && !fired[0].a.metal && !fired[0].a.stock;
    const buttons = [one ? [row[0], { text: '🔥 Liq Map', url: 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=' + encodeURIComponent(fired[0].a.sym) }] : row, [{ text: '🔔 /alerts', callback_data: 'al' }]];
    const r = await tg(env, 'sendMessage', { chat_id: chatOf(env), text: text.slice(0, 4000), parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons } });
    if (!r.ok) fired.forEach(({ a }) => keep.push(a));   // Telegram refused: all try again next time
    else for (let i = 0; i < fired.length; i++) await logEvent(env, 'alert', describe(fired[i].a) + ' — now ' + blocks[i].nowTxt);
  }
  await locked(async () => {   // alerts added while this ran stay; the fired ones go
    const nowList = await listAlerts(env), seen = new Set(list.map(a => a.id));
    await saveAlerts(env, [...keep.filter(a => nowList.some(b => b.id === a.id)), ...nowList.filter(b => !seen.has(b.id))]);
  });
  return { checked: list.length, fired: fired.length, waiting };
}

// /alerts — the list with a 🗑 per alert
export async function viewAlerts(env, lang = 'en') {
  const list = await listAlerts(env), ar = lang === 'ar';
  if (!list.length) return { text: ar ? '🔔 لا توجد تنبيهات.\nاكتب مثلاً: <i>نبهني إذا نزل SOL تحت 82</i>' : '🔔 No alerts yet.\nWrite e.g. <i>tell me if SOL drops below 82</i>', buttons: [[{ text: ar ? '⬅️ القائمة' : '⬅️ Menu', callback_data: 'menu' }]] };
  const L = [ar ? `🔔 <b>تنبيهاتك</b> (${list.length})` : `🔔 <b>Your alerts</b> (${list.length})`];
  const G = [['coin', ar ? '🪙 العملات' : '🪙 Coins'], ['stock', ar ? '📈 الأسهم (bStocks)' : '📈 Stocks (bStocks)'], ['metal', ar ? '🥇 المعادن' : '🥇 Metals'], ['pf', ar ? '💼 المحفظة' : '💼 Portfolio']];
  const groups = G.filter(([g]) => list.some(a => groupOf(a) === g)), several = groups.length > 1;
  const shown = [];   // grouped (a heading only when there is more than one kind), numbered in the order shown; the number = its 🗑 button
  for (const [g, title] of groups) {
    L.push('', ...(several ? [`<b>${title}</b>`] : []));
    list.forEach(a => { if (groupOf(a) === g) { shown.push(a); L.push(`${shown.length}. ${esc(describe(a))}${a.armed ? '' : ar ? ' <i>(ينتظر عودة السعر أولاً)</i>' : ' <i>(waits to reset first)</i>'}`); } });
  }
  const slow = list.some(a => a.metal || a.stock);
  L.push('', ar ? '<i>يتحقق كل 5 دقائق · يُرسل بعد فحصين متتاليين (ليس ذيل شمعة) · كل تنبيه مرة واحدة' + (slow ? ' · المعادن والأسهم: أسعار تُحدَّث كل ~30 دقيقة' : '') + '</i>' : '<i>Checked every 5 min · sent after two checks in a row (not a wick) · each fires once' + (slow ? ' · metals &amp; stocks: prices refreshed every ~30 min' : '') + '</i>');
  const buttons = []; for (let i = 0; i < shown.length; i += 3) buttons.push(shown.slice(i, i + 3).map((a, j) => ({ text: `🗑 ${i + j + 1}`, callback_data: 'ad:' + a.id })));
  buttons.push([{ text: ar ? '🔄 تحديث' : '🔄 Refresh', callback_data: 'al' }, { text: ar ? '⬅️ القائمة' : '⬅️ Menu', callback_data: 'menu' }]);
  return { text: L.join('\n'), buttons };
}
