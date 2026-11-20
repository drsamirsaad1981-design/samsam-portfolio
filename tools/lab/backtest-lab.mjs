// tools/lab/backtest-lab.mjs — 🔬 other signal rules tried on the same year of daily prices (an experiment; the app's live
// rule in samsam-core.js signalFor is NOT changed by this file).
//
//   node tools/lab/backtest-lab.mjs series.json [out.md]      (series.json comes from tools/backtest.mjs — the Backtest workflow)
//
// The money is the same as in tools/backtest.mjs: $10,000 split equally over the altcoins on day 1 + $100 every week.
// Every week each coin's signal is followed: Reinforce → the $100 goes to those coins · Sell → the whole coin into BTC.
// What changes between the rules is only WHEN a signal fires:
//   classic   price vs your Avg. Buy Price only (reinforce −5 … −20 %, sell under −20 %)
//   smart     today's rule: classic + the Smart check (no Reinforce on a coin ≥15 pts behind BTC on 30 & 90 days;
//             no Sell on a coin ahead of BTC on both)
//   A         Sell needs proof of weakness: under −20 % AND ≥15 pts behind BTC on 30 & 90 days (A30: on 30 days only)
//   B         smart + market filter: no Sell while BTC itself is down ≥ X % in 30 days
//   D         A + B together (D30: weakness on 30 days only)
//   E         smart + Reinforce only when the coin's last 7 days are firm (≥ 0 %, or ≥ −5 %)
// 0.2 % fee on every buy and sell (a Sell into BTC pays it twice: coin → USD → BTC).
import fs from 'node:fs';

const WEAK = 15;
export const FEE = 0.002;

export function decide(x, R) {
  const base = x.chg < R.sell ? 'convert' : x.chg <= R.reinforce ? 'reinforce' : 'hold';
  const ok = Number.isFinite(x.d30) && Number.isFinite(x.d90);
  const weak = ok && x.d30 <= -WEAK && x.d90 <= -WEAK, weak30 = Number.isFinite(x.d30) && x.d30 <= -WEAK, strong = ok && x.d30 > 0 && x.d90 > 0;
  if (base === 'reinforce') {
    if (R.mode !== 'classic' && weak) return 'hold';
    if (R.firm != null && !(x.c7 >= R.firm)) return 'hold';
    return base;
  }
  if (base === 'convert') {
    if (R.mode === 'smart' && strong) return 'hold';
    if (R.mode === 'weak' && !weak) return 'hold';
    if (R.mode === 'weak30' && !weak30) return 'hold';
    if (R.regime != null && x.btc30 <= -R.regime) return 'hold';
  }
  return base;
}

// series: { id: [usd …] } daily closes on the same days; alts: [{ id, sym }]
export function sim(series, alts, R, { start = 90, initial = 10000, weekly = 100, fee = FEE, buys = true } = {}) {
  const n = series.bitcoin.length, px = (id, i) => series[id][i];
  const over = (id, i, d) => { const a = px(id, i - d), b = px(id, i); return a > 0 && b > 0 ? (b / a - 1) * 100 : NaN; };
  const coins = alts.filter(a => series[a.id] && series[a.id].length === n && px(a.id, start) > 0);
  let btcQty = 0, invested = initial, trades = 0, fees = 0, peak = 0, maxDD = 0, reinforce = 0;
  const pos = {}, sells = [], sched = {};
  const pay = usd => { fees += usd * fee; return usd * (1 - fee); };
  const buyBtc = (usd, i) => { if (usd > 0) btcQty += pay(usd) / px('bitcoin', i); };
  if (R === 'btc') buyBtc(initial, start);
  else { const each = initial / coins.length; coins.forEach(c => { pos[c.id] = { qty: pay(each) / px(c.id, start), cost: each, on: true }; }); }
  for (let i = start; i < n; i++) {
    if (i > start && (i - start) % 7 === 0) {
      invested += weekly; let budget = weekly;
      if (R !== 'btc' && R !== 'hold') {
        const want = [], btc30 = over('bitcoin', i, 30), btc90 = over('bitcoin', i, 90);
        for (const c of coins) {
          const p = pos[c.id]; if (!p.on) continue;
          const a = decide({ chg: (px(c.id, i) / (p.cost / p.qty) - 1) * 100, d30: over(c.id, i, 30) - btc30, d90: over(c.id, i, 90) - btc90, c7: over(c.id, i, 7), btc30 }, R);
          if (a === 'convert') {
            buyBtc(pay(p.qty * px(c.id, i)), i); p.qty = 0; p.on = false; trades++; sched[i] = (sched[i] || 0) + 1;
            sells.push({ sym: c.sym, i, helped: px('bitcoin', n - 1) / px('bitcoin', i) > px(c.id, n - 1) / px(c.id, i) });
          } else if (a === 'reinforce' && buys) want.push(c);
        }
        if (want.length) { const each = budget / want.length; want.forEach(c => { const p = pos[c.id]; p.qty += pay(each) / px(c.id, i); p.cost += each; trades++; reinforce++; }); budget = 0; }
      }
      buyBtc(budget, i);
    }
    const v = btcQty * px('bitcoin', i) + Object.entries(pos).reduce((s, [id, p]) => s + p.qty * px(id, i), 0);
    peak = Math.max(peak, v); maxDD = Math.max(maxDD, peak > 0 ? (peak - v) / peak * 100 : 0);
    if (i === n - 1) return { final: v, invested, ret: (v / invested - 1) * 100, maxDD, trades, reinforce, sells, sched, fees, coins: coins.length,
      btcShare: btcQty * px('bitcoin', i) / v * 100 };
  }
}

