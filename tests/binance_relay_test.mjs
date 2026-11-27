// the Binance relay (tools/binance-relay/functions/index.js): signed-in only, 5 fixed read paths, passes the answer back
import Module from 'node:module';
import path from 'node:path';
let ok = 0, n = 0; const check = (name, c, d) => { n++; if (c) ok++; console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : ' -> ' + JSON.stringify(d))); };
let handler = null, opts = null;
const orig = Module._load;
Module._load = function (req, ...a) {
  if (req === 'firebase-functions/v2/https') return { onRequest: (o, h) => { opts = o; handler = h; return h; } };
  if (req === 'firebase-admin') return { initializeApp() {}, auth: () => ({ verifyIdToken: async t => { if (t !== 'GOOD') throw new Error('bad'); return { uid: 'U1' }; } }) };
  return orig.call(this, req, ...a);
};
const require = Module.createRequire(import.meta.url);
require(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'tools/binance-relay/functions/index.js'));   // from the repo, wherever the test is run from
const calls = [];
globalThis.fetch = async (url, o) => { calls.push({ url, o }); return new Response('{"balances":[]}', { status: 200 }); };
const run = async body => { let st = 200, out = null; const res = { status(s) { st = s; return this; }, json(j) { out = j; } }; await handler({ method: 'POST', body }, res); return { st, out }; };
const SIG = 'a'.repeat(64), KEY = 'K'.repeat(64);
check('runs in Doha (me-central1), at most 2 instances, 20 s', opts.region === 'me-central1' && opts.maxInstances === 2 && opts.timeoutSeconds === 20);
let r = await run({ idToken: 'BAD', path: '/api/v3/account', method: 'GET', qs: `timestamp=1&signature=${SIG}`, key: KEY });
check('not signed in → 401, nothing sent to Binance', r.st === 401 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/order', method: 'POST', qs: `symbol=BTCUSDT&side=BUY&timestamp=1&signature=${SIG}`, key: KEY });
check('an ORDER (trading) path → refused, nothing sent', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/sapi/v1/capital/withdraw/apply', method: 'POST', qs: `coin=BTC&timestamp=1&signature=${SIG}`, key: KEY });
check('a WITHDRAW path → refused, nothing sent', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/account', method: 'POST', qs: `timestamp=1&signature=${SIG}`, key: KEY });
check('a read path with the wrong method → refused', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/account', method: 'GET', qs: `timestamp=1`, key: KEY });
check('an unsigned query → refused', r.st === 400 && !calls.length, r);
r = await run({ idToken: 'GOOD', path: '/api/v3/account', method: 'GET', qs: `omitZeroBalances=true&recvWindow=10000&timestamp=1&signature=${SIG}`, key: KEY });
check('a signed read → passed to api.binance.com with the API key header, the answer returned', r.st === 200 && r.out.status === 200 && /balances/.test(r.out.body) && calls[0].url === `https://api.binance.com/api/v3/account?omitZeroBalances=true&recvWindow=10000&timestamp=1&signature=${SIG}` && calls[0].o.headers['X-MBX-APIKEY'] === KEY, { r, c: calls[0] });
r = await run({ idToken: 'GOOD', path: '/sapi/v1/asset/get-funding-asset', method: 'POST', qs: `recvWindow=10000&timestamp=1&signature=${SIG}`, key: KEY });
check('the funding wallet (POST) → passed', r.st === 200 && calls[1].o.method === 'POST', r);
// ── the one public read path: BTC funding on Binance and Bybit, for the snapshot's job (no key, no user, kept 5 minutes) ──
{
  const real = Date.now; let T = 1790000000000; Date.now = () => T;
  const net = { bn: true, bb: true, seen: [] }, J = j => new Response(JSON.stringify(j), { status: 200 });
  globalThis.fetch = async (url, o) => { url = String(url); net.seen.push({ url, o });
    if (/fapi\.binance\.com/.test(url)) { if (!net.bn) return new Response('{"code":0,"msg":"restricted"}', { status: 451 });
      if (/premiumIndex/.test(url)) return J({ symbol: 'BTCUSDT', markPrice: '60000.00', lastFundingRate: '0.00005000' });
      if (/openInterest/.test(url)) return J({ openInterest: '150000.000' });
      return J([[-1, '0.00002'], [-9, '0.00004'], [-17, '0.00006'], [-200, '0.01']].map(([h, r]) => ({ fundingTime: T + h * 36e5, fundingRate: r }))); }
    if (/bybit/.test(url)) { if (!net.bb) return new Response('blocked', { status: 403 });
      if (/tickers/.test(url)) return J({ result: { list: [{ fundingRate: '-0.00012', openInterestValue: '5100000000' }] } });
      return J({ result: { list: [{ fundingRateTimestamp: String(T - 36e5), fundingRate: '-0.0001' }, { fundingRateTimestamp: String(T - 9 * 36e5), fundingRate: '-0.0002' }] } }); }
    return new Response('{}', { status: 404 }); };
  const get = async query => { let st = 200, out = null; const hd = {}, res = { status(s) { st = s; return this; }, json(j) { out = j; }, set(k, v) { hd[k] = v; } }; await handler({ method: 'GET', query }, res); return { st, out, hd }; };
  let g = await get({ pub: 'btcFunding' });
  const bn = g.out && g.out.venues.find(x => x.k === 'Binance'), bb = g.out && g.out.venues.find(x => x.k === 'Bybit');
  check('GET ?pub=btcFunding → no sign-in asked; Binance in % per 8 h (+0.0050%), open interest in USD ($9.0B), the mean of its last 7 days only', g.st === 200 && bn && Math.abs(bn.rate - 0.005) < 1e-9 && bn.oi === 9e9 && Math.abs(bn.m7 - 0.004) < 1e-9 && /^\d{4}-/.test(g.out.at), g.out);
  check('…Bybit beside it, its sign kept (−0.0120%)', bb && Math.abs(bb.rate + 0.012) < 1e-9 && bb.oi === 5.1e9 && Math.abs(bb.m7 + 0.015) < 1e-9, bb);
  check('…only public market paths were read, with no key', net.seen.length === 5 && net.seen.every(c => /^https:\/\/(fapi\.binance\.com\/fapi\/v1\/(premiumIndex|openInterest|fundingRate)\?symbol=BTCUSDT|api\.bybit\.com\/v5\/market\/(tickers|funding\/history)\?category=linear&symbol=BTCUSDT)/.test(c.url) && !(c.o.headers || {})['X-MBX-APIKEY']), net.seen.map(c => c.url));
  check('…the answer may be kept 5 minutes by whoever asks', g.hd['Cache-Control'] === 'public, max-age=300');
  T += 4 * 60e3; g = await get({ pub: 'btcFunding' });
  check('…a second call inside 5 minutes reads nothing again', net.seen.length === 5 && g.out.venues.length === 2);
  T += 2 * 60e3; net.bb = false; g = await get({ pub: 'btcFunding' });
  check('…after 5 minutes it reads again; a venue that refuses is simply left out', net.seen.length > 5 && g.out.venues.map(x => x.k).join() === 'Binance', g.out);
  T += 6 * 60e3; net.bn = false; g = await get({ pub: 'btcFunding' }); const n1 = net.seen.length;
  check('…both refuse → an empty list (the job keeps them out), never an old number', g.st === 200 && g.out.venues.length === 0, g.out);
  T += 30e3; await get({ pub: 'btcFunding' }); const n2 = net.seen.length; T += 40e3; await get({ pub: 'btcFunding' });
  check('…an empty answer is tried again after a minute, not before', n2 === n1 && net.seen.length > n2, [n1, n2, net.seen.length]);
  for (const q of [{ pub: 'other' }, {}, { pub: 'btcFunding', symbol: 'ETHUSDT' }, { path: '/api/v3/account' }]) { const before = net.seen.length, r2 = await get(q); check(`any other GET (${JSON.stringify(q)}) → 405, nothing read`, r2.st === 405 && net.seen.length === before, r2); }
  Date.now = real;
}
console.log(`${ok}/${n} passed`); process.exit(ok === n ? 0 : 1);
