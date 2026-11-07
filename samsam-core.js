// samsam-core.js — pure portfolio maths shared by every page (no network, no storage).
//
// MODEL
//   Each coin has an `opening` position {qty, avg} plus a ledger of immutable
//   transactions. Holdings are never stored — they are always re-computed by
//   replaying the ledger, so two devices can never disagree about a balance and
//   deleting a transaction always gives the correct result.
//
//   tx.type:
//     'buy'    qty, price         → avg = (qty*avg + q*p) / (qty+q)
//     'sell'   qty, price, feeUsd? → qty -= q, avg unchanged, realised P&L = (p-avg)*q − feeUsd
//     'adjust' setQty?, setAvg?   → manual correction (inline edits, re-adding a coin)
//     'transfer_in'  qty, price, fee → coins arrive from outside: qty += q − fee,
//                                      cost += q × price (fee raises the average), no P&L
//     'transfer_out' qty, fee        → coins leave: qty −= q + fee, avg unchanged, no P&L
//   fee is in coin units (network fee).

export const EPS = 1e-12;

function num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }

// Deterministic order: trade date, then creation time, then id.
export function txSortKey(t) { return [String(t.date || ''), String(t.createdAt || ''), String(t.id || '')]; }
export function compareTx(a, b) {
  const ka = txSortKey(a), kb = txSortKey(b);
  for (let i = 0; i < 3; i++) { if (ka[i] < kb[i]) return -1; if (ka[i] > kb[i]) return 1; }
  return 0;
}

// Apply one transaction to a position. Returns {qty, avg, realized, sellQty, sellFee}.
export function applyTx(pos, t) {
  let qty = pos.qty, avg = pos.avg, realized = 0, sellQty = 0, sellFee = 0;
  const q = num(t.qty), p = num(t.price);
  if (t.type === 'buy') {
    if (q > 0) {
      // Average Cost Basis: cost = Σ(buy price × buy amount) + Σ(buying fees in USD)
      const nq = qty + q, feeUsd = Math.max(0, num(t.feeUsd));
      avg = nq > EPS ? (qty * avg + q * p + feeUsd) / nq : 0;
      qty = nq;
    }
  } else if (t.type === 'sell') {
    // Realized = (Sell Price − Avg Buy Price) × Amount Sold − Selling Fee (USD)
    sellQty = Math.min(q, Math.max(qty, 0));
    sellFee = Math.max(0, num(t.feeUsd));
    realized = (p - avg) * sellQty - sellFee;
    qty = Math.max(0, qty - q);
    if (qty < EPS) qty = 0;
  } else if (t.type === 'transfer_in') {
    const f = Math.max(0, num(t.fee)), net = q - f;
    if (net > 0) {
      const nq = qty + net;
      avg = nq > EPS ? (qty * avg + q * p) / nq : 0;
      qty = nq;
    }
  } else if (t.type === 'transfer_out') {
    const f = Math.max(0, num(t.fee));
    qty = Math.max(0, qty - q - f);
    if (qty < EPS) qty = 0;
  } else if (t.type === 'adjust') {
    if (t.setQty !== undefined && t.setQty !== null) qty = Math.max(0, num(t.setQty, qty));
    if (t.setAvg !== undefined && t.setAvg !== null) avg = Math.max(0, num(t.setAvg, avg));
  }
  return { qty, avg, realized, sellQty, sellFee };
}

// Replay a coin's ledger from its opening position.
export function replay(opening, txs) {
  let pos = { qty: Math.max(0, num(opening && opening.qty)), avg: Math.max(0, num(opening && opening.avg)) };
  let realized = 0, sellCount = 0, sellFees = 0, soldCost = 0;   // soldCost = what the sold coins had cost (Σ amount sold × avg then)
  const perTx = {}; // id → { realized, avgBefore, qtyAfter }
  const sorted = [...(txs || [])].sort(compareTx);
  for (const t of sorted) {
    const avgBefore = pos.avg;
    const r = applyTx(pos, t);
    pos = { qty: r.qty, avg: r.avg };
    if (t.type === 'sell') { realized += r.realized; sellCount++; sellFees += r.sellFee; soldCost += r.sellQty * avgBefore; }
    perTx[t.id] = { realized: t.type === 'sell' ? r.realized : null, avgBefore, qtyAfter: pos.qty };
  }
  return { qty: pos.qty, avg: pos.avg, realized, sellCount, sellFees, soldCost, perTx };
}

