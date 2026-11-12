// tools/worker/watch.mjs — alerts you set in words (phase 3), checked every 5 minutes by the Worker's cron.
//
//   "tell me if SOL drops below 82" · "if BTC goes above 100k" · "if ETH moves more than 8% in a day" ·
//   "if SOL funding turns negative" · "if my portfolio goes under 25k"
// Claude turns the words into an alert (tools set_alert / list_alerts / delete_alert); /alerts lists them with 🗑 buttons.
// Each alert fires once, then it is gone. One that is already true when you set it waits until it isn't, then fires
// the next time it becomes true (so "below 82" set at 81 fires after a bounce and a new drop — never at once).
// Prices: the exchanges first (live, by ticker), then CoinGecko / the market snapshot. Stored in KV (RATE): tg:alerts.

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
    const m = await loadMarket([], user ? coinsOf(user) : []);
    const c = await findCoin(q, m, user);
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
  const k = KINDS[a.kind], v = k.what === 'price' ? usd(a.value) : k.what === 'portfolio' ? usd(a.value) : k.what === 'funding' ? a.value + '% / 8h' : pct(a.value, 1);
  const what = k.what === 'price' ? `${a.sym} price` : k.what === 'change_24h' ? `${a.sym} 24h change` : k.what === 'funding' ? `${a.sym} funding` : 'Portfolio value';
  return `${what} ${k.op} ${v}`;
}

// ── the cron: every 5 minutes ──
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false }));
}
export async function runWatch(env, now = Date.now()) {
  const list = await listAlerts(env);
  if (!list.length || !env.TELEGRAM_BOT_TOKEN || !chatOf(env)) return { checked: 0, fired: 0 };
  resetBudget();
  const cache = {}, keep = [], fired = [];
  for (const a of list) {
    let now1 = null; try { now1 = await currentValue(env, a, cache); } catch (_) {}
    if (now1 == null) { keep.push(a); continue; }
    const on = met(a.kind, now1, a.value);
    if (!a.armed) { keep.push(on ? a : { ...a, armed: true }); continue; }   // was already true: arm once it isn't
    if (!on) { keep.push(a); continue; }
    fired.push({ a, now: now1 });
  }
  for (const { a, now: v } of fired) {
    const k = KINDS[a.kind], up = k.op === '≥';
    const nowTxt = k.what === 'price' || k.what === 'portfolio' ? usd(v) : k.what === 'funding' ? v + '% / 8h' : pct(v, 1);
    const head = k.what === 'portfolio' ? `💼 <b>Portfolio ${up ? 'above' : 'below'} ${usd(a.value)}</b>` : `${up ? '🚀' : '🔻'} <b>${esc(a.sym)} ${k.what === 'price' ? (up ? 'above' : 'below') + ' ' + usd(a.value) : k.what === 'funding' ? 'funding ' + k.op + ' ' + a.value + '%' : '24h ' + k.op + ' ' + pct(a.value, 1)}</b>`;
    const text = `🔔 ${head}\nNow: <b>${nowTxt}</b>${a.note ? '\n<i>' + esc(a.note) + '</i>' : ''}\n<i>Your alert from ${local(a.created, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })} — done, removed.</i>`;
    const buttons = a.sym ? [[{ text: '🪙 ' + a.sym, callback_data: 'c:' + (a.cg || 'x-' + a.sym.toLowerCase()).slice(0, 58) }, { text: '🔥 Liq Map', url: 'https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=' + encodeURIComponent(a.sym) }]] : [[{ text: '💼 Portfolio', callback_data: 'pf' }]];
    const r = await tg(env, 'sendMessage', { chat_id: chatOf(env), text, parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: { inline_keyboard: buttons } });
    if (!r.ok) keep.push(a);   // Telegram refused: try again next time
    else await logEvent(env, 'alert', describe(a) + ' — now ' + nowTxt);
  }
  await locked(async () => {   // alerts added while this ran stay; the fired ones go
    const nowList = await listAlerts(env), seen = new Set(list.map(a => a.id));
    await saveAlerts(env, [...keep.filter(a => nowList.some(b => b.id === a.id)), ...nowList.filter(b => !seen.has(b.id))]);
  });
  return { checked: list.length, fired: fired.length };
}

// /alerts — the list with a 🗑 per alert
export async function viewAlerts(env, lang = 'en') {
  const list = await listAlerts(env), ar = lang === 'ar';
  if (!list.length) return { text: ar ? '🔔 مفيش تنبيهات.\nاكتب مثلاً: <i>نبّهني لو SOL نزل تحت 82</i>' : '🔔 No alerts yet.\nWrite e.g. <i>tell me if SOL drops below 82</i>', buttons: [[{ text: ar ? '⬅️ القائمة' : '⬅️ Menu', callback_data: 'menu' }]] };
  const L = [ar ? `🔔 <b>تنبيهاتك</b> (${list.length})` : `🔔 <b>Your alerts</b> (${list.length})`, ''];
  list.forEach((a, i) => L.push(`${i + 1}. ${esc(describe(a))}${a.armed ? '' : ar ? ' <i>(مستني يرجع الأول)</i>' : ' <i>(waits to reset first)</i>'}`));
  L.push('', ar ? '<i>بيتشيك كل 5 دقايق · كل تنبيه مرة واحدة</i>' : '<i>Checked every 5 min · each fires once</i>');
  const buttons = []; for (let i = 0; i < list.length; i += 3) buttons.push(list.slice(i, i + 3).map((a, j) => ({ text: `🗑 ${i + j + 1}`, callback_data: 'ad:' + a.id })));
  buttons.push([{ text: ar ? '🔄 تحديث' : '🔄 Refresh', callback_data: 'al' }, { text: ar ? '⬅️ القائمة' : '⬅️ Menu', callback_data: 'menu' }]);
  return { text: L.join('\n'), buttons };
}
