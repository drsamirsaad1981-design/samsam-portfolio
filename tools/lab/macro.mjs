// 🧪 Three more readings — a TRIAL run (lab). Nothing here is used by the app or the bot and nothing is written to the
// prices branch: it only answers "can we get these numbers, free and every day, and how far can we trust them?" before
// any card or alert is built. The same step as tools/lab/rainbow.mjs took for the rainbow.
//
//   node tools/lab/macro.mjs macro.md          (GitHub → Actions → "Macro lab" → Run workflow)
//
//   A. MVRV (Bitcoin's market value ÷ its realized value)   — who gives it free, how fresh, do the sources agree,
//      what each cycle reached, how often it was under 1 and over 3.5
//   B. The US dollar index (DXY)                             — Yahoo's DX-Y.NYB and DX=F, stooq; price, day, week, year
//   C. BTC perpetual funding rate                            — Binance, OKX, Bybit, Bitget, Gate, Hyperliquid, Deribit: who
//      answers from GitHub (a US address), the rate now, the history each gives, and — from Binance's public monthly
//      archive, which is not its API — what "calm" and "stretched" looked like in every year since 2020
import fs from 'node:fs';
import zlib from 'node:zlib';

const DAY = 864e5, H = 36e5, NOW = Date.now();
const dn = iso => Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / DAY), iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const HALV = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].map(dn), CYC = ['Jan 2011 – Nov 2012', 'Nov 2012 – Jul 2016', 'Jul 2016 – May 2020', 'May 2020 – Apr 2024', 'since Apr 2024'];
const f2 = (v, d = 2) => v == null || !isFinite(v) ? '—' : (+v).toFixed(d), pc = (v, d = 2) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + (+v).toFixed(d) + '%';
const usd = v => v == null || !isFinite(v) ? '—' : '$' + (v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : Math.round(v).toLocaleString('en-US'));
const L = [], say = (...a) => a.forEach(s => { L.push(s); console.log(s); });
const OUT = { run: new Date(NOW).toISOString() };

// one request, never a throw: { ok, status, j (json) | t (text), err, ms }
async function get(url, { as = 'json', method = 'GET', body = null, tries = 2 } = {}) {
  let last = { ok: false, status: 0, err: 'no answer' };
  for (let i = 0; i < tries; i++) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { method, body: body ? JSON.stringify(body) : undefined, headers: { 'user-agent': 'Mozilla/5.0 (cute-portfolio macro lab)', accept: 'application/json,text/csv,*/*', ...(body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(40000) });
      const b = as === 'bin' ? Buffer.from(await r.arrayBuffer()) : null, txt = b ? '' : await r.text(); let j = null; if (as === 'json') { try { j = JSON.parse(txt); } catch (_) {} }
      last = { ok: r.ok && (as !== 'json' || j != null), status: r.status, j, t: txt, b, ms: Date.now() - t0, err: r.ok ? (as === 'json' && j == null ? 'not JSON: ' + txt.slice(0, 80).replace(/\s+/g, ' ') : null) : txt.slice(0, 140).replace(/\s+/g, ' ') };
      if (r.ok || (r.status !== 429 && r.status < 500)) return last;
    } catch (e) { last = { ok: false, status: 0, err: String(e && e.message).slice(0, 100), ms: Date.now() - t0 }; }
    await new Promise(z => setTimeout(z, 2500 * (i + 1)));
  }
  return last;
}
const why = r => r.ok ? 'yes' : `**no** (${r.status || 'network'}${r.err ? ': ' + r.err.slice(0, 90) : ''})`;
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const sleep = ms => new Promise(z => setTimeout(z, ms));
// the first file inside a small zip (Binance's archive): the central directory says where it is and how long
function unzip1(b) {
  try { let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--; if (e < 0) return null;
    const cd = b.readUInt32LE(e + 16); if (b.readUInt32LE(cd) !== 0x02014b50) return null;
    const method = b.readUInt16LE(cd + 10), size = b.readUInt32LE(cd + 20), lh = b.readUInt32LE(cd + 42), at = lh + 30 + b.readUInt16LE(lh + 26) + b.readUInt16LE(lh + 28), raw = b.subarray(at, at + size);
    return (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8'); } catch (_) { return null; }
}
const pctl = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p / 100 * (s.length - 1))))] : null; };

say('# Macro lab — MVRV, the dollar index, BTC funding', '', `Run at ${new Date(NOW).toISOString().slice(0, 16)}Z from GitHub. A lab report: nothing in the app or the bot uses it.`, '');

// ═══ A. MVRV ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
say('## A. MVRV', '');
const CM = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics';
async function cmMetric(metric) {   // Map(day → value), every page
  const out = new Map(); let url = `${CM}?assets=btc&metrics=${metric}&frequency=1d&start_time=2010-07-18&page_size=10000`, first = null;
  for (let i = 0; i < 6 && url; i++) { const r = await get(url); if (!first) first = r; if (!r.ok) break; (r.j.data || []).forEach(x => { if (+x[metric] > 0) out.set(dn(x.time), +x[metric]); }); url = r.j.next_page_url || null; }
  return { r: first, m: out };
}
const mv = {};
for (const k of ['CapMVRVCur', 'CapMrktCurUSD', 'CapRealUSD', 'PriceUSD']) { mv[k] = await cmMetric(k); await new Promise(z => setTimeout(z, 700)); }
const bc = await get('https://api.blockchain.info/charts/mvrv?timespan=all&sampled=false&metadata=false&cors=true&format=json');
const bcM = new Map(bc.ok && Array.isArray(bc.j.values) ? bc.j.values.filter(v => v.y > 0).map(v => [Math.floor(v.x * 1000 / DAY), +v.y]) : []);
const bg = await get('https://bitcoin-data.com/v1/mvrv');
const bgM = new Map(bg.ok && Array.isArray(bg.j) ? bg.j.filter(v => +v.mvrv > 0 && v.d).map(v => [dn(v.d), +v.mvrv]) : []);
const today = Math.floor(NOW / DAY);
const span = m => { const d = [...m.keys()].sort((a, b) => a - b); if (!d.length) return null; let gaps = 0; for (let i = 1; i < d.length; i++) gaps += d[i] - d[i - 1] - 1; return { n: d.length, from: iso(d[0]), to: iso(d[d.length - 1]), lag: today - d[d.length - 1], gaps }; };
const derived = new Map(); for (const [d, mc] of mv.CapMrktCurUSD.m) { const rc = mv.CapRealUSD.m.get(d); if (rc > 0) derived.set(d, mc / rc); }
const SRC = [['Coin Metrics · CapMVRVCur', mv.CapMVRVCur.r, mv.CapMVRVCur.m], ['Coin Metrics · market cap', mv.CapMrktCurUSD.r, mv.CapMrktCurUSD.m], ['Coin Metrics · realized cap', mv.CapRealUSD.r, mv.CapRealUSD.m],
  ['blockchain.com · mvrv chart', bc, bcM], ['bitcoin-data.com (BGeometrics) · mvrv', bg, bgM]];
