// tools/update-rainbow.mjs — 🌈 the Bitcoin rainbow's numbers, once a day with the price history job (prices.yml).
//
//   node tools/update-rainbow.mjs <dir>     <dir> = a checkout of the prices branch
//
// Writes two files there:
//   m/btcday.json   Bitcoin's daily price since 18 Aug 2010, one number a day: blockchain.com's daily price until
//                   16 Aug 2017 (asked for once, then kept — those days never change), Binance's BTCUSDT close of each UTC
//                   day after (only the missing days are asked for; Bitstamp when Binance does not answer).
//   m/rainbow.json  what the bot, the alerts, the Exit page and the Market Hub read (samsam-core.js → rainbowRead):
//                   { v, updated, fit: { a, b, r2, n, lo, hi, loDay, hiDay, share[9], from, to }, closes: [[iso, price] × 14],
//                     held: { band, since }, moves: { y1, last: [[iso, from, to] × 6] }, years: [[year, lowest held band,
//                     highest held band]], peaks: [[year, band, iso] — the highest band that held in each cycle, halving to halving], tops: [[year, iso, close, band]], weekly: [[day, price]] (one close a week, for the chart) }
//
// The maths is samsam-core.js (rainbowFit …): one line through every close, nine equal bands between the deepest and the
// highest distance from it. The line is fitted again once a week — on the closes up to the last Sunday (UTC) — so the bands
// are one fixed ruler for the whole week and a band changes because the price moved, not because the ruler did.
// The first run checks its own answer against the published chart's numbers (crypto-economy.com, fit to 11 Nov 2026):
// if the old prices it was given do not give that line, it writes nothing.
import fs from 'node:fs';
import path from 'node:path';
import * as C from '../samsam-core.js';

const DAY = 864e5, FROM = C.rainbowDay(C.RAINBOW_FROM), CUT = C.rainbowDay('2017-08-17');   // from CUT on: exchange closes
const REF = { a: -16.1839, b: 5.5943, n: 5930, to: '2026-11-11' };                           // the published fit (the lab's comparison)
const TOP_YEARS = [2011, 2013, 2017, 2021, 2025];
const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'].map(C.rainbowDay);   // a cycle = from one halving to the next
const r6 = v => +(+v).toPrecision(6), log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[rainbow]', ...a);
const BN = process.env.BN_API || 'https://data-api.binance.vision/api/v3';
const BC = process.env.BC_API || 'https://api.blockchain.info';
const BS = process.env.BS_API || 'https://www.bitstamp.net/api/v2';