// 🎲 the rule's sells only (no Reinforce buys) next to `runs` tries selling the same number of coins in the same weeks at random
export function luck(series, alts, R, { start = 90, initial = 10000, weekly = 100, fee = FEE, runs = 400, seed = 7 } = {}) {
  const n = series.bitcoin.length, px = (id, i) => series[id][i];
  const coins = alts.filter(a => series[a.id] && series[a.id].length === n && px(a.id, start) > 0);
  const sig = sim(series, alts, R, { start, initial, weekly, fee, buys: false });
  if (!sig.sells.length) return { sells: 0, beats: NaN };
  let rnd = seed >>> 0; const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
  const fin = [];
  for (let k = 0; k < runs; k++) {
    const each = initial / coins.length, qty = {}, act = coins.map(c => c.id); let b = 0;
    coins.forEach(c => { qty[c.id] = each * (1 - fee) / px(c.id, start); });
    for (let i = start + 7; i < n; i += 7) {
      b += weekly * (1 - fee) / px('bitcoin', i);
      for (let w = sig.sched[i] || 0; w > 0 && act.length; w--) { const id = act.splice(Math.floor(rand() * act.length), 1)[0]; b += qty[id] * px(id, i) * (1 - fee) * (1 - fee) / px('bitcoin', i); }
    }
    fin.push(b * px('bitcoin', n - 1) + act.reduce((s, id) => s + qty[id] * px(id, n - 1), 0));
  }
  fin.sort((a, b) => a - b);
  return { sells: sig.sells.length, final: sig.final, median: fin[Math.floor(fin.length / 2)], beats: fin.filter(v => v < sig.final).length / fin.length * 100 };
}

const base = { reinforce: -5, sell: -20 };
export const RULES = [
  ['btc', 'BTC only', 'btc'],
  ['hold', 'Altcoins, hold', 'hold'],
  ['classic', 'Classic', { ...base, mode: 'classic' }],
  ['smart', 'Smart (today)', { ...base, mode: 'smart' }],
  ['A', 'A · sell needs weakness 30+90', { ...base, mode: 'weak' }],
  ['A30', 'A30 · weakness 30 only', { ...base, mode: 'weak30' }],
  ['B10', 'B · pause sells, BTC −10% / 30d', { ...base, mode: 'smart', regime: 10 }],
  ['B15', 'B · pause sells, BTC −15% / 30d', { ...base, mode: 'smart', regime: 15 }],
  ['B20', 'B · pause sells, BTC −20% / 30d', { ...base, mode: 'smart', regime: 20 }],
  ['D', 'D · A + B15 (30+90)', { ...base, mode: 'weak', regime: 15 }],
  ['D30', 'D30 · A30 + B15 (30 only)', { ...base, mode: 'weak30', regime: 15 }],
  ['E0', 'E · reinforce if 7d ≥ 0%', { ...base, mode: 'smart', firm: 0 }],
  ['E5', 'E · reinforce if 7d ≥ −5% (the app\'s optional Calm mode)', { ...base, mode: 'smart', firm: -5 }],
  ['DE', 'D + E (all together)', { ...base, mode: 'weak', regime: 15, firm: 0 }],
];
export const GRID = [-5, -10, -15].flatMap(r => [-20, -30, -40].map(s => [`C ${r}/${s}`, `C · reinforce ${r}% · sell ${s}%`, { reinforce: r, sell: s, mode: 'smart' }]));
export const STARTS = [90, 120, 150, 180, 210, 240];

