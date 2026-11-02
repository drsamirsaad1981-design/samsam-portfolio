// tools/update-market.mjs — runs with the price history job (.github/workflows/prices.yml, twice an hour).
// Saves one snapshot of the market for the Market Hub and the Home card, so the app always has numbers to show
// even when CoinGecko's free limit is used up in your browser. The app reads it from raw.githubusercontent.com
// (no limit), then tops it up live from CoinGecko when it can.
//
//   node tools/update-market.mjs <dir>     <dir> = a checkout of the prices branch (writes <dir>/m/market.json)
//
// Altcoin Season the CoinMarketCap way: the top 100 coins (no stablecoins / wrapped / staked — the same rule as the app,
// read from samsam-market.js) vs BTC over 90 days. CoinGecko's free API has no 90-day change, so this keeps one price
// a day per coin in m/hist.json, filled once from Binance's public market-data mirror (daily candles, no key, generous
// limits — used only when its price matches CoinGecko's, so a reused ticker can't slip in), else from CoinGecko's
// 90-day history (slow: its free limit allows only a few calls a minute); then one price a day from the markets call. Until most coins have 90 days, alt.ready is false and the app uses its 30-day number.
//
// market.json: { updated, global: { mcap, vol, mcapCh24, dom: { btc, eth, usdt }, coins }, fng: { value, label, prev, week },
//                alt: { value, label, beat, n, btc90, period: '90d', ready, have },
//                top: [ { id, sym, name, img, rank, price, mcap, vol, ch24, ch30, spark: [~42 points, 7d], spark24: [25, hourly] } ×100 ] }
// Any part that fails keeps the value from the last snapshot.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const OUT = path.resolve(process.argv[2] || 'out', 'm');
const FILE = path.join(OUT, 'market.json');
const HIST = path.join(OUT, 'hist.json');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DAY = 864e5, KEEP_DAYS = 100, PERIOD = 90;
const histBudget = Date.now() + (process.env.CG_FAST ? 20e3 : 4 * 60e3);   // history filling: at most ~4 minutes a run (the job has 20)
const API = process.env.CG_API || 'https://api.coingecko.com/api/v3';
const BN = process.env.BN_API || 'https://data-api.binance.vision/api/v3';
const FNG = process.env.FNG_API || 'https://api.alternative.me/fng/?limit=2';
const sleep = ms => new Promise(r => setTimeout(r, process.env.CG_FAST ? Math.min(ms, 50) : ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), '[market]', ...a);

async function get(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' } });
      if (r.ok) return await r.json();
      log('retry', r.status, url.replace(API, ''));
    } catch (e) { log('retry network', url.replace(API, '')); }
    await sleep([15e3, 40e3, 60e3][i]);
  }
  return null;
}

// the app's own exclusion rule (stablecoins / wrapped / staked), so the server and the page agree
function appMarket() {
  const ctx = { window: {}, location: { hostname: '', pathname: '/' }, localStorage: { getItem() { return null; }, setItem() {} }, navigator: {}, fetch() {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'samsam-market.js'), 'utf8'), ctx);
  return ctx.window.SamsamMarket;
}