export function groupTxBySym(txs) {
  const m = new Map();
  for (const t of txs || []) { if (!m.has(t.sym)) m.set(t.sym, []); m.get(t.sym).push(t); }
  return m;
}

// Build the coin list every page renders. Shape matches the legacy `portfolio` objects.
//   coins:   array of coin docs {sym, name, cat, cgId, logoUrl, notes, opening, removed, isCustom, order, lastPrice}
//   prices:  {SYM: {usd, ch24, t}} (device-local live price cache)
export function derivePortfolio(coins, txs, prices = {}, fallbackPrices = {}) {
  const bySym = groupTxBySym(txs);
  return (coins || [])
    .filter(c => c && c.sym && !c.removed)
    .sort((a, b) => num(a.order, 1e9) - num(b.order, 1e9) || String(a.sym).localeCompare(String(b.sym)))
    .map(c => {
      const r = replay(c.opening, bySym.get(c.sym) || []);
      const pr = prices[c.sym];
      const currentPrice = (pr && pr.usd > 0) ? pr.usd
        : (num(c.lastPrice) > 0 ? num(c.lastPrice) : (num(fallbackPrices[c.sym]) > 0 ? num(fallbackPrices[c.sym]) : r.avg));
      return {
        sym: c.sym,
        name: c.name || undefined,
        cat: c.cat || 'other',
        catLocked: !!c.catLocked,
        catLabel: c.catLabel || undefined,
        cgId: c.cgId || undefined,
        ccSlug: c.ccSlug || undefined,
        cmcSlug: c.cmcSlug || undefined,
        logoUrl: c.logoUrl || undefined,
        notes: c.notes || '',
        isCustom: !!c.isCustom,
        qty: r.qty,
        basePrice: r.avg,
        walletValue: r.qty * r.avg,
        currentPrice,
        change24h: pr && pr.ch24 != null ? pr.ch24 : undefined,
        action: 'hold',
        lastUpdate: pr && pr.t ? new Date(pr.t).toISOString().slice(0, 10) : (c.lastUpdate || ''),
      };
    });
}

// Realised P&L across the whole ledger (including coins later removed).
export function realizedPnl(coins, txs) {
  const bySym = groupTxBySym(txs);
  const openBySym = new Map((coins || []).map(c => [c.sym, c.opening]));
  let total = 0, sellCount = 0, sellFees = 0, soldCost = 0;
  const perTx = {}, bySymTotal = {};
  for (const [sym, list] of bySym) {
    const r = replay(openBySym.get(sym) || { qty: 0, avg: 0 }, list);
    total += r.realized; sellCount += r.sellCount; sellFees += r.sellFees; soldCost += r.soldCost;
    bySymTotal[sym] = { realized: r.realized, sellCount: r.sellCount, sellFees: r.sellFees, soldCost: r.soldCost };
    Object.assign(perTx, r.perTx);
  }
  return { total, sellCount, sellFees, soldCost, perTx, bySym: bySymTotal };
}

