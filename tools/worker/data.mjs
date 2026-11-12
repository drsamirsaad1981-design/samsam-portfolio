// tools/worker/data.mjs — what the Telegram bot reads, from inside the Cloudflare Worker (no Node, Web APIs only):
//   · the market snapshot GitHub saves every ~30 min (prices branch on raw.githubusercontent.com — no limit)
//   · live prices from CoinGecko's free API on top (a few seconds old), so an answer is never half an hour stale;
//     a coin CoinGecko doesn't answer for gets its price from the exchanges by ticker (Binance → OKX → Gate → MEXC)
//   · a budget of outside calls per message: Cloudflare allows 50 per request (free plan) — going over made answers
//     come back with missing prices now and then
//   · your portfolio from Firebase (Firestore REST, signed in with the service account in the Worker's secrets)
// Nothing here prints or logs a value. Everything is cached for a short time per Worker instance.

import { priceSeries } from '../alerts-core.mjs';
import CG_IDS from './cg-ids.json' with { type: 'json' };

export const RAW = 'https://raw.githubusercontent.com/drsamirsaad1981-design/samsam-portfolio/prices/';
const CG = 'https://api.coingecko.com/api/v3';
const cache = new Map();   // key → { until, value }
async function cached(key, ms, make) {
  const hit = cache.get(key);
  if (hit && Date.now() < hit.until) return hit.value;
  const value = await make();
  cache.set(key, { until: Date.now() + ms, value });
  return value;
}
export function clearCache() { cache.clear(); tokenCache = null; }
// outside calls this message may still make (Telegram's few are kept apart): never more than Cloudflare allows
const BUDGET = 42;
let used = 0;
export function resetBudget(n = BUDGET) { used = BUDGET - n; }   // n: how many outside calls this message may make
export const budgetUsed = () => used;
async function xfetch(url, init) { if (used >= BUDGET) throw new Error('budget'); used++; return fetch(url, init); }
async function getJson(url, init) {
  try { const r = await xfetch(url, init); if (!r.ok) return null; return await r.json(); } catch (_) { return null; }
}

// ── the market (same shape tools/alerts.mjs builds from the files on disk) ──
// ids: CoinGecko ids wanted; coins: [{ sym, id? }] — each gets an id (yours, the app's list, the top 500 by ticker) and a
// price (CoinGecko live → the snapshot → its price file → the exchanges by ticker). market.idOf[SYM] → the id used.
export async function loadMarket(ids = [], coins = []) {
  const base = await cached('market', 60e3, async () => {
    const [m, t5, alt, etf] = await Promise.all(['m/market.json', 'm/top500.json', 'm/alt.json', 'm/etf.json'].map(f => getJson(RAW + f)));
    return m && t5 ? { m, t5, alt, etf } : null;   // a failed load is not kept: the next message tries again
  }) || { m: {}, t5: {}, alt: null, etf: null };
  if (!base.m.top) cache.delete('market');
  const top = (base.m.top || []).map(r => ({ ...r })), top500 = (base.t5.top || []).map(r => ({ ...r }));
  const byId = new Map(), bySym = {};
  for (const r of [...top, ...top500]) {
    if (!byId.has(r.id)) byId.set(r.id, r);
    const S = String(r.sym || '').toUpperCase();
    if (S && (!bySym[S] || (r.rank || 1e9) < (bySym[S].rank || 1e9))) bySym[S] = r;
  }
  const idOf = {};
  for (const c of coins) { const S = String(c.sym || '').toUpperCase(); if (S) idOf[S] = c.id || CG_IDS[S] || (bySym[S] && bySym[S].id) || null; }
  const all = [...new Set(['bitcoin', ...ids, ...Object.values(idOf)].filter(Boolean))];
  // price files: Bitcoin (the BTC comparison) + coins the snapshot doesn't have — at most 10
  const series = {};
  const need = ['bitcoin', ...all.filter(id => id !== 'bitcoin' && !byId.has(id)).slice(0, 10)];
  await Promise.all(need.map(async id => { const s = await cached('p:' + id, 10 * 60e3, async () => priceSeries(await getJson(RAW + 'p/' + id + '.json')) || false); if (s) series[id] = s; }));
  const market = { top, top500, global: base.m.global, fng: base.m.fng, alt: base.m.alt, parts: base.m.parts, series, altPage: base.alt, etf: base.etf, cgIds: CG_IDS, live: {}, idOf, stocks: base.m.stocks || [] };
  await liveTopUp(market, all);
  // still no price (CoinGecko busy, not in the top 500, no price file) → the exchanges, by ticker (6 coins at most)
  const rows = new Map([...market.top, ...market.top500].map(r => [r.id, r]));
  const missing = Object.entries(idOf).filter(([S, id]) => !(id && (market.live[id] || (rows.get(id) && rows.get(id).price > 0) || series[id]))).slice(0, 6);
  await Promise.all(missing.map(async ([S, id]) => {
    const x = await exchangePrice(S); if (!x) return;
    const key = id || 'x-' + S.toLowerCase(), r = rows.get(key);
    if (r) { r.price = x.price; if (x.ch24 != null) r.ch24 = x.ch24; }
    else market.top500.push({ id: key, sym: S, name: S, price: x.price, ch24: x.ch24, extra: true });
    market.live[key] = x.src; idOf[S] = key;
  }));
  const btc = market.top.find(r => r.id === 'bitcoin');
  market.btc = btc ? { price: btc.price, ch24: btc.ch24 } : series.bitcoin ? { price: series.bitcoin.last, ch24: null } : null;
  market.priceT = Date.now();
  return market;
}