say('### 1. Who answered, free and without a key', '', '| Source | Answered | Days | From | To | Days behind today | Missing days inside |', '|---|---|---|---|---|---|---|');
OUT.mvrv = { sources: {} };
for (const [name, r, m] of SRC) { const s = span(m); OUT.mvrv.sources[name] = { ok: !!(r && r.ok && s), status: r && r.status, ...(s || {}) }; say(r && r.ok && s ? `| ${name} | yes | ${s.n} | ${s.from} | ${s.to} | ${s.lag} | ${s.gaps} |` : `| ${name} | ${why(r || { ok: false })}${r && r.ok ? ' (empty)' : ''} | | | | | |`); }
// the series to read: Coin Metrics' own ratio, else its two caps divided, else another source
const series = [['Coin Metrics CapMVRVCur', mv.CapMVRVCur.m], ['Coin Metrics market cap ÷ realized cap', derived], ['blockchain.com', bcM], ['bitcoin-data.com', bgM]].filter(x => x[1].size > 1000);
const cmp = (a, b, from = 0) => { const d = []; for (const [k, v] of a) { const w = b.get(k); if (w > 0 && k >= from) d.push([Math.abs(v / w - 1) * 100, k, v, w]); } if (!d.length) return null; const worst = d.reduce((x, y) => y[0] > x[0] ? y : x); return { n: d.length, med: median(d.map(x => x[0])), over2: d.filter(x => x[0] > 2).length / d.length * 100, worst }; };
if (series.length > 1) {
  say('', '### 2. The sources against each other (same day)', '', '| Pair | Days in common | Median difference | Days over 2% apart | Worst day | Since 2022: median · over 2% |', '|---|---|---|---|---|---|');
  for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) { const c = cmp(series[i][1], series[j][1]), r = cmp(series[i][1], series[j][1], dn('2022-01-01'));
    if (c) say(`| ${series[i][0]} / ${series[j][0]} | ${c.n} | ${f2(c.med)}% | ${f2(c.over2, 1)}% | ${iso(c.worst[1])}: ${f2(c.worst[2])} vs ${f2(c.worst[3])} | ${r ? f2(r.med) + '% · ' + f2(r.over2, 1) + '%' : '—'} |`); }
}
if (series.length) {
  // the first months are not a reading: nearly no coin had moved yet, so the realized value was tiny (the ratio starts
  // in the hundreds). Everything below counts from 1 Jan 2011; the "share of days" lines from the first halving.
  const [name, M0] = series[0], M = new Map([...M0].filter(x => x[0] >= dn('2011-01-01'))), days = [...M.keys()].sort((a, b) => a - b), last = days[days.length - 1], now = M.get(last);
  const vals = days.filter(d => d >= HALV[0]).map(d => M.get(d)), px = mv.PriceUSD.m.get(last);
  OUT.mvrv.used = name; OUT.mvrv.now = { day: iso(last), v: now, price: px || null, realized: px ? px / now : null };
  { const early = [...M0].filter(x => x[0] < dn('2011-01-01')).map(x => x[1]); if (early.length) say('', `(Before 2011 the ratio is not a reading — ${early.length} days between ${f2(Math.min(...early))} and ${f2(Math.max(...early))}: almost no coin had moved yet. Left out below.)`); }
  say('', '| The last days | ' + series.map(x => x[0]).join(' | ') + ' |', '|---|' + series.map(() => '---|').join(''));
  for (let d = today - 6; d <= today; d++) say(`| ${iso(d)} | ` + series.map(x => f2(x[1].get(d), 3)).join(' | ') + ' |');
  say('', `### 3. What it says (${name})`, '', `- **Now** (${iso(last)}): **${f2(now)}** — at or under this on ${f2(vals.filter(v => v <= now).length / vals.length * 100, 1)}% of the days since the first halving (28 Nov 2012).${px ? ` Price that day $${Math.round(px).toLocaleString('en-US')} → the average cost the ratio implies ("realized price") **$${Math.round(px / now).toLocaleString('en-US')}**.` : ''}`,
    `- Under 1.0 on **${f2(vals.filter(v => v < 1).length / vals.length * 100, 1)}%** of the days (the last: ${(d => d == null ? 'never' : iso(d))(days.filter(d => M.get(d) < 1).pop())}); at or over 3.0 on **${f2(vals.filter(v => v >= 3).length / vals.length * 100, 1)}%** (the last: ${(d => d == null ? 'never' : iso(d))(days.filter(d => M.get(d) >= 3).pop())}); at or over 3.5 on **${f2(vals.filter(v => v >= 3.5).length / vals.length * 100, 1)}%** (the last: ${(d => d == null ? 'never' : iso(d))(days.filter(d => M.get(d) >= 3.5).pop())}).`,
    `- Median ${f2(median(vals))} · the middle half of the days between ${f2(pctl(vals, 25))} and ${f2(pctl(vals, 75))} · 90% of the days under ${f2(pctl(vals, 90))}.`, '',
    '| Cycle (halving to halving) | Highest | on | Lowest | on | Days ≥ 3.5 | Days ≥ 3.0 | Days ≥ 2.5 | Days < 1.0 |', '|---|---|---|---|---|---|---|---|---|');
  OUT.mvrv.cycles = [];
  for (let c = 0; c <= HALV.length; c++) { const a = c ? HALV[c - 1] : -Infinity, b = c < HALV.length ? HALV[c] : Infinity, ds = days.filter(d => d >= a && d < b); if (!ds.length) continue;
    const hi = ds.reduce((x, y) => M.get(y) > M.get(x) ? y : x), lo = ds.reduce((x, y) => M.get(y) < M.get(x) ? y : x), cnt = f => ds.filter(d => f(M.get(d))).length;
    OUT.mvrv.cycles.push({ c: CYC[c], hi: M.get(hi), hiDay: iso(hi), lo: M.get(lo), loDay: iso(lo) });
    say(`| ${CYC[c]} | **${f2(M.get(hi))}** | ${iso(hi)} | ${f2(M.get(lo))} | ${iso(lo)} | ${cnt(v => v >= 3.5)} | ${cnt(v => v >= 3)} | ${cnt(v => v >= 2.5)} | ${cnt(v => v < 1)} |`); }
  say('', '| Day | What it was | MVRV |', '|---|---|---|');
  for (const [d, w] of [['2013-12-05', 'top'], ['2015-01-14', 'bottom'], ['2017-12-16', 'top'], ['2018-12-15', 'bottom'], ['2020-03-12', 'Covid crash'], ['2021-04-13', 'top'], ['2021-11-08', 'top'], ['2022-11-21', 'bottom'], ['2024-03-13', 'high'], ['2024-12-17', 'high'], ['2025-10-06', 'highest close']]) say(`| ${d} | ${w} | ${f2(M.get(dn(d)))} |`);
  const c7 = M.get(last - 7), c30 = M.get(last - 30); say('', `- A week ago ${f2(c7)}, a month ago ${f2(c30)}. Day-to-day it moves little: the median daily change over the last year is ${f2(median(days.filter(d => d > last - 365 && M.has(d - 1)).map(d => Math.abs(M.get(d) / M.get(d - 1) - 1) * 100)))}%.`);
  if (derived.size > 1000 && mv.CapMVRVCur.m.size > 1000) { const c = cmp(mv.CapMVRVCur.m, derived); say(`- Coin Metrics' own ratio against its two caps divided: median difference ${f2(c.med, 3)}%, worst ${f2(c.worst[0], 2)}% (${iso(c.worst[1])}).`); }
} else say('', '**No source gave a usable MVRV history.**');

