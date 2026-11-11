// tools/worker/data.mjs — what the Telegram bot reads, from inside the Cloudflare Worker (no Node, Web APIs only):
//   · the market snapshot GitHub saves every ~30 min (prices branch on raw.githubusercontent.com — no limit)
//   · live prices from CoinGecko's free API on top (a few seconds old), so an answer is never half an hour stale
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
async function getJson(url, init) {
  try { const r = await fetch(url, init); if (!r.ok) return null; return await r.json(); } catch (_) { return null; }
}

// ── the market (same shape tools/alerts.mjs builds from the files on disk) ──
export async function loadMarket(ids = []) {
  const base = await cached('market', 60e3, async () => {
    const [m, t5, alt, etf] = await Promise.all(['m/market.json', 'm/top500.json', 'm/alt.json', 'm/etf.json'].map(f => getJson(RAW + f)));
    return { m: m || {}, t5: t5 || {}, alt, etf };
  });
  const want = [...new Set(['bitcoin', ...ids.filter(Boolean)])];
  const series = {};
  await Promise.all(want.map(async id => { const s = await cached('p:' + id, 10 * 60e3, async () => priceSeries(await getJson(RAW + 'p/' + id + '.json'))); if (s) series[id] = s; }));
  const top = (base.m.top || []).map(r => ({ ...r })), top500 = (base.t5.top || []).map(r => ({ ...r }));
  const market = { top, top500, global: base.m.global, fng: base.m.fng, alt: base.m.alt, parts: base.m.parts, series, altPage: base.alt, etf: base.etf, cgIds: CG_IDS, live: {} };
  await liveTopUp(market, want);
  const btc = market.top.find(r => r.id === 'bitcoin');
  market.btc = btc ? { price: btc.price, ch24: btc.ch24 } : series.bitcoin ? { price: series.bitcoin.last, ch24: null } : null;
  market.priceT = Date.now();
  return market;
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
  return c ? { id: c.id, sym: String(c.symbol || '').toUpperCase(), name: c.name, rank: c.market_cap_rank } : null;
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
  const r = await fetch(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: body + '.' + b64url(sig) }) });
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
    const r = await fetch(url, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) } });
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
// your portfolio: { coins, txs, accum, meta } (the first account found, as the alerts do) — cached for 60 s
export async function loadUser(env, fresh = false) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  if (fresh) cache.delete('user');
  return cached('user', 60e3, async () => {
    const db = await firestore(sa), users = await db.users();
    if (!users.length) return null;
    const uid = env.FIREBASE_UID && users.includes(env.FIREBASE_UID) ? env.FIREBASE_UID : users[0];
    const [coins, txs, accum, meta] = await Promise.all([db.list(`users/${uid}/coins`), db.list(`users/${uid}/txs`), db.list(`users/${uid}/accum`), db.get(`users/${uid}/meta/info`)]);
    return { coins, txs, accum, meta: meta || {} };
  });
}
export const cgIdOf = (c, market) => c.cgId || (market.cgIds || CG_IDS)[String(c.sym || '').toUpperCase()] || null;
