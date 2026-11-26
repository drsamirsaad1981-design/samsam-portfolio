// 🧭 Asset classes (samsam-core.js): crypto · stock (bStocks) · metal (gold / silver in grams) · cash — and what each one
// means for Signals, the Altcoins total, the "altcoins only" chart and the zakat pool. Shared by the app and the bot.
import * as C from '../samsam-core.js';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + ' -> ' + JSON.stringify(d)); } };
check('the four classes', JSON.stringify(C.CLASSES) === '["crypto","stock","metal","cash"]');
check('a coin is crypto; gold and silver (grams) are metal; gold TOKENS stay crypto', ['BTC', 'SOL', 'XAU', 'XAG', 'PAXG', 'XAUT'].map(C.assetClass).join() === 'crypto,crypto,metal,metal,crypto,crypto');
check('a bStock is known by its CoinGecko id (as CoinGecko writes them: nvidia-bstocks, circle-internet-group-bstock, tesla-bstocks-tokenized-stock, intel-tokenized-bstocks), or by its own cls', ['nvidia-bstocks', 'circle-internet-group-bstock', 'tesla-bstocks-tokenized-stock', 'intel-tokenized-bstocks'].every(id => C.assetClass({ sym: 'X', cgId: id }) === 'stock') && C.assetClass({ sym: 'NVDAB', cgId: 'nvidia-bstock' }) === 'stock' && C.assetClass({ sym: 'TSLAB', cls: 'stock' }) === 'stock' && C.assetClass({ sym: 'ABC', cgId: 'abc' }) === 'crypto');
check('a symbol alone is crypto until the coins teach it…', C.assetClass('NVDAB') === 'crypto');
C.learnAssets([{ sym: 'NVDAB', cgId: 'nvidia-bstock' }, { sym: 'SOL', cgId: 'solana' }, { sym: 'XAU' }]);
check('…then the symbol alone is a stock (and a plain coin stays crypto)', C.assetClass('NVDAB') === 'stock' && C.assetClass('SOL') === 'crypto');
check('Signals: coins only — BTC, shares, gold and silver are held', [C.hasSignal('SOL'), C.hasSignal('BTC'), C.hasSignal('NVDAB'), C.hasSignal('XAU'), C.hasSignal('PAXG')].join() === 'true,false,false,false,true');
const rules = { reinforce: -5, sell: -20 };
check('signalFor: a share 30% down is Hold, a coin 30% down is Sell / Convert', C.signalFor({ sym: 'NVDAB', chg: -30, rules }).action === 'hold' && C.signalFor({ sym: 'SOL', chg: -30, rules, smart: false }).action === 'convert');
check('Altcoins: every coin but BTC — no shares, no metals', [C.isAltcoin('SOL'), C.isAltcoin('BTC'), C.isAltcoin('NVDAB'), C.isAltcoin('XAG')].join() === 'true,false,false,false');
// the "altcoins only" chart takes the shares out too
const pts = [{ t: Date.parse('2026-11-01'), v: 1000, b: 60000 }];
const coins = [{ sym: 'SOL', opening: { qty: 2, avg: 100 } }, { sym: 'NVDAB', cgId: 'nvidia-bstock', opening: { qty: 1, avg: 150 } }];
const ao = C.altOnly(pts, coins, [], { now: { NVDAB: 200, SOL: 100 } });
check('altOnly: the share is taken out of the value and of the coin list', Math.abs(ao.snaps[0].v - 800) < 1e-9 && ao.coins.map(c => c.sym).join() === 'SOL', ao);
// zakat pool
const rows = [{ sym: 'SOL', value: 3000 }, { sym: 'NVDAB', cgId: 'nvidia-bstock', value: 2000 }, { sym: 'USDT', value: 500 }];
const on = C.zakatPool(rows, { cashUsd: 4000 }), off = C.zakatPool(rows, { cashUsd: 4000, stocks: false });
check('zakat pool: coins (stablecoins too) + shares + cash', on.value === 9500 && on.crypto === 3500 && on.stock === 2000 && on.cash === 4000 && on.stocksCounted === true, on);
check('…shares switched off → left out (the rest stays)', off.value === 7500 && off.stocksCounted === false, off);
check('…metals are in the one pool (gold, platinum… at market value)', C.zakatPool([{ sym: 'XAU', value: 9000 }, { sym: 'XPT', value: 1000 }]).value === 10000 && C.zakatPool([{ sym: 'XAU', value: 9000 }]).metal === 9000);
// 🕌 the zakat year stays open when nobody was there on the day (no visit in its month, no bot) — for an account that existed then
{
  const now = Date.now(), DAY = 864e5, d = C.hijri(now - 45 * DAY);
  if (d) {
    const w = C.zakatWhen(now, { m: d.month, d: d.day }), N = { value: 100000, nisabUsd: 10000 }, old = { since: now - 200 * DAY };
    check('45 days after the zakat day, outside its month', w.since === 45 && !w.due, w);
    const a = C.zakatYear(w, N, null, [], old);
    check('…nobody kept the day\'s pool, the account existed then → still DUE (late), at today\'s value', a.state === 'due' && a.late && !a.fixed && a.hy === w.hy && a.zakatUsd === 2500, a);
    check('…an account that began after that day owes nothing for it', C.zakatYear(w, N, null, [], { since: now - 10 * DAY }).state === 'upcoming' && !C.zakatYear(w, N, null, [], { since: now - 10 * DAY }).late);
    check('…when the account\'s age is unknown: as before, no open year', C.zakatYear(w, N, null, []).state === 'upcoming');
    const b = C.zakatYear(w, { value: 5000, nisabUsd: 10000 }, null, [], old);
    check('…below the nisab today → nothing due, still marked late (so the pool is kept once and the year settles)', b.state === 'under' && b.late, b);
    check('…once kept below the nisab, the year is closed: no later "due" when prices rise', C.zakatYear(w, N, { hy: w.hy, value: 5000, nisabUsd: 10000 }, [], old).state === 'upcoming' && !C.zakatYear(w, N, { hy: w.hy, value: 5000, nisabUsd: 10000 }, [], old).late);
    check('…once kept above it: due on the kept value, not today\'s', C.zakatYear(w, N, { hy: w.hy, value: 80000, nisabUsd: 10000 }, [], old).zakatUsd === 2000);
    check('…paid → not late', !C.zakatYear(w, N, null, [{ hy: w.hy, value: 100000, nisabUsd: 10000, zakat: 2500, paid: 2500 }], old).late);
  }
  check('the account began the day its first coin was added in the app (not a transaction\'s date)', C.firstSeen([{ sym: 'A', addedAt: '2026-10-15T08:00:00Z' }, { sym: 'B', addedAt: '2026-11-01T00:00:00Z' }, { sym: 'C' }]) === Date.parse('2026-10-15T08:00:00Z') && C.firstSeen([{ sym: 'C' }]) === 0 && C.firstSeen(null) === 0);
}
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