// ═══ B. The dollar index ═══════════════════════════════════════════════════════════════════════════════════════════════
say('', '## B. The US dollar index (DXY)', '');
async function yahoo(sym, range = '1y') {
  for (const base of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) {
    const r = await get(`${base}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`);
    const res = r.ok && r.j.chart && r.j.chart.result && r.j.chart.result[0];
    if (res) { const ts = res.timestamp || [], cl = (res.indicators.quote[0].close || []), rows = ts.map((t, i) => [Math.floor(t * 1000 / DAY), cl[i]]).filter(x => x[1] > 0); return { r, base, meta: res.meta || {}, rows }; }
    if (base.includes('query2')) return { r, base, rows: [], meta: {} };
  }
}
OUT.dxy = {};
say('| Source | Answered | Kind | Price now | Its time (UTC) | Daily closes | Last close | 1 day | 5 trading days | 30 days | 52-week low – high |', '|---|---|---|---|---|---|---|---|---|---|---|');
const dx = {};
for (const sym of ['DX-Y.NYB', 'DX=F']) {
  const y = await yahoo(sym); dx[sym] = y; const m = y.meta, c = y.rows.map(x => x[1]), n = c.length;
  if (!n) { say(`| Yahoo ${sym} | ${why(y.r)} | | | | | | | | | |`); OUT.dxy[sym] = { ok: false, status: y.r.status }; continue; }
  const price = m.regularMarketPrice > 0 ? m.regularMarketPrice : c[n - 1], ch = k => n > k ? (price / c[n - 1 - k] - 1) * 100 : null;
  // the day's change: against the close before the last one when the last close IS today's still-moving price
  const lastIsLive = Math.abs(c[n - 1] / price - 1) < 1e-6, d1 = lastIsLive ? ch(1) : (price / c[n - 1] - 1) * 100, d5 = lastIsLive ? ch(5) : ch(4), d30 = (() => { const t = y.rows[n - 1][0] - 30, r0 = y.rows.filter(x => x[0] <= t).pop(); return r0 ? (price / r0[1] - 1) * 100 : null; })();
  OUT.dxy[sym] = { ok: true, price, at: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null, d1, d5, d30, lo: Math.min(...c), hi: Math.max(...c), n, exch: m.exchangeName, type: m.instrumentType, prevClose: m.previousClose, chartPrev: m.chartPreviousClose };
  say(`| Yahoo ${sym} | yes (${y.base.replace('https://', '').split('.')[0]}) | ${m.instrumentType || '?'} · ${m.exchangeName || '?'} | **${f2(price, 3)}** | ${m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString().slice(0, 16).replace('T', ' ') : '—'} | ${n} | ${iso(y.rows[n - 1][0])} | ${pc(d1)} | ${pc(d5)} | ${pc(d30)} | ${f2(Math.min(...c), 2)} – ${f2(Math.max(...c), 2)} |`);
}
const sq = await get('https://stooq.com/q/d/l/?s=dx.f&i=d', { as: 'text' });
const sqRows = sq.ok ? sq.t.trim().split('\n').slice(1).map(l => l.split(',')).filter(x => +x[4] > 0).map(x => [dn(x[0]), +x[4]]) : [];
if (sqRows.length > 50) { const c = sqRows.map(x => x[1]), n = c.length, yr = sqRows.filter(x => x[0] > today - 366).map(x => x[1]); say(`| stooq dx.f | yes | daily file | ${f2(c[n - 1], 3)} (last close) | — | ${n} (since ${iso(sqRows[0][0])}) | ${iso(sqRows[n - 1][0])} | ${pc((c[n - 1] / c[n - 2] - 1) * 100)} | ${pc((c[n - 1] / c[n - 6] - 1) * 100)} | — | ${f2(Math.min(...yr), 2)} – ${f2(Math.max(...yr), 2)} |`); OUT.dxy.stooq = { ok: true, n, last: c[n - 1] }; }
else { say(`| stooq dx.f | ${sq.ok ? '**no** (' + sq.t.slice(0, 60).replace(/\s+/g, ' ') + ')' : why(sq)} | | | | | | | | | |`); OUT.dxy.stooq = { ok: false, status: sq.status }; }
// The index is a fixed formula over six currencies (ICE): 50.14348112 × EURUSD^-0.576 × USDJPY^0.136 × GBPUSD^-0.119 ×
// USDCAD^0.091 × USDSEK^0.042 × USDCHF^0.036. With every rate written as "units per one dollar" all six powers are positive.
const W = { EUR: 0.576, JPY: 0.136, GBP: 0.119, CAD: 0.091, SEK: 0.042, CHF: 0.036 }, dxy = r => Object.keys(W).every(k => r[k] > 0) ? 50.14348112 * Object.entries(W).reduce((a, [k, w]) => a * Math.pow(r[k], w), 1) : null;
const byHand = {};
{ // (1) Yahoo's own currency pairs — the same house as the index, so a check of the symbol, not a second witness
  const P = { EUR: ['EURUSD=X', 1], JPY: ['JPY=X', 0], GBP: ['GBPUSD=X', 1], CAD: ['CAD=X', 0], SEK: ['SEK=X', 0], CHF: ['CHF=X', 0] }, live = {}, hist = {}; let okN = 0;
  for (const [k, [sym, inv]] of Object.entries(P)) { const y = await yahoo(sym); if (y && y.rows.length) { okN++; const m = y.meta.regularMarketPrice > 0 ? y.meta.regularMarketPrice : y.rows[y.rows.length - 1][1]; live[k] = inv ? 1 / m : m; hist[k] = new Map(y.rows.map(x => [x[0], inv ? 1 / x[1] : x[1]])); } await sleep(400); }
  const M = new Map(); if (okN === 6) for (const d of hist.EUR.keys()) { const v = dxy(Object.fromEntries(Object.keys(W).map(k => [k, hist[k].get(d)]))); if (v) M.set(d, v); }
  byHand.yahoo = { ok: okN === 6, n: okN, now: okN === 6 ? dxy(live) : null, M };
  say(`| By hand · Yahoo's six pairs | ${okN === 6 ? 'yes' : `**no** (${okN} of 6 pairs)`} | formula | ${okN === 6 ? '**' + f2(dxy(live), 3) + '**' : ''} | — | ${M.size || ''} | ${M.size ? iso(Math.max(...M.keys())) : ''} | | | | |`);
  // (2) the European Central Bank's daily reference rates (frankfurter, free, no key) — another house, one fix a day
  let fr = null, host = ''; for (const h of ['https://api.frankfurter.dev/v1', 'https://api.frankfurter.app']) { fr = await get(`${h}/${iso(today - 370)}..?base=USD&symbols=EUR,JPY,GBP,CAD,SEK,CHF`); if (fr.ok && fr.j.rates) { host = h; break; } }
  const E = new Map(fr.ok && fr.j.rates ? Object.entries(fr.j.rates).map(([d, r]) => [dn(d), dxy(r)]).filter(x => x[1]) : []);
  byHand.ecb = { ok: E.size > 100, M: E, host };
  if (E.size > 100) { const ds = [...E.keys()].sort((a, b) => a - b), l = ds[ds.length - 1]; say(`| By hand · ECB daily rates (${host.replace('https://', '')}) | yes | formula | ${f2(E.get(l), 3)} (the day's fix) | ${iso(l)} ~15:00 | ${E.size} | ${iso(l)} | ${pc((E.get(l) / E.get(ds[ds.length - 2]) - 1) * 100)} | ${pc((E.get(l) / E.get(ds[ds.length - 6]) - 1) * 100)} | — | ${f2(Math.min(...E.values()), 2)} – ${f2(Math.max(...E.values()), 2)} |`); }
  else say(`| By hand · ECB daily rates (frankfurter) | ${why(fr)} | | | | | | | | | |`);
  OUT.dxy.byHand = { yahoo: { ok: byHand.yahoo.ok, now: byHand.yahoo.now }, ecb: { ok: byHand.ecb.ok, n: E.size } };
}
{ const a = dx['DX-Y.NYB'], b = dx['DX=F']; const A = new Map(a ? a.rows : []), B = new Map(b ? b.rows : []), S = new Map(sqRows);
  const line = (n1, X, n2, Y) => { const c = cmp(X, Y, today - 400); return c ? `- ${n1} against ${n2}, the same days of the last year: ${c.n} days, median difference ${f2(c.med, 3)}%, worst ${f2(c.worst[0], 2)}% (${iso(c.worst[1])}: ${f2(c.worst[2], 3)} vs ${f2(c.worst[3], 3)}).` : null; };
  say('', ...[line('DX-Y.NYB', A, 'DX=F', B), line('DX-Y.NYB', A, 'stooq', S), line('DX=F', B, 'stooq', S), line('DX-Y.NYB', A, "the formula over Yahoo's six pairs", byHand.yahoo.M), line('DX-Y.NYB', A, "the formula over the ECB's rates (a different hour of the day)", byHand.ecb.M)].filter(Boolean));
  if (a && a.rows.length && byHand.yahoo.now) say(`- Right now: the index ${f2(a.meta.regularMarketPrice, 3)}, the formula over the six live pairs ${f2(byHand.yahoo.now, 3)} (${pc((byHand.yahoo.now / a.meta.regularMarketPrice - 1) * 100, 3)}).`);
  const m = a && a.meta; if (m && a.rows.length) say(`- A trap in Yahoo's answer for a 1-year range: \`previousClose\` = ${m.previousClose ?? '—'}, \`chartPreviousClose\` = ${m.chartPreviousClose ?? '—'} (the close before the RANGE starts, not yesterday's) — the day's change must come from the daily closes.`,
    `- Weekends: the index does not trade; the last close stays (${iso(a.rows[a.rows.length - 1][0])}). Yahoo's own note: delayed quotes.`); }

