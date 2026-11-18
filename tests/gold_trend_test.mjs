// ✨ Gold Trend (samsam-core.js → perfChartSeries goldAt): the same money bought / sold as gold at the same moments.
import * as C from '../samsam-core.js';
let ok = 0, n = 0; const check = (name, c, d) => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' -> ' + JSON.stringify(d))); };
const T0 = Date.parse('2026-10-15T00:00:00Z'), D = 864e5;
const coins = [{ sym: 'ETH', opening: { qty: 0, avg: 0 } }, { sym: 'XAU', opening: { qty: 0, avg: 0 } }];
const tx = (sym, type, qty, price, t) => ({ id: sym + t, sym, type, qty, price, date: new Date(t).toISOString(), createdAt: new Date(t).toISOString() });
const snaps = [0, 1, 2, 3].map(i => ({ t: T0 + i * D + 1, v: 1000, b: 60000 }));
// 1. flat gold → Gold Trend 0%
let s = C.perfChartSeries(snaps, coins, [tx('ETH', 'buy', 1, 1000, T0)], { goldAt: () => 4000 });
check('flat gold price → Gold Trend 0%', s.gold.length === 4 && s.gold.every(p => Math.abs(p.v) < 1e-9), s.gold);
// 2. gold +10% after the buy → +10%
const g2 = t => t < T0 + 2 * D ? 4000 : 4400;
s = C.perfChartSeries(snaps, coins, [tx('ETH', 'buy', 1, 1000, T0)], { goldAt: g2 });
check('gold +10% → Gold Trend +10% at the end', Math.abs(s.gold[3].v - 10) < 1e-9 && Math.abs(s.gold[0].v) < 1e-9, s.gold.map(p => p.v));
// 3. money added later buys gold at that later price
const snaps3 = [0, 1, 2, 3].map(i => ({ t: T0 + i * D + 1, v: i < 2 ? 1000 : 2000, b: 60000 }));
s = C.perfChartSeries(snaps3, coins, [tx('ETH', 'buy', 1, 1000, T0), tx('ETH', 'buy', 1, 1000, T0 + 2 * D)], { goldAt: g2 });
check('second buy at the higher gold price: (1000×1.1 + 1000 − 2000) ÷ 2000 = +5%', Math.abs(s.gold[3].v - 5) < 1e-9, s.gold.map(p => p.v));
// 4. your own gold counts as gold → its own trend equals its price change
s = C.perfChartSeries(snaps, coins, [tx('XAU', 'buy', 0.25, 4000, T0)], { goldAt: g2 });
check('your gold is gold: Gold Trend follows the gold price (+10%)', Math.abs(s.gold[3].v - 10) < 1e-9, s.gold.map(p => p.v));
// 5. no gold prices → no line; BTC line unchanged
s = C.perfChartSeries(snaps, coins, [tx('ETH', 'buy', 1, 1000, T0)], {});
check('no gold prices → no Gold line, BTC line still there', s.gold.length === 0 && s.btc.length === 4, s);
// 6. silver line the same way (your silver counts as silver)
const sv = t => t < T0 + 2 * D ? 40 : 50;
s = C.perfChartSeries(snaps, coins, [tx('ETH', 'buy', 1, 1000, T0)], { goldAt: g2, silverAt: sv });
check('silver +25% → Silver Trend +25%, gold still +10%', Math.abs(s.silver[3].v - 25) < 1e-9 && Math.abs(s.gold[3].v - 10) < 1e-9, [s.silver, s.gold]);
// 7. Altcoins only: BTC and gold taken out of the value and the ledger
{
  const cs = [{ sym: 'ETH', opening: { qty: 0, avg: 0 } }, { sym: 'BTC', opening: { qty: 0, avg: 0 } }, { sym: 'XAU', opening: { qty: 0, avg: 0 } }];
  const txs = [tx('ETH', 'buy', 1, 1000, T0), tx('BTC', 'buy', 0.01, 60000, T0), tx('XAU', 'buy', 0.25, 4000, T0)];
  // value: ETH 1000→1200 (+20%), BTC 600 flat, gold 1000→1100
  const sn = [0, 1, 2, 3].map(i => ({ t: T0 + i * D + 1, v: (i < 2 ? 1000 : 1200) + 600 + (i < 2 ? 1000 : 1100), b: 60000 }));
  const a = C.altOnly(sn, cs, txs, { prices: { XAU: g2 } });
  check('altOnly: value without BTC and gold = ETH only', a.snaps.map(p => Math.round(p.v)).join() === '1000,1000,1200,1200', a.snaps.map(p => p.v));
  check('altOnly: ledger without BTC / XAU', a.coins.length === 1 && a.txs.length === 1 && a.txs[0].sym === 'ETH', a);
  const sa = C.perfChartSeries(a.snaps, a.coins, a.txs, { baselineBtc: 60000, goldAt: g2 });
  check('Altcoins only: blue +20%, BTC Trend 0%, Gold Trend +10%', Math.abs(sa.port[3].v - 20) < 1e-9 && Math.abs(sa.btc[3].v) < 1e-9 && Math.abs(sa.gold[3].v - 10) < 1e-9, [sa.port, sa.btc, sa.gold]);
  const sw = C.perfChartSeries(sn, cs, txs, { baselineBtc: 60000 });
  check('Whole portfolio for comparison: (300 profit) / 2600 = +11.5%', Math.abs(sw.port[3].v - 300 / 2600 * 100) < 1e-9, sw.port);
}
console.log(`gold_trend_test: ${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
