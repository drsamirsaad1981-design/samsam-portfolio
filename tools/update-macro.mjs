// Three readings from outside Bitcoin's own price file — MVRV, the US dollar index, the BTC funding rate — written to
// <out>/m/macro.json (+ <out>/m/mvrv.json, MVRV's whole daily history, kept here so the reading never depends on one
// answer). Runs in "Price history" before the market snapshot, which copies the three small parts into m/market.json
// (the Worker has no outside call to spare). The lab that chose these sources: tools/lab/macro.mjs (27 Nov 2026).
//
//   node tools/update-macro.mjs <out>
//
//   mvrv     Coin Metrics' community API (free, no key, CC BY-NC 4.0 — the source is named wherever it shows): the ratio
//            itself (CapMVRVCur) for every day, one day behind. Asked for the missing days only. When Coin Metrics has
//            been silent for two days, blockchain.com's chart stands in for the DAY'S value (it agrees within ~0.2%
//            since 2022) — never for the history, which stays Coin Metrics' and is corrected when it answers again.
//   dxy      Yahoo's DX-Y.NYB (the metals' request). When the symbol is silent: ICE's formula over the six currencies
//            from Yahoo's own pairs (within ~0.07% of the index).
//   funding  BTC perpetuals on OKX, Bitget, Gate, Hyperliquid, Deribit — the venues that answer a US address — as one
//            rate weighted by open interest. Binance and Bybit refuse GitHub; the relay in Doha (tools/binance-relay)
//            can hand them over on a public read path: when it answers, they join the mix and `missing` shrinks by
//            itself. Until then it answers 405 and they stay out — and the card and the bot say so.
//
// Every part keeps its last good answer when its source is silent; the readers (samsam-core.js → mvrvRead, dxyNow,
// fundingNow) ignore a part that has grown too old.
import fs from 'node:fs';
import path from 'node:path';
import * as C from '../samsam-core.js';

const DAY = 864e5, FAST = !!process.env.MACRO_FAST;
const CM = process.env.CM_API || 'https://community-api.coinmetrics.io/v4';
const BC = process.env.BC_API || 'https://api.blockchain.info';
const YH = (process.env.YH_API || 'https://query1.finance.yahoo.com,https://query2.finance.yahoo.com').split(',');
const OKX = process.env.OKX_API || 'https://www.okx.com/api/v5';
const BG = process.env.BG_API || 'https://api.bitget.com/api/v2/mix/market';
const GT = process.env.GATE_API || 'https://api.gateio.ws/api/v4/futures/usdt';
const HL = process.env.HL_INFO || 'https://api.hyperliquid.xyz/info';
const DB = process.env.DB_API || 'https://www.deribit.com/api/v2/public';
const RELAY = process.env.BN_RELAY || 'https://me-central1-samsam-portfolio.cloudfunctions.net/binanceRelay';
const log = (...a) => console.log('[macro]', ...a);
const sleep = ms => new Promise(z => setTimeout(z, FAST ? 5 : ms));
const dn = iso => Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / DAY), iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const r4 = v => +(+v).toFixed(4), r6 = v => +(+v).toPrecision(6);
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };

// one request; null when there is no usable answer (never a throw)
async function get(url, { post = null, tries = 2 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: post ? 'POST' : 'GET', body: post ? JSON.stringify(post) : undefined, headers: { 'user-agent': 'Mozilla/5.0 (cute-portfolio macro)', accept: 'application/json', ...(post ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) return null;
    } catch (_) {}
    if (i + 1 < tries) await sleep(2000 * (i + 1));
  }
  return null;
}

