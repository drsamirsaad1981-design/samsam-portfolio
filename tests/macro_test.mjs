// MVRV, the dollar index, BTC funding, stablecoin supply: the readers and the one funding wording (samsam-core.js) and the job that
// writes them (tools/update-macro.mjs), on a made-up network whose answers are known. (What the real sources say was
// measured on GitHub by tools/lab/macro.mjs.)
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import * as C from '../samsam-core.js';
process.env.MACRO_FAST = '1';
const { mvrvSummary, dxyFormula, dxyFrom, fundingMix, stablesFrom, PEG_MIN, main, MVRV_FROM, FAR_VENUES } = await import('../tools/update-macro.mjs');

let fails = 0, n = 0;
const check = (name, ok, info) => { n++; if (!ok) { fails++; console.log('✗', name, info === undefined ? '' : JSON.stringify(info)); } };
const DAY = 864e5, dn = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY), iso = d => new Date(d * DAY).toISOString().slice(0, 10), near = (a, b, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
const NOW = Date.parse('2026-11-27T13:20:00Z'), TODAY = Math.floor(NOW / DAY);

// ── the one funding wording ──
{
  const cases = [[0.05, 'hot'], [0.03, 'hot'], [0.0299, 'up'], [0.0101, 'up'], [0.01, 'rest'], [0.010004, 'rest'], [0.0044, 'rest'], [0, 'rest'], [-0.0001, 'neg'], [-0.0099, 'neg'], [-0.01, 'deep'], [-0.05, 'deep']];
  check('fundingRead: hot ≥ +0.03 · up > +0.01 · rest 0…+0.01 · neg < 0 · deep ≤ −0.01 (the resting +0.0100% itself is "rest")', cases.every(([r, k]) => C.fundingRead(r) === k), cases.map(([r]) => C.fundingRead(r)));
  check('…no number → no word', C.fundingRead(null) === null && C.fundingRead(NaN) === null && C.fundingWord(undefined, false) === '');
  check('…every state has its words, long and short, in both languages', ['hot', 'up', 'rest', 'neg', 'deep'].every(k => ['en', 'ar'].every(l => C.FUNDING_WORDS[l][k] && C.FUNDING_SHORT[l][k])));
  check('…the words never tell anyone to buy or sell', !/\b(buy|sell)\b|اشتر|بِع|بيع الآن/i.test(JSON.stringify([C.FUNDING_WORDS.en, C.FUNDING_SHORT.en])) && !/اشترِ|بِعْ/.test(JSON.stringify(C.FUNDING_WORDS.ar)));
  { // the card's bar reads the same edges as the words: five equal segments, the dot always inside the one its word names
    const rates = [-0.5, -0.02, -0.015, -0.01, -0.0099, -0.0001, 0, 0.0047, 0.01, 0.0101, 0.02, 0.0299, 0.03, 0.04, 0.5], P = rates.map(r => C.fundingPos(r));
    check('fundingPos: the segment is the word\'s own state, for every rate', P.every((p, i) => p.k === C.fundingRead(rates[i]) && p.i === C.FUNDING_ORDER.indexOf(p.k)), P.map(p => p.k + p.i).join());
    check('…the place never goes back as the rate rises, and stays inside its segment (14% … 86% of it)', P.every((p, i) => (!i || p.pos >= P[i - 1].pos) && p.pos >= p.i * 20 + 2.8 - 1e-9 && p.pos <= p.i * 20 + 17.2 + 1e-9), P.map(p => p.pos).join());
    check('…+0.0047% sits in the middle fifth (calm), a little under its centre; far readings are pinned, not off the bar', near(C.fundingPos(0.0047).pos, 49.4) && C.fundingPos(0.5).pos === 97.2 && C.fundingPos(-0.5).pos === 2.8 && C.fundingPos(null) === null);
    check('…the edges are the words\' edges, in one place', C.FUNDING_EDGES.join() === '-0.01,0,0.01,0.03' && C.FUNDING_ORDER.join() === 'deep,neg,rest,up,hot' && C.fundingRead(C.FUNDING_EDGES[0]) === 'deep' && C.fundingRead(C.FUNDING_EDGES[1]) === 'rest' && C.fundingRead(C.FUNDING_EDGES[2]) === 'rest' && C.fundingRead(C.FUNDING_EDGES[3]) === 'hot');
  }
  check('fundingWord picks the language and the length', C.fundingWord(0.004, false) === C.FUNDING_WORDS.en.rest && C.fundingWord(-0.02, true, true) === 'ازدحام بيع');
}

// ── the readers drop what has grown old ──
{
  const M = { v: 1, day: '2026-11-26', now: 1.139, price: 60415, realized: 53033, peaks: [[2024, 2.74, '2024-11-21']], src: 'Coin Metrics' };
  const r = C.mvrvRead(M, NOW);
  check('mvrvRead: the day, the ratio, the average cost, the cycles, the source', r && r.v === 1.139 && r.realized === 53033 && r.day === '2026-11-26' && r.peaks.length === 1 && r.src === 'Coin Metrics' && r.via === null, r);
  check('…a ratio whose day ended over 4 days ago is not a reading', C.mvrvRead(M, Date.parse('2026-12-01T00:00:01Z')) === null && C.mvrvRead(M, Date.parse('2026-11-30T23:00:00Z')) !== null);
  check('…nothing / a broken part → null', C.mvrvRead(null, NOW) === null && C.mvrvRead({ day: '2026-11-26', now: 0 }, NOW) === null);
  check('mvrvLevel: 1 … 10, two decimals, else the default 3', C.mvrvLevel(2.5) === 2.5 && C.mvrvLevel('3.456') === 3.46 && C.mvrvLevel(0.5) === C.MVRV_EXIT && C.mvrvLevel(11) === 3 && C.mvrvLevel(undefined) === 3 && C.MVRV_EXIT === 3);
  const D = { v: 1, price: 103.87, ch24: 0.19, ch7: -0.03, lo52: 96.22, hi52: 104.32, at: '2026-11-27T13:10:00.000Z', src: 'Yahoo Finance (DX-Y.NYB)' }, d = C.dxyNow(D, NOW);
  check('dxyNow: the price, the changes, its place in the 52-week range (94%)', d && d.price === 103.87 && d.ch24 === 0.19 && Math.round(d.pos) === 94, d);
  check('…a weekend keeps Friday\'s quote; six days old is dropped', C.dxyNow(D, Date.parse('2026-11-30T08:00:00Z')) !== null && C.dxyNow(D, Date.parse('2026-12-03T14:00:00Z')) === null);
  check('dxyRead: five levels around the base of 100 — low < 90 · under < 100 · mid < 105 · high < 110 · rare', [60, 89.99, 90, 99.99, 100, 104.99, 105, 109.99, 110, 160].map(C.dxyRead).join() === 'low,low,under,under,mid,mid,high,high,rare,rare' && C.dxyRead(0) === null && C.dxyRead(NaN) === null && d.k === 'mid');
  check('…its words in both languages, the last one "Rare strength" / "قوة نادرة" (a level, never a cause)', C.dxyWord(103.9) === 'Moderate strength' && C.dxyWord(112, true) === 'قوة نادرة' && C.dxyWord(95, true) === 'دون نقطة الأساس' && C.dxyWord(null) === '' && Object.keys(C.DXY_WORDS.en).join() === Object.keys(C.DXY_RANGES).join() && !/tighten|تشديد/i.test(JSON.stringify(C.DXY_WORDS)));
  const F = { v: 1, rate: 0.0044, m7: 0.002, oi: 9.3e9, n: 5, venues: [{ k: 'OKX', rate: 0.0003, oi: 1.96e9 }], missing: ['Binance', 'Bybit'], at: '2026-11-27T13:00:00.000Z' }, f = C.fundingNow(F, NOW);
  check('fundingNow: the rate, a year of it (× 1095), its state, the venues that are NOT in it', f && f.rate === 0.0044 && near(f.yr, 4.818) && f.k === 'rest' && f.missing.join() === 'Binance,Bybit' && f.n === 5, f);
  check('…over six hours old → null', C.fundingNow(F, Date.parse('2026-11-27T19:00:01Z')) === null && C.fundingNow(F, Date.parse('2026-11-27T18:59:00Z')) !== null && C.fundingNow({ rate: 0.01 }, NOW) === null);
}

// ── MVRV's summary ──
const mv = d => 1.6 + 1.2 * Math.sin((d - 14000) / 232);   // a made-up ratio, always between 0.4 and 2.8
{
  const days = new Map(); for (let d = dn('2010-07-18'); d < TODAY; d++) days.set(d, d < dn(MVRV_FROM) ? 140 : mv(d));
  days.set(dn('2013-11-18'), 5.88); days.set(dn('2024-11-21'), 2.95); days.set(dn('2015-01-14'), 0.2);
  const s = mvrvSummary(days, { price: 60415, nowMs: NOW }), last = TODAY - 1;
  check('mvrvSummary: the last day, its ratio, the price → the average cost (price ÷ ratio)', s && s.day === iso(last) && near(s.now, mv(last), 1e-4) && s.price === 60415 && s.realized === Math.round(60415 / mv(last)), s && [s.day, s.now, s.realized]);
  check('…the months before 2011 are not a reading (no 140 anywhere)', s.peaks.every(p => p[1] < 10) && s.peaks.length === 5, s.peaks);
  check('…each cycle\'s highest and lowest, named by the year they happened', s.peaks[1].join() === '2013,5.88,2013-11-18' && s.peaks[4].join() === '2024,2.95,2024-11-21' && s.lows[1].join() === '2015,0.2,2015-01-14', [s.peaks, s.lows]);
  check('…a week and a month back; the last day at or over 3.5 and under 1', near(s.wk, mv(last - 7), 1e-4) && near(s.mo, mv(last - 30), 1e-4) && s.over35 === '2013-11-18' && typeof s.under1 === 'string' && s.src === 'Coin Metrics' && !('via' in s), s);
  { const from = dn('2012-01-01'), H = [...days.entries()].filter(([d, v]) => d >= from && v > 0), cur = days.get(last), h = s.hist;
    check('mvrvSummary: its place in its history — the share of days since 2012 under today\'s ratio, the lowest and the highest', h && h.from === '2012-01-01' && h.days === H.length && near(h.under, +(H.filter(([, v]) => v < cur).length / H.length * 100).toFixed(1)) && near(h.lo[0], Math.min(...H.map(x => x[1])), 1e-3) && near(h.hi[0], Math.max(...H.map(x => x[1])), 1e-3), h);
    const rd = C.mvrvRead(s, NOW);
    check('…mvrvRead hands it on; a part without it reads null (the card then shows no line)', rd && rd.hist && rd.hist.under === h.under && rd.hist.year === 2012 && C.mvrvRead({ ...s, hist: undefined }, NOW).hist === null, rd && rd.hist); }
  check('…a stand-in day is marked', mvrvSummary(days, { via: 'blockchain.com', nowMs: NOW }).via === 'blockchain.com' && mvrvSummary(days, { via: 'blockchain.com', nowMs: NOW }).realized === null);
  check('…too few days → nothing', mvrvSummary(new Map([[TODAY - 1, 1.1]])) === null);
}

// ── the dollar index ──
{
  const r = { EUR: 0.92, JPY: 150, GBP: 0.79, CAD: 1.37, SEK: 10.5, CHF: 0.88 };
  check('ICE\'s formula: 50.14348112 × the six rates to their weights (the weights add up to 1)', near(dxyFormula(r), 50.14348112 * 0.92 ** 0.576 * 150 ** 0.136 * 0.79 ** 0.119 * 1.37 ** 0.091 * 10.5 ** 0.042 * 0.88 ** 0.036) && Math.round(dxyFormula(r) * 10) === 1039 && dxyFormula({ ...r, SEK: 0 }) === null, dxyFormula(r));
  const rows = []; for (let d = TODAY - 370; d <= TODAY; d++) if (![0, 6].includes(new Date(d * DAY).getUTCDay())) rows.push([d, 100 + (d - TODAY) * 0.01]);   // a slow climb to 100 today (a Friday)
  const live = dxyFrom(rows, 100.5, NOW, 'x'), done = rows.filter(x => x[0] < TODAY);
  check('dxyFrom: the day\'s change is against the last FINISHED day, not today\'s own row', live.prev === done[done.length - 1][1] && near(live.ch24, (100.5 / done[done.length - 1][1] - 1) * 100, 1e-3), live);
  check('…the week = five finished trading days back; the 52-week range takes the live price in', near(live.ch7, (100.5 / done[done.length - 5][1] - 1) * 100, 1e-3) && live.hi52 === 100.5 && near(live.lo52, Math.min(...rows.filter(x => x[0] > TODAY - 366).map(x => x[1]))), live);
  const sat = dxyFrom(rows, 100, Date.parse('2026-11-27T22:00:00Z'), 'x');
  check('…after Friday\'s close the day is still Friday against Thursday', near(sat.ch24, (100 / (100 - 0.01) - 1) * 100, 1e-3) && sat.at === '2026-11-27T22:00:00.000Z', sat);
  check('…a month of rows: no 52-week range claimed', dxyFrom(rows.slice(-22), 100, NOW, 'x').lo52 === null && dxyFrom(rows.slice(-3), 100, NOW, 'x') === null);
}

// ── the funding mix ──
{
  const rows = [{ k: 'OKX', rate: 0.0003, oi: 1.96e9, m7: 0.0025 }, { k: 'Bitget', rate: 0.0018, oi: 2.31e9, m7: 0.0003 }, { k: 'Gate', rate: 0.0069, oi: 1.95e9, m7: 0.002 }, { k: 'Hyperliquid', rate: 0.01, oi: 2.32e9, m7: 0.0028 }, { k: 'Deribit', rate: 0.0003, oi: 0.8021e9, m7: -0.0009 }];
  const f = fundingMix(rows, NOW), tot = rows.reduce((a, x) => a + x.oi, 0);
  check('fundingMix: weighted by open interest (+0.0045% from the lab\'s five rates), five venues, Binance and Bybit named as missing', f && f.rate === +(rows.reduce((a, x) => a + x.rate * x.oi, 0) / tot).toFixed(4) && f.rate === 0.0045 && f.n === 5 && near(f.oi, tot) && f.missing.join() === 'Binance,Bybit' && f.venues[0].k === 'Hyperliquid', f);
  check('…the 7-day mean is weighted the same way', near(f.m7, +(rows.reduce((a, x) => a + x.m7 * x.oi, 0) / tot).toFixed(4)), f.m7);
  const g = fundingMix(rows.concat([{ k: 'Binance', rate: 0.005, oi: 9e9, m7: 0.004 }]), NOW);
  check('…when the relay hands Binance over it joins the mix and leaves the "missing" list by itself', g.n === 6 && g.missing.join() === 'Bybit' && g.venues[0].k === 'Binance' && g.rate !== f.rate && near(g.rate, +((rows.reduce((a, x) => a + x.rate * x.oi, 0) + 0.005 * 9e9) / (tot + 9e9)).toFixed(4)), g);
  check('…a venue with no open interest is listed but cannot weigh', (h => h.n === 4 && h.venues.length === 5 && h.venues[4].k === 'Deribit' && h.venues[4].oi === null)(fundingMix(rows.map(x => x.k === 'Deribit' ? { ...x, oi: null } : x), NOW)));
  check('…two venues are not a mix; a wild number is thrown out', fundingMix(rows.slice(0, 2), NOW) === null && fundingMix(rows.map((x, i) => i < 3 ? { ...x, rate: 9 } : x), NOW) === null);
  check('…the far venues are exactly Binance and Bybit', FAR_VENUES.join() === 'Binance,Bybit');
}

// ── the whole job on a made-up network ──
const J = j => new Response(JSON.stringify(j), { status: 200 }), real = globalThis.fetch, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-'));
const net = { cm: true, cmTo: TODAY - 1, bc: true, dxy: true, pairs: true, okx: true, relay: false, ll: true, llList: true, calls: [] };
// DefiLlama, made up: the supply in coins falls $100M a day to $280B today; at market price it is 2% lower (a de-peg) —
// and there are euro coins beside the dollar ones
const llChart = to => { const a = []; for (let d = to - 400; d <= to; d++) a.push({ date: String(d * 86400), totalCirculating: { peggedUSD: 280e9 + (to - d) * 1e8, peggedEUR: 5e8 }, totalCirculatingUSD: { peggedUSD: (280e9 + (to - d) * 1e8) * 0.98, peggedEUR: 5.4e8 } }); return a; };
const llCoin = (symbol, c, prev, pegType = 'peggedUSD', price = 0.9991) => ({ id: symbol, symbol, name: symbol + ' Dollar', pegType, pegMechanism: 'fiat-backed', price, circulating: { [pegType]: c }, circulatingPrevMonth: prev ? { [pegType]: prev } : 0 });
const llList = () => ({ peggedAssets: [...(net.llLow || []), llCoin('USDC', 70e9, 72e9), llCoin('EURC', 3e11, 3e11, 'peggedEUR'), llCoin('USDT', 172e9, 180e9), llCoin('NEWUSD', 6e8, 0), llCoin('DEAD', 0, 1e9), ...Array.from({ length: 9 }, (_, i) => llCoin('S' + i, (9 - i) * 1e9, (9 - i) * 1e9))] });
const pay = (n, base, step = 8 * 36e5) => Array.from({ length: n }, (_, i) => [NOW - 36e5 - i * step, base]);
globalThis.fetch = async (u, o) => { u = String(u); net.calls.push(u);
  if (/coinmetrics/.test(u)) { if (!net.cm) return new Response('{}', { status: 503 }); const from = dn(/start_time=([\d-]+)/.exec(u)[1]), data = []; for (let d = from; d <= net.cmTo; d++) data.push({ asset: 'btc', time: iso(d) + 'T00:00:00.000000000Z', CapMVRVCur: String(d < dn('2011-01-01') ? 140 : mv(d)), PriceUSD: '60000' }); return J({ data }); }
  if (/blockchain\.info\/charts\/mvrv/.test(u)) { if (!net.bc) return new Response('x', { status: 500 }); const values = []; for (let d = TODAY - 30; d <= TODAY + 6; d++) values.push({ x: d * 86400, y: mv(d) * 1.002 }); return J({ values }); }
  if (/finance\.yahoo/.test(u)) { const sym = decodeURIComponent(/chart\/([^?]+)/.exec(u)[1]); if (sym === 'DX-Y.NYB' ? !net.dxy : !net.pairs) return new Response('{"chart":{"result":null}}', { status: 404 });
    const base = { 'DX-Y.NYB': 103.8, 'EURUSD=X': 1 / 0.92, 'JPY=X': 150, 'GBPUSD=X': 1 / 0.79, 'CAD=X': 1.37, 'SEK=X': 10.5, 'CHF=X': 0.88 }[sym], ts = [], cl = [], span = /range=1y/.test(u) ? 370 : 31;
    for (let d = TODAY - span; d <= TODAY; d++) if (![0, 6].includes(new Date(d * DAY).getUTCDay())) { ts.push(d * 86400 + 3600 * 13); cl.push(base); }
    return J({ chart: { result: [{ meta: { regularMarketPrice: base, regularMarketTime: ts.at(-1), chartPreviousClose: 1 }, timestamp: ts, indicators: { quote: [{ close: cl }] } }] } }); }
  if (/okx/.test(u)) { if (!net.okx) return new Response('{}', { status: 500 }); if (/funding-rate-history/.test(u)) return J({ data: pay(100, 0.000025).map(p => ({ fundingTime: String(p[0]), realizedRate: String(p[1]) })) }); if (/funding-rate/.test(u)) return J({ data: [{ fundingRate: '0.000003' }] }); return J({ data: [{ oiUsd: '1960000000' }] }); }
  if (/bitget/.test(u)) { if (/current-fund-rate/.test(u)) return J({ data: [{ fundingRate: '0.000018' }] }); if (/history-fund-rate/.test(u)) return J({ data: pay(100, 0.000003).map(p => ({ fundingTime: String(p[0]), fundingRate: String(p[1]) })) }); if (/open-interest/.test(u)) return J({ data: { openInterestList: [{ size: '38500' }] } }); return J({ data: [{ lastPr: '60000' }] }); }
  if (/gateio/.test(u)) { if (/contracts/.test(u)) return J({ funding_rate: '0.000069', position_size: 325000000, quanto_multiplier: '0.0001', mark_price: '60000', funding_interval: 28800 }); return J(pay(90, 0.00002).map(p => ({ t: Math.floor(p[0] / 1000), r: String(p[1]) }))); }
  if (/hyperliquid/.test(u)) { const b = JSON.parse(o.body); if (b.type === 'metaAndAssetCtxs') return J([{ universe: [{ name: 'ETH' }, { name: 'BTC' }] }, [{}, { funding: '0.0000125', openInterest: '38666.667', markPx: '60000' }]]); return J(pay(168, 0.0000035, 36e5).map(p => ({ time: p[0], fundingRate: String(p[1]) }))); }
  if (/deribit/.test(u)) { if (/ticker/.test(u)) return J({ result: { funding_8h: 0.000003, open_interest: 802100000 } }); return J({ result: pay(168, -0.000009, 36e5).map(p => ({ timestamp: p[0], interest_8h: p[1] })) }); }
  if (/llama/.test(u)) { if (!net.ll || (/stablecoins\?/.test(u) && !net.llList)) return new Response('{}', { status: 502 }); return /stablecoincharts\/all/.test(u) ? J(llChart(net.llTo || TODAY)) : J(llList()); }
  if (/binanceRelay/.test(u)) return net.relay ? J({ venues: [{ k: 'Binance', rate: 0.005, oi: 9e9, m7: 0.004 }, { k: 'Mallory', rate: 1, oi: 9e12 }] }) : new Response('{"error":"POST only"}', { status: 405 });
  return new Response('?', { status: 404 }); };
{
  fs.mkdirSync(path.join(dir, 'm'), { recursive: true });
  const a = await main(dir, NOW), kept = JSON.parse(fs.readFileSync(path.join(dir, 'm', 'mvrv.json'), 'utf8')), file = JSON.parse(fs.readFileSync(path.join(dir, 'm', 'macro.json'), 'utf8'));
  check('first run: MVRV\'s history from 2011 is kept (one ratio a day, to yesterday), nothing from before', kept.start === '2011-01-01' && kept.cm === iso(TODAY - 1) && kept.p.length === TODAY - dn('2011-01-01') && kept.p.every(v => v > 0 && v < 10) && kept.px === 60000, [kept.cm, kept.p.length]);
  check('…the file carries the four parts, each with its make-up number and its time', file.v === 1 && ['mvrv', 'dxy', 'funding', 'stables'].every(k => file[k] && file[k].v === 1 && file[k].at) && JSON.stringify(file) === JSON.stringify(a), Object.keys(file));
  check('…MVRV: yesterday\'s ratio, the average cost from Coin Metrics\' own price, the source named', file.mvrv.day === iso(TODAY - 1) && near(file.mvrv.now, mv(TODAY - 1), 1e-4) && file.mvrv.realized === Math.round(60000 / mv(TODAY - 1)) && file.mvrv.src === 'Coin Metrics' && !file.mvrv.via, file.mvrv);
  check('…DXY from the index itself', file.dxy.price === 103.8 && file.dxy.ch24 === 0 && /DX-Y\.NYB/.test(file.dxy.src) && file.dxy.lo52 === 103.8, file.dxy);
  check('…funding: five venues weighted to +0.0045%, hourly venues × 8, the 7-day mean, without Binance and Bybit', file.funding.rate === 0.0045 && file.funding.n === 5 && file.funding.missing.join() === 'Binance,Bybit' && file.funding.venues.find(x => x.k === 'Hyperliquid').rate === 0.01 && file.funding.venues.find(x => x.k === 'Deribit').m7 === -0.0009 && file.funding.m7 != null, file.funding);
  check('…the readers accept the file as it is', C.mvrvRead(file.mvrv, NOW) && C.dxyNow(file.dxy, NOW) && C.fundingNow(file.funding, NOW).k === 'rest');
  // ── stablecoin supply ──
  const st = file.stables, sn = C.stablesNow(st, NOW);
  check('…stables: the dollar-pegged supply in COINS ($280B — not the $274.4B at market price, not the euro coins), to today, with its last 31 days and the total a year before', st && st.v === 1 && st.day === iso(TODAY) && st.total === 280e9 && st.tot.length === 31 && st.tot[0] === 283e9 && st.tot[30] === 280e9 && st.y1 === 280e9 + 365e8 && st.src === 'DefiLlama' && st.at, st && [st.day, st.total, st.tot[0], st.y1]);
  check('…the biggest eight by supply from the list itself (dollar pegs only, a coin with nothing in circulation left out), each with its supply a month ago — none for a coin that was not listed then', st.top.length === 8 && st.top.map(x => x.sym).join() === 'USDT,USDC,S0,S1,S2,S3,S4,S5' && st.top[0].circ === 172e9 && st.top[0].m30 === 180e9 && st.top[0].price === 0.9991 && st.n === 12 && !st.top.some(x => /EURC|DEAD/.test(x.sym)), st.top.map(x => x.sym));
  check('stablesNow: a day / 7 / 30 days / a year in coins and in percent, 30 daily changes oldest first, each coin\'s share and month', sn && sn.total === 280e9 && sn.d1 === -1e8 && sn.d7 === -7e8 && sn.d30 === -3e9 && sn.d365 === -365e8 && near(sn.p30, -3e9 / 283e9 * 100) && near(sn.p7, -7e8 / 280.7e9 * 100) && near(sn.p365, (280e9 / 316.5e9 - 1) * 100)
    && sn.bars.length === 30 && sn.bars[0][0] === iso(TODAY - 29) && sn.bars[29][0] === iso(TODAY) && sn.bars.every(b => b[1] === -1e8) && near(sn.top[0].share, 172 / 280 * 100) && near(sn.top[0].m30, (172 / 180 - 1) * 100) && sn.top[0].isNew === false, sn && [sn.d1, sn.d7, sn.d30, sn.d365, sn.bars.length]);
  { const s2 = stablesFrom(llChart(TODAY), { peggedAssets: [llCoin('USDT', 172e9, 180e9), llCoin('NEWUSD', 6e8, 0)] }, NOW), r2 = C.stablesNow(s2, NOW);
    check('…a coin that was not listed a month ago is "new", never a percent', r2.top[1].sym === 'NEWUSD' && r2.top[1].isNew === true && r2.top[1].m30 === null && s2.top[1].m30 === null, r2.top[1]);
    const gap = llChart(TODAY).filter(x => +x.date / 86400 !== TODAY - 7), r3 = C.stablesNow(stablesFrom(gap, llList(), NOW), NOW);
    check('…a missing day leaves a gap, not a made-up change: no 7-day figure, 28 bars', r3.d7 === null && r3.p7 === null && r3.d30 === -3e9 && r3.bars.length === 28 && !r3.bars.some(b => b[0] === iso(TODAY - 7) || b[0] === iso(TODAY - 6)), [r3.d7, r3.bars.length]);
    // ── a coin that is no longer a dollar ──
    const L3 = px => ({ peggedAssets: [llCoin('USDT', 172e9, 180e9), llCoin('FELL', 2e9, 5e9, 'peggedUSD', px), llCoin('NOPX', 1e9, 1e9, 'peggedUSD', null), llCoin('EDGE', 4e8, 4e8, 'peggedUSD', 0.9), llCoin('ZERO', 3e8, 3e8, 'peggedUSD', 0)] });
    const f1 = stablesFrom(llChart(TODAY), L3(0.42), NOW);   // no memory: the list is taken as it is found
    check('under $0.90 (the first run, no memory): the coin is left out — its supply now comes off the total, off every day kept and off the year before, so leaving it out is not itself a fall',
      PEG_MIN === 0.9 && f1.out.n === 2 && f1.out.sum === 2.3e9 && f1.out.min === 0.9 && f1.total === 280e9 - 2.3e9 && f1.tot.every((v, i) => v === 283e9 - i * 1e8 - 2.3e9) && f1.y1 === 280e9 + 365e8 - 2.3e9 && C.stablesNow(f1, NOW).d30 === -3e9 && C.stablesNow(f1, NOW).d1 === -1e8, [f1.out, f1.total]);
    check('…it is not among the coins shown, and is not counted; a coin at exactly $0.90 stays, and so does a coin the source has no price for (a missing price is not a fall); a price of 0 is a price', f1.top.map(x => x.sym).join() === 'USDT,NOPX,EDGE' && f1.n === 3 && !f1.top.some(x => 'id' in x) && Object.keys(f1.low).sort().join() === 'FELL,ZERO', [f1.top.map(x => x.sym), f1.low]);
    const g0 = stablesFrom(llChart(TODAY), L3(0.99), NOW, { v: 1, low: {} }), g1 = stablesFrom(llChart(TODAY), L3(0.42), NOW + 36e5, g0);
    check('…with a memory: the day a coin is FIRST seen under $0.90 it still counts (one bad price in one run takes nothing out)', g0.low.ZERO === iso(TODAY) && !g0.low.FELL && g0.out.n === 0 && g1.low.FELL === iso(TODAY) && g1.out.n === 0 && g1.total === 280e9 && g1.top.some(x => x.sym === 'FELL'), [g0.low, g1.low, g1.out]);
    const g2 = stablesFrom(llChart(TODAY + 1), L3(0.42), NOW + DAY, g1), g3 = stablesFrom(llChart(TODAY + 1), L3(0.95), NOW + DAY + 36e5, g2), g4 = stablesFrom(llChart(TODAY + 1), L3(0.42), NOW + DAY + 2 * 36e5, g3);
    check('…the next day, still under: left out', g2.low.FELL === iso(TODAY) && g2.out.n === 2 && g2.out.sum === 2.3e9 && g2.total === 280e9 - 2.3e9 && !g2.top.some(x => x.sym === 'FELL'), [g2.low, g2.out]);
    check('…back over $0.90: it counts again at once; under again: a new first day', !g3.low.FELL && g3.out.n === 1 && g3.total === 280e9 - 3e8 && g3.top.some(x => x.sym === 'FELL') && g4.low.FELL === iso(TODAY + 1) && g4.out.n === 1, [g3.low, g4.low]);
    const g5 = stablesFrom(llChart(TODAY + 1), null, NOW + DAY + 3 * 36e5, g2);
    check('…the list silent: the same coins stay out (their last supply) and the last breakdown stays', g5.out.sum === 2.3e9 && g5.total === 280e9 - 2.3e9 && g5.low.FELL === iso(TODAY) && g5.top.map(x => x.sym).join() === g2.top.map(x => x.sym).join() && g5.n === 3, [g5.out, g5.total]);
    check('…a part over 4 days old is not a reading; a short or empty answer is no part', C.stablesNow(st, NOW + 4 * DAY) && C.stablesNow(st, NOW + 6 * DAY) === null && stablesFrom([], llList(), NOW) === null && stablesFrom(llChart(TODAY).slice(-20), llList(), NOW) === null && stablesFrom(null, null, NOW) === null && C.stablesNow(null, NOW) === null && C.stablesNow({ ...st, tot: [1] }, NOW) === null);
  }

  net.calls = []; await main(dir, NOW + 30 * 60e3);
  check('half an hour later: Coin Metrics is not asked again (the day is there); the index and the venues are', !net.calls.some(u => /coinmetrics|blockchain/.test(u)) && net.calls.some(u => /DX-Y/.test(u)) && net.calls.some(u => /okx/.test(u)), net.calls.filter(u => /coinmetrics/.test(u)));

  net.calls = []; net.cmTo = TODAY; const b = await main(dir, NOW + DAY);   // the next day: only the missing day is asked for
  check('the next day: one request from the first missing day; the history grows by one', net.calls.filter(u => /coinmetrics/.test(u)).length === 1 && /start_time=2026-11-27/.test(net.calls.find(u => /coinmetrics/.test(u))) && b.mvrv.day === '2026-11-27' && JSON.parse(fs.readFileSync(path.join(dir, 'm', 'mvrv.json'), 'utf8')).p.length === kept.p.length + 1, b.mvrv.day);

  net.cm = false; net.calls = []; const c1 = await main(dir, NOW + 2 * DAY);
  check('Coin Metrics silent for one day: the last ratio stays, nobody else is asked yet', c1.mvrv.day === '2026-11-27' && !c1.mvrv.via && !net.calls.some(u => /blockchain/.test(u)), c1.mvrv);
  const c2 = await main(dir, NOW + 3 * DAY), k2 = JSON.parse(fs.readFileSync(path.join(dir, 'm', 'mvrv.json'), 'utf8'));
  check('…silent for two: blockchain.com stands in for the DAY (marked "via"), the kept history is not touched', c2.mvrv.via === 'blockchain.com' && c2.mvrv.day === iso(TODAY + 2) && near(c2.mvrv.now, mv(TODAY + 2) * 1.002, 1e-4) && c2.mvrv.src === 'Coin Metrics' && k2.cm === '2026-11-27', [c2.mvrv, k2.cm]);
  net.bc = false; const c3 = await main(dir, NOW + 3 * DAY + 36e5);
  check('…and with both silent the last answer is kept, never an empty part', c3.mvrv && c3.mvrv.day === c2.mvrv.day, c3.mvrv);
  net.cm = true; net.cmTo = TODAY + 3; net.bc = true; const c4 = await main(dir, NOW + 4 * DAY);
  check('…Coin Metrics back: its own days replace the stand-in', !c4.mvrv.via && c4.mvrv.day === iso(TODAY + 3) && near(c4.mvrv.now, mv(TODAY + 3), 1e-4), c4.mvrv);

  net.dxy = false; const d1 = await main(dir, NOW + 4 * DAY);
  check('the index symbol silent: ICE\'s formula over Yahoo\'s six pairs (103.9), said so in the source; the 52-week range kept', Math.round(d1.dxy.price * 10) === 1039 && /formula/.test(d1.dxy.src) && d1.dxy.lo52 === 103.8 && d1.dxy.hi52 >= d1.dxy.price, d1.dxy);
  net.pairs = false; const d2 = await main(dir, NOW + 4 * DAY);
  check('…and with the pairs silent too, the last answer stays', d2.dxy.price === d1.dxy.price);

  net.llList = false; net.llTo = TODAY + 4; const l1 = await main(dir, NOW + 4 * DAY);
  check('DefiLlama\'s list silent: the total and its days are new, the last breakdown stays', l1.stables.day === iso(TODAY + 4) && l1.stables.top.length === 8 && l1.stables.top[0].sym === 'USDT' && l1.stables.n === 12, l1.stables && [l1.stables.day, l1.stables.top.length]);
  net.ll = false; net.llList = true; const l2 = await main(dir, NOW + 4 * DAY + 36e5);
  check('…DefiLlama silent: the last part stays, never an empty one', JSON.stringify(l2.stables) === JSON.stringify(l1.stables));
  net.ll = true; net.llLow = [llCoin('DEADUSD', 5e8, 5e8, 'peggedUSD', 0.31)]; const l3 = await main(dir, NOW + 4 * DAY + 2 * 36e5), l4 = await main(dir, NOW + 5 * DAY);
  check('the whole job: a coin seen under $0.90 today is remembered and still counted; the next day it is left out of the total and of the coins', l3.stables.low.DEADUSD === iso(TODAY + 4) && l3.stables.out.n === 0 && l3.stables.total === 280e9 && l4.stables.out.n === 1 && l4.stables.out.sum === 5e8 && l4.stables.total === 280e9 - 5e8 && l4.stables.n === 12 && JSON.parse(fs.readFileSync(path.join(dir, 'm', 'macro.json'), 'utf8')).stables.low.DEADUSD === iso(TODAY + 4), [l3.stables.low, l4.stables.out]);
  net.llLow = null; net.llTo = TODAY + 4;
  net.relay = true; const r1 = await main(dir, NOW + 4 * DAY);
  check('the relay answers: Binance joins (6 venues), only Bybit is missing — and a name the job does not know is ignored', r1.funding.n === 6 && r1.funding.missing.join() === 'Bybit' && r1.funding.venues.some(x => x.k === 'Binance') && !r1.funding.venues.some(x => x.k === 'Mallory'), r1.funding);
  net.relay = false; net.okx = false; const calls0 = net.calls.length; const r2 = await main(dir, NOW + 4 * DAY);
  check('one venue silent: four are still a mix', r2.funding.n === 4 && !r2.funding.venues.some(x => x.k === 'OKX') && net.calls.length > calls0, r2.funding);
  globalThis.fetch = async u => /coinmetrics|yahoo|blockchain/.test(String(u)) ? new Response('x', { status: 500 }) : new Response('{}', { status: 500 });
  const r3 = await main(dir, NOW + 4 * DAY);
  check('everything silent: every part keeps its last answer', r3.funding && r3.funding.rate === r2.funding.rate && r3.dxy && r3.mvrv && r3.stables && r3.stables.total === 280e9, Object.keys(r3));
  globalThis.fetch = real; fs.rmSync(dir, { recursive: true, force: true });
}
console.log(fails ? `\n${fails} of ${n} checks FAILED` : `all ${n} macro checks passed`);
process.exit(fails ? 1 : 0);
