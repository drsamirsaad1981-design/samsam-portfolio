// samsam-history.js — hourly market-price history for every coin you hold or held (CoinGecko market_chart),
// so the charts are rebuilt from your transactions × real prices, the way CoinMarketCap does it.
//
// • One request per coin for the whole period (hourly points up to 90 days), then only the last 2 days on refresh.
// • Kept on this device (localStorage) — prices are market data, not portfolio data, so nothing goes to the cloud.
// • Requests go one at a time, about 6 s apart — under CoinGecko's free limit (~10–30 a minute, shared per IP).
//   If CoinGecko still refuses (429, or a refused request the browser only sees as a network error) we wait longer
//   and try again; a coin is only given up on when CoinGecko says it doesn't know it.
// • Until every coin's history has arrived the charts use the recorded points, and a line under the charts shows the
//   progress (window event 'samsam-history' → { done, total, waiting }).

const KEY = 'samsam_hist_v1';
const DAY = 864e5, HOUR = 36e5;
const GAP_MS = 6000, REFRESH_MS = 50 * 60e3, BACKOFF = [20e3, 45e3, 90e3, 120e3];

const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
};

// cache: { [cgId]: { from: ms (oldest moment covered), at: ms (last fetch), pts: [[t, usd], …] } }
let cache = ls.get(KEY, {}) || {};
const failed = new Set();   // ids CoinGecko doesn't know (or that kept failing) this session — valued at their own price instead
let queue = [], running = false, onUpdate = () => {}, status = { pending: 0, failed: 0, last: '', total: 0, done: 0, waiting: false };
function progress() {
  try { window.dispatchEvent(new CustomEvent('samsam-history', { detail: { done: status.done, total: status.total, waiting: status.waiting, pending: status.pending, building: queue.some(j => j.full) } })); } catch (_) {}
}

function save() {
  if (ls.set(KEY, cache)) return;
  // storage full: keep hourly points only (drop the fine 5-minute tail) and try once more
  for (const c of Object.values(cache)) c.pts = thin(c.pts);
  ls.set(KEY, cache);
}
function thin(pts) {
  const out = []; let last = -Infinity;
  for (const p of pts) if (p[0] - last >= HOUR - 60e3) { out.push(p); last = p[0]; }
  if (pts.length && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}
function merge(old, add) {
  if (!add.length) return old || [];
  const cut = add[0][0];
  return (old || []).filter(p => p[0] < cut).concat(add);
}

async function fetchChart(id, days) {
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}`;
  let r;
  try { r = await fetch(url); }
  catch (_) { const e = new Error('network'); e.retry = true; throw e; }   // a refused 429 often has no CORS header → looks like this
  if (r.status === 429 || r.status >= 500) { const e = new Error('rate'); e.retry = true; throw e; }
  if (!r.ok) throw new Error('HTTP ' + r.status);                          // 404: CoinGecko doesn't know this id
  const j = await r.json();
  return (j.prices || []).filter(p => Array.isArray(p) && p[0] > 0 && p[1] > 0).map(p => [Math.round(p[0]), +p[1]]);
}

async function work() {
  if (running) return; running = true;
  try {
    while (queue.length) {
      const job = queue[0];
      try {
        const pts = await fetchChart(job.id, job.days);
        if (!pts.length && job.full) throw new Error('no prices');
        const c = cache[job.id] || { from: Infinity, at: 0, pts: [] };
        c.pts = merge(job.full ? [] : c.pts, pts);
        if (job.full) c.from = job.from; else c.from = Math.min(c.from, job.from);
        c.at = Date.now();
        cache[job.id] = c; save();
        queue.shift(); status.pending = queue.length; status.last = job.id; status.done++; status.waiting = false; progress();
        if (!queue.length) onUpdate();   // redraw once everything asked for has arrived
      } catch (e) {
        if (!navigator.onLine) { queue = []; status.pending = 0; status.waiting = false; progress(); break; }   // offline: next time
        job.tries = (job.tries || 0) + 1;
        if (e.retry && job.tries <= BACKOFF.length) { status.waiting = true; progress(); await sleep(window.__histBackoff != null ? window.__histBackoff : BACKOFF[job.tries - 1]); continue; }
        queue.shift(); status.pending = queue.length; status.failed++; status.done++; status.waiting = false; progress();
        if (job.full) failed.add(job.id);   // unknown id (or kept failing): that coin is valued at its own price
        if (!queue.length) onUpdate();
      }
      if (queue.length) await sleep(window.__histGap != null ? window.__histGap : GAP_MS);
    }
  } finally { running = false; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// needs: [{ sym, id }] — every coin to price (BTC included); from: ms, the first moment the charts must cover.
// Fetches what's missing or stale; calls onChange whenever a coin's prices arrive.
export function ensure(needs, from, onChange) {
  if (onChange) onUpdate = onChange;
  const now = Date.now(), want = new Set();
  for (const { id } of needs) {
    if (!id || failed.has(id) || want.has(id) || queue.some(j => j.id === id)) continue;
    want.add(id);
    const c = cache[id];
    if (!c || !(c.from <= from + HOUR) || !c.pts.length) {
      const days = Math.min(90, Math.max(2, Math.ceil((now - from) / DAY) + 1));   // 2–90 days → hourly points
      queue.push({ id, days, from: now - days * DAY, full: true });
    } else if (now - c.at > REFRESH_MS) {
      queue.push({ id, days: 2, from: c.from, full: false });
    }
  }
  if (queue.length && !running) { status.total = queue.length; status.done = 0; }
  else if (queue.length) status.total = status.done + queue.length;
  status.pending = queue.length;
  if (queue.length) { progress(); work(); }
}

// { SYM: [[t, usd], …] } for the coins asked for (only those with history)
export function series(needs) {
  const out = {};
  for (const { sym, id } of needs) { const c = id && cache[id]; if (c && c.pts.length) out[sym] = c.pts; }
  return out;
}
// The moment up to which every asked coin has prices (the charts use recorded points after it)
export function coveredUntil(needs) {
  let until = Infinity;
  for (const { id } of needs) {
    if (!id || failed.has(id)) continue;
    const c = cache[id]; if (!c || !c.pts.length) return 0;
    until = Math.min(until, c.pts[c.pts.length - 1][0]);
  }
  return until === Infinity ? 0 : until;
}
export function covers(needs, from) {
  return needs.every(({ id }) => !id || failed.has(id) || (cache[id] && cache[id].pts.length && cache[id].from <= from + HOUR));
}
export function getStatus() { return { ...status }; }
export function clear() { cache = {}; ls.set(KEY, cache); }
