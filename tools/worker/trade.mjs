// tools/worker/trade.mjs — record a trade in words (phase 4): "bought 0.01 BTC at 95k" → a summary → [✅ Confirm] [❌ Cancel].
//
// Nothing is saved until you tap Confirm. Claude's tool record_trade only PREPARES the trade: it checks it (a coin you hold,
// enough to sell, a price, a date that isn't in the future) and works out what your portfolio would look like with the app's
// own maths (the same summarize the rest of the bot uses, with the new transaction added). The bot then shows that summary
// (its own words, not Claude's) with the buttons; Confirm writes the transaction(s) to Firestore in ONE all-or-nothing step,
// exactly as the app's "Add transaction" does (samsam-cloud.js → txDoc / buyFromStable / sellToStable): a Buy paid with a
// stablecoin also writes the stablecoin going out at $1 (kind 'pay'); a Sell into a stablecoin also writes its Buy at $1.
// A prepared trade waits 15 minutes (KV tg:tx:<id>), then it is gone.

import { chatOf } from './who.mjs';
import { summarize, isStable, local, usd, usd2, esc } from '../alerts-core.mjs';
import { loadUser, loadMarket, coinsOf, withIds, commitDocs } from './data.mjs';

const TTL = 15 * 60e3;
const mem = new Map();
async function kvGet(env, k) { try { if (env.RATE) return await env.RATE.get(k); } catch (_) {} return mem.has(k) ? mem.get(k) : null; }
async function kvPut(env, k, v) { mem.set(k, v); try { if (env.RATE) await env.RATE.put(k, v, { expirationTtl: 3600 }); } catch (_) {} }
async function kvDel(env, k) { mem.delete(k); try { if (env.RATE) await env.RATE.delete(k); } catch (_) {} }

const r6 = v => v == null || !isFinite(v) ? null : +Number(v).toPrecision(6);
const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
const cleanSym = v => String(v == null ? '' : v).toUpperCase().replace(/^\$/, '').replace(/[^A-Z0-9._-]/g, '').slice(0, 20);
const newId = () => 'tx_' + Date.now() + '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);   // the app's Core.newId('tx_')
// money in a trade summary: cents shown ($153.33, $77,000.00); a small price keeps its digits ($0.06855)
export const money = v => v == null || !isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? usd(v) : Math.abs(v) >= 1 || v === 0 ? usd2(v) : (v < 0 ? '−' : '') + '$' + (+Math.abs(v).toPrecision(4));
const amt = q => (+Number(q).toPrecision(8)).toLocaleString('en-US', { maximumFractionDigits: 8 });

// the app's txDoc (samsam-cloud.js) — the same fields, device = 'telegram-bot'
function txDoc(sym, type, qty, price, note, extra = {}) {
  const now = new Date().toISOString();
  return JSON.parse(JSON.stringify({
    sym, type, qty: +qty || 0, price: +price || 0, total: (+qty || 0) * (+price || 0),
    date: extra.date || now, createdAt: now, note: String(note || '').slice(0, 500), device: 'telegram-bot',
    ...(extra.feeUsd > 0 ? { feeUsd: +extra.feeUsd } : {}),
    ...(extra.link ? { link: String(extra.link).slice(0, 60) } : {}),
    ...(type === 'sell' && extra.kind === 'pay' ? { kind: 'pay' } : {}),
  }));
}

// "2026-11-10", "2026-11-10T14:00", an ISO time → ISO; none → now. Never in the future, never before 2009.
function when(d, now) {
  if (d == null || d === '') return { iso: new Date(now).toISOString() };
  let s = String(d).trim(), t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { t = Date.parse(s + 'T12:00:00+03:00'); if (t > now && t - now < 86400e3) t = now; }   // a day only → noon Riyadh (today: now)
  else t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + '+03:00');   // no zone written → Riyadh
  if (!isFinite(t)) return { error: `date "${s}" not understood — use YYYY-MM-DD` };
  if (t > now + 5 * 60e3) return { error: 'the date is in the future' };
  if (t < Date.parse('2009-01-03')) return { error: 'the date is too early' };
  return { iso: new Date(t).toISOString() };
}