// ── Profit over time (for the Portfolio vs BTC charts) ─────────────────────────
// Walks the ledger in time order. At each moment t:
//   Cost Basis(t), Realized(t)       — same maths as the All Time Profit card
//   Net invested N(t) = Cost Basis(t) − Realized(t)  = buying costs + fees − selling proceeds
//   BTC benchmark: every change in N (a buy, a sell, a transfer, a coin removed) is treated as buying or selling
//   BTC at that moment's price instead — "what if this money had gone into Bitcoin".
// Coins removed from the portfolio stop counting from the moment they were removed.
export function profitSeries(coins, txs, times, { btcAt = null, startBtc = 0 } = {}) {
  const ts = (times || []).map(Number);
  const order = ts.map((t, i) => i).sort((a, b) => ts[a] - ts[b]);
  const pos = new Map(), removedAt = new Map();
  for (const c of coins || []) {
    pos.set(c.sym, { qty: Math.max(0, num(c.opening && c.opening.qty)), avg: Math.max(0, num(c.opening && c.opening.avg)) });
    if (c.removed && c.removedAt) { const r = Date.parse(c.removedAt); if (r) removedAt.set(c.sym, r); }
  }
  // one time line: transactions, removals, and the moments we need numbers for
  const ev = [];
  for (const x of [...(txs || [])].sort(compareTx)) ev.push({ t: Date.parse(x.date) || 0, k: 0, x });
  for (const [sym, t] of removedAt) ev.push({ t, k: 1, sym });
  order.forEach(i => ev.push({ t: ts[i], k: 2, i }));
  ev.sort((a, b) => a.t - b.t || a.k - b.k);
  const gone = new Set();
  let realized = 0;
  const costNow = () => { let c = 0; for (const [sym, p] of pos) if (!gone.has(sym)) c += p.qty * p.avg; return c; };
  const price = t => { const b = btcAt ? btcAt(t) : 0; return b > 0 ? b : startBtc; };
  // What you held at the start: your BTC is BTC; every other coin's cost is counted as BTC bought on the start day.
  let N = costNow(), shadow = 0;
  for (const [sym, p] of pos) shadow += sym === 'BTC' ? p.qty : (startBtc > 0 ? p.qty * p.avg / startBtc : 0);
  const cost = new Array(ts.length).fill(0), realizedArr = new Array(ts.length).fill(0), invested = new Array(ts.length).fill(0), btcQty = new Array(ts.length).fill(0);
  for (const e of ev) {
    if (e.k === 0) {
      const x = e.x, p = pos.get(x.sym) || { qty: 0, avg: 0 };
      if (x.sym === 'BTC') e.btcBefore = p.qty;
      const r = applyTx(p, x); pos.set(x.sym, { qty: r.qty, avg: r.avg });
      if (x.type === 'sell') realized += r.realized;
    } else if (e.k === 1) gone.add(e.sym);
    if (e.k !== 2) {
      const n2 = costNow() - realized, dN = n2 - N; N = n2;
      if (e.k === 0 && e.x.sym === 'BTC') shadow += (pos.get('BTC') || { qty: 0 }).qty - (e.btcBefore || 0);   // real BTC moved
      else if (e.k === 1 && e.sym === 'BTC') shadow -= (pos.get('BTC') || { qty: 0 }).qty;
      else { const bp = price(e.t); if (dN && bp > 0) shadow += dN / bp; }
      continue;
    }
    cost[e.i] = costNow(); realizedArr[e.i] = realized; invested[e.i] = N; btcQty[e.i] = shadow;
  }
  return { cost, realized: realizedArr, invested, btcQty };
}

