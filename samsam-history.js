// samsam-history.js — hourly market-price history for every coin you hold or held, so the charts are rebuilt from
// your transactions × real prices, the way CoinMarketCap does it.
//
// 1. Shared prices first: an hourly GitHub job (.github/workflows/prices.yml → tools/update-prices.mjs) keeps one small
//    file per coin on the repo's `prices` branch. Every device reads those — instant, nothing asked of CoinGecko.
// 2. Only a coin the shared files don't cover (e.g. one you just added that the job doesn't know yet) is fetched from
//    CoinGecko directly (market_chart):
// • One request per coin for the whole period (hourly points up to 90 days), then only the last 2 days on refresh.
// • Kept on this device in IndexedDB (plenty of room; the small localStorage area can be full when several apps share
//   the github.io address) — prices are market data, not portfolio data, so nothing goes to the cloud.
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
let cache = {}, cacheReady = false;
// ── IndexedDB (one record per coin) ──
const IDB = 'samsam-prices', STORE = 'hist';
function idb() {
  return new Promise((ok, no) => {
    if (!window.indexedDB) return no(new Error('no IndexedDB'));
    const r = indexedDB.open(IDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
let dbP = null;
function db() { return dbP || (dbP = idb()); }
(async () => {
  try {
    const d = await db();
    await new Promise(ok => {
      const tx = d.transaction(STORE, 'readonly'), st = tx.objectStore(STORE), req = st.openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { cache[c.key] = c.value; c.continue(); } else ok(); };
      req.onerror = () => ok();
    });
  } catch (_) {
    cache = ls.get(KEY, {}) || {};   // no IndexedDB (rare): the old localStorage copy
  }
  try { localStorage.removeItem(KEY); } catch (_) {}   // the old copy lived here — free that space
  cacheReady = true;
  if (lastAsk) ensure(lastAsk.needs, lastAsk.from);
})();
function saveOne(id) {
  db().then(d => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(cache[id], id); })
    .catch(() => {});   // can't keep it: it's simply fetched again next time
}

// ── shared files (prices branch) ──
// https://raw.githubusercontent.com/<owner>/<repo>/prices/p/<coingecko-id>.json  { t0, step, p: [usd, …] }
const SHARED = (() => {
  if (window.__sharedPrices) return window.__sharedPrices;
  const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname), repo = location.pathname.split('/')[1];
  return `https://raw.githubusercontent.com/${m ? m[1] : 'drsamirsaad1981-design'}/${m && repo ? repo : 'samsam-portfolio'}/prices/p/`;
})();
let shared = {}, sharedIndex = null, sharedAt = 0, sharedLoading = null, lastAsk = null;
async function getJson(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
async function loadShared(ids) {
  try {
    sharedIndex = (await getJson(SHARED + 'index.json?h=' + Math.floor(Date.now() / 6e5))).coins || {};
  } catch (_) { sharedIndex = sharedIndex || {}; }   // no shared files yet (or offline): CoinGecko directly
  sharedAt = Date.now();
  const todo = ids.filter(id => sharedIndex[id] && !(shared[id] && shared[id].t1 >= sharedIndex[id][1]));
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(todo.slice(i, i + 8).map(async id => {
      try {
        const f = await getJson(SHARED + encodeURIComponent(id) + '.json?v=' + sharedIndex[id][1]);
        const step = f.step || HOUR, pts = [];
        (f.p || []).forEach((v, k) => { if (v > 0) pts.push([f.t0 + k * step, v]); });
        if (pts.length) shared[id] = { pts, t0: pts[0][0], t1: pts[pts.length - 1][0] };
      } catch (_) { /* that coin: CoinGecko directly */ }
    }));
  }
}
// The newest hours for coins whose shared file is behind (GitHub sometimes runs the hourly job late): one CoinGecko
// request for all of them — the last 7 days, hourly (markets + sparkline) — at most every 50 minutes.
let recentAt = 0, recentBusy = false;
async function fillRecent(ids) {
  if (recentBusy || Date.now() - recentAt < REFRESH_MS) return;
  recentBusy = true;
  try {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.slice(0, 250).map(encodeURIComponent).join(',')}&sparkline=true&per_page=250&page=1`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const rows = await r.json();
    recentAt = Date.now();
    for (const row of rows || []) {
      const sp = (row.sparkline_in_7d && row.sparkline_in_7d.price) || [], end = Date.parse(row.last_updated) || Date.now();
      const pts = sp.map((v, j) => [end - (sp.length - 1 - j) * HOUR, +v]).filter(p => p[1] > 0);
      if (row.current_price > 0) pts.push([end, +row.current_price]);
      if (!pts.length || !ids.includes(row.id)) continue;
      cache[row.id] = { from: pts[0][0], at: recentAt, pts };
      saveOne(row.id);
    }
    onUpdate();
  } catch (_) { recentAt = Date.now() - REFRESH_MS + 5 * 60e3; }   // busy / offline: try again in 5 minutes
  finally { recentBusy = false; }
}

// prices for one coin: the shared file, plus anything newer fetched directly
function best(id) {
  const sh = shared[id], c = cache[id];
  if (sh) {
    const extra = c && c.pts.length ? c.pts.filter(p => p[0] > sh.t1) : [];
    const pts = extra.length ? sh.pts.concat(extra) : sh.pts;
    return { pts, from: sh.t0, last: pts[pts.length - 1][0] };
  }
  if (c && c.pts.length) return { pts: c.pts, from: c.from, last: c.pts[c.pts.length - 1][0] };
  return null;
}
const failed = new Set();   // ids CoinGecko doesn't know (or that kept failing) this session — valued at their own price instead
let queue = [], running = false, onUpdate = () => {}, status = { pending: 0, failed: 0, last: '', total: 0, done: 0, waiting: false };
function progress() {
  try { window.dispatchEvent(new CustomEvent('samsam-history', { detail: { done: status.done, total: status.total, waiting: status.waiting, pending: status.pending, building: queue.some(j => j.full) } })); } catch (_) {}
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
        cache[job.id] = c; saveOne(job.id);
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
  lastAsk = { needs, from };
  const ids = [...new Set(needs.map(n => n.id).filter(Boolean))];
  // shared files: read first (then ask again for whatever they don't cover); refreshed every 20 minutes
  if (!sharedLoading && (sharedIndex === null || Date.now() - sharedAt > 20 * 60e3 || ids.some(id => sharedIndex[id] && !shared[id]))) {
    const first = sharedIndex === null;
    sharedLoading = loadShared(ids).finally(() => { sharedLoading = null; onUpdate(); if (first && lastAsk) ensure(lastAsk.needs, lastAsk.from); });
    if (first) return;   // don't start asking CoinGecko before we know what the shared files have
  }
  if (sharedIndex === null || !cacheReady) return;   // wait for the shared files' list and this device's saved prices
  const now = Date.now(), want = new Set(), loadingNow = !!sharedLoading, stale = [];
  for (const { id } of needs) {
    if (!id || failed.has(id) || want.has(id) || queue.some(j => j.id === id)) continue;
    want.add(id);
    if (loadingNow && sharedIndex[id] && !shared[id]) continue;   // its shared file is on its way
    const sh = shared[id];
    const c = cache[id];
    if (sh && sh.t0 <= from + HOUR) {
      // the shared file covers it; if the job is a few hours behind, the newest hours come from one request for all such coins
      const newest = Math.max(sh.t1, c && c.pts.length ? c.pts[c.pts.length - 1][0] : 0);
      if (now - newest > 2 * HOUR) stale.push(id);
      continue;
    }
    if (!c || !(c.from <= from + HOUR) || !c.pts.length) {
      const days = Math.min(90, Math.max(2, Math.ceil((now - from) / DAY) + 1));   // 2–90 days → hourly points
      queue.push({ id, days, from: now - days * DAY, full: true });
    } else if (now - c.at > REFRESH_MS) {
      queue.push({ id, days: 2, from: c.from, full: false });
    }
  }
  if (stale.length) fillRecent(stale);
  if (queue.length && !running) { status.total = queue.length; status.done = 0; }
  else if (queue.length) status.total = status.done + queue.length;
  status.pending = queue.length;
  if (queue.length) { progress(); work(); }
}

// { SYM: [[t, usd], …] } for the coins asked for (only those with history)
export function series(needs) {
  const out = {};
  for (const { sym, id } of needs) { const b = id && best(id); if (b) out[sym] = b.pts; }
  return out;
}
// The moment up to which every asked coin has prices (the charts use recorded points after it)
export function coveredUntil(needs) {
  let until = Infinity;
  for (const { id } of needs) {
    if (!id || failed.has(id)) continue;
    const b = best(id); if (!b) return 0;
    until = Math.min(until, b.last);
  }
  return until === Infinity ? 0 : until;
}
export function covers(needs, from) {
  return needs.every(({ id }) => { if (!id || failed.has(id)) return true; const b = best(id); return !!b && b.from <= from + HOUR; });
}
export function getStatus() { return { ...status }; }
export function clear() { cache = {}; db().then(d => d.transaction(STORE, 'readwrite').objectStore(STORE).clear()).catch(() => {}); }