// a coin's live price from an exchange, by ticker against USDT: { price, ch24 (%), src }
const EX = [
  ['Binance', S => `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${S}USDT`, j => j && j.lastPrice && { price: +j.lastPrice, ch24: +j.priceChangePercent }],
  ['OKX', S => `https://www.okx.com/api/v5/market/ticker?instId=${S}-USDT`, j => { const d = j && j.data && j.data[0]; return d && { price: +d.last, ch24: +d.open24h > 0 ? (d.last / d.open24h - 1) * 100 : null }; }],
  ['Gate', S => `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${S}_USDT`, j => { const d = Array.isArray(j) && j[0]; return d && { price: +d.last, ch24: d.change_percentage != null ? +d.change_percentage : null }; }],
  ['MEXC', S => `https://api.mexc.com/api/v3/ticker/24hr?symbol=${S}USDT`, j => j && j.lastPrice && { price: +j.lastPrice, ch24: +j.openPrice > 0 ? (j.lastPrice / j.openPrice - 1) * 100 : null }],
];
export async function exchangePrice(sym) {
  const S = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!S || /^(USDT|USD)$/.test(S)) return null;
  return cached('ex:' + S, 45e3, async () => {
    for (const [src, url, read] of EX) {
      const x = read(await getJson(url(S)));
      if (x && x.price > 0 && isFinite(x.price)) return { price: x.price, ch24: isFinite(x.ch24) ? x.ch24 : null, src };
      if (used >= BUDGET) break;
    }
    return null;
  });
}

// live prices (CoinGecko /simple/price, up to 250 ids a call) written over the snapshot rows; a coin not in the
// snapshot gets a row of its own. If CoinGecko is busy the snapshot stays (and the answer says how old it is).
async function liveTopUp(market, ids) {
  if (!ids.length) return;
  const key = 'live:' + ids.slice().sort().join(',');
  const j = await cached(key, 45e3, () => getJson(`${CG}/simple/price?ids=${encodeURIComponent(ids.slice(0, 250).join(','))}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`, { headers: { accept: 'application/json' } }));
  if (!j) { market.liveOk = false; return; }
  market.liveOk = true;
  const rows = new Map([...market.top, ...market.top500].map(r => [r.id, r]));
  for (const [id, v] of Object.entries(j)) {
    if (!v || !(v.usd > 0)) continue;
    market.live[id] = true;
    const r = rows.get(id);
    if (r) { r.price = v.usd; if (v.usd_24h_change != null) r.ch24 = v.usd_24h_change; if (v.usd_market_cap) r.mcap = v.usd_market_cap; if (v.usd_24h_vol) r.vol = v.usd_24h_vol; }
    else market.top500.push({ id, sym: '', name: '', price: v.usd, ch24: v.usd_24h_change, mcap: v.usd_market_cap, vol: v.usd_24h_vol, extra: true });
  }
}