// Chart lines ("Performance, cumulative") from the saved points {t, v (portfolio value), b (BTC price)}:
//   Blue   — All Time Profit %   = (Value − Net invested) ÷ Cost Basis
//            (Value − Net invested = holdings × price + selling proceeds − buying costs − fees)
//   Orange — BTC Trend %         = (BTC benchmark value − Net invested) ÷ Cost Basis
//            the same money, bought and sold as BTC at the same moments — so both lines move on the same scale.
// The range tabs only zoom in; the last point is "now".
export function perfChartSeries(snaps, coins, txs, { baselineBtc = 0 } = {}) {
  const pts = (snaps || []).filter(s => s && s.v > 0).sort((a, b) => a.t - b.t);
  if (!pts.length) return { port: [], btc: [], profit: [], cost: [], first: null, last: null };
  const withB = pts.filter(s => s.b > 0);
  const btcAt = btcPriceLookup(pts);
  const startBtc = baselineBtc > 0 ? baselineBtc : (withB[0] ? withB[0].b : 0);
  const { cost, realized, invested, btcQty } = profitSeries(coins, txs, pts.map(s => s.t), { btcAt, startBtc });
  const profit = pts.map((s, i) => s.v - cost[i] + realized[i]);
  const port = pts.map((s, i) => ({ t: s.t, v: cost[i] > 0 ? profit[i] / cost[i] * 100 : 0 }));
  const btcProfit = pts.map((s, i) => (s.b > 0 ? btcQty[i] * s.b : invested[i]) - invested[i]);
  const btc = pts.map((s, i) => ({ t: s.t, v: cost[i] > 0 ? btcProfit[i] / cost[i] * 100 : 0 }));
  // A single saved point taken while prices were still loading (one coin missing or at a stale price) shows as a lone
  // spike that the next point undoes. Leave such isolated outliers out so the scale follows the real trend.
  const keep = port.map((p, i) => {
    if (i === 0 || i === port.length - 1) return true;
    const a = port[i - 1].v, b = port[i + 1].v, d1 = p.v - a, d2 = p.v - b;
    return !(Math.abs(b - a) < 3 && Math.abs(d1) > 10 && Math.abs(d2) > 10 && Math.sign(d1) === Math.sign(d2));
  });
  const f = arr => arr.filter((_, i) => keep[i]);
  return { port: f(port), btc: f(btc), profit: f(profit), btcProfit: f(btcProfit), cost: f(cost), dropped: keep.filter(k => !k).length, first: pts[0], last: pts[pts.length - 1] };
}

// ── Portfolio vs BTC, per coin ────────────────────────────────────────────────
// "Did this coin do better than the same money in Bitcoin?"
//   Every buy of the coin is replayed as buying BTC for the same dollars at that moment; every sell as selling BTC
//   for the same proceeds. Coins you already held on the baseline date count as BTC bought on that day at the
//   BTC reference price. Your BTC itself is compared with itself, so BTC always shows 0.
//   Portfolio vs BTC % = (coin value now − value of that BTC now) ÷ Cost Basis × 100
//   (= the coin's All Time Profit % minus the same money's profit % in BTC)
export function vsBtcByCoin(coins, txs, { prices = {}, btcNow = 0, btcAt = null, baselineBtc = 0 } = {}) {
  const out = {};
  const bySym = groupTxBySym(txs);
  for (const c of coins || []) {
    if (!c || !c.sym || c.removed) continue;
    let pos = { qty: Math.max(0, num(c.opening && c.opening.qty)), avg: Math.max(0, num(c.opening && c.opening.avg)) };
    let realized = 0, shadow = c.sym === 'BTC' ? pos.qty : (baselineBtc > 0 ? pos.qty * pos.avg / baselineBtc : 0);
    let N = pos.qty * pos.avg;
    for (const x of [...(bySym.get(c.sym) || [])].sort(compareTx)) {
      const before = pos.qty, r = applyTx(pos, x); pos = { qty: r.qty, avg: r.avg };
      if (x.type === 'sell') realized += r.realized;
      const n2 = pos.qty * pos.avg - realized, dN = n2 - N; N = n2;
      if (c.sym === 'BTC') { shadow += pos.qty - before; continue; }
      const t = Date.parse(x.date) || 0, bp = (btcAt && btcAt(t)) || baselineBtc;
      if (dN && bp > 0) shadow += dN / bp;
    }
    const cost = pos.qty * pos.avg, price = num(prices[c.sym]), value = pos.qty * price;
    if (!(cost > 0) || !(price > 0) || !(btcNow > 0)) { out[c.sym] = null; continue; }
    const coinProfit = value - cost + realized, btcProfit = shadow * btcNow - N;
    const coinPct = coinProfit / cost * 100, btcPct = btcProfit / cost * 100;
    out[c.sym] = { pct: coinPct - btcPct, coinPct, btcPct };
  }
  return out;
}
// Nearest saved BTC price to a moment (from the chart points), for replaying buys as BTC.
export function btcPriceLookup(snaps) {
  const w = (snaps || []).filter(s => s && s.b > 0).sort((a, b) => a.t - b.t);
  return t => {
    if (!w.length) return 0;
    let lo = 0, hi = w.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (w[m].t < t) lo = m + 1; else hi = m; }
    const a = w[Math.max(0, lo - 1)], b = w[lo];
    return Math.abs(a.t - t) <= Math.abs(b.t - t) ? a.b : b.b;
  };
}

