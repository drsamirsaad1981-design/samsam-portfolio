// samsam-core.js — pure portfolio maths shared by every page (no network, no storage).
//
// MODEL
//   Each coin has an `opening` position {qty, avg} plus a ledger of immutable
//   transactions. Holdings are never stored — they are always re-computed by
//   replaying the ledger, so two devices can never disagree about a balance and
//   deleting a transaction always gives the correct result.
//
//   tx.type:
//     'buy'    qty, price, feeUsd?, fee? → fee = coins that never reach you (a trading fee taken in the coin and/or the
//                                  network fee to your own wallet): qty += q − fee, cost += q*p + feeUsd (fees raise the average)
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

// Coins a buy / transfer in actually adds (after the fee in coin units); other types → their amount.
// Coins you got without buying them: Transfer In at $0 cost. kind = 'reward' (staking, marked Reward) · 'mining' (the note
// says mined / mining, e.g. imported mined BTC) · 'free' (airdrops and other $0 coins). from / to: ISO dates (to not included).
export function freeCoins(txs, from = null, to = null) {
  const out = [];
  for (const t of txs || []) {
    if (!t || t.type !== 'transfer_in' || num(t.price) > 0) continue;
    const q = netQty(t); if (!(q > 0)) continue;
    const d = String(t.date || ''); if ((from && d < from) || (to && d >= to)) continue;
    out.push({ id: t.id, sym: t.sym, date: d, qty: q, kind: t.src === 'mining' ? 'mining' : t.src === 'airdrop' ? 'free' : t.kind === 'reward' ? 'reward' : /min(ed|ing)\b/i.test(String(t.note || '')) ? 'mining' : 'free' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
// ── Automatic staking: coins staked at an APY earn every day; a Reward is booked once a week (and at a change / stop) ──
//   stake = { sym, qty (staked now, rewards compound into it), apy (% a year), since (ISO: earned up to here), start (ISO) }
export const STAKE_WEEK = 7 * 864e5;
export function stakeEarned(qty, apy, ms) {
  qty = num(qty); apy = num(apy); if (!(qty > 0) || !(apy > 0) || !(ms > 0)) return 0;
  return qty * (Math.pow(1 + apy / 100, ms / (365 * 864e5)) - 1);   // APY already includes compounding
}
// The Rewards due by `nowMs`: one per full week since `since` (dated at the week's end), plus the part-week when `final`
// (an edit or a stop). Each reward is added to the staked amount. The same stake and time always give the same answer,
// so two devices booking at once write the same transactions.
export function stakeBook(stake, nowMs, final = false) {
  const out = []; if (!stake) return { rewards: out, qty: 0, since: null };
  let since = Date.parse(stake.since), qty = num(stake.qty); const apy = num(stake.apy);
  if (!Number.isFinite(since)) return { rewards: out, qty, since: stake.since };
  const r10 = x => Math.round(x * 1e10) / 1e10;
  const step = to => { const q = r10(stakeEarned(qty, apy, to - since)); since = to; if (q > 0) { out.push({ date: new Date(to).toISOString(), qty: q }); qty = r10(qty + q); } };
  while (since + STAKE_WEEK <= nowMs && out.length < 600) step(since + STAKE_WEEK);
  if (final && nowMs > since) step(nowMs);
  return { rewards: out, qty, since: new Date(since).toISOString() };
}
export function netQty(t) {
  const q = num(t && t.qty);
  return t && (t.type === 'buy' || t.type === 'transfer_in') ? Math.max(0, q - Math.max(0, num(t.fee))) : q;
}

// Apply one transaction to a position. Returns {qty, avg, realized, sellQty, sellFee}.
export function applyTx(pos, t) {
  let qty = pos.qty, avg = pos.avg, realized = 0, sellQty = 0, sellFee = 0;
  const q = num(t.qty), p = num(t.price);
  if (t.type === 'buy') {
    if (q > 0) {
      // Average Cost Basis: cost = Σ(buy price × buy amount) + Σ(buying fees in USD)
      const net = q - Math.min(q, Math.max(0, num(t.fee))), nq = qty + net, feeUsd = Math.max(0, num(t.feeUsd));
      if (net > 0) { avg = nq > EPS ? (qty * avg + q * p + feeUsd) / nq : 0; qty = nq; }
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
export function profitSeries(coins, txs, times, { btcAt = null, startBtc = 0, bench = 'BTC' } = {}) {   // bench: 'BTC', or 'XAU' for the Gold Trend
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
  for (const [sym, p] of pos) shadow += sym === bench ? p.qty : (startBtc > 0 ? p.qty * p.avg / startBtc : 0);
  const cost = new Array(ts.length).fill(0), realizedArr = new Array(ts.length).fill(0), invested = new Array(ts.length).fill(0), btcQty = new Array(ts.length).fill(0);
  for (const e of ev) {
    if (e.k === 0) {
      const x = e.x, p = pos.get(x.sym) || { qty: 0, avg: 0 };
      if (x.sym === bench) e.btcBefore = p.qty;
      const r = applyTx(p, x); pos.set(x.sym, { qty: r.qty, avg: r.avg });
      if (x.type === 'sell') realized += r.realized;
    } else if (e.k === 1) gone.add(e.sym);
    if (e.k !== 2) {
      const n2 = costNow() - realized, dN = n2 - N; N = n2;
      if (e.k === 0 && e.x.sym === bench) shadow += (pos.get(bench) || { qty: 0 }).qty - (e.btcBefore || 0);   // real BTC moved
      else if (e.k === 1 && e.sym === bench) shadow -= (pos.get(bench) || { qty: 0 }).qty;
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
export function perfChartSeries(snaps, coins, txs, { baselineBtc = 0, goldAt = null, silverAt = null } = {}) {
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
  // ✨ Gold Trend: the same money bought and sold as gold (per troy ounce) at the same moments — your own gold counts as gold
  // (and the same with silver: your own silver counts as silver)
  const metalLine = (at, sym) => {
    if (!at || !(at(pts[0].t) > 0)) return [];
    const ms = profitSeries(coins, txs, pts.map(s => s.t), { btcAt: at, startBtc: at(pts[0].t), bench: sym });
    return pts.map((s, i) => { const g = at(s.t); return { t: s.t, v: cost[i] > 0 ? ((g > 0 ? ms.btcQty[i] * g : invested[i]) - invested[i]) / cost[i] * 100 : 0 }; });
  };
  const gold = metalLine(goldAt, 'XAU'), silver = metalLine(silverAt, 'XAG');
  // A single saved point taken while prices were still loading (one coin missing or at a stale price) shows as a lone
  // spike that the next point undoes. Leave such isolated outliers out so the scale follows the real trend.
  const keep = port.map((p, i) => {
    if (i === 0 || i === port.length - 1) return true;
    const a = port[i - 1].v, b = port[i + 1].v, d1 = p.v - a, d2 = p.v - b;
    return !(Math.abs(b - a) < 3 && Math.abs(d1) > 10 && Math.abs(d2) > 10 && Math.sign(d1) === Math.sign(d2));
  });
  const f = arr => arr.filter((_, i) => keep[i]);
  return { port: f(port), btc: f(btc), gold: gold.length ? f(gold) : [], silver: silver.length ? f(silver) : [], profit: f(profit), btcProfit: f(btcProfit), cost: f(cost), dropped: keep.filter(k => !k).length, first: pts[0], last: pts[pts.length - 1] };
}

// "Altcoins only" view of the same chart: the saved points with BTC, shares, gold and silver taken out of the value
// (their amount at that moment × their price then), and the coins / transactions without them — so the blue line is
// the altcoins' own profit and the Trend lines are the same altcoin money in BTC / gold / silver.
//   prices: { BTC: t → $ (default: the point's own b), XAU: t → $/oz, XAG: t → $/oz }, now: { sym: $ } as a fallback
export const ALT_EXCLUDE = ['BTC', 'XAU', 'XAG'];   // (kept for older callers; altOnly asks isAltcoin, which also takes out shares)
export function altOnly(snaps, coins, txs, { prices = {}, now = {} } = {}) {
  const sorted = [...(txs || [])].sort(compareTx);
  const track = (coins || []).filter(c => !isAltcoin(c)).map(c => {   // BTC, shares, gold / silver: taken out
    const steps = [], pos0 = { qty: Math.max(0, num(c.opening && c.opening.qty)), avg: Math.max(0, num(c.opening && c.opening.avg)) };
    let pos = pos0;
    for (const x of sorted) if (x.sym === c.sym) { const r = applyTx(pos, x); pos = { qty: r.qty, avg: r.avg }; steps.push([Date.parse(x.date) || 0, pos.qty]); }
    const gone = c.removed && c.removedAt ? Date.parse(c.removedAt) || 0 : 0;
    return { sym: c.sym, q0: pos0.qty, steps, gone };
  });
  const qtyAt = (tr, t) => { if (tr.gone && t >= tr.gone) return 0; let q = tr.q0; for (const [st, qq] of tr.steps) { if (st > t) break; q = qq; } return q; };
  const out = (snaps || []).map(s => {
    let v = s.v;
    for (const tr of track) {
      const q = qtyAt(tr, s.t); if (!(q > 0)) continue;
      const p = tr.sym === 'BTC' ? (prices.BTC ? prices.BTC(s.t) : s.b) || now.BTC || 0 : (prices[tr.sym] ? prices[tr.sym](s.t) : 0) || now[tr.sym] || 0;
      v -= q * p;
    }
    return { ...s, v: Math.max(0, v) };
  });
  const ex = new Set(track.map(t => t.sym));
  return { snaps: out, coins: (coins || []).filter(c => !ex.has(c.sym)), txs: (txs || []).filter(x => !ex.has(x.sym)) };
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
// 🌙 Calm mode (optional, off unless you switch it on in Signal ✏️): a Reinforce waits while the coin is still falling —
// down more than CALM_MIN % over its last 7 days → Hold ('falling'). Fewer Reinforce signals; Sell / Convert is untouched.
// (tools/lab: on a year of prices it cut the trades by about a third for about 1% less at the end — not a better rule, a quieter one.)
export const CALM_MIN = -5;
export function signalFor({ sym, chg, rules, rs = null, smart = true, calm = false }) {
  const r = rules || { reinforce: -5, sell: -20 };
  const base = !hasSignal(sym) ? 'hold' : chg < r.sell ? 'convert' : chg <= r.reinforce ? 'reinforce' : 'hold';   // BTC, shares, gold / silver: held
  const ok = smart && hasSignal(sym) && rs && Number.isFinite(rs.d30) && Number.isFinite(rs.d90);
  const falling = calm && base === 'reinforce' && rs && Number.isFinite(rs.c7) && rs.c7 < CALM_MIN;
  if (!ok) return falling ? { action: 'hold', base, why: 'falling', rs } : { action: base, base, why: null, rs: rs || null };
  const weak = rs.d30 <= -SMART_WEAK && rs.d90 <= -SMART_WEAK, strong = rs.d30 > 0 && rs.d90 > 0;
  if (base === 'reinforce' && weak) return { action: 'hold', base, why: 'weak', rs };
  if (falling) return { action: 'hold', base, why: 'falling', rs };
  if (base === 'convert' && strong) return { action: 'hold', base, why: 'strong', rs };
  return { action: base, base, why: base !== 'hold' && (weak || strong) ? 'confirmed' : null, rs };
}
// ⏳ The signal decided on the DAILY CLOSE (00:00 UTC = 03:00 Riyadh), not on the live price: a wick that pushes the
// price past a threshold for a few seconds or minutes never flips it. `close` = the coin's price at the last daily
// close (null: not known yet → the live price decides, as before). Returns signalFor's answer for the close, plus
//   live:    what the live price alone would say
//   pending: that live signal when it differs — shown as "pending ⏳" until a close confirms it (or the price comes back)
export function confirmedSignal({ sym, avg, live, close, rules, rs = null, smart = true, calm = false }) {
  const pctOf = p => avg > 0 && p > 0 ? (p / avg - 1) * 100 : 0;
  const L = signalFor({ sym, chg: pctOf(live), rules, rs, smart, calm });
  if (!(close > 0)) return { ...L, chg: pctOf(live), live: L.action, pending: null, onClose: false };
  const C = signalFor({ sym, chg: pctOf(close), rules, rs, smart, calm });
  return { ...C, chg: pctOf(close), live: L.action, pending: L.action !== C.action ? L.action : null, onClose: true };
}
// 30 / 90-day strength vs BTC for every coin, from the Altcoin Season file (m/alt.json: top 100 + the app's other coins)
export function strengthMap(alt) {
  // as of the last daily close when the file has it (alt.closed) — the Signal is decided on the close, so its strength
  // check must not flip during the day; older files: the live numbers
  const cl = alt && alt.closed && Array.isArray(alt.closed.btc) && Number.isFinite(alt.closed.btc[1]) && Number.isFinite(alt.closed.btc[2]) && alt.closed.p ? alt.closed : null;
  const out = {}, b = cl ? cl.btc : alt && alt.btc;
  if (!b || !Number.isFinite(b[1]) || !Number.isFinite(b[2])) return out;
  if (cl) { for (const [id, p] of Object.entries(cl.p)) if (Array.isArray(p) && Number.isFinite(p[1]) && Number.isFinite(p[2])) out[id] = { d30: p[1] - b[1], d90: p[2] - b[2], c30: p[1], c90: p[2], c7: Number.isFinite(p[0]) ? p[0] : null }; out.__btc = { c30: b[1], c90: b[2] }; return out; }
  const put = (id, p) => { if (id && Array.isArray(p) && Number.isFinite(p[1]) && Number.isFinite(p[2])) out[id] = { d30: p[1] - b[1], d90: p[2] - b[2], c30: p[1], c90: p[2], c7: Number.isFinite(p[0]) ? p[0] : null }; };
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
  // a savings goal (CASH-…) has no buys to see: the days you said "✓ Saved" (the last 24)
  const paid = Array.isArray(s.paid) ? [...new Set(s.paid.filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(-24) : [];
  const out = { usd: Math.round(usd * 100) / 100, every, day, since };
  if (paid.length) out.paid = paid;
  return out;
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
  // what counts as done: a buy of it (coins, shares, metals) — or, for a savings goal, a day you marked "✓ Saved"
  //   (c.usd is then an amount in that currency: CASH-EGP 5000 = 5,000 EGP each time)
  const cash = CASH_PLAN.test(S);
  const buys = cash ? (c.paid || []) : (txs || []).filter(t => t && t.type === 'buy' && String(t.sym || '').toUpperCase() === S && t.date).map(t => String(t.date).slice(0, 10)).sort();
  const boughtFor = d => { const lo = isoD(dOf(d) - 2 * DAYMS), hi = dcaNextAfter(c, d) || '9999-12-31'; return buys.some(b => b >= lo && b < hi); };
  const past = dcaDue(c, c.since, today), last = past.length ? past[past.length - 1] : null;
  const recent = past.slice(-6), kept = recent.filter(boughtFor).length;
  const done = last ? boughtFor(last) : false;
  const late = last && !done ? Math.round((dOf(today) - dOf(last)) / DAYMS) : 0;
  const next = last === today && !done ? today : dcaNextAfter(c, today);   // the coming due date (today when today is one and not bought yet)
  return { ...c, last, done, next, state: !last ? 'upcoming' : done ? 'done' : late === 0 ? 'today' : 'missed', late, kept, of: recent.length, perMonth: c.usd * DCA_PER_MONTH[c.every], cur: cash ? S.slice(5) : 'USD' };
}
// a regular buy / saving in dollars (a savings goal's amount is in its currency: × dollars per unit; null while no rate)
export function dcaUsd(amount, sym, fx) {
  if (!CASH_PLAN.test(String(sym || '').toUpperCase())) return +amount || 0;
  const px = planCashPrice(sym, fx); return px == null ? null : (+amount || 0) * px;
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
      const net = q - Math.min(q, Math.max(0, num(t.fee))), pq = qty - net;
      if (!(net > 0)) continue;
      if (pq < -1e-9 * Math.max(1, net)) { ok = false; qty = 0; avg = 0; continue; }
      if (pq <= 1e-9 * Math.max(1, net)) { qty = 0; avg = 0; continue; }
      const pa = (qty * avg - q * p - Math.max(0, num(t.feeUsd))) / pq;
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

// ── 🕌 Zakat: one date a year, a hijri day of your own choice (default 1 Ramadan), by the Umm al-Qura calendar in Riyadh's day.
// zakatWhen(now, { m, d }) → { last, next (ms), hy / nextHy (hijri years), since (days since the last one), daysLeft,
//   due (from that day for 30 days), lastDate, nextDate ("YYYY-MM-DD"), m, d } | null (no hijri calendar on this device)
// The 30th of a month that has 29 days counts on the 1st of the next month.
export const ZAKAT_DAY = Object.freeze({ m: 9, d: 1 }), ZAKAT_WINDOW = 30;
export const HIJRI_MONTHS = Object.freeze({
  en: ['Muharram', 'Safar', 'Rabi I', 'Rabi II', 'Jumada I', 'Jumada II', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'],
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'] });
export function cleanZakatDay(z) { const m = Math.round(+(z && z.m)), d = Math.round(+(z && z.d)); return m >= 1 && m <= 12 && d >= 1 && d <= 30 ? { m, d } : { ...ZAKAT_DAY }; }
let hijriFmt = null; const zkMemo = new Map();
export function hijri(t) {
  try {
    hijriFmt = hijriFmt || new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Riyadh' });
    const o = {}; for (const p of hijriFmt.formatToParts(new Date(t))) if (p.type === 'day' || p.type === 'month' || p.type === 'year') o[p.type] = parseInt(p.value, 10);
    return o.month && o.year > 1300 ? o : null;   // (a device without this calendar answers in Gregorian: year 2026 → null)
  } catch (_) { return null; }
}
const riyadhDay = t => new Date(t + 3 * 36e5).toISOString().slice(0, 10);
export function zakatWhen(now = Date.now(), day = ZAKAT_DAY) {
  const { m, d } = cleanZakatDay(day), key = riyadhDay(now) + '|' + m + '|' + d;
  if (zkMemo.has(key)) return zkMemo.get(key);
  if (!hijri(now)) return null;
  const is = t => { const a = hijri(t); if (!a) return false; if (a.month === m && a.day === d) return true;
    if (d === 30 && a.day === 1 && a.month === (m % 12) + 1) { const y = hijri(t - DAYMS); return !!y && y.day === 29; } return false; };
  let since = null, left = null;
  for (let i = 0; i <= 390 && since == null; i++) if (is(now - i * DAYMS)) since = i;
  for (let i = 1; i <= 390 && left == null; i++) if (is(now + i * DAYMS)) left = i;
  if (since == null || left == null) return null;
  const last = now - since * DAYMS, next = now + left * DAYMS;
  const out = { last, next, hy: hijri(last).year, nextHy: hijri(next).year, since, daysLeft: left, due: since < ZAKAT_WINDOW, lastDate: riyadhDay(last), nextDate: riyadhDay(next), m, d };
  if (zkMemo.size > 50) zkMemo.clear(); zkMemo.set(key, out);
  return out;
}

// ── 🏦 Cash & certificates: bank balances and investment certificates, in US dollars, Egyptian pounds or Saudi riyals ──
// Entered by hand (never a bank connection, never an account number): { id, kind: 'cash' | 'cert', cur, amount, label }
// and, for a certificate, { rate (% a year), start (YYYY-MM-DD), months (its term), pay: how the return is paid }.
// Their value is counted in "Net worth" only — the portfolio's own totals and profit are never mixed with them.
export const CASH_CURS = ['USD', 'EGP', 'SAR'];
export const CASH_PAYS = ['month', 'quarter', 'year', 'end'];   // the return is paid monthly / quarterly / yearly / at maturity
export function cleanCash(list) {
  const out = [];
  for (const x of Array.isArray(list) ? list : []) {
    if (!x || typeof x !== 'object' || out.length >= 40) continue;
    const cur = CASH_CURS.includes(x.cur) ? x.cur : null, amount = +x.amount;
    if (!cur || !(amount > 0) || !Number.isFinite(amount) || amount > 1e13) continue;
    const it = { id: String(x.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) || ('c' + out.length + Math.round(amount)), kind: x.kind === 'cert' ? 'cert' : 'cash', cur,
      amount: Math.round(amount * 100) / 100, label: String(x.label == null ? '' : x.label).replace(/[<>"'`\\]/g, '').trim().slice(0, 40) };
    if (it.kind === 'cert') {
      const rate = +x.rate, mo = Math.round(+x.months);
      it.rate = rate >= 0 && rate <= 100 ? Math.round(rate * 1000) / 1000 : 0;
      it.start = /^\d{4}-\d\d-\d\d$/.test(x.start || '') && Date.parse(x.start + 'T00:00:00Z') > 0 ? x.start : null;
      it.months = mo >= 1 && mo <= 600 ? mo : null;
      it.pay = CASH_PAYS.includes(x.pay) ? x.pay : 'month';
      // count the return so far in its value? Your choice per certificate; unset → yes when it is paid at maturity (it builds
      // up inside the certificate), no when it is paid out (the payments reach your account, a balance you enter yourself)
      it.count = typeof x.count === 'boolean' ? x.count : it.pay === 'end';
    }
    out.push(it);
  }
  return out;
}
const addMonthsUtc = (ms, n) => { const d = new Date(ms), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime(); };
// One entry, worked out. fx = how many units of each currency one US dollar buys: { EGP: 54.37, SAR: 3.75 } (USD is 1).
// A certificate: simple interest (rate × days / 365) from its start to today (never past its maturity). Whether that return
// is counted in its value is the entry's own switch (count): on → value = amount + the return so far; off → the amount
// only. Off suits a return that is paid out to an account you already enter as a balance (so it is never counted twice).
// → { ...item, value (its currency), accrued (counted in value), earned (the return so far, counted or not), usd | null (no rate for that currency yet), yearly, income (per payment),
//     maturity ('YYYY-MM-DD' | null), daysLeft, matured }
export function cashFacts(item, fx, now = Date.now()) {
  const it = cleanCash([item])[0]; if (!it) return null;
  const DAY = 864e5, per1 = it.cur === 'USD' ? 1 : fx && +fx[it.cur] > 0 ? +fx[it.cur] : null;
  let accrued = 0, earned = 0, yearly = 0, income = null, maturity = null, daysLeft = null, matured = false;
  if (it.kind === 'cert') {
    yearly = it.amount * it.rate / 100;
    const step = { month: 1, quarter: 3, year: 12 }[it.pay] || 0;
    income = step ? yearly * step / 12 : null;
    const start = it.start ? Date.parse(it.start + 'T00:00:00Z') : 0, end = start && it.months ? addMonthsUtc(start, it.months) : 0;
    if (end) { maturity = new Date(end).toISOString().slice(0, 10); daysLeft = Math.ceil((end - now) / DAY); matured = now >= end; }
    if (start && now > start) {
      earned = Math.max(0, yearly * ((end ? Math.min(now, end) : now) - start) / DAY / 365);
      if (it.count) accrued = earned;
    }
  }
  const value = it.amount + accrued;
  return { ...it, value, accrued, earned, usd: per1 ? value / per1 : null, yearly, income, maturity, daysLeft, matured };
}
// All of them: → { items (cashFacts each), usd (those with a rate), missing: currencies with no rate yet, byCur: { EGP: { value, usd } } }
export function cashTotals(list, fx, now = Date.now()) {
  const items = cleanCash(list).map(x => cashFacts(x, fx, now)).filter(Boolean), byCur = {}, missing = new Set(); let usd = 0;
  for (const x of items) {
    const b = byCur[x.cur] || (byCur[x.cur] = { value: 0, usd: 0 }); b.value += x.value;
    if (x.usd == null) missing.add(x.cur); else { b.usd += x.usd; usd += x.usd; }
  }
  return { items, usd, missing: [...missing], byCur };
}

// ── 🧭 Asset classes: what each holding IS — the one answer every screen asks (Add, the Plan, DCA, categories, totals,
// signals, zakat) and the Telegram bot / GitHub alerts too, so they always agree ──
//   crypto · a coin (the default)                         → its own Signal; an altcoin unless it is BTC
//   stock  · a tokenized US share (Binance bStocks)       → held; no Signal; zakat by your choice (meta/info.zakatStocks)
//   metal  · physical gold / silver / platinum / copper, shown in grams → held; no Signal; in the one zakat pool at market value
//   cash   · bank balances and certificates (meta/info.cash, never a coin) → Net worth only; always in zakat
// Gold TOKENS (PAXG, XAUT, KAG) are coins: they trade like any token (their category is still Precious Metals).
// Nothing is migrated: a holding's class comes from what it already is — XAU / XAG, a CoinGecko id with "bstock(s)" in it —
// or from its own `cls` when one was saved (the Add window's tabs save it). Callers that only have a symbol get the class
// the coins and plan rows taught (learnAssets), else crypto.
export const CLASSES = ['crypto', 'stock', 'metal', 'cash'];
const METAL_SYMS = new Set(['XAU', 'XAG', 'XPT', 'XCU']);   // gold · silver · platinum · copper (held in troy ounces, shown in grams)
// CoinGecko's bStocks ids: nvidia-bstocks · circle-internet-group-bstock · tesla-bstocks-tokenized-stock · intel-tokenized-bstocks
export const BSTOCK_ID = /(^|-)b?bstocks?(-|$)|^bn:/i;   // (+ …-bbstocks-tokenized-etf, and a share priced by the exchange: bn:ANTB)
const learnedClass = new Map();
const classOfDoc = d => d && typeof d === 'object' ? (d.cls === 'stock' || d.cls === 'metal' || d.cls === 'crypto' ? d.cls : BSTOCK_ID.test(String(d.cgId || '')) ? 'stock' : null) : null;
export function learnAssets(list) {
  for (const d of Array.isArray(list) ? list : []) { const s = d && String(d.sym || '').toUpperCase(), k = classOfDoc(d); if (s && k && k !== 'crypto') learnedClass.set(s, k); }
  if (learnedClass.size > 5000) learnedClass.clear();
}
// x: a symbol, or a coin / plan row ({ sym, cgId, cls })
export function assetClass(x) {
  const sym = String((x && typeof x === 'object' ? x.sym : x) || '').toUpperCase();
  if (METAL_SYMS.has(sym)) return 'metal';
  if (CASH_PLAN.test(sym)) return 'cash';
  return classOfDoc(x) || learnedClass.get(sym) || 'crypto';
}
export const hasSignal = x => assetClass(x) === 'crypto' && String((x && typeof x === 'object' ? x.sym : x) || '').toUpperCase() !== 'BTC';
export const isAltcoin = hasSignal;   // "Altcoins": every coin but BTC — no shares, no metals
// 🕌 the pool zakat counts against the nisab of 85 g of gold. rows: [{ sym, cgId?, cls?, value }]
// One pool for everything (Samir's rule, Nov 2026): coins + metals (gold, silver, platinum, copper at market value) + cash &
// certificates + shares when you count them — against ONE nisab, the value of 85 g of gold on your zakat day. (Joining gold and
// silver to money to complete the nisab is the majority view; the Shafi'is keep them apart — the hint says so.)
export function zakatPool(rows, { cashUsd = 0, stocks = true } = {}) {
  let crypto = 0, stock = 0, metal = 0;
  for (const r of rows || []) { const k = assetClass(r), v = +r.value || 0; if (!(v > 0)) continue; if (k === 'crypto') crypto += v; else if (k === 'stock') stock += v; else if (k === 'metal') metal += v; }
  const cash = cashUsd > 0 ? +cashUsd : 0;
  return { crypto, stock, metal, cash, stocksCounted: stocks !== false, value: crypto + metal + (stocks !== false ? stock : 0) + cash };
}
// ✓ the zakat you paid, one line per hijri year (meta/info.zakatPaid; in every backup): { hy, value, nisabUsd, zakat ($ due),
// paid (the amount you paid), cur (its currency), at (YYYY-MM-DD) }
export function cleanZakatPaid(list) {
  const by = new Map(), n2 = v => Math.round((+v || 0) * 100) / 100;
  for (const x of Array.isArray(list) ? list : []) {
    const hy = Math.round(+(x && x.hy)); if (!(hy >= 1400 && hy <= 1600)) continue;
    by.set(hy, { hy, value: n2(x.value), nisabUsd: n2(x.nisabUsd), zakat: n2(x.zakat), paid: n2(x.paid), cur: CASH_CURS.includes(x.cur) ? x.cur : 'USD',
      at: typeof x.at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.at) ? x.at : isoD(Date.now()) });
  }
  return [...by.values()].sort((a, b) => a.hy - b.hy).slice(-30);
}
// When the account began in the app (ms; 0 = unknown): the day its first coin was added HERE (coin.addedAt) — never a
// transaction's date, which can be typed or imported from years before the account existed.
export function firstSeen(coins) {
  let t = Infinity;
  for (const c of coins || []) { const x = Date.parse((c && c.addedAt) || ''); if (x > 0 && x < t) t = x; }
  return Number.isFinite(t) ? t : 0;
}
// Where your zakat year stands — the app's line and the bot agree on it.
//   w = zakatWhen(…) · now = { value, nisabUsd } today's pool · snap = the pool kept on the last zakat day ({ hy, value, nisabUsd })
//   paid = cleanZakatPaid list
// The year is fixed on your hijri day: the pool kept that day decides it, and it stays DUE (past the month too) until you
// tap ✓ Paid; paying late never moves the next zakat day.
//   state: 'due' (pay this) · 'paid' (this year's is paid) · 'below' (the day's pool was under the nisab) · 'upcoming' / 'under'
//   (no open year: today's estimate for the next day reaches / misses the nisab)
// o.since = when the account began in the app (firstSeen). The day passed with nobody there to keep its pool (no visit
// in its month, no bot): the year is still open — `late`, counted at today's value until it is kept (the app and the bot
// keep it at once) — but only when the account already existed on that day (a new member owes nothing for a day before them).
export function zakatYear(w, now, snap, paid, o = {}) {
  if (!w) return null;
  const P = cleanZakatPaid(paid), rec = P.find(p => p.hy === w.hy) || null;
  const fixed = !!(snap && +snap.hy === w.hy && +snap.value >= 0 && +snap.nisabUsd > 0);
  const late = !fixed && !w.due && !rec && +(o && o.since) > 0 && +o.since <= w.last;
  const day = fixed ? { value: +snap.value, nisabUsd: +snap.nisabUsd } : (w.due || late ? now : null);   // the day's pool (or today's: still in its month, or never kept)
  const est = { value: +now.value || 0, nisabUsd: +now.nisabUsd || 0 }, nextMeets = est.nisabUsd > 0 && est.value >= est.nisabUsd;
  const base = { fixed, late, hy: w.hy, nextHy: w.nextHy, daysLeft: w.daysLeft, nextDate: w.nextDate, lastDate: w.lastDate, since: w.since, paid: rec, history: P };
  if (day && day.nisabUsd > 0) {
    if (rec) return { ...base, state: 'paid', value: day.value, nisabUsd: day.nisabUsd, zakatUsd: rec.zakat || day.value * 0.025 };
    if (day.value >= day.nisabUsd) return { ...base, state: 'due', value: day.value, nisabUsd: day.nisabUsd, zakatUsd: day.value * 0.025 };
    if (w.due) return { ...base, state: 'below', value: day.value, nisabUsd: day.nisabUsd, zakatUsd: 0 };
  }
  if (!(est.nisabUsd > 0)) return null;
  return { ...base, state: nextMeets ? 'upcoming' : 'under', value: est.value, nisabUsd: est.nisabUsd, zakatUsd: est.value * 0.025 };
}

// ── 🎯 The plan, for all four: coins · shares · metals · cash & certificates ──
// A plan row is still { sym, targetQty, … }. Shares and metals are held like coins (their qty — metals in troy ounces,
// shown in grams); a savings goal is the row CASH-USD / CASH-EGP / CASH-SAR: its target is an amount of that currency
// and what you have is your cash & certificates in it (meta/info.cash, their value today). Its "price" is the dollar value
// of one unit (1 / the official rate), so Cost to Target and the plan's totals stay in dollars like every other row.
export const CASH_PLAN = /^CASH-(USD|EGP|SAR)$/;
export const GRAMS_PER_OZ = 31.1034768;
export const planCashSym = cur => 'CASH-' + String(cur || '').toUpperCase();
export function planKind(e) {
  const k = assetClass(e);
  return k === 'cash' || k === 'stock' || k === 'metal' ? k : 'coin';
}
// what you have toward a row: `heldQty` = your holding of the coin / share / metal; cash rows read the cash list
export function planActual(e, heldQty, cash, now = Date.now()) {
  if (planKind(e) !== 'cash') return +heldQty || 0;
  const cur = String(e.sym).toUpperCase().slice(5), b = cashTotals(cash || [], null, now).byCur[cur];
  return b ? b.value : 0;
}
// dollars per unit of a cash row (null while the rate is unknown)
export function planCashPrice(sym, fx) {
  const cur = String(sym || '').toUpperCase().slice(5);
  if (cur === 'USD') return 1;
  return fx && +fx[cur] > 0 ? 1 / +fx[cur] : null;
}
// an amount in the row's own unit: { n, u } — coins: the symbol · shares: "shares" · metals: grams · cash: its currency
export function planUnits(e, qty, ar = false) {
  const k = planKind(e), q = +qty || 0, sym = String(e && e.sym || '').toUpperCase();
  if (k === 'metal') return { n: q * GRAMS_PER_OZ, u: ar ? 'جم' : 'g', dp: 2 };
  if (k === 'stock') return { n: q, u: ar ? 'سهم' : (q === 1 ? 'share' : 'shares'), dp: 4 };
  if (k === 'cash') return { n: q, u: sym.slice(5), dp: 0 };
  return { n: q, u: sym, dp: 8 };
}

// ── 🌈 Bitcoin rainbow: one trend line through Bitcoin's whole history, and nine bands around it ──
// The line: log10(price) = a + b · log10(days since the genesis block, 3 Jan 2009) — ordinary least squares on the daily
// closes from 18 Aug 2010 (blockchain.com's daily price until 16 Aug 2017, Binance's UTC closes after). The distance between
// the deepest close under the line and the highest one over it is cut into nine equal bands (equal on the log scale): band
// 1 is the lowest, 9 the highest, and the line itself runs through band 4. Checked against crypto-economy.com's published
// chart (tools/lab/rainbow.mjs): the same slope and intercept to four decimals. It describes the past; it predicts nothing.
// A "day" is a UTC day number (ms / 864e5); rows are [day, price]. The file every reader shares is m/rainbow.json
// (tools/update-rainbow.mjs): { fit: { a, b, lo, hi, … }, closes: [[iso, price] × 14], held: { band, since }, … }.
const RB_DAY = 864e5;
export const RAINBOW_GENESIS = Date.UTC(2009, 0, 3) / RB_DAY, RAINBOW_FROM = '2010-08-18', RAINBOW_EXIT = 6;   // RAINBOW_EXIT: the Exit page's band until you choose yours
export const rainbowDay = iso => Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / RB_DAY);
export const rainbowIso = d => new Date(d * RB_DAY).toISOString().slice(0, 10);
export const rainbowLine = (f, d) => 10 ** (f.a + f.b * Math.log10(d - RAINBOW_GENESIS));                       // the line's price on day d
export const rainbowDev = (f, d, p) => Math.log10(p) - (f.a + f.b * Math.log10(d - RAINBOW_GENESIS));          // log10 distance from the line
export const rainbowBand = (f, v) => Math.min(9, Math.max(1, Math.floor((v - f.lo) / ((f.hi - f.lo) / 9)) + 1));   // 1…9 (a new record stays in 1 / 9 until the next fit)
export const rainbowEdges = (f, d) => Array.from({ length: 10 }, (_, i) => rainbowLine(f, d) * 10 ** (f.lo + i * (f.hi - f.lo) / 9));   // the ten edges of the nine bands on day d
// the fit and its span: { a, b, r2, n, lo, hi, loDay, hiDay, share[9] (% of the days in each band) } — null under 30 days
export function rainbowFit(rows, from = -Infinity, to = Infinity) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  const use = [];
  for (const [d, p] of rows) {
    if (d < from || d > to || !(p > 0) || d <= RAINBOW_GENESIS) continue;
    const x = Math.log10(d - RAINBOW_GENESIS), y = Math.log10(p);
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; use.push([d, p]);
  }
  if (n < 30) return null;
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const f = { a, b, r2: 1 - (syy - a * sy - b * sxy) / (syy - sy * sy / n), n, lo: Infinity, hi: -Infinity, loDay: null, hiDay: null };
  const devs = use.map(([d, p]) => { const v = rainbowDev(f, d, p); if (v < f.lo) { f.lo = v; f.loDay = d; } if (v > f.hi) { f.hi = v; f.hiDay = d; } return v; });
  const share = Array(9).fill(0); devs.forEach(v => share[rainbowBand(f, v) - 1]++);
  f.share = share.map(c => c / n * 100);
  return f;
}
// The band that HOLDS: a move to another band counts after two daily closes in a row in it (one close across an edge and
// back sends nothing). bands: one band a day, oldest first → rainbowHeldAll: the held band on each of those days ·
// rainbowHeld: { band: the one that holds now, i: the index of the first of its two closes (0 when it never changed) }
export function rainbowHeldAll(bands, start) {
  const out = []; let band = start != null ? start : bands[0];
  for (let k = 0; k < bands.length; k++) { if (k > 0 && bands[k] !== band && bands[k] === bands[k - 1]) band = bands[k]; out.push(band); }
  return out;
}
export function rainbowHeld(bands, start) {
  const a = rainbowHeldAll(bands, start); let k = a.length - 1;
  while (k > 0 && a[k - 1] === a[k]) k--;
  return { band: a[a.length - 1], i: Math.max(0, k - 1) };
}
// What the file says now — one answer for the bot's line, the alert, the Exit page and the Market Hub card:
// { day, close, band: the band that holds, last: the last close's band, pending: last when it differs (one more close
//   confirms it), line, vs: % over (+) / under (−) the line, lo / hi: the held band's edges on that day, edges[10],
//   since, share, fit } · `price`: a live price for line / vs (the band stays the daily closes'); null when the file is
//   missing or its last close is over 4 days old (nothing is shown or alerted on old numbers)
export function rainbowRead(R, now = Date.now(), price = null) {
  const f = R && R.fit, cl = R && Array.isArray(R.closes) ? R.closes.filter(c => c && +c[1] > 0).map(c => ({ iso: String(c[0]), d: rainbowDay(c[0]), p: +c[1] })).sort((x, y) => x.d - y.d) : [];
  if (!f || !(f.b > 0) || !(f.hi > f.lo) || !cl.length) return null;
  const end = cl[cl.length - 1], today = Math.floor(now / RB_DAY);
  if (today - end.d > 4) return null;
  cl.forEach(c => { c.band = rainbowBand(f, rainbowDev(f, c.d, c.p)); });
  const held = R.held && R.held.band >= 1 && R.held.band <= 9 ? R.held : { band: rainbowHeld(cl.map(c => c.band)).band, since: null };
  const live = +price > 0, d = live ? Math.max(end.d, today) : end.d, p = live ? +price : end.p, line = rainbowLine(f, d), edges = rainbowEdges(f, d);
  return { day: end.iso, close: end.p, band: held.band, last: end.band, pending: end.band !== held.band ? end.band : null, price: p, live, line, vs: (p / line - 1) * 100,
    lo: edges[held.band - 1], hi: edges[held.band], edges, since: held.since || null, share: f.share || null, fit: f, closes: cl };
}
// ── 📏 Two more readings from the same daily closes: the 200-week average and the Pi Cycle (both describe, neither forecasts) ──
// rows: [day, price], one a day, oldest first (m/btcday.json). The job writes their numbers beside the rainbow's
// (m/rainbow.json → w200, pi); btcMarks() is the one reader for the card, the Exit page, the Plan and the bot.
export const btcWeekly = rows => rows.filter(r => (r[0] + 4) % 7 === 0 && r[1] > 0);   // a week closes on Sunday (UTC)
// 200-week average: the mean of the last 200 weekly closes. → [[sunday, average]] from the 200th week on
export function btcW200(rows, n = 200) {
  const w = btcWeekly(rows), out = []; let sum = 0;
  for (let i = 0; i < w.length; i++) { sum += w[i][1]; if (i >= n) sum -= w[i - n][1]; if (i >= n - 1) out.push([w[i][0], sum / n]); }
  return out;
}
// Pi Cycle: the 111-day average against twice the 350-day average (simple averages of the daily closes).
// → [[day, ratio %, d111, d350x2]] from the 350th day on; the "cross" is the ratio reaching 100.
export function btcPi(rows) {
  const out = []; let s111 = 0, s350 = 0;
  for (let i = 0; i < rows.length; i++) {
    s111 += rows[i][1]; s350 += rows[i][1];
    if (i >= 111) s111 -= rows[i - 111][1];
    if (i >= 350) s350 -= rows[i - 350][1];
    if (i >= 349) { const a = s111 / 111, b = 2 * s350 / 350; out.push([rows[i][0], a / b * 100, a, b]); }
  }
  return out;
}
// What the file says now: { day, price, w200: { ma, day, vs: % over (+) / under (−) the average, hist }, pi: { ratio, d111,
// d350x2, day, peaks, crosses } } — null on the rainbow's own terms (no file, or a last close over 4 days old)
export function btcMarks(R, now = Date.now(), price = null) {
  const rb = rainbowRead(R, now, price); if (!rb) return null;
  const w = R.w200 && +R.w200.ma > 0 ? { ma: +R.w200.ma, day: R.w200.day, vs: (rb.price / R.w200.ma - 1) * 100, hist: R.w200.under || null } : null;
  const p = R.pi && +R.pi.ratio > 0 ? { ratio: +R.pi.ratio, d111: +R.pi.d111, d350x2: +R.pi.d350x2, day: R.pi.day, peaks: R.pi.peaks || [], crosses: R.pi.crosses || [], hist: histOf(R.pi.hist) } : null;
  return { day: rb.day, price: rb.price, live: rb.live, w200: w, pi: p };
}
// A reading's place in its own history (the jobs write it: { from, days, under %, lo: [value, day], hi: [value, day] }):
// → { from, year, days, under (share of the days since `from` that were lower, 0 … 100), lo, hi, loDay, hiDay } | null
function histOf(h) {
  if (!h || !isFinite(+h.under) || !Array.isArray(h.lo) || !Array.isArray(h.hi) || !(+h.hi[0] > +h.lo[0])) return null;
  return { from: h.from, year: +String(h.from || '').slice(0, 4) || null, days: +h.days || null, under: Math.min(100, Math.max(0, +h.under)), lo: +h.lo[0], hi: +h.hi[0], loDay: h.lo[1] || null, hiDay: h.hi[1] || null };
}
// where a value sits between the lowest and the highest reading (0 … 100, for a small range bar)
export const histPos = (v, h) => !h || !isFinite(+v) ? null : Math.min(100, Math.max(0, (+v - h.lo) / (h.hi - h.lo) * 100));
export const PI_EXIT = 100;   // the Exit page's Pi Cycle level until you choose yours (100 = the cross itself)

// ── MVRV, the dollar index, BTC funding — three readings from outside Bitcoin's own price file (tools/update-macro.mjs →
// m/macro.json, copied into m/market.json as mvrv / dxy / funding). One reader each, for the app, the bot and the alerts;
// a part that has grown too old reads as "not there" (null) rather than as a stale number.
// MVRV = Bitcoin's market value ÷ its realized value (what every coin cost when it last moved). Coin Metrics' daily ratio,
// one day behind; `realized` is the average cost it implies (price ÷ ratio). Like every top reading here it is shown as a
// distance with each cycle's highest — the old 3.5 line was last seen in March 2021.
export const MVRV_EXIT = 3;   // the Exit page's MVRV level until you choose yours (reached ~100 days in each of the three cycles before this one)
export const mvrvLevel = v => +v >= 1 && +v <= 10 ? Math.round(+v * 100) / 100 : MVRV_EXIT;
export function mvrvRead(M, now = Date.now()) {
  if (!M || !(+M.now > 0) || !M.day) return null;
  const t = Date.parse(M.day + 'T00:00:00Z'); if (!isFinite(t) || now - t > 5 * 864e5) return null;   // its last day ended over 4 days ago
  return { day: M.day, v: +M.now, realized: +M.realized > 0 ? +M.realized : null, price: +M.price > 0 ? +M.price : null, wk: M.wk ?? null, mo: M.mo ?? null,
    peaks: M.peaks || [], lows: M.lows || [], over35: M.over35 || null, over3: M.over3 || null, under1: M.under1 || null, src: M.src || 'Coin Metrics', via: M.via || null, hist: histOf(M.hist) };
}
// The US dollar index (ICE's DXY): the price, its level in words (k — dxyRead), the day's and the week's change, where it
// sits in its 52-week range (0 … 100).
// It does not trade at the weekend: the last quote stays, up to 5 days.
export function dxyNow(D, now = Date.now()) {
  if (!D || !(+D.price > 0)) return null;
  const t = Date.parse(D.at); if (!isFinite(t) || now - t > 5 * 864e5) return null;
  const lo = +D.lo52, hi = +D.hi52, pos = hi > lo ? Math.min(100, Math.max(0, (D.price - lo) / (hi - lo) * 100)) : null;
  return { price: +D.price, k: dxyRead(+D.price), ch24: D.ch24 ?? null, ch7: D.ch7 ?? null, lo52: lo > 0 ? lo : null, hi52: hi > 0 ? hi : null, pos, spark: D.spark || [], at: D.at, src: D.src || 'Yahoo Finance' };
}
// The index's LEVEL in words — five ranges around 100, its base of March 1973 (Samir's ranges, 27 Nov 2026; checked on
// every quarter-end close since 1985: under 90 in 38.5% of them, 90–100 in 35.5%, 100–105 in 13.0%, 105–110 in 5.3%, 110
// or over in 7.7% — so 100 is the base, not the usual). A description of where the number stands, never of why.
//   low < 90 · under 90 … < 100 · mid 100 … < 105 · high 105 … < 110 · rare ≥ 110
export function dxyRead(v) { return v == null || !isFinite(v) || !(v > 0) ? null : v < 90 ? 'low' : v < 100 ? 'under' : v < 105 ? 'mid' : v < 110 ? 'high' : 'rare'; }
export const DXY_WORDS = Object.freeze({
  en: { low: 'Weak dollar', under: 'Below the base of 100', mid: 'Moderate strength', high: 'High strength', rare: 'Rare strength' },
  ar: { low: 'دولار ضعيف', under: 'دون نقطة الأساس', mid: 'قوة معتدلة', high: 'قوة مرتفعة', rare: 'قوة نادرة' } });
export const DXY_RANGES = Object.freeze({ low: 'under 90', under: '90 – 100', mid: '100 – 105', high: '105 – 110', rare: 'over 110' });
export const dxyWord = (v, ar) => { const k = dxyRead(v); return k ? DXY_WORDS[ar ? 'ar' : 'en'][k] : ''; };
// BTC funding: what longs pay shorts on perpetual futures, percent per 8 hours (negative: shorts pay). ONE wording for the
// app's card, the bot's lines, the AI's facts and the leverage radar. The edges come from the last 365 days of payments
// (Binance's public archive, the lab of 27 Nov 2026) — not from 2021's: in that year BTC, ETH and SOL were never once over
// the resting +0.01%, so anything over it is already out of the year's range; at or under −0.01% were BTC's lowest 0.5%
// (ETH 2.8%, SOL 11%). +0.03% — 30% of BTC's payments in 2021, none since 2024 — stays the edge of "crowded".
//   hot ≥ +0.03 · up > +0.01 · rest 0 … +0.01 · neg < 0 · deep ≤ −0.01
// The four edges live in ONE place (FUNDING_EDGES): the words below and the card's bar both read them.
export const FUNDING_ORDER = Object.freeze(['deep', 'neg', 'rest', 'up', 'hot']);   // low → high: the bar's five segments
export const FUNDING_EDGES = Object.freeze([-0.01, 0, 0.01, 0.03]);                 // % per 8 h, between one state and the next
export const FUNDING_ENDS = Object.freeze([-0.02, 0.05]);                           // where the bar stops (a reading beyond is pinned)
export function fundingRead(rate) {
  if (rate == null || !isFinite(rate)) return null;
  const r = Math.round(rate * 1e4) / 1e4, E = FUNDING_EDGES;
  return r >= E[3] ? 'hot' : r > E[2] ? 'up' : r >= E[1] ? 'rest' : r > E[0] ? 'neg' : 'deep';
}
// Where a rate sits on the bar: five EQUAL segments (the edges are not equally far apart, so each segment has its own
// scale and the edges are printed under the bar). → { k, i (0 … 4), pos (0 … 100) }. The place inside a segment is kept
// between 14% and 86% of it, so the dot never sits on an edge: it is always wholly inside the segment its word names
// (−0.01 is "crowded shorts", +0.01 is still "calm", +0.03 is "crowded longs").
export function fundingPos(rate) {
  const k = fundingRead(rate); if (!k) return null;
  const i = FUNDING_ORDER.indexOf(k), lo = i ? FUNDING_EDGES[i - 1] : FUNDING_ENDS[0], hi = i < 4 ? FUNDING_EDGES[i] : FUNDING_ENDS[1];
  const r = Math.round(rate * 1e4) / 1e4, f = Math.min(0.86, Math.max(0.14, (r - lo) / (hi - lo)));
  return { k, i, pos: +((i + f) * 20).toFixed(2) };
}
export const FUNDING_WORDS = Object.freeze({
  en: { hot: 'Crowded longs — longs paying a lot', up: 'Longs paying over the resting rate', rest: 'Calm — at or under the resting rate', neg: 'Negative — shorts paying longs', deep: 'Crowded shorts — shorts paying a lot' },
  ar: { hot: 'ازدحام في مراكز الشراء — التمويل موجب جداً', up: 'التمويل أعلى من المعدل الأساسي', rest: 'هادئ — عند المعدل الأساسي أو أقل', neg: 'سالب — مراكز البيع تدفع لمراكز الشراء', deep: 'ازدحام في مراكز البيع — التمويل سالب جداً' } });
export const FUNDING_SHORT = Object.freeze({
  en: { hot: 'crowded longs', up: 'above resting', rest: 'calm', neg: 'negative', deep: 'crowded shorts' },   // (short: a bot line is 40 characters)
  ar: { hot: 'ازدحام شراء', up: 'فوق الأساسي', rest: 'هادئ', neg: 'سالب', deep: 'ازدحام بيع' } });
export const fundingWord = (rate, ar, short) => { const k = fundingRead(rate); return k ? (short ? FUNDING_SHORT : FUNDING_WORDS)[ar ? 'ar' : 'en'][k] : ''; };
// The market's line: the snapshot's rate over several venues, weighted by open interest. `missing` names the big venues
// that are NOT in it (Binance and Bybit refuse the job's address) — shown wherever the number is. Over 6 hours old: null.
export function fundingNow(F, now = Date.now()) {
  if (!F || F.rate == null || !isFinite(F.rate) || !Array.isArray(F.venues)) return null;
  const t = Date.parse(F.at); if (!isFinite(t) || now - t > 6 * 36e5) return null;
  return { rate: +F.rate, m7: F.m7 != null && isFinite(F.m7) ? +F.m7 : null, yr: +F.rate * 1095, k: fundingRead(F.rate), oi: +F.oi || null, n: F.n || F.venues.length,
    venues: F.venues, missing: Array.isArray(F.missing) ? F.missing : [], at: F.at };
}

// Stablecoin supply: how many dollar-pegged coins exist, counted in COINS (tools/update-macro.mjs → stablesFrom, from
// DefiLlama). One reader for the card (and whoever shows it next). The part is a day's reading: over 4 days old → null.
// → { day, total, d1 / d7 / d30 / d365 (net change in coins, null when the older day is missing), p7 / p30 / p365 (%),
//     bars: [[day, change]] — up to the last 30 daily changes, oldest first,
//     top: [{ sym, name, circ, share (% of the total), m30 (% over a month, null for a coin that was not listed then), isNew, price }],
//     n (coins counted), src }
export function stablesNow(S, now = Date.now()) {
  if (!S || !(+S.total > 0) || !S.day || !Array.isArray(S.tot) || S.tot.length < 2) return null;
  const t = Date.parse(S.day + 'T00:00:00Z'); if (!isFinite(t) || now - t > 5 * 864e5) return null;
  const T = S.tot.map(v => (+v > 0 ? +v : null)), n = T.length, total = +S.total;
  const back = k => (n > k && T[n - 1 - k] != null ? total - T[n - 1 - k] : null), pct = (d, base) => (d == null || !(base > 0) ? null : d / base * 100);
  const bars = []; for (let i = Math.max(1, n - 30); i < n; i++) if (T[i] != null && T[i - 1] != null) bars.push([new Date(t - (n - 1 - i) * 864e5).toISOString().slice(0, 10), T[i] - T[i - 1]]);
  const y1 = +S.y1 > 0 ? +S.y1 : null;
  const top = (Array.isArray(S.top) ? S.top : []).filter(x => x && x.sym && +x.circ > 0).map(x => ({ sym: String(x.sym), name: String(x.name || x.sym), circ: +x.circ, share: +x.circ / total * 100,
    m30: +x.m30 > 0 ? (+x.circ / +x.m30 - 1) * 100 : null, isNew: !(+x.m30 > 0), price: +x.price > 0 ? +x.price : null }));
  return { day: S.day, total, d1: back(1), d7: back(7), d30: back(30), d365: y1 ? total - y1 : null, p7: pct(back(7), T[n - 8]), p30: pct(back(30), T[n - 31]), p365: y1 ? (total / y1 - 1) * 100 : null,
    bars, top, n: +S.n > 0 ? +S.n : null, src: S.src || 'DefiLlama' };
}

// ── 📉 Max drawdown: the deepest fall from a peak, on a profit-% line (perfChartSeries: Value − Net invested ÷ Cost) ──
// The line is read as an index (1 + profit% ÷ 100 — what a dollar of cost became), so money you add or take out does not
// count as a rise or a fall. points: [{ t, v }] → { dd: % (0 … 100, 0 when it never fell), peakT, lowT } · null under 2 points
export function maxDrawdown(points) {
  const p = (points || []).filter(x => x && isFinite(x.v)); if (p.length < 2) return null;
  let peak = -Infinity, peakT = null, best = { dd: 0, peakT: null, lowT: null };
  for (const x of p) {
    const idx = Math.max(1 + x.v / 100, 1e-9);
    if (idx > peak) { peak = idx; peakT = x.t; }
    const dd = (1 - idx / peak) * 100;
    if (dd > best.dd) best = { dd, peakT, lowT: x.t };
  }
  return best;
}

// the bands' names, lowest first — they describe where the price stands, never an order to buy or sell (band 4 holds the
// line itself). Samir's mix (27 Nov): his wording for the low side, the short "heat" ladder for the high side.
export const RAINBOW_NAMES = Object.freeze({
  en: ['Rare historic low', 'Deep discount', 'Accumulation zone', 'Around the trend line', 'Above the trend line', 'Warming up', 'Hot', 'Very hot', 'Bubble'],
  ar: ['قاع تاريخي نادر', 'خصم عميق', 'منطقة تجميع', 'حول خط الاتجاه', 'فوق خط الاتجاه', 'بداية سخونة', 'سخونة', 'سخونة عالية', 'فقاعة'] });
export const rainbowName = (band, ar) => RAINBOW_NAMES[ar ? 'ar' : 'en'][band - 1] || '';
