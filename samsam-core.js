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
//     'sell'   qty, price         → qty -= q, avg unchanged, realised P&L = (p-avg)*q
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

// Apply one transaction to a position. Returns {qty, avg, realized, sellQty}.
export function applyTx(pos, t) {
  let qty = pos.qty, avg = pos.avg, realized = 0, sellQty = 0;
  const q = num(t.qty), p = num(t.price);
  if (t.type === 'buy') {
    if (q > 0) {
      // Average Cost Basis: cost = Σ(buy price × buy amount) + Σ(buying fees in USD)
      const nq = qty + q, feeUsd = Math.max(0, num(t.feeUsd));
      avg = nq > EPS ? (qty * avg + q * p + feeUsd) / nq : 0;
      qty = nq;
    }
  } else if (t.type === 'sell') {
    sellQty = Math.min(q, Math.max(qty, 0));
    realized = (p - avg) * sellQty;
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
  return { qty, avg, realized, sellQty };
}

// Replay a coin's ledger from its opening position.
export function replay(opening, txs) {
  let pos = { qty: Math.max(0, num(opening && opening.qty)), avg: Math.max(0, num(opening && opening.avg)) };
  let realized = 0, sellCount = 0;
  const perTx = {}; // id → { realized, avgBefore, qtyAfter }
  const sorted = [...(txs || [])].sort(compareTx);
  for (const t of sorted) {
    const avgBefore = pos.avg;
    const r = applyTx(pos, t);
    pos = { qty: r.qty, avg: r.avg };
    if (t.type === 'sell') { realized += r.realized; sellCount++; }
    perTx[t.id] = { realized: t.type === 'sell' ? r.realized : null, avgBefore, qtyAfter: pos.qty };
  }
  return { qty: pos.qty, avg: pos.avg, realized, sellCount, perTx };
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
        cgId: c.cgId || undefined,
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
  let total = 0, sellCount = 0;
  const perTx = {};
  for (const [sym, list] of bySym) {
    const r = replay(openBySym.get(sym) || { qty: 0, avg: 0 }, list);
    total += r.realized; sellCount += r.sellCount;
    Object.assign(perTx, r.perTx);
  }
  return { total, sellCount, perTx };
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

export function newId(prefix) {
  const r = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now()}_${r}`;
}