// ── Signal (Hold / Reinforce / Sell / Convert) ────────────────────────────────
// Classic: the coin's price vs your Avg. Buy Price — at or under `reinforce` % → Reinforce, under `sell` % → Sell / Convert.
// Smart (on by default): the classic signal checked against how the coin did vs BTC over 30 and 90 days
// (rs = { d30, d90 } = the coin's % change minus BTC's, in points). It only stops two kinds of wrong signal:
//   Reinforce on a coin that keeps losing to BTC (behind by WEAK points or more on both)  → Hold, don't add to it
//   Sell / Convert on a coin that is beating BTC on both                                    → Hold, it's the market's dip
// Without 30 / 90-day data for the coin, the classic signal stands.
export const SMART_WEAK = 15;
export function signalFor({ sym, chg, rules, rs = null, smart = true }) {
  const r = rules || { reinforce: -5, sell: -20 };
  const base = sym === 'BTC' ? 'hold' : chg < r.sell ? 'convert' : chg <= r.reinforce ? 'reinforce' : 'hold';
  const ok = smart && sym !== 'BTC' && rs && Number.isFinite(rs.d30) && Number.isFinite(rs.d90);
  if (!ok) return { action: base, base, why: null, rs: rs || null };
  const weak = rs.d30 <= -SMART_WEAK && rs.d90 <= -SMART_WEAK, strong = rs.d30 > 0 && rs.d90 > 0;
  if (base === 'reinforce' && weak) return { action: 'hold', base, why: 'weak', rs };
  if (base === 'convert' && strong) return { action: 'hold', base, why: 'strong', rs };
  return { action: base, base, why: base !== 'hold' && (weak || strong) ? 'confirmed' : null, rs };
}
// 30 / 90-day strength vs BTC for every coin, from the Altcoin Season file (m/alt.json: top 100 + the app's other coins)
export function strengthMap(alt) {
  const out = {}, b = alt && alt.btc;
  if (!b || !Number.isFinite(b[1]) || !Number.isFinite(b[2])) return out;
  const put = (id, p) => { if (id && Array.isArray(p) && Number.isFinite(p[1]) && Number.isFinite(p[2])) out[id] = { d30: p[1] - b[1], d90: p[2] - b[2], c30: p[1], c90: p[2] }; };
  (alt.coins || []).forEach(c => put(c.id, c.p));
  Object.entries(alt.mine || {}).forEach(([id, p]) => put(id, p));
  out.__btc = { c30: b[1], c90: b[2] };
  return out;
}

// ── Target allocation & rebalancing ─────────────────────────────────────────────
// Groups = categories (Bitcoin is its own category, 'btc'). A BTC whose saved category is still the old Layer 1 (not chosen by you)
// counts as Bitcoin — the app moves it there in the cloud the next time it opens.
export function groupOf(c) {
  if (!c) return 'other';
  if (String(c.sym || '').toUpperCase() === 'BTC' && !c.catLocked && (!c.cat || c.cat === 'layer1' || c.cat === 'other')) return 'btc';
  return c.cat || 'other';
}
// values: { group: $ now }; targets: { group: { pct } } (adding up to 100); band: points a group may drift.
// cash: new money to invest. → per group: now %, target %, drift (points), full (buy + / trim − to be exactly on
// target, total unchanged) and add (how much of `cash` goes there: the furthest-below groups first, never a sale).
export function allocationPlan(values, targets, { band = 5, cash = 0 } = {}) {
  const keys = [...new Set([...Object.keys(values || {}), ...Object.keys(targets || {})])];
  const total = keys.reduce((s, k) => s + Math.max(0, num(values[k])), 0), T = total + Math.max(0, num(cash));
  const tg = k => targets && targets[k] ? num(targets[k].pct) / 100 : 0;
  const groups = keys.map(k => {
    const v = Math.max(0, num(values[k])), now = total > 0 ? v / total * 100 : 0, target = tg(k) * 100;
    return { key: k, value: v, now, target, drift: now - target, full: tg(k) * total - v, need: Math.max(0, tg(k) * T - v), add: 0,
      state: Math.abs(now - target) <= band ? 'ok' : Math.abs(now - target) <= 2 * band ? 'warn' : 'off' };
  });
  // new money: fill what each group is missing (in proportion when there isn't enough), the rest by the targets
  const money = Math.max(0, num(cash)), need = groups.reduce((s, g) => s + g.need, 0);
  if (money > 0) {
    if (need >= money) groups.forEach(g => { g.add = need > 0 ? g.need / need * money : 0; });
    else { const rest = money - need; groups.forEach(g => { g.add = g.need + tg(g.key) * rest; }); }
  }
  groups.sort((a, b) => b.target - a.target || b.value - a.value);
  const off = groups.filter(g => g.state !== 'ok' && (g.target > 0 || g.value > 0));
  return { total, groups, band, onTarget: groups.length - off.length, count: groups.length, off };
}