// ═══ C. BTC funding ════════════════════════════════════════════════════════════════════════════════════════════════════
say('', '## C. BTC perpetual funding rate', '', 'Rates are percent per 8 hours (what a long pays a short when positive). "A year" = 3 payments a day × 365.', '');
const EX = {
  Binance: async () => { const a = await get('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT'); if (!a.ok) return { r: a };
    const h = await get('https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000'), oi = await get('https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT');
    return { r: a, now: +a.j.lastFundingRate * 100, next: +a.j.nextFundingTime, hist: h.ok ? h.j.map(x => [+x.fundingTime, +x.fundingRate * 100]) : [], oi: oi.ok ? +oi.j.openInterest * +a.j.markPrice : null }; },
  OKX: async () => { const O = 'https://www.okx.com/api/v5', a = await get(`${O}/public/funding-rate?instId=BTC-USDT-SWAP`); if (!a.ok || !a.j.data || !a.j.data[0]) return { r: { ...a, ok: false } };
    const hist = []; let after = ''; for (let i = 0; i < 12; i++) { const h = await get(`${O}/public/funding-rate-history?instId=BTC-USDT-SWAP&limit=100${after ? '&after=' + after : ''}`); const d = h.ok && h.j.data || []; if (!d.length) break; d.forEach(x => hist.push([+x.fundingTime, +x.realizedRate * 100 || +x.fundingRate * 100])); after = d[d.length - 1].fundingTime; await new Promise(z => setTimeout(z, 250)); }
    const oi = await get(`${O}/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP`);
    return { r: a, now: +a.j.data[0].fundingRate * 100, next: +a.j.data[0].fundingTime, hist, oi: oi.ok && oi.j.data && oi.j.data[0] ? +oi.j.data[0].oiUsd : null }; },
  Bybit: async () => { const B = 'https://api.bybit.com/v5/market', a = await get(`${B}/tickers?category=linear&symbol=BTCUSDT`), t = a.ok && a.j.result && a.j.result.list && a.j.result.list[0]; if (!t) return { r: { ...a, ok: false } };
    const hist = []; let end = ''; for (let i = 0; i < 6; i++) { const h = await get(`${B}/funding/history?category=linear&symbol=BTCUSDT&limit=200${end ? '&endTime=' + end : ''}`); const d = h.ok && h.j.result && h.j.result.list || []; if (!d.length) break; d.forEach(x => hist.push([+x.fundingRateTimestamp, +x.fundingRate * 100])); end = +d[d.length - 1].fundingRateTimestamp - 1; await new Promise(z => setTimeout(z, 250)); }
    return { r: a, now: +t.fundingRate * 100, next: +t.nextFundingTime, hist, oi: +t.openInterestValue || null }; },
  Bitget: async () => { const G = 'https://api.bitget.com/api/v2/mix/market', a = await get(`${G}/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures`), t = a.ok && a.j.data && a.j.data[0]; if (!t) return { r: { ...a, ok: false } };
    const hist = []; for (let p = 1; p <= 12; p++) { const h = await get(`${G}/history-fund-rate?symbol=BTCUSDT&productType=usdt-futures&pageSize=100&pageNo=${p}`), d = h.ok && Array.isArray(h.j.data) ? h.j.data : []; if (!d.length) break; d.forEach(x => hist.push([+x.fundingTime, +x.fundingRate * 100])); if (d.length < 100) break; await sleep(250); }
    const oi = await get(`${G}/open-interest?symbol=BTCUSDT&productType=usdt-futures`), tk = await get(`${G}/ticker?symbol=BTCUSDT&productType=usdt-futures`);
    const px = tk.ok && tk.j.data && tk.j.data[0] ? +tk.j.data[0].lastPr : null, sz = oi.ok && oi.j.data && oi.j.data.openInterestList && oi.j.data.openInterestList[0] ? +oi.j.data.openInterestList[0].size : null;
    return { r: a, now: +t.fundingRate * 100, hist, oi: px && sz ? px * sz : null }; },
  Gate: async () => { const a = await get('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT'); if (!a.ok || a.j.funding_rate == null) return { r: { ...a, ok: false } };
    const U = 'https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=BTC_USDT&limit=1000', far = await get(`${U}&from=${Math.floor((NOW - 400 * DAY) / 1000)}&to=${Math.floor(NOW / 1000)}`), near = await get(U), pick = [far, near].map(x => x.ok && Array.isArray(x.j) ? x.j : []).sort((x, y) => y.length - x.length)[0];
    return { r: a, now: +a.j.funding_rate * 100, next: +a.j.funding_next_apply * 1000, hist: pick.map(x => [+x.t * 1000, +x.r * 100]), oi: +a.j.position_size * +a.j.quanto_multiplier * +a.j.mark_price || null, every: +a.j.funding_interval / 3600 }; },
  // paid every hour: × 8 to stand beside the others
  Hyperliquid: async () => { const U = 'https://api.hyperliquid.xyz/info', a = await get(U, { method: 'POST', body: { type: 'metaAndAssetCtxs' } }), i = a.ok && Array.isArray(a.j) && a.j[0] && Array.isArray(a.j[0].universe) ? a.j[0].universe.findIndex(u => u.name === 'BTC') : -1, c = i >= 0 ? a.j[1][i] : null; if (!c) return { r: { ...a, ok: false } };
    const hist = []; let start = NOW - 60 * DAY; for (let k = 0; k < 4; k++) { const h = await get(U, { method: 'POST', body: { type: 'fundingHistory', coin: 'BTC', startTime: start } }), d = h.ok && Array.isArray(h.j) ? h.j : []; if (!d.length) break; d.forEach(x => hist.push([+x.time, +x.fundingRate * 8 * 100])); if (d.length < 500) break; start = +d[d.length - 1].time + 1; await sleep(250); }
    return { r: a, now: +c.funding * 8 * 100, hist, oi: +c.openInterest * +c.markPx || null, every: 1 }; },
  // settled in dollars, paid continuously: its own "last 8 hours" figure
  Deribit: async () => { const D = 'https://www.deribit.com/api/v2/public', a = await get(`${D}/ticker?instrument_name=BTC-PERPETUAL`), t = a.ok && a.j.result; if (!t || t.funding_8h == null) return { r: { ...a, ok: false } };
    const h = await get(`${D}/get_funding_rate_history?instrument_name=BTC-PERPETUAL&start_timestamp=${NOW - 30 * DAY}&end_timestamp=${NOW}`);
    return { r: a, now: +t.funding_8h * 100, hist: h.ok && Array.isArray(h.j.result) ? h.j.result.map(x => [+x.timestamp, +x.interest_8h * 100]) : [], oi: +t.open_interest || null, every: 1 }; },
};
const fr = {};
for (const [k, fn] of Object.entries(EX)) { try { fr[k] = await fn(); } catch (e) { fr[k] = { r: { ok: false, status: 0, err: String(e && e.message).slice(0, 90) } }; } }
OUT.funding = {};
say('| Exchange | Answered from GitHub | Rate now (per 8 h) | As a yearly rate | Open interest | History we got | Mean 7 days | Mean 30 days | Share of payments below zero |', '|---|---|---|---|---|---|---|---|---|');
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
for (const [k, x] of Object.entries(fr)) {
  if (!x.r.ok || x.now == null || !isFinite(x.now)) { say(`| ${k} | ${why(x.r)} | | | | | | | |`); OUT.funding[k] = { ok: false, status: x.r.status, err: x.r.err }; continue; }
  const h = [...new Map((x.hist || []).filter(p => isFinite(p[1]) && p[0] > 0).map(p => [p[0], p])).values()].sort((a, b) => a[0] - b[0]), days = h.length ? (h[h.length - 1][0] - h[0][0]) / DAY : 0, w = d => h.filter(p => p[0] > NOW - d * DAY).map(p => p[1]);
  OUT.funding[k] = { ok: true, now: x.now, oi: x.oi, n: h.length, days: Math.round(days), m7: mean(w(7)), m30: mean(w(30)), every: x.every || 8 };
  say(`| ${k} | yes | **${pc(x.now, 4)}** | ${pc(x.now * 3 * 365, 1)} | ${usd(x.oi)} | ${h.length} payments · ${Math.round(days)} days${x.every && x.every !== 8 ? ' · every ' + x.every + ' h' : ''} | ${pc(mean(w(7)), 4)} | ${pc(mean(w(30)), 4)} | ${h.length ? f2(h.filter(p => p[1] < 0).length / h.length * 100, 1) + '%' : '—'} |`);
}
{ const ok = Object.entries(fr).filter(([, x]) => x.r.ok && isFinite(x.now)), rates = ok.map(([, x]) => x.now), wOi = ok.filter(([, x]) => x.oi > 0);
  const gone = Object.entries(fr).filter(([, x]) => !(x.r.ok && isFinite(x.now))).map(x => x[0]);
  if (ok.length) say('', `- **Together** (${ok.map(x => x[0]).join(', ')}): plain mean **${pc(mean(rates), 4)}**${wOi.length > 1 ? `, weighted by open interest **${pc(wOi.reduce((a, [, x]) => a + x.now * x.oi, 0) / wOi.reduce((a, [, x]) => a + x.oi, 0), 4)}** (${wOi.map(([k, x]) => k + ' ' + usd(x.oi)).join(' · ')})` : ''}; the spread between them now: ${f2(Math.max(...rates) - Math.min(...rates), 4)} points.${gone.length ? ' **Not in it: ' + gone.join(', ') + '.**' : ''}`);
  else say('', '**No exchange answered from GitHub.**');
  OUT.funding.together = ok.length ? { n: ok.length, mean: mean(rates) } : null;
  // what "calm" and "stretched" looked like: the longest history we got
  const best = ok.filter(([, x]) => !x.every || x.every === 8).map(([k, x]) => [k, (x.hist || []).filter(p => isFinite(p[1]))]).sort((a, b) => b[1].length - a[1].length)[0];
  if (best && best[1].length > 60) { const v = best[1].map(p => p[1]), top = best[1].reduce((a, b) => b[1] > a[1] ? b : a), low = best[1].reduce((a, b) => b[1] < a[1] ? b : a);
    say('', `### What the rate looked like (${best[0]}, ${v.length} payments)`, '', '| Lowest 5% under | Lowest 10% under | Quarter under | Median | Three quarters under | 90% under | 95% under | Highest | Lowest |', '|---|---|---|---|---|---|---|---|---|',
      `| ${pc(pctl(v, 5), 4)} | ${pc(pctl(v, 10), 4)} | ${pc(pctl(v, 25), 4)} | ${pc(median(v), 4)} | ${pc(pctl(v, 75), 4)} | ${pc(pctl(v, 90), 4)} | ${pc(pctl(v, 95), 4)} | ${pc(top[1], 4)} (${new Date(top[0]).toISOString().slice(0, 10)}) | ${pc(low[1], 4)} (${new Date(low[0]).toISOString().slice(0, 10)}) |`,
      '', `- Exactly +0.0100% (the exchanges' resting rate) on ${f2(v.filter(x => Math.abs(x - 0.01) < 1e-6).length / v.length * 100, 1)}% of the payments; at or over +0.03% on ${f2(v.filter(x => x >= 0.03).length / v.length * 100, 1)}%; at or over +0.05% on ${f2(v.filter(x => x >= 0.05).length / v.length * 100, 1)}%; below zero on ${f2(v.filter(x => x < 0).length / v.length * 100, 1)}%.`);
    OUT.funding.dist = { ex: best[0], n: v.length, p5: pctl(v, 5), p10: pctl(v, 10), p25: pctl(v, 25), p50: median(v), p75: pctl(v, 75), p90: pctl(v, 90), p95: pctl(v, 95) }; }
  // do the exchanges agree, payment by payment?
  const HM = ok.filter(([, x]) => !x.every || x.every === 8).map(([k, x]) => [k, new Map((x.hist || []).map(p => [Math.round(p[0] / (8 * H)), p[1]]))]).filter(x => x[1].size > 60);   // one slot per 8 hours
  if (HM.length > 1) { say('', '| Pair | Payments in common | Median gap (points) | Same sign |', '|---|---|---|---|');
    for (let i = 0; i < HM.length; i++) for (let j = i + 1; j < HM.length; j++) { const d = []; for (const [t, v] of HM[i][1]) { const w = HM[j][1].get(t); if (w != null) d.push([Math.abs(v - w), Math.sign(v) === Math.sign(w)]); }
      if (d.length > 20) say(`| ${HM[i][0]} / ${HM[j][0]} | ${d.length} | ${f2(median(d.map(x => x[0])), 4)} | ${f2(d.filter(x => x[1]).length / d.length * 100, 1)}% |`); } }
}

