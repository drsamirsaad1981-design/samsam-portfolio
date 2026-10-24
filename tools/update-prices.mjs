// tools/update-prices.mjs — runs every hour in GitHub Actions (.github/workflows/prices.yml).
// Keeps an hourly USD price history for every coin the app knows (samsam-coins.js → CG_IDS), as small JSON files on
// the `prices` branch. The app reads these files first, so every device and every user gets the charts instantly,
// and CoinGecko is asked once an hour from here instead of by every visitor.
//
//   node tools/update-prices.mjs <dir>     <dir> = a checkout of the prices branch (files are written to <dir>/p/)
//
// File per coin: p/<coingecko-id>.json  { id, t0, step: 3600000, p: [usd, …], updated }  — p[i] is the price at t0 + i·step.
// p/index.json lists every coin with its first and last hour.
// No API key: CoinGecko's keyless API (≈10–30 calls a minute). Each run makes 1 call for all coins (last 7 days,
// hourly) plus, only for coins whose history doesn't reach START yet, one call per coin (paced, retried, time-boxed —
// whatever isn't done is finished on the next run).

import fs from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(process.argv[2] || 'out', 'p');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const START = Date.parse('2026-10-15T00:00:00Z');       // the portfolio's first day
const H = 3600e3, KEEP_HOURS = 400 * 24;
const API = process.env.CG_API || 'https://api.coingecko.com/api/v3';   // CG_API: a test server
const deadline = Date.now() + 12 * 60e3;                 // stay well inside the job's time limit
const sleep = ms => new Promise(r => setTimeout(r, process.env.CG_FAST ? Math.min(ms, 50) : ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ── which coins ──
function coinIds() {
  const src = fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8');
  const m = src.match(/var CG_IDS = \{([\s\S]*?)\};/);
  const ids = new Set(['bitcoin']);
  if (m) for (const x of m[1].matchAll(/"[^"]+"\s*:\s*"([a-z0-9-]+)"/g)) ids.add(x[1]);
  const extra = path.join(ROOT, 'tools', 'extra-price-ids.json');   // coins added by hand that aren't in CG_IDS
  if (fs.existsSync(extra)) for (const id of JSON.parse(fs.readFileSync(extra, 'utf8'))) if (/^[a-z0-9-]+$/.test(id)) ids.add(id);
  return [...ids].sort();
}

// ── one hourly grid per coin ──
function load(id) {
  try { const j = JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8')); if (j.t0 > 0 && Array.isArray(j.p)) return j; } catch (_) {}
  return null;
}
function toMap(file) {
  const m = new Map();
  if (file) file.p.forEach((v, i) => { if (v > 0) m.set(file.t0 + i * H, v); });
  return m;
}
function put(m, t, v, overwrite = true) {
  if (!(v > 0) || !(t > 0)) return;
  const k = Math.floor(t / H) * H;
  if (overwrite || !m.has(k)) m.set(k, v);
}
function toFile(id, m, full) {
  const keys = [...m.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  const last = keys[keys.length - 1];
  const t0 = Math.max(keys[0], last - (KEEP_HOURS - 1) * H);
  const p = []; let prev = 0;
  for (let t = t0; t <= last; t += H) { const v = m.get(t) || prev; p.push(v > 0 ? +v.toPrecision(8) : 0); if (v > 0) prev = v; }
  return { id, t0, step: H, p, full: !!full, updated: new Date().toISOString() };
}

// ── CoinGecko (keyless), with retries ──
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    let r;
    try { r = await fetch(url, { headers: { accept: 'application/json' } }); } catch (e) { r = null; }
    if (r && r.ok) return r.json();
    if (r && r.status === 404) return null;
    const wait = [20e3, 45e3, 75e3, 90e3][i];
    log('retry', r ? r.status : 'network', url.replace(API, ''), 'in', wait / 1000, 's');
    if (Date.now() + wait > deadline) break;
    await sleep(wait);
  }
  return undefined;   // gave up for now
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const ids = coinIds();
  const files = new Map(ids.map(id => [id, load(id)]));
  const maps = new Map(ids.map(id => [id, toMap(files.get(id))]));
  const full = new Set(ids.filter(id => files.get(id) && files.get(id).full));   // full history already fetched once
  let unknown = [];
  try { unknown = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')).unknown || []; } catch (_) {}
  for (const id of unknown) full.add(id);                                        // CoinGecko doesn't know these — don't ask again
  log(ids.length, 'coins');

  // 1. every coin's last 7 days, hourly — one call (up to 250 ids)
  for (let i = 0; i < ids.length; i += 250) {
    const chunk = ids.slice(i, i + 250);
    const rows = await get(`${API}/coins/markets?vs_currency=usd&ids=${chunk.join(',')}&sparkline=true&per_page=250&page=1`);
    if (!Array.isArray(rows)) { log('markets: no answer'); continue; }
    for (const r of rows) {
      const m = maps.get(r.id); if (!m) continue;
      const sp = (r.sparkline_in_7d && r.sparkline_in_7d.price) || [];
      const end = Date.parse(r.last_updated) || Date.now();
      // the sparkline is hourly and ends at the last update; keep hours we already have from a full history call
      sp.forEach((v, j) => put(m, end - (sp.length - 1 - j) * H, v, false));
      put(m, end, r.current_price, true);
    }
    log('markets:', rows.length, 'coins');
  }

  // 2. coins whose history doesn't reach the first day yet: one call each, hourly (≤ 90 days)
  const need = ids.filter(id => !full.has(id));
  log(need.length, 'coins need their full history');
  const days = Math.min(90, Math.max(2, Math.ceil((Date.now() - START) / 864e5) + 1));
  for (const id of need) {
    if (Date.now() > deadline) { log('out of time — the rest next hour'); break; }
    const j = await get(`${API}/coins/${id}/market_chart?vs_currency=usd&days=${days}`);
    if (j === undefined) { log('busy — the rest next hour'); break; }
    if (j && Array.isArray(j.prices)) {
      const m = maps.get(id);
      for (const [t, v] of j.prices) put(m, t, v, true);   // real timestamps win over the sparkline's
      log('history', id, j.prices.length);
    } else { log('unknown to CoinGecko:', id); if (!unknown.includes(id)) unknown.push(id); }
    full.add(id);
    await sleep(7000);
  }

  // 3. write
  const index = { updated: new Date().toISOString(), step: H, coins: {}, unknown: unknown.filter(id => ids.includes(id)) };
  for (const [id, m] of maps) {
    const f = toFile(id, m, full.has(id)); if (!f) continue;
    fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify(f));
    index.coins[id] = [f.t0, f.t0 + (f.p.length - 1) * H];
  }
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(index));
  log('wrote', Object.keys(index.coins).length, 'files');
}
main().catch(e => { console.error(e); process.exit(1); });