export function lab(series, alts) {
  const rows = [];
  for (const [key, name, R] of [...RULES, ...GRID]) {
    const main = sim(series, alts, R), per = STARTS.map(s => sim(series, alts, R, { start: s }));
    rows.push({ key, name, R, ...main, sellsN: main.sells.length, helped: main.sells.filter(x => x.helped).length, luck: typeof R === 'object' ? luck(series, alts, R) : null, per: per.map(p => ({ final: p.final, invested: p.invested, maxDD: p.maxDD, trades: p.trades })) });
  }
  const at = k => rows.find(r => r.key === k);
  for (const r of rows) {
    r.vsBtc = (r.final / at('btc').final - 1) * 100; r.vsSmart = (r.final / at('smart').final - 1) * 100;
    r.winsSmart = r.per.filter((p, j) => p.final > at('smart').per[j].final * 1.0005).length;
    r.avgVsSmart = r.per.reduce((s, p, j) => s + (p.final / at('smart').per[j].final - 1) * 100, 0) / STARTS.length;
    r.avgVsBtc = r.per.reduce((s, p, j) => s + (p.final / at('btc').per[j].final - 1) * 100, 0) / STARTS.length;
    r.avgDD = r.per.reduce((s, p) => s + p.maxDD, 0) / STARTS.length;
  }
  return rows;
}

export function report(rows, meta) {
  const usd = v => '$' + Math.round(v).toLocaleString('en-US'), pc = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const L = [`# 🔬 Signal-rule lab`, '', `${meta.from} → ${meta.to} · ${meta.coins} altcoins · $10,000 + $100 a week · ${FEE * 100}% fee`, '',
    '| Rule | Worth at the end | vs BTC | vs today | Worst drop | Trades | Sells (helped) | Fees | Luck test | Other entry dates: wins vs today | avg vs today | avg vs BTC | avg worst drop |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) L.push(`| ${r.name} | ${usd(r.final)} | ${pc(r.vsBtc)} | ${pc(r.vsSmart)} | −${r.maxDD.toFixed(1)}% | ${r.trades} | ${r.sellsN} (${r.helped}) | ${usd(r.fees)} | ${r.luck && r.luck.sells ? r.luck.beats.toFixed(0) + '%' : '—'} | ${r.winsSmart}/${STARTS.length} | ${pc(r.avgVsSmart)} | ${pc(r.avgVsBtc)} | −${r.avgDD.toFixed(1)}% |`);
  L.push('', '> ⚠️ **Not financial advice.** A test of rules on past prices, for information only.');
  return L.join('\n');
}

export function load(file) {   // series.json, or a saved Actions log with "SERIES id day0 v,v,…" lines
  const txt = fs.readFileSync(file, 'utf8');
  if (txt.trim().startsWith('{')) { const j = JSON.parse(txt); return { day0: j.day0, series: j.p }; }
  const series = {}; let day0 = 0;
  for (const m of txt.matchAll(/SERIES (\S+) (\d+) ([\d.,e+-]+)/g)) { day0 = +m[2]; series[m[1]] = m[3].split(',').map(Number); }
  return { day0, series };
}

function main() {
  const ROOT = new URL('../..', import.meta.url).pathname;
  const src = fs.readFileSync(ROOT + 'samsam-coins.js', 'utf8'), map = {};
  for (const m of src.match(/var CG_IDS = \{([\s\S]*?)\};/)[1].matchAll(/"([A-Z0-9]+)"\s*:\s*"([a-z0-9-]+)"/g)) map[m[1]] = m[2];
  const { day0, series } = load(process.argv[2] || 'series.json');
  const alts = Object.entries(map).filter(([s, id]) => s !== 'BTC' && id !== 'bitcoin' && series[id]).map(([sym, id]) => ({ sym, id }));
  const d = i => new Date(day0 + i * 864e5).toISOString().slice(0, 10), n = series.bitcoin.length;
  const rows = lab(series, alts), md = report(rows, { from: d(90), to: d(n - 1), coins: rows[1].coins });
  console.log(md);
  if (process.argv[3]) fs.writeFileSync(process.argv[3], md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '\n\n' + md + '\n');
  fs.writeFileSync('lab.json', JSON.stringify(rows.map(({ sells, sched, ...r }) => ({ ...r, sold: sells.map(s => [s.sym, d(s.i), s.helped]) }))));
}
if (import.meta.url === 'file://' + process.argv[1]) main();