// Claude's record_trade → { ok, id, trade, after } (kept in ctx.trades for the bot to show with buttons) or { error }
// input: { side: buy|sell, coin, amount?, price_usd?, total_usd?, at_market?, fee_usd?, date?, paid_with?, received_in?, note? }
export async function prepareTrade(ctx, input) {
  const now = Date.now(), i = input || {};
  const side = String(i.side || '').toLowerCase();
  if (side !== 'buy' && side !== 'sell') return { error: 'side must be buy or sell' };
  const user = await ctx.user();
  if (!user) return { error: 'portfolio not connected — nothing can be recorded' };
  if (!user.uid) return { error: 'portfolio account not found' };
  const sym = cleanSym(i.coin);
  if (!sym) return { error: 'coin is needed (its ticker)' };
  const held = (user.coins || []).find(c => c && !c.removed && String(c.sym).toUpperCase() === sym);
  if (!held) return { error: `${sym} is not in the portfolio — add the coin in the app first (Add Coin), then record trades here` };
  const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, now);
  const row = sum.coins.find(c => c.sym === sym), have = row ? row.qty : 0, marketPrice = row && row.price > 0 ? row.price : null;

  let qty = +i.amount, price = +i.price_usd;
  const total = +i.total_usd, fee = +i.fee_usd > 0 ? +i.fee_usd : 0;
  if (!(price > 0) && i.at_market) price = marketPrice || NaN;
  if (!(price > 0) && qty > 0 && total > 0) price = total / qty;
  if (!(qty > 0) && total > 0 && price > 0) qty = total / price;
  if (!(price > 0)) return { error: i.at_market ? `no current price for ${sym}` : 'the price is missing — ask the user for the price (or the total paid), or set at_market if they said "at market price"' };
  if (!(qty > 0)) return { error: 'the amount is missing — ask the user how much (coins, or the total in USD)' };
  if (!isFinite(qty * price) || qty * price > 1e9) return { error: 'amount × price is not a sane number' };
  if (side === 'sell' && qty > have * (1 + 1e-9) + 1e-12) return { error: `only ${amt(have)} ${sym} held — can't sell ${amt(qty)}` };
  if (marketPrice && (price > marketPrice * 5 || price < marketPrice / 5)) return { error: `price $${r6(price)} is far from today's $${r6(marketPrice)} — check the price with the user (maybe a typo or a different unit)` };
  const w = when(i.date, now); if (w.error) return { error: w.error };
  const note = String(i.note || '').slice(0, 200);

  // the stablecoin side (like the app's "paid with" / "money stays in")
  const stableSym = cleanSym(side === 'buy' ? i.paid_with : i.received_in);
  let stable = null;
  if (stableSym) {
    if (!isStable(stableSym)) return { error: `${stableSym} is not a stablecoin — only stablecoins (USDT, USDC…) can pay / receive` };
    if (stableSym === sym) return { error: 'same coin on both sides' };
    const sc = (user.coins || []).find(c => c && !c.removed && String(c.sym).toUpperCase() === stableSym);
    if (!sc) return { error: `${stableSym} is not in the portfolio — add it in the app first, or record the trade without it` };
    const sr = sum.coins.find(c => c.sym === stableSym), sHave = sr ? sr.qty : 0;
    const cost = qty * price + fee;
    if (side === 'buy' && cost > sHave * (1 + 1e-9) + 1e-9) return { error: `only ${amt(sHave)} ${stableSym} held — not enough to pay $${r2(cost)}` };
    stable = stableSym;
  }

  const id = newId(), docs = [[id, txDoc(sym, side, qty, price, note, { date: w.iso, feeUsd: fee })]];
  const t2 = new Date(Date.parse(w.iso) + 1).toISOString();
  if (stable && side === 'buy') docs.push([newId() + 'p', txDoc(stable, 'sell', qty * price + fee, 1, 'Paid for buying ' + amt(qty) + ' ' + sym, { date: t2, link: id, kind: 'pay' })]);
  if (stable && side === 'sell') { const cash = Math.max(0, qty * price - fee); if (cash > 0) docs.push([newId() + 's', txDoc(stable, 'buy', cash, 1, 'From selling ' + amt(qty) + ' ' + sym, { date: t2, link: id })]); }

  // after: the app's maths with these transactions added
  const after = summarize(withIds({ ...user, txs: [...(user.txs || []), ...docs.map(d => d[1])] }, m), m, now);
  const a = after.coins.find(c => c.sym === sym), sa = stable ? after.coins.find(c => c.sym === stable) : null;
  const trade = {
    side, sym, qty: r6(qty), price: r6(price), total: r2(qty * price), fee: fee || 0, date: w.iso, note, stable,
    held_before: r6(have), held_after: r6(a ? a.qty : 0), avg_before: row ? r6(row.avg) : null, avg_after: a ? r6(a.avg) : null,
    realized_usd: side === 'sell' && row ? r2((price - row.avg) * qty - fee) : null,
    stable_after: sa ? r6(sa.qty) : stable ? 0 : null, value_after: r2(after.value),
  };
  ctx.trades.push({ trade, docs });
  return { ok: true, prepared: trade, saved: false, note_for_you: 'NOT saved yet. The bot itself shows the full summary (amounts, average, realized profit) with ✅ Confirm / ❌ Cancel under your answer — so reply in ONE short line only (e.g. "🧾 Ready — check the summary below and tap ✅ Confirm"), plus one line only if something needs his attention. Do not repeat the numbers. Never say it was saved.' };
}

