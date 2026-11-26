// 🌈 The Bitcoin rainbow: the shared maths (samsam-core.js) and the daily file (tools/update-rainbow.mjs), on made-up
// prices whose answer is known. (The real prices' answer is checked on GitHub against the published chart — the job's own
// first-run proof, and tools/lab/rainbow.mjs.)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import * as C from '../samsam-core.js';
import { build, fitDay, matchesPublished, main } from '../tools/update-rainbow.mjs';

let fails = 0, n = 0;
const check = (name, ok, info) => { n++; if (!ok) { fails++; console.log('✗', name, info === undefined ? '' : JSON.stringify(info)); } };
const DAY = 864e5, FROM = C.rainbowDay(C.RAINBOW_FROM), near = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
const lineP = (d, a = -16.1839, b = 5.5943) => 10 ** (a + b * Math.log10(d - C.RAINBOW_GENESIS));

// ── the line ──
{
  const T1 = C.rainbowDay('2026-11-11'), rows = []; for (let d = FROM; d <= T1; d++) rows.push([d, lineP(d)]);
  const f = C.rainbowFit(rows, FROM, T1);
  check('an exact line gives its own slope, intercept and day count', near(f.b, 5.5943, 1e-9) && near(f.a, -16.1839, 1e-8) && f.n === 5930 && f.r2 > 0.999999, f);
  check('the line\'s price on a day', near(C.rainbowLine(f, T1), lineP(T1), 1e-9));
  check('genesis is 3 Jan 2009, the fit starts 18 Aug 2010', C.rainbowIso(C.RAINBOW_GENESIS) === '2009-01-03' && C.rainbowIso(FROM) === '2010-08-18' && C.rainbowDay('2010-08-18T23:59:59Z') === FROM);
  check('under 30 days: no fit', C.rainbowFit(rows.slice(0, 29)) === null);
  // every other day 2× over / 2× under the line: the span is ±log10(2), nine equal bands, half the days at each end
  const wavy = rows.map(([d, p]) => [d, p * (d % 2 ? 2 : 0.5)]), g = C.rainbowFit(wavy, FROM, T1), L2 = Math.log10(2);
  check('the span is the deepest and the highest distance from the line', Math.abs(g.hi - L2) < 1e-3 && Math.abs(g.lo + L2) < 1e-3 && g.loDay != null && g.hiDay != null, g);
  check('band 1 at the bottom, 9 at the top, the middle of the span in 5', C.rainbowBand(g, g.lo) === 1 && C.rainbowBand(g, g.hi) === 9 && C.rainbowBand(g, (g.lo + g.hi) / 2) === 5);
  check('beyond the span stays in 1 / 9', C.rainbowBand(g, g.lo - 1) === 1 && C.rainbowBand(g, g.hi + 1) === 9);
  check('the share of days adds up to 100', near(g.share.reduce((x, y) => x + y, 0), 100, 1e-9) && Math.abs(g.share[0] - 50) < 0.1 && Math.abs(g.share[8] - 50) < 0.1, g.share);
  const e = C.rainbowEdges(g, T1);
  check('ten edges, each the one below × the same step', e.length === 10 && e.every((v, i) => !i || near(v / e[i - 1], 10 ** ((g.hi - g.lo) / 9), 1e-9)) && near(e[0], C.rainbowLine(g, T1) * 10 ** g.lo, 1e-9));
  check('a price sits in the band its edges say', [0.6, 0.9, 1.3, 1.9].every(k => { const p = C.rainbowLine(g, T1) * k, b = C.rainbowBand(g, C.rainbowDev(g, T1, p)); return p >= e[b - 1] && p <= e[b]; }));
}
// ── two closes in a row ──
{
  const H = (a, s) => C.rainbowHeld(a, s);
  check('one close across an edge and back changes nothing', H([2, 2, 3, 2, 2]).band === 2 && H([2, 2, 3, 2, 2]).i === 0);
  check('two closes in a row move it, dated by the first', H([2, 2, 3, 3, 3]).band === 3 && H([2, 2, 3, 3, 3]).i === 2);
  check('a jump then a different band: still the old one', H([2, 4, 3]).band === 2);
  check('up then back down: each move after its two closes', JSON.stringify(C.rainbowHeldAll([2, 3, 3, 2, 3, 2, 2])) === '[2,2,3,3,3,3,2]' && H([2, 3, 3, 2, 3, 2, 2]).i === 5);
  check('a start band can be given', H([3, 3], 2).band === 3 && H([3], 2).band === 2);
}
// ── the names ──
check('nine names in each language, none an order to buy or sell', C.RAINBOW_NAMES.en.length === 9 && C.RAINBOW_NAMES.ar.length === 9 && new Set(C.RAINBOW_NAMES.en).size === 9 && new Set(C.RAINBOW_NAMES.ar).size === 9
  && !/buy|sell|fomo|hodl/i.test(C.RAINBOW_NAMES.en.join(' ')) && !/اشتر|بِع|بيع|شراء/.test(C.RAINBOW_NAMES.ar.join(' ')), C.RAINBOW_NAMES);
