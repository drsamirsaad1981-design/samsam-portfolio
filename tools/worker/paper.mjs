// tools/worker/paper.mjs — phase 9: paper trading. A separate pretend portfolio at real prices — nothing touches your real one.
//
//   /paper                 the pretend portfolio: value, cash, profit, each coin, and the same money kept in BTC from the start
//   "paper buy 0.1 BTC", "تجريبي اشتري SOL بـ 500 دولار", "paper sell half my ETH"   → Claude's tool paper_trade (done at once)
//   ↩️ Undo last · 🔄 Start again (with $1,000 / $10,000 / $100,000)
// Prices: the same live ones as the rest of the bot (CoinGecko, else the exchanges, else the snapshot). A 0.1% fee per trade,
// like Binance spot, so it isn't too rosy. Any coin the bot can price — not only the ones you hold.
// Stored in KV (RATE): tg:paper = { start, startCash, btcStart, cash, pos: { SYM: { qty, avg, id } }, trades: [...] }.

import { local, usd, usd2, pct, esc, dot, isStable } from '../alerts-core.mjs';
import { loadMarket, findCoin } from './data.mjs';

const KEY = 'tg:paper', FEE = 0.001, START = 10000;
const mem = new Map();
async function kvGet(env, k) { try { if (env.RATE) { const v = await env.RATE.get(k); if (v != null) return v; } } catch (_) {} return mem.has(k) ? mem.get(k) : null; }
async function kvPut(env, k, v) { mem.set(k, v); try { if (env.RATE) await env.RATE.put(k, v); } catch (_) {} }
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const r8 = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(8);
const amt = q => (+Number(q).toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });
const money = v => v == null || !isFinite(v) ? '—' : Math.abs(v) >= 1 || v === 0 ? usd2(v) : '$' + (+v.toPrecision(4));
let lock = Promise.resolve();
const locked = fn => { const run = lock.then(fn, fn); lock = run.catch(() => {}); return run; };

async function load(env) { try { const p = JSON.parse((await kvGet(env, KEY)) || 'null'); return p && p.pos ? p : null; } catch (_) { return null; } }
const save = (env, p) => kvPut(env, KEY, JSON.stringify(p));

// live prices for some coins: { SYM: { price, ch24, id, src } }
async function prices(coins) {
  const list = coins.filter(c => c && c.sym);
  const m = await loadMarket(list.map(c => c.id).filter(Boolean), list.map(c => ({ sym: c.sym, id: c.id || null })));
  const rows = [...m.top, ...m.top500], out = {};
  for (const c of list) {
    const id = c.id || m.idOf[c.sym], r = id && rows.find(x => x.id === id), s = id && m.series[id];
    const p = r && r.price > 0 ? r.price : s ? s.last : null;
    if (p > 0) out[c.sym] = { price: p, ch24: r ? r.ch24 : null, id: id || null, src: typeof m.live[id] === 'string' ? m.live[id] : m.live[id] ? 'CoinGecko' : 'snapshot' };
  }
  if (m.btc && m.btc.price > 0) out.BTC = out.BTC || { price: m.btc.price, ch24: m.btc.ch24, id: 'bitcoin', src: m.live.bitcoin ? (typeof m.live.bitcoin === 'string' ? m.live.bitcoin : 'CoinGecko') : 'snapshot' };
  return out;
}

export async function reset(env, cash = START) {
  const c = [1000, 10000, 100000].includes(+cash) ? +cash : START;
  const px = await prices([{ sym: 'BTC', id: 'bitcoin' }]);
  if (!px.BTC) return { error: 'no BTC price right now — try again in a minute' };
  return locked(async () => { const p = { start: Date.now(), startCash: c, btcStart: px.BTC.price, cash: c, pos: {}, trades: [] }; await save(env, p); return { ok: true, paper: p }; });
}

// the numbers: value, profit, vs the same money in BTC since the start
export async function status(env) {
  let p = await load(env);
  if (!p) { const r = await reset(env); if (r.error) return r; p = r.paper; }
  const px = await prices([{ sym: 'BTC', id: 'bitcoin' }, ...Object.entries(p.pos).map(([sym, x]) => ({ sym, id: x.id }))]);
  const coins = Object.entries(p.pos).map(([sym, x]) => { const q = px[sym]; const price = q ? q.price : x.avg; return { sym, qty: x.qty, avg: x.avg, price, value: x.qty * price, pnl_pct: x.avg > 0 ? (price / x.avg - 1) * 100 : 0, ch24: q ? q.ch24 : null, priced: !!q }; }).sort((a, b) => b.value - a.value);
  const value = p.cash + coins.reduce((a, c) => a + c.value, 0), btcNow = px.BTC ? px.BTC.price : null;
  const hodl = btcNow && p.btcStart ? p.startCash * btcNow / p.btcStart : null;
  return { p, coins, value, profit: value - p.startCash, profitPct: (value / p.startCash - 1) * 100, hodl, vsBtcPts: hodl ? (value / p.startCash - hodl / p.startCash) * 100 : null, btcNow };
}