// a ticker or a name → a CoinGecko coin: your coins first, then the app's list, the top 500, then CoinGecko search
export async function findCoin(q, market, user) {
  const s = String(q || '').trim(), S = s.toUpperCase().replace(/^\$/, '');
  if (!S) return null;
  const mine = (user && user.coins || []).find(c => c && String(c.sym || '').toUpperCase() === S && !c.removed);
  if (mine && (mine.cgId || CG_IDS[S])) return { id: mine.cgId || CG_IDS[S], sym: S, name: mine.name || '' };
  const rows = [...market.top, ...market.top500].filter(r => r.sym);
  const bySym = rows.filter(r => String(r.sym).toUpperCase() === S).sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9))[0];
  if (CG_IDS[S]) { const r = rows.find(x => x.id === CG_IDS[S]); return { id: CG_IDS[S], sym: S, name: r ? r.name : '' }; }
  if (bySym) return { id: bySym.id, sym: S, name: bySym.name };
  const byName = rows.find(r => String(r.name || '').toLowerCase() === s.toLowerCase() || r.id === s.toLowerCase());
  if (byName) return { id: byName.id, sym: String(byName.sym).toUpperCase(), name: byName.name };
  const j = await cached('search:' + s.toLowerCase(), 3600e3, () => getJson(`${CG}/search?query=${encodeURIComponent(s)}`));
  const c = j && (j.coins || []).sort((a, b) => (String(b.symbol).toUpperCase() === S) - (String(a.symbol).toUpperCase() === S) || (a.market_cap_rank || 1e9) - (b.market_cap_rank || 1e9))[0];
  if (c) return { id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, rank: c.market_cap_rank };
  return /^[A-Z0-9]{2,12}$/.test(S) ? { id: null, sym: S, name: '' } : null;   // the exchanges may still know the ticker
}