// ── pure: the files' content from a series (Map day → price) ───────────────────────────────────────────────────────────
// the Sunday (UTC) on or before day d — the fit's last day
export const fitDay = d => d - ((d + 4) % 7);
export function build(series, old, nowMs = Date.now()) {
  const days = [...series.keys()].filter(d => d >= FROM && series.get(d) > 0).sort((x, y) => x - y);
  if (days.length < 2000) return null;
  const last = days[days.length - 1], to = fitDay(last), rows = days.map(d => [d, series.get(d)]);
  const kept = old && old.v === 1 && old.fit && old.fit.to === C.rainbowIso(to) && old.fit.b > 0 && old.fit.hi > old.fit.lo ? old.fit : null;
  const fit = kept || (() => { const f = C.rainbowFit(rows, FROM, to); return f && { ...f, from: C.RAINBOW_FROM, to: C.rainbowIso(to), loDay: C.rainbowIso(f.loDay), hiDay: C.rainbowIso(f.hiDay), share: f.share.map(x => +x.toFixed(2)) }; })();
  if (!fit) return null;
  const bands = rows.map(([d, p]) => C.rainbowBand(fit, C.rainbowDev(fit, d, p))), heldAll = C.rainbowHeldAll(bands), held = C.rainbowHeld(bands);
  const moves = []; for (let k = 1; k < heldAll.length; k++) if (heldAll[k] !== heldAll[k - 1]) moves.push([C.rainbowIso(days[k - 1]), heldAll[k - 1], heldAll[k]]);   // dated by the first of the two closes
  const yearOf = d => +C.rainbowIso(d).slice(0, 4), years = new Map(), top = new Map();
  days.forEach((d, k) => {
    const y = yearOf(d), r = years.get(y) || [y, 9, 1]; r[1] = Math.min(r[1], heldAll[k]); r[2] = Math.max(r[2], heldAll[k]); years.set(y, r);
    const t = top.get(y); if (!t || rows[k][1] > t[2]) top.set(y, [y, C.rainbowIso(d), rows[k][1], bands[k]]);
  });
  // the highest band that HELD in each cycle (halving to halving), with the year and the day it was first reached — what an
  // exit alert on "band N or higher" would have seen (the Exit page's note)
  const peaks = [];
  for (let c = 0; c <= HALVINGS.length; c++) {
    const a = c ? HALVINGS[c - 1] : FROM, b = c < HALVINGS.length ? HALVINGS[c] : Infinity; let best = 0, at = null;
    days.forEach((d, k) => { if (d >= a && d < b && heldAll[k] > best) { best = heldAll[k]; at = d; } });
    if (at != null) peaks.push([yearOf(at), best, C.rainbowIso(at)]);
  }
  const weekly = rows.filter(([d]) => (d + 4) % 7 === 0 || d === last).map(([d, p]) => [d, r6(p)]);
  return { v: 1, updated: new Date(nowMs).toISOString(), src: 'blockchain.com daily price until 2017-08-16, Binance BTCUSDT daily close (UTC) after',
    fit, closes: rows.slice(-14).map(([d, p]) => [C.rainbowIso(d), r6(p)]), held: { band: held.band, since: C.rainbowIso(days[held.i]) },
    moves: { y1: moves.filter(m => C.rainbowDay(m[0]) > last - 365).length, last: moves.slice(-6) },
    years: [...years.values()], peaks,
    tops: TOP_YEARS.filter(y => top.has(y)).map(y => { const t = top.get(y); return [t[0], t[1], r6(t[2]), t[3]]; }), weekly };
}
// the first run's proof: these old prices give the published line
export function matchesPublished(series) {
  const f = C.rainbowFit([...series], FROM, C.rainbowDay(REF.to));
  return { ok: !!f && Math.abs(f.b - REF.b) < 5e-4 && Math.abs(f.a - REF.a) < 2e-3 && f.n === REF.n, f };
}

