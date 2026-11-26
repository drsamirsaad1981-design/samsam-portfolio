// 🌈 Bitcoin rainbow — a TRIAL run (lab). Nothing here is used by the app or the bot, and nothing is written to the prices
// branch: it only answers "can we compute the chart accurately?" before any alert or card is built.
//
//   node tools/lab/rainbow.mjs rainbow.md            (GitHub → Actions → "Rainbow lab" → Run workflow)
//   node tools/lab/rainbow.mjs --selftest            the maths on a made-up series whose line is known
//
// What it does:
//   1. asks several free sources for Bitcoin's daily price since 2010 and says which ones answered from GitHub;
//   2. compares them day by day where they overlap (a day more than 1% apart is counted, the worst are listed);
//   3. fits ONE line: log10(price) = a + b · log10(days since the genesis block, 3 Jan 2009) — ordinary least squares on
//      the daily closes from 18 Aug 2010;
//   4. cuts the distance between the deepest drop under the line and the highest spike over it into NINE equal bands
//      (equal on the log scale — the method crypto-economy.com documents for its chart);
//   5. sets every number beside that chart's published ones (their close of 24 Nov 2026), so the difference is visible.
import fs from 'node:fs';

const DAY = 86400e3, GENESIS = Date.UTC(2009, 0, 3) / DAY, FIT_FROM = '2010-08-18';
const dn = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY), iso = d => new Date(d * DAY).toISOString().slice(0, 10);
const usd = v => v == null || !isFinite(v) ? '—' : '$' + (v >= 100 ? Math.round(v).toLocaleString('en-US') : v >= 1 ? v.toFixed(2) : v.toPrecision(3));
const pc = (v, dp = 1) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(dp) + '%';

// ── the maths (pure; it moves to samsam-core.js if the trial is accepted) ──────────────────────────────────────────────
// series: Map(day number → price). → { a, b, r2, n } for log10(p) = a + b·log10(day − genesis)
export function fit(series, from, to) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const [d, p] of series) {
    if (d < from || d > to || !(p > 0) || d <= GENESIS) continue;
    const x = Math.log10(d - GENESIS), y = Math.log10(p);
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y;
  }
  if (n < 30) return null;
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  const ssTot = syy - sy * sy / n, ssRes = syy - a * sy - b * sxy;
  return { a, b, r2: 1 - ssRes / ssTot, n };
}
export const lineAt = (f, d) => 10 ** (f.a + f.b * Math.log10(d - GENESIS));
export const devOf = (f, d, p) => Math.log10(p) - (f.a + f.b * Math.log10(d - GENESIS));   // log10 distance from the line
// the nine bands: the span between the lowest and the highest deviation ever seen, cut into nine equal parts
export function bands(f, series, from, to) {
  let lo = Infinity, hi = -Infinity, loDay = null, hiDay = null; const devs = [];
  for (const [d, p] of series) { if (d < from || d > to || !(p > 0)) continue; const v = devOf(f, d, p); devs.push(v); if (v < lo) { lo = v; loDay = d; } if (v > hi) { hi = v; hiDay = d; } }
  const w = (hi - lo) / 9, bandOf = v => Math.min(9, Math.max(1, Math.floor((v - lo) / w) + 1));
  const share = Array(9).fill(0); devs.forEach(v => share[bandOf(v) - 1]++);
  return { lo, hi, loDay, hiDay, w, step: 10 ** w, bandOf, share: share.map(c => c / devs.length * 100), n: devs.length,
    edges: d => Array.from({ length: 10 }, (_, i) => lineAt(f, d) * 10 ** (lo + i * w)) };   // ten edges of the nine bands on day d
}

