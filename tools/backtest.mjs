// tools/backtest.mjs — 🧪 would the app's signals have helped? The app's own rules (samsam-core.js signalFor, Classic and
// Smart) replayed on real daily prices, next to simply putting the same money into Bitcoin.
//
//   node tools/backtest.mjs [out.md]        (GitHub: Actions → Backtest → Run workflow; the report is in the run's summary)
//
// The money (the same for every strategy):  $10,000 on day 1  +  $100 every week (the "new money" a signal may use).
//   1. BTC only            — the $10,000 in BTC, and each week's $100 into BTC (what the app's BTC Trend line measures)
//   2. Altcoins, hold       — the $10,000 split equally over the altcoins; each week's $100 into BTC (nothing acted on)
//   3. Altcoins + Classic   — as 2, but every week each altcoin's signal is followed:
//        Reinforce (price −5% … −20% under your Avg. Buy Price) → that week's $100 goes to those coins (split equally)
//        Sell / Convert (more than −20% under)                   → the whole coin is sold into BTC
//        Hold                                                     → nothing; the $100 goes into BTC
//   4. Altcoins + Smart     — as 3 with the Smart check (30 / 90-day strength vs BTC can turn a signal into Hold)
// 0.1% fee on every buy / sell. Signals are checked once a week (the day the $100 arrives).
// Prices: CoinGecko daily closes for the last 365 days. The Smart check needs 90 days of history, so the test starts on
// day 91 — about 9 months are replayed. The coins are the ones the app knows today (CG_IDS, no stablecoins / metals) —
// coins that are in a portfolio now, so the test is kinder to them than a real year was (survivorship).
import fs from 'node:fs';
import path from 'node:path';
import { signalFor, SMART_WEAK } from '../samsam-core.js';

const DAY = 864e5, FEE = 0.001;
export const RULES = { reinforce: -5, sell: -20 };