// ═══ MVRV ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
export const MVRV_FROM = '2011-01-01';   // before 2011 the ratio is not a reading (almost no coin had moved: it starts in the hundreds)
const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].map(dn);
// days: Map(day → ratio) · the small part every reader uses. A cycle runs from one halving to the next; its highest and
// lowest are named by the year they happened (like the Pi Cycle's).
export function mvrvSummary(days, { price = null, via = null, nowMs = Date.now() } = {}) {
  const ds = [...days.keys()].filter(d => d >= dn(MVRV_FROM) && days.get(d) > 0).sort((a, b) => a - b); if (ds.length < 30) return null;
  const last = ds[ds.length - 1], now = days.get(last), back = n => { for (let d = last - n; d > last - n - 4; d--) if (days.get(d) > 0) return r4(days.get(d)); return null; };
  const peaks = [], lows = [];
  for (let c = 0; c <= HALVINGS.length; c++) {
    const a = c ? HALVINGS[c - 1] : -Infinity, b = c < HALVINGS.length ? HALVINGS[c] : Infinity, in_ = ds.filter(d => d >= a && d < b); if (!in_.length) continue;
    const hi = in_.reduce((x, y) => days.get(y) > days.get(x) ? y : x), lo = in_.reduce((x, y) => days.get(y) < days.get(x) ? y : x);
    peaks.push([+iso(hi).slice(0, 4), r4(days.get(hi)), iso(hi)]); lows.push([+iso(lo).slice(0, 4), r4(days.get(lo)), iso(lo)]);
  }
  const lastAt = f => { for (let i = ds.length - 1; i >= 0; i--) if (f(days.get(ds[i]))) return iso(ds[i]); return null; };
  return { v: 1, day: iso(last), now: r4(now), price: price > 0 ? Math.round(price) : null, realized: price > 0 ? Math.round(price / now) : null, wk: back(7), mo: back(30),
    peaks, lows, over35: lastAt(v => v >= 3.5), over3: lastAt(v => v >= 3), under1: lastAt(v => v < 1), src: 'Coin Metrics', ...(via ? { via } : {}), at: new Date(nowMs).toISOString() };
}
async function coinMetrics(fromDay) {   // { days: Map(day → ratio), px: Map(day → price) } | null
  const days = new Map(), px = new Map(); let url = `${CM}/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,PriceUSD&frequency=1d&start_time=${iso(fromDay)}&page_size=10000`, any = false;
  for (let i = 0; i < 4 && url; i++) { const j = await get(url); if (!j || !Array.isArray(j.data)) break; any = true;
    for (const x of j.data) { const d = dn(x.time); if (+x.CapMVRVCur > 0 && +x.CapMVRVCur < 1000) days.set(d, +x.CapMVRVCur); if (+x.PriceUSD > 0) px.set(d, +x.PriceUSD); }
    url = j.next_page_url || null; if (url) await sleep(700); }
  return any ? { days, px } : null;
}
async function blockchainMvrv() {
  const j = await get(`${BC}/charts/mvrv?timespan=30days&sampled=false&metadata=false&cors=true&format=json`);
  return new Map(j && Array.isArray(j.values) ? j.values.filter(v => v.y > 0 && v.y < 1000).map(v => [Math.floor(v.x * 1000 / DAY), +v.y]) : []);
}
// kept: m/mvrv.json { v, start, src, cm (the last day Coin Metrics gave), p[] (one ratio a day from `start`), px (that day's price) }
export async function mvrvPart(OUT, old, nowMs) {
  const F = path.join(OUT, 'mvrv.json'), kept = readJson(F), from = dn(MVRV_FROM), want = Math.floor(nowMs / DAY) - 1, days = new Map();
  if (kept && kept.v === 1 && kept.start === MVRV_FROM && Array.isArray(kept.p)) kept.p.forEach((v, i) => { if (v > 0) days.set(from + i, +v); });
  let cm = days.size ? Math.max(...days.keys()) : null, px = kept && kept.px > 0 ? +kept.px : null, changed = false;
  if (cm == null || cm < want) {
    const a = await coinMetrics(cm == null ? from : cm + 1);
    if (a) { let n = 0; for (const [d, v] of a.days) if (d >= from && d <= want) { days.set(d, v); n++; }
      if (n) { cm = Math.max(...days.keys()); px = a.px.get(cm) || null; changed = true; log('mvrv: Coin Metrics', n, 'day(s) → to', iso(cm)); } else log('mvrv: Coin Metrics has no new day yet (last', cm == null ? '—' : iso(cm), ')'); }
    else log('mvrv: Coin Metrics did not answer');
  }
  if (cm == null) return old || null;   // nothing yet, ever
  if (changed) { const p = []; for (let d = from; d <= cm; d++) p.push(days.has(d) ? r4(days.get(d)) : null); fs.writeFileSync(F, JSON.stringify({ v: 1, start: MVRV_FROM, src: 'Coin Metrics community API (CapMVRVCur), CC BY-NC 4.0', cm: iso(cm), px, p })); }
  // two days of silence: blockchain.com's chart for the day's value only (not kept in the history)
  let via = null, price = px;
  if (cm < want - 1) { const alt = await blockchainMvrv(), late = [...alt.keys()].filter(d => d > cm && d <= want).sort((a, b) => a - b);
    if (late.length) { for (const d of late) days.set(d, alt.get(d)); via = 'blockchain.com'; price = null; log('mvrv: Coin Metrics silent since', iso(cm), '→ blockchain.com for', iso(late[late.length - 1])); } }
  if (via) { const bd = readJson(path.join(OUT, 'btcday.json')), last = Math.max(...days.keys()); if (bd && Array.isArray(bd.p) && bd.start) { const v = bd.p[last - dn(bd.start)]; if (v > 0) price = v; } }
  if (!changed && !via && old && old.day >= iso(cm)) return old;   // nothing new (or: both silent after a stand-in day — the stand-in stays)
  return mvrvSummary(days, { price, via, nowMs }) || old || null;
}