{ say('', "### Binance's public archive (data.binance.vision — monthly files, not the API that refuses a US address)", '');
  const A = [], miss = [], end = new Date(NOW);
  for (let y = 2020, m = 1; y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) {
    const tag = `${y}-${String(m).padStart(2, '0')}`, r = await get(`https://data.binance.vision/data/futures/um/monthly/fundingRate/BTCUSDT/BTCUSDT-fundingRate-${tag}.zip`, { as: 'bin', tries: 1 }), csv = r.ok ? unzip1(r.b) : null;
    if (!csv) { miss.push(tag + (r.ok ? ' unreadable' : ' ' + (r.status || 'network'))); continue; }
    for (const l of csv.trim().split('\n')) { const c = l.split(','), t = +c[0], v = +c[c.length - 1]; if (t > 1e12 && isFinite(v)) A.push([t, v * 100]); }
  }
  A.sort((a, b) => a[0] - b[0]); OUT.funding.archive = { n: A.length, miss };
  if (A.length < 500) say(`**Not usable**: ${A.length} payments read. Months that did not come: ${miss.slice(0, 12).join(', ')}${miss.length > 12 ? ' …' : ''}`);
  else { const d = t => new Date(t).toISOString().slice(0, 10), sh = (v, f) => f2(v.filter(f).length / v.length * 100, 1) + '%';
    say(`${A.length} payments, ${d(A[0][0])} → ${d(A[A.length - 1][0])} (${Math.round((NOW - A[A.length - 1][0]) / DAY)} days behind today: last month's file comes early in the next month).${miss.length ? ' Months that did not come: ' + miss.join(', ') + '.' : ''}`, '',
      '| Year | Payments | Median | 90% under | 95% under | 99% under | Highest | Lowest | Below zero | ≥ +0.03% | ≥ +0.05% | ≥ +0.0365% (the bot\'s "crowded longs", 40% a year) | ≤ −0.0137% (its "crowded shorts", −15% a year) |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const row = (name, P) => { const v = P.map(p => p[1]), top = P.reduce((a, b) => b[1] > a[1] ? b : a), low = P.reduce((a, b) => b[1] < a[1] ? b : a);
      say(`| ${name} | ${v.length} | ${pc(median(v), 4)} | ${pc(pctl(v, 90), 4)} | ${pc(pctl(v, 95), 4)} | ${pc(pctl(v, 99), 4)} | ${pc(top[1], 4)} (${d(top[0])}) | ${pc(low[1], 4)} (${d(low[0])}) | ${sh(v, x => x < 0)} | ${sh(v, x => x >= 0.03)} | ${sh(v, x => x >= 0.05)} | ${sh(v, x => x >= 0.0365)} | ${sh(v, x => x <= -0.0137)} |`); };
    for (let y = 2020; y <= end.getUTCFullYear(); y++) { const P = A.filter(p => new Date(p[0]).getUTCFullYear() === y); if (P.length > 30) row(String(y), P); }
    { const P = A.filter(p => p[0] > A[A.length - 1][0] - 365 * DAY); row('**The last 365 days of it**', P); const v = P.map(p => p[1]); OUT.funding.archive.year = { p5: pctl(v, 5), p25: pctl(v, 25), p50: median(v), p75: pctl(v, 75), p90: pctl(v, 90), p95: pctl(v, 95), p99: pctl(v, 99) }; }
    row('All of it', A);
    // what the week around a known day looked like: the mean of the 21 payments up to it, and how many weeks ever were higher
    const wk = t => { const P = A.filter(p => p[0] <= t && p[0] > t - 7 * DAY).map(p => p[1]); return P.length > 15 ? mean(P) : null; }, weeks = []; for (let t = A[0][0] + 7 * DAY; t <= A[A.length - 1][0]; t += DAY) { const w = wk(t); if (w != null) weeks.push(w); }
    say('', '| Day | What it was | Mean of the week up to it (per 8 h) | As a yearly rate | Weeks since 2020 that were higher |', '|---|---|---|---|---|');
    for (const [day, w] of [['2021-02-21', 'MVRV\'s highest of that cycle'], ['2021-04-13', 'top'], ['2021-11-08', 'top'], ['2022-06-18', 'low'], ['2022-11-21', 'bottom'], ['2024-03-13', 'high'], ['2024-12-17', 'high'], ['2025-10-06', 'highest close'], [d(A[A.length - 1][0]), 'the archive\'s last day']]) { const v = wk(Date.parse(day + 'T23:59:59Z')); say(`| ${day} | ${w} | ${pc(v, 4)} | ${pc(v == null ? null : v * 1095, 1)} | ${v == null ? '—' : f2(weeks.filter(x => x > v).length / weeks.length * 100, 1) + '%'} |`); }
    // does a venue we CAN reach from GitHub say the same thing as Binance, payment by payment?
    const AM = new Map(A.map(p => [Math.round(p[0] / (8 * H)), p[1]])), rows = [];
    for (const [k, x] of Object.entries(fr)) { if (!(x.r.ok && isFinite(x.now)) || (x.every && x.every !== 8)) continue; const dd = []; for (const p of x.hist || []) { const w = AM.get(Math.round(p[0] / (8 * H))); if (w != null && isFinite(p[1])) dd.push([Math.abs(p[1] - w), Math.sign(p[1]) === Math.sign(w), p[1], w]); }
      if (dd.length > 20) { const xs = dd.map(q => q[2]), ys = dd.map(q => q[3]), mx = mean(xs), my = mean(ys), cov = mean(xs.map((v, i) => (v - mx) * (ys[i] - my))), sx = Math.sqrt(mean(xs.map(v => (v - mx) ** 2))), sy = Math.sqrt(mean(ys.map(v => (v - my) ** 2)));
        rows.push(`| ${k} / Binance | ${dd.length} | ${f2(median(dd.map(q => q[0])), 4)} | ${f2(dd.filter(q => q[1]).length / dd.length * 100, 1)}% | ${sx && sy ? f2(cov / (sx * sy), 2) : '—'} | ${pc(mx, 4)} vs ${pc(my, 4)} |`); } }
    if (rows.length) say('', '| Pair | Payments in common | Median gap (points) | Same sign | Correlation | Mean of each |', '|---|---|---|---|---|---|', ...rows); else say('', '(No payments in common between the archive and what the reachable exchanges gave — their histories start after its last month.)');
  }
}

