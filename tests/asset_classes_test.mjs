// 🧭 Asset classes (samsam-core.js): crypto · stock (bStocks) · metal (gold / silver in grams) · cash — and what each one
// means for Signals, the Altcoins total, the "altcoins only" chart and the zakat pool. Shared by the app and the bot.
import * as C from '../samsam-core.js';
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log('PASS ' + n); } else { fail++; console.log('FAIL ' + n + ' -> ' + JSON.stringify(d)); } };
check('the four classes', JSON.stringify(C.CLASSES) === '["crypto","stock","metal","cash"]');
check('a coin is crypto; gold and silver (grams) are metal; gold TOKENS stay crypto', ['BTC', 'SOL', 'XAU', 'XAG', 'PAXG', 'XAUT'].map(C.assetClass).join() === 'crypto,crypto,metal,metal,crypto,crypto');
check('a bStock is known by its CoinGecko id (…-bstock), or by its own cls', C.assetClass({ sym: 'NVDAB', cgId: 'nvidia-bstock' }) === 'stock' && C.assetClass({ sym: 'TSLAB', cls: 'stock' }) === 'stock' && C.assetClass({ sym: 'ABC', cgId: 'abc' }) === 'crypto');
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
check('…gold / silver rows are never in it (their own nisab)', C.zakatPool([{ sym: 'XAU', value: 9000 }]).value === 0);
console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