// series: { id: [[t, usd] …] } daily, all on the same days (BTC included as 'bitcoin'); alts: [{ id, sym }]
// → { days, strategies: { key: { name, final, invested, ret, maxDD, curve: [[t, $]] , events } }, coins: per-coin notes }
export function simulate(series, alts, { start = 90, initial = 10000, weekly = 100, rules = RULES } = {}) {
  const btc = series.bitcoin, T = btc.map(p => p[0]), n = T.length;
  const px = (id, i) => { const s = series[id]; return s && s[i] ? s[i][1] : null; };
  const chgOver = (id, i, d) => { const a = px(id, i - d), b = px(id, i); return a > 0 && b > 0 ? (b / a - 1) * 100 : NaN; };
  const coins = alts.filter(a => series[a.id] && series[a.id].length === n && px(a.id, start) > 0);
  const out = {}, notes = {};
  const run = (key, name, mode) => {
    let cash = 0, btcQty = 0, invested = initial;
    const pos = {};   // id → { qty, cost (Σ paid), active }
    const buyBtc = (usd, i) => { if (usd > 0) btcQty += usd * (1 - FEE) / px('bitcoin', i); };
    if (mode === 'btc') buyBtc(initial, start);
    else { const each = initial / coins.length; coins.forEach(c => { pos[c.id] = { qty: each * (1 - FEE) / px(c.id, start), cost: each, active: true }; }); }
    const curve = [], events = { reinforce: 0, convert: 0, smartStops: 0, first: {} };   // first: the first week each coin got a Reinforce buy
    let peak = 0, maxDD = 0;
    for (let i = start; i < n; i++) {
      if (i > start && (i - start) % 7 === 0) {   // a week: $100 arrives; signals are looked at
        invested += weekly; let budget = weekly;
        if (mode === 'classic' || mode === 'smart') {
          const want = [];
          for (const c of coins) {
            const p = pos[c.id]; if (!p.active) continue;
            const avg = p.cost / p.qty, chg = (px(c.id, i) / avg - 1) * 100;
            const rs = mode === 'smart' ? { d30: chgOver(c.id, i, 30) - chgOver('bitcoin', i, 30), d90: chgOver(c.id, i, 90) - chgOver('bitcoin', i, 90) } : null;
            const s = signalFor({ sym: c.sym, chg, rules, rs, smart: mode === 'smart' });
            if (s.why === 'weak' || s.why === 'strong') events.smartStops++;
            if (s.action === 'convert') {   // sold into BTC — out of the coin for good
              buyBtc(p.qty * px(c.id, i) * (1 - FEE), i); p.qty = 0; p.active = false; events.convert++;
              (notes[c.sym] = notes[c.sym] || {})[mode + 'Convert'] = { t: T[i], price: px(c.id, i), btc: px('bitcoin', i) };
            } else if (s.action === 'reinforce') want.push(c);
          }
          if (want.length) {
            const each = budget / want.length;
            want.forEach(c => { const p = pos[c.id]; p.qty += each * (1 - FEE) / px(c.id, i); p.cost += each; events.reinforce++; if (!(c.sym in events.first)) events.first[c.sym] = i; });
            budget = 0;
          }
        }
        buyBtc(budget, i);
      }
      const v = cash + btcQty * px('bitcoin', i) + Object.entries(pos).reduce((s, [id, p]) => s + p.qty * px(id, i), 0);
      curve.push([T[i], v]); peak = Math.max(peak, v); maxDD = Math.max(maxDD, peak > 0 ? (peak - v) / peak * 100 : 0);
    }
    const final = curve[curve.length - 1][1];
    out[key] = { name, final, invested, ret: (final / invested - 1) * 100, maxDD, curve, events };
  };
  run('btc', 'BTC only', 'btc');
  run('hold', 'Altcoins, hold (signals ignored)', 'hold');
  run('classic', 'Altcoins + Classic signal', 'classic');
  run('smart', 'Altcoins + Smart signal', 'smart');
  // each Sell / Convert afterwards: did selling into BTC beat keeping the coin? (coin's move vs BTC's, convert → end)
  for (const [sym, x] of Object.entries(notes)) for (const k of Object.keys(x)) {
    const c = coins.find(a => a.sym === sym), e = x[k];
    e.coinAfter = (px(c.id, n - 1) / e.price - 1) * 100; e.btcAfter = (px('bitcoin', n - 1) / e.btc - 1) * 100; e.helped = e.btcAfter > e.coinAfter;
  }
  return { from: T[start], to: T[n - 1], days: n - start, coins: coins.map(c => c.sym), left: alts.filter(a => !coins.includes(a)).map(a => a.sym), strategies: out, converts: notes };
}