check('band 4 is the trend line\'s own band by name', /trend line/.test(C.rainbowName(4)) && /خط الاتجاه/.test(C.rainbowName(4, true)) && C.rainbowName(1) === 'Rare historic low' && C.rainbowName(9, true) === 'فقاعة' && C.rainbowName(6) === 'Warming up' && C.rainbowName(10) === '');

// ── the daily file ──
// a made-up history: the published line itself, ±1% on alternate days (so the fit is the published one), then a walk we choose
const mk = (lastIso, tail = {}) => { const m = new Map(), last = C.rainbowDay(lastIso); for (let d = FROM; d <= last; d++) m.set(d, lineP(d) * (d % 2 ? 1.01 : 0.99)); for (const [iso, k] of Object.entries(tail)) m.set(C.rainbowDay(iso), lineP(C.rainbowDay(iso)) * k); return m; };
{
  check('the fit\'s last day is the Sunday on or before the last close', C.rainbowIso(fitDay(C.rainbowDay('2026-11-25'))) === '2026-11-22' && C.rainbowIso(fitDay(C.rainbowDay('2026-11-22'))) === '2026-11-22' && C.rainbowIso(fitDay(C.rainbowDay('2026-11-28'))) === '2026-11-22' && C.rainbowIso(fitDay(C.rainbowDay('2026-11-29'))) === '2026-11-29');
  const now = Date.parse('2026-11-26T00:10:00Z'), s = mk('2026-11-25'), R = build(s, null, now);
  check('the file: fit to the last Sunday, 14 closes, a point a week', R && R.v === 1 && R.fit.to === '2026-11-22' && R.fit.from === '2010-08-18' && R.closes.length === 14 && R.closes[13][0] === '2026-11-25' && R.weekly.length > 800 && R.weekly[R.weekly.length - 1][0] === C.rainbowDay('2026-11-25'), R && R.fit);
  check('the published line comes out of the published prices', matchesPublished(mk('2026-11-25')).ok && !matchesPublished(new Map([...mk('2026-11-25')].map(([d, p]) => [d, p * (1 + (d - FROM) / 2e4)]))).ok);
  check('the fit\'s days are ISO dates and its shares add up', /^\d{4}-\d\d-\d\d$/.test(R.fit.loDay) && /^\d{4}-\d\d-\d\d$/.test(R.fit.hiDay) && Math.abs(R.fit.share.reduce((x, y) => x + y, 0) - 100) < 0.1);
  // the same week: the ruler is kept as it is, to the digit
  const R2 = build(mk('2026-11-27'), R, now + 2 * DAY);
  check('inside a week the line is not fitted again', R2.fit === R.fit && R2.closes[13][0] === '2026-11-27');
  const R3 = build(mk('2026-11-29'), R2, now + 4 * DAY);
  check('a new Sunday: fitted again on the closes up to it', R3.fit !== R.fit && R3.fit.to === '2026-11-29' && R3.fit.n === R.fit.n + 7);
  check('under 2,000 days: no file', build(new Map([...s].slice(0, 1500)), null, now) === null);

  // a walk across bands: with ±1% the span is tiny, so a few percent crosses several bands — the reader and the file agree
  const f = R.fit, w = (f.hi - f.lo) / 9, at = b => 10 ** (f.lo + (b - 0.5) * w);   // the middle of band b, as a multiple of the line
  const t = mk('2026-11-25', { '2026-11-23': at(7), '2026-11-24': at(7), '2026-11-25': at(8) }), T = build(t, R, now), rd = C.rainbowRead(T, now);
  check('two closes in band 7 hold it; a third in band 8 is pending', T.held.band === 7 && T.held.since === '2026-11-23' && rd.band === 7 && rd.last === 8 && rd.pending === 8, [T.held, rd && rd.pending]);
  check('the move is listed and counted in the year', T.moves.last.length >= 1 && T.moves.last[T.moves.last.length - 1][0] === '2026-11-23' && T.moves.last[T.moves.last.length - 1][2] === 7 && T.moves.y1 >= 1, T.moves);
  check('the reader: close, line, percent against the line, the held band\'s edges', rd.day === '2026-11-25' && near(rd.close, t.get(C.rainbowDay('2026-11-25')), 1e-5) && near(rd.line, C.rainbowLine(f, C.rainbowDay('2026-11-25')), 1e-12) && near(rd.vs, (rd.close / rd.line - 1) * 100, 1e-9) && near(rd.lo, rd.edges[6], 1e-12) && near(rd.hi, rd.edges[7], 1e-12) && rd.since === '2026-11-23');
  const live = C.rainbowRead(T, now, C.rainbowLine(f, Math.floor(now / DAY)) * 1.5);   // (a live price is set against today's line)
  check('a live price moves the percent, never the band', live.band === 7 && live.live && near(live.vs, 50, 1e-6) && !rd.live);
  check('years carry the lowest and highest held band; tops the year\'s highest close', T.years.length === 17 && T.years[0][0] === 2010 && T.years.some(y => y[0] === 2026 && y[1] === 7 && y[2] === 9) && T.years.some(y => y[0] === 2020 && y[1] === 9 && y[2] === 9) && T.tops.map(x => x[0]).join() === '2011,2013,2017,2021,2025' && T.tops.every(x => x[3] >= 1 && x[3] <= 9 && /^\d{4}-/.test(x[1])), T.tops);
  check('peaks: one per cycle (halving to halving) — the highest band that held, its year and first day', T.peaks.length === 5 && T.peaks.every(x => x[1] === 9 && /^\d{4}-\d\d-\d\d$/.test(x[2]) && +x[2].slice(0, 4) === x[0]) && T.peaks.map(x => x[2]).join() === '2010-08-18,2012-11-28,2016-07-09,2020-05-11,2024-04-20', T.peaks);
  check('a file over 4 days old says nothing', C.rainbowRead(T, now + 4 * DAY) === null && C.rainbowRead(T, now + 3 * DAY) !== null);
  check('no file, or a broken one, says nothing', C.rainbowRead(null) === null && C.rainbowRead({}) === null && C.rainbowRead({ fit: { a: 1, b: 2, lo: 0, hi: 0 }, closes: [['2026-11-25', 1]] }, now) === null && C.rainbowRead({ fit: T.fit, closes: [] }, now) === null);
  check('without the file\'s own "held", the reader works it out from the closes', C.rainbowRead({ ...T, held: null }, now).band === 7);
}

