// tools/backtest.mjs on made-up prices: the same money in every strategy, BTC only when BTC is flat, a Reinforce buy and a
// Sell / Convert happen when the app's own rules say so, the Smart check turns a weak coin's Reinforce into Hold.
import { fileURLToPath } from 'node:url'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simulate, report, luckTest } = await import(path.join(ROOT, 'tools/backtest.mjs'));
let pass = 0, fail = 0; const check = (n, c, d = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' -> ' + JSON.stringify(d))); };
const DAY = 864e5, N = 200, t0 = Date.UTC(2026, 0, 1);
const mk = f => Array.from({ length: N }, (_, i) => [t0 + i * DAY, f(i)]);
// BTC flat at 100; DIP falls 10% after day 100 (→ Reinforce); CRASH falls 30% after day 100 (→ Sell / Convert);
// FLAT stays; WEAK: Reinforce by the price, but losing to BTC on 30 and 90 days
const series = {
  bitcoin: mk(() => 100),
  dip: mk(i => i < 100 ? 10 : 9),
  crash: mk(i => i < 100 ? 10 : 7),
  flat: mk(() => 5),
  weak: mk(i => i < 80 ? 12 : i < 96 ? 10 : 9.4),   // −6% under its buy → Reinforce, but down 20%+ vs BTC over 30 and 90 days → weak
};
const alts = [{ sym: 'DIP', id: 'dip' }, { sym: 'CRASH', id: 'crash' }, { sym: 'FLAT', id: 'flat' }, { sym: 'WEAK', id: 'weak' }, { sym: 'NEW', id: 'new' }];
const r = simulate(series, alts, { start: 90 });
const S = r.strategies;
check('every strategy puts in the same money ($10,000 + $100 a week)', new Set(Object.values(S).map(s => s.invested)).size === 1 && S.btc.invested === 10000 + 100 * Math.floor((N - 1 - 90) / 7), Object.values(S).map(s => s.invested));
check('BTC flat → BTC only is worth what went in, less the 0.1% fee', Math.abs(S.btc.final - S.btc.invested * 0.999) < 0.01, S.btc.final);
check('a coin without the whole period is left out (and named)', r.left.includes('NEW') && !r.coins.includes('NEW'), r.left);
check('Classic: DIP (−10% under its buy) gets Reinforce buys', S.classic.events.reinforce > 0);
check('Classic: CRASH (−30%) is sold into BTC once', S.classic.events.convert === 1 && r.converts.CRASH && r.converts.CRASH.classicConvert, r.converts);
check('hold ignores the signals (no buys, no sells)', S.hold.events.reinforce === 0 && S.hold.events.convert === 0);
check('Smart: the weak coin\'s first Reinforce weeks become Hold (Classic buys it a week 1, Smart later)', S.smart.events.smartStops > 0 && S.classic.events.first.WEAK === 97 && !(S.smart.events.first.WEAK <= 97), [S.smart.events.first, S.classic.events.first]);
const conv = r.converts.CRASH.classicConvert;
check('after a Sell / Convert: the coin\'s and BTC\'s moves to the end are measured', Number.isFinite(conv.coinAfter) && Number.isFinite(conv.btcAfter) && conv.helped === (conv.btcAfter > conv.coinAfter), conv);
const md = report(r);
check('the report: a table of the 4 strategies, vs BTC, worst drop', ['BTC only', 'Altcoins, hold', 'Classic signal', 'Smart signal', 'vs BTC only', 'Worst drop'].every(w => md.includes(w)), md.slice(0, 300));
check('the report says the test is kind to today\'s coins (survivorship) and names its period', md.includes('kinder') && /\d{4}-\d\d-\d\d → \d{4}-\d\d-\d\d/.test(md));
// 🎲 luck test: 9 flat coins + one that crashes and keeps falling → the signal sells the right one, random picks mostly don't
const L2 = { bitcoin: mk(() => 100) }, alts2 = [];
for (let k = 0; k < 9; k++) { L2['f' + k] = mk(() => 3 + k); alts2.push({ sym: 'F' + k, id: 'f' + k }); }
L2.down = mk(i => i < 100 ? 10 : Math.max(2, 7 - (i - 100) * 0.05)); alts2.push({ sym: 'DOWN', id: 'down' });
const k2 = luckTest(L2, alts2, { start: 90, runs: 300 });
check('luck test: the signal sells the crashing coin (1 sell), and every random try makes the same number of sells in the same week', k2.sells === 1 && k2.runs === 300, k2);
check('…selling the right coin beats most random picks (value and sells that helped)', k2.beats > 80 && k2.signal.helped === 100 && k2.random.helpedAvg < 30, k2);
const r2 = simulate(L2, alts2, { start: 90 }); r2.luck = k2; const md2 = report(r2);
check('the report has the luck table and a clear "Not financial advice" warning', md2.includes('Better than luck') && md2.includes('Not financial advice'), md2.slice(-500));
console.log(`backtest_test: ${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