// ═══ the dollar index ══════════════════════════════════════════════════════════════════════════════════════════════════
// ICE's formula: 50.14348112 × EURUSD^-0.576 × USDJPY^0.136 × GBPUSD^-0.119 × USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036.
// With every rate written as "units of the currency for one dollar" all six powers are positive.
export const DXY_W = Object.freeze({ EUR: 0.576, JPY: 0.136, GBP: 0.119, CAD: 0.091, SEK: 0.042, CHF: 0.036 });
export const dxyFormula = r => r && Object.keys(DXY_W).every(k => r[k] > 0) ? 50.14348112 * Object.entries(DXY_W).reduce((a, [k, w]) => a * Math.pow(r[k], w), 1) : null;
async function yahooChart(sym, range) {   // { rows: [[day, close]], price, t (ms) } | null
  for (const base of YH) {
    const j = await get(`${base}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`, { tries: 1 }), res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) continue;
    const ts = res.timestamp || [], cl = (res.indicators && res.indicators.quote && res.indicators.quote[0].close) || [], rows = ts.map((t, i) => [Math.floor(t * 1000 / DAY), +cl[i]]).filter(x => x[1] > 0), m = res.meta || {};
    if (rows.length < 5) continue;
    return { rows, price: m.regularMarketPrice > 0 ? +m.regularMarketPrice : rows[rows.length - 1][1], t: m.regularMarketTime ? m.regularMarketTime * 1000 : rows[rows.length - 1][0] * DAY + DAY / 2 };
  }
  return null;
}
// rows: one close a day, the last one possibly today's still-moving price. The day's change is against the last FINISHED
// day before the quote's own day — Yahoo sends no previousClose with a long range (its chartPreviousClose is the close
// before the range starts).
export function dxyFrom(rows, price, t, src) {
  if (!rows || rows.length < 6 || !(price > 0)) return null;
  const day = Math.floor(t / DAY), done = rows.filter(x => x[0] < day), prev = done.length ? done[done.length - 1][1] : null, wk = done.length >= 5 ? done[done.length - 5][1] : null;
  const yr = rows.filter(x => x[0] > day - 366).map(x => x[1]).concat(price);
  return { v: 1, price: r6(price), prev: prev ? r6(prev) : null, ch24: prev ? +((price / prev - 1) * 100).toFixed(3) : null, ch7: wk ? +((price / wk - 1) * 100).toFixed(3) : null,
    lo52: rows.length > 200 ? r6(Math.min(...yr)) : null, hi52: rows.length > 200 ? r6(Math.max(...yr)) : null, spark: rows.slice(-22).map(x => r6(x[1])), at: new Date(t).toISOString(), src };
}
export async function dxyPart(old) {
  const y = await yahooChart('DX-Y.NYB', '1y');
  if (y) { const d = dxyFrom(y.rows, y.price, y.t, 'Yahoo Finance (DX-Y.NYB)'); if (d) { log('dxy', d.price, 'day', d.ch24, 'week', d.ch7); return d; } }
  // the symbol is silent: the formula over Yahoo's six pairs (a month is enough for the day and the week)
  const P = { EUR: ['EURUSD=X', 1], JPY: ['JPY=X', 0], GBP: ['GBPUSD=X', 1], CAD: ['CAD=X', 0], SEK: ['SEK=X', 0], CHF: ['CHF=X', 0] }, live = {}, hist = {}; let t = 0;
  for (const [k, [sym, inv]] of Object.entries(P)) { const c = await yahooChart(sym, '1mo'); if (!c) { log('dxy: no answer (index and', sym + ')'); return old || null; }
    live[k] = inv ? 1 / c.price : c.price; hist[k] = new Map(c.rows.map(x => [x[0], inv ? 1 / x[1] : x[1]])); t = Math.max(t, c.t); await sleep(400); }
  const rows = [...hist.EUR.keys()].sort((a, b) => a - b).map(d => [d, dxyFormula(Object.fromEntries(Object.keys(DXY_W).map(k => [k, hist[k].get(d)])))]).filter(x => x[1] > 0);
  const d = dxyFrom(rows, dxyFormula(live), t, "ICE's formula over six currency pairs (Yahoo Finance)");
  if (!d) return old || null;
  if (old) { d.lo52 = old.lo52 != null ? Math.min(old.lo52, d.price) : null; d.hi52 = old.hi52 != null ? Math.max(old.hi52, d.price) : null; }
  log('dxy (by the formula)', d.price); return d;
}

