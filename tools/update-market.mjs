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
//                top: [ { id, sym, name, img, rank, price, mcap, vol, ch24, ch30, spark: [~42 points, 7d], spark24: [25, hourly] } ×150 ],
//                stocks: [ { id, sym, name, img, price, ch24, ch7, mcap, vol, spark } — Binance bStocks ],
//                metals: [ { k: gold|silver|platinum|copper|brent, sym, unit: oz|lb|bbl, price, prev, ch24, ch7, spark, at } ],
//                rainbow: { v, fit, closes, held, peaks, w200, pi } — 🌈 copied from m/rainbow.json (tools/update-rainbow.mjs) }
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
const GT = process.env.GT_API || 'https://api.geckoterminal.com/api/v2';   // on-chain prices (CoinGecko's DEX data, no key)
// bStocks that are live but not in CoinGecko's coin list yet — by contract (looked up until the list carries them)
const BSTOCK_NEW = [{ sym: 'ANTB', name: 'Anthropic (bStocks Tokenized Stock)', chain: 'binance-smart-chain', gt: 'bsc', addr: '0x38dd26788cf2d901e3abf04efe3007d459d0fc53', url: 'https://www.coingecko.com/en/stocks/anthropic' }];
const FNG = process.env.FNG_API || 'https://api.alternative.me/fng/?limit=2';
// CoinMarketCap's own Fear & Greed and Altcoin Season Index (the numbers CoinMarketCap and Binance show) — its keyless
// public API (no key, cached by CoinMarketCap: Fear & Greed every 15 s, the Altcoin Season Index every 15 minutes)
const CMC_PUB = process.env.CMC_PUB || 'https://pro-api.coinmarketcap.com/public-api';
async function cmc(p) {
  const j = await get(CMC_PUB + p, 2);
  const ok = j && j.data && (!j.status || +j.status.error_code === 0);
  if (!ok) log('cmc', p, 'no answer', j && j.status ? JSON.stringify(j.status).slice(0, 160) : '');
  return ok ? j.data : null;
}
const fngLabel = v => v < 20 ? 'Extreme Fear' : v < 40 ? 'Fear' : v < 60 ? 'Neutral' : v < 80 ? 'Greed' : 'Extreme Greed';   // CoinMarketCap's bands
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
  // 🌈 the Bitcoin rainbow's small part (tools/update-rainbow.mjs wrote m/rainbow.json a step earlier): the bot and the alerts
  // read it from this snapshot — the Worker has no outside call to spare for one more file
  try { const rb = JSON.parse(fs.readFileSync(path.join(OUT, 'rainbow.json'), 'utf8')); if (rb && rb.v === 1 && rb.fit && Array.isArray(rb.closes)) snap.rainbow = { v: 1, fit: rb.fit, closes: rb.closes, held: rb.held || null, peaks: rb.peaks || [], ...(rb.w200 ? { w200: { ma: rb.w200.ma, day: rb.w200.day, under: { days: rb.w200.under.days, pct: rb.w200.under.pct, last: rb.w200.under.last } } } : {}), ...(rb.pi ? { pi: rb.pi } : {}) }; } catch (_) {}   // (📏 the 200-week average and the Pi Cycle ride along)
  if (!snap.rainbow && old.rainbow) snap.rainbow = old.rainbow;

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

  // Fear & Greed: CoinMarketCap's (what CoinMarketCap and Binance show); alternative.me's only when it doesn't answer
  // (the history only when the latest answered: one request less when CoinMarketCap is busy — it says 429 often)
  const cf = await cmc('/v3/fear-and-greed/latest'), ch = cf && cf.value != null ? await cmc('/v3/fear-and-greed/historical?start=1&limit=10') : null;
  const oldF = old.fng, oldAt = Date.parse((oldF && oldF.at) || (old.parts && old.parts.fng) || 0) || 0;
  if (cf && cf.value != null) {
    // its time can be an ISO date or Unix seconds (as a number or a string) — read both
    const tOf = x => { const t = x && x.timestamp; const n = +t; return isFinite(n) && n > 0 ? (n < 1e11 ? n * 1000 : n) : Date.parse(t); };
    const days = (Array.isArray(ch) ? ch : (ch && Array.isArray(ch.data) ? ch.data : [])).filter(x => x && x.value != null && isFinite(tOf(x))).sort((x, y) => tOf(y) - tOf(x));
    const today0 = Math.floor(Date.now() / DAY), dayOf = x => Math.floor(tOf(x) / DAY);
    const back = n => { const r = days.find(x => dayOf(x) === today0 - n) || days.find(x => dayOf(x) === today0 - n - 1); return r ? +r.value : null; };
    if (!days.length) log('fng history: no rows', JSON.stringify(ch).slice(0, 200));
    const v = Math.round(+cf.value);
    snap.fng = { value: v, label: fngLabel(v), prev: back(1), week: back(7), src: 'cmc', at: now }; snap.parts.fng = now; log('fng (CoinMarketCap)', v);
  } else if (oldF && oldF.src === 'cmc' && Date.now() - oldAt < 6 * 3600e3) {
    // CoinMarketCap busy: keep ITS last number (under 6 h old — the index moves slowly) instead of jumping to another source
    snap.fng = { ...oldF, at: oldF.at || new Date(oldAt).toISOString() }; log('fng: CoinMarketCap busy, kept its last one', oldF.value);
  } else {
    const f = await get(FNG.replace('limit=2', 'limit=8'), 2);
    const a = (f && f.data) || [];
    if (a.length) { snap.fng = { value: +a[0].value, label: a[0].value_classification, prev: a[1] ? +a[1].value : null, week: a[7] ? +a[7].value : null, src: 'alternative.me' }; snap.parts.fng = now; log('fng (alternative.me)', snap.fng.value); }
    else log('fng: no answer, kept the last one');
  }

  // a stock does not lose 91% in a day: a move past the limit is a split, a re-denomination or a bad print → no % (null),
  // so it never tops a "best / worst" list or fires an alert (the price itself stays)
  const sane = (v, max) => v != null && Math.abs(v) <= max ? v : null;
  // Binance bStocks (tokenized US stocks: NVIDIA, Tesla, Circle…) — CoinGecko's "bStocks Ecosystem" category, for the
  // Telegram bot's Market (best / worst 5). Kept from the last run when CoinGecko doesn't answer.
  await sleep(4000);
  // (all of them — ~100–130 so far — with logo, 7-day change and a small 7-day line, for the Market Hub's 📈 bStocks tab)
  const bs = await get(`${API}/coins/markets?vs_currency=usd&category=bstocks-ecosystem&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=24h%2C7d`, 2);
  const thin = sp => { sp = (sp && sp.price) || []; const st = Math.max(1, Math.floor(sp.length / 24)), o = []; for (let i = 0; i < sp.length; i += st) o.push(+(+sp[i]).toPrecision(6)); if (sp.length && (sp.length - 1) % st) o.push(+(+sp[sp.length - 1]).toPrecision(6)); return o; };
  if (Array.isArray(bs) && bs.length) { snap.stocks = bs.filter(c => c && c.current_price > 0).map(c => ({ id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, img: c.image || '', price: c.current_price, ch24: sane(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null, 60), ch7: sane(c.price_change_percentage_7d_in_currency ?? null, 85), mcap: c.market_cap || null, vol: c.total_volume || null, spark: thin(c.sparkline_in_7d) })); snap.parts.stocks = now; log('bstocks', snap.stocks.length); }
  else { if (old.stocks) snap.stocks = old.stocks; log('bstocks: no answer, kept the last one'); }
  // 🆕 a bStock that just listed is on CoinGecko days before it joins the category (Anthropic's ANTB, Nov 2026): looked
  // for by name every 6 hours ("… (bStocks Tokenized Stock)", "… Tokenized bStocks"), then priced with the rest on every run
  try {
    const have = new Set((snap.stocks || []).map(c => c.id)), ex = old.stockExtra && Array.isArray(old.stockExtra.ids) ? old.stockExtra : { t: 0, ids: [] };
    let ids = ex.ids.filter(id => !have.has(id)), t = +ex.t || 0; const ms = Date.now();
    if (ms - t > 6 * 3600e3 || ex.v !== 2) {   // (v: the way of looking changed → look again now)
      const found = [];
      for (const q of ['bStocks Tokenized', 'Anthropic bStocks']) { await sleep(2500); const r = await get(`${API}/search?query=${encodeURIComponent(q)}`, 1); for (const c of (r && r.coins) || []) if (c && c.id && /\bbstocks?\b/i.test(c.name || '') && /tokenized/i.test(c.name || '') && !have.has(c.id)) found.push(c.id); }
      ids = [...new Set([...ids, ...found])].slice(0, 40); t = ms;
    }
    snap.stockExtra = { t, ids, v: 2 };
    if (ids.length && snap.stocks) {
      await sleep(2500);
      const more = await get(`${API}/coins/markets?vs_currency=usd&ids=${ids.join('%2C')}&sparkline=true&price_change_percentage=24h%2C7d`, 1);
      const add = (Array.isArray(more) ? more : []).filter(c => c && c.current_price > 0 && !have.has(c.id)).map(c => ({ id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, img: c.image || '', price: c.current_price, ch24: sane(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? null, 60), ch7: sane(c.price_change_percentage_7d_in_currency ?? null, 85), mcap: c.market_cap || null, vol: c.total_volume || null, spark: thin(c.sparkline_in_7d), fresh: true }));
      if (add.length) { snap.stocks = snap.stocks.concat(add); log('bstocks: +' + add.length + ' not in the category yet (' + add.map(c => c.sym).join(', ') + ')'); }
    }
  } catch (e) { log('bstocks extra:', e.message); }
  // 🆕🆕 …and one CoinGecko's coin list doesn't carry at all yet (Anthropic · ANTB: on CoinMarketCap and on BNB Chain,
  // not in CoinGecko's API): by its contract — CoinGecko first (it joins the list above once it is there), then
  // Binance's own price, then the on-chain price (GeckoTerminal). Dropped from here by itself once the list has it.
  try {
    const haveSym = new Set((snap.stocks || []).map(c => c.sym));
    for (const n of BSTOCK_NEW) {
      if (!snap.stocks || haveSym.has(n.sym)) continue;
      await sleep(2500);
      const cg = await get(`${API}/coins/${n.chain}/contract/${n.addr}`, 1);
      if (cg && cg.id && cg.market_data && cg.market_data.current_price && cg.market_data.current_price.usd > 0) {
        const md = cg.market_data;
        snap.stocks.push({ id: cg.id, sym: n.sym, name: cg.name || n.name, img: (cg.image && (cg.image.large || cg.image.small)) || '', price: md.current_price.usd, ch24: sane(md.price_change_percentage_24h ?? null, 60), ch7: sane(md.price_change_percentage_7d ?? null, 85), mcap: (md.market_cap && md.market_cap.usd) || null, vol: (md.total_volume && md.total_volume.usd) || null, spark: [], fresh: true });
        if (snap.stockExtra && !snap.stockExtra.ids.includes(cg.id)) snap.stockExtra.ids.push(cg.id);
        log('bstocks: +' + n.sym + ' (CoinGecko, by contract)'); continue;
      }
      const bn = await get(`${BN}/ticker/24hr?symbol=${n.sym}USDT`, 1);
      if (bn && +bn.lastPrice > 0) {
        snap.stocks.push({ id: 'bn:' + n.sym, sym: n.sym, name: n.name, img: '', price: +bn.lastPrice, ch24: sane(Number.isFinite(+bn.priceChangePercent) ? +bn.priceChangePercent : null, 60), ch7: null, mcap: null, vol: +bn.quoteVolume || null, spark: [], fresh: true, src: 'binance', url: n.url });
        log('bstocks: +' + n.sym + ' (Binance)'); continue;
      }
      const gt = await get(`${GT}/networks/${n.gt}/tokens/${n.addr}?include=top_pools`, 1), a = gt && gt.data && gt.data.attributes;
      if (a && +a.price_usd > 0) {
        const pool = ((gt.included || []).find(x => x && x.attributes && x.attributes.price_change_percentage) || {}).attributes || {};
        const ch = pool.price_change_percentage ? +pool.price_change_percentage.h24 : NaN;
        snap.stocks.push({ id: n.gt + ':' + n.addr, sym: n.sym, name: n.name, img: a.image_url && /^https?:/.test(a.image_url) ? a.image_url : '', price: +a.price_usd, ch24: sane(Number.isFinite(ch) ? ch : null, 60), ch7: null, mcap: +a.market_cap_usd || +a.fdv_usd || null, vol: (a.volume_usd && +a.volume_usd.h24) || null, spark: [], fresh: true, src: 'dex', url: n.url });
        log('bstocks: +' + n.sym + ' (on-chain price)'); continue;
      }
      log('bstocks: ' + n.sym + ' not found anywhere yet');
    }
  } catch (e) { log('bstocks new:', e.message); }

  // 🥇 metals and oil (the Market Hub's Metals tab): gold, silver, platinum, copper, Brent — Yahoo Finance's public chart
  // data for the front-month futures (no key; delayed ~10–15 min). Price, the change since the last close, 7 trading days,
  // and a month of daily closes. Kept from the last run when Yahoo doesn't answer.
  const METALS = [['gold', 'GC=F', 'oz'], ['silver', 'SI=F', 'oz'], ['platinum', 'PL=F', 'oz'], ['copper', 'HG=F', 'lb'], ['brent', 'BZ=F', 'bbl']];
  const YH = (process.env.YH_API || 'https://query1.finance.yahoo.com,https://query2.finance.yahoo.com').split(',');
  async function yahoo(sym) {
    for (const base of YH) {
      try {
        const r = await fetch(`${base}/v8/finance/chart/${encodeURIComponent(sym)}?range=1mo&interval=1d`, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (cute-portfolio market snapshot)' } });
        if (!r.ok) { log('metals', sym, base, r.status); continue; }
        const res = (await r.json()).chart.result[0], m = res.meta || {};
        const closes = ((res.indicators && res.indicators.quote && res.indicators.quote[0].close) || []).filter(v => v > 0);
        const price = m.regularMarketPrice > 0 ? m.regularMarketPrice : closes[closes.length - 1];
        if (!(price > 0)) continue;
        const prev = m.previousClose > 0 ? m.previousClose : closes.length > 1 ? closes[closes.length - 2] : null;
        const wk = closes.length > 6 ? closes[closes.length - 6] : null;
        return { price, prev, ch24: prev ? (price / prev - 1) * 100 : null, ch7: wk ? (price / wk - 1) * 100 : null, spark: closes.slice(-22).map(v => +v.toPrecision(6)), at: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null };
      } catch (e) { log('metals', sym, base, 'failed', String(e && e.message).slice(0, 80)); }
    }
    return null;
  }
  const metals = [];
  for (const [k, sym, unit] of METALS) { const v = await yahoo(sym); if (v) metals.push({ k, sym, unit, ...v }); await sleep(800); }
  const oldM = Array.isArray(old.metals) ? old.metals : [];
  if (metals.length) { snap.metals = METALS.map(([k]) => metals.find(x => x.k === k) || oldM.find(x => x.k === k)).filter(Boolean); snap.parts.metals = now; log('metals', metals.map(x => x.k + ' ' + x.price).join(', ')); }
  else { if (oldM.length) snap.metals = oldM; log('metals: no answer, kept the last one'); }

  // 💱 currencies for the "Cash & certificates" card: how many Egyptian pounds and Saudi riyals one US dollar buys — the
  // official (interbank) rate, from the same Yahoo Finance chart data as the metals (EGP=X, SAR=X; it is the rate Google
  // shows too — Google itself has no feed to read). Kept from the last run when Yahoo doesn't answer.
  const FX = [['EGP', 'EGP=X'], ['SAR', 'SAR=X']];
  const fx = {}, oldFx = old.fx && typeof old.fx === 'object' ? old.fx : {};
  for (const [cur, sym] of FX) {
    const v = await yahoo(sym); await sleep(800);
    if (v && v.price > 0) fx[cur] = { rate: +v.price.toPrecision(7), prev: v.prev ? +v.prev.toPrecision(7) : null, ch24: v.ch24, ch7: v.ch7, spark: v.spark, at: v.at };
    else if (oldFx[cur]) fx[cur] = oldFx[cur];
  }
  if (Object.keys(fx).length) { snap.fx = fx; if (FX.some(([c]) => fx[c] && fx[c] !== oldFx[c])) snap.parts.fx = now; log('fx', Object.entries(fx).map(([c, x]) => c + ' ' + x.rate).join(', ')); }
  else log('fx: no answer');

  // sectors (CoinGecko categories: market cap + its 24h change + their 3 biggest coins) — the Telegram bot's sector radar
  // and smart evening. Only sectors ≥ $500M; kept from the last run when CoinGecko doesn't answer.
  await sleep(4000);
  const cats = await get(`${API}/coins/categories?order=market_cap_desc`, 2);
  if (Array.isArray(cats) && cats.length) {
    snap.sectors = cats.filter(c => c && c.id && c.market_cap >= 5e8 && isFinite(c.market_cap_change_24h)).slice(0, 120)
      .map(c => ({ id: c.id, name: String(c.name || c.id).slice(0, 60), mcap: Math.round(c.market_cap), ch24: +(+c.market_cap_change_24h).toFixed(2), top: Array.isArray(c.top_3_coins_id) ? c.top_3_coins_id.slice(0, 3) : [] }));
    snap.parts.sectors = now; log('sectors', snap.sectors.length);
  } else { if (old.sectors) snap.sectors = old.sectors; log('sectors: no answer, kept the last one'); }

  // 🐋 smart money: the biggest winning traders on Hyperliquid (a perp exchange whose positions are public) — are they long
  // or short on each coin, and with how much? Refreshed every 3 hours (40 small calls); kept when it does not answer.
  if (old.whales && old.parts && old.parts.whales && Date.parse(now) - Date.parse(old.parts.whales) < 3 * 3600e3) { snap.whales = old.whales; snap.parts.whales = old.parts.whales; }
  else {
    const w = await whales(old.whales).catch(e => { log('whales failed', String(e && e.message).slice(0, 100)); return null; });
    if (w) { snap.whales = w; snap.parts.whales = now; log('whales', w.n, 'traders,', Object.keys(w.coins).length, 'coins'); }
    else if (old.whales) { snap.whales = old.whales; if (old.parts && old.parts.whales) snap.parts.whales = old.parts.whales; log('whales: no answer, kept the last one'); }
  }

  // Altcoin Season: CoinMarketCap's official index (the number CoinMarketCap / CoinGlass show) — and the page's own
  // breakdown (which coins beat BTC, the history) worked out with CoinMarketCap's own top 100, matched to CoinGecko's prices
  const ca = await cmc('/v1/altcoin-season-index/latest');
  const official = ca && ca.altcoin_index != null ? Math.round(+ca.altcoin_index) : null;
  if (official != null) log('alt season (CoinMarketCap):', official);
  let order = null, cmcList = [];
  try { const j = await get(`${CMC_LIST}&start=1&limit=200`, 2); cmcList = (j && j.data && j.data.cryptoCurrencyList) || []; } catch (_) {}
  try { order = await cmcTop100(all.concat(big), cmcList); } catch (e) { log('cmc top 100:', e.message); }
  // Total market cap, volume, 24h and Market Dominance the CoinMarketCap way (the numbers CoinMarketCap shows): from its
  // global metrics; USDT and the next biggest coins = their CoinMarketCap market cap ÷ its total. CoinGecko's own total
  // and volume are kept beside them (cg) — the app moves CoinMarketCap's numbers live with CoinGecko's between snapshots.
  try {
    const gm = await cmc('/v1/global-metrics/quotes/latest');
    const tot = gm && gm.quote && gm.quote.USD && +gm.quote.USD.total_market_cap;
    if (gm && gm.btc_dominance > 0 && tot > 0 && snap.global) {
      const M = appMarket(), mcOf = c => { const q = (c.quotes || []).find(x => x.name === 'USD') || (c.quotes || [])[0] || {}; return +q.marketCap || 0; };
      const usdt = cmcList.find(c => String(c.symbol).toUpperCase() === 'USDT'), r2 = v => Math.round(v * 1000) / 1000;
      const top = [];
      for (const c of cmcList) {
        const sym = String(c.symbol || '').toUpperCase(); if (/^(BTC|ETH|USDT)$/.test(sym)) continue;
        const tags = (c.tags || []).map(t => String(t && (t.slug || t) || '').toLowerCase());
        if (tags.some(t => CMC_SKIP.test(t)) || M.isExcluded({ sym, name: c.name || '', id: c.slug || '', price: (((c.quotes || [])[0]) || {}).price })) continue;
        const v = mcOf(c) / tot * 100; if (v > 0) top.push([sym, r2(v)]);
        if (top.length === 5) break;
      }
      const U = gm.quote.USD, cgG = { mcap: snap.global.mcap, vol: snap.global.vol, ch: snap.global.mcapCh24 };
      if (+U.total_volume_24h > 0) snap.global.vol = +U.total_volume_24h;
      if (U.total_market_cap_yesterday_percentage_change != null) snap.global.mcapCh24 = +U.total_market_cap_yesterday_percentage_change;
      snap.global.mcap = tot; snap.global.cg = cgG; snap.global.src = 'cmc';
      log('total market cap (CoinMarketCap):', Math.round(tot / 1e9) + 'B', 'vol', Math.round((snap.global.vol || 0) / 1e9) + 'B', 'ch24', snap.global.mcapCh24, '· CoinGecko', Math.round((cgG.mcap || 0) / 1e9) + 'B');
      snap.global = { ...snap.global, dom: { btc: r2(+gm.btc_dominance), eth: r2(+gm.eth_dominance || 0), usdt: usdt ? r2(mcOf(usdt) / tot * 100) : (snap.global.dom || {}).usdt || 0 }, domTop: top, domSrc: 'cmc' };
      snap.parts.dom = now; log('dominance (CoinMarketCap): BTC', snap.global.dom.btc, 'ETH', snap.global.dom.eth, 'USDT', snap.global.dom.usdt, top.map(x => x.join(' ')).join(', '));
    } else log('dominance: CoinMarketCap no answer, CoinGecko\'s kept');
  } catch (e) { log('dominance:', e.message); }
  try {
    const alt = await altSeason(all.concat(big.filter(r => !all.some(t => t.id === r.id))), snap.global, order, official);
    const base = alt || old.alt || null;
    if (official != null) { snap.alt = { ...(base || {}), value: official, label: seasonLabel(official), ready: true, src: 'cmc', own: alt && alt.value != null ? alt.value : null, at: ca.snapshot_time || now }; snap.parts.alt = now; }
    else if (alt) { snap.alt = { ...alt, src: 'own' }; snap.parts.alt = now; }
    else if (old.alt) snap.alt = old.alt;
  } catch (e) { log('alt season:', e.message); if (official != null) { snap.alt = { ...(old.alt || {}), value: official, label: seasonLabel(official), ready: true, src: 'cmc' }; snap.parts.alt = now; } else if (old.alt) snap.alt = old.alt; }

  if (!snap.top.length && !snap.global) { log('nothing to save yet'); return; }
  fs.writeFileSync(FILE, JSON.stringify(snap));
  log('wrote', FILE);
  if (!process.env.NO_LINKS) try { await links(snap.top.concat(big.filter(r => !snap.top.some(t => t.id === r.id)))); } catch (e) { log('links:', e.message); }   // (NO_LINKS: tests)
}