// ── the network ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (cute-portfolio rainbow)', accept: 'application/json' }, signal: AbortSignal.timeout(45000) });
      if (r.ok) return await r.json();
      if (r.status !== 429 && r.status < 500) throw new Error('HTTP ' + r.status);
    } catch (e) { if (i === 2 || /HTTP 4/.test(String(e.message))) throw e; }
    await new Promise(z => setTimeout(z, process.env.RB_FAST ? 10 : 2500 * (i + 1)));
  }
  throw new Error('no answer');
}
// blockchain.com's "market price": one point a day since 2009 (the days before the exchanges' own history)
async function early() {
  const j = await get(BC + '/charts/market-price?timespan=all&sampled=false&metadata=false&cors=true&format=json');
  return new Map((j.values || []).filter(v => v.y > 0).map(v => [Math.floor(v.x * 1000 / DAY), +v.y]).filter(([d]) => d >= FROM && d < CUT));
}
// the closes of the UTC days from day `from` on (a day still open is left out)
async function binance(from, nowMs) {
  const out = new Map(); let t = from * DAY;
  for (let i = 0; i < 8; i++) {
    const k = await get(`${BN}/klines?symbol=BTCUSDT&interval=1d&startTime=${t}&limit=1000`); if (!Array.isArray(k) || !k.length) break;
    k.forEach(c => { if (c[6] < nowMs && +c[4] > 0) out.set(Math.floor(c[0] / DAY), +c[4]); });
    if (k.length < 1000) break; t = k[k.length - 1][0] + DAY;
  }
  return out;
}
async function bitstamp(from, nowMs) {
  const out = new Map(); let t = from * 86400;
  for (let i = 0; i < 8; i++) {
    const j = await get(`${BS}/ohlc/btcusd/?step=86400&limit=1000&start=${t}`), k = (j.data && j.data.ohlc) || []; if (!k.length) break;
    k.forEach(c => { if ((+c.timestamp + 86400) * 1000 < nowMs && +c.close > 0) out.set(Math.floor(+c.timestamp * 1000 / DAY), +c.close); });
    if (k.length < 1000) break; t = +k[k.length - 1].timestamp + 86400;
  }
  return out;
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };
export async function main(dir, nowMs = Date.now()) {
  const OUT = path.resolve(dir, 'm'), F_DAY = path.join(OUT, 'btcday.json'), F_RB = path.join(OUT, 'rainbow.json');
  fs.mkdirSync(OUT, { recursive: true });
  const kept = readJson(F_DAY), old = readJson(F_RB), series = new Map(), want = Math.floor(nowMs / DAY) - 1;   // want: the last finished UTC day
  if (kept && kept.v === 1 && kept.start === C.RAINBOW_FROM && Array.isArray(kept.p)) kept.p.forEach((p, i) => { if (p > 0) series.set(FROM + i, +p); });
  let have = series.size ? Math.max(...series.keys()) : null, firstRun = false;
  if (have != null && have >= want && old && old.v === 1 && old.closes && old.closes.length && C.rainbowDay(old.closes[old.closes.length - 1][0]) === have) { log('up to date,', C.rainbowIso(have)); return 'same'; }
  if (have == null || have < CUT - 1) {   // the old days, once
    const e = await early(); if (e.size < 2400) throw new Error('blockchain.com: only ' + e.size + ' days before ' + C.rainbowIso(CUT));
    series.clear(); for (const [d, p] of e) series.set(d, p); have = CUT - 1; firstRun = true; log('early days (blockchain.com):', e.size);
  }
  let late;
  try { late = await binance(have + 1, nowMs); log('Binance closes:', late.size); }
  catch (e) { log('Binance:', e.message, '→ Bitstamp'); late = await bitstamp(have + 1, nowMs); log('Bitstamp closes:', late.size); }
  let added = 0; for (const [d, p] of late) if (d > have && d <= want) { series.set(d, p); added++; }
  if (!added && !firstRun && old && old.v === 1) { log('no new close yet (last', C.rainbowIso(have) + ')'); return 'same'; }
  const last = Math.max(...series.keys());
  for (let d = Math.max(CUT, have + 1); d <= last; d++) if (!series.has(d)) throw new Error('a day is missing: ' + C.rainbowIso(d));   // never a hole in the middle
  if (firstRun && last >= C.rainbowDay(REF.to)) {
    const m = matchesPublished(series);
    if (!m.ok) throw new Error(`these prices do not give the published line (b ${m.f && m.f.b.toFixed(4)} vs ${REF.b}, a ${m.f && m.f.a.toFixed(4)} vs ${REF.a}, days ${m.f && m.f.n} vs ${REF.n}) — nothing written`);
    log('checked against the published fit: b', m.f.b.toFixed(4), 'a', m.f.a.toFixed(4), 'days', m.f.n);
  }
  const R = build(series, old, nowMs); if (!R) throw new Error('not enough days: ' + series.size);
  const p = []; for (let d = FROM; d <= last; d++) p.push(series.has(d) ? series.get(d) : null);
  fs.writeFileSync(F_DAY, JSON.stringify({ v: 1, start: C.RAINBOW_FROM, src: R.src, p }));
  fs.writeFileSync(F_RB, JSON.stringify(R));
  const now = C.rainbowRead(R, nowMs);
  log('fit to', R.fit.to, 'b', R.fit.b.toFixed(4), 'a', R.fit.a.toFixed(4), 'days', R.fit.n, '· close', R.closes[R.closes.length - 1].join(' '), '· band', R.held.band, 'since', R.held.since, now && now.pending ? '(last close in ' + now.pending + ')' : '', '· moves in a year', R.moves.y1);
  return 'written';
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv[2] || 'out').catch(e => { log('FAILED:', e.message); process.exit(1); });
}