if (process.argv.includes('--selftest')) {
  // a made-up series whose answer is known: an exact line, then the same line with every other day 2× over / 2× under it
  const T0 = dn(FIT_FROM), T1 = dn('2026-11-11'), exact = new Map(), wavy = new Map();
  for (let d = T0; d <= T1; d++) { const p = 10 ** (-16 + 5.6 * Math.log10(d - GENESIS)); exact.set(d, p); wavy.set(d, p * (d % 2 ? 2 : 0.5)); }
  const f = fit(exact, T0, T1), g = fit(wavy, T0, T1), B = bands(g, wavy, T0, T1), L2 = Math.log10(2);
  const ok = Math.abs(f.b - 5.6) < 1e-9 && Math.abs(f.a + 16) < 1e-8 && f.r2 > 0.999999 && f.n === T1 - T0 + 1 && Math.abs(lineAt(f, T1) / exact.get(T1) - 1) < 1e-9
    && Math.abs(g.b - 5.6) < 1e-3 && Math.abs(B.hi - L2) < 1e-3 && Math.abs(B.lo + L2) < 1e-3 && Math.abs(B.step - 10 ** (2 * L2 / 9)) < 1e-3
    && Math.abs(B.share.reduce((x, y) => x + y, 0) - 100) < 1e-9 && Math.abs(B.share[0] - 50) < 0.1 && Math.abs(B.share[8] - 50) < 0.1 && B.bandOf(B.lo) === 1 && B.bandOf(B.hi) === 9 && B.bandOf(0) === 5
    && Math.abs(B.edges(T1)[0] / (lineAt(g, T1) / 2) - 1) < 3e-3 && Math.abs(B.edges(T1)[9] / (lineAt(g, T1) * 2) - 1) < 3e-3;
  console.log(ok ? 'selftest passed' : 'selftest FAILED', JSON.stringify({ a: f.a, b: f.b, r2: f.r2, wavyB: g.b, lo: B.lo, hi: B.hi, share: B.share.map(x => +x.toFixed(2)) }));
  process.exit(ok ? 0 : 1);
}