// ── Firebase: the service account → an OAuth token → Firestore REST (read only here) ──
let tokenCache = null;
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
function pemBytes(pem) {
  const b = atob(String(pem).replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, ''));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function googleToken(sa) {
  if (tokenCache && tokenCache.until > Date.now() && tokenCache.email === sa.client_email) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const body = b64urlJson({ alg: 'RS256', typ: 'JWT' }) + '.' + b64urlJson({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud, iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body));
  const r = await xfetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: body + '.' + b64url(sig) }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Firebase sign-in refused (' + r.status + ')');
  tokenCache = { token: j.access_token, until: Date.now() + 50 * 60e3, email: sa.client_email };
  return j.access_token;
}
function dec(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  return null;
}
const fields = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, dec(v)]));
export function serviceAccount(env) {
  try { const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || ''); return sa && sa.client_email && sa.private_key && sa.project_id ? sa : null; } catch (_) { return null; }
}
async function firestore(sa) {
  const token = await googleToken(sa), base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const call = async (url, init = {}) => {
    const r = await xfetch(url, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Firestore ' + r.status);
    return r.json();
  };
  return {
    async users() {
      const rows = await call(base + ':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'meta', allDescendants: true }], limit: 200 } }) }) || [];
      return [...new Set(rows.map(x => x.document && x.document.name).filter(n => n && /\/users\/[^/]+\/meta\/info$/.test(n)).map(n => n.match(/\/users\/([^/]+)\/meta\/info$/)[1]))];
    },
    async list(p) {
      const out = []; let tok = '';
      do {
        const j = await call(`${base}/${p}?pageSize=300${tok ? '&pageToken=' + encodeURIComponent(tok) : ''}`);
        if (!j) break; (j.documents || []).forEach(d => out.push(fields(d.fields))); tok = j.nextPageToken || '';
      } while (tok);
      return out;
    },
    async get(p) { const j = await call(`${base}/${p}`); return j ? fields(j.fields) : null; },
  };
}
// your portfolio: { coins, txs, accum, meta } (the first account found, as the alerts do) — cached for 2 min (🔄 reads it fresh)
export async function loadUser(env, fresh = false) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  if (fresh) cache.delete('user');
  return cached('user', 120e3, async () => {
    const db = await firestore(sa), users = await db.users();
    if (!users.length) return null;
    const uid = env.FIREBASE_UID && users.includes(env.FIREBASE_UID) ? env.FIREBASE_UID : users[0];
    const [coins, txs, accum, meta] = await Promise.all([db.list(`users/${uid}/coins`), db.list(`users/${uid}/txs`), db.list(`users/${uid}/accum`), db.get(`users/${uid}/meta/info`)]);
    return { coins, txs, accum, meta: meta || {} };
  });
}
export const cgIdOf = (c, market) => c.cgId || (market.cgIds || CG_IDS)[String(c.sym || '').toUpperCase()] || null;

// your coins (and plan coins with a buy-price alert) as { sym, id } — the market finds each one's price
export const coinsOf = user => user ? [...(user.coins || []).filter(c => c && !c.removed), ...(user.accum || []).filter(a => a && +a.alertPrice > 0)].map(c => ({ sym: String(c.sym || '').toUpperCase(), id: c.cgId || null })) : [];
// the same portfolio, each coin carrying the id its price was found under (a coin saved without a CoinGecko id included)
export const withIds = (user, m) => ({ ...user, coins: (user.coins || []).map(c => c && c.sym && m.idOf[String(c.sym).toUpperCase()] ? { ...c, cgId: m.idOf[String(c.sym).toUpperCase()] } : c),
  accum: (user.accum || []).map(a => a && a.sym && m.idOf[String(a.sym).toUpperCase()] ? { ...a, cgId: m.idOf[String(a.sym).toUpperCase()] } : a) });


// m/links.json → which tickers have perpetual futures (CoinGlass has a Liquidation Map for those) — cached 10 min
export async function loadFutures() {
  return cached('fut', 10 * 60e3, async () => { const j = await getJson(RAW + 'm/links.json'); return j && Array.isArray(j.fut) ? new Set(j.fut) : null; });
}
// a coin's hourly price file (the last ~29 days), when GitHub keeps one for it
export async function loadSeries(id) {
  if (!id || /^x-/.test(id)) return null;
  return cached('p:' + id, 10 * 60e3, async () => priceSeries(await getJson(RAW + 'p/' + id + '.json')) || false);
}
export async function rawSeries(id) {   // the file itself: { t0, step, p: [...] } (for highs / lows over a period)
  if (!id || /^x-/.test(id)) return null;
  return cached('raw:' + id, 10 * 60e3, async () => (await getJson(RAW + 'p/' + id + '.json')) || false);
}

// ── futures (derivatives) data, free and without keys: OKX, Binance, Hyperliquid — each source on its own, a failed one
// is just left out. Per coin: funding rate, open interest (and its 24h change), long / short accounts, the liquidations
// OKX reports for the last 24 h. About 10 outside calls per coin (cached 2 min).
const num = v => { const n = +v; return isFinite(n) ? n : null; };
async function postJson(url, body) {
  try { const r = await xfetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) return null; return await r.json(); } catch (_) { return null; }
}
async function okxDeriv(S, now) {
  const O = 'https://www.okx.com/api/v5', inst = `${S}-USDT-SWAP`;
  const [fr, oi, oih, ls, liq, ins] = await Promise.all([
    getJson(`${O}/public/funding-rate?instId=${inst}`), getJson(`${O}/public/open-interest?instType=SWAP&instId=${inst}`),
    getJson(`${O}/rubik/stat/contracts/open-interest-volume?ccy=${S}&period=1H`), getJson(`${O}/rubik/stat/contracts/long-short-account-ratio?ccy=${S}&period=1H`),
    getJson(`${O}/public/liquidation-orders?instType=SWAP&uly=${S}-USDT&state=filled&limit=100`),
    cached('okx-ins:' + S, 86400e3, () => getJson(`${O}/public/instruments?instType=SWAP&instId=${inst}`)),
  ]);
  const f = fr && fr.data && fr.data[0], o = oi && oi.data && oi.data[0];
  if (!f && !o) return null;
  const out = { source: 'OKX' };
  if (f) { out.funding_8h_pct = num(f.fundingRate) != null ? +(f.fundingRate * 100).toFixed(4) : null; out.next_funding = f.nextFundingTime ? new Date(+f.nextFundingTime).toISOString() : null; }
  if (o) out.open_interest_usd = num(o.oiUsd) != null ? Math.round(+o.oiUsd) : null;
  const h = oih && Array.isArray(oih.data) ? oih.data.map(x => [+x[0], +x[1]]).sort((a, b) => a[0] - b[0]) : [];   // [ts, oi usd, volume]
  if (h.length > 2) { const last = h[h.length - 1], prev = h.find(x => x[0] >= last[0] - 24 * 3600e3) || h[0]; if (prev[1] > 0) out.open_interest_change_24h_pct = +((last[1] / prev[1] - 1) * 100).toFixed(2); }
  const r = ls && Array.isArray(ls.data) && ls.data.length ? ls.data.map(x => [+x[0], +x[1]]).sort((a, b) => b[0] - a[0])[0] : null;
  if (r && r[1] > 0) { out.long_short_accounts = +r[1].toFixed(2); out.long_accounts_pct = +(r[1] / (1 + r[1]) * 100).toFixed(1); }
  const ct = ins && ins.data && ins.data[0] ? num(ins.data[0].ctVal) || 1 : 1, det = liq && liq.data && liq.data[0] && Array.isArray(liq.data[0].details) ? liq.data[0].details : [];
  if (det.length) {
    let longs = 0, shorts = 0, n = 0, oldest = now;
    for (const d of det) { const t = +d.ts; if (!(t > now - 24 * 3600e3)) continue; const usd = (+d.sz || 0) * ct * (+d.bkPx || 0); n++; oldest = Math.min(oldest, t); if ((d.posSide || '') === 'long' || d.side === 'sell') longs += usd; else shorts += usd; }
    out.liquidations = { orders: n, longs_usd: Math.round(longs), shorts_usd: Math.round(shorts), since: new Date(oldest).toISOString(), note: 'OKX only, its last 100 liquidation orders' };
  }
  return out;
}
async function binanceDeriv(S) {
  const F = 'https://fapi.binance.com', p = `${S}USDT`;
  const [pi, oi, oih, ls, top] = await Promise.all([
    getJson(`${F}/fapi/v1/premiumIndex?symbol=${p}`), getJson(`${F}/fapi/v1/openInterest?symbol=${p}`),
    getJson(`${F}/futures/data/openInterestHist?symbol=${p}&period=1h&limit=25`), getJson(`${F}/futures/data/globalLongShortAccountRatio?symbol=${p}&period=1h&limit=1`),
    getJson(`${F}/futures/data/topLongShortPositionRatio?symbol=${p}&period=1h&limit=1`),
  ]);
  if (!pi || pi.code) return null;
  const out = { source: 'Binance', funding_8h_pct: num(pi.lastFundingRate) != null ? +(pi.lastFundingRate * 100).toFixed(4) : null, mark_price: num(pi.markPrice) };
  if (oi && num(oi.openInterest) != null && num(pi.markPrice)) out.open_interest_usd = Math.round(oi.openInterest * pi.markPrice);
  if (Array.isArray(oih) && oih.length > 2) { const a = +oih[0].sumOpenInterestValue, b = +oih[oih.length - 1].sumOpenInterestValue; if (a > 0) out.open_interest_change_24h_pct = +((b / a - 1) * 100).toFixed(2); }
  if (Array.isArray(ls) && ls[0]) { out.long_short_accounts = num(ls[0].longShortRatio); out.long_accounts_pct = num(ls[0].longAccount) != null ? +(ls[0].longAccount * 100).toFixed(1) : null; }
  if (Array.isArray(top) && top[0]) out.top_traders_long_short_positions = num(top[0].longShortRatio);
  return out;
}
async function hyperliquidDeriv(S) {
  const j = await cached('hl-ctx', 60e3, () => postJson('https://api.hyperliquid.xyz/info', { type: 'metaAndAssetCtxs' }));
  if (!Array.isArray(j) || !j[0] || !Array.isArray(j[0].universe)) return null;
  const i = j[0].universe.findIndex(u => String(u.name).toUpperCase() === S), c = i >= 0 && j[1] && j[1][i];
  if (!c) return null;
  const px = num(c.markPx);
  return { source: 'Hyperliquid', funding_8h_pct: num(c.funding) != null ? +(c.funding * 8 * 100).toFixed(4) : null, open_interest_usd: num(c.openInterest) != null && px ? Math.round(c.openInterest * px) : null, volume_24h_usd: num(c.dayNtlVlm) != null ? Math.round(+c.dayNtlVlm) : null, mark_price: px };
}
export async function derivatives(sym) {
  const S = String(sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!S) return null;
  return cached('deriv:' + S, 120e3, async () => {
    const now = Date.now(), [okx, bn, hl] = await Promise.all([okxDeriv(S, now), binanceDeriv(S), hyperliquidDeriv(S)]);
    const src = [okx, bn, hl].filter(Boolean);
    if (!src.length) return null;
    const fr = src.map(x => x.funding_8h_pct).filter(v => v != null), oi = src.map(x => x.open_interest_usd).filter(v => v > 0);
    const avgF = fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : null;
    return {
      coin: S,
      summary: {
        funding_8h_pct_avg: avgF != null ? +avgF.toFixed(4) : null, funding_annualized_pct: avgF != null ? +(avgF * 3 * 365).toFixed(1) : null,
        funding_reading: avgF == null ? null : avgF > 0.03 ? 'longs paying a lot (crowded longs)' : avgF > 0 ? 'longs paying (normal)' : avgF < -0.01 ? 'shorts paying (crowded shorts)' : 'about neutral',
        open_interest_usd_total: oi.length ? oi.reduce((a, b) => a + b, 0) : null, open_interest_note: 'sum of the sources listed (not the whole market)',
        open_interest_change_24h_pct: (okx && okx.open_interest_change_24h_pct) ?? (bn && bn.open_interest_change_24h_pct) ?? null,
        long_accounts_pct: (bn && bn.long_accounts_pct) ?? (okx && okx.long_accounts_pct) ?? null,
        liquidations_24h: okx && okx.liquidations || null,
      },
      sources: src,
    };
  });
}