// ── DCA schedule: a plan coin's regular buy ─────────────────────────────────────
// s = { usd, every: 'week' | '2weeks' | 'month', day, since: 'YYYY-MM-DD' }
//   day: 0–6 (Sunday–Saturday) for 'week' / '2weeks', 1–28 for 'month'. Dates are calendar days ('YYYY-MM-DD').
// A buy of the coin from 2 days before a due date until the next one counts for that date.
const DAYMS = 864e5, dOf = d => Date.parse(d + 'T00:00:00Z'), isoD = t => new Date(t).toISOString().slice(0, 10);
export const DCA_PER_MONTH = { week: 52 / 12, '2weeks': 26 / 12, month: 1 };
export function cleanDca(s) {
  if (!s || typeof s !== 'object') return null;
  const usd = num(s.usd), every = ['week', '2weeks', 'month'].includes(s.every) ? s.every : null, day = Math.round(num(s.day, -1));
  if (!(usd > 0 && usd <= 1e9) || !every) return null;
  if (every === 'month' ? !(day >= 1 && day <= 28) : !(day >= 0 && day <= 6)) return null;
  const since = typeof s.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.since) ? s.since : isoD(Date.now());
  return { usd: Math.round(usd * 100) / 100, every, day, since };
}
// every due date from `from` to `to` (both included)
export function dcaDue(s, from, to) {
  const c = cleanDca(s); if (!c) return [];
  const out = [], a = Math.max(dOf(c.since), dOf(from)), b = dOf(to);
  if (c.every === 'month') {
    const d0 = new Date(a); let y = d0.getUTCFullYear(), m = d0.getUTCMonth();
    for (let i = 0; i < 1200; i++) { const t = Date.UTC(y, m, c.day); if (t > b) break; if (t >= a) out.push(isoD(t)); m++; if (m > 11) { m = 0; y++; } }
    return out;
  }
  let t = dOf(c.since); while (new Date(t).getUTCDay() !== c.day) t += DAYMS;   // the first one: that weekday on or after `since`
  const step = (c.every === 'week' ? 7 : 14) * DAYMS;
  if (t < a) t += Math.ceil((a - t) / step) * step;
  for (; t <= b && out.length < 2000; t += step) out.push(isoD(t));
  return out;
}
function dcaNextAfter(c, d) { const n = dcaDue(c, isoD(dOf(d) + DAYMS), isoD(dOf(d) + 40 * DAYMS)); return n[0] || null; }
// today's state for one coin: the latest due date, whether it was bought, the next one, and how many of the last 6 were kept
export function dcaStatus(s, sym, txs, today) {
  const c = cleanDca(s); if (!c) return null;
  const S = String(sym || '').toUpperCase();
  const buys = (txs || []).filter(t => t && t.type === 'buy' && String(t.sym || '').toUpperCase() === S && t.date).map(t => String(t.date).slice(0, 10)).sort();
  const boughtFor = d => { const lo = isoD(dOf(d) - 2 * DAYMS), hi = dcaNextAfter(c, d) || '9999-12-31'; return buys.some(b => b >= lo && b < hi); };
  const past = dcaDue(c, c.since, today), last = past.length ? past[past.length - 1] : null;
  const recent = past.slice(-6), kept = recent.filter(boughtFor).length;
  const done = last ? boughtFor(last) : false;
  const late = last && !done ? Math.round((dOf(today) - dOf(last)) / DAYMS) : 0;
  const next = last === today && !done ? today : dcaNextAfter(c, today);   // the coming due date (today when today is one and not bought yet)
  return { ...c, last, done, next, state: !last ? 'upcoming' : done ? 'done' : late === 0 ? 'today' : 'missed', late, kept, of: recent.length, perMonth: c.usd * DCA_PER_MONTH[c.every] };
}

