// helper for bot_app_parity_test.py: the bot's maths (tools/alerts-core.mjs → summarize) on the app's own data (stdin JSON)
import { summarize } from '../tools/alerts-core.mjs';
let raw = ''; for await (const c of process.stdin) raw += c;
const d = JSON.parse(raw);
const ids = Object.fromEntries(d.prices.map(p => [p.sym, 'id-' + p.sym.toLowerCase()])); ids.BTC = 'bitcoin';
const market = { top: d.prices.map(p => ({ id: ids[p.sym], sym: p.sym, price: p.price, ch24: p.ch24 })), cgIds: ids, series: {}, global: {} };
const s = summarize({ coins: d.coins, txs: d.txs, accum: d.accum, meta: d.meta }, market, d.now);
console.log(JSON.stringify({ value: s.value, total: s.total, pctTotal: s.pctTotal, signal: s.signal, counts: s.counts, prog: s.prog, plan: s.plan, d24: s.d24, ch24: s.ch24,
  coins: Object.fromEntries(s.coins.map(c => [c.sym, { qty: c.qty, avg: c.avg, value: c.value }])) }));