export function report(r) {
  const d = t => new Date(t).toISOString().slice(0, 10), usd = v => '$' + Math.round(v).toLocaleString('en-US'), pc = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const S = r.strategies, b = S.btc;
  const L = [`# 🧪 Backtest — the app's signals vs BTC`, '', `**${d(r.from)} → ${d(r.to)}** (${r.days} days) · ${r.coins.length} altcoins · $10,000 at the start + $100 a week · 0.1% fee`, '',
    '| Strategy | Put in | Worth at the end | Return | vs BTC only | Worst drop |', '|---|---|---|---|---|---|'];
  for (const k of ['btc', 'hold', 'classic', 'smart']) { const s = S[k]; L.push(`| ${s.name} | ${usd(s.invested)} | ${usd(s.final)} | ${pc(s.ret)} | ${k === 'btc' ? '—' : pc((s.final / b.final - 1) * 100)} | −${s.maxDD.toFixed(1)}% |`); }
  L.push('', `Signals followed — Classic: ${S.classic.events.reinforce} Reinforce buys, ${S.classic.events.convert} Sell / Convert · Smart: ${S.smart.events.reinforce} Reinforce buys, ${S.smart.events.convert} Sell / Convert, ${S.smart.events.smartStops} times the Smart check said Hold instead (weak ≤ −${SMART_WEAK} pts vs BTC on 30 & 90 days, or beating BTC)`);
  const conv = []; for (const [sym, x] of Object.entries(r.converts)) for (const [k, e] of Object.entries(x)) conv.push({ sym, k: k.replace('Convert', ''), ...e });
  if (conv.length) {
    const ok = m => conv.filter(c => c.k === m), good = m => ok(m).filter(c => c.helped).length;
    L.push('', `**Sell / Convert into BTC — did it help?** (from the sell to the end: BTC's move vs the coin's)`, `Classic: ${good('classic')} of ${ok('classic').length} helped · Smart: ${good('smart')} of ${ok('smart').length} helped`, '',
      '| Coin | Signal | Sold on | Coin after | BTC after | Helped? |', '|---|---|---|---|---|---|');
    conv.sort((a, b) => a.t - b.t).forEach(c => L.push(`| ${c.sym} | ${c.k} | ${d(c.t)} | ${pc(c.coinAfter)} | ${pc(c.btcAfter)} | ${c.helped ? '✅' : '❌'} |`));
  }
  if (r.left.length) L.push('', `Left out (less than a year of prices): ${r.left.join(', ')}`);
  L.push('', '_The coins are the ones in the app today — coins that made it into a portfolio, so the test is kinder to them than a real year was. Past prices don\'t promise future ones._');
  return L.join('\n');
}

// ── run: fetch a year of daily prices from CoinGecko (keyless, paced), simulate, write the report ──
async function main() {
  const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const src = fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8');
  const map = {}; for (const m of src.match(/var CG_IDS = \{([\s\S]*?)\};/)[1].matchAll(/"([A-Z0-9]+)"\s*:\s*"([a-z0-9-]+)"/g)) map[m[1]] = m[2];
  const SKIP = /^(USDT|USDC|DAI|FDUSD|TUSD|USDE|PYUSD|XAU|XAG|PAXG|XAUT)$/;
  const alts = Object.entries(map).filter(([s]) => s !== 'BTC' && !SKIP.test(s)).map(([sym, id]) => ({ sym, id }));
  const API = process.env.CG_API || 'https://api.coingecko.com/api/v3', sleep = ms => new Promise(r => setTimeout(r, ms));
  const series = {}, day0 = Math.floor(Date.now() / DAY) * DAY - 364 * DAY;
  const days = Array.from({ length: 365 }, (_, i) => day0 + i * DAY);
  for (const { id } of [{ id: 'bitcoin' }, ...alts]) {
    let j = null;
    for (let k = 0; k < 4 && !j; k++) {
      const r = await fetch(`${API}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`).catch(() => null);
      if (r && r.ok) j = await r.json(); else { console.log(id, r ? r.status : 'no answer', '— waiting'); await sleep(20000 * (k + 1)); }
    }
    if (j && j.prices) {   // one close per UTC day, on the same days as BTC
      const by = new Map(j.prices.map(([t, v]) => [Math.floor(t / DAY) * DAY, v]));
      const s = days.map(t => [t, by.get(t)]); if (s.every(p => p[1] > 0)) series[id] = s;
    }
    console.log(id, series[id] ? 'ok' : 'left out'); await sleep(7000);
  }
  if (!series.bitcoin) throw new Error('no BTC prices');
  const r = simulate(series, alts), md = report(r);
  console.log('\n' + md);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], md);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  fs.writeFileSync('backtest.json', JSON.stringify({ ...r, strategies: Object.fromEntries(Object.entries(r.strategies).map(([k, s]) => [k, { ...s, curve: s.curve.filter((_, i) => i % 7 === 0) }])) }));
}
if (import.meta.url === 'file://' + process.argv[1]) main().catch(e => { console.error(e); process.exit(1); });