// ── Accumulation plan: Overall Progress ──────────────────────────────────────
// Average of each coin's own completion, capped at 100%: a coin past its target counts as 100% and its extra
// amount never makes up for coins still below target. Only coins with a target above 0 count.
//   rows: [{ actual, target }]  →  { pct, counted, completed }
export function overallProgress(rows) {
  const valid = (rows || []).filter(r => num(r && r.target) > 0);
  if (!valid.length) return { pct: 0, counted: 0, completed: 0 };
  const each = valid.map(r => Math.min(Math.max(num(r.actual), 0) / num(r.target), 1));
  return { pct: each.reduce((a, b) => a + b, 0) / valid.length * 100, counted: valid.length, completed: each.filter(x => x >= 1).length };
}

// ── Migration helper ────────────────────────────────────────────────────────
// Given a coin's CURRENT saved position and its transaction history, work out the
// opening position that, replayed forward, reproduces the current one. The old app
// applied buys/sells with the same formulas, so stepping backwards is exact. If
// manual edits happened in between (so no exact opening exists), we return an
// `adjust` that pins the result to exactly what the user saw before migrating.
export function deriveOpening(current, txs) {
  const curQty = Math.max(0, num(current.qty)), curAvg = Math.max(0, num(current.avg));
  const sorted = [...(txs || [])].sort(compareTx);
  let qty = curQty, avg = curAvg, ok = true;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i], q = num(t.qty), p = num(t.price);
    if (t.type === 'buy') {
      const pq = qty - q;
      if (pq < -1e-9 * Math.max(1, q)) { ok = false; qty = 0; avg = 0; continue; }
      if (pq <= 1e-9 * Math.max(1, q)) { qty = 0; avg = 0; continue; }
      const pa = (qty * avg - q * p) / pq;
      if (!(pa >= -1e-9)) { ok = false; }
      qty = pq; avg = Math.max(0, pa);
    } else if (t.type === 'sell') {
      qty = qty + q;
    } else if (t.type === 'transfer_out') {
      qty = qty + q + Math.max(0, num(t.fee));
    } else if (t.type === 'transfer_in') {
      const net = q - Math.max(0, num(t.fee)), pq = qty - net;
      if (pq <= 1e-9 * Math.max(1, net)) { if (pq < -1e-9 * Math.max(1, net)) ok = false; qty = 0; avg = 0; continue; }
      const pa = (qty * avg - q * p) / pq;
      if (!(pa >= -1e-9)) ok = false;
      qty = pq; avg = Math.max(0, pa);
    }
  }
  const opening = { qty: Math.max(0, qty), avg: Math.max(0, avg) };
  const fwd = replay(opening, sorted);
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const exact = ok && close(fwd.qty, curQty) && close(fwd.avg, curAvg);
  return { opening, exact, needAdjust: !exact, current: { qty: curQty, avg: curAvg } };
}

// ── Snapshot buckets (performance + holdings charts) ────────────────────────
export const HOUR = 3600e3, FIVE_MIN = 300e3;
export function dayId(t) { return new Date(t).toISOString().slice(0, 10); }
export function bucket(t, size) { return Math.floor(t / size) * size; }