// the trades of one answer → kept 15 min under one id (the buttons carry it)
export async function keepTrades(env, trades, lang = 'en') {
  const gid = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  await kvPut(env, 'tg:tx:' + gid, JSON.stringify({ created: Date.now(), trades, lang, chat: chatOf(env) }));   // whose trade it is
  return gid;
}

// the bot's own summary of what Confirm will save
export function tradeLines(trades, ar) {
  const L = [ar ? '🧾 <b>للحفظ — راجع واضغط تأكيد:</b>' : '🧾 <b>To save — check, then Confirm:</b>'];
  trades.forEach(({ trade: t }, n) => {
    const d = local(Date.parse(t.date), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const buy = t.side === 'buy';
    const head = `${trades.length > 1 ? (n + 1) + '. ' : ''}${buy ? '🟢' : '🔴'} `, cash = money(buy ? t.total + t.fee : Math.max(0, t.total - t.fee));
    if (ar) {   // Arabic: each line starts with an Arabic word and reads "من X لـ Y" (arrows flip in right-to-left text)
      L.push(`${head}<b>${buy ? 'شراء' : 'بيع'} ${amt(t.qty)} ${esc(t.sym)}</b> بسعر ${money(t.price)} — الإجمالي <b>${money(t.total)}</b>`);
      L.push(`   التاريخ: ${esc(d)}${t.fee ? ` · الرسوم: ${money(t.fee)}` : ''}${t.note ? ' · ' + esc(t.note) : ''}`);
      if (t.stable) L.push(`   ${buy ? 'مدفوع من' : 'الفلوس رايحة لـ'} ${esc(t.stable)}: ${buy ? '−' : '+'}${cash}`);
      L.push(`   الكمية: من ${amt(t.held_before)} لـ <b>${amt(t.held_after)}</b> ${esc(t.sym)}`);
      if (buy && t.avg_after) L.push(`   المتوسط: من ${money(t.avg_before)} لـ <b>${money(t.avg_after)}</b>`);
      if (t.realized_usd != null) L.push(`   ربح محقق: <b>${t.realized_usd >= 0 ? '+' : '−'}${money(Math.abs(t.realized_usd))}</b>`);
      return;
    }
    L.push(`${head}<b>${buy ? 'Buy' : 'Sell'} ${amt(t.qty)} ${esc(t.sym)}</b> @ ${money(t.price)} = <b>${money(t.total)}</b>`);
    L.push(`   ${esc(d)}${t.fee ? ` · fee ${money(t.fee)}` : ''}${t.note ? ' · ' + esc(t.note) : ''}`);
    if (t.stable) L.push(`   ${buy ? 'paid with' : 'into'} ${esc(t.stable)} ${buy ? '−' : '+'}${cash}`);
    L.push(`   ${esc(t.sym)} ${amt(t.held_before)} → <b>${amt(t.held_after)}</b>`);
    if (buy && t.avg_after) L.push(`   avg ${money(t.avg_before)} → <b>${money(t.avg_after)}</b>`);
    if (t.realized_usd != null) L.push(`   Realized: <b>${t.realized_usd >= 0 ? '+' : '−'}${money(Math.abs(t.realized_usd))}</b>`);
  });
  return L.join('\n');
}

// ✅ Confirm → the transactions written (all or nothing); ❌ Cancel → forgotten
export async function confirmTrades(env, gid) {
  const raw = await kvGet(env, 'tg:tx:' + gid);
  if (!raw) return { error: 'gone' };
  const g = JSON.parse(raw), lang = g.lang;
  if (g.chat && g.chat !== chatOf(env)) return { error: 'gone' };   // another person's trade: never
  await kvDel(env, 'tg:tx:' + gid);   // first: a second tap can never save twice
  if (Date.now() - g.created > TTL) return { error: 'expired', lang };
  const user = await loadUser(env, true);
  if (!user || !user.uid) return { error: 'nouser', lang };
  // still true now? (a sell needs the coins; the coin still in the portfolio)
  const m = await loadMarket([], coinsOf(user)), sum = summarize(withIds(user, m), m, Date.now());
  for (const { trade: t } of g.trades) {
    if (!(user.coins || []).some(c => c && !c.removed && String(c.sym).toUpperCase() === t.sym)) return { error: 'changed', lang, why: t.sym + ' is no longer in the portfolio' };
    const r = sum.coins.find(c => c.sym === t.sym);
    if (t.side === 'sell' && t.qty > (r ? r.qty : 0) * (1 + 1e-9) + 1e-12) return { error: 'changed', lang, why: `only ${amt(r ? r.qty : 0)} ${t.sym} held now` };
  }
  const docs = g.trades.flatMap(x => x.docs).map(([id, data]) => ({ path: 'txs/' + id, data }));
  const ok = await commitDocs(env, user.uid, docs).catch(e => ({ error: String(e && e.message) }));
  if (ok && ok.error) { console.log(JSON.stringify({ trade: 'save-failed', message: ok.error.slice(0, 200) })); return { error: 'save', lang, why: ok.error }; }
  // the portfolio now = what was just read + the saved transactions (no second read: it could run out of calls)
  const s2 = summarize(withIds({ ...user, txs: [...(user.txs || []), ...docs.map(d => d.data)] }, m), m, Date.now());
  return { ok: true, lang: g.lang, trades: g.trades.map(x => x.trade), holdings: s2 ? g.trades.map(({ trade: t }) => { const c = s2.coins.find(z => z.sym === t.sym); return { sym: t.sym, qty: c ? c.qty : 0, avg: c ? c.avg : null }; }) : [] };
}
// → the trade's language when it was waiting, false when it was already saved / cancelled
export async function cancelTrades(env, gid) { const raw = await kvGet(env, 'tg:tx:' + gid); if (!raw) return false; try { const g0 = JSON.parse(raw); if (g0.chat && g0.chat !== chatOf(env)) return false; } catch (_) {} await kvDel(env, 'tg:tx:' + gid); try { return JSON.parse(raw).lang || 'en'; } catch (_) { return 'en'; } }
