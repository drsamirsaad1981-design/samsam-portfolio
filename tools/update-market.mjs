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
//                top: [ { id, sym, name, img, rank, price, mcap, vol, ch24, ch30, spark: [~42 points, 7d], spark24: [25, hourly] } ×150 ] }
// top500.json: { updated, from: 101, top: [the same rows for coins 101–500] }
// Any part that fails keeps the value from the last snapshot.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const OUT = path.resolve(process.argv[2] || 'out', 'm');
const FILE = path.join(OUT, 'market.json');
const HIST = path.join(OUT, 'hist.json');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DAY = 864e5, PERIOD = 90, DEEP = 460, KEEP_DAYS = DEEP + 2;   // DEEP: a year of the 90-day index needs ~455 days of prices
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
  const MK = p => `${API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${p}&sparkline=true&price_change_percentage=24h%2C7d%2C30d`;
  const top = await get(MK(1));
  let all = [], big = [];
  // the first 150 go in market.json (the page shows 100 without stablecoins; Altcoin Season needs the top 100 after
  // leaving stablecoins out); coins 101–500 go in m/top500.json, read only when the list is set to Top 200…500
  if (Array.isArray(top) && top.length) { const rows = top.map(row); all = rows.slice(0, 150); snap.top = all; snap.parts.top = now; log('top', top.length);
    await sleep(4000);
    const p2 = await get(MK(2));
    big = rows.concat(Array.isArray(p2) ? p2.map(row) : []).slice(100);
    if (Array.isArray(p2) && p2.length) { fs.writeFileSync(path.join(OUT, 'top500.json'), JSON.stringify({ updated: now, from: 101, top: big })); log('top500', big.length); }
    else log('top500: page 2 no answer, kept the last one');
  } else log('top: no answer, kept the last one');

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

  try { const alt = await altSeason(all, snap.global); if (alt) { snap.alt = alt; snap.parts.alt = now; } else if (old.alt) snap.alt = old.alt; }
  catch (e) { log('alt season:', e.message); if (old.alt) snap.alt = old.alt; }

  if (!snap.top.length && !snap.global) { log('nothing to save yet'); return; }
  fs.writeFileSync(FILE, JSON.stringify(snap));
  log('wrote', FILE);
  try { await links(snap.top.concat(big.filter(r => !snap.top.some(t => t.id === r.id)))); } catch (e) { log('links:', e.message); }
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
  const out = { updated: new Date().toISOString(), cmc: old.cmc || {}, cc: old.cc || {}, fut: old.fut || [], ccDay: old.ccDay || 0, ccMiss: old.ccMiss || {} };
  const CC_V = 2, today = Math.floor(Date.now() / 864e5), fullCc = out.ccDay !== today || old.ccV !== CC_V;   // CC_V: bumped when the matching rules change → a fresh pass   // the whole list once a day; in between only coins not looked up today
  // CoinMarketCap: 3 pages of 500
  const cmc = {};
  let got = 0;
  for (let start = 1; start <= 4501; start += 500) {   // 5,000 coins: CoinMarketCap puts coins with an unchecked supply far down its list
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
  if (got > 1000) { out.cmc = cmc; log('links: CoinMarketCap', got); } else log('links: CoinMarketCap no answer, kept the last one');
  // CoinCodex: by ticker, in groups; the page is the one with the same CoinGecko id / name (else the biggest)
  const known = (() => { try { const ctx = { window: {}, document: { getElementById: () => true, createElement: () => ({}), head: { appendChild() {} } }, localStorage: { getItem() { return null; }, setItem() {} } };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8'), ctx); return ctx.window.SamsamCoins; } catch (e) { log('links: samsam-coins', e.message); return null; } })();
  const want = new Map();   // cgId → { sym, name, mcap }
  for (const c of top || []) want.set(c.id, { sym: c.sym, name: c.name, mcap: c.mcap });
  if (known) for (const [sym, id] of Object.entries(known.CG_IDS || {})) if (id && !want.has(id)) want.set(id, { sym, name: (known.NAMES || {})[sym] || '', mcap: 0 });
  if (!fullCc) for (const id of [...want.keys()]) if (out.cc[id] || out.ccMiss[id] === today) want.delete(id);
  const bySym = new Map();
  for (const [id, w] of want) { const s = String(w.sym || '').toUpperCase(); if (s) (bySym.get(s) || bySym.set(s, []).get(s)).push([id, w]); }
  const mc = x => +(x.market_cap_usd || x.last_market_cap_usd || x.marketcap_usd || 0);
  const syms = [...bySym.keys()], cc = {};
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\b(token|coin|network|protocol|the)\b/g, '').replace(/[^a-z0-9]/g, '');
  const slugOf = x => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  // the same coin = same ticker AND (CoinCodex page named like its CoinGecko id, or the same name) — never just a ticker
  // …or the same ticker with a market cap close to CoinGecko's (BNB = "Binance Coin"), or the page named exactly like the
  // CoinGecko id with the same name even under another ticker (Pi Network is "IOU" on CoinCodex)
  const sameCoin = (x, S, id, nm, cap) => x && /^[a-z0-9][a-z0-9-]{0,99}$/.test(x.slug || '') && !x.not_trading_anymore && (
    (String(x.display_symbol || x.symbol || '').toUpperCase() === S
      && (x.slug === id || x.slug.replace(/-/g, '') === id.replace(/-/g, '') || (nm && norm(x.name) === nm) || near(norm(x.name), nm)
        || (cap > 1e7 && mc(x) > 0 && mc(x) / cap > 0.5 && mc(x) / cap < 2)))
    || (x.slug === id && nm && norm(x.name) === nm));
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
      const ok = list.filter(x => sameCoin(x, S, id, nm, +w.mcap || 0)).sort((a, b) => (b.slug === id) - (a.slug === id) || mc(b) - mc(a));
      if (ok[0]) { cc[id] = ok[0].slug; found++; }
    }
    await sleep(700);
  }
  if (fullCc) {
    if (found < 30 && out.cc && Object.keys(out.cc).length) log('links: CoinCodex looks down, kept the last list');
    else { out.cc = cc; out.ccDay = today; out.ccMiss = {}; out.ccV = CC_V; }
  } else Object.assign(out.cc, cc);
  for (const id of want.keys()) if (!cc[id]) out.ccMiss[id] = today;   // no page — not asked again until tomorrow
  log('links: CoinCodex', found, 'of', want.size, fullCc ? '(daily pass)' : '(new coins)');
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
// Daily prices (m/hist.json) go back DEEP days, so the Altcoin Season page can draw a year of the index (each day needs
// the price 90 days before it). The app's own coins (samsam-coins.js → CG_IDS) are kept too — not counted in the index,
// only so the page can show how your coins did against BTC.
function appCoins() {
  const out = {};
  try {
    const src = fs.readFileSync(path.join(ROOT, 'samsam-coins.js'), 'utf8'), m = src.match(/var CG_IDS = \{([\s\S]*?)\};/);
    if (m) for (const x of m[1].matchAll(/"([^"]+)"\s*:\s*"([a-z0-9-]+)"/g)) out[x[2]] = x[1].toUpperCase();
  } catch (_) {}
  return out;   // { coingeckoId: SYM }
}
// today's price for a coin outside the market list: the newest hour of its file from the price job (p/<id>.json)
function lastPrice(id) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(OUT, '..', 'p', id + '.json'), 'utf8'));
    for (let i = j.p.length - 1; i >= 0; i--) if (j.p[i] > 0) return Date.now() - (j.t0 + i * j.step) < 2 * DAY ? j.p[i] : null;
  } catch (_) {}
  return null;
}
async function altSeason(all, glob) {
  if (!all.length) return null;
  const M = appMarket();
  const btc = all.find(c => c.id === 'bitcoin');
  const alts = all.filter(c => !M.isExcluded(c)).slice(0, 100);
  if (!btc || alts.length < 50) return null;
  const today = Math.floor(Date.now() / DAY);
  let hist = {};
  try { hist = JSON.parse(fs.readFileSync(HIST, 'utf8')); } catch (_) {}
  const ids = [btc, ...alts].map(c => c.id);
  const mineSym = appCoins();
  const extras = Object.keys(mineSym).filter(id => !ids.includes(id));
  const put = (id, day, v) => { if (!(v > 0)) return; const h = hist[id] || (hist[id] = { d: {} }); h.d[day] = +(+v).toPrecision(8); };
  const byId = Object.fromEntries(all.map(c => [c.id, c]));
  for (const c of [btc, ...alts]) put(c.id, today, c.price);                       // today's price for everyone
  for (const id of extras) put(id, today, byId[id] ? byId[id].price : lastPrice(id));
  const sym = id => (byId[id] && byId[id].sym) || mineSym[id] || '';
  const price = id => (byId[id] && byId[id].price) || (hist[id] && hist[id].d[today]) || 0;
  // coins whose history doesn't reach DEEP days yet (the index's coins first) — 1) Binance daily candles (fast)
  const ready = id => hist[id] && hist[id].deep && (hist[id].src !== 'binance' || hist[id].open);
  let need = ids.concat(extras).filter(id => !ready(id));
  log('alt season:', need.length, 'coins still need their history');
  let bn = 0;
  for (const id of need) {
    const pair = sym(id).replace(/[^A-Z0-9]/g, '') + 'USDT', now = price(id);
    if (!pair || pair === 'USDT') continue;
    try {
      const r = await fetch(`${BN}/klines?symbol=${pair}&interval=1d&limit=${DEEP + 3}`);
      if (r.ok) {
        const k = await r.json();
        const last = k.length && +k[k.length - 1][4];
        // same coin (price within 5% of CoinGecko's) and at least 90 days of candles
        if (last > 0 && now > 0 && Math.abs(last / now - 1) <= 0.05 && k.length >= PERIOD) {
          for (const row of k) { const day = Math.floor(row[0] / DAY); if (day < today) put(id, day, +row[1]); }   // the day's opening price (00:00 UTC) — the same moment as CoinGecko's daily point (the close is the next day's)
          Object.assign(hist[id], { full: true, deep: true, src: 'binance', open: true }); bn++;
        }
      }
    } catch (_) {}
    await sleep(120);
  }
  // 2) CoinGecko for the rest (its free API gives up to a year), paced for its free limit; a refusal waits a minute
  //    once, then the rest is next run
  need = ids.concat(extras).filter(id => !ready(id));
  log('alt season:', bn, 'from Binance,', need.length, 'left for CoinGecko');
  let waited = false;
  for (const id of need) {
    if (Date.now() > histBudget) { log('alt season: out of time — the rest next run'); break; }
    let r; try { r = await fetch(`${API}/coins/${id}/market_chart?vs_currency=usd&days=365&interval=daily`, { headers: { accept: 'application/json' } }); } catch (_) { r = null; }
    if (!r || r.status === 429) {
      if (waited || Date.now() + 60e3 > histBudget) { log('alt season: CoinGecko busy — the rest next run'); break; }
      waited = true; await sleep(60e3); continue;
    }
    if (r.ok) { const j = await r.json(); for (const [t, v] of (j.prices || [])) if (Math.floor(t / DAY) < today) put(id, Math.floor(t / DAY), v); }
    { const h = hist[id] || (hist[id] = { d: {} }); Object.assign(h, { full: true, deep: true, src: 'coingecko' }); }   // a 404 also counts — don't ask again
    await sleep(13e3);
  }
  // keep DEEP days, only coins still in the top list or the app's own
  for (const id of Object.keys(hist)) {
    if (!ids.includes(id) && !extras.includes(id)) { delete hist[id]; continue; }
    for (const k of Object.keys(hist[id].d)) if (+k < today - KEEP_DAYS) delete hist[id].d[k];
  }
  fs.writeFileSync(HIST, JSON.stringify(hist));
  // USDT's real market cap, day by day (its supply grows, so it can't be estimated from its price): one CoinGecko call a day
  const CAPS = path.join(OUT, 'caps.json');
  let caps = {}; try { caps = JSON.parse(fs.readFileSync(CAPS, 'utf8')); } catch (_) {}
  if (!caps.tether || caps.tether.at !== today) {
    try {
      const r = await fetch(`${API}/coins/tether/market_chart?vs_currency=usd&days=365&interval=daily`, { headers: { accept: 'application/json' } });
      if (r.ok) {
        const j = await r.json(), d = {};
        for (const [t, v] of (j.market_caps || [])) if (v > 0) d[Math.floor(t / DAY)] = Math.round(v);
        if (Object.keys(d).length > 30) { caps.tether = { at: today, d }; fs.writeFileSync(CAPS, JSON.stringify(caps)); log('usdt caps:', Object.keys(d).length, 'days'); }
      } else log('usdt caps: HTTP', r.status);
    } catch (e) { log('usdt caps:', e.message); }
  }
  try { altPage(hist, btc, alts, extras, mineSym, today, glob, all, (caps.tether || {}).d || {}); } catch (e) { log('alt page:', e.message); }
  // change over 90 days: today's price vs the price 90 days ago (a day either side if that day is missing)
  const ch = id => chg(hist, id, today, PERIOD);
  const b90 = ch('bitcoin');
  const have = alts.map(c => ch(c.id)).filter(v => v != null);
  if (b90 == null || have.length < 50) { log('alt season: warming up', have.length, '/', alts.length); return { ready: false, have: have.length, n: alts.length, period: '90d' }; }
  const beat = have.filter(v => v > b90).length, value = Math.round(beat / have.length * 100);
  log('alt season 90d:', value, `(${beat}/${have.length})`);
  return { value, beat, n: have.length, btc90: +b90.toFixed(2), period: '90d', ready: have.length >= alts.length * 0.9, have: have.length, label: seasonLabel(value) };
}
const seasonLabel = v => v >= 75 ? 'Altcoin Season' : v <= 25 ? 'Bitcoin Season' : v >= 50 ? 'Leaning Altcoins' : 'Leaning Bitcoin';
// % change of a coin from `per` days before `day` to `day` (that day's price exactly; the earlier one a day either side if missing)
function chg(hist, id, day, per) {
  const d = hist[id] && hist[id].d; if (!d || !d[day]) return null;
  const t = day - per, then = d[t] || d[t - 1] || d[t + 1];
  return then ? (d[day] / then - 1) * 100 : null;
}