// snapDocs: [{id:'YYYY-MM-DD', p:{key:{t,v,b}}, h:{key:{t,v}}}]
export function flattenSnaps(snapDocs) {
  const perf = [], holdings = [];
  for (const d of snapDocs || []) {
    for (const s of Object.values(d.p || {})) if (s && num(s.t) > 0) perf.push({ t: num(s.t), v: num(s.v), b: num(s.b) });
    for (const s of Object.values(d.h || {})) if (s && num(s.t) > 0) holdings.push({ t: num(s.t), v: num(s.v) });
  }
  perf.sort((a, b) => a.t - b.t); holdings.sort((a, b) => a.t - b.t);
  return { perf: perf.slice(-2160), holdings: holdings.slice(-4000) };
}

// A saved chart point that jumps away from both of its neighbours while they agree with each other is a bad
// reading (e.g. saved by a device that had no live price yet for some coin) — not a market move. Real moves and
// money added / taken out show as steps, which this keeps. `endValue` (the live total) stands in as the last
// point's right-hand neighbour.
export function dropSpikes(points, endValue, jump = 0.05) {
  const pts = points || [], out = [];
  const off = (a, b) => (b > 0 ? Math.abs(a / b - 1) : 0);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], prev = out[out.length - 1];
    const nextV = i + 1 < pts.length ? pts[i + 1].v : num(endValue);
    // away from both neighbours, on the same side, and the neighbours much closer to each other than to it
    if (prev && prev.v > 0 && nextV > 0 && p.v > 0 && off(p.v, prev.v) > jump && off(p.v, nextV) > jump &&
        Math.sign(p.v - prev.v) === Math.sign(p.v - nextV) && Math.abs(nextV - prev.v) < Math.abs(p.v - prev.v) / 2) continue;
    out.push(p);
  }
  return out;
}

// ── Chart history rebuilt from the ledger and real historical prices (like CoinMarketCap) ─────────────
// Value at each moment t = Σ (amount of each coin held at t, replayed from its opening + transactions)
//                          × (that coin's market price at t, from its hourly price history).
// series: { SYM: [[t, usd], …] sorted by t } — the price at t is the last one at or before t (the first one if t is
// earlier). A coin with no history is valued at `fallback[SYM]` (its manual / last price).
// A coin removed the old way (no closing transfer) stops counting when it was removed.
// Returns points shaped like recorded chart points: { t, v } plus b = BTC price at t (for the BTC benchmark).
export function priceAt(list, t) {
  if (!list || !list.length) return 0;
  let lo = 0, hi = list.length - 1;
  if (t <= list[0][0]) return list[0][1];
  if (t >= list[hi][0]) return list[hi][1];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (list[m][0] <= t) lo = m; else hi = m; }
  return list[lo][1];
}
export function historyPoints(coins, txs, series, times, fallback = {}) {
  const pos = new Map(), removedAt = new Map();
  for (const c of coins || []) {
    pos.set(c.sym, { qty: Math.max(0, num(c.opening && c.opening.qty)), avg: Math.max(0, num(c.opening && c.opening.avg)) });
    if (c.removed && c.removedAt) { const r = Date.parse(c.removedAt); if (r) removedAt.set(c.sym, r); }
  }
  const sorted = [...(txs || [])].sort(compareTx);
  const ts = [...(times || [])].map(Number).sort((a, b) => a - b);
  const out = [];
  let k = 0;
  for (const t of ts) {
    while (k < sorted.length && (Date.parse(sorted[k].date) || 0) <= t) {
      const x = sorted[k++], p = pos.get(x.sym) || { qty: 0, avg: 0 };
      const r = applyTx(p, x); pos.set(x.sym, { qty: r.qty, avg: r.avg });
    }
    let v = 0;
    for (const [sym, p] of pos) {
      if (!(p.qty > 0)) continue;
      const ra = removedAt.get(sym); if (ra && t >= ra) continue;
      const px = series[sym] && series[sym].length ? priceAt(series[sym], t) : num(fallback[sym]);
      v += p.qty * px;
    }
    out.push({ t, v, b: priceAt(series.BTC, t) });
  }
  return out;
}

export function newId(prefix) {
  const r = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now()}_${r}`;
}