// the same small row the app keeps (samsam-market.js → row)
function row(c) {
  const sp = (c.sparkline_in_7d && c.sparkline_in_7d.price) || [];
  const step = Math.max(1, Math.floor(sp.length / 42)), s = [];
  for (let i = 0; i < sp.length; i += step) s.push(+(+sp[i]).toPrecision(6));
  if (sp.length && (sp.length - 1) % step) s.push(+(+sp[sp.length - 1]).toPrecision(6));
  const d1 = sp.slice(-25).map(v => +(+v).toPrecision(6));   // last 24 hours, hourly
  return {
    id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name || '', img: c.image || '', rank: c.market_cap_rank || null,
    price: c.current_price, mcap: c.market_cap, vol: c.total_volume,
    ch24: c.price_change_percentage_24h_in_currency != null ? c.price_change_percentage_24h_in_currency : c.price_change_percentage_24h,
    ch7: c.price_change_percentage_7d_in_currency != null ? c.price_change_percentage_7d_in_currency : null,
    ch30: c.price_change_percentage_30d_in_currency, spark: s, spark24: d1,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let old = {};
  try { old = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  const snap = { updated: new Date().toISOString(), global: old.global || null, fng: old.fng || null, top: old.top || [], parts: { ...(old.parts || {}) } };
  const now = snap.updated;

  // 150 coins: the first 100 are the list; Altcoin Season needs the top 100 *after* leaving out stablecoins etc.
  const top = await get(`${API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=150&page=1&sparkline=true&price_change_percentage=24h%2C7d%2C30d`);
  let all = [];
  // all 150 kept: the page shows 100 without stablecoins
  if (Array.isArray(top) && top.length) { all = top.map(row); snap.top = all; snap.parts.top = now; log('top', top.length); } else log('top: no answer, kept the last one');

  await sleep(4000);
  const g = await get(`${API}/global`);
  const d = g && g.data;
  if (d && d.total_market_cap) {
    const p = d.market_cap_percentage || {};
    snap.global = { mcap: d.total_market_cap.usd, vol: (d.total_volume || {}).usd, mcapCh24: d.market_cap_change_percentage_24h_usd,
      dom: { btc: p.btc || 0, eth: p.eth || 0, usdt: p.usdt || 0 }, coins: d.active_cryptocurrencies || null };
    snap.parts.global = now; log('global ok');
  } else log('global: no answer, kept the last one');

  const f = await get(FNG.replace('limit=2', 'limit=8'), 2);
  const a = (f && f.data) || [];
  if (a.length) { snap.fng = { value: +a[0].value, label: a[0].value_classification, prev: a[1] ? +a[1].value : null, week: a[7] ? +a[7].value : null }; snap.parts.fng = now; log('fng', snap.fng.value); }
  else log('fng: no answer, kept the last one');

  try { const alt = await altSeason(all); if (alt) { snap.alt = alt; snap.parts.alt = now; } else if (old.alt) snap.alt = old.alt; }
  catch (e) { log('alt season:', e.message); if (old.alt) snap.alt = old.alt; }

  if (!snap.top.length && !snap.global) { log('nothing to save yet'); return; }
  fs.writeFileSync(FILE, JSON.stringify(snap));
  log('wrote', FILE);
  try { await links(snap.top); } catch (e) { log('links:', e.message); }
}

// ── Links that open the right page for every coin (m/links.json) ──
//   cmc: { SYM: [[slug, name, marketCap], …] }  CoinMarketCap's own page names, top ~1500 coins (tickers are reused,
//        so the app picks by name / market cap)
//   cc:  { coingeckoId: slug }                   CoinCodex (Prediction) page for the Top 150 + the app's known coins
//   fut: [SYM, …]                                coins with perpetual futures (OKX or Hyperliquid) — CoinGlass has a
//        Liquidation Map only for those
// Any part that fails keeps the last one.
const CMC_LIST = 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?sortBy=market_cap&sortType=desc&convert=USD&cryptoType=all&tagType=all&audited=false';
const CC_API = process.env.CC_API || 'https://coincodex.com/api/v1/assets/get_asset_list';
async function links(top) {
  const FILE_L = path.join(OUT, 'links.json');
  let old = {}; try { old = JSON.parse(fs.readFileSync(FILE_L, 'utf8')); } catch (_) {}
  const out = { updated: new Date().toISOString(), cmc: old.cmc || {}, cc: old.cc || {}, fut: old.fut || [] };
  // CoinMarketCap: 3 pages of 500
  const cmc = {};
  let got = 0;
  for (let start = 1; start <= 1001; start += 500) {
    const j = await get(`${CMC_LIST}&start=${start}&limit=500`, 2);
    const list = (j && j.data && j.data.cryptoCurrencyList) || [];
    for (const c of list) {
      const sym = String(c.symbol || '').toUpperCase(), slug = String(c.slug || '');
      if (!sym || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) continue;
      const q = (c.quotes || []).find(x => x.name === 'USD') || (c.quotes || [])[0] || {};
      (cmc[sym] = cmc[sym] || []).push([slug, c.name || '', Math.round(+q.marketCap || 0)]);
      got++;
    }
    if (list.length < 500) break;
    await sleep(1500);
  }
  if (got > 300) { out.cmc = cmc; log('links: CoinMarketCap', got); } else log('links: CoinMarketCap no answer, kept the last one');
  // CoinCodex: by ticker, in groups; the page is the one with the same CoinGecko id / name (else the biggest)
  const known = (() => { try { const ctx = { window: {}, document: { getElementById: () => true, createElement: () => ({}), head: { appendChild() {} } }, localStorage: { getItem() { return null; }, setItem() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8'), ctx); return ctx.window.SamsamCoins; } catch (e) { log('links: samsam-coins', e.message); return null; } })();
  const want = new Map();   // cgId → { sym, name, mcap }
  for (const c of top || []) want.set(c.id, { sym: c.sym, name: c.name, mcap: c.mcap });
  if (known) for (const [sym, id] of Object.entries(known.CG_IDS || {})) if (id && !want.has(id)) want.set(id, { sym, name: (known.NAMES || {})[sym] || '', mcap: 0 });
  const bySym = new Map();
  for (const [id, w] of want) { const s = String(w.sym || '').toUpperCase(); if (s) (bySym.get(s) || bySym.set(s, []).get(s)).push([id, w]); }
  const mc = x => +(x.market_cap_usd || x.last_market_cap_usd || x.marketcap_usd || 0);
  const syms = [...bySym.keys()], cc = {};
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(token|coin|network|protocol|the)\b/g, '').replace(/[^a-z0-9]/g, '');
  const slugOf = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // the same coin = same ticker AND (CoinCodex page named like its CoinGecko id, or the same name) — never just a ticker
  const sameCoin = (x, S, id, nm) => x && /^[a-z0-9][a-z0-9-]{0,99}$/.test(x.slug || '') && !x.not_trading_anymore
    && String(x.display_symbol || x.symbol || '').toUpperCase() === S
    && (x.slug === id || (nm && norm(x.name) === nm) || near(norm(x.name), nm));
  // "Hyperliquid" ~ "Hyperliquid HYPE" — one name starts the other and covers most of it (never "Pi" ~ "Pi Trump")
  const near = (a, b) => { const [s, l] = a.length < b.length ? [a, b] : [b, a]; return s.length >= 5 && l.startsWith(s) && s.length / l.length >= 0.6; };
  const ccRows = async q => { const j = await get(`${CC_API}?${q}&limit=1000`, 2); return Array.isArray(j && j.data) ? j.data : []; };
  let found = 0;
  for (let i = 0; i < syms.length; i += 8) {
    const group = syms.slice(i, i + 8).flatMap(s => bySym.get(s));
    // by ticker, plus pages named after the CoinGecko id / the name (CoinCodex lists some coins under another ticker case)
    const guesses = [...new Set(group.flatMap(([id, w]) => [id, slugOf(w.name)]).filter(g => /^[a-z0-9][a-z0-9-]{0,99}$/.test(g)))];
    const list = (await ccRows('select_bysymbol=' + syms.slice(i, i + 8).map(encodeURIComponent).join(','))).concat(await ccRows('select_byslug=' + guesses.map(encodeURIComponent).join(',')));
    for (const [id, w] of group) {
      const S = String(w.sym).toUpperCase(), nm = norm(w.name);
      const ok = list.filter(x => sameCoin(x, S, id, nm)).sort((a, b) => (b.slug === id) - (a.slug === id) || mc(b) - mc(a));
      if (ok[0]) { cc[id] = ok[0].slug; found++; }
    }
    await sleep(700);
  }
  if (found < 30 && out.cc && Object.keys(out.cc).length) { log('links: CoinCodex looks down, kept the last list'); }
  else out.cc = cc;
  log('links: CoinCodex', found, 'of', want.size);
  // perpetual futures: OKX + Hyperliquid (Binance / Bybit refuse GitHub's US servers)
  const fut = new Set();
  const okx = await get('https://www.okx.com/api/v5/public/instruments?instType=SWAP', 2);
  for (const x of (okx && okx.data) || []) { const m = /^([A-Z0-9]+)-USDT?$/.exec(x.instFamily || ''); if (m && x.state === 'live') fut.add(m[1]); }
  let hl = null;
  try { const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"meta"}' }); if (r.ok) hl = await r.json(); } catch (_) {}
  for (const x of (hl && hl.universe) || []) if (!x.isDelisted && x.name) fut.add(String(x.name).replace(/^k(?=[A-Z])/, '').toUpperCase());
  if (fut.size > 100) { out.fut = [...fut].sort(); log('links: futures', fut.size); } else log('links: futures no answer, kept the last one');
  fs.writeFileSync(FILE_L, JSON.stringify(out));
  log('wrote', FILE_L);
}
// ── Altcoin Season, 90 days, top 100 (no stablecoins / wrapped / staked) ──
async function altSeason(all) {
  if (!all.length) return null;
  const M = appMarket();
  const btc = all.find(c => c.id === 'bitcoin');
  const alts = all.filter(c => !M.isExcluded(c)).slice(0, 100);
  if (!btc || alts.length < 50) return null;
  const today = Math.floor(Date.now() / DAY);
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch (_) {}
  const ids = [btc, ...alts].map(c => c.id);
  const put = (id, day, v) => { if (!(v > 0)) return; const h = hist[id] || (hist[id] = { d: {} }); h.d[day] = +(+v).toPrecision(8); };
  for (const c of [btc, ...alts]) put(c.id, today, c.price);                       // today's price for everyone
  // coins without 90 days yet — 1) Binance daily candles (fast)
  const byId = Object.fromEntries([btc, ...alts].map(c => [c.id, c]));
  let need = ids.filter(id => !(hist[id] && hist[id].full));
  log('alt season:', need.length, 'coins still need their 90-day history');
  let bn = 0;
  for (const id of need) {
    const c = byId[id], pair = c.sym.replace(/[^A-Z0-9]/g, '') + 'USDT';
    try {
      const r = await fetch(`${BN}/klines?symbol=${pair}&interval=1d&limit=${PERIOD + 3}`);
      if (r.ok) {
        const k = await r.json();
        const last = k.length && +k[k.length - 1][4];
        // same coin (price within 5% of CoinGecko's) and at least 90 days of candles
        if (last > 0 && c.price > 0 && Math.abs(last / c.price - 1) <= 0.05 && k.length >= PERIOD) {
          for (const row of k) { const day = Math.floor(row[0] / DAY); if (day < today) put(id, day, +row[4]); }   // daily close
          hist[id].full = true; hist[id].src = 'binance'; bn++;
        }
      }
    } catch (_) {}
    await sleep(120);
  }
  // 2) CoinGecko for the rest, paced for its free limit; a refusal waits a minute once, then the rest is next run
  need = ids.filter(id => !(hist[id] && hist[id].full));
  log('alt season:', bn, 'from Binance,', need.length, 'left for CoinGecko');
  let waited = false;
  for (const id of need) {
    if (Date.now() > histBudget) { log('alt season: out of time — the rest next run'); break; }
    let r; try { r = await fetch(`${API}/coins/${id}/market_chart?vs_currency=usd&days=${PERIOD + 2}&interval=daily`, { headers: { accept: 'application/json' } }); } catch (_) { r = null; }
    if (!r || r.status === 429) {
      if (waited || Date.now() + 60e3 > histBudget) { log('alt season: CoinGecko busy — the rest next run'); break; }
      waited = true; await sleep(60e3); continue;
    }
    if (r.ok) { const j = await r.json(); for (const [t, v] of (j.prices || [])) if (Math.floor(t / DAY) < today) put(id, Math.floor(t / DAY), v); }
    (hist[id] || (hist[id] = { d: {} })).full = true;                                  // a 404 also counts — don't ask again
    await sleep(13e3);
  }
  // keep 100 days, only coins still in the top list
  for (const id of Object.keys(hist)) {
    if (!ids.includes(id)) { delete hist[id]; continue; }
    for (const k of Object.keys(hist[id].d)) if (+k < today - KEEP_DAYS) delete hist[id].d[k];
  }
  fs.writeFileSync(HIST, JSON.stringify(hist));
  // change over 90 days: today's price vs the price 90 days ago (a day either side if that day is missing)
  const ch = id => {
    const d = hist[id] && hist[id].d; if (!d || !d[today]) return null;
    const then = d[today - PERIOD] || d[today - PERIOD - 1] || d[today - PERIOD + 1];
    return then ? (d[today] / then - 1) * 100 : null;
  };
  const b90 = ch('bitcoin');
  const have = alts.map(c => ch(c.id)).filter(v => v != null);
  if (b90 == null || have.length < 50) { log('alt season: warming up', have.length, '/', alts.length); return { ready: false, have: have.length, n: alts.length, period: '90d' }; }
  const beat = have.filter(v => v > b90).length, value = Math.round(beat / have.length * 100);
  log('alt season 90d:', value, `(${beat}/${have.length})`);
  return { value, beat, n: have.length, btc90: +b90.toFixed(2), period: '90d', ready: have.length >= alts.length * 0.9, have: have.length,
    label: value >= 75 ? 'Altcoin Season' : value <= 25 ? 'Bitcoin Season' : value >= 50 ? 'Leaning Altcoins' : 'Leaning Bitcoin' };
}

main().catch(e => { console.error(e); process.exit(0); });   // never fail the price job