// ═══ BTC funding ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// Every venue: { k, rate (% per 8 h, now), oi (USD), m7 (the mean of its last 7 days, % per 8 h) } | null
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const m7of = (hist, nowMs) => mean(hist.filter(p => p[0] > nowMs - 7 * DAY && isFinite(p[1])).map(p => p[1]));
const VENUES = {
  OKX: async now => { const a = await get(`${OKX}/public/funding-rate?instId=BTC-USDT-SWAP`), f = a && a.data && a.data[0]; if (!f) return null;
    const h = await get(`${OKX}/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100`), o = await get(`${OKX}/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP`);
    return { rate: +f.fundingRate * 100, oi: o && o.data && o.data[0] ? +o.data[0].oiUsd : null, m7: m7of(((h && h.data) || []).map(x => [+x.fundingTime, (x.realizedRate !== '' && x.realizedRate != null ? +x.realizedRate : +x.fundingRate) * 100]), now) }; },
  Bitget: async now => { const a = await get(`${BG}/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures`), f = a && a.data && a.data[0]; if (!f) return null;
    const h = await get(`${BG}/history-fund-rate?symbol=BTCUSDT&productType=usdt-futures&pageSize=100`), o = await get(`${BG}/open-interest?symbol=BTCUSDT&productType=usdt-futures`), tk = await get(`${BG}/ticker?symbol=BTCUSDT&productType=usdt-futures`);
    const px = tk && tk.data && tk.data[0] ? +tk.data[0].lastPr : null, sz = o && o.data && o.data.openInterestList && o.data.openInterestList[0] ? +o.data.openInterestList[0].size : null;
    return { rate: +f.fundingRate * 100, oi: px && sz ? px * sz : null, m7: m7of((h && Array.isArray(h.data) ? h.data : []).map(x => [+x.fundingTime, +x.fundingRate * 100]), now) }; },
  Gate: async now => { const a = await get(`${GT}/contracts/BTC_USDT`); if (!a || a.funding_rate == null) return null;
    const h = await get(`${GT}/funding_rate?contract=BTC_USDT&limit=100`), k = +a.funding_interval > 0 ? 28800 / +a.funding_interval : 1;   // (a venue that pays more often than every 8 h: scaled to 8 h)
    return { rate: +a.funding_rate * 100 * k, oi: +a.position_size * +a.quanto_multiplier * +a.mark_price || null, m7: m7of((Array.isArray(h) ? h : []).map(x => [+x.t * 1000, +x.r * 100 * k]), now) }; },
  Hyperliquid: async now => { const a = await get(HL, { post: { type: 'metaAndAssetCtxs' } }), i = Array.isArray(a) && a[0] && Array.isArray(a[0].universe) ? a[0].universe.findIndex(u => u.name === 'BTC') : -1, c = i >= 0 && a[1] ? a[1][i] : null; if (!c) return null;
    const h = await get(HL, { post: { type: 'fundingHistory', coin: 'BTC', startTime: now - 7 * DAY } });   // paid every hour: × 8
    return { rate: +c.funding * 800, oi: +c.openInterest * +c.markPx || null, m7: m7of((Array.isArray(h) ? h : []).map(x => [+x.time, +x.fundingRate * 800]), now) }; },
  Deribit: async now => { const a = await get(`${DB}/ticker?instrument_name=BTC-PERPETUAL`), t = a && a.result; if (!t || t.funding_8h == null) return null;
    const h = await get(`${DB}/get_funding_rate_history?instrument_name=BTC-PERPETUAL&start_timestamp=${now - 7 * DAY}&end_timestamp=${now}`);
    return { rate: +t.funding_8h * 100, oi: +t.open_interest || null, m7: m7of((h && Array.isArray(h.result) ? h.result : []).map(x => [+x.timestamp, +x.interest_8h * 100]), now) }; },
};
// The venues GitHub cannot reach itself. The relay's public read path answers { venues: [{ k, rate, oi, m7 }] } — numbers
// only, already in % per 8 h and USD; a name outside this list is ignored.
export const FAR_VENUES = Object.freeze(['Binance', 'Bybit']);
async function viaRelay() { const j = await get(`${RELAY}?pub=btcFunding`, { tries: 1 }); return j && Array.isArray(j.venues) ? j.venues.filter(x => x && FAR_VENUES.includes(x.k)) : []; }
const sane = x => x && isFinite(x.rate) && Math.abs(x.rate) <= 2;
// rows → the one rate: weighted by open interest among the venues that gave both numbers (a venue with a rate and no
// open interest is listed but cannot weigh). Under 3 venues it is not a mix: null.
export function fundingMix(rows, nowMs = Date.now()) {
  const v = rows.filter(sane).map(x => ({ k: x.k, rate: r4(x.rate), oi: x.oi > 1e6 && x.oi < 1e12 ? Math.round(x.oi) : null, m7: x.m7 != null && isFinite(x.m7) && Math.abs(x.m7) <= 2 ? r4(x.m7) : null }));
  const w = v.filter(x => x.oi); if (v.length < 3 || w.length < 3) return null;
  const tot = w.reduce((a, x) => a + x.oi, 0), w7 = w.filter(x => x.m7 != null), tot7 = w7.reduce((a, x) => a + x.oi, 0);
  return { v: 1, rate: r4(w.reduce((a, x) => a + x.rate * x.oi, 0) / tot), m7: w7.length >= 3 ? r4(w7.reduce((a, x) => a + x.m7 * x.oi, 0) / tot7) : null, oi: tot, n: w.length,
    venues: v.sort((a, b) => (b.oi || 0) - (a.oi || 0)), missing: FAR_VENUES.filter(k => !w.some(x => x.k === k)), at: new Date(nowMs).toISOString() };
}
export async function fundingPart(old, nowMs) {
  const rows = [];
  for (const [k, fn] of Object.entries(VENUES)) { let x = null; try { x = await fn(nowMs); } catch (_) {} if (sane(x)) rows.push({ k, ...x }); else log('funding:', k, 'did not answer'); }
  for (const x of await viaRelay().catch(() => [])) if (sane(x)) rows.push(x);
  const f = fundingMix(rows, nowMs);
  if (!f) { log('funding: only', rows.length, 'venue(s) — kept the last one'); return old || null; }
  log('funding', f.rate, '%/8h ·', f.venues.map(x => x.k + ' ' + x.rate).join(', '), '· without', f.missing.join(', ') || '—'); return f;
}

export async function main(dir, nowMs = Date.now()) {
  const OUT = path.resolve(dir, 'm'), F = path.join(OUT, 'macro.json'); fs.mkdirSync(OUT, { recursive: true });
  const old = readJson(F) || {}, out = { v: 1, updated: new Date(nowMs).toISOString() };
  for (const [k, fn] of [['mvrv', () => mvrvPart(OUT, old.mvrv, nowMs)], ['dxy', () => dxyPart(old.dxy)], ['funding', () => fundingPart(old.funding, nowMs)]]) {
    try { const v = await fn(); if (v) out[k] = v; } catch (e) { log(k + ':', e && e.message); if (old[k]) out[k] = old[k]; }
  }
  fs.writeFileSync(F, JSON.stringify(out));
  const m = C.mvrvRead(out.mvrv, nowMs); log('written ·', m ? `MVRV ${m.v} (${m.day}${m.via ? ', via ' + m.via : ''})` : 'no MVRV', '·', out.dxy ? 'DXY ' + out.dxy.price : 'no DXY', '·', out.funding ? 'funding ' + out.funding.rate : 'no funding');
  return out;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || 'out').catch(e => { log('FAILED:', e.message); process.exit(1); });
}
