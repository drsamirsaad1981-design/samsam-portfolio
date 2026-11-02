// tools/update-market.mjs — runs with the price history job (.github/workflows/prices.yml, twice an hour).
// Saves one snapshot of the market for the Market Hub and the Home card, so the app always has numbers to show
// even when CoinGecko's free limit is used up in your browser. The app reads it from raw.githubusercontent.com
// (no limit), then tops it up live from CoinGecko when it can.
//
//   node tools/update-market.mjs <dir>     <dir> = a checkout of the prices branch (writes <dir>/m/market.json)
//
// market.json: { updated, global: { mcap, vol, mcapCh24, dom: { btc, eth, usdt }, coins }, fng: { value, label, prev },
//                top: [ { id, sym, name, img, rank, price, mcap, vol, ch24, ch30, spark: [~42 points, 7d], spark24: [25, hourly] } ×100 ] }
// Any part that fails keeps the value from the last snapshot.

import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.argv[2] || 'out', 'm');
const FILE = path.join(OUT, 'market.json');
const API = process.env.CG_API || 'https://api.coingecko.com/api/v3';
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
    ch30: c.price_change_percentage_30d_in_currency, spark: s, spark24: d1,
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let old = {};
  try { old = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  const snap = { updated: new Date().toISOString(), global: old.global || null, fng: old.fng || null, top: old.top || [], parts: { ...(old.parts || {}) } };
  const now = snap.updated;

  const top = await get(`${API}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=24h%2C30d`);
  if (Array.isArray(top) && top.length) { snap.top = top.map(row); snap.parts.top = now; log('top', top.length); } else log('top: no answer, kept the last one');

  await sleep(4000);
  const g = await get(`${API}/global`);
  const d = g && g.data;
  if (d && d.total_market_cap) {
    const p = d.market_cap_percentage || {};
    snap.global = { mcap: d.total_market_cap.usd, vol: (d.total_volume || {}).usd, mcapCh24: d.market_cap_change_percentage_24h_usd,
      dom: { btc: p.btc || 0, eth: p.eth || 0, usdt: p.usdt || 0 }, coins: d.active_cryptocurrencies || null };
    snap.parts.global = now; log('global ok');
  } else log('global: no answer, kept the last one');

  const f = await get(FNG, 2);
  const a = (f && f.data) || [];
  if (a.length) { snap.fng = { value: +a[0].value, label: a[0].value_classification, prev: a[1] ? +a[1].value : null }; snap.parts.fng = now; log('fng', snap.fng.value); }
  else log('fng: no answer, kept the last one');

  if (!snap.top.length && !snap.global) { log('nothing to save yet'); return; }
  fs.writeFileSync(FILE, JSON.stringify(snap));
  log('wrote', FILE);
}
main().catch(e => { console.error(e); process.exit(0); });   // never fail the price job
