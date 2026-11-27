// binanceRelay — a tiny relay in Google Cloud, Doha (me-central1), for Cute Portfolio's live Binance balances.
//
// Binance refuses requests from Cloudflare's addresses (HTTP 451), where the Cute Portfolio server (the Worker) runs.
// The Worker SIGNS each read-only request itself (the secret key never leaves it) and sends the signed request here;
// this function only passes it on to Binance and returns the answer. It holds no keys and stores nothing.
// Safety:
//   · only a signed-in Cute Portfolio user (a Firebase ID token of this project) may use it;
//   · only 5 fixed READ paths (account, API key permissions, Simple Earn, funding wallet) — nothing that trades,
//     withdraws or moves money can pass, and Binance itself checks the signature;
//   · at most 2 instances, 20 s each — it can't run up a bill.
//
// One PUBLIC read path beside it (GET ?pub=btcFunding): the BTC perpetual funding rate on the venues that refuse a US
// address — Binance, and Bybit when it answers from here — for the market snapshot's job on GitHub
// (tools/update-macro.mjs → the BTC Funding card and the bot's line). Public market numbers only: no key, no user, no
// input but the fixed name; the answer is kept 5 minutes, so however often it is called the exchanges see one read.
// Answer: { venues: [{ k: 'Binance' | 'Bybit', rate (% per 8 h), oi (USD), m7 (the 7-day mean, % per 8 h) }], at }.
// Deploy (from Cloud Shell, in this folder):  firebase deploy --only functions --project samsam-portfolio
const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
admin.initializeApp();

const PATHS = {
  '/sapi/v1/account/apiRestrictions': 'GET',
  '/api/v3/account': 'GET',
  '/sapi/v1/simple-earn/flexible/position': 'GET',
  '/sapi/v1/simple-earn/locked/position': 'GET',
  '/sapi/v1/asset/get-funding-asset': 'POST',
};
const QS = /^[A-Za-z0-9=&._%-]{1,600}&signature=[0-9a-f]{64}$/, KEY = /^[A-Za-z0-9]{16,128}$/;

const DAY = 864e5, mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
let pubKept = null;   // { t, venues } — this instance's last answer
async function getJ(url) { try { const r = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (_) { return null; } }
const num = v => v !== '' && v != null && isFinite(+v) ? +v : null;
async function binanceFunding(now) {
  const F = 'https://fapi.binance.com', [pi, oi, h] = await Promise.all([getJ(`${F}/fapi/v1/premiumIndex?symbol=BTCUSDT`), getJ(`${F}/fapi/v1/openInterest?symbol=BTCUSDT`), getJ(`${F}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=30`)]);
  const rate = pi ? num(pi.lastFundingRate) : null; if (rate == null) return null;
  const hist = Array.isArray(h) ? h.filter(x => +x.fundingTime > now - 7 * DAY).map(x => num(x.fundingRate)).filter(v => v != null).map(v => v * 100) : [];
  return { k: 'Binance', rate: rate * 100, oi: oi && num(oi.openInterest) > 0 && num(pi.markPrice) > 0 ? +oi.openInterest * +pi.markPrice : null, m7: mean(hist) };
}
async function bybitFunding(now) {
  const B = 'https://api.bybit.com/v5/market', [tk, h] = await Promise.all([getJ(`${B}/tickers?category=linear&symbol=BTCUSDT`), getJ(`${B}/funding/history?category=linear&symbol=BTCUSDT&limit=30`)]);
  const t = tk && tk.result && Array.isArray(tk.result.list) ? tk.result.list[0] : null, rate = t ? num(t.fundingRate) : null; if (rate == null) return null;
  const hist = h && h.result && Array.isArray(h.result.list) ? h.result.list.filter(x => +x.fundingRateTimestamp > now - 7 * DAY).map(x => num(x.fundingRate)).filter(v => v != null).map(v => v * 100) : [];
  return { k: 'Bybit', rate: rate * 100, oi: num(t.openInterestValue) > 0 ? +t.openInterestValue : null, m7: mean(hist) };
}
async function pubFunding(now) {
  if (pubKept && now - pubKept.t < (pubKept.venues.length ? 5 : 1) * 60e3) return pubKept;   // (an empty answer is asked for again after a minute)
  const venues = (await Promise.all([binanceFunding(now).catch(() => null), bybitFunding(now).catch(() => null)])).filter(Boolean);
  return pubKept = { t: now, venues };
}

exports.binanceRelay = onRequest({ region: 'me-central1', maxInstances: 2, concurrency: 20, memory: '256MiB', timeoutSeconds: 20, invoker: 'public' }, async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.pub === 'btcFunding' && Object.keys(req.query).length === 1) {   // the one public read path
    const a = await pubFunding(Date.now()); res.set('Cache-Control', 'public, max-age=300'); res.status(200).json({ venues: a.venues, at: new Date(a.t).toISOString() }); return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const b = req.body || {};
  try { await admin.auth().verifyIdToken(String(b.idToken || '')); }
  catch (_) { res.status(401).json({ error: 'sign in' }); return; }
  if (PATHS[b.path] !== b.method || !QS.test(String(b.qs || '')) || !KEY.test(String(b.key || ''))) { res.status(400).json({ error: 'not allowed' }); return; }
  try {
    const r = await fetch('https://api.binance.com' + b.path + '?' + b.qs, { method: b.method, headers: { 'X-MBX-APIKEY': b.key } });
    res.status(200).json({ status: r.status, body: (await r.text()).slice(0, 500000) });
  } catch (e) { res.status(502).json({ error: 'binance unreachable' }); }
});