// Claude's tool: { side, coin, amount?, usd?, fraction? } → done at once (pretend money)
export async function paperTrade(env, input) {
  const i = input || {}, side = String(i.side || '').toLowerCase();
  if (side !== 'buy' && side !== 'sell') return { error: 'side must be buy or sell' };
  const q = String(i.coin || '').trim();
  if (!q) return { error: 'coin is needed' };
  let p = await load(env);
  if (!p) { const r = await reset(env); if (r.error) return r; p = r.paper; }
  const m0 = await loadMarket([], []), c = await findCoin(q, m0, null);
  if (!c) return { error: `no coin found for "${q}"` };
  const sym = c.sym.toUpperCase();
  if (isStable(sym)) return { error: 'stablecoins are the cash here — buy or sell another coin' };
  const px = await prices([{ sym, id: c.id }]), x = px[sym];
  if (!x) return { error: `no live price for ${sym} right now` };
  return locked(async () => {
    p = await load(env) || p;
    const held = p.pos[sym] || { qty: 0, avg: 0, id: x.id };
    let qty = +i.amount;
    if (!(qty > 0) && +i.usd > 0) qty = side === 'buy' ? +i.usd / (x.price * (1 + FEE)) : +i.usd / x.price;
    if (!(qty > 0) && side === 'sell' && +i.fraction > 0) qty = held.qty * Math.min(1, +i.fraction);
    if (!(qty > 0)) return { error: 'how much? give amount (coins), usd, or (to sell) fraction' };
    const gross = qty * x.price, fee = gross * FEE;
    if (side === 'buy') {
      if (gross + fee > p.cash + 1e-6) return { error: `only ${money(p.cash)} pretend cash left — that costs ${money(gross + fee)}` };
      p.cash -= gross + fee;
      held.avg = (held.qty * held.avg + gross + fee) / (held.qty + qty); held.qty += qty; held.id = held.id || x.id;
      p.pos[sym] = held;
    } else {
      if (qty > held.qty * (1 + 1e-9) + 1e-12) return { error: `only ${amt(held.qty)} ${sym} in the paper portfolio` };
      qty = Math.min(qty, held.qty);
      p.cash += gross - fee;
      held.qty -= qty;
      if (held.qty * x.price < 0.01) delete p.pos[sym]; else p.pos[sym] = held;
    }
    const t = { t: Date.now(), side, sym, qty: r8(qty), price: r8(x.price), fee: r2(fee), realized: side === 'sell' ? r2((x.price - (held.avg || 0)) * qty - fee) : null };
    p.trades = [...(p.trades || []), t].slice(-50);
    p.undo = { t: t.t, side, sym, qty, gross, fee, avgBefore: side === 'buy' ? null : held.avg };   // what ↩️ reverses
    await save(env, p);
    return { ok: true, done: t, price_source: x.src, cash_left_usd: r2(p.cash), now_held: r8((p.pos[sym] || { qty: 0 }).qty), note: 'Pretend money only — the real portfolio is untouched. Done at once; the user can tap ↩️ Undo last.' };
  });
}

// ↩️ undo the last trade (once)
export async function undoLast(env) {
  return locked(async () => {
    const p = await load(env);
    if (!p || !p.trades || !p.trades.length || !p.undo) return { error: 'nothing to undo' };
    const u = p.undo, t = p.trades[p.trades.length - 1];
    const h = p.pos[u.sym] || { qty: 0, avg: u.avgBefore || 0, id: null };
    if (u.side === 'buy') {
      const q = h.qty - u.qty;
      if (q < -1e-12) return { error: 'nothing to undo' };
      h.avg = q > 1e-12 ? (h.qty * h.avg - u.gross - u.fee) / q : 0; h.qty = q; p.cash += u.gross + u.fee;
      if (h.qty <= 1e-12) delete p.pos[u.sym]; else p.pos[u.sym] = h;
    } else {
      if (p.cash < u.gross - u.fee - 1e-6) return { error: 'nothing to undo' };
      p.cash -= u.gross - u.fee; h.qty += u.qty; h.avg = u.avgBefore || h.avg; p.pos[u.sym] = h;
    }
    p.trades = p.trades.slice(0, -1); delete p.undo;
    await save(env, p);
    return { ok: true, undone: t };
  });
}