// the last 365 days of three coins (the ones the bot's leverage radar watches): where a wording's edges can honestly sit
{ say('', '### The last 365 days, coin by coin (Binance archive, per 8 h)', '', '| Coin | Payments | 1% under | 5% under | 10% under | Quarter under | Median | Three quarters under | 90% under | 95% under | 99% under | Highest | Lowest | < 0 | ≤ −0.005% | ≤ −0.01% | > +0.01% | ≥ +0.02% | ≥ +0.03% |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const end = new Date(NOW); OUT.funding.year = {};
  for (const sym of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) { const A = [];
    for (let i = 13; i >= 1; i--) { const dt = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1)), tag = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`, r = await get(`https://data.binance.vision/data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${tag}.zip`, { as: 'bin', tries: 1 }), csv = r.ok ? unzip1(r.b) : null;
      if (csv) for (const l of csv.trim().split('\n')) { const c = l.split(','), t = +c[0], v = +c[c.length - 1], every = +c[1] > 0 && c.length > 2 ? +c[1] : 8; if (t > 1e12 && isFinite(v)) A.push([t, v * 100 * 8 / every]); } }
    A.sort((a, b) => a[0] - b[0]); const P = A.length ? A.filter(p => p[0] > A[A.length - 1][0] - 365 * DAY) : [], v = P.map(p => p[1]), sh = f => f2(v.filter(f).length / v.length * 100, 1) + '%';
    if (v.length < 300) { say(`| ${sym} | ${v.length} — not enough | | | | | | | | | | | | | | | | | |`); continue; }
    OUT.funding.year[sym] = { n: v.length, p5: pctl(v, 5), p50: median(v), p95: pctl(v, 95) };
    say(`| ${sym} | ${v.length} | ${pc(pctl(v, 1), 4)} | ${pc(pctl(v, 5), 4)} | ${pc(pctl(v, 10), 4)} | ${pc(pctl(v, 25), 4)} | ${pc(median(v), 4)} | ${pc(pctl(v, 75), 4)} | ${pc(pctl(v, 90), 4)} | ${pc(pctl(v, 95), 4)} | ${pc(pctl(v, 99), 4)} | ${pc(Math.max(...v), 4)} | ${pc(Math.min(...v), 4)} | ${sh(x => x < 0)} | ${sh(x => x <= -0.005)} | ${sh(x => x <= -0.01)} | ${sh(x => x > 0.0100001)} | ${sh(x => x >= 0.02)} | ${sh(x => x >= 0.03)} |`); }
}

