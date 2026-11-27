// 🧪 Three more readings — a TRIAL run (lab). Nothing here is used by the app or the bot and nothing is written to the
// prices branch: it only answers "can we get these numbers, free and every day, and how far can we trust them?" before
// any card or alert is built. The same step as tools/lab/rainbow.mjs took for the rainbow.
//
//   node tools/lab/macro.mjs macro.md          (GitHub → Actions → "Macro lab" → Run workflow)
//
//   A. MVRV (Bitcoin's market value ÷ its realized value)   — who gives it free, how fresh, do the sources agree,
//      what each cycle reached, how often it was under 1 and over 3.5
//   B. The US dollar index (DXY)                             — Yahoo's DX-Y.NYB and DX=F, stooq; price, day, week, year
//   C. BTC perpetual funding rate                            — Binance, OKX, Bybit, Bitget, Gate: who answers from GitHub
//      (a US address), the rate now, a year of history, what "calm" and "stretched" looked like
import fs from 'node:fs';

const DAY = 864e5, H = 36e5, NOW = Date.now();
const dn = iso => Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / DAY), iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const HALV = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].map(dn), CYC = ['to Nov 2012', 'Nov 2012 – Jul 2016', 'Jul 2016 – May 2020', 'May 2020 – Apr 2024', 'since Apr 2024'];
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
      const txt = await r.text(); let j = null; if (as === 'json') { try { j = JSON.parse(txt); } catch (_) {} }
      last = { ok: r.ok && (as !== 'json' || j != null), status: r.status, j, t: txt, ms: Date.now() - t0, err: r.ok ? (as === 'json' && j == null ? 'not JSON: ' + txt.slice(0, 80).replace(/\s+/g, ' ') : null) : txt.slice(0, 140).replace(/\s+/g, ' ') };
      if (r.ok || (r.status !== 429 && r.status < 500)) return last;
    } catch (e) { last = { ok: false, status: 0, err: String(e && e.message).slice(0, 100), ms: Date.now() - t0 }; }
    await new Promise(z => setTimeout(z, 2500 * (i + 1)));
  }
  return last;
}
const why = r => r.ok ? 'yes' : `**no** (${r.status || 'network'}${r.err ? ': ' + r.err.slice(0, 90) : ''})`;
const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
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
for (const k of ['CapMVRVCur', 'CapMrktCurUSD', 'CapRealUSD']) { mv[k] = await cmMetric(k); await new Promise(z => setTimeout(z, 700)); }
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
  const [name, M] = series[0], days = [...M.keys()].sort((a, b) => a - b), last = days[days.length - 1], vals = days.map(d => M.get(d)), now = M.get(last);
  OUT.mvrv.used = name; OUT.mvrv.now = { day: iso(last), v: now };
  say('', `### 3. What it says (${name})`, '', `- **Now** (${iso(last)}): **${f2(now)}** — at or under this on ${f2(vals.filter(v => v <= now).length / vals.length * 100, 1)}% of the days since ${iso(days[0])}.`,
    `- Under 1.0 on **${f2(vals.filter(v => v < 1).length / vals.length * 100, 1)}%** of the days (the last: ${(d => d == null ? 'never' : iso(d))(days.filter(d => M.get(d) < 1).pop())}); at or over 3.5 on **${f2(vals.filter(v => v >= 3.5).length / vals.length * 100, 1)}%** (the last: ${(d => d == null ? 'never' : iso(d))(days.filter(d => M.get(d) >= 3.5).pop())}).`,
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
{ const a = dx['DX-Y.NYB'], b = dx['DX=F']; const A = new Map(a ? a.rows : []), B = new Map(b ? b.rows : []), S = new Map(sqRows);
  const line = (n1, X, n2, Y) => { const c = cmp(X, Y, today - 400); return c ? `- ${n1} against ${n2}, the same days of the last year: ${c.n} days, median difference ${f2(c.med, 3)}%, worst ${f2(c.worst[0], 2)}% (${iso(c.worst[1])}: ${f2(c.worst[2], 3)} vs ${f2(c.worst[3], 3)}).` : null; };
  say('', ...[line('DX-Y.NYB', A, 'DX=F', B), line('DX-Y.NYB', A, 'stooq', S), line('DX=F', B, 'stooq', S)].filter(Boolean));
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
    const h = await get(`${G}/history-fund-rate?symbol=BTCUSDT&productType=usdt-futures&pageSize=100`), oi = await get(`${G}/open-interest?symbol=BTCUSDT&productType=usdt-futures`), tk = await get(`${G}/ticker?symbol=BTCUSDT&productType=usdt-futures`);
    const px = tk.ok && tk.j.data && tk.j.data[0] ? +tk.j.data[0].lastPr : null, sz = oi.ok && oi.j.data && oi.j.data.openInterestList && oi.j.data.openInterestList[0] ? +oi.j.data.openInterestList[0].size : null;
    return { r: a, now: +t.fundingRate * 100, hist: h.ok && Array.isArray(h.j.data) ? h.j.data.map(x => [+x.fundingTime, +x.fundingRate * 100]) : [], oi: px && sz ? px * sz : null }; },
  Gate: async () => { const a = await get('https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT'); if (!a.ok || a.j.funding_rate == null) return { r: { ...a, ok: false } };
    const h = await get('https://api.gateio.ws/api/v4/futures/usdt/funding_rate?contract=BTC_USDT&limit=1000');
    return { r: a, now: +a.j.funding_rate * 100, next: +a.j.funding_next_apply * 1000, hist: h.ok && Array.isArray(h.j) ? h.j.map(x => [+x.t * 1000, +x.r * 100]) : [], oi: +a.j.position_size * +a.j.quanto_multiplier * +a.j.mark_price || null, every: +a.j.funding_interval / 3600 }; },
};
const fr = {};
for (const [k, fn] of Object.entries(EX)) { try { fr[k] = await fn(); } catch (e) { fr[k] = { r: { ok: false, status: 0, err: String(e && e.message).slice(0, 90) } }; } }
OUT.funding = {};
say('| Exchange | Answered from GitHub | Rate now (per 8 h) | As a yearly rate | Open interest | History we got | Mean 7 days | Mean 30 days | Share of payments below zero |', '|---|---|---|---|---|---|---|---|---|');
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
for (const [k, x] of Object.entries(fr)) {
  if (!x.r.ok || x.now == null || !isFinite(x.now)) { say(`| ${k} | ${why(x.r)} | | | | | | | |`); OUT.funding[k] = { ok: false, status: x.r.status, err: x.r.err }; continue; }
  const h = (x.hist || []).filter(p => isFinite(p[1])).sort((a, b) => a[0] - b[0]), days = h.length ? (h[h.length - 1][0] - h[0][0]) / DAY : 0, w = d => h.filter(p => p[0] > NOW - d * DAY).map(p => p[1]);
  OUT.funding[k] = { ok: true, now: x.now, oi: x.oi, n: h.length, days: Math.round(days), m7: mean(w(7)), m30: mean(w(30)), every: x.every || 8 };
  say(`| ${k} | yes | **${pc(x.now, 4)}** | ${pc(x.now * 3 * 365, 1)} | ${usd(x.oi)} | ${h.length} payments · ${Math.round(days)} days${x.every && x.every !== 8 ? ' · every ' + x.every + ' h' : ''} | ${pc(mean(w(7)), 4)} | ${pc(mean(w(30)), 4)} | ${h.length ? f2(h.filter(p => p[1] < 0).length / h.length * 100, 1) + '%' : '—'} |`);
}
{ const ok = Object.entries(fr).filter(([, x]) => x.r.ok && isFinite(x.now)), rates = ok.map(([, x]) => x.now), wOi = ok.filter(([, x]) => x.oi > 0);
  if (ok.length) say('', `- **Together** (${ok.map(x => x[0]).join(', ')}): plain mean **${pc(mean(rates), 4)}**${wOi.length > 1 ? `, weighted by open interest **${pc(wOi.reduce((a, [, x]) => a + x.now * x.oi, 0) / wOi.reduce((a, [, x]) => a + x.oi, 0), 4)}** (${wOi.map(([k, x]) => k + ' ' + usd(x.oi)).join(' · ')})` : ''}; the spread between them now: ${f2(Math.max(...rates) - Math.min(...rates), 4)} points.`);
  else say('', '**No exchange answered from GitHub.**');
  OUT.funding.together = ok.length ? { n: ok.length, mean: mean(rates) } : null;
  // what "calm" and "stretched" looked like: the longest history we got
  const best = ok.map(([k, x]) => [k, (x.hist || []).filter(p => isFinite(p[1]))]).sort((a, b) => b[1].length - a[1].length)[0];
  if (best && best[1].length > 60) { const v = best[1].map(p => p[1]), top = best[1].reduce((a, b) => b[1] > a[1] ? b : a), low = best[1].reduce((a, b) => b[1] < a[1] ? b : a);
    say('', `### What the rate looked like (${best[0]}, ${v.length} payments)`, '', '| Lowest 5% under | Lowest 10% under | Quarter under | Median | Three quarters under | 90% under | 95% under | Highest | Lowest |', '|---|---|---|---|---|---|---|---|---|',
      `| ${pc(pctl(v, 5), 4)} | ${pc(pctl(v, 10), 4)} | ${pc(pctl(v, 25), 4)} | ${pc(median(v), 4)} | ${pc(pctl(v, 75), 4)} | ${pc(pctl(v, 90), 4)} | ${pc(pctl(v, 95), 4)} | ${pc(top[1], 4)} (${new Date(top[0]).toISOString().slice(0, 10)}) | ${pc(low[1], 4)} (${new Date(low[0]).toISOString().slice(0, 10)}) |`,
      '', `- Exactly +0.0100% (the exchanges' resting rate) on ${f2(v.filter(x => Math.abs(x - 0.01) < 1e-6).length / v.length * 100, 1)}% of the payments; at or over +0.03% on ${f2(v.filter(x => x >= 0.03).length / v.length * 100, 1)}%; at or over +0.05% on ${f2(v.filter(x => x >= 0.05).length / v.length * 100, 1)}%; below zero on ${f2(v.filter(x => x < 0).length / v.length * 100, 1)}%.`);
    OUT.funding.dist = { ex: best[0], n: v.length, p5: pctl(v, 5), p10: pctl(v, 10), p25: pctl(v, 25), p50: median(v), p75: pctl(v, 75), p90: pctl(v, 90), p95: pctl(v, 95) }; }
  // do the exchanges agree, payment by payment?
  const HM = ok.map(([k, x]) => [k, new Map((x.hist || []).map(p => [Math.round(p[0] / (8 * H)), p[1]]))]).filter(x => x[1].size > 60);   // one slot per 8 hours
  if (HM.length > 1) { say('', '| Pair | Payments in common | Median gap (points) | Same sign |', '|---|---|---|---|');
    for (let i = 0; i < HM.length; i++) for (let j = i + 1; j < HM.length; j++) { const d = []; for (const [t, v] of HM[i][1]) { const w = HM[j][1].get(t); if (w != null) d.push([Math.abs(v - w), Math.sign(v) === Math.sign(w)]); }
      if (d.length > 20) say(`| ${HM[i][0]} / ${HM[j][0]} | ${d.length} | ${f2(median(d.map(x => x[0])), 4)} | ${f2(d.filter(x => x[1]).length / d.length * 100, 1)}% |`); } }
}

say('', '---', '', 'What this run does not say: whether these numbers are worth showing — only whether they can be had, how fresh, and how far two sources agree.');
const file = process.argv[2];
if (file) { fs.writeFileSync(file, L.join('\n') + '\n'); fs.writeFileSync(file.replace(/\.md$/, '') + '.json', JSON.stringify(OUT, null, 1)); }