// for Claude: get_paper
export async function paperFacts(env) {
  const s = await status(env); if (s.error) return s;
  return { started: new Date(s.p.start).toISOString().slice(0, 10), start_cash_usd: s.p.startCash, value_usd: r2(s.value), cash_usd: r2(s.p.cash), profit_usd: r2(s.profit), profit_pct: r2(s.profitPct),
    same_money_in_btc_usd: r2(s.hodl), vs_btc_pts: r2(s.vsBtcPts), coins: s.coins.map(c => ({ coin: c.sym, amount: r8(c.qty), avg_usd: r8(c.avg), price_usd: r8(c.price), value_usd: r2(c.value), profit_pct: r2(c.pnl_pct) })),
    last_trades: (s.p.trades || []).slice(-5).map(t => ({ when: new Date(t.t).toISOString(), side: t.side, coin: t.sym, amount: t.qty, price_usd: t.price, realized_usd: t.realized })), fee_pct: FEE * 100 };
}

// /paper
const PW = {
  en: { title: '🧪 <b>Paper trading</b>', sub: 'pretend money · real prices', value: 'Value', cash: 'Cash', profit: 'Profit', btc: 'Same money in BTC', beat: 'vs BTC', since: 'since', none: 'No coins yet — write e.g. <i>paper buy 0.05 BTC</i> or <i>paper buy SOL for $500</i>.',
    last: 'Last', undo: '↩️ Undo last', restart: '🔁 Start again', back: '⬅️ Menu', refresh: '🔄', fee: 'fee 0.1% / trade', pick: 'Start again with how much pretend cash? (the current paper portfolio is cleared)', undone: '↩️ Undone', nothing: 'Nothing to undo' },
  ar: { title: '🧪 <b>التداول التجريبي</b>', sub: 'فلوس وهمية · أسعار حقيقية', value: 'القيمة', cash: 'الكاش', profit: 'الربح', btc: 'نفس الفلوس في BTC', beat: 'مقابل BTC', since: 'من', none: 'مفيش عملات لسه — اكتب مثلاً <i>تجريبي اشتري 0.05 BTC</i> أو <i>تجريبي اشتري SOL بـ 500 دولار</i>.',
    last: 'آخر صفقة', undo: '↩️ تراجع', restart: '🔁 ابدأ من جديد', back: '⬅️ القائمة', refresh: '🔄', fee: 'رسوم 0.1% للصفقة', pick: 'تبدأ من جديد بكام فلوس وهمية؟ (المحفظة التجريبية الحالية هتتمسح)', undone: '↩️ اتلغت', nothing: 'مفيش حاجة تتلغي' },
};
export const paperWords = PW;
export async function viewPaper(env, lang = 'en') {
  const w = PW[lang] || PW.en, s = await status(env);
  if (s.error) return { text: '⚠️ ' + esc(s.error), buttons: [[{ text: w.back, callback_data: 'menu' }]] };
  const { p } = s, L = [`${w.title} · <i>${w.sub}</i>`, `<i>${w.since} ${esc(local(p.start, { day: 'numeric', month: 'short', year: 'numeric' }))} · ${usd(p.startCash)}</i>`, '',
    `💼 ${w.value}: <b>${usd2(s.value)}</b>`, `💵 ${w.cash}: ${usd2(p.cash)}`, `${dot(s.profit)} ${w.profit}: <b>${s.profit >= 0 ? '+' : '−'}${usd2(Math.abs(s.profit))}</b> (${pct(s.profitPct)})`];
  if (s.hodl) L.push(`🟠 ${w.btc}: ${usd2(s.hodl)} · ${w.beat} <b>${s.vsBtcPts >= 0 ? '+' : '−'}${Math.abs(s.vsBtcPts).toFixed(1)}</b> pts`);
  L.push('');
  if (!s.coins.length) L.push(w.none);
  for (const c of s.coins.slice(0, 12)) L.push(`<code>${esc(c.sym.padEnd(6))}</code> ${amt(c.qty)} · ${usd2(c.value)} · ${dot(c.pnl_pct)} ${pct(c.pnl_pct, 1)}`);
  const t = (p.trades || []).slice(-1)[0];
  if (t) L.push('', `<i>${w.last}: ${t.side === 'buy' ? '🟢' : '🔴'} ${t.side} ${amt(t.qty)} ${esc(t.sym)} @ ${money(t.price)} · ${esc(local(t.t, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }))}</i>`);
  L.push(`<i>${w.fee}</i>`);
  const b = [[{ text: w.refresh, callback_data: 'pp' }, ...(p.undo ? [{ text: w.undo, callback_data: 'pp:undo' }] : []), { text: w.restart, callback_data: 'pp:new' }], [{ text: w.back, callback_data: 'menu' }]];
  return { text: L.join('\n'), buttons: b };
}
export function viewRestart(lang = 'en') {
  const w = PW[lang] || PW.en;
  return { text: '🔁 ' + w.pick, buttons: [[{ text: '$1,000', callback_data: 'pp:new:1000' }, { text: '$10,000', callback_data: 'pp:new:10000' }, { text: '$100,000', callback_data: 'pp:new:100000' }], [{ text: '✖️', callback_data: 'pp' }]] };
}
