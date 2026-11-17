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

exports.binanceRelay = onRequest({ region: 'me-central1', maxInstances: 2, concurrency: 20, memory: '256MiB', timeoutSeconds: 20, invoker: 'public' }, async (req, res) => {
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