// ── the sources ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function get(url, as = 'json') {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (cute-portfolio rainbow lab)', accept: 'application/json,text/csv,*/*' }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) { if (r.status === 429 || r.status >= 500) { await new Promise(z => setTimeout(z, 2500 * (i + 1))); continue; } throw new Error('HTTP ' + r.status); }
      return as === 'text' ? await r.text() : await r.json();
    } catch (e) { if (i === 2 || /HTTP 4/.test(String(e.message))) throw e; await new Promise(z => setTimeout(z, 2000)); }
  }
  throw new Error('no answer');
}
const BN = process.env.BN_API || 'https://data-api.binance.vision/api/v3';
const SOURCES = {
  // blockchain.com's "market price" (an average across exchanges, one point a day) — the oldest free series
  blockchain: async () => {
    const j = await get('https://api.blockchain.info/charts/market-price?timespan=all&sampled=false&metadata=false&cors=true&format=json');
    return new Map((j.values || []).filter(v => v.y > 0).map(v => [Math.floor(v.x * 1000 / DAY), +v.y]));
  },
  // Coin Metrics community API: the reference rate at the end of each UTC day
  coinmetrics: async () => {
    const out = new Map(); let url = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d&start_time=2010-07-18&page_size=10000';
    for (let i = 0; i < 6 && url; i++) { const j = await get(url); (j.data || []).forEach(r => { if (+r.PriceUSD > 0) out.set(dn(String(r.time).slice(0, 10)), +r.PriceUSD); }); url = j.next_page_url || null; }
    return out;
  },
  // Binance BTCUSDT daily candles (from Aug 2017): the close of each UTC day
  binance: async () => {
    const out = new Map(); let t = Date.UTC(2017, 7, 17);
    for (let i = 0; i < 8; i++) { const k = await get(`${BN}/klines?symbol=BTCUSDT&interval=1d&startTime=${t}&limit=1000`); if (!Array.isArray(k) || !k.length) break;
      k.forEach(c => { if (c[6] < Date.now()) out.set(Math.floor(c[0] / DAY), +c[4]); }); if (k.length < 1000) break; t = k[k.length - 1][0] + DAY; }   // (a day still open is left out)
    return out;
  },
  // Bitstamp BTC/USD daily candles (from Aug 2011)
  bitstamp: async () => {
    const out = new Map(); let t = Date.UTC(2011, 7, 18) / 1000;
    for (let i = 0; i < 8; i++) { const j = await get(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${t}`); const k = (j.data && j.data.ohlc) || []; if (!k.length) break;
      k.forEach(c => { if ((+c.timestamp + 86400) * 1000 < Date.now() && +c.close > 0) out.set(Math.floor(+c.timestamp * 1000 / DAY), +c.close); }); if (k.length < 1000) break; t = +k[k.length - 1].timestamp + 86400; }
    return out;
  },
  // Nasdaq Data Link (the series the open-source rainbow script reads) — asked without a key, to see whether it answers
  nasdaq: async () => {
    const j = await get('https://data.nasdaq.com/api/v3/datasets/BCHAIN/MKPRU.json');
    return new Map(((j.dataset && j.dataset.data) || []).filter(r => +r[1] > 0).map(r => [dn(r[0]), +r[1]]));
  },
};

const L = [], say = (...a) => a.forEach(s => { L.push(s); console.log(s); });   // one markdown line each
const got = {}, status = {};
for (const [k, fn] of Object.entries(SOURCES)) {
  try { const m = await fn(); const ds = [...m.keys()].sort((x, y) => x - y); if (!ds.length) throw new Error('empty');
    got[k] = m; let gaps = 0; for (let i = 1; i < ds.length; i++) if (ds[i] - ds[i - 1] > 1) gaps += ds[i] - ds[i - 1] - 1;
    status[k] = { ok: true, n: ds.length, from: iso(ds[0]), to: iso(ds[ds.length - 1]), gaps };
  } catch (e) { status[k] = { ok: false, err: String(e && e.message).slice(0, 80) }; }
}
say('# Bitcoin rainbow — trial run', '', `Run at ${new Date().toISOString().slice(0, 16)}Z. A lab report: nothing in the app or the bot uses it.`, '');
say('## 1. Which sources answered from GitHub', '', '| Source | Answered | Days | From | To | Missing days inside |', '|---|---|---|---|---|---|');
for (const [k, s] of Object.entries(status)) say(s.ok ? `| ${k} | yes | ${s.n} | ${s.from} | ${s.to} | ${s.gaps} |` : `| ${k} | **no** (${s.err}) | | | | |`);

// ── 2. day by day, where two sources overlap ───────────────────────────────────────────────────────────────────────────
const names = Object.keys(got);
say('', '## 2. The sources against each other (same UTC day)', '', '| Pair | Days in common | Median difference | Days over 1% | Days over 3% | Worst day |', '|---|---|---|---|---|---|');
const cmp = (A, B, shift = 0) => { const d = []; for (const [day, p] of A) { const q = B.get(day + shift); if (q > 0) d.push([Math.abs(p / q - 1) * 100, day]); } d.sort((x, y) => x[0] - y[0]); return d; };
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  // an "average of the day" and a "close of the day" can sit a day apart: the alignment that agrees best is the one reported
  const best = [0, 1, -1].map(sh => [sh, cmp(got[names[i]], got[names[j]], sh)]).filter(x => x[1].length > 30).sort((x, y) => x[1][x[1].length >> 1][0] - y[1][y[1].length >> 1][0])[0];
  if (!best) continue; const d = best[1], w = d[d.length - 1];
  say(`| ${names[i]} ~ ${names[j]}${best[0] ? ` (${names[j]} shifted ${best[0] > 0 ? '+' : ''}${best[0]} day)` : ''} | ${d.length} | ${d[d.length >> 1][0].toFixed(2)}% | ${d.filter(x => x[0] > 1).length} (${(d.filter(x => x[0] > 1).length / d.length * 100).toFixed(1)}%) | ${d.filter(x => x[0] > 3).length} | ${iso(w[1])}: ${w[0].toFixed(1)}% |`);
}

// the same comparison by period: the early market was thin (few exchanges, far apart) — what matters for an alert is today's
say('', '### By period (days more than 1% apart)', '', '| Pair | 2010–2013 | 2014–2017 | 2018–2021 | 2022 → now |', '|---|---|---|---|---|');
const ERAS = [['2010-01-01', '2013-12-31'], ['2014-01-01', '2017-12-31'], ['2018-01-01', '2021-12-31'], ['2022-01-01', '2099-01-01']].map(e => e.map(dn));
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const best = [0, 1, -1].map(sh => [sh, cmp(got[names[i]], got[names[j]], sh)]).filter(x => x[1].length > 30).sort((x, y) => x[1][x[1].length >> 1][0] - y[1][y[1].length >> 1][0])[0];
  if (!best) continue;
  say(`| ${names[i]} ~ ${names[j]} | ` + ERAS.map(([a, b]) => { const d = best[1].filter(x => x[1] >= a && x[1] <= b); return d.length ? `${(d.filter(x => x[0] > 1).length / d.length * 100).toFixed(1)}% of ${d.length} (median ${d[d.length >> 1][0].toFixed(2)}%)` : '—'; }).join(' | ') + ' |');
}

// ── 3. one series: the oldest average until 16 Aug 2017, exchange closes after (the published chart's own recipe) ─────────
const early = got.blockchain || got.nasdaq || got.coinmetrics || got.bitstamp, late = got.binance || got.coinmetrics || got.bitstamp || got.blockchain;
if (!early || !late) { say('', '**Not enough data: no source for the early years or none for the recent ones answered. The trial stops here.**'); fs.writeFileSync(process.argv[2] || 'rainbow.md', L.join('\n')); process.exit(0); }
const nameOf = m => names.find(k => got[k] === m), CUT = dn('2017-08-17'), series = new Map();
for (const [d, p] of early) if (d < CUT) series.set(d, p);
for (const [d, p] of late) if (d >= CUT) series.set(d, p);
const days = [...series.keys()].sort((x, y) => x - y), FROM = dn(FIT_FROM), last = days[days.length - 1];
let holes = 0; for (let d = FROM; d <= last; d++) if (!series.has(d)) holes++;
say('', '## 3. The series used', '', `- Until 16 Aug 2017: **${nameOf(early)}**. From 17 Aug 2017: **${nameOf(late)}** (the close of each UTC day).`,
  `- ${days.filter(d => d >= FROM).length} days from ${FIT_FROM} to ${iso(last)}; ${holes} day${holes === 1 ? '' : 's'} missing in between.`);

// ── 4. the line and the nine bands ─────────────────────────────────────────────────────────────────────────────────────
const REF = { a: -16.1839, b: 5.5943, r2: 0.960, n: 5930, fitTo: '2026-11-11', day: '2026-11-24', close: 59790, line: 144281, band: 2, below: 59,
  edges: [24841, 41436, 69118, 115292, 192314, 320789, 535094, 892565, 1488846, 2483475], share: [1.0, 10.6, 34.6, 25.3, 14.5, 9.6, 2.7, 1.6, 0.1] };
const fRef = fit(series, FROM, dn(REF.fitTo)), bRef = fRef && bands(fRef, series, FROM, dn(REF.fitTo));   // the same period as the published fit
const fNow = fit(series, FROM, last), bNow = fNow && bands(fNow, series, FROM, last);                     // everything up to yesterday
if (!fRef || !fNow) { say('', '**The fit could not be computed (too few days).**'); fs.writeFileSync(process.argv[2] || 'rainbow.md', L.join('\n')); process.exit(0); }
const d24 = dn(REF.day), p24 = series.get(d24);
say('', '## 4. Our fit beside the published one (crypto-economy.com, fit to 11 Nov 2026)', '', '| | Published | Ours (same period) | Difference |', '|---|---|---|---|',
  `| Slope b | ${REF.b} | ${fRef.b.toFixed(4)} | ${(fRef.b - REF.b).toFixed(4)} |`, `| Intercept a | ${REF.a} | ${fRef.a.toFixed(4)} | ${(fRef.a - REF.a).toFixed(4)} |`,
  `| R² | ${REF.r2.toFixed(3)} | ${fRef.r2.toFixed(3)} | |`, `| Daily closes | ${REF.n} | ${fRef.n} | ${fRef.n - REF.n} |`,
  `| The line on ${REF.day} | ${usd(REF.line)} | ${usd(lineAt(fRef, d24))} | ${pc((lineAt(fRef, d24) / REF.line - 1) * 100)} |`,
  `| Close of ${REF.day} | ${usd(REF.close)} | ${usd(p24)} | ${p24 ? pc((p24 / REF.close - 1) * 100, 2) : '—'} |`,
  `| That close against the line | −${REF.below}% | ${p24 ? pc((p24 / lineAt(fRef, d24) - 1) * 100, 0) : '—'} | |`,
  `| Band of that close | ${REF.band} of 9 | ${p24 ? bRef.bandOf(devOf(fRef, d24, p24)) + ' of 9' : '—'} | |`,
  `| One band = the one below × | 1.67 | ${bRef.step.toFixed(3)} | |`,
  // (their two extremes are not published as such; they follow from their outer band edges and their line)
  `| Deepest drop under the line | ${pc((REF.edges[0] / REF.line - 1) * 100, 1)} (from their band 1) | ${pc((10 ** bRef.lo - 1) * 100, 1)} on ${iso(bRef.loDay)} (${usd(series.get(bRef.loDay))}) | |`,
  `| Highest spike over the line | ${pc((REF.edges[9] / REF.line - 1) * 100, 0)} (from their band 9) | ${pc((10 ** bRef.hi - 1) * 100, 0)} on ${iso(bRef.hiDay)} (${usd(series.get(bRef.hiDay))}) | |`);
// the same two extremes in every source that has those days: they set the outer edges, so they are worth seeing side by side
say('', '### The two extreme days, source by source (they alone set the outer edges)', '', '| Source | Lowest against the line | Highest against the line |', '|---|---|---|');
for (const k of names) { const B = bands(fRef, got[k], FROM, dn(REF.fitTo)); if (B.n > 1000) say(`| ${k} | ${pc((10 ** B.lo - 1) * 100, 1)} on ${iso(B.loDay)} (${usd(got[k].get(B.loDay))}) | ${pc((10 ** B.hi - 1) * 100, 0)} on ${iso(B.hiDay)} (${usd(got[k].get(B.hiDay))}) |`); }
const eO = bRef.edges(d24);
say('', `### The nine bands on ${REF.day}`, '', '| Band | Published range | Our range | Lower edge difference | Published share of days | Ours |', '|---|---|---|---|---|---|');
for (let i = 8; i >= 0; i--) say(`| ${i + 1} | ${usd(REF.edges[i])} – ${usd(REF.edges[i + 1])} | ${usd(eO[i])} – ${usd(eO[i + 1])} | ${pc((eO[i] / REF.edges[i] - 1) * 100)} | ${REF.share[i].toFixed(1)}% | ${bRef.share[i].toFixed(1)}% |`);

// ── 5. today, on everything up to yesterday's close ────────────────────────────────────────────────────────────────────
const pL = series.get(last), eN = bNow.edges(last), bandL = bNow.bandOf(devOf(fNow, last, pL));
let under = 0, tot = 0; for (const [d, p] of series) { if (d < FROM || d > last) continue; tot++; if (devOf(fNow, d, p) <= devOf(fNow, last, pL)) under++; }
say('', `## 5. Today (fit on every close up to ${iso(last)})`, '', `- Close **${usd(pL)}** · the line **${usd(lineAt(fNow, last))}** · **${Math.abs(pL / lineAt(fNow, last) * 100 - 100).toFixed(0)}% ${pL < lineAt(fNow, last) ? 'under' : 'over'} it** · band **${bandL} of 9**.`,
  `- Relative to the line, Bitcoin was at this level or lower on **${(under / tot * 100).toFixed(1)}%** of the days since ${FIT_FROM}.`, `- Slope ${fNow.b.toFixed(4)}, intercept ${fNow.a.toFixed(4)}, R² ${fNow.r2.toFixed(3)}, ${fNow.n} days.`,
  '', '| Band | Range today | Share of days since 2010 |', '|---|---|---|');
for (let i = 8; i >= 0; i--) say(`| ${i + 1}${i + 1 === bandL ? ' ← today' : ''} | ${usd(eN[i])} – ${usd(eN[i + 1])} | ${bNow.share[i].toFixed(1)}% |`);

// ── 6. known days: does the band tell the story it should? ─────────────────────────────────────────────────────────────
say('', '## 6. The band on days everybody remembers (today\'s fit)', '', '| Day | What it was | Close | The line | Against the line | Band |', '|---|---|---|---|---|---|');
const peakNear = (a, b, top) => { let best = null; for (let d = dn(a); d <= dn(b); d++) { const p = series.get(d); if (p > 0 && (!best || (top ? p > best[1] : p < best[1]))) best = [d, p]; } return best; };
for (const [what, a, b, top] of [['2011 top', '2011-05-15', '2011-07-15', 1], ['2011 bottom', '2011-10-15', '2011-12-15', 0], ['2013 top', '2013-11-15', '2013-12-20', 1], ['2015 bottom', '2015-01-01', '2015-09-30', 0],
  ['2017 top', '2017-12-01', '2017-12-31', 1], ['2018 bottom', '2018-11-15', '2019-02-15', 0], ['March 2020 crash', '2020-03-10', '2020-03-20', 0], ['2021 first top', '2021-04-01', '2021-04-30', 1], ['2021 second top', '2021-11-01', '2021-11-20', 1],
  ['2022 bottom', '2022-11-01', '2022-12-31', 0], ['Highest close since 2023', '2023-01-01', iso(last), 1]]) {
  const x = peakNear(a, b, top); if (!x) continue; say(`| ${iso(x[0])} | ${what} | ${usd(x[1])} | ${usd(lineAt(fNow, x[0]))} | ${pc((x[1] / lineAt(fNow, x[0]) - 1) * 100, 0)} | ${bNow.bandOf(devOf(fNow, x[0], x[1]))} |`);
}

// ── 7. how much the answer leans on choices we make ────────────────────────────────────────────────────────────────────
say('', '## 7. How much the answer moves with our choices', '', '| Choice | Slope | The line today | Band today |', '|---|---|---|---|');
const alt = (label, s, from) => { const f = fit(s, from, last); if (!f) return; const B = bands(f, s, from, last), p = s.get(last) || pL; say(`| ${label} | ${f.b.toFixed(3)} | ${usd(lineAt(f, last))} | ${B.bandOf(devOf(f, last, p))} of 9 |`); };
alt('As above (from 18 Aug 2010)', series, FROM); alt('Fit from 1 Jan 2012', series, dn('2012-01-01')); alt('Fit from 1 Jan 2014', series, dn('2014-01-01'));
for (const k of names) { const s = new Map(series); let used = 0; for (const [d, p] of got[k]) if (d >= FROM) { s.set(d, p); used++; } if (used > 1000) alt(`Every day ${k} has, from ${k}`, s, FROM); }
for (const lag of [7, 30, 90, 365]) { const f = fit(series, FROM, last - lag); if (f) say(`| The fit as it stood ${lag} days ago | ${f.b.toFixed(3)} | ${usd(lineAt(f, last))} | ${bands(f, series, FROM, last - lag).bandOf(devOf(f, last, pL))} of 9 |`); }
say('', '_A description of where the price sits in its own history — not a forecast, not advice._');
fs.writeFileSync(process.argv[2] || 'rainbow.md', L.join('\n') + '\n');
fs.writeFileSync('rainbow.json', JSON.stringify({ at: new Date().toISOString(), status, fitRef: fRef, fitNow: fNow, bandsNow: { lo: bNow.lo, hi: bNow.hi, w: bNow.w, share: bNow.share }, last: iso(last), close: pL, band: bandL }, null, 1));