// ── The Altcoin Season page (m/alt.json) ──
// { updated, today, idx: [[day, value, coins, btc90], …] a year of the 90-day index, live: { day: [value, coins, btc90] }
//   (what was saved on that day with that day's top 100 — used over the worked-out value), ethbtc: [[day, ratio], …],
//   dom: { day: btcDominance } (saved from today on), breadth: { 7: {beat, n, btc, med}, 30: …, 90: … },
//   btc: [7d, 30d, 90d], coins: [{ id, sym, name, img, rank, p: [7d, 30d, 90d] }] the index's 100 coins,
//   mine: { id: [7d, 30d, 90d] } the app's own coins outside the top 100 }
// A past day is worked out with today's top 100 (CoinMarketCap uses each day's own list), so old days can differ a little.
const ALT_FILE = path.join(OUT, 'alt.json');
function altPage(hist, btc, alts, extras, mineSym, today, glob, all, usdtCap) {
  let old = {}; try { old = JSON.parse(fs.readFileSync(ALT_FILE, 'utf8')); } catch (_) {}
  const r2 = v => v == null ? null : Math.round(v * 100) / 100;
  const at = (day, per) => {
    const b = chg(hist, 'bitcoin', day, per); if (b == null) return null;
    const v = alts.map(c => chg(hist, c.id, day, per)).filter(x => x != null);
    if (v.length < 50) return null;
    const s = v.slice().sort((x, y) => x - y), med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    return { beat: v.filter(x => x > b).length, n: v.length, btc: r2(b), med: r2(med) };
  };
  const idx = [];
  for (let day = today - 365; day <= today; day++) { const a = at(day, PERIOD); if (a) idx.push([day, Math.round(a.beat / a.n * 100), a.n, a.btc]); }
  const live = old.live || {}, now = at(today, PERIOD);
  if (now) live[today] = [Math.round(now.beat / now.n * 100), now.n, now.btc];
  for (const k of Object.keys(live)) if (+k < today - 400) delete live[k];
  const ethbtc = [];
  for (let day = today - 365; day <= today; day++) {
    const e = hist.ethereum && hist.ethereum.d[day], b = hist.bitcoin && hist.bitcoin.d[day];
    if (e > 0 && b > 0) ethbtc.push([day, +(e / b).toPrecision(5)]);
  }
  // BTC and USDT Dominance before we started saving them: estimated — each coin's market cap today scaled by its price
  // that day (supply taken as today's), USDT's real market cap that day (CoinGecko), the rest of the market (other
  // stablecoins, smaller coins) held at today's size. Pinned to today's real figures; further back it is an estimate.
  const domEst = [], usdtEst = [];
  if (glob && glob.mcap > 0 && btc && btc.mcap > 0) {
    const caps = all.filter(c => c.mcap > 0 && c.price > 0 && hist[c.id]);
    const usdtNow = (all.find(c => c.id === 'tether') || {}).mcap || 0;
    const rest = glob.mcap - caps.reduce((s, c) => s + c.mcap, 0) - usdtNow;
    const p = (c, day) => { const d = hist[c.id].d; return d[day] || d[day - 1] || d[day + 1] || null; };
    const uc = day => usdtCap[day] || usdtCap[day - 1] || usdtCap[day + 1] || null;
    for (let day = today - 365; day <= today; day++) {
      const pb = p(btc, day); if (!pb) continue;
      const b = btc.mcap * pb / btc.price, u = day === today ? usdtNow : uc(day);
      const tot = rest + (u || usdtNow) + caps.reduce((s, c) => { const v = p(c, day); return s + (v ? c.mcap * v / c.price : c.mcap); }, 0);
      if (!(tot > 0)) continue;
      domEst.push([day, b / tot * 100]);
      if (u && usdtNow) usdtEst.push([day, u / tot * 100]);
    }
    const pin = (arr, real) => { const last = arr[arr.length - 1], k = last && real > 0 ? real / last[1] : 1; arr.forEach(r => { r[1] = r2(r[1] * k); }); };   // pinned to today's real figure
    pin(domEst, glob.dom && glob.dom.btc); pin(usdtEst, glob.dom && glob.dom.usdt);
  }
  const dom = old.dom || {}, domUsdt = old.domUsdt || {};
  if (glob && glob.dom && glob.dom.btc > 0) dom[today] = r2(glob.dom.btc);
  if (glob && glob.dom && glob.dom.usdt > 0) domUsdt[today] = r2(glob.dom.usdt);
  for (const o of [dom, domUsdt]) for (const k of Object.keys(o)) if (+k < today - 400) delete o[k];
  const three = id => [7, 30, PERIOD].map(p => r2(chg(hist, id, today, p)));
  const page = {
    updated: new Date().toISOString(), today, idx, live, ethbtc, dom, domEst, domUsdt, usdtEst,
    breadth: { 7: at(today, 7), 30: at(today, 30), 90: now },
    btc: three('bitcoin'),
    coins: alts.map(c => ({ id: c.id, sym: c.sym, name: c.name, img: c.img, rank: c.rank, p: three(c.id) })),
    mine: Object.fromEntries(extras.map(id => [id, three(id)]).filter(([, p]) => p.some(v => v != null))),
  };
  fs.writeFileSync(ALT_FILE, JSON.stringify(page));
  log('alt page:', idx.length, 'days of the index,', Object.keys(page.mine).length, 'of your coins outside the top 100');
}

main().catch(e => { console.error(e); process.exit(0); });   // never fail the price job