// ── the job, against made-up servers ──
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rb-')), CUT = C.rainbowDay('2017-08-17'), real = globalThis.fetch;
  process.env.RB_FAST = '1';
  let asked = [], price = d => lineP(d) * (d % 2 ? 1.01 : 0.99), down = {}, tilt = 0;
  globalThis.fetch = async u => {
    u = String(u); asked.push(u); const J = j => ({ ok: true, status: 200, json: async () => j });
    if (/blockchain/.test(u)) { if (down.bc) return { ok: false, status: 503 }; const v = []; for (let d = FROM - 400; d < CUT + 50; d++) v.push({ x: d * 86400, y: d < FROM - 300 ? 0 : price(d) * (1 + tilt * (d - FROM)) }); return J({ values: v }); }
    if (/klines/.test(u)) { if (down.bn) return { ok: false, status: 451 }; const st = +/startTime=(\d+)/.exec(u)[1], out = []; for (let d = st / DAY; out.length < 1000 && d * DAY <= Date.now() + 5 * DAY; d++) out.push([d * DAY, 0, 0, 0, String(price(d)), 0, (d + 1) * DAY - 1]); return J(out.filter(c => c[0] <= nowMs)); }
    if (/bitstamp/.test(u)) { const st = +/start=(\d+)/.exec(u)[1], out = []; for (let d = st / 86400; out.length < 1000 && d * DAY <= nowMs; d++) out.push({ timestamp: String(d * 86400), close: String(price(d) * 1.0001) }); return J({ data: { ohlc: out } }); }
    throw new Error('unexpected ' + u);
  };
  let nowMs = Date.parse('2026-11-26T00:07:00Z');
  const rd = f => JSON.parse(fs.readFileSync(path.join(dir, 'm', f), 'utf8'));
  // wrong old prices: nothing is written
  tilt = 1e-5; let err = null; try { await main(dir, nowMs); } catch (e) { err = e; }
  check('old prices that do not give the published line: nothing written', err && /published line/.test(err.message) && !fs.existsSync(path.join(dir, 'm', 'rainbow.json')) && !fs.existsSync(path.join(dir, 'm', 'btcday.json')), err && err.message);
  tilt = 0; asked = [];
  const r1 = await main(dir, nowMs), D = rd('btcday.json'), R = rd('rainbow.json');
  check('first run: every day since 18 Aug 2010, the last finished UTC day at the end', r1 === 'written' && D.start === '2010-08-18' && D.p.length === C.rainbowDay('2026-11-25') - FROM + 1 && D.p.every(p => p > 0) && R.closes[13][0] === '2026-11-25', [r1, D.p.length]);
  check('first run: the day still open is not a close', !R.closes.some(c => c[0] === '2026-11-26'));
  check('first run: the published fit, to four decimals', Math.abs(R.fit.b - 5.5943) < 5e-4 && Math.abs(R.fit.a + 16.1839) < 2e-3 && R.fit.to === '2026-11-22', R.fit);
  check('the old days come from blockchain.com, the rest from Binance', near(D.p[0], price(FROM), 1e-9) && near(D.p[CUT - FROM], price(CUT), 1e-9) && asked.filter(u => /blockchain/.test(u)).length === 1 && asked.some(u => /klines.*startTime=1502928000000/.test(u)));
  // half an hour later: nothing to do, nothing asked
  asked = []; check('the same day again: no request, no write', await main(dir, nowMs + 30 * 60e3) === 'same' && asked.length === 0);
  // the next day: only the new close is asked for, the old days are not asked for again
  asked = []; nowMs += DAY; const r2 = await main(dir, nowMs), Rb = rd('rainbow.json');
  check('next day: one new close, blockchain.com not asked again, the same ruler', r2 === 'written' && Rb.closes[13][0] === '2026-11-26' && rd('btcday.json').p.length === D.p.length + 1 && !asked.some(u => /blockchain/.test(u)) && asked.length === 1 && JSON.stringify(Rb.fit) === JSON.stringify(R.fit), asked);
  // Binance down: Bitstamp's close; three missed days are filled in one go
  asked = []; down.bn = 1; nowMs += 3 * DAY; const r3 = await main(dir, nowMs), Rc = rd('rainbow.json');
  check('Binance silent: Bitstamp fills the missing days', r3 === 'written' && Rc.closes[13][0] === '2026-11-29' && asked.some(u => /bitstamp/.test(u)) && rd('btcday.json').p.length === D.p.length + 4 && Rc.fit.to === '2026-11-29', [r3, Rc.closes[13]]);
  globalThis.fetch = real; fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} of ${n} checks FAILED` : `all ${n} rainbow checks passed`);
process.exit(fails ? 1 : 0);