// ═══ D. The dollar index over the long run — for a wording by LEVEL, and for what may honestly be said about gold and Bitcoin
{ say('', '## D. The dollar index over the long run', '');
  const yq = async (sym, range, interval) => { for (const base of ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com']) { const r = await get(`${base}/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${interval}`), res = r.ok && r.j.chart && r.j.chart.result && r.j.chart.result[0];
    if (res && res.timestamp) return res.timestamp.map((t, i) => [Math.floor(t * 1000 / DAY), +res.indicators.quote[0].close[i]]).filter(x => x[1] > 0); } return []; };
  const mo = await yq('DX-Y.NYB', 'max', '1mo'), B = [[-Infinity, 90, 'under 90'], [90, 100, '90 – 100'], [100, 105, '100 – 105'], [105, 110, '105 – 110'], [110, Infinity, 'over 110']];
  if (mo.length < 120) say(`**No long history** (${mo.length} months).`);
  else { const nowV = mo[mo.length - 1][1], ym = d => iso(d).slice(0, 7);
    say(`Monthly closes, ${ym(mo[0][0])} → ${ym(mo[mo.length - 1][0])} (${mo.length} months). The index started at 100 in March 1973. Now ${f2(nowV)}.`, '', '| Window | Months | ' + B.map(b => b[2]).join(' | ') + ' | Median | Lowest | Highest | Months at or under today\'s value |', '|---|---|' + B.map(() => '---|').join('') + '---|---|---|---|');
    for (const [name, from] of [['All of it', -Infinity], ['Since 1990', dn('1990-01-01')], ['Since 2000', dn('2000-01-01')], ['The last 20 years', today - 7305], ['The last 10 years', today - 3653], ['The last 5 years', today - 1826]]) { const P = mo.filter(x => x[0] >= from), v = P.map(x => x[1]); if (v.length < 24) continue;
      const lo = P.reduce((a, b) => b[1] < a[1] ? b : a), hi = P.reduce((a, b) => b[1] > a[1] ? b : a);
      say(`| ${name} | ${v.length} | ` + B.map(b => f2(v.filter(x => x >= b[0] && x < b[1]).length / v.length * 100, 1) + '%').join(' | ') + ` | ${f2(median(v))} | ${f2(lo[1])} (${ym(lo[0])}) | ${f2(hi[1])} (${ym(hi[0])}) | ${f2(v.filter(x => x <= nowV).length / v.length * 100, 1)}% |`); }
    const lastIn = f => { const P = mo.filter(x => f(x[1])); return P.length ? ym(P[P.length - 1][0]) : 'never'; };
    say('', `- The last month that closed at or over 110: ${lastIn(v => v >= 110)}; at or over 105: ${lastIn(v => v >= 105)}; under 100: ${lastIn(v => v < 100)}; under 90: ${lastIn(v => v < 90)}.`);
    OUT.dxyLong = { months: mo.length, now: nowV }; }
  // does gold / Bitcoin move against the dollar? weekly and monthly changes, side by side
  say('', '### Gold and Bitcoin against the dollar (changes over the same week / month)', '', '| Asset | Step | Window | Steps | Correlation | Moved the opposite way | When the dollar rose 1%+ (weeks) or 2%+ (months): the asset\'s median change · how often it fell | When the dollar fell that much: median · how often it rose |', '|---|---|---|---|---|---|---|---|');
  for (const [step, interval, key, big] of [['week', '1wk', d => Math.floor((d + 3) / 7), 1], ['month', '1mo', d => iso(d).slice(0, 7), 2]]) {
    const S = {}; for (const sym of ['DX-Y.NYB', 'GC=F', 'BTC-USD']) { S[sym] = new Map((await yq(sym, '10y', interval)).map(([d, v]) => [key(d), [d, v]])); await sleep(400); }
    const ch = M => { const k = [...M.keys()].sort((a, b) => M.get(a)[0] - M.get(b)[0]), o = new Map(); for (let i = 1; i < k.length; i++) o.set(k[i], [M.get(k[i])[0], (M.get(k[i])[1] / M.get(k[i - 1])[1] - 1) * 100]); return o; }, D = ch(S['DX-Y.NYB']);
    for (const [sym, name] of [['GC=F', 'Gold'], ['BTC-USD', 'Bitcoin']]) { const A = ch(S[sym]);
      for (const [wn, days] of [['10 years', 3653], ['5 years', 1826], ['2 years', 731]]) { const P = []; for (const [k, [d, x]] of D) { const a = A.get(k); if (a && d > today - days) P.push([x, a[1]]); } if (P.length < 12) { say(`| ${name} | ${step} | ${wn} | ${P.length} — not enough | | | | |`); continue; }
        const xs = P.map(p => p[0]), ys = P.map(p => p[1]), mx = mean(xs), my = mean(ys), cov = mean(xs.map((v, i) => (v - mx) * (ys[i] - my))), sx = Math.sqrt(mean(xs.map(v => (v - mx) ** 2))), sy = Math.sqrt(mean(ys.map(v => (v - my) ** 2)));
        const up = P.filter(p => p[0] >= big), dnn = P.filter(p => p[0] <= -big);
        say(`| ${name} | ${step} | ${wn} | ${P.length} | ${f2(cov / (sx * sy))} | ${f2(P.filter(p => p[0] * p[1] < 0).length / P.length * 100, 1)}% | ${up.length ? `${up.length} · ${pc(median(up.map(p => p[1])))} · fell ${f2(up.filter(p => p[1] < 0).length / up.length * 100, 0)}%` : '—'} | ${dnn.length ? `${dnn.length} · ${pc(median(dnn.map(p => p[1])))} · rose ${f2(dnn.filter(p => p[1] > 0).length / dnn.length * 100, 0)}%` : '—'} |`); } } }
}

say('', '---', '', 'What this run does not say: whether these numbers are worth showing — only whether they can be had, how fresh, and how far two sources agree.');
const file = process.argv[2];
if (file) { fs.writeFileSync(file, L.join('\n') + '\n'); fs.writeFileSync(file.replace(/\.md$/, '') + '.json', JSON.stringify(OUT, null, 1)); }