// ── Links that open the right page for every coin (m/links.json) ──
//   cmc: { SYM: [[slug, name, marketCap], …] }  CoinMarketCap's own page names, top ~1500 coins (tickers are reused,
//        so the app picks by name / market cap)
//   cc:  { coingeckoId: slug }                   CoinCodex (Prediction) page for the Top 150 + the app's known coins
//   fut: [SYM, …]                                coins with perpetual futures (OKX, Hyperliquid, Gate, Bitget, KuCoin, MEXC or BingX) — CoinGlass has a
//        Liquidation Map only for those
// Any part that fails keeps the last one.
const CMC_LIST = process.env.CMC_LIST || 'https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listing?sortBy=market_cap&sortType=desc&convert=USD&cryptoType=all&tagType=all&audited=false';
const CC_API = process.env.CC_API || 'https://coincodex.com/api/v1/assets/get_asset_list';
// 🐋 Hyperliquid's leaderboard (public, no key) → the 40 traders with the biggest all-time profit and ≥ $1M in the account
// → each one's open positions → per coin: how many are long / short and the dollars on each side. `prev` = the last snapshot
// (a coin's side then: "long" / "short" / "mixed"), so a flip can be told. Not a signal: whales hedge, and lose too.
const HL_BOARD = process.env.HL_BOARD || 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard', HL_INFO = process.env.HL_INFO || 'https://api.hyperliquid.xyz/info';   // (tests point them at a local server)
const sideOf = c => { const t = c.longUsd + c.shortUsd; return t <= 0 ? 'mixed' : c.longUsd / t >= 0.6 ? 'long' : c.shortUsd / t >= 0.6 ? 'short' : 'mixed'; };
async function whales(prev) {
  const r = await fetch(HL_BOARD, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('leaderboard ' + r.status);
  const rows = ((await r.json()) || {}).leaderboardRows; if (!Array.isArray(rows) || !rows.length) throw new Error('leaderboard empty');
  const perf = (x, win) => { const p = (x.windowPerformances || []).find(a => a && a[0] === win); return p && p[1] ? +p[1].pnl || 0 : 0; };
  const top = rows.filter(x => x && /^0x[0-9a-fA-F]{40}$/.test(x.ethAddress || '') && +x.accountValue >= 1e6).sort((a, b) => perf(b, 'allTime') - perf(a, 'allTime')).slice(0, 40);
  if (top.length < 10) throw new Error('too few traders: ' + top.length);
  const coins = {}; let n = 0;
  for (const t of top) {
    let j = null;
    try { const q = await fetch(HL_INFO, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'clearinghouseState', user: t.ethAddress }) }); if (q.ok) j = await q.json(); } catch (_) {}
    await sleep(250);
    if (!j || !Array.isArray(j.assetPositions)) continue;
    n++;
    for (const a of j.assetPositions) {
      const p = a && a.position, sz = p && +p.szi, v = p && Math.abs(+p.positionValue); if (!p || !sz || !(v >= 1e4)) continue;   // positions under $10k: noise
      const sym = String(p.coin || '').toUpperCase().replace(/^K(?=PEPE|SHIB|BONK|FLOKI)/, ''), c = coins[sym] || (coins[sym] = { long: 0, short: 0, longUsd: 0, shortUsd: 0 });
      if (sz > 0) { c.long++; c.longUsd += v; } else { c.short++; c.shortUsd += v; }
    }
  }
  if (n < 10) throw new Error('too few answers: ' + n);
  const out = {};
  for (const [sym, c] of Object.entries(coins).sort((a, b) => (b[1].longUsd + b[1].shortUsd) - (a[1].longUsd + a[1].shortUsd)).slice(0, 60)) {
    const side = sideOf(c), old = prev && prev.coins && prev.coins[sym], nowT = new Date().toISOString();
    // a flip (long ↔ short) is kept for 24 hours with its time, so the next digest still tells it
    const flip = old && old.side !== side && old.side !== 'mixed' && side !== 'mixed' ? { was: old.side, flipT: nowT }
      : old && old.side === side && old.flipT && Date.now() - Date.parse(old.flipT) < 24 * 3600e3 ? { was: old.was, flipT: old.flipT } : {};
    out[sym] = { long: c.long, short: c.short, longUsd: Math.round(c.longUsd), shortUsd: Math.round(c.shortUsd), side, ...flip };
  }
  return { t: new Date().toISOString(), src: 'Hyperliquid', n, coins: out };
}
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
  // perpetual futures, from every exchange that answers GitHub's US servers (Binance / Bybit refuse them).
  // Each exchange keeps its last list if it does not answer this time, so one outage never turns coins into "No futures".
  const X = (sym) => String(sym || '').toUpperCase().replace(/^XBT$/, 'BTC');
  // 1000PEPE, 10000SATS, 1000000MOG, 1MBABYDOGE … are the same coins (contracts priced per 1000) — listed under both names
  const unPrefix = (x) => x.replace(/^(?:1000000|100000|10000|1000|1M)(?=[A-Z]{2})/, '');
  const FUT_SRC = {
    okx: async () => { const j = await get('https://www.okx.com/api/v5/public/instruments?instType=SWAP', 2);
      return ((j && j.data) || []).filter(x => x.state === 'live').map(x => (/^([A-Z0-9]+)-USDT?$/.exec(x.instFamily || '') || [])[1]); },
    hyperliquid: async () => { let j = null;
      try { const r = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"type":"meta"}' }); if (r.ok) j = await r.json(); } catch (_) {}
      return ((j && j.universe) || []).filter(x => !x.isDelisted && x.name).map(x => String(x.name).replace(/^k(?=[A-Z])/, '')); },
    gate: async () => { const j = await get('https://api.gateio.ws/api/v4/futures/usdt/contracts', 2);
      return (Array.isArray(j) ? j : []).filter(x => !x.in_delisting && x.status !== 'delisted').map(x => String(x.name || '').split('_')[0]); },
    bitget: async () => { const j = await get('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES', 2);
      return ((j && j.data) || []).filter(x => x.symbolStatus === 'normal').map(x => x.baseCoin); },
    kucoin: async () => { const j = await get('https://api-futures.kucoin.com/api/v1/contracts/active', 2);
      return ((j && j.data) || []).filter(x => x.status === 'Open' && /^USDT?$/.test(x.quoteCurrency || '')).map(x => x.baseCurrency); },
    mexc: async () => { const j = await get('https://contract.mexc.com/api/v1/contract/detail', 2);
      return ((j && j.data) || []).filter(x => x.state === 0 && x.quoteCoin === 'USDT').map(x => x.baseCoin); },
    bingx: async () => { const j = await get('https://open-api.bingx.com/openApi/swap/v2/quote/contracts', 2);
      return ((j && j.data) || []).filter(x => x.status === 1 && /-USDT$/.test(x.symbol || '')).map(x => String(x.symbol).split('-')[0]); },
  };
  out.futBy = out.futBy || {};
  for (const [name, read] of Object.entries(FUT_SRC)) {
    let list = [];
    try { list = [...new Set((await read()).map(X).flatMap(x => [x, unPrefix(x)]).filter(x => /^[A-Z0-9]{1,20}$/.test(x)))]; } catch (_) {}
    if (list.length > 20) { out.futBy[name] = list.sort(); log('links: futures', name, list.length); }
    else log('links: futures', name, 'no answer, kept its last list (' + ((out.futBy[name] || []).length) + ')');
  }
  const fut = new Set([...Object.values(out.futBy).flat(), ...(Object.keys(out.futBy).length ? [] : out.fut || [])]);
  if (fut.size > 100) { out.fut = [...fut].sort(); log('links: futures in all', fut.size); } else log('links: futures no answer, kept the last one');
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
// CoinMarketCap's top 100 altcoins (its order, no stablecoins / wrapped / staked — its own tags and the app's rule), each
// matched to CoinGecko's row (same ticker, market cap within ×2 — tickers are reused). null when it doesn't answer or too
// few match: then CoinGecko's own order is used.
const CMC_SKIP = /^(stablecoin|usd-stablecoin|fiat-stablecoin|asset-backed-stablecoin|algorithmic-stablecoin|wrapped-tokens|tokenized-gold|tokenized-commodities|liquid-staking-derivatives|tokenized-stock)$/;
async function cmcTop100(pool, list) {
  list = list || [];
  if (list.length < 120) { log('cmc top 100: no answer'); return null; }
  const M = appMarket(), bySym = new Map();
  for (const r of pool) { const k = String(r.sym || '').toUpperCase(); if (k) (bySym.get(k) || bySym.set(k, []).get(k)).push(r); }
  const out = [], used = new Set();
  for (const c of list) {
    const sym = String(c.symbol || '').toUpperCase(); if (sym === 'BTC') continue;
    const tags = (c.tags || []).map(t => String(t && (t.slug || t) || '').toLowerCase());
    if (tags.some(t => CMC_SKIP.test(t))) continue;
    const q = (c.quotes || []).find(x => x.name === 'USD') || (c.quotes || [])[0] || {}, mc = +q.marketCap || 0;
    const cand = (bySym.get(sym) || []).filter(r => !used.has(r.id) && r.mcap > 0 && mc > 0 && r.mcap / mc < 2 && mc / r.mcap < 2)
      .sort((a, b) => Math.abs(Math.log(a.mcap / mc)) - Math.abs(Math.log(b.mcap / mc)));
    const r = cand[0]; if (!r || M.isExcluded(r)) continue;
    used.add(r.id); out.push(r);
    if (out.length === 100) break;
  }
  log('cmc top 100:', out.length, 'matched');
  return out.length >= 90 ? out : null;
}
async function altSeason(all, glob, order, official) {
  if (!all.length) return null;
  const M = appMarket();
  const btc = all.find(c => c.id === 'bitcoin');
  const alts = order && order.length ? order : all.filter(c => !M.isExcluded(c)).slice(0, 100);   // CoinMarketCap's top 100 when we have it
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
  try { altPage(hist, btc, alts, extras, mineSym, today, glob, all, (caps.tether || {}).d || {}, official, !!(order && order.length)); } catch (e) { log('alt page:', e.message); }
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
//   mine: { id: [7d, 30d, 90d] } the app's own coins outside the top 100,
//   closed: { day, btc: [7d, 30d, 90d], p: { id: [7d, 30d, 90d] } } the same changes as of the last daily close — what the Signal uses }
// A past day is worked out with today's top 100 (CoinMarketCap uses each day's own list), so old days can differ a little.
const ALT_FILE = path.join(OUT, 'alt.json');
function altPage(hist, btc, alts, extras, mineSym, today, glob, all, usdtCap, official, cmcList) {
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
  if (now) live[today] = [official != null ? official : Math.round(now.beat / now.n * 100), now.n, now.btc];   // today: CoinMarketCap's official number when we have it
  else if (official != null) live[today] = [official, 100, null];
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
  // ⏳ the same three as of the last daily close (yesterday's last price): the Signal is decided on the close, so the
  // strength it checks (Smart: 30 / 90 days vs BTC · Calm mode: 7 days) must not move during the day either
  const closed3 = id => [7, 30, PERIOD].map(p => r2(chg(hist, id, today - 1, p)));
  const closedP = {}; for (const id of [...alts.map(c => c.id), ...extras]) { const p3 = closed3(id); if (p3[1] != null && p3[2] != null) closedP[id] = p3; }
  const closedBtc = closed3('bitcoin');
  const page = {
    updated: new Date().toISOString(), today, idx, live, ethbtc, dom, domEst, domUsdt, usdtEst,
    official: official != null ? official : null, own: now ? Math.round(now.beat / now.n * 100) : null, list: cmcList ? 'cmc' : 'coingecko',
    breadth: { 7: at(today, 7), 30: at(today, 30), 90: now },
    btc: three('bitcoin'),
    coins: alts.map(c => ({ id: c.id, sym: c.sym, name: c.name, img: c.img, rank: c.rank, p: three(c.id) })),
    mine: Object.fromEntries(extras.map(id => [id, three(id)]).filter(([, p]) => p.some(v => v != null))),
    closed: closedBtc[1] != null && closedBtc[2] != null ? { day: today - 1, btc: closedBtc, p: closedP } : null,
  };
  fs.writeFileSync(ALT_FILE, JSON.stringify(page));
  log('alt page:', idx.length, 'days of the index,', Object.keys(page.mine).length, 'of your coins outside the top 100');
}

main().catch(e => { console.error(e); process.exit(0); });   // never fail the price job
